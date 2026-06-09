export interface Summary {
  post: string;
  community: string;
}

const summaryCache = new Map<string, Summary>();

export function getCachedSummary(): Summary | null {
  return summaryCache.get(window.location.href) ?? null;
}

export function setCachedSummary(summary: Summary): void {
  summaryCache.set(window.location.href, summary);
}

export function createButton(): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = "rs-btn";
  btn.textContent = "AI Summary";

  btn.addEventListener("mousedown", (e) => {
    e.stopPropagation();
    e.preventDefault();
  });

  return btn;
}

export function setButtonState(btn: HTMLButtonElement, state: "idle" | "loading" | "error") {
  const labels = {
    // idle: "✦ Summarize",
    idle: "AI Summary",
    loading: "⏳ Summarizing...",
    error: "Failed to summarize",
  };
  btn.textContent = labels[state];
  btn.disabled = state === "loading";
}

export function showModal(summary: Summary) {
  document.querySelector(".rs-modal-overlay")?.remove();

  const overlay = document.createElement("div");
  overlay.className = "rs-modal-overlay";

  const modal = document.createElement("div");
  modal.className = "rs-modal";

  const header = document.createElement("div");
  header.className = "rs-modal-header";

  const title = document.createElement("span");
  title.className = "rs-modal-title";
  title.textContent = "Reddit Summary";

  const closeBtn = document.createElement("button");
  closeBtn.className = "rs-modal-close";
  closeBtn.textContent = "✕";
  closeBtn.addEventListener("click", closeModal);

  header.appendChild(title);
  header.appendChild(closeBtn);

  const body = document.createElement("div");
  body.className = "rs-modal-body";

  const postSection = document.createElement("div");
  postSection.className = "rs-section";

  const postLabel = document.createElement("div");
  postLabel.className = "rs-section-label";
  postLabel.textContent = "Post";

  const postText = document.createElement("p");
  postText.className = "rs-section-text";
  postText.textContent = summary.post;

  postSection.appendChild(postLabel);
  postSection.appendChild(postText);

  const communitySection = document.createElement("div");
  communitySection.className = "rs-section";

  const communityLabel = document.createElement("div");
  communityLabel.className = "rs-section-label";
  communityLabel.textContent = "Community";

  const communityText = document.createElement("p");
  communityText.className = "rs-section-text";
  communityText.textContent = summary.community;

  communitySection.appendChild(communityLabel);
  communitySection.appendChild(communityText);

  body.appendChild(postSection);
  body.appendChild(communitySection);

  const footer = document.createElement("div");
  footer.className = "rs-modal-footer";
  footer.innerHTML = `
  <span>Built by PreYem</span>
  <div class="rs-modal-footer-links">
    <a href="https://preyem.me/" target="_blank" rel="noopener" title="Portfolio">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-user-icon lucide-user"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
    </a>
    <a href="https://github.com/PreYem" target="_blank" rel="noopener" title="GitHub">
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.604-3.369-1.342-3.369-1.342-.454-1.155-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.741 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z"/></svg>
    </a>
    <a href="https://gitlab.com/PreYem/reddit-summarizer-preyem" target="_blank" rel="noopener" title="GitLab">
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M22.346 14.817 21.06 10.96l-2.532-7.797a.53.53 0 0 0-1.008 0L15 10.96H9L6.48 3.163a.53.53 0 0 0-1.008 0L2.94 10.96 1.654 14.817a1.056 1.056 0 0 0 .383 1.18L12 23l9.963-7.003a1.056 1.056 0 0 0 .383-1.18z"/></svg>
    </a>
  </div>
`;

  modal.appendChild(header);
  modal.appendChild(body);
  body.appendChild(footer);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal();
  });

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      closeModal();
      document.removeEventListener("keydown", onKeyDown);
    }
  };
  document.addEventListener("keydown", onKeyDown);

  requestAnimationFrame(() => overlay.classList.add("rs-modal-visible"));
}

function closeModal() {
  const overlay = document.querySelector(".rs-modal-overlay");
  if (!overlay) return;
  overlay.classList.remove("rs-modal-visible");
  overlay.addEventListener("transitionend", () => overlay.remove(), { once: true });
}
