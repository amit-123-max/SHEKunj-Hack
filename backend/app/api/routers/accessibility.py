import json
import asyncio
from fastapi import APIRouter, HTTPException
from app.schemas.api_models import SimplifyRequest, CamRequest, ToneRequest
from app.core.cache import cache
from app.services.text_simplifier import simplify_text_chunks
from app.services.cam_analyzer import analyze_cam_score
from app.services.tone_analyzer import analyze_tone

router = APIRouter()

@router.post("/simplify")
async def simplify_text(request: SimplifyRequest):
    chunks_str = json.dumps(request.text_chunks)
    cached = cache.get("text_simplifier", chunks_str)
    if cached:
        return {"success": True, "cached": True, "simplified_chunks": cached}

    max_batch = 10
    chunks = request.text_chunks[:max_batch]
    simplified = await asyncio.to_thread(simplify_text_chunks, chunks)
    
    cache.set("text_simplifier", chunks_str, simplified)
    return {
        "success": True,
        "simplified_chunks": simplified
    }

@router.post("/cam-score")
async def cam_score_endpoint(request: CamRequest):
    cached = cache.get("cam_analyzer", request.text_content)
    if cached:
        return {"success": True, "cached": True, "cam": cached}

    if not request.text_content:
        return {"success": False, "error": "No text provided"}
        
    result = await asyncio.to_thread(analyze_cam_score, request.text_content)
    cache.set("cam_analyzer", request.text_content, result)
    
    return {
        "success": True,
        "cam": result
    }

@router.post("/analyze-tone")
async def analyze_tone_endpoint(request: ToneRequest):
    cached = cache.get("tone_analyzer", request.text_content)
    if cached:
        return {"success": True, "cached": True, "analysis": cached}

    if not request.text_content:
        raise HTTPException(status_code=400, detail="No text data provided")
        
    result = await asyncio.to_thread(analyze_tone, request.text_content)
    cache.set("tone_analyzer", request.text_content, result)
    
    return {
        "success": True,
        "analysis": result
    }
