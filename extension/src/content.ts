// Page where we inject AI Summary button, scrape the post content and send it to the backs

import { fetchSummary, cancelInFlight, cancelStaleCall } from "./api";
import { createButton, showModal, showErrorModal, setButtonState, getCachedSummary, setCachedSummary } from "./summaryModal";
import { CancelledError, LocalSummarizeError } from "./localLlm";

// Function to scrab the post for data processing to be sent to the backend - PreYem
function scrapePost() {
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

  return { currentSubreddit, title, body, author, comments, postUrl };
}

// Grace period: after this many ms of observed DOM mutations on a post page where the
// overflow-menu anchor still hasn't landed, we treat the page as a DOM variant that has
// no overflow menu (not "still loading") and inject at fallback anchors instead - PreYem
const ANCHOR_GRACE_PERIOD_MS = 5000;
let anchorWaitUrl = "";
let anchorWaitStartedAt = 0;

// Injects the AI Summary button + a polite live region before refChild inside insertParent - PreYem
function inject(insertParent: Element, refChild: Node | null) {
  // Creating the button - PreYem
  const injectedSummaryButton = createButton();
  injectedSummaryButton.setAttribute("aria-label", "Summarize this Reddit post with AI");

  // aria-live region so loading/error states are announced to screen readers - PreYem
  const liveRegion = document.createElement("div");
  liveRegion.className = "rs-live-region";
  liveRegion.setAttribute("aria-live", "polite");

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
      // Check if we already summurized this post in case user exits the modal then tries again - PreYem
      const cachedSummary = getCachedSummary();
      // If summary is still cached, we display it again to avoid unnecessary API calls - PreYem
      if (cachedSummary) {
        const data = scrapePost();
        showModal(cachedSummary, data?.author ?? "[deleted]"); // Pass author
        return;
      }

      // If no cachedSummary is found, we call the backend and send the correct data.
      setButtonState(injectedSummaryButton, "loading");
      liveRegion.textContent = "Summarizing this post with AI";
      busy = true;

      try {
        // Calling the scrap function to get the data then send it rather than scrap when page loads - PreYem
        const data = scrapePost();
        if (!data) throw new Error("Failed to scrape post");

        // Sending the scrapped data to the backend for processing - PreYem
        const summary = await fetchSummary(data);

        // Saving the result in the cache function for future use if user is still on the same post page - PreYem
        setCachedSummary(summary);

        // Reset the button to its normal state - PreYem
        setButtonState(injectedSummaryButton, "idle");
        liveRegion.textContent = "";

        // Opening the summary modal with the summary data coming from the backend - PreYem
        showModal(summary, data.author); // Pass author here
      } catch (error) {
        // #20 cancellation (page left / URL changed mid-flight): stay silent, the
        // request was intentionally stopped — not a user-facing failure - PreYem
        // #22: but a user-initiated click-cancel gets a polite acknowledgment in the
        // live region so the page doesn't look like it silently dropped the click - PreYem
        if (error instanceof CancelledError) {
          const cancelledByUser = userCancel;
          userCancel = false;
          setButtonState(injectedSummaryButton, "idle");
          liveRegion.textContent = cancelledByUser ? "Summary cancelled. Click the button again to retry." : "";
          return;
        }
        // In case errors come up during backend call - PreYem
        console.error("[RS] Error:", error);
        // #21: no error state on the button — the failure gets its own error modal (same
        // animation + ESC close as the summary modal). Closing it leaves the button idle
        // and clickable for a retry; errors are deliberately NOT cached in memory - PreYem
        setButtonState(injectedSummaryButton, "idle");
        liveRegion.textContent = "";
        if (error instanceof LocalSummarizeError) {
          showErrorModal(error.provider, error.model, error.kind, error.message);
        } else {
          showErrorModal("Cloud backend", "Backend server", "Backend error", error.message || "Failed to summarize | Backend server issue, try again later.");
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
  if (document.querySelector(".rs-btn")) return;

  // Feed pages still get no button (pathname guard) - PreYem
  if (!window.location.pathname.includes("/comments/")) return;

  const postEl = document.querySelector("shreddit-post");
  if (!postEl) return;

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
  tryInject();
}).observe(document.body, { childList: true, subtree: true });

// Tab close / unload / back-navigation away: pagehide is the last moment where messaging
// still works, so abort any in-flight fetch there (the service worker itself survives the
// page unload and can still answer CANCEL + abort its fetch) - PreYem
window.addEventListener("pagehide", () => {
  cancelInFlight();
});
