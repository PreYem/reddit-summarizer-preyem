chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Cloud path (unchanged)
  if (message.type === "SUMMARIZE") {
    fetch(message.backendUrl + "/summarize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "extension-frontend-key": "reddit-summary-yem0417",
      },
      body: JSON.stringify(message.data),
    })
      .then((response) => response.json())
      .then((json) => sendResponse({ ok: true, summary: json }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));

    return true;
  }

  // Own-API/local path: request building, the fetch itself, parsing and the one-retry
  // policy all live on this background page, so the request never carries Reddit's
  // origin and the page's CORS can't break the user's endpoint (#18 rework - PreYem)
  if (message.type === "LOCAL_LLM") {
    runCustomLlm(message, sendResponse);
    return true;
  }
});

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
function buildRequest(settings, prompt) {
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

  return { url, headers, payload };
}

async function callOnce(settings, prompt) {
  const request = buildRequest(settings, prompt);
  const response = await fetch(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify(request.payload),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error("Server returned " + response.status + ": " + (detail.slice(0, 150) || "no detail"));
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
    let summary = parseSummary(await callOnce(settings, message.prompt));
    if (!summary) summary = parseSummary(await callOnce(settings, message.prompt + RETRY_RULE));

    if (!summary) {
      sendResponse({ ok: false, error: "Your model did not return valid summary JSON, try again or use another model." });
      return;
    }

    summary.aiModel = (settings.mode === "local" ? "Local | " : "Your AI Cloud Provider | ") + settings.model;
    sendResponse({ ok: true, summary });
  } catch (error) {
    sendResponse({ ok: false, error: error.message || String(error) });
  } finally {
    clearInterval(keepAlive);
  }
}
