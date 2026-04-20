"""
NeuroRead AI — agent.py
Router for the Adaptive Accessibility Agent.
Provides endpoints for orchestration, profiles, feedback, and screenshot analysis.
"""

import asyncio
from fastapi import APIRouter, HTTPException

from app.schemas.agent_models import (
    AssistRequest, AssistResponse,
    UserProfile, ProfileResponse,
    FeedbackRequest, FeedbackResponse,
    ScreenshotRequest, ScreenshotResponse, ScreenshotAnalysis,
    ConvertRequest, ConvertResponse, ConvertResult,
    AgentActRequest, AgentActResponse, AgentAction,
    AgentObserveRequest, AgentObserveResponse,
)
from app.services.agent_orchestrator import decide_action, run_agent_act
from app.services.profile_store import profile_store
from app.services.feedback_store import feedback_store
from app.services.screenshot_analyzer import analyze_screenshot
from app.services.cam_analyzer import analyze_cam_score
from app.services.text_simplifier import simplify_text_chunks

router = APIRouter(tags=["agent"])


# ─── Orchestration ────────────────────────────────────────────

@router.post("/assist", response_model=AssistResponse)
async def assist_endpoint(request: AssistRequest):
    """
    Central orchestration endpoint.
    Receives page context + user profile, returns the best accessibility action.
    """
    try:
        response = await asyncio.to_thread(decide_action, request)
        return response
    except Exception as e:
        print(f"[agent] /assist error: {e}")
        return AssistResponse(
            action_type="noop",
            explanation="An error occurred while processing your request.",
            confidence=0.0,
            telemetry_tags=["error", str(type(e).__name__)],
        )


# ─── Agentic Loop ───────────────────────────────────

@router.post("/agent/act", response_model=AgentActResponse)
async def agent_act_endpoint(request: AgentActRequest):
    """
    Unified agentic act endpoint.
    Accepts any combination of:
      - transcription (voice command text)
      - image_base64  (image to analyse)
      - page context + profile (for context-based suggestions)
    Runs intent parsing and vision analysis IN PARALLEL.
    Returns an ordered list of actions for the frontend to execute.
    Never hangs: hard 14s ceiling, always returns a usable response.
    """
    HARD_TIMEOUT = 14.0  # absolute ceiling including parallel tasks
    try:
        response = await asyncio.wait_for(
            run_agent_act(request),
            timeout=HARD_TIMEOUT,
        )
        return response
    except asyncio.TimeoutError:
        print("[agent] /agent/act global timeout after 14s")
        return AgentActResponse(
            success=False,
            actions=[AgentAction(
                action_type="speak",
                speak="That took too long. Please try again.",
                confidence=0.0,
            )],
            speak="That took too long. Please try again.",
            session_id=request.session_id or "",
            error="global_timeout",
        )
    except Exception as e:
        print(f"[agent] /agent/act error: {e}")
        return AgentActResponse(
            success=False,
            actions=[AgentAction(
                action_type="speak",
                speak="Something went wrong. Please try again.",
                confidence=0.0,
            )],
            speak="Something went wrong. Please try again.",
            session_id=request.session_id or "",
            error=str(e),
        )


@router.post("/agent/observe", response_model=AgentObserveResponse)
async def agent_observe_endpoint(request: AgentObserveRequest):
    """
    Outcome logging endpoint.
    Called by the frontend after an agent action is applied, dismissed, or errors.
    Used for future profile adaptation and telemetry. Always returns immediately.
    """
    try:
        outcome_str = (
            f"[agent/observe] session={request.session_id} "
            f"action={request.action_type}/{request.feature_name} "
            f"outcome={request.outcome} latency={request.latency_ms}ms "
            f"neurotype={request.neurotype or 'none'}"
        )
        print(outcome_str)

        # Persist to feedback store for future analysis
        from app.services.feedback_store import feedback_store
        from app.schemas.agent_models import FeedbackEntry, FeedbackRating
        import time
        try:
            # Map outcome to feedback rating
            rating_map = {
                "accepted":     FeedbackRating.helpful,
                "auto_applied": FeedbackRating.helpful,
                "dismissed":    FeedbackRating.too_strong,
                "error":        FeedbackRating.wrong_feature,
            }
            rating = rating_map.get(request.outcome, FeedbackRating.helpful)
            entry = FeedbackEntry(
                action_type=request.action_type or "unknown",
                feature_name=request.feature_name or "",
                rating=rating,
                page_url=request.page_url or "",
                profile_neurotype=request.neurotype or "",
                timestamp=time.time(),
                notes=f"latency={request.latency_ms}ms | session={request.session_id}",
            )
            feedback_store.store_entries([entry])
            
            # Update memory model
            from app.services.agent_memory import agent_memory
            # we use session_id or 'default' as user_id for now
            uid = "default" # ideally tied to profile user_id, but ok for now
            if request.feature_name:
                agent_memory.update_feedback(uid, request.feature_name, request.outcome)
                
        except Exception as fb_err:
            print(f"[agent/observe] feedback store error (non-fatal): {fb_err}")

        return AgentObserveResponse(success=True, message="Observation recorded.")
    except Exception as e:
        print(f"[agent] /agent/observe error: {e}")
        return AgentObserveResponse(success=False, message=str(e))


@router.get("/agent/memory")
async def get_agent_memory(user_id: str = "default"):
    """Expose the agent's learned memory for the user."""
    from app.services.agent_memory import agent_memory
    mem = agent_memory.get_user_memory(user_id)
    return {"success": True, "memory": mem}

# ─── Profile Management ──────────────────────────────────────

@router.get("/profile", response_model=ProfileResponse)
async def get_profile(user_id: str = "default"):
    """Retrieve the user's accessibility profile."""
    try:
        profile = profile_store.get_profile(user_id)
        return ProfileResponse(success=True, profile=profile)
    except Exception as e:
        return ProfileResponse(success=False, message=str(e))


@router.post("/profile", response_model=ProfileResponse)
async def save_profile(profile: UserProfile):
    """Save or update a user's accessibility profile."""
    try:
        profile_store.save_profile(profile)
        return ProfileResponse(success=True, profile=profile, message="Profile saved.")
    except Exception as e:
        return ProfileResponse(success=False, message=str(e))


@router.post("/profile/reset", response_model=ProfileResponse)
async def reset_profile(user_id: str = "default"):
    """Reset a user's profile to defaults."""
    try:
        profile = profile_store.reset_profile(user_id)
        return ProfileResponse(success=True, profile=profile, message="Profile reset to defaults.")
    except Exception as e:
        return ProfileResponse(success=False, message=str(e))


# ─── Feedback ─────────────────────────────────────────────────

@router.post("/feedback", response_model=FeedbackResponse)
async def submit_feedback(request: FeedbackRequest):
    """Submit user feedback on agent actions."""
    try:
        count = feedback_store.store_entries(request.entries)
        return FeedbackResponse(success=True, stored_count=count)
    except Exception as e:
        print(f"[agent] /feedback error: {e}")
        return FeedbackResponse(success=False, stored_count=0)


# ─── Screenshot Analysis ─────────────────────────────────────

@router.post("/analyze-screenshot", response_model=ScreenshotResponse)
async def analyze_screenshot_endpoint(request: ScreenshotRequest):
    """Analyze a screenshot/image for OCR, chart data, diagram explanation.
    Returns ScreenshotResponse: { success, analysis: ScreenshotAnalysis, error }.
    Guaranteed to respond within ~10 seconds regardless of Groq response time.
    """
    if not request.image_base64:
        raise HTTPException(status_code=400, detail="No image data provided")

    VISION_TIMEOUT = 10  # hard ceiling — Groq Vision can be slow on cold start

    try:
        analysis = await asyncio.wait_for(
            asyncio.to_thread(
                analyze_screenshot,
                request.image_base64,
                request.context,
                request.neurotype,   # persona adaptation
            ),
            timeout=VISION_TIMEOUT,
        )
        return ScreenshotResponse(success=True, analysis=analysis)
    except asyncio.TimeoutError:
        print("[agent] /analyze-screenshot timed out after 10s")
        return ScreenshotResponse(
            success=False,
            analysis=ScreenshotAnalysis(
                image_type="timeout",
                title="Analysis Timeout",
                explanation="The vision model did not respond in time. Please try again.",
                confidence=0.0,
            ),
            error="Vision model timed out",
        )
    except Exception as e:
        print(f"[agent] /analyze-screenshot error: {e}")
        return ScreenshotResponse(success=False, error=str(e))



# ─── Universal Convert Pipeline ───────────────────────────

@router.post("/convert", response_model=ConvertResponse)
async def convert_endpoint(request: ConvertRequest):
    """
    Unified accessibility conversion pipeline.
    Runs CAM scoring, identifies improvements, and returns a structured
    before/after report the frontend can display to the user.
    This powers the 'Convert This Page' button's backend intelligence.
    """
    try:
        text = (request.text_content or "").strip()
        profile = request.profile or UserProfile()

        if not text:
            return ConvertResponse(
                success=False,
                error="No text content provided for conversion analysis."
            )

        # Step 1: Get baseline CAM score
        cam_data = await asyncio.to_thread(analyze_cam_score, text)
        before_score = cam_data.get("score", 35)
        before_rating = cam_data.get("rating", "Poor")
        insights = cam_data.get("insights", [])

        # Step 2: Determine which steps will be applied based on content analysis
        steps: list[ConvertResult] = []

        # Typography improvement — always beneficial
        steps.append(ConvertResult(
            name="Typography Optimization",
            applied=True,
            description="Dyslexia-friendly font, wider line height, and reduced line width applied."
        ))

        # Simplification — beneficial for long/complex text
        word_count = len(text.split())
        avg_word_len = sum(len(w) for w in text.split()) / max(1, word_count)
        needs_simplify = avg_word_len > 5.5 or word_count > 100
        if needs_simplify:
            # Run actual simplification on a sample
            sample_chunk = text[:800]
            simplified = await asyncio.to_thread(simplify_text_chunks, [sample_chunk])
            simplify_success = bool(simplified and simplified[0] != sample_chunk)
            steps.append(ConvertResult(
                name="AI Text Simplification",
                applied=simplify_success,
                description="Complex sentences broken down to plain language." if simplify_success
                            else "Text was already fairly simple."
            ))
        else:
            steps.append(ConvertResult(
                name="AI Text Simplification",
                applied=False,
                description="Text complexity is within accessible range — simplification not needed."
            ))

        # Focus mode — beneficial for all long pages
        focus_needed = word_count > 200
        steps.append(ConvertResult(
            name="Distraction Removal",
            applied=focus_needed,
            description="Ads, popups, and sidebar clutter hidden." if focus_needed
                        else "Page appears clean already."
        ))

        # Step 3: Compute estimated after score
        bonus = 0
        applied_count = sum(1 for s in steps if s.applied)
        bonus += 15  # typography
        if needs_simplify:
            bonus += 25  # simplification
        if focus_needed:
            bonus += 10  # focus

        # Neurotype-specific bonus
        if profile.neurotype.value in ("adhd", "mixed"):
            bonus += 5
        elif profile.neurotype.value == "dyslexia":
            bonus += 8

        after_score = min(100, before_score + bonus)
        improvement = after_score - before_score

        def _rating(score: int) -> str:
            if score >= 80: return "Excellent"
            if score >= 60: return "Good"
            if score >= 40: return "Fair"
            return "Needs Help"

        explanation = (
            f"Page converted with {applied_count} accessibility improvement(s). "
            f"Cognitive load reduced from {before_rating} to {_rating(after_score)}. "
            + (f"Key issue: {insights[0]}" if insights else "")
        )

        return ConvertResponse(
            success=True,
            cam_before=before_score,
            cam_after=after_score,
            cam_improvement=improvement,
            rating_before=before_rating,
            rating_after=_rating(after_score),
            steps_applied=steps,
            explanation=explanation,
        )

    except Exception as e:
        print(f"[agent] /convert error: {e}")
        return ConvertResponse(success=False, error=str(e))
