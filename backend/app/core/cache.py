import json
import hashlib
from typing import Optional, Dict, Any
import os

try:
    import redis
    REDIS_INSTALLED = True
except ImportError:
    REDIS_INSTALLED = False

class ResultCache:
    def __init__(self):
        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
        self.memory_cache = {}
        self.enabled = False
        
        if REDIS_INSTALLED:
            try:
                self.client = redis.from_url(redis_url, decode_responses=True)
                self.client.ping()
                self.enabled = True
                print("✅ Redis cache enabled")
            except Exception as e:
                print(f"⚠️ Redis unavailable, using in-memory cache: {e}")
        else:
            print("⚠️ 'redis' python package not installed, using in-memory cache")
    
    def get_key(self, task: str, input_hash: str) -> str:
        return f"neuroread:{task}:{input_hash}"
    
    def get_hash(self, data: str) -> str:
        return hashlib.md5(data.encode()).hexdigest()
    
    def get(self, task: str, input_data: str) -> Optional[Dict[str, Any]]:
        """Get cached result."""
        key_hash = self.get_hash(input_data)
        cache_key = self.get_key(task, key_hash)
        
        try:
            if self.enabled:
                cached = self.client.get(cache_key)
                if cached:
                    return json.loads(cached)
            else:
                return self.memory_cache.get(cache_key)
        except Exception as e:
            print(f"Cache read error: {e}")
        
        return None
    
    def set(self, task: str, input_data: str, result: Dict[str, Any], ttl: int = 86400):
        """Cache result with TTL (24 hours default)."""
        key_hash = self.get_hash(input_data)
        cache_key = self.get_key(task, key_hash)
        
        try:
            if self.enabled:
                self.client.setex(cache_key, ttl, json.dumps(result))
            else:
                self.memory_cache[cache_key] = result
        except Exception as e:
            print(f"Cache write error: {e}")

# Global cache instance
cache = ResultCache()
