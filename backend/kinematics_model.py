"""
Demographic-conditioned k-NN kinematic predictor.

Loads trained artifacts from backend/ml_models/<movement>/ and predicts
expected ROM (°), SPEED (°/s), and STABILITY (° SD) from a user profile.
Self-contained — does not import the external mlframework package.
"""

from __future__ import annotations

import json
import traceback
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import numpy as np

MODELS_DIR = Path(__file__).resolve().parent / "ml_models"
SUPPORTED_MOVEMENTS = (
    "abduction",
    "adduction",
    "flexion",
    "extension",
    "internal_rotation",
    "external_rotation",
)

# App test_results.test_type → ML movement_id
TEST_TYPE_TO_MOVEMENT = {
    "Arm - Abduction": "abduction",
    "Arm - Adduction": "adduction",
    "Arm - Flexion": "flexion",
    "Arm - Extension": "extension",
    "Arm - Internal Rotation": "internal_rotation",
    "Arm - External Rotation": "external_rotation",
    # Legacy combined labels (pre-split)
    "Arm - Abduction & Adduction": "abduction",
    "Arm - Flexion & Extension": "flexion",
    "Arm - Horizontal Abduction & Adduction": "abduction",
    "AbductionAdduction": "abduction",
}


def movement_for_test_type(test_type: Optional[str], default: str = "abduction") -> str:
    """Map a stored test_type string to an ML movement_id."""
    if not test_type:
        return default
    return TEST_TYPE_TO_MOVEMENT.get(test_type, default)

SEX_ENCODING = {"M": 0, "F": 1}
ACTIVITY_ORDER = ("sedentary", "moderate", "active")
ACTIVITY_VELOCITY = {"sedentary": 0.75, "moderate": 1.0, "active": 1.30}
ACTIVITY_MAP = {
    "sedentary": "sedentary",
    "light": "sedentary",
    "moderate": "moderate",
    "active": "active",
    "athlete": "active",
}
ROM_MAX_DEG = {
    "abduction": 175.0,
    "adduction": 52.0,
    "flexion": 90.0,
    "extension": 52.0,
    "internal_rotation": 90.0,
    "external_rotation": 85.0,
}

# Cache: movement -> (scaler, model, feature_weights_vector)
_cache: Dict[str, Tuple[Any, Any, np.ndarray]] = {}
_load_error_logged = False


def strength_decay(age: float) -> float:
    if age <= 40:
        return 1.0
    return round(min(1.0, max(0.78, 1.0 - 0.0045 * (age - 40))), 4)


def dynamic_velocity_factor(age: float, activity: str) -> float:
    sd = strength_decay(age)
    activity_vel = ACTIVITY_VELOCITY[activity]
    return round(max(0.05, activity_vel * (0.28 + 0.72 * sd)), 4)


def map_profile_inputs(profile: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Map app profile fields to model inputs. Returns None if height/weight missing."""
    profile = profile or {}
    height = profile.get("height_cm")
    weight = profile.get("weight_kg")
    if height is None or weight is None:
        return None
    try:
        height_cm = float(height)
        weight_kg = float(weight)
    except (TypeError, ValueError):
        return None
    if height_cm <= 0 or weight_kg <= 0:
        return None

    age = int(profile.get("age") or 30)
    gender_raw = (profile.get("gender") or "male").strip().lower()
    gender_note = None
    if gender_raw in ("female", "f"):
        sex = "F"
    elif gender_raw in ("male", "m"):
        sex = "M"
    else:
        # gender == 'other' (or unknown): default to male reference
        sex = "M"
        gender_note = "other -> male reference"

    activity_raw = (profile.get("activity_level") or "moderate").strip().lower()
    activity = ACTIVITY_MAP.get(activity_raw, "moderate")
    bmi = weight_kg / (height_cm / 100.0) ** 2

    inputs = {
        "age": age,
        "sex": sex,
        "height_cm": height_cm,
        "weight_kg": weight_kg,
        "bmi": round(bmi, 2),
        "activity": activity,
    }
    if gender_note:
        inputs["gender_note"] = gender_note
    return inputs


def encode_features(inputs: Dict[str, Any]) -> np.ndarray:
    age = float(inputs["age"])
    activity = inputs["activity"]
    return np.array(
        [[
            age,
            float(SEX_ENCODING[inputs["sex"]]),
            float(inputs["height_cm"]),
            float(inputs["weight_kg"]),
            float(inputs["bmi"]),
            float(ACTIVITY_ORDER.index(activity)),
            strength_decay(age),
            dynamic_velocity_factor(age, activity),
        ]],
        dtype=float,
    )


def _load(movement: str) -> Optional[Tuple[Any, Any, np.ndarray]]:
    global _load_error_logged
    if movement in _cache:
        return _cache[movement]

    movement_dir = MODELS_DIR / movement
    try:
        import joblib

        scaler = joblib.load(movement_dir / "scaler.pkl")
        model = joblib.load(movement_dir / "knn_model.pkl")
        metrics = json.loads((movement_dir / "training_metrics.json").read_text(encoding="utf-8"))
        fw = np.asarray(metrics["feature_weights_vector"], dtype=float)
        _cache[movement] = (scaler, model, fw)
        return _cache[movement]
    except Exception as e:
        if not _load_error_logged:
            print(f"[KinematicsModel] Failed to load '{movement}': {e}")
            traceback.print_exc()
            _load_error_logged = True
        return None


def warm_load(movements: Tuple[str, ...] = SUPPORTED_MOVEMENTS) -> None:
    """Optionally preload models at server startup."""
    for m in movements:
        _load(m)


def predict_expected(
    profile: Optional[Dict[str, Any]],
    movement: str = "abduction",
) -> Optional[Dict[str, Any]]:
    """
    Predict demographically-expected ROM / SPEED / STABILITY.
    Returns None if profile lacks height/weight or model cannot load.
    """
    if movement not in SUPPORTED_MOVEMENTS:
        return None

    inputs = map_profile_inputs(profile)
    if inputs is None:
        return None

    loaded = _load(movement)
    if loaded is None:
        return None

    scaler, model, fw = loaded
    try:
        X = encode_features(inputs)
        X_knn = scaler.transform(X) * np.sqrt(fw)
        rom, speed, stability = model.predict(X_knn)[0]
        rom_cap = ROM_MAX_DEG.get(movement, 180.0)
        rom = float(np.clip(rom, 0.0, rom_cap))
        return {
            "movement": movement,
            "rom": round(rom, 2),
            "speed": round(float(speed), 2),
            "stability": round(float(stability), 4),
            "inputs_used": inputs,
        }
    except Exception as e:
        print(f"[KinematicsModel] Prediction failed for '{movement}': {e}")
        traceback.print_exc()
        return None
