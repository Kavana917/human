"""
Profile-aware normative benchmarks for shoulder abduction tests.
Expected ranges are adjusted for age, gender, activity level, and injury status.
"""

from typing import Any, Dict, List, Optional


ACTIVITY_SPEED = {
    'sedentary': {'excellent': 10, 'good': 6, 'consistency_excellent': 0.6, 'consistency_good': 1.1},
    'light': {'excellent': 12, 'good': 8, 'consistency_excellent': 0.55, 'consistency_good': 1.0},
    'moderate': {'excellent': 15, 'good': 10, 'consistency_excellent': 0.5, 'consistency_good': 1.0},
    'active': {'excellent': 18, 'good': 12, 'consistency_excellent': 0.45, 'consistency_good': 0.9},
    'athlete': {'excellent': 22, 'good': 15, 'consistency_excellent': 0.4, 'consistency_good': 0.85},
}

DEFAULT_ACTIVITY = 'moderate'


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def get_normative_targets(profile: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Compute expected performance targets for a user profile.
    Returns thresholds used for tiered assessment and chart reference lines.
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

    speed_excellent = max(4, int(round(speed_cfg['excellent'] * injury_factor_speed)))
    speed_good = max(3, int(round(speed_cfg['good'] * injury_factor_speed)))

    stab_excellent_sd = 2.0 if not has_injury else 2.8
    stab_moderate_sd = 4.0 if not has_injury else 5.0

    return {
        'rom_excellent': round(rom_excellent, 1),
        'rom_moderate': round(rom_moderate, 1),
        'rom_shoulder_level': round(rom_shoulder_level, 1),
        'rom_full_abduction': round(rom_full_abduction, 1),
        'rom_maximum': round(rom_maximum, 1),
        'speed_excellent_reps': speed_excellent,
        'speed_good_reps': speed_good,
        'speed_consistency_excellent': speed_cfg['consistency_excellent'],
        'speed_consistency_good': speed_cfg['consistency_good'],
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


def _tier_speed(reps: int, consistency: Optional[float], norms: Dict[str, Any]) -> Dict[str, Any]:
    exc = norms['speed_excellent_reps']
    good = norms['speed_good_reps']
    if reps >= exc:
        tier, label, color = 'excellent', 'Excellent', 'green'
    elif reps >= good:
        tier, label, color = 'moderate', 'Good', 'orange'
    else:
        tier, label, color = 'needs_improvement', 'Needs Attention', 'red'

    pct = min(100.0, round((reps / exc) * 100, 1)) if exc > 0 else 0.0

    consistency_assessment = None
    if consistency is not None:
        c_exc = norms['speed_consistency_excellent']
        c_good = norms['speed_consistency_good']
        if consistency < c_exc:
            c_tier, c_label, c_color = 'excellent', 'Very Consistent', 'green'
        elif consistency <= c_good:
            c_tier, c_label, c_color = 'moderate', 'Consistent', 'orange'
        else:
            c_tier, c_label, c_color = 'needs_improvement', 'Inconsistent', 'red'
        consistency_assessment = {
            'value': round(consistency, 2),
            'tier': c_tier,
            'label': c_label,
            'color': c_color,
        }

    return {
        'reps': reps,
        'tier': tier,
        'label': label,
        'color': color,
        'percent_of_ideal': pct,
        'expected_excellent_reps': exc,
        'expected_good_reps': good,
        'consistency': consistency_assessment,
    }


def extract_session_metrics(row: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Pull measurable values from a test_results row."""
    rom = row.get('rom_data') or {}
    speed = row.get('speed_data') or {}
    stab = row.get('stability_data') or {}

    peak_rom = rom.get('maxRoll')
    if peak_rom is None:
        return None

    reps = int(speed.get('speedTotalReps', 0) or 0)
    consistency = speed.get('speedConsistency')
    if consistency is not None:
        consistency = float(consistency)

    stab_results = stab.get('results') or {}
    phase_sds: List[float] = []
    for i in range(4):
        phase = stab_results.get(str(i))
        if phase and 'std_deviation' in phase:
            phase_sds.append(float(phase['std_deviation']))

    avg_sd = sum(phase_sds) / len(phase_sds) if phase_sds else None

    return {
        'peak_rom': float(peak_rom),
        'reps': reps,
        'rep_consistency': consistency,
        'avg_sd': avg_sd,
        'phase_sds': phase_sds,
    }


def assess_session(metrics: Dict[str, Any], profile: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Compare session metrics to profile-adjusted normative targets.
    Returns per-metric assessments and an overall summary.
    """
    norms = get_normative_targets(profile)

    rom = _tier_rom(metrics['peak_rom'], norms)
    stability = _tier_stability(metrics['avg_sd'], norms) if metrics.get('avg_sd') is not None else None
    speed = _tier_speed(metrics['reps'], metrics.get('rep_consistency'), norms)

    tiers = [rom['tier']]
    if stability:
        tiers.append(stability['tier'])
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
