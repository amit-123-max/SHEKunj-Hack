// NeuroRead AI — reader-mode.js
// Module 9: Focus Reader Mode
// Extracts page content, runs it through Llama-3, and completely overlays a simplified reader mode.

(function () {
  "use strict";
  if (window.__NR_READER_MODE_LOADED) return;
  window.__NR_READER_MODE_LOADED = true;

  const API = "http://localhost:8000/focus-reader";
  const OVERLAY_ID = "nr-focus-reader-overlay";

  function injectCSS() {
    if (document.getElementById("nr-reader-css")) return;
    const styleEl = document.createElement("style");
    styleEl.id = "nr-reader-css";
    styleEl.textContent = `
      #nr-focus-reader-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        z-index: 2147483647; /* Max z-index to overlay everything */
        background-color: var(--nr-reader-bg, #FAFAF5);
        color: var(--nr-reader-text, #1A1A2E);
        overflow-y: auto;
        font-family: var(--nr-font-family, system-ui, sans-serif);
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 40px 20px;
        box-sizing: border-box;
        animation: nr-fade-in 0.4s ease;
      }
      #nr-focus-reader-overlay .nr-reader-container {
        max-width: 800px;
        width: 100%;
        background: transparent;
      }
      #nr-focus-reader-overlay .nr-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        border-bottom: 2px solid rgba(0,0,0,0.1);
        padding-bottom: 20px;
        margin-bottom: 30px;
      }
      #nr-focus-reader-overlay h1 {
        font-size: calc(var(--nr-font-size, 20px) * 1.5) !important;
        line-height: 1.3 !important;
        margin: 0;
        margin-right: 20px;
        color: var(--nr-reader-highlight, #4A1D96);
      }
      #nr-focus-reader-overlay button.nr-close-btn {
        background: rgba(0,0,0,0.05);
        border: none;
        border-radius: 50%;
        width: 40px;
        height: 40px;
        font-size: 20px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s;
        color: inherit;
        flex-shrink: 0;
      }
      #nr-focus-reader-overlay button.nr-close-btn:hover {
        background: rgba(0,0,0,0.15);
      }
      #nr-focus-reader-overlay .nr-content {
        display: flex;
        flex-direction: column;
        gap: calc(var(--nr-line-height, 1.8) * 0.8em);
      }
      #nr-focus-reader-overlay .nr-content p,
      #nr-focus-reader-overlay .nr-content li {
        font-size: var(--nr-font-size, 20px) !important;
        line-height: var(--nr-line-height, 1.8) !important;
        margin: 0;
      }
      #nr-focus-reader-overlay .nr-content ul {
        padding-left: 30px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      #nr-focus-reader-overlay .nr-section-heading {
        font-size: calc(var(--nr-font-size, 20px) * 1.25) !important;
        line-height: 1.35 !important;
        color: var(--nr-reader-highlight, #4A1D96);
        margin: 0;
        padding-bottom: 8px;
        border-bottom: 2px solid rgba(124, 58, 237, 0.15);
      }
      #nr-focus-reader-overlay .nr-section {
        animation: nr-fade-in 0.4s ease;
      }
      #nr-focus-reader-overlay .nr-loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 60vh;
        opacity: 0.7;
      }
      #nr-focus-reader-overlay .nr-spinner {
        width: 50px;
        height: 50px;
        border: 4px solid rgba(124, 58, 237, 0.2);
        border-top-color: #7C3AED;
        border-radius: 50%;
        animation: nr-spin 1s linear infinite;
        margin-bottom: 20px;
      }
      
      @keyframes nr-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      @keyframes nr-fade-in { from { opacity: 0; } to { opacity: 1; } }
      
      .nr-feed-item {
        display: flex;
        flex-direction: row;
        gap: 20px;
        background: rgba(0,0,0,0.03);
        border: 2px solid rgba(0,0,0,0.05);
        border-radius: 12px;
        padding: 20px;
        margin-bottom: 20px;
        transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
        text-decoration: none;
        color: inherit;
      }
      .nr-feed-item:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 24px rgba(0,0,0,0.1);
        border-color: rgba(124, 58, 237, 0.4);
      }
      .nr-feed-item img {
        width: 150px;
        height: 150px;
        border-radius: 8px;
        object-fit: cover;
        flex-shrink: 0;
      }
      .nr-feed-item .nr-feed-text {
        display: flex;
        flex-direction: column;
        justify-content: center;
      }
      .nr-feed-item h2 {
        font-size: calc(var(--nr-font-size, 20px) * 1.2) !important;
        margin: 0 0 10px 0;
        color: var(--nr-reader-highlight, #4A1D96);
      }
      .nr-feed-item p {
        font-size: var(--nr-font-size, 20px) !important;
        line-height: var(--nr-line-height, 1.8) !important;
        margin: 0;
        color: var(--nr-reader-text, #1A1A2E);
        opacity: 0.9;
      }
      
      body.nr-no-scroll {
        overflow: hidden !important;
      }
    `;
    document.head.appendChild(styleEl);
  }

  function createOverlay() {
    const existing = document.getElementById(OVERLAY_ID);
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    
    // Set colors directly from the formatting variables context if available, otherwise fallback
    overlay.style.setProperty('--nr-reader-bg', getComputedStyle(document.body).getPropertyValue('--nr-background') || '#FAFAF5');
    overlay.style.setProperty('--nr-reader-text', getComputedStyle(document.body).getPropertyValue('--nr-text') || '#1A1A2E');
    overlay.style.setProperty('--nr-reader-highlight', getComputedStyle(document.body).getPropertyValue('--nr-highlight') || '#4A1D96');

    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Reader mode - simplified page content");

    overlay.innerHTML = `
      <div class="nr-reader-container">
        <div class="nr-header">
          <h1 id="nr-reader-title">Reader Mode</h1>
          <button class="nr-close-btn" id="nr-close-reader" aria-label="Close reader mode">✕</button>
        </div>
        <div id="nr-reader-body" class="nr-content">
          <div id="nr-article-list" class="nr-article-sections" style="margin-bottom: 40px; display: none;"></div>
          
          <div id="nr-reader-loader" class="nr-loading" role="status" aria-live="polite">
            <div class="nr-spinner" aria-hidden="true"></div>
            <h3 id="nr-loader-title">Distilling Content...</h3>
            <p id="nr-loader-desc" style="font-size: 16px!important; opacity: 0.8; margin-top: 10px;">This may take up to 20 seconds for large sites.</p>
          </div>

          <hr id="nr-feed-divider" class="nr-feed-divider" style="display: none; width: 100%; border: none; border-top: 2px solid rgba(0,0,0,0.1); margin: 0 0 30px 0;">
          <h2 id="nr-feed-title" style="display: none; margin-bottom: 20px; font-size: calc(var(--nr-font-size, 20px) * 1.3);">Related Articles & Feed</h2>
          <div id="nr-feed-list" style="display: none;"></div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    document.body.classList.add('nr-no-scroll');

    const closeBtn = document.getElementById("nr-close-reader");
    closeBtn.addEventListener("click", () => {
      window.NR_ReaderMode.deactivate();
    });

    // Escape-to-close
    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        window.NR_ReaderMode.deactivate();
      }
      // Focus trap: Tab/Shift+Tab stays within overlay
      if (e.key === "Tab") {
        const focusable = overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });

    // Focus the close button on open
    setTimeout(() => closeBtn.focus(), 100);
    
    return overlay;
  }
  
  function renderContent(data, isAppend = false) {
    const titleEl = document.getElementById("nr-reader-title");
    const loaderEl = document.getElementById("nr-reader-loader");
    const articleList = document.getElementById("nr-article-list");
    const feedList = document.getElementById("nr-feed-list");
    const feedDivider = document.getElementById("nr-feed-divider");
    const feedTitle = document.getElementById("nr-feed-title");
    
    if (!titleEl) return;
    
    if (!isAppend) {
      titleEl.textContent = data.title || "Focus Reader";
      // Hide initial big loader
      if (loaderEl) loaderEl.style.display = "none";
    }
    
    // --- 1. Render Article Sections (if exists) ---
    if (data.sections && Array.isArray(data.sections) && data.sections.length > 0) {
      if (data.title !== "Not enough content" && data.title !== "Error generating reader view") {
          articleList.style.display = "flex";
          articleList.style.flexDirection = "column";
          articleList.style.gap = "28px";
          
          data.sections.forEach(section => {
            const sectionDiv = document.createElement("div");
            sectionDiv.className = "nr-section";
            if (isAppend) sectionDiv.style.animation = "nr-fade-in 0.5s ease";
            
            // Section heading
            const heading = document.createElement("h2");
            heading.className = "nr-section-heading";
            heading.textContent = section.heading || "Section";
            sectionDiv.appendChild(heading);
            
            // Section bullet points
            if (section.points && Array.isArray(section.points)) {
              const ul = document.createElement("ul");
              section.points.forEach(point => {
                const li = document.createElement("li");
                li.textContent = point.replace(/^- /, '');
                ul.appendChild(li);
              });
              sectionDiv.appendChild(ul);
            }
            
            articleList.appendChild(sectionDiv);
          });
      }
    }
    
    // --- 2. Render Feed Sub-block (if exists) ---
    // Feed is only rendered on chunk 0 (isAppend = false)
    if (!isAppend && data.feed && Array.isArray(data.feed) && data.feed.length > 0) {
      feedList.style.display = "block";
      
      // If we also had an article above, show the separator
      if (articleList.style.display === "flex") {
         feedDivider.style.display = "block";
         feedTitle.style.display = "block";
      } else {
         titleEl.textContent = "Focus Feed Reader";
      }
      
      data.feed.forEach(item => {
        const a = document.createElement("a");
        a.className = "nr-feed-item";
        a.href = item.link;
        
        let imgHtml = "";
        if (item.image_url && item.image_url.startsWith("http")) {
           imgHtml = `<img src="${item.image_url}" alt="" loading="lazy">`;
        } else {
           imgHtml = `<div style="width: 150px; height: 150px; background: rgba(0,0,0,0.05); border-radius: 8px; flex-shrink: 0; display:flex; align-items:center; justify-content:center; opacity: 0.6; font-size: 14px;">No Image</div>`;
        }
        
        a.innerHTML = `
          ${imgHtml}
          <div class="nr-feed-text">
            <h2>${item.title}</h2>
            <p>${item.summary}</p>
          </div>
        `;
        feedList.appendChild(a);
      });
    }
    
    // If nothing returned on chunk 0
    if (!isAppend && articleList.style.display === "none" && feedList.style.display === "none") {
      loaderEl.style.display = "flex";
      loaderEl.innerHTML = "<p>No usable article or feed content could be extracted.</p>";
    }
  }

  // State globals
  let currentChunks = [];
  let currentChunkIndex = 0;
  let isFetchingChunk = false;

  async function fetchNextChunk() {
    if (currentChunkIndex >= currentChunks.length || isFetchingChunk) {
      console.log(`[NR-Reader] fetchNextChunk skipped: index=${currentChunkIndex}, total=${currentChunks.length}, busy=${isFetchingChunk}`);
      return;
    }
    
    isFetchingChunk = true;
    console.log(`[NR-Reader] >>> Fetching chunk ${currentChunkIndex + 1}/${currentChunks.length} (${currentChunks[currentChunkIndex].length} chars)`);
    const loaderEl = document.getElementById("nr-reader-loader");
    const loaderTitle = document.getElementById("nr-loader-title");
    const loaderDesc = document.getElementById("nr-loader-desc");
    
    // Show mini-loader at bottom if we are fetching chunk > 0
    if (currentChunkIndex > 0 && loaderEl) {
       loaderEl.style.display = "flex";
       loaderEl.style.height = "auto";
       loaderEl.style.margin = "40px 0";
       if (loaderTitle) loaderTitle.textContent = `Synthesizing Block ${currentChunkIndex + 1}/${currentChunks.length}...`;
       if (loaderDesc) loaderDesc.textContent = "Rate limiting protection enabled.";
       
       // Ensure the loader is placed BEFORE the feed lists visually
       const feedDivider = document.getElementById("nr-feed-divider");
       if (feedDivider) {
           feedDivider.parentNode.insertBefore(loaderEl, feedDivider);
       }
    }

    const payload = {
      is_feed: currentChunkIndex === 0 ? window._NR_IS_FEED : false,
      raw_text: currentChunks[currentChunkIndex],
      feed_items: currentChunkIndex === 0 ? window._NR_FEED_ITEMS : []
    };

    console.log(`[NR-Reader] Sending POST to ${API}`, { is_feed: payload.is_feed, text_len: payload.raw_text.length, feed_count: payload.feed_items.length });
    const fetchStart = Date.now();

    if (!window.NR_Utils) return;
    window.NR_Utils.safeSend({
      type: "FETCH",
      url: API,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload
    }).then((res) => {
      isFetchingChunk = false;
      const elapsed = ((Date.now() - fetchStart) / 1000).toFixed(1);
      console.log(`[NR-Reader] <<< Response for chunk ${currentChunkIndex + 1} in ${elapsed}s`, res);
      
      if (!res || !res.ok) {
        console.error("[NR-Reader] FAILED:", res?.error || "Unknown error");
        if (loaderEl && currentChunkIndex === 0) {
            renderContent({ title: "Error", sections: [{heading: "Connection Error", points: ["Failed to connect to Local AI Service. Is the backend running?"]}] }, false);
        } else if (loaderEl) {
            loaderEl.innerHTML = `<p>Error fetching block ${currentChunkIndex + 1}. Halting stream.</p>`;
        }
        return;
      }

      console.log(`[NR-Reader] Data received:`, JSON.stringify(res.data.data).substring(0, 200));
      renderContent(res.data.data, currentChunkIndex > 0);
      
      currentChunkIndex++;
      // If there are more chunks, queue the next one immediately (recursively)
      if (currentChunkIndex < currentChunks.length) {
          fetchNextChunk();
      } else {
          // Finished
          if (loaderEl) loaderEl.style.display = "none";
      }
    });
  }

  window.NR_ReaderMode = {
    activate: async function () {
      injectCSS();
      createOverlay();
      
      // Heuristic to detect feeds: Look for links with images or massive text
      const linkCandidates = Array.from(document.querySelectorAll("a"));
      const feedItems = [];
      const seenLinks = new Set();
      
      linkCandidates.forEach(a => {
        if (!a.href || !a.href.startsWith("http") || seenLinks.has(a.href)) return;
        const img = a.querySelector("img");
        const text = a.innerText.trim();
        
        if (img && text.length > 20) {
          feedItems.push({
            link: a.href,
            image_url: img.src,
            snippet: text
          });
          seenLinks.add(a.href);
        } else if (text.length > 60) {
          // Complex card where link is separated from image
          const card = a.closest("article, .card, [class*='card'], [class*='item'], [class*='grid']");
          if (card) {
            const cardImg = card.querySelector("img");
            feedItems.push({
              link: a.href,
              image_url: cardImg ? cardImg.src : "",
              snippet: text
            });
            seenLinks.add(a.href);
          }
        }
      });

      window._NR_IS_FEED = feedItems.length >= 4; 
      window._NR_FEED_ITEMS = feedItems;
      
      console.log(`[NR-Reader] Detected ${feedItems.length} feed candidates. is_feed=${window._NR_IS_FEED}`);
      
      // Chunk the document innerText into 5,000 char blocks (~1500 tokens each)
      const fullText = document.body.innerText;
      currentChunks = [];
      for (let i = 0; i < fullText.length; i += 5000) {
         currentChunks.push(fullText.substring(i, i + 5000));
      }
      if (currentChunks.length === 0) currentChunks = [""];
      currentChunkIndex = 0;
      isFetchingChunk = false;

      console.log(`[NR-Reader] Split page into ${currentChunks.length} chunks of ~5000 chars. Total text: ${fullText.length} chars`);

      // Start the infinite stream
      fetchNextChunk();

      return Promise.resolve({ success: true, streaming: true });
    },

    deactivate: function () {
      const overlay = document.getElementById(OVERLAY_ID);
      currentChunkIndex = 99999; // Abort further fetches
      if (overlay) overlay.remove();
      document.body.classList.remove('nr-no-scroll');
      console.log("[NeuroRead/AI] Reader Mode removed.");
    }
  };
})();
