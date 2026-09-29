// MIE Extension — Content script
// Attempts to detect a token address from the current page.
// V1 uses a simple heuristic: looks for Solana-style base58 addresses
// in the URL or page text. If found, sends it to the background worker.
// This is intentionally lightweight — the heavy lifting is done by the backend.

(function () {
  function detectTokenAddress() {
    // Check URL path segments for a base58-like address (32-44 chars)
    const url = window.location.href;
    const pathParts = url.split('/');
    for (const part of pathParts) {
      if (part.length >= 32 && part.length <= 48 && /^[A-Za-z0-9]+$/.test(part)) {
        return part;
      }
    }
    // Check common data attributes
    const tokenEl = document.querySelector('[data-token-address]');
    if (tokenEl) {
      const addr = tokenEl.getAttribute('data-token-address');
      if (addr) return addr;
    }
    return null;
  }

  const detected = detectTokenAddress();
  if (detected) {
    chrome.runtime.sendMessage({ type: 'TOKEN_DETECTED', address: detected });
  }
})();
