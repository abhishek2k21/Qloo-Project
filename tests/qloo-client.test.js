import test from "node:test";
import assert from "node:assert/strict";
import {
  createQlooClient,
  QlooError,
} from "../lib/qloo.js";

test("timeout rejects with QlooError 504", async () => {
  const hang = (_u, { signal }) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => {
        const err = new Error("aborted");
        err.name = "AbortError";
        reject(err);
      });
    });
  const c = createQlooClient({ apiKey: "k", fetchImpl: hang, timeoutMs: 20 });
  await assert.rejects(c.searchTags({ query: "x" }), (e) => {
    assert.ok(e instanceof QlooError, `expected QlooError, got ${e?.constructor?.name}`);
    assert.equal(e.status, 504);
    return true;
  });
});

test("identical calls hit fetch once", async () => {
  let calls = 0;
  const fakeFetch = async () => {
    calls++;
    return new Response(JSON.stringify({ results: [] }), { status: 200 });
  };
  const c = createQlooClient({ apiKey: "k", fetchImpl: fakeFetch, cacheMax: 50, cacheTtlMs: 600000 });
  await c.searchTags({ query: "x" });
  await c.searchTags({ query: "x" });
  assert.equal(calls, 1);
});

test("cacheMax evicts oldest", async () => {
  let calls = 0;
  const fakeFetch = async () => {
    calls++;
    return new Response(JSON.stringify({ results: [] }), { status: 200 });
  };
  const c = createQlooClient({ apiKey: "k", fetchImpl: fakeFetch, cacheMax: 2, cacheTtlMs: 600000 });
  await c.searchTags({ query: "a" });
  await c.searchTags({ query: "b" });
  await c.searchTags({ query: "c" });
  await c.searchTags({ query: "a" });
  assert.equal(calls, 4);
});

test("missing key throws QlooError 500 without calling fetch", async () => {
  let called = false;
  const fakeFetch = async () => {
    called = true;
    return new Response(JSON.stringify({ results: [] }), { status: 200 });
  };
  const c = createQlooClient({ apiKey: () => undefined, fetchImpl: fakeFetch });
  try {
    await c.searchTags({ query: "x" });
    assert.fail("expected QlooError");
  } catch (e) {
    assert.ok(e instanceof QlooError, `got ${e?.constructor?.name}: ${e?.message}`);
    assert.equal(e.status, 500);
  }
  assert.equal(called, false);
});

test("sends X-Api-Key and uses baseUrl", async () => {
  let seenUrl, seenHeaders;
  const fakeFetch = async (url, init) => {
    seenUrl = url;
    seenHeaders = init?.headers;
    return new Response(JSON.stringify({ results: [] }), { status: 200 });
  };
  const c = createQlooClient({ apiKey: "k", baseUrl: "https://api.test", fetchImpl: fakeFetch });
  await c.searchTags({ query: "x" });
  assert.ok(seenUrl.startsWith("https://api.test"));
  assert.equal(seenHeaders["X-Api-Key"], "k");
});

