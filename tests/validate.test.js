import test from "node:test";
import assert from "node:assert/strict";
import { validateBriefInput, MAX_FIELD_CHARS, MAX_BRIEF_CHARS } from "../lib/validate.js";

test("valid body returns ok with withHeatmap default true", () => {
  const r = validateBriefInput({ goal: "Launch a playlist" });
  assert.equal(r.ok, true);
  assert.equal(r.value.withHeatmap, true);
  assert.equal(r.value.goal, "Launch a playlist");
});

test("non-string field returns 400-shape error", () => {
  const r = validateBriefInput({ goal: 123 });
  assert.equal(r.ok, false);
  assert.match(r.error, /goal/);
});

test("field over 280 chars returns 400 naming the field", () => {
  const r = validateBriefInput({ goal: "x".repeat(MAX_FIELD_CHARS + 1) });
  assert.equal(r.ok, false);
  assert.match(r.error, /goal/);
});

test("brief over 500 chars returns 400", () => {
  const r = validateBriefInput({ brief: "x".repeat(MAX_BRIEF_CHARS + 1) });
  assert.equal(r.ok, false);
  assert.match(r.error, /brief/);
});

test("no goal/brief/tagQuery returns 400", () => {
  const r = validateBriefInput({});
  assert.equal(r.ok, false);
});

test("tagQuery alone is accepted", () => {
  const r = validateBriefInput({ tagQuery: "vinyl" });
  assert.equal(r.ok, true);
});

test("non-object body returns 400", () => {
  assert.equal(validateBriefInput(null).ok, false);
  assert.equal(validateBriefInput([]).ok, false);
});
