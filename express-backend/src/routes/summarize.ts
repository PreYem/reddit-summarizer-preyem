import { Router, Request, Response } from "express";
import { summarize } from "../services/ai";
import type { SummarizeRequest, SummarizeResponse } from "../types";

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  const { title, body, comments } = req.body as SummarizeRequest;
  console.log("[Backend] Request received:", req.body); // add this

  if (!title) {
    res.status(400).json({ error: "title is required" });
    return;
  }

  const summary = await summarize({ title, body, comments });
  const response: SummarizeResponse = { summary };
  res.json(response);
});

export default router;
