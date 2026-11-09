import Groq from "groq-sdk";
import { buildPrompt } from "./buildPrompt";
import type { SummarizeRequest, SummarizeResponse } from "../types";

const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

// gpt-oss on Groq sometimes returns an empty body or a truncated object when
// its reasoning eats the token budget, so slice out the JSON object and throw
// a readable error instead of V8's "Unexpected end of JSON input" - PreYem
function extractJson(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

export async function summarize(data: SummarizeRequest): Promise<SummarizeResponse> {
  const aiModel = "openai/gpt-oss-20b";
  const result = await client.chat.completions.create({
    model: aiModel,
    // gpt-oss spends tokens on hidden reasoning first; 2000 used to cut the
    // JSON off mid-object and made the parse throw "Unexpected end of JSON input" - PreYem
    max_tokens: 4000,
    messages: [{ role: "user", content: buildPrompt(data) }],
  } as any);

  const message = result.choices[0]?.message;
  const content = message?.content ?? "";
  // Reasoning text is a last-resort source in case the JSON landed there - PreYem
  const raw = (content || ((message as any)?.reasoning ?? ""))
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();

  const json = extractJson(raw);
  if (!json) throw new Error(`Groq returned no JSON (empty/truncated): ${raw.slice(0, 200)}`);
  const parsed = JSON.parse(json);
  // A half-shaped object (truncated-but-still-parsable) must fall through to
  // the next provider instead of shipping a summary with missing sections - PreYem
  const required = ["post", "community", "communityReaction", "communityReactionBreakdown", "subredditDescription"];
  const missing = required.filter((key) => typeof parsed[key] !== "string");
  if (missing.length) throw new Error(`Groq JSON missing keys: ${missing.join(", ")} (truncated?): ${raw.slice(0, 200)}`);
  parsed.aiModel = "OpenAI | " + aiModel;
  return parsed;
}
