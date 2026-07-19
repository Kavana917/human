"""
Injury-aware progress targets for shoulder tests.

Used for 30-day recovery prediction and chart reference bands — not as the
primary session comparison (that is the demographic k-NN model).
Thresholds adjust for age, gender, activity level, injury status, and movement.
"""

from typing import Any, Dict, List, Optional


# Peak angular velocity (°/s) targets for max-effort ramps (best of 3) — abduction scale
ACTIVITY_SPEED = {
    'sedentary': {'excellent': 80.0, 'good': 50.0},
    'light': {'excellent': 95.0, 'good': 60.0},
    'moderate': {'excellent': 110.0, 'good': 75.0},
    'active': {'excellent': 130.0, 'good': 90.0},
    'athlete': {'excellent': 160.0, 'good': 110.0},
}

# Adduction ramps are smaller; scale abduction speed bands
ADDUCTION_SPEED_SCALE = 0.75

DEFAULT_ACTIVITY = 'moderate'

# Base ROM bands before age/gender/injury adjustments
MOVEMENT_ROM_BASE = {
    'abduction': {
        'rom_excellent': 150.0,
        'rom_moderate': 90.0,
        'rom_shoulder_level': 90.0,
        'rom_full': 150.0,
        'rom_maximum': 180.0,
        'clamp_excellent': (55, 180),
        'clamp_moderate': (40, 160),
        'clamp_full': (60, 180),
        'clamp_shoulder': (50, 100),
        'age_penalty_excellent': 0.35,
        'label': 'abduction',
    },
    'adduction': {
        'rom_excellent': 48.0,
        'rom_moderate': 30.0,
        'rom_shoulder_level': 25.0,
        'rom_full': 48.0,
        'rom_maximum': 52.0,
        'clamp_excellent': (20, 52),
        'clamp_moderate': (15, 45),
        'clamp_full': (20, 52),
        'clamp_shoulder': (12, 40),
        'age_penalty_excellent': 0.12,
        'label': 'adduction',
    },
    # Glenohumeral flexion band (model cap ~90°), not overhead HT ROM.
    'flexion': {
        'rom_excellent': 88.0,
        'rom_moderate': 65.0,
        'rom_shoulder_level': 45.0,
        'rom_full': 90.0,
        'rom_maximum': 95.0,
        'clamp_excellent': (55, 95),
        'clamp_moderate': (40, 85),
        'clamp_full': (60, 95),
        'clamp_shoulder': (30, 70),
        'age_penalty_excellent': 0.25,
        'label': 'flexion',
    },
}


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def get_normative_targets(
    profile: Optional[Dict[str, Any]] = None,
    movement: str = 'abduction',
) -> Dict[str, Any]:
    """
    Compute injury-aware progress targets for charts and recovery timelines.
    Not used to grade a single session against a demographic peer model.
    """
    profile = profile or {}
    age = int(profile.get('age') or 30)
    gender = (profile.get('gender') or 'other').lower()
    activity = (profile.get('activity_level') or DEFAULT_ACTIVITY).lower()
    has_injury = bool(profile.get('has_injury'))
    movement = (movement or 'abduction').strip().lower()
    if movement not in MOVEMENT_ROM_BASE:
        movement = 'abduction'
    base = MOVEMENT_ROM_BASE[movement]

    if activity not in ACTIVITY_SPEED:
        activity = DEFAULT_ACTIVITY

    speed_cfg = ACTIVITY_SPEED[activity]
    speed_scale = ADDUCTION_SPEED_SCALE if movement == 'adduction' else 1.0

    rom_excellent = base['rom_excellent']
    rom_moderate = base['rom_moderate']
    rom_shoulder_level = base['rom_shoulder_level']
    rom_full = base['rom_full']
    rom_maximum = base['rom_maximum']

    # Age: gradual decline after 30
    if age > 30:
        age_penalty = (age - 30) * base['age_penalty_excellent']
        rom_excellent -= age_penalty
        rom_moderate -= age_penalty * 0.45
        rom_full -= age_penalty * 0.5

    # Gender: small population norm differences
    if gender == 'female':
        rom_excellent -= 3.0 if movement == 'abduction' else 1.0
        rom_moderate -= 2.0 if movement == 'abduction' else 0.5
    elif gender == 'other':
        rom_excellent -= 1.5 if movement == 'abduction' else 0.5

    injury_factor_rom = 0.72 if has_injury else 1.0
    injury_factor_speed = 0.80 if has_injury else 1.0

    rom_excellent = _clamp(rom_excellent * injury_factor_rom, *base['clamp_excellent'])
    rom_moderate = _clamp(rom_moderate * injury_factor_rom, *base['clamp_moderate'])
    rom_full = _clamp(rom_full * injury_factor_rom, *base['clamp_full'])
    rom_shoulder_level = _clamp(rom_shoulder_level * injury_factor_rom, *base['clamp_shoulder'])

    speed_excellent = max(20.0, round(speed_cfg['excellent'] * speed_scale * injury_factor_speed, 1))
    speed_good = max(15.0, round(speed_cfg['good'] * speed_scale * injury_factor_speed, 1))

    stab_excellent_sd = 2.0 if not has_injury else 2.8
    stab_moderate_sd = 4.0 if not has_injury else 5.0

    return {
        'movement': movement,
        'rom_excellent': round(rom_excellent, 1),
        'rom_moderate': round(rom_moderate, 1),
        'rom_shoulder_level': round(rom_shoulder_level, 1),
        # Keep legacy key name for frontend chart wiring
        'rom_full_abduction': round(rom_full, 1),
        'rom_full': round(rom_full, 1),
        'rom_maximum': round(rom_maximum, 1),
        'speed_excellent_deg_s': speed_excellent,
        'speed_good_deg_s': speed_good,
        'speed_excellent_reps': speed_excellent,
        'speed_good_reps': speed_good,
        'stability_excellent_sd': stab_excellent_sd,
        'stability_moderate_sd': stab_moderate_sd,
        'profile_summary': {
            'age': age,
            'gender': gender,
            'activity_level': activity,
            'has_injury': has_injury,
            'movement': movement,
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
    # Support 2-phase (adduction/flexion) and 4-phase (abduction) stability results.
    # Keys may be int or str depending on JSON round-trip.
    phase_sds: List[float] = []
    if isinstance(stab_results, dict):
        for key in sorted(stab_results.keys(), key=lambda k: int(k) if str(k).isdigit() else 0):
            phase = stab_results.get(key)
            if isinstance(phase, dict) and 'std_deviation' in phase:
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


def assess_session(
    metrics: Dict[str, Any],
    profile: Optional[Dict[str, Any]] = None,
    movement: str = 'abduction',
) -> Dict[str, Any]:
    """
    Optional helper: tier metrics against injury-aware progress targets.
    Kept for tooling / experiments; primary session grading uses the ML model.
    """
    norms = get_normative_targets(profile, movement=movement)

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
