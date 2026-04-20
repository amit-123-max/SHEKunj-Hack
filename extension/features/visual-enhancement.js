// NeuroRead AI — visual-enhancement.js
// Module: Floating Table of Contents + Deep Search
// Generates a navigable TOC from page headings with instant search and reading progress.

(function () {
  "use strict";
  if (window.__NR_VISUAL_LOADED) return;
  window.__NR_VISUAL_LOADED = true;

  const TOC_ID = "nr-toc-container";
  const STYLE_ID = "nr-toc-style";
  let isActive = false;
  let progressInterval = null;
  let headingElements = [];

  // ─── Styles ────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #nr-toc-container {
        position: fixed;
        top: 50%;
        right: 18px;
        transform: translateY(-50%) translateX(10px);
        opacity: 0;
        pointer-events: none;
        background: rgba(15, 15, 20, 0.97);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(124, 58, 237, 0.25);
        border-radius: 16px;
        padding: 0;
        z-index: 2147483640;
        box-shadow: 0 12px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(124, 58, 237, 0.1);
        color: #E0E7FF;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        width: 300px;
        max-height: 70vh;
        display: flex;
        flex-direction: column;
        transition: opacity 0.3s ease, transform 0.3s ease;
        overflow: hidden;
      }
      #nr-toc-container.nr-toc-open {
        opacity: 1;
        pointer-events: auto;
        transform: translateY(-50%) translateX(0);
      }

      /* ── Header ── */
      .nr-toc-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 16px 10px;
        border-bottom: 1px solid rgba(124, 58, 237, 0.15);
        flex-shrink: 0;
      }
      .nr-toc-title {
        font-size: 12px;
        font-weight: 700;
        color: #A78BFA;
        text-transform: uppercase;
        letter-spacing: 0.6px;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .nr-toc-close {
        background: rgba(255,255,255,0.08);
        border: none;
        color: #C4B5FD;
        width: 26px;
        height: 26px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 13px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.15s;
      }
      .nr-toc-close:hover { background: rgba(255,255,255,0.18); }

      /* ── Progress Bar ── */
      .nr-toc-progress-track {
        height: 3px;
        background: rgba(255,255,255,0.06);
        flex-shrink: 0;
      }
      .nr-toc-progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #7C3AED, #A78BFA);
        border-radius: 0 2px 2px 0;
        width: 0%;
        transition: width 0.3s ease;
      }

      /* ── Search ── */
      .nr-toc-search-wrap {
        padding: 10px 14px 8px;
        flex-shrink: 0;
      }
      .nr-toc-search {
        width: 100%;
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 8px;
        padding: 8px 12px;
        color: #E0E7FF;
        font-size: 12px;
        font-family: inherit;
        outline: none;
        transition: border-color 0.2s;
        box-sizing: border-box;
      }
      .nr-toc-search:focus {
        border-color: rgba(124, 58, 237, 0.5);
      }
      .nr-toc-search::placeholder {
        color: rgba(196, 181, 253, 0.4);
      }

      /* ── List ── */
      .nr-toc-list {
        list-style: none;
        margin: 0;
        padding: 6px 0 10px;
        overflow-y: auto;
        flex: 1;
        scrollbar-width: thin;
        scrollbar-color: rgba(124, 58, 237, 0.3) transparent;
      }
      .nr-toc-list::-webkit-scrollbar { width: 4px; }
      .nr-toc-list::-webkit-scrollbar-track { background: transparent; }
      .nr-toc-list::-webkit-scrollbar-thumb {
        background: rgba(124, 58, 237, 0.3);
        border-radius: 2px;
      }

      .nr-toc-item {
        margin: 0;
        padding: 0;
      }
      .nr-toc-link {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 7px 16px;
        color: #C4B5FD;
        text-decoration: none;
        font-size: 12px;
        line-height: 1.4;
        cursor: pointer;
        border-left: 2px solid transparent;
        transition: all 0.15s;
        background: none;
        border-top: none;
        border-bottom: none;
        border-right: none;
        width: 100%;
        text-align: left;
        font-family: inherit;
      }
      .nr-toc-link:hover {
        background: rgba(124, 58, 237, 0.1);
        color: #E0E7FF;
      }
      .nr-toc-link.nr-toc-active {
        border-left-color: #7C3AED;
        color: #fff;
        background: rgba(124, 58, 237, 0.15);
        font-weight: 600;
      }
      .nr-toc-link.nr-toc-h2 { padding-left: 16px; font-weight: 600; font-size: 12px; }
      .nr-toc-link.nr-toc-h3 { padding-left: 28px; font-weight: 500; font-size: 11.5px; }
      .nr-toc-link.nr-toc-h4 { padding-left: 40px; font-weight: 400; font-size: 11px; color: rgba(196, 181, 253, 0.7); }
      .nr-toc-link.nr-toc-h5 { padding-left: 52px; font-weight: 400; font-size: 10.5px; color: rgba(196, 181, 253, 0.5); }

      /* Level indicator dot */
      .nr-toc-dot {
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: rgba(124, 58, 237, 0.4);
        flex-shrink: 0;
      }
      .nr-toc-link.nr-toc-active .nr-toc-dot {
        background: #7C3AED;
        box-shadow: 0 0 6px rgba(124, 58, 237, 0.5);
      }

      .nr-toc-text {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex: 1;
      }

      /* ── Search highlight ── */
      .nr-toc-highlight {
        background: rgba(245, 158, 11, 0.3);
        color: #FCD34D;
        border-radius: 2px;
        padding: 0 1px;
      }

      /* ── Empty state ── */
      .nr-toc-empty {
        padding: 20px 16px;
        text-align: center;
        color: rgba(196, 181, 253, 0.5);
        font-size: 12px;
      }

      /* ── Footer stats ── */
      .nr-toc-footer {
        padding: 8px 14px;
        border-top: 1px solid rgba(124, 58, 237, 0.1);
        font-size: 10px;
        color: rgba(196, 181, 253, 0.4);
        text-align: center;
        flex-shrink: 0;
      }

      /* ── Deep search results panel ── */
      .nr-toc-deep-results {
        border-top: 1px solid rgba(124, 58, 237, 0.15);
        max-height: 200px;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: rgba(245, 158, 11, 0.3) transparent;
      }
      .nr-toc-deep-title {
        padding: 8px 14px 4px;
        font-size: 10px;
        font-weight: 700;
        color: #F59E0B;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .nr-toc-deep-item {
        display: block;
        padding: 6px 14px;
        color: #C4B5FD;
        font-size: 11px;
        line-height: 1.4;
        cursor: pointer;
        transition: background 0.15s;
        background: none;
        border: none;
        width: 100%;
        text-align: left;
        font-family: inherit;
      }
      .nr-toc-deep-item:hover {
        background: rgba(245, 158, 11, 0.08);
      }
      .nr-toc-deep-snippet {
        color: rgba(196, 181, 253, 0.55);
        font-style: italic;
      }
    `;
    document.head.appendChild(style);
  }

  // ─── Extract headings from page ────────────────────────────
  function extractHeadings() {
    const container = document.querySelector("article, main, .content, .mw-parser-output, #bodyContent") || document.body;
    const headings = container.querySelectorAll("h1, h2, h3, h4, h5");
    headingElements = [];

    headings.forEach((h, i) => {
      // Skip tiny or hidden headings
      if (h.offsetParent === null) return;
      if (h.textContent.trim().length < 2) return;
      // Skip headings inside our own UI
      if (h.closest("#nr-toc-container, #nr-productivity-toolbar, #nr-focus-reader-overlay")) return;

      // Ensure heading has an ID for scroll targeting
      if (!h.id) {
        h.id = "nr-heading-" + i;
      }

      headingElements.push({
        el: h,
        id: h.id,
        text: h.textContent.trim(),
        level: parseInt(h.tagName[1]),
      });
    });

    return headingElements;
  }

  // ─── Build the TOC panel ───────────────────────────────────
  function buildTOC() {
    if (document.getElementById(TOC_ID)) return;

    const headings = extractHeadings();

    const container = document.createElement("nav");
    container.id = TOC_ID;
    container.setAttribute("role", "navigation");
    container.setAttribute("aria-label", "Table of contents");

    container.innerHTML = `
      <div class="nr-toc-header">
        <span class="nr-toc-title">📑 Page Outline</span>
        <button class="nr-toc-close" aria-label="Close table of contents" id="nr-toc-close">✕</button>
      </div>
      <div class="nr-toc-progress-track">
        <div class="nr-toc-progress-fill" id="nr-toc-progress"></div>
      </div>
      <div class="nr-toc-search-wrap">
        <input type="text" class="nr-toc-search" id="nr-toc-search"
               placeholder="🔍 Search headings and page content…"
               aria-label="Search page content">
      </div>
      <ul class="nr-toc-list" id="nr-toc-list" role="list"></ul>
      <div class="nr-toc-footer" id="nr-toc-footer">
        ${headings.length} sections found
      </div>
    `;

    document.body.appendChild(container);

    // Render heading items
    renderHeadings(headings, "");

    // ── Close button ──
    document.getElementById("nr-toc-close").addEventListener("click", () => {
      window.NR_Visual.deactivate();
    });

    // ── Escape to close ──
    container.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        window.NR_Visual.deactivate();
      }
    });

    // ── Search input ──
    const searchInput = document.getElementById("nr-toc-search");
    let searchDebounce = null;
    searchInput.addEventListener("input", () => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        const query = searchInput.value.trim().toLowerCase();
        renderHeadings(headingElements, query);
        if (query.length >= 3) {
          performDeepSearch(query);
        } else {
          removeDeepResults();
        }
      }, 250);
    });

    // Start tracking scroll progress & active heading
    startProgressTracking();
  }

  // ─── Render heading items ──────────────────────────────────
  function renderHeadings(headings, query) {
    const list = document.getElementById("nr-toc-list");
    if (!list) return;
    list.innerHTML = "";

    const filtered = query
      ? headings.filter(h => h.text.toLowerCase().includes(query))
      : headings;

    if (filtered.length === 0) {
      list.innerHTML = `<li class="nr-toc-empty">${query ? "No headings match your search" : "No headings found on this page"}</li>`;
      return;
    }

    // Find the minimum level for proper indentation
    const minLevel = Math.min(...filtered.map(h => h.level));

    filtered.forEach(h => {
      const li = document.createElement("li");
      li.className = "nr-toc-item";

      const btn = document.createElement("button");
      btn.className = `nr-toc-link nr-toc-h${h.level}`;
      btn.dataset.headingId = h.id;
      btn.setAttribute("role", "link");
      btn.setAttribute("aria-label", `Jump to section: ${h.text}`);

      // Build label with search highlighting
      let displayText = h.text;
      if (query) {
        const regex = new RegExp(`(${escapeRegex(query)})`, "gi");
        displayText = h.text.replace(regex, '<span class="nr-toc-highlight">$1</span>');
      }

      btn.innerHTML = `
        <span class="nr-toc-dot"></span>
        <span class="nr-toc-text">${displayText}</span>
      `;

      btn.addEventListener("click", () => {
        const target = document.getElementById(h.id);
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
          // Brief highlight flash on the heading
          target.style.transition = "background 0.3s";
          target.style.background = "rgba(124, 58, 237, 0.15)";
          setTimeout(() => { target.style.background = ""; }, 1500);
        }
      });

      li.appendChild(btn);
      list.appendChild(li);
    });
  }

  // ─── Deep search (content search, not just headings) ──────
  function performDeepSearch(query) {
    removeDeepResults();

    const container = document.querySelector("article, main, .content, .mw-parser-output") || document.body;
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        // Skip our own UI and hidden elements
        if (node.parentElement.closest("#nr-toc-container, #nr-productivity-toolbar, script, style, noscript")) {
          return NodeFilter.FILTER_REJECT;
        }
        if (node.textContent.trim().length < 10) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    const results = [];
    const queryLower = query.toLowerCase();
    let node;

    while ((node = walker.nextNode()) && results.length < 8) {
      const text = node.textContent;
      const idx = text.toLowerCase().indexOf(queryLower);
      if (idx === -1) continue;

      // Get a snippet around the match
      const start = Math.max(0, idx - 30);
      const end = Math.min(text.length, idx + query.length + 50);
      let snippet = (start > 0 ? "…" : "") + text.substring(start, end) + (end < text.length ? "…" : "");

      results.push({
        element: node.parentElement,
        snippet: snippet,
        matchStart: idx - start + (start > 0 ? 1 : 0),
        matchLength: query.length,
      });
    }

    if (results.length === 0) return;

    const tocContainer = document.getElementById(TOC_ID);
    const footer = document.getElementById("nr-toc-footer");

    const deepPanel = document.createElement("div");
    deepPanel.className = "nr-toc-deep-results";
    deepPanel.id = "nr-toc-deep-results";

    deepPanel.innerHTML = `<div class="nr-toc-deep-title">🔍 ${results.length} content match${results.length > 1 ? "es" : ""}</div>`;

    results.forEach(r => {
      const btn = document.createElement("button");
      btn.className = "nr-toc-deep-item";
      btn.setAttribute("aria-label", `Jump to: ${r.snippet.substring(0, 50)}`);

      // Highlight the matched text in snippet
      const before = r.snippet.substring(0, r.matchStart);
      const match = r.snippet.substring(r.matchStart, r.matchStart + r.matchLength);
      const after = r.snippet.substring(r.matchStart + r.matchLength);
      btn.innerHTML = `<span class="nr-toc-deep-snippet">${escapeHTML(before)}<span class="nr-toc-highlight">${escapeHTML(match)}</span>${escapeHTML(after)}</span>`;

      btn.addEventListener("click", () => {
        r.element.scrollIntoView({ behavior: "smooth", block: "center" });
        r.element.style.transition = "background 0.3s, outline 0.3s";
        r.element.style.background = "rgba(245, 158, 11, 0.15)";
        r.element.style.outline = "2px solid rgba(245, 158, 11, 0.4)";
        r.element.style.outlineOffset = "4px";
        setTimeout(() => {
          r.element.style.background = "";
          r.element.style.outline = "";
          r.element.style.outlineOffset = "";
        }, 2000);
      });

      deepPanel.appendChild(btn);
    });

    tocContainer.insertBefore(deepPanel, footer);
  }

  function removeDeepResults() {
    const existing = document.getElementById("nr-toc-deep-results");
    if (existing) existing.remove();
  }

  // ─── Scroll progress + active heading tracking ─────────────
  function startProgressTracking() {
    if (progressInterval) clearInterval(progressInterval);

    progressInterval = setInterval(() => {
      if (!isActive) return;

      // Reading progress
      const scrollY = window.scrollY;
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const progress = Math.min(100, (scrollY / maxScroll) * 100);
      const progressBar = document.getElementById("nr-toc-progress");
      if (progressBar) progressBar.style.width = progress + "%";

      // Active heading detection
      const links = document.querySelectorAll(".nr-toc-link");
      let activeId = null;

      for (let i = headingElements.length - 1; i >= 0; i--) {
        const h = headingElements[i];
        const rect = h.el.getBoundingClientRect();
        if (rect.top <= 120) {
          activeId = h.id;
          break;
        }
      }

      links.forEach(link => {
        const isActive = link.dataset.headingId === activeId;
        link.classList.toggle("nr-toc-active", isActive);
        if (isActive) {
          // Scroll the TOC list to keep active item visible
          const list = document.getElementById("nr-toc-list");
          if (list && link.offsetTop > list.scrollTop + list.clientHeight - 40) {
            list.scrollTop = link.offsetTop - list.clientHeight / 2;
          } else if (list && link.offsetTop < list.scrollTop) {
            list.scrollTop = link.offsetTop - 20;
          }
        }
      });
    }, 300);
  }

  function stopProgressTracking() {
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
  }

  // ─── Utility ───────────────────────────────────────────────
  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function escapeHTML(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ─── Cleanup ───────────────────────────────────────────────
  function removeTOC() {
    const toc = document.getElementById(TOC_ID);
    if (toc) toc.remove();
    const style = document.getElementById(STYLE_ID);
    if (style) style.remove();
    stopProgressTracking();
    removeDeepResults();
  }

  // ─── Public API ────────────────────────────────────────────
  window.NR_Visual = {
    activate: function () {
      isActive = true;
      injectStyles();
      buildTOC();
      const toc = document.getElementById(TOC_ID);
      if (toc) {
        toc.classList.add("nr-toc-open");
        // Focus search for immediate keyboard use
        setTimeout(() => {
          const search = document.getElementById("nr-toc-search");
          if (search) search.focus();
        }, 100);
      }
      return { success: true };
    },
    deactivate: function () {
      isActive = false;
      const toc = document.getElementById(TOC_ID);
      if (toc) toc.classList.remove("nr-toc-open");
      stopProgressTracking();
      // Return focus to toolbar
      const tbBtn = document.getElementById("tb-toc");
      if (tbBtn) tbBtn.focus();
      return { success: true };
    },
    toggle: function () {
      const toc = document.getElementById(TOC_ID);
      if (toc && toc.classList.contains("nr-toc-open")) {
        return this.deactivate();
      }
      return this.activate();
    },
  };
})();