# TasteBrief — a Qloo-grounded taste-gap agent

> Entry for the **Qloo Agentic Hackathon** ("Agents, but with taste").

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
                    /v2/tags /v2/insights + urn:heatmap), 10-min cache
lib/mock-qloo.js     Deterministic fallback when the key is absent or a call
                    fails — same response shape, fully disclosed in the UI
lib/agent.js         The agent loop: a plan of 5 tool steps (resolve
                    entities → audience → tags → insights → heatmap),
                    executed with bounded retries. Identical loop runs
                    live or in mock mode.
lib/llm.js           Generates BOTH the bare answer and the grounded answer
                    (OpenAI when OPENAI_API_KEY is set, deterministic
                    templates otherwise, so the demo never dies).
app/api/brief        POST endpoint the UI calls; runs the agent, then both
                    LLM generations, and returns everything + mode flags.
app/page.js          The single polished UI flow.
```

## Run it locally

```bash
npm install
npm run dev            # http://localhost:3000
```

### Environment (optional but recommended)

Copy nothing to the repo — these are **server-only** secrets:

```bash
# .env.local (never committed)
QLOO_API_KEY=your-qloo-hackathon-key     # live Qloo data
OPENAI_API_KEY=your-openai-key           # live LLM (both panels)
LLM_MODEL=gpt-4o-mini                    # optional
QLOO_BASE_URL=https://hackathon.api.qloo.com   # optional override
```

- **No `QLOO_API_KEY`** → the app runs in *disclosed mock* mode (badge in the
  UI says so). The agent loop, UI, and before/after panel all still work.
- **No `OPENAI_API_KEY`** → deterministic template text renders instead.

Both fallbacks are disclosed in the UI and here, per the hackathon rules.

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
