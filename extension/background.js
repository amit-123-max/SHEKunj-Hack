// NeuroRead AI — Service Worker (background.js)
// Proxies fetch requests from content scripts to bypass mixed-content restrictions.
// MV3 keepalive: polls a lightweight alarm so the worker doesn't die mid-image-analysis.

// ─── MV3 Service Worker Keepalive ──────────────────────────────────────────
// Chrome MV3 terminates idle service workers after ~30s.
// Image analysis can take 3-8s; we must keep the worker alive during that time.
// Using chrome.alarms as a lightweight heartbeat (fires every 20s).
chrome.alarms.create("nr_keepalive", { periodInMinutes: 0.4 }); // every ~24s
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "nr_keepalive") {
    // No-op — just waking the worker so it doesn't die mid-fetch
  }
});

chrome.runtime.onInstalled.addListener(() => {
  console.log("[NeuroRead] Extension installed.");
  // Re-register the keepalive alarm in case it was cleared
  chrome.alarms.create("nr_keepalive", { periodInMinutes: 0.4 });
});

// Track active fetch count so we can report status
let activeFetches = 0;

// Maximum time we allow a backend fetch to run.
// Frontend timeout (image-explainer.js) = 8s; backend endpoint ceilings = 10-14s.
// 9s here ensures background stops before frontend shows the fallback UI.
const FETCH_TIMEOUT_MS = 9000; // 9 seconds

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  // ─── Keepalive ping (sent by content scripts before long operations) ───
  if (msg.type === "PING") {
    sendResponse({ ok: true, alive: true });
    return false;
  }

  // ─── Proxy HTTP requests so content scripts on HTTPS pages can reach localhost ───
  if (msg.type === "FETCH") {
    activeFetches++;
    console.log(`[NR-BG] FETCH proxy #${activeFetches}: ${msg.method || "GET"} ${msg.url}`);
    const bgStart = Date.now();

    // AbortController gives us a hard ceiling — Groq can take 15-30s+ on vision
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => {
      controller.abort();
      console.warn(`[NR-BG] FETCH timeout after ${FETCH_TIMEOUT_MS}ms: ${msg.url}`);
    }, FETCH_TIMEOUT_MS);

    const opts = {
      method:  msg.method  || "GET",
      headers: msg.headers || {},
      signal:  controller.signal,
    };
    if (msg.body) {
      opts.body = JSON.stringify(msg.body);
    }

    fetch(msg.url, opts)
      .then(res => {
        clearTimeout(timeoutId);
        const elapsed = ((Date.now() - bgStart) / 1000).toFixed(1);
        console.log(`[NR-BG] Backend responded: ${res.status} in ${elapsed}s`);
        if (!res.ok) throw new Error(`Backend ${res.status} ${res.statusText}`);
        return res.json();
      })
      .then(data => {
        activeFetches--;
        console.log(`[NR-BG] Sending OK data back to content script (active: ${activeFetches})`);
        sendResponse({ ok: true, data });
      })
      .catch(err => {
        clearTimeout(timeoutId);
        activeFetches--;
        const isTimeout = err.name === "AbortError";
        const msg2 = isTimeout
          ? `Request timed out after ${FETCH_TIMEOUT_MS / 1000}s`
          : err.message;
        console.error(`[NR-BG] FETCH ${isTimeout ? "TIMEOUT" : "error"}: ${msg2} (active: ${activeFetches})`);
        sendResponse({ ok: false, error: msg2 });
      });

    return true; // keep channel open for async response
  }

  // ─── Handle toggling network-level adblocking rules ───
  if (msg.type === "TOGGLE_AD_RULES") {
    if (msg.enable) {
      chrome.declarativeNetRequest.updateEnabledRulesets({
        enableRulesetIds: ["ruleset_1"]
      }).catch(err => console.error("Could not enable ruleset", err));
    } else {
      chrome.declarativeNetRequest.updateEnabledRulesets({
        disableRulesetIds: ["ruleset_1"]
      }).catch(err => console.error("Could not disable ruleset", err));
    }
    sendResponse({ success: true });
    return false;
  }

  // ─── Proxy audio uploads (binary) for voice transcription ───
  if (msg.type === "FETCH_AUDIO") {
    const bgAudioStart = Date.now();
    console.log(`[NR-BG] FETCH_AUDIO proxy: ${msg.url} | size: ${msg.audioBase64?.length ?? 0} chars`);

    // AbortController gives a hard ceiling — Whisper cold-start can take 15s
    const audioController = new AbortController();
    const audioTimeoutId = setTimeout(() => {
      audioController.abort();
      console.warn("[NR-BG] FETCH_AUDIO timed out after 25s");
    }, 25000);

    // Convert base64 back to binary
    let bytes;
    try {
      const binaryStr = atob(msg.audioBase64);
      bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
    } catch (decodeErr) {
      clearTimeout(audioTimeoutId);
      console.error("[NR-BG] FETCH_AUDIO base64 decode error:", decodeErr.message);
      sendResponse({ ok: false, error: "base64_decode_failed: " + decodeErr.message });
      return true;
    }

    const blob = new Blob([bytes], { type: "audio/webm" });
    const formData = new FormData();
    formData.append("audio", blob, msg.filename || "recording.webm");

    fetch(msg.url, { method: "POST", body: formData, signal: audioController.signal })
      .then(res => {
        clearTimeout(audioTimeoutId);
        const elapsed = ((Date.now() - bgAudioStart) / 1000).toFixed(1);
        console.log(`[NR-BG] FETCH_AUDIO response: ${res.status} in ${elapsed}s`);
        if (!res.ok) throw new Error(`Backend ${res.status} ${res.statusText}`);
        return res.json();
      })
      .then(data => {
        console.log("[NR-BG] FETCH_AUDIO success:", JSON.stringify(data).slice(0, 120));
        sendResponse({ ok: true, data });
      })
      .catch(err => {
        clearTimeout(audioTimeoutId);
        const isTimeout = err.name === "AbortError";
        const errMsg = isTimeout ? "Voice request timed out after 15s" : err.message;
        console.error(`[NR-BG] FETCH_AUDIO ${isTimeout ? "TIMEOUT" : "error"}: ${errMsg}`);
        sendResponse({ ok: false, error: errMsg });
      });

    return true; // keep channel open for async response
  }

  // ─── TTS via chrome.tts ───
  if (msg.type === "TTS_START") {
    const tabId = sender.tab?.id;
    const paragraphs = msg.paragraphs || [];
    globalThis.__NR_TTS_STOPPED = false;

    (async function speakAll() {
      for (let i = 0; i < paragraphs.length; i++) {
        if (globalThis.__NR_TTS_STOPPED) break;

        // Highlight current paragraph
        try {
          await chrome.tabs.sendMessage(tabId, { type: "TTS_HIGHLIGHT", index: i });
        } catch(e) {}

        // Speak and wait for completion
        await new Promise((resolve) => {
          chrome.tts.speak(paragraphs[i], {
            rate: 0.9,
            pitch: 1.0,
            lang: "en-US",
            onEvent: function(event) {
              if (event.type === 'word') {
                try {
                  chrome.tabs.sendMessage(tabId, {
                    type: "TTS_WORD_HIGHLIGHT",
                    index: i,
                    charIndex: event.charIndex,
                    length: event.length
                  });
                } catch(e) {}
              }
              // Any terminal event resolves immediately
              if (event.type === "end" || event.type === "interrupted" ||
                  event.type === "cancelled" || event.type === "error") {
                resolve();
              }
            }
          });
        });
      }
      // Done
      try {
        await chrome.tabs.sendMessage(tabId, { type: "TTS_DONE" });
      } catch(e) {}
    })();

    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === "TTS_STOP") {
    globalThis.__NR_TTS_STOPPED = true;
    chrome.tts.stop(); // Fires "interrupted" event → instantly resolves the current promise
    sendResponse({ ok: true });
    return false;
  }
});
