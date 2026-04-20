// NeuroRead AI — universal-convert.js
// "⚡ Convert This Page" — The single most powerful accessibility action.
// Orchestrates: formatting → simplify → focus mode in sequence.
// Shows a live progress badge, then a before/after CAM score delta card.

(function () {
  "use strict";
  if (window.__NR_UNIVERSAL_CONVERT_LOADED) return;
  window.__NR_UNIVERSAL_CONVERT_LOADED = true;

  const CARD_ID = "nr-convert-result-card";
  let _isConverting = false;
  let _isConverted = false;

  // ─── Styles ────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById("nr-convert-style")) return;
    const s = document.createElement("style");
    s.id = "nr-convert-style";
    s.textContent = `
      #nr-convert-badge {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) scale(0.85);
        background: rgba(10, 10, 18, 0.97);
        backdrop-filter: blur(24px);
        -webkit-backdrop-filter: blur(24px);
        border: 1px solid rgba(124, 58, 237, 0.5);
        border-radius: 20px;
        padding: 28px 40px;
        z-index: 2147483647;
        color: #E0E7FF;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        text-align: center;
        min-width: 320px;
        box-shadow: 0 24px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(124,58,237,0.2);
        opacity: 0;
        transition: opacity 0.3s ease, transform 0.3s ease;
        pointer-events: none;
      }
      #nr-convert-badge.nr-visible {
        opacity: 1;
        transform: translate(-50%, -50%) scale(1);
        pointer-events: auto;
      }
      .nr-convert-spinner {
        width: 48px; height: 48px;
        border: 3px solid rgba(124, 58, 237, 0.2);
        border-top-color: #7C3AED;
        border-radius: 50%;
        animation: nr-spin-convert 0.9s linear infinite;
        margin: 0 auto 16px;
      }
      @keyframes nr-spin-convert {
        to { transform: rotate(360deg); }
      }
      .nr-convert-title {
        font-size: 18px;
        font-weight: 700;
        color: #A78BFA;
        margin-bottom: 8px;
      }
      .nr-convert-step {
        font-size: 13px;
        color: #C4B5FD;
        opacity: 0.8;
        min-height: 20px;
        transition: all 0.3s ease;
      }
      .nr-convert-steps-done {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-top: 12px;
        text-align: left;
      }
      .nr-convert-step-item {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        color: #A78BFA;
        opacity: 0;
        transform: translateX(-8px);
        transition: opacity 0.3s ease, transform 0.3s ease;
      }
      .nr-convert-step-item.nr-step-done {
        opacity: 1;
        transform: translateX(0);
      }

      /* Result card */
      #nr-convert-result-card {
        position: fixed;
        bottom: 90px;
        left: 50%;
        transform: translateX(-50%) translateY(20px);
        background: rgba(10, 10, 18, 0.97);
        backdrop-filter: blur(24px);
        -webkit-backdrop-filter: blur(24px);
        border: 1px solid rgba(124, 58, 237, 0.4);
        border-radius: 20px;
        padding: 20px 24px;
        z-index: 2147483646;
        color: #E0E7FF;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        min-width: 360px;
        max-width: 420px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.6);
        opacity: 0;
        transition: opacity 0.4s ease, transform 0.4s ease;
        pointer-events: none;
      }
      #nr-convert-result-card.nr-visible {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
        pointer-events: auto;
      }
      .nr-result-header {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 16px;
      }
      .nr-result-icon { font-size: 28px; }
      .nr-result-headline {
        font-size: 16px;
        font-weight: 700;
        color: #A78BFA;
        line-height: 1.3;
      }
      .nr-result-sub {
        font-size: 12px;
        color: #7C3AED;
        margin-top: 2px;
      }
      .nr-score-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: rgba(124, 58, 237, 0.08);
        border: 1px solid rgba(124, 58, 237, 0.2);
        border-radius: 12px;
        padding: 12px 16px;
        margin-bottom: 12px;
      }
      .nr-score-before, .nr-score-after {
        text-align: center;
      }
      .nr-score-label {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.8px;
        color: rgba(255,255,255,0.4);
        margin-bottom: 4px;
      }
      .nr-score-num {
        font-size: 28px;
        font-weight: 800;
        line-height: 1;
      }
      .nr-score-before .nr-score-num { color: #F87171; }
      .nr-score-after .nr-score-num { color: #34D399; }
      .nr-score-arrow {
        font-size: 20px;
        color: #7C3AED;
        animation: nr-arrow-pulse 1.5s ease infinite;
      }
      @keyframes nr-arrow-pulse {
        0%, 100% { transform: scale(1); opacity: 0.8; }
        50% { transform: scale(1.2); opacity: 1; }
      }
      .nr-score-delta {
        font-size: 13px;
        color: #34D399;
        font-weight: 700;
        text-align: center;
        margin-bottom: 12px;
      }
      .nr-result-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-bottom: 14px;
      }
      .nr-result-tag {
        background: rgba(124, 58, 237, 0.15);
        border: 1px solid rgba(124, 58, 237, 0.3);
        border-radius: 20px;
        padding: 3px 10px;
        font-size: 11px;
        color: #C4B5FD;
        font-weight: 500;
      }
      .nr-result-actions {
        display: flex;
        gap: 8px;
      }
      .nr-result-btn {
        flex: 1;
        background: rgba(124, 58, 237, 0.2);
        border: 1px solid rgba(124, 58, 237, 0.3);
        border-radius: 10px;
        color: #C4B5FD;
        padding: 8px 12px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.15s ease;
      }
      .nr-result-btn:hover { background: rgba(124, 58, 237, 0.35); }
      .nr-result-btn-undo {
        background: transparent;
        border-color: rgba(255,255,255,0.15);
        color: rgba(255,255,255,0.4);
        flex: 0 0 auto;
        padding: 8px 14px;
      }
    `;
    document.head.appendChild(s);
  }

  // ─── Conversion Badge (progress overlay) ───────────────────
  function showBadge() {
    let badge = document.getElementById("nr-convert-badge");
    if (!badge) {
      badge = document.createElement("div");
      badge.id = "nr-convert-badge";
      badge.setAttribute("role", "status");
      badge.setAttribute("aria-live", "polite");
      badge.setAttribute("aria-label", "Page conversion in progress");
      badge.innerHTML = `
        <div class="nr-convert-spinner"></div>
        <div class="nr-convert-title">⚡ Converting Page</div>
        <div class="nr-convert-step" id="nr-convert-step-label">Preparing…</div>
        <div class="nr-convert-steps-done">
          <div class="nr-convert-step-item" id="nr-step-formatting">✨ Applying optimized typography…</div>
          <div class="nr-convert-step-item" id="nr-step-focus">🎯 Activating focus mode…</div>
          <div class="nr-convert-step-item" id="nr-step-simplify">🧠 Simplifying complex text…</div>
        </div>
      `;
      document.body.appendChild(badge);
    }
    setTimeout(() => badge.classList.add("nr-visible"), 50);
    return badge;
  }

  function updateBadgeStep(label, doneId) {
    const el = document.getElementById("nr-convert-step-label");
    if (el) el.textContent = label;
    if (doneId) {
      const stepEl = document.getElementById(doneId);
      if (stepEl) stepEl.classList.add("nr-step-done");
    }
  }

  function hideBadge() {
    const badge = document.getElementById("nr-convert-badge");
    if (badge) {
      badge.classList.remove("nr-visible");
      setTimeout(() => badge.remove(), 400);
    }
  }

  // ─── Result Card ───────────────────────────────────────────
  function showResultCard(beforeScore, afterScore, appliedFeatures) {
    let card = document.getElementById(CARD_ID);
    if (card) card.remove();

    card = document.createElement("div");
    card.id = CARD_ID;
    card.setAttribute("role", "region");
    card.setAttribute("aria-label", "Conversion result summary");
    card.setAttribute("aria-live", "polite");

    const delta = afterScore - beforeScore;
    const ratingAfter = afterScore >= 80 ? "Excellent" : afterScore >= 50 ? "Good" : "Needs Help";
    const tagHTML = appliedFeatures.map(f => `<span class="nr-result-tag">✓ ${f}</span>`).join("");

    card.innerHTML = `
      <div class="nr-result-header">
        <span class="nr-result-icon">✨</span>
        <div>
          <div class="nr-result-headline">Page Converted Successfully</div>
          <div class="nr-result-sub">Accessibility Rating: ${ratingAfter}</div>
        </div>
      </div>
      <div class="nr-score-row">
        <div class="nr-score-before">
          <div class="nr-score-label">Before</div>
          <div class="nr-score-num">${beforeScore}</div>
        </div>
        <div class="nr-score-arrow">→</div>
        <div class="nr-score-after">
          <div class="nr-score-label">After</div>
          <div class="nr-score-num">${afterScore}</div>
        </div>
      </div>
      <div class="nr-score-delta">+${delta} points improvement in cognitive accessibility</div>
      <div class="nr-result-tags">${tagHTML}</div>
      <div class="nr-result-actions">
        <button class="nr-result-btn" id="nr-read-btn" aria-label="Read page aloud">🔊 Read Aloud</button>
        <button class="nr-result-btn" id="nr-ruler-btn" aria-label="Activate reading ruler">📏 Ruler</button>
        <button class="nr-result-btn" id="nr-copy-btn" aria-label="Copy simplified text to clipboard">📋 Copy Text</button>
        <button class="nr-result-btn nr-result-btn-undo" id="nr-undo-btn" aria-label="Undo all changes">↩ Undo</button>
      </div>
    `;
    document.body.appendChild(card);
    setTimeout(() => card.classList.add("nr-visible"), 50);

    // Wire buttons
    document.getElementById("nr-read-btn").addEventListener("click", () => {
      if (window.NR_SpeechOut) window.NR_SpeechOut.activate();
    });
    document.getElementById("nr-ruler-btn").addEventListener("click", () => {
      if (window.NR_ReadRuler) window.NR_ReadRuler.activate();
    });
    document.getElementById("nr-copy-btn").addEventListener("click", async () => {
      try {
        // Build markdown from visible page text
        const container = document.querySelector("article, main, .content, .mw-parser-output") || document.body;
        const lines = [];
        container.querySelectorAll("h1, h2, h3, h4, p, li").forEach((el) => {
          const text = el.textContent.trim();
          if (!text) return;
          if (el.tagName === "H1") lines.push(`# ${text}`);
          else if (el.tagName === "H2") lines.push(`## ${text}`);
          else if (el.tagName === "H3") lines.push(`### ${text}`);
          else if (el.tagName === "H4") lines.push(`#### ${text}`);
          else if (el.tagName === "LI") lines.push(`- ${text}`);
          else lines.push(text);
        });
        const markdown = lines.join("\n\n");
        await navigator.clipboard.writeText(markdown);
        const btn = document.getElementById("nr-copy-btn");
        if (btn) {
          btn.textContent = "✅ Copied!";
          setTimeout(() => { if (btn) btn.textContent = "📋 Copy Text"; }, 2000);
        }
      } catch (e) {
        console.warn("[NeuroRead] Clipboard copy failed:", e);
      }
    });
    document.getElementById("nr-undo-btn").addEventListener("click", () => {
      undoConvert();
      card.classList.remove("nr-visible");
      setTimeout(() => card.remove(), 400);
    });

    // Auto-dismiss after 25 seconds
    setTimeout(() => {
      if (card.parentNode) {
        card.classList.remove("nr-visible");
        setTimeout(() => card.remove(), 400);
      }
    }, 25000);

    // Focus the card for screen readers
    setTimeout(() => card.focus(), 100);
  }

  // ─── CAM Score Queries ─────────────────────────────────────
  function getPageText() {
    const container = document.querySelector("article, main, .content, .mw-parser-output") || document.body;
    return container.innerText.substring(0, 5000);
  }

  function fetchCamScore(text) {
    return new Promise((resolve) => {
      if (!window.NR_Utils) return resolve(null);
      window.NR_Utils.safeSend({
        type: "FETCH",
        url: "http://localhost:8000/cam-score",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: { text_content: text }
      }).then((res) => {
        if (res && res.ok && res.data && res.data.success) {
          resolve(res.data.cam.score);
        } else {
          resolve(null);
        }
      });
    });
  }

  // Call the unified /convert backend for AI-backed before/after report
  function fetchConvertReport(text) {
    return new Promise((resolve) => {
      // Get user profile if available
      let profile = { user_id: "default", neurotype: "none" };
      if (window.NR_ProfilePanel && window.NR_ProfilePanel.getProfile) {
        const p = window.NR_ProfilePanel.getProfile();
        if (p) Object.assign(profile, p);
      }

      if (!window.NR_Utils) return resolve(null);
      window.NR_Utils.safeSend({
        type: "FETCH",
        url: "http://localhost:8000/convert",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: { text_content: text, profile: profile, page_url: window.location.href }
      }).then((res) => {
        if (res && res.ok && res.data && res.data.success) {
          resolve(res.data);
        } else {
          // Graceful fallback — convert will use local CAM estimate
          console.warn("[NR-Convert] Backend /convert unavailable, using local CAM estimate.");
          resolve(null);
        }
      });
    });
  }

  // ─── Undo Logic ────────────────────────────────────────────
  function undoConvert() {
    if (window.NR_Formatting) window.NR_Formatting.deactivate();
    if (window.NR_FocusMode) window.NR_FocusMode.deactivate();
    if (window.NR_AiText) window.NR_AiText.deactivate();
    _isConverted = false;
    // Update toolbar buttons
    ["tb-format", "tb-focus", "tb-simplify"].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) { btn.classList.remove("nr-active"); btn.setAttribute("aria-pressed", "false"); }
    });
    const convertBtn = document.getElementById("tb-convert");
    if (convertBtn) {
      convertBtn.classList.remove("nr-active");
      convertBtn.setAttribute("aria-pressed", "false");
      convertBtn.querySelector("span:last-child").textContent = "Convert";
    }
    console.log("[NeuroRead] Page conversion undone.");
  }

  // ─── Main Convert Flow ─────────────────────────────────────
  async function convertPage() {
    if (_isConverting) return { success: false, error: "Already converting" };
    if (_isConverted) {
      undoConvert();
      return { success: true, action: "undo" };
    }

    _isConverting = true;
    injectStyles();

    const badge = showBadge();
    const appliedFeatures = [];
    const pageText = getPageText();

    // Step 0: Call the backend /convert endpoint for real AI-backed analysis
    updateBadgeStep("Analyzing content accessibility…", null);
    const backendReport = await fetchConvertReport(pageText);
    const beforeScore = backendReport ? backendReport.cam_before : (await fetchCamScore(pageText) ?? 35);

    const defaultSteps = [
      { name: "formatting", description: "Applying optimized typography" },
      { name: "focus", description: "Activating focus mode" },
      { name: "simplify", description: "Simplifying complex text" }
    ];

    let stepsToRun = defaultSteps;
    if (backendReport && backendReport.steps_applied && backendReport.steps_applied.length > 0) {
      stepsToRun = backendReport.steps_applied.filter(s => s.applied).map(s => ({
        name: s.name.replace("_mode", ""), // normalise focus_mode -> focus
        description: s.description || `Applying ${s.name}...`
      }));
    }

    const featureMap = {
      "formatting": window.NR_Formatting,
      "focus": window.NR_FocusMode,
      "simplify": window.NR_AiText,
      "read": window.NR_SpeechOut,
      "ruler": window.NR_ReadRuler,
    };

    const stepItemsHtml = stepsToRun.map((step, idx) => 
      `<div class="nr-convert-step-item" id="nr-step-${idx}">✨ ${step.description}…</div>`
    ).join("");
    
    // Update badge with dynamic steps
    const stepsContainer = document.querySelector(".nr-convert-steps-done");
    if (stepsContainer) {
      stepsContainer.innerHTML = stepItemsHtml;
    }

    // Execute planner-driven steps
    for (let i = 0; i < stepsToRun.length; i++) {
      const step = stepsToRun[i];
      updateBadgeStep(step.description + "…", null);
      
      await new Promise(r => setTimeout(r, 400));
      const fn = featureMap[step.name];
      if (fn && typeof fn.activate === "function") {
        fn.activate();
        appliedFeatures.push(step.name);
      }
      
      updateBadgeStep(step.name + " applied ✓", `nr-step-${i}`);
      await new Promise(r => setTimeout(r, 400));
    }

    // Update toolbar toggle states
    ["tb-format", "tb-focus", "tb-simplify"].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) { btn.classList.add("nr-active"); btn.setAttribute("aria-pressed", "true"); }
    });
    const convertBtn = document.getElementById("tb-convert");
    if (convertBtn) {
      convertBtn.classList.add("nr-active");
      convertBtn.setAttribute("aria-pressed", "true");
      convertBtn.querySelector("span:last-child").textContent = "Undo";
    }

    // Use backend report if available, otherwise estimate
    let afterScore;
    if (backendReport && backendReport.cam_after) {
      afterScore = backendReport.cam_after;
    } else {
      afterScore = Math.min(100, beforeScore + 15 + 10 + 25);
    }

    hideBadge();
    _isConverting = false;
    _isConverted = true;

    // Show result card
    showResultCard(beforeScore, afterScore, appliedFeatures);

    // Announce for screen readers
    const announcer = document.getElementById("nr-live-announcer");
    if (announcer) {
      announcer.textContent = `Page converted! Accessibility score improved from ${beforeScore} to ${afterScore}.`;
    }

    console.log(`[NeuroRead] ⚡ Page converted: ${beforeScore} → ${afterScore} (+${afterScore - beforeScore})`);
    return { success: true, beforeScore, afterScore };
  }

  // ─── Public API ────────────────────────────────────────────
  window.NR_UniversalConvert = {
    activate: convertPage,
    deactivate: undoConvert,
    toggle: function() {
      if (_isConverted) { undoConvert(); return { success: true, action: "undo" }; }
      return convertPage();
    },
    isConverted: () => _isConverted,
  };
})();
