chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "SUMMARIZE") return;

  fetch(`${message.backendUrl}/summarize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message.data),
  })
    .then((res) => res.json())
    .then((json) => sendResponse({ ok: true, summary: json }))
    .catch((err) => sendResponse({ ok: false, error: err.message }));

  return true;
});
