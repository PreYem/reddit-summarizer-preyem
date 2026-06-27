import Groq from "groq-sdk";
import { buildPrompt } from "./buildPrompt";
import type { SummarizeRequest, SummarizeResponse } from "../types";

const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function summarize(data: SummarizeRequest): Promise<SummarizeResponse> {
  const aiModel = "llama-3.1-8b-instant";
  const result = await client.chat.completions.create({
    model: aiModel,
    max_tokens: 2000,
    messages: [{ role: "user", content: buildPrompt(data) }],
  } as any);

  const raw = (result.choices[0]?.message?.content ?? "")
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();

  console.log("RAW RESPONSE:", raw);
  const parsed = JSON.parse(raw);
  parsed.aiModel = "Meta | " + aiModel;
  return parsed;
}
