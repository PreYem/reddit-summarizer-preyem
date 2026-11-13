import { buildPrompt } from "../../shared/buildPrompt";
import { matchLang, sanitizeLang } from "../../shared/languages";
import type { SummarizeRequest, SummarizeResponse } from "../../shared/types";

// #18 (rework): own-API/local modes hand the prompt to the extension's background page,
// which talks straight to the user's provider — Reddit's page CORS can't break their
// endpoint, and request building/parsing/retry live there (shared buildPrompt keeps
// the prompt byte-identical to the cloud path) - PreYem
// NOTE: chrome.storage keys cannot contain dots, so plan #18's `rs.settings` is stored as `rs_settings`.
export const SETTINGS_KEY = "rs_settings";
// #21 v3: { v, activeKey, slots } — each source ("api:openai", "local:ollama", ...) keeps
// its own endpoint/key/model/think so switching sources never clobbers another's fields - PreYem
export const SETTINGS_VERSION = 3;

// #25: add-on language state is a separate key so changing a language never invalidates
// saved settings under rs_settings. First load persists browser-default languages.
// #26: v2 collapses the two languages into ONE preferred language that drives both the
// add-on UI and the summary output; the settings page itself stays frozen English.
export const UI_STORAGE_KEY = "rs_ui";
export const UI_VERSION = 2;

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
// apart from cloud backend failures (generic message). #21: carries provider/model/kind so
// the error modal can attribute the failure to the exact source it came from - PreYem
export class LocalSummarizeError extends Error {
  provider: string;
  model: string;
  kind: string;
  constructor(message: string, provider: string, model: string, kind: string) {
    super(message);
    this.provider = provider;
    this.model = model;
    this.kind = kind;
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

// Returns the saved settings when they match the current schema version, else null → cloud default.
// #21 v3: the active slot is expanded back into the flat LocalSettings the background expects - PreYem
export function readSettings(): Promise<LocalSettings | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(SETTINGS_KEY, (data: any) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      const saved = data[SETTINGS_KEY];
      if (!saved || saved.v !== SETTINGS_VERSION) {
        resolve(null);
        return;
      }
      const activeKey = typeof saved.activeKey === "string" ? saved.activeKey : "";
      const slot = saved.slots && typeof saved.slots === "object" ? saved.slots[activeKey] : null;
      if (!slot) {
        resolve(null);
        return;
      }
      const settings: LocalSettings = {
        v: SETTINGS_VERSION,
        mode: slot.mode,
        provider: slot.provider,
        flavor: slot.flavor,
        endpoint: slot.endpoint,
        apiKey: slot.apiKey,
        model: slot.model,
        think: slot.think,
      };
      const modeOk = settings.mode === "cloud" || settings.mode === "api" || settings.mode === "local";
      if (!modeOk) {
        resolve(null);
        return;
      }
      if (settings.think !== undefined && THINK_VALUES.indexOf(settings.think) < 0) {
        delete settings.think;
      }
      if (settings.mode === "api") {
        const providerOk = settings.provider === "openai" || settings.provider === "anthropic" || settings.provider === "other";
        const endpointOk = settings.provider !== "other" || isValidEndpoint(settings.endpoint);
        if (!providerOk || !settings.apiKey || !settings.model || !endpointOk) {
          resolve(null);
          return;
        }
      }
      if (settings.mode === "local") {
        if (!isValidEndpoint(settings.endpoint) || !settings.model) {
          resolve(null);
          return;
        }
      }
      resolve(settings);
    });
  });
}

// #26: single preferred language (drives add-on UI + summary output). Missing/invalid
// values are repaired and persisted so the first install defaults to the browser language
// once; afterwards only Save-gated settings edits change it - PreYem
function defaultPreferredLanguage(): string {
  return matchLang(navigator?.language || "") || "en";
}

function persistedPreferredLanguage(saved: any): string | null {
  if (!saved || saved.v !== UI_VERSION) return null;
  const language = typeof saved.preferredLanguage === "string" ? sanitizeLang(saved.preferredLanguage) : null;
  return language || null;
}

function persistPreferredLanguage(language: string): void {
  try {
    chrome.storage.local.set({ [UI_STORAGE_KEY]: { v: UI_VERSION, preferredLanguage: language } }, () => {
      void chrome.runtime.lastError;
    });
  } catch {
    // Ignore language persistence failures; the caller can still use the returned defaults. - PreYem
  }
}

export function readPreferredLanguage(): Promise<string> {
  return new Promise((resolve) => {
    chrome.storage.local.get(UI_STORAGE_KEY, (data: any) => {
      const saved = chrome.runtime.lastError ? null : data[UI_STORAGE_KEY];
      const language = persistedPreferredLanguage(saved) ?? defaultPreferredLanguage();
      if (chrome.runtime.lastError || !persistedPreferredLanguage(saved)) persistPreferredLanguage(language);
      resolve(language);
    });
  });
}

// Human label of the source a request went to, shown in the error modal - PreYem
function providerLabel(settings: LocalSettings): string {
  if (settings.mode === "local") {
    return "Local server - " + (settings.flavor || "openai") + " @ " + (settings.endpoint || "");
  }
  return "AI Cloud Provider - " + (settings.provider || "openai");
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
    throw new LocalSummarizeError(
      response.error || "Local request failed without a message from the server",
      providerLabel(settings),
      settings.model || "no model",
      response.kind || "Request failed",
    );
  }
  return response.summary as SummarizeResponse;
}
