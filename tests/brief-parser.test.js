import test from "node:test";
import assert from "node:assert/strict";
import { parseBrief } from "../lib/brief-parser.js";

test("parses goal and audience from a freeform brief", () => {
  const r = parseBrief(
    "Launch a streaming playlist for indie music fans in Brooklyn, aged 25 to 29, interested in vinyl and jazz"
  );
  assert.ok(r.goal.length > 3);
  assert.ok(/indie|fans|music/i.test(r.goal));
  assert.ok(r.audience);
  assert.ok(/indie|music/i.test(r.audience));
});

test("extracts location from a city name", () => {
  const r = parseBrief("Pitch a podcast about gaming in Austin");
  assert.equal(r.location, "Austin");
});

test("extracts age band", () => {
  const r = parseBrief("Launch a brand for 18-24 year olds in Seattle");
  assert.ok(r.age);
});

test("returns empty structured fields when the brief is just a goal", () => {
  const r = parseBrief("Make a zine about vintage cars");
  assert.equal(r.audience, "");
  assert.equal(r.location, "");
  assert.deepEqual(r.tags, []);
});

test("collects interest tags", () => {
  const r = parseBrief(
    "Launch a streaming playlist for indie music fans in Brooklyn interested in vinyl and jazz"
  );
  assert.ok(r.tags.length >= 2);
  assert.ok(r.tags.includes("vinyl"));
  assert.ok(r.tags.includes("jazz"));
});

// Task 2: "Sell hiking boots to retirees" — "to retirees" is the audience,
// and the sentence-initial verb "Sell" must never become a brand query.
test('Sell hiking boots to retirees -> audience "retirees", no brand', () => {
  const r = parseBrief("Sell hiking boots to retirees");
  assert.equal(r.audience, "retirees");
  assert.equal(r.brand, undefined);
  assert.equal(r.goal, "Sell hiking boots to retirees");
});

test("sentence-initial capitalised word is never a brand query", () => {
  const r = parseBrief("Sell Nike sneakers to joggers in LA");
  // "Sell" is sentence-initial; the only brand signal here is "Nike", which
  // is mid-sentence and capitalised, so it may become the entity query.
  assert.equal(r.brand, "Nike");
});

test("mid-sentence capitalised name becomes a brand query", () => {
  const r = parseBrief("Position a skincare brand with urban creatives who follow Aesop");
  assert.equal(r.brand, "Aesop");
});

// --- Task 3: LLM path with a fake complete() ---
import { parseBriefWithLlm, heuristicParse, LLM_KEYS } from "../lib/brief-parser.js";

test("LLM path: JSON with all four keys is used, trimmed, 80-char capped", async () => {
  const complete = async () =>
    JSON.stringify({
      goal: "Launch a zine  ",
      audience: "  urban creatives  ",
      location: "Brooklyn",
      tags: "vinyl, jazz",
    });
  const r = await parseBriefWithLlm("Launch a zine for urban creatives", complete);
  assert.equal(r.source, "llm");
  assert.equal(r.goal, "Launch a zine");
  assert.equal(r.audience, "urban creatives");
  assert.equal(r.location, "Brooklyn");
  assert.equal(r.tags, "vinyl, jazz");
});

test("LLM path: values over 80 chars are truncated to 80", async () => {
  const complete = async () =>
    JSON.stringify({
      goal: "x".repeat(200),
      audience: "a",
      location: "",
      tags: "",
    });
  const r = await parseBriefWithLlm("brief", complete);
  assert.equal(r.goal.length, 80);
});

test("LLM path: non-JSON falls back to heuristic", async () => {
  const complete = async () => "I think the audience is retirees.";
  const r = await parseBriefWithLlm("Sell hiking boots to retirees", complete);
  assert.equal(r.source, "heuristic");
  // heuristic should still have extracted "retirees"
  assert.equal(r.audience, "retirees");
});

test("LLM path: throw falls back to heuristic", async () => {
  const complete = async () => {
    throw new Error("LLM down");
  };
  const r = await parseBriefWithLlm("Sell hiking boots to retirees", complete);
  assert.equal(r.source, "heuristic");
  assert.equal(r.audience, "retirees");
});

test("LLM path: missing complete (no OPENAI_API_KEY) falls back to heuristic", async () => {
  const r = await parseBriefWithLlm("Sell hiking boots to retirees", undefined);
  assert.equal(r.source, "heuristic");
  assert.equal(r.audience, "retirees");
});

test("heuristicParse is the synchronous fallback used by the LLM path", () => {
  const r = heuristicParse("Sell hiking boots to retirees");
  assert.equal(r.audience, "retirees");
  assert.equal(r.brand, undefined);
});

test("LLM_KEYS is the fixed four-key schema", () => {
  assert.deepEqual(LLM_KEYS, ["goal", "audience", "location", "tags"]);
});
