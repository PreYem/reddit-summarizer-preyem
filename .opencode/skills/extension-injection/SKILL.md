---
name: extension-injection
description: Use when working on button/DOM injection in the Reddit extension — the "AI Summary" button on post pages, content scripts, Chromium vs Gecko manifests, shadow-UI gotchas, popup→settings link pattern. Keywords: button, injection, content script, popup, shreddit-post, MutationObserver, a11y.
---

# Extension injection (button on Reddit post pages)

The AI Summary button is injected into Reddit thread pages by the content bundle.

## Key files

- `extension/src/content.ts` — inject/tryInject logic, button cycle (idle/loading/done), live region, cancel paths.
- `extension/src/summaryModal.ts` — createButton + setButtonState labels, summary modal + error modal a11y.
- `extension/public/styles.css` — the `rs-*` button/modal styles; injected on Reddit pages via the manifest's `content_scripts[].css` entry (Tailwind only styles the popup/settings pages, never Reddit pages).
- `extension/public/popup.html` — informational popup; links to `settings.html` via relative `<a href="settings.html" target="_blank" rel="noopener">` (works Chromium + Gecko).

## Injection design (plans #17, #20–#24)

- `tryInject()` runs once at load, then ONE MutationObserver on `document.body` (childList+subtree) re-runs it on every mutation; its callback first calls `cancelStaleCall()` (URL changed mid-flight → abort the fetch), then `tryInject()`.
- tryInject guards, in order: `.rs-btn` idempotency check FIRST; `/comments/` pathname; `shreddit-post` present; then a STRICT permalink guard — the page only counts as the post's page when `location.pathname` equals the post's `permalink` path (or starts with it + `/`). Profile comment feeds (`/u/<user>/comments/`) embed `shreddit-post` cards and used to get stray buttons mid-feed.
- Grace period: if the anchor is missing, `anchorWaitUrl`/`anchorWaitStartedAt` start a timer; after `ANCHOR_GRACE_PERIOD_MS = 5000` ms of mutations with no anchor, treat as DOM variant → fallbacks `#post-rtjson-content` parent, else append inside `shreddit-post`.
- Primary anchor `shreddit-post-overflow-menu`; button inserted before it.
- Button cycle (summaryModal.setButtonState, three states, never disabled): idle `AI Summary` → loading `Summarizing...` + spinner span + `✕ Cancel` span (styled span, not a nested button) with aria "Summarizing this post, click again to cancel" → done `Show Summary`, which re-opens the modal from the page-memory cache without a new request.
- Cache: `setCachedSummary(response, elapsedMs, mode, fingerprint)` keyed by fingerprint `mode|model` (cloud = `"cloud"`); content.ts re-reads settings on every click (#24) and only reuses the cache while the fingerprint matches, so a Save on the settings page invalidates it.
- Cancel paths (#20–#22): click/Enter on a busy button → `cancelInFlight()` + `userCancel` flag, `CancelledError` catch shows "Summary cancelled. Click the button again to retry."; URL change mid-flight → observer's `cancelStaleCall()`; tab close/back-nav → `pagehide` listener calls `cancelInFlight()` (service worker survives unload and can still answer CANCEL).
- Keyboard path sets `keyboardClickGuard` so the UA-synthesized click after Enter/Space doesn't fire a second backend call; a busy keyboard re-press cancels.
- Button is a real `<button>` with `aria-label="Summarize this Reddit post with AI"` (aria-label per state); `aria-live="polite"` status region announces loading/done/cancel. Modal has `role` dialog semantics + `aria-labelledby`, ESC closes.
- Errors (#21): no error button state — failure opens its own error modal (same animation + ESC as the summary modal); closing leaves the button idle and clickable; errors are never cached.

## Chromium vs Gecko

- `extension/public/manifest.chromium.json` uses `options_page`; gecko uses `options_ui` (`open_in_tab: true`). Both need the `storage` permission for `chrome.storage.local`.
- `extension/copy-public.mjs` copies `public/` assets (html/js/css) into `dist/chromium` and `dist/gecko` after vite build.

## Verification conventions

- DevTools network throttling (Slow/Slow+) → button appears when anchor lands.
- Keyboard-only: Tab reaches button, Enter/Space summarizes, ESC closes modal.
