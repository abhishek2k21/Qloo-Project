import test from "node:test";
import assert from "node:assert/strict";
import { pickFilterType } from "../lib/agent.js";

test("lib modules import under plain Node ESM", () => {
  assert.equal(typeof pickFilterType, "function");
});
