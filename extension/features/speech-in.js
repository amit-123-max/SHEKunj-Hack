// NeuroRead AI — speech-in.js
// Voice Command Input — Web Speech API edition
//
// Architecture (no Whisper, no audio upload):
//   1. SpeechRecognition (Chrome built-in) — instant, free, works offline
//   2. Local fast keyword matcher — resolves ~95% of commands in <1ms
//   3. Backend /voice-intent — only called when local match fails (complex commands)
//
// This completely eliminates the Groq Whisper bottleneck.

(function () {
  "use strict";
  if (window.__NR_SPEECH_IN_LOADED) return;
  window.__NR_SPEECH_IN_LOADED = true;

  const INTENT_API = "http://localhost:8000/voice-intent";

  // ─── Browser Speech Recognition setup ─────────────────────────────────────
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  // ─── Local fast keyword matcher ──────────────────────────────────────────
  // Same rules as backend fast_match_intent — resolves instantly, no network.
  const FAST_FEATURE_MAP = [
    // stop MUST come before read (substring collision)
    { keys: ["stop reading", "stop", "be quiet", "quiet", "shut up", "silence", "pause reading", "pause"], name: "stop" },
    // ruler MUST come before read (reading ruler)
    { keys: ["reading ruler", "ruler", "line guide", "focus line", "read ruler"], name: "ruler" },
    // read
    { keys: ["read aloud", "read this", "read it", "read out", "read the page", "read", "text to speech", "listen", "speak aloud"], name: "read" },
    // simplify
    { keys: ["simplify", "simpler", "easier to read", "explain this", "make it simple", "make it easier"], name: "simplify" },
    // formatting
    { keys: ["format", "formatting", "font", "layout", "readable", "fix the layout", "change font", "make it readable"], name: "formatting" },
    // focus
    { keys: ["focus mode", "hide distractions", "clean the page", "reader mode", "distraction", "focus"], name: "focus" },
    // toc
    { keys: ["table of contents", "toc", "contents", "show menu", "navigation", "outline"], name: "toc" },
    // undo — most specific phrases first
    { keys: ["turn everything off", "remove all", "turn off everything", "undo everything", "reset everything", "turn off", "deactivate", "undo", "reset", "revert", "go back", "disable"], name: "undo" },
  ];

  const FAST_SCROLL_MAP = [
    { keys: ["scroll down", "go down", "page down", "move down", "scroll forward", "next page"], action: { method: "scrollBy", selector: null, args: { top: 500, behavior: "smooth" } } },
    { keys: ["scroll up", "go up", "page up", "move up", "scroll back", "back up"],             action: { method: "scrollBy", selector: null, args: { top: -500, behavior: "smooth" } } },
    { keys: ["go to top", "top of page", "top of the page", "beginning", "start of page"],       action: { method: "scrollTo",  selector: null, args: { top: 0,     behavior: "smooth" } } },
    { keys: ["go to bottom", "bottom of page", "end of page", "end of the page"],                action: { method: "scrollTo",  selector: null, args: { top: 99999, behavior: "smooth" } } },
  ];

  function localFastMatch(text) {
    const t = text.toLowerCase().trim();

    for (const { keys, name } of FAST_FEATURE_MAP) {
      for (const kw of keys) {
        if (t.includes(kw)) {
          console.log(`[NeuroRead/Voice] ⚡ Local match: "${kw}" → feature:${name}`);
          return { action_type: "feature", feature_name: name, dom_action: null, speak_message: null };
        }
      }
    }

    for (const { keys, action } of FAST_SCROLL_MAP) {
      for (const kw of keys) {
        if (t.includes(kw)) {
          console.log(`[NeuroRead/Voice] ⚡ Local match: "${kw}" → dom_manipulation`);
          return { action_type: "dom_manipulation", feature_name: null, dom_action: action, speak_message: null };
        }
      }
    }

    return null; // no local match — fall through to backend
  }

  // ─── Feature dispatch map ─────────────────────────────────────────────────
  const NATIVE_FEATURES = {
    formatting: () => window.NR_Formatting   && window.NR_Formatting.activate(),
    simplify:   () => window.NR_AiText       && window.NR_AiText.activate(),
    read:       () => window.NR_SpeechOut    && window.NR_SpeechOut.activate(),
    stop:       () => window.NR_SpeechOut    && window.NR_SpeechOut.deactivate(),
    focus:      () => window.NR_FocusMode    && window.NR_FocusMode.activate(),
    ruler:      () => window.NR_ReadRuler    && window.NR_ReadRuler.activate(),
    toc:        () => window.NR_Visual       && window.NR_Visual.activate(),
    undo:       () => {
      window.NR_Formatting  && window.NR_Formatting.deactivate();
      window.NR_AiText      && window.NR_AiText.deactivate();
      window.NR_FocusMode   && window.NR_FocusMode.deactivate();
      window.NR_ReadRuler   && window.NR_ReadRuler.deactivate();
      window.NR_Visual      && window.NR_Visual.deactivate();
      window.NR_SpeechOut   && window.NR_SpeechOut.deactivate(); // ← fix: stop TTS on undo
    },
  };

  // ─── Mic button helpers ───────────────────────────────────────────────────
  const getMicBtn  = () => document.getElementById("tb-mic");

  function setMicLabel(text) {
    const btn = getMicBtn();
    const lbl = btn?.querySelector("span:last-child");
    if (lbl) lbl.textContent = text;
  }

  function setMicRecording(on) {
    const btn = getMicBtn();
    if (!btn) return;
    btn.classList.toggle("nr-recording", on);
    btn.classList.toggle("nr-active",    on);
    btn.setAttribute("aria-pressed", String(on));
    chrome.storage.local.get("nrState", (res) => {
      const state = res.nrState || {};
      state.mic = on;
      chrome.storage.local.set({ nrState: state });
    });
    if (!on) setMicLabel("Voice");
  }

  // ─── Speech synthesis feedback ────────────────────────────────────────────
  function speak(text) {
    if (!("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US"; u.rate = 1.0; u.pitch = 1.05;
    speechSynthesis.speak(u);
  }

  // ─── Intent execution ─────────────────────────────────────────────────────
  function executeIntent(intent) {
    if (!intent?.action_type) {
      speak("I didn't understand that command.");
      return;
    }

    if (intent.action_type === "feature" && intent.feature_name) {
      const fn = NATIVE_FEATURES[intent.feature_name];
      if (fn) {
        fn();
        speak(intent.feature_name + " activated.");
      } else {
        speak("I don't recognize that feature.");
      }
      return;
    }

    if (intent.action_type === "dom_manipulation" && intent.dom_action) {
      try {
        const { method, selector, args } = intent.dom_action;
        const target = selector ? document.querySelector(selector) : window;
        if (!target) { speak("I couldn't find that element."); return; }
        if (typeof target[method] !== "function") throw new Error(`No method: ${method}`);
        args && Object.keys(args).length > 0 ? target[method](args) : target[method]();
        if (method === "scrollBy" || method === "scrollTo") speak("Done.");
      } catch (e) {
        console.error("[NeuroRead/Voice] DOM error:", e);
        speak("I had trouble doing that on this page.");
      }
      return;
    }

    if (intent.action_type === "speak" && intent.speak_message) {
      speak(intent.speak_message);
      return;
    }

    speak("I heard you but didn't know what to do. Try: simplify, read, focus, or undo.");
  }

  // ─── Backend fallback (text only — no audio upload) ──────────────────────
  async function fetchIntentFromBackend(transcription) {
    try {
      const res = await fetch(INTENT_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcription }),
        signal: AbortSignal.timeout(10000), // 10s ceiling for text-only call
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data?.intent || null;
    } catch (e) {
      console.error("[NeuroRead/Voice] Backend intent error:", e.message);
      return null;
    }
  }

  // ─── Process transcription → intent → execute ──────────────────────
  async function processTranscription(text) {
    console.log(`%c🎤 Heard: "${text}"`, "background:#DC2626;color:white;padding:4px 8px;border-radius:4px");

    // 1. Local fast match (instant)
    let intent = localFastMatch(text);

    // 2. Backend /voice-intent fallback for complex/ambiguous commands
    if (!intent) {
      console.log("[NeuroRead/Voice] No local match — asking backend…");
      setMicLabel("Thinking…");
      intent = await fetchIntentFromBackend(text);
    }

    // 3. Agent act escalation: if backend couldn't resolve it either,
    //    route through the full /agent/act loop with page context.
    if (!intent || intent.action_type === "speak") {
      if (window.NR_AgentClient && window.NR_AgentClient.runAgentAct) {
        console.log("[NeuroRead/Voice] Escalating to /agent/act with full context…");
        setMicRecording(false);
        await window.NR_AgentClient.runAgentAct(text, "", "");
        return;
      }
    }

    setMicRecording(false);

    if (!intent) {
      speak("I heard you but couldn't figure out what to do. Try: simplify, read, focus, or undo.");
      return;
    }

    console.log(`%c🤖 Intent: ${intent.action_type} / ${intent.feature_name || "—"}`,
      "background:#059669;color:white;padding:4px 8px;border-radius:4px", intent);

    executeIntent(intent);
  }

  // ─── Core: SpeechRecognition ──────────────────────────────────────────────
  let recognition = null;
  let isListening = false;

  async function startRecording() {
    if (isListening) {
      console.log("[NeuroRead/Voice] Already listening — ignoring.");
      return { success: false, error: "already_listening" };
    }

    if (!SpeechRecognition) {
      speak("Your browser does not support voice recognition. Please use Chrome.");
      setMicRecording(false);
      return { success: false, error: "unsupported_browser" };
    }

    try {
      // Probe mic permission so the user gets the Chrome permission prompt
      // (SpeechRecognition implicitly uses the mic, but this makes intent clear)
      await navigator.mediaDevices.getUserMedia({ audio: true })
        .then(s => s.getTracks().forEach(t => t.stop()))  // just probe, don't record
        .catch(() => {}); // ignore — SpeechRecognition has its own permission flow
    } catch (_) {}

    recognition = new SpeechRecognition();
    recognition.lang            = "en-US";
    recognition.continuous      = false;
    recognition.interimResults  = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      isListening = true;
      setMicRecording(true);
      setMicLabel("Listening…");
      console.log("[NeuroRead/Voice] 🎙️ Listening…");
    };

    recognition.onresult = async (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      const confidence = event.results[0]?.[0]?.confidence ?? 1;
      console.log(`[NeuroRead/Voice] SpeechRecognition result: "${transcript}" (confidence: ${(confidence * 100).toFixed(0)}%)`);

      if (!transcript) {
        setMicRecording(false);
        speak("I didn't catch that — please try again.");
        return;
      }

      setMicLabel("Processing…");
      await processTranscription(transcript);
    };

    recognition.onerror = (event) => {
      isListening = false;
      setMicRecording(false);
      console.error("[NeuroRead/Voice] SpeechRecognition error:", event.error);

      const errorMessages = {
        "not-allowed":     "Microphone access was denied. Please allow it in your browser settings.",
        "no-speech":       "I didn't hear anything. Please try again.",
        "network":         "Network error during recognition. Please check your connection.",
        "service-not-allowed": "Speech recognition is not allowed on this page.",
        "audio-capture":   "No microphone detected. Please connect a microphone.",
      };

      speak(errorMessages[event.error] || "Voice recognition error. Please try again.");
    };

    recognition.onend = () => {
      isListening = false;
      // Note: setMicRecording(false) is called in onresult/onerror,
      // or here if recognition ended without either (e.g. timeout/abort)
      const btn = getMicBtn();
      if (btn?.classList.contains("nr-recording")) {
        setMicRecording(false);
        // onend fired without a result — silent timeout
        speak("I didn't hear anything. Please try again.");
      }
      recognition = null;
    };

    try {
      recognition.start();
      return { success: true };
    } catch (e) {
      console.error("[NeuroRead/Voice] recognition.start() failed:", e);
      isListening = false;
      setMicRecording(false);
      speak("Could not start voice recognition. Please try again.");
      return { success: false, error: e.message };
    }
  }

  function stopRecording() {
    if (recognition) {
      try { recognition.stop(); } catch (_) {}
    }
    isListening = false;
    setMicRecording(false);
  }

  // ─── Public API ───────────────────────────────────────────────────────────
  window.NR_SpeechIn = {
    activate:   startRecording,
    deactivate: stopRecording,
  };

})();
