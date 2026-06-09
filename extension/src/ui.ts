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
  btn.textContent = "AI Summarize";

  btn.addEventListener("mousedown", (e) => {
    e.stopPropagation();
    e.preventDefault();
  });

  return btn;
}

export function setButtonState(btn: HTMLButtonElement, state: "idle" | "loading" | "error") {
  const labels = {
    // idle: "✦ Summarize",
    idle: "AI Summarize",
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
  title.textContent = "Reddit Summarize PreYem";

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
  modal.appendChild(header);
  modal.appendChild(body);
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
