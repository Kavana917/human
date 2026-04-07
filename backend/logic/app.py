import time
import threading
import requests
import math
from flask import Flask, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

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
stability_target_angles = [45, 90, 135, 0]  # These will be relative to baseline (0° = arm down position) - 4th will be updated to user's max angle
stability_countdown_start_time = 0  # For 3-second countdown before hold timer
stability_hold_start_time = 0
stability_hold_data = {0: [], 1: [], 2: [], 3: []}  # Store angles for each phase
stability_results = {}
stability_in_target_zone = False
stability_in_countdown = False  # Track if we're in countdown phase
# Speed test baseline variables
speed_baseline = 0.0
speed_baseline_set = False

# Speed test state variables
speed_countdown_start_time = 0  # For 5-second countdown before test
speed_test_start_time = 0  # For 30-second active test
speed_in_countdown = False  # Track if we're in countdown phase
speed_rep_times = []  # Store timestamps of each rep (relative to test start)
speed_test_complete = False  # Track if test is complete
speed_consistency = 0.0  # Standard deviation of rep intervals
speed_total_reps = 0  # Total reps completed
speed_rep_in_progress = 0  # State: 0=waiting for rep start, 1=rep in progress
speed_reached_peak = False  # Track if max angle reached in current rep cycle
speed_was_at_baseline = False  # True once user has been detected near base angle after test starts
speed_user_max_angle = 0.0  # User's max angle from ROM test
speed_angle_history = []  # Store angle data for line graph during test
speed_last_rep_time = 0.0  # Time when last rep was completed (for debounce)
speed_prev_at_baseline = False  # Previous sample's base-zone status for edge-triggered detection
speed_prev_below_peak = True  # Previous sample was below peak target (for peak crossing detection)

# Speed test constants
SPEED_COUNTDOWN_SECONDS = 5.0
SPEED_ACTIVE_SECONDS = 30.0
SPEED_BASE_TOLERANCE = 5.0
SPEED_REP_START_ANGLE = 15.0
SPEED_SHOULDER_LEVEL = 90.0
SPEED_MAX_MARGIN = 10.0
SPEED_REP_DEBOUNCE_SECONDS = 0.35

target_tolerance = 5  # ±5 degrees tolerance for stability test

@app.route('/toggle_recording/<test_type>/<state>')
def toggle_recording(test_type, state):
    global active_recording, start_time, rom_baseline, rom_baseline_set, rom_baseline_time, stability_test_phase, stability_countdown_start_time, stability_hold_start_time, stability_hold_data, stability_results, stability_in_target_zone, stability_baseline, stability_baseline_set, stability_in_countdown, speed_baseline, speed_baseline_set, speed_countdown_start_time, speed_test_start_time, speed_in_countdown, speed_rep_times, speed_test_complete, speed_consistency, speed_total_reps, speed_rep_in_progress, speed_user_max_angle, speed_reached_peak, speed_angle_history, speed_was_at_baseline, speed_last_rep_time, speed_prev_at_baseline, speed_prev_below_peak
    print(f"Toggle recording called: test_type={test_type}, state={state}")
    if state == 'start':
        active_recording = test_type
        start_time = time.time()
        print(f"Recording started for {test_type}, active_recording={active_recording}")
        
        # For ROM, capture baseline when starting
        if test_type == 'rom':
            try:
                resp = requests.get('http://127.0.0.1:7777/data', timeout=1)
                if resp.status_code == 200:
                    data = resp.json()
                    rom_baseline = data.get('roll', 0)
                    rom_baseline_set = True
                    rom_baseline_time = time.time()
                    print(f"ROM baseline captured: {rom_baseline:.2f}°")
            except:
                rom_baseline = 0.0
                rom_baseline_set = True
                print("Failed to capture ROM baseline, using 0°")
        
        # For stability test, capture baseline when arm is down
        if test_type == 'stability':
            try:
                resp = requests.get('http://127.0.0.1:7777/data', timeout=1)
                if resp.status_code == 200:
                    data = resp.json()
                    stability_baseline = data.get('roll', 0)
                    stability_baseline_set = True
                    print(f"Stability baseline captured (arm down): {stability_baseline:.2f}°")
            except:
                stability_baseline = 0.0
                stability_baseline_set = True
                print("Failed to capture stability baseline, using 0°")
            
            # Reset stability test state
            stability_test_phase = 0
            stability_countdown_start_time = time.time()
            stability_hold_start_time = 0
            stability_hold_data = {0: [], 1: [], 2: [], 3: []}
            stability_results = {}
            stability_in_target_zone = False
            stability_in_countdown = True
            
            # Update 4th target angle to user's max angle from ROM test
            if rom_max_angle > 0:
                stability_target_angles[3] = rom_max_angle
                print(f"Stability test using user's max angle for 4th position: {rom_max_angle:.1f}°")
            else:
                stability_target_angles[3] = 150  # Default fallback
                print("Warning: No ROM data available, using default max angle of 150° for 4th position")
            
            print("Starting stability test - 5-second countdown for phase 1")
        
        # For speed test, capture baseline when arm is down and initialize test state
        if test_type == 'speed':
            # Capture baseline (arm down position)
            try:
                resp = requests.get('http://127.0.0.1:7777/data', timeout=1)
                if resp.status_code == 200:
                    data = resp.json()
                    speed_baseline = data.get('roll', 0)
                    speed_baseline_set = True
                    print(f"Speed baseline captured (arm down): {speed_baseline:.2f}°")
            except:
                speed_baseline = 0.0
                speed_baseline_set = True
                print("Failed to capture speed baseline, using 0°")
            
            # Reset all speed test state variables
            speed_countdown_start_time = time.time()
            speed_test_start_time = 0
            speed_in_countdown = True
            speed_rep_times = []
            speed_test_complete = False
            speed_consistency = 0.0
            speed_total_reps = 0
            speed_rep_in_progress = 0  # State: 0=waiting for rep start, 1=rep in progress
            speed_reached_peak = False
            speed_was_at_baseline = False
            speed_angle_history = []
            speed_last_rep_time = 0.0
            speed_prev_at_baseline = False
            speed_prev_below_peak = True
            
            # Use user's max angle from ROM test for rep detection thresholds
            if rom_max_angle > 0:
                speed_user_max_angle = rom_max_angle
                print(f"Speed test using user's max ROM angle: {speed_user_max_angle:.1f}°")
            else:
                speed_user_max_angle = 150.0  # Default fallback
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

def fetch_data():
    global start_time, rom_baseline, rom_baseline_set, stability_test_phase, stability_countdown_start_time, stability_hold_start_time, stability_hold_data, stability_results, stability_in_target_zone, stability_baseline, stability_baseline_set, stability_in_countdown, speed_baseline, speed_baseline_set, speed_countdown_start_time, speed_test_start_time, speed_in_countdown, speed_rep_times, speed_test_complete, speed_consistency, speed_total_reps, speed_rep_in_progress, speed_user_max_angle, speed_reached_peak, speed_angle_history, speed_was_at_baseline, speed_last_rep_time, speed_prev_at_baseline, speed_prev_below_peak, active_recording
    print(f"Fetch data loop: active_recording={active_recording}")
    while True:
        try:
            resp = requests.get('http://127.0.0.1:7777/data', timeout=1)
            if resp.status_code == 200 and active_recording and active_recording in datasets:
                data = resp.json()
                ds = datasets[active_recording]
                ds['time'].append(time.time() - start_time)
                ds['pitch'].append(data.get('pitch', 0))
                
                # Debug output for data collection
                if len(ds['time']) % 20 == 0:
                    print(f"Collecting data for {active_recording}: samples={len(ds['time'])}, roll={data.get('roll', 0):.2f}°")
                
                # Apply baseline correction for ROM, stability, and speed
                if active_recording == 'rom':
                    if rom_baseline_set:
                        relative_roll = data.get('roll', 0) - rom_baseline
                        ds['roll'].append(relative_roll)
                    else:
                        # If baseline not set, use raw data temporarily
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

                # Debug output for ROM data collection
                if active_recording == 'rom' and len(ds['time']) % 20 == 0:  # Print every 20 samples
                    print(f"ROM data: time={ds['time'][-1]:.2f}s, roll={ds['roll'][-1]:.2f}°, baseline={rom_baseline:.2f}°, baseline_set={rom_baseline_set}")

                # Stability test logic
                if active_recording == 'stability':
                    # Use the already corrected roll data from the dataset
                    current_roll = ds['roll'][-1] if ds['roll'] else 0
                    target_angle = stability_target_angles[stability_test_phase]
                    
                    # Check if user is in target zone (±5 degrees)
                    was_in_target_zone = stability_in_target_zone
                    stability_in_target_zone = abs(current_roll - target_angle) <= target_tolerance
                    
                    # Debug output every 2 seconds (reduced frequency)
                    if int(time.time()) % 2 == 0:  # Print every 2 seconds
                        if stability_in_countdown:
                            countdown_remaining = 5.0 - (time.time() - stability_countdown_start_time)
                            print(f"Phase {stability_test_phase}: Current={current_roll:.1f}°, Target={target_angle}°, Countdown={countdown_remaining:.1f}s")
                        elif stability_hold_start_time > 0:
                            hold_remaining = 5.0 - (time.time() - stability_hold_start_time)
                            print(f"Phase {stability_test_phase}: Current={current_roll:.1f}°, Target={target_angle}°, Holding={hold_remaining:.1f}s")
                        else:
                            print(f"Phase {stability_test_phase}: Current={current_roll:.1f}°, Target={target_angle}°, InZone={stability_in_target_zone}")
                    
                    # If just entered target zone, start countdown
                    if stability_in_target_zone and not was_in_target_zone and not stability_in_countdown:
                        stability_countdown_start_time = time.time()
                        stability_in_countdown = True
                        print(f"*** TARGET ANGLE REACHED - Starting 5-second countdown for phase {stability_test_phase + 1} ***")
                    
                    # If in target zone and countdown started, check if countdown is complete
                    if stability_in_target_zone and stability_in_countdown and stability_countdown_start_time > 0:
                        countdown_duration = time.time() - stability_countdown_start_time
                        if countdown_duration >= 5.0:  # 5-second countdown complete
                            stability_hold_start_time = time.time()
                            stability_in_countdown = False
                            print(f"*** COUNTDOWN COMPLETE - Starting 5-second hold for phase {stability_test_phase + 1} ***")
                    
                    # If left target zone during countdown, reset countdown
                    if not stability_in_target_zone and stability_in_countdown:
                        stability_countdown_start_time = 0
                        stability_in_countdown = False
                        print(f"*** LEFT TARGET ZONE - Countdown reset for phase {stability_test_phase + 1} ***")
                    
                    # If in target zone and hold timer started, collect data
                    if stability_in_target_zone and stability_hold_start_time > 0 and not stability_in_countdown:
                        hold_duration = time.time() - stability_hold_start_time
                        if hold_duration <= 5.0:  # 5-second hold period
                            stability_hold_data[stability_test_phase].append(current_roll)
                        else:
                            # Hold complete, move to next phase
                            if len(stability_hold_data[stability_test_phase]) > 0:
                                # Calculate stability metrics for this phase
                                import statistics
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
                            
                            # Move to next phase or complete test
                            if stability_test_phase < 3:
                                stability_test_phase += 1
                                stability_countdown_start_time = 0
                                stability_hold_start_time = 0
                                stability_in_target_zone = False
                                stability_in_countdown = False
                                print(f"*** PHASE COMPLETE - Moving to Phase {stability_test_phase + 1}/4: Target {stability_target_angles[stability_test_phase]}° from baseline ***")
                            else:
                                print("*** STABILITY TEST COMPLETE! ***")
                                # Automatically stop recording after test completion
                                active_recording = None
                                print("Stability test recording automatically stopped")

                # Speed test logic - 5s countdown → 30s active test → completion
                if active_recording == 'speed':
                    current_roll = ds['roll'][-1] if ds['roll'] else 0
                    current_time = time.time()
                    at_base = abs(current_roll) <= SPEED_BASE_TOLERANCE
                    left_base_for_rep = current_roll >= SPEED_REP_START_ANGLE
                    peak_target = max(SPEED_SHOULDER_LEVEL, speed_user_max_angle - SPEED_MAX_MARGIN)
                    
                    # Store angle data for real-time line graph (with timestamp relative to test start)
                    if speed_test_start_time > 0:
                        test_relative_time = current_time - speed_test_start_time
                        speed_angle_history.append({'time': test_relative_time, 'angle': current_roll})
                        # Keep only last 60 seconds of data
                        if len(speed_angle_history) > 1200:  # ~60s at 20Hz
                            speed_angle_history.pop(0)
                    
                    # Phase 1: Countdown Phase (5 seconds)
                    if speed_in_countdown:
                        countdown_elapsed = current_time - speed_countdown_start_time
                        countdown_remaining = SPEED_COUNTDOWN_SECONDS - countdown_elapsed
                        
                        # Debug output every second
                        if int(countdown_elapsed) != int(countdown_elapsed - 0.05):
                            print(f"Speed test countdown: {countdown_remaining:.1f}s remaining")
                        
                        if countdown_elapsed >= SPEED_COUNTDOWN_SECONDS:
                            # Countdown complete, start active test
                            speed_in_countdown = False
                            speed_test_start_time = current_time
                            speed_angle_history = []  # Clear history for fresh test data
                            speed_was_at_baseline = at_base
                            speed_prev_at_baseline = at_base
                            speed_prev_below_peak = True  # Start below peak
                            speed_rep_in_progress = 0  # Reset to state 0 (waiting for rep start)
                            speed_reached_peak = False
                            print(f"*** SPEED TEST STARTED - angle: {current_roll:.1f}°, at_base: {speed_was_at_baseline} ***")
                    
                    # Phase 2: Active Test Phase (30 seconds)
                    elif not speed_test_complete and speed_test_start_time > 0:
                        test_elapsed = current_time - speed_test_start_time
                        
                        if test_elapsed <= SPEED_ACTIVE_SECONDS:
                            # New rep definition: start near base (0°), reach ROM max target, return near base.
                            prev_state = speed_rep_in_progress

                            # Arm detector only after user is seen near base at least once.
                            if not speed_was_at_baseline and at_base:
                                speed_was_at_baseline = True
                                print(f"[{test_elapsed:.1f}s] Ready at base angle (0° ± {SPEED_BASE_TOLERANCE:.0f}°)")

                            if speed_was_at_baseline:
                                if speed_rep_in_progress == 0:
                                    # Start a rep only after leaving base meaningfully.
                                    if left_base_for_rep and speed_prev_at_baseline:
                                        speed_rep_in_progress = 1
                                        print(f"[{test_elapsed:.1f}s] Rep STARTED - angle: {current_roll:.1f}°")

                                elif speed_rep_in_progress == 1:
                                    # Rep counts when crossing peak threshold upward (base -> max).
                                    crossed_peak_upward = current_roll >= peak_target and speed_prev_below_peak
                                    if crossed_peak_upward and (test_elapsed - speed_last_rep_time) >= SPEED_REP_DEBOUNCE_SECONDS:
                                        speed_total_reps += 1
                                        speed_rep_times.append(test_elapsed)
                                        speed_last_rep_time = test_elapsed
                                        print(f"[{test_elapsed:.1f}s] ✓ Rep {speed_total_reps} COMPLETE - max reached at {current_roll:.1f}°")
                                        speed_rep_in_progress = 0

                            speed_prev_at_baseline = at_base
                            speed_prev_below_peak = current_roll < peak_target

                            # DEBUG: Log every state change
                            if prev_state != speed_rep_in_progress:
                                print(f"[DEBUG] State changed: {prev_state} -> {speed_rep_in_progress}, angle={current_roll:.1f}°, reps={speed_total_reps}")
                            
                            # Debug output every 5 seconds
                            if int(test_elapsed * 2) % 10 == 0 and len(ds['time']) % 100 == 0:
                                print(f"[{test_elapsed:.0f}s] reps={speed_total_reps}, angle={current_roll:.1f}°, state={speed_rep_in_progress}")
                        
                        else:
                            # Phase 3: Test Complete - Calculate consistency
                            import statistics
                            
                            if len(speed_rep_times) >= 2:
                                # Calculate intervals between consecutive reps
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
                            
                            # Auto-stop recording
                            active_recording = None
                            print("Speed test recording automatically stopped")

                if len(ds['time']) > HISTORY_LEN:
                    ds['time'].pop(0)
                    ds['pitch'].pop(0)
                    ds['roll'].pop(0)
                    ds['gy'].pop(0)
        except:
            pass
        time.sleep(0.05) 

t = threading.Thread(target=fetch_data, daemon=True)
t.start()

@app.route('/data/rom')
def data_rom():
    global rom_max_angle
    ds = datasets['rom']
    print(f"ROM data endpoint called: samples={len(ds['time']) if ds['time'] else 0}")
    if ds['time'] and len(ds['time']) > 1:
        times = ds['time']
        rolls = ds['roll']
        max_idx = rolls.index(max(rolls))
        max_roll = rolls[max_idx]
        
        # Store max angle for stability test use
        rom_max_angle = max_roll
        
        # Determine assessment based on max angle
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


@app.route('/data/stability')
def data_stability():
    global stability_test_phase, stability_countdown_start_time, stability_hold_start_time, stability_in_target_zone, stability_in_countdown
    import time
    
    ds = datasets['stability']
    if ds['time'] and len(ds['time']) > 1:
        times = ds['time']
        pitches = ds['pitch']
        rolls = ds['roll']
        
        # Calculate current progress (countdown or hold)
        progress = 0
        progress_type = "none"
        if stability_in_countdown and stability_countdown_start_time > 0:
            countdown_duration = time.time() - stability_countdown_start_time
            progress = min(countdown_duration / 5.0, 1.0)  # 5-second countdown
            progress_type = "countdown"
        elif stability_in_target_zone and stability_hold_start_time > 0:
            hold_duration = time.time() - stability_hold_start_time
            progress = min(hold_duration / 5.0, 1.0)  # 5-second hold
            progress_type = "hold"
        
        # Get current angle for target detection
        current_angle = rolls[-1] if rolls else 0
        target_angle = stability_target_angles[stability_test_phase]
        
        # Determine zone status
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
        
        # Add results if available
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


@app.route('/data/speed')
def data_speed():
    global speed_countdown_start_time, speed_test_start_time, speed_in_countdown, speed_rep_times, speed_test_complete, speed_consistency, speed_total_reps, rom_max_angle, speed_user_max_angle, speed_angle_history
    import time
    
    current_time = time.time()
    ds = datasets['speed']
    
    # Calculate current phase and progress
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
        
        # Create 5-second bins for bar chart (6 bins for 30-second test)
        num_bins = 6  # Fixed 6 bins for 30-second test
        bins = [f"{i*5}-{(i+1)*5}s" for i in range(num_bins)]
        reps_per_bin = [0] * num_bins
        
        # Count reps in each 5-second bin (rep_times are relative to test start)
        for rep_time in speed_rep_times:
            bin_idx = min(int(rep_time / 5.0), num_bins - 1)
            if 0 <= bin_idx < num_bins:
                reps_per_bin[bin_idx] += 1
        
        # Get real-time angle data for line graph (from angle history during active test)
        angle_times = [entry['time'] for entry in speed_angle_history] if speed_angle_history else times
        angle_values = [entry['angle'] for entry in speed_angle_history] if speed_angle_history else rolls
        
        response = {
            "status": "ok",
            "bins": bins,
            "reps": reps_per_bin,
            "speedPhase": speed_phase,
            "speedProgress": speed_progress,
            "speedRepTimes": list(speed_rep_times),  # Convert to list in case it's modified
            "speedTotalReps": speed_total_reps,
            "speedTestComplete": speed_test_complete,
            "speedUserMaxAngle": speed_user_max_angle,
            "romMaxAngle": rom_max_angle,
            "romAvailable": rom_max_angle > 0,
            "times": angle_times,  # Real-time angle timestamps
            "rolls": angle_values,  # Real-time angle values for line graph
            "currentAngle": rolls[-1] if rolls else 0  # Current angle for display
        }
        
        # Add consistency metrics if test is complete
        if speed_test_complete:
            response["speedConsistency"] = speed_consistency if speed_consistency > 0 else None
            # Calculate reps per minute equivalent
            if speed_total_reps > 0:
                response["speedRepsPerMinute"] = speed_total_reps * 2  # 30s test → multiply by 2
            
        return response
    
    # Return default response when no data yet
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

if __name__ == '__main__':
    print("Python Logic Server Started!")
    app.run(port=5001, host='0.0.0.0')
