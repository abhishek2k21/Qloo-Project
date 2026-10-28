import test from "node:test";
import assert from "node:assert/strict";
import { runTasteAgent } from "../lib/agent.js";

function makeFakeCaller(opts = {}) {
  const events = [];
  const calls = { search: [], audiences: [], tags: [], insights: [], heatmap: [] };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function record(kind, arg) {
    calls[kind].push(arg || {});
  }

  const failTypes = opts.failTypes || [];
  const hangPrimary = opts.hangPrimary || false;

  const caller = {
    async search(arg) {
      record("search", arg);
      events.push("start:search");
      await sleep(10);
      events.push("finish:search");
      return { results: { entities: [{ name: "Aesop", id: "urn:entity:brand:1", subtype: "brand" }] } };
    },
    async searchTags(arg) {
      record("tags", arg);
      events.push("start:tags");
      await sleep(10);
      events.push("finish:tags");
      return { results: { tags: [{ name: "skincare", id: "urn:tag:skincare" }] } };
    },
    async insights(arg) {
      record("insights", arg);
      events.push(`start:insights:${arg.filterType}`);
      await sleep(10);
      events.push(`finish:insights:${arg.filterType}`);
      if (failTypes.includes(arg.filterType)) {
        const { QlooError } = await import("../lib/qloo.js");
        throw new QlooError(`boom ${arg.filterType}`, 400);
      }
      if (hangPrimary && arg.filterType === "urn:entity:artist" && opts.hang) {
        const { QlooError } = await import("../lib/qloo.js");
        throw new QlooError("timeout", 504);
      }
      return {
        results: {
          entities: [
            { name: "EntityA", id: "urn:entity:x:1" },
            { name: "EntityB", id: "urn:entity:x:2" },
          ],
          tags: [{ name: "TagA", id: "urn:tag:a" }],
        },
      };
    },
    async heatmap(arg) {
      record("heatmap", arg);
      events.push("start:heatmap");
      await sleep(5);
      events.push("finish:heatmap");
      return { results: { entities: [{ name: "Austin", id: "urn:place:austin" }] } };
    },
  };

  return { caller, events, calls };
}

function digest(data, mode) {
  const r = data?.results || {};
  return {
    entities: (r.entities || []).map((e) => ({ name: e.name, id: e.id })),
    tags: (r.tags || []).map((t) => ({ name: t.name, id: t.id })),
    entityCount: (r.entities || []).length,
    mode,
  };
}

function baseQuery(overrides = {}) {
  return {
    goal: "Position a skincare brand",
    brand: "Aesop",
    audience: "skincare fans",
    tagQuery: "skincare",
    location: "Austin",
    ...overrides,
  };
}

test("entity, audience and tag resolves all start before any finishes", async () => {
  const { caller, events } = makeFakeCaller();
  await runTasteAgent(baseQuery(), { caller, digest, withHeatmap: false });
  const firstFinish = events.findIndex((e) => e.startsWith("finish"));
  assert.ok(
    ["start:search", "start:tags"].every((s) => events.indexOf(s) < firstFinish),
    `expected starts before first finish; got ${JSON.stringify(events)}`
  );
});

test("insights fan out over three distinct types, primary first", async () => {
  const { caller, calls } = makeFakeCaller();
  await runTasteAgent(baseQuery(), { caller, digest, withHeatmap: false });
  const types = calls.insights.map((c) => c.filterType);
  assert.equal(new Set(types).size, 3);
  assert.equal(types[0], "urn:entity:brand");
});

test("a failing complementary type does not fail the run", async () => {
  const { caller } = makeFakeCaller({ failTypes: ["urn:entity:place"] });
  const r = await runTasteAgent(baseQuery(), { caller, digest, withHeatmap: false });
  assert.equal(r.errors.length, 1);
  assert.ok(r.briefContext.insightsByType["urn:entity:brand"]);
});

test("heatmap is skipped with an 'add a city' note when no location", async () => {
  const { caller, calls } = makeFakeCaller();
  const r = await runTasteAgent(baseQuery({ location: undefined }), {
    caller,
    digest,
    withHeatmap: true,
  });
  const step = r.steps.find((s) => s.name === "heatmapInsights");
  assert.match(step.detail, /add a city/i);
  assert.equal(calls.heatmap.length, 0);
});

test("a hung Qloo step becomes ok:false, not a throw", async () => {
  const { caller } = makeFakeCaller({ hangPrimary: true, hang: true });
  const r = await runTasteAgent(baseQuery({ goal: "Launch a streaming playlist" }), {
    caller,
    digest,
    withHeatmap: false,
  });
  const primaryStep = r.steps.find(
    (s) => s.name === "tasteInsights" && s.filterType === "urn:entity:artist"
  );
  assert.equal(primaryStep.ok, false);
});
