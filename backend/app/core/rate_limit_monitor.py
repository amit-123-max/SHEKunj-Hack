"""
Tracks model-specific rate limits and reset times.
"""

import time
from typing import Dict, Optional
from datetime import datetime
import threading
from dataclasses import dataclass
import json
import os

@dataclass
class ModelRateLimit:
    """Stores rate limit state for a model."""
    model_name: str
    requests_per_minute: int = 100
    requests_per_day: int = 10000
    current_minute_count: int = 0
    current_day_count: int = 0
    last_reset_minute: float = 0
    last_reset_day: float = 0
    reset_time_minute: Optional[float] = None
    reset_time_day: Optional[float] = None
    is_rate_limited: bool = False
    
    def to_dict(self):
        return {
            'model_name': self.model_name,
            'requests_per_minute': self.requests_per_minute,
            'current_minute_count': self.current_minute_count,
            'current_day_count': self.current_day_count,
            'is_rate_limited': self.is_rate_limited,
            'reset_time_minute': self.reset_time_minute,
            'reset_time_day': self.reset_time_day,
            'last_reset_minute': self.last_reset_minute,
            'last_reset_day': self.last_reset_day
        }

class RateLimitMonitor:
    """Central tracker for all model rate limits."""
    
    def __init__(self):
        self.models: Dict[str, ModelRateLimit] = {}
        self.lock = threading.RLock()
        self.persistent_file = "rate_limit_state.json"
        
        # We pre-register the known Groq models
        self.RATE_LIMITS = {
          "llama-3.1-70b-versatile": {"rpm": 30, "rpd": 5000},
          "llama-3.1-8b-instant": {"rpm": 100, "rpd": 10000},
          "whisper-large-v3-turbo": {"rpm": 50, "rpd": 2000},
          "llama-3.2-11b-vision-instant": {"rpm": 30, "rpd": 1000}
        }
        
        self.load_state()
        
        # Ensure base limits are registered even if no state existed
        for name, limits in self.RATE_LIMITS.items():
            self.register_model(name, rpm=limits["rpm"], rpd=limits["rpd"])
    
    def register_model(self, model_name: str, rpm: int = 100, rpd: int = 10000):
        """Register a new model with its rate limits."""
        with self.lock:
            if model_name not in self.models:
                self.models[model_name] = ModelRateLimit(
                    model_name=model_name,
                    requests_per_minute=rpm,
                    requests_per_day=rpd,
                    last_reset_minute=time.time(),
                    last_reset_day=time.time()
                )
    
    def check_can_use_model(self, model_name: str) -> bool:
        """Check if a model is available (not rate limited)."""
        with self.lock:
            if model_name not in self.models:
                self.register_model(model_name)
            
            model = self.models[model_name]
            now = time.time()
            
            # Reset minute usage window
            if now >= (model.last_reset_minute + 60):
                model.current_minute_count = 0
                model.last_reset_minute = now
                model.reset_time_minute = None
                model.is_rate_limited = False
            
            # Reset daily usage window
            if now >= (model.last_reset_day + 86400):
                model.current_day_count = 0
                model.last_reset_day = now
                model.reset_time_day = None
                model.is_rate_limited = False
            
            # Hard cooldown from 429 errors
            times = [t for t in [model.reset_time_minute, model.reset_time_day] if t is not None]
            if times and min(times) > now:
                 model.is_rate_limited = True
                 return False

            # Predict limit reached naturally
            minute_limited = model.current_minute_count >= model.requests_per_minute
            day_limited = model.current_day_count >= model.requests_per_day
            
            if minute_limited or day_limited:
                model.is_rate_limited = True
                if minute_limited:
                    model.reset_time_minute = model.last_reset_minute + 60
                if day_limited:
                    model.reset_time_day = model.last_reset_day + 86400
                return False
            
            model.is_rate_limited = False
            return True
    
    def record_request(self, model_name: str):
        """Record that a request was made to a model to consume its budget."""
        with self.lock:
            if model_name not in self.models:
                self.register_model(model_name)
            
            model = self.models[model_name]
            model.current_minute_count += 1
            model.current_day_count += 1
    
    def mark_rate_limited(self, model_name: str, reset_time_seconds: int = 60):
        """Mark a model as hard rate limited and set when exactly it unlocks."""
        with self.lock:
            if model_name not in self.models:
                self.register_model(model_name)
            
            model = self.models[model_name]
            model.is_rate_limited = True
            reset_unix = time.time() + reset_time_seconds
            model.reset_time_minute = reset_unix
            
            print(f"🚫 [{model_name}] Rate limited! Resets in {reset_time_seconds}s at {datetime.fromtimestamp(reset_unix)}")
    
    def get_reset_time(self, model_name: str) -> Optional[float]:
        """Get UNIX timestamp when model will be available again."""
        with self.lock:
            if model_name not in self.models:
                return None
            
            model = self.models[model_name]
            if not model.is_rate_limited:
                return None
            
            times = [t for t in [model.reset_time_minute, model.reset_time_day] if t is not None]
            return min(times) if times else None
    
    def get_wait_time(self, model_name: str) -> float:
        """Get how many exact seconds to wait before model is functional."""
        reset_time = self.get_reset_time(model_name)
        if not reset_time:
            return 0
        
        now = time.time()
        wait = reset_time - now
        return max(0, wait)
    
    def get_status(self, model_name: str) -> Dict:
        """Get full statistical status of a model."""
        with self.lock:
            if model_name not in self.models:
                return {'status': 'unknown'}
            
            model = self.models[model_name]
            now = time.time()
            reset = model.reset_time_minute or model.reset_time_day
            
            return {
                'model': model_name,
                'is_rate_limited': model.is_rate_limited,
                'requests_this_minute': model.current_minute_count,
                'limit_per_minute': model.requests_per_minute,
                'requests_today': model.current_day_count,
                'limit_per_day': model.requests_per_day,
                'reset_in_seconds': max(0, reset - now) if reset else 0,
                'reset_at': datetime.fromtimestamp(reset).isoformat() if reset else None
            }
    
    def save_state(self):
        """Save the usage state so limits persist across server restarts."""
        try:
            with self.lock:
                state = {name: model.to_dict() for name, model in self.models.items()}
                with open(self.persistent_file, 'w') as f:
                    json.dump(state, f, indent=2)
        except Exception as e:
            print(f"Error saving rate limit state: {e}")
    
    def load_state(self):
        """Load state on server boot."""
        try:
            if os.path.exists(self.persistent_file):
                with open(self.persistent_file, 'r') as f:
                    state = json.load(f)
                    for model_data in state.values():
                        model = ModelRateLimit(
                            model_name=model_data.get('model_name'),
                            requests_per_minute=model_data.get('requests_per_minute', 100),
                            requests_per_day=model_data.get('requests_per_day', 10000),
                            current_minute_count=model_data.get('current_minute_count', 0),
                            current_day_count=model_data.get('current_day_count', 0),
                            is_rate_limited=model_data.get('is_rate_limited', False),
                            reset_time_minute=model_data.get('reset_time_minute'),
                            reset_time_day=model_data.get('reset_time_day'),
                            last_reset_minute=model_data.get('last_reset_minute', time.time()),
                            last_reset_day=model_data.get('last_reset_day', time.time())
                        )
                        self.models[model.model_name] = model
                print(f"✅ Loaded rate limit state for {len(self.models)} models")
        except Exception as e:
            print(f"Error loading rate limit state: {e}")

# Global monitor instance
rate_limit_monitor = RateLimitMonitor()
