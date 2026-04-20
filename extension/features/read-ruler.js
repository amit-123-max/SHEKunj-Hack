// NeuroRead AI — read-ruler.js
// Module 6: Reading Ruler
// Adds a horizontal focus bar that tracks the user's cursor to assist line-by-line reading.

(function () {
  "use strict";
  if (window.__NR_READ_RULER_LOADED) return;
  window.__NR_READ_RULER_LOADED = true;

  const RULER_ID = "nr-read-ruler";
  let isActive = false;

  function injectRuler() {
    if (document.getElementById(RULER_ID)) return;
    const ruler = document.createElement("div");
    ruler.id = RULER_ID;
    
    // Create a horizontal transparent slot with a massive dark shadow 
    // to dim the rest of the page, simulating a reading highlight mask.
    Object.assign(ruler.style, {
      position: "fixed",
      left: "0",
      right: "0",
      height: "120px",  // Height of the clear reading area
      backgroundColor: "transparent",
      boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.65)", // Dims everything outside the ruler
      borderTop: "1px solid rgba(255, 255, 255, 0.1)", // Subtle edge
      borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
      pointerEvents: "none", // Let clicks pass through
      zIndex: "2147483647", // Max z-index
      display: "none",
      transform: "translateY(-50%)", // Center vertically on cursor
      transition: "opacity 0.15s ease"
    });
    document.body.appendChild(ruler);
  }

  function onMouseMove(e) {
    if (!isActive) return;
    const ruler = document.getElementById(RULER_ID);
    if (ruler) {
      if (ruler.style.display === "none") {
        ruler.style.display = "block";
      }
      // Follow the Y position of the mouse relative to the viewport
      ruler.style.top = e.clientY + "px";
    }
  }

  function onMouseLeave() {
    // Hide ruler when cursor leaves window to avoid ghost ruler
    if (!isActive) return;
    const ruler = document.getElementById(RULER_ID);
    if (ruler) ruler.style.display = "none";
  }

  function onMouseEnter() {
      if (!isActive) return;
      const ruler = document.getElementById(RULER_ID);
      if (ruler) ruler.style.display = "block";
  }

  window.NR_ReadRuler = {
    activate: function() {
      isActive = true;
      injectRuler();
      document.addEventListener("mousemove", onMouseMove, { passive: true });
      document.addEventListener("mouseleave", onMouseLeave, { passive: true });
      document.addEventListener("mouseenter", onMouseEnter, { passive: true });
      return { success: true };
    },
    deactivate: function() {
      isActive = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseleave", onMouseLeave);
      document.removeEventListener("mouseenter", onMouseEnter);
      const ruler = document.getElementById(RULER_ID);
      if (ruler) {
        ruler.style.display = "none";
      }
      return { success: true };
    }
  };
})();
