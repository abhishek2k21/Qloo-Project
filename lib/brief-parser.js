/**
 * Parse a freeform brief (goal + optional audience/location/interests) into
 * the structured fields the agent loop needs.
 *
 * The UI collects a single textarea; this module extracts:
 *   - goal:      the objective sentence (drives filter.type routing)
 *   - audience:   an audience phrase, if present
 *   - location:   a city/region, if present
 *   - tags:       interest keywords, if present
 *   - age:        an age band, if present
 *   - brand:      a brand/artist/place name, if present
 *
 * Pure, no I/O — unit-testable under plain Node.
 */

const AGE_RE =
  /\b(\d{2})\s*(?:-|to|–)\s*(\d{2})\b|\b(teens?|gen z|millennials?|boomers?|seniors?|young|middle[- ]?aged|retirees?)\b/i;
const INTEREST_RE =
  /\b(?:interested in|interests?[:\s]+|into|enjoy(?:ing)?|loves?)\s+(.+?)(?:[,.]|\s*(?:\.$|$))/i;

/**
 * @param {string} brief  the freeform brief text
 * @returns {{ goal: string, audience: string, location: string, tags: string[], age?: string, brand?: string }}
 */
export function parseBrief(brief) {
  const text = (brief || "").trim();

  // --- location: look for "in <City>" or "<City> city/state" ---
  let location = "";
  const locMatch = text.match(
    /\b(?:in|based in|to|at|from|near|located in)\s+([A-Z][A-Za-z]+(?:\s[A-Z][A-Za-z]+)*)(?=\s+(?:,|and|with|in|city|state|country|metro|market)|$|\n)/
  );
  const cityMatch = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:city|state|country|metro|market|district)\b/);
  if (locMatch) location = locMatch[1];
  else if (cityMatch) location = cityMatch[1];

  // --- goal: strip trailing metadata clauses (location, audience, age, interests) ---
  let goal = text;
  const metaPatterns = [
    /\b(?:based in|targeting|interested in|interests?[:\s]|aged|ages?\s|located in)\b/i,
    /\b(?:in|at|from|near)\s+[A-Z][a-z]+/i,
  ];
  let metaStart = -1;
  for (const p of metaPatterns) {
    const m = text.match(p);
    if (m && m.index > 3) {
      if (metaStart === -1 || m.index < metaStart) metaStart = m.index;
    }
  }
  if (metaStart > 3) {
    goal = text.slice(0, metaStart).replace(/[,;]?\s*(?:in|for|to|at|from)\s*$/, "").replace(/[,;]\s*$/, "").trim();
  }

  // --- audience ---
  const audienceMatch = text.match(
    /\b(?:for|targeting|aimed at|geared toward|designed for|serving)\s+(.{3,60}?)(?=\s+(?:in|,|interested|aged|ages?|based|to|and|who)|$)/i
  );
  const audience = audienceMatch ? audienceMatch[1].trim() : "";

  // --- age ---
  let age = "";
  const ageMatch = text.match(AGE_RE);
  if (ageMatch) {
    if (ageMatch[1] && ageMatch[2]) {
      age = `${ageMatch[1]}_to_${ageMatch[2]}`;
    } else if (ageMatch[3]) {
      const b = ageMatch[3].toLowerCase();
      if (/teen/.test(b)) age = "18_and_younger";
      else if (b.includes("gen z") || /young/.test(b)) age = "24_and_younger";
      else if (/millennial/.test(b)) age = "25_to_29,30_to_34";
      else if (/boomer|senior|retiree|middle/.test(b)) age = "55_and_older";
      else age = "35_to_44";
    }
  }

  // --- interest tags: split on comma, "and", newline ---
  let tags = [];
  const interestMatch = text.match(INTEREST_RE);
  if (interestMatch) {
    tags = interestMatch[1]
      .split(/,|\band\b|\n/)
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 8);
  }

  // --- brand / entity query ---
  let brand = "";
  const brandMatch = text.match(
    /\b(?:launch|create|build|make|pitch|start|develop|open|design)\s+(?:a|an|the|our|their)?\s*([A-Z][A-Za-z]+(?:\s[A-Z][A-Za-z]+)*)/
  );
  if (brandMatch) brand = brandMatch[1].trim();

  return { goal, audience, location, tags, age: age || undefined, brand: brand || undefined };
}

