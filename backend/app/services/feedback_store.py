"""
NeuroRead AI — feedback_store.py
Persistence layer for user feedback on agent actions.
Stores feedback entries for analytics and learning.
"""

import json
import os
import threading
import time
from typing import List, Dict, Any

from app.schemas.agent_models import FeedbackEntry

try:
    import redis
    REDIS_INSTALLED = True
except ImportError:
    REDIS_INSTALLED = False


STORAGE_FILE = "feedback.json"
REDIS_KEY = "neuroread:feedback"


class FeedbackStore:
    """Thread-safe feedback storage with Redis/memory fallback."""

    def __init__(self):
        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
        self._memory: List[Dict[str, Any]] = []
        self._lock = threading.RLock()
        self._redis_enabled = False

        if REDIS_INSTALLED:
            try:
                self._redis = redis.from_url(redis_url, decode_responses=True)
                self._redis.ping()
                self._redis_enabled = True
                print("✅ Feedback store: Redis backend enabled")
            except Exception as e:
                print(f"⚠️ Feedback store: Redis unavailable, using file backend: {e}")
        else:
            print("⚠️ Feedback store: redis package not installed, using file backend")

        self._load_file()

    def store_entries(self, entries: List[FeedbackEntry]) -> int:
        """Store a batch of feedback entries. Returns count stored."""
        with self._lock:
            stored = 0
            for entry in entries:
                data = entry.model_dump()
                if data.get("timestamp", 0) == 0:
                    data["timestamp"] = time.time()

                self._memory.append(data)

                if self._redis_enabled:
                    try:
                        self._redis.rpush(REDIS_KEY, json.dumps(data))
                    except Exception as e:
                        print(f"[FeedbackStore] Redis write error: {e}")

                stored += 1

            self._save_file()
            return stored

    def get_all(self) -> List[Dict[str, Any]]:
        """Retrieve all feedback entries."""
        with self._lock:
            if self._redis_enabled:
                try:
                    raw_list = self._redis.lrange(REDIS_KEY, 0, -1)
                    return [json.loads(r) for r in raw_list]
                except Exception:
                    pass
            return list(self._memory)

    def get_count(self) -> int:
        """Get total feedback count."""
        with self._lock:
            if self._redis_enabled:
                try:
                    return self._redis.llen(REDIS_KEY)
                except Exception:
                    pass
            return len(self._memory)

    def _load_file(self) -> None:
        try:
            if os.path.exists(STORAGE_FILE):
                with open(STORAGE_FILE, "r") as f:
                    self._memory = json.load(f)
                print(f"✅ Feedback store: loaded {len(self._memory)} entries from disk")
        except Exception as e:
            print(f"[FeedbackStore] File load error: {e}")

    def _save_file(self) -> None:
        try:
            with open(STORAGE_FILE, "w") as f:
                json.dump(self._memory, f, indent=2)
        except Exception as e:
            print(f"[FeedbackStore] File save error: {e}")


# Global singleton
feedback_store = FeedbackStore()
