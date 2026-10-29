import test from "node:test";
import assert from "node:assert/strict";
import { pickFilterType } from "../lib/agent.js";
import {
  isKeyRejected,
  isPassStatus,
  typesGateMessage,
} from "../scripts/smoke-live.mjs";

test("lib modules import under plain Node ESM", () => {
  assert.equal(typeof pickFilterType, "function");
});

// Task: --types exits 1 unless every status is 2xx; a 401/403 on the first
// /v2/tags call aborts immediately with "KEY REJECTED".
test("401 and 403 on the tags call are key-rejected", () => {
  assert.equal(isKeyRejected(401), true);
  assert.equal(isKeyRejected(403), true);
  assert.equal(isKeyRejected(404), false);
  assert.equal(isKeyRejected(200), false);
});

test("only 2xx statuses pass the gate", () => {
  for (const s of [200, 201, 202, 204]) assert.equal(isPassStatus(s), true);
  for (const s of [300, 301, 400, 401, 404, 500, 503]) {
    assert.equal(isPassStatus(s), false);
  }
});

test("non-2xx types run reports KEY REJECTED for auth failures", () => {
  const statuses = [401, 401, 401, 401, 401, 401, 401, 401, 401, 401];
  const msg = typesGateMessage(statuses);
  assert.match(msg, /KEY REJECTED/);
});

test("non-2xx types run without auth failures says exit 1, never 'all OK'", () => {
  const statuses = [200, 400, 200];
  const msg = typesGateMessage(statuses);
  assert.doesNotMatch(msg, /All entity types OK/);
  assert.doesNotMatch(msg, /KEY REJECTED/);
  assert.match(msg, /exiting|failed/i);
});

test("all-2xx types run reports success and does not say key rejected", () => {
  const statuses = [200, 200, 200];
  const msg = typesGateMessage(statuses);
  assert.match(msg, /OK|passed/i);
  assert.doesNotMatch(msg, /KEY REJECTED/);
});
