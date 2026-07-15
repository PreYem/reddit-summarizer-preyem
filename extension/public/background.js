chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "SUMMARIZE") return;

  fetch(message.backendUrl + "/summarize", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "extension-frontend-key": "reddit-summary-yem0417",
    },

    
    body: JSON.stringify(message.data),
  })
    .then((response) => response.json())
    .then((json) => sendResponse({ ok: true, summary: json }))
    .catch((error) => sendResponse({ ok: false, error: err.message }));

  return true;
});
