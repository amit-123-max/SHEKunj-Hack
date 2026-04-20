import os
import json
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from app.core.config import invoke_with_retry

load_dotenv()

# Define the expected JSON output structure
class SiteSelectors(BaseModel):
    # Core Selectors
    title_selector: str = Field(description="The CSS selector for the main article title.")
    body_selector: str = Field(description="The CSS selector targeting the main reading paragraph elements.")
    header_selectors: str = Field(description="The CSS selector targeting section headings.")
    exclusions: str = Field(description="CSS selector for elements to IGNORE (e.g., math, sup, nav, footer).")
    thumbnail_selector: str = Field(description="CSS selector for article images or thumbnails.")
    
    # GROUP A: Typography
    base_font_size: str = Field(description="Large font size (22px-26px).")
    line_height: str = Field(description="Generous line height (1.85-2.1).")
    font_family: str = Field(description="High-legibility geometric sans-serif.")
    text_align: str = Field(description="'left' (Never justify).")
    max_line_width: str = Field(description="Line length (e.g., 680px or 65ch).")
    letter_spacing: str = Field(description="Slightly open letter spacing (0.01em-0.03em).")
    word_spacing: str = Field(description="Open word spacing (0.05em-0.1em).")
    override_italic: bool = Field(description="Set to true to replace italics with normal font-weight 500.")
    
    # GROUP B: Color & Contrast
    background_color: str = Field(description="Warm cream or pale sepia background.")
    text_color: str = Field(description="Rich dark charcoal text color.")
    heading_color: str = Field(description="Deep saturated color for headings.")
    accent_color: str = Field(description="High-energy warm hue for bold/highlighted concepts.")
    override_background_image: bool = Field(description="Set to true to force background-image: none.")
    
    # GROUP C: Spacing & Layout
    paragraph_spacing: str = Field(description="Moderate margin-bottom on paragraphs (0.8em-1.2em).")
    heading_margin_top: str = Field(description="Moderate margin-top before headings (1.2em-1.8em).")
    content_max_width: str = Field(description="Constrained central column width (740px-820px).")
    list_indent: str = Field(description="Minimal list indentation (16px-20px).")
    list_item_spacing: str = Field(description="Comfortable spacing between list items (0.3em-0.5em).")
    
    # GROUP D: Visual Clutter
    image_display_style: str = Field(description="'block' display for images with generous top/bottom margins.")
    border_style: str = Field(description="Minimal or no decorative borders.")
    remove_decorative_shadows: bool = Field(description="Set to true to force box-shadow and text-shadow to none.")

prompt_template = PromptTemplate(
    template="""You are a senior Cognitive Accessibility Engineer and Frontend Developer with deep expertise in ADHD, dyslexia, and neurodivergent UX research.
You are building 'NeuroRead AI' — a browser extension that surgically rewrites websites to eliminate every known ADHD reading barrier.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TASK 1 — STRUCTURAL EXTRACTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
From the HTML skeleton below, extract the CSS selectors for:
- The main article/content container
- Body paragraph text (p, li, td, blockquote, etc.)
- All heading levels (h1–h4)
- Inline images within the content
- Pull-quotes and highlighted callouts

IGNORE AND EXCLUDE: navbars, sidebars, footers, cookie banners, social share bars, ad containers, comment sections, modals, sticky headers, newsletter popups.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TASK 2 — ADHD-OPTIMIZED CSS GENERATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Generate precise CSS values that counteract ALL of the following ADHD pain points. 
For each pain point, I describe the neurological/cognitive problem and the exact CSS fix required.

────────────────────────────────────
GROUP A: TYPOGRAPHY — The #1 Source of Reading Failure
────────────────────────────────────

PAIN A1 — "Walls of text" trigger immediate executive shutdown.
Dense paragraphs with no visual breathing room cause the ADHD brain to perceive reading as an insurmountable task before a single word is processed.
→ FIX: Set 'base_font_size' very large (22px–26px). Set 'line_height' very generous (1.85–2.1). This is not aesthetic — it is triage.

PAIN A2 — Serif fonts and decorative typefaces increase cognitive load for ADHD/dyslexic readers.
Serif letter forms have more visual "noise" per character. The brain must decode each letterform rather than pattern-matching it.
→ FIX: Set 'font_family' to a high-legibility geometric sans-serif. Preferred order: 'Atkinson Hyperlegible', 'OpenDyslexic', 'Inter', 'Helvetica Neue', sans-serif. These fonts have maximum character distinctiveness (no mirrored b/d/p/q ambiguity).

PAIN A3 — Justified text creates "rivers" — irregular white-space channels that draw the ADHD eye off the line of text.
The eye involuntarily tracks these vertical rivers instead of horizontal text, causing mid-sentence attention breaks.
→ FIX: Set 'text_align' to 'left'. Never justify. Left-aligned text has a consistent ragged right edge which actually helps the eye reset to the start of the next line.

PAIN A4 — Long line lengths exhaust working memory. The reader loses their place when the return sweep from end-of-line to start-of-next-line is too wide.
→ FIX: Set 'max_line_width' to a value representing 60–70 characters (approximately '680px' or '65ch'). This is backed by the Baymard Institute and WCAG 2.1 guidance.

PAIN A5 — Tight letter-spacing makes individual characters blur together during rapid ADHD eye movement (saccades).
→ FIX: Set 'letter_spacing' slightly open (0.01em–0.03em for body text). Set 'word_spacing' to '0.05em'–'0.1em' for additional inter-word clarity.

PAIN A6 — Italics are nearly impossible for many ADHD/dyslexic readers. Slanted glyphs lose their distinctive silhouette.
→ FIX: Set 'override_italic' to true — replace all italic usage with 'font-style: normal; font-weight: 500' so emphasis is expressed through weight, not slant.

────────────────────────────────────
GROUP B: COLOR & CONTRAST — Sensory Overload Prevention
────────────────────────────────────

PAIN B1 — Pure white (#FFFFFF) backgrounds cause photosensitive glare and visual fatigue, especially for ADHD brains with heightened sensory sensitivity (common comorbidity).
The high-frequency light from white screens triggers over-stimulation and speeds up mental exhaustion.
→ FIX: Set 'background_color' to a warm, slightly off-white cream or pale sepia (e.g. '#FAFAF5', '#FDF6E3', '#F8F5F0'). This reduces apparent brightness by ~15% without darkening the page meaningfully.

PAIN B2 — Pure black (#000000) text on white causes "halation" — a shimmer/vibration effect at the text edges, especially on glossy screens. This is a known trigger for Irlen Syndrome (visual stress), which co-occurs in ~30% of people with ADHD.
→ FIX: Set 'text_color' to a rich dark charcoal (e.g. '#1A1A2E', '#2D3748', '#2C2C2C'). Retains readability while eliminating edge flicker.

PAIN B3 — Insufficient visual hierarchy between headings and body text means the ADHD brain cannot quickly locate "anchor points" to orient itself when attention is lost mid-page.
→ FIX: Set 'heading_color' to a bold, distinctly different hue from body text — a deep saturated color (e.g. '#4A1D96' deep violet, '#1A365D' navy, '#134E4A' dark teal). This creates unmistakable visual landmarks while scrolling.

PAIN B4 — Key terms and bolded concepts are invisible when bold styling is only slightly heavier than body weight. ADHD readers rely on scanning bold text as a rapid-comprehension strategy.
→ FIX: Set 'accent_color' to a high-energy, warm hue (e.g. '#D97706' amber, '#C2410C' burnt orange, '#7C3AED' bright purple) for <strong> and <b> elements. This makes bolded concepts visually "pop" as semantic anchors during rapid eye movement.

PAIN B5 — Background images, textures, or watermarks behind text catastrophically destroy readability for ADHD readers who cannot filter visual noise.
→ FIX: Set 'override_background_image' to true — force 'background-image: none' on the content container.

────────────────────────────────────
GROUP C: SPACING & LAYOUT — Structural Calm
────────────────────────────────────

PAIN C1 — Tiny paragraph spacing makes text feel like one continuous mass. ADHD readers need visual "breathing gaps" between ideas to signal mental chunking.
→ FIX: Set 'paragraph_spacing' moderate (0.8em–1.2em of margin-bottom on <p>). Paragraphs should breathe but not create huge empty gaps.

PAIN C2 — Tight heading-to-content spacing makes section breaks invisible. The ADHD brain needs an unmistakable visual signal that a new idea is beginning.
→ FIX: Set 'heading_margin_top' generously (2.5em–3em). This creates a clear "section break" cue before each heading.

PAIN C3 — Full-width content columns on large monitors create line lengths that trigger attention loss on return sweeps. Even with good font size, a 1600px-wide paragraph is unreadable for ADHD.
→ FIX: Set 'content_max_width' to '740px'–'820px' and center the column. Constraining column width is as important as font size.

PAIN C4 — Deeply indented or complex nested list structures overwhelm working memory. Multi-level bullet trees force the reader to track hierarchy while also processing content.
→ FIX: Set 'list_indent' to a minimal value (16px–20px). Set 'list_item_spacing' generously (0.6em–0.9em between items) to separate each thought.

────────────────────────────────────
GROUP D: VISUAL CLUTTER — Attention Hijacking
────────────────────────────────────

PAIN D1 — Images and media embedded mid-paragraph break reading flow. The ADHD brain involuntarily context-switches to analyze the image, losing the paragraph's thread.
→ FIX: Set 'image_display_style' to 'block' with generous margin (2em top/bottom) so images are clearly separated from text — not inline interruptions.

PAIN D2 — Borders, dividers, and decorative horizontal rules fragment the page into competing zones, splitting attention.
→ FIX: Set 'border_style' to 'minimal' — use only subtle left-border accents ('3px solid' + 'accent_color' at 30% opacity) on blockquotes; remove all decorative borders elsewhere.

PAIN D3 — Shadows, gradients, and textured backgrounds create low-level visual complexity that continuously draws attention away from text. Even subtle CSS box-shadows register as visual noise for ADHD.
→ FIX: Set 'remove_decorative_shadows' to true — force 'box-shadow: none; text-shadow: none' on content elements.

────────────────────────────────────
SUMMARY OBJECTIVE:
────────────────────────────────────
The goal is a page that feels like a well-typeset book: calm, spacious, consistent, and visually boring — in the best possible way.
ADHD brains perform best when zero cognitive effort is spent on parsing the interface itself.
Every value you output should push the page toward: generous whitespace, muted warm palette, strong typographic hierarchy, constrained column width, and zero visual noise.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HTML SKELETON INPUT:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{skeleton}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT INSTRUCTIONS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Return ONLY raw JSON matching this exact schema.
NO markdown code fences. NO preamble. NO explanation. Just the JSON object.
{format_instructions}
""",
    input_variables=["skeleton"],
    partial_variables={"format_instructions": JsonOutputParser(pydantic_object=SiteSelectors).get_format_instructions()},
)

parser = JsonOutputParser(pydantic_object=SiteSelectors)

def generate_css_map(html_skeleton: str) -> dict:
    """Takes a raw HTML skeleton and uses Groq Llama 3 to return safe CSS selectors."""
    response = invoke_with_retry(
        input_data={"skeleton": html_skeleton},
        task_name="dom_mapper",
        prompt=prompt_template,
        parser=parser
    )
    
    if response:
        return response
        
    print("[DOM Mapper] Error or Rate Limit Exceeded. Using hardcoded fallback.")
    return {
        "title_selector": "h1",
        "body_selector": "p",
        "header_selectors": "h2, h3, h4",
        "exclusions": "sup, sub, nav, footer, style, script, SVG, math",
        "thumbnail_selector": "img"
    }
