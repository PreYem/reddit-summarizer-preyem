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
- **AI** — Anthropic Claude (claude-haiku) or OpenRouter as a drop-in alternative

---

## Getting started

### Prerequisites

- Node.js 18+
- npm 8+
- An [Anthropic API key](https://console.anthropic.com/) or an [OpenRouter API key](https://openrouter.ai/)

### 1. Clone the repo

```bash
git clone https://github.com/PreYem/reddit-summarizer-preyem.git
cd reddit-summarizer-preyem
```

### 2. Install dependencies

From the root of the project (installs all workspaces):

```bash
npm install
```

### 3. Configure the backend

```bash
cd express-backend
cp .env.example .env
```

Open `.env` and add your API key:

```
ANTHROPIC_API_KEY=your_key_here
```

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