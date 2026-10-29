/**
 * LLM generation layer.
 *
 * Two LLM calls power the "before/after" panel:
 *   - `generateBareLlm`   — LLM answering the SAME brief with NOTHING but
 *                           its parametric knowledge ("what would a bare
 *                           LLM say?").
 *   - `generateGrounded` — LLM answering WITH the compact Qloo digest in
 *                           context. This is the taste-grounded answer.
 *
 * OPENAI_API_KEY: when set, both use the OpenAI chat API (model via
 * LLM_MODEL, default gpt-4o-mini). When unset, deterministic "template LLM"
 * fallbacks render so the demo always works — the bare one is deliberately
 * generic, the grounded one is built from the real Qloo digest, so the
 * contrast still shows.
 */

const BARE_SYSTEM =
  "You are a creative strategist with NO access to cultural taste data. " +
  "Answer ONLY from general knowledge. Be concise and practical. Do not " +
  "claim to have market or taste-graph data.";

const GROUNDED_SYSTEM =
  "You are a taste strategist. You are given a compact digest from Qloo's " +
  "taste graph (250M+ entities across music, film, dining, fashion, " +
  "travel). Use ONLY the provided Qloo data when citing affinities, " +
  "entities, tags, and geographic hotspots. Cite Qloo evidence inline in " +
  "[Qloo: ...] tags. Be specific and concise.";

async function chat(messages, model) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: model || process.env.LLM_MODEL || "gpt-4o-mini",
      messages,
      temperature: 0.4,
      max_tokens: 700,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`LLM ${res.status}: ${t.slice(0, 200)}`);
  }
  const j = await res.json();
  return j.choices?.[0]?.message?.content?.trim() || "";
}

/** The "before": a bare LLM with no taste data. */
export async function generateBareLlm(query) {
  const prompt =
    `Write a 150-200 word creative brief for this job:\n` +
    `Goal: ${query.goal}\nAudience: ${query.audience}\n` +
    `Interest keywords: ${query.tagQuery}\n\n` +
    `Cover: (1) who the audience really is, (2) which artists/brands/` +
    `places they'd resonate with, (3) 3 messaging angles. You have NO ` +
    `taste-graph or cultural data — just your general knowledge.`;
  try {
    const out = await chat(
      [
        { role: "system", content: BARE_SYSTEM },
        { role: "user", content: prompt },
      ],
      process.env.LLM_MODEL || "gpt-4o-mini"
    );
    if (out) return { source: "openai", text: out };
  } catch {
    /* fall through to template */
  }
  return {
    source: "template (no OPENAI_API_KEY)",
    text:
      `${query.goal}\n\nAudience: ${query.audience} — broadly, "people who ` +
      `like ${query.tagQuery}"-adjacent things.\n\n` +
      `Suggested affinities: a mix of mainstream and indie names in the ${
        query.tagQuery
      } space; popular lifestyle brands; a few trending shows.\n\n` +
      `Messaging angles: (1) "for people like you who already love X," ` +
      `(2) a lifestyle/culture flex, (3) social proof from similar ` +
      `audiences.\n\n` +
      `(Note: this is a bare-LLM answer with no taste-graph access — it is ` +
      `generic on purpose. Compare it with the Qloo-grounded panel to see ` +
      `what real cultural intelligence adds.)`,
  };
}

/** The "after": an LLM grounded in Qloo's taste graph. */
export async function generateGrounded(query, briefContext) {
  const digest = briefContext?.insights || { entities: [] };
  const heat = briefContext?.heatmap || { entities: [] };
  const data = {
    audience: query.audience,
    goal: query.goal,
    filterType: briefContext?.filterType,
    resolved: briefContext?.resolved,
    topAffinities: digest.entities?.slice(0, 8),
    tags: digest.tags?.slice(0, 10),
    hotspots: heat.entities?.slice(0, 6),
    source: digest.mode || "mock",
  };
  const prompt =
    `Here is compact Qloo taste-graph data for a creative brief:\n` +
    JSON.stringify(data, null, 2) +
    `\n\nWrite a 150-220 word taste brief for:\n` +
    `Goal: ${query.goal}\nAudience: ${query.audience}\n\n` +
    `Cover: (1) where this audience is (geographic + cultural), ` +
    `(2) the specific affinities / entities they cluster around, ` +
    `(3) 3 concrete messaging angles grounded in the Qloo evidence. ` +
    `Cite Qloo data inline in [Qloo: ...] tags.`;
  try {
    const out = await chat(
      [
        { role: "system", content: GROUNDED_SYSTEM },
        { role: "user", content: prompt },
      ],
      process.env.LLM_MODEL || "gpt-4o-mini"
    );
    if (out) return { source: "openai", text: out, data };
  } catch {
    /* fall through to template */
  }
  const names =
    (digest.entities || []).map((e) => e.name).join(", ") ||
    "(none resolved)";
  const tags = (digest.tags || []).map((t) => t.name || t).join(", ");
  const spots =
    (heat.entities || []).map((e) => e.name).join(", ") || "(n/a)";
  // Mock mode must never claim live Qloo evidence.
  const cite = digest.mode === "mock" ? "Mock" : "Qloo";
  return {
    source: "template (no OPENAI_API_KEY)",
    text:
      `${query.goal}\n\nAudience "${query.audience}" clusters around: ${names}. ` +
      `Recurring taste markers: ${tags}.\n\n` +
      `Where they are: strongest concentration in ${spots}. ` +
      `[${cite}: heatmap affinity]\n\n` +
      `Messaging angles:\n` +
      `1. Anchor on the top affinity "${names.split(",")[0]}" — ` +
      `[${cite}: ${briefContext?.filterType} insights, rank #1]\n` +
      `2. Lead with "${tags.split(",")[0] || "cultural"}" as the shared ` +
      `identity, not the product — [${cite}: tag cluster]\n` +
      `3. Localize for the top hotspot "${spots.split(",")[0]}" first — ` +
      `[${cite}: geographic affinity]\n\n` +
      `Every claim above is traceable to the Qloo digest in this session.`,
    data,
  };
}

export function hasLlm() {
  return Boolean(process.env.OPENAI_API_KEY);
}

/**
 * Build the four-key structured-parse prompt. The LLM must respond with a
 * single JSON object with exactly these keys: goal, audience, location, tags
 * (tags is a comma-separated string). Used by parseBriefWithLlm.
 */
export const LLM_PARSE_PROMPT = (brief) =>
  `Parse this creative brief into structured JSON. Respond ONLY with a JSON ` +
  `object with exactly these four keys: "goal" (the objective sentence), ` +
  `"audience" (who it is for, "" if none), "location" (a city/region, "" if ` +
  `none), "tags" (comma-separated interest keywords, "" if none).\n\nBrief: ` +
  JSON.stringify(brief);

/**
 * An async LLM `complete` for parseBriefWithLlm: returns the raw LLM text
 * (expected to be a JSON object string). Returns null when there is no
 * OPENAI_API_KEY, so the caller falls back to the heuristic.
 */
export async function llmParseComplete(brief) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: process.env.LLM_MODEL || "gpt-4o-mini",
      temperature: 0,
      max_tokens: 300,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You parse creative briefs into structured JSON. Output ONLY a " +
            'JSON object with keys "goal","audience","location","tags".',
        },
        { role: "user", content: LLM_PARSE_PROMPT(brief) },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`LLM parse ${res.status}: ${t.slice(0, 150)}`);
  }
  const j = await res.json();
  return j.choices?.[0]?.message?.content?.trim() || "";
}
