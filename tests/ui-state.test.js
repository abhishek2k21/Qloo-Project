import test from "node:test";
import assert from "node:assert/strict";
import { qlooBadge, llmBadge } from "../lib/ui-state.js";

test("null response is idle", () => {
  assert.deepEqual(qlooBadge(null), { kind: "idle", label: "Qloo: idle" });
  assert.deepEqual(llmBadge(null), { kind: "idle", label: "LLM: idle" });
});

test("live data is green", () => {
  assert.deepEqual(qlooBadge({ qlooLive: true, mock: false }), {
    kind: "live",
    label: "Qloo: live",
  });
});

test("mock is amber and disclosed", () => {
  assert.deepEqual(qlooBadge({ qlooLive: false, mock: true }), {
    kind: "mock",
    label: "Qloo: disclosed mock",
  });
});

test("live but empty is its own state", () => {
  assert.equal(
    qlooBadge({ qlooLive: true, mock: false, emptyReason: "x" }).kind,
    "empty"
  );
});

test("template LLM is mock, openai is live", () => {
  assert.equal(llmBadge({ llmLive: false }).kind, "mock");
  assert.equal(llmBadge({ llmLive: true }).kind, "live");
});
