/**
 * Validate the /api/brief request body.
 *
 * Pure, synchronous, unit-testable. Enforces:
 *   - body is a plain object
 *   - string fields are strings (not numbers/objects)
 *   - no field exceeds MAX_FIELD_CHARS (280)
 *   - the optional `brief` field (freeform textarea) is ≤ MAX_BRIEF_CHARS (500)
 *   - withHeatmap coerced to a boolean
 *
 * Returns a discriminated union:
 *   { ok: true, value: {...} }  |  { ok: false, error: string }
 */

export const MAX_FIELD_CHARS = 280;
export const MAX_BRIEF_CHARS = 500;

const STRING_FIELDS = ["goal", "brand", "audience", "tagQuery", "location", "brief"];

export function validateBriefInput(body) {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Body must be a JSON object" };
  }

  const value = { withHeatmap: true };

  for (const field of STRING_FIELDS) {
    const raw = body[field];
    if (raw === undefined || raw === null || raw === "") {
      continue;
    }
    if (typeof raw !== "string") {
      return { ok: false, error: `Field "${field}" must be a string` };
    }
    const limit = field === "brief" ? MAX_BRIEF_CHARS : MAX_FIELD_CHARS;
    if (raw.length > limit) {
      return {
        ok: false,
        error: `Field "${field}" exceeds ${limit} characters`,
      };
    }
    value[field] = raw.trim();
  }

  value.withHeatmap = body.withHeatmap !== false;
  value.forceMock = Boolean(body.forceMock);

  // At least one of goal or brief is required.
  if (!value.goal && !value.brief && !value.tagQuery) {
    return { ok: false, error: "Provide a goal, brief, or interest keywords" };
  }

  return { ok: true, value };
}
