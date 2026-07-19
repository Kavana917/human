"""
Unified Python Backend Server
Core server handling ESP32 IMU data ingestion and raw data serving.
Test-specific logic is loaded via Flask Blueprints from separate modules.
"""

import os
import threading
from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv
from supabase import create_client

# Load .env from project root (parent directory)
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

# Import test modules
import shoulder_tests
import analysis

app = Flask(__name__)
CORS(app)

# ---------------------------------------------------------------------------
# Initialize Supabase client (server-side)
# ---------------------------------------------------------------------------
SUPABASE_URL = os.getenv('VITE_SUPABASE_URL')
SUPABASE_KEY = os.getenv('VITE_SUPABASE_ANON_KEY')
GROQ_API_KEY = os.getenv('GROQ_API_KEY')

supabase_client = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
        print(f"  Supabase client initialized: {SUPABASE_URL[:40]}...")
    except Exception as e:
        print(f"  WARNING: Failed to init Supabase client: {e}")
else:
    print("  WARNING: Supabase env vars not found — analysis endpoint will not work")

# ---------------------------------------------------------------------------
# Latest raw IMU data (received from ESP32)
# ---------------------------------------------------------------------------
latestIMU = {
    'pitch': 0, 'roll': 0,
    'ax': 0, 'ay': 0, 'az': 0,
    'gx': 0, 'gy': 0, 'gz': 0
}


def get_latest_imu():
    """Accessor for latestIMU, passed to test modules."""
    return latestIMU


# ===========================================================================
# ENDPOINTS — ESP32 data ingestion
# ===========================================================================

@app.route('/update', methods=['POST'])
def update_imu():
    """Receive IMU data from ESP32 via POST."""
    global latestIMU
    latestIMU = request.get_json(force=True)
    pitch = latestIMU.get('pitch', 0)
    roll = latestIMU.get('roll', 0)
    print(f"P: {pitch:.2f} | R: {roll:.2f}")
    return "OK", 200


@app.route('/data')
def get_raw_data():
    """Return latest raw IMU data."""
    return jsonify(latestIMU)


# ===========================================================================
# Register test blueprints
# ===========================================================================

shoulder_tests.init(get_latest_imu)
app.register_blueprint(shoulder_tests.shoulder_tests_bp)

# Register analysis blueprint
analysis.init(SUPABASE_URL, SUPABASE_KEY, GROQ_API_KEY)
app.register_blueprint(analysis.analysis_bp)

try:
    from kinematics_model import warm_load
    warm_load()
    print("  Kinematics k-NN models warmed (abduction, adduction, flexion, extension, …)")
except Exception as e:
    print(f"  WARNING: Kinematics model warm-load skipped: {e}")


# ===========================================================================
# Main
# ===========================================================================

if __name__ == '__main__':
    # Shared ROM/stability/speed collection for all wired shoulder movements
    t = threading.Thread(target=shoulder_tests.data_collection_loop, daemon=True)
    t.start()

    print("=" * 60)
    print("  Unified Python Server")
    print("  Port: 7777")
    print("=" * 60)
    print("  POST /update            <- ESP32 IMU data")
    print("  GET  /data              <- Raw IMU data")
    print("  /abduction|adduction|flexion|extension/...  <- shoulder tests")
    print("  GET  /api/analysis/30day   <- 30-day progress report")
    print("  GET  /api/analysis/session <- ML demographic session comparison")
    print("=" * 60)

    app.run(port=7777, host='0.0.0.0')
