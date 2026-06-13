/**
 * content.ts
 *
 * This is the "content script" — Chrome injects this file directly into Reddit's page.
 * It runs in the same browser tab as Reddit, so it has access to `document`, `window`, etc.
 *
 * Responsibilities:
 *  1. Scrape the post title, body, and comments from the DOM
 *  2. Inject the "AI Summary" button into Reddit's UI
 *  3. Coordinate between the API call (api.ts) and the modal (ui.ts)
 */

import { fetchSummary } from './api';
import {
  Summary,
  createButton,
  showModal,
  setButtonState,
  getCachedSummary,
  setCachedSummary,
} from './ui';

// ---------------------------------------------------------------------------
// SCRAPING
// ---------------------------------------------------------------------------

function scrapePost() {
  // `shreddit-post` is Reddit's custom HTML web component that wraps the entire post.
  // It only exists on post/comments pages, not on the feed or subreddit listings.
  const postEl = document.querySelector('shreddit-post');

  // If we can't find the post element, we're probably not on a post page. Bail out.
  if (!postEl) return null;

  // The post title is stored as an HTML *attribute* on the web component, not as
  // visible inner text. Reddit puts data on the element itself for its own JS to use.
  // The `?? ''` means: "if getAttribute returns null, use an empty string instead."
  const title = postEl.getAttribute('post-title') ?? '';

  // The post body is actual rendered HTML inside the component.
  // `[id^="post-rtjson-content"]` selects any element whose id *starts with* that string
  // because Reddit generates dynamic/unique IDs (e.g. "post-rtjson-content-abc123").
  // `.md p` is a fallback selector for old Reddit's markdown format.
  // `?.textContent` uses optional chaining — if querySelector returns null, don't crash.
  // `.trim()` removes leading/trailing whitespace.
  const body =
    postEl.querySelector('[id^="post-rtjson-content"] p, .md p')
      ?.textContent?.trim() ?? '';

  // Collect the text from comment paragraphs across the whole page.
  // `querySelectorAll` returns a NodeList, not an Array, so we wrap it in Array.from().
  // `.slice(0, 20)` limits to the first 20 comments so we don't send a massive payload.
  // `.map(...)` extracts the text content from each paragraph element.
  // `.filter(Boolean)` removes any empty strings or falsy values from the array.
  const comments = Array.from(
    document.querySelectorAll('shreddit-comment p')
  )
    .slice(0, 20)
    .map((el) => el.textContent?.trim() ?? '')
    .filter(Boolean);

  return { title, body, comments };
}

// ---------------------------------------------------------------------------
// BUTTON INJECTION
// ---------------------------------------------------------------------------

function inject() {
  // Prevent double-injection: if our button already exists on the page, do nothing.
  // This can happen if `inject()` is called multiple times (e.g. on URL change).
  if (document.querySelector('.rs-btn')) return;

  // Again, make sure we're on a post page before trying to inject.
  const postEl = document.querySelector('shreddit-post');
  if (!postEl) return;

  // The overflow menu is the "..." button in Reddit's post action bar.
  // We use it as a reference point to know *where* to insert our button.
  const overflowMenu = postEl.querySelector('shreddit-post-overflow-menu');
  if (!overflowMenu) return;

  // `createButton()` is defined in ui.ts — it builds and returns a <button> element
  // with the correct class name and default label ("AI Summary").
  const btn = createButton();

  // Wire up the click handler for our button.
  btn.addEventListener('click', async (e) => {
    // Stop the click from bubbling up to Reddit's own click handlers,
    // which might interfere (e.g. closing a dropdown or navigating away).
    e.stopPropagation();
    e.preventDefault();
    e.stopImmediatePropagation(); // Also stops other listeners on *this* element

    // Check if we already summarized this post in this session.
    // getCachedSummary() looks up the current URL in an in-memory Map.
    const cached = getCachedSummary();
    if (cached) {
      // We have a cached result — skip the API call and show the modal immediately.
      showModal(cached);
      return;
    }

    // No cache — show loading state and kick off the API call.
    setButtonState(btn, 'loading');

    try {
      // Scrape the post content from the DOM right now (at click time, not inject time),
      // so we get the most up-to-date comments.
      const data = scrapePost();
      if (!data) throw new Error('Failed to scrape post');

      // Send the scraped data to the background script → backend → Anthropic API.
      // This is async and may take a few seconds.
      const summary = await fetchSummary(data);

      // Save the result so we don't call the API again for this post.
      setCachedSummary(summary);

      // Reset the button to its normal state and open the modal.
      setButtonState(btn, 'idle');
      showModal(summary);
    } catch (err) {
      // Something went wrong (network error, scrape failure, API error, etc.)
      console.error('[RS] Error:', err);
      setButtonState(btn, 'error');

      // Automatically revert the button back to idle after 2 seconds
      // so the user can try again.
      setTimeout(() => setButtonState(btn, 'idle'), 2000);
    }
  });

  // Insert our button *before* the overflow menu in the post's action bar.
  // `overflowMenu.parentElement` is the action bar container.
  // `insertBefore(newNode, referenceNode)` places newNode just before referenceNode.
  overflowMenu.parentElement?.insertBefore(btn, overflowMenu);
}

// ---------------------------------------------------------------------------
// NAVIGATION DETECTION
// ---------------------------------------------------------------------------

// Reddit is a Single Page Application (SPA) — navigating between pages does NOT
// trigger a full browser reload. So we can't just run `inject()` once on load.

function tryInject() {
  // Only inject on post/comments pages — those URLs always contain "/comments/".
  // We don't want the button appearing on subreddit feeds, search results, etc.
  if (window.location.pathname.includes('/comments/')) {
    // Delay injection by 1.5 seconds because Reddit's SPA renders its components
    // asynchronously after navigation. If we try immediately, `shreddit-post`
    // won't exist in the DOM yet.
    // TODO: A more robust approach would be a MutationObserver that waits
    // specifically for `shreddit-post` to appear instead of using a fixed delay.
    setTimeout(inject, 1500);
  }
}

// Run once on initial page load.
tryInject();

// Track the current URL so we can detect client-side navigation.
let lastUrl = window.location.href;

// MutationObserver fires whenever the DOM changes.
// Reddit's SPA updates the DOM (not the URL bar directly) when navigating,
// so this is the most reliable way to detect route changes.
// We observe `document.body` with `childList: true, subtree: true` to catch
// any DOM mutation anywhere on the page.
new MutationObserver(() => {
  // Only act if the URL actually changed (most DOM mutations are unrelated to navigation).
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    tryInject(); // Attempt to inject the button on the new page.
  }
}).observe(document.body, { childList: true, subtree: true });