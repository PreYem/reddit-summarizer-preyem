chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Cloud path — now cancellable too: the fetch carries an AbortController signal so a
  // CANCEL message mid-flight stops it instead of wasting the backend call - PreYem
  if (message.type === "SUMMARIZE") {
    activeAbort = new AbortController();
    const cloudAbort = activeAbort;
    fetch(message.backendUrl + "/summarize", {
      method: "POST",
      signal: cloudAbort.signal,
      headers: {
        "Content-Type": "application/json",
        "extension-frontend-key": "reddit-summary-yem0417",
      },
      body: JSON.stringify(message.data),
    })
      .then((response) => response.json())
      .then((json) => sendResponse({ ok: true, summary: json }))
      .catch((error) => sendResponse({ ok: false, cancelled: error.name === "AbortError" || undefined, error: error.message }));

    return true;
  }

  // Own-API/local path: request building, the fetch itself, parsing and the one-retry
  // policy all live on this background page, so the request never carries Reddit's
  // origin and the page's CORS can't break the user's endpoint (#18 rework - PreYem)
  if (message.type === "LOCAL_LLM") {
    runCustomLlm(message, sendResponse);
    return true;
  }

  // CANCEL: the user navigated away / closed the tab / retried — abort the in-flight
  // fetch so local servers (Ollama, llama.cpp) stop generating for a response nobody
  // will see, instead of letting the model finish the whole prompt - PreYem
  if (message.type === "CANCEL") {
    if (activeAbort) activeAbort.abort();
    sendResponse({ ok: true, cancelled: true });
    return true;
  }
});

// AbortController of the in-flight fetch (cloud or custom); CANCEL aborts it. callOnce
// re-points it per call so the malformed-JSON retry is cancellable too - PreYem
let activeAbort = null;

function endpointBase(settings) {
  if (settings.mode === "api" && settings.provider !== "other") {
    return settings.provider === "anthropic" ? "https://api.anthropic.com/v1" : "https://api.openai.com/v1";
  }
  return (settings.endpoint || "").trim().replace(/\/+$/, "");
}

function kindOf(settings) {
  if (settings.mode === "local") return settings.flavor === "ollama" ? "ollama" : "openai";
  return settings.provider === "anthropic" ? "anthropic" : "openai";
}

// Per-kind request shapes: openai-compat /chat/completions, ollama native /api/chat,
// anthropic /v1/messages (x-api-key header). Keys ONLY for user-provided config; the
// cloud extension-frontend-key never travels to custom endpoints - PreYem
function buildRequest(settings, prompt, stripThinking) {
  const base = endpointBase(settings);
  const kind = kindOf(settings);
  const headers = { "Content-Type": "application/json" };
  let url;
  let payload;

  if (kind === "anthropic") {
    headers["x-api-key"] = settings.apiKey || "";
    headers["anthropic-version"] = "2023-06-01";
    headers["anthropic-dangerous-direct-browser-access"] = "true";
    url = /\/v1$/.test(base) ? base + "/messages" : base + "/v1/messages";
    payload = { model: settings.model, max_tokens: 2048, messages: [{ role: "user", content: prompt }] };
  } else if (kind === "ollama") {
    url = base + "/api/chat";
    // Ollama defaults to streaming NDJSON, which would break response.json() - PreYem
    payload = { model: settings.model, messages: [{ role: "user", content: prompt }], stream: false };
    if (settings.apiKey) headers["Authorization"] = "Bearer " + settings.apiKey;
  } else {
    url = base + "/chat/completions";
    payload = { model: settings.model, messages: [{ role: "user", content: prompt }] };
    if (settings.apiKey) headers["Authorization"] = "Bearer " + settings.apiKey;
  }

  // #19 thinking level values; anything else means "none" - PreYem
const THINK_VALUES = ["none", "low", "medium", "high"];

// #19 thinking level, local mode only: openai-compat servers take reasoning_effort
  // (off = "none" + chat_template_kwargs for gpt-oss/Qwen3 templates); ollama native
  // takes think true/false — ollama levels collapse, the UI only offers off/on anyway.
  // Local-only by user decision: own-API requests stay untouched - PreYem
  if (settings.mode === "local" && !stripThinking) {
    const think = THINK_VALUES.includes(settings.think) ? settings.think : "none";
    if (kind === "ollama") {
      payload.think = think !== "none";
    } else if (think !== "none") {
      payload.reasoning_effort = think;
    } else {
      payload.reasoning_effort = "none";
      payload.chat_template_kwargs = { enable_thinking: false };
    }
  }

  return { url, headers, payload };
}

async function callOnce(settings, prompt, stripThinking) {
  const request = buildRequest(settings, prompt, stripThinking);
  activeAbort = new AbortController();
  const response = await fetch(request.url, {
    method: "POST",
    signal: activeAbort.signal,
    headers: request.headers,
    body: JSON.stringify(request.payload),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(serverErrorDetail(response.status, detail));
  }

  const json = await response.json();

  if (kindOf(settings) === "anthropic") {
    return (Array.isArray(json.content) ? json.content : []).map((part) => part.text || "").join(" ");
  }
  if (settings.mode === "local" && settings.flavor === "ollama") {
    return (json.message && json.message.content) || json.response || "";
  }
  const message = json.choices && json.choices[0] ? json.choices[0].message : null;
  // Reasoning fallback for local reasoning models, same idea as the Groq fix - PreYem
  return (message && (message.content || message.reasoning_content || message.reasoning)) || "";
}

// Server error bodies are usually JSON envelopes ({error:{message}} OpenAI-style or a
// top-level {type,message} Anthropic-style): surface just the message text in the button
// instead of a raw JSON dump - PreYem
function serverErrorDetail(status, detail) {
  let message = detail;
  try {
    const json = JSON.parse(detail);
    if (json) {
      const inner = typeof json.error === "object" && json.error ? json.error : json;
      if (typeof inner.message === "string") message = inner.message;
    }
  } catch (error) {
    // Not JSON — keep the raw text
  }
  const trimmed = message.trim();
  return "Server returned " + status + ": " + (trimmed.slice(0, 220) || "no detail");
}

// Mirror of services/groq-ai-prompt.ts: tolerant slice-out + strict 5-key schema - PreYem
function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

function parseSummary(raw) {
  const json = extractJson(
    raw
      .replace(/<think>[\s\S]*?<\/think>/g, "")
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim(),
  );
  if (!json) return null;
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const required = ["post", "community", "communityReaction", "communityReactionBreakdown", "subredditDescription"];
  for (const key of required) {
    if (typeof parsed[key] !== "string") return null;
  }
  return parsed;
}

async function runCustomLlm(message, sendResponse) {
  // Local models can stall for minutes before the first byte; the ping keeps the MV3
  // service worker from being shut down mid-request - PreYem
  const keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(() => {}), 20_000);
  try {
    const settings = message.settings;
    const RETRY_RULE = "\nRETRY RULE: Return ONLY valid JSON matching the schema. No reasoning, no text outside the JSON braces.";

    // Malformed JSON gets exactly one stricter retry, never a cloud fallback - PreYem
    // Older/stricter local servers reject reasoning_effort/think/chat_template_kwargs, so
    // a 400 on a local request retries once with those fields stripped — strip-once flag
    // keeps it from looping - PreYem
    let stripped = false;
    let raw;
    try {
      raw = await callOnce(settings, message.prompt, stripped);
    } catch (error) {
      if (settings.mode !== "local" || !/Server returned 400/.test(String(error.message))) throw error;
      stripped = true;
      raw = await callOnce(settings, message.prompt, stripped);
    }
    let summary = parseSummary(raw);
    if (!summary) summary = parseSummary(await callOnce(settings, message.prompt + RETRY_RULE, stripped));

    if (!summary) {
      sendResponse({ ok: false, error: "Your model did not return valid summary JSON, try again or use another model." });
      return;
    }

    summary.aiModel = (settings.mode === "local" ? "Local | " : "Your AI Cloud Provider | ") + settings.model;
    sendResponse({ ok: true, summary });
  } catch (error) {
    sendResponse({ ok: false, cancelled: error.name === "AbortError" || undefined, error: error.message || String(error) });
  } finally {
    clearInterval(keepAlive);
  }
}
