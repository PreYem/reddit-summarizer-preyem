import { fetchSummary } from './api';
import {
  Summary,
  createButton,
  showModal,
  setButtonState,
  getCachedSummary,
  setCachedSummary,
} from './ui';

function scrapePost() {
  const postEl = document.querySelector('shreddit-post');
  if (!postEl) return null;

  const title = postEl.getAttribute('post-title') ?? '';
  const body =
    postEl.querySelector('[id^="post-rtjson-content"] p, .md p')
      ?.textContent?.trim() ?? '';
  const comments = Array.from(
    document.querySelectorAll('shreddit-comment p')
  )
    .slice(0, 20)
    .map((el) => el.textContent?.trim() ?? '')
    .filter(Boolean);

  return { title, body, comments };
}

function inject() {
  if (document.querySelector('.rs-btn')) return;

  const postEl = document.querySelector('shreddit-post');
  if (!postEl) return;

  const overflowMenu = postEl.querySelector('shreddit-post-overflow-menu');
  if (!overflowMenu) return;

  const btn = createButton();

  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    e.preventDefault();
    e.stopImmediatePropagation();

    const cached = getCachedSummary();
    if (cached) {
      showModal(cached);
      return;
    }

    setButtonState(btn, 'loading');

    try {
      const data = scrapePost();
      if (!data) throw new Error('Failed to scrape post');

      const summary = await fetchSummary(data);
      setCachedSummary(summary);
      setButtonState(btn, 'idle');
      showModal(summary);
    } catch (err) {
      console.error('[RS] Error:', err);
      setButtonState(btn, 'error');
      setTimeout(() => setButtonState(btn, 'idle'), 2000);
    }
  });

  overflowMenu.parentElement?.insertBefore(btn, overflowMenu);
}

function tryInject() {
  if (window.location.pathname.includes('/comments/')) {
    setTimeout(inject, 1500);
  }
}

tryInject();

let lastUrl = window.location.href;
new MutationObserver(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    tryInject();
  }
}).observe(document.body, { childList: true, subtree: true });

