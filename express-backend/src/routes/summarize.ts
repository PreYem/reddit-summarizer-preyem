import { Router, Request, Response } from "express";
import { summarize as AnthropicSummarizer } from "../services/claude-ai-prompt";
import { summarize as GeminiSummarizer } from "../services/gemini-ai-prompt";
import { summarize as GroqSummarizer } from "../services/groq-meta-ai-prompt";
import type { SummarizeRequest, SummarizeResponse } from "../types";

const router = Router();

const MAX_BODY_LENGTH = 8_000;
const MAX_COMMENT_LENGTH = 500;
const MAX_COMMENTS = 100;

type SummarizerFn = (input: {
  title: string;
  body: string;
  comments: string[];
  currentSubreddit: string;
  author: string;
}) => Promise<SummarizeResponse>;

// Order = priority. First one wins if it succeeds - PreYem
const PROVIDERS: { name: string; fn: SummarizerFn }[] = [
  { name: "groq", fn: GroqSummarizer },
  { name: "gemini", fn: GeminiSummarizer },
  { name: "anthropic", fn: AnthropicSummarizer },
];

router.post("/", async (request: Request, response: Response) => {
  const { title, body, comments, currentSubreddit, author } = request.body as SummarizeRequest;

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

  const payload = {
    title,
    body: bodyText,
    comments: sanitizedComments,
    currentSubreddit: safeSubreddit,
    author: safeAuthor,
  };

  const errors: { provider: string; message: string }[] = [];

  for (const provider of PROVIDERS) {
    try {
      const backendResponse = await provider.fn(payload);
      console.log(`[Backend] Summary generated via ${provider.name}`);
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
