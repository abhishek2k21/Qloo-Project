/**
 * The /api/brief request handler.
 *
 * Thin, dependency-injected, and testable: `handleBriefRequest(req, deps)`
 * does validation -> rate limit -> agent -> LLM -> citation audit, and
 * NEVER serialises a stack trace into the JSON response (the contract:
 * the API never 500s with a crash; it returns structured JSON errors).
 *
 * deps: {
 *   runAgent: (query, opts) => Promise<AgentResult>
 *   generateBare: (query) => Promise<{ source, text }>
 *   generateGrounded: (query, briefContext) => Promise<{ source, text, data? }>
 *   parseBrief: (brief: string) => { goal, audience, location, tags, age?, brand? }
 *   auditCitations: (text, data) => { total, verified, unverified }
 *   limiter: (key: string) => { allowed, retryAfterSec }
 * }
 */

import { validateBriefInput } from "./validate.js";
import { hasQlooKey } from "./qloo.js";
import { hasLlm } from "./llm.js";

function clientIp(req) {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

/**
 * @param {Request} req
 * @param {object} deps
 * @returns {Promise<Response>}
 */
export async function handleBriefRequest(req, deps) {
  let body;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  const validation = validateBriefInput(body);
  if (!validation.ok) {
    return jsonError(400, validation.error);
  }
  const input = validation.value;

  // Rate limit on the first x-forwarded-for IP.
  const limitResult = deps.limiter(clientIp(req));
  if (!limitResult.allowed) {
    return new Response(
      JSON.stringify({ error: "Too many requests" }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(limitResult.retryAfterSec),
        },
      }
    );
  }

  // If a freeform `brief` was supplied, run it through parseBrief once to
  // extract structured fields, then merge with any explicit overrides.
  const query = {
    goal: input.goal || "",
    brand: input.brand || "",
    entityQuery: (input.brand || input.goal || input.brief || "").trim(),
    audience: input.audience || "",
    tagQuery: input.tagQuery || "",
    location: input.location || undefined,
  };

  if (input.brief) {
    const parsed = deps.parseBrief(input.brief);
    if (!query.goal) query.goal = parsed.goal || "";
    if (!query.audience) query.audience = parsed.audience || "";
    if (!query.location) query.location = parsed.location || undefined;
    if (!query.tagQuery) query.tagQuery = parsed.tags.join(", ");
    if (!query.brand) query.brand = parsed.brand || "";
  }

  if (!query.goal && !query.tagQuery) {
    return jsonError(400, "Provide a goal or interest keywords.");
  }

  try {
    const agent = await deps.runAgent(query, {
      withHeatmap: input.withHeatmap,
      forceMock: input.forceMock,
    });

    // Hard auth failure: run disclosed mock so the demo never goes dark.
    if (agent.error) {
      const mockRun = await deps.runAgent(query, {
        withHeatmap: input.withHeatmap,
        forceMock: true,
      });
      const [bare, grounded] = await Promise.all([
        deps.generateBare(query),
        deps.generateGrounded(query, mockRun.briefContext),
      ]);
      const data = extractAuditData(mockRun.briefContext);
      return NextResponse({
        ...mockRun,
        mock: true,
        modeNote: "Live Qloo key rejected; served by disclosed mock Qloo backend.",
        bareLlm: bare,
        groundedLlm: grounded,
        citationAudit: deps.auditCitations(grounded.text || "", data),
        llmLive: hasLlm(),
        qlooLive: false,
        qlooKeyConfigured: hasQlooKey(),
      });
    }

    const [bare, grounded] = await Promise.all([
      deps.generateBare(query),
      deps.generateGrounded(query, agent.briefContext),
    ]);
    const data = extractAuditData(agent.briefContext);

    return NextResponse({
      mock: agent.mock,
      mockReason: agent.mockReason || null,
      steps: agent.steps,
      errors: agent.errors,
      briefContext: agent.briefContext,
      relaxations: agent.relaxations || [],
      emptyReason: agent.emptyReason || null,
      signalSummary: agent.signalSummary,
      bareLlm: bare,
      groundedLlm: grounded,
      citationAudit: deps.auditCitations(grounded.text || "", data),
      llmLive: hasLlm(),
      qlooLive: !agent.mock && hasQlooKey(),
      qlooKeyConfigured: hasQlooKey(),
      modeNote:
        agent.mock && agent.mockReason
          ? agent.mockReason
          : agent.mock && hasQlooKey()
          ? "Qloo calls failed at runtime; served by disclosed mock backend."
          : agent.mock
          ? "No QLOO_API_KEY configured; served by disclosed mock Qloo backend."
          : "Live Qloo data.",
    });
  } catch (e) {
    // The error contract: never leak a stack trace, always structured JSON.
    return NextResponse({
      error: "Brief generation failed",
      detail: String(e?.message || e),
    }, 500);
  }
}

/** Build a JSON error Response. */
function jsonError(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Build a JSON success Response (mirrors NextResponse.json but plain). */
function NextResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Pull the names/tags/places the citation audit checks against. */
function extractAuditData(briefContext) {
  const names = (briefContext?.insights?.entities || [])
    .map((e) => e.name)
    .filter(Boolean);
  const tags = (briefContext?.insights?.tags || [])
    .map((t) => t.name || t)
    .filter(Boolean);
  const places = (briefContext?.heatmap?.entities || [])
    .map((e) => e.name)
    .filter(Boolean);
  return { names, tags, places };
}
