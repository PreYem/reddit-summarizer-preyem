import { Router, Request, Response } from "express";
import { summarize } from "../services/ai";
import type { SummarizeRequest, SummarizeResponse } from "../types";

const router = Router();

const MAX_BODY_LENGTH = 8_000;
const MAX_COMMENT_LENGTH = 500;
const MAX_COMMENTS = 20;

router.post("/", async (req: Request, res: Response) => {
  const { title, body, comments } = req.body as SummarizeRequest;
  console.log("[Backend] Request received:", { title, bodyLength: body?.length, commentCount: comments?.length });

  if (!title || typeof title !== "string") {
    res.status(400).json({ error: "title is required" });
    return;
  }

  const bodyText = typeof body === "string" ? body.slice(0, MAX_BODY_LENGTH).trim() : "";

  const sanitizedComments = Array.isArray(comments)
    ? comments
        .slice(0, MAX_COMMENTS)
        .map((c) => (typeof c === "string" ? c.slice(0, MAX_COMMENT_LENGTH).trim() : ""))
        .filter(Boolean)
    : [];

  try {
    const response: SummarizeResponse = await summarize({ title, body: bodyText, comments: sanitizedComments });
    res.json(response);
  } catch (err) {
    console.error("[Backend] AI error:", err);
    res.status(500).json({ error: "Failed to generate summary." });
  }
});

export default router;