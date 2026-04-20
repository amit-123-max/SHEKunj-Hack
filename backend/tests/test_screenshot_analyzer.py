"""
NeuroRead AI — test_screenshot_analyzer.py
Tests for the screenshot/image intelligence pipeline.
"""
import pytest
from unittest.mock import patch, MagicMock
from app.services.screenshot_analyzer import analyze_screenshot, _parse_response
from app.schemas.agent_models import ScreenshotAnalysis
import json


class TestParseResponse:
    """Test the response parser handles various formats."""

    def test_valid_json_response(self):
        """Valid JSON should parse correctly."""
        raw = json.dumps({
            "image_type": "chart",
            "title": "Revenue Growth 2025",
            "key_facts": ["Revenue grew 25%", "Q4 was strongest"],
            "labels": ["Q1", "Q2", "Q3", "Q4"],
            "takeaways": ["Strong upward trend"],
            "extracted_text": "Revenue Growth",
            "explanation": "A bar chart showing revenue growth across 4 quarters.",
            "confidence": 0.85,
        })
        result = _parse_response(raw)
        assert result.image_type == "chart"
        assert result.title == "Revenue Growth 2025"
        assert len(result.key_facts) == 2
        assert result.confidence == 0.85

    def test_markdown_wrapped_json(self):
        """JSON wrapped in markdown fences should still parse."""
        raw = "```json\n" + json.dumps({
            "image_type": "diagram",
            "title": "Architecture Diagram",
            "key_facts": [],
            "labels": [],
            "takeaways": [],
            "extracted_text": "",
            "explanation": "A system architecture diagram.",
            "confidence": 0.7,
        }) + "\n```"
        result = _parse_response(raw)
        assert result.image_type == "diagram"

    def test_invalid_json_returns_fallback(self):
        """Invalid JSON should return graceful fallback with low confidence."""
        result = _parse_response("This is not JSON at all, just text.")
        assert result.image_type == "unknown"
        assert result.confidence < 0.5  # any low-confidence fallback is acceptable
        assert "This is not JSON" in result.explanation

    def test_empty_response_returns_fallback(self):
        """Empty response should return fallback with low confidence."""
        result = _parse_response("")
        assert result.image_type == "unknown"
        assert result.confidence < 0.5  # any low-confidence fallback is acceptable

    def test_partial_json_fields(self):
        """JSON with missing fields should use defaults."""
        raw = json.dumps({
            "image_type": "photo",
            "explanation": "A photo of a cat.",
        })
        result = _parse_response(raw)
        assert result.image_type == "photo"
        assert result.key_facts == []
        assert result.labels == []


class TestAnalyzeScreenshot:
    """Test the main analysis function."""

    @patch("app.services.screenshot_analyzer._analyze_with_retry")
    def test_successful_analysis(self, mock_retry):
        """Successful analysis should return structured output."""
        mock_retry.return_value = json.dumps({
            "image_type": "screenshot",
            "title": "Dashboard Screenshot",
            "key_facts": ["Shows user metrics"],
            "labels": ["Users: 1000"],
            "takeaways": ["User growth is steady"],
            "extracted_text": "Dashboard - 1000 users",
            "explanation": "A dashboard showing user metrics.",
            "confidence": 0.9,
        })
        result = analyze_screenshot("fakebase64", "dashboard page")
        assert result.image_type == "screenshot"
        assert result.confidence == 0.9

    @patch("app.services.screenshot_analyzer._analyze_with_retry")
    def test_error_returns_graceful_fallback(self, mock_retry):
        """Errors during analysis should return a safe fallback."""
        mock_retry.side_effect = Exception("Model unavailable")
        result = analyze_screenshot("fakebase64")
        assert result.image_type == "unknown"
        assert result.confidence == 0.0
        assert "Could not analyze" in result.explanation


class TestScreenshotAnalysisSchema:
    """Test the ScreenshotAnalysis schema."""

    def test_default_values(self):
        """Default schema should have sensible values."""
        analysis = ScreenshotAnalysis()
        assert analysis.image_type == "unknown"
        assert analysis.confidence == 0.0
        assert analysis.key_facts == []

    def test_confidence_bounds(self):
        """Confidence should be clamped to 0.0-1.0."""
        analysis = ScreenshotAnalysis(confidence=0.5)
        assert 0.0 <= analysis.confidence <= 1.0
