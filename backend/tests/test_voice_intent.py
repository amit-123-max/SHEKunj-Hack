"""
NeuroRead AI — test_voice_intent.py
Tests for the voice intent parser.
"""
import pytest
from unittest.mock import patch


class TestVoiceIntentParsing:
    """Test deterministic fallback behavior and structure of voice intent responses."""

    @patch("app.services.voice_intent.invoke_with_retry")
    def test_feature_intent_returns_correct_structure(self, mock_retry):
        """Feature intent response should have action_type and feature_name."""
        mock_retry.return_value = {
            "action_type": "feature",
            "feature_name": "simplify",
            "dom_action": None,
            "speak_message": None,
        }
        from app.services.voice_intent import parse_intent
        result = parse_intent("simplify this page")
        assert result["action_type"] == "feature"
        assert result["feature_name"] == "simplify"

    @patch("app.services.voice_intent.invoke_with_retry")
    def test_dom_manipulation_intent_structure(self, mock_retry):
        """DOM manipulation intent should include a dom_action dict."""
        mock_retry.return_value = {
            "action_type": "dom_manipulation",
            "feature_name": None,
            "dom_action": {"method": "scrollBy", "selector": None, "args": {"top": 500}},
            "speak_message": None,
        }
        from app.services.voice_intent import parse_intent
        result = parse_intent("scroll down")
        assert result["action_type"] == "dom_manipulation"
        assert result["dom_action"]["method"] == "scrollBy"

    @patch("app.services.voice_intent.invoke_with_retry")
    def test_speak_intent_has_message(self, mock_retry):
        """Speak intent should have a non-empty speak_message."""
        mock_retry.return_value = {
            "action_type": "speak",
            "feature_name": None,
            "dom_action": None,
            "speak_message": "I can't do that from a browser extension.",
        }
        from app.services.voice_intent import parse_intent
        result = parse_intent("order me a pizza")
        assert result["action_type"] == "speak"
        assert len(result["speak_message"]) > 5

    @patch("app.services.voice_intent.invoke_with_retry")
    def test_llm_failure_returns_safe_fallback(self, mock_retry):
        """When LLM fails, parse_intent should return a safe speak fallback."""
        mock_retry.return_value = None  # Simulate failure
        from app.services.voice_intent import parse_intent
        result = parse_intent("do something")
        assert result["action_type"] == "speak"
        assert "speak_message" in result
        assert len(result["speak_message"]) > 0

    @patch("app.services.voice_intent.invoke_with_retry")
    def test_formatting_command_maps_correctly(self, mock_retry):
        """'formatting' or 'format this page' should map to formatting feature."""
        mock_retry.return_value = {
            "action_type": "feature",
            "feature_name": "formatting",
            "dom_action": None,
            "speak_message": None,
        }
        from app.services.voice_intent import parse_intent
        result = parse_intent("format this page")
        assert result["feature_name"] == "formatting"

    @patch("app.services.voice_intent.invoke_with_retry")
    def test_read_aloud_command(self, mock_retry):
        """'read aloud' should map to read feature."""
        mock_retry.return_value = {
            "action_type": "feature",
            "feature_name": "read",
            "dom_action": None,
            "speak_message": None,
        }
        from app.services.voice_intent import parse_intent
        result = parse_intent("read this page aloud")
        assert result["feature_name"] == "read"

    @patch("app.services.voice_intent.invoke_with_retry")
    def test_undo_command_maps_to_undo(self, mock_retry):
        """'undo' or 'reset' should map to undo feature."""
        mock_retry.return_value = {
            "action_type": "feature",
            "feature_name": "undo",
            "dom_action": None,
            "speak_message": None,
        }
        from app.services.voice_intent import parse_intent
        result = parse_intent("reset everything")
        assert result["feature_name"] == "undo"
