"""
NeuroRead AI — profile_store.py
Persistence layer for user profiles.
Uses Redis when available, falls back to in-memory dict + JSON file.
Same dual-backend pattern as the existing ResultCache.
"""

import json
import os
import threading
from typing import Optional, Dict, Any

from app.schemas.agent_models import UserProfile

try:
    import redis
    REDIS_INSTALLED = True
except ImportError:
    REDIS_INSTALLED = False


PROFILE_DEFAULTS = UserProfile().model_dump()
STORAGE_FILE = "profiles.json"
REDIS_PREFIX = "neuroread:profile:"


class ProfileStore:
    """Thread-safe profile persistence with Redis/memory fallback."""

    def __init__(self):
        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
        self._memory: Dict[str, Dict[str, Any]] = {}
        self._lock = threading.RLock()
        self._redis_enabled = False

        if REDIS_INSTALLED:
            try:
                self._redis = redis.from_url(redis_url, decode_responses=True)
                self._redis.ping()
                self._redis_enabled = True
                print("✅ Profile store: Redis backend enabled")
            except Exception as e:
                print(f"⚠️ Profile store: Redis unavailable, using file backend: {e}")
        else:
            print("⚠️ Profile store: redis package not installed, using file backend")

        self._load_file()

    # ─── Public API ───────────────────────────────────────────

    def get_profile(self, user_id: str = "default") -> UserProfile:
        """Retrieve a user profile. Returns defaults if not found."""
        with self._lock:
            raw = self._read(user_id)
            if raw:
                try:
                    return UserProfile(**raw)
                except Exception:
                    pass
            return UserProfile(user_id=user_id)

    def save_profile(self, profile: UserProfile) -> None:
        """Persist a user profile."""
        with self._lock:
            data = profile.model_dump()
            self._write(profile.user_id, data)

    def reset_profile(self, user_id: str = "default") -> UserProfile:
        """Reset a profile to defaults and return it."""
        default = UserProfile(user_id=user_id)
        self.save_profile(default)
        return default

    # ─── Internal Storage ─────────────────────────────────────

    def _read(self, user_id: str) -> Optional[Dict[str, Any]]:
        if self._redis_enabled:
            try:
                raw = self._redis.get(f"{REDIS_PREFIX}{user_id}")
                if raw:
                    return json.loads(raw)
            except Exception as e:
                print(f"[ProfileStore] Redis read error: {e}")

        return self._memory.get(user_id)

    def _write(self, user_id: str, data: Dict[str, Any]) -> None:
        self._memory[user_id] = data

        if self._redis_enabled:
            try:
                self._redis.set(f"{REDIS_PREFIX}{user_id}", json.dumps(data))
            except Exception as e:
                print(f"[ProfileStore] Redis write error: {e}")

        self._save_file()

    def _load_file(self) -> None:
        """Load profiles from JSON file on startup."""
        try:
            if os.path.exists(STORAGE_FILE):
                with open(STORAGE_FILE, "r") as f:
                    self._memory = json.load(f)
                print(f"✅ Profile store: loaded {len(self._memory)} profiles from disk")
        except Exception as e:
            print(f"[ProfileStore] File load error: {e}")

    def _save_file(self) -> None:
        """Persist profiles to JSON file."""
        try:
            with open(STORAGE_FILE, "w") as f:
                json.dump(self._memory, f, indent=2)
        except Exception as e:
            print(f"[ProfileStore] File save error: {e}")


# Global singleton
profile_store = ProfileStore()
