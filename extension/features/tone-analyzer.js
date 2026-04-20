// NeuroRead AI — tone-analyzer.js
// Module: Social Tone & Subtext Analysis
// Adds inline tone annotations to selected text, revealing emotional intent
// and implicit meaning for users who struggle with social subtext.

(function () {
  "use strict";
  if (window.__NR_TONE_LOADED) return;
  window.__NR_TONE_LOADED = true;

  const API = "http://localhost:8000";
  const STYLE_ID = "nr-tone-style";
  let isActive = false;
  let selectionHandler = null;

  // ─── Styles ────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .nr-tone-card {
        position: absolute;
        background: rgba(15, 15, 20, 0.97);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(245, 158, 11, 0.3);
        border-radius: 14px;
        padding: 14px 18px;
        z-index: 2147483641;
        box-shadow: 0 10px 40px rgba(0,0,0,0.5);
        color: #E0E7FF;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        max-width: 380px;
        min-width: 260px;
        animation: nr-tone-enter 0.25s ease;
      }
      @keyframes nr-tone-enter {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }

      .nr-tone-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 10px;
        padding-bottom: 8px;
        border-bottom: 1px solid rgba(245, 158, 11, 0.15);
      }
      .nr-tone-title {
        font-size: 11px;
        font-weight: 700;
        color: #F59E0B;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .nr-tone-close {
        background: rgba(255,255,255,0.08);
        border: none;
        color: #C4B5FD;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.15s;
      }
      .nr-tone-close:hover { background: rgba(255,255,255,0.18); }

      /* Primary tone badge */
      .nr-tone-primary {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 10px;
      }
      .nr-tone-emoji {
        font-size: 28px;
        line-height: 1;
      }
      .nr-tone-primary-info {
        flex: 1;
      }
      .nr-tone-primary-label {
        font-size: 16px;
        font-weight: 700;
        color: #FCD34D;
        line-height: 1.2;
      }
      .nr-tone-primary-conf {
        font-size: 11px;
        color: rgba(196, 181, 253, 0.5);
        margin-top: 2px;
      }

      /* Details sections */
      .nr-tone-section {
        margin-bottom: 8px;
      }
      .nr-tone-section-title {
        font-size: 10px;
        font-weight: 700;
        color: #A78BFA;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 4px;
      }
      .nr-tone-section-text {
        color: #C4B5FD;
        font-size: 12px;
        line-height: 1.5;
      }

      /* Subtext items */
      .nr-tone-subtext-list {
        list-style: none;
        padding: 0;
        margin: 0;
      }
      .nr-tone-subtext-item {
        padding: 4px 0;
        color: #C4B5FD;
        font-size: 12px;
        line-height: 1.4;
        display: flex;
        align-items: flex-start;
        gap: 6px;
      }
      .nr-tone-subtext-bullet {
        color: #F59E0B;
        font-weight: 700;
        flex-shrink: 0;
        margin-top: 1px;
      }

      /* Selection highlight */
      .nr-tone-selection {
        background: rgba(245, 158, 11, 0.12) !important;
        border-bottom: 2px dashed rgba(245, 158, 11, 0.4) !important;
        border-radius: 2px;
        transition: background 0.3s;
      }

      /* Read aloud button */
      .nr-tone-read-btn {
        background: rgba(245, 158, 11, 0.15);
        color: #FCD34D;
        border: 1px solid rgba(245, 158, 11, 0.25);
        border-radius: 8px;
        padding: 5px 12px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.15s;
        margin-top: 6px;
      }
      .nr-tone-read-btn:hover { background: rgba(245, 158, 11, 0.25); }

      /* Loading state */
      .nr-tone-loading {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 0;
        color: rgba(196, 181, 253, 0.6);
        font-size: 12px;
      }
      .nr-tone-spinner {
        width: 16px;
        height: 16px;
        border: 2px solid rgba(245, 158, 11, 0.2);
        border-top: 2px solid #F59E0B;
        border-radius: 50%;
        animation: nr-tone-spin 0.8s linear infinite;
      }
      @keyframes nr-tone-spin {
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }

  // ─── Tone emoji mapping ────────────────────────────────────
  const TONE_EMOJIS = {
    "neutral": "😐",
    "friendly": "😊",
    "formal": "🏛️",
    "sarcastic": "😏",
    "angry": "😠",
    "sad": "😢",
    "excited": "🤩",
    "anxious": "😰",
    "condescending": "🙄",
    "encouraging": "💪",
    "humorous": "😄",
    "serious": "🧐",
    "passive-aggressive": "😒",
    "empathetic": "🤗",
    "dismissive": "🤷",
    "supportive": "❤️",
    "critical": "⚠️",
    "informative": "📝",
  };

  function getToneEmoji(tone) {
    const key = (tone || "").toLowerCase().trim();
    for (const [keyword, emoji] of Object.entries(TONE_EMOJIS)) {
      if (key.includes(keyword)) return emoji;
    }
    return "🎭";
  }

  // ─── Analyze selected text ─────────────────────────────────
  async function analyzeSelection() {
    const selection = window.getSelection();
    if (!selection || selection.toString().trim().length < 15) return;

    const text = selection.toString().trim();
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    // Remove any existing cards
    removeCards();

    // Mark the selection
    try {
      const span = document.createElement("span");
      span.className = "nr-tone-selection";
      range.surroundContents(span);
    } catch (e) {
      // Complex selections can fail — that's fine, card still works
    }

    // Create loading card
    const card = createCard(rect);
    card.innerHTML = `
      <div class="nr-tone-header">
        <span class="nr-tone-title">🎭 Analyzing Tone…</span>
        <button class="nr-tone-close" aria-label="Close tone analysis">✕</button>
      </div>
      <div class="nr-tone-loading">
        <div class="nr-tone-spinner" aria-hidden="true"></div>
        <span>Reading between the lines…</span>
      </div>
    `;
    wireCloseButton(card);
    document.body.appendChild(card);

    // Call backend
    const analysis = await callToneAPI(text);

    // Update card with results
    if (analysis) {
      renderAnalysis(card, analysis, text);
    } else {
      card.querySelector(".nr-tone-loading").innerHTML = `
        <span style="color: #EF4444;">Could not analyze tone. Backend may be offline.</span>
      `;
    }
  }

  function createCard(rect) {
    const card = document.createElement("div");
    card.className = "nr-tone-card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", "Tone and subtext analysis");

    // Position below the selection
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    card.style.position = "absolute";
    card.style.left = Math.max(10, rect.left + scrollX) + "px";
    card.style.top = (rect.bottom + scrollY + 8) + "px";

    return card;
  }

  function renderAnalysis(card, analysis, originalText) {
    const emoji = getToneEmoji(analysis.primary_tone);
    const subtexts = analysis.subtexts || analysis.hidden_meanings || [];
    const rewrite = analysis.plain_language || analysis.rewrite || "";
    const social = analysis.social_context || "";

    card.innerHTML = `
      <div class="nr-tone-header">
        <span class="nr-tone-title">🎭 Tone Analysis</span>
        <button class="nr-tone-close" aria-label="Close tone analysis">✕</button>
      </div>

      <div class="nr-tone-primary">
        <span class="nr-tone-emoji" aria-hidden="true">${emoji}</span>
        <div class="nr-tone-primary-info">
          <div class="nr-tone-primary-label">${analysis.primary_tone || "Unknown"}</div>
          <div class="nr-tone-primary-conf">${analysis.secondary_tone ? "also " + analysis.secondary_tone : ""}</div>
        </div>
      </div>

      ${subtexts.length > 0 ? `
      <div class="nr-tone-section">
        <div class="nr-tone-section-title">Hidden Meaning</div>
        <ul class="nr-tone-subtext-list">
          ${subtexts.map(s => `
            <li class="nr-tone-subtext-item">
              <span class="nr-tone-subtext-bullet">→</span>
              <span>${escapeHTML(typeof s === "string" ? s : s.meaning || s.text || JSON.stringify(s))}</span>
            </li>
          `).join("")}
        </ul>
      </div>
      ` : ""}

      ${rewrite ? `
      <div class="nr-tone-section">
        <div class="nr-tone-section-title">What They Really Mean</div>
        <div class="nr-tone-section-text">"${escapeHTML(rewrite)}"</div>
      </div>
      ` : ""}

      ${social ? `
      <div class="nr-tone-section">
        <div class="nr-tone-section-title">Social Context</div>
        <div class="nr-tone-section-text">${escapeHTML(social)}</div>
      </div>
      ` : ""}

      <button class="nr-tone-read-btn" aria-label="Read tone analysis aloud">🔊 Read Analysis</button>
    `;

    wireCloseButton(card);

    // Read aloud button
    const readBtn = card.querySelector(".nr-tone-read-btn");
    if (readBtn) {
      readBtn.addEventListener("click", () => {
        const msg = `Tone: ${analysis.primary_tone}. ` +
          (subtexts.length > 0 ? `The hidden meaning is: ${subtexts.map(s => typeof s === "string" ? s : s.meaning || "").join(". ")}. ` : "") +
          (rewrite ? `What they really mean: ${rewrite}` : "");
        speak(msg);
      });
    }

    // Keyboard: Escape to close
    card.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        card.remove();
        removeSelectionHighlights();
      }
    });

    // Focus close button
    setTimeout(() => {
      const close = card.querySelector(".nr-tone-close");
      if (close) close.focus();
    }, 100);
  }

  function wireCloseButton(card) {
    const close = card.querySelector(".nr-tone-close");
    if (close) {
      close.addEventListener("click", () => {
        card.remove();
        removeSelectionHighlights();
      });
    }
  }

  // ─── Backend API call ──────────────────────────────────────
  function callToneAPI(text) {
    return new Promise((resolve) => {
      if (!window.NR_Utils) return resolve(null);
      window.NR_Utils.safeSend({
        type: "FETCH",
        url: API + "/analyze-tone",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: { text_content: text }
      }).then((res) => {
        if (res && res.ok && res.data && res.data.success) {
          resolve(res.data.analysis);
        } else {
          console.error("[NR-Tone] API error:", res?.error);
          resolve(null);
        }
      });
    });
  }

  // ─── Utilities ─────────────────────────────────────────────
  function speak(text) {
    if ("speechSynthesis" in window) {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.0;
      u.lang = "en-US";
      speechSynthesis.speak(u);
    }
  }

  function escapeHTML(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function removeCards() {
    document.querySelectorAll(".nr-tone-card").forEach(c => c.remove());
  }

  function removeSelectionHighlights() {
    document.querySelectorAll(".nr-tone-selection").forEach(el => {
      const parent = el.parentNode;
      if (parent) {
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
        parent.removeChild(el);
      }
    });
  }

  // ─── Selection listener ────────────────────────────────────
  function onMouseUp() {
    if (!isActive) return;
    // Small delay to let selection finalize
    setTimeout(() => {
      const sel = window.getSelection();
      if (sel && sel.toString().trim().length >= 15) {
        analyzeSelection();
      }
    }, 200);
  }

  // ─── Public API ────────────────────────────────────────────
  window.NR_ToneAnalyzer = {
    activate: function () {
      isActive = true;
      injectStyles();
      document.addEventListener("mouseup", onMouseUp);
      console.log("[NeuroRead] Tone analyzer activated. Select text to analyze.");
      return { success: true };
    },
    deactivate: function () {
      isActive = false;
      document.removeEventListener("mouseup", onMouseUp);
      removeCards();
      removeSelectionHighlights();
      const style = document.getElementById(STYLE_ID);
      if (style) style.remove();
      speechSynthesis.cancel();
      return { success: true };
    },
  };
})();
