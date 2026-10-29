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

// Task 5: "<urn:entity:type> insights, rank #N" verifies when the type is
// present in insightsByType, so template output scores N of N.
test("urn insights-rank citation verifies when the type is in insightsByType", () => {
  const r = auditCitations(
    "Anchor on Aesop [Qloo: urn:entity:artist insights, rank #1]",
    {
      names: ["Aesop"],
      tags: [],
      places: [],
      insightsByType: { "urn:entity:artist": { entities: [{ name: "Aesop" }] } },
    }
  );
  assert.deepEqual(r, { total: 1, verified: 1, unverified: [] });
});

test("urn insights-rank citation does NOT verify when the type is absent", () => {
  const r = auditCitations(
    "Anchor on X [Qloo: urn:entity:movie insights, rank #1]",
    {
      names: [],
      tags: [],
      places: [],
      insightsByType: { "urn:entity:artist": { entities: [] } },
    }
  );
  assert.equal(r.verified, 0);
  assert.equal(r.total, 1);
  assert.equal(r.unverified.length, 1);
});

test("template generateGrounded output is N of N with insightsByType passed", async () => {
  const { generateGrounded, auditCitations } = await import("../lib/llm.js").then(async (m) => ({
    generateGrounded: m.generateGrounded,
    auditCitations: (await import("../lib/citations.js")).auditCitations,
  }));
  const ctx = {
    filterType: "urn:entity:artist",
    insights: { mode: "mock", entities: [{ name: "Aesop" }], tags: ["minimalist"] },
    heatmap: { entities: [{ name: "Brooklyn" }] },
  };
  const out = await generateGrounded({ goal: "g", audience: "a" }, ctx, {});
  const audit = auditCitations(out.text, {
    names: ctx.insights.entities.map((e) => e.name),
    tags: ctx.insights.tags,
    places: ctx.heatmap.entities.map((e) => e.name),
    insightsByType: { "urn:entity:artist": ctx.insights },
  });
  assert.equal(audit.verified, audit.total);
  assert.equal(audit.unverified.length, 0);
});
