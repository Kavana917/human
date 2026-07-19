"""
Compare measured session metrics against k-NN demographic expectations.
ROM and Stability get deviation verdicts; Speed is informational only.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

# Tolerance bands (from plan §7; derived from model MAE + margin)
ROM_BAND_DEG = 6.0
ROM_WELL_BELOW_DEG = 15.0
STABILITY_BAND_DEG = 0.6
STABILITY_LESS_STEADY_DEG = 1.5

SPEED_NOTE = (
    "Model speed is a max-effort simulator metric; not directly comparable "
    "to self-paced peak angular velocity."
)

# Verdict severity for overall summary (higher = worse)
_SEVERITY = {
    "meets": 0,
    "exceeds": 0,
    "as_steady": 0,
    "slightly_below": 1,
    "slightly_less_steady": 1,
    "well_below": 2,
    "less_steady": 2,
}


def _pct(deviation: float, expected: float) -> Optional[float]:
    if expected == 0:
        return None
    return round((deviation / expected) * 100.0, 1)


def compare_rom(measured: float, expected: float) -> Dict[str, Any]:
    deviation = measured - expected
    if abs(deviation) <= ROM_BAND_DEG:
        verdict, label, color = "meets", "Meets demographic expectation", "green"
    elif deviation > ROM_BAND_DEG:
        verdict, label, color = "exceeds", "Exceeds expectation", "green"
    elif deviation >= -ROM_WELL_BELOW_DEG:
        verdict, label, color = "slightly_below", "Slightly below expectation", "orange"
    else:
        verdict, label, color = "well_below", "Well below expectation", "red"

    return {
        "measured": round(measured, 1),
        "expected": round(expected, 1),
        "deviation": round(deviation, 1),
        "pct": _pct(deviation, expected),
        "verdict": verdict,
        "label": label,
        "color": color,
    }


def compare_stability(measured: float, expected: float) -> Dict[str, Any]:
    """Lower SD is better."""
    deviation = measured - expected
    if measured <= expected + STABILITY_BAND_DEG:
        verdict, label, color = "as_steady", "As steady as expected or better", "green"
    elif measured <= expected + STABILITY_LESS_STEADY_DEG:
        verdict, label, color = "slightly_less_steady", "Slightly less steady", "orange"
    else:
        verdict, label, color = "less_steady", "Less steady than expected", "red"

    return {
        "measured": round(measured, 2),
        "expected": round(expected, 2),
        "deviation": round(deviation, 2),
        "pct": _pct(deviation, expected),
        "verdict": verdict,
        "label": label,
        "color": color,
    }


def _variation_summary(rom: Optional[Dict], stability: Optional[Dict]) -> Dict[str, str]:
    candidates = []
    if rom:
        candidates.append(rom)
    if stability:
        candidates.append(stability)
    if not candidates:
        return {"label": "Insufficient data for comparison", "color": "orange"}

    worst = max(candidates, key=lambda c: _SEVERITY.get(c["verdict"], 0))
    if _SEVERITY.get(worst["verdict"], 0) >= 2:
        return {"label": "Below demographic expectation", "color": "red"}
    if _SEVERITY.get(worst["verdict"], 0) == 1:
        return {"label": "Slightly below demographic expectation", "color": "orange"}
    if any(c["verdict"] == "exceeds" for c in candidates):
        return {"label": "Meets or exceeds demographic expectation", "color": "green"}
    return {"label": "Meets demographic expectation", "color": "green"}


def build_ml_comparison(
    measured_metrics: Optional[Dict[str, Any]],
    expected: Optional[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    """
    Assemble ROM + Stability comparisons and informational Speed row.
    Returns None if expected is unavailable.
    """
    if not expected:
        return None

    measured_metrics = measured_metrics or {}
    rom_cmp = None
    stab_cmp = None

    peak_rom = measured_metrics.get("peak_rom")
    if peak_rom is not None:
        rom_cmp = compare_rom(float(peak_rom), float(expected["rom"]))

    avg_sd = measured_metrics.get("avg_sd")
    if avg_sd is not None:
        stab_cmp = compare_stability(float(avg_sd), float(expected["stability"]))

    peak_av = measured_metrics.get("peak_angular_velocity")
    speed_info = {
        "informational": True,
        "measured_deg_s": round(float(peak_av), 1) if peak_av is not None else None,
        "expected_deg_s": round(float(expected["speed"]), 1),
        "note": SPEED_NOTE,
    }

    return {
        "rom": rom_cmp,
        "stability": stab_cmp,
        "speed": speed_info,
        "variation_summary": _variation_summary(rom_cmp, stab_cmp),
    }
