"""
Remap legacy test_results.test_type values to the ML-aligned names.

Uses the same auth pattern as seed_db.py (debug.json + .env).
If JWT expired: open the app, generate an Analysis Report once (refreshes
debug.json), then re-run this script — or just open the Dashboard (it
migrates rows with the live session automatically).
"""
import json
import os
import sys
import urllib.parse

import requests
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))
SUPABASE_URL = os.getenv('VITE_SUPABASE_URL')
SUPABASE_KEY = os.getenv('VITE_SUPABASE_ANON_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Missing Supabase credentials in .env")
    sys.exit(1)

try:
    with open(os.path.join(os.path.dirname(__file__), 'debug.json'), 'r') as f:
        debug_data = json.load(f)
except FileNotFoundError:
    print("debug.json not found. Open Analysis Report once so auth is captured.")
    sys.exit(1)

auth_header = debug_data.get('auth_header_received')
if not auth_header:
    print("Could not find auth header in debug.json")
    sys.exit(1)

try:
    user_id = debug_data['debug_response'][0]['user_id']
except (IndexError, KeyError, TypeError):
    print("Could not extract user_id from debug.json")
    sys.exit(1)

# legacy label → canonical ML-aligned test_type
LEGACY_MAP = {
    "AbductionAdduction": "Arm - Abduction",
    "Arm - Abduction & Adduction": "Arm - Abduction",
    "Arm - Flexion & Extension": "Arm - Flexion",
    "Arm - Horizontal Abduction & Adduction": "Arm - Abduction",
}

headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': auth_header,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
}

base = f"{SUPABASE_URL}/rest/v1/test_results"
total_updated = 0

print(f"Migrating test_type labels for user {user_id}...")

for old, new in LEGACY_MAP.items():
    encoded_old = urllib.parse.quote(old)
    url = f"{base}?user_id=eq.{user_id}&test_type=eq.{encoded_old}"
    resp = requests.patch(url, headers=headers, json={"test_type": new})
    if resp.status_code not in (200, 201, 204):
        print(f"  FAIL  {old!r} -> {new!r}: {resp.status_code} {resp.text[:300]}")
        continue
    try:
        n = len(resp.json()) if resp.text else 0
    except Exception:
        n = 0
    print(f"  OK    {old!r} -> {new!r}  ({n} row(s), status={resp.status_code})")
    total_updated += n

print(f"Done. Updated {total_updated} row(s).")
