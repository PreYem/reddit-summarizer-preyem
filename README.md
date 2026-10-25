# Reddit Summarizer

A browser extension that summarizes Reddit posts and their comment sections using AI. Open any Reddit thread, click AI Summary button, and get a structured breakdown of what OP said, what the community thought, and the overall reaction — without reading through hundreds of comments.

## What it does

- Summarizes the post body in a few concise sentences
- Summarizes the top comments and community discussion
- Labels the community reaction (Positive, Negative, Mixed, etc.)
- Works on both Chromium-based (Chrome, Edge, Brave...etc) and Gecko-based browsers (Firefox, Waterfox, Librewolf...etc) and Firefox

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
DEBUG_MODE=false
```

Providers are tried in order (Groq → Gemini → Anthropic), so you only need the key for the provider you actually want to rely on.

`EXTENSION_KEY` is a shared secret the backend checks before rate limiting and logging; the extension must send the same value.
Set `DEBUG_MODE=true` to return a static response with a delay, avoiding AI token usage while testing frontend features.

### 4. Build the extension

The install script already built both targets. To rebuild after code changes, from the `extension` directory:

```bash
npm run build        # both Chromium and Gecko builds
```

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

## Notes

- Make sure the backend is running before using the extension
- The extension reads the current Reddit tab — navigate to any Reddit post and click the injected AI Summary button to summarize it
- Requests are rate limited per IP, with a server-wide daily cap that resets on UTC-day boundaries; quotas are skipped only in local debug mode