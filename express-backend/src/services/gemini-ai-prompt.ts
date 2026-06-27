import { GoogleGenAI } from "@google/genai";
import { buildPrompt } from "./buildPrompt";
import type { SummarizeRequest, SummarizeResponse } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function summarize(data: SummarizeRequest): Promise<SummarizeResponse> {
  const aiModel = "gemini-2.5-flash";

  const result = await ai.models.generateContent({
    model: aiModel,
    contents: buildPrompt(data),
  });

  const parsed = JSON.parse(
    (result.text ?? "")
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim(),
  );
  parsed.aiModel = "Gemini | " + aiModel;
  return parsed;
}
