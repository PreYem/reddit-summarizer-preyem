import type { SummarizeRequest, SummarizeResponse } from "../../shared/types";

const BACKEND_URL = "http://localhost:5173";

export async function fetchSummary(data: SummarizeRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'SUMMARIZE', data, backendUrl: BACKEND_URL },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response.ok) {
          reject(new Error(response.error));
          return;
        }
        resolve(response.summary);
      }
    );
  });
}
