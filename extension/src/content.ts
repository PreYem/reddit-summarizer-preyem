// Page where we inject AI Summary button, scrape the post content and send it to the backs

import { fetchSummary } from "./api";
import { createButton, showModal, setButtonState, getCachedSummary, setCachedSummary } from "./summaryModal";
import { LocalSummarizeError } from "./localLlm";

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
        // In case errors come up during backend call - PreYem
        console.error("[RS] Error:", error);
        // #18 local path: local failures carry a user-facing message (retry policy already ran
        // inside localLlm), cloud ones keep the generic backend text - PreYem
        const localFailure = error instanceof LocalSummarizeError;
        setButtonState(injectedSummaryButton, "error", localFailure ? error.message : undefined);
        liveRegion.textContent = localFailure
          ? error.message
          : "Failed to summarize. Backend server issue, try again later.";

        // Reverting button to it's original state in case there was an issue - PreYem
        setTimeout(() => {
          setButtonState(injectedSummaryButton, "idle");
          liveRegion.textContent = "";
        }, 2000);
      }
    } finally {
      activating = false;
    }
  };

  // Pointer click path - PreYem
  injectedSummaryButton.addEventListener("click", (event) => {
    event.stopPropagation();
    event.preventDefault();
    event.stopImmediatePropagation();
    void activate();
  });

  // Keyboard path: Enter/Space while the button is focused, independent of the click path - PreYem
  injectedSummaryButton.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
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
new MutationObserver(() => {
  tryInject();
}).observe(document.body, { childList: true, subtree: true });
