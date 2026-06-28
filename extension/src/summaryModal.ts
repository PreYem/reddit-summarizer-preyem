import { createReactionSection } from "./modalReaction";
import { SummarizeResponse } from "@shared/types";

// Caching the summary in memory per post, meaning clicking the AI Summary button and closing the modal and opening it again will bring the same response
// without sending an API request a second time to avoid Token usage ramping up - PreYem
const summaryCache = new Map<string, SummarizeResponse>();

// Returns the cached summary for the current page URL, or null if there isn't one.
export function getCachedSummary(): SummarizeResponse | null {
  return summaryCache.get(window.location.href) ?? null;
}

// Saves a summary for the current page URL.
export function setCachedSummary(summary: SummarizeResponse): void {
  summaryCache.set(window.location.href, summary);
}

// Button - PreYem
// Creating the "AI Summary" button within the post - PreYem
export function createButton(): HTMLButtonElement {
  const btn = document.createElement("button");

  btn.className = "rs-btn";
  btn.textContent = "AI Summary";

  btn.addEventListener("mousedown", (event) => {
    event.stopPropagation(); // Don't let the event bubble up to Reddit's handlers
    event.preventDefault(); // Don't trigger default browser behavior (e.g. focus stealing)
  });

  return btn;
}

// Updates the button's text and disabled state based on what's happening.
// Used as a simple state machine: idle → loading → idle (or error → idle)
export function setButtonState(btn: HTMLButtonElement, state: "idle" | "loading" | "error") {
  // const labels = {
  //   idle: "AI Summary",
  //   loading: "⏳ Summarizing...",
  //   error: "Failed to summarize | Server Issue",
  // };

  const labels = {
    idle: "AI Summary",
    loading: "summarizing",
    error: "Failed to summarize | Backend server issue, try again later.",
  };

  if (state === "loading") {
    btn.innerHTML = `<span class="rs-btn-spinner"></span> Summarizing...`;
  } else {
    btn.textContent = labels[state] ?? "AI Summary";
  }

  // Disabling button when loading or when an error occurs - PreYem
  btn.disabled = state === "loading" || state === "error";
}

// Summary Modal - PreYem
export function showModal(summary: SummarizeResponse, author: string) {
  // Removing any traces of a mounted up modal before proceeding - PreYem
  document.querySelector(".rs-modal-backgroundOverlay")?.remove();

  // --- STRUCTURE ---
  // We're building this DOM tree:
  //
  // <div class="rs-modal-backgroundOverlay">        ← full-screen backdrop (click outside to close)
  //   <div class="rs-modal">
  //     <div class="rs-modal-header">
  //       <span class="rs-modal-title">Reddit Summary</span>
  //       <button class="rs-modal-close">✕</button>
  //     </div>
  //     <div class="rs-modal-body">
  //       <div class="rs-section">        ← Post summary section
  //         <div class="rs-section-label">Post</div>
  //         <p class="rs-section-text">...</p>
  //       </div>
  //       <div class="rs-section">        ← Community/comments section
  //         <div class="rs-section-label">Community</div>
  //         <p class="rs-section-text">...</p>
  //       </div>
  //       <div class="rs-modal-footer">...</div>
  //     </div>
  //   </div>
  // </div>

  // Creating the div background of the Modal + assigning it a class - PreYem
  const overlay = document.createElement("div");
  overlay.className = "rs-modal-backgroundOverlay";

  // Creating the modal itself - PreYem
  const modal = document.createElement("div");
  modal.className = "rs-modal";

  // Creating the header of the modal - PreYem
  const header = document.createElement("div");
  header.className = "rs-modal-header";

  // Creating the span which contains the title of the modal - PreYem
  const title = document.createElement("span");
  const subreddit = "r/" + window.location.pathname.split("/")[2]; // "r/funny" → "funny"
  const highlightedDesc = summary.subredditDescription.replace(subreddit, `<span class="rs-modal-subreddit">${subreddit}</span>`);
  title.className = "rs-modal-title";
  title.innerHTML = `<span class="rs-modal-subreddit-desc">${highlightedDesc}</span>`;
  // Creating the button that closes the modal - PreYem
  const closeBtn = document.createElement("button");
  closeBtn.className = "rs-modal-close";
  closeBtn.textContent = "✕";
  closeBtn.addEventListener("click", closeModal);

  // Appending the title and closing button to the header - PreYem
  header.appendChild(title);
  header.appendChild(closeBtn);

  // Body where the AI summary is displayed - PreYem
  const body = document.createElement("div");
  body.className = "rs-modal-body";

  // Post section :
  // Section where the Post specific summary is taking place - PreYem
  const postSection = document.createElement("div");
  postSection.className = "rs-section";

  // Title of the the post section - PreYem
  const postLabel = document.createElement("div");
  postLabel.className = "rs-section-label";
  postLabel.textContent = "Post";

  // Summary of the post body - PreYem
  const postText = document.createElement("p");
  postText.className = "rs-section-text";
  postText.innerHTML = boldOpHandle(summary.post, author); // Use innerHTML to render the <strong> tag

  // Appending the post section - PreYem
  postSection.appendChild(postLabel);
  postSection.appendChild(postText);

  // Community section :
  // Community summary section - PreYem
  const communitySection = document.createElement("div");
  communitySection.className = "rs-section";

  // Title of the the community section - PreYem
  const communityLabel = document.createElement("div");
  communityLabel.className = "rs-section-label";
  communityLabel.textContent = "Community";

  // Summary of the comment section - PreYem
  const communityText = document.createElement("p");
  communityText.className = "rs-section-text";
  communityText.textContent = summary.community;

  communitySection.appendChild(communityLabel);
  communitySection.appendChild(communityText);

  // Community Reaction Section :
  // Community Reaction DIV container - PreYem
  const communityReactionSection = document.createElement("div");
  communityReactionSection.className = "rs-section";

  // Label Container - PreYem
  const communityReactionLabel = document.createElement("div");
  communityReactionLabel.className = "rs-section-label";
  communityReactionLabel.textContent = "Community Reaction";

  // Text container - PreYem
  const communityReactionText = document.createElement("p");
  communityReactionText.className = "rs-section-text";
  communityReactionText.textContent = summary.communityReaction;

  communityReactionSection.appendChild(communityReactionLabel);
  communityReactionSection.appendChild(communityReactionText);

  body.appendChild(postSection);
  body.appendChild(communitySection);
  body.appendChild(createReactionSection(summary));

  // Footer where socials are contained - PreYem
  const footer = document.createElement("div");
  footer.className = "rs-modal-footer";
  footer.innerHTML = `
    <span>Built by PreYem · <span style="color: rgba(255,255,255,0.35); font-size: 0.85em; vertical-align: 1px ">Generated by ${summary.aiModel}</span></span>
  <div class="rs-modal-footer-links">
    <a href="https://preyem.me/" target="_blank" rel="noopener" title="Portfolio">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-user-icon lucide-user"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
    </a>
    <a href="https://github.com/PreYem/reddit-summarizer-preyem" target="_blank" rel="noopener" title="GitHub">
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.604-3.369-1.342-3.369-1.342-.454-1.155-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.741 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z"/></svg>
    </a>
    <a href="https://gitlab.com/PreYem/reddit-summarizer-preyem" target="_blank" rel="noopener" title="GitLab">
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M22.346 14.817 21.06 10.96l-2.532-7.797a.53.53 0 0 0-1.008 0L15 10.96H9L6.48 3.163a.53.53 0 0 0-1.008 0L2.94 10.96 1.654 14.817a1.056 1.056 0 0 0 .383 1.18L12 23l9.963-7.003a1.056 1.056 0 0 0 .383-1.18z"/></svg>
    </a>
  </div>
`;

  // Assembling the header + body + footer - PreYem
  modal.appendChild(header);
  modal.appendChild(body);
  body.appendChild(footer);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // --- Closing BEHAVIORS ---

  // Closing the modal if user clicks outside the modal container - PreYem
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeModal();
  });

  // Adding ESCAPE button to close the modal - PreYem
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      closeModal();
      document.removeEventListener("keydown", onKeyDown);
    }
  };
  document.addEventListener("keydown", onKeyDown);

  // --- ANIMATION ---
  requestAnimationFrame(() => overlay.classList.add("rs-modal-visible"));
}

// Closing Modal Logic - PreYem
function closeModal() {
  const overlay = document.querySelector(".rs-modal-backgroundOverlay");
  if (!overlay) return;

  // Remove the class that makes it visible — this triggers the CSS fade-out transition.
  overlay.classList.remove("rs-modal-visible");

  // Wait for the CSS transition to finish before removing the element from the DOM.
  // `{ once: true }` means the listener automatically removes itself after firing once.
  // Without this, we'd remove the element immediately (before the fade-out plays).
  overlay.addEventListener("transitionend", () => overlay.remove(), { once: true });
}

function boldOpHandle(text: string, author: string): string {
  if (!author || author === "[deleted]") return text;
  const handle = "u/" + author;
  const boldHandle = "<strong>" + handle + "</strong>";
  return text.replace(new RegExp(handle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), boldHandle);
}
