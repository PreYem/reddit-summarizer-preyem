# Reddit Summarizer

A Chrome & Firefox browser extension that summarizes Reddit posts and analyzes community reactions with AI. Click the **AI Summary** button on any Reddit post to get instant insights.

## Quick Start

### Prerequisites
- Node.js v18+
- Anthropic API key ([get one here](https://console.anthropic.com))

### 1. Clone the repository
```bash
git clone https://github.com/PreYem/reddit-summarizer-preyem.git
cd reddit-summarizer-preyem
npm install
```

### 2. Set up the backend
```bash
cd express-backend
cp .env.example .env
```

Add your API key to `.env`:
```env
ANTHROPIC_API_KEY=sk-ant-...
```

### 3. Start the backend
```bash
# From express-backend/
npm run dev
# → Server runs on http://localhost:3000
```

### 4. Build the extension
```bash
# From extension/
npm run dev    # Watch mode (rebuilds on change)
npm run build  # Production build
```

### 5. Load in your browser

**Chrome:**
1. Go to `chrome://extensions`
2. Enable "Developer mode" (top-right)
3. Click "Load unpacked"
4. Select `extension/dist/chrome`

**Firefox:**
1. Go to `about:debugging`
2. Click "Load Temporary Add-on"
3. Select `extension/dist/firefox/manifest.json`

---

## What it does

- **Summarizes Reddit posts** — Extracts the main points from post text
- **Analyzes comments** — Shows community sentiment (Positive, Negative, Mixed, etc.)
- **One-click summary** — Click the "AI Summary" button and get results in a modal
- **Caches results** — Same post? Second click is instant (no API cost)

---

## License

MIT