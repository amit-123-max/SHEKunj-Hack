// NeuroRead AI — agent-client.js
// Frontend Adaptive Agent Client.
// Connects telemetry signals to the backend /assist endpoint.
// Manages suggestion toasts, auto-apply logic, and the local rules engine.

(function () {
  "use strict";
  if (window.__NR_AGENT_CLIENT_LOADED) return;
  window.__NR_AGENT_CLIENT_LOADED = true;

  // Guard: chrome.* APIs throw "Extension context invalidated" when the extension
  // is reloaded while this tab is still open.
  function isExtensionContextValid() {
    return window.NR_Utils ? window.NR_Utils.isContextAlive() :
      !!(typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id);
  }

  // Safe send wrapper — always resolves, never throws
  function safeSend(payload) {
    if (window.NR_Utils && window.NR_Utils.safeSend) {
      return window.NR_Utils.safeSend(payload);
    }
    // Fallback if utils.js somehow not loaded yet
    return new Promise(resolve => {
      try {
        chrome.runtime.sendMessage(payload, (res) => {
          if (chrome.runtime.lastError) { resolve(null); return; }
          resolve(res);
        });
      } catch (_) { resolve(null); }
    });
  }

  const API = "http://localhost:8000";
  const TOAST_ID = "nr-suggestion-toast";
  const ANNOUNCER_ID = "nr-live-announcer";
  const MIN_SUGGEST_INTERVAL_MS = 30000; // 30s minimum between suggestions
  const CHECK_INTERVAL_MS = 15000;       // Check signals every 15s

  let lastSuggestionTime = 0;
  let checkTimer = null;
  let isActive = false;

  // ─── Context-Death Cleanup ─────────────────────────────────
  // When the extension context is invalidated (service worker restart),
  // ensure the periodic check timer is cleaned up so it doesn't run
  // against a dead context forever.
  function teardownAgent() {
    isActive = false;
    if (checkTimer) { clearInterval(checkTimer); checkTimer = null; }
    if (domObserver) { try { domObserver.disconnect(); } catch (_) {} }
    if (imageObserver) { try { imageObserver.disconnect(); } catch (_) {} }
  }
  let domObserver = null;
  let imageObserver = null;

  // ─── Live Region Announcer ─────────────────────────────────
  function ensureAnnouncer() {
    if (document.getElementById(ANNOUNCER_ID)) return;
    const el = document.createElement("div");
    el.id = ANNOUNCER_ID;
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    el.setAttribute("aria-atomic", "true");
    document.body.appendChild(el);
  }

  function announce(message) {
    ensureAnnouncer();
    const el = document.getElementById(ANNOUNCER_ID);
    if (el) {
      el.textContent = "";
      setTimeout(() => { el.textContent = message; }, 100);
    }
  }

  // ─── Suggestion Toast ──────────────────────────────────────
  function injectToastStyles() {
    if (document.getElementById("nr-toast-style")) return;
    const style = document.createElement("style");
    style.id = "nr-toast-style";
    style.textContent = `
      #nr-suggestion-toast {
        position: fixed;
        bottom: 90px;
        right: 24px;
        background: rgba(15, 15, 20, 0.97);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(124, 58, 237, 0.3);
        border-radius: 14px;
        padding: 16px 20px;
        z-index: 2147483645;
        box-shadow: 0 10px 40px rgba(0,0,0,0.5);
        color: #E0E7FF;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        max-width: 360px;
        transform: translateY(20px);
        opacity: 0;
        transition: opacity 0.3s ease, transform 0.3s ease;
        pointer-events: none;
      }
      #nr-suggestion-toast.nr-toast-visible {
        opacity: 1;
        transform: translateY(0);
        pointer-events: auto;
      }
      .nr-toast-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
        font-weight: 600;
        color: #A78BFA;
      }
      .nr-toast-icon { font-size: 18px; }
      .nr-toast-message {
        color: #C4B5FD;
        line-height: 1.5;
        margin-bottom: 12px;
      }
      .nr-toast-actions {
        display: flex;
        gap: 8px;
      }
      .nr-toast-btn {
        background: rgba(124, 58, 237, 0.2);
        color: #C4B5FD;
        border: 1px solid rgba(124, 58, 237, 0.3);
        border-radius: 8px;
        padding: 6px 14px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.15s;
      }
      .nr-toast-btn:hover { background: rgba(124, 58, 237, 0.4); }
      .nr-toast-btn-primary {
        background: rgba(124, 58, 237, 0.4);
        color: #fff;
      }
      .nr-toast-btn-primary:hover { background: rgba(124, 58, 237, 0.6); }
      .nr-toast-btn:focus-visible {
        outline: 2px solid #A78BFA;
        outline-offset: 2px;
      }
      .nr-toast-dismiss {
        background: transparent;
        border: 2px solid transparent;
        color: #D1D5DB;
        cursor: pointer;
        font-size: 11px;
        padding: 6px 8px;
        border-radius: 4px;
      }
      .nr-toast-dismiss:hover { color: #fff; }
      .nr-toast-dismiss:focus-visible {
        outline: 2px solid #D1D5DB;
        outline-offset: 2px;
      }
      .nr-toast-goal {
        font-size: 11px;
        color: #8B5CF6;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 4px;
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .nr-toast-plan {
        font-size: 11px;
        color: #9CA3AF;
        margin-top: 8px;
        margin-bottom: 12px;
        border-top: 1px solid rgba(124, 58, 237, 0.2);
        padding-top: 8px;
      }
      .nr-toast-plan-step {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 4px;
      }
      .nr-toast-plan-step::before {
        content: "";
        display: block;
        width: 4px;
        height: 4px;
        border-radius: 50%;
        background: #8B5CF6;
      }
    `;
    document.head.appendChild(style);
  }

  function showToast(response) {
    injectToastStyles();
    let toast = document.getElementById(TOAST_ID);

    if (!toast) {
      toast = document.createElement("div");
      toast.id = TOAST_ID;
      toast.setAttribute("role", "alert");
      toast.setAttribute("aria-live", "assertive");
      document.body.appendChild(toast);
    }

    const hints = response.ui_hints || {};
    const icon = hints.toast_icon || "💡";
    const message = hints.toast_message || response.explanation;

    const goal = response.goal || "Assist user";
    const planHtml = (response.plan && response.plan.length > 0)
      ? `<div class="nr-toast-plan">
          <div><strong>Plan:</strong></div>
          ${response.plan.map(p => `<div class="nr-toast-plan-step">${p}</div>`).join('')}
         </div>`
      : "";

    toast.innerHTML = `
      <div class="nr-toast-goal">🎯 Goal: ${goal}</div>
      <div class="nr-toast-header">
        <span class="nr-toast-icon">${icon}</span>
        <span>NeuroRead Suggestion</span>
      </div>
      <div class="nr-toast-message">${message}</div>
      ${planHtml}
      <div class="nr-toast-actions">
        <button class="nr-toast-btn nr-toast-btn-primary" id="nr-toast-accept" aria-label="Accept suggestion">✓ Apply</button>
        <button class="nr-toast-dismiss" id="nr-toast-dismiss" aria-label="Dismiss suggestion">Dismiss</button>
      </div>
    `;

    toast.classList.add("nr-toast-visible");
    announce(`NeuroRead suggestion: ${response.explanation}. Goal: ${goal}.`);

    // Wire buttons
    document.getElementById("nr-toast-accept").addEventListener("click", () => {
      applyAction(response);
      reportObservation(response.session_id || "", response.action_type, response.feature_name, "accepted", 0);
      dismissToast();
    });

    document.getElementById("nr-toast-dismiss").addEventListener("click", () => {
      reportObservation(response.session_id || "", response.action_type, response.feature_name, "dismissed", 0);
      dismissToast();
    });

    // Keyboard: Escape to dismiss
    toast.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        reportObservation(response.session_id || "", response.action_type, response.feature_name, "dismissed", 0);
        dismissToast();
      }
    });

    // Focus the accept button
    setTimeout(() => {
      const btn = document.getElementById("nr-toast-accept");
      if (btn) btn.focus();
    }, 100);

    // Auto-dismiss
    const dismissTime = (hints.auto_dismiss_seconds || 10) * 1000;
    setTimeout(dismissToast, dismissTime);
  }

  function dismissToast() {
    const toast = document.getElementById(TOAST_ID);
    if (toast) toast.classList.remove("nr-toast-visible");
  }

  // ─── Image Result Card Styles ──────────────────────────────
  function injectImageResultStyles() {
    if (document.getElementById("nr-img-result-style")) return;
    const s = document.createElement("style");
    s.id = "nr-img-result-style";
    s.textContent = `
      #nr-img-result-card {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) scale(0.92);
        background: rgba(10, 10, 20, 0.98);
        backdrop-filter: blur(28px);
        -webkit-backdrop-filter: blur(28px);
        border: 1px solid rgba(124, 58, 237, 0.45);
        border-radius: 18px;
        padding: 24px 28px;
        z-index: 2147483646;
        box-shadow: 0 24px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(124,58,237,0.2);
        color: #E0E7FF;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        max-width: 500px;
        width: calc(100vw - 48px);
        opacity: 0;
        transition: opacity 0.35s ease, transform 0.35s ease;
        pointer-events: none;
      }
      #nr-img-result-card.nr-img-visible {
        opacity: 1;
        transform: translate(-50%, -50%) scale(1);
        pointer-events: auto;
      }
      .nr-img-loading {
        display: flex;
        align-items: center;
        gap: 12px;
        color: #A78BFA;
        font-size: 14px;
        font-weight: 600;
        padding: 8px 0;
      }
      .nr-img-spinner {
        width: 20px; height: 20px;
        border: 2px solid rgba(124,58,237,0.3);
        border-top-color: #7C3AED;
        border-radius: 50%;
        animation: nr-img-spin 0.8s linear infinite;
        flex-shrink: 0;
      }
      @keyframes nr-img-spin { to { transform: rotate(360deg); } }
      .nr-img-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 14px;
        padding-bottom: 12px;
        border-bottom: 1px solid rgba(124, 58, 237, 0.2);
      }
      .nr-img-badge {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.8px;
        color: #7C3AED;
        background: rgba(124,58,237,0.12);
        border: 1px solid rgba(124,58,237,0.25);
        border-radius: 20px;
        padding: 3px 10px;
      }
      .nr-img-close {
        background: rgba(255,255,255,0.1);
        border: none;
        color: #E0E7FF;
        width: 26px; height: 26px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 13px;
        display: flex; align-items: center; justify-content: center;
        transition: background 0.15s;
      }
      .nr-img-close:hover { background: rgba(255,255,255,0.2); }
      .nr-img-close:focus-visible { outline: 2px solid #A78BFA; outline-offset: 2px; }
      .nr-img-title {
        font-size: 16px;
        font-weight: 700;
        color: #A78BFA;
        margin-bottom: 10px;
        line-height: 1.4;
      }
      .nr-img-section {
        margin-bottom: 12px;
      }
      .nr-img-label {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.6px;
        color: #7C3AED;
        margin-bottom: 4px;
      }
      .nr-img-text {
        color: #C4B5FD;
        line-height: 1.6;
        font-size: 13px;
      }
      .nr-img-note {
        background: rgba(16, 185, 129, 0.08);
        border: 1px solid rgba(16, 185, 129, 0.2);
        border-radius: 8px;
        padding: 8px 12px;
        color: #6EE7B7;
        font-size: 12px;
        line-height: 1.5;
      }
      .nr-img-conf-row {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 14px;
      }
      .nr-img-conf-bar {
        flex: 1;
        height: 4px;
        background: rgba(255,255,255,0.1);
        border-radius: 2px;
        overflow: hidden;
      }
      .nr-img-conf-fill {
        height: 100%;
        border-radius: 2px;
        transition: width 0.6s ease;
      }
      .nr-img-conf-label {
        font-size: 11px;
        color: #A78BFA;
        font-weight: 700;
        min-width: 38px;
        text-align: right;
      }
      .nr-img-actions {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        padding-top: 12px;
        border-top: 1px solid rgba(124, 58, 237, 0.15);
        margin-top: 4px;
      }
      .nr-img-btn {
        background: rgba(124,58,237,0.15);
        border: 1px solid rgba(124,58,237,0.25);
        color: #C4B5FD;
        padding: 6px 12px;
        border-radius: 8px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.15s;
      }
      .nr-img-btn:hover { background: rgba(124,58,237,0.3); }
      .nr-img-btn:focus-visible { outline: 2px solid #A78BFA; outline-offset: 2px; }
      .nr-img-why-btn {
        margin-left: auto;
        background: transparent;
        border-color: rgba(255,255,255,0.12);
        color: rgba(255,255,255,0.4);
        font-size: 11px;
      }
      .nr-img-error {
        background: rgba(239,68,68,0.08);
        border: 1px solid rgba(239,68,68,0.2);
        border-radius: 10px;
        padding: 12px 16px;
        color: #FCA5A5;
        font-size: 13px;
        line-height: 1.5;
        margin-top: 8px;
      }
    `;
    document.head.appendChild(s);
  }

  // ─── Image Result Card ─────────────────────────────────────
  function showImageResultCard(data, decisionResponse) {
    injectImageResultStyles();

    // Remove any existing image result card
    const existing = document.getElementById("nr-img-result-card");
    if (existing) existing.remove();

    const card = document.createElement("div");
    card.id = "nr-img-result-card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", "Image analysis result");
    card.setAttribute("aria-modal", "false");

    if (!data || data.error) {
      // Error state
      card.innerHTML = `
        <div class="nr-img-header">
          <span class="nr-img-badge">🔍 Image Analysis</span>
          <button class="nr-img-close" id="nr-img-close" aria-label="Close">✕</button>
        </div>
        <div class="nr-img-error">
          ⚠️ ${data && data.error ? data.error : "Could not analyze this image. Please try again."}
        </div>
        <div class="nr-img-actions">
          <button class="nr-img-btn nr-img-why-btn" id="nr-img-why" aria-label="Why did the agent pick this?">🤖 Why this?</button>
        </div>
      `;
    } else {
      const conf = typeof data.confidence === "number" ? data.confidence : 0.7;
      const confPct = Math.round(conf * 100);
      const confColor = conf >= 0.75 ? "#10B981" : conf >= 0.5 ? "#F59E0B" : "#EF4444";

      const title = data.title || data.short_label || "Image";
      const summary = data.summary || "";
      const explanation = data.explanation || "";
      const accessNote = data.accessibility_note || "";
      const suggestedAction = data.suggested_action || "";

      const keyFactsHtml = (data.key_facts && data.key_facts.length > 0)
        ? `<div class="nr-img-section">
            <div class="nr-img-label">Key Facts</div>
            <div class="nr-img-text">${data.key_facts.map(f => `• ${f}`).join("<br>")}</div>
           </div>`
        : "";

      card.innerHTML = `
        <div class="nr-img-header">
          <span class="nr-img-badge">🔍 Image Analysis</span>
          <button class="nr-img-close" id="nr-img-close" aria-label="Close image result">✕</button>
        </div>
        <div class="nr-img-title">${title}</div>
        ${summary ? `<div class="nr-img-section"><div class="nr-img-label">Summary</div><div class="nr-img-text">${summary}</div></div>` : ""}
        ${explanation ? `<div class="nr-img-section"><div class="nr-img-label">Explanation</div><div class="nr-img-text">${explanation}</div></div>` : ""}
        ${keyFactsHtml}
        ${accessNote ? `<div class="nr-img-section"><div class="nr-img-label">Accessibility Note</div><div class="nr-img-note">${accessNote}</div></div>` : ""}
        <div class="nr-img-conf-row">
          <span class="nr-img-label" style="margin-bottom:0">Confidence</span>
          <div class="nr-img-conf-bar">
            <div class="nr-img-conf-fill" style="width:${confPct}%; background:${confColor};"></div>
          </div>
          <span class="nr-img-conf-label">${confPct}%</span>
        </div>
        <div class="nr-img-actions">
          <button class="nr-img-btn" data-fb="helpful" aria-label="Mark helpful">👍 Helpful</button>
          <button class="nr-img-btn" data-fb="too_strong" aria-label="Too detailed">💪 Too much</button>
          <button class="nr-img-btn" data-fb="too_weak" aria-label="Too brief">🤏 Too brief</button>
          <button class="nr-img-btn" data-fb="wrong_feature" aria-label="Wrong">❌ Wrong</button>
          ${suggestedAction ? `<button class="nr-img-btn" id="nr-img-suggest" style="background:rgba(124,58,237,0.3);color:#fff" aria-label="Suggested action">${suggestedAction}</button>` : ""}
          <button class="nr-img-btn nr-img-why-btn" id="nr-img-why" aria-label="Why did the agent pick this?">🤖 Why this?</button>
        </div>
      `;
    }

    document.body.appendChild(card);
    setTimeout(() => card.classList.add("nr-img-visible"), 50);

    // Wire close
    document.getElementById("nr-img-close").addEventListener("click", () => {
      card.classList.remove("nr-img-visible");
      setTimeout(() => card.remove(), 350);
    });

    // Escape key to close
    card.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        card.classList.remove("nr-img-visible");
        setTimeout(() => card.remove(), 350);
      }
    });

    // Feedback buttons — wire observation reporting
    card.querySelectorAll("[data-fb]").forEach(btn => {
      btn.addEventListener("click", () => {
        const outcome = btn.dataset.fb;
        card.querySelectorAll("[data-fb]").forEach(b => b.style.opacity = "0.4");
        btn.style.opacity = "1";
        btn.style.background = "rgba(124,58,237,0.4)";
        btn.style.color = "#fff";
        reportObservation(
          decisionResponse && decisionResponse.session_id || "",
          "vision",
          "imageExplainer",
          outcome,
          0
        );
        setTimeout(() => {
          card.classList.remove("nr-img-visible");
          setTimeout(() => card.remove(), 350);
        }, 1200);
      });
    });

    // "Why this?" — open explainability as secondary UI
    const whyBtn = document.getElementById("nr-img-why");
    if (whyBtn && decisionResponse) {
      whyBtn.addEventListener("click", () => {
        if (window.NR_Explainability) {
          window.NR_Explainability.showWhyCard(decisionResponse);
        }
      });
    }

    // Auto-dismiss after 40s
    setTimeout(() => {
      if (card.parentNode) {
        card.classList.remove("nr-img-visible");
        setTimeout(() => card.remove(), 350);
      }
    }, 40000);

    // Focus close button for keyboard users
    setTimeout(() => {
      const closeBtn = document.getElementById("nr-img-close");
      if (closeBtn) closeBtn.focus();
    }, 100);

    announce(`Image analyzed: ${data && data.summary ? data.summary : "See result card."}`);
  }

  // ─── Execute Agent Action (branched by feature) ────────────
  // This is the SINGLE entry-point for applying any agent decision.
  // Flow: decision → branch → execute → result UI → (optionally) explainability
  async function executeAction(response) {
    const feature = response.feature_name;
    if (!feature) return;

    // Update toolbar button state for all features
    const btnMap = {
      "formatting":    "tb-format",
      "simplify":      "tb-simplify",
      "read":          "tb-read",
      "focusMode":     "tb-focus",
      "focus":         "tb-focus",
      "ruler":         "tb-ruler",
      "imageExplainer":"tb-img-exp",
      "tone":          "tb-tone",
    };
    const btnId = btnMap[feature];
    if (btnId) {
      const btn = document.getElementById(btnId);
      if (btn) btn.classList.add("nr-active");
    }

    // ── Branch: Image Explainer ──────────────────────────────
    // Different from all others: we must FETCH the result first,
    // then show a dedicated result card. Explainability is secondary.
    if (feature === "imageExplainer" || response.action_type === "vision") {
      // Show loading state in place of image result
      injectImageResultStyles();
      const loadingCard = document.createElement("div");
      loadingCard.id = "nr-img-result-card";
      loadingCard.setAttribute("role", "status");
      loadingCard.setAttribute("aria-live", "polite");
      loadingCard.innerHTML = `
        <div class="nr-img-loading">
          <div class="nr-img-spinner"></div>
          <span>Analyzing image…</span>
        </div>
      `;
      document.body.appendChild(loadingCard);
      setTimeout(() => loadingCard.classList.add("nr-img-visible"), 50);
      announce("Analyzing image, please wait.");

      let visionData = null;
      try {
        // Try to get image from the page — find the most recently clicked or visible image
        let imageBase64 = "";
        let imageContext = response.image_context || "";

        // If there's a last-clicked image stored by image-explainer feature
        if (window.NR_ImageExplainer && window.NR_ImageExplainer.getLastImageBase64) {
          imageBase64 = window.NR_ImageExplainer.getLastImageBase64() || "";
        }
        
        console.log("[NR-Agent] IMAGE BASE64 LENGTH:", imageBase64.length);

        // Fallback for context if missing
        if (!imageContext && window.NR_ImageExplainer && window.NR_ImageExplainer.getLastImageAlt) {
            imageContext = window.NR_ImageExplainer.getLastImageAlt() || "visible image";
        }

        const t0 = Date.now();
        const profile = window.NR_ProfilePanel && window.NR_ProfilePanel.getProfile
          ? (window.NR_ProfilePanel.getProfile() || {})
          : {};

        const res = await safeSend({
          type:    "FETCH",
          url:     API + "/agent/act",
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: {
            transcription:  "",
            image_base64:   imageBase64,
            image_context:  imageContext || "visible image",
            profile,
            user_action:    "clicked_image",
          },
        });

        const latencyMs = Date.now() - t0;

        if (res && res.ok && res.data) {
          const agentResp = res.data;
          console.log("[NR-Agent] VISION RESPONSE:", agentResp);
          
          // Find the vision action in the returned actions list
          const visionAction = (agentResp.actions || []).find(a => a.action_type === "vision");
          if (visionAction && visionAction.data) {
            visionData = visionAction.data;
          } else {
            visionData = {
              error: "No structured image data returned from backend."
            };
          }

          // Report successful observation
          reportObservation(
            agentResp.session_id || "",
            "vision",
            "imageExplainer",
            "auto_applied",
            latencyMs
          );
        }
      } catch (err) {
        console.error("[NR-Agent] Image fetch failed:", err);
        visionData = { error: "Image analysis failed. The backend may be unavailable." };
      }

      // Remove loading card before showing real result
      const existingLoading = document.getElementById("nr-img-result-card");
      if (existingLoading) {
        existingLoading.classList.remove("nr-img-visible");
        await new Promise(r => setTimeout(r, 350));
        existingLoading.remove();
      }

      // Show the dedicated image result card (never the explainability card directly)
      showImageResultCard(visionData, response);

      // Replanning check after execution
      setTimeout(() => checkReplanning(feature), 10000);
      return;
    }

    // ── Branch: All other features ────────────────────────────
    // These activate their module and show explainability as secondary/optional.
    const featureActivators = {
      "formatting": () => window.NR_Formatting && window.NR_Formatting.activate(),
      "simplify":   () => window.NR_AiText && window.NR_AiText.activate(),
      "read":       () => window.NR_SpeechOut && window.NR_SpeechOut.activate(),
      "focusMode":  () => window.NR_FocusMode && window.NR_FocusMode.activate(),
      "focus":      () => window.NR_FocusMode && window.NR_FocusMode.activate(),
      "ruler":      () => window.NR_ReadRuler && window.NR_ReadRuler.activate(),
      "reader":     () => window.NR_ReaderMode && window.NR_ReaderMode.activate(),
      "tone":       () => window.NR_ToneAnalyzer && window.NR_ToneAnalyzer.activate(),
    };

    const activator = featureActivators[feature];
    if (activator) {
      try {
        activator();
        announce(`Applied: ${response.explanation}`);

        // Show explainability card as SECONDARY context info
        // (not as the primary result — the feature's own UI IS the result)
        if (window.NR_Explainability) {
          // Small delay so the feature UI can render first
          setTimeout(() => {
            window.NR_Explainability.showWhyCard(response);
          }, 800);
        }

        // Replanning check
        setTimeout(() => checkReplanning(feature), 10000);
      } catch (e) {
        console.error("[NR-Agent] Error activating feature:", feature, e);
      }
    }
  }

  // Legacy sync alias so any external callers (runAgentAct dispatch) still work
  function applyAction(response) {
    executeAction(response);
  }


  // ─── Replanning Logic ──────────────────────────────────────
  function checkReplanning(lastFeature) {
    if (!window.NR_Telemetry) return;
    const signals = window.NR_Telemetry.getSignals();
    
    // If user is still struggling (low pace or long dwell), re-plan
    const userStillStruggling = (
      (signals.readingPaceWpm > 0 && signals.readingPaceWpm < 80) ||
      signals.longDwellParagraphs >= 3
    );

    if (userStillStruggling) {
      console.log("[NR-Agent] Replanning triggered due to persistent struggle after", lastFeature);
      announce("Agent is replanning to provide better assistance...");
      // Forcing a backend call to reconsider
      callAssistEndpoint(true);
    }
  }

  // ─── Local Rules Engine (no backend needed) ────────────────
  function evaluateLocalRules() {
    if (!window.NR_Telemetry) return null;

    const signals = window.NR_Telemetry.getSignals();
    const active = new Set(signals.featuresActive || []);

    // Get profile
    let profile = { neurotype: "none", auto_adapt_enabled: false };
    if (window.NR_ProfilePanel && window.NR_ProfilePanel.getProfile) {
      const p = window.NR_ProfilePanel.getProfile();
      if (p) profile = p;
    }

    // Rule 1: Long dwell on paragraphs -> suggest simplify
    if (signals.longDwellParagraphs >= 2 && !active.has("simplify")) {
      return {
        action_type: "simplify",
        feature_name: "simplify",
        explanation: "You're spending a long time on some paragraphs. Simplifying could help.",
        confidence: 0.7,
        ui_hints: { toast_icon: "🧠", toast_message: "💡 Some paragraphs seem challenging. Want to simplify them?", auto_dismiss_seconds: 10 },
        telemetry_tags: ["local_rule", "long_dwell"],
        reasoning_chain: ["Local rule: long dwell detected"],
      };
    }

    // Rule 2: Rapid scroll with low progress -> suggest focus
    if (signals.rapidScrollEvents >= 3 && signals.scrollDepth < 0.3 && !active.has("focusMode")) {
      return {
        action_type: "focus",
        feature_name: "focusMode",
        explanation: "Lots of scrolling but not much reading progress. Focus mode can help.",
        confidence: 0.65,
        ui_hints: { toast_icon: "🎯", toast_message: "💡 Having trouble focusing? Try Focus Mode.", auto_dismiss_seconds: 10 },
        telemetry_tags: ["local_rule", "rapid_scroll"],
        reasoning_chain: ["Local rule: rapid scroll with low progress"],
      };
    }

    // Rule 3: Frequent image clicks -> suggest vision explainer
    if (signals.imageClicks >= 3 && !active.has("imageExplainer")) {
      return {
        action_type: "vision",
        feature_name: "imageExplainer",
        explanation: "You're clicking on many images. Image explanations can help understand charts.",
        confidence: 0.8,
        ui_hints: { toast_icon: "🔍", toast_message: "💡 Want AI to explain the images on this page?", auto_dismiss_seconds: 10 },
        telemetry_tags: ["local_rule", "image_clicks"],
        reasoning_chain: ["Local rule: 3+ image clicks"],
      };
    }

    // Rule 4: Low reading pace -> suggest ruler + TTS
    if (signals.readingPaceWpm > 0 && signals.readingPaceWpm < 80
        && signals.dwellTimeSeconds > 30
        && !active.has("ruler") && !active.has("read")) {
      return {
        action_type: "ruler",
        feature_name: "ruler",
        explanation: "Your reading pace is slow. A reading ruler can help track lines.",
        confidence: 0.6,
        ui_hints: { toast_icon: "📏", toast_message: "💡 A reading ruler might help you track lines better.", auto_dismiss_seconds: 10 },
        telemetry_tags: ["local_rule", "slow_pace"],
        reasoning_chain: ["Local rule: low reading pace"],
      };
    }

    // Rule 5: Repeated paragraph visits -> suggest simplify
    if (signals.repeatedParagraphVisits >= 3 && !active.has("simplify")) {
      return {
        action_type: "simplify",
        feature_name: "simplify",
        explanation: "You keep returning to the same section. Simplifying might make it clearer.",
        confidence: 0.7,
        ui_hints: { toast_icon: "🔄", toast_message: "💡 Struggling with a section? Let me simplify it.", auto_dismiss_seconds: 10 },
        telemetry_tags: ["local_rule", "repeated_visits"],
        reasoning_chain: ["Local rule: 3+ visits to same paragraph"],
      };
    }

    return null;
  }

  // ─── Backend Assist Call ───────────────────────────────────
  async function callAssistEndpoint(isReplanning = false) {
    if (!window.NR_Telemetry) return;
    if (!isExtensionContextValid()) return;

    if (isReplanning) {
      showAgentThinkingToast();
    }

    const signals = window.NR_Telemetry.getSignals();
    const context = window.NR_Telemetry.getPageContext();

    let profile = { user_id: "default", neurotype: "none", auto_adapt_enabled: false };
    if (window.NR_ProfilePanel && window.NR_ProfilePanel.getProfile) {
      const p = window.NR_ProfilePanel.getProfile();
      if (p) Object.assign(profile, p);
    }

    const res = await safeSend({
      type:    "FETCH",
      url:     API + "/assist",
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: {
        profile,
        context,
        page_signals: {
          scroll_depth:              signals.scrollDepth,
          dwell_time_seconds:        signals.dwellTimeSeconds,
          selection_count:           signals.selectionCount,
          back_navigations:          signals.backNavigations,
          features_active:           signals.featuresActive,
          reading_pace_wpm:          signals.readingPaceWpm,
          repeated_paragraph_visits: signals.repeatedParagraphVisits,
          image_clicks:              signals.imageClicks,
          rapid_scroll_events:       signals.rapidScrollEvents,
          long_dwell_paragraphs:     signals.longDwellParagraphs,
        },
        user_action:   isReplanning ? "replan" : "idle",
        selection_text: "",
        image_context:  "",
        page_url:       window.location.href,
      },
    });

    if (isReplanning) dismissToast(); // clear thinking indicator

    if (!res || !res.ok || !res.data) return;
    const response = res.data;
    if (response.action_type === "noop" || response.confidence < 0.4) return;
    handleAgentResponse(response, profile);
  }

  function showAgentThinkingToast() {
    injectToastStyles();
    let toast = document.getElementById(TOAST_ID);
    if (!toast) {
      toast = document.createElement("div");
      toast.id = TOAST_ID;
      document.body.appendChild(toast);
    }
    toast.innerHTML = `
      <div class="nr-toast-header">
        <span class="nr-toast-icon">🧠</span>
        <span>Agent Thinking...</span>
      </div>
      <div class="nr-toast-message">Re-evaluating page context to find a better plan.</div>
    `;
    toast.classList.add("nr-toast-visible");
  }

  // ─── Response Handler ──────────────────────────────────────
  function handleAgentResponse(response, profile) {
    const now = Date.now();
    if (now - lastSuggestionTime < MIN_SUGGEST_INTERVAL_MS) return;
    lastSuggestionTime = now;

    // Auto-apply if confidence is high and user enabled auto-adapt
    if (profile.auto_adapt_enabled && response.confidence >= 0.75) {
      applyAction(response);

      // Still show a brief notification
      showToast({
        ...response,
        ui_hints: {
          ...(response.ui_hints || {}),
          toast_icon: "✨",
          toast_message: `✨ Auto-applied: ${response.explanation}`,
          auto_dismiss_seconds: 5,
        }
      });
    } else if (response.confidence >= 0.5) {
      // Medium confidence — ask the user
      showToast(response);
    }
    // Low confidence — silently ignore
  }

  // ─── Periodic Check Loop ───────────────────────────────────
  function runCheck() {
    if (!isActive) return;
    if (!isExtensionContextValid()) {
      teardownAgent();
      return;
    }
    const now = Date.now();
    if (now - lastSuggestionTime < MIN_SUGGEST_INTERVAL_MS) return;

    // Try local rules first (no network cost)
    const localResult = evaluateLocalRules();
    if (localResult && localResult.confidence >= 0.6) {
      let profile = { auto_adapt_enabled: false };
      if (window.NR_ProfilePanel && window.NR_ProfilePanel.getProfile) {
        const p = window.NR_ProfilePanel.getProfile();
        if (p) profile = p;
      }
      handleAgentResponse(localResult, profile);
      return;
    }

    // Fall back to backend if signals are present but no local rule matched
    if (window.NR_Telemetry) {
      const signals = window.NR_Telemetry.getSignals();
      // Lowered from 20s → 15s; also fire on strong image-click or scroll signal
      const shouldCallBackend = (
        signals.dwellTimeSeconds > 15 ||
        signals.imageClicks >= 5 ||
        signals.rapidScrollEvents >= 5
      );
      if (shouldCallBackend) {
        callAssistEndpoint();
      }
    }
  }

  // ─── Observe Outcome Reporting ─────────────────────────────
  // Fire-and-forget: reports action outcomes to /agent/observe.
  // Never blocks UI. Never throws.
  async function reportObservation(sessionId, actionType, featureName, outcome, latencyMs) {
    if (!isExtensionContextValid()) return;
    try {
      const neurotype = window.NR_ProfilePanel?.getProfile?.()?.neurotype || "";
      await safeSend({
        type:    "FETCH",
        url:     API + "/agent/observe",
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: {
          session_id:   sessionId || "",
          action_type:  actionType || "",
          feature_name: featureName || "",
          outcome:      outcome || "accepted",
          latency_ms:   latencyMs || 0,
          page_url:     window.location.href,
          neurotype:    neurotype,
        },
      });
    } catch (_) { /* observe is non-critical — never block */ }
  }

  // ─── Unified Agentic Act ───────────────────────────────────
  // Calls /agent/act with voice transcription and/or image data.
  // Dispatches returned actions and reports outcomes to /agent/observe.
  async function runAgentAct(transcription, imageBase64, imageContext) {
    if (!isExtensionContextValid()) return;

    let profile = { user_id: "default", neurotype: "none", auto_adapt_enabled: false };
    if (window.NR_ProfilePanel && window.NR_ProfilePanel.getProfile) {
      const p = window.NR_ProfilePanel.getProfile();
      if (p) Object.assign(profile, p);
    }

    const signals = window.NR_Telemetry ? window.NR_Telemetry.getSignals() : {};
    const context = window.NR_Telemetry ? window.NR_Telemetry.getPageContext() : {};

    const t0 = Date.now();
    const res = await safeSend({
      type:    "FETCH",
      url:     API + "/agent/act",
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: {
        transcription:  transcription  || "",
        image_base64:   imageBase64    || "",
        image_context:  imageContext   || "",
        profile,
        page_signals: {
          scroll_depth:              signals.scrollDepth              || 0,
          dwell_time_seconds:        signals.dwellTimeSeconds         || 0,
          selection_count:           signals.selectionCount           || 0,
          back_navigations:          signals.backNavigations          || 0,
          features_active:           signals.featuresActive           || [],
          reading_pace_wpm:          signals.readingPaceWpm           || 0,
          repeated_paragraph_visits: signals.repeatedParagraphVisits  || 0,
          image_clicks:              signals.imageClicks              || 0,
          rapid_scroll_events:       signals.rapidScrollEvents        || 0,
          long_dwell_paragraphs:     signals.longDwellParagraphs      || 0,
        },
        page_context: context,
        user_action:  transcription ? "voice_command" : imageBase64 ? "clicked_image" : "idle",
      },
    });

    if (!res || !res.ok || !res.data) {
      console.warn("[NR-Agent] /agent/act returned no data");
      return;
    }

    const agentResp = res.data;
    const latencyMs = Date.now() - t0;
    const sessionId = agentResp.session_id || "";

    // Speak the agent's primary feedback
    if (agentResp.speak && window.NR_Utils) {
      window.NR_Utils.speak(agentResp.speak);
    }

    // Dispatch each action
    for (const action of (agentResp.actions || [])) {
      try {
        if (action.action_type === "feature" && action.feature_name) {
          applyAction({ feature_name: action.feature_name, action_type: action.action_type, explanation: action.speak });
          reportObservation(sessionId, action.action_type, action.feature_name, "auto_applied", latencyMs);

        } else if (action.action_type === "dom_manipulation" && action.dom_action) {
          const { method, selector, args } = action.dom_action;
          const target = selector ? document.querySelector(selector) : window;
          if (target && typeof target[method] === "function") {
            args && Object.keys(args).length > 0 ? target[method](args) : target[method]();
          }
          reportObservation(sessionId, "dom_manipulation", "", "auto_applied", latencyMs);

        } else if (action.action_type === "vision" && action.data) {
          // Use the dedicated image result card — NEVER the explainability card
          showImageResultCard(action.data, null);
          reportObservation(sessionId, "vision", "imageExplainer", "auto_applied", latencyMs);
        }
        // speak actions already handled via agentResp.speak above
      } catch (dispatchErr) {
        console.warn("[NR-Agent] Action dispatch error:", dispatchErr);
        reportObservation(sessionId, action.action_type, action.feature_name, "error", latencyMs);
      }
    }
  }

  // ─── Public API ────────────────────────────────────────────
  window.NR_AgentClient = {
    activate: function () {
      isActive = true;
      if (!checkTimer) {
        checkTimer = setInterval(runCheck, CHECK_INTERVAL_MS);
      }
      console.log("[NR-Agent] Adaptive agent client activated.");
      return { success: true };
    },
    deactivate: function () {
      isActive = false;
      if (checkTimer) {
        clearInterval(checkTimer);
        checkTimer = null;
      }
      dismissToast();
      console.log("[NR-Agent] Adaptive agent client deactivated.");
      return { success: true };
    },
    // Allow manual trigger from voice or other features
    requestAssist: async function (userAction, selectionText, imageContext) {
      if (!isExtensionContextValid()) return;

      const signals = window.NR_Telemetry ? window.NR_Telemetry.getSignals() : {};
      const context = window.NR_Telemetry ? window.NR_Telemetry.getPageContext() : {};

      let profile = { user_id: "default", neurotype: "none", auto_adapt_enabled: false };
      if (window.NR_ProfilePanel && window.NR_ProfilePanel.getProfile) {
        const p = window.NR_ProfilePanel.getProfile();
        if (p) Object.assign(profile, p);
      }

      try {
        const res = await safeSend({
          type:    "FETCH",
          url:     API + "/assist",
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: {
            profile,
            context,
            page_signals: {
              scroll_depth:              signals.scrollDepth              || 0,
              dwell_time_seconds:        signals.dwellTimeSeconds         || 0,
              selection_count:           signals.selectionCount           || 0,
              back_navigations:          signals.backNavigations          || 0,
              features_active:           signals.featuresActive           || [],
              reading_pace_wpm:          signals.readingPaceWpm           || 0,
              repeated_paragraph_visits: signals.repeatedParagraphVisits  || 0,
              image_clicks:              signals.imageClicks              || 0,
              rapid_scroll_events:       signals.rapidScrollEvents        || 0,
              long_dwell_paragraphs:     signals.longDwellParagraphs      || 0,
            },
          }
        });
        if (!res || !res.ok || !res.data) return;
        const response = res.data;
        if (response.action_type !== "noop") {
          handleAgentResponse(response, profile);
        }
      } catch (_) { /* context gone */ }
    },

    // Full agentic act — used by speech-in.js when voice intent escalation is needed.
    runAgentAct: runAgentAct,

    // Expose image result card so NR_ImageExplainer can route through it too
    showImageResult: showImageResultCard,

    // Allow external teardown on extension reload
    teardown: teardownAgent,
  };

  // ─── Auto-start: proactive agent on every page ─────────────
  if (isExtensionContextValid()) {
    try {
      chrome.storage.local.get("nrState", (res) => {
        if (chrome.runtime.lastError) return;
        const autoAdapt = res.nrState?.agentProfile?.auto_adapt_enabled ||
                          res.nrState?.agentProfile?.auto_adapt_enabled === true;
        if (autoAdapt) {
          window.NR_AgentClient.activate();
        }

        // Page-load proactive check: after 5s perceive and fire /assist
        setTimeout(() => {
          if (!isExtensionContextValid()) return;
          const now = Date.now();
          if (now - lastSuggestionTime < MIN_SUGGEST_INTERVAL_MS) return;

          const localResult = evaluateLocalRules();
          const profile = window.NR_ProfilePanel?.getProfile?.() || { auto_adapt_enabled: false };

          if (localResult && localResult.confidence >= 0.5) {
            handleAgentResponse(localResult, profile);
            return;
          }

          if (window.NR_Telemetry) {
            const ctx = window.NR_Telemetry.getPageContext();
            if ((ctx.total_text_length || 0) > 300) {
              callAssistEndpoint();
            }
          }
        }, 5000);
      });
    } catch (_) { /* context gone between guard and call */ }
  }

  // ─── MutationObserver: SPA / Infinite Scroll ───────────────
  // When large new content is injected into the DOM (React SPA, Twitter feed,
  // infinite scroll), re-run a lightweight signal check so the agent stays aware.
  (function setupDomObserver() {
    if (!isExtensionContextValid()) return;
    let domChangeChars = 0;
    let domDebounceTimer = null;

    domObserver = new MutationObserver((mutations) => {
      if (!isExtensionContextValid()) { teardownAgent(); return; }

      let newTextLen = 0;
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType === Node.TEXT_NODE) newTextLen += node.length;
          else if (node.nodeType === Node.ELEMENT_NODE) newTextLen += (node.innerText || "").length;
        }
      }
      domChangeChars += newTextLen;

      // Only react if a substantial block of content arrived (> 500 chars)
      if (domChangeChars < 500) return;
      domChangeChars = 0;

      if (domDebounceTimer) clearTimeout(domDebounceTimer);
      domDebounceTimer = setTimeout(() => {
        if (!isExtensionContextValid()) return;
        const now = Date.now();
        // Don't re-fire if we just suggested something
        if (now - lastSuggestionTime < MIN_SUGGEST_INTERVAL_MS) return;

        const localResult = evaluateLocalRules();
        if (localResult && localResult.confidence >= 0.6) {
          const profile = window.NR_ProfilePanel?.getProfile?.() || { auto_adapt_enabled: false };
          handleAgentResponse(localResult, profile);
        }
      }, 2000);
    });

    try {
      domObserver.observe(document.body, { childList: true, subtree: true });
    } catch (_) {}
  })();

  // ─── IntersectionObserver: Proactive Image Analysis ────────
  // When a large image (>200px wide) enters the viewport, offer to analyze it.
  // Only fires if image explainer is not already active and we haven't just suggested.
  (function setupImageObserver() {
    if (!isExtensionContextValid()) return;
    const seenImages = new WeakSet();

    imageObserver = new IntersectionObserver((entries) => {
      if (!isExtensionContextValid()) { teardownAgent(); return; }

      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const img = entry.target;
        if (seenImages.has(img)) continue;
        seenImages.add(img);
        imageObserver.unobserve(img); // only fire once per image

        // Check: is the image explainer already active?
        const signals = window.NR_Telemetry ? window.NR_Telemetry.getSignals() : {};
        if ((signals.featuresActive || []).includes("imageExplainer")) continue;

        const now = Date.now();
        if (now - lastSuggestionTime < MIN_SUGGEST_INTERVAL_MS) continue;

        const profile = window.NR_ProfilePanel?.getProfile?.() || { auto_adapt_enabled: false };
        handleAgentResponse({
          action_type: "vision",
          feature_name: "imageExplainer",
          explanation: "A large image just appeared. Want AI to describe it for you?",
          confidence: 0.65,
          ui_hints: {
            toast_icon: "🔍",
            toast_message: "🔍 Large image detected. Want AI to explain it?",
            auto_dismiss_seconds: 10,
          },
          telemetry_tags: ["proactive_image", "intersection_observer"],
          reasoning_chain: ["IntersectionObserver: large image entered viewport"],
        }, profile);
      }
    }, { threshold: 0.5, rootMargin: "0px" });

    // Observe all large images after DOM settles
    setTimeout(() => {
      if (!isExtensionContextValid()) return;
      document.querySelectorAll("img").forEach((img) => {
        // Only observe images large enough to be meaningful content
        if (img.naturalWidth > 200 || img.width > 200 || img.clientWidth > 200) {
          try { imageObserver.observe(img); } catch (_) {}
        }
      });
    }, 3000);
  })();

  // ─── Profile Change Propagation ────────────────────────────
  // When the user changes their neurotype or enables auto-adapt,
  // immediately reset the suggestion timer so the new profile takes effect.
  document.addEventListener("nrProfileChanged", () => {
    lastSuggestionTime = 0; // Allow immediate re-suggestion with new profile
    if (isActive) {
      console.log("[NR-Agent] Profile updated. Forcing immediate replan...");
      // Forcing a backend call to evaluate the new profile context
      callAssistEndpoint(true);
    }
  });
})();
