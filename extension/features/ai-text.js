// NeuroRead AI — ai-text.js
// Module 3: AI Text Simplification
// Harvests text blocks and replaces them with simplified chunks from Llama 3 via Groq.

(function () {
  "use strict";
  if (window.__NR_AI_TEXT_LOADED) return;
  window.__NR_AI_TEXT_LOADED = true;

  const API = "http://localhost:8000/simplify";
  const MIN_LENGTH = 80;    // Don't simplify very short fragments
  const BATCH_SIZE = 10;    // Max chunks per API call

  // CSS for simplified text indication
  const styleEl = document.createElement("style");
  styleEl.textContent = `
    .nr-simplifying {
      opacity: 0.6;
      border-left: 4px solid #A78BFA;
      padding-left: 12px;
      background: linear-gradient(90deg, rgba(124, 58, 237, 0.1) 0%, transparent 100%);
      transition: all 0.3s ease;
      position: relative;
    }
    .nr-simplifying::after {
      content: "⏳ Simplifying...";
      position: absolute;
      top: -8px;
      right: 0;
      font-size: 11px;
      color: #7C3AED;
      background: #fff;
      padding: 2px 6px;
      border-radius: 4px;
      border: 1px solid #A78BFA;
      font-weight: bold;
    }
    .nr-simplified {
      transition: all 0.5s ease;
      border-left: 4px solid #10B981;
      padding-left: 12px;
    }
  `;
  document.head.appendChild(styleEl);

  /**
   * Finds all eligible text containers within the main content area.
   */
  function findTextNodes() {
    // Target main article areas, fallback to body
    const container = document.querySelector('article, main, .content, .mw-parser-output') || document.body;

    // We target common block elements that contain reading text
    const candidates = Array.from(container.querySelectorAll('p, li, blockquote, dd'));

    // Filter by length and visibility
    return candidates.filter(el => {
      const text = el.innerText.trim();
      return text.length >= MIN_LENGTH &&
        el.offsetParent !== null &&
        !el.closest('nav, footer, aside, .nav, .menu');
    });
  }

  async function processBatch(nodes) {
    const textChunks = nodes.map(n => n.innerText.trim());

    // Mark as loading
    nodes.forEach(n => n.classList.add('nr-simplifying'));

    return new Promise((resolve) => {
      if (!window.NR_Utils) return resolve(false);
      window.NR_Utils.safeSend({
        type: "FETCH",
        url: API,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: { text_chunks: textChunks }
      }).then((res) => {
        if (!res || !res.ok) {
          console.error("[NeuroRead/AI] Batch failed:", res?.error || "Unknown error");
          nodes.forEach(n => n.classList.remove('nr-simplifying'));
          return resolve(false);
        }

        const simplifiedChunks = res.data.simplified_chunks;

        nodes.forEach((node, i) => {
          node.classList.remove('nr-simplifying');
          if (simplifiedChunks[i]) {
            // Store original if not already stored
            if (!node.dataset.nrOriginal) {
              node.dataset.nrOriginal = node.innerHTML;
            }

            // Replace content. Note: Using innerHTML here because the AI 
            // might return markdown bullets (-) which we can convert 
            // or just wrap in a div. For simplicity, we'll convert 
            // the simplified text to basic HTML if it contains bullets.
            let text = simplifiedChunks[i];
            
            let lines = text.split('\n');
            let htmlLines = [];
            let hasBullets = false;
            
            for (let line of lines) {
              let trimmed = line.trim();
              // Match standard markdown bullets or literal bullet points
              let match = trimmed.match(/^[\-\*\•]\s+(.*)/);
              if (match) {
                hasBullets = true;
                htmlLines.push(`<li>${match[1]}</li>`);
              } else if (trimmed.length > 0) {
                htmlLines.push(trimmed);
              }
            }

            if (hasBullets) {
              if (node.tagName.toLowerCase() === 'li') {
                // Don't inject nested lists inside existing list items, 
                // and avoid duplicate bullet characters!
                text = htmlLines.map(l => {
                  const m = l.match(/^<li>(.*)<\/li>$/);
                  return m ? m[1] : l;
                }).join('<br><br>');
              } else {
                // Wrap everything inside a UL, protecting non-li elements in paragraphs
                let body = htmlLines.map(l => l.startsWith('<li>') ? l : `<p>${l}</p>`).join('');
                text = `<ul>${body}</ul>`;
              }
            }

            node.innerHTML = text;
            node.classList.add('nr-simplified');
          }
        });
        resolve(true);
      });
    });
  }

  window.NR_AiText = {
    activate: async function () {
      const nodes = findTextNodes();
      if (nodes.length === 0) {
        return { success: false, error: "No readable content found." };
      }

      console.log(`[NeuroRead/AI] Found ${nodes.length} nodes to simplify. Processing in background...`);

      // Process in batches (fire-and-forget)
      (async () => {
        for (let i = 0; i < nodes.length; i += BATCH_SIZE) {
          const batch = nodes.slice(i, i + BATCH_SIZE);
          await processBatch(batch);
        }
        console.log(`[NeuroRead/AI] Simplification complete.`);
      })();

      return { success: true, count: nodes.length };
    },

    deactivate: function () {
      const nodes = document.querySelectorAll('[data-nr-original]');
      nodes.forEach(node => {
        node.innerHTML = node.dataset.nrOriginal;
        node.classList.remove('nr-simplified');
        // Clean up dataset
        delete node.dataset.nrOriginal;
      });
      console.log("[NeuroRead/AI] Originals restored.");
    }
  };
})();
