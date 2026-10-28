import test from "node:test";
import assert from "node:assert/strict";
import { relaxationLadder } from "../lib/replan.js";

test("audience-only signal yields one rung", () => {
  const r = relaxationLadder({ audiences: ["urn:audience:1"], entities: ["urn:entity:1"] });
  assert.equal(r.length, 1);
  assert.equal(r[0].note, "dropped audience signal");
  assert.equal(r[0].signal.audiences, undefined);
  assert.deepEqual(r[0].signal.entities, ["urn:entity:1"]);
});

test("all three signals yield three rungs in order", () => {
  const r = relaxationLadder({ audiences: ["a"], tags: ["t"], age: "25_to_29", entities: ["e"] });
  assert.equal(r.length, 3);
  assert.deepEqual(r.map((x) => x.note), [
    "dropped audience signal",
    "dropped tag signal",
    "dropped age signal",
  ]);
  // Each rung is cumulative: rung 2 has dropped audience + tag.
  assert.equal(r[1].signal.audiences, undefined);
  assert.equal(r[1].signal.tags, undefined);
  assert.equal(r[1].signal.age, "25_to_29");
  assert.equal(r[2].signal.age, undefined);
});

test("entities-only signal yields empty ladder", () => {
  assert.deepEqual(relaxationLadder({ entities: ["urn:entity:1"] }), []);
});

test("empty signal yields empty ladder", () => {
  assert.deepEqual(relaxationLadder({}), []);
});
