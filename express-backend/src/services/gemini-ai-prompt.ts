import { GoogleGenAI } from "@google/genai";
import { buildPrompt } from "./buildPrompt";
import type { SummarizeRequest, SummarizeResponse } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function summarize(data: SummarizeRequest): Promise<SummarizeResponse> {
  const result = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: buildPrompt(data),
  });

  const text = result.text ?? "";
  return JSON.parse(
    text
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim(),
  );
}
