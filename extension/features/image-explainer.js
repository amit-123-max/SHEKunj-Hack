// NeuroRead AI — image-explainer.js
// Module: Multimodal Image/Diagram Explainer
// Auto-activates on page load. Supports lazy-load, MutationObserver,
// rich card UI, 3-stage CORS fallback, and structured backend response.

(function () {
  "use strict";
  if (window.__NR_IMAGE_EXPLAINER_LOADED) return;
  window.__NR_IMAGE_EXPLAINER_LOADED = true;

  const STYLE_ID  = "nr-img-explainer-style";
  // Primary endpoint: /analyze-screenshot returns structured ScreenshotAnalysis
  // Response shape: { success, analysis: { image_type, title, key_facts, ... }, error }
  const API_URL   = "http://localhost:8000/analyze-screenshot";
  const MIN_DIM   = 60;        // px — skip tiny icons/bullets
  const WRAP_ATTR = "data-nr-wrapped";

  // ─── Styles ────────────────────────────────────────────────────────────────
  if (!document.getElementById(STYLE_ID)) {
    const s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = `
      /* Wrapper keeps image in normal flow; button overlays absolutely */
      .nr-img-wrap {
        position: relative !important;
        display: inline-block !important;
        line-height: 0 !important;
      }

      /* Overlay button — always visible (no hover-only) for reliability */
      .nr-img-explain-btn {
        position: absolute !important;
        top: 8px !important;
        right: 8px !important;
        z-index: 2147483640 !important;
        width: 36px !important;
        height: 36px !important;
        border-radius: 50% !important;
        background: linear-gradient(135deg, #7C3AED, #5B21B6) !important;
        color: #fff !important;
        border: 2px solid rgba(255,255,255,0.9) !important;
        font-size: 16px !important;
        cursor: pointer !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        box-shadow: 0 2px 12px rgba(124,58,237,0.6) !important;
        transition: opacity 0.2s ease, transform 0.2s ease !important;
        opacity: 0.85 !important;
        pointer-events: auto !important;
        line-height: 1 !important;
      }
      .nr-img-explain-btn:hover {
        opacity: 1 !important;
        transform: scale(1.15) !important;
        box-shadow: 0 4px 18px rgba(124,58,237,0.8) !important;
      }
      .nr-img-explain-btn:focus {
        outline: 3px solid #A78BFA !important;
        outline-offset: 2px !important;
      }
      .nr-img-explain-btn.nr-loading {
        opacity: 1 !important;
        pointer-events: none !important;
        animation: nr-spin 0.8s linear infinite !important;
      }
      @keyframes nr-spin {
        from { transform: rotate(0deg); }
        to   { transform: rotate(360deg); }
      }

      /* ── Explanation card (fixed — never clipped by overflow:hidden) ── */
      .nr-explain-card {
        position: fixed !important;
        z-index: 2147483647 !important;
        width: 380px !important;
        max-width: calc(100vw - 28px) !important;
        background: linear-gradient(145deg, #1E1B4B 0%, #312E81 100%) !important;
        color: #E0E7FF !important;
        border: 1px solid rgba(124,58,237,0.5) !important;
        border-radius: 16px !important;
        padding: 18px !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
        font-size: 13px !important;
        line-height: 1.6 !important;
        box-shadow: 0 12px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(124,58,237,0.25) !important;
        animation: nr-card-in 0.26s cubic-bezier(0.22,1,0.36,1) !important;
        overflow: hidden !important;
        word-break: break-word !important;
      }
      @keyframes nr-card-in {
        from { opacity: 0; transform: scale(0.93) translateY(8px); }
        to   { opacity: 1; transform: scale(1) translateY(0); }
      }

      /* Header */
      .nr-ec-header {
        display: flex !important;
        align-items: center !important;
        gap: 8px !important;
        margin-bottom: 12px !important;
        padding-bottom: 10px !important;
        border-bottom: 1px solid rgba(124,58,237,0.3) !important;
      }
      .nr-ec-badge {
        font-size: 10px !important;
        font-weight: 700 !important;
        text-transform: uppercase !important;
        letter-spacing: 0.6px !important;
        padding: 3px 8px !important;
        border-radius: 10px !important;
        background: rgba(124,58,237,0.3) !important;
        color: #C4B5FD !important;
        flex-shrink: 0 !important;
      }
      .nr-ec-title {
        font-size: 13px !important;
        font-weight: 700 !important;
        color: #A78BFA !important;
        flex: 1 !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
      }
      .nr-ec-close {
        background: rgba(255,255,255,0.08) !important;
        border: none !important;
        color: #94A3B8 !important;
        width: 26px !important;
        height: 26px !important;
        border-radius: 50% !important;
        cursor: pointer !important;
        font-size: 14px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        transition: background 0.15s, color 0.15s !important;
        flex-shrink: 0 !important;
        line-height: 1 !important;
      }
      .nr-ec-close:hover { background: rgba(255,255,255,0.2) !important; color: #E0E7FF !important; }

      /* Explanation text */
      .nr-ec-explanation {
        color: #DDD6FE !important;
        margin: 0 0 12px !important;
        font-size: 13px !important;
        line-height: 1.65 !important;
      }
      /* Loading shimmer */
      .nr-loading-card .nr-ec-explanation {
        background: linear-gradient(
          90deg,
          rgba(124,58,237,0.12) 25%,
          rgba(124,58,237,0.28) 50%,
          rgba(124,58,237,0.12) 75%
        ) !important;
        background-size: 200% 100% !important;
        animation: nr-shimmer 1.3s infinite !important;
        border-radius: 6px !important;
        min-height: 56px !important;
        color: transparent !important;
        user-select: none !important;
      }
      @keyframes nr-shimmer {
        from { background-position: 200% 0; }
        to   { background-position: -200% 0; }
      }

      /* Key facts */
      .nr-ec-facts {
        margin: 0 0 10px !important;
        padding: 0 !important;
        list-style: none !important;
      }
      .nr-ec-facts li {
        padding: 3px 0 3px 18px !important;
        position: relative !important;
        color: #C4B5FD !important;
        font-size: 12px !important;
        line-height: 1.5 !important;
      }
      .nr-ec-facts li::before {
        content: "▸" !important;
        position: absolute !important;
        left: 4px !important;
        color: #7C3AED !important;
      }

      /* Takeaways block */
      .nr-ec-takeaways {
        background: rgba(124,58,237,0.12) !important;
        border-left: 3px solid #7C3AED !important;
        border-radius: 4px !important;
        padding: 8px 12px !important;
        margin: 0 0 12px !important;
      }
      .nr-ec-takeaways p {
        margin: 0 !important;
        font-size: 12px !important;
        color: #A78BFA !important;
        line-height: 1.5 !important;
        font-style: italic !important;
      }

      /* Footer */
      .nr-ec-footer {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        margin-top: 10px !important;
        padding-top: 8px !important;
        border-top: 1px solid rgba(124,58,237,0.2) !important;
      }
      .nr-ec-confidence {
        font-size: 10px !important;
        color: #64748B !important;
        letter-spacing: 0.3px !important;
      }
      .nr-ec-speak-btn {
        background: rgba(124,58,237,0.18) !important;
        color: #C4B5FD !important;
        border: 1px solid rgba(124,58,237,0.35) !important;
        border-radius: 14px !important;
        padding: 5px 14px !important;
        font-size: 11px !important;
        font-weight: 600 !important;
        cursor: pointer !important;
        transition: background 0.15s !important;
        line-height: 1 !important;
      }
      .nr-ec-speak-btn:hover { background: rgba(124,58,237,0.38) !important; }

      /* ── New section system ── */
      .nr-ec-section {
        margin: 0 0 10px !important;
      }
      .nr-ec-section-label {
        font-size: 10px !important;
        font-weight: 700 !important;
        text-transform: uppercase !important;
        letter-spacing: 0.5px !important;
        color: #7C3AED !important;
        margin-bottom: 4px !important;
      }
      .nr-ec-list {
        margin: 0 !important;
        padding: 0 !important;
        list-style: none !important;
      }
      .nr-ec-list li {
        padding: 3px 0 3px 16px !important;
        position: relative !important;
        color: #C4B5FD !important;
        font-size: 12px !important;
        line-height: 1.5 !important;
      }
      .nr-ec-list li::before {
        content: "▸" !important;
        position: absolute !important;
        left: 2px !important;
        color: #7C3AED !important;
      }
      .nr-ec-take {
        margin: 0 0 4px !important;
        font-size: 12px !important;
        color: #A78BFA !important;
        line-height: 1.5 !important;
        font-style: italic !important;
      }
      .nr-ec-tags {
        display: flex !important;
        flex-wrap: wrap !important;
        gap: 4px !important;
      }
      .nr-ec-tag {
        background: rgba(124,58,237,0.18) !important;
        color: #DDD6FE !important;
        border-radius: 8px !important;
        padding: 2px 8px !important;
        font-size: 10px !important;
        font-weight: 500 !important;
      }
      .nr-ec-note {
        margin: 0 !important;
        font-size: 12px !important;
        color: #94A3B8 !important;
        line-height: 1.55 !important;
      }
      .nr-ec-text {
        margin: 0 !important;
        font-family: "SF Mono", "Fira Code", monospace !important;
        font-size: 11px !important;
        color: #BAC8FF !important;
        white-space: pre-wrap !important;
        word-break: break-word !important;
        background: rgba(0,0,0,0.25) !important;
        border-radius: 4px !important;
        padding: 6px 8px !important;
        max-height: 80px !important;
        overflow-y: auto !important;
      }
      /* Confidence bar */
      .nr-ec-conf-wrap {
        flex: 1 !important;
        margin-right: 10px !important;
      }
      .nr-ec-conf-bar {
        height: 3px !important;
        border-radius: 3px !important;
        transition: width 0.4s ease !important;
        margin-bottom: 3px !important;
      }
      .nr-ec-conf-label {
        font-size: 10px !important;
        color: #64748B !important;
      }

      @keyframes nr-pulse {
        0%, 100% { opacity: 0.7; }
        50%       { opacity: 1;   }
      }
      .nr-dot {
        opacity: 0.2;
        transition: opacity 0.2s;
      }

      @media (prefers-reduced-motion: reduce) {
        .nr-img-explain-btn,
        .nr-explain-card,
        .nr-loading-card .nr-ec-explanation { animation: none !important; transition: none !important; }
      }
    `;
    document.head.appendChild(s);
  }

  // ─── Module state ──────────────────────────────────────────────────────────
  let isActive        = false;
  let activeCard      = null;
  let mutationObs     = null;
  let intersectionObs = null;

  // ─── Neurotype helper ──────────────────────────────────────────────────────
  /** Read the active neurotype from the profile panel (safe — never throws). */
  function getNeurotype() {
    try {
      const p = window.NR_ProfilePanel?.getProfile?.();
      if (p?.neurotype && p.neurotype !== "none") return p.neurotype.toLowerCase();
    } catch (_) {}
    return "";
  }

  // ─── Utility ───────────────────────────────────────────────────────────────

  function escHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /** Returns true if this image is worth explaining. */
  function qualifies(img) {
    if (img.hasAttribute(WRAP_ATTR)) return false;
    if (img.naturalWidth  < MIN_DIM) return false;
    if (img.naturalHeight < MIN_DIM) return false;
    if (img.closest("nav, footer, .nav, .menu, #nr-toc-container, [aria-hidden='true']")) return false;
    return true;
  }

  // ─── Base64 extraction (3-stage CORS fallback) ─────────────────────────────

  function canvasToBase64(imgEl) {
    const canvas = document.createElement("canvas");
    const MAX = 1024;
    let w = imgEl.naturalWidth,
        h = imgEl.naturalHeight;
    if (w > MAX || h > MAX) {
      const s = MAX / Math.max(w, h);
      w = Math.round(w * s);
      h = Math.round(h * s);
    }
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(imgEl, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.85);
  }

  async function getBase64(img) {
    // Stage 1 — direct canvas (works for same-origin / already-CORS-allowed images)
    try {
      const d = canvasToBase64(img);
      if (d && d.length > 200) {
        console.log("[NeuroRead/IE] Base64 via direct canvas ✓");
        return d;
      }
    } catch (_) { /* tainted canvas — move on */ }

    // Stage 2 — crossOrigin re-fetch (CDNs that send CORS headers)
    if (img.src && img.src.startsWith("http")) {
      const result = await new Promise((resolve) => {
        const tmp = new Image();
        tmp.crossOrigin = "anonymous";
        tmp.onload = () => {
          try {
            const d = canvasToBase64(tmp);
            resolve(d && d.length > 200 ? d : null);
          } catch (_) { resolve(null); }
        };
        tmp.onerror = () => resolve(null);
        // Cache-bust to force the CORS header to be sent
        tmp.src = img.src.includes("?")
          ? img.src + "&_nrc=" + Date.now()
          : img.src + "?_nrc=" + Date.now();
      });
      if (result) {
        console.log("[NeuroRead/IE] Base64 via crossOrigin re-fetch ✓");
        return result;
      }
    }

    // Stage 3 — fetch as blob via content-script fetch (works for non-CORS images
    // on http:// pages OR if the server returns permissive headers)
    if (img.src && img.src.startsWith("http")) {
      try {
        const resp = await fetch(img.src);
        if (resp.ok) {
          const blob = await resp.blob();
          const dataUrl = await new Promise((res) => {
            const reader = new FileReader();
            reader.onload  = () => res(reader.result);
            reader.onerror = () => res(null);
            reader.readAsDataURL(blob);
          });
          if (dataUrl) {
            console.log("[NeuroRead/IE] Base64 via fetch blob ✓");
            return dataUrl;
          }
        }
      } catch (_) { /* CORS  blocked at fetch level — genuine failure */ }
    }

    console.warn("[NeuroRead/IE] All base64 strategies failed for:", img.src?.slice(-60));
    return null;
  }

  // ─── Context extraction ────────────────────────────────────────────────────

  /** Build a rich context string from 5 sources: page title, nearest heading,
   *  caption, alt/title attrs, and surrounding paragraph.
   *  This is the primary signal the vision model uses to infer image PURPOSE. */
  function getContext(img) {
    const parts = [];

    // 1. Page title — gives broad topic
    if (document.title) parts.push("Page: " + document.title.split(" - ")[0].trim().substring(0, 60));

    // 2. Nearest heading (h1/h2) above the image
    const imgTop = img.getBoundingClientRect().top + window.scrollY;
    const nearestHeading = [...document.querySelectorAll("h1, h2")]
      .filter(h => (h.getBoundingClientRect().top + window.scrollY) < imgTop)
      .slice(-1)[0];
    if (nearestHeading?.innerText?.trim()) {
      parts.push("Section: " + nearestHeading.innerText.trim().substring(0, 80));
    }

    // 3. figcaption / caption element (most precise context)
    const parent = img.closest("figure, .thumb, .image, [class*='caption'], div, td")
      || img.parentElement;
    if (parent) {
      const cap = parent.querySelector("figcaption, .thumbcaption, .caption, .wp-caption-text");
      if (cap?.innerText?.trim()) parts.push("Caption: " + cap.innerText.trim().substring(0, 120));
    }

    // 4. alt and title attributes
    if (img.alt?.trim())   parts.push("Alt: "   + img.alt.trim().substring(0, 120));
    if (img.title?.trim()) parts.push("Title: " + img.title.trim().substring(0, 80));

    // 5. Surrounding paragraph (nearest <p> for topical context)
    const nearestP = img.closest("p") ||
      img.parentElement?.closest("section, article, div")?.querySelector("p");
    if (nearestP?.innerText?.trim().length > 20) {
      parts.push("Context: " + nearestP.innerText.trim().substring(0, 200));
    }

    const ctx = parts.join(" | ");
    console.log("[NeuroRead/IE] Context:", ctx.substring(0, 100) + (ctx.length > 100 ? "…" : ""));
    return ctx.substring(0, 600);
  }

  // ─── Backend call ──────────────────────────────────────────────────────────

  /**
   * Returns true if the extension context is still valid (service worker alive).
   * When the extension is reloaded while the page is open, chrome.runtime becomes
   * invalid. Calling chrome.runtime.id on a dead context throws instantly.
   */
  function isContextAlive() {
    try {
      return !!chrome.runtime?.id;
    } catch (_) {
      return false;
    }
  }

  /** Wake the service worker with a no-op ping before a slow image request. */
  async function pingWorker() {
    if (!isContextAlive()) return; // context dead — skip silently
    if (!window.NR_Utils) return;
    const res = await window.NR_Utils.safeSend({ type: "PING" });
    if (!res && chrome.runtime.lastError) {
      console.log("[NeuroRead/IE] Worker was asleep, waking up…");
      await new Promise(r => setTimeout(r, 300));
    }
  }

  // Frontend timeout: if background + backend together take > 8s, resolve with fallback.
  // background.js already aborts at 12s; 8s here guarantees a UI response.
  const FRONTEND_TIMEOUT_MS = 8000;

  /** Send image to the backend via the background service worker proxy.
   *  Guaranteed to resolve: either with data, a timeout fallback, or an error fallback. */
  async function callBackend(base64Data, context, retryOnce = true) {
    await pingWorker(); // ensure worker is alive before the slow vision call
    console.log("[NeuroRead/IE] → POST /analyze-screenshot");

    // ── Timeout sentinel — always resolves the promise ──
    const timeoutFallback = new Promise((resolve) =>
      setTimeout(() => {
        console.warn(`[NeuroRead/IE] ⏱ Frontend timeout after ${FRONTEND_TIMEOUT_MS}ms`);
        resolve({
          success: false,
          title: "Analysis Timeout",
          image_type: "timeout",
          explanation: "Image analysis took too long. The vision model may be busy — please try again in a moment.",
          key_facts: ["Groq Vision models can take 5-15s on first request"],
          takeaways: ["Try clicking the image again"],
          confidence: 0
        });
      }, FRONTEND_TIMEOUT_MS)
    );

    console.log("[NeuroRead/IE] → Sending image to backend via service worker proxy");

    // Read neurotype from profile for persona-aware analysis
    let neurotype = "";
    try {
      const p = window.NR_ProfilePanel?.getProfile?.();
      if (p?.neurotype && p.neurotype !== "none") neurotype = p.neurotype;
    } catch (_) {}
    if (neurotype) console.log("[NeuroRead/IE] Neurotype profile:", neurotype);

    // ── Actual backend request ──
    const backendRequest = new Promise(async (resolve) => {
      if (!window.NR_Utils) {
        resolve({
          success: false, title: "Extension Error", image_type: "error",
          explanation: "NeuroRead utils not loaded. Try reloading the page.",
          key_facts: [], takeaways: [], confidence: 0
        });
        return;
      }
      const res = await window.NR_Utils.safeSend({
        type: "FETCH",
        url: API_URL,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: { image_base64: base64Data, context, neurotype }
      });
      
      if (!res) {
        resolve({
          success: false, title: "Extension Error", image_type: "error",
          explanation: "NeuroRead could not reach its background service. Try reloading the page (Ctrl+R).",
          key_facts: ["Cause: Extension service worker restarted mid-request"],
          takeaways: [], confidence: 0
        });
        return;
      }

      console.log("[NeuroRead/IE] ← Raw response:", res?.ok, JSON.stringify(res?.data)?.slice(0, 120));

      if (res.ok && res.data) {
        const d = res.data;
        const a = (d.analysis && typeof d.analysis === "object") ? d.analysis : d;
        console.log("[NeuroRead/IE] ← Parsed type:", a.image_type, "| success:", d.success);
        resolve({
          success:            d.success !== false,
          image_type:         a.image_type          || "unknown",
          title:              a.title               || "Image Analysis",
          summary:            a.summary             || "",
          short_label:        a.short_label         || "",
          image_purpose:      a.image_purpose       || "",
          key_facts:          a.key_facts           || [],
          labels:             a.labels              || [],
          takeaways:          a.takeaways           || [],
          extracted_text:     a.extracted_text      || "",
          explanation:        a.explanation         || d.error || "No description available.",
          accessibility_note: a.accessibility_note  || "",
          why_it_matters:     a.why_it_matters      || "",
          suggested_action:   a.suggested_action    || "",
          confidence:         a.confidence          ?? 0,
        });
      } else {
        const errMsg = res.error || "Unknown backend error";
        const isOffline = errMsg.includes("Failed to fetch") || errMsg.includes("NetworkError") || errMsg.includes("ECONNREFUSED");
        const isTimeout = errMsg.includes("timed out") || errMsg.includes("AbortError");
        resolve({
          success: false,
          title: isOffline ? "Backend Offline" : isTimeout ? "Request Timed Out" : "Analysis Failed",
          image_type: "error",
          explanation: isOffline
            ? "The NeuroRead backend is not running. Start it with: uvicorn app.main:app --reload --port 8000"
            : isTimeout
            ? "The vision model took too long. Try again — Groq is usually faster on the second request."
            : "Image analysis failed: " + errMsg,
          key_facts: [], takeaways: [], confidence: 0
        });
      }
    });

    // Race: whichever resolves first wins — timeout guarantees this never hangs
    return Promise.race([backendRequest, timeoutFallback]);
  }



  // ─── Card management ───────────────────────────────────────────────────────

  function closeCard() {
    if (activeCard) {
      speechSynthesis.cancel();
      // Clear the animated dot timer on loading cards before disposal
      if (activeCard._dotTimer) clearInterval(activeCard._dotTimer);
      activeCard.remove();
      activeCard = null;
    }
  }

  /** Place a fixed card as close as possible to the image without going off-screen. */
  function positionCard(card, img) {
    // Append first so getBoundingClientRect works
    document.body.appendChild(card);
    const ir  = img.getBoundingClientRect();
    const cr  = card.getBoundingClientRect();
    const vw  = window.innerWidth;
    const vh  = window.innerHeight;
    const mg  = 12;
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;

    // Vertical: prefer below; fall back to above
    let top = ir.bottom + mg + scrollY;
    if (ir.bottom + cr.height + mg > vh) {
      top = ir.top - cr.height - mg + scrollY;
    }
    top = Math.max(mg + scrollY, top);

    // Horizontal: align left; shift left if it overflows
    let left = ir.left + scrollX;
    if (left + cr.width > vw - mg + scrollX) {
      left = vw - cr.width - mg + scrollX;
    }
    left = Math.max(mg + scrollX, left);

    card.style.top  = top  + "px";
    card.style.left = left + "px";
  }

  function showLoadingCard(img) {
    closeCard();
    const card = document.createElement("div");
    card.className = "nr-explain-card nr-loading-card";
    card.setAttribute("role", "status");
    card.setAttribute("aria-live", "polite");
    card.dataset.nrStart = String(Date.now()); // used by safety sweep
    card.innerHTML = `
      <div class="nr-ec-header">
        <span class="nr-ec-badge" style="animation:nr-pulse 1.4s ease-in-out infinite">🧠 Analyzing</span>
        <span class="nr-ec-title">NeuroRead AI is reading this image…</span>
        <button class="nr-ec-close" aria-label="Cancel">✕</button>
      </div>
      <p class="nr-ec-explanation" aria-hidden="true"></p>
      <p style="color:#A78BFA;font-size:12px;margin:6px 0 0;text-align:center" id="nr-think-dots">Thinking<span class="nr-dot">.</span><span class="nr-dot">.</span><span class="nr-dot">.</span></p>
    `;
    // Animate the thinking dots
    const dots = card.querySelectorAll(".nr-dot");
    let step = 0;
    const dotTimer = setInterval(() => {
      dots.forEach((d, i) => { d.style.opacity = i <= step % 3 ? "1" : "0.2"; });
      step++;
    }, 380);
    card._dotTimer = dotTimer; // stored so we can clear it in closeCard
    card.querySelector(".nr-ec-close").addEventListener("click", (e) => {
      e.stopPropagation();
      clearInterval(dotTimer);
      closeCard();
    });
    card.addEventListener("click", (e) => e.stopPropagation());
    positionCard(card, img);
    activeCard = card;

    // Safety sweep: if this loading card is still alive after 9s, replace with fallback
    setTimeout(() => {
      if (activeCard === card && card.isConnected) {
        clearInterval(dotTimer);
        showExplanationCard(img, {
          success: false, image_type: "timeout", title: "Analysis Timeout",
          explanation: "Image analysis took too long. The vision model may be starting up — please try clicking again.",
          key_facts: ["First Groq Vision request can take 5–15 seconds"],
          takeaways: ["Click the image again to retry"],
          confidence: 0
        });
      }
    }, 9000);
  }

  // Type-to-emoji + colour (for the badge in the card header)
  function _typeStyle(type) {
    return {
      photo:       { icon: "📷", color: "#6366f1" },
      chart:       { icon: "📊", color: "#0ea5e9" },
      diagram:     { icon: "📈", color: "#8b5cf6" },
      screenshot:  { icon: "🖥", color: "#0891b2" },
      infographic: { icon: "📋", color: "#7c3aed" },
      product:     { icon: "🛒", color: "#f59e0b" },
      decorative:  { icon: "🎨", color: "#6b7280" },
      timeout:     { icon: "⏱", color: "#f59e0b" },
      error:       { icon: "⚠️", color: "#ef4444" },
    }[type] || { icon: "🔍", color: "#6366f1" };
  }

  function showExplanationCard(img, data) {
    closeCard();

    const nt      = getNeurotype(); // "blind" | "adhd" | "dyslexia" | "autism" | ""
    const type    = (data.image_type || "unknown").toLowerCase();
    const ts      = _typeStyle(type);
    const isError = data.success === false;

    // ── Field extraction ──────────────────────────────────────────────────────
    const title     = data.title         || "Image Analysis";
    const summary   = data.summary       || "";
    const shortLbl  = data.short_label   || "";
    const purpose   = data.image_purpose || "";
    const expl      = data.explanation   || "No description available.";
    const accNote   = data.accessibility_note || "";
    const whyIt     = data.why_it_matters     || "";
    const suggested = data.suggested_action   || "";
    const extText   = data.extracted_text     || "";
    const confRaw   = typeof data.confidence === "number" ? data.confidence : 0;
    const confPct   = Math.round(confRaw * 100);

    // ── Neurotype-aware fact/takeaway limits ──────────────────────────────────
    const maxFacts = nt === "adhd" ? 2 : 4;
    const maxTakes = nt === "adhd" ? 1 : 2;
    const rawFacts = Array.isArray(data.key_facts) ? data.key_facts : [];
    const rawTakes = Array.isArray(data.takeaways)  ? data.takeaways  : [];
    const rawLabels = Array.isArray(data.labels)    ? data.labels    : [];
    const facts  = rawFacts.slice(0, maxFacts);
    const takes  = rawTakes.slice(0, maxTakes);
    const labels = rawLabels.slice(0, 6);

    // ── Section builder — only renders when content exists ───────────────────
    const section = (label, icon, html, extraStyle = "") =>
      `<div class="nr-ec-section" aria-label="${escHtml(label)}" style="${extraStyle}">
        <div class="nr-ec-section-label">${icon} ${escHtml(label)}</div>
        ${html}
      </div>`;

    // Badge text: prefer short_label, fall back to image type
    const badgeText = shortLbl || type.toUpperCase();

    // ── Confidence warning (shown when < 45%) ─────────────────────────────────
    const confWarnHtml = (!isError && confPct < 45 && confPct > 0)
      ? `<div style="background:rgba(245,158,11,0.12);border-left:3px solid #f59e0b;border-radius:4px;padding:6px 10px;margin:0 0 10px;font-size:11px;color:#fbbf24">
           ⚠️ Low confidence (${confPct}%) — analysis may be uncertain
         </div>`
      : "";

    // ── Summary block (new TL;DR field) ──────────────────────────────────────
    const summaryHtml = summary
      ? `<p class="nr-ec-summary" style="
           margin:0 0 10px;
           font-size:${nt === 'dyslexia' ? '14px' : '12.5px'};
           color:#DDD6FE;
           line-height:1.6;
           font-style:italic;
           border-bottom:1px solid rgba(124,58,237,0.2);
           padding-bottom:8px;
         ">${escHtml(summary)}</p>`
      : "";

    // ── Explanation (ADHD: collapse if long) ─────────────────────────────────
    const explWords   = expl.split(" ").length;
    const isLongExpl  = nt === "adhd" && explWords > 40;
    const explShort   = isLongExpl ? expl.split(" ").slice(0, 35).join(" ") + "…" : expl;
    const explFontSz  = nt === "dyslexia" ? "14px" : "13px";
    const explHtml =
      `<p class="nr-ec-explanation" style="font-size:${explFontSz}">${escHtml(explShort)}</p>` +
      (isLongExpl
        ? `<button class="nr-ec-show-more" style="
             background:none;border:none;color:#7C3AED;font-size:11px;
             cursor:pointer;padding:0 0 8px;display:block
           " data-full="${escHtml(expl)}">Show full explanation ↓</button>`
        : "");

    // ── Autism: add a separator style between sections ────────────────────────
    const sectionSep = nt === "autism"
      ? "border-top:1px solid rgba(124,58,237,0.15);padding-top:8px;"
      : "";

    // ── Sections (only render when non-empty) ────────────────────────────────
    const factsHtml = facts.length > 0
      ? section("Key Facts", "📌",
          `<ul class="nr-ec-list">${facts.map(f => `<li>${escHtml(f)}</li>`).join("")}</ul>`,
          sectionSep)
      : "";

    const takesHtml = takes.length > 0
      ? section("Takeaways", "💡",
          takes.map(t => `<p class="nr-ec-take" style="font-style:${nt === 'dyslexia' ? 'normal' : 'italic'}">${escHtml(t)}</p>`).join(""),
          sectionSep)
      : "";

    const labelsHtml = labels.length > 0
      ? section("Labels", "🏷️",
          `<div class="nr-ec-tags">${labels.map(l => `<span class="nr-ec-tag">${escHtml(l)}</span>`).join("")}</div>`,
          sectionSep)
      : "";

    // Blind: accessibility note comes FIRST and is marked as high-priority
    const accHtml = accNote
      ? section(
          nt === "blind" ? "Screen Reader Description" : "Screen Reader",
          "🔊",
          `<p class="nr-ec-note" style="color:${nt === 'blind' ? '#DDD6FE' : '#94A3B8'};
           font-weight:${nt === 'blind' ? '500' : '400'}">${escHtml(accNote)}</p>`,
          sectionSep
        )
      : "";

    const whyHtml = whyIt
      ? section("Why It's Here", "🎯", `<p class="nr-ec-note">${escHtml(whyIt)}</p>`, sectionSep)
      : "";

    const purposeHtml = purpose
      ? section("In Context", "📍", `<p class="nr-ec-note">${escHtml(purpose)}</p>`, sectionSep)
      : "";

    const suggHtml = suggested
      ? section("Suggested Action", "➡️", `<p class="nr-ec-note">${escHtml(suggested)}</p>`, sectionSep)
      : "";

    const textHtml = extText
      ? section("Extracted Text", "📝",
          `<pre class="nr-ec-text">${escHtml(extText.substring(0, 300))}</pre>`,
          sectionSep)
      : "";

    // ── Confidence bar ────────────────────────────────────────────────────────
    const confHtml = `
      <div class="nr-ec-conf-wrap" aria-label="Confidence: ${confPct}%">
        <div class="nr-ec-conf-bar"
             style="width:${confPct}%;background:${confPct > 70 ? '#22c55e' : confPct > 40 ? '#f59e0b' : '#ef4444'}"
             role="progressbar" aria-valuenow="${confPct}" aria-valuemin="0" aria-valuemax="100"></div>
        <span class="nr-ec-conf-label">${isError ? '⚠️ fallback' : '🧠 ' + confPct + '% confident'}</span>
      </div>`;

    // ── Blind: order — accessibility_note | summary | explanation ─────────────
    const bodyOrder = nt === "blind"
      ? [confWarnHtml, summaryHtml, accHtml, explHtml, factsHtml, takesHtml, purposeHtml, whyHtml, textHtml]
      : [confWarnHtml, summaryHtml, explHtml, factsHtml, takesHtml, labelsHtml, accHtml, whyHtml, purposeHtml, suggHtml, textHtml];

    // ── Build card ────────────────────────────────────────────────────────────
    const card = document.createElement("div");
    card.className = "nr-explain-card";
    card.setAttribute("role", "region");
    card.setAttribute("aria-label", "AI image analysis — " + title);
    card.setAttribute("tabindex", "-1");
    card.innerHTML = `
      <div class="nr-ec-header" style="border-left:4px solid ${ts.color}">
        <span class="nr-ec-badge" style="background:${ts.color}20;color:${ts.color}">${ts.icon} ${escHtml(badgeText)}</span>
        <span class="nr-ec-title" title="${escHtml(title)}">${escHtml(title)}</span>
        <button class="nr-ec-close" aria-label="Close image analysis">✕</button>
      </div>
      ${bodyOrder.join("")}
      <div class="nr-ec-footer">
        ${confHtml}
        <button class="nr-ec-speak-btn" aria-label="Read explanation aloud">🔊 ${nt === 'blind' ? 'Speak now' : 'Read aloud'}</button>
      </div>
    `;

    // ── Show-more toggle for ADHD collapsed explanation ───────────────────────
    const moreBtn = card.querySelector(".nr-ec-show-more");
    if (moreBtn) {
      moreBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const explP = card.querySelector(".nr-ec-explanation");
        if (explP) explP.textContent = moreBtn.dataset.full || "";
        moreBtn.remove();
      });
    }

    // ── Speak text composition ────────────────────────────────────────────────
    const speakParts = nt === "blind"
      ? [title, accNote || summary || expl, ...facts, ...takes, whyIt, purpose].filter(Boolean)
      : [title, summary || expl, ...facts, ...takes].filter(Boolean);
    const speakText = speakParts.join(". ");

    card.querySelector(".nr-ec-speak-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(speakText);
      u.rate = nt === "adhd" ? 1.1 : nt === "blind" ? 0.9 : 0.95;
      u.lang = "en-US";
      speechSynthesis.speak(u);
    });
    card.querySelector(".nr-ec-close").addEventListener("click", (e) => {
      e.stopPropagation(); closeCard();
    });
    card.addEventListener("keydown", (e) => { if (e.key === "Escape") closeCard(); });
    card.addEventListener("click",   (e) => e.stopPropagation());

    positionCard(card, img);
    activeCard = card;
    setTimeout(() => card.querySelector(".nr-ec-close")?.focus(), 60);
    console.log("[NeuroRead/IE] Card shown — type:", type, "| confidence:", confPct, "% | neurotype:", nt || "default");

    // ── Blind: auto-speak on card open (no button click required) ────────────
    if (nt === "blind" && !isError) {
      setTimeout(() => {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(speakText);
        u.rate = 0.9; u.lang = "en-US";
        speechSynthesis.speak(u);
      }, 200);
    }
  }

  // ─── Image wrapping ────────────────────────────────────────────────────────

  function wrapImage(img) {
    if (img.hasAttribute(WRAP_ATTR)) return; // idempotent
    if (!qualifies(img)) return;

    img.setAttribute(WRAP_ATTR, "1");
    console.log("[NeuroRead/IE] Wrapping image:", img.alt || img.src.slice(-50));

    // If the image is already inside one of our wrappers, reuse it
    const alreadyWrapped = img.parentElement?.classList.contains("nr-img-wrap");
    let wrapper;
    if (alreadyWrapped) {
      wrapper = img.parentElement;
    } else {
      wrapper = document.createElement("span");
      wrapper.className = "nr-img-wrap";
      if (window.getComputedStyle(img).display === "block") {
        wrapper.style.display = "block";
      }
      img.parentNode.insertBefore(wrapper, img);
      wrapper.appendChild(img);
    }

    // Overlay explain button
    const btn = document.createElement("button");
    btn.className = "nr-img-explain-btn";
    btn.textContent = "🔍";
    btn.title = "AI: Explain this image (NeuroRead)";
    btn.setAttribute("aria-label", "Explain this image with AI");
    btn.setAttribute("tabindex", "0");
    wrapper.appendChild(btn);

    const inFlight = { running: false };

    async function triggerExplain(e) {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      if (inFlight.running) return;

      // ── Extension context check: if reloaded while page was open ──
      if (!isContextAlive()) {
        showExplanationCard(img, {
          success: false,
          image_type: "error",
          title: "Extension Reloaded",
          explanation: "NeuroRead was updated or reloaded. Please refresh this page (Ctrl+R / Cmd+R) to restore image analysis.",
          key_facts: ["The extension context was invalidated after a reload"],
          takeaways: ["Reload the page to fix this"],
          confidence: 0
        });
        return;
      }

      inFlight.running = true;
      console.log("[NeuroRead/IE] Click detected on:", img.alt || img.src.slice(-50));
      btn.textContent = "⏳";
      btn.classList.add("nr-loading");

      // ── try/finally guarantees button + inFlight ALWAYS reset ──
      try {
        showLoadingCard(img);

        // ── CASE 3: CORS / image extraction fails ──
        let base64 = null;
        try { base64 = await getBase64(img); } catch (_) { /* handled below */ }

        if (!base64) {
          console.warn("[NeuroRead/IE] Base64 extraction failed — showing CORS fallback");
          showExplanationCard(img, {
            success: false,
            image_type: "blocked",
            title: "Image Cannot Be Accessed",
            explanation: "This image is protected by cross-origin security (CORS) and cannot be read directly. " +
              "Right-click the image → 'Open image in new tab', then click it there for analysis.",
            key_facts: [
              "Google Images and most stock sites restrict direct image access",
              "Wikipedia, news sites, and most blogs work fine"
            ],
            takeaways: [],
            confidence: 0
          });
          return; // finally will clean up
        }

        const ctx  = getContext(img);
        // callBackend is guaranteed to resolve (has its own timeout + error fallbacks)
        const data = await callBackend(base64, ctx);
        console.log("[NeuroRead/IE] Showing explanation card — success:", data?.success);
        showExplanationCard(img, data); // ALWAYS called here

      } catch (unexpectedErr) {
        // ── CASE 4: Completely unexpected error ──
        const msg   = unexpectedErr?.message || String(unexpectedErr);
        const isCtx = msg.includes("context invalidated") || msg.includes("Extension context");
        console.error("[NeuroRead/IE] Unexpected error in triggerExplain:", msg);
        showExplanationCard(img, {
          success:    false,
          image_type: "error",
          title:      isCtx ? "Extension Reloaded" : "Something Went Wrong",
          explanation: isCtx
            ? "NeuroRead was reloaded. Please refresh this page (Ctrl+R / Cmd+R) and try again."
            : "An unexpected error occurred: " + msg,
          key_facts:  isCtx ? ["Refresh the page to restore the extension"] : [],
          takeaways:  [],
          confidence: 0
        });
      } finally {
        // ── ALWAYS reset button state — no stuck loading spinner ──
        btn.textContent = "🔍";
        btn.classList.remove("nr-loading");
        inFlight.running = false;
        console.log("[NeuroRead/IE] triggerExplain complete — inFlight cleared.");
      }
    }

    btn.addEventListener("click",   triggerExplain);
    btn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); triggerExplain(e); }
    });

    // Direct image click also activates explanation
    img.style.cursor = "pointer";
    img.addEventListener("click", triggerExplain);
  }

  // ─── Scan ──────────────────────────────────────────────────────────────────

  function scanAndWrap() {
    // Try to scope to main content, fall back to full body
    const root = document.querySelector(
      "article, main, [role='main'], .content, #content, .mw-parser-output"
    ) || document.body;

    let wrapped = 0;
    root.querySelectorAll("img").forEach((img) => {
      if (img.hasAttribute(WRAP_ATTR)) return;

      if (img.complete && img.naturalWidth >= MIN_DIM) {
        wrapImage(img);
        wrapped++;
      } else if (!img.complete) {
        // Not loaded yet — wrap once it finishes loading
        img.addEventListener("load", function onLoad() {
          if (isActive) wrapImage(img);
        }, { once: true });
      } else {
        // naturalWidth < MIN_DIM — may be lazy-loaded; observe via IntersectionObserver
        intersectionObs?.observe(img);
      }
    });
    console.log("[NeuroRead/IE] Initial scan — immediately wrapped:", wrapped);
  }

  // ─── Observers ─────────────────────────────────────────────────────────────

  function startIntersectionObserver() {
    if (intersectionObs) return;
    intersectionObs = new IntersectionObserver((entries) => {
      if (!isActive) return;
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const img = entry.target;
        if (img.complete && img.naturalWidth >= MIN_DIM) {
          wrapImage(img);
          intersectionObs.unobserve(img);
        } else if (!img.complete) {
          img.addEventListener("load", () => {
            if (isActive) wrapImage(img);
            intersectionObs.unobserve(img);
          }, { once: true });
        }
      });
    }, { rootMargin: "300px" });
  }

  function startMutationObserver() {
    if (mutationObs) return;
    mutationObs = new MutationObserver((mutations) => {
      if (!isActive) return;
      mutations.forEach((m) => {
        m.addedNodes.forEach((node) => {
          if (node.nodeType !== 1) return;
          const imgs = node.tagName === "IMG"
            ? [node]
            : Array.from(node.querySelectorAll("img"));
          imgs.forEach((img) => {
            if (img.hasAttribute(WRAP_ATTR)) return;
            if (img.complete && img.naturalWidth >= MIN_DIM) {
              wrapImage(img);
            } else {
              img.addEventListener("load", () => { if (isActive) wrapImage(img); }, { once: true });
            }
          });
        });
      });
    });
    mutationObs.observe(document.body, { childList: true, subtree: true });
  }

  // ─── Outside-click dismissal ───────────────────────────────────────────────
  document.addEventListener("click", (e) => {
    if (activeCard && !activeCard.contains(e.target)) closeCard();
  }, true);

  // ─── Cleanup on deactivate ─────────────────────────────────────────────────
  function removeAll() {
    closeCard();
    mutationObs?.disconnect();     mutationObs     = null;
    intersectionObs?.disconnect(); intersectionObs = null;

    document.querySelectorAll(".nr-explain-card").forEach(c => c.remove());

    document.querySelectorAll(".nr-img-wrap").forEach((wrapper) => {
      Array.from(wrapper.querySelectorAll("img")).forEach((img) => {
        img.removeAttribute(WRAP_ATTR);
        img.style.cursor = "";
        wrapper.parentNode?.insertBefore(img, wrapper);
      });
      wrapper.querySelectorAll(".nr-img-explain-btn").forEach(b => b.remove());
      if (wrapper.childElementCount === 0) wrapper.remove();
    });

    document.querySelectorAll(`img[${WRAP_ATTR}]`).forEach(i => i.removeAttribute(WRAP_ATTR));
  }

  // ─── Public API ────────────────────────────────────────────────────────────
  window.NR_ImageExplainer = {
    activate() {
      if (isActive) return { success: true };
      isActive = true;
      startIntersectionObserver();
      startMutationObserver();
      scanAndWrap();
      console.log("[NeuroRead/IE] ✅ Activated.");
      return { success: true };
    },
    deactivate() {
      if (!isActive) return { success: true };
      isActive = false;
      removeAll();
      console.log("[NeuroRead/IE] Deactivated.");
      return { success: true };
    },

    // Called by /agent/act dispatch or other modules to render a card
    // from a pre-fetched ScreenshotAnalysis data object (no image needed).
    showCardForData(data) {
      if (!data) return;
      // Create a synthetic 1x1 transparent img anchor positioned at center-screen
      const fakeImg = document.createElement("img");
      fakeImg.style.cssText = "position:fixed;top:50%;left:50%;width:1px;height:1px;opacity:0;pointer-events:none;";
      document.body.appendChild(fakeImg);
      showExplanationCard(fakeImg, data);
      // Auto-read for blind user profile
      const nt = getNeurotype();
      if (nt === "blind") {
        const toRead = data.accessibility_note || data.summary || data.explanation || "";
        if (toRead && window.NR_Utils) {
          window.NR_Utils.speak(toRead);
        } else if (toRead) {
          if ("speechSynthesis" in window) {
            speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(toRead.slice(0, 400));
            u.lang = "en-US"; u.rate = 1.0;
            speechSynthesis.speak(u);
          }
        }
      }
      // Clean up invisible anchor after a short delay
      setTimeout(() => fakeImg.remove(), 1000);
    }
  };

  // ─── PHASE 1: Auto-init on every page load ─────────────────────────────────
  // Activates automatically without needing the toolbar toggle.
  // toolbar.js can still call activate()/deactivate() to override.
  if (document.readyState === "complete" || document.readyState === "interactive") {
    window.NR_ImageExplainer.activate();
  } else {
    window.addEventListener("DOMContentLoaded", () => {
      window.NR_ImageExplainer.activate();
    });
  }

})();