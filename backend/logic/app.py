import time
import threading
import requests
import io
import math
from flask import Flask, send_file
from flask_cors import CORS
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

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

@app.route('/toggle_recording/<test_type>/<state>')
def toggle_recording(test_type, state):
    global active_recording, start_time
    if state == 'start':
        active_recording = test_type
        start_time = time.time()
        if test_type in datasets:
            datasets[test_type]['time'].clear()
            datasets[test_type]['pitch'].clear()
            datasets[test_type]['roll'].clear()
            datasets[test_type]['gy'].clear()
    else:
        active_recording = None
    return {"status": "ok", "active": active_recording}

def fetch_data():
    global start_time
    while True:
        try:
            resp = requests.get('http://127.0.0.1:7777/data', timeout=1)
            if resp.status_code == 200 and active_recording and active_recording in datasets:
                data = resp.json()
                ds = datasets[active_recording]
                ds['time'].append(time.time() - start_time)
                ds['pitch'].append(data.get('pitch', 0))
                ds['roll'].append(data.get('roll', 0))
                ds['gy'].append(data.get('gy', 0))

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

@app.route('/plot/rom')
def plot_rom():
    fig, ax = plt.subplots(figsize=(10, 5))
    ds = datasets['rom']
    if ds['time'] and len(ds['time']) > 1:
        times = ds['time']
        rolls = ds['roll']
        ax.plot(times, rolls, color='dodgerblue', linewidth=2, label='Arm Angle (\u03B8)')
        ax.set_title("ROM: Angle Trajectory", fontsize=14, pad=15)
        ax.set_xlabel("Progression / Time (s)", fontsize=11)
        ax.set_ylabel("Maximum Height / Angle (deg)", fontsize=11)
        ax.fill_between(times, rolls, color='dodgerblue', alpha=0.1)
        ax.grid(True, linestyle='--', alpha=0.5)
        
        max_idx = rolls.index(max(rolls))
        ax.scatter([times[max_idx]], [rolls[max_idx]], color='red', zorder=5)
        ax.annotate("Target", (times[max_idx], rolls[max_idx]), textcoords="offset points", xytext=(0,10), ha='center', color='red', fontweight='bold')
    else:
        ax.text(0.5, 0.5, 'No Recording for ROM yet.\nPress Start to begin.', horizontalalignment='center', verticalalignment='center', transform=ax.transAxes, color='grey', fontsize=14)
        ax.set_xticks([])
        ax.set_yticks([])

    buf = io.BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight', dpi=100)
    plt.close(fig)
    buf.seek(0)
    return send_file(buf, mimetype='image/png')


@app.route('/plot/stability')
def plot_stability():
    fig, ax = plt.subplots(figsize=(10, 5))
    ds = datasets['stability']
    if ds['time'] and len(ds['time']) > 1:
        times = ds['time']
        pitches = ds['pitch']
        ax.plot(times, pitches, color='seagreen', linewidth=2, label='Stable Response')
        ax.set_title("Stability: Time vs Angle", fontsize=14, pad=15)
        ax.set_xlabel("Time (s)", fontsize=11)
        ax.set_ylabel("Rotor Angle (deg)", fontsize=11)
        ax.grid(True, linestyle='--', alpha=0.5)
    else:
        ax.text(0.5, 0.5, 'No Recording for Stability yet.\nPress Start to begin.', horizontalalignment='center', verticalalignment='center', transform=ax.transAxes, color='grey', fontsize=14)
        ax.set_xticks([])
        ax.set_yticks([])

    buf = io.BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight', dpi=100)
    plt.close(fig)
    buf.seek(0)
    return send_file(buf, mimetype='image/png')


@app.route('/plot/speed')
def plot_speed():
    fig, ax = plt.subplots(figsize=(10, 5))
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

        ax.bar(bins, reps, color='mediumpurple', alpha=0.8, width=0.5)
        ax.set_title("Speed: Reps per unit time (3s bins)", fontsize=14, pad=15)
        ax.set_xlabel("Time Window", fontsize=11)
        ax.set_ylabel("Reps", fontsize=11)
        ax.grid(axis='y', linestyle='--', alpha=0.5)
        ax.yaxis.get_major_locator().set_params(integer=True)
    else:
        ax.text(0.5, 0.5, 'No Recording for Speed yet.\nPress Start to begin.', horizontalalignment='center', verticalalignment='center', transform=ax.transAxes, color='grey', fontsize=14)
        ax.set_xticks([])
        ax.set_yticks([])

    buf = io.BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight', dpi=100)
    plt.close(fig)
    buf.seek(0)
    return send_file(buf, mimetype='image/png')

if __name__ == '__main__':
    print("Python Logic Server Started!")
    app.run(port=5001, host='0.0.0.0')
