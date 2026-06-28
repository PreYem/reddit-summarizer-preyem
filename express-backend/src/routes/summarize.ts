import { Router, Request, Response } from "express";
import { summarize as AnthropicSummarizer } from "../services/claude-ai-prompt";
import { summarize as GemeniSummarizer } from "../services/gemini-ai-prompt";
import { summarize as GroqSummarizer } from "../services/groq-meta-ai-prompt";

import type { SummarizeRequest, SummarizeResponse } from "../types";

const router = Router();
const MAX_BODY_LENGTH = 8_000;
const MAX_COMMENT_LENGTH = 500;
const MAX_COMMENTS = 100;

router.post("/", async (request: Request, response: Response) => {
  const { title, body, comments, currentSubreddit, author } = request.body as SummarizeRequest;

  // console.log("[Backend] Request received:", {
  //   title,
  //   bodyLength: body?.length,
  //   commentCount: comments?.length,
  //   currentSubreddit,
  //   author,
  // });

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

  // Fallback in case the scraper fails - PreYem
  const safeSubreddit = typeof currentSubreddit === "string" && currentSubreddit ? currentSubreddit : "unknown";
  const safeAuthor = typeof author === "string" && author ? author : "[deleted]";

  try {
    const backendResponse: SummarizeResponse = await GroqSummarizer({
      // Switch between different models during development - PreYem
      title,
      body: bodyText,
      comments: sanitizedComments,
      currentSubreddit: safeSubreddit,
      author: safeAuthor,
    });
    response.json(backendResponse);
    console.log(backendResponse);
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Failed to generate summary." });
  }
});

export default router;
