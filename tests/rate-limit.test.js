import test from "node:test";
import assert from "node:assert/strict";
import { createRateLimiter } from "../lib/rate-limit.js";

test("allows up to max then blocks", () => {
  let t = 0;
  const lim = createRateLimiter({ max: 3, windowMs: 1000, now: () => t });
  assert.equal(lim("ip").allowed, true);
  assert.equal(lim("ip").allowed, true);
  assert.equal(lim("ip").allowed, true);
  const fourth = lim("ip");
  assert.equal(fourth.allowed, false);
  assert.ok(fourth.retryAfterSec > 0);
});

test("window resets after windowMs", () => {
  let t = 0;
  const lim = createRateLimiter({ max: 2, windowMs: 1000, now: () => t });
  lim("ip");
  lim("ip");
  assert.equal(lim("ip").allowed, false);
  t = 1001; // past the window
  assert.equal(lim("ip").allowed, true);
});

test("different keys are independent", () => {
  let t = 0;
  const lim = createRateLimiter({ max: 1, windowMs: 1000, now: () => t });
  assert.equal(lim("a").allowed, true);
  assert.equal(lim("a").allowed, false);
  assert.equal(lim("b").allowed, true);
});
