"""
AI Service — uses Google Gemini to generate personalised
meal plans and workout plans based on user context.

Set GEMINI_API_KEY in your .env to enable real generation.
Set GEMINI_MODEL to override the default model name.
When Gemini fails/unavailable, service returns deterministic demo plans
with metadata describing the fallback reason.
"""

from __future__ import annotations

import json
import os
from typing import Any


def _normalize_model_name(model_name: str) -> str:
    raw = (model_name or "").strip().lower().replace("_", "-")
    # User-friendly aliases
    aliases = {
        "1.5-pro": "gemini-1.5-pro",
        "gemini-1.5-pro": "gemini-1.5-pro",
        "gemini 1.5 pro": "gemini-1.5-pro",
        "3.1-pro": "gemini-2.5-pro",
        "gemini-3.1-pro": "gemini-2.5-pro",
        "gemini 3.1 pro": "gemini-2.5-pro",
        "2.5-pro": "gemini-2.5-pro",
        "gemini-2.5-pro": "gemini-2.5-pro",
    }
    return aliases.get(raw, raw or "gemini-1.5-pro")


def _candidate_models(configured_model: str) -> list[str]:
    base = [
        configured_model,
        "gemini-2.5-pro",         # closest current "3.1 Pro" equivalent
        "gemini-1.5-pro-latest",  # stable 1.5 pro alias
        "gemini-1.5-pro",
        "gemini-1.5-pro-002",
    ]
    seen: set[str] = set()
    ordered: list[str] = []
    for name in base:
        normalized = _normalize_model_name(name)
        if normalized and normalized not in seen:
            seen.add(normalized)
            ordered.append(normalized)
    return ordered


def _resolve_supported_models(genai, candidates: list[str]) -> list[str]:
    """Prefer candidate models that support generateContent in this project."""
    try:
        models = list(genai.list_models())
    except Exception:
        return candidates

    by_clean_name: dict[str, str] = {}
    for model in models:
        methods = getattr(model, "supported_generation_methods", None) or []
        if "generateContent" not in methods:
            continue
        raw_name = getattr(model, "name", "") or ""
        if not raw_name:
            continue
        clean = raw_name.removeprefix("models/")
        by_clean_name[clean] = raw_name

    resolved: list[str] = []
    for c in candidates:
        if c in by_clean_name:
            resolved.append(by_clean_name[c])

    # If none of our preferred models exist, try any available "pro" model.
    if not resolved:
        pro_models = [
            raw
            for clean, raw in by_clean_name.items()
            if "pro" in clean and clean.startswith("gemini")
        ]
        resolved.extend(pro_models[:3])

    return resolved or candidates


def _gemini_client():
    """Lazy-import so the app boots even without the package installed."""
    try:
        import google.generativeai as genai
    except ImportError:
        return None, [], "Gemini SDK not installed on server"
    key = os.getenv("GEMINI_API_KEY", "")
    if not key:
        return None, [], "GEMINI_API_KEY is not configured"
    configured_model = _normalize_model_name(os.getenv("GEMINI_MODEL", "gemini-1.5-pro"))
    model_candidates = _candidate_models(configured_model)
    genai.configure(api_key=key)
    return genai, model_candidates, None


# ---------------------------------------------------------------------------
# Prompt templates
# ---------------------------------------------------------------------------

_MEAL_PLAN_PROMPT = (
    "You are a certified sports nutritionist. "
    "Generate a detailed daily meal plan in valid JSON with keys: "
    '"plan_name", "meals" (array of objects with "meal", "foods" list, '
    '"calories", "protein_g", "carbs_g", "fats_g"), and "daily_totals" '
    "(object with total calories, protein, carbs, fats). "
    "Tailor the plan to the user's profile.\n\n"
    "User profile:\n{context}"
)

_WORKOUT_PLAN_PROMPT = (
    "You are a certified personal trainer. "
    "Generate a weekly workout plan in valid JSON with keys: "
    '"plan_name", "goal", "days" (array of objects with "day", '
    '"focus", "exercises" list — each exercise has "name", "sets", '
    '"reps", "rest_seconds", "notes"). '
    "Tailor the plan to the user's goals and fitness level.\n\n"
    "User profile:\n{context}"
)


def _build_user_context(
    *,
    goal: str | None = None,
    weight: float | None = None,
    height: float | None = None,
    body_fat: float | None = None,
    dietary_prefs: str | None = None,
    fitness_level: str | None = None,
    extra: str | None = None,
) -> str:
    parts: list[str] = []
    if goal:
        parts.append(f"Goal: {goal}")
    if weight:
        parts.append(f"Weight: {weight} lbs")
    if height:
        parts.append(f"Height: {height} in")
    if body_fat:
        parts.append(f"Body fat: {body_fat}%")
    if dietary_prefs:
        parts.append(f"Dietary preferences: {dietary_prefs}")
    if fitness_level:
        parts.append(f"Fitness level: {fitness_level}")
    if extra:
        parts.append(extra)
    return "\n".join(parts) if parts else "No specific preferences given."


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def _response_meta(*, is_demo: bool, warning: str | None = None) -> dict[str, Any]:
    return {
        "provider": "gemini",
        "is_demo": is_demo,
        "model": os.getenv("GEMINI_MODEL", "gemini-1.5-pro"),
        "warning": warning,
    }


def generate_meal_plan_with_meta(**kwargs: Any) -> dict[str, Any]:
    """Return meal plan and metadata, with explicit fallback reason."""
    genai, model_candidates, model_warning = _gemini_client()
    context = _build_user_context(**kwargs)

    if genai is not None:
        model_candidates = _resolve_supported_models(genai, model_candidates)
        prompt = _MEAL_PLAN_PROMPT.format(context=context)
        errors: list[str] = []
        for model_name in model_candidates:
            try:
                model = genai.GenerativeModel(
                    model_name,
                    generation_config={"response_mime_type": "application/json"},
                )
                resp = model.generate_content(prompt)
                parsed = json.loads(resp.text or "{}")
                if isinstance(parsed, dict) and parsed:
                    parsed["_demo"] = False
                    return {
                        "plan": parsed,
                        "meta": {
                            "provider": "gemini",
                            "is_demo": False,
                            "model": model_name,
                            "warning": None,
                        },
                    }
                errors.append(f"{model_name}: empty response")
            except json.JSONDecodeError:
                errors.append(f"{model_name}: non-JSON response")
            except Exception as exc:
                errors.append(f"{model_name}: {str(exc)[:160]}")
        warning = "Gemini request failed; using demo plan. " + " | ".join(errors[:2])
    else:
        warning = model_warning or "Gemini unavailable; using demo plan"

    return {
        "plan": _demo_meal_plan(kwargs.get("goal")),
        "meta": _response_meta(is_demo=True, warning=warning),
    }


def generate_workout_plan_with_meta(**kwargs: Any) -> dict[str, Any]:
    """Return workout plan and metadata, with explicit fallback reason."""
    genai, model_candidates, model_warning = _gemini_client()
    context = _build_user_context(**kwargs)

    if genai is not None:
        model_candidates = _resolve_supported_models(genai, model_candidates)
        prompt = _WORKOUT_PLAN_PROMPT.format(context=context)
        errors: list[str] = []
        for model_name in model_candidates:
            try:
                model = genai.GenerativeModel(
                    model_name,
                    generation_config={"response_mime_type": "application/json"},
                )
                resp = model.generate_content(prompt)
                parsed = json.loads(resp.text or "{}")
                if isinstance(parsed, dict) and parsed:
                    parsed["_demo"] = False
                    return {
                        "plan": parsed,
                        "meta": {
                            "provider": "gemini",
                            "is_demo": False,
                            "model": model_name,
                            "warning": None,
                        },
                    }
                errors.append(f"{model_name}: empty response")
            except json.JSONDecodeError:
                errors.append(f"{model_name}: non-JSON response")
            except Exception as exc:
                errors.append(f"{model_name}: {str(exc)[:160]}")
        warning = "Gemini request failed; using demo plan. " + " | ".join(errors[:2])
    else:
        warning = model_warning or "Gemini unavailable; using demo plan"

    return {
        "plan": _demo_workout_plan(kwargs.get("goal")),
        "meta": _response_meta(is_demo=True, warning=warning),
    }


def generate_meal_plan(**kwargs: Any) -> dict:
    """Backward-compatible helper returning only the plan."""
    return generate_meal_plan_with_meta(**kwargs)["plan"]


def generate_workout_plan(**kwargs: Any) -> dict:
    """Backward-compatible helper returning only the plan."""
    return generate_workout_plan_with_meta(**kwargs)["plan"]


# ---------------------------------------------------------------------------
# Demo / fallback plans (used when no Gemini key is configured)
# ---------------------------------------------------------------------------


def _demo_meal_plan(goal: str | None = None) -> dict:
    return {
        "plan_name": f"Sample Meal Plan – {goal or 'General Health'}",
        "meals": [
            {
                "meal": "Breakfast",
                "foods": ["Oatmeal with berries", "Greek yogurt", "Black coffee"],
                "calories": 420,
                "protein_g": 28,
                "carbs_g": 52,
                "fats_g": 12,
            },
            {
                "meal": "Lunch",
                "foods": ["Grilled chicken breast", "Brown rice", "Steamed broccoli"],
                "calories": 560,
                "protein_g": 45,
                "carbs_g": 55,
                "fats_g": 14,
            },
            {
                "meal": "Snack",
                "foods": ["Apple slices", "Almond butter"],
                "calories": 250,
                "protein_g": 6,
                "carbs_g": 30,
                "fats_g": 14,
            },
            {
                "meal": "Dinner",
                "foods": ["Salmon fillet", "Sweet potato", "Mixed greens salad"],
                "calories": 620,
                "protein_g": 42,
                "carbs_g": 48,
                "fats_g": 22,
            },
        ],
        "daily_totals": {
            "calories": 1850,
            "protein_g": 121,
            "carbs_g": 185,
            "fats_g": 62,
        },
        "_demo": True,
    }


def _demo_workout_plan(goal: str | None = None) -> dict:
    return {
        "plan_name": f"Sample Workout Plan – {goal or 'General Fitness'}",
        "goal": goal or "General Fitness",
        "days": [
            {
                "day": "Monday",
                "focus": "Upper Body Push",
                "exercises": [
                    {"name": "Bench Press", "sets": 4, "reps": "8-10", "rest_seconds": 90, "notes": ""},
                    {"name": "Overhead Press", "sets": 3, "reps": "8-10", "rest_seconds": 90, "notes": ""},
                    {"name": "Incline Dumbbell Press", "sets": 3, "reps": "10-12", "rest_seconds": 60, "notes": ""},
                    {"name": "Tricep Pushdowns", "sets": 3, "reps": "12-15", "rest_seconds": 60, "notes": ""},
                ],
            },
            {
                "day": "Tuesday",
                "focus": "Lower Body",
                "exercises": [
                    {"name": "Barbell Squat", "sets": 4, "reps": "6-8", "rest_seconds": 120, "notes": ""},
                    {"name": "Romanian Deadlift", "sets": 3, "reps": "8-10", "rest_seconds": 90, "notes": ""},
                    {"name": "Leg Press", "sets": 3, "reps": "10-12", "rest_seconds": 90, "notes": ""},
                    {"name": "Calf Raises", "sets": 4, "reps": "15-20", "rest_seconds": 45, "notes": ""},
                ],
            },
            {
                "day": "Wednesday",
                "focus": "Rest / Active Recovery",
                "exercises": [
                    {"name": "Light walking or yoga", "sets": 1, "reps": "20-30 min", "rest_seconds": 0, "notes": ""},
                ],
            },
            {
                "day": "Thursday",
                "focus": "Upper Body Pull",
                "exercises": [
                    {"name": "Barbell Row", "sets": 4, "reps": "8-10", "rest_seconds": 90, "notes": ""},
                    {"name": "Pull-ups", "sets": 3, "reps": "AMRAP", "rest_seconds": 90, "notes": ""},
                    {"name": "Face Pulls", "sets": 3, "reps": "15-20", "rest_seconds": 60, "notes": ""},
                    {"name": "Barbell Curl", "sets": 3, "reps": "10-12", "rest_seconds": 60, "notes": ""},
                ],
            },
            {
                "day": "Friday",
                "focus": "Full Body / Conditioning",
                "exercises": [
                    {"name": "Deadlift", "sets": 3, "reps": "5", "rest_seconds": 180, "notes": ""},
                    {"name": "Dumbbell Lunges", "sets": 3, "reps": "10 each", "rest_seconds": 60, "notes": ""},
                    {"name": "Push-ups", "sets": 3, "reps": "15-20", "rest_seconds": 45, "notes": ""},
                    {"name": "Plank", "sets": 3, "reps": "45 sec", "rest_seconds": 30, "notes": ""},
                ],
            },
        ],
        "_demo": True,
    }
