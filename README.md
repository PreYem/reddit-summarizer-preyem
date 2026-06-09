# Reddit Summarizer

A Chrome extension that adds a **✦ Summarize** button to Reddit post pages. Click it to get an AI-generated summary of the post body and community reaction (comments), powered by Claude (Anthropic).

---

## How it works

```
Reddit page  ──►  Content script  ──►  Background service worker
                      scrapes post            proxies request
                                                    │
                                                    ▼
                                         Express backend (localhost)
                                                    │
                                                    ▼
                                          Anthropic Claude API
                                                    │
                                                    ▼
                                          Modal shown on page
```

1. The **content script** scrapes the post title, body text, and top comments.
2. It passes the data to a **background service worker** (to avoid CORS restrictions).
3. The service worker forwards the request to a local **Express backend**.
4. The backend validates the payload and calls the **Claude API** (`claude-haiku-4-5`).
5. The summary is returned and displayed in a modal overlay on the Reddit page.

---

## Project structure

```
reddit-summarizer-preyem/
├── extension/               # Chrome extension (TypeScript + Vite + crxjs)
│   ├── public/
│   │   └── manifest.json
│   └── src/
│       ├── content.ts       # Injected into Reddit pages; scrapes & triggers summary
│       ├── ui.ts            # Modal, button, and error UI helpers
│       └── api.ts           # Sends messages to the background worker
├── express-backend/         # Local Node/Express server (TypeScript)
│   └── src/
│       ├── index.ts         # Server entry point
│       ├── routes/
│       │   └── summarize.ts # POST /summarize — validates input, calls AI service
│       ├── services/
│       │   └── ai.ts        # Anthropic SDK wrapper
│       └── types.ts         # Re-exports shared types
├── shared/
│   └── types.ts             # SummarizeRequest / SummarizeResponse interfaces
└── package.json             # Workspace root
```

---

## Prerequisites

- **Node.js** v18+
- **npm** v9+ (workspaces support)
- An **Anthropic API key** — get one at [console.anthropic.com](https://console.anthropic.com)
- **A Chromium/Gecko based browser**

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/PreYem/reddit-summarizer-preyem.git
cd reddit-summarizer-preyem
npm install
```

### 2. Configure the backend

```bash
cd express-backend
cp .env.example .env   # or create .env manually
```

Add your API key to `.env`:

```env
ANTHROPIC_API_KEY=sk-ant-...
```

### 3. Start the backend

```bash
# from express-backend/
npm run dev
# → Express backend running on http://localhost:3000
```

### 4. Build the extension

```bash
# from extension/
npm run dev   # watch mode (rebuilds on change)
# or
npm run build # one-off production build
```

Output lands in `extension/dist/`.

### 5. Load the extension in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `extension/dist/` folder

---

## Usage

1. Navigate to any Reddit post page (URL contains `/comments/`).
2. A **✦ Summarize** button appears next to the post actions.
3. Click it — a modal shows two sections:
   - **Post** — what the OP said
   - **Community** — overall sentiment and reaction from comments

> **Note:** Media posts (images, videos, GIFs) without enough body text will show *"Unable to summarize media posts without sufficient text"* instead of calling the API.

---

## Limitations & known issues

- Requires the local Express backend to be running. The extension does **not** call Anthropic directly (keeps your API key off the client).
- Works on `new.reddit.com` / `www.reddit.com` (new UI with `shreddit-post` elements). Old Reddit is not supported.
- Very long posts are truncated server-side to keep costs low.

---

## Security & cost controls

The backend enforces these limits regardless of what the extension sends:

| Check | Limit |
|---|---|
| Post body minimum | 60 characters (rejects media/empty posts) |
| Post body maximum | 8 000 characters |
| Comments processed | 20 max |
| Characters per comment | 500 max |
| Post title maximum | 500 characters |

---

## Tech stack

| Layer | Technology |
|---|---|
| Extension | TypeScript, Vite, [@crxjs/vite-plugin](https://crxjs.dev/vite-plugin), Chrome MV3 |
| Backend | Node.js, Express 5, TypeScript, ts-node-dev |
| AI | Anthropic Claude (`claude-haiku-4-5`) via [@anthropic-ai/sdk](https://www.npmjs.com/package/@anthropic-ai/sdk) |

---

## License

MIT