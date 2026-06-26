// Page where we inject AI Summary button, scrape the post content and send it to the backs

import { fetchSummary } from "./api";
import { createButton, showModal, setButtonState, getCachedSummary, setCachedSummary } from "./summaryModal";

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
  const body = postEl.querySelector('[id^="post-rtjson-content"] p, .md p')?.textContent?.trim() ?? "";

  // OP or Original Poster - PreYem
  const author = postEl.getAttribute("author") ?? "[deleted]";

  const topLevelComments = Array.from(document.querySelectorAll('shreddit-comment[depth="0"], shreddit-comment[depth="1"]')).filter((el) => {
    // Only keep ones whose parent isn't another shreddit-comment (true top-level)
    return !el.closest("shreddit-comment")?.parentElement?.closest("shreddit-comment");
  });

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

  return { currentSubreddit, title, body, author, comments };
}

// AI Summary injected button - PreYem
function inject() {
  // Check if the button already exists - PreYem
  if (document.querySelector(".rs-btn")) return;

  // Making sure we're on a clicked post rather than the feed page - PreYem
  const postEl = document.querySelector("shreddit-post");
  if (!postEl) return;

  // Targeting the ... reddit post menu for AI Summary injection location refrence - PreYem
  const overflowMenu = postEl.querySelector("shreddit-post-overflow-menu");
  if (!overflowMenu) return;

  // Creating the button - PreYem
  const injectedSummaryButton = createButton();

  // Adding event listen for the button itself - PreYem
  injectedSummaryButton.addEventListener("click", async (event) => {
    event.stopPropagation();
    event.preventDefault();
    event.stopImmediatePropagation();

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

      // Opening the summary modal with the summary data coming from the backend - PreYem
      showModal(summary, data.author); // Pass author here
    } catch (error) {
      // In case errors come up during backend call - PreYem
      console.error("[RS] Error:", error);
      setButtonState(injectedSummaryButton, "error");

      // Reverting button to it's original state in case there was an issue - PreYem
      setTimeout(() => setButtonState(injectedSummaryButton, "idle"), 2000);
    }
  });

  overflowMenu.parentElement?.insertBefore(injectedSummaryButton, overflowMenu);
}

// Injecting button only when the current page is a post page - PreYem
function tryInject() {
  if (window.location.pathname.includes("/comments/")) {
    setTimeout(inject, 1500);
  }
}

tryInject();

// Track the current URL so we can detect client-side navigation.
let lastUrl = window.location.href;

new MutationObserver(() => {
  // Attempting to inject the button when URL changes + we're on a post page - PreYem
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    tryInject(); // Attempt to inject the button on the new page.
  }
}).observe(document.body, { childList: true, subtree: true });
