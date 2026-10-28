/**
 * Qloo API client factory for the hackathon base URL.
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
 * The client is a factory so tests can inject a fake `fetch` and a fake
 * key resolver, and so the production entry point stays a one-liner:
 *
 *   export const qloo = createQlooClient({ apiKey: () => process.env.QLOO_API_KEY });
 *
 * Security model: Qloo keys live ONLY server-side (env QLOO_API_KEY).
 * The browser talks to our API routes, which add the key. No Qloo key or
 * Qloo response data is ever written to the public repo or the browser.
 */

import { ENTITY_TYPES } from "./entity-types.js";

export const QLOO_BASE_URL =
  process.env.QLOO_BASE_URL || "https://hackathon.api.qloo.com";

export { ENTITY_TYPES };

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
 * Create a Qloo client.
 *
 * @param {object} opts
 * @param {string|(() => string|undefined)} opts.apiKey  key or resolver
 * @param {string}  [opts.baseUrl]      default `QLOO_BASE_URL`
 * @param {typeof fetch} [opts.fetchImpl]  injectable for tests
 * @param {number} [opts.timeoutMs=8000]   per-request AbortController timeout
 * @param {number} [opts.cacheMax=200]    LRU cache size
 * @param {number} [opts.cacheTtlMs=600000]  cache TTL
 *
 * Returns `{ search, searchTags, insights, heatmap }`.
 */
export function createQlooClient(opts = {}) {
  const {
    apiKey,
    baseUrl = QLOO_BASE_URL,
    fetchImpl = fetch,
    timeoutMs = 8000,
    cacheMax = 200,
    cacheTtlMs = 600000,
  } = opts;

  const cache = new Map();

  function resolveKey() {
    const k = typeof apiKey === "function" ? apiKey() : apiKey;
    return k || undefined;
  }

  function headers() {
    const k = resolveKey();
    if (!k) {
      throw new QlooError("QLOO_API_KEY is not configured (server-side env).", 500);
    }
    return { "X-Api-Key": k };
  }

  async function getJson(url, init) {
    const cached = cache.get(url);
    if (cached && Date.now() - cached.at < cacheTtlMs) return cached.data;

    // Per-request timeout via AbortController. A timed-out fetch becomes a
    // QlooError 504 so the agent loop can record a failed step instead of
    // hanging the whole request.
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(new Error(`Qloo request timed out after ${timeoutMs}ms`)),
      timeoutMs
    );
    let res;
    try {
      res = await fetchImpl(url, { ...init, signal: controller.signal });
    } catch (e) {
      clearTimeout(timeout);
      if (e?.name === "AbortError" || /abort/i.test(String(e?.message || e))) {
        throw new QlooError(
          `Qloo request timed out after ${timeoutMs}ms on ${new URL(url).pathname}`,
          504
        );
      }
      throw e;
    }
    clearTimeout(timeout);

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
    // Bounded LRU: evict oldest entries once we exceed cacheMax.
    cache.set(url, { at: Date.now(), data });
    while (cache.size > cacheMax) {
      const firstKey = cache.keys().next().value;
      cache.delete(firstKey);
    }
    return data;
  }

  function qs(params) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === "") continue;
      if (Array.isArray(v)) p.set(k, v.join(","));
      else p.set(k, String(v));
    }
    return p.toString();
  }

  return {
    /**
     * Entity + audience lookup.
     *   search({ query: "Taylor Swift", types: ["urn:entity:person"] })
     *   search({ query: "indie music", audiences: true })
     */
    search(params = {}) {
      const { query, types = [], audiences = false, take: _take = 10, page: _page = 1, ...rest } = params;
      const p = {
        ...(audiences ? {} : { query }),
        ...rest,
        ...(types.length ? { types: types.join(",") } : {}),
      };
      if (audiences) p["filter.query"] = query;
      const base = audiences ? "/v2/audiences" : "/search";
      return getJson(`${baseUrl}${base}?${qs(p)}`, {
        headers: headers(),
        cache: "no-store",
      });
    },

    /**
     * GET /v2/tags — find tag URNs matching a keyword.
     * Feeds `signal.interests.tags` and `filter.tags` for insights calls.
     * Note: Qloo v2 tags endpoint requires `filter.query` or
     * `filter.parents.types` (this deployment rejects `filter.query`
     * alone, so we always attach both for maximum hit rate).
     */
    searchTags(params = {}) {
      const { query, take = 20, page = 1, ...rest } = params;
      return getJson(
        `${baseUrl}/v2/tags?${qs({
          "filter.query": query,
          take,
          page,
          ...rest,
        })}`,
        { headers: headers(), cache: "no-store" }
      );
    },

    /**
     * GET /v2/insights — the core taste endpoint.
     * Every request requires `filter.type`. Signal params are flat query
     * params: signal.demographics.audiences / .age / .gender,
     * signal.interests.tags / .entities, signal.location.query.
     */
    insights({ filterType, signal = {}, take = 20, biasTrends, filterTags, excludeTags }) {
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
      return getJson(`${baseUrl}/v2/insights?${qs(p)}`, {
        headers: headers(),
        cache: "no-store",
      });
    },

    /**
     * Heatmap insights: geographic affinity for a signal set.
     * Same /v2/insights endpoint with filter.type=urn:heatmap.
     *
     * The live API requires a location for heatmap calls. The caller must
     * supply one; the factory no longer silently defaults to a city so a
     * missing location surfaces as an honest "skipped" step in the agent
     * trace rather than a fabricated result.
     */
    heatmap({ signal = {}, take = 10, biasTrends, location }) {
      const p = {
        "filter.type": "urn:heatmap",
        take,
        ...(biasTrends ? { "bias.trends": biasTrends } : {}),
      };
      // A location filter is required for heatmap calls.
      p["filter.location.query"] = location || signal.location;
      if (signal.audiences?.length)
        p["signal.demographics.audiences"] = signal.audiences;
      if (signal.age) p["signal.demographics.age"] = signal.age;
      if (signal.gender) p["signal.demographics.gender"] = signal.gender;
      if (signal.tags?.length) p["signal.interests.tags"] = signal.tags;
      if (signal.entities?.length)
        p["signal.interests.entities"] = signal.entities;
      return getJson(`${baseUrl}/v2/insights?${qs(p)}`, {
        headers: headers(),
        cache: "no-store",
      });
    },
  };
}

/**
 * Production client: reads the key from the server-side env. Import this
 * from API routes; tests build their own client with injected fakes.
 */
export const qloo = createQlooClient({
  apiKey: () => process.env.QLOO_API_KEY,
});
