# Reddit Summarizer

**Get the gist of any Reddit thread in one click.** AI summaries of the post and its top comments, plus the community's overall reaction, written by the model _you_ choose.

![Version](https://img.shields.io/badge/version-1.8.0-ff4500)
![Chromium](https://img.shields.io/badge/Chromium-supported-3988ff)
![Gecko](https://img.shields.io/badge/Firefox%20%2F%20Gecko-supported-ff7139)
![TypeScript](https://img.shields.io/badge/TypeScript-3178c6?logo=typescript&logoColor=white)
![Languages](https://img.shields.io/badge/languages-11-0e8a16)

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/hidbganfakecbfakodiccnabgpdigfdp?label=Chrome%20Web%20Store&logo=chromewebstore&logoColor=white&color=4285f4)](https://chromewebstore.google.com/detail/reddit-summarizer/hidbganfakecbfakodiccnabgpdigfdp)
[![Firefox Add-ons](https://img.shields.io/badge/Firefox%20Add-ons-ff7139?logo=firefox&logoColor=white)](https://addons.mozilla.org/en-GB/firefox/addon/reddit-summarizer/)

[Features](#features) · [Requirements](#requirements) · [Setup](#setup) · [Stats dashboard](#stats-dashboard) · [Good to know](#good-to-know) · [Privacy](#privacy-support-and-credits)

![An AI summary of a Reddit post, shown in a modal over the thread](extension/public/store-screenshots/summary_01.png)

| Popup                                                                | Settings page                                                                                                                    |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| ![The extension popup](extension/public/store-screenshots/popup.png) | ![The settings page with Cloud, AI Cloud Provider and Local server sources](extension/public/store-screenshots/SettingsPage.png) |

## What it is

A browser extension that injects an **AI Summary** button into Reddit post pages. Click it and the add-on scrapes the post + up to 100 comments, sends them to an AI of your choice, and shows a structured modal: what OP said, what the community said, a reaction label (Positive / Negative / Mixed…), and a "Based on N comments." line rendered from the real scraped count. Works on Chromium (Chrome, Edge, Brave…) and Gecko (Firefox, Waterfox…), with the popup/settings styled in Tailwind CSS compiled at build time — no CDN, works offline.

## Features

- **Structured summaries.** Post body, top comments and community discussion, plus a labelled reaction badge.
- **Bring your own AI.** Three sources, chosen on the settings page: `Cloud` (this repo's backend, Groq → Gemini → Anthropic fallback), `AI Cloud Provider` (OpenAI, Anthropic, or any OpenAI-compatible service at your URL), or `Local server` (LM Studio, Ollama, llama.cpp — your post data never leaves your machine). Same prompt, same structured output.
- **Model auto-detection.** The model dropdown is filled from your server's model list (`/models`, Anthropic `/v1/models`, Ollama `/api/tags`) — you never type a model name.
- **11 languages.** UI (button + modal) and the summary itself: English, French, Spanish, German, Italian, Portuguese, Dutch, Arabic, Hindi, Japanese, Korean. UI language and Summary language are separate settings; the popup and settings page stay English.
- **Caching, cancelling, clean errors.** Repeat clicks replay the cached modal for free; in-flight requests can be cancelled (and are auto-cancelled on tab close, so local servers stop generating); failures open an error modal with provider, model and HTTP details, and are never cached.
- **Pre-built, or build yourself.** Install from the [Chrome Web Store](https://chromewebstore.google.com/detail/reddit-summarizer/hidbganfakecbfakodiccnabgpdigfdp) or [Firefox Add-ons](https://addons.mozilla.org/en-GB/firefox/addon/reddit-summarizer/), or run the self-hosted backend below for full control.

## Requirements

- Node.js 18+ and npm 8+
- The key(s) of the provider(s) you want the backend to use: [Groq](https://console.groq.com/), [Google Gemini](https://aistudio.google.com/apikey) and/or [Anthropic](https://console.anthropic.com/) — providers are tried in that order, so one key is enough
- (Local/own-API modes need none of these — just your own server or key)

## Setup

### 1. Clone the repo

```bash
git clone https://github.com/PreYem/reddit-summarizer-preyem.git
cd reddit-summarizer-preyem
```

### 2. Run the install script

One-time setup: installs dependencies for both workspaces, creates `express-backend/.env` from `.env.example`, and builds the extension for both browsers.

- **Windows:** double-click `windows_install_project.bat` (or run it in a terminal)
- **Linux:** `chmod +x linux_install_project.sh && ./linux_install_project.sh`

### 3. Fill `express-backend/.env`

```env
GROQ_API_KEY=your_key_here
GEMINI_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here
PORT=3000
EXTENSION_KEY=your_shared_key_here
LOG_VIEW_KEY=your_stats_dashboard_key_here
DEBUG_MODE=false
```

`EXTENSION_KEY` is a shared secret the backend checks before rate limiting and logging — the extension must send the same value. `LOG_VIEW_KEY` guards the log/dashboard endpoints. `DEBUG_MODE=true` returns a canned summary after a delay, for testing without spending AI tokens.

### 4. Load the extension

The build lands in `extension/dist/`:

- **Chromium:** `chrome://extensions` → Developer mode → **Load unpacked** → `extension/dist/chromium`
- **Gecko:** `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → any file in `extension/dist/gecko`

Rebuild after code changes with `npm run build` from the `extension` directory. The `version` field in the manifests (currently `1.8.0`) is what browsers/stores see — bump it on each release.

### 5. Run backend + extension dev server together

- **Windows:** `windows_start_dev_server.bat`
- **Linux:** `chmod +x linux_start_dev_server.sh && ./linux_start_dev_server.sh`

The backend starts on `http://localhost:3000`. From the project root you can also just run `npm run dev:all`.

## Stats dashboard

While the backend is running:

```
http://localhost:3000/summary-logs?key=<LOG_VIEW_KEY>
```

It shows KPIs, a daily usage chart (7d/30d/90d), status mix, provider split, hourly distribution, top subreddits/authors/IPs and the latest-requests table. Raw endpoints (same key, via `?key=`): `GET /summary-logs/data` (aggregated stats), `GET /latest-requests` (raw entries), `DELETE /summary-logs` (clears entries, keeps quota counters).

## Good to know

- The backend must be running before you use the extension in `Cloud` mode; `Local server` mode needs your own server instead.
- Requests run from the extension's own background page, so your server needs **no CORS headers** for the extension origin. In Chromium, `localhost`/`127.0.0.1` are pre-approved; any other host gets a one-time permission prompt on Save/Test (Chromium can't reach arbitrary LAN hosts; Firefox can). Ollama users: start it with `OLLAMA_ORIGINS=chrome-extension://*,moz-extension://*` if it answers 403.
- Daily quota counters live in `express-backend/data/request-log.json` so they survive restarts and deploys; `DELETE /summary-logs` does not reset them.

## Privacy, support and credits

- **Privacy:** see [PRIVACY.md](PRIVACY.md). In Local mode your post data never leaves your machine, and API keys are never collected or stored by this project.
- **Found a bug?** [Open an issue](https://github.com/PreYem/reddit-summarizer-preyem/issues).
- **Like it?** Optional contributions help support future updates and keep the extension free: [paypal.me/preyem](https://paypal.me/preyem).

---

Built by [PreYem](https://preyem.me/) · [GitHub](https://github.com/PreYem) · [GitLab](https://gitlab.com/PreYem)
