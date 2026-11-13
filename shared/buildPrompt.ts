// #18: lives in shared/ so the backend and the extension both compile the identical
// prompt — cloud and local modes send byte-identical text - PreYem
// #26: single preferred language drives BOTH the add-on UI and the summary output.
// #25 bug: languageBlock was built but never interpolated into the returned prompt —
// every cloud/local request silently demanded English regardless of settings.
// #26: the block now lives directly under the schema in imperative form; soft trailing
// suggestions were ignored by gpt-oss/Gemini/Claude. Cloud and local stay byte-identical.
// #27: the "Based on X comments." suffix moved OUT of the model contract — the add-on now
// renders it itself from uiText("based_on_comments") + {n}, so models no longer inconsistently
// drop/translate/miscount it. OUTPUT LANGUAGE also moved to the prompt tail: coder models
// (qwen-coder via local servers) ignored the mid-prompt directive and answered in English.
import type { SummarizeRequest } from "./types";
import { langName } from "./languages";

export function buildPrompt(data: SummarizeRequest): string {
  const comments = data.comments.slice(0, 100);
  const languageName = langName(data.language ?? "en");
  const languageBlock = languageName
    ? `
    OUTPUT LANGUAGE (MANDATORY):
    - Every free-text value ("post", "community", "communityReactionBreakdown", "subredditDescription") MUST be written entirely in ${languageName}.
    - Returning those fields in English or any other language is a contract violation and an invalid answer.
    - "communityReaction" MUST remain exactly one of the English labels listed below, never translated.`
    : "";

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
    - "post": maximum 5 sentences (max 80 words), no matter how long the post body is. This is an absolute maximum - never go above it under any circumstance.
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
    - "communityReactionBreakdown": exactly 1 sentence (max 20 words) explaining the reaction. Do NOT mention comment counts or write "Based on X comments" — the add-on renders that line itself.
    Examples of valid output:
    - "The community largely agrees with OP and shares similar experiences."
    - "There are too few comments to determine a clear community reaction."
    - "Commenters are sharply divided, with roughly equal amounts of support and criticism."
    - "Most commenters criticize OP's decision and disagree with their reasoning."
    - "subredditDescription": One sentence (max 12 words) describing what the subreddit is about.
        Always follow the exact format: " ${data.currentSubreddit} is <1 sentence, max 12 words, explaining what the subreddit is about>."

    ${languageBlock}
    Important constraints:
    - Refer to the author as u/${data.author} at the start of the summary and refer to them as OP in future sentences.
      Example: u/JohnDoe asks ..., then OP explains which is ... - always start with the u/ handle, then switch to OP.
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
