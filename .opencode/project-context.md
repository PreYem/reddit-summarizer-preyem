# Project context — Reddit Summarizer (context file, 2026-11-09, updated 2026-11-10 post-#18 rework)

Mental model of the whole repo. Keep this in mind before making changes; verify against code, it may drift.

## What it is

A browser extension (Chromium + Gecko/Firefox) that injects an "AI Summary" button into open Reddit post pages. Clicking it scrapes the post + comments client-side, POSTs them to a small Express backend, which asks an LLM (Groq → Gemini → Claude fallback order) for a structured JSON summary shown in an in-page modal. The backend also keeps a rolling request log (latest 500 entries in `express-backend/data/request-log.json`) with a key-gated stats dashboard at `/summary-logs`.

## Two workspaces (npm workspaces at root, v1.1.0)

- `extension/` — TS + Vite + Tailwind v4, built twice into `dist/chromium` and `dist/gecko` (vite build + `copy-public.mjs` copies static assets incl. `background.js`, `popup.html`, `popup.css`, `settings.html`, `settings.js`, `styles.css`, manifests, icons). `watch.mjs` drives the dev loop. Extension never fetches from the content bundle: cloud path = `chrome.runtime.sendMessage({type:"SUMMARIZE", data, backendUrl})`; own-API/local path = `{type:"LOCAL_LLM", settings, prompt}` — both handled by `public/background.js`, so the fetch never carries Reddit's origin/page CORS.
- `express-backend/` — Node + Express 5 + TS via `ts-node-dev` (no compile step), dotenv. Runs on `PORT` (default 3000; deploy target is Render, hence the `trust proxy 1` handling).

## Data types

- `shared/buildPrompt.ts` (#18) — the prompt contract moved out of the backend so extension and backend compile the identical prompt; `express-backend/src/services/buildPrompt.ts` is a re-export shim (same mirror pattern as `express-backend/src/types.ts`).
- `shared/types.ts` (JS twin `shared/types.js`) defines `SummarizeRequest` (`currentSubreddit, title, body, author, comments[], postUrl?`) and `SummarizeResponse` (`post, community, communityReaction, communityReactionBreakdown, subredditDescription, aiModel`). Backend re-exports them via `express-backend/src/types.ts`.

## Extension flow (`extension/src/`)

- `content.ts` — entry point. Only acts on `/comments/` post pages (MutationObserver re-injects on client-side navigation, 1.5s delay). `scrapePost()` reads shreddit DOM: `shreddit-post` attrs (`post-title`, `author`, `permalink`), body from `[id^="post-rtjson-content"] p` / `.md p`, up to 100 comments via `shreddit-comment` + `thingid`-matched content blocks, subreddit from URL path segment 2, canonical `postUrl = origin + permalink`. Button is injected before `shreddit-post-overflow-menu`. #22: click/Enter on the busy button → `cancelInFlight()` (userCancel flag → live-region acknowledgment on the CancelledError path; keyboardClickGuard swallows the UA-synthesized click after keyboard activation).
- `summaryModal.ts` — per-tab-URL in-memory summary cache (avoids re-summarizing; errors are NOT cached), button state machine (idle/loading; #21: no error state — failures open `showErrorModal`, a clone of the modal shell with Provider/Model/Error type/Message sections, same animation + ESC close; #22: button never disabled, loading label reads "Summarizing... (click to cancel)"), modal DOM built safely (no innerHTML for dynamic values; `buildHighlighted` / `buildBoldOpHandle`), Reddit light/dark theme detection via `theme-dark` class, footer has static links (preyem.me, GitHub, GitLab) + dynamic `aiModel` name.
- `modalReaction.ts` — reaction string → badge CSS class (6 labels incl. Overwhelmingly ±Positive/Negative, Mixed, Inconclusive).
- `api.ts` — thin wrapper posting through background.js; `VITE_BACKEND_URL` comes from `extension/.env`. Since #18: routes on saved settings — `mode !== "cloud"` → `summarizeLocally`, anything missing/invalid → cloud default.
- `localLlm.ts` (#18) — reads `storage.local` key `rs_settings` (chrome.storage keys can't contain dots, hence not plan's `rs.settings`). #21 v3 storage: `{v:3, activeKey, slots}` — the active slot is expanded back into the flat `LocalSettings` the background expects. Owns `LocalSummarizeError` (carries provider/model/kind for the #21 error modal) and `CancelledError` so `content.ts` shows real local-failure messages vs generic cloud ones and stays silent on cancellations.
- `public/background.js` — MV3 service worker: `SUMMARIZE` (cloud, hardcoded `extension-frontend-key`) + `LOCAL_LLM` (`runCustomLlm`: per-kind request builders openai-compat `/chat/completions`, ollama native `/api/chat` with `stream:false`, anthropic `/v1/messages` with `x-api-key`; one stricter JSON retry; `aiModel` = `Local | <model>` / `AI Cloud Provider | <model>`; keep-alive ping for slow local models). First-install auto-open of settings was removed on user request.
- `public/settings.html` + `public/settings.js` (copied verbatim, plain JS — extension pages forbid inline JS) — 3-source settings page (Cloud / AI Cloud Provider / Local server), per-mode `hidden` sections, model `<select>` auto-filled from the server's model list (`/models`, `/api/tags`, Anthropic `/v1/models`), Save + Test connection; `chrome.permissions.request` for hosts beyond the pre-granted ones. #23: Test button hidden in Cloud mode via `showSections()` (nothing to ping); test handler body extracted to `runTestConnection` and wrapped in try/catch so any exception lands in the status line instead of a silent click; Reset wiring null-guarded. Root cause of "Test does nothing" was a non-ASCII homoglyph typo in the `needsEndpoint` token at the `requestEndpointAccess` call site (valid JS identifier → passed `node --check` but threw `ReferenceError` at runtime). #23 also: `PRE_GRANTED` trimmed to the manifest's real grants (localhost/127.0.0.1 only — OpenAI/Anthropic live in `optional_host_permissions`), and Test + Save now request the built-in provider origin via `providerEndpoint()` so API-provider hosts actually get granted.
- Manifests (#18): `options_page` (chromium) / `options_ui open_in_tab` (gecko) → `settings.html`; `permissions:["storage"]`; `host_permissions` adds `http://localhost/*`, `http://127.0.0.1/*`, `https://api.openai.com/*`, `https://api.anthropic.com/*`. Popup links settings via `<a href="settings.html" target="_blank">` (extension-page relative link — works in both engines).
- Styles: `src/tailwind.css` + `public/styles.css` (rs-\* class names).

## Backend flow (`express-backend/src/`)

- `index.ts` — route order on `/summarize` matters and is deliberate: 0. log middleware (logs on response `close`, skips 403s so key-fail spam never enters log)
  1. `EXTENSION_KEY` header check FIRST (no fallback — unset key ⇒ everything 403)
  2. `express-rate-limit` per `req.ip`, 5/min
  3. daily quotas: 50/IP/day + 100/server/day for requests that actually hit a provider; counters live in the JSON file so they survive restarts; quota is rolled back on `close` if no provider ran
  4. `summarizeRouter`
     Also: `trust proxy` set to exactly 1 (Render hop), 200kb JSON body cap, `safePostUrl()` only links `https://*.reddit.com` URLs in the dashboard, `DEBUG_MODE=true` returns a static canned summary after 2s and skips quotas.
- `routes/summarize.ts` — validates/sanitizes: body sliced to 8k, comments ≤100 × 500 chars, but **title length is unvalidated** (known audit finding). Tries providers in order groq → google → anthropic, first success wins and `setProvider(request, name)` tags the request for logging; all-fail ⇒ 500.
- `services/groq-ai-prompt.ts`, `gemini-ai-prompt.ts`, `claude-ai-prompt.ts` — each builds the shared prompt, calls its SDK (models: `openai/gpt-oss-20b`, `gemini-2.5-flash`, `claude-haiku-4-5`), parses raw JSON out of the model text (groq strips `<think>` blocks/code fences), injects `aiModel` label.
- `services/buildPrompt.ts` — the whole contract lives here: strict JSON schema, hard word caps (post ≤80 words/5 sentences, community ≤30w, breakdown exactly 1 sentence ≤20w + "Based on X comments." when comments exist, subredditDescription ≤12w), "u/handle first then OP" rule, [deleted] author rule, no-invention rule. Prompt tuning = edit here.
- `services/requestLog.ts` — the JSON file is the single source of truth (no in-memory cache, reads are `readFileSync` on every call). Writes go through a serialized promise chain (`runAtomic`) to avoid interleaving; MAX_ENTRIES=500 (sized to cover a 90-day dashboard window). Holds `dailyCounters {day, server, perIp}` with UTC-day rollover. `getStats()` aggregates everything server-side (byDay/byHour/byStatus/byProvider/top lists/word stats). `clientIp()` takes leftmost XFF for _logging_ (spoofable — known HIGH finding in `security-audit-plan.md`).
- `public/summary-logs/` — hand-rolled dashboard (`stats.html`, `script.js`, `style.css`), key first passed via `?key=` then kept in `sessionStorage`, sent as `?key=` on fetches. Static assets are served **before** the key check (deliberate).

## Log-view endpoints (all need `LOG_VIEW_KEY`)

- `GET /summary-logs` → dashboard HTML; `GET /summary-logs/data` → aggregated stats; `GET /latest-requests` → raw entries; `DELETE /summary-logs` → clears entries but **keeps daily counters**.

## Env config (express-backend/.env, gitignored)

`GROQ_API_KEY, GEMINI_API_KEY, ANTHROPIC_API_KEY, PORT, EXTENSION_KEY, LOG_VIEW_KEY, DEBUG_MODE`. Providers fall back in order, so only one key is strictly required. Install scripts (`windows_*`/`linux_*` at root) create it from `.env.example` and build both extension targets.

## Conventions in this repo

- Comments everywhere are author-style notes ending in `- PreYem`; important ones encode gotchas (trust-proxy, ordering, cacheless reads). Preserve that style on edits.
- `shared/types.js` mirrors `types.ts` — keep both in sync when changing the contract.
- The extension key is hardcoded in `public/background.js` and ships in the bundle (accepted tradeoff; only gates 100 AI calls/day).
- Plans live in `.opencode/plans/` named with a `#N` prefix (`#17-…`, `#18-…`); #18's tail holds an addendum seeding a future "Thinking level" feature (off default; openai: `reasoning_effort` + `chat_template_kwargs.enable_thinking:false` when off; ollama: `think:false`; retry-without-those-fields on 400; no SETTINGS_VERSION bump — missing value = off).
- Existing plans to read before touching security/log code: `security-audit-plan.md` (findings, unfixed: spoofable XFF, unbounded title, poisoned write-queue, concurrent read race, perIp key bloat), `post-url-log-plan.md` (implemented: postUrl in log + clickable dashboard rows), `1793590756408-tidy-mountain.md`.

## Deployment shape

Backend runs on Render (single proxy hop), local dev on localhost:3000 with `windows_start_dev_server.bat`/`linux_start_dev_server.sh` running both workspaces; extension loads unpacked from `dist/chromium` or `dist/gecko`.
