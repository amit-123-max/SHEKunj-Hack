// NeuroRead AI — telemetry.js
// On-device behavioral signal collector for the Adaptive Agent.
// Privacy-first: collects only metrics (no content). All data stays in chrome.storage.local.

(function () {
  "use strict";
  if (window.__NR_TELEMETRY_LOADED) return;
  window.__NR_TELEMETRY_LOADED = true;

  // ─── Extension Context Guard ─────────────────────────────────
  // When the extension is reloaded on an already-open tab, all content-script
  // code (even simple variable access in event callbacks) throws:
  //   "Uncaught Error: Extension context invalidated."
  //
  // Strategy:
  //   1. A single `contextDead` flag is checked at the top of EVERY callback.
  //   2. When context dies, we call teardown() to remove all listeners/intervals.
  //   3. chrome.runtime.id access is wrapped — it throws when context is gone.
  let contextDead = false;

  function isContextAlive() {
    if (contextDead) return false;
    try {
      // chrome.runtime.id throws synchronously if the context is invalidated
      return !!(chrome && chrome.runtime && chrome.runtime.id);
    } catch (_) {
      contextDead = true;
      teardown();
      return false;
    }
  }

  // Will be populated below; called to clean up everything when context dies
  function teardown() {
    contextDead = true;
    try { clearInterval(dwellInterval);       } catch (_) {}
    try { clearInterval(featurePollInterval); } catch (_) {}
    try { window.removeEventListener("scroll",   onScroll);         } catch (_) {}
    try { window.removeEventListener("popstate", onPopstate);       } catch (_) {}
    try { document.removeEventListener("mouseup", onMouseup, false); } catch (_) {}
    try { document.removeEventListener("click",   onClick,   true);  } catch (_) {}
    try { if (paragraphObserver) paragraphObserver.disconnect();     } catch (_) {}
    if (window.NR_Telemetry) window.NR_Telemetry._dead = true;
  }

  // ─── Signal State ───────────────────────────────────────────
  const signals = {
    scrollDepth: 0,
    dwellTimeSeconds: 0,
    selectionCount: 0,
    backNavigations: 0,
    featuresActive: [],
    readingPaceWpm: 0,
    repeatedParagraphVisits: 0,
    imageClicks: 0,
    rapidScrollEvents: 0,
    longDwellParagraphs: 0,
  };

  let sessionStartTime = Date.now();
  let lastScrollY = 0;
  let lastScrollTime = Date.now();
  let rapidScrollCount = 0;
  let scrollDebounceTimer = null;

  // ─── Dwell time tracking ────────────────────────────────────
  const dwellInterval = setInterval(() => {
    if (!isContextAlive()) return;
    signals.dwellTimeSeconds = (Date.now() - sessionStartTime) / 1000;
  }, 5000);

  // ─── Scroll tracking (debounced) ────────────────────────────
  function onScroll() {
    if (!isContextAlive()) return;
    if (scrollDebounceTimer) return;

    scrollDebounceTimer = setTimeout(() => {
      scrollDebounceTimer = null;
      if (!isContextAlive()) return;

      const now = Date.now();
      const scrollY = window.scrollY;
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      signals.scrollDepth = Math.min(1, scrollY / maxScroll);

      const delta = Math.abs(scrollY - lastScrollY);
      const elapsed = now - lastScrollTime;
      if (delta > 800 && elapsed < 1000) {
        rapidScrollCount++;
        if (rapidScrollCount >= 3) {
          signals.rapidScrollEvents = rapidScrollCount;
        }
      } else {
        rapidScrollCount = Math.max(0, rapidScrollCount - 1);
      }

      lastScrollY = scrollY;
      lastScrollTime = now;

      if (signals.dwellTimeSeconds > 10) {
        const wordsEstimate = maxScroll > 0 ? (signals.scrollDepth * document.body.innerText.length / 5) : 0;
        signals.readingPaceWpm = Math.round((wordsEstimate / signals.dwellTimeSeconds) * 60);
      }
    }, 500);
  }
  window.addEventListener("scroll", onScroll, { passive: true });

  // ─── Text selection tracking ────────────────────────────────
  function onMouseup() {
    if (!isContextAlive()) return;
    setTimeout(() => {
      if (!isContextAlive()) return;
      const sel = window.getSelection();
      if (sel && sel.toString().trim().length > 5) {
        signals.selectionCount++;
      }
    }, 100);
  }
  document.addEventListener("mouseup", onMouseup);

  // ─── Paragraph dwell tracking (IntersectionObserver) ────────
  const paragraphDwellMap = new Map();
  let paragraphObserver = null;

  function setupParagraphObserver() {
    if (!isContextAlive()) return;
    if (paragraphObserver) return;

    const container = document.querySelector("article, main, .content, .mw-parser-output") || document.body;
    const paragraphs = container.querySelectorAll("p, li, blockquote, dd");
    if (paragraphs.length === 0) return;

    paragraphObserver = new IntersectionObserver((entries) => {
      if (!isContextAlive()) return;
      entries.forEach((entry) => {
        const el = entry.target;
        const key = el.textContent.substring(0, 50);

        if (entry.isIntersecting) {
          if (!paragraphDwellMap.has(key)) {
            paragraphDwellMap.set(key, { startTime: Date.now(), visits: 0, totalDwell: 0 });
          }
          const data = paragraphDwellMap.get(key);
          data.startTime = Date.now();
          data.visits++;
          if (data.visits >= 3) {
            signals.repeatedParagraphVisits = Math.max(signals.repeatedParagraphVisits, data.visits);
          }
        } else {
          const data = paragraphDwellMap.get(key);
          if (data && data.startTime > 0) {
            const dwell = (Date.now() - data.startTime) / 1000;
            data.totalDwell += dwell;
            data.startTime = 0;
            if (data.totalDwell > 15) {
              signals.longDwellParagraphs++;
            }
          }
        }
      });
    }, { threshold: 0.5 });

    paragraphs.forEach((p) => {
      if (p.textContent.trim().length > 30) {
        paragraphObserver.observe(p);
      }
    });
  }
  setTimeout(setupParagraphObserver, 3000);

  // ─── Image click tracking ──────────────────────────────────
  function onClick(e) {
    if (!isContextAlive()) return;
    if (e.target.tagName === "IMG" || e.target.closest(".nr-img-wrap")) {
      signals.imageClicks++;
    }
  }
  document.addEventListener("click", onClick, true);

  // ─── Back navigation tracking ──────────────────────────────
  function onPopstate() {
    if (!isContextAlive()) return;
    signals.backNavigations++;
  }
  window.addEventListener("popstate", onPopstate);

  // ─── Active features tracking ──────────────────────────────
  function updateActiveFeatures() {
    if (!isContextAlive()) return;
    try {
      chrome.storage.local.get("nrState", (res) => {
        if (chrome.runtime.lastError) return;
        if (res.nrState) {
          const featureKeys = [
            "formatting", "focus", "simplify", "read",
            "toc", "ruler", "focusMode", "reader",
            "imageExplainer", "tone"
          ];
          signals.featuresActive = featureKeys.filter(k => res.nrState[k]);
        }
      });
    } catch (_) {
      teardown();
    }
  }
  const featurePollInterval = setInterval(updateActiveFeatures, 10000);
  updateActiveFeatures();

  // ─── Page context builder ──────────────────────────────────
  function buildPageContext() {
    const container = document.querySelector("article, main, .content, .mw-parser-output") || document.body;
    const paragraphs = container.querySelectorAll("p, li, blockquote, dd");
    const images = container.querySelectorAll("img");
    const totalText = container.innerText || "";

    let totalParagraphChars = 0;
    let visibleParagraphs = 0;
    paragraphs.forEach(p => {
      if (p.offsetParent !== null && p.textContent.trim().length > 20) {
        totalParagraphChars += p.textContent.length;
        visibleParagraphs++;
      }
    });

    const avgParagraphLen = visibleParagraphs > 0
      ? Math.round(totalParagraphChars / visibleParagraphs)
      : 0;

    const bodyLen = Math.max(1, document.body.innerText.length);
    const textDensity = Math.min(1, totalParagraphChars / bodyLen);

    let contentType = "article";
    const links = container.querySelectorAll("a");
    if (links.length > 20 && images.length > 5) contentType = "feed";
    if (document.querySelector(".social, .timeline, .tweet")) contentType = "social";
    if (document.querySelector("table, .reference, .mw-parser-output")) contentType = "reference";

    return {
      page_url: window.location.href,
      page_title: document.title || "",
      content_type: contentType,
      text_density: Math.round(textDensity * 100) / 100,
      image_count: images.length,
      avg_paragraph_length: avgParagraphLen,
      total_text_length: totalText.length,
    };
  }

  // ─── Public API ────────────────────────────────────────────
  window.NR_Telemetry = {
    _dead: false,
    getSignals: function () {
      signals.dwellTimeSeconds = (Date.now() - sessionStartTime) / 1000;
      return { ...signals };
    },
    getPageContext: buildPageContext,
    reset: function () {
      sessionStartTime = Date.now();
      Object.keys(signals).forEach(k => {
        if (typeof signals[k] === "number") signals[k] = 0;
        else if (Array.isArray(signals[k])) signals[k] = [];
      });
      paragraphDwellMap.clear();
      rapidScrollCount = 0;
    },
    destroy: function () {
      teardown();
    },
  };
})();
