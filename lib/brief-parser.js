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
 * The heuristic (regex) parse — the synchronous, deterministic fallback.
 * @param {string} brief  the freeform brief text
 * @returns {{ goal: string, audience: string, location: string, tags: string[], age?: string, brand?: string }}
 */
export function heuristicParse(brief) {
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
  // Two shapes: "...for/targeting X" (adverbial) and "...to X" (prepositional
  // recipient, e.g. "Sell hiking boots to retirees"). The recipient form is
  // the common case in a verb-led brief, so it is preferred when present.
  const toRecipient = text.match(
    /\bto\s+([A-Za-z][A-Za-z\s]{2,40}?)(?=\s+(?:in|,|aged|who\b|who )|,|$)/
  );
  const audienceMatch = text.match(
    /\b(?:for|targeting|aimed at|geared toward|designed for|serving)\s+(.{3,60}?)(?=\s+(?:in|,|interested|aged|ages?|based|to|and|who)|$)/i
  );
  // Prefer the adverbial form when present; otherwise fall back to the
  // "to <recipient>" form so "Sell X to retirees" resolves an audience.
  const audience = audienceMatch
    ? audienceMatch[1].trim()
    : toRecipient
    ? toRecipient[1].trim()
    : "";

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
  // An entityQuery is a proper name, NOT the sentence-initial verb ("Sell",
  // "Position"). Two triggers, both mid-sentence:
  //   1. a verb-led construction whose object is capitalised ("make Aesop"),
  //   2. any mid-sentence capitalised proper name (not the first word, not a
  //      common noun). Sentence-initial words are never treated as a brand.
  let brand = "";
  const brandByVerb = text.match(
    /\b(?:launch|create|build|make|pitch|start|develop|open|design)\s+(?:a|an|the|our|their)?\s*([A-Z][A-Za-z]+(?:\s[A-Z][A-Za-z]+)*)/
  );
  if (brandByVerb) {
    // Only accept it when the verb itself is not the very first word, or the
    // captured object is a real mid-sentence name. In practice the verb here
    // is always mid-sentence (it is followed by a capitalised object), so the
    // captured group is the name.
    brand = brandByVerb[1].trim();
  }
  if (!brand) {
    // A mid-sentence capitalised word that is not the first word and not a
    // plain audience/location token.
    const words = text.split(/\s+/);
    for (let i = 1; i < words.length; i++) {
      const w = words[i];
      const m = w.match(/^([A-Z][a-z]+(?:\s[A-Z][a-z]+)*?)/);
      if (m && !/^(?:For|In|To|The|And|With|Who|Whose|A|An|Aged|Based|Near|From|Aimed|Targeting|Serving|Interested)$/.test(w)) {
        brand = m[1].trim();
        break;
      }
    }
  }

  return { goal, audience, location, tags, age: age || undefined, brand: brand || undefined };
}

/**
 * Backward-compatible synchronous entry point. Historically `parseBrief` was
 * the heuristic; it now delegates to the LLM path with no LLM available
 * (which is exactly the heuristic).
 * @param {string} brief
 */
export function parseBrief(brief) {
  // Synchronous callers get the deterministic heuristic result.
  const r = heuristicParse(brief);
  r.source = "heuristic";
  return r;
}

/** The fixed four-key JSON schema the LLM must return. */
export const LLM_KEYS = ["goal", "audience", "location", "tags"];

const LLM_CAP = 80;

function trimCap(v) {
  if (v == null) return "";
  const s = String(v).trim();
  return s.length > LLM_CAP ? s.slice(0, LLM_CAP) : s;
}

/**
 * LLM-backed parse. `complete` is an injected async function returning a
 * JSON string with the four LLM_KEYS; any string that is not valid JSON, any
 * throw, or a missing `complete` (no OPENAI_API_KEY) falls back to
 * heuristicParse. Values are trimmed and capped at 80 chars.
 *
 * @param {string} brief
 * @param {(brief: string) => Promise<string>} [complete]  LLM call; when
 *   omitted (no OPENAI_API_KEY) the heuristic is used directly.
 * @returns {Promise<{ goal, audience, location, tags: string, age?: string, brand?: string, source: "llm" | "heuristic" }>}
 */
export async function parseBriefWithLlm(brief, complete) {
  if (typeof complete === "function") {
    let raw;
    try {
      raw = await complete(brief);
    } catch {
      // LLM threw — fall through to heuristic.
    }
    if (typeof raw === "string") {
      let obj;
      try {
        obj = JSON.parse(raw);
      } catch {
        obj = null; // not JSON — fall through to heuristic.
      }
      if (obj && typeof obj === "object") {
        const tagsVal = Array.isArray(obj.tags) ? obj.tags.join(", ") : obj.tags;
        return {
          goal: trimCap(obj.goal),
          audience: trimCap(obj.audience),
          location: trimCap(obj.location),
          tags: trimCap(tagsVal),
          source: "llm",
        };
      }
    }
  }
  // No key, throw, non-JSON, or malformed object: deterministic fallback.
  const h = heuristicParse(brief);
  h.source = "heuristic";
  return h;
}

