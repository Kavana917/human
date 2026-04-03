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
stability_target_angles = [45, 90, 135, 0]  # These will be relative to baseline (0° = arm down position)
stability_countdown_start_time = 0  # For 3-second countdown before hold timer
stability_hold_start_time = 0
stability_hold_data = {0: [], 1: [], 2: [], 3: []}  # Store angles for each phase
stability_results = {}
stability_in_target_zone = False
stability_in_countdown = False  # Track if we're in countdown phase
target_tolerance = 5  # ±5 degrees tolerance

@app.route('/toggle_recording/<test_type>/<state>')
def toggle_recording(test_type, state):
    global active_recording, start_time, rom_baseline, rom_baseline_set, rom_baseline_time, stability_test_phase, stability_countdown_start_time, stability_hold_start_time, stability_hold_data, stability_results, stability_in_target_zone, stability_baseline, stability_baseline_set, stability_in_countdown
    if state == 'start':
        active_recording = test_type
        start_time = time.time()
        
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
        
        # For stability test, initialize test state
        if test_type == 'stability':
            if rom_max_angle > 0:
                stability_target_angles[3] = rom_max_angle
                print(f"Stability test initialized with max ROM angle: {rom_max_angle:.1f}° (relative to baseline)")
            else:
                print("Warning: No ROM data available, using default max angle of 150°")
                stability_target_angles[3] = 150
            
            # Reset stability test state
            stability_test_phase = 0
            stability_countdown_start_time = 0
            stability_hold_start_time = 0
            stability_hold_data = {0: [], 1: [], 2: [], 3: []}
            stability_results = {}
            stability_in_target_zone = False
            stability_in_countdown = False
            print(f"Starting stability test - Phase {stability_test_phase + 1}/4: Target {stability_target_angles[stability_test_phase]}° from baseline")
        
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
    return {"status": "ok", "active": active_recording}

def fetch_data():
    global start_time, rom_baseline, rom_baseline_set, stability_test_phase, stability_countdown_start_time, stability_hold_start_time, stability_hold_data, stability_results, stability_in_target_zone, stability_baseline, stability_baseline_set, stability_in_countdown
    while True:
        try:
            resp = requests.get('http://127.0.0.1:7777/data', timeout=1)
            if resp.status_code == 200 and active_recording and active_recording in datasets:
                data = resp.json()
                ds = datasets[active_recording]
                ds['time'].append(time.time() - start_time)
                ds['pitch'].append(data.get('pitch', 0))
                
                # Apply baseline correction for ROM and stability
                if active_recording == 'rom' and rom_baseline_set:
                    relative_roll = data.get('roll', 0) - rom_baseline
                    ds['roll'].append(relative_roll)
                elif active_recording == 'stability' and stability_baseline_set:
                    relative_roll = data.get('roll', 0) - stability_baseline
                    ds['roll'].append(relative_roll)
                    # Debug for stability test
                    print(f"DEBUG: Raw roll={data.get('roll', 0):.1f}, Stability Baseline={stability_baseline:.1f}, Corrected={relative_roll:.1f}")
                else:
                    ds['roll'].append(data.get('roll', 0))
                    
                ds['gy'].append(data.get('gy', 0))

                # Stability test logic
                if active_recording == 'stability':
                    # Use the already corrected roll data from the dataset
                    current_roll = ds['roll'][-1] if ds['roll'] else 0
                    target_angle = stability_target_angles[stability_test_phase]
                    
                    # Check if user is in target zone (±5 degrees)
                    was_in_target_zone = stability_in_target_zone
                    stability_in_target_zone = abs(current_roll - target_angle) <= target_tolerance
                    
                    # Debug output every second
                    if int(time.time() * 2) % 2 == 0:  # Print every 0.5 seconds
                        if stability_in_countdown:
                            countdown_remaining = 3.0 - (time.time() - stability_countdown_start_time)
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
                        print(f"*** TARGET ANGLE REACHED - Starting 3-second countdown for phase {stability_test_phase + 1} ***")
                    
                    # If in target zone and countdown started, check if countdown is complete
                    if stability_in_target_zone and stability_in_countdown and stability_countdown_start_time > 0:
                        countdown_duration = time.time() - stability_countdown_start_time
                        if countdown_duration >= 3.0:  # 3-second countdown complete
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
            progress = min(countdown_duration / 3.0, 1.0)  # 3-second countdown
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
    ds = datasets['speed']
    if ds['time'] and len(ds['time']) > 1:
        times = ds['time']
        rolls = ds['roll']
        end_t = times[-1]
        
        num_bins = max(1, math.ceil(end_t / 3.0))
        bins = [f"{i*3}-{(i+1)*3}s" for i in range(num_bins)]
        reps = [0] * num_bins
        
        thresh = sum(rolls)/len(rolls) if max(rolls)>15 else 30
        for i in range(1, len(times)):
            if rolls[i] > thresh and rolls[i-1] <= thresh:
                bin_idx = min(int(times[i] / 3.0), num_bins - 1)
                reps[bin_idx] += 1

        return {
            "status": "ok",
            "bins": bins,
            "reps": reps
        }
    return {"status": "empty"}

if __name__ == '__main__':
    print("Python Logic Server Started!")
    app.run(port=5001, host='0.0.0.0')
