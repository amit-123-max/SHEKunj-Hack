"""
NeuroRead AI — agent_memory.py
Stores user memory, feature preferences, and confidence modifiers.
Learns from positive (accepted) and negative (dismissed/undo) feedback.
"""
import json
import os
from typing import Dict, Any

MEMORY_FILE = "backend/memory_store.json"

class AgentMemory:
    def __init__(self):
        self.memory = {}
        self.load()

    def load(self):
        if os.path.exists(MEMORY_FILE):
            try:
                with open(MEMORY_FILE, "r") as f:
                    self.memory = json.load(f)
            except Exception:
                self.memory = {}
        else:
            self.memory = {}

    def save(self):
        try:
            with open(MEMORY_FILE, "w") as f:
                json.dump(self.memory, f, indent=2)
        except Exception:
            pass

    def get_user_memory(self, user_id: str) -> Dict[str, Any]:
        if user_id not in self.memory:
            self.memory[user_id] = {
                "feature_success_rate": {},
                "feature_dismiss_rate": {},
                "confidence_adjustments": {},
                "history": []
            }
        return self.memory[user_id]

    def update_feedback(self, user_id: str, feature_name: str, outcome: str):
        mem = self.get_user_memory(user_id)
        # Initialize if missing
        if feature_name not in mem["feature_success_rate"]:
            mem["feature_success_rate"][feature_name] = 0
            mem["feature_dismiss_rate"][feature_name] = 0
            mem["confidence_adjustments"][feature_name] = 0.0
            
        if outcome in ["accepted", "auto_applied"]:
            mem["feature_success_rate"][feature_name] += 1
            # Boost confidence slightly
            mem["confidence_adjustments"][feature_name] = min(0.3, mem["confidence_adjustments"][feature_name] + 0.05)
        elif outcome in ["dismissed", "undo", "error"]:
            mem["feature_dismiss_rate"][feature_name] += 1
            # Decrease confidence
            mem["confidence_adjustments"][feature_name] = max(-0.5, mem["confidence_adjustments"][feature_name] - 0.1)

        mem["history"].append({"feature": feature_name, "outcome": outcome})
        # Keep history bounded
        mem["history"] = mem["history"][-50:]
        self.save()

    def get_confidence_modifier(self, user_id: str, feature_name: str) -> float:
        mem = self.get_user_memory(user_id)
        return mem.get("confidence_adjustments", {}).get(feature_name, 0.0)

agent_memory = AgentMemory()
