export function buildPrompt(data: { currentSubreddit: string; author: string; title: string; body?: string; comments: string[] }): string {
  const comments = data.comments.slice(0, 100);

  return `
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
    - "communityReactionBreakdown": One sentence explaining the reaction, followed by the comment count where X is ${comments.length} when it's above 0.
      Always follow the exact format: "<one sentence explanation>. Based on X comments if there are any."
      Examples of valid output:
      - "The community largely agrees with OP and shares similar experiences. Based on 14 comments."
      - "There are too few comments to determine a clear community reaction. Based on 2 comments."
    Important constraints:
    - Refer to the author as his reddit handle at the start of the summary and refer to him as OP in future sentences.
    - Do not invent details not present in title/body/comments
    - If comments are missing, use communityReaction "Inconclusive" and communityReactionBreakdown "There aren't enough comments for a valid breakdown."
    - Keep output valid JSON only
    Input:
    Current Subreddit: ${data.currentSubreddit}
    OP handle: ${data.author}
    Title: ${data.title}
    Post body: ${data.body || "(no body, title only)"}
    Top comments:
    ${comments.join("\n") || "(no comments)"}
  `.trim();
}
