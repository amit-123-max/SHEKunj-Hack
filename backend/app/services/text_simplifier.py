import os
from typing import List
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from app.core.config import invoke_with_retry

load_dotenv()

class SimplificationResponse(BaseModel):
    simplified_chunks: List[str] = Field(description="The simplified text chunks corresponding to the inputs.")

prompt_template = PromptTemplate(
    template="""You are an expert in cognitive accessibility, specifically writing for ADHD and Autism.
Your task is to simplify the provided text chunks to an 'Explain Like I'm 5' (ELI5) level.

RULES FOR SIMPLIFICATION:
1. USE EXTREMELY SIMPLE LANGUAGE. If a word has more than 3 syllables, try to find a simpler one.
2. AGGRESSIVE BREVITY: Reduce the word count by at least 40-50%.
3. REMOVE ALL JARGON: Replace technical terms with easy-to-understand analogies or descriptions.
4. ONE IDEA PER SENTENCE: Split every sentence that contains 'and', 'but', or 'which' into two short sentences.
5. NO FILLER: Start directly with the simplified content.
6. TARGET AUDIENCE: Write as if you are explaining this to a 10-year-old with short attention span.
7. FORMAT AS BULLETS: Return the simplified text as a concise markdown bulleted list (e.g. using '-' or '*') instead of dense paragraphs.

INPUT CHUNKS:
{chunks}

OUTPUT INSTRUCTIONS:
Return ONLY raw JSON matching this exact schema.
NO markdown code fences. NO preamble. NO explanation. Just the JSON object.
{format_instructions}

Ensure the output 'simplified_chunks' array has the EXACT same length and order as the input chunks. Each simplified chunk corresponds to the input chunk at the same index.
""",
    input_variables=["chunks"],
    partial_variables={"format_instructions": JsonOutputParser(pydantic_object=SimplificationResponse).get_format_instructions()},
)

parser = JsonOutputParser(pydantic_object=SimplificationResponse)

def simplify_text_chunks(chunks: List[str]) -> List[str]:
    """Takes a list of text strings and uses Groq Llama 3 70B to simplify them for ADHD."""
    if not chunks:
        return []
    
    # Format the input to make it clearly distinct for the LLM
    formatted_chunks = "\n---\n".join([f"CHUNK {i}:\n{chunk}" for i, chunk in enumerate(chunks)])
    
    response = invoke_with_retry(
        input_data={"chunks": formatted_chunks},
        task_name="text_simplifier",
        prompt=prompt_template,
        parser=parser
    )
    
    if response:
        simplified = response.get("simplified_chunks", [])
        
        # Handle cases where LLM returns fewer chunks or more
        if isinstance(simplified, list):
            if len(simplified) != len(chunks):
                print(f"[Text Simplifier] Warning: Output chunks ({len(simplified)}) != Input chunks ({len(chunks)})")
                # Pad with original if missing
                while len(simplified) < len(chunks):
                    simplified.append(chunks[len(simplified)])
                # Truncate if too many
                simplified = simplified[:len(chunks)]
            return simplified
        else:
            print("[Text Simplifier] Warning: 'simplified_chunks' is not a list")
            return chunks
            
    print("[Text Simplifier] Error or Rate Limit Exceeded.")
    return chunks
