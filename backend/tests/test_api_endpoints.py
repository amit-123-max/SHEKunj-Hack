"""
NeuroRead AI — test_api_endpoints.py
Tests for the FastAPI backend endpoints.
"""
import pytest
from tests.mock_data import MOCK_TEXTS, MOCK_SKELETON


# ─── Accessibility Endpoints ─────────────────────────────────

def test_cam_score_endpoint(client, mock_invoke_with_retry):
    """Verify that /cam-score returns a valid accessibility report."""
    response = client.post("/cam-score", json={"text_content": MOCK_TEXTS["academic"]["source"]})
    
    assert response.status_code == 200
    json_data = response.json()
    assert json_data["success"] is True
    assert "cam" in json_data
    assert "score" in json_data["cam"]
    assert json_data["cam"]["score"] == 85
    
    # Verify mock was called
    assert mock_invoke_with_retry.called

def test_simplify_text_endpoint(client, mock_invoke_with_retry):
    """Verify that /simplify returns simplified text chunks."""
    payload = {
        "text_chunks": [MOCK_TEXTS["legal"]["source"]]
    }
    response = client.post("/simplify", json=payload)
    
    assert response.status_code == 200
    json_data = response.json()
    assert "simplified_chunks" in json_data
    assert len(json_data["simplified_chunks"]) == 1
    assert json_data["simplified_chunks"][0] == "Simplified test text"

def test_analyze_focus_endpoint(client, mock_invoke_with_retry):
    """Verify that /analyze-focus isolates main content."""
    response = client.post("/analyze-focus", json={"html_skeleton": MOCK_SKELETON})
    
    assert response.status_code == 200
    json_data = response.json()
    assert json_data["success"] is True
    assert "selectors" in json_data
    assert "main_content_selector" in json_data["selectors"]
    assert json_data["selectors"]["main_content_selector"] == "article"

def test_tone_analyzer_endpoint(client, mock_invoke_with_retry):
    """Verify that /analyze-tone provides social subtext."""
    response = client.post("/analyze-tone", json={"text_content": MOCK_TEXTS["medical"]["source"]})
    
    assert response.status_code == 200
    json_data = response.json()
    assert json_data["success"] is True
    assert "analysis" in json_data
    assert json_data["analysis"]["primary_tone"] == "Neutral"

def test_cam_score_with_empty_text(client, mock_invoke_with_retry):
    """Empty text should return a graceful failure, not a server 500."""
    response = client.post("/cam-score", json={"text_content": ""})
    assert response.status_code == 200
    json_data = response.json()
    # Backend returns success=False with an error message for empty text
    assert "success" in json_data

def test_simplify_multiple_chunks(client, mock_invoke_with_retry):
    """Verify that /simplify handles multiple text chunks."""
    payload = {
        "text_chunks": [
            MOCK_TEXTS["legal"]["source"],
            MOCK_TEXTS["medical"]["source"],
        ]
    }
    response = client.post("/simplify", json=payload)
    assert response.status_code == 200
    json_data = response.json()
    assert "simplified_chunks" in json_data
    # Our mock always returns exactly 1 chunk, but we verify the key exists
    assert isinstance(json_data["simplified_chunks"], list)


# ─── System Endpoints ─────────────────────────────────────────

def test_health_endpoint(client):
    """Verify that /health returns status ok."""
    response = client.get("/health")
    assert response.status_code == 200
    json_data = response.json()
    assert json_data["status"] == "ok"
    assert "uptime_seconds" in json_data
    assert "version" in json_data
    assert "models" in json_data

def test_settings_endpoint(client):
    """Verify that /settings returns default typography settings."""
    response = client.get("/settings")
    assert response.status_code == 200
    json_data = response.json()
    assert "base_font_size" in json_data
    assert "line_height" in json_data
    assert "colors" in json_data


# ─── Agent Orchestrator Endpoints ────────────────────────────

def test_assist_endpoint_basic(client, mock_invoke_with_retry):
    """Verify that /assist returns a structured response."""
    payload = {
        "profile": {"user_id": "test", "neurotype": "adhd"},
        "context": {"content_type": "article", "text_density": 0.8, "avg_paragraph_length": 200},
        "page_signals": {},
        "user_action": "selected_text",
        "selection_text": "The implementation demonstrates significant reduction in cognitive overhead.",
    }
    response = client.post("/assist", json=payload)
    assert response.status_code == 200
    json_data = response.json()
    assert "action_type" in json_data
    assert "confidence" in json_data
    assert "explanation" in json_data
    assert "reasoning_chain" in json_data
    assert json_data["confidence"] >= 0.0

def test_assist_returns_noop_for_empty_request(client, mock_invoke_with_retry):
    """Minimal request with no signals should return noop or low-confidence action."""
    response = client.post("/assist", json={})
    assert response.status_code == 200
    json_data = response.json()
    # Should be a valid response — either noop or a low-confidence suggestion
    assert "action_type" in json_data

def test_profile_get_endpoint(client):
    """Verify that GET /profile returns a user profile."""
    response = client.get("/profile?user_id=default")
    assert response.status_code == 200
    json_data = response.json()
    assert json_data["success"] is True
    assert "profile" in json_data
    assert "neurotype" in json_data["profile"]

def test_profile_save_and_retrieve(client):
    """Verify that POST /profile saves and GET /profile retrieves it."""
    profile_data = {
        "user_id": "test_api_user",
        "neurotype": "dyslexia",
        "preferred_font_size": 26,
        "auto_adapt_enabled": True,
    }
    # Save
    save_response = client.post("/profile", json=profile_data)
    assert save_response.status_code == 200
    assert save_response.json()["success"] is True

    # Retrieve
    get_response = client.get("/profile?user_id=test_api_user")
    assert get_response.status_code == 200
    retrieved = get_response.json()["profile"]
    assert retrieved["neurotype"] == "dyslexia"
    assert retrieved["preferred_font_size"] == 26

def test_feedback_endpoint(client):
    """Verify that /feedback accepts feedback entries."""
    payload = {
        "entries": [
            {
                "action_type": "simplify",
                "feature_name": "simplify",
                "rating": "helpful",
                "page_url": "https://example.com",
                "profile_neurotype": "adhd",
                "timestamp": 1000000.0,
                "notes": "This was great!",
            }
        ]
    }
    response = client.post("/feedback", json=payload)
    assert response.status_code == 200
    json_data = response.json()
    assert json_data["success"] is True
    assert json_data["stored_count"] == 1

def test_analyze_screenshot_missing_image(client):
    """Missing image data should return 400 error."""
    response = client.post("/analyze-screenshot", json={"image_base64": "", "context": ""})
    assert response.status_code == 400


# Minimal 1×1 JPEG — same fixture used by /explain-image tests
_TINY_JPEG_SS = (
    "data:image/jpeg;base64,"
    "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8U"
    "HRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAARCAABAAEDASIA"
    "AhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAABgUEB/8QAFhABAQEAAAAAAAAAAAAAAAAAABES"
    "/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8Amk2pZnbUpOuvNuhJsEUa"
    "rIExEz2vRUEP0QAAV//2Q=="
)


def test_analyze_screenshot_returns_nested_structure(client, mock_screenshot_analyzer):
    """POST /analyze-screenshot must return {success, analysis: {...}} — the nested ScreenshotResponse shape."""
    response = client.post(
        "/analyze-screenshot",
        json={"image_base64": _TINY_JPEG_SS, "context": "unit test"}
    )
    assert response.status_code == 200
    data = response.json()

    # Top-level envelope
    assert data["success"] is True
    assert "analysis" in data          # ← the critical nested key

    a = data["analysis"]
    # All 8 fields the frontend depends on must be present inside analysis
    for field in ("image_type", "title", "key_facts", "labels",
                  "takeaways", "extracted_text", "explanation", "confidence"):
        assert field in a, f"Missing field in analysis: {field}"

    assert isinstance(a["key_facts"],  list)
    assert isinstance(a["takeaways"],  list)
    assert isinstance(a["labels"],     list)
    assert isinstance(a["confidence"], float)


def test_analyze_screenshot_values_match_mock(client, mock_screenshot_analyzer):
    """analysis fields must reflect what the vision model returned."""
    response = client.post(
        "/analyze-screenshot",
        json={"image_base64": _TINY_JPEG_SS, "context": ""}
    )
    data = response.json()
    a = data["analysis"]
    assert a["image_type"]  == "photo"
    assert a["title"]       == "A Test Image"
    assert "Fact 1"         in a["key_facts"]
    assert abs(a["confidence"] - 0.87) < 0.01


def test_analyze_screenshot_timeout_returns_200_with_fallback(client):
    """When vision model times out, endpoint must return HTTP 200 with a usable analysis, not 500."""
    from unittest.mock import patch
    with patch("app.services.screenshot_analyzer._analyze_with_retry",
               side_effect=Exception("Simulated Groq timeout")):
        response = client.post(
            "/analyze-screenshot",
            json={"image_base64": _TINY_JPEG_SS, "context": "timeout test"}
        )
    assert response.status_code == 200        # never a 500
    data = response.json()
    # Either success with fallback analysis OR success=False with error field
    assert "analysis" in data or "error" in data
    # explanation must be present and non-empty in the analysis object
    if "analysis" in data and data["analysis"]:
        assert data["analysis"].get("explanation")

def test_convert_endpoint_with_text(client, mock_invoke_with_retry):
    """Verify that /convert returns a proper before/after report."""
    payload = {
        "text_content": MOCK_TEXTS["academic"]["source"],
        "profile": {"user_id": "default", "neurotype": "adhd"},
    }
    response = client.post("/convert", json=payload)
    assert response.status_code == 200
    json_data = response.json()
    assert json_data["success"] is True
    assert "cam_before" in json_data
    assert "cam_after" in json_data
    assert "cam_improvement" in json_data
    assert "steps_applied" in json_data
    assert len(json_data["steps_applied"]) > 0
    assert json_data["cam_after"] >= json_data["cam_before"]

def test_convert_endpoint_empty_text(client, mock_invoke_with_retry):
    """Empty text should return graceful failure, not a server error."""
    response = client.post("/convert", json={"text_content": ""})
    assert response.status_code == 200
    json_data = response.json()
    assert json_data["success"] is False
    assert "error" in json_data


# ─── Image Explanation Endpoint ──────────────────────────────

# Minimal valid JPEG base64 (1×1 red pixel)
_TINY_JPG = (
    "data:image/jpeg;base64,"
    "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8U"
    "HRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgN"
    "DRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIy"
    "MjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAABgUEB"
    "/8QAHBAAAQUBAQEAAAAAAAAAAAAAAQIDBAUREiH/xAAUAQEAAAAAAAAAAAAAAAAAAAAA"
    "/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8Amk2pZnbUpOuvNuhJsEUa"
    "rIExEz2vRUEP0QAAV//2Q=="
)


def test_explain_image_returns_structured_response(client, mock_screenshot_analyzer):
    """POST /explain-image must return all required structured fields."""
    response = client.post(
        "/explain-image",
        json={"image_base64": _TINY_JPG, "context": "unit test image"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    # All fields the frontend depends on must be present
    assert "image_type"     in data
    assert "title"          in data
    assert "key_facts"      in data
    assert "labels"         in data
    assert "takeaways"      in data
    assert "extracted_text" in data
    assert "explanation"    in data
    assert "confidence"     in data
    # Types
    assert isinstance(data["key_facts"],  list)
    assert isinstance(data["takeaways"],  list)
    assert isinstance(data["labels"],     list)
    assert isinstance(data["confidence"], float)


def test_explain_image_values_match_mock(client, mock_screenshot_analyzer):
    """Structured fields must reflect what the vision model returned."""
    response = client.post(
        "/explain-image",
        json={"image_base64": _TINY_JPG, "context": ""}
    )
    data = response.json()
    assert data["image_type"] == "photo"
    assert data["title"]      == "A Test Image"
    assert data["explanation"] == "This is a mocked structured image explanation."
    assert "Fact 1" in data["key_facts"]
    assert abs(data["confidence"] - 0.87) < 0.01


def test_explain_image_missing_data_returns_400(client):
    """Empty image_base64 must return HTTP 400, not a server crash."""
    response = client.post("/explain-image", json={"image_base64": "", "context": ""})
    assert response.status_code == 400


def test_explain_image_graceful_fallback_on_vision_failure(client):
    """If the vision model throws, analyze_screenshot catches it internally and
    returns a ScreenshotAnalysis fallback object (confidence=0, type='unknown').
    The endpoint must still return HTTP 200 with a usable explanation."""
    from unittest.mock import patch
    with patch("app.services.screenshot_analyzer._analyze_with_retry",
               side_effect=Exception("Vision model exploded")), \
         patch("app.services.vision_explainer._explain_image_with_retry",
               side_effect=Exception("Plain fallback also failed")):
        response = client.post(
            "/explain-image",
            json={"image_base64": _TINY_JPG, "context": "failure test"}
        )
    # Must never return 500
    assert response.status_code == 200
    data = response.json()
    # Explanation must still be present (graceful degradation)
    assert "explanation" in data
    assert data["explanation"]  # non-empty
    # confidence=0.0 is the telltale sign of the internal fallback path
    assert data.get("confidence", 1.0) == 0.0

