// #18: lives in shared/ so the backend and the extension both compile the identical
// prompt — cloud and local modes send byte-identical text - PreYem
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
      "subredditDescription": string
    }
    HARD LENGTH LIMITS (non-negotiable, apply regardless of how long the input is):
    - Never scale the summary with the input: a long post must still produce a short summary. Compress, do not transcribe.
    - "post": maximum 5 sentences (max 80 words), no matter how long the post body is. This is an absolute maximum — never go above it under any circumstance.
    - "community": maximum 3 sentences (max 30 words).
    - "communityReactionBreakdown": exactly 1 sentence (max 20 words).
    - "subredditDescription": maximum 1 sentence (max 12 words).
    Rules:
    - "post": Summarize ONLY what OP said in at most 5 sentences (max 80 words), keeping only the most critical details. Do not add opinions or external info.
    - "community": 2-3 sentences (max 30 words) summarizing the comments and what people had to say. Base only on provided comments.
        Do not include the reaction of the community here.
        If there are no comments, set this to "There are no comments on this post."
    - "communityReaction": ONLY one of these exact labels, nothing else:
      - "Positive" = mostly supporting OP (~70%+ of comments)
      - "Overwhelmingly Positive" = very supportive of OP (+90% of comments)
      - "Negative" = mostly criticizing OP (~70%+ of comments)
      - "Overwhelmingly Negative" = very critical of OP (+90% of comments)
      - "Mixed" = strong split between support and criticism
      - "Inconclusive" = too few or unclear comments
    - "communityReactionBreakdown": One sentence (max 20 words) explaining the reaction, followed by the comment count only if comments.length is above 0, where X is ${comments.length}.
    If there are no comments, do NOT include "Based on X comments." at the end.
    Always follow the exact format when there are comments: "<one sentence explanation>. Based on X comments."
    Examples of valid output:
    - "The community largely agrees with OP and shares similar experiences. Based on 14 comments."
    - "There are too few comments to determine a clear community reaction. Based on 2 comments."
    - "Commenters are sharply divided, with roughly equal amounts of support and criticism. Based on 30 comments."
    - "Most commenters criticize OP's decision and disagree with their reasoning. Based on 21 comments."
    - "subredditDescription": One sentence (max 12 words) describing what the subreddit is about.
        Always follow the exact format: " ${data.currentSubreddit} is <1 sentence, max 12 words, explaining what the subreddit is about>."

    Important constraints:
    - Refer to the author as u/${data.author} at the start of the summary and refer to them as OP in future sentences.
      Example: u/JohnDoe asks ..., then OP explains which is ... — always start with the u/ handle, then switch to OP.
    - If the author is [deleted], mention at the start that the OP deleted their account.
    - Do not invent details not present in title/body/comments
    - If comments are missing, use communityReaction "Inconclusive" and communityReactionBreakdown "There aren't enough comments for a valid breakdown."
    - Keep output valid JSON only
    - Respect the HARD LENGTH LIMITS above even if the post or comments are very long; shorter is always preferred over completeness, and the 80-word cap applies only to "post"
    Input:
    Current Subreddit: ${data.currentSubreddit} | Use this subreddit to figure out more context on the topic (example: r/OffMyChest is for confessions...etc)
    OP handle: ${data.author} | if it's [deleted] you can mention it at the start of the summary that the OP deleted his account.
    Title: ${data.title}
    Post body: ${data.body || "(no body, title only)"}
    Top comments:
    ${comments.join("\n") || "(no comments)"}
  `.trim();
}
