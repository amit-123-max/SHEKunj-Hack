from fastapi import APIRouter
import time
from app.core.model_pool import model_pool_manager
from app.core.cache import cache

router = APIRouter()
START_TIME = time.time()

@router.get("/health")
def health_check():
    # Count available models per pool
    pool_status = {}
    for pool_name in ["text_pool", "vision_pool", "audio_pool"]:
        available = model_pool_manager.get_current_model(pool_name)
        total = len(model_pool_manager.pools.get(pool_name, []))
        pool_status[pool_name] = {"available": available is not None, "total": total}

    return {
        "status": "ok",
        "uptime_seconds": round(time.time() - START_TIME, 1),
        "cache": "redis" if cache.enabled else "memory",
        "models": pool_status,
        "version": "2.0.0"
    }

@router.get("/settings")
def get_settings():
    return {
        "base_font_size": "20px",
        "line_height": "1.8",
        "colors": {
            "background": "#FFFEF5",
            "text": "#1A1A1A",
            "highlight": "#6A0DAD",
            "accent": "#E67E00"
        }
    }
