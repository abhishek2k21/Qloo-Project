import test from "node:test";
import assert from "node:assert/strict";
import { parseBrief } from "../lib/brief-parser.js";

test("parses goal and audience from a freeform brief", () => {
  const r = parseBrief(
    "Launch a streaming playlist for indie music fans in Brooklyn, aged 25 to 29, interested in vinyl and jazz"
  );
  assert.ok(r.goal.length > 3);
  assert.ok(/indie|fans|music/i.test(r.goal));
  assert.ok(r.audience);
  assert.ok(/indie|music/i.test(r.audience));
});

test("extracts location from a city name", () => {
  const r = parseBrief("Pitch a podcast about gaming in Austin");
  assert.equal(r.location, "Austin");
});

test("extracts age band", () => {
  const r = parseBrief("Launch a brand for 18-24 year olds in Seattle");
  assert.ok(r.age);
});

test("returns empty structured fields when the brief is just a goal", () => {
  const r = parseBrief("Make a zine about vintage cars");
  assert.equal(r.audience, "");
  assert.equal(r.location, "");
  assert.deepEqual(r.tags, []);
});

test("collects interest tags", () => {
  const r = parseBrief(
    "Launch a streaming playlist for indie music fans in Brooklyn interested in vinyl and jazz"
  );
  assert.ok(r.tags.length >= 2);
  assert.ok(r.tags.includes("vinyl"));
  assert.ok(r.tags.includes("jazz"));
});
