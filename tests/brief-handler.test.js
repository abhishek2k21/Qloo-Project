import test from "node:test";
import assert from "node:assert/strict";
import { handleBriefRequest } from "../lib/brief-handler.js";
import { createRateLimiter } from "../lib/rate-limit.js";

function makeDeps(overrides = {}) {
  const calls = { parseBrief: 0, agent: 0 };
  return {
    calls,
    deps: {
      runAgent: async () => {
        calls.agent++;
        return {
          mock: false,
          errors: [],
          steps: [],
          briefContext: { insights: { entities: [{ name: "Aesop" }], tags: [] }, heatmap: { entities: [] } },
          relaxations: [],
          signalSummary: {},
        };
      },
      generateBare: async () => ({ source: "openai", text: "bare" }),
      generateGrounded: async () => ({ source: "openai", text: "Lead with Aesop [Qloo: Aesop]" }),
      parseBrief: () => {
        calls.parseBrief++;
        return { goal: "g", audience: "a", location: "", tags: ["t"] };
      },
      auditCitations: () => ({ total: 1, verified: 1, unverified: [] }),
      limiter: createRateLimiter({ max: 100, windowMs: 60000 }),
      ...overrides,
    },
  };
}

function req(body, headers = {}) {
  return new Request("http://x/api/brief", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

test("invalid JSON returns 400 with a JSON error", async () => {
  const { deps } = makeDeps();
  const res = await handleBriefRequest(req("{nope"), deps);
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, "Invalid JSON body");
});

test("non-string field returns 400", async () => {
  const { deps } = makeDeps();
  const res = await handleBriefRequest(req({ goal: 123 }), deps);
  assert.equal(res.status, 400);
});

test("field over 280 chars returns 400 naming the field", async () => {
  const { deps } = makeDeps();
  const res = await handleBriefRequest(req({ goal: "x".repeat(281) }), deps);
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /goal/);
});

test("11th request returns 429 with Retry-After", async () => {
  const { deps } = makeDeps({ limiter: createRateLimiter({ max: 10, windowMs: 60000 }) });
  let last;
  for (let i = 0; i < 11; i++) {
    last = await handleBriefRequest(req({ goal: "g" }), deps);
  }
  assert.equal(last.status, 429);
  assert.ok(parseInt(last.headers.get("retry-after"), 10) > 0);
});

test("agent throwing returns 500 JSON without a stack", async () => {
  const { deps } = makeDeps({
    runAgent: async () => {
      throw new Error("boom");
    },
  });
  const res = await handleBriefRequest(req({ goal: "g" }), deps);
  assert.equal(res.status, 500);
  const body = await res.json();
  assert.equal(body.error, "Brief generation failed");
  assert.ok(!JSON.stringify(body).includes("at "));
});

test("brief field triggers parseBrief once", async () => {
  const { deps, calls } = makeDeps();
  await handleBriefRequest(req({ brief: "Launch a playlist for indie fans" }), deps);
  assert.equal(calls.parseBrief, 1);
});

test("success returns relaxations, citationAudit, qlooLive fields", async () => {
  const { deps } = makeDeps();
  const res = await handleBriefRequest(req({ goal: "g" }), deps);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(body.relaxations));
  assert.ok("citationAudit" in body);
  assert.equal(typeof body.qlooLive, "boolean");
});
