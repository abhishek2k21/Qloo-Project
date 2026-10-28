/**
 * Entity-type registry and goal routing for the Qloo taste graph.
 *
 * Single source of truth for which `filter.type` URNs the hackathon API
 * accepts on /v2/insights, and how a free-form goal routes to one of them.
 *
 * The routing table is ordered so more specific wording wins: "podcast"
 * beats "game", "music/playlist" beats "stream", and a showroom/furniture
 * goal never leaks into the film `show` pattern because every pattern uses
 * word boundaries.
 */

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

/**
 * Ordered routing table. Each entry is [regex, urn]. First match wins, so
 * the most specific wordings come first. Every pattern is anchored with
 * word boundaries so "showroom" never matches "show" and "streaming
 * playlist" never matches the film "stream" pattern.
 */
const ROUTES = [
  [/\bpodcast\b/i, "urn:entity:podcast"],
  [/\b(music|playlist|band|album|song|vinyl|jazz|rap|rock|hip.hop)\b/i, "urn:entity:artist"],
  [/\b(video.?game|game|gaming|gamer)\b/i, "urn:entity:video_game"],
  [/\b(film|movie|tv.show|film|documentary)\b/i, "urn:entity:movie"],
  [/\b(restaurant|dining|dinner|food|coffee|cafe|bar|brewery)\b/i, "urn:entity:place"],
  [/\b(brand|product|apparel|skincare|beauty|furniture|fashion|retail|showroom|zine)\b/i, "urn:entity:brand"],
];

/**
 * Pick the Qloo entity type URN for a goal string.
 * Falls back to `urn:entity:artist` (the densest taste graph) when no
 * routing pattern matches.
 */
export function pickFilterType(goal) {
  const g = goal || "";
  for (const [re, urn] of ROUTES) {
    if (re.test(g)) return urn;
  }
  return "urn:entity:artist";
}

/**
 * Two complementary entity types to fan the insights call out to, for a
 * cross-domain taste profile. Returns exactly 2 distinct URNs from
 * ENTITY_TYPES, never the primary. Prefers `place` + `brand` for
 * artist/movie goals (people + places they co-occur with), otherwise
 * `artist` + `place`.
 */
export function complementaryTypes(primary) {
  const pick = (a, b) => {
    const out = [a, b].filter((t) => t !== primary && ENTITY_TYPES.includes(t));
    // Guarantee two distinct; if the primary clobbered one, top up from the
    // registry in order.
    const fill = ["urn:entity:place", "urn:entity:brand", "urn:entity:artist"].filter(
      (t) => !out.includes(t) && t !== primary
    );
    while (out.length < 2 && fill.length) out.push(fill.shift());
    return out.slice(0, 2);
  };
  if (primary === "urn:entity:artist" || primary === "urn:entity:movie") {
    return pick("urn:entity:place", "urn:entity:brand");
  }
  return pick("urn:entity:artist", "urn:entity:place");
}
