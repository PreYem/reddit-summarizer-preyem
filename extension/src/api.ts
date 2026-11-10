import type { SummarizeRequest, SummarizeResponse } from "../../shared/types";
import { readSettings, summarizeLocally } from "./localLlm";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

export async function fetchSummary(data: SummarizeRequest): Promise<SummarizeResponse> {
  // #18 routing: saved settings decide the path; anything missing/invalid falls back to cloud
  const settings = await readSettings();
  if (settings && settings.mode !== "cloud") {
    return await summarizeLocally(settings, data);
  }

  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "SUMMARIZE", data, backendUrl: BACKEND_URL }, (response) => {
      console.log("[RS] Background response:", response.summary );
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response) {
        reject(new Error("No response from background script"));
        return;
      }
      if (!response.ok) {
        reject(new Error(response.error));
        return;
      }
      // console.log("comments :")
      // console.log(data.comments)
      resolve(response.summary);
    });
  });
}
