"""
Injury-aware progress targets for shoulder abduction tests.

Used for 30-day recovery prediction and chart reference bands — not as the
primary session comparison (that is the demographic k-NN model).
Thresholds adjust for age, gender, activity level, and injury status.
"""

from typing import Any, Dict, List, Optional


# Peak angular velocity (°/s) targets for max-effort abduction ramps (best of 3)
ACTIVITY_SPEED = {
    'sedentary': {'excellent': 80.0, 'good': 50.0},
    'light': {'excellent': 95.0, 'good': 60.0},
    'moderate': {'excellent': 110.0, 'good': 75.0},
    'active': {'excellent': 130.0, 'good': 90.0},
    'athlete': {'excellent': 160.0, 'good': 110.0},
}

DEFAULT_ACTIVITY = 'moderate'


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def get_normative_targets(profile: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Compute injury-aware progress targets for charts and recovery timelines.
    Not used to grade a single session against a demographic peer model.
    """
    profile = profile or {}
    age = int(profile.get('age') or 30)
    gender = (profile.get('gender') or 'other').lower()
    activity = (profile.get('activity_level') or DEFAULT_ACTIVITY).lower()
    has_injury = bool(profile.get('has_injury'))

    if activity not in ACTIVITY_SPEED:
        activity = DEFAULT_ACTIVITY

    speed_cfg = ACTIVITY_SPEED[activity]

    # Base ROM (healthy adult reference, degrees)
    rom_excellent = 150.0
    rom_moderate = 90.0
    rom_shoulder_level = 90.0
    rom_full_abduction = 150.0
    rom_maximum = 180.0

    # Age: gradual decline after 30 (~0.35°/year on excellent threshold)
    if age > 30:
        age_penalty = (age - 30) * 0.35
        rom_excellent -= age_penalty
        rom_moderate -= age_penalty * 0.45
        rom_full_abduction -= age_penalty * 0.5

    # Gender: small population norm differences
    if gender == 'female':
        rom_excellent -= 3.0
        rom_moderate -= 2.0
    elif gender == 'other':
        rom_excellent -= 1.5

    # Injury / rehab: lower expectations (~25% ROM, ~20% speed)
    injury_factor_rom = 0.72 if has_injury else 1.0
    injury_factor_speed = 0.80 if has_injury else 1.0

    rom_excellent = _clamp(rom_excellent * injury_factor_rom, 55, 180)
    rom_moderate = _clamp(rom_moderate * injury_factor_rom, 40, 160)
    rom_full_abduction = _clamp(rom_full_abduction * injury_factor_rom, 60, 180)
    rom_shoulder_level = _clamp(rom_shoulder_level * injury_factor_rom, 50, 100)

    speed_excellent = max(30.0, round(speed_cfg['excellent'] * injury_factor_speed, 1))
    speed_good = max(20.0, round(speed_cfg['good'] * injury_factor_speed, 1))

    stab_excellent_sd = 2.0 if not has_injury else 2.8
    stab_moderate_sd = 4.0 if not has_injury else 5.0

    return {
        'rom_excellent': round(rom_excellent, 1),
        'rom_moderate': round(rom_moderate, 1),
        'rom_shoulder_level': round(rom_shoulder_level, 1),
        'rom_full_abduction': round(rom_full_abduction, 1),
        'rom_maximum': round(rom_maximum, 1),
        'speed_excellent_deg_s': speed_excellent,
        'speed_good_deg_s': speed_good,
        # Legacy aliases kept for older frontend builds during transition
        'speed_excellent_reps': speed_excellent,
        'speed_good_reps': speed_good,
        'stability_excellent_sd': stab_excellent_sd,
        'stability_moderate_sd': stab_moderate_sd,
        'profile_summary': {
            'age': age,
            'gender': gender,
            'activity_level': activity,
            'has_injury': has_injury,
        },
    }


def _tier_rom(value: float, norms: Dict[str, Any]) -> Dict[str, Any]:
    excellent = norms['rom_excellent']
    moderate = norms['rom_moderate']
    if value >= excellent:
        tier, label, color = 'excellent', 'Excellent', 'green'
    elif value >= moderate:
        tier, label, color = 'moderate', 'Moderate', 'orange'
    else:
        tier, label, color = 'needs_improvement', 'Needs Improvement', 'red'

    pct = min(100.0, round((value / excellent) * 100, 1)) if excellent > 0 else 0.0
    return {
        'value': round(value, 1),
        'tier': tier,
        'label': label,
        'color': color,
        'percent_of_ideal': pct,
        'expected_excellent': excellent,
        'expected_moderate': moderate,
    }


def _tier_stability(avg_sd: float, norms: Dict[str, Any]) -> Dict[str, Any]:
    exc = norms['stability_excellent_sd']
    mod = norms['stability_moderate_sd']
    if avg_sd < exc:
        tier, label, color = 'excellent', 'Very Stable', 'green'
    elif avg_sd <= mod:
        tier, label, color = 'moderate', 'Stable', 'orange'
    else:
        tier, label, color = 'needs_improvement', 'Unstable', 'red'

    # Lower SD is better — invert percent vs excellent threshold
    if avg_sd <= 0:
        pct = 100.0
    else:
        pct = min(100.0, round((exc / avg_sd) * 100, 1))

    return {
        'value': round(avg_sd, 2),
        'tier': tier,
        'label': label,
        'color': color,
        'percent_of_ideal': pct,
        'expected_excellent_sd': exc,
        'expected_moderate_sd': mod,
    }


def _tier_speed(peak_deg_s: Optional[float], norms: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Grade best-of-3 peak angular velocity (°/s). Returns None if no measurement."""
    if peak_deg_s is None:
        return None

    exc = norms['speed_excellent_deg_s']
    good = norms['speed_good_deg_s']
    value = float(peak_deg_s)

    if value >= exc:
        tier, label, color = 'excellent', 'Excellent', 'green'
    elif value >= good:
        tier, label, color = 'moderate', 'Good', 'orange'
    else:
        tier, label, color = 'needs_improvement', 'Needs Attention', 'red'

    pct = min(100.0, round((value / exc) * 100, 1)) if exc > 0 else 0.0

    return {
        'value': round(value, 1),
        'tier': tier,
        'label': label,
        'color': color,
        'percent_of_ideal': pct,
        'expected_excellent_deg_s': exc,
        'expected_good_deg_s': good,
        # Legacy aliases for frontend transition
        'expected_excellent_reps': exc,
        'expected_good_reps': good,
    }


def extract_session_metrics(row: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Pull measurable values from a test_results row."""
    rom = row.get('rom_data') or {}
    speed = row.get('speed_data') or {}
    stab = row.get('stability_data') or {}

    peak_rom = rom.get('maxRoll')
    if peak_rom is None:
        return None

    peak_av = speed.get('bestPeakAngularVelocity')
    if peak_av is None:
        peak_av = speed.get('peakAngularVelocity')
    if peak_av is None:
        peak_av = speed.get('speedPeakAngularVelocity')
    if peak_av is not None:
        try:
            peak_av = float(peak_av)
            if peak_av <= 0:
                peak_av = None
        except (TypeError, ValueError):
            peak_av = None

    avg_peak = speed.get('avgPeakAngularVelocity')
    if avg_peak is not None:
        try:
            avg_peak = float(avg_peak)
        except (TypeError, ValueError):
            avg_peak = None

    attempt_peaks = speed.get('speedAttemptPeaks') or []

    stab_results = stab.get('results') or {}
    phase_sds: List[float] = []
    for i in range(4):
        phase = stab_results.get(str(i))
        if phase and 'std_deviation' in phase:
            phase_sds.append(float(phase['std_deviation']))

    avg_sd = sum(phase_sds) / len(phase_sds) if phase_sds else None

    return {
        'peak_rom': float(peak_rom),
        'peak_angular_velocity': peak_av,
        'avg_peak_angular_velocity': avg_peak,
        'attempt_peaks': attempt_peaks,
        'avg_sd': avg_sd,
        'phase_sds': phase_sds,
    }


def assess_session(metrics: Dict[str, Any], profile: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Optional helper: tier metrics against injury-aware progress targets.
    Kept for tooling / experiments; primary session grading uses the ML model.
    """
    norms = get_normative_targets(profile)

    rom = _tier_rom(metrics['peak_rom'], norms)
    stability = _tier_stability(metrics['avg_sd'], norms) if metrics.get('avg_sd') is not None else None
    speed = _tier_speed(metrics.get('peak_angular_velocity'), norms)

    tiers = [rom['tier']]
    if stability:
        tiers.append(stability['tier'])
    if speed:
        tiers.append(speed['tier'])

    excellent_count = sum(1 for t in tiers if t == 'excellent')
    if excellent_count == len(tiers):
        overall_label = 'Excellent'
        overall_color = 'green'
    elif all(t in ('excellent', 'moderate') for t in tiers):
        overall_label = 'Good'
        overall_color = 'orange'
    else:
        overall_label = 'Needs Improvement'
        overall_color = 'red'

    return {
        'normative_targets': norms,
        'rom': rom,
        'stability': stability,
        'speed': speed,
        'overall': {
            'label': overall_label,
            'color': overall_color,
        },
    }
