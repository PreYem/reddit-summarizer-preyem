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
          "communityReaction": string
        }
        Rules:
        - "post": Every 10 lines of text needs to be reduced to 2-3 lines summarizing ONLY what OP said. Do not add opinions or external info. Include critical details.
        - "community": 2-3 sentences summarizing the comments and what people had to say. Base only on provided comments.
          Do not include the reaction of the community here.
        - "communityReaction": a short label followed by " | " followed by one sentence explaining the sentiment.
          Labels to use:
          - "Positive" = mostly supporting OP (~70%+ of comments)
          - "Overwhelmingly Positive" = very supportive of OP (+95% of comments)
          - "Negative" = mostly criticizing OP (~70%+ of comments)
          - "Overwhelmingly Negative" = very critical of OP (+95% of comments)
          - "Mixed" = strong split between support and criticism
          - "Inconclusive" = too few or unclear comments

          Examples of valid output:
          - "Positive | The community largely agrees with OP and shares similar experiences."
          - "Inconclusive | There are too few comments to determine a clear community reaction."
          - "Mixed | Commenters are sharply divided, with equal amounts of support and criticism."
          - "Negative | Most commenters criticize OP's decision and disagree with their reasoning."

          Always follow the exact format: "Label | One sentence."

        Important constraints:
        - Refer to the author as "OP" or his reddit handler sent in the input
        - Do not invent details not present in title/body/comments
        - If comments are missing, use "Inconclusive | There are no comments to base a reaction on."
        - Keep output valid JSON only

        Input:
        OP handler : u/johnDoe
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
