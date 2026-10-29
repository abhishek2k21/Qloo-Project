import { handleBriefRequest } from "@/lib/brief-handler";
import { runTasteAgent } from "@/lib/agent";
import { generateBareLlm, generateGrounded, llmParseComplete, hasLlm } from "@/lib/llm";
import { parseBrief, parseBriefWithLlm } from "@/lib/brief-parser";
import { auditCitations } from "@/lib/citations";
import { createRateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

// 10 requests / 60 s per client IP (first x-forwarded-for hop).
const limiter = createRateLimiter({ max: 10, windowMs: 60000 });

// Use the LLM-backed parse when a key is configured; otherwise the same
// heuristic path (parseBriefWithLlm with no `complete` is the heuristic).
const parseBriefDep = hasLlm()
  ? (brief) => parseBriefWithLlm(brief, llmParseComplete)
  : (brief) => parseBrief(brief);

const deps = {
  runAgent: runTasteAgent,
  generateBare: generateBareLlm,
  generateGrounded,
  parseBrief: parseBriefDep,
  auditCitations,
  limiter,
};

export const POST = (req) => handleBriefRequest(req, deps);

