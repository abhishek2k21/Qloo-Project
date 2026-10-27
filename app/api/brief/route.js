import { NextResponse } from "next/server";
import { runTasteAgent } from "@/lib/agent";
import { generateBareLlm, generateGrounded, hasLlm } from "@/lib/llm";
import { hasQlooKey } from "@/lib/qloo";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/brief
 * Body: {
 *   goal:        string   — the brief objective (drives filter.type + age)
 *   brand:       string   — the brand/artist/place name
 *   audience:    string   — audience phrase (resolved via /v2/audiences)
 *   tagQuery:    string   — interest keywords (resolved via /v2/tags)
 *   location?:    string   — optional locality for signal.location.query
 *   withHeatmap?: boolean
 *   forceMock?:   boolean  — force mock Qloo for a clean before/after demo
 * }
 *
 * Runs the agent loop (Qloo live when QLOO_API_KEY is set, disclosed mock
 * otherwise), then generates BOTH the bare-LLM answer and the
 * Qloo-grounded answer so the UI can render the side-by-side panel.
 */
export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const query = {
    goal: (body.goal || "").trim(),
    brand: (body.brand || "").trim(),
    audience: (body.audience || "").trim(),
    tagQuery: (body.tagQuery || "").trim(),
    location: (body.location || "").trim() || undefined,
  };

  if (!query.goal && !query.tagQuery) {
    return NextResponse.json(
      { error: "Provide a goal or interest keywords." },
      { status: 400 }
    );
  }

  const withHeatmap = body.withHeatmap !== false;
  const forceMock = Boolean(body.forceMock);

  const agent = await runTasteAgent(query, {
    withHeatmap,
    forceMock,
  });

  if (agent.error) {
    // Hard auth failure: run fully in disclosed mock mode instead of
    // returning an error, so the demo never goes dark.
    const mockRun = await runTasteAgent(query, {
      withHeatmap,
      forceMock: true,
    });
    const [bare, grounded] = await Promise.all([
      generateBareLlm(query),
      generateGrounded(query, mockRun.briefContext, mockRun.signalSummary),
    ]);
    return NextResponse.json({
      ...mockRun,
      mock: true,
      modeNote:
        "Live Qloo key rejected; served by disclosed mock Qloo backend.",
      bareLlm: bare,
      groundedLlm: grounded,
      llmLive: hasLlm(),
      qlooLive: false,
      qlooKeyConfigured: hasQlooKey(),
    });
  }

  const [bare, grounded] = await Promise.all([
    generateBareLlm(query),
    generateGrounded(query, agent.briefContext, agent.signalSummary),
  ]);

  return NextResponse.json({
    mock: agent.mock,
    mockReason: agent.mockReason || null,
    steps: agent.steps,
    errors: agent.errors,
    briefContext: agent.briefContext,
    signalSummary: agent.signalSummary,
    bareLlm: bare,
    groundedLlm: grounded,
    llmLive: hasLlm(),
    // qlooLive is true only when we ran live AND got real data. When the
    // live call was empty the agent flips to mock, so this is honest.
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
}
