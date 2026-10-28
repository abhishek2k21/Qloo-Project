/**
 * UI state helpers for the TasteBrief client.
 *
 * Pure functions that turn an API response (or null) into badge + label
 * pairs. CSS class mapping: `live` is green, `mock` is amber, `empty` is
 * red, `idle` is neutral.
 */

/**
 * Qloo badge.
 * @param {object | null} res
 * @returns {{ kind: "idle" | "live" | "mock" | "empty", label: string }}
 */
export function qlooBadge(res) {
  if (!res) return { kind: "idle", label: "Qloo: idle" };
  if (res.emptyReason) return { kind: "empty", label: "Qloo: empty" };
  if (res.qlooLive && !res.mock) return { kind: "live", label: "Qloo: live" };
  return { kind: "mock", label: "Qloo: disclosed mock" };
}

/**
 * LLM badge.
 * @param {object | null} res
 * @returns {{ kind: "idle" | "live" | "mock", label: string }}
 */
export function llmBadge(res) {
  if (!res) return { kind: "idle", label: "LLM: idle" };
  return res.llmLive
    ? { kind: "live", label: "LLM: live" }
    : { kind: "mock", label: "LLM: template" };
}
