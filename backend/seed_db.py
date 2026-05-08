import os
import sys
import json
import random
import requests
import urllib.parse
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv

# Load env
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))
SUPABASE_URL = os.getenv('VITE_SUPABASE_URL')
SUPABASE_KEY = os.getenv('VITE_SUPABASE_ANON_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Missing Supabase credentials in .env")
    sys.exit(1)

# Get auth header from debug.json
try:
    with open('debug.json', 'r') as f:
        debug_data = json.load(f)
except FileNotFoundError:
    print("debug.json not found. Please click Generate Report in the UI first.")
    sys.exit(1)

auth_header = debug_data.get('auth_header_received')
if not auth_header:
    print("Could not find auth header in debug.json")
    sys.exit(1)

# Extract user_id from debug_response
try:
    user_id = debug_data['debug_response'][0]['user_id']
except (IndexError, KeyError):
    print("Could not extract user_id from debug.json")
    sys.exit(1)

headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': auth_header,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
}

TEST_TYPES = [
    "Arm - Flexion & Extension",
    "Arm - Internal Rotation",
    "Arm - External Rotation",
    "Arm - Horizontal Abduction & Adduction"
]

SIDES = ['left', 'right']

# 4 sessions per test/side to show a clear improvement trend
SESSIONS = [
    {"days_ago": 28, "progress": 0.0},
    {"days_ago": 18, "progress": 0.35},
    {"days_ago": 9,  "progress": 0.75},
    {"days_ago": 1,  "progress": 1.0}
]

def generate_mock_record(test_type, side, session_info):
    progress = session_info['progress']
    days_ago = session_info['days_ago']
    
    # Calculate values based on progress (0.0 to 1.0)
    base_rom = 75 + (80 * progress) + random.uniform(-4, 4)
    base_reps = int(5 + (15 * progress) + random.randint(-2, 2))
    base_sd = 5.5 - (4.0 * progress) + random.uniform(-0.4, 0.4)
    
    created_at = (datetime.now(timezone.utc) - timedelta(days=days_ago)).isoformat()
    
    # Generate dummy continuous arrays
    # 50 points, 0.1s apart
    times = [round(i * 0.1, 2) for i in range(50)]
    # Just a fake curve going up to maxRoll and down
    rolls = [round(base_rom * (1 - abs((i - 25) / 25)), 2) for i in range(50)]
    pitches = [round(random.uniform(-5, 5), 2) for i in range(50)]
    
    # Mock rom_data
    rom_data = {
        "status": "ok",
        "times": times,
        "rolls": rolls,
        "maxIdx": 25,
        "maxTime": times[25],
        "maxRoll": round(base_rom, 1),
        "baseline": 0,
        "baselineSet": True,
        "assessment": "Excellent" if base_rom >= 130 else ("Moderate" if base_rom >= 90 else "Needs Improvement"),
        "assessmentColor": "green" if base_rom >= 130 else ("orange" if base_rom >= 90 else "red"),
        "referenceRanges": { "shoulderLevel": 90, "fullAbduction": 150, "maximum": 180 }
    }
    
    # Mock stability_data
    stability_data = {
        "status": "ok",
        "times": times,
        "pitches": pitches,
        "rolls": rolls,
        "currentPhase": 3,
        "targetAngle": 140,
        "currentAngle": 139.5,
        "zoneStatus": "holding",
        "progress": 1.0,
        "progressType": "hold",
        "inTargetZone": True,
        "testComplete": True,
        "romMaxAngle": round(base_rom, 1),
        "romAvailable": True,
        "results": {
            "0": {"target_angle": 45, "std_deviation": round(base_sd, 2), "range": 5.0, "mean_angle": 44.5, "sample_count": 100},
            "1": {"target_angle": 90, "std_deviation": round(base_sd * 1.05, 2), "range": 6.0, "mean_angle": 89.5, "sample_count": 100},
            "2": {"target_angle": 135, "std_deviation": round(base_sd * 1.1, 2), "range": 7.0, "mean_angle": 134.5, "sample_count": 100},
            "3": {"target_angle": 142, "std_deviation": round(base_sd * 1.15, 2), "range": 8.0, "mean_angle": 141.5, "sample_count": 100}
        }
    }
    
    # Mock speed_data
    speed_data = {
        "status": "ok",
        "bins": ["0-5s", "5-10s", "10-15s", "15-20s", "20-25s", "25-30s"],
        "reps": [max(0, base_reps // 6) for _ in range(6)],
        "speedPhase": "complete",
        "speedProgress": 1.0,
        "speedRepTimes": [round(i * 1.5, 1) for i in range(max(0, base_reps))],
        "speedTotalReps": max(0, base_reps),
        "speedTestComplete": True,
        "speedUserMaxAngle": round(base_rom, 1),
        "romMaxAngle": round(base_rom, 1),
        "romAvailable": True,
        "times": times,
        "rolls": rolls,
        "currentAngle": 5.0,
        "speedConsistency": round(1.2 - (0.7 * progress), 2),
        "speedRepsPerMinute": max(0, base_reps * 2)
    }
    
    return {
        "user_id": user_id,
        "test_type": test_type,
        "side": side,
        "rom_data": rom_data,
        "stability_data": stability_data,
        "speed_data": speed_data,
        "created_at": created_at
    }

print("Cleaning up old mock records...")
url = f"{SUPABASE_URL}/rest/v1/test_results"
for tt in TEST_TYPES:
    encoded_tt = urllib.parse.quote(tt)
    del_url = f"{url}?user_id=eq.{user_id}&test_type=eq.{encoded_tt}"
    requests.delete(del_url, headers=headers)

records_to_insert = []
for test_type in TEST_TYPES:
    for side in SIDES:
        for session in SESSIONS:
            records_to_insert.append(generate_mock_record(test_type, side, session))

print(f"Generating {len(records_to_insert)} mock records with full continuous arrays...")

# Insert using PostgREST
resp = requests.post(url, headers=headers, json=records_to_insert)

if resp.status_code in [200, 201]:
    print("Successfully inserted updated mock data!")
else:
    print(f"Error inserting data: {resp.status_code} - {resp.text}")
