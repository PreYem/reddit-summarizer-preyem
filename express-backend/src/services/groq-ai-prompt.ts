import Groq from "groq-sdk";
import { buildPrompt } from "./buildPrompt";
import type { SummarizeRequest, SummarizeResponse } from "../types";

const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function summarize(data: SummarizeRequest): Promise<SummarizeResponse> {
  const result = await client.chat.completions.create({
    model: "llama-3.1-8b-instant",
    max_tokens: 400,
    messages: [{ role: "user", content: buildPrompt(data) }],
  });

  const text = result.choices[0]?.message?.content ?? "";
  console.log(text);
  return JSON.parse(
    text
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim(),
  );
}
