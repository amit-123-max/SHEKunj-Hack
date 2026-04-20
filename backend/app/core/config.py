"""
NeuroRead AI — config.py
Central configuration for all backend modules.
Manages API keys, model assignments, and retry/rate-limit logic.
"""

import os
import time
import contextvars
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from groq import Groq

load_dotenv()

# ─── API Key ─────────────────────────────────────────────────
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")

from app.core.model_pool import model_pool_manager

# Thread-local context to pass the active pool name into Tenacity hooks
_active_pool = contextvars.ContextVar('_active_pool', default='text_pool')

# ─── Pool Assignments ───────────────────────────────────────
# Assign tasks to their required fallback pools instead of rigid distinct models
POOL_ASSIGNMENTS = {
    "dom_mapper":          "text_pool",
    "text_simplifier":     "text_pool",
    "focus_mapper":        "text_pool",
    "focus_reader":        "text_pool",
    "voice_intent":        "text_pool",
    "whisper":             "audio_pool",
    "vision_explainer":    "vision_pool",
    "cam_analyzer":        "text_pool",
    "tone_analyzer":       "text_pool",
    "agent_orchestrator":  "text_pool",
}

# ─── LLM Parameters ──────────────────────────────────────────
TEMPERATURES = {
    "dom_mapper":       0.3,
    "text_simplifier":  0.3,
    "focus_mapper":     0.3,
    "voice_intent":     0.3,
}

# ─── Rate Limit / Retry Config ────────────────────────────────
MAX_RETRIES = 3
RETRY_DELAY_SECONDS = 10  # Base delay, doubles on each retry (exponential backoff)


def get_llm(task: str) -> ChatGroq:
    """
    Returns a ChatGroq LLM instance using the Model Pool rotation.
    If the top model in the pool is rate-limited, it automatically fails over to the next!
    """
    pool_name = POOL_ASSIGNMENTS.get(task, "text_pool")
    _active_pool.set(pool_name)
    selected_model = model_pool_manager.get_current_model(pool_name)
    
    if not selected_model:
        raise Exception(f"All models in '{pool_name}' are currently Rate-Limited! Server cannot process {task}.")
    
    print(f"[{task}] 🎯 Grabbed available model from {pool_name}: {selected_model}")
    
    return ChatGroq(
        api_key=GROQ_API_KEY,
        model=selected_model,
        temperature=TEMPERATURES.get(task, 0.1),
        timeout=30,  # 30 second hard timeout — never hang forever
    )


def get_groq_client() -> Groq:
    """
    Returns a raw Groq SDK client (used for Whisper audio transcription).
    """
    return Groq(api_key=GROQ_API_KEY)


import asyncio
from tenacity import retry, wait_exponential, stop_after_attempt, retry_if_exception_type

# We don't catch all exceptions blindly, only Rate Limit errors or parsing errors that warrant a retry.
# Groq generally throws 'RateLimitError' from the SDK, or raw string Exception blocks containing "rate limit" or "429".

def is_rate_limit_error(exception: Exception) -> bool:
    error_str = str(exception).lower()
    return "429" in error_str or "rate_limit" in error_str

def trigger_rotation(retry_state):
    """
    Hook fired by Tenacity before sleeping when retrying.
    Rotates to the next model on ANY failure so we never retry with the same broken model.
    """
    exception = retry_state.outcome.exception()
    if exception:
        pool_name = _active_pool.get()
        error_type = type(exception).__name__
        print(f"[Tenacity] 🔄 {error_type} on attempt {retry_state.attempt_number}! Rotating '{pool_name}'...")
        model_pool_manager.rotate_failed_model(pool_name)

# High-order Decorator for LangChain execution
def retry_llm_call(func):
    return retry(
        retry=retry_if_exception_type(Exception),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        stop=stop_after_attempt(len(model_pool_manager.pools.get("text_pool", []))),
        before_sleep=trigger_rotation
    )(func)

@retry_llm_call
def _execute_llm_chain(task_name: str, prompt_template, parser, input_data: dict, temperature: float = None):
    """
    Core execution logic. It rebuilds the chain entirely on every invocation.
    If Tenacity triggers a retry, this function starts locally, calling get_llm() which
    fetches the next rotated model securely.
    """
    llm = get_llm(task_name)
    chain = prompt_template | llm | parser
    return chain.invoke(input_data)

def invoke_with_retry(chain=None, input_data: dict = None, task_name: str = "unknown", prompt=None, parser=None):
    """
    Facade wrapper to intercept the old `invoke_with_retry(chain, data, task)` 
    and adapt it seamlessly to the new Tenacity standard.
    Note: To support model rotation, you MUST pass `prompt` and `parser` explicitly!
    """
    try:
        if prompt and parser:
            return _execute_llm_chain(task_name, prompt, parser, input_data)
        elif chain:
            # Legacy fallback if prompt/parser isn't passed (No LLM rotation available here)
            print(f"[{task_name}] WARNING: Legacy invoke_with_retry called. Retries will not trigger Model Rotation!")
            @retry_llm_call
            def _legacy_retry():
                return chain.invoke(input_data)
            return _legacy_retry()
    except Exception as e:
        print(f"[{task_name}] Groq Fatal Error after retries: {e}")
        return None
