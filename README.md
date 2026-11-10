# Reddit Summarizer

A browser extension that summarizes Reddit posts and their comment sections using AI. Open any Reddit thread, click AI Summary button, and get a structured breakdown of what OP said, what the community thought, and the overall reaction — without reading through hundreds of comments.

## What it does

- Summarizes the post body in a few concise sentences
- Summarizes the top comments and community discussion
- Labels the community reaction (Positive, Negative, Mixed, etc.)
- Summarizes with your own LLM — your API key (OpenAI/Anthropic/custom) or a local server on your machine (LM Studio, Ollama, llama.cpp…) via a settings page — instead of the cloud backend, same prompt, same structured output
- Works on both Chromium-based browsers (Chrome, Edge, Brave, Opera...etc) and Gecko-based browsers (Firefox, Waterfox, Librewolf...etc)
- Logs every request attempt (up to the latest 500) to `express-backend/data/request-log.json`, including requester IP, user agent, status, provider, post info (with the canonical post URL), and full post word count — with a built-in stats dashboard (see below)

## Tech stack

- **Extension** — TypeScript, Vite, built for both Chromium and Gecko 
- **Backend** — Node.js, Express, TypeScript
- **AI** — Groq (`openai/gpt-oss-20b`), Google Gemini (`gemini-2.5-flash`) and Anthropic Claude (`claude-haiku-4-5`), tried in that order with fallback to the next provider if one fails

---

## Getting started

### Prerequisites

- Node.js 18+
- npm 8+
- API keys for the AI providers you want to enable: [Groq](https://console.groq.com/), [Google Gemini](https://aistudio.google.com/apikey) and/or [Anthropic](https://console.anthropic.com/)

### 1. Clone the repo

```bash
git clone https://github.com/PreYem/reddit-summarizer-preyem.git
cd reddit-summarizer-preyem
```

### 2. Run the install script

Run the one-time setup script from the project root — it installs dependencies for both workspaces, creates `express-backend/.env` from `.env.example`, and builds the extension for both browsers:

**Windows:** double-click `windows_install_project.bat` or run it in a terminal:

```bat
windows_install_project.bat
```

**Linux:** make it executable once, then run it:

```bash
chmod +x linux_install_project.sh
./linux_install_project.sh
```

### 3. Configure the backend

Open `express-backend/.env` (created by the install script) and fill it with your own values:

```
GROQ_API_KEY=your_key_here
GEMINI_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here
PORT=3000
EXTENSION_KEY=your_shared_key_here
LOG_VIEW_KEY=your_stats_dashboard_key_here
DEBUG_MODE=false
```

Providers are tried in order (Groq → Gemini → Anthropic), so you only need the key for the provider you actually want to rely on.

`EXTENSION_KEY` is a shared secret the backend checks before rate limiting and logging; the extension must send the same value.
`LOG_VIEW_KEY` protects the request-log endpoints (`/latest-requests`, `/summary-logs`, `/summary-logs/data`).
Set `DEBUG_MODE=true` to return a static response with a delay, avoiding AI token usage while testing frontend features.

### 4. Build the extension

The install script already built both targets. To rebuild after code changes, from the `extension` directory:

```bash
npm run build        # both Chromium and Gecko builds
```

The published version lives in `extension/public/manifest.chromium.json` and `manifest.gecko.json` (`version` field) — bump it whenever you ship an update so browsers/stores see a new release (currently `1.7.0`).

### 5. Load the extension in your browser
 
**Chromium:**
1. Go to `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `extension/dist/chromium` folder

**Gecko:**
1. Go to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select any file inside `extension/dist/gecko`


### 6. Run both backend and extension dev server together

Run the start script from the project root:

**Windows:** double-click `windows_start_dev_server.bat` or run it in a terminal:

```bat
windows_start_dev_server.bat
```

**Linux:**

```bash
chmod +x linux_start_dev_server.sh
./linux_start_dev_server.sh
```

The backend starts on `http://localhost:3000` and the extension dev server watches for changes.

---

## Settings page (cloud / AI Cloud Provider / local LLM)

The settings page (the add-on's options page) opens from the popup's "Open AI Settings" link or from your browser's add-on manager (it no longer opens automatically on install):

- **Source** — `Cloud` (default, the backend below), `AI Cloud Provider key` (OpenAI, Anthropic, or any OpenAI-compatible service at your own URL), or `Local server` (your own LLM — the post data never leaves your machine)
- Each source shows only the inputs it needs; the **model dropdown is auto-detected** from your server's model list (`/models`, Anthropic `/v1/models`, Ollama `/api/tags`) — you never type a model name
- **API key** is kept in extension storage only, sent as `Authorization: Bearer` (or `x-api-key` for Anthropic) to your configured provider and nowhere else
- **Save** persists across sessions/browser restarts; **Test connection** pings the model-list route and refills the dropdown
- All non-cloud paths send the exact same prompt as cloud (same 5-key schema, both sides compile the shared `buildPrompt`), and the modal footer reads `Local | <model>` or `AI Cloud Provider | <model>`

Notes:

- Requests run from the extension's own background page, so your server needs **no CORS headers** for the extension origin. In Chromium, `localhost`, `127.0.0.1`, `api.openai.com` and `api.anthropic.com` are pre-approved via `host_permissions`; any other host gets a one-time permission prompt on Save/Test (Chromium can't reach arbitrary LAN/IP hosts at all — Firefox can).
- Ollama still checks request origins: start it with `OLLAMA_ORIGINS=chrome-extension://*,moz-extension://*` if it answers 403.
- The prompt includes up to 100 comments — small context windows may choke small models; the extension retries once with a stricter JSON-only instruction, then shows the error toast (no silent cloud fallback).

---

## Request log & stats dashboard

Every request to `/summarize` is logged (up to the latest 500 entries, so a full 90-day window survives restarts) to `express-backend/data/request-log.json`: timestamp, IP, user agent, status, provider, and post info (title, body preview, full word count, subreddit, author, and the canonical post URL `postUrl` — only kept when it's a real `https://*.reddit.com` link, and rendered as a clickable title link in the dashboard).

While the backend is running, open the dashboard in a browser:

```
http://localhost:3000/summary-logs?key=<LOG_VIEW_KEY>
```

It shows KPIs (entries, total/avg/max words, first/last entry), daily usage chart with 7d/30d/90d ranges, status mix, provider split, hourly distribution, top subreddits/authors/IPs/user agents, and the latest requests table — with a manual Refresh button. The key is read from `?key=` on first load, kept in `sessionStorage`, and sent as a `?key=` query param on every fetch (no header needed).

Raw data endpoints (same key, via `?key=` param or `log-view-key` header):

- `GET /summary-logs/data` — aggregated stats JSON
- `GET /latest-requests` — raw JSON entries
- `DELETE /summary-logs` — clears the log file back to an empty array (daily quota counters are kept)

---

## Notes

- Make sure the backend is running before using the extension (cloud mode only — local mode needs your own server instead)
- The extension reads the current Reddit tab — navigate to any Reddit post and click the injected AI Summary button to summarize it
- Requests are rate limited per IP, with a server-wide daily cap that resets on UTC-day boundaries; quotas are skipped only in local debug mode
- Daily quota counters live in `request-log.json` (`dailyCounters`) so they survive restarts/deploys; clearing the log via `DELETE /summary-logs` does not reset them