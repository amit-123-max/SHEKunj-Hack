// NeuroRead AI — focus-mode.js
// Module 8: AI True Focus Mode (Reader View)
// Uses Groq to analyze the DOM layout, identify peripheral sidebars/navs, and aggressively conceal them.

(function () {
  "use strict";
  if (window.__NR_FOCUSMODE_LOADED) return;
  window.__NR_FOCUSMODE_LOADED = true;

  const API = "http://localhost:8000";
  const HIDE_CLASS = "nr-focus-hidden";
  // IDs of our own injected UI tools so we don't accidentally hide them
  const PROTECTED_IDS = ["nr-toc-container", "nr-read-ruler", "nr-formatting-style", "nr-focusblock-style", "nr-focusmode-style"];

  // Build a lightweight skeleton of the site structure for Groq to analyze
  function buildSkeleton() {
    // We aggressively capture layout-defining tags so Groq can identify sidebars/footers perfectly
    const elements = document.querySelectorAll('main, article, section, header, footer, nav, aside, div[id*="sidebar"], div[class*="sidebar"], div[id*="toc"], div[class*="toc"], div[class*="panel"], h1, h2, ul, iframe');
    let skeleton = "";
    let count = 0;
    for (let el of elements) {
      if (count > 350) break; // Provide a healthy chunk without overloading the LLM
      let tag = el.tagName.toLowerCase();
      let id = el.id ? `#${el.id}` : '';
      let cls = el.className && typeof el.className === 'string' ? `.${el.className.split(' ').slice(0, 3).join('.')}` : '';
      skeleton += `<${tag}${id}${cls}>\n`;
      count++;
    }
    return skeleton;
  }

  // Fetch AI tailored selectors based on our skeleton
  function fetchFocusSelectors() {
    return new Promise((resolve, reject) => {
      const skeleton = buildSkeleton();
      if (!window.NR_Utils) return reject("NR_Utils not loaded");
      window.NR_Utils.safeSend({
        type: "FETCH",
        url: API + "/analyze-focus",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: { html_skeleton: skeleton }
      }).then((res) => {
        if (!res || !res.ok) return reject(res ? res.error : "No response from backend");
        resolve(res.data.selectors);
      });
    });
  }

  async function isolateContent() {
    console.log("[NeuroRead/FocusMode] Connecting to Groq for True Focus layout map...");
    
    let selectors;
    try {
        selectors = await fetchFocusSelectors();
        console.log("[NeuroRead/FocusMode] AI mapped exclusions:", selectors.hide_selectors);
    } catch(err) {
        console.error("[NeuroRead/FocusMode] AI fetch failed, falling back.", err);
        return { success: false, error: err };
    }

    // Inject CSS to enforce hiding based on AI's targeted selectors
    if (!document.getElementById("nr-focusmode-style")) {
      const style = document.createElement("style");
      style.id = "nr-focusmode-style";
      
      // Combine AI targets with minimal safe internal logic
      const targetHide = selectors.hide_selectors;
      
      // Build a safe 'not' chain for our protected UI elements
      const safeChain = PROTECTED_IDS.map(id => `:not(#${id}):not(#${id} *)`).join('');

      style.textContent = `
        :is(${targetHide})${safeChain} {
          display: none !important;
          opacity: 0 !important;
          visibility: hidden !important;
          pointer-events: none !important;
          height: 0 !important;
          width: 0 !important;
          overflow: hidden !important;
        }
      `;
      document.head.appendChild(style);
    }

    const main = document.querySelector(selectors.main_content_selector) || document.querySelector('article, main');
    if (main) {
        // Enforce centering
        main.style.setProperty('margin-left', 'auto', 'important');
        main.style.setProperty('margin-right', 'auto', 'important');
    }

    // Smooth scroll to top since layout shifted dramatically
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    return { success: true };
  }

  function restoreContent() {
    const style = document.getElementById("nr-focusmode-style");
    if (style) style.remove();
    
    return { success: true };
  }

  window.NR_FocusMode = {
    activate: isolateContent,
    deactivate: restoreContent
  };
})();
