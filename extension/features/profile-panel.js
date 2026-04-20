// NeuroRead AI — profile-panel.js
// In-Page Profile Panel for neurotype selection and preference management.
// Fully keyboard accessible with ARIA labels and focus management.

(function () {
  "use strict";
  if (window.__NR_PROFILE_PANEL_LOADED) return;
  window.__NR_PROFILE_PANEL_LOADED = true;

  const PANEL_ID = "nr-profile-panel";
  const API = "http://localhost:8000";
  let isPanelOpen = false;

  function injectStyles() {
    if (document.getElementById("nr-profile-panel-style")) return;
    const style = document.createElement("style");
    style.id = "nr-profile-panel-style";
    style.textContent = `
      #nr-profile-panel {
        position: fixed;
        bottom: 90px;
        left: 50%;
        transform: translateX(-50%) translateY(20px);
        opacity: 0;
        pointer-events: none;
        background: rgba(15, 15, 20, 0.97);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(124, 58, 237, 0.3);
        border-radius: 16px;
        padding: 20px 24px;
        z-index: 2147483646;
        box-shadow: 0 12px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(124, 58, 237, 0.15);
        color: #E0E7FF;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        min-width: 340px;
        max-width: 420px;
        transition: opacity 0.25s ease, transform 0.25s ease;
      }
      #nr-profile-panel.nr-panel-open {
        opacity: 1;
        pointer-events: auto;
        transform: translateX(-50%) translateY(0);
      }

      .nr-pp-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
        padding-bottom: 12px;
        border-bottom: 1px solid rgba(124, 58, 237, 0.2);
      }
      .nr-pp-title {
        font-size: 14px;
        font-weight: 700;
        color: #A78BFA;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .nr-pp-close {
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
        transition: background 0.15s;
      }
      .nr-pp-close:hover { background: rgba(255,255,255,0.2); }

      .nr-pp-section { margin-bottom: 16px; }
      .nr-pp-label {
        font-size: 11px;
        font-weight: 600;
        color: #A78BFA;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 8px;
        display: block;
      }

      .nr-pp-neurotype-grid {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 6px;
      }
      .nr-pp-neurotype-btn {
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.1);
        color: #C4B5FD;
        padding: 8px 4px;
        border-radius: 8px;
        cursor: pointer;
        font-size: 11px;
        font-weight: 500;
        text-align: center;
        transition: all 0.15s;
      }
      .nr-pp-neurotype-btn:hover { background: rgba(124, 58, 237, 0.15); }
      .nr-pp-neurotype-btn.nr-selected {
        background: rgba(124, 58, 237, 0.3);
        border-color: #7C3AED;
        color: #fff;
      }

      .nr-pp-slider-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 10px;
      }
      .nr-pp-slider-label {
        font-size: 12px;
        color: #C4B5FD;
        flex: 1;
      }
      .nr-pp-slider-val {
        font-size: 12px;
        color: #A78BFA;
        font-weight: 600;
        min-width: 40px;
        text-align: right;
        margin-left: 8px;
      }
      .nr-pp-slider {
        width: 120px;
        accent-color: #7C3AED;
        margin: 0 8px;
      }

      .nr-pp-toggle-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 0;
      }
      .nr-pp-toggle-label {
        font-size: 12px;
        color: #C4B5FD;
      }
      .nr-pp-toggle {
        position: relative;
        width: 40px;
        height: 22px;
        background: rgba(255,255,255,0.1);
        border-radius: 11px;
        cursor: pointer;
        border: none;
        transition: background 0.2s;
      }
      .nr-pp-toggle::after {
        content: '';
        position: absolute;
        top: 3px;
        left: 3px;
        width: 16px;
        height: 16px;
        background: #C4B5FD;
        border-radius: 50%;
        transition: transform 0.2s;
      }
      .nr-pp-toggle[aria-checked="true"] {
        background: rgba(124, 58, 237, 0.5);
      }
      .nr-pp-toggle[aria-checked="true"]::after {
        transform: translateX(18px);
        background: #fff;
      }
      .nr-pp-memory-box {
        background: rgba(255,255,255,0.05);
        border-radius: 8px;
        padding: 10px;
        font-size: 11px;
        color: #C4B5FD;
        min-height: 40px;
        margin-top: 4px;
        margin-bottom: 8px;
      }
      .nr-pp-memory-item {
        margin-bottom: 4px;
      }
    `;
    document.head.appendChild(style);
  }

  function buildPanel() {
    if (document.getElementById(PANEL_ID)) return;

    const panel = document.createElement("section");
    panel.id = PANEL_ID;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Accessibility profile settings");
    panel.setAttribute("aria-modal", "false");

    panel.innerHTML = `
      <div class="nr-pp-header">
        <span class="nr-pp-title">🧠 Your Profile</span>
        <button class="nr-pp-close" aria-label="Close profile panel" id="nr-pp-close-btn">✕</button>
      </div>

      <div class="nr-pp-section">
        <label class="nr-pp-label">Neurotype</label>
        <div class="nr-pp-neurotype-grid" role="radiogroup" aria-label="Select your neurotype">
          <button class="nr-pp-neurotype-btn" data-neurotype="adhd" role="radio" aria-checked="false" tabindex="0">🎯 ADHD</button>
          <button class="nr-pp-neurotype-btn" data-neurotype="dyslexia" role="radio" aria-checked="false" tabindex="-1">👁️ Dyslexia</button>
          <button class="nr-pp-neurotype-btn" data-neurotype="autism" role="radio" aria-checked="false" tabindex="-1">🧩 Autism</button>
          <button class="nr-pp-neurotype-btn" data-neurotype="mixed" role="radio" aria-checked="false" tabindex="-1">🔀 Mixed</button>
          <button class="nr-pp-neurotype-btn nr-selected" data-neurotype="none" role="radio" aria-checked="true" tabindex="-1">⚙️ None</button>
        </div>
      </div>

      <div class="nr-pp-section">
        <label class="nr-pp-label">Preferences</label>
        <div class="nr-pp-slider-row">
          <span class="nr-pp-slider-label">Simplification</span>
          <input type="range" class="nr-pp-slider" id="nr-pp-simplify" min="1" max="3" value="2" step="1" aria-label="Simplification level">
          <span class="nr-pp-slider-val" id="nr-pp-simplify-val">2</span>
        </div>
        <div class="nr-pp-slider-row">
          <span class="nr-pp-slider-label">Focus Intensity</span>
          <input type="range" class="nr-pp-slider" id="nr-pp-focus" min="1" max="3" value="2" step="1" aria-label="Focus intensity">
          <span class="nr-pp-slider-val" id="nr-pp-focus-val">2</span>
        </div>
        <div class="nr-pp-slider-row">
          <span class="nr-pp-slider-label">TTS Speed</span>
          <input type="range" class="nr-pp-slider" id="nr-pp-tts" min="0.5" max="2.5" value="1.0" step="0.1" aria-label="Text to speech speed">
          <span class="nr-pp-slider-val" id="nr-pp-tts-val">1.0x</span>
        </div>
        <div class="nr-pp-slider-row">
          <span class="nr-pp-slider-label">Tone Depth</span>
          <input type="range" class="nr-pp-slider" id="nr-pp-tone" min="1" max="3" value="2" step="1" aria-label="Tone explanation depth">
          <span class="nr-pp-slider-val" id="nr-pp-tone-val">2</span>
        </div>
      </div>

      <div class="nr-pp-section">
        <div class="nr-pp-toggle-row">
          <span class="nr-pp-toggle-label">Auto-Adapt (Autopilot)</span>
          <button class="nr-pp-toggle" id="nr-pp-autoadapt" role="switch" aria-checked="false" aria-label="Toggle auto-adapt mode"></button>
        </div>
      </div>

      <div class="nr-pp-section">
        <label class="nr-pp-label">What the Agent Learned</label>
        <div id="nr-pp-memory-content" class="nr-pp-memory-box">Loading memory...</div>
      </div>
    `;

    document.body.appendChild(panel);

    // ── Close button ──
    document.getElementById("nr-pp-close-btn").addEventListener("click", () => {
      window.NR_ProfilePanel.deactivate();
    });

    // ── Escape to close ──
    panel.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        window.NR_ProfilePanel.deactivate();
      }
    });

    // ── Neurotype buttons ──
    const ntButtons = panel.querySelectorAll(".nr-pp-neurotype-btn");
    ntButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        ntButtons.forEach(b => {
          b.classList.remove("nr-selected");
          b.setAttribute("aria-checked", "false");
          b.setAttribute("tabindex", "-1");
        });
        btn.classList.add("nr-selected");
        btn.setAttribute("aria-checked", "true");
        btn.setAttribute("tabindex", "0");
        saveProfile();
      });

      // Arrow key navigation within radiogroup
      btn.addEventListener("keydown", (e) => {
        const btns = Array.from(ntButtons);
        const idx = btns.indexOf(btn);
        let next = -1;
        if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (idx + 1) % btns.length;
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (idx - 1 + btns.length) % btns.length;
        if (next >= 0) {
          e.preventDefault();
          btns[next].click();
          btns[next].focus();
        }
      });
    });

    // ── Sliders ──
    const sliderConfig = [
      { id: "nr-pp-simplify", valId: "nr-pp-simplify-val", suffix: "" },
      { id: "nr-pp-focus", valId: "nr-pp-focus-val", suffix: "" },
      { id: "nr-pp-tts", valId: "nr-pp-tts-val", suffix: "x" },
      { id: "nr-pp-tone", valId: "nr-pp-tone-val", suffix: "" },
    ];
    sliderConfig.forEach(cfg => {
      const slider = document.getElementById(cfg.id);
      const val = document.getElementById(cfg.valId);
      slider.addEventListener("input", () => {
        val.textContent = slider.value + cfg.suffix;
        saveProfile();
      });
    });

    // ── Auto-adapt toggle ──
    const toggle = document.getElementById("nr-pp-autoadapt");
    toggle.addEventListener("click", () => {
      const current = toggle.getAttribute("aria-checked") === "true";
      toggle.setAttribute("aria-checked", String(!current));
      saveProfile();
    });
    toggle.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        toggle.click();
      }
    });

    // Load saved profile
    loadProfile();
  }

  function getProfileFromPanel() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return null;

    const selectedNT = panel.querySelector('.nr-pp-neurotype-btn.nr-selected');
    return {
      user_id: "default",
      neurotype: selectedNT ? selectedNT.dataset.neurotype : "none",
      simplification_level: parseInt(document.getElementById("nr-pp-simplify").value),
      focus_intensity: parseInt(document.getElementById("nr-pp-focus").value),
      tts_speed: parseFloat(document.getElementById("nr-pp-tts").value),
      tone_explanation_depth: parseInt(document.getElementById("nr-pp-tone").value),
      auto_adapt_enabled: document.getElementById("nr-pp-autoadapt").getAttribute("aria-checked") === "true",
    };
  }

  function setProfileOnPanel(profile) {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;

    // Neurotype
    const ntButtons = panel.querySelectorAll(".nr-pp-neurotype-btn");
    ntButtons.forEach(btn => {
      const isMatch = btn.dataset.neurotype === profile.neurotype;
      btn.classList.toggle("nr-selected", isMatch);
      btn.setAttribute("aria-checked", String(isMatch));
      btn.setAttribute("tabindex", isMatch ? "0" : "-1");
    });

    // Sliders
    const sliders = {
      "nr-pp-simplify": { val: profile.simplification_level || 2, suffix: "" },
      "nr-pp-focus": { val: profile.focus_intensity || 2, suffix: "" },
      "nr-pp-tts": { val: profile.tts_speed || 1.0, suffix: "x" },
      "nr-pp-tone": { val: profile.tone_explanation_depth || 2, suffix: "" },
    };
    Object.entries(sliders).forEach(([id, cfg]) => {
      const slider = document.getElementById(id);
      const valEl = document.getElementById(id + "-val");
      if (slider) slider.value = cfg.val;
      if (valEl) valEl.textContent = cfg.val + cfg.suffix;
    });

    // Toggle
    const toggle = document.getElementById("nr-pp-autoadapt");
    if (toggle) toggle.setAttribute("aria-checked", String(!!profile.auto_adapt_enabled));
  }

  function saveProfile() {
    const profile = getProfileFromPanel();
    if (!profile) return;

    // Save locally
    chrome.storage.local.get("nrState", (res) => {
      const state = res.nrState || {};
      state.agentProfile = profile;
      chrome.storage.local.set({ nrState: state });
    });

    // Sync to backend (fire-and-forget)
    if (window.NR_Utils) {
      window.NR_Utils.safeSend({
        type: "FETCH",
        url: API + "/profile",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: profile,
      });
    }

    // Notify the agent client immediately so it adapts to the new neurotype/auto-adapt setting
    // without waiting for the next polling cycle.
    try {
      document.dispatchEvent(new CustomEvent("nrProfileChanged", { detail: profile }));
    } catch (_) {}
  }

  function loadProfile() {
    chrome.storage.local.get("nrState", (res) => {
      if (res.nrState && res.nrState.agentProfile) {
        setProfileOnPanel(res.nrState.agentProfile);
      }
    });
  }

  // ── Public API ──
  window.NR_ProfilePanel = {
    activate: function () {
      injectStyles();
      buildPanel();
      const panel = document.getElementById(PANEL_ID);
      if (panel) {
        panel.classList.add("nr-panel-open");
        isPanelOpen = true;
        
        // Fetch agent memory
        if (window.NR_Utils) {
            window.NR_Utils.safeSend({
                type: "FETCH",
                url: API + "/agent/memory",
                method: "GET"
            }).then(res => {
                const memBox = document.getElementById("nr-pp-memory-content");
                if (res && res.ok && res.data && res.data.memory && memBox) {
                    const mem = res.data.memory;
                    let html = "";
                    let hasLearning = false;
                    for (const [feat, conf] of Object.entries(mem.confidence_adjustments || {})) {
                        if (conf !== 0) {
                            const desc = conf > 0 ? "You prefer this" : "You dislike this";
                            const color = conf > 0 ? "#10B981" : "#EF4444";
                            html += `<div class="nr-pp-memory-item"><strong>${feat}:</strong> <span style="color:${color}">${desc}</span></div>`;
                            hasLearning = true;
                        }
                    }
                    memBox.innerHTML = hasLearning ? html : "The agent is still learning your preferences.";
                }
            });
        }

        // Focus the close button for keyboard users
        setTimeout(() => {
          const closeBtn = document.getElementById("nr-pp-close-btn");
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
        // Return focus to the toolbar profile button
        const tbBtn = document.getElementById("tb-profile");
        if (tbBtn) tbBtn.focus();
      }
      return { success: true };
    },
    toggle: function () {
      return isPanelOpen ? this.deactivate() : this.activate();
    },
    getProfile: getProfileFromPanel,
  };
})();
