// MIE Extension — Background service worker
// Receives token addresses detected by the content script and stores
// the last detected address so the popup can auto-fill it.

chrome.runtime.onInstalled.addListener(() => {
  console.log('Meme Intelligence Engine extension installed.');
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'TOKEN_DETECTED' && message.address) {
    chrome.storage.local.set({ lastDetectedToken: message.address });
    sendResponse({ ok: true });
  }
  sendResponse({ ok: false });
  return true;
});
