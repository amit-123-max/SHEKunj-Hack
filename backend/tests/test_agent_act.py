"""
NeuroRead AI — test_agent_act.py
Tests for the new /agent/act and /agent/observe agentic loop endpoints.
All tests mock external calls; no real Groq / network calls are made.
"""
import pytest
import json
from unittest.mock import patch, MagicMock
from app.schemas.agent_models import AgentActRequest, AgentObserveRequest


# ─── Shared fixtures ─────────────────────────────────────────

# Minimal valid JPEG base64 (1×1 red pixel)
_TINY_JPG = (
    "data:image/jpeg;base64,"
    "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8U"
    "HRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAARCAABAAEDASIA"
    "AhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAABgUEB/8QAFhABAQEAAAAAAAAAAAAAAAAAABES"
    "/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8Amk2pZnbUpOuvNuhJsEUa"
    "rIExEz2vRUEP0QAAV//2Q=="
)

_MOCK_VISION_JSON = json.dumps({
    "image_type":         "photo",
    "title":              "A Test Scene",
    "summary":            "A test photo used in unit tests.",
    "short_label":        "Test photo",
    "image_purpose":      "Unit testing.",
    "key_facts":          ["Fact A", "Fact B"],
    "labels":             [],
    "takeaways":          ["This is a test."],
    "extracted_text":     "",
    "explanation":        "Mocked vision explanation.",
    "accessibility_note": "A mocked accessible description.",
    "why_it_matters":     "It validates the vision pipeline.",
    "suggested_action":   "No action.",
    "confidence":         0.92,
})


# ─── /agent/act — voice only ─────────────────────────────────

def test_agent_act_voice_simplify(client):
    """Voice command 'simplify' resolves via local fast match and returns feature action."""
    payload = {
        "transcription": "simplify this page",
        "profile": {"user_id": "u1", "neurotype": "adhd"},
    }
    response = client.post("/agent/act", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "actions" in data
    # Must contain at least one feature or speak action
    assert len(data["actions"]) >= 1
    assert "speak" in data
    # session_id should be present
    assert "session_id" in data


def test_agent_act_voice_stop(client):
    """'stop reading' should be resolved locally as a stop action."""
    payload = {"transcription": "stop reading"}
    response = client.post("/agent/act", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    action_types = [a["action_type"] for a in data.get("actions", [])]
    feature_names = [a.get("feature_name", "") for a in data.get("actions", [])]
    # Should produce a feature action with name 'stop'
    assert "feature" in action_types
    assert "stop" in feature_names


def test_agent_act_scroll_command(client):
    """'scroll down' should be resolved locally as dom_manipulation."""
    payload = {"transcription": "scroll down"}
    response = client.post("/agent/act", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    action_types = [a["action_type"] for a in data.get("actions", [])]
    assert "dom_manipulation" in action_types


# ─── /agent/act — image only ─────────────────────────────────

def test_agent_act_image_only(client):
    """Image-only request should return a vision action with structured data."""
    with patch("app.services.screenshot_analyzer._analyze_with_retry",
               return_value=_MOCK_VISION_JSON):
        payload = {
            "image_base64": _TINY_JPG,
            "image_context": "A test chart on a unit test page.",
        }
        response = client.post("/agent/act", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    action_types = [a["action_type"] for a in data.get("actions", [])]
    assert "vision" in action_types

    # Vision action must carry structured data
    vision_action = next(a for a in data["actions"] if a["action_type"] == "vision")
    assert "data" in vision_action
    assert vision_action["data"]["image_type"] == "photo"
    assert vision_action["data"]["accessibility_note"] == "A mocked accessible description."
    assert abs(vision_action["data"]["confidence"] - 0.92) < 0.01


# ─── /agent/act — combined voice + image ─────────────────────

def test_agent_act_voice_and_image_parallel(client):
    """Both voice AND image provided → both processed, intent takes priority.\""""
    with patch("app.services.screenshot_analyzer._analyze_with_retry",
               return_value=_MOCK_VISION_JSON):
        payload = {
            "transcription": "read aloud",
            "image_base64":  _TINY_JPG,
        }
        response = client.post("/agent/act", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    action_types = [a["action_type"] for a in data.get("actions", [])]
    # Should have BOTH a feature action (from voice) AND a vision action (from image)
    assert "feature" in action_types
    assert "vision" in action_types

    # Voice intent (read) is highest priority — should be first
    assert data["actions"][0]["action_type"] == "feature"
    assert data["actions"][0]["feature_name"] == "read"


# ─── /agent/act — empty input (context-only path) ────────────

def test_agent_act_empty_input_returns_noop_not_500(client):
    """Empty request shouldn't crash — returns noop gracefully."""
    response = client.post("/agent/act", json={})
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "actions" in data
    assert "speak" in data


def test_agent_act_with_page_context_only(client, mock_invoke_with_retry):
    """Page context only (no voice/image) → runs assist, returns context suggestion or noop."""
    payload = {
        "page_context": {
            "content_type": "article",
            "text_density": 0.9,
            "avg_paragraph_length": 300,
        },
        "page_signals": {
            "dwell_time_seconds": 45,
            "scroll_depth": 0.2,
            "rapid_scroll_events": 4,
        },
    }
    response = client.post("/agent/act", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    # Always returns an actions list (may be empty for noop)
    assert isinstance(data["actions"], list)


# ─── /agent/act — timeout handling ───────────────────────────

def test_agent_act_vision_timeout_returns_200(client):
    """If vision model times out, /agent/act must return 200 with a fallback speak action."""
    import asyncio

    async def _slow(*args, **kwargs):
        await asyncio.sleep(999)

    with patch("app.services.screenshot_analyzer.analyze_screenshot",
               side_effect=Exception("Simulated vision timeout")):
        payload = {
            "image_base64": _TINY_JPG,
        }
        response = client.post("/agent/act", json=payload)

    assert response.status_code == 200
    data = response.json()
    # success=True but actions may contain an error speak action
    assert "actions" in data
    assert "speak" in data


# ─── /agent/observe ──────────────────────────────────────────

def test_agent_observe_accepted(client):
    """Accepted action outcome is stored successfully."""
    payload = {
        "session_id":   "test-session-01",
        "action_type":  "feature",
        "feature_name": "simplify",
        "outcome":      "accepted",
        "latency_ms":   450,
        "page_url":     "https://example.com/article",
        "neurotype":    "adhd",
    }
    response = client.post("/agent/observe", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "message" in data


def test_agent_observe_dismissed(client):
    """Dismissed outcome should also be stored without error."""
    payload = {
        "session_id":   "test-session-02",
        "action_type":  "feature",
        "feature_name": "focusMode",
        "outcome":      "dismissed",
        "latency_ms":   800,
    }
    response = client.post("/agent/observe", json=payload)
    assert response.status_code == 200
    assert response.json()["success"] is True


def test_agent_observe_empty_payload(client):
    """Empty observe payload should succeed (all fields optional)."""
    response = client.post("/agent/observe", json={})
    assert response.status_code == 200
    assert response.json()["success"] is True


def test_agent_observe_auto_applied(client):
    """Auto-applied outcome represents highest-confidence action, should store fine."""
    payload = {
        "session_id":   "test-session-03",
        "action_type":  "vision",
        "feature_name": "",
        "outcome":      "auto_applied",
        "latency_ms":   3200,
        "page_url":     "https://example.com/blog",
        "neurotype":    "blind",
    }
    response = client.post("/agent/observe", json=payload)
    assert response.status_code == 200
    assert response.json()["success"] is True


# ─── Schema validation ────────────────────────────────────────

def test_agent_act_response_structure_is_complete(client):
    """Response must always contain success, actions, speak, session_id."""
    response = client.post("/agent/act", json={"transcription": "focus"})
    assert response.status_code == 200
    data = response.json()
    for key in ("success", "actions", "speak", "session_id"):
        assert key in data, f"Missing key in /agent/act response: {key}"


def test_agent_action_has_required_fields(client):
    """Each action in the response must have action_type and confidence."""
    response = client.post("/agent/act", json={"transcription": "ruler"})
    assert response.status_code == 200
    data = response.json()
    for action in data.get("actions", []):
        assert "action_type" in action
        assert "confidence" in action
        assert 0.0 <= action["confidence"] <= 1.0
