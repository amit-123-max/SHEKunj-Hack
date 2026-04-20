from app.core.config import get_groq_client, retry_llm_call, _active_pool
from app.core.model_pool import model_pool_manager

def transcribe_audio(audio_bytes: bytes, filename: str = "recording.webm") -> str:
    """
    Takes raw audio bytes and uses Groq Whisper to transcribe them.
    Wrapped with Tenacity for automatic model rotation on rate limits.
    """
    # Set the active pool so Tenacity's trigger_rotation targets audio_pool
    _active_pool.set("audio_pool")
    try:
        return _transcribe_with_retry(audio_bytes, filename)
    except Exception as e:
        print(f"[Voice Transcriber] Fatal Error after retries: {e}")
        return ""

@retry_llm_call
def _transcribe_with_retry(audio_bytes: bytes, filename: str = "recording.webm") -> str:
    client = get_groq_client()
    model = model_pool_manager.get_current_model("audio_pool")
    
    if not model:
        raise Exception("All audio models are currently rate-limited.")
    
    print(f"[Voice Transcriber] 🎯 Using model: {model}")
    
    transcription = client.audio.transcriptions.create(
        file=(filename, audio_bytes),
        model=model,
        response_format="text",
        language="en",
        temperature=0.0,
    )
    result = transcription.strip() if isinstance(transcription, str) else transcription.text.strip()
    
    # Whisper often hallucinates these phrases on silence/background noise
    hallucinations = [
        "thank you.", "thank you", "thanks for watching.", "thanks for watching!",
        "please subscribe.", "subscribe.", "you", "bye."
    ]
    if result.lower() in hallucinations:
        return ""
        
    return result
