// Page where we inject AI Summary button, scrape the post content and send it to the backs

import { fetchSummary, cancelInFlight, cancelStaleCall } from "./api";
import { createButton, showModal, showErrorModal, setButtonState, getCachedSummary, setCachedSummary } from "./summaryModal";
import { CancelledError, LocalSummarizeError, readPreferredLanguage, readSettings } from "./localLlm";
import { isRtl, uiText } from "@shared/languages";
import type { SummarizeRequest } from "@shared/types";

// #26: ONE preferred language drives both the add-on UI (button/live region/modals) and
// the summary output language, so the two can never drift apart again - PreYem
let currentLanguage = "en";
let uiButton: HTMLButtonElement | null = null;
let uiLiveRegion: HTMLElement | null = null;
let uiState: "idle" | "loading" | "done" = "idle";
let uiLiveKey: string | null = null;

function setLiveUiText(key: string | null) {
  uiLiveKey = key;
  if (uiLiveRegion) {
    uiLiveRegion.textContent = key ? uiText(currentLanguage, key) : "";
    uiLiveRegion.setAttribute("dir", isRtl(currentLanguage) ? "rtl" : "ltr");
  }
}

// #25: repaint is idempotent — writing textContent inside the observed body subtree is
// itself a mutation, so an unconditional repaint on every MutationObserver callback re-triggers
// the observer forever (tab freeze/crash). Skip DOM writes while (state|language|liveKey)
// already matches the last repaint - PreYem
let lastRepaintKey: string | null = null;

function repaintUiButton() {
  const key = `${uiState}|${currentLanguage}|${uiLiveKey}`;
  if (key === lastRepaintKey) return;
  lastRepaintKey = key;
  if (uiButton) setButtonState(uiButton, uiState, currentLanguage);
  setLiveUiText(uiLiveKey);
}

void readPreferredLanguage().then((language) => {
  currentLanguage = language;
  repaintUiButton();
});

// Function to scrab the post for data processing to be sent to the backend - PreYem
function scrapePost(): SummarizeRequest | null {
  // Grabbing the HTML tag containing the post - PreYem
  const postEl = document.querySelector("shreddit-post");

  // Returning null if post tag isn't found - PreYem
  if (!postEl) return null;

  // Grabbing current subreddit from the URL - PreYem
  const currentSubreddit = "r/" + window.location.pathname.split("/")[2];

  // Grabbing post title from attribute - PreYem
  const title = postEl.getAttribute("post-title") ?? "";

  // Post body - PreYem
  const body = Array.from(postEl.querySelectorAll('[id^="post-rtjson-content"] p, .md p'))
    .map((p) => p.textContent?.trim() ?? "")
    .filter(Boolean)
    .join("\n");
  // OP or Original Poster - PreYem
  const author = postEl.getAttribute("author") ?? "[deleted]";

  // Canonical post URL for logging/click-through: permalink is the path, origin the host - PreYem
  const permalink = postEl.getAttribute("permalink");
  const postUrl = permalink ? `${window.location.origin}${permalink}` : window.location.href;

  // const topLevelComments = Array.from(document.querySelectorAll('shreddit-comment[depth="0"], shreddit-comment[depth="1"]')).filter((el) => {
  //   // Only keep ones whose parent isn't another shreddit-comment (true top-level)
  //   return !el.closest("shreddit-comment")?.parentElement?.closest("shreddit-comment");
  // });

  const comments = Array.from(document.querySelectorAll("shreddit-comment"))
    .map((commentEl) => {
      const thingId = commentEl.getAttribute("thingid");
      const textEl = commentEl.querySelector(`#${thingId}-post-rtjson-content`);
      if (!textEl) return "";
      // Join all <p> tags inside this comment's own content block into one string
      return Array.from(textEl.querySelectorAll("p"))
        .map((p) => p.textContent?.trim() ?? "")
        .filter(Boolean)
        .join(" ");
    })
    .filter(Boolean)
    .slice(0, 100);

  return {
    currentSubreddit,
    title,
    body,
    author,
    comments,
    postUrl,
    ...(currentLanguage === "en" ? {} : { language: currentLanguage }),
  };
}

// Grace period: after this many ms of observed DOM mutations on a post page where the
// overflow-menu anchor still hasn't landed, we treat the page as a DOM variant that has
// no overflow menu (not "still loading") and inject at fallback anchors instead - PreYem
const ANCHOR_GRACE_PERIOD_MS = 5000;
let anchorWaitUrl = "";
let anchorWaitStartedAt = 0;

// Injects the AI Summary button + a polite live region before refChild inside insertParent - PreYem
function inject(insertParent: Element, refChild: Node | null) {
  // #23: one-time diagnostic to confirm injection happens on the right page (fires once
  // per page load because of the .rs-btn idempotency guard) - PreYem
  console.log("[RS] inject:", window.location.pathname);

  // Creating the button - PreYem
  const injectedSummaryButton = createButton(currentLanguage);
  uiButton = injectedSummaryButton;
  uiState = "idle";

  // aria-live region so loading/error states are announced to screen readers - PreYem
  const liveRegion = document.createElement("div");
  liveRegion.className = "rs-live-region";
  liveRegion.setAttribute("aria-live", "polite");
  uiLiveRegion = liveRegion;
  uiLiveKey = null;
  // #25: force the first repaint for the freshly injected elements (aria-label + initial state) - PreYem
  lastRepaintKey = null;
  repaintUiButton();

  // Shared activation path for pointer clicks and Enter/Space keyboard presses - PreYem
  // The guard also swallows the UA-synthesized click that follows keyboard activation,
  // so a single key press never fires two backend calls - PreYem
  let activating = false;
  // #22 click-to-cancel bookkeeping: a request is in flight (busy), the user asked for
  // the cancel by clicking/Enter on the busy button (userCancel → the CancelledError
  // catch acknowledges it instead of staying silent), and keyboardClickGuard swallows
  // the UA-synthesized click that follows keyboard activation - PreYem
  let busy = false;
  let userCancel = false;
  let keyboardClickGuard = false;
  const activate = async () => {
    if (activating) return;
    activating = true;
    try {
      // #24: settings are read fresh on every click, so a Save on the settings page
      // changes routing immediately. The page-memory cache must not outlive that:
      // fingerprint the current source (mode+model) and only reuse a cached summary
      // while the fingerprint matches — otherwise re-summarize with the new settings - PreYem
      const currentSettings = await readSettings();
      currentLanguage = await readPreferredLanguage();
      repaintUiButton();
      // #26: the language is part of the fingerprint so a language change invalidates the
      // cached summary instead of re-showing it untranslated - PreYem
      const settingsFingerprint =
        currentSettings && currentSettings.mode !== "cloud"
          ? `${currentSettings.mode}|${currentSettings.model || ""}|${currentLanguage}`
          : `cloud|${currentLanguage}`;
      const cachedSummary = getCachedSummary();
      // If summary is still cached AND produced by the current settings, show it again
      // to avoid unnecessary API calls - PreYem
      if (cachedSummary && cachedSummary.settingsFingerprint === settingsFingerprint) {
        const data = scrapePost();
        showModal(cachedSummary.response, data?.author ?? "[deleted]", cachedSummary.elapsedMs, cachedSummary.mode, currentLanguage, cachedSummary.commentCount); // Pass author + original fetch duration + mode + UI language + #27 original comment count
        return;
      }

      // If no cachedSummary is found, we call the backend and send the correct data.
      uiState = "loading";
      uiLiveKey = "live_loading";
      busy = true;
      repaintUiButton();

      try {
        // Calling the scrap function to get the data then send it rather than scrap when page loads - PreYem
        const data = scrapePost();
        if (!data) throw new Error("Failed to scrape post");

        // #23: wall-clock timer for the "Summarized in Ns" modal line — local LLMs
        // legitimately take longer, no special-casing - PreYem
        const startedAt = Date.now();

        // Sending the scrapped data to the backend for processing - PreYem
        const result = await fetchSummary(data);
        const elapsedMs = Date.now() - startedAt;

        // Saving the result in the cache function for future use if user is still on the same post page - PreYem
        setCachedSummary(result.response, elapsedMs, result.mode, settingsFingerprint, data.comments.length);

        // #23: summary now in memory — button flips to "Show Summary" so a later click
        // re-opens the modal from cache instead of re-summarizing - PreYem
        uiState = "done";
        uiLiveKey = "live_done";
        repaintUiButton();

        // Opening the summary modal with the summary data coming from the backend - PreYem
        showModal(result.response, data.author, elapsedMs, result.mode, currentLanguage, data.comments.length); // Pass author + duration + mode + UI language + #27 comment count
      } catch (error) {
        // #20 cancellation (page left / URL changed mid-flight): stay silent, the
        // request was intentionally stopped — not a user-facing failure - PreYem
        // #22: but a user-initiated click-cancel gets a polite acknowledgment in the
        // live region so the page doesn't look like it silently dropped the click - PreYem
        if (error instanceof CancelledError) {
          const cancelledByUser = userCancel;
          userCancel = false;
          uiState = "idle";
          uiLiveKey = cancelledByUser ? "live_cancelled" : null;
          repaintUiButton();
          return;
        }
        // In case errors come up during backend call - PreYem
        console.error("[RS] Error:", error);
        // #21: no error state on the button — the failure gets its own error modal (same
        // animation + ESC close as the summary modal). Closing it leaves the button idle
        // and clickable for a retry; errors are deliberately NOT cached in memory - PreYem
        uiState = "idle";
        uiLiveKey = null;
        repaintUiButton();
        if (error instanceof LocalSummarizeError) {
          showErrorModal(error.provider, error.model, error.kind, error.message, currentLanguage);
        } else {
          const errorMessage = error instanceof Error ? error.message : String(error);
          showErrorModal(
            uiText(currentLanguage, "err_cloud_backend"),
            uiText(currentLanguage, "err_backend_server"),
            uiText(currentLanguage, "err_backend_error"),
            errorMessage || uiText(currentLanguage, "err_generic"),
            currentLanguage,
          );
        }
      }
    } finally {
      activating = false;
      busy = false;
    }
  };

  // Pointer click path - PreYem
  injectedSummaryButton.addEventListener("click", (event) => {
    event.stopPropagation();
    event.preventDefault();
    event.stopImmediatePropagation();
    // The keyboard path's UA-synthesized click must never count as a real click - PreYem
    if (keyboardClickGuard) {
      keyboardClickGuard = false;
      return;
    }
    // #22: a click while a request runs cancels it: CANCEL aborts the fetch, which
    // tells local servers (Ollama, llama.cpp) to stop generating for the result - PreYem
    if (busy) {
      userCancel = true;
      cancelInFlight();
      return;
    }
    void activate();
  });

  // Keyboard path: Enter/Space while the button is focused, independent of the click path - PreYem
  injectedSummaryButton.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (busy) {
        // #22: keyboard re-activation on a busy button cancels, same as clicking - PreYem
        userCancel = true;
        cancelInFlight();
        return;
      }
      keyboardClickGuard = true;
      void activate();
    }
  });

  insertParent.insertBefore(injectedSummaryButton, refChild);
  insertParent.insertBefore(liveRegion, refChild);
}

// Post page: try to inject the button, waiting for the anchor via observer callbacks - PreYem
function tryInject() {
  // Duplicate injection impossible: idempotent check stays first - PreYem
  // #25: cheap O(1) isConnected check runs as the idempotency guard's fast path, and the
  // pathname bail-out precedes the document-wide fallback scan so home/feed pages don't
  // pay a full DOM query on every mutation - PreYem
  if (uiButton?.isConnected) return;
  if (!window.location.pathname.includes("/comments/")) return;
  if (document.querySelector(".rs-btn")) return;

  // Feed pages still get no button (pathname guard) - PreYem
  if (!window.location.pathname.includes("/comments/")) return;

  const postEl = document.querySelector("shreddit-post");
  if (!postEl) return;

  // #23 guard replaced (#27): any /r/<sub>/comments/<...> URL qualifies as a post page,
  // including comment deep links (/r/<sub>/comments/<id>/<slug>/<commentId>/?context=3) that
  // the old permalink-prefix check rejected. Profile comment feeds (/u/<user>/comments/,
  // /users/...) still get no button because the first path segment must be exactly "r" - PreYem
  if (!/\/r\/[^/]+\/comments\//i.test(window.location.pathname)) return;

  // Primary anchor: the ... overflow menu, button injected right next to it - PreYem
  const overflowMenu = postEl.querySelector("shreddit-post-overflow-menu");
  if (overflowMenu) {
    const parent = overflowMenu.parentElement;
    if (parent) inject(parent, overflowMenu);
    return;
  }

  // Anchor not present yet: start the grace period for this URL - PreYem
  const url = window.location.href;
  if (anchorWaitUrl !== url) {
    anchorWaitUrl = url;
    anchorWaitStartedAt = Date.now();
    return; // Still possibly loading; the observer will re-check on later mutations
  }
  if (Date.now() - anchorWaitStartedAt < ANCHOR_GRACE_PERIOD_MS) return;

  // Grace period elapsed with no anchor: this build/variant has no overflow menu,
  // so inject at fallback anchors to guarantee a reachable button - PreYem
  const rtjson = postEl.querySelector("#post-rtjson-content");
  if (rtjson?.parentElement) {
    inject(rtjson.parentElement, rtjson);
  } else {
    inject(postEl, null); // Else append inside the post element
  }
}

// Inject immediately in case the page is already fully loaded - PreYem
tryInject();

// One MutationObserver drives all later injections: on slow connections the button is
// injected as soon as the anchor lands (no fixed-time bet), and SPA navigation is covered
// because body mutations accompany it and the callback re-checks the pathname - PreYem
// #20 cancellation: a URL change mid-flight means the running call belongs to a post we
// left (or back-nav happened), so CANCEL aborts it before re-checking the anchor - PreYem
new MutationObserver(() => {
  cancelStaleCall();
  repaintUiButton();
  tryInject();
}).observe(document.body, { childList: true, subtree: true });

// Tab close / unload / back-navigation away: pagehide is the last moment where messaging
// still works, so abort any in-flight fetch there (the service worker itself survives the
// page unload and can still answer CANCEL + abort its fetch) - PreYem
window.addEventListener("pagehide", () => {
  cancelInFlight();
});
