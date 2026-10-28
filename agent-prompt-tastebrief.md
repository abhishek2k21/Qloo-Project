# Agent prompt: finish TasteBrief for the Qloo Agentic Hackathon

Paste everything below the line into your coding agent. Before you do, copy `docs/superpowers/plans/2026-10-28-tastebrief-submission-hardening.md` into the repo at the same path, because the prompt refers to it.

---

You are the sole engineer finishing **TasteBrief**, a Next.js 15 (App Router, JavaScript ESM) entry for the Qloo Agentic Hackathon. Hard deadline: **Oct 30, 2026, 11:45pm EDT** (Oct 31, 09:15 IST). Internal target: submitted by Oct 30 evening IST. You have about one working day, so correctness and honesty beat features.

## Read first, in this order
1. `docs/superpowers/plans/2026-10-28-tastebrief-submission-hardening.md`. This is the plan. It has 10 tasks, shared types, a findings table with file and line evidence, a Review Focus list, and a cut list.
2. `README.md`, then every file in `lib/`, `app/api/brief/route.js`, `app/page.js`.
3. Run `git log --oneline` and `git status`. The code has changed since the plan was written if anything differs from the plan's line references. Trust the current code, adapt the plan, and note each adaptation in your final report.

## What success means
Judges (Qloo's CTO, an investor, a Live Nation executive, a media owner) will open the live demo and type their own brief. They score: Technological Implementation, Design, Potential Impact, Quality of the Idea. The rule that matters most: "If your submission would work the same without Qloo, you're building the wrong thing." So:
- Never show fake or unrelated data as if it were an answer. An unknown brief gets a relaxed result with the relaxation shown, or an honest "no matches" state.
- Everything on screen that says "live" must be live Qloo data. Fallbacks are always labelled.

## Workflow rules (strict)
- Work task by task in the plan's priority order below. For each task: write the failing test, run it and see it fail, implement the minimum, run it and see it pass, run `npm test && npm run lint`, commit with a conventional message (`feat:`, `fix:`, `chore:`, `docs:`). One task per commit or more, never one giant commit.
- Do not move to the next task while `npm test` or `npm run lint` is red.
- Priority order (do these first, in this order): Task 6, Task 5, Task 4, Task 9, Task 3, Task 7, Task 10. Then do Tasks 1, 2, 8 at the minimum the plan states (tests, routing fixes, input limits, rate limit). Tasks 1 and 3 may be done first if you need the test harness and timeouts for the others; the dependency notes in the plan's Interfaces blocks decide.
- Do not build anything in the plan's **Cut list**.

## Coding rules
- ESM only, Node >= 18, plain JavaScript (no TypeScript migration).
- No new runtime dependencies. Dev dependencies only for ESLint as specified. Tests use `node:test`.
- One responsibility per file. Keep route files thin; logic lives in `lib/`. `lib/` imports are relative and end in `.js`.
- Inject dependencies (fetch, callers, clock) so tests use fakes. Tests never touch the network.
- Use the exact names, signatures and shared types from the plan. If you must change one, change it everywhere and record it in your report.
- Never log or return secrets, stack traces, or raw Qloo payloads to the browser. Keys stay server-side. Never commit `.env*` or real Qloo response data.
- Delete dead code you touch (for example the unused `pickAge` default, unused `brandQuery`).

## Things you must verify, not assume
1. **Video-game entity URN.** The repo has `urn:entity:video_game`; one third-party README says the hackathon API wants `urn:entity:videogame`. Neither is confirmed. Before finalizing Task 2's test, probe the live API with the key (the human will have set `QLOO_API_KEY` in `.env.local`):
   ```bash
   curl -s -H "X-Api-Key: $QLOO_API_KEY" "https://hackathon.api.qloo.com/v2/insights?filter.type=urn:entity:video_game&take=1" -o /dev/null -w "%{http_code}\n"
   curl -s -H "X-Api-Key: $QLOO_API_KEY" "https://hackathon.api.qloo.com/v2/insights?filter.type=urn:entity:videogame&take=1" -o /dev/null -w "%{http_code}\n"
   ```
   A 400 can also mean a required signal is missing. If both 400, add a resolved tag via `signal.interests.tags` and compare again. Use whichever spelling works, and write the registry and the test from that evidence. If you cannot reach the API, keep the current spelling, mark it unverified in the report, and do not claim otherwise.
2. **Heatmap behavior.** The API needs a location for heatmaps. With no city, skip the heatmap and say so in the trace; never default to a city.
3. **Every claim in the README and Devpost text** must match the code and a run you actually did.

## Definition of done
- `npm test`, `npm run lint`, `npm run build` all exit 0.
- `node scripts/smoke-live.mjs --types` exits 0 with the real key.
- Deployed to Vercel (`npx vercel deploy --prod`), env vars `QLOO_API_KEY`, `OPENAI_API_KEY`, `LLM_MODEL` set, and `node scripts/smoke-live.mjs --url <deployed-origin>` exits 0.
- In a browser, with a private window and no login: the three presets show a live Qloo badge; the brief "Sell hiking boots to retirees" shows relaxation lines or an empty-state card and never unrelated entities; a malformed request returns a JSON error.
- README and `docs/devpost-submission.md` state plainly what is live and what is mock or template.
- Repo is public with the MIT license visible in the GitHub About sidebar.

## Stop and ask the human when
- A live probe contradicts the plan in a way that changes an interface.
- You would need a new runtime dependency, a new Qloo endpoint, or to cut a priority task.
- The key is missing, rejected, or rate-limited, so you cannot complete a live verification.

## Final report format
1. Tasks completed (with commit hashes) and tasks skipped, with the reason.
2. Adaptations you made to the plan and why.
3. Verification output: the pass/fail status of each Definition-of-done item, with the real command output for the smoke scripts.
4. Anything unverified or risky, stated plainly.
5. The deployed URL.
