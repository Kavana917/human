"""
Abduction & Adduction Test Logic
Handles ROM, Stability, and Speed test recording, processing, and data endpoints.
Registered as a Flask Blueprint on the main server.
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
stability_test_phase = 0  # 0-3 for 4 positions
stability_target_angles = [45, 90, 135, 0]  # 4th will be updated to user's max angle
stability_countdown_start_time = 0
stability_hold_start_time = 0
stability_hold_data = {0: [], 1: [], 2: [], 3: []}
stability_results = {}
stability_in_target_zone = False
stability_in_countdown = False

# Speed test baseline variables
speed_baseline = 0.0
speed_baseline_set = False

# Speed test state variables
speed_countdown_start_time = 0
speed_test_start_time = 0
speed_in_countdown = False
speed_rep_times = []
speed_test_complete = False
speed_consistency = 0.0
speed_total_reps = 0
speed_rep_in_progress = 0
speed_reached_peak = False
speed_was_at_baseline = False
speed_user_max_angle = 0.0
speed_angle_history = []
speed_last_rep_time = 0.0
speed_prev_at_baseline = False
speed_prev_below_peak = True

# Speed test constants
SPEED_COUNTDOWN_SECONDS = 5.0
SPEED_ACTIVE_SECONDS = 30.0
SPEED_BASE_TOLERANCE = 5.0
SPEED_REP_START_ANGLE = 15.0
SPEED_SHOULDER_LEVEL = 90.0
SPEED_MAX_MARGIN = 10.0
SPEED_REP_DEBOUNCE_SECONDS = 0.35

target_tolerance = 5  # ±5 degrees tolerance for stability test


# ===========================================================================
# ENDPOINTS
# ===========================================================================

@abduction_bp.route('/toggle_recording/<test_type>/<state>')
def toggle_recording(test_type, state):
    global active_recording, start_time
    global rom_baseline, rom_baseline_set, rom_baseline_time
    global stability_test_phase, stability_countdown_start_time, stability_hold_start_time
    global stability_hold_data, stability_results, stability_in_target_zone
    global stability_baseline, stability_baseline_set, stability_in_countdown
    global speed_baseline, speed_baseline_set, speed_countdown_start_time
    global speed_test_start_time, speed_in_countdown, speed_rep_times
    global speed_test_complete, speed_consistency, speed_total_reps
    global speed_rep_in_progress, speed_user_max_angle, speed_reached_peak
    global speed_angle_history, speed_was_at_baseline, speed_last_rep_time
    global speed_prev_at_baseline, speed_prev_below_peak

    imu = _get_latest_imu()
    print(f"Toggle recording called: test_type={test_type}, state={state}")

    if state == 'start':
        active_recording = test_type
        start_time = time.time()
        print(f"Recording started for {test_type}, active_recording={active_recording}")

        # For ROM, capture baseline when starting
        if test_type == 'rom':
            rom_baseline = imu.get('roll', 0)
            rom_baseline_set = True
            rom_baseline_time = time.time()
            print(f"ROM baseline captured: {rom_baseline:.2f}°")

        # For stability test, capture baseline when arm is down
        if test_type == 'stability':
            stability_baseline = imu.get('roll', 0)
            stability_baseline_set = True
            print(f"Stability baseline captured (arm down): {stability_baseline:.2f}°")

            stability_test_phase = 0
            stability_countdown_start_time = time.time()
            stability_hold_start_time = 0
            stability_hold_data = {0: [], 1: [], 2: [], 3: []}
            stability_results = {}
            stability_in_target_zone = False
            stability_in_countdown = True

            if rom_max_angle > 0:
                stability_target_angles[3] = rom_max_angle
                print(f"Stability test using user's max angle for 4th position: {rom_max_angle:.1f}°")
            else:
                stability_target_angles[3] = 150
                print("Warning: No ROM data available, using default max angle of 150° for 4th position")

            print("Starting stability test - 5-second countdown for phase 1")

        # For speed test, capture baseline and initialize
        if test_type == 'speed':
            speed_baseline = imu.get('roll', 0)
            speed_baseline_set = True
            print(f"Speed baseline captured (arm down): {speed_baseline:.2f}°")

            speed_countdown_start_time = time.time()
            speed_test_start_time = 0
            speed_in_countdown = True
            speed_rep_times = []
            speed_test_complete = False
            speed_consistency = 0.0
            speed_total_reps = 0
            speed_rep_in_progress = 0
            speed_reached_peak = False
            speed_was_at_baseline = False
            speed_angle_history = []
            speed_last_rep_time = 0.0
            speed_prev_at_baseline = False
            speed_prev_below_peak = True

            if rom_max_angle > 0:
                speed_user_max_angle = rom_max_angle
                print(f"Speed test using user's max ROM angle: {speed_user_max_angle:.1f}°")
            else:
                speed_user_max_angle = 150.0
                print("Warning: No ROM data available, using default max angle of 150°")

            rep_peak_target = max(SPEED_SHOULDER_LEVEL, speed_user_max_angle - SPEED_MAX_MARGIN)
            print(f"Starting speed test - {SPEED_COUNTDOWN_SECONDS:.0f}s countdown then {SPEED_ACTIVE_SECONDS:.0f}s active test")
            print(f"Rep rule: leave base (>{SPEED_REP_START_ANGLE:.0f}°) then reach peak (≥{rep_peak_target:.0f}°) = 1 rep")

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

    return {"status": "ok", "active": active_recording}


@abduction_bp.route('/data/rom')
def data_rom():
    global rom_max_angle
    ds = datasets['rom']
    print(f"ROM data endpoint called: samples={len(ds['time']) if ds['time'] else 0}")
    if ds['time'] and len(ds['time']) > 1:
        times = ds['time']
        rolls = ds['roll']
        max_idx = rolls.index(max(rolls))
        max_roll = rolls[max_idx]

        rom_max_angle = max_roll

        assessment = "Needs Improvement"
        assessment_color = "red"
        if max_roll >= 150:
            assessment = "Excellent"
            assessment_color = "green"
        elif max_roll >= 90:
            assessment = "Moderate"
            assessment_color = "orange"

        return {
            "status": "ok",
            "times": times,
            "rolls": rolls,
            "maxIdx": max_idx,
            "maxTime": times[max_idx],
            "maxRoll": max_roll,
            "baseline": rom_baseline if rom_baseline_set else 0,
            "baselineSet": rom_baseline_set,
            "assessment": assessment,
            "assessmentColor": assessment_color,
            "referenceRanges": {
                "shoulderLevel": 90,
                "fullAbduction": 150,
                "maximum": 180
            }
        }
    return {"status": "empty"}


@abduction_bp.route('/data/stability')
def data_stability():
    global stability_test_phase, stability_countdown_start_time, stability_hold_start_time
    global stability_in_target_zone, stability_in_countdown

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
            "testComplete": stability_test_phase >= 3 and len(stability_results) >= 4,
            "romMaxAngle": rom_max_angle,
            "romAvailable": rom_max_angle > 0
        }

        if stability_results:
            response["results"] = stability_results

        return response
    return {
        "status": "empty",
        "currentPhase": 0,
        "targetAngle": stability_target_angles[0],
        "romMaxAngle": rom_max_angle,
        "romAvailable": rom_max_angle > 0
    }


@abduction_bp.route('/data/speed')
def data_speed():
    global speed_countdown_start_time, speed_test_start_time, speed_in_countdown
    global speed_rep_times, speed_test_complete, speed_consistency
    global speed_total_reps, rom_max_angle, speed_user_max_angle, speed_angle_history

    current_time = time.time()
    ds = datasets['speed']

    if speed_in_countdown and speed_countdown_start_time > 0:
        speed_phase = 'countdown'
        countdown_elapsed = current_time - speed_countdown_start_time
        speed_progress = min(countdown_elapsed / SPEED_COUNTDOWN_SECONDS, 1.0)
    elif speed_test_complete:
        speed_phase = 'complete'
        speed_progress = 1.0
    elif speed_test_start_time > 0:
        speed_phase = 'active'
        test_elapsed = current_time - speed_test_start_time
        speed_progress = min(test_elapsed / SPEED_ACTIVE_SECONDS, 1.0)
    else:
        speed_phase = 'countdown'
        speed_progress = 0

    if ds['time'] and len(ds['time']) > 1:
        times = ds['time']
        rolls = ds['roll']

        num_bins = 6
        bins = [f"{i*5}-{(i+1)*5}s" for i in range(num_bins)]
        reps_per_bin = [0] * num_bins

        for rep_time in speed_rep_times:
            bin_idx = min(int(rep_time / 5.0), num_bins - 1)
            if 0 <= bin_idx < num_bins:
                reps_per_bin[bin_idx] += 1

        angle_times = [entry['time'] for entry in speed_angle_history] if speed_angle_history else times
        angle_values = [entry['angle'] for entry in speed_angle_history] if speed_angle_history else rolls

        response = {
            "status": "ok",
            "bins": bins,
            "reps": reps_per_bin,
            "speedPhase": speed_phase,
            "speedProgress": speed_progress,
            "speedRepTimes": list(speed_rep_times),
            "speedTotalReps": speed_total_reps,
            "speedTestComplete": speed_test_complete,
            "speedUserMaxAngle": speed_user_max_angle,
            "romMaxAngle": rom_max_angle,
            "romAvailable": rom_max_angle > 0,
            "times": angle_times,
            "rolls": angle_values,
            "currentAngle": rolls[-1] if rolls else 0
        }

        if speed_test_complete:
            response["speedConsistency"] = speed_consistency if speed_consistency > 0 else None
            if speed_total_reps > 0:
                response["speedRepsPerMinute"] = speed_total_reps * 2

        return response

    return {
        "status": "empty",
        "speedPhase": speed_phase,
        "speedProgress": speed_progress,
        "speedTotalReps": speed_total_reps,
        "speedTestComplete": speed_test_complete,
        "speedUserMaxAngle": speed_user_max_angle,
        "romMaxAngle": rom_max_angle,
        "romAvailable": rom_max_angle > 0,
        "bins": [f"{i*5}-{(i+1)*5}s" for i in range(6)],
        "reps": [0] * 6,
        "times": [],
        "rolls": [],
        "currentAngle": 0
    }


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
    global speed_test_start_time, speed_in_countdown, speed_rep_times
    global speed_test_complete, speed_consistency, speed_total_reps
    global speed_rep_in_progress, speed_user_max_angle, speed_reached_peak
    global speed_angle_history, speed_was_at_baseline, speed_last_rep_time
    global speed_prev_at_baseline, speed_prev_below_peak, active_recording

    print("[Abduction] Data collection thread started")

    while True:
        try:
            if active_recording and active_recording in datasets:
                data = _get_latest_imu()
                ds = datasets[active_recording]
                ds['time'].append(time.time() - start_time)
                ds['pitch'].append(data.get('pitch', 0))

                if len(ds['time']) % 20 == 0:
                    print(f"Collecting data for {active_recording}: samples={len(ds['time'])}, roll={data.get('roll', 0):.2f}°")

                # Apply baseline correction
                if active_recording == 'rom':
                    if rom_baseline_set:
                        relative_roll = data.get('roll', 0) - rom_baseline
                        ds['roll'].append(relative_roll)
                    else:
                        ds['roll'].append(data.get('roll', 0))
                elif active_recording == 'stability' and stability_baseline_set:
                    relative_roll = data.get('roll', 0) - stability_baseline
                    ds['roll'].append(relative_roll)
                elif active_recording == 'speed' and speed_baseline_set:
                    relative_roll = data.get('roll', 0) - speed_baseline
                    ds['roll'].append(relative_roll)
                else:
                    ds['roll'].append(data.get('roll', 0))

                ds['gy'].append(data.get('gy', 0))

                if active_recording == 'rom' and len(ds['time']) % 20 == 0:
                    print(f"ROM data: time={ds['time'][-1]:.2f}s, roll={ds['roll'][-1]:.2f}°, baseline={rom_baseline:.2f}°, baseline_set={rom_baseline_set}")

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

                            if stability_test_phase < 3:
                                stability_test_phase += 1
                                stability_countdown_start_time = 0
                                stability_hold_start_time = 0
                                stability_in_target_zone = False
                                stability_in_countdown = False
                                print(f"*** PHASE COMPLETE - Moving to Phase {stability_test_phase + 1}/4: Target {stability_target_angles[stability_test_phase]}° from baseline ***")
                            else:
                                print("*** STABILITY TEST COMPLETE! ***")
                                active_recording = None
                                print("Stability test recording automatically stopped")

                # ----------------------------------------------------------
                # Speed test logic
                # ----------------------------------------------------------
                if active_recording == 'speed':
                    current_roll = ds['roll'][-1] if ds['roll'] else 0
                    current_time = time.time()
                    at_base = abs(current_roll) <= SPEED_BASE_TOLERANCE
                    left_base_for_rep = current_roll >= SPEED_REP_START_ANGLE
                    peak_target = max(SPEED_SHOULDER_LEVEL, speed_user_max_angle - SPEED_MAX_MARGIN)

                    if speed_test_start_time > 0:
                        test_relative_time = current_time - speed_test_start_time
                        speed_angle_history.append({'time': test_relative_time, 'angle': current_roll})
                        if len(speed_angle_history) > 1200:
                            speed_angle_history.pop(0)

                    # Phase 1: Countdown Phase
                    if speed_in_countdown:
                        countdown_elapsed = current_time - speed_countdown_start_time
                        countdown_remaining = SPEED_COUNTDOWN_SECONDS - countdown_elapsed

                        if int(countdown_elapsed) != int(countdown_elapsed - 0.05):
                            print(f"Speed test countdown: {countdown_remaining:.1f}s remaining")

                        if countdown_elapsed >= SPEED_COUNTDOWN_SECONDS:
                            speed_in_countdown = False
                            speed_test_start_time = current_time
                            speed_angle_history = []
                            speed_was_at_baseline = at_base
                            speed_prev_at_baseline = at_base
                            speed_prev_below_peak = True
                            speed_rep_in_progress = 0
                            speed_reached_peak = False
                            print(f"*** SPEED TEST STARTED - angle: {current_roll:.1f}°, at_base: {speed_was_at_baseline} ***")

                    # Phase 2: Active Test Phase
                    elif not speed_test_complete and speed_test_start_time > 0:
                        test_elapsed = current_time - speed_test_start_time

                        if test_elapsed <= SPEED_ACTIVE_SECONDS:
                            prev_state = speed_rep_in_progress

                            if not speed_was_at_baseline and at_base:
                                speed_was_at_baseline = True
                                print(f"[{test_elapsed:.1f}s] Ready at base angle (0° ± {SPEED_BASE_TOLERANCE:.0f}°)")

                            if speed_was_at_baseline:
                                if speed_rep_in_progress == 0:
                                    if left_base_for_rep and speed_prev_at_baseline:
                                        speed_rep_in_progress = 1
                                        print(f"[{test_elapsed:.1f}s] Rep STARTED - angle: {current_roll:.1f}°")

                                elif speed_rep_in_progress == 1:
                                    crossed_peak_upward = current_roll >= peak_target and speed_prev_below_peak
                                    if crossed_peak_upward and (test_elapsed - speed_last_rep_time) >= SPEED_REP_DEBOUNCE_SECONDS:
                                        speed_total_reps += 1
                                        speed_rep_times.append(test_elapsed)
                                        speed_last_rep_time = test_elapsed
                                        print(f"[{test_elapsed:.1f}s] ✓ Rep {speed_total_reps} COMPLETE - max reached at {current_roll:.1f}°")
                                        speed_rep_in_progress = 0

                            speed_prev_at_baseline = at_base
                            speed_prev_below_peak = current_roll < peak_target

                            if prev_state != speed_rep_in_progress:
                                print(f"[DEBUG] State changed: {prev_state} -> {speed_rep_in_progress}, angle={current_roll:.1f}°, reps={speed_total_reps}")

                            if int(test_elapsed * 2) % 10 == 0 and len(ds['time']) % 100 == 0:
                                print(f"[{test_elapsed:.0f}s] reps={speed_total_reps}, angle={current_roll:.1f}°, state={speed_rep_in_progress}")

                        else:
                            # Phase 3: Test Complete
                            if len(speed_rep_times) >= 2:
                                intervals = [speed_rep_times[i] - speed_rep_times[i-1] for i in range(1, len(speed_rep_times))]
                                if intervals:
                                    speed_consistency = statistics.stdev(intervals)
                                    avg_interval = statistics.mean(intervals)
                                    print(f"Rep intervals: avg={avg_interval:.2f}s, std={speed_consistency:.2f}s")
                            else:
                                speed_consistency = 0.0

                            speed_test_complete = True
                            print(f"*** SPEED TEST COMPLETE! ***")
                            print(f"Results: {speed_total_reps} total reps, consistency (std dev): {speed_consistency:.2f}s")

                            active_recording = None
                            print("Speed test recording automatically stopped")

                if len(ds['time']) > HISTORY_LEN:
                    ds['time'].pop(0)
                    ds['pitch'].pop(0)
                    ds['roll'].pop(0)
                    ds['gy'].pop(0)
        except Exception as e:
            pass
        time.sleep(0.05)
