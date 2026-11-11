---
name: request-logging
description: Use when working on the express-backend request logging, the stats dashboard, quota caps, or dev-server scripts — data/request-log.json ring buffer, logged fields, /summary-logs routes, daily counters, EXTENSION_KEY. Keywords: dashboard, request log, backend, stats, quota, requestLog.ts, summarize route.
---

# Backend request logging + stats dashboard (express-backend)

## Key files

- `express-backend/src/services/requestLog.ts` — ring buffer persisted to `data/request-log.json`; `MAX_ENTRIES = 500`.
- `express-backend/src/index.ts` — Express app: rate limits, quota gates, dashboard routes.
- `express-backend/src/routes/summarize.ts` — the `/summarize` route (cloud path only).
- `express-backend/src/services/{groq,gemini,claude}-ai-prompt.ts` — provider fallback chain.
- `express-backend/public/summary-logs/` — static dashboard page.

## Log entry fields

`{ id, timestamp, ip, userAgent, method, path, status, provider?, post: { title, bodyPreview(50 chars), wordCount, subreddit, author, postUrl? } }`. File is read directly on every access (no in-memory cache) so manual edits show up; writes are serialized via a promise queue.

## Quota system (index.ts)

- Rate limit: 5 req / 60 s. Per-IP daily cap 50 real (AI) requests; server-wide daily hard cap 100, UTC-day reset — counters live in `requestLog.ts` so they survive restarts/deploys. Rollback on quota-exceeded paths.
- `trust proxy` set to exactly 1 (Render hop) — never `true`, clients could forge IP via `X-Forwarded-For`. Verify with a curl test.
- `EXTENSION_KEY` env (no hardcoded fallback) gates the summarize route; key check runs BEFORE rate limiting/logging.

## Dashboard routes

- `GET /summary-logs` → static dashboard html; `GET /summary-logs/data` → raw log JSON; `GET /latest-requests` → recent entries.
- `requestLog.ts getStats()` aggregates per-day/per-hour counts, ok/failed status, provider/subreddit/author/ip/UA counts. `clearLog()` supported.

## Dev server / scripts

- `express-backend` dev: `ts-node-dev --respawn --watch .env src/index.ts`, port from `process.env.PORT` (default 3000). Extension dev: `node watch.mjs`. Root: `npm run dev:all` via `concurrently`. Extension vite build per target: `build:chromium`/`build:gecko` + `copy-public.mjs`.
