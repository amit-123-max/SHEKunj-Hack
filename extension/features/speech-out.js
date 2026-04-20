// NeuroRead AI — speech-out.js
// Module 4: Text-to-Speech with sentence-level fluency + word-level cursor
// Speaks full sentences for fluency. Within each sentence, a chained timer
// advances the word highlight. Timer self-corrects at every sentence boundary.

(function () {
  "use strict";
  if (window.__NR_SPEECH_OUT_LOADED) return;
  window.__NR_SPEECH_OUT_LOADED = true;

  const STYLE_ID = "nr-speech-style";

  if (!document.getElementById(STYLE_ID)) {
    const styleEl = document.createElement("style");
    styleEl.id = STYLE_ID;
    styleEl.textContent = `
      .nr-reading-active {
        background-color: rgba(251, 191, 36, 0.10) !important;
        border-left: 3px solid #F59E0B !important;
        padding-left: 8px !important;
      }
      #nr-highlight-band {
        position: absolute;
        background: linear-gradient(135deg, rgba(124,58,237,0.22), rgba(109,40,217,0.22));
        border-radius: 4px;
        pointer-events: none;
        z-index: 99999;
        transition: top 0.15s ease-out, left 0.15s ease-out, width 0.15s ease-out, height 0.12s ease-out;
        box-shadow: 0 2px 12px rgba(124, 58, 237, 0.3);
        border: 2px solid #7C3AED;
      }
      .nr-word-done {
        opacity: 0.4;
        transition: opacity 0.25s ease;
      }
      .nr-word-center {
        background-color: rgba(124, 58, 237, 0.35) !important;
        color: inherit !important;
        border-radius: 3px;
        padding: 1px 2px;
      }
      .nr-word-span {
        transition: opacity 0.2s ease, background-color 0.12s ease;
      }
      #nr-read-from-here {
        position: absolute;
        z-index: 999999;
        background: linear-gradient(135deg, #7C3AED, #6D28D9);
        color: #fff;
        border: none;
        border-radius: 20px;
        padding: 6px 14px;
        font-size: 12px;
        font-weight: 600;
        font-family: 'Inter', system-ui, sans-serif;
        cursor: pointer;
        box-shadow: 0 4px 14px rgba(124, 58, 237, 0.5);
        display: none;
        white-space: nowrap;
        transition: opacity 0.15s ease, transform 0.15s ease;
      }
      #nr-read-from-here:hover {
        transform: scale(1.05);
      }
      #nr-stop-reading {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 999999;
        background: linear-gradient(135deg, #EF4444, #DC2626);
        color: #fff;
        border: none;
        border-radius: 28px;
        padding: 10px 20px;
        font-size: 13px;
        font-weight: 700;
        font-family: 'Inter', system-ui, sans-serif;
        cursor: pointer;
        box-shadow: 0 4px 18px rgba(239, 68, 68, 0.5);
        display: none;
        transition: transform 0.15s ease, box-shadow 0.15s ease;
      }
      #nr-stop-reading:hover {
        transform: scale(1.08);
        box-shadow: 0 6px 24px rgba(239, 68, 68, 0.6);
      }
    `;
    document.head.appendChild(styleEl);
  }

  let readableElements = [];
  let wordSpans = [];
  let stopRequested = false;
  let band = null;
  let wordTimer = null;
  let speechRate = 1.0;
  let contextBtn = null;
  let stopBtn = null;
  let selectedSentenceStart = -1; // for "read from here" mid-paragraph

  const WINDOW = 5; // total words in the highlight band
  const CONTEXT = 2; // words before and after the center word

  const MATH_SKIP_SEL = 'annotation, .mwe-math-mathml-a11y, .MathJax_Preview, style, script';

  // --- Utilities ---

  function getReadableElements() {
    const container = document.querySelector('article, main, .content, .mw-parser-output') || document.body;
    const candidates = Array.from(container.querySelectorAll('p, li, blockquote, dd'))
      .filter(el => {
        const text = el.innerText.trim();
        return text.length > 30 && el.offsetParent !== null && !el.closest('nav, footer, aside, .nav, .menu');
      });
    return candidates.filter(el => !candidates.some(p => p !== el && p.contains(el)));
  }

  function cleanLatexString(tex) {
    let s = tex;
    s = s.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '$1 over $2');
    s = s.replace(/\\sqrt\{([^}]*)\}/g, 'square root of $1');
    s = s.replace(/\\sum/g, 'sum'); s = s.replace(/\\int/g, 'integral');
    s = s.replace(/\\infty/g, 'infinity');
    s = s.replace(/\\(alpha|beta|gamma|delta|epsilon|theta|lambda|mu|sigma|pi|omega|phi|psi)/gi, '$1');
    s = s.replace(/\\(le|leq)/g, 'less than or equal to');
    s = s.replace(/\\(ge|geq)/g, 'greater than or equal to');
    s = s.replace(/\\neq/g, 'not equal to');
    s = s.replace(/\\times/g, 'times'); s = s.replace(/\\cdot/g, 'times');
    s = s.replace(/\\pm/g, 'plus or minus'); s = s.replace(/\\in\b/g, 'in');
    s = s.replace(/\\[a-zA-Z]+/g, ' ');
    s = s.replace(/[{}\\^_$]/g, ' ');
    s = s.replace(/\s+/g, ' ').trim();
    return (s.length <= 1 && !/[a-zA-Z0-9]/.test(s)) ? '' : s;
  }

  function cleanMathText(mathEl) {
    const alt = mathEl.querySelector('img[alt]');
    if (alt) return cleanLatexString(alt.getAttribute('alt'));
    const ann = mathEl.querySelector('annotation[encoding="application/x-tex"]');
    if (ann) return cleanLatexString(ann.textContent);
    return cleanLatexString(mathEl.innerText || '');
  }

  function shouldSkipNode(node) {
    let el = node.parentElement;
    while (el) {
      if (el.getAttribute && el.getAttribute('aria-hidden') === 'true') return true;
      try { if (el.matches && el.matches(MATH_SKIP_SEL)) return true; } catch(e) {}
      el = el.parentElement;
    }
    return false;
  }

  // --- Word wrapping ---

  function wrapWords(el) {
    const spans = [];
    const processedMath = new Set();

    el.querySelectorAll('.mwe-math-element, .katex, .MathJax, math').forEach(mathEl => {
      if (processedMath.has(mathEl)) return;
      processedMath.add(mathEl);
      const cleaned = cleanMathText(mathEl);
      if (!cleaned) return;
      const ph = document.createElement('span');
      ph.className = 'nr-math-replaced';
      ph.textContent = ' ' + cleaned + ' ';
      mathEl.style.display = 'none';
      mathEl.parentNode.insertBefore(ph, mathEl.nextSibling);
    });

    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) {
      if (shouldSkipNode(node)) continue;
      if (node.parentElement && node.parentElement.style && node.parentElement.style.display === 'none') continue;
      textNodes.push(node);
    }

    textNodes.forEach(textNode => {
      const parent = textNode.parentNode;
      const parts = textNode.nodeValue.split(/(\s+)/);
      const frag = document.createDocumentFragment();
      parts.forEach(part => {
        if (!part) return;
        if (/^\s+$/.test(part)) {
          frag.appendChild(document.createTextNode(part));
        } else {
          if (/^[\\{}^_$]+$/.test(part)) {
            frag.appendChild(document.createTextNode(part));
            return;
          }
          const span = document.createElement('span');
          span.textContent = part;
          span.className = 'nr-word-span';
          frag.appendChild(span);
          spans.push(span);
        }
      });
      parent.replaceChild(frag, textNode);
    });

    return spans;
  }

  function unwrapWords(el) {
    if (!el) return;
    el.querySelectorAll('.mwe-math-element, .katex, .MathJax, math').forEach(m => m.style.display = '');
    el.querySelectorAll('.nr-math-replaced').forEach(r => r.remove());
    el.querySelectorAll('.nr-word-span').forEach(s => {
      s.parentNode.replaceChild(document.createTextNode(s.textContent), s);
    });
    el.normalize();
  }

  // --- Highlight band ---

  function ensureBand() {
    if (!band) {
      band = document.createElement('div');
      band.id = 'nr-highlight-band';
      document.body.appendChild(band);
    }
    band.style.display = 'block';
  }

  function hideBand() { if (band) band.style.display = 'none'; }

  function positionBand(startSpan, endSpan) {
    ensureBand();
    const r1 = startSpan.getBoundingClientRect();
    const r2 = endSpan.getBoundingClientRect();
    band.style.top  = (Math.min(r1.top, r2.top) + window.scrollY - 2) + 'px';
    band.style.left = (r1.left + window.scrollX - 3) + 'px';
    band.style.width = (r2.right - r1.left + 6) + 'px';
    band.style.height = (Math.max(r1.bottom, r2.bottom) - Math.min(r1.top, r2.top) + 4) + 'px';
  }

  function clearTimers() {
    if (wordTimer) { clearTimeout(wordTimer); wordTimer = null; }
  }

  function clearHighlights() {
    clearTimers();
    hideBand();
    readableElements.forEach(el => {
      unwrapWords(el);
      el.classList.remove('nr-reading-active');
    });
    wordSpans = [];
  }

  // --- Highlight a word window ---

  function showWindow(globalIdx) {
    if (globalIdx >= wordSpans.length) { hideBand(); return; }

    // Dim past words (before the window start)
    const windowStart = Math.max(0, globalIdx - CONTEXT);
    const windowEnd = Math.min(wordSpans.length - 1, globalIdx + CONTEXT);

    for (let i = 0; i < windowStart; i++) {
      wordSpans[i].classList.add('nr-word-done');
      wordSpans[i].classList.remove('nr-word-center');
    }

    // Clip to same line from the center word
    const centerTop = wordSpans[globalIdx].getBoundingClientRect().top;
    let bandStart = windowStart;
    let bandEnd = windowEnd;

    // Clip start: only include words on same line
    for (let j = windowStart; j < globalIdx; j++) {
      if (Math.abs(wordSpans[j].getBoundingClientRect().top - centerTop) > 5) {
        bandStart = j + 1;
      }
    }
    // Clip end: only include words on same line
    for (let j = globalIdx + 1; j <= windowEnd; j++) {
      if (Math.abs(wordSpans[j].getBoundingClientRect().top - centerTop) > 5) {
        bandEnd = j - 1;
        break;
      }
    }

    // Remove done/center from visible window
    for (let j = bandStart; j <= bandEnd; j++) {
      wordSpans[j].classList.remove('nr-word-done');
      wordSpans[j].classList.remove('nr-word-center');
    }

    // Highlight the center word
    wordSpans[globalIdx].classList.add('nr-word-center');
    // Remove center from previous word if it's still tagged
    if (globalIdx > 0) wordSpans[globalIdx - 1].classList.remove('nr-word-center');

    positionBand(wordSpans[bandStart], wordSpans[bandEnd]);
  }

  // --- Sentence splitting ---

  function splitIntoSentences(spans) {
    // Group spans into sentences by detecting sentence-ending punctuation
    const sentences = [];
    let current = [];

    spans.forEach((span, idx) => {
      current.push(idx);
      const text = span.textContent;
      // End of sentence if word ends with . ! ? and is not a single letter abbreviation
      if (/[.!?]$/.test(text) && text.length > 2) {
        sentences.push([...current]);
        current = [];
      }
    });
    // Remaining words form the last sentence
    if (current.length > 0) sentences.push(current);

    return sentences;
  }

  // --- Stop reading button ---

  function showStopBtn() {
    if (!stopBtn) {
      stopBtn = document.createElement('button');
      stopBtn.id = 'nr-stop-reading';
      stopBtn.textContent = '⏹ Stop Reading';
      document.body.appendChild(stopBtn);
      stopBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.NR_SpeechOut.deactivate();
      });
    }
    stopBtn.style.display = 'block';
  }

  function hideStopBtn() {
    if (stopBtn) stopBtn.style.display = 'none';
  }

  // --- Core reading ---

  async function readParagraph(paraIndex, startFromSentence) {
    if (stopRequested || paraIndex >= readableElements.length) {
      clearHighlights();
      hideStopBtn();
      return;
    }

    showStopBtn();

    if (paraIndex > 0 && readableElements[paraIndex - 1]) {
      unwrapWords(readableElements[paraIndex - 1]);
      readableElements[paraIndex - 1].classList.remove('nr-reading-active');
    }

    const el = readableElements[paraIndex];
    el.classList.add('nr-reading-active');
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });

    wordSpans = wrapWords(el);
    if (wordSpans.length === 0) return readParagraph(paraIndex + 1);

    const sentences = splitIntoSentences(wordSpans);

    // Skip to the requested sentence if provided (for "read from here")
    const sentenceStart = (startFromSentence !== undefined && startFromSentence >= 0) ? startFromSentence : 0;

    // Dim all words before the start sentence
    if (sentenceStart > 0) {
      for (let si = 0; si < sentenceStart; si++) {
        sentences[si].forEach(i => wordSpans[i].classList.add('nr-word-done'));
      }
    }

    for (let si = sentenceStart; si < sentences.length; si++) {
      if (stopRequested) break;

      const sentenceIndices = sentences[si];
      const sentenceText = sentenceIndices.map(i => wordSpans[i].textContent).join(' ');

      // Show highlight at sentence start
      showWindow(sentenceIndices[0]);

      // Use word-count based timing: average ~350ms per word at rate 1.0
      const wordCount = sentenceIndices.length;
      const avgMsPerWord = 350 / speechRate;

      await new Promise((resolve) => {
        const u = new SpeechSynthesisUtterance(sentenceText);
        u.rate = speechRate;
        u.lang = "en-US";

        let boundaryDriven = false;

        u.onstart = () => {
          // Chained word timer fallback
          function advanceWord(localIdx) {
            if (stopRequested || boundaryDriven || localIdx >= sentenceIndices.length) return;

            showWindow(sentenceIndices[localIdx]);

            if (localIdx + 1 < sentenceIndices.length) {
              wordTimer = setTimeout(() => advanceWord(localIdx + 1), avgMsPerWord);
            }
          }

          // Small delay to let native boundaries prove themselves
          wordTimer = setTimeout(() => {
            if (!boundaryDriven) advanceWord(0);
          }, 100);
        };

        // If native boundary events work, use them for perfect sync
        u.onboundary = (e) => {
          if (e.name === 'word') {
            if (!boundaryDriven) {
              boundaryDriven = true;
              clearTimers();
            }

            let cum = 0;
            for (let i = 0; i < sentenceIndices.length; i++) {
              const wLen = wordSpans[sentenceIndices[i]].textContent.length;
              if (cum <= e.charIndex && e.charIndex < cum + wLen) {
                showWindow(sentenceIndices[i]);
                break;
              }
              cum += wLen + 1;
            }
          }
        };

        u.onend = () => {
          clearTimers();
          sentenceIndices.forEach(i => wordSpans[i].classList.add('nr-word-done'));
          resolve();
        };

        u.onerror = () => {
          clearTimers();
          resolve();
        };

        speechSynthesis.speak(u);
      });
    }

    // Done with this paragraph
    wordSpans.forEach(s => s.classList.add('nr-word-done'));
    hideBand();

    if (!stopRequested) {
      setTimeout(() => readParagraph(paraIndex + 1), 300);
    }
  }

  // --- Load speed from storage ---
  function loadSpeed() {
    chrome.storage.local.get('nrState', (res) => {
      if (res.nrState && res.nrState.typographyOverrides && res.nrState.typographyOverrides.readSpeed) {
        speechRate = parseFloat(res.nrState.typographyOverrides.readSpeed) || 1.0;
      }
    });
  }

  // Listen for live speed changes
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.nrState && changes.nrState.newValue && changes.nrState.newValue.typographyOverrides) {
      const rs = changes.nrState.newValue.typographyOverrides.readSpeed;
      if (rs) speechRate = parseFloat(rs) || 1.0;
    }
  });

  loadSpeed();

  // --- Universal Selection Menu ---

  function ensureContextBtn() {
    let menu = document.getElementById('nr-selection-menu');
    if (!menu) {
      menu = document.createElement('div');
      menu.id = 'nr-selection-menu';
      document.head.insertAdjacentHTML('beforeend', `<style>
        #nr-selection-menu {
          position: absolute;
          z-index: 2147483647;
          display: none;
          gap: 6px;
          background: #1E293B;
          padding: 4px;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          border: 1px solid rgba(255,255,255,0.1);
        }
        #nr-selection-menu button {
          background: transparent;
          border: none;
          color: #E2E8F0;
          font-family: inherit;
          font-size: 13px;
          padding: 6px 10px;
          cursor: pointer;
          border-radius: 4px;
          transition: background 0.2s;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        #nr-selection-menu button:hover {
          background: rgba(255,255,255,0.1);
        }
      </style>`);
      document.body.appendChild(menu);
    }

    if (!document.getElementById('nr-read-btn')) {
      const readBtn = document.createElement('button');
      readBtn.id = 'nr-read-btn';
      readBtn.textContent = '▶ Read';
      menu.appendChild(readBtn);

      readBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        menu.style.display = 'none';

        const sel = window.getSelection();
        if (!sel.anchorNode) return;

        // Find which paragraph contains the selection
        let target = sel.anchorNode;
        if (target.nodeType === 3) target = target.parentElement;
        const para = target.closest('p, li, blockquote, dd');
        if (!para) return;

        // Remember selected text to find the sentence later
        const selectedText = sel.toString().trim().substring(0, 40);

        // Collect all readable elements and find the index
        readableElements = getReadableElements();
        let startIdx = readableElements.indexOf(para);
        if (startIdx === -1) {
          for (let i = 0; i < readableElements.length; i++) {
            if (readableElements[i].contains(para) || para.contains(readableElements[i])) {
              startIdx = i;
              break;
            }
          }
        }
        if (startIdx === -1) startIdx = 0;

        sel.removeAllRanges();
        speechSynthesis.cancel();
        stopRequested = false;

        // Find which sentence in the paragraph contains the selected text
        const el = readableElements[startIdx];
        const fullText = el.innerText || '';
        const selPos = fullText.indexOf(selectedText);

        // We need to figure out which sentence index this falls in
        // Temporarily wrap to find sentence boundaries, then count
        const tmpSpans = wrapWords(el);
        const tmpSentences = splitIntoSentences(tmpSpans);
        let sentenceIdx = 0;

        if (selPos > 0 && tmpSentences.length > 1) {
          // Walk through sentences and find which one contains the selection position
          let charCum = 0;
          for (let si = 0; si < tmpSentences.length; si++) {
            const sentLen = tmpSentences[si].reduce((sum, i) => sum + tmpSpans[i].textContent.length + 1, 0);
            if (charCum + sentLen > selPos) {
              sentenceIdx = si;
              break;
            }
            charCum += sentLen;
          }
        }

        // Unwrap before readParagraph wraps again
        unwrapWords(el);

        readParagraph(startIdx, sentenceIdx);
      });
    }
  }

  document.addEventListener('mouseup', () => {
    setTimeout(() => {
      const sel = window.getSelection();
      const text = sel.toString().trim();

      if (text.length > 2) {
        ensureContextBtn();
        const menu = document.getElementById('nr-selection-menu');
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        menu.style.display = 'flex';
        menu.style.top = (rect.top + window.scrollY - menu.offsetHeight - 8) + 'px';
        menu.style.left = (rect.left + window.scrollX) + 'px';
      } else {
        const menu = document.getElementById('nr-selection-menu');
        if (menu) menu.style.display = 'none';
      }
    }, 10);
  });

  document.addEventListener('mousedown', (e) => {
    const menu = document.getElementById('nr-selection-menu');
    if (menu && !menu.contains(e.target)) {
      menu.style.display = 'none';
    }
  });

  // Public API
  window.NR_SpeechOut = {
    activate: function () {
      loadSpeed();
      readableElements = getReadableElements();
      if (readableElements.length === 0) {
        return { success: false, error: "No readable content found." };
      }
      speechSynthesis.cancel();
      stopRequested = false;
      readParagraph(0);
      return { success: true };
    },

    deactivate: function () {
      stopRequested = true;
      speechSynthesis.cancel();
      clearHighlights();
      readableElements = [];
      if (contextBtn) contextBtn.style.display = 'none';
      hideStopBtn();
      return { success: true };
    },

    pause: function () {
      stopRequested = true;
      speechSynthesis.cancel();
    }
  };
})();
