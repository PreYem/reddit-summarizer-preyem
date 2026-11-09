# Project context — Reddit Summarizer (context file, 2026-11-09)

Mental model of the whole repo. Keep this in mind before making changes; verify against code, it may drift.

## What it is

A browser extension (Chromium + Gecko/Firefox) that injects an "AI Summary" button into open Reddit post pages. Clicking it scrapes the post + comments client-side, POSTs them to a small Express backend, which asks an LLM (Groq → Gemini → Claude fallback order) for a structured JSON summary shown in an in-page modal. The backend also keeps a rolling request log (latest 500 entries in `express-backend/data/request-log.json`) with a key-gated stats dashboard at `/summary-logs`.

## Two workspaces (npm workspaces at root, v1.1.0)

- `extension/` — TS + Vite + Tailwind v4, built twice into `dist/chromium` and `dist/gecko` (vite build + `copy-public.mjs` copies static assets incl. `background.js`, manifests, icons). `watch.mjs` drives the dev loop. Extension never fetches directly: content script → `chrome.runtime.sendMessage({type:"SUMMARIZE", data, backendUrl})` → `public/background.js` does the fetch with the hardcoded `extension-frontend-key` header.
- `express-backend/` — Node + Express 5 + TS via `ts-node-dev` (no compile step), dotenv. Runs on `PORT` (default 3000; deploy target is Render, hence the `trust proxy 1` handling).

## Data types

- `shared/types.ts` (JS twin `shared/types.js`) defines `SummarizeRequest` (`currentSubreddit, title, body, author, comments[], postUrl?`) and `SummarizeResponse` (`post, community, communityReaction, communityReactionBreakdown, subredditDescription, aiModel`). Backend re-exports them via `express-backend/src/types.ts`.

## Extension flow (`extension/src/`)

- `content.ts` — entry point. Only acts on `/comments/` post pages (MutationObserver re-injects on client-side navigation, 1.5s delay). `scrapePost()` reads shreddit DOM: `shreddit-post` attrs (`post-title`, `author`, `permalink`), body from `[id^="post-rtjson-content"] p` / `.md p`, up to 100 comments via `shreddit-comment` + `thingid`-matched content blocks, subreddit from URL path segment 2, canonical `postUrl = origin + permalink`. Button is injected before `shreddit-post-overflow-menu`.
- `summaryModal.ts` — per-tab-URL in-memory summary cache (avoids re-summarizing), button state machine (idle/loading/error), modal DOM built safely (no innerHTML for dynamic values; `buildHighlighted` / `buildBoldOpHandle`), Reddit light/dark theme detection via `theme-dark` class, footer has static links (preyem.me, GitHub, GitLab) + dynamic `aiModel` name.
- `modalReaction.ts` — reaction string → badge CSS class (6 labels incl. Overwhelmingly ±Positive/Negative, Mixed, Inconclusive).
- `api.ts` — thin wrapper posting through background.js; `VITE_BACKEND_URL` comes from `extension/.env`.
- Styles: `src/tailwind.css` + `public/styles.css` (rs-* class names).

## Backend flow (`express-backend/src/`)

- `index.ts` — route order on `/summarize` matters and is deliberate:
  0. log middleware (logs on response `close`, skips 403s so key-fail spam never enters log)
  1. `EXTENSION_KEY` header check FIRST (no fallback — unset key ⇒ everything 403)
  2. `express-rate-limit` per `req.ip`, 5/min
  3. daily quotas: 50/IP/day + 100/server/day for requests that actually hit a provider; counters live in the JSON file so they survive restarts; quota is rolled back on `close` if no provider ran
  4. `summarizeRouter`
  Also: `trust proxy` set to exactly 1 (Render hop), 200kb JSON body cap, `safePostUrl()` only links `https://*.reddit.com` URLs in the dashboard, `DEBUG_MODE=true` returns a static canned summary after 2s and skips quotas.
- `routes/summarize.ts` — validates/sanitizes: body sliced to 8k, comments ≤100 × 500 chars, but **title length is unvalidated** (known audit finding). Tries providers in order groq → google → anthropic, first success wins and `setProvider(request, name)` tags the request for logging; all-fail ⇒ 500.
- `services/groq-ai-prompt.ts`, `gemini-ai-prompt.ts`, `claude-ai-prompt.ts` — each builds the shared prompt, calls its SDK (models: `openai/gpt-oss-20b`, `gemini-2.5-flash`, `claude-haiku-4-5`), parses raw JSON out of the model text (groq strips `<think>` blocks/code fences), injects `aiModel` label.
- `services/buildPrompt.ts` — the whole contract lives here: strict JSON schema, hard word caps (post ≤80 words/5 sentences, community ≤30w, breakdown exactly 1 sentence ≤20w + "Based on X comments." when comments exist, subredditDescription ≤12w), "u/handle first then OP" rule, [deleted] author rule, no-invention rule. Prompt tuning = edit here.
- `services/requestLog.ts` — the JSON file is the single source of truth (no in-memory cache, reads are `readFileSync` on every call). Writes go through a serialized promise chain (`runAtomic`) to avoid interleaving; MAX_ENTRIES=500 (sized to cover a 90-day dashboard window). Holds `dailyCounters {day, server, perIp}` with UTC-day rollover. `getStats()` aggregates everything server-side (byDay/byHour/byStatus/byProvider/top lists/word stats). `clientIp()` takes leftmost XFF for *logging* (spoofable — known HIGH finding in `security-audit-plan.md`).
- `public/summary-logs/` — hand-rolled dashboard (`stats.html`, `script.js`, `style.css`), key first passed via `?key=` then kept in `sessionStorage`, sent as `?key=` on fetches. Static assets are served **before** the key check (deliberate).

## Log-view endpoints (all need `LOG_VIEW_KEY`)

- `GET /summary-logs` → dashboard HTML; `GET /summary-logs/data` → aggregated stats; `GET /latest-requests` → raw entries; `DELETE /summary-logs` → clears entries but **keeps daily counters**.

## Env config (express-backend/.env, gitignored)

`GROQ_API_KEY, GEMINI_API_KEY, ANTHROPIC_API_KEY, PORT, EXTENSION_KEY, LOG_VIEW_KEY, DEBUG_MODE`. Providers fall back in order, so only one key is strictly required. Install scripts (`windows_*`/`linux_*` at root) create it from `.env.example` and build both extension targets.

## Conventions in this repo

- Comments everywhere are author-style notes ending in `- PreYem`; important ones encode gotchas (trust-proxy, ordering, cacheless reads). Preserve that style on edits.
- `shared/types.js` mirrors `types.ts` — keep both in sync when changing the contract.
- The extension key is hardcoded in `public/background.js` and ships in the bundle (accepted tradeoff; only gates 100 AI calls/day).
- Existing plans to read before touching security/log code: `security-audit-plan.md` (findings, unfixed: spoofable XFF, unbounded title, poisoned write-queue, concurrent read race, perIp key bloat), `post-url-log-plan.md` (implemented: postUrl in log + clickable dashboard rows), `1793590756408-tidy-mountain.md`.

## Deployment shape

Backend runs on Render (single proxy hop), local dev on localhost:3000 with `windows_start_dev_server.bat`/`linux_start_dev_server.sh` running both workspaces; extension loads unpacked from `dist/chromium` or `dist/gecko`.
