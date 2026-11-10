// #18 settings page script - PreYem
// Extension pages forbid inline JS, so this file wires everything up (kept verbatim in
// builds, so it stays plain JS).
// NOTE: chrome.storage keys cannot contain dots, so plan #18's `rs.settings` notation is
// stored as `rs_settings` here (same key the content scripts read in localLlm.ts).
// v2 schema: three sources — cloud | api (own provider key) | local (own server).

const SETTINGS_KEY = "rs_settings";
const SETTINGS_VERSION = 2;

const modeSelect = document.getElementById("rs-mode");
const providerSelect = document.getElementById("rs-provider");
const flavorSelect = document.getElementById("rs-flavor");
const endpointInput = document.getElementById("rs-endpoint");
const apiKeyInput = document.getElementById("rs-api-key");
const modelSelect = document.getElementById("rs-model");
const saveButton = document.getElementById("rs-save");
const testButton = document.getElementById("rs-test");
const statusLine = document.getElementById("rs-status");
const sections = {
  api: document.getElementById("sec-api"),
  local: document.getElementById("sec-local"),
  server: document.getElementById("sec-server"),
  key: document.getElementById("sec-key"),
  model: document.getElementById("sec-model"),
};

function setStatus(kind, text) {
  statusLine.textContent = text;
  const colors = { ok: "text-[#46d160]", warn: "text-[#ffb3a6]", error: "text-[#ff4500]", info: "text-white/45" };
  statusLine.className = "text-[11.5px] leading-normal " + colors[kind];
}

function isValidEndpoint(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function modeLabel(mode) {
  return mode === "api" ? "AI Cloud Provider" : mode === "local" ? "Local" : "Cloud";
}

// Show only the inputs the chosen source actually uses (#18 feedback)
function showSections() {
  const mode = modeSelect.value;
  const provider = providerSelect.value;
  sections.api.hidden = mode !== "api";
  sections.local.hidden = mode !== "local";
  sections.server.hidden = mode === "cloud" || (mode === "api" && provider !== "other");
  sections.key.hidden = mode === "cloud";
  sections.model.hidden = mode === "cloud";
}

function formConfig() {
  return {
    mode: modeSelect.value,
    provider: providerSelect.value,
    flavor: flavorSelect.value,
    endpoint: endpointInput.value.trim(),
    apiKey: apiKeyInput.value.trim(),
    model: modelSelect.value,
  };
}

// Mirrors extension/public/background.js: same base URL + request kind rules, used
// here only for model-list discovery and Test connection - PreYem
function endpointBase(cfg) {
  if (cfg.mode === "api" && cfg.provider !== "other") {
    return cfg.provider === "anthropic" ? "https://api.anthropic.com/v1" : "https://api.openai.com/v1";
  }
  return (cfg.endpoint || "").trim().replace(/\/+$/, "");
}

function kindOf(cfg) {
  if (cfg.mode === "local") return cfg.flavor === "ollama" ? "ollama" : "openai";
  return cfg.provider === "anthropic" ? "anthropic" : "openai";
}

function modelListUrl(cfg) {
  const base = endpointBase(cfg);
  const kind = kindOf(cfg);
  if (kind === "ollama") return base + "/api/tags";
  if (kind === "anthropic") return (/\/v1$/.test(base) ? base : base + "/v1") + "/models";
  const hasPath = new URL(base).pathname !== "/";
  return (hasPath ? base : base + "/v1") + "/models";
}

function modelHeaders(cfg) {
  const headers = {};
  if (!cfg.apiKey) return headers;
  if (kindOf(cfg) === "anthropic") {
    headers["x-api-key"] = cfg.apiKey;
    headers["anthropic-version"] = "2023-06-01";
  } else {
    headers["Authorization"] = "Bearer " + cfg.apiKey;
  }
  return headers;
}

// openai-style {data:[{id}]} + ollama-style {models:[{name}]} listings - PreYem
function parseModelIds(json) {
  const ids = [];
  for (const entry of json.data || []) {
    if (entry && typeof entry.id === "string") ids.push(entry.id);
  }
  for (const entry of json.models || []) {
    if (!entry) continue;
    const name = entry.name || entry.model;
    if (typeof name === "string") ids.push(name);
  }
  return ids;
}

function setModelOptions(ids, preferred) {
  while (modelSelect.firstChild) modelSelect.removeChild(modelSelect.firstChild);
  for (const id of ids) {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = id;
    modelSelect.appendChild(option);
  }
  const chosen = ids.indexOf(preferred) >= 0 ? preferred : ids.length ? ids[0] : null;
  for (const option of modelSelect.options) option.selected = option.value === chosen;
}

// GET the server's model list; the page is privileged so no Reddit-origin CORS is involved.
// Chromium gates this host by host_permissions (granted below for anything else) - PreYem
function fetchModelIds(cfg, callback) {
  fetch(modelListUrl(cfg), { headers: modelHeaders(cfg) })
    .then((response) => {
      if (!response.ok) {
        callback([]);
        return;
      }
      response.json().then(
        (json) => callback(parseModelIds(json)),
        () => callback([]),
      );
    })
    .catch(() => callback([]));
}

// Manifest pre-grants these origins, so a permission prompt is only needed for others
const PRE_GRANTED = ["http://localhost/*", "http://127.0.0.1/*", "https://api.openai.com/*", "https://api.anthropic.com/*"];

function originPattern(endpoint) {
  const url = new URL(endpoint);
  return url.protocol + "//" + url.hostname + "/*";
}

// Must be called synchronously from inside a click handler (user gesture requirement)
function requestEndpointAccess(endpoint, callback) {
  if (!endpoint || !isValidEndpoint(endpoint)) {
    callback(true); // Cloud/pre-configured providers don't gate on a typed endpoint
    return;
  }
  const pattern = originPattern(endpoint);
  if (PRE_GRANTED.includes(pattern)) {
    callback(true);
    return;
  }
  chrome.permissions.request({ origins: [pattern] }, (granted) => {
    if (chrome.runtime.lastError || !granted) {
      setStatus("error", "Access to " + pattern + " was not granted, so Chromium can't reach this server.");
      callback(false);
      return;
    }
    callback(true);
  });
}

function persist(settings) {
  chrome.storage.local.set({ [SETTINGS_KEY]: settings }, () => {
    setStatus("ok", "Saved. These persist across sessions and browser restarts.");
  });
}

modeSelect.addEventListener("change", showSections);
providerSelect.addEventListener("change", showSections);

// Reflect saved settings in the form on page load (the browser can reopen this page anytime)
chrome.storage.local.get(SETTINGS_KEY, (data) => {
  const saved = data[SETTINGS_KEY];
  if (!saved || saved.v !== SETTINGS_VERSION) {
    setStatus("info", "No settings saved yet — cloud mode in use.");
    return;
  }
  modeSelect.value = saved.mode;
  providerSelect.value = saved.provider || "openai";
  flavorSelect.value = saved.flavor || "openai";
  endpointInput.value = saved.endpoint || "";
  apiKeyInput.value = saved.apiKey || "";
  setModelOptions(saved.model ? [saved.model] : [], saved.model);
  showSections();
  setStatus("ok", "Saved settings loaded — mode: " + modeLabel(saved.mode) + ".");

  // Refresh the model dropdown straight from the server when possible
  if (saved.mode !== "cloud" && isValidEndpoint(endpointInput.value)) {
    fetchModelIds(formConfig(), (ids) => {
      if (ids.length) setModelOptions(ids, saved.model);
    });
  }
});

saveButton.addEventListener("click", () => {
  const mode = modeSelect.value;
  const endpoint = endpointInput.value.trim();
  const apiKey = apiKeyInput.value.trim();
  const model = modelSelect.value;

  if (mode === "api") {
    const provider = providerSelect.value;
    if (provider === "other" && !isValidEndpoint(endpoint)) {
      setStatus("error", "An OpenAI-compatible 'other' provider needs a valid http(s) endpoint URL first.");
      return;
    }
    if (!apiKey) {
      setStatus("error", "AI Cloud Provider mode needs the provider's API key before saving.");
      return;
    }
    if (!model) {
      setStatus("error", "Pick a model from the dropdown — run Test connection to load the list first.");
      return;
    }
    const settings = { v: SETTINGS_VERSION, mode, provider, apiKey, model };
    if (provider === "other") settings.endpoint = endpoint;
    requestEndpointAccess(provider === "other" ? endpoint : "", (granted) => {
      if (granted) persist(settings);
    });
    return;
  }

  if (mode === "local") {
    if (!isValidEndpoint(endpoint)) {
      setStatus("error", "Local mode needs a valid http(s) endpoint URL before saving.");
      return;
    }
    if (!model) {
      setStatus("error", "Pick a model from the dropdown — run Test connection to load the list first.");
      return;
    }
    const settings = { v: SETTINGS_VERSION, mode, flavor: flavorSelect.value, endpoint, model };
    if (apiKey) settings.apiKey = apiKey;
    requestEndpointAccess(endpoint, (granted) => {
      if (granted) persist(settings);
    });
    return;
  }

  persist({ v: SETTINGS_VERSION, mode: "cloud" });
});

testButton.addEventListener("click", () => {
  const cfg = formConfig();
  if (cfg.mode === "cloud") {
    setStatus("info", "Cloud mode uses the built-in backend — nothing to test here.");
    return;
  }
  const needsEndpoint = cfg.mode === "local" || cfg.provider === "other";
  if (needsEndpoint && !isValidEndpoint(cfg.endpoint)) {
    setStatus("error", "Type a valid http(s) endpoint URL first.");
    return;
  }

  requestEndpointAccess(needsEndpoint ? cfg.endpoint : "", (granted) => {
    if (!granted) return;
    setStatus("warn", "Testing connection…");

    fetch(modelListUrl(cfg), { headers: modelHeaders(cfg) })
      .then((response) => {
        if (response.ok) {
          response.json().then(
            (json) => {
              const ids = parseModelIds(json);
              if (ids.length) {
                setModelOptions(ids, cfg.model);
                setStatus("ok", "Connected — " + ids.length + (ids.length === 1 ? " model" : " models") + " found. Pick one, then Save.");
              } else {
                setStatus("warn", "Server answered but no models were listed — check the flavor/provider.");
              }
            },
            () => setStatus("warn", "Reached the server, but the model list isn't JSON — check the flavor/provider."),
          );
        } else if (response.status === 403) {
          setStatus(
            "error",
            "HTTP 403: the server refused the request. For Ollama, set OLLAMA_ORIGINS=chrome-extension://*,moz-extension://* and restart it.",
          );
        } else if (response.status === 404) {
          setStatus("warn", "HTTP 404: the server is reachable but that route doesn't exist. Check the flavor/provider and endpoint URL.");
        } else {
          setStatus("warn", "Reached the server but got HTTP " + response.status + " " + (response.statusText || ""));
        }
      })
      .catch(() => setStatus("error", "Not reachable: is the server running, and is the URL correct?"));
  });
});
