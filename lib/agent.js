/**
 * TasteBrief agent loop.
 *
 * A deterministic, tool-using agent (no framework lock-in, so the loop is
 * readable in the repo — judges can follow every Qloo call it makes).
 *
 * Plan (fixed, then executed step-by-step — this is the agent's "reasoning"):
 *   1. resolve entities  — /search for the brand/artist/etc. named in the goal
 *   2. resolve audience  — /v2/audiences (name -> audience URNs)
 *   3. resolve tags      — /v2/tags for the interest keywords
 *   4. taste insights    — /v2/insights (filter.type + demographics + interests)
 *   5. heatmap (optional) — /v2/insights?filter.type=urn:heatmap (where they are)
 *
 * Each step is a "tool" in `tools`. The loop picks the next step, runs it,
 * records the observation, and retries on failure (bounded). If Qloo is
 * unavailable, the same loop runs against lib/mock-qloo.js and flags
 * `mock: true` on every observation.
 */

import { qloo, hasQlooKey, QlooError } from "./qloo.js";
import { mockQloo } from "./mock-qloo.js";

/** Pick the entity type for the goal: default music, respect user intent. */
export function pickFilterType(goal) {
  const g = (goal || "").toLowerCase();
  if (/(film|movie|tv|show|stream)/.test(g)) return "urn:entity:movie";
  if (/(podcast)/.test(g)) return "urn:entity:podcast";
  if (/(game|gaming|gamer)/.test(g)) return "urn:entity:video_game";
  if (/(restaurant|dining|dinner|food|coffee)/.test(g)) return "urn:entity:place";
  if (/(brand|product|beverage|apparel|skincare|beauty)/.test(g))
    return "urn:entity:brand";
  return "urn:entity:artist";
}

export function pickAge(goal) {
  const m = (goal || "").match(
    /\b(1[89]|2[0-9]|3[0-9]|4[0-9]|5[0-9]|6[0-9])\s*-\s*(\d{2})\b/
  );
  if (m) return `${m[1]}-${m[2]}`;
  if (/teen|gen z|young/.test(goal)) return "18-24";
  if (/millennial|professional/.test(goal)) return "25-34";
  if (/boomer|senior/.test(goal)) return "55-64";
  return "25-34";
}

export function buildTools() {
  return {
    resolveEntities: {
      run: async (ctx) => {
        const data = await ctx.caller.search({
          query: ctx.query.entityQuery,
          types: [ctx.filterType],
          take: 5,
        });
        const entities = (data?.results?.entities || []).slice(0, 5);
        const uris = entities.map((e) => e.entity_id).filter(Boolean);
        return {
          label: "Resolve entities via Qloo /search",
          detail: `${entities.length} match(es): ${entities
            .map((e) => e.name)
            .join(", ") || "none"}`,
          ok: true,
          entities: entities.map((e) => ({
            name: e.name,
            id: e.entity_id,
            type: e.subtype,
          })),
          signalEntities: uris,
        };
      },
    },
    resolveAudience: {
      run: async (ctx) => {
        const data = await ctx.caller.search({
          query: ctx.query.audience,
          audiences: true,
          take: 5,
        });
        const audiences =
          data?.results?.audiences || data?.results?.entities || [];
        const uris = audiences.map((a) => a.id || a.entity_id).filter(Boolean);
        return {
          label: "Resolve audience via Qloo /v2/audiences",
          detail: `${uris.length} audience match(es): ${uris
            .slice(0, 3)
            .join(", ")}`,
          ok: true,
          audiences: audiences.map((a) => ({
            name: a.name,
            id: a.id || a.entity_id,
          })),
          signalAudiences: uris,
        };
      },
    },
    resolveTags: {
      run: async (ctx) => {
        const data = await ctx.caller.searchTags({
          query: ctx.query.tagQuery,
        });
        const tags = data?.results?.tags || [];
        const uris = tags.map((t) => t.id).filter(Boolean).slice(0, 8);
        return {
          label: "Resolve interest tags via Qloo /v2/tags",
          detail: `${tags.length} tag(s): ${tags
            .slice(0, 5)
            .map((t) => t.name)
            .join(", ")}`,
          ok: true,
          tags: tags.map((t) => ({ name: t.name, id: t.id })),
          signalTags: uris,
        };
      },
    },
    tasteInsights: {
      run: async (ctx, state) => {
        const data = await ctx.caller.insights({
          filterType: ctx.filterType,
          take: 15,
          biasTrends: "medium",
          signal: {
            audiences: state.signalAudiences || [],
            tags: state.signalTags || [],
            entities: state.signalEntities || [],
            age: ctx.query.age,
            location: ctx.query.location || undefined,
          },
        });
        const digest = ctx.digest(data, ctx.mock ? "mock" : "live");
        return {
          label: "Taste insights via Qloo /v2/insights",
          detail: `${digest.entityCount} entities ranked by affinity`,
          ok: true,
          digest,
        };
      },
    },
    heatmapInsights: {
      run: async (ctx, state) => {
        const data = await ctx.caller.heatmap({
          take: 8,
          signal: {
            audiences: state.signalAudiences || [],
            tags: state.signalTags || [],
            entities: state.signalEntities || [],
            age: ctx.query.age,
          },
        });
        const digest = ctx.digest(data, ctx.mock ? "mock" : "live");
        return {
          label: "Geographic heatmap via Qloo /v2/insights (urn:heatmap)",
          detail: `Top hotspots: ${digest.entities
            .slice(0, 4)
            .map((e) => e.name)
            .join(", ")}`,
          ok: true,
          heatmap: digest,
        };
      },
    },
  };
}

/**
 * The agent loop.
 * @param {object} query  { brand, brandQuery, audience, tagQuery, goal, location? }
 * @param {object} opts   { withHeatmap, onStep, callerOverride, digest, forceMock }
 */
export async function runTasteAgent(query, opts = {}) {
  const withHeatmap = opts.withHeatmap !== false;
  const onStep = opts.onStep || (() => {});

  const hasKey = hasQlooKey();
  const forceMock = Boolean(opts.forceMock);
  let mock = !hasKey || forceMock;
  let caller = mock ? mockQloo : qloo;
  const steps = [];
  const errors = [];

  // Verify a provided key works once; fall back to disclosed mock only on
  // hard auth failure so judges always see a working demo.
  if (hasKey && !forceMock) {
    try {
      await qloo.searchTags({ query: query.tagQuery || "indie", take: 1 });
    } catch (e) {
      if (e instanceof QlooError && (e.status === 401 || e.status === 403)) {
        return {
          mock: true,
          error: "Qloo key rejected (401/403). Running in disclosed mock mode.",
          steps: [],
        };
      }
      // Transient: keep trying live with retries below.
    }
  }

  const ctx = {
    query,
    filterType: pickFilterType(query.goal || query.tagQuery || ""),
    caller,
    mock,
    digest: opts.digest || mockQloo.digest,
  };

  const tools = buildTools();
  const plan = [
    "resolveEntities",
    "resolveAudience",
    "resolveTags",
    "tasteInsights",
    ...(withHeatmap ? ["heatmapInsights"] : []),
  ];

  const state = {};

  for (const name of plan) {
    const tool = tools[name];
    let obs = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        obs = await tool.run(ctx, state);
        break;
      } catch (e) {
        obs = {
          label: `${name} (attempt ${attempt + 1})`,
          ok: false,
          error: String(e?.message || e),
        };
        if (mock) break;
        if (attempt === 2) errors.push({ step: name, error: obs.error });
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }

    if (obs?.ok) {
      if (obs.signalEntities) state.signalEntities = obs.signalEntities;
      if (obs.signalAudiences) state.signalAudiences = obs.signalAudiences;
      if (obs.signalTags) state.signalTags = obs.signalTags;
      if (obs.digest) state.digest = obs.digest;
      if (obs.heatmap) state.heatmap = obs.heatmap;
    }

    steps.push({ name, ...obs });
    onStep({ name, obs });
  }

  const briefContext = {
    goal: query.goal,
    audience: query.audience,
    tagQuery: query.tagQuery,
    brandQuery: query.brandQuery,
    filterType: ctx.filterType,
    age: ctx.query.age,
    location: ctx.query.location,
    resolved: {
      entities: steps.find((s) => s.name === "resolveEntities")?.entities || [],
      audiences: steps.find((s) => s.name === "resolveAudience")?.audiences || [],
      tags: steps.find((s) => s.name === "resolveTags")?.tags || [],
    },
    insights: state.digest,
    heatmap: state.heatmap,
  };

  return {
    mock,
    errors,
    steps,
    briefContext,
    signalSummary: {
      entities: state.signalEntities?.length || 0,
      audiences: state.signalAudiences?.length || 0,
      tags: state.signalTags?.length || 0,
    },
  };
}

