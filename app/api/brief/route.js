import { handleBriefRequest } from "@/lib/brief-handler";
import { runTasteAgent } from "@/lib/agent";
import { generateBareLlm, generateGrounded } from "@/lib/llm";
import { parseBrief } from "@/lib/brief-parser";
import { auditCitations } from "@/lib/citations";
import { createRateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

// 10 requests / 60 s per client IP (first x-forwarded-for hop).
const limiter = createRateLimiter({ max: 10, windowMs: 60000 });

const deps = {
  runAgent: runTasteAgent,
  generateBare: generateBareLlm,
  generateGrounded,
  parseBrief,
  auditCitations,
  limiter,
};

export const POST = (req) => handleBriefRequest(req, deps);

