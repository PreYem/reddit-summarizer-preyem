import { buildPrompt } from "../../shared/buildPrompt";
import type { SummarizeRequest, SummarizeResponse } from "../../shared/types";

// #18 (rework): own-API/local modes hand the prompt to the extension's background page,
// which talks straight to the user's provider — Reddit's page CORS can't break their
// endpoint, and request building/parsing/retry live there (shared buildPrompt keeps
// the prompt byte-identical to the cloud path) - PreYem
// NOTE: chrome.storage keys cannot contain dots, so plan #18's `rs.settings` is stored as `rs_settings`.
export const SETTINGS_KEY = "rs_settings";
export const SETTINGS_VERSION = 2;

export interface LocalSettings {
  v: number;
  mode: "cloud" | "api" | "local";
  provider?: "openai" | "anthropic" | "other";
  flavor?: "openai" | "ollama";
  endpoint?: string;
  apiKey?: string;
  model?: string;
  // #19 thinking level for local requests; missing/invalid means "none" — background owns
  // the per-flavor mapping, and invalid values never invalidate the whole settings - PreYem
  think?: "none" | "low" | "medium" | "high";
}

const THINK_VALUES = ["none", "low", "medium", "high"];

// Dedicated error type so content.ts can tell local/API failures (user-facing message)
// apart from cloud backend failures (generic message) - PreYem
export class LocalSummarizeError extends Error {
  constructor(message: string) {
    super(message);
  }
}

// #20 cancellation: the background aborted this round-trip because the user navigated
// away/closed the tab — content.ts stays silent instead of flashing an error - PreYem
export class CancelledError extends Error {
  constructor(message?: string) {
    super(message || "Request cancelled");
  }
}

function isValidEndpoint(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

// Returns the saved settings when they match the current schema version, else null → cloud default
export function readSettings(): Promise<LocalSettings | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(SETTINGS_KEY, (data: any) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      const saved = data[SETTINGS_KEY] as LocalSettings | undefined;
      const modeOk = saved && (saved.mode === "cloud" || saved.mode === "api" || saved.mode === "local");
      if (!saved || saved.v !== SETTINGS_VERSION || !modeOk) {
        resolve(null);
        return;
      }
      if (saved.think !== undefined && THINK_VALUES.indexOf(saved.think) < 0) {
        delete saved.think;
      }
      if (saved.mode === "api") {
        const providerOk = saved.provider === "openai" || saved.provider === "anthropic" || saved.provider === "other";
        const endpointOk = saved.provider !== "other" || isValidEndpoint(saved.endpoint);
        if (!providerOk || !saved.apiKey || !saved.model || !endpointOk) {
          resolve(null);
          return;
        }
      }
      if (saved.mode === "local") {
        if (!isValidEndpoint(saved.endpoint) || !saved.model) {
          resolve(null);
          return;
        }
      }
      resolve(saved);
    });
  });
}

// One round-trip to the background page (LOCAL_LLM). The prompt is built content-side
// with the shared buildPrompt so cloud and local stay byte-identical - PreYem
export async function summarizeLocally(settings: LocalSettings, data: SummarizeRequest): Promise<SummarizeResponse> {
  const prompt = buildPrompt(data);

  const response = await new Promise<any>((deliver) => {
    chrome.runtime.sendMessage({ type: "LOCAL_LLM", settings, prompt }, (res: any) => {
      if (chrome.runtime.lastError) {
        deliver({ ok: false, error: chrome.runtime.lastError.message || "No response from the extension's background page" });
      } else if (!res) {
        deliver({ ok: false, error: "The extension's background page did not answer" });
      } else {
        deliver(res);
      }
    });
  });

  if (response.cancelled) {
    throw new CancelledError(response.error);
  }
  if (!response.ok || !response.summary) {
    throw new LocalSummarizeError(response.error || "Local request failed without a message from the server");
  }
  return response.summary as SummarizeResponse;
}
