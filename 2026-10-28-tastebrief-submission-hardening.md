# TasteBrief Submission Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the working TasteBrief prototype into a submission that survives a judge typing their own brief: honest about Qloo data, cross-domain, adaptive, hardened, and tested.

**Architecture:** Keep the existing Next.js App Router shell and `lib/` pipeline. Move logic out of `route.js` into a thin handler plus single-purpose modules (client, parser, agent, replan, citations), each dependency-injected so `node:test` can drive it with fakes. The agent stays deterministic and readable, but resolves in parallel, fans out across entity types, and replans (relaxes signals) instead of silently swapping to mock data.

**Tech Stack:** Next.js 15 (App Router), React 19, Node >=18 ESM, `node:test` (no new runtime deps), ESLint 9 (dev only), Qloo hackathon API, OpenAI chat API (optional).

**Spec:** `README.md` (repo root) + https://qloo.devpost.com/ (rules, judging criteria). No separate design doc exists; the Findings table below is the design input.

## Global Constraints

- Deadline: "Oct 30, 2026 @ 11:45pm EDT" (= Oct 31, 09:15 IST). Internal freeze: submit by Oct 30 evening IST.
- Submission must include: "A link to a functional demo application"; "A URL to a public code repository"; "A text description of what your project does"; "External hosting / fully published requirement"; "An open-source license, with the file visible in About section of your repo."
- "If your submission would work the same without Qloo, you're building the wrong thing."
- Judging: Technological Implementation, Design, Potential Impact, Quality of the Idea.
- Qloo base URL `https://hackathon.api.qloo.com` (keys ONLY work against this URL); auth header `X-Api-Key`; key is server-side only.
- Project rules: ESM only; no new runtime dependencies; one responsibility per file; `lib/` imports are relative with `.js` extension; every fallback (mock Qloo, template LLM) is disclosed in the UI and README; no Qloo response data or keys committed.

## Review Focus

1. A brief whose audience/tags resolve to nothing ("hiking boots for retirees"): expect an honest relaxed or "no matches" result, never unrelated mock entities. → pinned in Task 6.
2. Goals containing "streaming playlist" or "showroom": expect music / brand routing, never `movie`. → Task 2.
3. Qloo hangs or is slow: expect a response inside `maxDuration` with a failed trace step, never a hung request or HTML 500. → Tasks 3, 5.
4. Malformed, non-string, or oversized body fields: expect a JSON 400, never a crash or a burned quota. → Task 8.
5. No city supplied: expect the heatmap honestly skipped, never silently "Los Angeles". → Task 5.

---

## Findings driving this plan

Evidence is from reading the code and running probes against the zip (mock mode, no network).

| # | Finding | Evidence | Fixed in |
|---|---|---|---|
| F1 | Live-empty silently swaps to mock; mock ignores input ("hiking boots for retirees" returned Kendrick Lamar, Miles Davis, Copenhagen, Aesop, Parasite) | `lib/agent.js:328-388`, `lib/mock-qloo.js:169-186` | 6 |
| F2 | `pickAge` is never called, so the age signal is never sent | `lib/agent.js:35`, used at `:181,:205` | 4 |
| F3 | Substring regex misroutes: "streaming playlist" and "showroom" resolve to `movie` | `lib/agent.js:24-33` | 2 |
| F4 | No fetch timeout; 3 retries x 5 steps against `maxDuration = 60` | `lib/qloo.js:55-78` | 3, 5 |
| F5 | Every badge is `kind="mock"`, so live data renders amber | `app/page.js:132-134` | 9 |
| F6 | README promises a one-line brief; UI demands four hand-filled fields | `app/page.js:138-166` | 4, 9 |
| F7 | Heatmap silently defaults to "Los Angeles" | `lib/agent.js:228`, `lib/qloo.js:201` | 5 |
| F8 | `openai` dep never imported; `lint` script has no ESLint config; zero tests | `package.json` | 1 |
| F9 | No input caps, no rate limit, agent errors become HTML 500; every public hit spends Qloo + OpenAI quota | `app/api/brief/route.js` | 8 |
| F10 | `urn:entity:video_game` may be rejected; a third-party entrant README says the hackathon API needs `urn:entity:videogame` (HTTP 400 otherwise). Unverified: the official guide blocks automated fetch. | `lib/qloo.js:22-33` | 2, 10 |
| F11 | Independent resolves run sequentially; one entity type per brief while the pitch is cross-domain | `lib/agent.js:297` | 5 |
| F12 | Template output prints `[Qloo: ...]` citations over mock data | `lib/llm.js:139-146` | 7 |

Keep as-is (strengths): before/after panel, visible agent trace, disclosed mock, no secrets in git history (scanned), MIT license present.

## File Structure

| File | Responsibility |
|---|---|
| `lib/entity-types.js` (new) | Entity URN registry, goal routing, complementary types |
| `lib/qloo.js` | HTTP client factory: auth, timeout, bounded cache |
| `lib/brief-parser.js` (new) | One-line brief to `BriefQuery` (LLM with heuristic fallback), age cue |
| `lib/replan.js` (new) | Signal relaxation ladder |
| `lib/agent.js` | Plan execution: parallel resolve, fan-out, replan, heatmap |
| `lib/citations.js` (new) | Audit `[Qloo: ...]` tags against the digest |
| `lib/validate.js`, `lib/rate-limit.js` (new) | Input validation, per-IP limiter |
| `lib/brief-handler.js` (new) | `Request` to `Response` orchestration; `route.js` becomes a 5-line wrapper |
| `lib/ui-state.js` (new) | Pure badge/state derivation for the page |
| `scripts/smoke-live.mjs` (new) | Live verification against Qloo and the deployed URL |
| `tests/*.test.js` (new) | One test file per module |

## Shared types (referenced by every task)

```js
// BriefQuery
{ goal: string, entityQuery: string, audience: string, tagQuery: string,
  location?: string, age?: string }
// Signal
{ audiences?: string[], tags?: string[], entities?: string[], age?: string, location?: string }
// Digest (unchanged from lib/mock-qloo.js normalize)
{ mode: "live" | "mock", entityCount: number, entities: Entity[], tags: string[] }
// AgentResult
{ mock: boolean, errors: {step: string, error: string}[], steps: Step[],
  relaxations: string[], emptyReason?: string,
  briefContext: { ..., insights: Digest, insightsByType: Record<string, Digest>, heatmap?: Digest },
  signalSummary: { entities: number, audiences: number, tags: number } }
```

---

### Task 1: Tooling baseline (tests + lint, remove dead dependency)

**Files:**
- Modify: `package.json`
- Create: `eslint.config.mjs`
- Test: `tests/smoke.test.js`

**Interfaces:**
- Produces: `npm test` runs `node --test`; `npm run lint` runs `eslint .` and fails on unused variables.

- [ ] **Step 1: Write the failing test**

```js
// tests/smoke.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { pickFilterType } from "../lib/agent.js";

test("lib modules import under plain Node ESM", () => {
  assert.equal(typeof pickFilterType, "function");
});
```

- [ ] **Step 2: Run `npm test`.** Expected: FAIL with `Missing script: "test"`.
- [ ] **Step 3: Edit `package.json`:** add `"test": "node --test"`, set `"lint": "eslint ."`, remove `openai` from `dependencies`, add `devDependencies` `eslint@^9`, `@eslint/js`, `globals`, `eslint-plugin-react`. In `eslint.config.mjs` use a flat config: `js.configs.recommended`, JSX enabled, `react/jsx-uses-vars: error`, `no-unused-vars: error`, ignore `.next/**` and `node_modules/**`.
- [ ] **Step 4: Run `npm install && npm test && npm run lint`.** Expected: test PASS; lint exits 0 or lists only real unused-variable findings, which you fix in this task.
- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json eslint.config.mjs tests/smoke.test.js
git commit -m "chore: add node:test, eslint; drop unused openai dep"
```

---

### Task 2: Entity-type registry and goal routing

**Files:**
- Create: `lib/entity-types.js`
- Modify: `lib/agent.js` (delete local `pickFilterType`, import it), `lib/qloo.js` (delete local `ENTITY_TYPES`, import it)
- Test: `tests/entity-types.test.js`

**Interfaces:**
- Produces: `ENTITY_TYPES: string[]`; `pickFilterType(goal: string): string`; `complementaryTypes(primary: string): string[]` (exactly 2 distinct URNs from `ENTITY_TYPES`, never `primary`).

- [ ] **Step 1: Write the failing tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { ENTITY_TYPES, pickFilterType, complementaryTypes } from "../lib/entity-types.js";

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
  assert.ok(ENTITY_TYPES.includes("urn:entity:videogame"));
  assert.ok(!ENTITY_TYPES.includes("urn:entity:video_game"));
});
test("complementaryTypes returns two distinct non-primary registry types", () => {
  const c = complementaryTypes("urn:entity:movie");
  assert.equal(new Set(c).size, 2);
  assert.ok(c.every((t) => t !== "urn:entity:movie" && ENTITY_TYPES.includes(t)));
});
```

- [ ] **Step 2: Run `node --test tests/entity-types.test.js`.** Expected: FAIL (module not found).
- [ ] **Step 3: Implement `lib/entity-types.js`.** Table-driven `ROUTES: [RegExp, urn][]`, first match wins, all patterns use `\b` word boundaries, ordered podcast, music (`playlist|music|band|album|song|vinyl`), game, film/tv, place (`restaurant|dining|food|coffee`), brand (`brand|product|apparel|skincare|beauty|furniture|fashion|retail`), default artist. `complementaryTypes` prefers `place` and `brand` for artist/movie goals, otherwise `artist` and `place`.
- [ ] **Step 4: Run `npm test`.** Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add lib/entity-types.js lib/agent.js lib/qloo.js tests/entity-types.test.js
git commit -m "fix: word-boundary goal routing, entity-type registry"
```

---

### Task 3: Qloo client factory (timeout, bounded cache, injectable fetch)

**Files:**
- Modify: `lib/qloo.js`
- Test: `tests/qloo-client.test.js`

**Interfaces:**
- Consumes: `ENTITY_TYPES` (Task 2).
- Produces: `createQlooClient(opts: { apiKey: string | (() => string | undefined), baseUrl?: string, fetchImpl?: typeof fetch, timeoutMs?: number /* default 8000 */, cacheMax?: number /* default 200 */, cacheTtlMs?: number /* default 600000 */ }): { search, searchTags, insights, heatmap }`. Method signatures are unchanged from today's `qloo` object. `export const qloo = createQlooClient({ apiKey: () => process.env.QLOO_API_KEY })`. `QlooError` and `hasQlooKey` stay exported.

- [ ] **Step 1: Write the failing tests** (fake `fetchImpl` returning `new Response(JSON.stringify({results: []}))`)

```js
test("timeout rejects with QlooError 504", async () => {
  const hang = (_u, { signal }) => new Promise((_, rej) => signal.addEventListener("abort", () => rej(signal.reason)));
  const c = createQlooClient({ apiKey: "k", fetchImpl: hang, timeoutMs: 20 });
  await assert.rejects(c.searchTags({ query: "x" }), (e) => e instanceof QlooError && e.status === 504);
});
test("identical calls hit fetch once", async () => { /* count === 1 after two awaits */ });
test("cacheMax evicts oldest", async () => { /* cacheMax 2; calls a,b,c then a again => fetch count 4 */ });
test("missing key throws QlooError 500 without calling fetch", async () => { /* apiKey: () => undefined */ });
test("sends X-Api-Key and uses baseUrl", async () => { /* assert url startsWith baseUrl, header === "k" */ });
```

- [ ] **Step 2: Run `node --test tests/qloo-client.test.js`.** Expected: FAIL (`createQlooClient is not a function`).
- [ ] **Step 3: Implement `createQlooClient` in `lib/qloo.js`.** Move the existing method bodies inside the factory; replace `fetch(url, init)` with `fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })`; map `TimeoutError`/`AbortError` to `new QlooError("Qloo request timed out", 504)`. Bound the cache by deleting the oldest `Map` key when `size > cacheMax`. Do not cache non-OK responses.
- [ ] **Step 4: Run `npm test`.** Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add lib/qloo.js tests/qloo-client.test.js
git commit -m "feat: qloo client factory with timeout and bounded cache"
```

---

### Task 4: One-line brief parser (fixes the README promise, wires age)

**Files:**
- Create: `lib/brief-parser.js`
- Modify: `lib/agent.js` (delete `pickAge`), `lib/llm.js` (export `chat`)
- Test: `tests/brief-parser.test.js`

**Interfaces:**
- Consumes: `chat(messages: {role, content}[], model?: string): Promise<string | null>` exported from `lib/llm.js`.
- Produces: `heuristicParse(text: string): BriefQuery`; `parseBrief(text: string, deps?: { complete?: (messages) => Promise<string | null> }): Promise<BriefQuery>` (never throws); `pickAge(text: string): string | undefined` (returns `undefined` when no age cue; the old silent "25_to_29,30_to_34" default is removed).

- [ ] **Step 1: Write the failing tests**

```js
test("heuristicParse extracts audience and tags", () => {
  const q = heuristicParse("Launch a skincare line to urban creatives who love indie music");
  assert.equal(q.audience, "urban creatives");
  assert.equal(q.tagQuery, "indie music");
  assert.equal(q.goal, "Launch a skincare line to urban creatives who love indie music");
});
test("parseBrief merges a valid LLM JSON reply and drops unknown keys", async () => {
  const complete = async () => '{"entityQuery":"Aesop","audience":"urban creatives","tagQuery":"minimalist","evil":"x"}';
  const q = await parseBrief("anything", { complete });
  assert.equal(q.entityQuery, "Aesop");
  assert.ok(!("evil" in q));
});
test("parseBrief falls back to heuristic when the LLM throws or returns non-JSON", async () => {
  const text = "Pitch a podcast to gen z gamers";
  assert.deepEqual(await parseBrief(text, { complete: async () => { throw new Error("429"); } }), heuristicParse(text));
  assert.deepEqual(await parseBrief(text, { complete: async () => "not json" }), heuristicParse(text));
});
test("age cue maps to a Qloo enum, no cue maps to undefined", () => {
  assert.equal(pickAge("pitch to gen z"), "24_and_younger");
  assert.equal(pickAge("sell boots to retirees"), undefined);
});
```

- [ ] **Step 2: Run `node --test tests/brief-parser.test.js`.** Expected: FAIL (module not found).
- [ ] **Step 3: Implement `lib/brief-parser.js`.** `parseBrief` asks the LLM for JSON-only output with exactly the keys `entityQuery, audience, tagQuery, location`, strips code fences, picks only those four string keys (each trimmed, max 80 chars), and sets `age` from `pickAge`. `heuristicParse`: audience is the text after `" to "` up to `" who "`/`" that "`/end; tags are the text after `love|loves|like|likes|follow|follows`; `entityQuery` is the first capitalised multi-letter token not at sentence start, else `""`.
- [ ] **Step 4: Run `npm test`.** Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add lib/brief-parser.js lib/agent.js lib/llm.js tests/brief-parser.test.js
git commit -m "feat: one-line brief parser; wire age cue"
```

---

### Task 5: Agent: parallel resolve, cross-domain fan-out, honest heatmap

**Files:**
- Modify: `lib/agent.js`
- Test: `tests/agent-fanout.test.js`

**Interfaces:**
- Consumes: `pickFilterType`, `complementaryTypes` (Task 2); `BriefQuery` (Task 4); caller shape = `{ search, searchTags, insights, heatmap }` (Task 3).
- Produces: `runTasteAgent(query: BriefQuery, opts?: { withHeatmap?: boolean, forceMock?: boolean, caller?: Caller, digest?: Function }): Promise<AgentResult>`. `briefContext.insights` stays the primary-type digest (so `lib/llm.js` and the page keep working); `briefContext.insightsByType[urn]` holds all digests. The extra `searchTags` preflight call is removed; a 401/403 from any step returns the existing `{ mock: true, error, steps: [] }` early result.

- [ ] **Step 1: Write the failing tests** (fake caller records `start`/`finish` events with `await setTimeout(10)` inside)

```js
test("entity, audience and tag resolves all start before any finishes", async () => {
  const { events } = await runWithFake();
  const firstFinish = events.findIndex((e) => e.startsWith("finish"));
  assert.ok(["start:search", "start:audiences", "start:tags"].every((s) => events.indexOf(s) < firstFinish));
});
test("insights fan out over three distinct types, primary first", async () => {
  const { calls } = await runWithFake({ goal: "Position a skincare brand" });
  assert.equal(new Set(calls.insights.map((c) => c.filterType)).size, 3);
  assert.equal(calls.insights[0].filterType, "urn:entity:brand");
});
test("a failing complementary type does not fail the run", async () => {
  const r = await runWithFake({ failTypes: ["urn:entity:place"] });
  assert.equal(r.result.errors.length, 1);
  assert.ok(r.result.briefContext.insightsByType["urn:entity:brand"]);
});
test("heatmap is skipped with an 'add a city' note when no location", async () => {
  const r = await runWithFake({ location: undefined });
  assert.match(r.result.steps.find((s) => s.name === "heatmapInsights").detail, /add a city/i);
  assert.equal(r.calls.heatmap.length, 0);
});
test("a hung Qloo step becomes ok:false, not a throw", async () => { /* caller.insights rejects QlooError 504 for primary => steps entry ok:false, result resolves */ });
```

- [ ] **Step 2: Run `node --test tests/agent-fanout.test.js`.** Expected: FAIL.
- [ ] **Step 3: Refactor `runTasteAgent`.** Run `resolveEntities`, `resolveAudience`, `resolveTags` through `Promise.all`; run `tasteInsights` once per type in `[primary, ...complementaryTypes(primary)]` through `Promise.allSettled`, recording each failure in `errors`; `heatmapInsights` runs only when `query.location` is set, otherwise returns `ok: true, detail: "Skipped: add a city to see where this audience concentrates"`. Remove the hardcoded `"Los Angeles"` fallback here and in `lib/qloo.js` `heatmap()`. Keep the retry loop (max 3, 400ms backoff) but cap total attempts per step by the client timeout from Task 3.
- [ ] **Step 4: Run `npm test`.** Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add lib/agent.js lib/qloo.js tests/agent-fanout.test.js
git commit -m "feat: parallel resolve, cross-domain fan-out, honest heatmap skip"
```

---

### Task 6: Replan ladder; no silent mock substitution

**Files:**
- Create: `lib/replan.js`
- Modify: `lib/agent.js` (remove the `liveButEmpty` mock re-run, lines ~328-388; add the ladder)
- Test: `tests/replan.test.js`, `tests/agent-replan.test.js`

**Interfaces:**
- Consumes: `Signal`, `runTasteAgent` (Task 5).
- Produces: `relaxationLadder(signal: Signal): { signal: Signal, note: string }[]`. Notes are exactly `"dropped audience signal"`, `"dropped tag signal"`, `"dropped age signal"`, in that order; each rung removes one more key; a signal with only `entities` yields `[]`. `AgentResult.relaxations: string[]` lists applied notes; `AgentResult.emptyReason?: string` is set when every rung returns zero entities. Mock data is used only when there is no key, `forceMock` is true, or auth fails (401/403).

- [ ] **Step 1: Write the failing tests**

```js
test("ladder drops audience, then tags, then age", () => {
  const rungs = relaxationLadder({ audiences: ["a"], tags: ["t"], age: "x", entities: ["e"] });
  assert.deepEqual(rungs.map((r) => r.note), ["dropped audience signal", "dropped tag signal", "dropped age signal"]);
  assert.deepEqual(rungs.at(-1).signal, { entities: ["e"] });
});
test("entities-only signal has no rungs", () => assert.deepEqual(relaxationLadder({ entities: ["e"] }), []));
// agent-replan
test("empty first call then non-empty without audience records the relaxation", async () => { /* result.relaxations deepEqual ["dropped audience signal"]; result.mock === false */ });
test("all rungs empty returns emptyReason and never calls the mock", async () => {
  /* spy mock caller not invoked; result.mock === false; result.briefContext.insights.entityCount === 0; typeof result.emptyReason === "string" */
});
```

- [ ] **Step 2: Run `node --test tests/replan.test.js tests/agent-replan.test.js`.** Expected: FAIL.
- [ ] **Step 3: Implement `relaxationLadder` and integrate.** After the primary-type `tasteInsights` returns zero entities, walk the ladder, re-calling `insights` per rung, stop at the first non-empty digest, and append a trace step named `replan` with the note. Delete the mock re-run block and its `mockReason` string.
- [ ] **Step 4: Run `npm test`.** Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add lib/replan.js lib/agent.js tests/replan.test.js tests/agent-replan.test.js
git commit -m "feat: adaptive replan ladder; remove silent mock fallback"
```

---

### Task 7: Citation audit and honest mock labels

**Files:**
- Create: `lib/citations.js`
- Modify: `lib/llm.js` (template uses `[Mock: ...]` when `digest.mode === "mock"`; grounded system prompt says to cite only names/tags/places present in the data)
- Test: `tests/citations.test.js`

**Interfaces:**
- Produces: `auditCitations(text: string, data: { names: string[], tags: string[], places: string[] }): { total: number, verified: number, unverified: string[] }`. A `[Qloo: body]` citation is verified if `body` contains (case-insensitive) any name, tag or place, or starts with `heatmap`, `geographic`, `insights` or `tag`.

- [ ] **Step 1: Write the failing tests**

```js
test("verified when the citation names a digest entity", () => {
  assert.deepEqual(auditCitations("Lead with Aesop [Qloo: Aesop, rank #1]", { names: ["Aesop"], tags: [], places: [] }),
    { total: 1, verified: 1, unverified: [] });
});
test("unverified when the citation names something absent", () => {
  const r = auditCitations("[Qloo: Zendaya]", { names: ["Aesop"], tags: [], places: [] });
  assert.deepEqual([r.total, r.verified, r.unverified], [1, 0, ["Zendaya"]]);
});
test("no citations means total 0", () => assert.equal(auditCitations("plain", { names: [], tags: [], places: [] }).total, 0));
test("mock-mode template never emits [Qloo:]", async () => {
  delete process.env.OPENAI_API_KEY;
  const out = await generateGrounded({ goal: "g", audience: "a" }, { insights: { mode: "mock", entities: [{ name: "Aesop" }], tags: [] }, heatmap: { entities: [] } }, {});
  assert.ok(!out.text.includes("[Qloo:") && out.text.includes("[Mock:"));
});
```

- [ ] **Step 2: Run `node --test tests/citations.test.js`.** Expected: FAIL.
- [ ] **Step 3: Implement `auditCitations` in `lib/citations.js`;** change the three template citation strings in `generateGrounded` to use a `cite = digest.mode === "mock" ? "Mock" : "Qloo"` prefix.
- [ ] **Step 4: Run `npm test`.** Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add lib/citations.js lib/llm.js tests/citations.test.js
git commit -m "feat: citation audit; label mock citations as Mock"
```

---

### Task 8: Validation, rate limit, thin route

**Files:**
- Create: `lib/validate.js`, `lib/rate-limit.js`, `lib/brief-handler.js`
- Modify: `app/api/brief/route.js` (becomes a wrapper)
- Test: `tests/validate.test.js`, `tests/rate-limit.test.js`, `tests/brief-handler.test.js`

**Interfaces:**
- Consumes: `parseBrief` (Task 4), `runTasteAgent` (Tasks 5-6), `generateBareLlm` / `generateGrounded` (existing), `auditCitations` (Task 7).
- Produces: `validateBriefInput(body: unknown): { ok: true, value: { brief?: string, goal?: string, brand?: string, audience?: string, tagQuery?: string, location?: string, withHeatmap: boolean } } | { ok: false, error: string }` with `MAX_FIELD_CHARS = 280` and `MAX_BRIEF_CHARS = 500`; `createRateLimiter({ max: number, windowMs: number, now?: () => number }): (key: string) => { allowed: boolean, retryAfterSec: number }`; `handleBriefRequest(req: Request, deps: { runAgent, generateBare, generateGrounded, parseBrief, limiter }): Promise<Response>`. Response JSON keeps today's fields and adds `relaxations`, `insightsByType`, `emptyReason`, `citationAudit`. Defaults: 10 requests / 60 s per first `x-forwarded-for` IP.

- [ ] **Step 1: Write the failing tests** (handler tests build `new Request("http://x/api/brief", { method: "POST", body })` with fake deps)

```js
test("invalid JSON returns 400 with a JSON error", async () => {
  const res = await handleBriefRequest(req("{nope"), deps());
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, "Invalid JSON body");
});
test("non-string field returns 400", async () => assert.equal((await handleBriefRequest(req(JSON.stringify({ goal: 123 })), deps())).status, 400));
test("field over 280 chars returns 400 naming the field", async () => { /* body.goal = "x".repeat(281); error matches /goal/ */ });
test("11th request from one IP in a minute returns 429 with Retry-After", async () => { /* loop 11; last status 429; headers.get("retry-after") is a positive integer string */ });
test("agent throwing returns 500 JSON without a stack", async () => { /* body.error === "Brief generation failed"; JSON.stringify(body) lacks "at " */ });
test("brief field triggers parseBrief once", async () => { /* spy count === 1 */ });
test("rejected key still returns 200 with mock:true and a 'rejected' note", async () => { /* agent returns { error } */ });
// rate-limit.test.js: window resets after windowMs using injected now()
```

- [ ] **Step 2: Run `node --test tests/validate.test.js tests/rate-limit.test.js tests/brief-handler.test.js`.** Expected: FAIL.
- [ ] **Step 3: Implement the three modules;** `route.js` becomes `export const runtime = "nodejs"; export const maxDuration = 60; export const POST = (req) => handleBriefRequest(req, defaultDeps);` with `defaultDeps` built from real modules. Handler wraps everything after validation in `try/catch` and never serialises `error.stack`.
- [ ] **Step 4: Run `npm test && npm run lint`.** Expected: PASS, exit 0.
- [ ] **Step 5: Commit**

```bash
git add lib/validate.js lib/rate-limit.js lib/brief-handler.js app/api/brief/route.js tests/
git commit -m "feat: validated, rate-limited brief handler; thin route"
```

---

### Task 9: UI: single brief box, correct badges, cross-domain panel

**Files:**
- Create: `lib/ui-state.js`
- Modify: `app/page.js`, `app/globals.css` (only for new classes)
- Test: `tests/ui-state.test.js`

**Interfaces:**
- Consumes: response shape from Task 8.
- Produces: `qlooBadge(res: object | null): { kind: "idle" | "live" | "mock" | "empty", label: string }` and `llmBadge(res: object | null): { kind: "idle" | "live" | "mock", label: string }`. CSS class mapping: `live` is green, `mock` is amber, `empty` is red, `idle` is neutral.

- [ ] **Step 1: Write the failing tests**

```js
test("null response is idle", () => assert.deepEqual(qlooBadge(null), { kind: "idle", label: "Qloo: idle" }));
test("live data is green", () => assert.deepEqual(qlooBadge({ qlooLive: true, mock: false }), { kind: "live", label: "Qloo: live" }));
test("mock is amber and disclosed", () => assert.deepEqual(qlooBadge({ qlooLive: false, mock: true }), { kind: "mock", label: "Qloo: disclosed mock" }));
test("live but empty is its own state", () => assert.equal(qlooBadge({ qlooLive: true, mock: false, emptyReason: "x" }).kind, "empty"));
test("template LLM is mock, openai is live", () => {
  assert.equal(llmBadge({ llmLive: false }).kind, "mock");
  assert.equal(llmBadge({ llmLive: true }).kind, "live");
});
```

- [ ] **Step 2: Run `node --test tests/ui-state.test.js`.** Expected: FAIL.
- [ ] **Step 3: Implement `lib/ui-state.js`;** in `app/page.js` replace the three hardcoded `kind="mock"` badges with the helpers; replace the four-field form with one "Describe your brief" textarea that posts `{ brief }`, plus a `<details>` "Fine-tune" holding the four fields (override values are posted only when non-empty); render `relaxations` as trace lines; render `insightsByType` as three columns titled by entity type; show "N of M citations verified against Qloo data" from `citationAudit`; show an empty-state card with `emptyReason` and example briefs; hide the heatmap block when its step detail starts with `Skipped`.
- [ ] **Step 4: Run `npm test && npm run lint && npm run build`.** Expected: all exit 0. Then `npm run dev` and in the browser confirm: preset briefs show a green Qloo badge with a live key; "Sell hiking boots to retirees" shows relaxation lines or the empty-state card, never jazz artists.
- [ ] **Step 5: Commit**

```bash
git add lib/ui-state.js app/page.js app/globals.css tests/ui-state.test.js
git commit -m "feat: single-box brief UI, correct badges, cross-domain panel"
```

---

### Task 10: Live verification, README, submission gate

**Files:**
- Create: `scripts/smoke-live.mjs`, `docs/devpost-submission.md`
- Modify: `README.md`

**Interfaces:**
- Produces: `node scripts/smoke-live.mjs --types` (needs `QLOO_API_KEY`): for each URN in `ENTITY_TYPES`, calls `/v2/insights` with `take=1` plus one resolved tag and prints `urn -> HTTP status`; exits 1 if any status is 400. `node scripts/smoke-live.mjs --url <deployed-origin>`: POSTs the three presets plus "Sell hiking boots to retirees" to `/api/brief`; exits 1 unless every preset returns 200, `qlooLive === true`, `briefContext.insights.entityCount > 0`, and the hiking-boots brief returns either `relaxations.length > 0` or a string `emptyReason` with `mock === false`.

- [ ] **Step 1: Write `scripts/smoke-live.mjs` as specified above** (the script is the test).
- [ ] **Step 2: Run `QLOO_API_KEY=... node scripts/smoke-live.mjs --types`.** Expected: a status line per type. If `urn:entity:videogame` or any other URN prints 400, fix `ENTITY_TYPES` in `lib/entity-types.js` and update the Task 2 test, then re-run until exit 0. This settles finding F10.
- [ ] **Step 3: Update `README.md`** so every claim matches the code: endpoints actually called (`/search`, `/v2/audiences`, `/v2/tags`, `/v2/insights`, heatmap via `filter.type=urn:heatmap`), live demo URL, parallel resolve, cross-domain fan-out, replan ladder, citation audit, rate limit, the exact mock/template fallback conditions, and an env table. Write `docs/devpost-submission.md` (project description for the Devpost text field: problem, who it is for, what makes it Qloo-powered, the "Qloo test" before/after, what is live vs mock).
- [ ] **Step 4: Deploy and verify.** Run `npx vercel deploy --prod`, confirm `QLOO_API_KEY`, `OPENAI_API_KEY`, `LLM_MODEL` are set in the Vercel dashboard, then run `node scripts/smoke-live.mjs --url https://<your-app>.vercel.app`. Expected: exit 0.
- [ ] **Step 5: Submission checklist, then commit**
  - Repo is public; GitHub About sidebar shows the MIT license.
  - Demo URL opens in a private window without login.
  - Devpost fields filled: demo link, repo URL, description text.
  - Submitted by Oct 30 evening IST (leaves roughly 12 hours before the EDT deadline).

```bash
git add scripts/smoke-live.mjs docs/devpost-submission.md README.md
git commit -m "docs: live smoke script, README accuracy pass, devpost text"
```

---

## Self-Review

1. **Spec coverage:** the five submission items map to Task 10; the "Qloo test" to Tasks 5, 6, 7; the four judging criteria map as Implementation (3, 5, 6, 8), Design (9), Impact (4, 9, 10), Idea (5, 7). F1-F12 each point to a task. No gaps found.
2. **Step scan:** test steps carry names and assertions; code steps carry signature, file, and pinned values; bodies appear nowhere except where a test is the specification. Task 3 tests 2-5 and Task 8 tests 3-7 are listed as assertion comments by design and must be written out by the implementer from that line.
3. **Type consistency:** `BriefQuery`, `Signal`, `Digest`, `AgentResult` are defined once above; `pickFilterType` / `complementaryTypes` (Task 2), `createQlooClient` (Task 3), `parseBrief` / `pickAge` (Task 4), `runTasteAgent` (Tasks 5-6), `auditCitations` (Task 7), `handleBriefRequest` (Task 8), `qlooBadge` / `llmBadge` (Task 9) are used under those exact names throughout.
4. **Review Focus:** all five lines are pinned to an owning task above.
5. **Proportion:** the plan is a few times the length of the README, but over 90% is signatures, test names, and assertions rather than function bodies.

## Cut list (do NOT build before submission)

Human-readable heatmap place names (geohash to city), streaming agent trace, MCP server endpoint, user accounts, saved briefs, additional entity types beyond the registry, i18n. Revisit after the deadline or only if every task above is green with a day to spare.
