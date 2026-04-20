from pydantic import BaseModel
from typing import List, Optional, Dict

class SkeletonRequest(BaseModel):
    html_skeleton: str

class SimplifyRequest(BaseModel):
    text_chunks: List[str]

class ReaderRequest(BaseModel):
    raw_text: Optional[str] = None
    feed_items: Optional[List[Dict[str, str]]] = None
    is_feed: bool = False

class ImageExplainRequest(BaseModel):
    image_base64: str
    context: str = ""

class CamRequest(BaseModel):
    text_content: str

class ToneRequest(BaseModel):
    text_content: str
