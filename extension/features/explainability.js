// NeuroRead AI — explainability.js
// "Why did I do this?" cards + feedback widgets.
// Renders explanation cards for agent actions and collects user feedback.

(function () {
  "use strict";
  if (window.__NR_EXPLAINABILITY_LOADED) return;
  window.__NR_EXPLAINABILITY_LOADED = true;

  const API = "http://localhost:8000";
  const CARD_CLASS = "nr-why-card";
  let feedbackQueue = [];

  function injectStyles() {
    if (document.getElementById("nr-explain-style")) return;
    const style = document.createElement("style");
    style.id = "nr-explain-style";
    style.textContent = `
      .nr-why-card {
        position: fixed;
        top: 16px;
        right: 16px;
        background: rgba(15, 15, 20, 0.97);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(124, 58, 237, 0.3);
        border-radius: 14px;
        padding: 16px 20px;
        z-index: 2147483644;
        box-shadow: 0 10px 40px rgba(0,0,0,0.5);
        color: #E0E7FF;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        max-width: 380px;
        animation: nr-slide-in 0.3s ease;
      }
      @keyframes nr-slide-in {
        from { opacity: 0; transform: translateX(20px); }
        to { opacity: 1; transform: translateX(0); }
      }

      .nr-why-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
        padding-bottom: 8px;
        border-bottom: 1px solid rgba(124, 58, 237, 0.2);
      }
      .nr-why-title {
        font-weight: 700;
        font-size: 12px;
        color: #A78BFA;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .nr-why-close {
        background: rgba(255,255,255,0.1);
        border: none;
        color: #E0E7FF;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .nr-why-close:hover { background: rgba(255,255,255,0.2); }

      .nr-why-section {
        margin-bottom: 10px;
      }
      .nr-why-section-title {
        font-size: 11px;
        color: #7C3AED;
        font-weight: 600;
        text-transform: uppercase;
        margin-bottom: 4px;
      }
      .nr-why-text {
        color: #C4B5FD;
        line-height: 1.5;
        font-size: 12px;
      }
      .nr-why-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        margin-top: 4px;
      }
      .nr-why-tag {
        background: rgba(124, 58, 237, 0.15);
        color: #A78BFA;
        padding: 2px 8px;
        border-radius: 10px;
        font-size: 10px;
        font-weight: 500;
      }
      .nr-why-confidence {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 6px;
      }
      .nr-why-conf-bar {
        flex: 1;
        height: 4px;
        background: rgba(255,255,255,0.1);
        border-radius: 2px;
        overflow: hidden;
      }
      .nr-why-conf-fill {
        height: 100%;
        border-radius: 2px;
        transition: width 0.5s ease;
      }
      .nr-why-conf-label {
        font-size: 11px;
        color: #A78BFA;
        font-weight: 600;
        min-width: 35px;
      }

      .nr-feedback-widget {
        display: flex;
        gap: 4px;
        margin-top: 12px;
        padding-top: 10px;
        border-top: 1px solid rgba(124, 58, 237, 0.15);
        flex-wrap: wrap;
      }
      .nr-fb-btn {
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.1);
        color: #C4B5FD;
        padding: 5px 10px;
        border-radius: 8px;
        cursor: pointer;
        font-size: 11px;
        transition: all 0.15s;
      }
      .nr-fb-btn:hover {
        background: rgba(124, 58, 237, 0.2);
        border-color: rgba(124, 58, 237, 0.3);
      }
      .nr-fb-btn.nr-fb-selected {
        background: rgba(124, 58, 237, 0.3);
        border-color: #7C3AED;
        color: #fff;
      }
    `;
    document.head.appendChild(style);
  }

  function showWhyCard(response) {
    injectStyles();

    // Remove existing cards
    document.querySelectorAll("." + CARD_CLASS).forEach(c => c.remove());

    const card = document.createElement("div");
    card.className = CARD_CLASS;
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", "Explanation for the accessibility action taken");

    // Confidence color
    const conf = response.confidence || 0;
    let confColor = "#EF4444";
    if (conf >= 0.75) confColor = "#10B981";
    else if (conf >= 0.5) confColor = "#F59E0B";

    // Reasoning steps
    const reasoning = (response.reasoning_chain || []).slice(0, 4);
    const tags = (response.telemetry_tags || []).slice(0, 5);

    card.innerHTML = `
      <div class="nr-why-header">
        <span class="nr-why-title">🤖 Agent Thinking</span>
        <button class="nr-why-close" aria-label="Close explanation" id="nr-why-close-btn">✕</button>
      </div>

      <div class="nr-why-section">
        <div class="nr-why-section-title">Goal</div>
        <div class="nr-why-text"><strong>🎯 ${response.goal || "Assist user"}</strong></div>
      </div>
      
      ${(response.plan && response.plan.length > 0) ? `
      <div class="nr-why-section">
        <div class="nr-why-section-title">Plan Execution</div>
        <div class="nr-why-text">
          ${response.plan.map((p, i) => `<div>${i+1}. ${p}</div>`).join('')}
        </div>
      </div>` : ""}

      <div class="nr-why-section">
        <div class="nr-why-section-title">Action Taken</div>
        <div class="nr-why-text">${response.explanation || "No explanation available."}</div>
      </div>

      ${reasoning.length > 0 ? `
      <div class="nr-why-section">
        <div class="nr-why-section-title">Reasoning</div>
        <div class="nr-why-text">${reasoning.map(r => "• " + r).join("<br>")}</div>
      </div>
      ` : ""}

      <div class="nr-why-section">
        <div class="nr-why-section-title">Confidence</div>
        <div class="nr-why-confidence">
          <div class="nr-why-conf-bar">
            <div class="nr-why-conf-fill" style="width: ${conf * 100}%; background: ${confColor};"></div>
          </div>
          <span class="nr-why-conf-label">${Math.round(conf * 100)}%</span>
        </div>
        <div class="nr-why-tags" style="margin-top: 4px;">
            <span class="nr-why-tag" style="font-size: 9px; opacity: 0.8;">Memory tracking applied</span>
        </div>
      </div>

      ${tags.length > 0 ? `
      <div class="nr-why-section">
        <div class="nr-why-section-title">Signals Used</div>
        <div class="nr-why-tags">${tags.map(t => `<span class="nr-why-tag">${t}</span>`).join("")}</div>
      </div>
      ` : ""}

      <div class="nr-feedback-widget" role="group" aria-label="Feedback on this action">
        <button class="nr-fb-btn" data-rating="helpful" aria-label="Mark as helpful">👍 Helpful</button>
        <button class="nr-fb-btn" data-rating="too_strong" aria-label="Mark as too strong">💪 Too strong</button>
        <button class="nr-fb-btn" data-rating="too_weak" aria-label="Mark as too weak">🤏 Too weak</button>
        <button class="nr-fb-btn" data-rating="wrong_feature" aria-label="Mark as wrong feature">❌ Wrong</button>
        <button class="nr-fb-btn" data-rating="undo" aria-label="Undo this action">↩️ Undo</button>
      </div>
    `;

    document.body.appendChild(card);

    // Close button
    document.getElementById("nr-why-close-btn").addEventListener("click", () => {
      card.remove();
    });

    // Escape to close
    card.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        card.remove();
      }
    });

    // Feedback buttons
    card.querySelectorAll(".nr-fb-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        // Visual feedback
        card.querySelectorAll(".nr-fb-btn").forEach(b => b.classList.remove("nr-fb-selected"));
        btn.classList.add("nr-fb-selected");

        // Queue feedback entry
        const entry = {
          action_type: response.action_type || "",
          feature_name: response.feature_name || "",
          rating: btn.dataset.rating,
          page_url: window.location.href,
          profile_neurotype: "",
          timestamp: Date.now() / 1000,
          notes: "",
        };

        // Get profile neurotype
        if (window.NR_ProfilePanel && window.NR_ProfilePanel.getProfile) {
          const p = window.NR_ProfilePanel.getProfile();
          if (p) entry.profile_neurotype = p.neurotype || "";
        }

        feedbackQueue.push(entry);

        // If undo, deactivate the feature
        if (btn.dataset.rating === "undo") {
          undoAction(response);
        }

        // Auto-dismiss card after feedback
        setTimeout(() => card.remove(), 1500);
      });
    });

    // Auto-dismiss after 30 seconds
    setTimeout(() => {
      if (card.parentNode) card.remove();
    }, 30000);

    // Focus close button for keyboard users
    setTimeout(() => {
      const closeBtn = document.getElementById("nr-why-close-btn");
      if (closeBtn) closeBtn.focus();
    }, 100);
  }

  function undoAction(response) {
    const feature = response.feature_name;
    const undoMap = {
      "formatting": () => window.NR_Formatting && window.NR_Formatting.deactivate(),
      "simplify": () => window.NR_AiText && window.NR_AiText.deactivate(),
      "read": () => window.NR_SpeechOut && window.NR_SpeechOut.deactivate(),
      "focusMode": () => window.NR_FocusMode && window.NR_FocusMode.deactivate(),
      "focus": () => window.NR_FocusMode && window.NR_FocusMode.deactivate(),
      "ruler": () => window.NR_ReadRuler && window.NR_ReadRuler.deactivate(),
      "reader": () => window.NR_ReaderMode && window.NR_ReaderMode.deactivate(),
      "imageExplainer": () => window.NR_ImageExplainer && window.NR_ImageExplainer.deactivate(),
    };
    const fn = undoMap[feature];
    if (fn) fn();
  }

  // ─── Batch flush feedback on page unload ───────────────────
  function flushFeedback() {
    if (feedbackQueue.length === 0) return;

    const entries = [...feedbackQueue];
    feedbackQueue = [];

    // Use sendBeacon for reliable unload delivery
    const blob = new Blob(
      [JSON.stringify({ entries: entries })],
      { type: "application/json" }
    );
    navigator.sendBeacon(API + "/feedback", blob);
  }

  window.addEventListener("beforeunload", flushFeedback);

  // Also flush periodically (every 2 minutes)
  setInterval(flushFeedback, 120000);

  // ─── Public API ────────────────────────────────────────────
  window.NR_Explainability = {
    showWhyCard: showWhyCard,
    flushFeedback: flushFeedback,
  };
})();
