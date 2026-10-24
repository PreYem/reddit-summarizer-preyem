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

### 2. Install dependencies

From the root of the project, run `npm install` once — it installs dependencies for both workspaces (the extension and the backend):

```bash
npm install
```

### 3. Configure the backend

On first run, copy `.env.example` to a new `.env` file and fill it with your own values:

```bash
cd express-backend
cp .env.example .env
```

Open `.env` and add the API key(s) for the provider(s) you want to use:

```
GROQ_API_KEY=your_key_here
GEMINI_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here
PORT=3000
```

Providers are tried in order (Groq → Gemini → Anthropic), so you only need the key for the provider you actually want to rely on.

### 4. Run the backend

```bash
# From the express-backend directory
npm run dev
```

The backend will start on `http://localhost:3000`.

### 5. Build the extension

```bash
# From the extension directory
cd ../extension

# Build for Chromium (Chrome, Edge, Brave)
npm run build:chromium

# Build for Firefox
npm run build:gecko
```

### 6. Load the extension in your browser
 
**Chromium:**
1. Go to `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `extension/dist/chromium` folder

**Gecko:**
1. Go to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select any file inside `extension/dist/gecko`


### 7. Run both backend and extension dev server together

From the project root:

```bash
npm run dev:all
```

---

## Notes

- Make sure the backend is running before using the extension
- The extension reads the current Reddit tab — navigate to any Reddit post and click the injected AI Summary button to summarize it