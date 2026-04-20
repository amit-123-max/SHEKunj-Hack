"""
NeuroRead AI — agent_orchestrator.py
Central Adaptive Accessibility Agent.

Two-tier decision engine:
  1. Deterministic rules — fast, zero-LLM cost, high confidence
  2. LLM fallback — when rules produce low confidence or ambiguous signals

Always returns actionable, explainable responses with confidence scores.
"""

from typing import Optional, Dict, Any, List, Tuple
from app.schemas.agent_models import (
    AssistRequest, AssistResponse, ActionType, UIHints,
    UserProfile, PageContext, PageSignals, Neurotype,
)
from app.core.config import invoke_with_retry
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from pydantic import BaseModel, Field


# ─── LLM Fallback Schema ─────────────────────────────────────

class LLMDecision(BaseModel):
    """Schema for the LLM fallback classification response."""
    action_type: str = Field(description="One of: simplify, focus, read, tone, vision, ruler, formatting, reader, noop")
    feature_name: str = Field(description="The extension feature key to activate, or empty string for noop")
    explanation: str = Field(description="Plain-language explanation of why this action was chosen")
    confidence: float = Field(description="Confidence score from 0.0 to 1.0")


LLM_PARSER = JsonOutputParser(pydantic_object=LLMDecision)

LLM_PROMPT = ChatPromptTemplate.from_messages([
    ("system", """You are the NeuroRead Accessibility Agent. Given the user's profile, page context, and behavioral signals,
decide the SINGLE best accessibility action to take right now.

Available actions:
- simplify: Simplify complex text to plain language
- focus: Hide distractions and peripheral content
- read: Activate text-to-speech reading
- tone: Analyze emotional tone and implicit meaning
- vision: Explain images/charts in plain language
- ruler: Activate reading ruler for line tracking
- formatting: Apply ADHD-optimized typography
- reader: Open full reader mode overlay
- noop: No action needed right now

Decision priorities:
1. If the user explicitly did something (selected text, clicked image), respond to that.
2. If behavioral signals indicate struggle, suggest the most relevant feature.
3. Match suggestions to the user's neurotype when possible.
4. Prefer noop over low-confidence guesses.

Output strictly valid JSON matching the format instructions."""),
    ("user", """User Profile: neurotype={neurotype}, auto_adapt={auto_adapt}
Page: {page_title} ({content_type}), text_density={text_density}, images={image_count}
Signals: scroll_depth={scroll_depth}, dwell={dwell_time}s, selections={selections}, pace={pace}wpm, long_dwells={long_dwells}, rapid_scrolls={rapid_scrolls}
User Action: {user_action}
Selection: {selection_text}

{format_instructions}""")
])


# ─── Neurotype Configuration ─────────────────────────────────

NEUROTYPE_PRIORITIES: Dict[Neurotype, List[ActionType]] = {
    Neurotype.adhd: [ActionType.formatting, ActionType.focus, ActionType.simplify, ActionType.ruler],
    Neurotype.dyslexia: [ActionType.formatting, ActionType.ruler, ActionType.read, ActionType.simplify],
    Neurotype.autism: [ActionType.tone, ActionType.simplify, ActionType.focus, ActionType.formatting],
    Neurotype.mixed: [ActionType.formatting, ActionType.simplify, ActionType.focus, ActionType.tone, ActionType.ruler],
    Neurotype.none: [ActionType.formatting, ActionType.simplify],
}

ACTION_TO_FEATURE: Dict[ActionType, str] = {
    ActionType.simplify: "simplify",
    ActionType.focus: "focusMode",
    ActionType.read: "read",
    ActionType.tone: "tone",
    ActionType.vision: "imageExplainer",
    ActionType.ruler: "ruler",
    ActionType.formatting: "formatting",
    ActionType.reader: "reader",
    ActionType.noop: "",
}


# ─── Deterministic Rules Engine ──────────────────────────────

def _rule_explicit_action(req: AssistRequest) -> Optional[Tuple[ActionType, str, float, List[str]]]:
    """Handle explicit user actions with high confidence."""
    action = req.user_action.lower().strip()

    if action == "selected_text" and req.selection_text:
        text_len = len(req.selection_text.strip())
        if text_len < 20:
            return None  # Too short, likely accidental

        if req.profile.neurotype == Neurotype.autism:
            return (
                ActionType.tone,
                "Analyzing tone for the selected text to clarify implicit meaning.",
                0.9,
                ["explicit_selection", "autism_profile", "tone_priority"]
            )
        return (
            ActionType.simplify,
            "Simplifying the selected text to make it easier to understand.",
            0.9,
            ["explicit_selection", "simplify_action"]
        )

    if action == "clicked_image" and req.image_context:
        return (
            ActionType.vision,
            "Analyzing the image to provide a plain-language explanation.",
            0.95,
            ["explicit_image_click", "vision_action"]
        )

    if action in ("activate_formatting", "activate_focus", "activate_read",
                   "activate_simplify", "activate_ruler", "activate_tone",
                   "activate_reader", "activate_vision"):
        feature = action.replace("activate_", "")
        try:
            atype = ActionType(feature)
        except ValueError:
            atype = ActionType.noop
        return (
            atype,
            f"Activating {feature} as requested.",
            1.0,
            ["explicit_command"]
        )

    return None


def _rule_behavioral_signals(req: AssistRequest) -> Optional[Tuple[ActionType, str, float, List[str]]]:
    """Infer the best action from behavioral telemetry signals."""
    signals = req.page_signals
    profile = req.profile
    context = req.context
    active = set(signals.features_active)
    reasoning: List[str] = []

    # Don't suggest features that are already active
    def _already_active(action: ActionType) -> bool:
        return ACTION_TO_FEATURE.get(action, "") in active

    # ── Dense text + ADHD profile -> formatting + simplify ──
    if (context.text_density > 0.7 and context.avg_paragraph_length > 150
            and profile.neurotype in (Neurotype.adhd, Neurotype.mixed)
            and not _already_active(ActionType.formatting)):
        reasoning.append("Page has dense text (density={:.1f})".format(context.text_density))
        reasoning.append("Profile is ADHD/mixed — formatting is top priority")
        return (
            ActionType.formatting,
            "This page has dense text that can be hard to read with ADHD. Applying optimized formatting.",
            0.8,
            ["dense_text", "adhd_profile", "auto_formatting"] + reasoning
        )

    # ── Long dwell on paragraphs -> suggest simplify ──
    if signals.long_dwell_paragraphs >= 2 and not _already_active(ActionType.simplify):
        reasoning.append(f"User dwelled >15s on {signals.long_dwell_paragraphs} paragraphs")
        return (
            ActionType.simplify,
            "You seem to be spending a long time on some paragraphs. Simplifying them could help.",
            0.7,
            ["long_dwell", "suggest_simplify"] + reasoning
        )

    # ── Rapid scrolling with low progress -> suggest focus ──
    if (signals.rapid_scroll_events >= 3 and signals.scroll_depth < 0.3
            and not _already_active(ActionType.focus)):
        reasoning.append(f"Rapid scrolling ({signals.rapid_scroll_events}x) with only {signals.scroll_depth:.0%} progress")
        return (
            ActionType.focus,
            "Scrolling quickly without progressing? Focus mode can hide distractions.",
            0.65,
            ["rapid_scroll", "low_progress", "suggest_focus"] + reasoning
        )

    # ── Repeated image clicks -> suggest vision explainer ──
    if signals.image_clicks >= 3 and not _already_active(ActionType.vision):
        reasoning.append(f"User clicked on {signals.image_clicks} images")
        return (
            ActionType.vision,
            "You're interacting with several images. Image explanations can make charts and diagrams clearer.",
            0.8,
            ["frequent_image_clicks", "suggest_vision"] + reasoning
        )

    # ── Low reading pace -> suggest ruler + TTS ──
    if (0 < signals.reading_pace_wpm < 80
            and signals.dwell_time_seconds > 30
            and not _already_active(ActionType.ruler)
            and not _already_active(ActionType.read)):
        reasoning.append(f"Reading pace is low ({signals.reading_pace_wpm:.0f} wpm)")
        action = ActionType.ruler if profile.neurotype == Neurotype.dyslexia else ActionType.read
        label = "reading ruler" if action == ActionType.ruler else "read aloud"
        return (
            action,
            f"Your reading pace suggests the text is challenging. The {label} feature can help.",
            0.6,
            ["low_pace", f"suggest_{label.replace(' ', '_')}"] + reasoning
        )

    # ── Repeated returns to same paragraph -> suggest explanation ──
    if signals.repeated_paragraph_visits >= 3 and not _already_active(ActionType.simplify):
        reasoning.append(f"User returned to the same paragraph {signals.repeated_paragraph_visits} times")
        return (
            ActionType.simplify,
            "You keep returning to the same section. Simplifying it might make it clearer.",
            0.7,
            ["repeated_visits", "suggest_simplify"] + reasoning
        )

    return None


def _rule_page_context(req: AssistRequest) -> Optional[Tuple[ActionType, str, float, List[str]]]:
    """Suggest based on page structure when no behavioral signals are strong."""
    context = req.context
    profile = req.profile
    active = set(req.page_signals.features_active)

    def _already_active(action: ActionType) -> bool:
        return ACTION_TO_FEATURE.get(action, "") in active

    # Very image-heavy page for any user
    if context.image_count > 10 and not _already_active(ActionType.vision):
        return (
            ActionType.vision,
            f"This page has {context.image_count} images. Image explainer can describe charts and diagrams.",
            0.5,
            ["image_heavy_page", "passive_suggestion"]
        )

    # Extremely dense article for any profile
    if (context.total_text_length > 5000 and context.avg_paragraph_length > 200
            and not _already_active(ActionType.formatting)):
        return (
            ActionType.formatting,
            "This is a long, dense article. Optimized formatting can reduce reading fatigue.",
            0.45,
            ["dense_article", "passive_suggestion"]
        )

    return None


# ─── LLM Fallback ────────────────────────────────────────────

def _llm_fallback(req: AssistRequest) -> Tuple[ActionType, str, float, List[str]]:
    """Use the LLM when deterministic rules are inconclusive."""
    try:
        result = invoke_with_retry(
            input_data={
                "neurotype": req.profile.neurotype.value,
                "auto_adapt": str(req.profile.auto_adapt_enabled),
                "page_title": req.context.page_title[:100],
                "content_type": req.context.content_type,
                "text_density": f"{req.context.text_density:.2f}",
                "image_count": str(req.context.image_count),
                "scroll_depth": f"{req.page_signals.scroll_depth:.2f}",
                "dwell_time": f"{req.page_signals.dwell_time_seconds:.0f}",
                "selections": str(req.page_signals.selection_count),
                "pace": f"{req.page_signals.reading_pace_wpm:.0f}",
                "long_dwells": str(req.page_signals.long_dwell_paragraphs),
                "rapid_scrolls": str(req.page_signals.rapid_scroll_events),
                "user_action": req.user_action or "idle",
                "selection_text": req.selection_text[:200] if req.selection_text else "",
                "format_instructions": LLM_PARSER.get_format_instructions(),
            },
            task_name="agent_orchestrator",
            prompt=LLM_PROMPT,
            parser=LLM_PARSER,
        )

        if result:
            try:
                action_type = ActionType(result.get("action_type", "noop"))
            except ValueError:
                action_type = ActionType.noop

            return (
                action_type,
                result.get("explanation", "AI-recommended action."),
                min(1.0, max(0.0, float(result.get("confidence", 0.5)))),
                ["llm_fallback"]
            )
    except Exception as e:
        print(f"[agent_orchestrator] LLM fallback failed: {e}")

    # Safe fallback: noop
    return (
        ActionType.noop,
        "No specific action recommended right now.",
        0.0,
        ["llm_failed", "safe_noop"]
    )


# ─── Main Orchestration Function ─────────────────────────────

def decide_action(request: AssistRequest) -> AssistResponse:
    """
    Central decision function. Runs deterministic rules first,
    falls back to LLM only when needed. Always returns an explainable response.
    """
    reasoning_chain: List[str] = []

    # Tier 1: Explicit user action
    result = _rule_explicit_action(request)
    if result:
        action_type, explanation, confidence, tags = result
        reasoning_chain.append("Rule matched: explicit user action")
        reasoning_chain.extend(tags)
        return _build_response(action_type, explanation, confidence, tags, reasoning_chain, request)

    # Tier 2: Behavioral signals
    result = _rule_behavioral_signals(request)
    if result:
        action_type, explanation, confidence, tags = result
        reasoning_chain.append("Rule matched: behavioral signals")
        reasoning_chain.extend(tags)
        return _build_response(action_type, explanation, confidence, tags, reasoning_chain, request)

    # Tier 3: Page context
    result = _rule_page_context(request)
    if result:
        action_type, explanation, confidence, tags = result
        reasoning_chain.append("Rule matched: page context")
        reasoning_chain.extend(tags)
        return _build_response(action_type, explanation, confidence, tags, reasoning_chain, request)

    # Tier 4: LLM fallback
    reasoning_chain.append("No deterministic rule matched — invoking LLM fallback")
    action_type, explanation, confidence, tags = _llm_fallback(request)
    reasoning_chain.extend(tags)
    return _build_response(action_type, explanation, confidence, tags, reasoning_chain, request)


def _build_response(
    action_type: ActionType,
    explanation: str,
    confidence: float,
    tags: List[str],
    reasoning_chain: List[str],
    request: AssistRequest,
) -> AssistResponse:
    """Build a structured response with UI hints."""
    feature_name = ACTION_TO_FEATURE.get(action_type, "")

    # Retrieve learning modifier
    from app.services.agent_memory import agent_memory
    uid = "default" # request.profile.user_id if provided
    modifier = agent_memory.get_confidence_modifier(uid, feature_name) if feature_name else 0.0
    adjusted_confidence = min(1.0, max(0.0, confidence + modifier))

    # Determine if this should auto-apply or ask
    auto_apply = (
        request.profile.auto_adapt_enabled
        and adjusted_confidence >= 0.75
        and action_type != ActionType.noop
    )

    # Goal and Plan inference
    goal = "Help user read content"
    plan = []
    if action_type == ActionType.formatting:
        goal = "Improve readability for neurodivergent profile"
        plan = ["Apply optimized typography", "Reduce visual clutter"]
    elif action_type == ActionType.simplify:
        goal = "Reduce cognitive load"
        plan = ["Simplify complex sentences", "Offer to read aloud"]
    elif action_type == ActionType.focus:
        goal = "Assist with focus and hide distractions"
        plan = ["Activate focus mode", "Highlight main content"]
    elif action_type == ActionType.vision:
        goal = "Help user understand image"
        plan = ["Extract image details", "Provide plain-language summary"]
    elif action_type == ActionType.noop:
        goal = "Monitor page for friction points"
        plan = ["Stay silent", "Observe user behavior"]
    else:
        goal = f"Apply {feature_name} to assist reading"
        plan = [f"Activate {feature_name}"]

    # Build UI hints
    if action_type == ActionType.noop:
        ui_hints = UIHints(
            toast_message="",
            toast_icon="",
            auto_dismiss_seconds=0,
        )
    elif auto_apply:
        ui_hints = UIHints(
            toast_message=f"✨ Auto-applied: {explanation}",
            toast_icon="✨",
            auto_dismiss_seconds=5,
        )
    else:
        ui_hints = UIHints(
            toast_message=f"💡 Suggestion: {explanation}",
            toast_icon="💡",
            auto_dismiss_seconds=10,
            panel_to_open=feature_name,
        )

    return AssistResponse(
        action_type=action_type,
        feature_name=feature_name,
        dom_action=None,
        explanation=explanation,
        confidence=adjusted_confidence,
        ui_hints=ui_hints,
        telemetry_tags=tags,
        reasoning_chain=reasoning_chain,
        goal=goal,
        plan=plan,
    )


# ─── Agentic Act Function ─────────────────────────────────────

from app.schemas.agent_models import (
    AgentActRequest, AgentActResponse, AgentAction,
)
import asyncio
import uuid


async def run_agent_act(request: AgentActRequest) -> AgentActResponse:
    """
    The agent's perceive→reason→act function.
    Runs voice-intent parsing and image analysis IN PARALLEL,
    then merges results into a prioritised, ordered action list.

    Priority order:
      1. Voice intent (explicit user command — highest priority)
      2. Image analysis (if image was provided)
      3. Context-based suggestion (if neither but page_context present)
    """
    session_id = request.session_id or str(uuid.uuid4())[:8]
    profile    = request.profile or UserProfile()
    actions: List[AgentAction] = []
    speak_parts: List[str] = []

    # ── Build async tasks based on what was provided ──────────
    tasks = {}

    if request.transcription.strip():
        from app.services.voice_intent import parse_intent
        tasks["intent"] = asyncio.to_thread(parse_intent, request.transcription)

    if request.image_base64.strip() or request.user_action == "clicked_image":
        from app.services.screenshot_analyzer import analyze_screenshot
        
        print(f"[agent_act] Received image execution request. Base64 length: {len(request.image_base64)}")
        
        if not request.image_base64.strip():
            # Handle empty image case immediately with structured error
            actions.append(AgentAction(
                action_type="vision",
                feature_name="imageExplainer",
                data={"error": "No image data provided. Please try clicking the image again."},
                confidence=0.0
            ))
            print("[agent_act] Vision skipped: No image_base64 provided.")
        else:
            nt = profile.neurotype.value if profile else ""
            tasks["vision"] = asyncio.to_thread(
                analyze_screenshot,
                request.image_base64,
                request.image_context or "visible image",
                nt,
            )

    goal_str = "Respond to user command"
    plan_list = []
    
    if not tasks and not actions:
        # Nothing actionable was provided — run assist to get a context suggestion
            if request.page_context or request.page_signals:
                assist_req = AssistRequest(
                    profile=profile,
                    context=request.page_context or PageContext(),
                    page_signals=request.page_signals or PageSignals(),
                    user_action=request.user_action or "idle",
                )
                result = decide_action(assist_req)
                goal_str = result.goal
                plan_list = result.plan
                if result.action_type != ActionType.noop and result.confidence >= 0.4:
                    actions.append(AgentAction(
                        action_type="feature",
                        feature_name=result.feature_name,
                        speak=result.explanation,
                        confidence=result.confidence,
                    ))
                    speak_parts.append(result.explanation)
            return AgentActResponse(
                success=True,
                actions=actions,
                speak=" ".join(speak_parts) or "No action needed right now.",
                session_id=session_id,
                goal=goal_str,
                plan=plan_list,
            )

    # ── Run tasks in parallel with individual timeouts ─────────
    INTENT_TIMEOUT = 8.0
    VISION_TIMEOUT = 12.0

    results = {}
    coros = []
    keys  = []

    if "intent" in tasks:
        coros.append(asyncio.wait_for(tasks["intent"], timeout=INTENT_TIMEOUT))
        keys.append("intent")
    if "vision" in tasks:
        coros.append(asyncio.wait_for(tasks["vision"], timeout=VISION_TIMEOUT))
        keys.append("vision")

    raw_results = await asyncio.gather(*coros, return_exceptions=True)
    for k, v in zip(keys, raw_results):
        results[k] = v

    # ── Process intent result (highest priority) ──────────────
    if "intent" in results:
        intent = results["intent"]
        if isinstance(intent, Exception):
            print(f"[agent_act] Intent parsing failed: {intent}")
            actions.append(AgentAction(
                action_type="speak",
                speak="I heard you but couldn't process that command. Please try again.",
                confidence=0.0,
            ))
        elif isinstance(intent, dict):
            atype = intent.get("action_type", "speak")
            if atype == "feature" and intent.get("feature_name"):
                fn = intent["feature_name"]
                spk = f"{fn} activated." if fn != "stop" else "Stopped."
                actions.append(AgentAction(
                    action_type="feature",
                    feature_name=fn,
                    speak=spk,
                    confidence=0.95,
                ))
                speak_parts.append(spk)
            elif atype == "dom_manipulation" and intent.get("dom_action"):
                actions.append(AgentAction(
                    action_type="dom_manipulation",
                    dom_action=intent["dom_action"],
                    speak="Done.",
                    confidence=0.95,
                ))
                speak_parts.append("Done.")
            elif atype == "speak" and intent.get("speak_message"):
                actions.append(AgentAction(
                    action_type="speak",
                    speak=intent["speak_message"],
                    confidence=0.5,
                ))
                speak_parts.append(intent["speak_message"])

    # ── Process vision result (secondary, after intent) ───────
    if "vision" in results:
        vision = results["vision"]
        if isinstance(vision, Exception):
            print(f"[agent_act] Vision analysis failed: {vision}")
            actions.append(AgentAction(
                action_type="vision",
                feature_name="imageExplainer",
                speak="Image analysis failed.",
                data={"error": str(vision)},
                confidence=0.0,
            ))
        else:
            vision_data = {
                "image_type": vision.image_type,
                "title": vision.title,
                "summary": vision.summary,
                "short_label": vision.short_label,
                "image_purpose": vision.image_purpose,
                "explanation": vision.explanation,
                "accessibility_note": vision.accessibility_note,
                "key_facts": vision.key_facts,
                "labels": vision.labels,
                "takeaways": vision.takeaways,
                "extracted_text": vision.extracted_text,
                "why_it_matters": vision.why_it_matters,
                "suggested_action": vision.suggested_action,
                "confidence": vision.confidence,
            }

            spk_vision = vision.accessibility_note or vision.summary or "Image analyzed."

            actions.append(AgentAction(
                action_type="vision",
                feature_name="imageExplainer",
                speak=spk_vision,
                data=vision_data,
                confidence=vision.confidence or 0.8,
            ))

            if "intent" not in results or isinstance(results.get("intent"), Exception):
                speak_parts.append(spk_vision[:200])

    final_speak = " ".join(speak_parts).strip() or "Done."
    
    # Infer goal and plan for the combined action list
    combined_goal = "Respond to user command"
    combined_plan = [a.action_type for a in actions]
    if any(a.action_type == "vision" for a in actions):
        combined_goal = "Provide multi-modal explanation"
        combined_plan.insert(0, "Analyze visual content")

    return AgentActResponse(
        success=True,
        actions=actions,
        speak=final_speak,
        session_id=session_id,
        goal=combined_goal,
        plan=combined_plan,
    )
