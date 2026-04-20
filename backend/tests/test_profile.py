"""
NeuroRead AI — test_profile.py
Tests for the profile store CRUD operations.
"""
import pytest
from app.services.profile_store import ProfileStore
from app.schemas.agent_models import UserProfile, Neurotype, ContrastMode


@pytest.fixture
def profile_store():
    """Create a fresh in-memory profile store for each test."""
    store = ProfileStore.__new__(ProfileStore)
    store._memory = {}
    store._lock = __import__("threading").RLock()
    store._redis_enabled = False
    return store


class TestProfileCRUD:
    """Test basic profile operations."""

    def test_get_default_profile(self, profile_store):
        """Getting a non-existent profile returns defaults."""
        profile = profile_store.get_profile("nonexistent_user")
        assert profile.user_id == "nonexistent_user"
        assert profile.neurotype == Neurotype.none
        assert profile.preferred_font_size == 22
        assert profile.auto_adapt_enabled is False

    def test_save_and_get_profile(self, profile_store):
        """Saving a profile should persist it."""
        custom = UserProfile(
            user_id="test_user",
            neurotype=Neurotype.adhd,
            preferred_font_size=26,
            line_height=2.2,
            simplification_level=3,
            tts_speed=1.5,
            auto_adapt_enabled=True,
        )
        profile_store.save_profile(custom)
        retrieved = profile_store.get_profile("test_user")

        assert retrieved.user_id == "test_user"
        assert retrieved.neurotype == Neurotype.adhd
        assert retrieved.preferred_font_size == 26
        assert retrieved.line_height == 2.2
        assert retrieved.simplification_level == 3
        assert retrieved.tts_speed == 1.5
        assert retrieved.auto_adapt_enabled is True

    def test_reset_profile(self, profile_store):
        """Resetting a profile should return to defaults."""
        custom = UserProfile(
            user_id="reset_test",
            neurotype=Neurotype.dyslexia,
            preferred_font_size=30,
        )
        profile_store.save_profile(custom)

        reset = profile_store.reset_profile("reset_test")
        assert reset.user_id == "reset_test"
        assert reset.neurotype == Neurotype.none
        assert reset.preferred_font_size == 22

        # Verify persistence
        retrieved = profile_store.get_profile("reset_test")
        assert retrieved.neurotype == Neurotype.none

    def test_multiple_users(self, profile_store):
        """Different users should have independent profiles."""
        alice = UserProfile(user_id="alice", neurotype=Neurotype.adhd)
        bob = UserProfile(user_id="bob", neurotype=Neurotype.autism)

        profile_store.save_profile(alice)
        profile_store.save_profile(bob)

        assert profile_store.get_profile("alice").neurotype == Neurotype.adhd
        assert profile_store.get_profile("bob").neurotype == Neurotype.autism


class TestProfileValidation:
    """Test that profile values are validated."""

    def test_default_values(self, profile_store):
        """Default profile should have sensible values."""
        profile = profile_store.get_profile("default")
        assert 14 <= profile.preferred_font_size <= 36
        assert 1.0 <= profile.line_height <= 3.0
        assert 1 <= profile.simplification_level <= 3
        assert 0.5 <= profile.tts_speed <= 2.5

    def test_overwrite_profile(self, profile_store):
        """Saving the same user_id should overwrite."""
        v1 = UserProfile(user_id="overwrite_test", neurotype=Neurotype.adhd)
        v2 = UserProfile(user_id="overwrite_test", neurotype=Neurotype.dyslexia)

        profile_store.save_profile(v1)
        profile_store.save_profile(v2)

        assert profile_store.get_profile("overwrite_test").neurotype == Neurotype.dyslexia

    def test_all_neurotypes_valid(self, profile_store):
        """All neurotype values should be storable and retrievable."""
        for nt in Neurotype:
            profile = UserProfile(user_id=f"nt_{nt.value}", neurotype=nt)
            profile_store.save_profile(profile)
            assert profile_store.get_profile(f"nt_{nt.value}").neurotype == nt

    def test_all_contrast_modes_valid(self, profile_store):
        """All contrast mode values should be valid."""
        for cm in ContrastMode:
            profile = UserProfile(user_id=f"cm_{cm.value}", contrast_mode=cm)
            profile_store.save_profile(profile)
            assert profile_store.get_profile(f"cm_{cm.value}").contrast_mode == cm
