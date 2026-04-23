"""
Unified Python Backend Server
Core server handling ESP32 IMU data ingestion and raw data serving.
Test-specific logic is loaded via Flask Blueprints from separate modules.
"""

import threading
from flask import Flask, jsonify, request
from flask_cors import CORS

# Import test modules
import abduction

app = Flask(__name__)
CORS(app)

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

abduction.init(get_latest_imu)
app.register_blueprint(abduction.abduction_bp)


# ===========================================================================
# Main
# ===========================================================================

if __name__ == '__main__':
    # Start background data collection threads for each test module
    t = threading.Thread(target=abduction.data_collection_loop, daemon=True)
    t.start()

    print("=" * 60)
    print("  Unified Python Server")
    print("  Port: 7777")
    print("=" * 60)
    print("  POST /update            <- ESP32 IMU data")
    print("  GET  /data              <- Raw IMU data")
    print("  GET  /toggle_recording  <- Start/stop tests")
    print("  GET  /data/rom          <- ROM test data")
    print("  GET  /data/stability    <- Stability test data")
    print("  GET  /data/speed        <- Speed test data")
    print("=" * 60)

    app.run(port=7777, host='0.0.0.0')
