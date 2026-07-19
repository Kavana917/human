"""
Wipe all test_results for the demo user and insert fresh ML-aligned sessions.

Auth: open Analysis Report → Generate Report once (writes backend/debug.json), then:

    python seed_db.py
"""
import json
import os
import random
import sys
from datetime import datetime, timedelta, timezone

import requests
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))
SUPABASE_URL = os.getenv('VITE_SUPABASE_URL')
SUPABASE_KEY = os.getenv('VITE_SUPABASE_ANON_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Missing Supabase credentials in .env")
    sys.exit(1)

debug_path = os.path.join(os.path.dirname(__file__), 'debug.json')
try:
    with open(debug_path, 'r', encoding='utf-8') as f:
        debug_data = json.load(f)
except FileNotFoundError:
    print("debug.json not found. Click Generate Report in the UI first.")
    sys.exit(1)

auth_header = debug_data.get('auth_header_received')
if not auth_header:
    print("Could not find auth header in debug.json")
    sys.exit(1)

try:
    user_id = debug_data['debug_response'][0]['user_id']
except (IndexError, KeyError, TypeError):
    # Fall back to JWT sub if response empty
    try:
        import base64
        token = auth_header.replace('Bearer ', '')
        payload = json.loads(base64.urlsafe_b64decode(token.split('.')[1] + '=='))
        user_id = payload['sub']
    except Exception:
        print("Could not extract user_id from debug.json")
        sys.exit(1)

headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': auth_header,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
}

# ML-aligned test types + glenohumeral-ish recovery bands
MOVEMENT_BANDS = {
    "Arm - Abduction": {
        "rom": (95, 155), "speed": (55, 115), "sd": (4.8, 1.6),
        "ref_max": 175, "phases": [45, 90, 135, 150],
    },
    "Arm - Adduction": {
        "rom": (22, 48), "speed": (45, 95), "sd": (3.8, 1.2),
        "ref_max": 52, "phases": [15, 25, 35, 45],
    },
    "Arm - Flexion": {
        "rom": (55, 85), "speed": (50, 105), "sd": (4.2, 1.4),
        "ref_max": 90, "phases": [30, 50, 70, 80],
    },
    "Arm - Extension": {
        "rom": (20, 48), "speed": (40, 90), "sd": (3.2, 0.9),
        "ref_max": 52, "phases": [15, 25, 35, 45],
    },
    "Arm - Internal Rotation": {
        "rom": (42, 78), "speed": (35, 85), "sd": (3.6, 1.2),
        "ref_max": 90, "phases": [25, 45, 60, 75],
    },
    "Arm - External Rotation": {
        "rom": (38, 75), "speed": (35, 85), "sd": (3.6, 1.2),
        "ref_max": 85, "phases": [25, 40, 55, 70],
    },
}

TEST_TYPES = list(MOVEMENT_BANDS.keys())
SIDES = ['left', 'right']
SESSIONS = [
    {"days_ago": 28, "progress": 0.0},
    {"days_ago": 18, "progress": 0.35},
    {"days_ago": 9, "progress": 0.75},
    {"days_ago": 1, "progress": 1.0},
]


def _lerp(a, b, t):
    return a + (b - a) * t


def generate_mock_record(test_type, side, session_info):
    band = MOVEMENT_BANDS[test_type]
    progress = session_info['progress']
    days_ago = session_info['days_ago']

    rom0, rom1 = band['rom']
    spd0, spd1 = band['speed']
    sd0, sd1 = band['sd']

    base_rom = max(5.0, _lerp(rom0, rom1, progress) + random.uniform(-3, 3))
    base_sd = max(0.5, _lerp(sd0, sd1, progress) + random.uniform(-0.25, 0.25))
    base_peak = max(15.0, _lerp(spd0, spd1, progress) + random.uniform(-4, 4))
    attempt_peaks = [
        round(max(15, base_peak + random.uniform(-12, -2)), 1),
        round(max(15, base_peak + random.uniform(-6, 6)), 1),
        round(max(15, base_peak + random.uniform(-2, 10)), 1),
    ]
    best_peak = round(max(attempt_peaks), 1)
    avg_peak = round(sum(attempt_peaks) / len(attempt_peaks), 1)

    created_at = (datetime.now(timezone.utc) - timedelta(days=days_ago)).isoformat()
    times = [round(i * 0.1, 2) for i in range(50)]
    rolls = [round(base_rom * (1 - abs((i - 25) / 25)), 2) for i in range(50)]
    pitches = [round(random.uniform(-5, 5), 2) for i in range(50)]

    phases = band['phases']
    ref_max = band['ref_max']
    results = {}
    for i, target in enumerate(phases):
        results[str(i)] = {
            "target_angle": target,
            "std_deviation": round(base_sd * (1 + i * 0.05), 2),
            "range": round(4.0 + i, 1),
            "mean_angle": round(target - 0.5, 1),
            "sample_count": 100,
        }

    rom_data = {
        "status": "ok",
        "times": times,
        "rolls": rolls,
        "maxIdx": 25,
        "maxTime": times[25],
        "maxRoll": round(base_rom, 1),
        "baseline": 0,
        "baselineSet": True,
        "referenceRanges": {
            "shoulderLevel": round(ref_max * 0.55),
            "fullAbduction": round(ref_max * 0.9),
            "maximum": ref_max,
        },
    }

    stability_data = {
        "status": "ok",
        "times": times,
        "pitches": pitches,
        "rolls": rolls,
        "currentPhase": len(phases) - 1,
        "targetAngle": phases[-1],
        "currentAngle": phases[-1] - 0.5,
        "zoneStatus": "holding",
        "progress": 1.0,
        "progressType": "hold",
        "inTargetZone": True,
        "testComplete": True,
        "romMaxAngle": round(base_rom, 1),
        "romAvailable": True,
        "results": results,
    }

    speed_data = {
        "status": "ok",
        "speedPhase": "complete",
        "speedProgress": 1.0,
        "speedAttempt": 3,
        "speedAttemptTotal": 3,
        "speedAttemptPeaks": attempt_peaks,
        "speedCurrentRampPeak": 0.0,
        "peakAngularVelocity": best_peak,
        "bestPeakAngularVelocity": best_peak,
        "avgPeakAngularVelocity": avg_peak,
        "speedPeakAngularVelocity": best_peak,
        "speedTestComplete": True,
        "speedUserMaxAngle": round(base_rom, 1),
        "romMaxAngle": round(base_rom, 1),
        "romAvailable": True,
        "times": times,
        "rolls": rolls,
        "currentAngle": 5.0,
    }

    return {
        "user_id": user_id,
        "test_type": test_type,
        "side": side,
        "rom_data": rom_data,
        "stability_data": stability_data,
        "speed_data": speed_data,
        "created_at": created_at,
    }


url = f"{SUPABASE_URL}/rest/v1/test_results"

print(f"Wiping ALL test_results for user {user_id}...")
del_resp = requests.delete(f"{url}?user_id=eq.{user_id}", headers=headers)
if del_resp.status_code not in (200, 204):
    print(f"Delete failed: {del_resp.status_code} - {del_resp.text[:300]}")
    print("Hint: Generate Report in the UI to refresh debug.json JWT, then retry.")
    sys.exit(1)

records = []
for test_type in TEST_TYPES:
    for side in SIDES:
        for session in SESSIONS:
            records.append(generate_mock_record(test_type, side, session))

print(f"Inserting {len(records)} records (6 movements x 2 sides x 4 sessions)...")
resp = requests.post(url, headers=headers, json=records)

if resp.status_code in (200, 201):
    print("Successfully inserted updated mock data!")
    # Show a quick summary of ROM peaks
    by_type = {}
    for r in records:
        by_type.setdefault(r['test_type'], []).append(r['rom_data']['maxRoll'])
    for tt, roms in by_type.items():
        print(f"  {tt}: ROM {min(roms):.0f}-{max(roms):.0f} deg across sessions")
else:
    print(f"Error inserting data: {resp.status_code} - {resp.text}")
    sys.exit(1)
