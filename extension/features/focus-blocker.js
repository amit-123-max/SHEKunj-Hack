// NeuroRead AI — focus-blocker.js
// Module 2: Focus & Ad-Block System
// Hides DOM-based ad overlays, popups, and automatically stops autoplaying media.

(function () {
  "use strict";
  if (window.__NR_FOCUSBLOCK_LOADED) return;
  window.__NR_FOCUSBLOCK_LOADED = true;

  const STYLE_ID = "nr-focusblock-style";
  let observer = null;

  // Broad CSS selection for common ad containers and annoying sticky popups
  function injectHidingCSS() {
    removeStyles();
    
    const css = `
      /* Common Ad Containers */
      .ad, .ads, .advertisement, .ad-container, .ad-slot, .ad-banner,
      [id^="div-gpt-ad-"], [class*="google_ads"], [id^="google_ads"],
      [id^="taboola-"], [class*="taboola"], [class*="outbrain"],
      [id^="outbrain"], iframe[name^="google_ads"],
      /* Cookie & Newsletter Popups */
      [class*="cookie-banner"], [id*="cookie-banner"], [class*="newsletter"], 
      [id*="newsletter"], [class*="popup-overlay"], .fc-consent-root,
      #onetrust-consent-sdk, .cc-window, .qc-cmp2-container
      {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
    `;

    const el = document.createElement("style");
    el.id = STYLE_ID;
    el.textContent = css;
    document.head.appendChild(el);
  }

  function removeStyles() {
    const existing = document.getElementById(STYLE_ID);
    if (existing) existing.remove();
  }

  const SCRIPT_ID = "nr-main-world-hook";

  // The Ultimate Two-Pronged Autoplay Blocker
  function stopAutoplay() {
    
    // PRONG 1: Hook the main world's video.play() to block programmatic autoplay (e.g. CNN on-scroll videos)
    // We use navigator.userActivation to accurately determine if the user actually clicked to play.
    if (!document.getElementById(SCRIPT_ID)) {
      const script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.textContent = `
        (function() {
          const originalPlay = HTMLMediaElement.prototype.play;
          HTMLMediaElement.prototype.play = function() {
            // navigator.userActivation.isActive is true only if the user clicked/typed recently (within ~5 secs).
            // Scrolling does NOT activate it. This completely annihilates on-scroll ad players!
            if (!navigator.userActivation.isActive && !navigator.userActivation.hasBeenActive) {
              console.log("[NeuroRead/Autoplay] Blocked JS-initiated autoplay. User didn't click.");
              this.pause();
              // Prevent audio blasting
              this.muted = true; 
              return Promise.reject(new DOMException("Autoplay blocked by NeuroRead AI.", "NotAllowedError"));
            }
            return originalPlay.apply(this, arguments);
          };
        })();
      `;
      (document.head || document.documentElement).appendChild(script);
    }

    // PRONG 2: Strip native HTML attributes to block browser-native autoplay
    const haltNode = (node) => {
      if (node.tagName === 'VIDEO' || node.tagName === 'AUDIO') {
        if (node.hasAttribute('autoplay')) node.removeAttribute('autoplay');
        if (!node.paused) node.pause();
      }
    };

    // Strip existing media
    document.querySelectorAll('video, audio').forEach(haltNode);

    // Watch for newly injected media (React/Vue/Ad Scripts dynamically injecting <video>)
    if (!observer) {
      observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (m.addedNodes) {
            for (const n of m.addedNodes) {
              haltNode(n);
              if (n.querySelectorAll) {
                n.querySelectorAll('video, audio').forEach(haltNode);
              }
            }
          }
          // Catch scripts manually trying to set the autoplay attribute
          if (m.type === 'attributes' && m.attributeName === 'autoplay') {
             haltNode(m.target);
          }
        }
      });

      observer.observe(document.body || document.documentElement, { 
        childList: true, 
        subtree: true,
        attributes: true,
        attributeFilter: ['autoplay']
      });
    }
  }

  function allowAutoplay() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    const hook = document.getElementById(SCRIPT_ID);
    if (hook) hook.remove();
  }

  function enableNetworkBlocking() {
    if (window.NR_Utils) window.NR_Utils.safeSend({ type: "TOGGLE_AD_RULES", enable: true });
  }

  function disableNetworkBlocking() {
    if (window.NR_Utils) window.NR_Utils.safeSend({ type: "TOGGLE_AD_RULES", enable: false });
  }

  // Public API exposed to popup
  window.NR_FocusBlock = {
    activate: async function () {
      console.log("[NeuroRead] Activating Focus & Ad Blocker...");
      injectHidingCSS();
      stopAutoplay();
      if (window.NR_Utils) {
        await window.NR_Utils.safeSend({ type: "TOGGLE_AD_RULES", enable: true });
      }
      return { success: true };
    },
    deactivate: async function () {
      console.log("[NeuroRead] Deactivating Focus & Ad Blocker...");
      removeStyles();
      allowAutoplay();
      if (window.NR_Utils) {
        await window.NR_Utils.safeSend({ type: "TOGGLE_AD_RULES", enable: false });
      }
      return { success: true };
    },
  };

})();
