"""
NeuroRead AI — screenshot_analyzer.py
Accessibility-first, context-aware image intelligence pipeline.
Uses type-specific prompts to give meaningful insights, not just captions.
Supports persona adaptation (ADHD, dyslexia, blind, autism) via system role.
"""

from app.core.config import get_groq_client, retry_llm_call, _active_pool
from app.core.model_pool import model_pool_manager
from app.schemas.agent_models import ScreenshotAnalysis
import json


# ─── Master Accessibility Prompt ────────────────────────────────────────────
# Injected as the USER turn so vision models receive both image + instructions.
# The persona/role instructions go in the SYSTEM turn (see _analyze_with_retry).
# Anti-hallucination rule is enforced explicitly.

ACCESSIBILITY_PROMPT = """You are NeuroRead AI — an expert accessibility image analyst.
Your sole purpose: help neurodivergent and visually impaired users UNDERSTAND images,
not just describe them. Give insight, not captions.

ANTI-HALLUCINATION RULE: If you cannot see a value, number, label, or detail clearly,
omit it. Do NOT guess or invent data. Write "not visible" rather than fabricate.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1 — Classify the image into ONE type:
  photo        → real-world photograph (person, animal, place, object, scene)
  chart        → data visualization (bar, line, pie, scatter, histogram, table)
  diagram      → structural/conceptual illustration (flowchart, architecture, anatomy, circuit)
  screenshot   → UI, app, website, or document capture
  infographic  → mixed visual + text summary (blends data + illustration)
  product      → product or advertisement image
  decorative   → purely decorative, carries no meaningful content

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2 — Always populate THESE GLOBAL FIELDS (all types):

  summary      → 1 sentence. Plain language. Say WHAT the image shows and WHY it matters.
                  Example: "A bar chart comparing monthly sales across four regions, showing Q3 as the peak."
  short_label  → 3–5 words. Used as a badge. No fluff.
                  Example: "Bar chart — Q3 sales" or "Person hiking a mountain"
  image_purpose → 1 sentence: Why is this image placed in this article/page?
                  What does it add that text alone cannot?
                  Example: "Illustrates the trend described in the preceding paragraph."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 3 — Populate TYPE-SPECIFIC fields with genuine depth:

For PHOTO:
  title         → Who/what is shown + what are they doing?
  key_facts     → Up to 4 observable details (color, count, action, expression, setting)
  takeaways     → [1 item] The PURPOSE of this photo. What should the reader take away?
  explanation   → 2–3 plain sentences. Scene, mood, significance. No guessing identities.
  accessibility_note → Describe for a screen-reader user. Include emotional tone if people visible.
  why_it_matters → Why is this image included here?

For CHART:
  title         → Chart title or inferred topic
  key_facts     → Up to 4 specific data points, values, or comparisons VISIBLE in the chart.
                  Only values you can clearly read. Mark unclear values with "~".
  labels        → All axis labels, legend entries, annotations visible
  takeaways     → [1 item] The single clearest insight this chart communicates
  explanation   → Plain English: what is being measured, what the trend is, what changed
  extracted_text → All numbers, labels, units you can see
  accessibility_note → Describe chart structure and data for someone who cannot see it
  why_it_matters → What decision or understanding should this chart inform?

For DIAGRAM:
  title         → What system or concept does this diagram show?
  key_facts     → Key components, relationships, or steps visible
  labels        → All labeled elements
  takeaways     → [1 item] What the reader is supposed to understand from this diagram
  explanation   → Walk through the diagram logically (left-to-right or top-to-bottom)
  extracted_text → All visible text
  accessibility_note → Linear description of the flow or structure

For SCREENSHOT:
  title         → What app, website, or document is shown?
  key_facts     → What is the user being shown or asked to do?
  labels        → Button labels, menu items, field names visible
  takeaways     → [1 item] The main action or decision point visible
  explanation   → Describe what is on screen and what the user should notice
  extracted_text → All visible interface text
  accessibility_note → What is the most important interactive element?
  suggested_action → What should the user do next based on what they see?

For INFOGRAPHIC:
  title         → Topic of the infographic
  key_facts     → Up to 4 key statistics or claims (only clearly readable ones)
  takeaways     → [1 item] The core message in one plain sentence
  explanation   → Summarize logically (top-to-bottom or section by section)
  extracted_text → All visible text

For PRODUCT:
  title         → Product name and category
  key_facts     → Key visual features (color, size, visible features, brand name)
  takeaways     → [1 item] Who this product is for and what it does
  explanation   → Brief description of what the user is looking at
  accessibility_note → Describe for someone shopping with a screen reader

For DECORATIVE:
  title         → "Decorative Image"
  explanation   → "This image is decorative and does not carry meaningful information."
  confidence    → 0.99

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 4 — Output ONLY a single valid JSON object.
No markdown. No preamble. No explanation outside the JSON.
All arrays must be non-null (use [] if empty). All strings: use "" if not applicable.
confidence: 0.0 (cannot determine) → 1.0 (very certain).

REQUIRED JSON SCHEMA (all keys must be present):
{
  "image_type": "",
  "title": "",
  "summary": "",
  "short_label": "",
  "image_purpose": "",
  "key_facts": [],
  "labels": [],
  "takeaways": [],
  "extracted_text": "",
  "explanation": "",
  "accessibility_note": "",
  "why_it_matters": "",
  "suggested_action": "",
  "confidence": 0.0
}
"""


# ─── Persona System Prompts ──────────────────────────────────────────────────
# These go into the SYSTEM role so Groq Vision actually enforces them.
# In the user content turn, only the image + main prompt appear.

PERSONA_SYSTEM = {
    "blind": (
        "The user is blind and relies entirely on text-to-speech. "
        "Make ALL descriptions linear and auditory-friendly. "
        "Prioritize 'accessibility_note' above all other text fields — it must be richly detailed. "
        "Never use spatial terms like 'on the left' — instead say 'the first item listed'. "
        "The 'summary' field must be a complete standalone sentence a screen reader can announce. "
        "Keep sentences short and natural to speak aloud."
    ),
    "adhd": (
        "The user has ADHD. Use extremely short sentences throughout. "
        "Limit 'key_facts' to 2 items maximum. Limit 'takeaways' to 1 item. "
        "'explanation' must be under 25 words. Lead with the single most important fact. "
        "'summary' must be under 15 words. Make every word count."
    ),
    "dyslexia": (
        "The user has dyslexia. Use only simple, everyday words — no jargon or technical terms. "
        "No complex sentence structures. Each sentence in 'explanation' must be under 12 words. "
        "'summary' must use the simplest words possible. "
        "Prefer short words over long ones throughout."
    ),
    "autism": (
        "The user has autism. Provide structured, predictable, and literal output only. "
        "Avoid metaphors, idioms, and figures of speech. "
        "Be precise and factual. Do not infer emotions unless they are explicitly and clearly visible. "
        "'explanation' should follow a consistent structure: what, where, how. "
        "'summary' must be a factual statement, not a judgment."
    ),
}

# Default system prompt used when no neurotype is set
DEFAULT_SYSTEM = (
    "You are NeuroRead AI, an expert accessibility analyst. "
    "Your job is to help all users — including those with visual, cognitive, or learning disabilities — "
    "understand images in a meaningful, insightful way. "
    "Always be factual, clear, and genuinely helpful. Never fabricate details you cannot see."
)


def analyze_screenshot(image_base64: str, context: str = "", neurotype: str = "") -> ScreenshotAnalysis:
    """
    Analyze an image using a context-aware, accessibility-first prompt.
    Adapts output depth and style based on the user's neurotype profile.
    Returns a ScreenshotAnalysis with all required fields populated.
    """
    _active_pool.set("vision_pool")
    try:
        raw = _analyze_with_retry(image_base64, context, neurotype)
        return _parse_response(raw)
    except Exception as e:
        print(f"[screenshot_analyzer] Fatal error after retries: {e}")
        return ScreenshotAnalysis(
            image_type="unknown",
            title="Analysis Unavailable",
            summary="Image analysis could not be completed.",
            short_label="Analysis failed",
            image_purpose="",
            explanation="Could not analyze this image. The vision service returned an error.",
            accessibility_note="Image analysis failed. Please try again or describe the image manually.",
            why_it_matters="",
            suggested_action="Try clicking the image again, or reload the page.",
            confidence=0.0,
        )


@retry_llm_call
def _analyze_with_retry(image_base64: str, context: str = "", neurotype: str = "") -> str:
    """Send image to the vision model with the accessibility-first prompt.
    Persona instructions go in the system role; image + analysis prompt in the user role."""
    client = get_groq_client()
    model = model_pool_manager.get_current_model("vision_pool")

    if not model:
        raise Exception("All vision models are currently rate-limited.")

    nt_key = neurotype.lower().strip() if neurotype else ""
    print(f"[screenshot_analyzer] 🎯 Model: {model} | neurotype: {nt_key or 'default'}")

    # Ensure proper data URL format
    if not image_base64.startswith("data:"):
        image_base64 = f"data:image/png;base64,{image_base64}"

    # System role: persona + base role (this is what the model respects most)
    system_content = PERSONA_SYSTEM.get(nt_key, DEFAULT_SYSTEM)

    # User turn: image + main analysis prompt + page context
    context_suffix = (
        f"\n\nPage context (use this to infer why this image is here and what it adds): {context[:400]}"
        if context else ""
    )
    user_text = ACCESSIBILITY_PROMPT + context_suffix

    user_content = [
        {
            "type": "image_url",
            "image_url": {"url": image_base64}
        },
        {
            "type": "text",
            "text": user_text
        }
    ]

    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_content},
            {"role": "user",   "content": user_content},
        ],
        max_tokens=1100,   # raised from 800 — charts/diagrams need the space
        temperature=0.10,  # lowered from 0.15 for tighter, more consistent JSON
    )
    return response.choices[0].message.content.strip()


def _parse_response(raw_text: str) -> ScreenshotAnalysis:
    """Parse the raw LLM JSON into a ScreenshotAnalysis, with multi-stage fallback."""
    text = raw_text.strip()

    # Strip markdown code fences if present
    if text.startswith("```"):
        lines = text.split("\n")
        inner = lines[1:] if len(lines) > 1 else lines
        if inner and inner[-1].strip() == "```":
            inner = inner[:-1]
        text = "\n".join(inner).strip()

    # Secondary: find first { and last } in case of preamble
    if not text.startswith("{"):
        start = text.find("{")
        end   = text.rfind("}")
        if start != -1 and end != -1:
            text = text[start:end+1]

    try:
        data = json.loads(text)
        image_type = str(data.get("image_type", "unknown")).lower()

        # Derive a fallback short_label from image_type + title if the model omitted it
        raw_label   = data.get("short_label", "") or ""
        raw_summary = data.get("summary", "")     or ""
        raw_purpose = data.get("image_purpose", "") or ""

        if not raw_label and image_type and image_type != "unknown":
            raw_title = (data.get("title") or "")[:40]
            raw_label = f"{image_type.capitalize()}" + (f" — {raw_title}" if raw_title else "")

        return ScreenshotAnalysis(
            image_type       = image_type,
            title            = data.get("title", "")          or "",
            summary          = raw_summary,
            short_label      = raw_label,
            image_purpose    = raw_purpose,
            key_facts        = _ensure_list(data.get("key_facts")),
            labels           = _ensure_list(data.get("labels")),
            takeaways        = _ensure_list(data.get("takeaways")),
            extracted_text   = data.get("extracted_text", "")  or "",
            explanation      = data.get("explanation", raw_text[:300]) or "",
            accessibility_note = data.get("accessibility_note", "") or "",
            why_it_matters   = data.get("why_it_matters", "")  or "",
            suggested_action = data.get("suggested_action", "") or "",
            confidence       = min(1.0, max(0.0, float(data.get("confidence", 0.5)))),
        )
    except (json.JSONDecodeError, KeyError, TypeError, ValueError) as e:
        print(f"[screenshot_analyzer] Parse error ({type(e).__name__}): {e}")
        print(f"[screenshot_analyzer] Raw text was: {raw_text[:200]}")
        # Graceful fallback: return what we have as explanation
        return ScreenshotAnalysis(
            image_type="unknown",
            title="Image Analysis",
            summary="",
            short_label="",
            image_purpose="",
            explanation=raw_text[:500] if raw_text else "Unable to parse image analysis.",
            accessibility_note="Structured analysis failed. Raw model output is shown.",
            confidence=0.2,
        )


def _ensure_list(val) -> list:
    """Ensure a value is a non-null list of strings."""
    if isinstance(val, list):
        return [str(v) for v in val if v]
    if isinstance(val, str) and val:
        return [val]
    return []
