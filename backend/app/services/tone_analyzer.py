"""
NeuroRead AI — tone_analyzer.py
Module: Content Tone & Emotion Analysis
"""

from typing import Dict, Any
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from pydantic import BaseModel, Field
from app.core.config import invoke_with_retry

class ToneResponse(BaseModel):
    primary_tone: str = Field(description="The dominant tone of the text, e.g., 'Sarcastic', 'Informative', 'Persuasive', 'Hostile', 'Encouraging', 'Satirical'")
    emotional_intensity: str = Field(description="One of: 'Low', 'Medium', 'High'")
    implicit_meaning: str = Field(description="A 1-2 sentence plain-language explanation of what the author actually means. Strip away sarcasm or subtext and be extremely direct.")

def analyze_tone(text_content: str) -> Dict[str, Any]:
    """
    Evaluates text and provides a breakdown of its tone, emotion, and implicit meaning.
    """
    parser = JsonOutputParser(pydantic_object=ToneResponse)
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", """You are an expert reading assistant for adults on the autism spectrum.
Your job is to read the selected text and explicitly define the social, emotional, and pragmatic subtext.
Neurodivergent readers sometimes miss implicit meaning, sarcasm, or unstated intent. 

Read the text and parse out:
1. The primary emotional tone.
2. The intensity of that emotion.
3. The true implicit meaning (translate literal words into what the author is *actually* trying to communicate or accomplish).

Output strictly valid JSON matching the format instructions.
"""),
        ("user", "Text to evaluate:\n{text}\n\n{format_instructions}")
    ])
    
    safe_text = text_content[:3000].strip()
    if len(safe_text) < 10:
        return {
            "primary_tone": "Neutral",
            "emotional_intensity": "Low",
            "implicit_meaning": "Not enough text selected to analyze tone."
        }
        
    result = invoke_with_retry(
        input_data={"text": safe_text, "format_instructions": parser.get_format_instructions()},
        task_name="tone_analyzer",
        prompt=prompt,
        parser=parser
    )
    
    if result:
        return result
    
    return {
        "primary_tone": "Unknown",
        "emotional_intensity": "Low",
        "implicit_meaning": "Failed to analyze text. Please try selecting a different paragraph."
    }
