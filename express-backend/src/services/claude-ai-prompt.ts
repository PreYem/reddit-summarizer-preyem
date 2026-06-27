import Anthropic from "@anthropic-ai/sdk";
import { buildPrompt } from "./buildPrompt";
import type { SummarizeRequest, SummarizeResponse } from "../types";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function summarize(data: SummarizeRequest): Promise<SummarizeResponse> {
  const aiModel = "claude-haiku-4-5";

  const message = await client.messages.create({
    model: aiModel,
    max_tokens: 400,
    messages: [{ role: "user", content: buildPrompt(data) }],
  });

  const block = message.content[0];
  if (block.type !== "text") throw new Error("Unexpected response type");
  const parsed = JSON.parse(
    block.text
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim(),
  );
  parsed.aiModel = "Claude | " + aiModel;
  return parsed;
}
