import test from "node:test";
import assert from "node:assert/strict";
import {
  ENTITY_TYPES,
  pickFilterType,
  complementaryTypes,
} from "../lib/entity-types.js";

test("music wording beats the 'stream' substring", () => {
  assert.equal(pickFilterType("Launch a streaming playlist for runners"), "urn:entity:artist");
});
test("'showroom' does not match 'show'", () => {
  assert.equal(pickFilterType("Open a showroom for vintage furniture"), "urn:entity:brand");
});
test("podcast wins over gaming", () => {
  assert.equal(pickFilterType("Pitch a podcast about gaming"), "urn:entity:podcast");
});
test("video game URN is the hackathon spelling (verify live in Task 10)", () => {
  assert.ok(ENTITY_TYPES.includes("urn:entity:video_game"));
});
test("complementaryTypes returns two distinct non-primary registry types", () => {
  const c = complementaryTypes("urn:entity:movie");
  assert.equal(new Set(c).size, 2);
  assert.ok(c.every((t) => t !== "urn:entity:movie" && ENTITY_TYPES.includes(t)));
});
