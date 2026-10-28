/**
 * Citation audit for grounded LLM answers.
 *
 * `auditCitations(text, data)` parses `[Qloo: ...]` / `[Mock: ...]` citation
 * tags from `text` and checks each cited body against the digest data
 * (names, tags, places). A citation is verified when its body contains
 * (case-insensitive) any name, tag or place, or starts with one of the
 * generic data anchors: `heatmap`, `geographic`, `insights`, `tag`.
 *
 * Returns { total, verified, unverified: string[] } where unverified lists
 * the citation bodies that could not be traced to the Qloo digest.
 */

const CITE_RE = /\[(Qloo|Mock):\s*([^\]]*)\]/gi;

const ANCHORS = ["heatmap", "geographic", "insights", "tag"];

export function auditCitations(
  text,
  { names = [], tags = [], places = [] } = {}
) {
  const citations = [];
  let match;
  while ((match = CITE_RE.exec(text)) !== null) {
    citations.push(match[2].trim());
  }

  const allTokens = [...names, ...tags, ...places].map((t) => t.toLowerCase());

  const verified = [];
  const unverified = [];
  for (const body of citations) {
    const lower = body.toLowerCase();
    const ok =
      allTokens.some((token) => token && lower.includes(token)) ||
      ANCHORS.some((anchor) => lower.startsWith(anchor));
    if (ok) verified.push(body);
    else unverified.push(body);
  }

  return {
    total: citations.length,
    verified: verified.length,
    unverified,
  };
}
