"""
NeuroRead AI — voice.py
Two endpoints:
  POST /voice-intent  — lightweight: accepts transcribed text, returns intent (fast path)
  POST /voice         — heavy: accepts raw audio, transcribes with Whisper, returns intent (fallback)
"""
import asyncio
import time
from fastapi import APIRouter, File, UploadFile
from pydantic import BaseModel

router = APIRouter()

TRANSCRIPTION_TIMEOUT = 30   # seconds — Whisper cold start can be very slow
INTENT_TIMEOUT        = 8    # seconds


# ─── /voice-intent — Fast text-only endpoint ─────────────────────────────────

class VoiceIntentRequest(BaseModel):
    transcription: str


@router.post("/voice-intent")
async def voice_intent_from_text(req: VoiceIntentRequest):
    """
    Accept browser-transcribed text and return a structured intent.
    This is the PRIMARY endpoint. No Whisper call — instant response.
    """
    t_start = time.perf_counter()
    text = (req.transcription or "").strip()

    if not text:
        return _fail("empty_text", "No transcription received.")

    print(f'[voice-intent] Received: "{text}"')

    from app.services.voice_intent import parse_intent
    try:
        intent = await asyncio.wait_for(
            asyncio.to_thread(parse_intent, text),
            timeout=INTENT_TIMEOUT,
        )
    except asyncio.TimeoutError:
        print(f"[voice-intent] Intent TIMEOUT after {_ms(t_start)}ms")
        intent = _speak_intent("I heard you but couldn't process it in time. Try again.")
    except Exception as e:
        print(f"[voice-intent] Intent ERROR: {e}")
        intent = _speak_intent("I heard you but couldn't understand that command.")

    print(f'[voice-intent] ✅ {_ms(t_start)}ms | action={intent.get("action_type")} feature={intent.get("feature_name")}')

    return {
        "success":       True,
        "transcription": text,
        "intent":        intent,
    }


# ─── /voice — Heavy audio endpoint (Whisper fallback) ────────────────────────

@router.post("/voice")
async def voice_transcribe(audio: UploadFile = File(...)):
    """
    Accept raw .webm audio, transcribe with Groq Whisper, parse intent.
    FALLBACK only — use /voice-intent when transcription is already available.
    """
    t_start = time.perf_counter()

    try:
        audio_bytes = await audio.read()
    except Exception as e:
        print(f"[voice] Failed to read audio: {e}")
        return _fail("audio_read_failed", "Audio upload failed. Please try again.")

    if not audio_bytes:
        return _fail("empty_audio", "No audio was recorded. Please try speaking again.")

    print(f"[voice] Received {len(audio_bytes):,} bytes | t=0ms")

    from app.services.voice_transcriber import transcribe_audio
    t_tr = time.perf_counter()
    try:
        transcription = await asyncio.wait_for(
            asyncio.to_thread(transcribe_audio, audio_bytes, audio.filename or "recording.webm"),
            timeout=TRANSCRIPTION_TIMEOUT,
        )
    except asyncio.TimeoutError:
        print(f"[voice] Transcription TIMEOUT after {_ms(t_start)}ms")
        return _fail("transcription_timeout", "Transcription took too long. Please try again.")
    except Exception as e:
        print(f"[voice] Transcription ERROR ({_ms(t_start)}ms): {e}")
        return _fail("transcription_failed", "Could not transcribe your voice.")

    if not transcription or not transcription.strip():
        return _fail("empty_transcription", "I didn't catch that. Please speak clearly and try again.")

    print(f'[voice] Transcribed ({_ms(t_tr)}ms): "{transcription}"')

    from app.services.voice_intent import parse_intent
    t_int = time.perf_counter()
    try:
        intent = await asyncio.wait_for(
            asyncio.to_thread(parse_intent, transcription),
            timeout=INTENT_TIMEOUT,
        )
    except Exception:
        intent = _speak_intent("I heard you but couldn't understand the command.")

    print(f"[voice] ✅ transcription={_ms(t_tr)}ms | intent={_ms(t_int)}ms | total={_ms(t_start)}ms")

    return {"success": True, "transcription": transcription, "intent": intent}


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _ms(t: float) -> int:
    return int((time.perf_counter() - t) * 1000)

def _speak_intent(msg: str) -> dict:
    return {"action_type": "speak", "speak_message": msg, "feature_name": None, "dom_action": None}

def _fail(error: str, message: str) -> dict:
    return {"success": False, "transcription": "", "intent": _speak_intent(message), "error": error}
