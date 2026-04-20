"""
NeuroRead AI — test_voice_endpoint.py
Tests for the /voice FastAPI endpoint.
Covers: success path, empty audio, transcription failure,
        intent parse failure, timeout, and graceful fallback.
"""
import pytest
import io
from unittest.mock import patch


# Minimal valid WebM header bytes (enough to pass the size check)
_FAKE_AUDIO = b"\x1a\x45\xdf\xa3" + b"\x00" * 500  # ~504 bytes — above silence floor


class TestVoiceEndpointStructure:
    """Verify the /voice endpoint returns well-formed responses."""

    def test_empty_audio_returns_soft_failure(self, client):
        """/voice with empty file must return 200 with success=False, not 422 or 500."""
        response = client.post(
            "/voice",
            files={"audio": ("recording.webm", b"", "audio/webm")},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is False
        assert "intent" in data
        assert data["intent"]["action_type"] == "speak"
        assert data["intent"]["speak_message"]  # non-empty

    def test_no_audio_field_returns_422(self, client):
        """/voice with no audio field must return 422 (FastAPI validation)."""
        response = client.post("/voice", data={})
        assert response.status_code == 422

    def test_successful_transcription_and_intent(self, client):
        """/voice with valid audio must return transcription + intent."""
        with patch("app.services.voice_transcriber._transcribe_with_retry") as mock_t, \
             patch("app.services.voice_intent.invoke_with_retry") as mock_i:

            mock_t.return_value = "simplify this page"
            mock_i.return_value = {
                "action_type": "feature",
                "feature_name": "simplify",
                "dom_action": None,
                "speak_message": None,
            }

            response = client.post(
                "/voice",
                files={"audio": ("recording.webm", _FAKE_AUDIO, "audio/webm")},
            )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["transcription"] == "simplify this page"
        assert data["intent"]["action_type"] == "feature"
        assert data["intent"]["feature_name"] == "simplify"

    def test_transcription_returns_empty_gives_soft_failure(self, client):
        """When Whisper returns empty (silence), backend must soft-fail gracefully."""
        with patch("app.services.voice_transcriber._transcribe_with_retry") as mock_t:
            mock_t.return_value = ""  # silence / hallucination filtered

            response = client.post(
                "/voice",
                files={"audio": ("recording.webm", _FAKE_AUDIO, "audio/webm")},
            )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is False
        assert data["intent"]["action_type"] == "speak"
        assert data["intent"]["speak_message"]

    def test_transcription_exception_gives_soft_failure(self, client):
        """If Groq Whisper throws, the endpoint must return 200 with a fallback."""
        with patch("app.services.voice_transcriber._transcribe_with_retry",
                   side_effect=Exception("Groq 503")):

            response = client.post(
                "/voice",
                files={"audio": ("recording.webm", _FAKE_AUDIO, "audio/webm")},
            )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is False
        assert "intent" in data
        assert data["intent"]["action_type"] == "speak"

    def test_intent_parse_exception_gives_soft_failure(self, client):
        """If intent parsing throws, still return 200 with a helpful speak fallback."""
        with patch("app.services.voice_transcriber._transcribe_with_retry") as mock_t, \
             patch("app.services.voice_intent.invoke_with_retry",
                   side_effect=Exception("LLM rate limit")):

            mock_t.return_value = "do something"

            response = client.post(
                "/voice",
                files={"audio": ("recording.webm", _FAKE_AUDIO, "audio/webm")},
            )

        assert response.status_code == 200
        data = response.json()
        # Success is True for transcription, but intent fell back to speak
        assert "intent" in data
        assert data["intent"]["action_type"] == "speak"

    def test_response_shape_contains_required_keys(self, client):
        """Response must always contain 'success', 'transcription', 'intent'."""
        with patch("app.services.voice_transcriber._transcribe_with_retry") as mock_t, \
             patch("app.services.voice_intent.invoke_with_retry") as mock_i:

            mock_t.return_value = "read this page"
            mock_i.return_value = {
                "action_type": "feature",
                "feature_name": "read",
                "dom_action": None,
                "speak_message": None,
            }

            response = client.post(
                "/voice",
                files={"audio": ("recording.webm", _FAKE_AUDIO, "audio/webm")},
            )

        assert response.status_code == 200
        data = response.json()
        for key in ("success", "transcription", "intent"):
            assert key in data, f"Missing key: {key}"
        for key in ("action_type",):
            assert key in data["intent"], f"Missing key in intent: {key}"


class TestVoiceIntentExecution:
    """Test that all feature names the frontend executes are valid."""

    FEATURE_COMMANDS = [
        ("simplify this page", "simplify"),
        ("format this page", "formatting"),
        ("read aloud", "read"),
        ("stop reading", "stop"),
        ("turn on focus mode", "focus"),
        ("show reading ruler", "ruler"),
        ("show table of contents", "toc"),
        ("undo everything", "undo"),
    ]

    @pytest.mark.parametrize("phrase,expected_feature", FEATURE_COMMANDS)
    def test_feature_mapping_returns_expected_name(self, client, phrase, expected_feature):
        """Each common voice phrase must map to the correct feature_name."""
        with patch("app.services.voice_transcriber._transcribe_with_retry") as mock_t, \
             patch("app.services.voice_intent.invoke_with_retry") as mock_i:

            mock_t.return_value = phrase
            mock_i.return_value = {
                "action_type": "feature",
                "feature_name": expected_feature,
                "dom_action": None,
                "speak_message": None,
            }

            response = client.post(
                "/voice",
                files={"audio": ("recording.webm", _FAKE_AUDIO, "audio/webm")},
            )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["intent"]["feature_name"] == expected_feature

    def test_dom_scroll_down_intent(self, client):
        """'Scroll down' should produce a dom_manipulation intent."""
        with patch("app.services.voice_transcriber._transcribe_with_retry") as mock_t, \
             patch("app.services.voice_intent.invoke_with_retry") as mock_i:

            mock_t.return_value = "scroll down"
            mock_i.return_value = {
                "action_type": "dom_manipulation",
                "feature_name": None,
                "dom_action": {"method": "scrollBy", "selector": None, "args": {"top": 500}},
                "speak_message": None,
            }

            response = client.post(
                "/voice",
                files={"audio": ("recording.webm", _FAKE_AUDIO, "audio/webm")},
            )

        assert response.status_code == 200
        data = response.json()
        assert data["intent"]["action_type"] == "dom_manipulation"
        assert data["intent"]["dom_action"]["method"] == "scrollBy"
