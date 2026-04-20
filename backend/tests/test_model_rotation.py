import pytest
from app.core.model_pool import model_pool_manager
from app.core.rate_limit_monitor import rate_limit_monitor

def test_pool_rotation_logic():
    """Verify that deques rotate correctly when a model is marked as failed."""
    pool_name = "text_pool"
    initial_pool = list(model_pool_manager.pools[pool_name])
    first_model = initial_pool[0]
    
    # Trigger rotation manually
    model_pool_manager.rotate_failed_model(pool_name)
    
    rotated_pool = list(model_pool_manager.pools[pool_name])
    assert rotated_pool[-1] == first_model, "The first model did not move to the back of the queue."
    assert rotated_pool[0] == initial_pool[1], "The second model did not move to the front."

def test_rate_limit_bypass():
    """Verify that get_current_model skips rate-limited models."""
    pool_name = "text_pool"
    # Ensure pool is in a clean state (not really possible without reset, but we can simulate)
    model = model_pool_manager.get_current_model(pool_name)
    
    # Mark it as rate limited
    rate_limit_monitor.mark_rate_limited(model, reset_time_seconds=60)
    
    # Get next model - it SHOULD not be the same one
    next_model = model_pool_manager.get_current_model(pool_name)
    assert next_model != model, "The model pool should have skipped the rate-limited model."
    
    # Cleanup to avoid test ordering issues
    with rate_limit_monitor.lock:
        rate_limit_monitor.models.pop(model, None)

def test_sequential_rotation():
    """Verify that multiple rotations behave correctly."""
    pool_name = "vision_pool"
    pool_size = len(model_pool_manager.pools[pool_name])
    
    initial_first = model_pool_manager.pools[pool_name][0]
    
    # Rotate fully through the pool
    for _ in range(pool_size):
        model_pool_manager.rotate_failed_model(pool_name)
        
    final_first = model_pool_manager.pools[pool_name][0]
    assert initial_first == final_first, "The pool didn't return to its original state after a full rotation cycle."
