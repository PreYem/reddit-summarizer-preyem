---
name: extension-injection
description: Use when working on button/DOM injection in the Reddit extension — the "AI Summary" button on post pages, content scripts, Chromium vs Gecko manifests, shadow-UI gotchas, popup→settings link pattern. Keywords: button, injection, content script, popup, shreddit-post, MutationObserver, a11y.
---

# Extension injection (button on Reddit post pages)

The AI Summary button is injected into Reddit thread pages by the content bundle.

## Key files

- `extension/src/content.ts` — inject/tryInject logic, button a11y, live region.
- `extension/src/summaryModal.ts` — summary modal + error modal a11y.
- `extension/src/contentStyles.ts` — bundled button styles (fallback injection reuses them).
- `extension/public/popup.html` — informational popup; links to `settings.html` via relative `<a href="settings.html" target="_blank" rel="noopener">` (works Chromium + Gecko).

## Injection design (plan #17)

- Observer-driven, no timer: one MutationObserver on `document.body`; callback guards: already-injected (`.rs-btn` idempotency check FIRST), pathname contains `/comments/`, anchor present.
- Primary anchor `shreddit-post-overflow-menu` inside `shreddit-post`. Grace period constant `ANCHOR_GRACE_PERIOD_MS = 5000`: if `shreddit-post` exists but anchor never lands after ~5 s of mutations, treat as variant DOM and inject at fallbacks: `#post-rtjson-content` → else append inside `shreddit-post`.
- Button is a real `<button>` with `aria-label="Summarize this Reddit post with AI"`; `aria-live="polite"` status region announces loading/error. Modal has `role` dialog semantics + `aria-labelledby`, ESC closes.
- Feed pages get no button (pathname guard). `matches` are www.reddit.com only.

## Chromium vs Gecko

- `extension/public/manifest.chromium.json` uses `options_page`; gecko uses `options_ui` (`open_in_tab: true`). Both need the `storage` permission for `chrome.storage.local`.
- `extension/copy-public.mjs` copies `public/` assets (html/js/css) into `dist/chromium` and `dist/gecko` after vite build.

## Verification conventions

- DevTools network throttling (Slow/Slow+) → button appears when anchor lands.
- Keyboard-only: Tab reaches button, Enter/Space summarizes, ESC closes modal.
