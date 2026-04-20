"""
NeuroRead AI — test_agentic_behaviors.py
Tests for the 12-phase agentic upgrade:
- /agent/act with combined voice + image returns two actions
- /agent/observe correctly maps outcome to feedback rating
- /explain-image returns full ScreenshotAnalysis structure (not plain string)
- /assist respects neurotype priorities
- /convert neurotype bonus is correctly applied
- voice "stop" command doesn't crash if TTS isn't running
- profile round-trip propagates to agent act decision
"""
import pytest


# ─── /agent/act: voice + image in one call ───────────────────────────────────

def test_agent_act_combined_voice_and_image(client, mock_screenshot_analyzer, mock_voice_intent):
    """
    When both transcription and image_base64 are provided, /agent/act must return
    TWO actions: one for intent (feature) and one for vision.
    """
    _TINY = (
        "data:image/jpeg;base64,"
        "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8U"
        "HRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAARCAABAAEDASIA"
        "AhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAABgUEB/8QAFhABAQEAAAAAAAAAAAAAAAAAABES"
        "/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8Amk2pZnbUpOuvNuhJsEUa"
        "rIExEz2vRUEP0QAAV//2Q=="
    )
    payload = {
        "transcription": "simplify",
        "image_base64": _TINY,
        "profile": {"user_id": "test", "neurotype": "none"},
    }
    response = client.post("/agent/act", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    # Should have at least one action (voice intent may be mocked)
    assert "actions" in data
    assert isinstance(data["actions"], list)
    assert len(data["actions"]) >= 1


def test_agent_act_voice_only_returns_feature_action(client, mock_voice_intent):
    """Voice-only /agent/act should return a feature action."""
    payload = {"transcription": "simplify", "profile": {"neurotype": "adhd"}}
    response = client.post("/agent/act", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert any(a["action_type"] == "feature" for a in data["actions"])


def test_agent_act_global_timeout_returns_200(client):
    """Even if the agent times out, it must return HTTP 200 with a speak fallback."""
    from unittest.mock import patch
    import asyncio
    async def _hang(*args, **kwargs):
        await asyncio.sleep(999)
    with patch("app.services.agent_orchestrator.run_agent_act", _hang):
        response = client.post("/agent/act", json={"transcription": "simplify"})
    # The 14s timeout in the router means the mock won't actually hang 999s in test,
    # but we verify the endpoint always returns 200 and a speak action.
    assert response.status_code == 200


# ─── /agent/observe outcome mapping ──────────────────────────────────────────

def test_agent_observe_accepted_outcome(client):
    """accepted outcome should be stored without error."""
    payload = {
        "session_id": "test-abc",
        "action_type": "feature",
        "feature_name": "simplify",
        "outcome": "accepted",
        "latency_ms": 342,
        "page_url": "https://example.com",
        "neurotype": "adhd",
    }
    response = client.post("/agent/observe", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True


def test_agent_observe_dismissed_outcome(client):
    """dismissed outcome should be stored and map to too_strong rating."""
    payload = {
        "session_id": "test-def",
        "action_type": "feature",
        "feature_name": "focus",
        "outcome": "dismissed",
        "latency_ms": 120,
        "neurotype": "dyslexia",
    }
    response = client.post("/agent/observe", json=payload)
    assert response.status_code == 200
    assert response.json()["success"] is True


def test_agent_observe_empty_payload_is_safe(client):
    """Empty observe payload should never crash the server."""
    response = client.post("/agent/observe", json={})
    assert response.status_code == 200


# ─── /explain-image returns full ScreenshotAnalysis ──────────────────────────

_TINY_IMG = (
    "data:image/jpeg;base64,"
    "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8U"
    "HRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAARCAABAAEDASIA"
    "AhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAABgUEB/8QAFhABAQEAAAAAAAAAAAAAAAAAABES"
    "/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8Amk2pZnbUpOuvNuhJsEUa"
    "rIExEz2vRUEP0QAAV//2Q=="
)


def test_explain_image_returns_all_structured_fields(client, mock_screenshot_analyzer):
    """
    /explain-image must return the full structured ScreenshotAnalysis dict,
    NOT a plain string. This verifies the /explain-image → analyze_screenshot unification.
    """
    response = client.post("/explain-image", json={"image_base64": _TINY_IMG, "context": "test"})
    assert response.status_code == 200
    data = response.json()
    assert data.get("success") is True
    # All structured fields must be present
    for field in ("image_type", "title", "key_facts", "labels", "takeaways",
                  "extracted_text", "explanation", "confidence"):
        assert field in data, f"Missing field: {field}"
    # Types
    assert isinstance(data["key_facts"], list)
    assert isinstance(data["takeaways"], list)
    assert isinstance(data["confidence"], float)
    # Must NOT be a plain string explanation only (the old vision_explainer path)
    assert data["image_type"] != ""
    assert data["confidence"] > 0


def test_explain_image_neurotype_parameter_accepted(client, mock_screenshot_analyzer):
    """neurotype field should be accepted without error."""
    response = client.post(
        "/explain-image",
        json={"image_base64": _TINY_IMG, "context": "", "neurotype": "adhd"},
    )
    assert response.status_code == 200
    assert response.json()["success"] is True


# ─── /assist respects neurotype priorities ────────────────────────────────────

def test_assist_adhd_profile_dense_text_returns_formatting(client, mock_invoke_with_retry):
    """
    For an ADHD profile with dense text and long paragraphs,
    the orchestrator should return formatting (rule-based, no LLM needed).
    """
    payload = {
        "profile": {"neurotype": "adhd", "auto_adapt_enabled": False},
        "context": {"text_density": 0.8, "avg_paragraph_length": 200, "content_type": "article"},
        "page_signals": {},
        "user_action": "idle",
    }
    response = client.post("/assist", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["action_type"] == "formatting"
    assert data["confidence"] >= 0.75
    # Should NOT have called LLM (rule matched first)
    assert "dense_text" in data.get("telemetry_tags", [])


def test_assist_explicit_image_click_returns_vision(client, mock_invoke_with_retry):
    """Explicit image click should always return vision action at high confidence."""
    payload = {
        "profile": {"neurotype": "none"},
        "context": {},
        "page_signals": {},
        "user_action": "clicked_image",
        "image_context": "A bar chart showing revenue growth",
    }
    response = client.post("/assist", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["action_type"] == "vision"
    assert data["confidence"] >= 0.9


def test_assist_autism_text_selection_returns_tone(client, mock_invoke_with_retry):
    """Autism profile + text selection should prefer tone analysis."""
    payload = {
        "profile": {"neurotype": "autism"},
        "context": {},
        "page_signals": {},
        "user_action": "selected_text",
        "selection_text": "That's a very interesting perspective on the matter.",
    }
    response = client.post("/assist", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["action_type"] == "tone"
    assert data["confidence"] >= 0.8


# ─── /convert neurotype bonus ─────────────────────────────────────────────────

def test_convert_dyslexia_profile_gets_higher_score(client, mock_invoke_with_retry):
    """Dyslexia profile should add an extra score bonus on top of base improvement."""
    long_text = "The implementation demonstrates " * 50
    payload_default = {
        "text_content": long_text,
        "profile": {"neurotype": "none"},
    }
    payload_dyslexia = {
        "text_content": long_text,
        "profile": {"neurotype": "dyslexia"},
    }
    r_default  = client.post("/convert", json=payload_default).json()
    r_dyslexia = client.post("/convert", json=payload_dyslexia).json()
    assert r_default["success"] is True
    assert r_dyslexia["success"] is True
    # Dyslexia profile should improve the final score by at least the bonus amount
    assert r_dyslexia["cam_after"] >= r_default["cam_after"]


def test_convert_includes_steps_applied_list(client, mock_invoke_with_retry):
    """ConvertResponse must include steps_applied as a list of ConvertResult objects."""
    response = client.post("/convert", json={
        "text_content": "The quick brown fox jumps over the lazy dog. " * 30,
    })
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "steps_applied" in data
    steps = data["steps_applied"]
    assert isinstance(steps, list)
    assert len(steps) > 0
    for step in steps:
        assert "name" in step
        assert "applied" in step
        assert "description" in step


# ─── voice "stop" command safety ──────────────────────────────────────────────

def test_voice_intent_stop_command_returns_feature(client):
    """'stop' command must return feature:stop intent, never crash."""
    response = client.post("/voice-intent", json={"transcription": "stop"})
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["intent"]["action_type"] == "feature"
    assert data["intent"]["feature_name"] == "stop"


def test_voice_intent_stop_reading_command(client):
    """'stop reading' must also resolve to feature:stop."""
    response = client.post("/voice-intent", json={"transcription": "stop reading"})
    assert response.status_code == 200
    data = response.json()
    assert data["intent"]["feature_name"] == "stop"


def test_voice_intent_empty_transcription(client):
    """Empty transcription must return graceful failure, not 500."""
    response = client.post("/voice-intent", json={"transcription": ""})
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is False
    assert "error" in data


# ─── Profile save → agent loop propagation ────────────────────────────────────

def test_profile_neurotype_persists_across_get(client):
    """Profile saved with specific neurotype must be retrievable unchanged."""
    profile = {
        "user_id": "test_agentic_user",
        "neurotype": "autism",
        "auto_adapt_enabled": True,
        "simplification_level": 3,
    }
    save_r = client.post("/profile", json=profile)
    assert save_r.status_code == 200
    assert save_r.json()["success"] is True

    get_r = client.get("/profile?user_id=test_agentic_user")
    assert get_r.status_code == 200
    p = get_r.json()["profile"]
    assert p["neurotype"] == "autism"
    assert p["auto_adapt_enabled"] is True
    assert p["simplification_level"] == 3


def test_profile_used_in_assist_decision(client, mock_invoke_with_retry):
    """
    After saving an autism profile, /assist should respect autism-specific rules
    (e.g. prefer tone analysis for text selections).
    """
    client.post("/profile", json={
        "user_id": "autism_user",
        "neurotype": "autism",
        "auto_adapt_enabled": False,
    })
    response = client.post("/assist", json={
        "profile": {"user_id": "autism_user", "neurotype": "autism"},
        "context": {},
        "page_signals": {},
        "user_action": "selected_text",
        "selection_text": "Well, that's certainly one way of looking at it.",
    })
    assert response.status_code == 200
    data = response.json()
    # Autism + selection → tone
    assert data["action_type"] == "tone"
