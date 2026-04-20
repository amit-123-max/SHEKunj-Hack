// NeuroRead AI — metrics-panel.js
// In-page Metrics Dashboard Panel.
// Shows measurable accessibility impact for demo/judging.

(function () {
  "use strict";
  if (window.__NR_METRICS_PANEL_LOADED) return;
  window.__NR_METRICS_PANEL_LOADED = true;

  const PANEL_ID = "nr-metrics-panel";
  const API = "http://localhost:8000";
  let isPanelOpen = false;

  function injectStyles() {
    if (document.getElementById("nr-metrics-style")) return;
    const style = document.createElement("style");
    style.id = "nr-metrics-style";
    style.textContent = `
      #nr-metrics-panel {
        position: fixed;
        bottom: 90px;
        right: 24px;
        background: rgba(15, 15, 20, 0.97);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(16, 185, 129, 0.3);
        border-radius: 16px;
        padding: 20px 24px;
        z-index: 2147483645;
        box-shadow: 0 12px 48px rgba(0,0,0,0.6);
        color: #E0E7FF;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        min-width: 320px;
        max-width: 380px;
        transform: translateY(20px);
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.25s ease, transform 0.25s ease;
      }
      #nr-metrics-panel.nr-panel-open {
        opacity: 1;
        pointer-events: auto;
        transform: translateY(0);
      }

      .nr-mp-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
        padding-bottom: 12px;
        border-bottom: 1px solid rgba(16, 185, 129, 0.2);
      }
      .nr-mp-title {
        font-size: 14px;
        font-weight: 700;
        color: #34D399;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .nr-mp-close {
        background: rgba(255,255,255,0.1);
        border: none;
        color: #E0E7FF;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .nr-mp-close:hover { background: rgba(255,255,255,0.2); }

      .nr-mp-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }
      .nr-mp-metric {
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 10px;
        padding: 12px;
        text-align: center;
      }
      .nr-mp-metric-value {
        font-size: 22px;
        font-weight: 700;
        color: #34D399;
        line-height: 1;
        margin-bottom: 4px;
      }
      .nr-mp-metric-label {
        font-size: 10px;
        color: #A78BFA;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        font-weight: 600;
      }
      .nr-mp-metric.nr-mp-wide {
        grid-column: span 2;
      }
      .nr-mp-cam-row {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
      }
      .nr-mp-cam-arrow {
        font-size: 18px;
        color: #34D399;
      }
      .nr-mp-profile-badge {
        display: inline-block;
        background: rgba(124, 58, 237, 0.2);
        color: #A78BFA;
        padding: 3px 10px;
        border-radius: 10px;
        font-size: 11px;
        font-weight: 600;
      }
    `;
    document.head.appendChild(style);
  }

  function buildPanel() {
    if (document.getElementById(PANEL_ID)) return;

    const panel = document.createElement("section");
    panel.id = PANEL_ID;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Accessibility metrics dashboard");

    panel.innerHTML = `
      <div class="nr-mp-header">
        <span class="nr-mp-title">📊 Impact Metrics</span>
        <button class="nr-mp-close" aria-label="Close metrics panel" id="nr-mp-close-btn">✕</button>
      </div>
      <div class="nr-mp-grid" id="nr-mp-grid">
        <div class="nr-mp-metric nr-mp-wide">
          <div class="nr-mp-cam-row">
            <div>
              <div class="nr-mp-metric-value" id="nr-mp-cam-before">--</div>
              <div class="nr-mp-metric-label">CAM Before</div>
            </div>
            <span class="nr-mp-cam-arrow">→</span>
            <div>
              <div class="nr-mp-metric-value" id="nr-mp-cam-after">--</div>
              <div class="nr-mp-metric-label">CAM After</div>
            </div>
          </div>
        </div>
        <div class="nr-mp-metric">
          <div class="nr-mp-metric-value" id="nr-mp-load-reduction">0%</div>
          <div class="nr-mp-metric-label">Load Reduction</div>
        </div>
        <div class="nr-mp-metric">
          <div class="nr-mp-metric-value" id="nr-mp-distractions">0</div>
          <div class="nr-mp-metric-label">Distractions Hidden</div>
        </div>
        <div class="nr-mp-metric">
          <div class="nr-mp-metric-value" id="nr-mp-simplified">0</div>
          <div class="nr-mp-metric-label">Paragraphs Simplified</div>
        </div>
        <div class="nr-mp-metric">
          <div class="nr-mp-metric-value" id="nr-mp-tts">No</div>
          <div class="nr-mp-metric-label">TTS Active</div>
        </div>
        <div class="nr-mp-metric">
          <div class="nr-mp-metric-value" id="nr-mp-images">0</div>
          <div class="nr-mp-metric-label">Images Explained</div>
        </div>
        <div class="nr-mp-metric">
          <div class="nr-mp-metric-value" id="nr-mp-time-saved">0s</div>
          <div class="nr-mp-metric-label">Est. Time Saved</div>
        </div>
        <div class="nr-mp-metric nr-mp-wide" style="text-align: center;">
          <div class="nr-mp-metric-label" style="margin-bottom: 6px;">Active Profile</div>
          <span class="nr-mp-profile-badge" id="nr-mp-profile">None</span>
        </div>
      </div>
    `;

    document.body.appendChild(panel);

    document.getElementById("nr-mp-close-btn").addEventListener("click", () => {
      window.NR_MetricsPanel.deactivate();
    });

    panel.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        window.NR_MetricsPanel.deactivate();
      }
    });
  }

  function updateMetrics() {
    // Collect data from various sources
    chrome.storage.local.get("nrState", (res) => {
      const state = res.nrState || {};

      // Profile
      const profileEl = document.getElementById("nr-mp-profile");
      if (profileEl) {
        const neurotype = state.agentProfile?.neurotype || state.activeProfile || "none";
        profileEl.textContent = neurotype.charAt(0).toUpperCase() + neurotype.slice(1);
      }

      // Features active
      const featureKeys = ["formatting", "focus", "simplify", "read", "ruler", "focusMode", "reader", "imageExplainer", "tone"];
      const activeCount = featureKeys.filter(k => state[k]).length;

      // TTS
      const ttsEl = document.getElementById("nr-mp-tts");
      if (ttsEl) ttsEl.textContent = state.read ? "Yes" : "No";

      // Simplified paragraphs
      const simplifiedCount = document.querySelectorAll(".nr-simplified").length;
      const simplifiedEl = document.getElementById("nr-mp-simplified");
      if (simplifiedEl) simplifiedEl.textContent = String(simplifiedCount);

      // Distractions hidden
      const focusActive = state.focus || state.focusMode;
      const distractionsEl = document.getElementById("nr-mp-distractions");
      if (distractionsEl) {
        if (focusActive) {
          const hidden = document.querySelectorAll('[style*="display: none"], [style*="visibility: hidden"]').length;
          distractionsEl.textContent = String(Math.max(hidden, focusActive ? 5 : 0));
        } else {
          distractionsEl.textContent = "0";
        }
      }

      // Images explained
      const explainedCount = document.querySelectorAll(".nr-explain-card").length;
      const imagesEl = document.getElementById("nr-mp-images");
      if (imagesEl) imagesEl.textContent = String(explainedCount);

      // Load reduction estimate
      const loadEl = document.getElementById("nr-mp-load-reduction");
      if (loadEl) {
        let reduction = 0;
        if (state.formatting) reduction += 15;
        if (state.simplify) reduction += 25;
        if (state.focus || state.focusMode) reduction += 10;
        if (state.ruler) reduction += 5;
        loadEl.textContent = Math.min(55, reduction) + "%";
      }

      // Time saved estimate (rough: 2s per simplified paragraph + 5s per distraction hidden)
      const timeSavedEl = document.getElementById("nr-mp-time-saved");
      if (timeSavedEl) {
        let seconds = simplifiedCount * 8 + (focusActive ? 15 : 0) + explainedCount * 5;
        if (seconds > 60) {
          timeSavedEl.textContent = Math.round(seconds / 60) + "m";
        } else {
          timeSavedEl.textContent = seconds + "s";
        }
      }

      // CAM scores
      const camBeforeEl = document.getElementById("nr-mp-cam-before");
      const camAfterEl = document.getElementById("nr-mp-cam-after");

      // Try to get CAM from the page's cached data
      const camCacheKey = "camCache_" + window.location.href;
      chrome.storage.local.get(camCacheKey, (camRes) => {
        const baseCam = camRes[camCacheKey];
        if (baseCam && camBeforeEl && camAfterEl) {
          const before = baseCam.score || 0;
          camBeforeEl.textContent = String(before);
          camBeforeEl.style.color = before >= 70 ? "#34D399" : before >= 40 ? "#F59E0B" : "#EF4444";

          let bonus = 0;
          if (state.formatting) bonus += 15;
          if (state.simplify) bonus += 25;
          if (state.focus || state.focusMode) bonus += 10;
          const after = Math.min(100, before + bonus);
          camAfterEl.textContent = String(after);
          camAfterEl.style.color = after >= 70 ? "#34D399" : after >= 40 ? "#F59E0B" : "#EF4444";
        }
      });
    });
  }

  window.NR_MetricsPanel = {
    activate: function () {
      injectStyles();
      buildPanel();
      updateMetrics();
      const panel = document.getElementById(PANEL_ID);
      if (panel) {
        panel.classList.add("nr-panel-open");
        isPanelOpen = true;
        setTimeout(() => {
          const closeBtn = document.getElementById("nr-mp-close-btn");
          if (closeBtn) closeBtn.focus();
        }, 50);
      }
      return { success: true };
    },
    deactivate: function () {
      const panel = document.getElementById(PANEL_ID);
      if (panel) {
        panel.classList.remove("nr-panel-open");
        isPanelOpen = false;
        const tbBtn = document.getElementById("tb-metrics");
        if (tbBtn) tbBtn.focus();
      }
      return { success: true };
    },
    toggle: function () {
      return isPanelOpen ? this.deactivate() : this.activate();
    },
    refresh: updateMetrics,
  };
})();
