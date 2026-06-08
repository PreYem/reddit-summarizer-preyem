export function createButton(): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = "rs-btn";
  btn.textContent = "✦ Summe--arize";

  // Stop clicks on the button from reaching Reddit's link handlers
  btn.addEventListener("mousedown", (e) => {
    e.stopPropagation();
    e.preventDefault();
  });

  return btn;
}

export function showPopup(anchor: HTMLElement, content: string) {
  // Remove any existing popup
  document.querySelector(".rs-popup")?.remove();

  const popup = document.createElement("div");
  popup.className = "rs-popup";
  popup.textContent = content;

  // Close on outside click
  setTimeout(() => {
    document.addEventListener("click", () => popup.remove(), { once: true });
  }, 0);

  anchor.parentElement?.appendChild(popup);
}

export function setButtonState(btn: HTMLButtonElement, state: "idle" | "loading" | "error") {
  const labels = {
    idle: "✦ Summarize",
    loading: "⏳ Summarizing...",
    error: "✗ Failed",
  };
  btn.textContent = labels[state];
  btn.disabled = state === "loading";
}
