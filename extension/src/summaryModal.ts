import { createReactionSection } from "./modalReaction";
import { SummarizeResponse } from "@shared/types";
import { isRtl, langName, reactionLabel, uiText } from "@shared/languages";

// Caching the summary in memory per post, meaning clicking the AI Summary button and closing the modal and opening it again will bring the same response
// without sending an API request a second time to avoid Token usage ramping up - PreYem
// #23: cache value also carries the wall-clock duration of the original fetch + the mode
// it ran in, so a cached re-show can display the truthful footer of that call - PreYem
// #24: cache value also carries a settings fingerprint (mode+model) so a cached summary is
// only re-shown while the CURRENT settings match — after Save changes the source, the button
// re-summarizes with the new settings instead of serving the stale cached modal - PreYem
// #27: cache also keeps the scraped comment count so the localized "Based on N comments."
// line survives cache replays - PreYem
const summaryCache = new Map<string, { response: SummarizeResponse; elapsedMs: number; mode: string; settingsFingerprint: string; commentCount: number }>();

export function getCachedSummary(): { response: SummarizeResponse; elapsedMs: number; mode: string; settingsFingerprint: string; commentCount: number } | null {
  return summaryCache.get(window.location.href) ?? null;
}

export function setCachedSummary(summary: SummarizeResponse, elapsedMs: number, mode: string, settingsFingerprint: string, commentCount: number): void {
  summaryCache.set(window.location.href, { response: summary, elapsedMs, mode, settingsFingerprint, commentCount });
}

// #23: "under a second" / "N second(s)" / "N min M s" formatting for the modal footer - PreYem
function formatElapsed(ms: number, uiLanguage: string): string {
  if (ms < 1000) return uiText(uiLanguage, "t_under");
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds} ${uiText(uiLanguage, totalSeconds === 1 ? "t_sec_one" : "t_sec_many")}`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds ? `${minutes} min ${seconds} s` : `${minutes} min`;
}

// Fetching the current reddit theme for the modal to be adjusted accordingly - PreYem
function getRedditTheme(): "light" | "dark" {
  return document.documentElement.classList.contains("theme-dark") ? "dark" : "light";
}

// Button - PreYem
export function createButton(uiLanguage = "en"): HTMLButtonElement {
  const btn = document.createElement("button");

  btn.className = "rs-btn";
  btn.textContent = uiText(uiLanguage, "btn_idle");
  btn.setAttribute("dir", isRtl(uiLanguage) ? "rtl" : "ltr");

  btn.addEventListener("mousedown", (event) => {
    event.stopPropagation();
    event.preventDefault();
  });

  return btn;
}

// Updates the button's text and disabled state based on what's happening.
// #21: no error state anymore — failures get their own error modal instead, so the
// button never gets stuck and stays clickable for a fresh attempt
// #23: "done" state once the summary is in memory — the button then re-opens the
// modal from cache instead of re-summarizing - PreYem
export function setButtonState(btn: HTMLButtonElement, state: "idle" | "loading" | "done", uiLanguage = "en") {
  const labels = {
    idle: uiText(uiLanguage, "btn_idle"),
    loading: uiText(uiLanguage, "btn_loading"),
    done: uiText(uiLanguage, "btn_done"),
  };
  const ariaLabels = {
    idle: uiText(uiLanguage, "aria_idle"),
    loading: uiText(uiLanguage, "aria_loading"),
    done: uiText(uiLanguage, "aria_done"),
  };

  if (state === "loading") {
    btn.replaceChildren();
    const spinner = document.createElement("span");
    spinner.className = "rs-btn-spinner";
    btn.appendChild(spinner);
    btn.appendChild(document.createTextNode(" " + uiText(uiLanguage, "btn_loading")));
    // A nested <button> inside the <button> is invalid HTML, so the "✕ Cancel" affordance
    // is a styled span; the actual cancel is the click-on-busy-button path (content.ts) - PreYem
    const cancel = document.createElement("span");
    cancel.className = "rs-btn-cancel";
    cancel.textContent = uiText(uiLanguage, "btn_cancel");
    btn.appendChild(cancel);
  } else {
    btn.textContent = labels[state];
  }

  btn.setAttribute("dir", isRtl(uiLanguage) ? "rtl" : "ltr");
  btn.setAttribute("aria-label", ariaLabels[state]);
  btn.dataset.rsState = state;

  // #22: never disabled while loading — clicking the busy button cancels the in-flight
  // request (content.ts), which tells local servers to stop generating - PreYem
  btn.disabled = false;
}

// Builds "<prefix><span class='rs-modal-subreddit'>subreddit</span><suffix>" safely,
// replacing every occurrence of `needle` inside `text` with a highlighted span.
function buildHighlighted(container: HTMLElement, text: string, needle: string, highlightClass: string) {
  if (!needle) {
    container.appendChild(document.createTextNode(text));
    return;
  }
  const parts = text.split(needle);
  parts.forEach((part, i) => {
    if (part) container.appendChild(document.createTextNode(part));
    if (i < parts.length - 1) {
      const span = document.createElement("span");
      span.className = highlightClass;
      span.textContent = needle;
      container.appendChild(span);
    }
  });
}

// Builds text with every occurrence of the OP's handle wrapped in <strong>, safely.
// Builds text with every occurrence of the OP's handle wrapped in <strong>, safely — no innerHTML involved.
function buildBoldOpHandle(container: HTMLElement, text: string, author: string) {
  if (!author || author === "[deleted]") {
    container.appendChild(document.createTextNode(text));
    return;
  }
  const handle = "u/" + author;
  const parts = text.split(handle);
  parts.forEach((part, i) => {
    if (part) container.appendChild(document.createTextNode(part));
    if (i < parts.length - 1) {
      const strong = document.createElement("strong");
      strong.textContent = handle;
      container.appendChild(strong);
    }
  });
}

// Summary Modal - PreYem
export function showModal(summary: SummarizeResponse, author: string, elapsedMs: number | null, mode: string | null, uiLanguage = "en", commentCount = 0) {
  document.querySelector(".rs-modal-backgroundOverlay")?.remove();

  const overlay = document.createElement("div");
  overlay.className = "rs-modal-backgroundOverlay";
  overlay.classList.add(getRedditTheme() === "dark" ? "rs-theme-dark" : "rs-theme-light");

  const modal = document.createElement("div");
  modal.className = "rs-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "rs-modal-title");
  modal.setAttribute("dir", isRtl(uiLanguage) ? "rtl" : "ltr");

  // --- Header ---
  const header = document.createElement("div");
  header.className = "rs-modal-header";

  const title = document.createElement("span");
  title.className = "rs-modal-title";
  title.id = "rs-modal-title";

  const subreddit = "r/" + window.location.pathname.split("/")[2];
  const descWrapper = document.createElement("span");
  descWrapper.className = "rs-modal-subreddit-desc";
  buildHighlighted(descWrapper, summary.subredditDescription, subreddit, "rs-modal-subreddit");
  title.appendChild(descWrapper);

  const closeBtn = document.createElement("button");
  closeBtn.className = "rs-modal-close";
  closeBtn.textContent = "\u2715";
  closeBtn.setAttribute("aria-label", uiText(uiLanguage, "modal_close_aria"));
  closeBtn.addEventListener("click", closeModal);

  header.appendChild(title);
  header.appendChild(closeBtn);

  // --- Body ---
  const body = document.createElement("div");
  body.className = "rs-modal-body";

  // Post section
  const postSection = document.createElement("div");
  postSection.className = "rs-section";

  const postLabel = document.createElement("div");
  postLabel.className = "rs-section-label";
  postLabel.textContent = uiText(uiLanguage, "sec_post");

  const postText = document.createElement("p");
  postText.className = "rs-section-text";
  buildBoldOpHandle(postText, summary.post, author);

  postSection.appendChild(postLabel);
  postSection.appendChild(postText);

  // Community section
  const communitySection = document.createElement("div");
  communitySection.className = "rs-section";

  const communityLabel = document.createElement("div");
  communityLabel.className = "rs-section-label";
  communityLabel.textContent = uiText(uiLanguage, "sec_community");

  const communityText = document.createElement("p");
  communityText.className = "rs-section-text";
  communityText.textContent = summary.community;

  communitySection.appendChild(communityLabel);
  communitySection.appendChild(communityText);

  // Community Reaction section
  const communityReactionSection = document.createElement("div");
  communityReactionSection.className = "rs-section";

  const communityReactionLabel = document.createElement("div");
  communityReactionLabel.className = "rs-section-label";
  communityReactionLabel.textContent = uiText(uiLanguage, "sec_reaction");

  const communityReactionText = document.createElement("p");
  communityReactionText.className = "rs-section-text";
  communityReactionText.textContent = reactionLabel(uiLanguage, summary.communityReaction);

  communityReactionSection.appendChild(communityReactionLabel);
  communityReactionSection.appendChild(communityReactionText);

  body.appendChild(postSection);
  body.appendChild(communitySection);
  body.appendChild(createReactionSection(summary, uiLanguage, commentCount));

  // --- Footer ---
  const footer = document.createElement("div");
  footer.className = "rs-modal-footer";
  footer.setAttribute("dir", "ltr");

  // Safe: this markup is entirely static — no dynamic values are interpolated into it.
  // #26: the footer is frozen English on every language — only the modal body translates - PreYem
  footer.innerHTML = `
    <span class="rs-modal-footer-text">${uiText("en", "ft_built_by")}<span class="rs-modal-footer-model"></span></span>
    <div class="rs-modal-footer-links">
      <a href="https://preyem.me/" target="_blank" rel="noopener" title="Portfolio" aria-label="Portfolio">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-user-icon lucide-user"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      </a>
      <a href="https://github.com/PreYem/reddit-summarizer-preyem" target="_blank" rel="noopener" title="GitHub" aria-label="GitHub repository">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.604-3.369-1.342-3.369-1.342-.454-1.155-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.741 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z"/></svg>
      </a>
      <a href="https://gitlab.com/PreYem/reddit-summarizer-preyem" target="_blank" rel="noopener" title="GitLab" aria-label="GitLab repository">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M22.346 14.817 21.06 10.96l-2.532-7.797a.53.53 0 0 0-1.008 0L15 10.96H9L6.48 3.163a.53.53 0 0 0-1.008 0L2.94 10.96 1.654 14.817a1.056 1.056 0 0 0 .383 1.18L12 23l9.963-7.003a1.056 1.056 0 0 0 .383-1.18z"/></svg>
      </a>
    </div>
  `;
  // Fill the footer-model span with the source sentence, highlighting the provider label,
  // the elapsed time and the model in accent colors (textContent only, never innerHTML).
  // #24 rev6: same sentence shape for every source — "Summarized by <label> in <time> | <model>."
  // with the label colored per mode (cloud = "Reddit Summarizer's backend", local = "Your
  // Local LLM", api = "Your AI Cloud Provider"), the model name after " | ", and a period -
  // PreYem
  const modelSpan = footer.querySelector(".rs-modal-footer-model")!;
  const addPart = (cls: string | null, text: string) => {
    if (cls) {
      const part = document.createElement("span");
      part.className = cls;
      part.textContent = text;
      modelSpan.appendChild(part);
    } else {
      modelSpan.appendChild(document.createTextNode(text));
    }
  };

  if (elapsedMs === null || mode === null) {
    addPart(null, uiText("en", "ft_generated_by"));
    addPart("rs-ft-model", summary.aiModel);
    addPart(null, ".");
  } else {
    addPart(null, uiText("en", "ft_summarize_by"));
    addPart(
      "rs-ft-label",
      mode === "local"
        ? uiText("en", "ft_label_local")
        : mode === "api"
          ? uiText("en", "ft_label_api")
          : uiText("en", "ft_label_cloud"),
    );
    addPart(null, uiText("en", "ft_in"));
    addPart("rs-ft-time", formatElapsed(elapsedMs, "en"));
    addPart(null, " | ");
    addPart("rs-ft-model", summary.aiModel);
    addPart(null, ".");
  }

  modal.appendChild(header);
  modal.appendChild(body);
  body.appendChild(footer);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeModal();
  });

  // ESC always closes the modal; named so repeated showModal calls never stack
  // duplicate listeners - PreYem
  document.removeEventListener("keydown", onModalKeyDown);
  document.addEventListener("keydown", onModalKeyDown);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => overlay.classList.add("rs-modal-visible"));
  });
}

// #21 error modal: same shell as the summary modal (same overlay + entrance animation,
// same ✕/overlay-click/ESC closes), only the content differs. Errors are never cached —
// closing it leaves the button idle and clickable for a fresh attempt - PreYem
export function showErrorModal(provider: string, model: string, kind: string, message: string, uiLanguage = "en"): void {
  document.querySelector(".rs-modal-backgroundOverlay")?.remove();

  const overlay = document.createElement("div");
  overlay.className = "rs-modal-backgroundOverlay";
  overlay.classList.add(getRedditTheme() === "dark" ? "rs-theme-dark" : "rs-theme-light");

  const modal = document.createElement("div");
  modal.className = "rs-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "rs-modal-title");
  modal.setAttribute("dir", isRtl(uiLanguage) ? "rtl" : "ltr");

  const header = document.createElement("div");
  header.className = "rs-modal-header";

  const title = document.createElement("span");
  title.className = "rs-modal-title";
  title.id = "rs-modal-title";
  title.textContent = uiText(uiLanguage, "err_title");

  const closeBtn = document.createElement("button");
  closeBtn.className = "rs-modal-close";
  closeBtn.textContent = "\u2715";
  closeBtn.setAttribute("aria-label", uiText(uiLanguage, "modal_error_aria"));
  closeBtn.addEventListener("click", closeModal);

  header.appendChild(title);
  header.appendChild(closeBtn);

  const body = document.createElement("div");
  body.className = "rs-modal-body";

  const addSection = (label: string, text: string) => {
    const section = document.createElement("div");
    section.className = "rs-section";

    const labelDiv = document.createElement("div");
    labelDiv.className = "rs-section-label";
    labelDiv.textContent = label;

    const textP = document.createElement("p");
    textP.className = "rs-section-text";
    textP.textContent = text;

    section.appendChild(labelDiv);
    section.appendChild(textP);
    body.appendChild(section);
  };

  addSection(uiText(uiLanguage, "err_provider"), provider);
  addSection(uiText(uiLanguage, "err_model"), model);
  addSection(uiText(uiLanguage, "err_type"), kind);
  addSection(uiText(uiLanguage, "err_message"), message);

  modal.appendChild(header);
  modal.appendChild(body);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeModal();
  });

  document.removeEventListener("keydown", onModalKeyDown);
  document.addEventListener("keydown", onModalKeyDown);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => overlay.classList.add("rs-modal-visible"));
  });
}

function closeModal() {
  const overlay = document.querySelector(".rs-modal-backgroundOverlay");
  if (!overlay) return;

  overlay.classList.remove("rs-modal-visible");
  overlay.addEventListener("transitionend", () => overlay.remove(), { once: true });
}

// Named module-level so add/remove always pair up - PreYem
function onModalKeyDown(e: KeyboardEvent) {
  if (e.key === "Escape") closeModal();
}