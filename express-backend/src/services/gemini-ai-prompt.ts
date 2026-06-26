import { GoogleGenAI } from "@google/genai";
import type { SummarizeRequest, SummarizeResponse } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function summarize(data: SummarizeRequest): Promise<SummarizeResponse> {
  const comments = data.comments.slice(0, 100);

  const result = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `
      You are a strict Reddit post summarizer.
      Return ONLY a valid JSON object.
      Do NOT include markdown, code fences, explanations, or extra text.
      Follow this schema exactly:
      {
        "post": string,
        "community": string,
        "communityReaction": string,
        "communityReactionBreakdown": string
      }
      Rules:
      - "post": Every 10 lines of text needs to be reduced to 2-3 lines summarizing ONLY what OP said. Do not add opinions or external info. Include critical details.
      - "community": 2-3 sentences summarizing the comments and what people had to say. Base only on provided comments.
        Do not include the reaction of the community here.
      - "communityReaction": ONLY one of these exact labels, nothing else:
        - "Positive" = mostly supporting OP (~70%+ of comments)
        - "Overwhelmingly Positive" = very supportive of OP (+90% of comments)
        - "Negative" = mostly criticizing OP (~70%+ of comments)
        - "Overwhelmingly Negative" = very critical of OP (+90% of comments)
        - "Mixed" = strong split between support and criticism
        - "Inconclusive" = too few or unclear comments
      - "communityReactionBreakdown": One sentence explaining the reaction, followed by the comment count.
        Always follow the exact format: "<one sentence explanation>. Based on 69420 comments."
        Examples of valid output:
        - "The community largely agrees with OP and shares similar experiences. Based on 14 comments."
        - "There are too few comments to determine a clear community reaction. Based on 2 comments."
        - "Commenters are sharply divided, with roughly equal amounts of support and criticism. Based on 30 comments."
        - "Most commenters criticize OP's decision and disagree with their reasoning. Based on 21 comments."
      Important constraints:
      - Refer to the author as his reddit handle at the start of the summary and refer to him as OP in future sentences.
        Example: u/JohnDoe asks ..., then OP asks which is ... — so at the start of the summary, refer to OP with his handle, then later refer to him as OP.
      - Do not invent details not present in title/body/comments
      - If comments are missing, use communityReaction "Inconclusive" and communityReactionBreakdown "There are no comments to base a reaction on. Based on 0 comments."
      - Keep output valid JSON only
      Input:
      Current Subreddit: ${data.currentSubreddit} | Use this subreddit to figure out more context on the topic (example: r/OffMyChest is for confessions...etc)
      OP handle: ${data.author} | if it's [deleted] you can mention it at the start of the summary that the OP deleted his account.
      Title: ${data.title}
      Post body: ${data.body || "(no body, title only)"}
      Top comments:
      ${comments.join("\n") || "(no comments)"}
    `,
  });

  const text = result.text ?? "";
  const clean = text
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();
  const parsed: SummarizeResponse = JSON.parse(clean);

  console.log(parsed);
  return parsed;
}
