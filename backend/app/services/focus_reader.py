from typing import List, Dict, Optional
import json
from pydantic import BaseModel, Field
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from app.core.config import invoke_with_retry

# --- ARTICLE MODE SCHEMA ---
class SectionResponse(BaseModel):
    heading: str = Field(description="A short, descriptive heading for this section of the article.")
    points: List[str] = Field(description="A list of concise bullet points that make up this section's content.")

class ReaderResponse(BaseModel):
    title: str = Field(description="The main title or headline of the article.")
    sections: List[SectionResponse] = Field(description="The article broken into logical sections, each with a heading and bullet points.")

article_prompt = PromptTemplate(
    template="""You are an expert in cognitive accessibility and content extraction.
Your task is to take the provided raw scraped text from a web page (which likely includes messy navigation, ads, sidebars, and footer text) and distill it into a clean, sectioned, point-by-point structural format.

RULES:
1. IDENTIFY MAIN CONTENT: Ignore navigation links (e.g. "Home", "About Us", "Log In", "Search"), cookie banners, and footer boilerplate.
2. EXTRACT TITLE: Find the primary headline of the article.
3. ORGANIZE INTO SECTIONS: Group the content into logical sections. Each section MUST have a short descriptive heading and a list of concise bullet points underneath.
4. COGNITIVE ACCESSIBILITY: Keep sentences concise. If a paragraph is dense, split it into multiple points. Do not lose critical information, but do remove fluff.
5. CLEANUP: Do not include generic UI text (like "Share this", "Read more", "Comments").
6. MINIMUM SECTIONS: Always try to produce at least 2-3 sections. If the text is very short, use 1 section.

INPUT TEXT:
{raw_text}

OUTPUT INSTRUCTIONS:
Return ONLY raw JSON matching this exact schema.
NO markdown code fences. NO preamble. NO explanation. Just the JSON object.
{format_instructions}
""",
    input_variables=["raw_text"],
    partial_variables={"format_instructions": JsonOutputParser(pydantic_object=ReaderResponse).get_format_instructions()},
)

article_parser = JsonOutputParser(pydantic_object=ReaderResponse)

# --- FEED MODE SCHEMA ---
class FeedItemResponse(BaseModel):
    title: str = Field(description="The headline or title of the news item/article.")
    link: str = Field(description="The URL linking to the full article.")
    image_url: str = Field(description="The URL of the thumbnail image for the article.")
    summary: str = Field(description="A very concise (1-2 sentence) simplified summary of the headline or snippet.")

class FeedResponse(BaseModel):
    feed: List[FeedItemResponse] = Field(description="The filtered and simplified list of valid news articles/feed items.")

feed_prompt = PromptTemplate(
    template="""You are an expert in cognitive accessibility and content curation.
Your task is to act as a Feed Filter. You will receive a JSON string containing an array of raw "card candidates" extracted from a web page (each containing a link, an image_url, and a text snippet).

RULES:
1. FILTER JUNK: Immediately discard items that look like ads, promotional content, tiny icons, navigation links, or "Click here" spam.
2. SELECT VALID ARTICLES: Only keep items that appear to be genuine news articles, blog posts, or content pieces.
3. REWRITE/SIMPLIFY: For each valid item, rewrite the 'title' if it's too long, and create a highly simplified 'summary' from the text snippet.
4. COGNITIVE ACCESSIBILITY: Keep summaries to 1-2 very short sentences. Use plain language.

RAW CARD CANDIDATES:
{feed_json}

OUTPUT INSTRUCTIONS:
Return ONLY raw JSON matching this exact schema.
NO markdown code fences. NO preamble. NO explanation. Just the JSON object.
{format_instructions}
""",
    input_variables=["feed_json"],
    partial_variables={"format_instructions": JsonOutputParser(pydantic_object=FeedResponse).get_format_instructions()},
)

feed_parser = JsonOutputParser(pydantic_object=FeedResponse)
import re
from langchain_core.runnables import RunnableLambda

def strip_think_tags(text):
    """Strip <think>...</think> blocks from LLM output before JSON parsing."""
    if hasattr(text, 'content'):
        text = text.content
    cleaned = re.sub(r'<think>[\s\S]*?</think>', '', str(text)).strip()
    print(f"[focus-reader] LLM output cleaned: {len(cleaned)} chars")
    return cleaned

strip_think = RunnableLambda(strip_think_tags)

def extract_article(raw_text: str):
    if not raw_text or len(raw_text.strip()) < 50:
        return {"title": "Not enough content", "sections": []}
    
    # Keep chunks small to avoid TPM rate limits (target ~1500 tokens)
    truncated_text = raw_text[:5000]
    res = invoke_with_retry(
        input_data={"raw_text": truncated_text},
        task_name="focus_reader",
        prompt=article_prompt,
        parser=article_parser
    )
    return res if res else {"title": "Not enough content", "sections": []}

def extract_feed(feed_items: List[Dict[str, str]]):
    if not feed_items or len(feed_items) == 0:
        return {"feed": []}
        
    # Restrict to 8 items to save tokens
    candidates = feed_items[:8]
    feed_json_str = json.dumps(candidates)
    res = invoke_with_retry(
        input_data={"feed_json": feed_json_str},
        task_name="focus_reader",
        prompt=feed_prompt,
        parser=feed_parser
    )
    return res if res else {"feed": []}

def extract_reader_content(raw_text: Optional[str] = None, feed_items: Optional[List[Dict[str, str]]] = None, is_feed: bool = False):
    """Distills messy webpage text or feed cards into structured content.
    Runs article first, then feed, sequentially to avoid TPM collisions."""
    import time as _t
    print(f"[focus-reader] extract_reader_content called: raw_text={len(raw_text or '')} chars, feed_items={len(feed_items or [])}, is_feed={is_feed}")
    
    result = {"title": "Focus Reader", "sections": [], "feed": []}
    
    # 1. Article extraction (always runs first if there's meaningful text)
    if raw_text and len(raw_text.strip()) > 300:
        print(f"[focus-reader] Starting ARTICLE extraction ({len(raw_text)} chars)...")
        t0 = _t.time()
        a_res = extract_article(raw_text)
        print(f"[focus-reader] ARTICLE extraction done in {_t.time()-t0:.1f}s -> sections={len(a_res.get('sections',[]))}")
        if a_res and a_res.get("sections") and len(a_res.get("sections", [])) > 0:
            result["title"] = a_res.get("title", "Article Summary")
            result["sections"] = a_res.get("sections", [])
    else:
        print(f"[focus-reader] Skipping article: text too short ({len((raw_text or '').strip())} chars)")
    
    # 2. Feed extraction (only after article is done)
    if feed_items and len(feed_items) >= 4:
        print(f"[focus-reader] Starting FEED extraction ({len(feed_items)} items)...")
        t0 = _t.time()
        f_res = extract_feed(feed_items)
        print(f"[focus-reader] FEED extraction done in {_t.time()-t0:.1f}s -> feed={len(f_res.get('feed',[]))}")
        if f_res and f_res.get("feed"):
            result["feed"] = f_res.get("feed", [])
    else:
        print(f"[focus-reader] Skipping feed: only {len(feed_items or [])} items")
                
    return result
