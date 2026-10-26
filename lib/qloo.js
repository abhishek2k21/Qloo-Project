/**
 * Qloo API client for the hackathon base URL.
 *
 * Docs: https://docs.qloo.com (hackathon developer guide)
 *  - Base URL: https://hackathon.api.qloo.com (keys ONLY work against this URL)
 *  - Auth:    header `X-Api-Key: <key>`
 *  - Endpoints used:
 *      GET /search                  entity + audience search (name -> entity IDs, audience URNs)
 *      GET /v2/tags                 tag search (keyword -> tag URNs)
 *      GET /v2/insights             taste insights (filter.type + signal.* params)
 *      GET /v2/insights?filter.type=urn:heatmap  heatmap insights (geographic affinity)
 *
 * Security model: Qloo keys live ONLY server-side (env QLOO_API_KEY).
 * The browser talks to our API routes, which add the key. No Qloo key or
 * Qloo response data is ever written to the public repo or the browser.
 */

export const QLOO_BASE_URL =
  process.env.QLOO_BASE_URL || "https://hackathon.api.qloo.com";

/** Entity types supported by /v2/insights (from the hackathon guide). */
export const ENTITY_TYPES = [
  "urn:entity:artist",
  "urn:entity:book",
  "urn:entity:brand",
  "urn:entity:destination",
  "urn:entity:movie",
  "urn:entity:person",
  "urn:entity:place",
  "urn:entity:podcast",
  "urn:entity:tv_show",
  "urn:entity:video_game",
];

export class QlooError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = "QlooError";
    this.status = status;
    this.body = body;
  }
}

export function hasQlooKey() {
  return Boolean(process.env.QLOO_API_KEY);
}

/**
 * Minimal server-side cache. Qloo docs explicitly allow private server-side
 * caching with no time limit. Keeps the demo fast and quotas friendly.
 */
const cache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;

async function getJson(url, init) {
  const cached = cache.get(url);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;

  const res = await fetch(url, init);
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 500) };
  }
  if (!res.ok) {
    throw new QlooError(
      `Qloo ${res.status} on ${new URL(url).pathname}: ${
        data?.message || text.slice(0, 300) || res.statusText
      }`,
      res.status,
      data
    );
  }
  cache.set(url, { at: Date.now(), data });
  return data;
}

function headers() {
  if (!process.env.QLOO_API_KEY) {
    throw new QlooError("QLOO_API_KEY is not configured (server-side env).", 500);
  }
  return { "X-Api-Key": process.env.QLOO_API_KEY };
}

function qs(params) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) v.map(String).forEach((x) => p.append(k, x));
    else p.set(k, String(v));
  }
  return p.toString();
}

export const qloo = {
  /**
   * Entity + audience lookup.
   *   search({ query: "Taylor Swift", types: ["urn:entity:person"] })
   *   search({ query: "indie music", audiences: true })
   * When `audiences` is true the request goes to /v2/audiences so we can
   * resolve an audience phrase to the audience URNs accepted by
   * signal.demographics.audiences.
   */
  search(params = {}) {
    const {
      query,
      types = [],
      audiences = false,
      take = 10,
      page = 1,
      ...rest
    } = params;
    const p = {
      ...rest,
      query,
      take,
      page,
      ...(types.length ? { types: types.join(",") } : {}),
      ...(audiences
        ? {
            "filter.parents.types": [
              "urn:audience:life_stage",
              "urn:audience:hobbies_and_interests",
              "urn:audience:leisure",
              "urn:audience:communities",
              "urn:audience:lifestyle_preferences_beliefs",
            ].join(","),
          }
        : {}),
    };
    const base = audiences ? "/v2/audiences" : "/search";
    return getJson(`${QLOO_BASE_URL}${base}?${qs(p)}`, {
      headers: headers(),
      cache: "no-store",
    });
  },

  /**
   * GET /v2/tags — find tag URNs matching a keyword.
   * Feeds `signal.interests.tags` and `filter.tags` for insights calls.
   */
  searchTags(params = {}) {
    const { query, take = 20, page = 1, ...rest } = params;
    return getJson(
      `${QLOO_BASE_URL}/v2/tags?${qs({ query, take, page, ...rest })}`,
      { headers: headers(), cache: "no-store" }
    );
  },

  /**
   * GET /v2/insights — the core taste endpoint.
   * Every request requires `filter.type`. Signal params are flat query params:
   *   signal.demographics.audiences / .age / .gender
   *   signal.interests.tags / .entities
   *   signal.location.query (locality name) + signal.location.weight
   *   bias.trends, take, filter.tags, filter.exclude.tags
   */
  insights({
    filterType,
    signal = {},
    take = 20,
    biasTrends,
    filterTags,
    excludeTags,
  }) {
    const p = {
      "filter.type": filterType,
      take,
      ...(biasTrends ? { "bias.trends": biasTrends } : {}),
      ...(filterTags ? { "filter.tags": filterTags.join(",") } : {}),
      ...(excludeTags ? { "filter.exclude.tags": excludeTags.join(",") } : {}),
    };
    if (signal.audiences?.length)
      p["signal.demographics.audiences"] = signal.audiences;
    if (signal.age) p["signal.demographics.age"] = signal.age;
    if (signal.gender) p["signal.demographics.gender"] = signal.gender;
    if (signal.location) p["signal.location.query"] = signal.location;
    if (signal.tags?.length) p["signal.interests.tags"] = signal.tags;
    if (signal.entities?.length) p["signal.interests.entities"] = signal.entities;
    return getJson(`${QLOO_BASE_URL}/v2/insights?${qs(p)}`, {
      headers: headers(),
      cache: "no-store",
    });
  },

  /**
   * Heatmap insights: geographic affinity for a signal set.
   * Same /v2/insights endpoint with filter.type=urn:heatmap — powers the
   * "where the audience is" section of the brief.
   */
  heatmap({ signal = {}, take = 10, biasTrends }) {
    const p = {
      "filter.type": "urn:heatmap",
      take,
      ...(biasTrends ? { "bias.trends": biasTrends } : {}),
    };
    if (signal.audiences?.length)
      p["signal.demographics.audiences"] = signal.audiences;
    if (signal.age) p["signal.demographics.age"] = signal.age;
    if (signal.gender) p["signal.demographics.gender"] = signal.gender;
    if (signal.tags?.length) p["signal.interests.tags"] = signal.tags;
    if (signal.entities?.length)
      p["signal.interests.entities"] = signal.entities;
    return getJson(`${QLOO_BASE_URL}/v2/insights?${qs(p)}`, {
      headers: headers(),
      cache: "no-store",
    });
  },
};

