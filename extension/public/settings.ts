// #18 settings page script - PreYem
// Extension pages forbid inline JS, so this file wires everything up. It is authored in TS
// but transpiled to plain settings.js at build time (copy-public.mjs), which is the name
// settings.html loads.
// NOTE: chrome.storage keys cannot contain dots, so plan #18's `rs.settings` notation is
// stored as `rs_settings` here (same key the content scripts read in localLlm.ts).
// v2 schema: three sources — cloud | api (own provider key) | local (own server).

const SETTINGS_KEY = "rs_settings";
// v3: per-source slots — every provider/flavor combo keeps its own endpoint/key/model/think,
// so switching source on the page (or after saving) repopulates THAT source's fields - PreYem
const SETTINGS_VERSION = 3;

const modeSelect = document.getElementById("rs-mode");
const providerSelect = document.getElementById("rs-provider");
const flavorSelect = document.getElementById("rs-flavor");
const endpointInput = document.getElementById("rs-endpoint");
const apiKeyInput = document.getElementById("rs-api-key");
const modelSelect = document.getElementById("rs-model");
const saveButton = document.getElementById("rs-save");
const saveHint = document.getElementById("rs-save-hint");
const testButton = document.getElementById("rs-test");
const statusLine = document.getElementById("rs-status");
const thinkSelect = document.getElementById("rs-think");
const keyEyeButton = document.getElementById("rs-key-eye");
const keyEyeSlash = document.getElementById("rs-key-eye-slash");
const sections = {
  api: document.getElementById("sec-api"),
  local: document.getElementById("sec-local"),
  server: document.getElementById("sec-server"),
  key: document.getElementById("sec-key"),
  model: document.getElementById("sec-model"),
  think: document.getElementById("sec-think"),
};
const resetButton = document.getElementById("rs-reset");

// Slots shape: { "api:openai": {apiKey, model}, "api:other": {endpoint, apiKey, model},
// "local:ollama": {endpoint, apiKey?, model, think?}, ... } + activeKey = last saved source - PreYem
let savedSlots = {};

// #19 thinking level: missing/invalid storage value means "none" (no schema bump) - PreYem
const THINK_VALUES = ["none", "low", "medium", "high"];

// Ollama's native /api/chat only does think true/false — the level select is replaced by
// None/On, and "On" stores "low" (background maps anything != none to think:true) - PreYem
function setThinkOptions(preferred) {
  while (thinkSelect.firstChild) thinkSelect.removeChild(thinkSelect.firstChild);
  const options =
    flavorSelect.value === "ollama"
      ? [
          ["none", "None - off (Recommended)"],
          ["low", "On - thinking enabled"],
        ]
      : [
          ["none", "None - off (Recommended)"],
          ["low", "Low"],
          ["medium", "Medium"],
          ["high", "High"],
        ];
  for (const entry of options) {
    const option = document.createElement("option");
    option.value = entry[0];
    option.textContent = entry[1];
    thinkSelect.appendChild(option);
  }
  const allowed = options.map((entry) => entry[0]);
  const chosen = allowed.includes(preferred) ? preferred : "none";
  for (const option of thinkSelect.options) option.selected = option.value === chosen;
}

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
  sections.think.hidden = mode !== "local";
  // #23: Cloud's built-in backend has nothing to ping, so the Test button disappears
  // there — it shows again whenever the user picks their own provider or local server - PreYem
  testButton.hidden = mode === "cloud";
}

function formConfig() {
  return {
    mode: modeSelect.value,
    provider: providerSelect.value,
    flavor: flavorSelect.value,
    endpoint: endpointInput.value.trim(),
    apiKey: apiKeyInput.value.trim(),
    model: modelSelect.value,
    think: thinkSelect.value,
  };
}

// ---- #20 Save gate + #24 post-save cooldown: Save stays disabled until Test connection
// passes for the CURRENT connection fields (Cloud needs no test). Once Save is clicked it
// disables itself again until the config actually changes (a field or model/think edit), so
// a second click can't re-save the identical state - PreYem

// Fingerprint of the connection fields the last successful Test actually exercised
let verifiedKey = null;
// Full signature (incl. model/think) of the exact config the last Save stored; Save is
// disabled again right after clicking it so a second click can't re-save unchanged - PreYem
let savedSignature = null;

// Editing any of these invalidates a passed Test. Model and Thinking are left out on purpose:
// picking a model right after Test is the normal flow and must not force a second Test —
// they only force a re-Test when a config has already been Saved (#24) - PreYem
const CONNECTION_FIELDS = [modeSelect, providerSelect, flavorSelect, endpointInput, apiKeyInput];

function connectionKey(cfg) {
  return JSON.stringify([cfg.mode, cfg.provider, cfg.flavor, cfg.endpoint, cfg.apiKey]);
}

// Full state incl. model/think so a model/think toggle counts as "changed" for the post-save
// cooldown - PreYem
function fullSignature(cfg) {
  return JSON.stringify([cfg.mode, cfg.provider, cfg.flavor, cfg.endpoint, cfg.apiKey, cfg.model, cfg.think]);
}

function updateSaveState() {
  const cfg = formConfig();
  const tested = cfg.mode === "cloud" || verifiedKey === connectionKey(cfg);
  const notAlreadySaved = fullSignature(cfg) !== savedSignature;
  const allowed = tested && notAlreadySaved;

  saveButton.disabled = !allowed;
  saveButton.title = tested
    ? (allowed ? "" : "Saved — edit a field (or model) then Test to save again")
    : "Run Test connection successfully first";

  // The hint element is optional in the settings HTML.
  if (saveHint) {
    saveHint.hidden = allowed;
  }
}

// An edit that locks Save also clears the stale "Connected" message so the page doesn't contradict itself
function onConnectionEdit() {
  const wasEnabled = !saveButton.disabled;
  updateSaveState();
  if (wasEnabled && saveButton.disabled) {
    setStatus("info", "Connection settings changed - Test the  connection to enable Save.");
  }
}

for (const field of CONNECTION_FIELDS) {
  field.addEventListener("input", onConnectionEdit);
  field.addEventListener("change", onConnectionEdit);
}

// Mirrors extension/public/background.ts: same base URL + request kind rules, used
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

// Manifest pre-grants only these origins; OpenAI/Anthropic are NOT in host_permissions, so
// #23 they go through the optional-host permission prompt instead of faking a grant - PreYem
const PRE_GRANTED = ["http://localhost/*", "http://127.0.0.1/*"];

// Built-in base for the named API providers (used to request access for their origin)
function providerEndpoint(cfg) {
  if (cfg.mode !== "api" || cfg.provider === "other") return "";
  return cfg.provider === "anthropic" ? "https://api.anthropic.com/v1" : "https://api.openai.com/v1";
}

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

// v3: the Save button stores per-source slots ({api:openai: {...}, local:ollama: {...}})
// plus the activeKey, so switching provider/flavor restores THAT source's own fields
// (a saved OpenAI key never gets clobbered by an Anthropic key or a local URL) - PreYem
function currentKey() {
  if (modeSelect.value === "api") return "api:" + providerSelect.value;
  if (modeSelect.value === "local") return "local:" + flavorSelect.value;
  return "cloud";
}

function persist(settings) {
  const key = settings.mode === "cloud" ? "cloud" : settings.mode + ":" + (settings.mode === "api" ? settings.provider : settings.flavor);
  const slots = Object.assign({}, savedSlots);
  const slot = Object.assign({}, settings);
  delete slot.v;
  slots[key] = slot;
  chrome.storage.local.set({ [SETTINGS_KEY]: { v: SETTINGS_VERSION, activeKey: key, slots } }, () => {
    savedSlots = slots;
    savedSignature = fullSignature(formConfig());
    updateSaveState(); // #24: the Save just consumed itself → button greys out until a change
    setStatus("ok", "Saved. These persist across sessions and browser restarts.");
  });
}

// #21 repopulate the visible form from the slot of the currently selected source, so
// switching Source/Provider/API flavor shows that source's own saved key/URL/model - PreYem
function applySlot() {
  const slot = savedSlots[currentKey()] || {};
  endpointInput.value = slot.endpoint || "";
  apiKeyInput.value = slot.apiKey || "";
  setThinkOptions(slot.think);
  setModelOptions(slot.model ? [slot.model] : [], slot.model);
  const cfg = formConfig();
  if (cfg.mode !== "cloud" && isValidEndpoint(cfg.endpoint)) {
    fetchModelIds(cfg, (ids) => {
      if (ids.length) setModelOptions(ids, slot.model || cfg.model);
    });
  }
}

modeSelect.addEventListener("change", () => {
  showSections();
  applySlot();
});
providerSelect.addEventListener("change", () => {
  showSections();
  applySlot();
});
// Flavor change rebuilds the thinking dropdown (ollama = None/On only) via applySlot - PreYem
flavorSelect.addEventListener("change", () => {
  showSections();
  applySlot();
});

// #24: once a config has been Saved, toggling the model or thinking counts as a change
// — it clears the passed Test so Save only re-arms after a fresh Test for the new pick.
// Before any Save exists (savedSignature null), picking a model right after Test stays
// the normal free flow - PreYem
function onModelEdit() {
  if (savedSignature) {
    verifiedKey = null;
    updateSaveState();
  }
}
modelSelect.addEventListener("change", onModelEdit);
thinkSelect.addEventListener("change", onModelEdit);

// Eye toggle: password inputs never render their typed value, so the button flips the
// SAME input's type (the value stays in the element, no retyping) and hides the slash.
// Reveal state is deliberately not persisted — hidden again on every page load.
// This fires no input/change event, so it never counts as an edit - PreYem
keyEyeButton.addEventListener("click", () => {
  const revealed = apiKeyInput.type === "password";
  apiKeyInput.type = revealed ? "text" : "password";
  keyEyeSlash.style.display = revealed ? "none" : "inline-block";
});

showSections();
updateSaveState();

// Reflect saved settings in the form on page load (the browser can reopen this page anytime)
chrome.storage.local.get(SETTINGS_KEY, (data) => {
  const saved = data[SETTINGS_KEY];
  if (!saved || saved.v !== SETTINGS_VERSION) {
    setStatus("info", "No settings saved yet - cloud mode in use.");
    showSections();
    updateSaveState();
    return;
  }
  savedSlots = saved.slots || {};
  const activeKey = saved.activeKey || "cloud";
  const parts = activeKey.split(":");
  if (parts[0] === "api") {
    modeSelect.value = "api";
    providerSelect.value = parts[1] || "openai";
  } else if (parts[0] === "local") {
    modeSelect.value = "local";
    flavorSelect.value = parts[1] || "openai";
  } else {
    modeSelect.value = "cloud";
  }
  applySlot();
  showSections();
  updateSaveState(); // loaded values count as untested, so API/Local start with Save locked
  setStatus("ok", "Saved settings loaded - mode: " + modeLabel(modeSelect.value) + ".");

  // Refresh the model dropdown straight from the server when possible
  if (modeSelect.value !== "cloud" && isValidEndpoint(endpointInput.value)) {
    fetchModelIds(formConfig(), (ids) => {
      if (ids.length) setModelOptions(ids, savedSlots[activeKey] && savedSlots[activeKey].model);
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
      setStatus("error", "Pick a model from the dropdown - run Test connection to load the list first.");
      return;
    }
    const settings = { v: SETTINGS_VERSION, mode, provider, apiKey, model };
    if (provider === "other") settings.endpoint = endpoint;
    requestEndpointAccess(provider === "other" ? endpoint : providerEndpoint({ mode, provider }), (granted) => {
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
      setStatus("error", "Pick a model from the dropdown - run Test connection to load the list first.");
      return;
    }
    const settings = { v: SETTINGS_VERSION, mode, flavor: flavorSelect.value, endpoint, model };
    if (apiKey) settings.apiKey = apiKey;
    const think = THINK_VALUES.includes(thinkSelect.value) ? thinkSelect.value : "none";
    if (think !== "none") settings.think = think;
    requestEndpointAccess(endpoint, (granted) => {
      if (granted) persist(settings);
    });
    return;
  }

  persist({ v: SETTINGS_VERSION, mode: "cloud" });
});

// #21 Reset: clear the dynamic fields (endpoint, key, model, thinking) back to their
// defaults and forget the saved slot for the CURRENT source — Source/Provider/API flavor
// stay as chosen. Other sources' saved slots are left untouched - PreYem
// #23: Guard the newest wiring so one bad element id can't stop the rest of the script
if (resetButton)
  resetButton.addEventListener("click", () => {
    endpointInput.value = "";
    apiKeyInput.value = "";
    while (modelSelect.firstChild) modelSelect.removeChild(modelSelect.firstChild);
    setThinkOptions(null); // rebuilds the dropdown for the current flavor, None selected
    const key = currentKey();
    const slots = Object.assign({}, savedSlots);
    delete slots[key];
    savedSlots = slots;
    chrome.storage.local.set({ [SETTINGS_KEY]: { v: SETTINGS_VERSION, activeKey: key, slots } }, () => {
      savedSlots = slots;
      savedSignature = null; // #24: nothing saved for this source now, so Save can arm again
      setStatus("info", "All fields reset to their defaults - nothing is saved for this source.");
    });
  });

const runTestConnection = () => {
  const cfg = formConfig();
  if (cfg.mode === "cloud") {
    setStatus("info", "Cloud mode uses the built-in backend - nothing to test here.");
    return;
  }
  const needsEndpoint = cfg.mode === "local" || cfg.provider === "other";
  if (needsEndpoint && !isValidEndpoint(cfg.endpoint)) {
    setStatus("error", "Type a valid http(s) endpoint URL first.");
    return;
  }

  requestEndpointAccess(needsEndpoint ? cfg.endpoint : providerEndpoint(cfg), (granted) => {
    if (!granted) return;
    // A new test starts from "not verified": if it fails, Save must end up locked even
    // when an earlier Test had passed for these same fields - PreYem
    verifiedKey = null;
    updateSaveState();
    setStatus("warn", "Testing connection…");

    fetch(modelListUrl(cfg), { headers: modelHeaders(cfg) })
      .then((response) => {
        if (response.ok) {
          response.json().then(
            (json) => {
              const ids = parseModelIds(json);
              if (ids.length) {
                setModelOptions(ids, cfg.model);
                // Verified for the fields as they were at click time: if the user edited
                // anything while the request ran, the keys differ and Save stays locked
                verifiedKey = connectionKey(cfg);
                updateSaveState();
                setStatus("ok", "Connected - " + ids.length + (ids.length === 1 ? " model" : " models") + " found. Pick one, then Save.");
              } else {
                setStatus("warn", "Server answered but no models were listed - check the flavor/provider.");
              }
            },
            () => setStatus("warn", "Reached the server, but the model list isn't JSON - check the flavor/provider."),
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
};

// #23: A Test click must never fail silently — anything that throws shows up in the
// status line instead of the button doing nothing - PreYem
testButton.addEventListener("click", () => {
  try {
    runTestConnection();
  } catch (error) {
    setStatus("error", "Test connection hiccup: " + (error.message || String(error)));
  }
});
