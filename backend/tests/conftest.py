import pytest
from fastapi.testclient import TestClient
from app.main import app
from unittest.mock import MagicMock, patch

@pytest.fixture
def client():
    """FastAPI TestClient fixture."""
    with TestClient(app) as c:
        yield c

@pytest.fixture(autouse=True)
def mock_cache():
    """Disable cache during tests to ensure AI logic is always triggered."""
    with patch("app.core.cache.cache.get") as mock_get, \
         patch("app.core.cache.cache.set") as mock_set:
        mock_get.return_value = None
        yield

@pytest.fixture
def mock_invoke_with_retry():
    """Mock invoke_with_retry in every service module where it is imported."""
    mock_returns = {
        "cam": {"score": 85, "rating": "Good", "insights": ["Mocked insight"]},
        "simplify": {"simplified_chunks": ["Simplified test text"]},
        "dom": {"selectors": ["#main"]},
        "focus": {"main_content_selector": "article", "hide_selectors": "nav"},
        "tone": {"primary_tone": "Neutral"},
        "agent": {"action_type": "noop", "feature_name": "", "explanation": "Mocked LLM noop", "confidence": 0.0},
    }

    def create_side_effect(key):
        return lambda *args, **kwargs: mock_returns[key]

    with patch("app.services.cam_analyzer.invoke_with_retry", side_effect=create_side_effect("cam")) as m1, \
         patch("app.services.text_simplifier.invoke_with_retry", side_effect=create_side_effect("simplify")) as m2, \
         patch("app.services.dom_mapper.invoke_with_retry", side_effect=create_side_effect("dom")) as m3, \
         patch("app.services.focus_mapper.invoke_with_retry", side_effect=create_side_effect("focus")) as m4, \
         patch("app.services.tone_analyzer.invoke_with_retry", side_effect=create_side_effect("tone")) as m5, \
         patch("app.services.agent_orchestrator.invoke_with_retry", side_effect=create_side_effect("agent")) as m6:
        
        yield m1 # Just return one of them for .called checks

@pytest.fixture
def mock_vision_explainer():
    """Mock the vision explainer's raw Groq call."""
    with patch("app.services.vision_explainer._explain_image_with_retry") as mock:
        mock.return_value = "This is a mocked image explanation."
        yield mock

@pytest.fixture
def mock_voice_transcriber():
    """Mock the voice transcriber's raw Whisper call."""
    with patch("app.services.voice_transcriber._transcribe_with_retry") as mock:
        mock.return_value = "Mocked transcription."
        yield mock


@pytest.fixture
def mock_screenshot_analyzer():
    """Mock the screenshot analyzer's raw Groq call for /explain-image and /analyze-screenshot tests."""
    import json
    structured_response = json.dumps({
        "image_type":         "photo",
        "title":              "A Test Image",
        "summary":            "A test image showing a simple red square.",
        "short_label":        "Red square photo",
        "image_purpose":      "To serve as a unit-test fixture.",
        "key_facts":          ["Fact 1", "Fact 2"],
        "labels":             ["Label A"],
        "takeaways":          ["This image shows something useful."],
        "extracted_text":     "",
        "explanation":        "This is a mocked structured image explanation.",
        "accessibility_note": "A small red square on a white background.",
        "why_it_matters":     "Used in automated testing.",
        "suggested_action":   "No action required.",
        "confidence":         0.87,
    })
    with patch("app.services.screenshot_analyzer._analyze_with_retry") as mock:
        mock.return_value = structured_response
        yield mock


@pytest.fixture
def mock_voice_intent():
    """Mock parse_intent in voice_intent service to return a deterministic feature intent."""
    with patch("app.services.voice_intent.invoke_with_retry") as mock:
        # LLM fallback returns simplify feature (fast-path should still work for known words)
        mock.return_value = {
            "action_type": "feature",
            "feature_name": "simplify",
            "dom_action": None,
            "speak_message": None,
        }
        yield mock
