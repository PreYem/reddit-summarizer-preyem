import { Router, Request, Response } from "express";
import { summarize as AnthropicSummarizer } from "../services/claude-ai-prompt";
import { summarize as GeminiSummarizer } from "../services/gemini-ai-prompt";
import { summarize as GroqSummarizer } from "../services/groq-ai-prompt";
import type { SummarizeRequest, SummarizeResponse } from "../types";
import { setProvider, setRequestLanguage } from "../services/requestLog";
import { sanitizeLang } from "../services/languages";

const router = Router();

export function debugModeEnabled(): boolean {
  return process.env.DEBUG_MODE === "true";
}

// Static canned response so local testing doesn't burn API tokens - PreYem
function debugResponse(payload: SummarizeRequest): SummarizeResponse {
  const debugLanguage = payload.language ?? "en";
  return {
    aiModel: "debug-static",
    subredditDescription: `r/${payload.currentSubreddit} is a test subreddit used in debug mode [${debugLanguage}].`,
    post: `[DEBUG:${debugLanguage}] ${payload.title} - static placeholder body for ${payload.author}.`,
    community: `[DEBUG:${debugLanguage}] Static community summary: top comments would normally be summarized here.`,
    communityReaction: "Mixed",
    communityReactionBreakdown: `[DEBUG:${debugLanguage}] Static breakdown text for the reaction section.`,
  };
}

const MAX_BODY_LENGTH = 8_000;
const MAX_COMMENT_LENGTH = 500;
const MAX_COMMENTS = 100;

type SummarizerFn = (input: SummarizeRequest) => Promise<SummarizeResponse>;

// Order = priority. First one wins if it succeeds - PreYem
const PROVIDERS: { name: string; fn: SummarizerFn }[] = [
  { name: "groq", fn: GroqSummarizer },
  { name: "google", fn: GeminiSummarizer },
  { name: "anthropic", fn: AnthropicSummarizer },
];

router.post("/", async (request: Request, response: Response) => {
  const incoming = request.body as SummarizeRequest;
  const { title, body, comments, currentSubreddit, author } = incoming;

  if (!title || typeof title !== "string") {
    response.status(400).json({ error: "title is required" });
    return;
  }

  const bodyText = typeof body === "string" ? body.slice(0, MAX_BODY_LENGTH).trim() : "";
  const sanitizedComments = Array.isArray(comments)
    ? comments
        .slice(0, MAX_COMMENTS)
        .map((c) => (typeof c === "string" ? c.slice(0, MAX_COMMENT_LENGTH).trim() : ""))
        .filter(Boolean)
    : [];

  const safeSubreddit = typeof currentSubreddit === "string" && currentSubreddit ? currentSubreddit : "unknown";
  const safeAuthor = typeof author === "string" && author ? author : "[deleted]";
  const requestedLanguage = sanitizeLang(typeof incoming.language === "string" ? incoming.language : "");

  const payload: SummarizeRequest = {
    title,
    body: bodyText,
    comments: sanitizedComments,
    currentSubreddit: safeSubreddit,
    author: safeAuthor,
  };
  if (requestedLanguage !== "en") payload.language = requestedLanguage;
  setRequestLanguage(request, requestedLanguage);

  console.log("Post to Summarize :");
  console.log(JSON.stringify(payload, null, 2));
  console.log(payload.body.length);
  console.log("Post Body word count:", payload.body.trim().split(/\s+/).length);

  // Simulating debug mode by adding a 2 second delay to the server response - PreYem
  if (debugModeEnabled()) {
    console.log("[Backend] Debug mode: simulating 2s AI latency, returning static response, no API calls");
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setProvider(request, "debug-static");
    response.json(debugResponse(payload));
    return;
  }

  const errors: { provider: string; message: string }[] = [];

  for (const provider of PROVIDERS) {
    try {
      const backendResponse = await provider.fn(payload);
      console.log(`[Backend] Summary generated via ${provider.name}`);
      setProvider(request, provider.name);
      response.json(backendResponse);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[Backend] ${provider.name} failed:`, message);
      errors.push({ provider: provider.name, message });
      // fall through to next provider - PreYem
    }
  }

  console.error("[Backend] All providers failed:", errors);
  response.status(500).json({ error: "Failed to generate summary. All providers are currently unavailable." });
});

export default router;
