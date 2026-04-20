"""
NeuroRead AI — agent_models.py
Pydantic schemas for the Adaptive Accessibility Agent.
Covers orchestration requests/responses, user profiles, telemetry signals, and feedback.
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from enum import Enum


# ─── Enums ────────────────────────────────────────────────────

class Neurotype(str, Enum):
    adhd = "adhd"
    dyslexia = "dyslexia"
    autism = "autism"
    mixed = "mixed"
    none = "none"


class ActionType(str, Enum):
    simplify = "simplify"
    focus = "focus"
    read = "read"
    tone = "tone"
    vision = "vision"
    ruler = "ruler"
    formatting = "formatting"
    reader = "reader"
    noop = "noop"


class ContrastMode(str, Enum):
    default = "default"
    high = "high"
    dark = "dark"
    sepia = "sepia"


# ─── User Profile ────────────────────────────────────────────

class UserProfile(BaseModel):
    """Persistent user preferences for accessibility adaptation."""
    user_id: str = Field(default="default", description="Unique user identifier.")
    neurotype: Neurotype = Field(default=Neurotype.none, description="Primary neurotype.")
    preferred_font_size: int = Field(default=22, ge=14, le=36, description="Font size in px.")
    line_height: float = Field(default=1.9, ge=1.0, le=3.0, description="Line height multiplier.")
    simplification_level: int = Field(default=2, ge=1, le=3, description="1=light, 2=moderate, 3=aggressive.")
    tts_speed: float = Field(default=1.0, ge=0.5, le=2.5, description="Text-to-speech rate.")
    focus_intensity: int = Field(default=2, ge=1, le=3, description="1=minimal, 2=moderate, 3=aggressive.")
    contrast_mode: ContrastMode = Field(default=ContrastMode.default, description="Contrast/color scheme.")
    tone_explanation_depth: int = Field(default=2, ge=1, le=3, description="1=brief, 2=standard, 3=detailed.")
    auto_adapt_enabled: bool = Field(default=False, description="Whether autopilot can auto-apply features.")


class ProfileResponse(BaseModel):
    """Response wrapper for profile operations."""
    success: bool
    profile: Optional[UserProfile] = None
    message: str = ""


# ─── Page Context ─────────────────────────────────────────────

class PageContext(BaseModel):
    """Structural metadata about the current page."""
    page_url: str = ""
    page_title: str = ""
    content_type: str = Field(default="article", description="article | feed | social | reference | unknown")
    text_density: float = Field(default=0.5, ge=0.0, le=1.0, description="Ratio of text to total content.")
    image_count: int = Field(default=0, ge=0)
    avg_paragraph_length: int = Field(default=100, ge=0, description="Average chars per paragraph.")
    total_text_length: int = Field(default=0, ge=0)


class PageSignals(BaseModel):
    """Behavioral telemetry signals collected on-device."""
    scroll_depth: float = Field(default=0.0, ge=0.0, le=1.0, description="0.0–1.0 progress through page.")
    dwell_time_seconds: float = Field(default=0.0, ge=0.0, description="Total time on page in seconds.")
    selection_count: int = Field(default=0, ge=0, description="Number of text selections.")
    back_navigations: int = Field(default=0, ge=0, description="Times user went back to same section.")
    features_active: List[str] = Field(default_factory=list, description="Currently active feature keys.")
    reading_pace_wpm: float = Field(default=0.0, ge=0.0, description="Estimated reading pace.")
    repeated_paragraph_visits: int = Field(default=0, ge=0)
    image_clicks: int = Field(default=0, ge=0)
    rapid_scroll_events: int = Field(default=0, ge=0)
    long_dwell_paragraphs: int = Field(default=0, ge=0, description="Paragraphs with >15s dwell.")


# ─── Assist Request / Response ────────────────────────────────

class AssistRequest(BaseModel):
    """Input to the /assist orchestration endpoint."""
    profile: UserProfile = Field(default_factory=UserProfile)
    context: PageContext = Field(default_factory=PageContext)
    page_signals: PageSignals = Field(default_factory=PageSignals)
    user_action: str = Field(default="", description="Explicit user action, e.g. 'selected_text', 'clicked_image', 'idle'.")
    selection_text: str = Field(default="", description="Currently selected text, if any.")
    image_context: str = Field(default="", description="Base64 or description of focused image.")
    page_url: str = Field(default="")


class UIHints(BaseModel):
    """Visual presentation hints for the frontend."""
    toast_message: str = ""
    toast_icon: str = ""
    auto_dismiss_seconds: int = Field(default=8, ge=0)
    highlight_selector: str = ""
    panel_to_open: str = ""


class AssistResponse(BaseModel):
    """Output from the /assist orchestration endpoint."""
    action_type: ActionType = Field(default=ActionType.noop)
    feature_name: str = Field(default="", description="Extension feature key to activate.")
    dom_action: Optional[Dict[str, Any]] = Field(default=None, description="Structured DOM manipulation if needed.")
    explanation: str = Field(default="", description="Human-readable reason for the action.")
    confidence: float = Field(default=0.0, ge=0.0, le=1.0, description="Decision confidence score.")
    ui_hints: UIHints = Field(default_factory=UIHints)
    telemetry_tags: List[str] = Field(default_factory=list, description="Tags for analytics.")
    reasoning_chain: List[str] = Field(default_factory=list, description="Step-by-step reasoning for explainability.")
    goal: str = Field(default="", description="The inferred goal of the agent.")
    plan: List[str] = Field(default_factory=list, description="The multi-step plan the agent intends to execute.")


# ─── Feedback ─────────────────────────────────────────────────

class FeedbackRating(str, Enum):
    helpful = "helpful"
    too_strong = "too_strong"
    too_weak = "too_weak"
    wrong_feature = "wrong_feature"
    undo = "undo"


class FeedbackEntry(BaseModel):
    """User feedback on an agent action."""
    action_type: str
    feature_name: str
    rating: FeedbackRating
    page_url: str = ""
    profile_neurotype: str = ""
    timestamp: float = 0.0
    notes: str = ""


class FeedbackRequest(BaseModel):
    """Batch feedback submission."""
    entries: List[FeedbackEntry] = Field(default_factory=list)


class FeedbackResponse(BaseModel):
    success: bool
    stored_count: int = 0


# ─── Screenshot Analysis ─────────────────────────────────────

class ScreenshotRequest(BaseModel):
    """Input for screenshot/image intelligence."""
    image_base64: str
    context: str = ""
    page_url: str = ""
    neurotype: str = Field(default="", description="User neurotype: blind | adhd | dyslexia | autism | none")


class ScreenshotAnalysis(BaseModel):
    """Structured output from the accessibility image intelligence pipeline."""
    image_type:         str        = Field(default="unknown",     description="photo | chart | diagram | screenshot | infographic | product | decorative")
    title:              str        = Field(default="")
    # ── Smart summary fields (new) ────────────────────────────────
    summary:            str        = Field(default="",            description="1-sentence plain-language TL;DR of the image.")
    short_label:        str        = Field(default="",            description="3-5 word badge label, e.g. 'Bar chart – sales 2024'.")
    image_purpose:      str        = Field(default="",            description="Why this image appears here and what it adds to the content.")
    # ── Core structured output ────────────────────────────────────
    key_facts:          List[str]  = Field(default_factory=list)
    labels:             List[str]  = Field(default_factory=list)
    takeaways:          List[str]  = Field(default_factory=list)
    extracted_text:     str        = Field(default="")
    explanation:        str        = Field(default="")
    # ── Accessibility-first fields ────────────────────────────────
    accessibility_note: str        = Field(default="",            description="Screen-reader friendly linear description.")
    why_it_matters:     str        = Field(default="",            description="Why is this image here? What insight does it add?")
    suggested_action:   str        = Field(default="",            description="UI screenshot: what should the user do next?")
    confidence:         float      = Field(default=0.0, ge=0.0, le=1.0)


class ScreenshotResponse(BaseModel):
    success: bool
    analysis: Optional[ScreenshotAnalysis] = None
    error: str = ""


# ─── Universal Convert ───────────────────────────────────────

class ConvertRequest(BaseModel):
    """Input for the unified /convert accessibility pipeline."""
    text_content: str = Field(default="", description="Page text to convert.")
    profile: Optional[UserProfile] = Field(default=None, description="User profile for personalization.")
    page_url: str = Field(default="")


class ConvertResult(BaseModel):
    """Detailed result of a single pipeline step."""
    name: str
    applied: bool
    description: str


class ConvertResponse(BaseModel):
    """Response from the unified /convert endpoint."""
    success: bool
    cam_before: int = Field(default=0, description="CAM score before conversion.")
    cam_after: int = Field(default=0, description="CAM score after conversion (estimated improvement).")
    cam_improvement: int = Field(default=0, description="Score delta.")
    rating_before: str = Field(default="")
    rating_after: str = Field(default="")
    steps_applied: List[ConvertResult] = Field(default_factory=list)
    explanation: str = Field(default="")
    error: str = Field(default="")


# ─── Agent Act / Observe (Agentic Loop) ──────────────────────

class AgentActRequest(BaseModel):
    """
    Unified agentic input. Accepts any combination of voice, image, and page context.
    Backend processes all provided inputs in parallel and returns a prioritised action list.
    """
    # At least one of these should be provided
    transcription: str = Field(default="", description="Browser-transcribed voice command text.")
    image_base64:  str = Field(default="", description="Base64 image to analyse (optional).")
    image_context: str = Field(default="", description="Page context around the image.")
    # Agent state
    profile:        Optional[UserProfile]  = Field(default=None)
    page_signals:   Optional[PageSignals]  = Field(default=None)
    page_context:   Optional[PageContext]  = Field(default=None)
    user_action:    str = Field(default="", description="Explicit user action hint, e.g. 'clicked_image'.")
    session_id:     str = Field(default="", description="Opaque session token for multi-turn tracking.")


class AgentAction(BaseModel):
    """A single concrete action the agent wants the frontend to execute."""
    action_type:  str = Field(description="feature | dom_manipulation | speak | vision | noop")
    feature_name: str = Field(default="", description="Feature key to activate (for action_type==feature).")
    dom_action:   Optional[Dict[str, Any]] = Field(default=None, description="Structured DOM op (for dom_manipulation).")
    speak:        str = Field(default="", description="TTS feedback text to speak on the client.")
    data:         Optional[Dict[str, Any]] = Field(default=None, description="Rich payload (e.g. ScreenshotAnalysis dict for vision actions).")
    confidence:   float = Field(default=1.0, ge=0.0, le=1.0)


class AgentActResponse(BaseModel):
    """Ordered list of actions from the /agent/act endpoint."""
    success:    bool
    actions:    List[AgentAction] = Field(default_factory=list)
    speak:      str = Field(default="", description="Primary TTS string summarising what the agent will do.")
    session_id: str = Field(default="", description="Echo of or newly assigned session ID.")
    goal:       str = Field(default="", description="Inferred goal.")
    plan:       List[str] = Field(default_factory=list, description="Multi-step plan.")
    error:      str = Field(default="")


class AgentObserveRequest(BaseModel):
    """Outcome log — sent after the frontend applies (or dismisses) an agent action."""
    session_id:   str = Field(default="")
    action_type:  str = Field(default="")
    feature_name: str = Field(default="")
    outcome:      str = Field(default="", description="accepted | dismissed | error | auto_applied")
    latency_ms:   int = Field(default=0,  description="End-to-end latency the user experienced.")
    page_url:     str = Field(default="")
    neurotype:    str = Field(default="")


class AgentObserveResponse(BaseModel):
    """Lightweight ack for /agent/observe."""
    success: bool
    message: str = ""
