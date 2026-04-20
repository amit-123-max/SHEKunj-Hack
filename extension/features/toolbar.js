// NeuroRead AI — toolbar.js
// In-Page Productivity Toolbar
// Fully keyboard accessible with ARIA labels, focus management, and role attributes.

(function () {
  "use strict";
  if (window.__NR_TOOLBAR_LOADED) return;
  window.__NR_TOOLBAR_LOADED = true;

  const TOOLBAR_ID = "nr-productivity-toolbar";

  // Build and insert the toolbar
  function injectToolbar() {
    if (document.getElementById(TOOLBAR_ID)) return;

    // Inject shared accessibility CSS if not already present
    if (!document.getElementById("nr-a11y-css")) {
      const link = document.createElement("link");
      link.id = "nr-a11y-css";
      link.rel = "stylesheet";
      link.href = chrome.runtime.getURL("features/accessibility.css");
      document.head.appendChild(link);
    }

    // Add CSS
    const style = document.createElement("style");
    style.id = TOOLBAR_ID + "-style";
    style.textContent = `
      #nr-productivity-toolbar {
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(18, 18, 18, 0.95);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 16px;
        padding: 8px 12px;
        display: flex;
        align-items: center;
        gap: 8px;
        z-index: 2147483647;
        box-shadow: 0 10px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05);
        color: white;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        transition: max-width 0.3s ease, padding 0.3s ease;
      }
      
      .nr-tb-section {
        display: flex;
        gap: 8px;
        align-items: center;
      }
      
      /* Secondary section is hidden by default */
      .nr-tb-secondary {
        max-width: 0;
        overflow: hidden;
        opacity: 0;
        display: flex;
        gap: 8px;
        transition: max-width 0.4s ease, opacity 0.3s ease, margin 0.3s ease;
      }

      /* When expanded */
      #nr-productivity-toolbar.nr-expanded .nr-tb-secondary {
        max-width: 600px;
        opacity: 1;
        margin-left: 8px;
      }

      .nr-tb-divider {
        width: 1px;
        height: 32px;
        background: rgba(255,255,255,0.2);
        margin: 0 4px;
      }

      .nr-tb-btn {
        background: transparent;
        border: none;
        color: #E5E7EB;
        cursor: pointer;
        padding: 8px 12px;
        border-radius: 10px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        font-weight: 500;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        opacity: 0.8;
        min-width: 48px;
      }
      .nr-tb-btn:hover {
        background: rgba(255,255,255,0.1);
        opacity: 1;
        transform: translateY(-2px);
      }
      .nr-tb-btn.nr-active {
        background: rgba(59, 130, 246, 0.2);
        color: #93C5FD;
        opacity: 1;
      }
      
      .nr-tb-btn.nr-recording {
        background: rgba(220, 38, 38, 0.2) !important;
        color: #F87171 !important;
        animation: nr-tb-pulse 1.5s infinite;
      }
      @keyframes nr-tb-pulse {
        0% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.4); }
        70% { box-shadow: 0 0 0 10px rgba(220, 38, 38, 0); }
        100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0); }
      }
      
      .nr-tb-expand-btn {
        opacity: 0.8;
        border-radius: 50% !important;
        width: 32px;
        height: 32px;
        padding: 0 !important;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.3s;
      }
      /* Rotate expand icon when expanded */
      #nr-productivity-toolbar.nr-expanded .nr-tb-expand-btn {
        transform: rotate(180deg);
        background: rgba(255,255,255,0.15);
      }

      .nr-tb-icon {
        font-size: 20px;
        line-height: 1;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      /* Convert button special styling */
      #tb-convert {
        background: linear-gradient(135deg, rgba(124, 58, 237, 0.3), rgba(91, 33, 182, 0.3)) !important;
        border: 1px solid rgba(124, 58, 237, 0.5) !important;
        color: #C4B5FD !important;
        opacity: 1 !important;
        animation: nr-tb-convert-pulse 3s ease-in-out infinite;
      }
      #tb-convert:hover {
        background: linear-gradient(135deg, rgba(124, 58, 237, 0.5), rgba(91, 33, 182, 0.5)) !important;
        animation: none;
      }
      #tb-convert.nr-active {
        background: linear-gradient(135deg, rgba(5, 150, 105, 0.3), rgba(4, 120, 87, 0.3)) !important;
        border-color: rgba(52, 211, 153, 0.5) !important;
        color: #6EE7B7 !important;
        animation: none;
      }
      @keyframes nr-tb-convert-pulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(124, 58, 237, 0); }
        50%       { box-shadow: 0 0 12px 2px rgba(124, 58, 237, 0.4); }
      }
      /* Drag handle */
      .nr-tb-drag {
        cursor: grab;
        display: flex;
        align-items: center;
        padding: 0 4px;
        opacity: 0.5;
        transition: opacity 0.2s;
      }
      .nr-tb-drag:hover {
        opacity: 1;
      }
    `;
    document.head.appendChild(style);
    
    // Push the native body up slightly so you can scroll to the absolute bottom of a page without the toolbar blocking it forever
    document.body.style.paddingBottom = "100px";

    const toolbar = document.createElement("div");
    toolbar.id = TOOLBAR_ID;
    toolbar.setAttribute("role", "toolbar");
    toolbar.setAttribute("aria-label", "NeuroRead accessibility toolbar");
    
    // Create UI Sections
    const primarySection = document.createElement("div");
    primarySection.className = "nr-tb-section";
    
    const secondarySection = document.createElement("div");
    secondarySection.className = "nr-tb-secondary";

    const dragHandle = document.createElement("div");
    dragHandle.className = "nr-tb-drag";
    dragHandle.setAttribute("aria-label", "Drag to reposition toolbar");
    dragHandle.setAttribute("role", "separator");
    dragHandle.innerHTML = `<span style="font-size: 16px;">⋮⋮</span>`;
    primarySection.appendChild(dragHandle);
    
    const primaryTools = [
      { id: 'tb-convert', icon: '⚡', label: 'Convert', key: 'convert', object: 'NR_UniversalConvert', isConvert: true },
      { id: 'tb-format', icon: '✨', label: 'Format', key: 'formatting', object: 'NR_Formatting' },
      { id: 'tb-simplify', icon: '🧠', label: 'Simplify', key: 'simplify', object: 'NR_AiText' },
      { id: 'tb-mic', icon: '🎙️', label: 'Voice', key: 'mic', object: 'NR_SpeechIn' },
      { id: 'tb-read', icon: '🔊', label: 'Listen', key: 'read', object: 'NR_SpeechOut' },
      { id: 'tb-focus', icon: '🎯', label: 'Focus', key: 'focusMode', object: 'NR_FocusMode' },
      { id: 'tb-profile', icon: '👤', label: 'Profile', key: 'profile', object: 'NR_ProfilePanel', isPanel: true },
    ];

    const secondaryTools = [
      { id: 'tb-toc', icon: '📑', label: 'Outline', key: 'toc', object: 'NR_Visual' },
      { id: 'tb-ruler', icon: '📏', label: 'Ruler', key: 'ruler', object: 'NR_ReadRuler' },
      { id: 'tb-img-exp', icon: '🔍', label: 'Analyze', key: 'imageExplainer', object: 'NR_ImageExplainer', pending: false },
      { id: 'tb-tone', icon: '🎭', label: 'Tone', key: 'tone', object: 'NR_ToneAnalyzer' },
      { id: 'tb-metrics', icon: '📊', label: 'Metrics', key: 'metrics', object: 'NR_MetricsPanel', isPanel: true },
    ];

    // Collect all buttons for arrow key navigation
    const allButtons = [];

    function createButton(t) {
      const btn = document.createElement("button");
      btn.className = "nr-tb-btn";
      btn.innerHTML = `<span class="nr-tb-icon">${t.icon}</span><span>${t.label}</span>`;
      btn.id = t.id;
      btn.setAttribute("role", "button");
      btn.setAttribute("aria-label", `${t.label}: ${t.isPanel ? 'open panel' : 'toggle feature'}`);
      btn.setAttribute("tabindex", "0");
      
      // Load active state from storage (only for feature toggles, not panels)
      if (!t.isPanel) {
        btn.setAttribute("aria-pressed", "false");
        chrome.storage.local.get("nrState", (res) => {
          if (res.nrState && res.nrState[t.key]) {
            btn.classList.add("nr-active");
            btn.setAttribute("aria-pressed", "true");
          }
        });
      }

      btn.addEventListener("click", async () => {
        if (t.pending) {
            console.log(`[NeuroRead] ${t.label} feature is pending implementation!`);
            return;
        }

        // ⚡ Universal Convert button — special handling
        if (t.isConvert) {
          try {
            if (window.NR_UniversalConvert) {
              await window.NR_UniversalConvert.toggle();
            }
          } catch (e) {
            console.error(`[NeuroRead] Convert error:`, e);
          }
          return;
        }

        // Panel buttons toggle their panel
        if (t.isPanel) {
          try {
            if (window[t.object] && window[t.object].toggle) {
              window[t.object].toggle();
            } else if (window[t.object]) {
              const isActive = btn.classList.toggle("nr-active");
              isActive ? await window[t.object].activate() : await window[t.object].deactivate();
            }
          } catch (e) {
            console.error(`[NeuroRead] Error toggling ${t.label}:`, e);
          }
          return;
        }
        
        const isActive = btn.classList.toggle("nr-active");
        btn.setAttribute("aria-pressed", String(isActive));
        
        try {
          if (window[t.object]) {
            isActive ? await window[t.object].activate() : await window[t.object].deactivate();
          } else {
             console.warn(`[NeuroRead] Core module ${t.object} missing from context.`);
          }
          
          chrome.storage.local.get("nrState", (res) => {
            let state = res.nrState || {};
            state[t.key] = isActive;
            state.activeProfile = 'custom';
            chrome.storage.local.set({ nrState: state });
          });
        } catch (e) {
          console.error(`[NeuroRead] Error toggling ${t.label}:`, e);
          btn.classList.remove("nr-active"); 
          btn.setAttribute("aria-pressed", "false");
        }
      });

      // Arrow key navigation between toolbar buttons
      btn.addEventListener("keydown", (e) => {
        const idx = allButtons.indexOf(btn);
        let next = -1;
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          next = (idx + 1) % allButtons.length;
        } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          next = (idx - 1 + allButtons.length) % allButtons.length;
        } else if (e.key === "Home") {
          next = 0;
        } else if (e.key === "End") {
          next = allButtons.length - 1;
        }
        if (next >= 0) {
          e.preventDefault();
          allButtons[next].focus();
        }
      });

      allButtons.push(btn);
      return btn;
    }

    primaryTools.forEach(t => primarySection.appendChild(createButton(t)));
    
    // Add divider in secondary
    const divider = document.createElement("div");
    divider.className = "nr-tb-divider";
    divider.setAttribute("role", "separator");
    secondarySection.appendChild(divider);
    
    secondaryTools.forEach(t => secondarySection.appendChild(createButton(t)));

    // Expand Button
    const expandBtn = document.createElement("button");
    expandBtn.className = "nr-tb-btn nr-tb-expand-btn";
    expandBtn.innerHTML = `<span class="nr-tb-icon">❯</span>`;
    expandBtn.setAttribute("aria-label", "Show more accessibility tools");
    expandBtn.setAttribute("aria-expanded", "false");
    expandBtn.setAttribute("tabindex", "0");
    
    expandBtn.addEventListener("click", () => {
        const isExpanded = toolbar.classList.toggle("nr-expanded");
        expandBtn.setAttribute("aria-expanded", String(isExpanded));
        expandBtn.setAttribute("aria-label", isExpanded ? "Hide extra tools" : "Show more accessibility tools");
    });

    expandBtn.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (allButtons.length > 0) allButtons[allButtons.length - 1].focus();
      }
    });

    toolbar.appendChild(primarySection);
    toolbar.appendChild(secondarySection);
    toolbar.appendChild(expandBtn);

    document.body.appendChild(toolbar);
    
    // Drag logic
    let isDragging = false;
    let offset = { x: 0, y: 0 };
    
    dragHandle.addEventListener('mousedown', (e) => {
        isDragging = true;
        dragHandle.style.cursor = 'grabbing';
        const rect = toolbar.getBoundingClientRect();
        offset.x = e.clientX - rect.left;
        offset.y = e.clientY - rect.top;
        toolbar.style.left = rect.left + 'px';
        toolbar.style.top = rect.top + 'px';
        toolbar.style.bottom = 'auto'; 
        toolbar.style.transform = 'none'; 
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        toolbar.style.left = (e.clientX - offset.x) + 'px';
        toolbar.style.top = (e.clientY - offset.y) + 'px';
    });
    
    document.addEventListener('mouseup', () => {
        isDragging = false;
        dragHandle.style.cursor = 'grab';
    });
  }

  injectToolbar();

  // ─── Global Keyboard Shortcuts ─────────────────────────────
  // Motor-disability-first: all features accessible without mouse.
  // Alt+Key shortcuts prevent conflict with browser and page shortcuts.
  const SHORTCUTS = {
    'c': 'tb-convert',    // Alt+C = Convert This Page
    'f': 'tb-format',     // Alt+F = Format
    's': 'tb-simplify',   // Alt+S = Simplify
    'l': 'tb-read',       // Alt+L = Listen (Read Aloud)
    'm': 'tb-mic',        // Alt+M = Mic (Voice Command)
    'z': 'tb-focus',      // Alt+Z = Focus Mode
    'r': 'tb-ruler',      // Alt+R = Reading Ruler
    'p': 'tb-profile',    // Alt+P = Profile Panel
    'i': 'tb-img-exp',    // Alt+I = Image Explainer
    't': 'tb-tone',       // Alt+T = Tone Analyzer
    'o': 'tb-toc',        // Alt+O = Outline/TOC
    'e': 'tb-metrics',    // Alt+E = mEtrics Panel
  };

  document.addEventListener('keydown', (e) => {
    // Only fire if Alt is held (no Ctrl/Meta to avoid browser conflicts)
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    // Ignore if user is typing in an input
    const tag = document.activeElement ? document.activeElement.tagName : '';
    if (['INPUT', 'TEXTAREA', 'SELECT', 'CONTENTEDITABLE'].includes(tag)) return;
    if (document.activeElement && document.activeElement.isContentEditable) return;

    const key = e.key.toLowerCase();
    const btnId = SHORTCUTS[key];
    if (!btnId) return;

    e.preventDefault();
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.click();
      // Announce the shortcut action for screen readers
      const announcer = document.getElementById('nr-live-announcer');
      if (announcer) {
        const label = btn.querySelector('span:last-child');
        announcer.textContent = '';
        setTimeout(() => {
          announcer.textContent = `NeuroRead: ${label ? label.textContent : btnId} activated via keyboard shortcut`;
        }, 100);
      }
    }
  });

  // Show shortcut hint in toolbar tooltip on first load
  const firstRun = !localStorage.getItem('nr_shortcuts_shown');
  if (firstRun) {
    localStorage.setItem('nr_shortcuts_shown', '1');
    setTimeout(() => {
      const convertBtn = document.getElementById('tb-convert');
      if (convertBtn) {
        convertBtn.title = 'Convert This Page (Alt+C)';
      }
    }, 1000);
  }
})();

