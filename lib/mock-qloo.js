/**
 * Deterministic mock Qloo backend.
 *
 * Used when QLOO_API_KEY is missing or when a Qloo call fails, so the demo
 * always stays live and the "before/after" panel can be rendered. The UI
 * clearly badges every mock section, and the README discloses it.
 *
 * IMPORTANT: This is not Qloo data. It is a hand-authored fixture set that
 * mimics the response shape of /search, /v2/tags and /v2/insights so the
 * agent loop is identical in mock and live mode.
 */

function ent(id, name, subtype, props = {}, tags = [], popularity = 0.9) {
  return {
    name,
    entity_id: id,
    type: "urn:entity",
    subtype,
    properties: props,
    tags,
    popularity,
  };
}

function tag(id, name) {
  return { id, name, type: "urn:tag" };
}

function audience(name, urn, popularity = 0.8) {
  return { name, id: urn, type: "urn:audience", popularity };
}

const MOCK_ENTITIES = [
  ent("mock-artist-miles", "Miles Davis", "urn:entity:artist",
    { release_year: 1959, genre: "Jazz" },
    [tag("urn:tag:keyword:person:cool_jazz", "Cool Jazz"),
     tag("urn:tag:keyword:person:improvisation", "Improvisation")], 0.97),
  ent("mock-artist-kendall", "Kendrick Lamar", "urn:entity:artist",
    { release_year: 2012, genre: "Hip-Hop" },
    [tag("urn:tag:keyword:person:west_coast", "West Coast"),
     tag("urn:tag:keyword:person:lyricism", "Lyricism")], 0.99),
  ent("mock-movie-parasite", "Parasite", "urn:entity:movie",
    { release_year: 2019, content_rating: "R" },
    [tag("urn:tag:genre:media:comedy", "Comedy"),
     tag("urn:tag:keyword:media:social_class", "Social Class")], 0.95),
  ent("mock-brand-aesop", "Aesop", "urn:entity:brand",
    { category: "Skincare" },
    [tag("urn:tag:keyword:brand:minimalist", "Minimalist"),
     tag("urn:tag:keyword:brand:clean_beauty", "Clean Beauty")], 0.91),
  ent("mock-place-copenhagen", "Copenhagen", "urn:entity:place",
    { country: "Denmark" },
    [tag("urn:tag:keyword:place:new_nordic", "New Nordic")], 0.93),
];

const MOCK_AUDIENCES = [
  audience("Urban creatives", "urn:audience:communities:urban_creatives"),
  audience("Indie music listeners", "urn:audience:leisure:indie_music"),
  audience("Craft cocktail enthusiasts", "urn:audience:hobbies_and_interests:craft_cocktails"),
  audience("Urban professionals", "urn:audience:life_stage:urban_professionals"),
];

const MOCK_TAGS = [
  tag("urn:tag:keyword:person:indie", "Indie"),
  tag("urn:tag:keyword:person:lofi", "Lo-fi"),
  tag("urn:tag:keyword:media:neo_noir", "Neo-noir"),
  tag("urn:tag:keyword:brand:minimalist", "Minimalist"),
];

function entitiesByName(query, types = []) {
  const q = (query || "").toLowerCase();
  return MOCK_ENTITIES.filter(
    (e) =>
      e.name.toLowerCase().includes(q) &&
      (types.length ? types.includes(e.subtype) : true)
  );
}

function pickProps(props, subtype) {
  const p = {};
  if (subtype === "urn:entity:movie" || subtype === "urn:entity:tv_show")
    p.year = props.release_year;
  if (props.genre) p.genre = props.genre;
  if (props.country) p.location = props.country;
  if (props.category) p.category = props.category;
  return p;
}

function uniqueTags(entities) {
  const seen = new Set();
  const out = [];
  for (const e of entities)
    for (const t of e.tags || [])
      if (!seen.has(t.name)) {
        seen.add(t.name);
        out.push(t.name);
      }
  return out;
}

export function extractList(obj) {
  if (!obj) return [];
  if (Array.isArray(obj)) return obj;
  if (Array.isArray(obj.results)) return obj.results;
  if (Array.isArray(obj.results?.entities)) return obj.results.entities;
  if (Array.isArray(obj.results?.locations)) return obj.results.locations;
  if (Array.isArray(obj.results?.heatmaps)) return obj.results.heatmaps;
  if (Array.isArray(obj.results?.data)) return obj.results.data;
  if (Array.isArray(obj.entities)) return obj.entities;
  return [];
}

/** Compact, LLM-friendly digest of any Qloo-shaped response. */
export function normalize(data, mode) {
  const entities = extractList(data);
  return {
    mode,
    entityCount: entities.length,
    entities: entities.slice(0, 12).map((e) => ({
      name: e.name || e.title || e.label || (typeof e === "string" ? e : "—"),
      id: e.entity_id || e.id || e.urn || "",
      type: e.subtype || e.type || "",
      popularity: typeof e.popularity === "number" ? e.popularity : 0.8,
      tags: (e.tags || []).slice(0, 6).map((t) => (typeof t === "string" ? t : t.name || t)),
      props: pickProps(e.properties || e.props || {}, e.subtype || e.type),
    })),
    tags: uniqueTags(entities).slice(0, 12),
  };
}

export const mockQloo = {
  async search({ query, types = [], audiences = false, "filter.query": filterQuery }) {
    const rawQ = query || filterQuery || "";
    const q = rawQ.toLowerCase().trim();
    if (audiences) {
      const hits = q
        ? MOCK_AUDIENCES.filter((a) => a.name.toLowerCase().includes(q))
        : [];
      return {
        success: true,
        results: { audiences: hits },
      };
    }
    const entities = q ? entitiesByName(q, types) : [];
    return {
      success: true,
      results: {
        entities: entities.length ? entities : (q ? [] : MOCK_ENTITIES.slice(0, 3)),
      },
    };
  },

  async searchTags(params = {}) {
    const rawQ = params.query || params["filter.query"] || "";
    const q = rawQ.toLowerCase().trim();
    const hits = q ? MOCK_TAGS.filter((t) => t.name.toLowerCase().includes(q)) : [];
    return {
      success: true,
      results: { tags: hits },
    };
  },

  async insights({ filterType, signal = {}, take = 20 }) {
    // Stable, signal-seeded mock so identical inputs return identical briefs.
    const seed =
      [filterType, signal.age, signal.gender, signal.location,
       ...(signal.tags || [])].join("|").length % 100;
    const pool =
      filterType === "urn:entity:brand"
        ? MOCK_ENTITIES.filter((e) => e.subtype === "urn:entity:brand")
        : MOCK_ENTITIES;
    const entities = pool
      .map((e, i) => ({
        ...e,
        popularity: Math.min(0.99, 0.7 + ((seed + i * 7) % 30) / 100),
      }))
      .sort((a, b) => b.popularity - a.popularity)
      .slice(0, take);
    return { success: true, results: { entities } };
  },

  async heatmap({ signal = {}, take = 10 }) {
    const locs = [
      "Los Angeles", "New York", "London", "Berlin", "Tokyo",
      "Toronto", "Sydney", "Copenhagen", "Austin", "Seoul",
    ];
    const seed =
      [signal.age, signal.location, ...(signal.tags || [])].join("|").length % 50;
    return {
      success: true,
      results: {
        entities: locs.slice(0, take).map((name, i) => ({
          name,
          entity_id: `mock-locality-${name}`,
          subtype: "urn:entity:locality",
          popularity: Math.min(0.99, 0.6 + ((seed + i * 11) % 40) / 100),
          properties: { country: "—" },
          tags: [],
        })),
      },
    };
  },

  digest(data, mode) {
    return normalize(data, mode);
  },
};

