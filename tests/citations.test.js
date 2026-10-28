import test from "node:test";
import assert from "node:assert/strict";
import { auditCitations } from "../lib/citations.js";

test("verified when the citation names a digest entity", () => {
  assert.deepEqual(
    auditCitations("Lead with Aesop [Qloo: Aesop, rank #1]", {
      names: ["Aesop"],
      tags: [],
      places: [],
    }),
    { total: 1, verified: 1, unverified: [] }
  );
});

test("unverified when the citation names something absent", () => {
  const r = auditCitations("[Qloo: Zendaya]", { names: ["Aesop"], tags: [], places: [] });
  assert.deepEqual([r.total, r.verified, r.unverified], [1, 0, ["Zendaya"]]);
});

test("no citations means total 0", () => {
  assert.equal(auditCitations("plain", { names: [], tags: [], places: [] }).total, 0);
});

test("mock-mode template never emits [Qloo:]", async () => {
  const { generateGrounded } = await import("../lib/llm.js");
  const out = await generateGrounded(
    { goal: "g", audience: "a" },
    { insights: { mode: "mock", entities: [{ name: "Aesop" }], tags: [] }, heatmap: { entities: [] } },
    {}
  );
  assert.ok(!out.text.includes("[Qloo:"));
  assert.ok(out.text.includes("[Mock:"));
});
