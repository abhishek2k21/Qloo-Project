# TasteBrief — a Qloo-grounded taste-gap agent

> Entry for the **Qloo Agentic Hackathon** ("Agents, but with taste").
> Demo URL: (set before submitting) · Repo:
> https://github.com/abhishek2k21/Qloo-Project

TasteBrief turns a one-line brief ("launch a skincare line to urban
creatives who love indie music") into a **taste brief** a creative team can
actually use: the affinities that audience clusters around, *where* they are
geographically, and messaging angles grounded in real cultural data — shown
side-by-side against what a bare LLM would say **without** Qloo.

The core claim: **if you remove Qloo, the product stops working.** That's the
"Qloo test."

## Who it's for

Brand managers, creative directors, and marketing strategists who need to
reach a specific audience but are guessing at what that audience actually
resonates with.

## The Qloo endpoints we use

| Endpoint | Why |
| --- | --- |
| `GET /search` | Resolve the entity named in the brief (e.g. "Miles Davis") to a Qloo entity ID + its tags. |
| `GET /v2/audiences` | Resolve the audience phrase ("indie music") to the Qloo audience URNs accepted by `signal.demographics.audiences`. |
| `GET /v2/tags` | Resolve interest keywords ("indie", "minimalist") to tag URNs accepted by `signal.interests.tags` / `filter.tags`. |
| `GET /v2/insights` | The heart of the product. `filter.type` (artist / brand / movie / place …) plus demographic + interest signals → ranked entities by affinity for *this* audience. |
| `GET /v2/insights?filter.type=urn:heatmap` | Same endpoint with `filter.type=urn:heatmap` → geographic affinity, so the brief can say *where* the audience concentrates. |

The agent resolves everything to **real URIs** first, then calls insights.
No free-text guessing.

## How the agent works (hardened)

1. **Parse** — the freeform brief is parsed into goal / audience / tags /
   location / age.
2. **Parallel resolve** — entity, audience, and tag resolution run in
   parallel, so no step waits on another.
3. **Cross-domain fan-out** — taste insights run once for the primary entity
   type and once each for two complementary types, collected into
   `insightsByType`. A failure in one type never fails the whole run.
4. **Replan ladder** — if the primary type returns zero entities, the agent
   relaxes its signal one rung at a time — dropped audience, dropped tag,
   dropped age — instead of silently swapping to mock data. The applied
   relaxations (or an `emptyReason`) are reported honestly.
5. **Honest heatmap** — the heatmap only runs when the brief supplies a city;
   no silent "Los Angeles" default.
6. **Citation audit** — grounded answers are checked: `[Qloo: …]` /
   `[Mock: …]` citations are traced back to the digest; unverified claims are
   flagged.
7. **Validation + rate limit** — the API route validates the body
   (≤280 chars per field, ≤500 for the brief) and rate-limits 10 req / 60 s
   per client IP, returning structured JSON errors (400/429) and never a raw
   500 stack.

## The "before / after" panel

Every run produces two answers to the *same* brief:

1. **Bare LLM** — an LLM with only parametric knowledge, no taste data.
   Deliberately generic.
2. **Qloo-grounded** — the same LLM with the compact Qloo digest in context,
   citing `[Qloo: …]` evidence.

The gap between the two *is* the product. That gap is cultural intelligence.

## Architecture

```
lib/qloo.js          Qloo client (server-side key, /search /v2/audiences
                    /v2/tags /v2/insights + urn:heatmap), per-request
                    timeout, bounded retries, LRU cache
lib/mock-qloo.js     Deterministic fallback when the key is absent or a call
                    fails — same response shape, fully disclosed in the UI
lib/entity-types.js  Entity-type registry + goal routing to filter.type URNs
lib/brief-parser.js  Freeform brief → goal / audience / location / tags / age
lib/replan.js        Signal relaxation ladder (dropped audience / tag / age)
lib/citations.js     Citation audit: verify [Qloo:]/[Mock:] against digest
lib/validate.js      Request-body validation (280-char fields, 500-char brief)
lib/rate-limit.js    Sliding-window rate limiter (10 req / 60 s per IP)
lib/brief-handler.js Thin handler: validate → rate limit → agent → LLM → audit
lib/llm.js           Bare + grounded generation (OpenAI or template fallback)
lib/ui-state.js      qlooBadge / llmBadge for the UI
app/api/brief        Thin route → handleBriefRequest (never leaks a stack)
app/page.js          Single "Describe your brief" box + Fine-tune overrides
```

## Run it locally

```bash
npm install
npm run dev            # http://localhost:3000
npm test               # node:test suite
npm run lint           # ESLint 9
npm run build          # Next.js production build
```

### Environment (optional but recommended)

Copy nothing to the repo — these are **server-only** secrets:

| Var | Purpose | Required? |
| --- | --- | --- |
| `QLOO_API_KEY` | Qloo hackathon key (server-side only; base `https://hackathon.api.qloo.com`) | No — disclosed mock without it |
| `OPENAI_API_KEY` | Live LLM for both panels | No — template fallback without it |
| `LLM_MODEL` | Chat model override (default gpt-4o-mini) | No |
| `QLOO_BASE_URL` | Qloo base URL override | No |

```bash
# .env.local (never committed)
QLOO_API_KEY=your-qloo-hackathon-key
OPENAI_API_KEY=your-openai-key
LLM_MODEL=gpt-4o-mini
```

- **No `QLOO_API_KEY`** → the app runs in *disclosed mock* mode (amber badge in
  the UI says so). The agent loop, UI, and before/after panel all still work.
- **No `OPENAI_API_KEY`** → deterministic template text renders instead.

Both fallbacks are disclosed in the UI and here, per the hackathon rules.

## Live smoke test

```bash
# Against the live Qloo API (needs QLOO_API_KEY):
QLOO_API_KEY=... node scripts/smoke-live.mjs --types

# Against a deployed origin:
node scripts/smoke-live.mjs --url https://<your-app>.vercel.app
```

See Task 10 in `2026-10-28-tastebrief-submission-hardening.md`.

## Deploy

```bash
npm run build
npx vercel deploy --prod
```

Set the two env vars above in the Vercel project dashboard. The app is
static-hostable; the API route runs on Node.

## Repo hygiene

- MIT `LICENSE` (visible in the repo root).
- No Qloo response data and no API keys are committed (`.gitignore` covers
  `.env`).
- The mock backend is hand-authored fixtures, clearly labelled as such.
