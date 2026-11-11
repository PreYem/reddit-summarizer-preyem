---
name: local-llm-settings
description: Use when touching the user's own-endpoint LLM flow — settings page, API flavor dropdown, LM Studio, Ollama, local model, thinking level, reasoning_effort, chat_template_kwargs, think field, rs_settings schema, 400-retry-strip policy, API key visibility toggle. Keywords: LM Studio, Ollama, local, flavor, thinking, settings page, endpoint, API key.
---

# Local / own-endpoint LLM mode (plans #18–#19)

Users summarize via their own LLM server or own API key instead of the Render cloud backend.

## Key files

- `extension/public/settings.html` + `settings.js` — dedicated settings page (NOT the popup).
- `extension/public/background.js` — privileged MV3 script: `buildRequest`, `runCustomLlm`, thinking fields, 400 retry.
- `extension/src/localLlm.ts` — content-side sender; reads settings, posts `LOCAL_LLM` message to background.
- `extension/src/api.ts` — routing between cloud and local/api paths.

## rs_settings schema (chrome.storage.local, key `rs_settings`)

- `SETTINGS_VERSION = 3`. v3 = per-source slots: `{ v, activeKey, slots }` where slot keys are `"cloud"`, `"api:openai"`, `"api:anthropic"`, `"api:other"`, `"local:openai"`, `"local:ollama"`; each slot keeps its own endpoint/apiKey/model/think. Switching provider/flavor restores THAT slot's fields. Mismatched `v` ⇒ default cloud.
- Three sources (`mode`): `cloud` (Render backend) | `api` (own provider key: openai/anthropic/other) | `local` (own server, `flavor`: `openai` `/chat/completions` or `ollama` `/api/chat` native).
- `think: "none"|"low"|"medium"|"high"`, local mode only, missing/invalid ⇒ none. Ollama UI shows only None/On ("On" stores `"low"`).

## Request mapping (background.js)

- openai-compat: low/med/high ⇒ `reasoning_effort: <level>`; none ⇒ `reasoning_effort: "none"` + `chat_template_kwargs: { enable_thinking: false }` (gpt-oss/Qwen3).
- ollama native: none ⇒ `think: false`; any level ⇒ `think: true`.
- 400 policy: retry ONCE with thinking fields stripped (`strippedOnce` guard, no loop); then existing error mapping.
- Never send `extension-frontend-key` to a user-provided URL; `Authorization: Bearer` only if user typed a key. Footer label `Your Local LLM | <model>` / `Your AI Cloud Provider | <model>`.
- Response: same 5-key schema; tolerant `extractJson` (first `{` → last `}`); retry-once on malformed JSON. Ollama `think:true` puts CoT in `message.reasoning`, answer in `message.content` — `callOnce` prefers content.
- Keep-alive ping in background.js: local models can stall minutes before first byte (MV3 service-worker timeout).

## Settings page UX details

- Save button gated: enabled in cloud mode, or only after a passing "Test connection" (`CONNECTION_FIELDS` invalidate the verified key on change).
- Model dropdown rebuilt from the server's model list (`/v1/models` openai-style, `/api/tags` ollama-style).
- Eye toggle (`rs-key-eye`): flips the SAME `<input>`'s type between `password` and `text`; reveal not persisted, resets hidden on reload.
- CORS + localhost mixed-content hints surfaced in settings UI; Chromium pre-allows localhost/127.0.0.1/api.openai.com/api.anthropic.com, other hosts ask permission once on Save/Test.
