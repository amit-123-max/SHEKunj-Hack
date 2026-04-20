"""
NeuroRead AI — cam_analyzer.py
Module: Cognitive Accessibility Metric (CAM) Score
Analyzes page content to score its cognitive load.
"""

from typing import Dict, Any
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from pydantic import BaseModel, Field
from app.core.config import invoke_with_retry

class CAMResponse(BaseModel):
    score: int = Field(description="Integer from 0 to 100 where 100 is perfectly accessible and easy to read, and 0 is extremely dense and complex.")
    rating: str = Field(description="One of: 'Excellent', 'Good', 'Fair', 'Poor'")
    insights: list[str] = Field(description="Exactly 2 brief, actionable insights/recommendations based on the text. Max 10 words each.")

def analyze_cam_score(text_content: str) -> Dict[str, Any]:
    """
    Evaluates the text content and returns a CAM score out of 100.
    """
    parser = JsonOutputParser(pydantic_object=CAMResponse)
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", """You are an expert accessibility evaluator for neurodivergent readers (ADHD, Dyslexia, Autism).
Evaluate the provided text and compute a Cognitive Accessibility Metric (CAM) score.
Consider:
1. Lexical complexity (long/academic words lower the score)
2. Sentence length (long run-on sentences lower the score)
3. Formatting density (large unbroken blocks of text lower the score)

Provide your analysis in strictly valid JSON matching the required schema. Ensure the score is between 0 and 100.
"""),
        ("user", "Text to evaluate:\n{text}\n\n{format_instructions}")
    ])
    
    # Cap text length to avoid giant payloads
    safe_text = text_content[:5000]
    if len(safe_text) < 50:
        return {
            "score": 100,
            "rating": "Excellent",
            "insights": ["Not enough text to analyze.", "Page looks accessible."]
        }
        
    result = invoke_with_retry(
        input_data={"text": safe_text, "format_instructions": parser.get_format_instructions()},
        task_name="cam_analyzer",
        prompt=prompt,
        parser=parser
    )
    
    if result:
        return result
    
    return {
        "score": 50,
        "rating": "Unknown",
        "insights": ["Failed to calculate CAM score.", "Try reloading the page."]
    }
