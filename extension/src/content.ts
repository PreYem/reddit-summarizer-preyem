import { fetchSummary } from "./api";
import { createButton, showPopup, setButtonState } from "./ui";

// Only run on post pages
if (!window.location.pathname.includes("/comments/")) {
  throw new Error("[RS] Not a post page, exiting.");
}

console.log("[RS] Post page detected, injecting button...");

function scrapePost() {
  const postEl = document.querySelector("shreddit-post");

  if (!postEl) {
    console.error("[RS] shreddit-post element not found");
    return null;
  }

  const title = postEl.getAttribute("post-title") ?? "";
  console.log("[RS] Title found:", title);

  const body = postEl.querySelector('[id^="post-rtjson-content"] p, .md p')?.textContent?.trim() ?? "";
  console.log("[RS] Body found:", body);

  const comments = Array.from(document.querySelectorAll("shreddit-comment p"))
    .slice(0, 20)
    .map((el) => el.textContent?.trim() ?? "")
    .filter(Boolean);
  console.log("[RS] Comments found:", comments.length);

  return { title, body, comments };
}

function inject() {
  // Don't inject twice
  if (document.querySelector(".rs-btn")) return;

  const postEl = document.querySelector("shreddit-post");
  if (!postEl) {
    console.error("[RS] Cannot inject, no shreddit-post found");
    return;
  }

  // Find the action bar inside the post
  const actionBar = postEl.querySelector("shreddit-post-share-button")?.parentElement ?? postEl.querySelector("[rpl]") ?? postEl;

  console.log("[RS] Action bar found:", actionBar);

  const btn = createButton();

  btn.addEventListener("click", async (e) => {
    e.stopPropagation();
    e.preventDefault();
    e.stopImmediatePropagation();

    console.log("[RS] Button clicked");

    setButtonState(btn, "loading");

    try {
      const data = scrapePost();
      if (!data) throw new Error("Failed to scrape post");

      console.log("[RS] Sending to backend:", data);
      const summary = await fetchSummary(data);
      console.log("[RS] Summary received:", summary);

      setButtonState(btn, "idle");
      showPopup(btn, summary);
    } catch (err) {
      console.error("[RS] Error:", err);
      setButtonState(btn, "error");
      setTimeout(() => setButtonState(btn, "idle"), 2000);
    }
  });

  actionBar.appendChild(btn);
  console.log("[RS] Button injected successfully");
}

// Post pages are SSR so the element should exist, but wait a tick just in case
setTimeout(inject, 1000);
