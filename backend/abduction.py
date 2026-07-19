"""
Shoulder coronal-plane IMU tests (abduction / adduction).

Handles ROM, Stability, and Speed recording via a shared pipeline.
Movement is selected with ?movement=abduction|adduction on toggle start
(default: abduction — preserves prior behavior).
"""

import time
import statistics
from flask import Blueprint, request

abduction_bp = Blueprint('abduction', __name__)

# ---------------------------------------------------------------------------
# Shared reference to latestIMU — set by server.py at startup
# ---------------------------------------------------------------------------
_get_latest_imu = None

def init(get_latest_imu_fn):
    """Called by server.py to inject the IMU data accessor."""
    global _get_latest_imu
    _get_latest_imu = get_latest_imu_fn

# ---------------------------------------------------------------------------
# Per-movement protocol
# rom_sign: +1 stores (raw - baseline) as positive raise-from-arm-down.
# This IMU mount: arm-down ≈ -80..-90°, raise to side ≈ 0..+10° — both
# abduction and adduction use +1 so side-raise reads as positive °.
# ---------------------------------------------------------------------------
MOVEMENT_CONFIGS = {
    'abduction': {
        'rom_sign': 1.0,
        'default_max_rom': 150.0,
        'stability_n_phases': 4,
        'stability_fractions': (0.3, 0.6, 0.9, 1.0),
        'stability_fallback': (45.0, 90.0, 135.0, 150.0),
        'speed_ramp_start': 15.0,
        'ref_max': 180.0,
    },
    # Same IMU sense as abduction for this hardware mount:
    # arm-down raw roll ≈ -80..-90 → raise out to the side → raw ≈ 0..+10.
    # Baseline at arm-down; stored angle = (raw - baseline) so side-raise is positive °.
    # Stability: 2 holds only — mid (~33°) then user's ROM max from part 1.
    'adduction': {
        'rom_sign': 1.0,
        'default_max_rom': 50.0,
        'stability_n_phases': 2,
        'stability_mid_deg': 33.0,
        'stability_fallback': (33.0, 50.0),
        'speed_ramp_start': 10.0,
        'ref_max': 100.0,
    },
    # Sagittal flexion on same IMU roll channel (relative mapping):
    # arm-down baseline → raise forward; shoulder level ≈ ~90° relative.
    # Stability: 2 holds — mid (~45°) then user's ROM max from part 1.
    'flexion': {
        'rom_sign': 1.0,
        'default_max_rom': 90.0,
        'stability_n_phases': 2,
        'stability_mid_deg': 45.0,
        'stability_fallback': (45.0, 90.0),
        'speed_ramp_start': 15.0,
        'ref_max': 110.0,
    },
}

active_movement = 'abduction'


def _movement_cfg(movement=None):
    m = movement or active_movement
    return MOVEMENT_CONFIGS.get(m, MOVEMENT_CONFIGS['abduction'])


def _rom_sign():
    return float(_movement_cfg()['rom_sign'])


def _relative_angle(raw_roll, baseline):
    """Baseline-subtracted angle in the active movement's positive direction."""
    return (raw_roll - baseline) * _rom_sign()


def _stability_n_phases(movement=None) -> int:
    return int(_movement_cfg(movement).get('stability_n_phases', 4))


def _build_stability_targets(user_max):
    """Build hold targets for the active movement.

    Two-phase (adduction/flexion): fixed mid, then user's ROM max from part 1.
    Abduction (4 phases): fractions of user max (legacy).
    """
    cfg = _movement_cfg()
    default_max = float(cfg['default_max_rom'])
    max_angle = float(user_max) if user_max and user_max > 0 else default_max
    n = int(cfg.get('stability_n_phases', 4))

    if n == 2:
        mid = float(cfg.get('stability_mid_deg', 45.0))
        # Keep mid below max so the two holds stay distinct
        if max_angle <= mid + 5:
            mid = max(10.0, round(max_angle * 0.65, 1))
        return [round(mid, 1), round(max_angle, 1)]

    fracs = cfg.get('stability_fractions') or (0.3, 0.6, 0.9, 1.0)
    fallback = cfg.get('stability_fallback') or (45.0, 90.0, 135.0, 150.0)
    if user_max and user_max > 0:
        return [round(max_angle * f, 1) for f in fracs]
    return list(fallback)


def _empty_stability_holds(n: int):
    return {i: [] for i in range(n)}


# ---------------------------------------------------------------------------
# Test data history
# ---------------------------------------------------------------------------
HISTORY_LEN = 1000

datasets = {
    'rom': {'time': [], 'pitch': [], 'roll': [], 'gy': []},
    'stability': {'time': [], 'pitch': [], 'roll': [], 'gy': []},
    'speed': {'time': [], 'pitch': [], 'roll': [], 'gy': []}
}

active_recording = None
start_time = 0

# ROM baseline calibration variables
rom_baseline = 0.0
rom_baseline_set = False
rom_baseline_time = 0
rom_max_angle = 0.0  # Store max angle from ROM test for stability test

# Stability test baseline variables
stability_baseline = 0.0
stability_baseline_set = False

# Stability test state variables
stability_test_phase = 0  # 0 .. n_phases-1
stability_target_angles = [45, 90, 135, 150]
stability_countdown_start_time = 0
stability_hold_start_time = 0
stability_hold_data = _empty_stability_holds(4)
stability_results = {}
stability_in_target_zone = False
stability_in_countdown = False

# Speed test baseline variables
speed_baseline = 0.0
speed_baseline_set = False

# Speed test — 3 max-effort ramps (peak angular velocity °/s)
speed_phase = 'countdown'
speed_countdown_start_time = 0
speed_test_start_time = 0
speed_attempt_index = 0  # 0..2
speed_attempt_peaks = []  # peak °/s per completed attempt
speed_current_ramp_peak = 0.0
speed_ramp_start_time = 0
speed_test_complete = False
speed_user_max_angle = 0.0
speed_angle_history = []
speed_prev_roll_for_velocity = None
speed_prev_time_for_velocity = None
speed_best_peak = 0.0
speed_avg_peak = 0.0
speed_ramp_start_angle = 15.0  # set from movement config on start

# Speed test constants
SPEED_COUNTDOWN_SECONDS = 3.0
SPEED_NUM_ATTEMPTS = 3
SPEED_RAMP_TIMEOUT_SECONDS = 6.0
SPEED_BASE_TOLERANCE = 5.0
SPEED_MAX_ANGULAR_VELOCITY_CAP = 800.0

target_tolerance = 5  # ±5 degrees tolerance for stability test


def _speed_finalize_results():
    """Compute best/avg from attempt peaks and mark complete."""
    global speed_best_peak, speed_avg_peak, speed_test_complete, speed_phase, active_recording
    if speed_attempt_peaks:
        speed_best_peak = max(speed_attempt_peaks)
        speed_avg_peak = sum(speed_attempt_peaks) / len(speed_attempt_peaks)
    else:
        speed_best_peak = 0.0
        speed_avg_peak = 0.0
    speed_test_complete = True
    speed_phase = 'complete'
    active_recording = None
    print(
        f"*** SPEED TEST COMPLETE! *** peaks={speed_attempt_peaks} "
        f"best={speed_best_peak:.1f}°/s avg={speed_avg_peak:.1f}°/s"
    )


def _speed_snapshot():
    """Build the /data/speed JSON payload from current state."""
    peaks_rounded = [round(p, 1) for p in speed_attempt_peaks]
    best = round(speed_best_peak, 1) if speed_best_peak > 0 else (
        round(max(speed_attempt_peaks), 1) if speed_attempt_peaks else 0.0
    )
    avg = round(speed_avg_peak, 1) if speed_avg_peak > 0 else (
        round(sum(speed_attempt_peaks) / len(speed_attempt_peaks), 1) if speed_attempt_peaks else 0.0
    )
    live_peak = round(speed_current_ramp_peak, 1) if speed_phase == 'ramp' else best

    progress = 0.0
    now = time.time()
    if speed_phase == 'countdown' and speed_countdown_start_time > 0:
        progress = min((now - speed_countdown_start_time) / SPEED_COUNTDOWN_SECONDS, 1.0)
    elif speed_phase == 'ramp' and speed_ramp_start_time > 0:
        progress = min((now - speed_ramp_start_time) / SPEED_RAMP_TIMEOUT_SECONDS, 1.0)
    elif speed_phase == 'complete':
        progress = 1.0
    elif speed_phase in ('ready', 'rest'):
        progress = speed_attempt_index / SPEED_NUM_ATTEMPTS

    ds = datasets['speed']
    angle_times = [e['time'] for e in speed_angle_history] if speed_angle_history else (ds['time'] or [])
    angle_values = [e['angle'] for e in speed_angle_history] if speed_angle_history else (ds['roll'] or [])

    return {
        "status": "ok" if ds['time'] else "empty",
        "movement": active_movement,
        "speedPhase": speed_phase,
        "speedProgress": progress,
        "speedAttempt": min(speed_attempt_index + 1, SPEED_NUM_ATTEMPTS),
        "speedAttemptTotal": SPEED_NUM_ATTEMPTS,
        "speedAttemptPeaks": peaks_rounded,
        "speedCurrentRampPeak": round(speed_current_ramp_peak, 1),
        "peakAngularVelocity": best,
        "bestPeakAngularVelocity": best,
        "avgPeakAngularVelocity": avg,
        "speedPeakAngularVelocity": live_peak if speed_phase == 'ramp' else best,
        "speedTestComplete": speed_test_complete,
        "speedUserMaxAngle": speed_user_max_angle,
        "romMaxAngle": rom_max_angle,
        "romAvailable": rom_max_angle > 0,
        "times": angle_times,
        "rolls": angle_values,
        "currentAngle": angle_values[-1] if angle_values else 0,
    }


# ===========================================================================
# ENDPOINTS
# ===========================================================================

def _normalize_movement(movement: str | None) -> str:
    m = (movement or 'abduction').strip().lower()
    return m if m in MOVEMENT_CONFIGS else 'abduction'


def _reset_session(movement: str | None = None):
    """Clear all in-memory recordings so the next visit starts blank."""
    global active_recording, active_movement, start_time
    global rom_baseline, rom_baseline_set, rom_baseline_time, rom_max_angle
    global stability_baseline, stability_baseline_set
    global stability_test_phase, stability_countdown_start_time, stability_hold_start_time
    global stability_hold_data, stability_results, stability_in_target_zone, stability_in_countdown
    global stability_target_angles
    global speed_baseline, speed_baseline_set, speed_countdown_start_time
    global speed_test_start_time, speed_phase, speed_attempt_index, speed_attempt_peaks
    global speed_current_ramp_peak, speed_ramp_start_time, speed_test_complete
    global speed_user_max_angle, speed_angle_history
    global speed_prev_roll_for_velocity, speed_prev_time_for_velocity
    global speed_best_peak, speed_avg_peak, speed_ramp_start_angle

    movement = _normalize_movement(movement)
    cfg = _movement_cfg(movement)

    active_recording = None
    active_movement = movement
    start_time = 0

    for key in datasets:
        datasets[key]['time'].clear()
        datasets[key]['pitch'].clear()
        datasets[key]['roll'].clear()
        datasets[key]['gy'].clear()

    rom_baseline = 0.0
    rom_baseline_set = False
    rom_baseline_time = 0
    rom_max_angle = 0.0

    stability_baseline = 0.0
    stability_baseline_set = False
    stability_test_phase = 0
    stability_target_angles = list(cfg['stability_fallback'])
    stability_countdown_start_time = 0
    stability_hold_start_time = 0
    stability_hold_data = _empty_stability_holds(_stability_n_phases())
    stability_results = {}
    stability_in_target_zone = False
    stability_in_countdown = False

    speed_baseline = 0.0
    speed_baseline_set = False
    speed_phase = 'countdown'
    speed_countdown_start_time = 0
    speed_test_start_time = 0
    speed_attempt_index = 0
    speed_attempt_peaks = []
    speed_current_ramp_peak = 0.0
    speed_ramp_start_time = 0
    speed_test_complete = False
    speed_user_max_angle = 0.0
    speed_angle_history = []
    speed_prev_roll_for_velocity = None
    speed_prev_time_for_velocity = None
    speed_best_peak = 0.0
    speed_avg_peak = 0.0
    speed_ramp_start_angle = float(cfg['speed_ramp_start'])

    print(f"[Session] Reset complete for movement={movement}")
    return {"status": "ok", "movement": movement, "cleared": True}


def _toggle_recording_impl(test_type, state, movement: str):
    global active_recording, start_time, active_movement
    global rom_baseline, rom_baseline_set, rom_baseline_time, rom_max_angle
    global stability_test_phase, stability_countdown_start_time, stability_hold_start_time
    global stability_hold_data, stability_results, stability_in_target_zone
    global stability_baseline, stability_baseline_set, stability_in_countdown
    global stability_target_angles
    global speed_baseline, speed_baseline_set, speed_countdown_start_time
    global speed_test_start_time, speed_phase, speed_attempt_index, speed_attempt_peaks
    global speed_current_ramp_peak, speed_ramp_start_time, speed_test_complete
    global speed_user_max_angle, speed_angle_history
    global speed_prev_roll_for_velocity, speed_prev_time_for_velocity
    global speed_best_peak, speed_avg_peak, speed_ramp_start_angle

    imu = _get_latest_imu()
    movement = _normalize_movement(movement)
    cfg = _movement_cfg(movement)

    print(f"Toggle recording called: test_type={test_type}, state={state}, movement={movement}")

    if state == 'start':
        prev_movement = active_movement
        active_movement = movement
        active_recording = test_type
        start_time = time.time()
        speed_ramp_start_angle = float(cfg['speed_ramp_start'])
        print(f"Recording started for {test_type}, movement={active_movement}, rom_sign={cfg['rom_sign']}")

        # Switching movement invalidates prior ROM max (different scale / sign)
        if prev_movement != active_movement:
            rom_max_angle = 0.0
            print(f"ROM max cleared (movement changed {prev_movement} -> {active_movement})")

        # For ROM, capture baseline when starting
        if test_type == 'rom':
            rom_baseline = imu.get('roll', 0)
            rom_baseline_set = True
            rom_baseline_time = time.time()
            rom_max_angle = 0.0
            print(f"ROM baseline captured: {rom_baseline:.2f}°")

        # For stability test, capture baseline when arm is down / neutral
        if test_type == 'stability':
            stability_baseline = imu.get('roll', 0)
            stability_baseline_set = True
            print(f"Stability baseline captured: {stability_baseline:.2f}°")

            n_phases = _stability_n_phases()
            stability_target_angles = _build_stability_targets(rom_max_angle)
            stability_test_phase = 0
            stability_countdown_start_time = time.time()
            stability_hold_start_time = 0
            stability_hold_data = _empty_stability_holds(n_phases)
            stability_results = {}
            stability_in_target_zone = False
            stability_in_countdown = True

            if rom_max_angle > 0:
                print(f"Stability targets from user ROM {rom_max_angle:.1f}°: {stability_target_angles}")
            else:
                print(f"Stability targets (fallback for {active_movement}): {stability_target_angles}")

            print(f"Starting stability test — {n_phases} hold(s), countdown for phase 1")

        # For speed test — 3 max-effort ramps
        if test_type == 'speed':
            speed_baseline = imu.get('roll', 0)
            speed_baseline_set = True
            print(f"Speed baseline captured: {speed_baseline:.2f}°")

            speed_phase = 'countdown'
            speed_countdown_start_time = time.time()
            speed_test_start_time = 0
            speed_attempt_index = 0
            speed_attempt_peaks = []
            speed_current_ramp_peak = 0.0
            speed_ramp_start_time = 0
            speed_test_complete = False
            speed_angle_history = []
            speed_prev_roll_for_velocity = None
            speed_prev_time_for_velocity = None
            speed_best_peak = 0.0
            speed_avg_peak = 0.0

            if rom_max_angle > 0:
                speed_user_max_angle = rom_max_angle
                print(f"Speed test using user's max ROM angle: {speed_user_max_angle:.1f}°")
            else:
                speed_user_max_angle = float(cfg['default_max_rom'])
                print(f"Warning: No ROM data, using default max {speed_user_max_angle:.0f}° for {active_movement}")

            print(
                f"Starting speed test — {SPEED_COUNTDOWN_SECONDS:.0f}s countdown, "
                f"ramp_start={speed_ramp_start_angle}°, "
                f"then {SPEED_NUM_ATTEMPTS} max-effort ramps (peak °/s)"
            )

        if test_type in datasets:
            datasets[test_type]['time'].clear()
            datasets[test_type]['pitch'].clear()
            datasets[test_type]['roll'].clear()
            datasets[test_type]['gy'].clear()
    else:
        active_recording = None
        if test_type == 'rom':
            rom_baseline_set = False
            print("ROM recording stopped, baseline reset")
        elif test_type == 'stability':
            print("Stability test stopped")
        elif test_type == 'speed':
            print("Speed test stopped")

    return {"status": "ok", "active": active_recording, "movement": active_movement}


def _data_rom_payload(movement: str | None = None):
    global rom_max_angle
    movement = _normalize_movement(movement or active_movement)
    ds = datasets['rom']
    cfg = _movement_cfg(movement)
    print(f"ROM data endpoint called: samples={len(ds['time']) if ds['time'] else 0}, movement={movement}")
    if ds['time'] and len(ds['time']) > 1:
        times = ds['time']
        rolls = ds['roll']
        max_idx = rolls.index(max(rolls))
        max_roll = rolls[max_idx]

        # Only update shared rom_max when this matches the active session movement
        if movement == active_movement:
            rom_max_angle = max_roll

        return {
            "status": "ok",
            "movement": movement,
            "times": times,
            "rolls": rolls,
            "maxIdx": max_idx,
            "maxTime": times[max_idx],
            "maxRoll": max_roll,
            "baseline": rom_baseline if rom_baseline_set else 0,
            "baselineSet": rom_baseline_set,
            "referenceRanges": {
                "shoulderLevel": round(float(cfg['ref_max']) * 0.55, 1),
                "fullAbduction": round(float(cfg['default_max_rom']), 1),
                "maximum": float(cfg['ref_max']),
            },
        }
    return {"status": "empty", "movement": movement}


def _data_stability_payload(movement: str | None = None):
    global stability_test_phase, stability_countdown_start_time, stability_hold_start_time
    global stability_in_target_zone, stability_in_countdown

    movement = _normalize_movement(movement or active_movement)
    ds = datasets['stability']
    if ds['time'] and len(ds['time']) > 1:
        times = ds['time']
        pitches = ds['pitch']
        rolls = ds['roll']

        progress = 0
        progress_type = "none"
        if stability_in_countdown and stability_countdown_start_time > 0:
            countdown_duration = time.time() - stability_countdown_start_time
            progress = min(countdown_duration / 5.0, 1.0)
            progress_type = "countdown"
        elif stability_in_target_zone and stability_hold_start_time > 0:
            hold_duration = time.time() - stability_hold_start_time
            progress = min(hold_duration / 5.0, 1.0)
            progress_type = "hold"

        current_angle = rolls[-1] if rolls else 0
        target_angle = stability_target_angles[stability_test_phase]

        if stability_in_countdown:
            zone_status = "countdown"
        elif stability_in_target_zone and stability_hold_start_time > 0:
            zone_status = "holding"
        else:
            zone_status = "target" if stability_in_target_zone else ("approaching" if abs(current_angle - target_angle) <= 10 else "far")

        response = {
            "status": "ok",
            "movement": movement,
            "times": times,
            "pitches": pitches,
            "rolls": rolls,
            "currentPhase": stability_test_phase,
            "targetAngle": target_angle,
            "currentAngle": current_angle,
            "zoneStatus": zone_status,
            "progress": progress,
            "progressType": progress_type,
            "inTargetZone": stability_in_target_zone,
            "testComplete": (
                stability_test_phase >= _stability_n_phases() - 1
                and len(stability_results) >= _stability_n_phases()
            ),
            "romMaxAngle": rom_max_angle,
            "romAvailable": rom_max_angle > 0,
            "targetAngles": list(stability_target_angles),
        }

        if stability_results:
            response["results"] = stability_results

        return response
    fallback = list(_movement_cfg(movement)['stability_fallback'])
    targets = list(stability_target_angles) if movement == active_movement else fallback
    return {
        "status": "empty",
        "movement": movement,
        "currentPhase": 0,
        "targetAngle": targets[0],
        "romMaxAngle": rom_max_angle if movement == active_movement else 0.0,
        "romAvailable": rom_max_angle > 0 and movement == active_movement,
        "targetAngles": targets,
    }


# --- Namespaced routes (preferred): /abduction|adduction|flexion/... ---

@abduction_bp.route('/<movement>/reset', methods=['GET', 'POST'])
def reset_session_ns(movement):
    return _reset_session(movement)


@abduction_bp.route('/<movement>/toggle_recording/<test_type>/<state>')
def toggle_recording_ns(movement, test_type, state):
    return _toggle_recording_impl(test_type, state, movement)


@abduction_bp.route('/<movement>/data/rom')
def data_rom_ns(movement):
    return _data_rom_payload(movement)


@abduction_bp.route('/<movement>/data/stability')
def data_stability_ns(movement):
    return _data_stability_payload(movement)


@abduction_bp.route('/<movement>/data/speed')
def data_speed_ns(movement):
    snap = _speed_snapshot()
    snap['movement'] = _normalize_movement(movement)
    return snap


# --- Legacy un-namespaced routes (still supported) ---

@abduction_bp.route('/reset', methods=['GET', 'POST'])
def reset_session_legacy():
    movement = request.args.get('movement') or active_movement or 'abduction'
    return _reset_session(movement)


@abduction_bp.route('/toggle_recording/<test_type>/<state>')
def toggle_recording(test_type, state):
    movement = request.args.get('movement') or 'abduction'
    return _toggle_recording_impl(test_type, state, movement)


@abduction_bp.route('/data/rom')
def data_rom():
    return _data_rom_payload(active_movement)


@abduction_bp.route('/data/stability')
def data_stability():
    return _data_stability_payload(active_movement)


@abduction_bp.route('/data/speed')
def data_speed():
    return _speed_snapshot()


# ===========================================================================
# Background data collection thread function
# ===========================================================================

def data_collection_loop():
    """Background thread that samples IMU data and runs test logic.
    Called from server.py via threading.Thread."""
    global start_time, rom_baseline, rom_baseline_set
    global stability_test_phase, stability_countdown_start_time, stability_hold_start_time
    global stability_hold_data, stability_results, stability_in_target_zone
    global stability_baseline, stability_baseline_set, stability_in_countdown
    global speed_baseline, speed_baseline_set, speed_countdown_start_time
    global speed_test_start_time, speed_phase, speed_attempt_index, speed_attempt_peaks
    global speed_current_ramp_peak, speed_ramp_start_time, speed_test_complete
    global speed_user_max_angle, speed_angle_history, active_recording
    global speed_prev_roll_for_velocity, speed_prev_time_for_velocity
    global speed_best_peak, speed_avg_peak, speed_ramp_start_angle

    print("[Abduction] Data collection thread started")

    while True:
        try:
            if active_recording and active_recording in datasets:
                data = _get_latest_imu()
                ds = datasets[active_recording]
                ds['time'].append(time.time() - start_time)
                ds['pitch'].append(data.get('pitch', 0))

                if len(ds['time']) % 20 == 0:
                    print(
                        f"Collecting data for {active_recording} ({active_movement}): "
                        f"samples={len(ds['time'])}, roll={data.get('roll', 0):.2f}°"
                    )

                # Apply baseline + movement sign so stored rolls are positive excursion
                raw = data.get('roll', 0)
                if active_recording == 'rom':
                    if rom_baseline_set:
                        ds['roll'].append(_relative_angle(raw, rom_baseline))
                    else:
                        ds['roll'].append(raw)
                elif active_recording == 'stability' and stability_baseline_set:
                    ds['roll'].append(_relative_angle(raw, stability_baseline))
                elif active_recording == 'speed' and speed_baseline_set:
                    ds['roll'].append(_relative_angle(raw, speed_baseline))
                else:
                    ds['roll'].append(raw)

                ds['gy'].append(data.get('gy', 0))

                if active_recording == 'rom' and len(ds['time']) % 20 == 0:
                    print(
                        f"ROM data: time={ds['time'][-1]:.2f}s, "
                        f"angle={ds['roll'][-1]:.2f}°, movement={active_movement}, "
                        f"baseline={rom_baseline:.2f}°"
                    )

                # ----------------------------------------------------------
                # Stability test logic
                # ----------------------------------------------------------
                if active_recording == 'stability':
                    current_roll = ds['roll'][-1] if ds['roll'] else 0
                    target_angle = stability_target_angles[stability_test_phase]

                    was_in_target_zone = stability_in_target_zone
                    stability_in_target_zone = abs(current_roll - target_angle) <= target_tolerance

                    if int(time.time()) % 2 == 0:
                        if stability_in_countdown:
                            countdown_remaining = 5.0 - (time.time() - stability_countdown_start_time)
                            print(f"Phase {stability_test_phase}: Current={current_roll:.1f}°, Target={target_angle}°, Countdown={countdown_remaining:.1f}s")
                        elif stability_hold_start_time > 0:
                            hold_remaining = 5.0 - (time.time() - stability_hold_start_time)
                            print(f"Phase {stability_test_phase}: Current={current_roll:.1f}°, Target={target_angle}°, Holding={hold_remaining:.1f}s")
                        else:
                            print(f"Phase {stability_test_phase}: Current={current_roll:.1f}°, Target={target_angle}°, InZone={stability_in_target_zone}")

                    if stability_in_target_zone and not was_in_target_zone and not stability_in_countdown:
                        stability_countdown_start_time = time.time()
                        stability_in_countdown = True
                        print(f"*** TARGET ANGLE REACHED - Starting 5-second countdown for phase {stability_test_phase + 1} ***")

                    if stability_in_target_zone and stability_in_countdown and stability_countdown_start_time > 0:
                        countdown_duration = time.time() - stability_countdown_start_time
                        if countdown_duration >= 5.0:
                            stability_hold_start_time = time.time()
                            stability_in_countdown = False
                            print(f"*** COUNTDOWN COMPLETE - Starting 5-second hold for phase {stability_test_phase + 1} ***")

                    if not stability_in_target_zone and stability_in_countdown:
                        stability_countdown_start_time = 0
                        stability_in_countdown = False
                        print(f"*** LEFT TARGET ZONE - Countdown reset for phase {stability_test_phase + 1} ***")

                    if stability_in_target_zone and stability_hold_start_time > 0 and not stability_in_countdown:
                        hold_duration = time.time() - stability_hold_start_time
                        if hold_duration <= 5.0:
                            stability_hold_data[stability_test_phase].append(current_roll)
                        else:
                            if len(stability_hold_data[stability_test_phase]) > 0:
                                angles = stability_hold_data[stability_test_phase]
                                std_dev = statistics.stdev(angles) if len(angles) > 1 else 0
                                range_val = max(angles) - min(angles)

                                stability_results[stability_test_phase] = {
                                    'target_angle': target_angle,
                                    'std_deviation': std_dev,
                                    'range': range_val,
                                    'mean_angle': statistics.mean(angles),
                                    'sample_count': len(angles)
                                }

                                print(f"Phase {stability_test_phase + 1} complete: std={std_dev:.2f}°, range={range_val:.2f}°")

                            n_phases = _stability_n_phases()
                            if stability_test_phase < n_phases - 1:
                                stability_test_phase += 1
                                stability_countdown_start_time = 0
                                stability_hold_start_time = 0
                                stability_in_target_zone = False
                                stability_in_countdown = False
                                print(
                                    f"*** PHASE COMPLETE - Moving to Phase "
                                    f"{stability_test_phase + 1}/{n_phases}: "
                                    f"Target {stability_target_angles[stability_test_phase]}° from baseline ***"
                                )
                            else:
                                print(f"*** STABILITY TEST COMPLETE ({n_phases} holds)! ***")
                                active_recording = None
                                print("Stability test recording automatically stopped")

                # ----------------------------------------------------------
                # Speed test — 3 max-effort ramps (peak |Δθ/Δt| °/s)
                # ----------------------------------------------------------
                if active_recording == 'speed' and not speed_test_complete:
                    current_roll = ds['roll'][-1] if ds['roll'] else 0
                    current_time = time.time()
                    at_base = abs(current_roll) <= SPEED_BASE_TOLERANCE
                    left_base = current_roll >= speed_ramp_start_angle

                    if speed_test_start_time > 0:
                        test_relative_time = current_time - speed_test_start_time
                        speed_angle_history.append({'time': test_relative_time, 'angle': current_roll})
                        if len(speed_angle_history) > 1200:
                            speed_angle_history.pop(0)

                    if speed_phase == 'countdown':
                        countdown_elapsed = current_time - speed_countdown_start_time
                        if countdown_elapsed >= SPEED_COUNTDOWN_SECONDS:
                            speed_test_start_time = current_time
                            speed_angle_history = []
                            speed_phase = 'ready'
                            print(f"*** SPEED READY — attempt 1/{SPEED_NUM_ATTEMPTS} ({active_movement}) ***")

                    elif speed_phase == 'ready':
                        if left_base:
                            speed_phase = 'ramp'
                            speed_ramp_start_time = current_time
                            speed_current_ramp_peak = 0.0
                            speed_prev_roll_for_velocity = current_roll
                            speed_prev_time_for_velocity = current_time
                            print(f"*** RAMP {speed_attempt_index + 1}/{SPEED_NUM_ATTEMPTS} STARTED ***")

                    elif speed_phase == 'ramp':
                        if (
                            speed_prev_roll_for_velocity is not None
                            and speed_prev_time_for_velocity is not None
                        ):
                            dt = current_time - speed_prev_time_for_velocity
                            if 0.01 <= dt <= 0.25:
                                ang_vel = abs(current_roll - speed_prev_roll_for_velocity) / dt
                                if ang_vel <= SPEED_MAX_ANGULAR_VELOCITY_CAP:
                                    if ang_vel > speed_current_ramp_peak:
                                        speed_current_ramp_peak = ang_vel
                        speed_prev_roll_for_velocity = current_roll
                        speed_prev_time_for_velocity = current_time

                        ramp_elapsed = current_time - speed_ramp_start_time
                        returned_to_base = at_base and ramp_elapsed > 0.35
                        timed_out = ramp_elapsed >= SPEED_RAMP_TIMEOUT_SECONDS

                        if returned_to_base or timed_out:
                            peak = round(speed_current_ramp_peak, 1)
                            speed_attempt_peaks.append(peak)
                            print(
                                f"*** RAMP {speed_attempt_index + 1} DONE — peak={peak:.1f}°/s "
                                f"({'timeout' if timed_out else 'returned to base'}) ***"
                            )
                            if len(speed_attempt_peaks) >= SPEED_NUM_ATTEMPTS:
                                _speed_finalize_results()
                            else:
                                speed_attempt_index += 1
                                speed_current_ramp_peak = 0.0
                                speed_phase = 'rest'
                                print(f"*** REST — return to neutral for attempt {speed_attempt_index + 1}/{SPEED_NUM_ATTEMPTS} ***")

                    elif speed_phase == 'rest':
                        if at_base:
                            speed_phase = 'ready'
                            print(f"*** READY for attempt {speed_attempt_index + 1}/{SPEED_NUM_ATTEMPTS} ***")

                if len(ds['time']) > HISTORY_LEN:
                    ds['time'].pop(0)
                    ds['pitch'].pop(0)
                    ds['roll'].pop(0)
                    ds['gy'].pop(0)
        except Exception as e:
            pass
        time.sleep(0.05)
