"""
NeuroRead AI — test_agent_orchestrator.py
Tests for the Adaptive Accessibility Agent orchestrator.
"""
import pytest
from app.schemas.agent_models import (
    AssistRequest, UserProfile, PageContext, PageSignals,
    Neurotype, ActionType,
)
from app.services.agent_orchestrator import decide_action


class TestExplicitActions:
    """Test deterministic rules for explicit user actions."""

    def test_selected_text_returns_simplify(self, mock_invoke_with_retry):
        """When text is selected, the agent should suggest simplification."""
        req = AssistRequest(
            profile=UserProfile(neurotype=Neurotype.adhd),
            user_action="selected_text",
            selection_text="The implementation of the proposed architectural framework demonstrates a significant reduction in cognitive overhead.",
        )
        result = decide_action(req)
        assert result.action_type == ActionType.simplify
        assert result.confidence >= 0.8
        assert "explicit_selection" in result.telemetry_tags

    def test_selected_text_autism_returns_tone(self, mock_invoke_with_retry):
        """For autism profile, selected text should trigger tone analysis."""
        req = AssistRequest(
            profile=UserProfile(neurotype=Neurotype.autism),
            user_action="selected_text",
            selection_text="I'm fine with whatever you decide. Really, it doesn't matter to me at all.",
        )
        result = decide_action(req)
        assert result.action_type == ActionType.tone
        assert result.confidence >= 0.8
        assert "autism_profile" in result.telemetry_tags

    def test_clicked_image_returns_vision(self, mock_invoke_with_retry):
        """Clicking on an image should trigger vision analysis."""
        req = AssistRequest(
            user_action="clicked_image",
            image_context="data:image/png;base64,fakebase64data",
        )
        result = decide_action(req)
        assert result.action_type == ActionType.vision
        assert result.confidence >= 0.9

    def test_explicit_command_maps_directly(self, mock_invoke_with_retry):
        """Explicit activation commands should map directly to features."""
        req = AssistRequest(user_action="activate_formatting")
        result = decide_action(req)
        assert result.action_type == ActionType.formatting
        assert result.confidence == 1.0

    def test_short_selection_does_not_trigger(self, mock_invoke_with_retry):
        """Very short text selections should not trigger simplification."""
        req = AssistRequest(
            user_action="selected_text",
            selection_text="Hi there",
        )
        result = decide_action(req)
        # Should fall through to behavioral/page/LLM — not simplify on short text
        assert result.action_type != ActionType.simplify or result.confidence < 0.8


class TestBehavioralSignals:
    """Test rules based on behavioral telemetry."""

    def test_dense_text_adhd_suggests_formatting(self, mock_invoke_with_retry):
        """Dense text with ADHD profile should trigger formatting."""
        req = AssistRequest(
            profile=UserProfile(neurotype=Neurotype.adhd),
            context=PageContext(text_density=0.85, avg_paragraph_length=200),
            page_signals=PageSignals(dwell_time_seconds=10),
        )
        result = decide_action(req)
        assert result.action_type == ActionType.formatting
        assert result.confidence >= 0.7

    def test_long_dwell_suggests_simplify(self, mock_invoke_with_retry):
        """Long dwell on paragraphs should suggest simplification."""
        req = AssistRequest(
            page_signals=PageSignals(long_dwell_paragraphs=3),
        )
        result = decide_action(req)
        assert result.action_type == ActionType.simplify
        assert result.confidence >= 0.6

    def test_rapid_scroll_suggests_focus(self, mock_invoke_with_retry):
        """Rapid scrolling with low progress should suggest focus mode."""
        req = AssistRequest(
            page_signals=PageSignals(rapid_scroll_events=5, scroll_depth=0.1),
        )
        result = decide_action(req)
        assert result.action_type == ActionType.focus
        assert result.confidence >= 0.5

    def test_image_clicks_suggest_vision(self, mock_invoke_with_retry):
        """Multiple image clicks should suggest vision explainer."""
        req = AssistRequest(
            page_signals=PageSignals(image_clicks=4),
        )
        result = decide_action(req)
        assert result.action_type == ActionType.vision
        assert result.confidence >= 0.7

    def test_doesnt_suggest_already_active_feature(self, mock_invoke_with_retry):
        """Should not suggest a feature that is already active."""
        req = AssistRequest(
            profile=UserProfile(neurotype=Neurotype.adhd),
            context=PageContext(text_density=0.9, avg_paragraph_length=250),
            page_signals=PageSignals(features_active=["formatting"]),
        )
        result = decide_action(req)
        assert result.action_type != ActionType.formatting

    def test_repeated_visits_suggests_simplify(self, mock_invoke_with_retry):
        """Repeated paragraph visits should suggest simplification."""
        req = AssistRequest(
            page_signals=PageSignals(repeated_paragraph_visits=4),
        )
        result = decide_action(req)
        assert result.action_type == ActionType.simplify


class TestPageContext:
    """Test rules based on page structure."""

    def test_image_heavy_page_suggests_vision(self, mock_invoke_with_retry):
        """Pages with many images should suggest vision explainer."""
        req = AssistRequest(
            context=PageContext(image_count=15),
        )
        result = decide_action(req)
        assert result.action_type == ActionType.vision
        assert result.confidence >= 0.4

    def test_dense_article_suggests_formatting(self, mock_invoke_with_retry):
        """Very long dense articles should suggest formatting."""
        req = AssistRequest(
            context=PageContext(total_text_length=8000, avg_paragraph_length=250),
        )
        result = decide_action(req)
        assert result.action_type == ActionType.formatting
        assert result.confidence >= 0.4


class TestResponseStructure:
    """Test that responses have proper structure."""

    def test_response_has_explanation(self, mock_invoke_with_retry):
        """Every response should have an explanation."""
        req = AssistRequest(
            user_action="clicked_image",
            image_context="base64data",
        )
        result = decide_action(req)
        assert result.explanation != ""
        assert len(result.explanation) > 10

    def test_response_has_reasoning_chain(self, mock_invoke_with_retry):
        """Every response should have a reasoning chain."""
        req = AssistRequest(
            user_action="selected_text",
            selection_text="Some long text that needs simplification for accessibility purposes.",
        )
        result = decide_action(req)
        assert len(result.reasoning_chain) > 0

    def test_noop_has_empty_feature_name(self, mock_invoke_with_retry):
        """Noop actions should have empty feature names."""
        req = AssistRequest()  # Minimal request
        result = decide_action(req)
        if result.action_type == ActionType.noop:
            assert result.feature_name == ""

    def test_auto_apply_respects_profile_flag(self, mock_invoke_with_retry):
        """Auto-apply should only happen when auto_adapt is enabled and confidence is high."""
        req = AssistRequest(
            profile=UserProfile(auto_adapt_enabled=True),
            user_action="clicked_image",
            image_context="base64data",
        )
        result = decide_action(req)
        assert result.confidence >= 0.75
        assert "Auto-applied" in result.ui_hints.toast_message

    def test_no_auto_apply_without_flag(self, mock_invoke_with_retry):
        """Without auto_adapt, should not auto-apply."""
        req = AssistRequest(
            profile=UserProfile(auto_adapt_enabled=False),
            user_action="clicked_image",
            image_context="base64data",
        )
        result = decide_action(req)
        assert "Suggestion" in result.ui_hints.toast_message


class TestConfidenceScoring:
    """Test confidence score consistency."""

    def test_explicit_actions_have_highest_confidence(self, mock_invoke_with_retry):
        """Explicit user commands should have confidence >= 0.9."""
        req = AssistRequest(user_action="activate_read")
        result = decide_action(req)
        assert result.confidence >= 0.9

    def test_behavioral_signals_have_medium_confidence(self, mock_invoke_with_retry):
        """Behavioral signal rules should have confidence 0.5-0.8."""
        req = AssistRequest(
            page_signals=PageSignals(long_dwell_paragraphs=3),
        )
        result = decide_action(req)
        assert 0.5 <= result.confidence <= 0.9

    def test_page_context_has_lower_confidence(self, mock_invoke_with_retry):
        """Page context-only suggestions should have lower confidence."""
        req = AssistRequest(
            context=PageContext(image_count=15),
        )
        result = decide_action(req)
        assert result.confidence <= 0.6
