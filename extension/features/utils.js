// NeuroRead AI — utils.js
// Shared zero-dependency utilities injected FIRST into every page.
// All other content scripts can safely depend on window.NR_Utils.
//
// Provides:
//   NR_Utils.safeSend(payload)      — Promise-based chrome.runtime.sendMessage
//   NR_Utils.isContextAlive()       — Extension context validity check
//   NR_Utils.speak(text, rate)      — Client-side TTS via speechSynthesis
//   NR_Utils.API                    — Backend base URL (single source of truth)

(function () {
  "use strict";
  // Guard: only inject once per page context
  if (window.__NR_UTILS_LOADED) return;
  window.__NR_UTILS_LOADED = true;

  const API_BASE = "http://localhost:8000";

  // ─── Extension context validity ────────────────────────────
  // chrome.runtime.id throws synchronously when the extension is reloaded
  // while the page is still open. Every chrome.* call must be guarded.
  function isContextAlive() {
    try {
      return !!(typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id);
    } catch (_) {
      return false;
    }
  }

  // ─── Safe message passing ───────────────────────────────────
  // Returns a Promise that always resolves (never rejects).
  // Resolves with null on any error so callers can just check `if (!res)`.
  function safeSend(payload) {
    return new Promise((resolve) => {
      if (!isContextAlive()) {
        console.warn("[NR-Utils] Extension context not valid — skipping sendMessage.");
        resolve(null);
        return;
      }
      try {
        chrome.runtime.sendMessage(payload, (response) => {
          if (chrome.runtime.lastError) {
            const msg = chrome.runtime.lastError.message || "unknown";
            // Suppress the noisy "Receiving end does not exist" log on first load
            if (!msg.includes("Receiving end does not exist")) {
              console.warn("[NR-Utils] sendMessage error:", msg);
            }
            resolve(null);
          } else {
            resolve(response);
          }
        });
      } catch (err) {
        console.warn("[NR-Utils] sendMessage exception:", err.message);
        resolve(null);
      }
    });
  }

  // ─── Safe backend fetch (via background proxy) ──────────────
  // Returns { ok, data } or null on complete failure.
  async function apiFetch(url, method, body, headers) {
    const res = await safeSend({
      type:    "FETCH",
      url:     API_BASE + url,
      method:  method || "GET",
      headers: headers || { "Content-Type": "application/json" },
      body:    body || undefined,
    });
    return res;  // { ok: bool, data: {} } | null
  }

  // ─── Client-side TTS ────────────────────────────────────────
  // Thin wrapper around speechSynthesis to avoid duplicating it everywhere.
  function speak(text, rate) {
    if (!text || !("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(String(text).slice(0, 500));
    u.lang  = "en-US";
    u.rate  = typeof rate === "number" ? rate : 1.0;
    u.pitch = 1.05;
    speechSynthesis.speak(u);
  }

  // ─── Public API ─────────────────────────────────────────────
  window.NR_Utils = {
    API:            API_BASE,
    isContextAlive: isContextAlive,
    safeSend:       safeSend,
    apiFetch:       apiFetch,
    speak:          speak,
  };

  console.debug("[NR-Utils] Loaded. Context alive:", isContextAlive());
})();
