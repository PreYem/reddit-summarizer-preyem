import Anthropic from "@anthropic-ai/sdk";
import type { SummarizeRequest, SummarizeResponse } from "../types";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function summarize(data: SummarizeRequest): Promise<SummarizeResponse> {
  const commentsBlock = data.comments
    .slice(0, 20)
    .map((c, i) => `Comment ${i + 1}: ${c}`)
    .join("\n");

  const message = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 400,
    messages: [
      {
        role: "user",
        content: `
        You are a strict Reddit post summarizer.

        Return ONLY a valid JSON object.
        Do NOT include markdown, code fences, explanations, or extra text.

        Follow this schema exactly:

        {
          "post": string,
          "community": string,
          "community_reaction": "positive" | "overwhelmingly positive" | "negative" | "overwhelmingly negative" | "mixed" | "inconclusive"
        }

        Rules:
        - "post": 2-5 sentences summarizing ONLY what OP said. Do not add opinions or external info.
        - "community": 1-3 sentences summarizing the comments and what people had to say. Base only on provided comments.
          Do not include the reaction of the community here.
        - "community_reaction": classify sentiment strictly:
          - "positive" = mostly supporting OP or around 70% of comments pointing towards it
          - "overwhelmingly positive" = very supportive of the OP with +95% of comments pointing towards it
          - "negative" = mostly criticizing OP or around 70% of comments pointing towards it
          - "overwhelmingly negative" = very much criticizing OP with +95% of comments pointing towards it
          - "mixed" = strong split between support and criticism
          - "inconclusive" = too few/unclear comments

        Important constraints:
        - Refer to the author as "OP"
        - Do not invent details not present in title/body/comments
        - If comments are missing, assume "inconclusive" for community reaction
        - Keep output valid JSON only

        Input:

        Title: ${data.title}
        Post body: ${data.body || "(no body, title only)"}
        Top comments:
        ${commentsBlock || "(no comments)"}
        `,
      },
    ],
  });

  const block = message.content[0];
  if (block.type !== "text") throw new Error("Unexpected response type");

  const clean = block.text
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();

  console.log("Parsed response");

  console.log(clean);

  const parsed: SummarizeResponse = JSON.parse(clean);

  return parsed;
}
