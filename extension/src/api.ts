import type { SummarizeRequest, SummarizeResponse } from "../../shared/types";
import { readSettings, summarizeLocally, CancelledError } from "./localLlm";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

// #20 cancellation bookkeeping: which request (if any) is currently in flight, and the
// URL it was started on — content.ts uses this to send CANCEL when the user navigates
// away, closes the tab, or the URL changes mid-flight, so a local model stops generating
// for a result nobody will see (and the cloud call is cut short too) - PreYem
let inFlight = false;
let requestedUrl = "";

export async function fetchSummary(data: SummarizeRequest): Promise<{ response: SummarizeResponse; mode: "cloud" | "api" | "local" }> {
  inFlight = true;
  requestedUrl = window.location.href;
  try {
    // #18 routing: saved settings decide the path; anything missing/invalid falls back to cloud
    const settings = await readSettings();
    if (settings && settings.mode !== "cloud") {
      return { response: await summarizeLocally(settings, data), mode: settings.mode };
    }

    return {
      response: await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: "SUMMARIZE", data, backendUrl: BACKEND_URL }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!response) {
            reject(new Error("No response from background script"));
            return;
          }
          if (response.cancelled) {
            reject(new CancelledError(response.error));
            return;
          }
          if (!response.ok) {
            reject(new Error(response.error));
            return;
          }
          resolve(response.summary);
        });
      }),
      mode: "cloud",
    };
  } finally {
    inFlight = false;
  }
}

// Tell the background page to abort the in-flight fetch; harmless when nothing is running
export function cancelInFlight(): void {
  if (!inFlight) return;
  inFlight = false;
  chrome.runtime.sendMessage({ type: "CANCEL" }, () => {});
}

// SPA navigation mid-request: the running call belongs to a post we left — cancel it
export function cancelStaleCall(): void {
  if (inFlight && window.location.href !== requestedUrl) cancelInFlight();
}
