import Anthropic from "@anthropic-ai/sdk";
import type { SummarizeRequest } from "../types";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function summarize(data: SummarizeRequest): Promise<string> {
  const commentsBlock = data.comments
    .slice(0, 20)
    .map((c, i) => `Comment ${i + 1}: ${c}`)
    .join("\n");

  const message = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: `Summarize this Reddit post concisely in 5 sentences or less. Focus on the main point and any notable community reactions.
        Title: ${data.title} Post body: ${data.body || "(no body, title only)"}
        Top comments:
        ${commentsBlock || "(no comments)"}`,
      },
    ],
  });

  const block = message.content[0];
  if (block.type !== "text") throw new Error("Unexpected response type");
  console.log(block.text);
  return block.text;
}
