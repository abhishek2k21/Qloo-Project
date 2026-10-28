# TasteBrief — Devpost submission text

## Problem

Brand managers, creative directors, and strategists need to reach a specific
audience, but they're guessing at what that audience actually resonates with.
Most creative tools give you generic demographic personas — "urban creatives,
25-34" — with no cultural grounding. There's no fast way to answer: *which
artists, brands, and places does this specific audience cluster around, where
are they concentrated geographically, and what messaging will land?*

## Who it's for

Brand managers, creative directors, marketing strategists, and agency
planners who need to brief creative work against real cultural taste data
rather than gut feel.

## What makes it Qloo-powered

TasteBrief is built directly on Qloo's taste graph (250M+ entities across
music, film, dining, fashion, travel). It is not a wrapper around a generic
LLM:

1. It parses a freeform brief into a goal, audience, interest keywords, and
   optional city.
2. It resolves each to **real Qloo URIs** — entity via `/search`, audience via
   `/v2/audiences`, tags via `/v2/tags`.
3. It calls Qloo `/v2/insights` with `filter.type` (artist / brand / movie /
   place …) plus the resolved demographic and interest signals, fanning out
   across the primary entity type and two complementary types in parallel for
   a cross-domain taste profile.
4. Optionally it calls the same `/v2/insights` endpoint with
   `filter.type=urn:heatmap` for geographic affinity — where the audience
   concentrates.
5. It renders a **before / after panel**: a bare LLM answer (parametric
   knowledge only) side-by-side with a Qloo-grounded answer that cites
   `[Qloo: …]` evidence.

The core claim — **if you remove Qloo, the product stops working** — is the
"Qloo test." The grounded panel changes completely when Qloo data is removed;
the bare panel stays generic.

## The Qloo test — before / after

- **Without Qloo:** A brief like "Sell hiking boots to retirees in Denver"
  returns generic lifestyle advice, or worse, unrelated mock entities with no
  tie to the audience.
- **With Qloo:** the agent resolves the audience, tags, and location to Qloo
  URIs, calls `/v2/insights`, and returns affinities, geographic hotspots, and
  messaging angles actually tied to that audience. If the first signal set
  comes back empty, the agent *relaxes* its signal (drops audience, then tags,
  then age) instead of silently fabricating mock data — and reports exactly
  what was relaxed, or an honest `emptyReason`.

Every fallback (no QLOO_API_KEY → disclosed mock; no OPENAI_API_KEY →
deterministic template) is disclosed in the UI and documented here, per the
hackathon rules.

## Live vs mock

- **Live Qloo:** when `QLOO_API_KEY` is set, calls hit
  `https://hackathon.api.qloo.com` server-side and the UI shows a green
  `Qloo: live` badge. The key never reaches the browser.
- **Disclosed mock:** when no key is configured (or a key is rejected 401/403),
  the agent runs against a hand-authored mock backend and the UI shows an
  amber `Qloo: disclosed mock` badge. Mock data is never presented as live.

## Endpoints called

| Endpoint | Purpose |
|---|---|
| `GET /search` | Resolve the named entity to a Qloo entity ID + tags |
| `GET /v2/audiences` | Resolve an audience phrase to audience URNs |
| `GET /v2/tags` | Resolve interest keywords to tag URNs |
| `GET /v2/insights` | Ranked entities by affinity for this audience |
| `GET /v2/insights?filter.type=urn:heatmap` | Geographic affinity / hotspots |

## Submission links

- Demo URL: (set before submitting)
- Repo URL: https://github.com/abhishek2k21/Qloo-Project
