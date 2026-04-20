"""
NeuroRead AI — test_rate.py
Tests for model pool rotation and rate-limit monitor.
"""
import pytest
import time
from app.core.rate_limit_monitor import rate_limit_monitor
from app.core.model_pool import model_pool_manager


def test_text_pool_has_models():
    """Text pool must have at least one model configured."""
    pool = list(model_pool_manager.pools["text_pool"])
    assert len(pool) > 0, "text_pool must not be empty"


def test_get_current_model_returns_string():
    """get_current_model should return a valid model name string."""
    model = model_pool_manager.get_current_model("text_pool")
    assert isinstance(model, str)
    assert len(model) > 0


def test_rate_limited_model_is_skipped():
    """A rate-limited model should be skipped by get_current_model."""
    pool_name = "text_pool"
    model = model_pool_manager.get_current_model(pool_name)

    # Mark it as rate-limited
    rate_limit_monitor.mark_rate_limited(model, reset_time_seconds=60)

    # Get next model — must be different
    next_model = model_pool_manager.get_current_model(pool_name)
    assert next_model != model, "Pool should skip the rate-limited model."

    # Cleanup
    with rate_limit_monitor.lock:
        rate_limit_monitor.models.pop(model, None)


def test_rotation_moves_model_to_back():
    """rotate_failed_model should push the first model to the back of the deque."""
    pool_name = "text_pool"
    initial_pool = list(model_pool_manager.pools[pool_name])
    first_model = initial_pool[0]

    model_pool_manager.rotate_failed_model(pool_name)
    rotated_pool = list(model_pool_manager.pools[pool_name])

    assert rotated_pool[-1] == first_model, "First model should have moved to the back."
    # Restore original order
    model_pool_manager.pools[pool_name].rotate(1)
