/**
 * TasteBrief live smoke test.
 *
 * Two modes:
 *
 *   1. `node scripts/smoke-live.mjs --types`   (needs QLOO_API_KEY)
 *      For each URN in ENTITY_TYPES, resolves one tag via /v2/tags, then
 *      calls /v2/insights with take=1 + that tag. Prints `urn -> HTTP status`
 *      per type. Exits 1 if any status is 400. Settles finding F10.
 *
 *   2. `node scripts/smoke-live.mjs --url <origin>`
 *      POSTs the three presets plus "Sell hiking boots to retirees" to
 *      {origin}/api/brief. Exits 1 unless every preset returns 200,
 *      qlooLive === true, briefContext.insights.entityCount > 0, and the
 *      hiking-boots brief returns either relaxations.length > 0 or a string
 *      emptyReason with mock === false.
 */

import { ENTITY_TYPES } from "../lib/entity-types.js";

const BASE =
  process.env.QLOO_BASE_URL || "https://hackathon.api.qloo.com";

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* ignore */
  }
  return { res, body };
}

async function resolveOneTag(key) {
  // Resolve a generic tag so every insights call carries "plus one resolved
  // tag" as the smoke spec requires.
  const url = `${BASE}/v2/tags?${new URLSearchParams({
    "filter.query": "music",
    take: "1",
  })}`;
  const { res, body } = await fetchJson(url, {
    headers: { "X-Api-Key": key },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const tags = body?.results?.tags || [];
  const t = tags[0];
  if (!t) return null;
  return t.id || t.tag_id || t.urn || null;
}

async function runTypes(key) {
  const tag = await resolveOneTag(key);
  let failed = false;
  for (const urn of ENTITY_TYPES) {
    const params = {
      "filter.type": urn,
      take: "1",
    };
    if (tag) params["signal.interests.tags"] = tag;
    const url = `${BASE}/v2/insights?${new URLSearchParams(params)}`;
    const { res } = await fetchJson(url, {
      headers: { "X-Api-Key": key },
      cache: "no-store",
    });
    console.log(`${urn} -> ${res.status}`);
    if (res.status === 400) failed = true;
  }
  if (failed) {
    console.error("\nSome entity types returned 400 from /v2/insights.");
    process.exit(1);
  }
  console.log("\nAll entity types OK.");
}

function presetBody(brief) {
  return JSON.stringify({ brief, withHeatmap: true });
}

async function runUrl(origin) {
  const endpoint = origin.replace(/\/$/, "") + "/api/brief";
  const presets = [
    "Launch an indie-music zine to urban creatives who love vinyl",
    "Position a skincare brand with urban creatives who follow Aesop",
    "Pitch a neo-noir streaming original to cinephile 25-34s",
  ];
  const stressBrief = "Sell hiking boots to retirees";

  let failed = false;

  for (const brief of presets) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: presetBody(brief),
    });
    const body = await res.json().catch(() => ({}));
    const ok =
      res.status === 200 &&
      body.qlooLive === true &&
      body.briefContext?.insights?.entityCount > 0;
    console.log(
      `${ok ? "PASS" : "FAIL"} preset "${brief.slice(0, 40)}…" -> ${res.status} qlooLive=${body.qlooLive} entities=${body.briefContext?.insights?.entityCount}`
    );
    if (!ok) failed = true;
  }

  // Stress brief: must not silently swap to mock jazz artists.
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: presetBody(stressBrief),
  });
  const body = await res.json().catch(() => ({}));
  const stressOk =
    res.status === 200 &&
    (body.relaxations?.length > 0 ||
      (typeof body.emptyReason === "string" && body.mock === false));
  console.log(
    `${stressOk ? "PASS" : "FAIL"} stress "${stressBrief}" -> ${res.status} mock=${body.mock} relaxations=${body.relaxations?.length} emptyReason=${body.emptyReason}`
  );
  if (!stressOk) failed = true;

  if (failed) {
    console.error("\nLive smoke test failed.");
    process.exit(1);
  }
  console.log("\nLive smoke test passed.");
}

const args = process.argv.slice(2);
const mode = args[0];

if (mode === "--types") {
  const key = process.env.QLOO_API_KEY;
  if (!key) {
    console.error("QLOO_API_KEY is required for --types mode.");
    process.exit(1);
  }
  await runTypes(key);
} else if (mode === "--url") {
  const origin = args[1];
  if (!origin) {
    console.error("Usage: node scripts/smoke-live.mjs --url <origin>");
    process.exit(1);
  }
  await runUrl(origin);
} else {
  console.error(
    'Usage: node scripts/smoke-live.mjs --types   |   node scripts/smoke-live.mjs --url <origin>'
  );
  process.exit(1);
}
