"""
NeuroRead AI — vision_explainer.py
Module: Multimodal Image/Diagram Explainer
Uses Groq Llama 3.2 11B Vision to explain images in plain language.
"""

from app.core.config import get_groq_client, retry_llm_call, _active_pool
from app.core.model_pool import model_pool_manager

SYSTEM_PROMPT = """You are an accessibility assistant for neurodivergent users (ADHD, Dyslexia, Autism).
Describe this image in simple, plain language. Focus on:
- What is being shown (type of diagram, chart, photo, etc.)
- Key relationships, patterns, or data points
- Labels and their meanings
- Any important takeaways

Keep your explanation under 150 words. Use short sentences. Avoid jargon.
If the image appears to be decorative or a logo, say so briefly."""


def explain_image(image_base64: str, context: str = "") -> str:
    """
    Send a base64-encoded image to Groq Vision for plain-language explanation.
    Wrapped with Tenacity for automatic model rotation on rate limits.
    """
    # Set the active pool so Tenacity's trigger_rotation targets vision_pool
    _active_pool.set("vision_pool")
    try:
        return _explain_image_with_retry(image_base64, context)
    except Exception as e:
        print(f"[vision_explainer] Fatal Error after retries: {e}")
        return f"Could not analyze this image: {str(e)}"

@retry_llm_call
def _explain_image_with_retry(image_base64: str, context: str = "") -> str:
    client = get_groq_client()
    model = model_pool_manager.get_current_model("vision_pool")
    
    if not model:
        raise Exception("All vision models are currently rate-limited.")
    
    print(f"[vision_explainer] 🎯 Using model: {model}")
    
    # Ensure proper data URL format
    if not image_base64.startswith("data:"):
        image_base64 = f"data:image/png;base64,{image_base64}"
    
    user_content = [
        {
            "type": "image_url",
            "image_url": {
                "url": image_base64
            }
        },
        {
            "type": "text",
            "text": f"Explain this image simply.{(' Context from the page: ' + context[:300]) if context else ''}"
        }
    ]
    
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_content}
        ],
        max_tokens=300,
        temperature=0.3,
    )
    return response.choices[0].message.content.strip()
