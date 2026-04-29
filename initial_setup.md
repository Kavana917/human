# STRYDE — Initial Setup & System Documentation

> **Human Movement Functional Assessment and Analysis System using IoT and AI**

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [System Architecture](#2-system-architecture)
3. [Directory Structure](#3-directory-structure)
4. [Technology Stack](#4-technology-stack)
5. [IoT Layer — ESP32 + MPU6050](#5-iot-layer--esp32--mpu6050)
6. [Backend — Python Flask Server](#6-backend--python-flask-server)
7. [Frontend — React + Vite](#7-frontend--react--vite)
8. [Database — Supabase (Neon Postgres)](#8-database--supabase-neon-postgres)
9. [Authentication & User Flow](#9-authentication--user-flow)
10. [Test System — How Tests Work](#10-test-system--how-tests-work)
11. [Dashboard & Previous Records](#11-dashboard--previous-records)
12. [Running the Project](#12-running-the-project)
13. [API Reference](#13-api-reference)

---

## 1. Project Overview

STRYDE is an intelligent system for **quantitative analysis of human movement** using wearable sensors (IoT) and AI. It bridges the gap between traditional subjective movement assessment and the need for objective, real-time, and scalable evaluation of functional mobility.

### What it Does

The system evaluates movement based on **three key parameters**:

| Parameter | What it Measures |
|---|---|
| **Range of Motion (ROM)** | Maximum angle achieved during movement, compared against clinical reference ranges |
| **Stability** | Ability to maintain specific joint positions with minimal variation (neuromuscular control) |
| **Speed** | Repetition efficiency over 30 seconds — coordination and functional performance |

### Use Cases

- **Post-operative orthopedic recovery** — tracking return of functional movement after surgery
- **Military selection & physical readiness** — objective physical threshold benchmarks
- **Neurological rehabilitation** — measuring tremors and micro-variations for stroke/Parkinson's patients
- **Sports & fitness** — performance evaluation and progress tracking

> **Note:** The system is an assistive and monitoring tool — it does not replace clinical diagnosis.

---

## 2. System Architecture

```
┌──────────────────┐        HTTP POST         ┌──────────────────────┐
│   ESP32 + IMU    │ ──────────────────────►   │  Python Flask Server │
│  (Wearable Sensor)│    /update (JSON)        │  Port 7777           │
└──────────────────┘                           │                      │
                                               │  - IMU data ingestion│
┌──────────────────┐   GET /data/*             │  - ROM analysis      │
│  React Frontend  │ ◄────────────────────►    │  - Stability analysis│
│  (Vite, Port 5173)│  polling every 50-200ms  │  - Speed analysis    │
│                  │                           └──────────────────────┘
│                  │
│                  │         Supabase SDK
│                  │ ◄────────────────────►  ┌─────────────────────┐
│                  │    Auth + Database       │  Supabase (Neon PG) │
└──────────────────┘                         │  - profiles table   │
                                             │  - test_results     │
                                             └─────────────────────┘
```

### Data Flow Summary

1. **ESP32** reads MPU6050 sensor at ~50Hz, sends JSON via HTTP POST to `/update` at 10Hz
2. **Flask server** stores latest IMU data in memory, a background thread samples it at 20Hz into test-specific datasets
3. **React frontend** polls `/data/{test_type}` every 200ms during recording for real-time charting
4. On **test submission**, frontend fetches final data from all three endpoints and writes to **Supabase** (Neon Postgres)

---

## 3. Directory Structure

```
majproj/
├── .env                          # Supabase credentials (shared by frontend)
├── project_description.txt       # Academic project description
│
├── iot/
│   └── iot.ino                   # ESP32 Arduino firmware (MPU6050 + WiFi)
│
├── backend/
│   ├── server.py                 # Main Flask server — IMU ingestion + blueprint registration
│   ├── abduction.py              # Abduction/Adduction test logic (ROM, Stability, Speed)
│   └── requirements.txt          # Flask, flask-cors
│
└── frontend-react/
    ├── package.json              # React 19, Vite 8, Three.js, Chart.js, Supabase
    ├── vite.config.ts
    ├── index.html
    ├── public/
    │   └── models/scene.gltf     # 3D human model for homepage hero
    └── src/
        ├── main.tsx              # App entry point
        ├── App.tsx               # Router + auth guard
        ├── supabaseClient.ts     # Supabase client initialization
        ├── index.css             # Global styles (27KB — full design system)
        ├── App.css               # Additional app-level styles
        │
        ├── assets/
        │   ├── abduction.mp4     # Demo video for abduction test
        │   ├── flexion.mp4       # Demo video for flexion test
        │   ├── internalexternal.mp4  # Demo video for rotation tests
        │   ├── hero.png, logo.png
        │   └── 3d model/        # Source 3D model files
        │
        ├── components/
        │   ├── CustomCursor.tsx  # Custom circle cursor with hover effects
        │   ├── CustomCursor.css
        │   ├── HeroModel.tsx     # Rotating 3D human model (React Three Fiber)
        │   ├── SideToggle.tsx    # Left/Right side toggle (for arm tests)
        │   └── TestRecordCard.tsx # Expandable test result card (with charts)
        │
        └── pages/
            ├── Login.tsx         # Email/password login with Supabase Auth
            ├── Signup.tsx        # Registration with password strength meter
            ├── Onboarding.tsx    # 3-step profile setup (gender, metrics, health)
            ├── Home.tsx          # Landing page with hero, how-it-works, test cards
            ├── Dashboard.tsx     # Profile details + previous test records
            ├── TestSelection.tsx # ARM test selection grid
            ├── AnalysisReport.tsx # Placeholder for analysis report
            ├── IotTest.tsx       # Legacy IMU telemetry page (3D board visualization)
            │
            └── tests/
                ├── TestPageLayout.tsx    # Shared layout: back button, title, video + test area
                ├── testConfigs.ts        # Test metadata (title, video) for each test ID
                ├── AbductionAdduction.tsx # FULL test page: ROM + Stability + Speed (1225 lines)
                └── StandardTestPage.tsx  # Skeleton test page for other arm tests
```

---

## 4. Technology Stack

### Frontend
| Technology | Version | Purpose |
|---|---|---|
| React | 19.2 | UI framework |
| Vite | 8.0 | Build tool & dev server |
| TypeScript | 5.9 | Type safety |
| React Router DOM | 7.13 | Client-side routing |
| Three.js | 0.183 | 3D visualization (IMU visualizer, hero model) |
| @react-three/fiber + drei | 9.5 / 10.7 | React bindings for Three.js |
| Chart.js + react-chartjs-2 | 4.5 / 5.3 | Real-time charts (ROM trajectory, speed bars) |
| chartjs-plugin-annotation | 3.1 | Reference lines on charts (90°, 150°, 180°) |
| Lucide React | 1.7 | Icon library |
| @supabase/supabase-js | 2.100 | Database + Auth client |

### Backend
| Technology | Purpose |
|---|---|
| Python 3 | Server runtime |
| Flask | HTTP server framework |
| flask-cors | CORS handling for frontend requests |

### Database
| Technology | Purpose |
|---|---|
| Supabase | Auth + Postgres hosting (powered by Neon) |
| Neon Postgres | Underlying database engine |

### IoT Hardware
| Component | Purpose |
|---|---|
| ESP32 | Microcontroller with WiFi |
| MPU6050 | 6-axis IMU (accelerometer + gyroscope) |
| ArduinoJson | JSON serialization on ESP32 |

---

## 5. IoT Layer — ESP32 + MPU6050

**File:** `iot/iot.ino`

### How it Works

1. **Setup:** ESP32 connects to WiFi, initializes MPU6050 via I2C (pins 19, 5)
2. **Sensor loop (~50Hz):** Reads raw accelerometer (ax, ay, az) and gyroscope (gx, gy, gz) data
3. **Angle calculation:** Computes pitch and roll from accelerometer using `atan2`:
   ```cpp
   float roll = atan2(ay, az);
   float pitch = atan2(-ax, sqrt(ay*ay + az*az));
   ```
4. **Data transmission (10Hz):** Every 100ms, sends JSON payload via HTTP POST to server:
   ```json
   {
     "pitch": 12.5, "roll": 45.2,
     "ax": 0.1, "ay": 0.8, "az": 0.5,
     "gx": 120, "gy": -30, "gz": 5,
     "time": 12345, "test": "shoulder_abduction"
   }
   ```

### Configuration
- WiFi SSID/password and server URL are hardcoded at the top of the file
- Server URL points to `http://<local-ip>:7777/update`

---

## 6. Backend — Python Flask Server

### 6a. Main Server — `backend/server.py`

The unified entry point that:
1. Receives raw IMU data from ESP32 via `POST /update`
2. Stores it in the `latestIMU` dict (in-memory, overwritten each frame)
3. Serves raw data via `GET /data`
4. Registers the `abduction` blueprint for test-specific endpoints
5. Starts a background data collection thread

**Key endpoints on the main server:**

| Endpoint | Method | Purpose |
|---|---|---|
| `/update` | POST | Receives IMU JSON from ESP32, prints pitch/roll |
| `/data` | GET | Returns latest raw IMU data (used by 3D visualizer) |

### 6b. Abduction Module — `backend/abduction.py`

This is the **core analysis engine** — a Flask Blueprint with ~600 lines handling all three test types.

#### Global State Architecture

The module uses global variables (not a database) to track test state in real-time:

```python
datasets = {
    'rom':       {'time': [], 'pitch': [], 'roll': [], 'gy': []},
    'stability': {'time': [], 'pitch': [], 'roll': [], 'gy': []},
    'speed':     {'time': [], 'pitch': [], 'roll': [], 'gy': []}
}
active_recording = None  # Which test is currently running
```

#### Blueprint Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /toggle_recording/<test_type>/<start\|stop>` | Start/stop recording for rom, stability, or speed |
| `GET /data/rom` | Returns ROM test data with assessment |
| `GET /data/stability` | Returns stability test data with phase info |
| `GET /data/speed` | Returns speed test data with rep counts |

#### ROM Test Logic

1. **Baseline capture:** When recording starts, the current roll angle is saved as `rom_baseline`
2. **Data collection:** Background thread samples IMU at 20Hz, stores `roll - baseline` (relative angle)
3. **Assessment:** On data request, finds max angle and categorizes:
   - ≥150° → "Excellent" (green)
   - ≥90° → "Moderate" (orange)  
   - <90° → "Needs Improvement" (red)
4. **Reference ranges:** 90° (shoulder level), 150° (full abduction), 180° (maximum)

#### Stability Test Logic

A **4-phase automated test** measuring the ability to hold specific angles:

1. **Target angles:** 45°, 90°, 135°, and the user's max ROM angle (from the ROM test)
2. **Per phase flow:**
   - User moves arm to within ±5° of the target → 5-second countdown begins
   - If user leaves the zone, countdown resets
   - After countdown, 5 seconds of "hold" data is collected
   - Standard deviation and range of angles during hold are computed
3. **Assessment:** Std dev < 2° = Very Stable, ≤ 4° = Stable, > 4° = Unstable
4. **Auto-completion:** Recording stops automatically after all 4 phases

#### Speed Test Logic

A **timed repetition test** (5s countdown + 30s active):

1. **Countdown (5s):** User keeps arm down, system calibrates baseline
2. **Active phase (30s):** User performs as many up-movements as possible
3. **Rep detection:**
   - Rep starts when angle exceeds 15° (leaving baseline)
   - Rep counts when angle crosses the peak threshold upward (≥ max(90°, userMax - 10°))
   - 0.35s debounce between reps
4. **Results:** Total reps, reps per 5-second bin (bar chart), consistency (std dev of intervals)
5. **Scoring:** ≥18 reps = Excellent, 10-17 = Good, <10 = Needs Attention

#### Background Data Collection Thread

`data_collection_loop()` runs in a daemon thread, sampling at 20Hz:
- Reads `latestIMU` via the injected accessor function
- Applies baseline correction per test type
- Runs stability phase transitions and speed rep detection logic
- Caps history at 1000 samples

---

## 7. Frontend — React + Vite

### 7a. Entry & Routing — `App.tsx`

All routes are auth-guarded. Unauthenticated users are redirected to `/login`.

```
/              → Home.tsx          (landing page)
/login         → Login.tsx         (email/password)
/signup        → Signup.tsx        (registration)
/onboarding    → Onboarding.tsx    (profile setup)
/dashboard     → Dashboard.tsx     (profile + test history)
/tests         → TestSelection.tsx (choose a test)
/test/abduction-adduction → AbductionAdduction.tsx (full test)
/test/:testId  → StandardTestPage.tsx (skeleton for other tests)
/analysis-report → AnalysisReport.tsx (placeholder)
```

### 7b. Home Page — `Home.tsx`

A full **landing page** with sections:
1. **Hero:** Welcome message + "View Dashboard" / "Start Assessment" buttons + rotating 3D human model
2. **How it Works:** 4-step card grid (Wear sensor → Perform movement → AI analyzes → Get results)
3. **Available Tests:** 6 test cards (Shoulder Abduction, Elbow Flexion, Hip Extension, etc.)
4. **About Stryde:** Project description
5. **Use Cases:** 3 detailed use case cards

The **3D hero model** (`HeroModel.tsx`) loads a GLTF model using `@react-three/fiber` and `@react-three/drei`, auto-rotating at 0.3 rad/s.

### 7c. Test Selection — `TestSelection.tsx`

Displays a grid of **ARM tests**:

| ID | Name |
|---|---|
| `abduction-adduction` | Abduction and Adduction |
| `flexion-extension` | Flexion and Extension |
| `internal-rotation` | Internal Rotation |
| `external-rotation` | External Rotation |
| `horizontal-abduction-adduction` | Horizontal Abduction and Adduction |

Clicking navigates to `/test/{id}`. The first goes to the fully implemented `AbductionAdduction.tsx`, others go to `StandardTestPage.tsx`.

### 7d. AbductionAdduction Test Page — `AbductionAdduction.tsx`

The **main fully functional test page** (~1230 lines). Core structure:

#### Layout
- Uses `TestPageLayout` which provides: back button, title, demo video (left), test area (right)
- **Side Toggle** (`SideToggle.tsx`): LEFT/RIGHT pill buttons above the tabs — selects which arm is being tested, locked during recording
- **3 tabs:** ROM, Stability, Speed
- **IMU Visualizer:** A mini 3D box showing real-time sensor orientation (120×110px)

#### State Management
```tsx
const [activeTab, setActiveTab] = useState('rom');        // Current test tab
const [isRecording, setIsRecording] = useState(false);    // Recording state
const [chartData, setChartData] = useState(null);         // Data from backend
const [romCompleted, setRomCompleted] = useState(false);  // Gate for stability/speed
const [stabilityCompleted, setStabilityCompleted] = useState(false);
const [speedCompleted, setSpeedCompleted] = useState(false);
const [isSubmitting, setIsSubmitting] = useState(false);
const [side, setSide] = useState<'left' | 'right'>('right');
```

#### Recording Flow
1. User clicks **Start Recording** → `toggleRecording()` calls `GET /toggle_recording/{tab}/start`
2. A `setInterval` polls `GET /data/{tab}` every 200ms, updating `chartData`
3. Charts render in real-time based on `chartData`
4. User clicks **Stop Recording** → calls `/toggle_recording/{tab}/stop`

#### Chart Rendering
- **ROM:** Line chart (angle vs time) with annotation lines at 90°, 150°, 180°. Peak point marked red.
- **Stability:** Line chart with 4 target zone annotations (45°, 90°, 135°, max). Shows countdown/hold status.
- **Speed (during test):** Real-time line chart with peak/base threshold annotations
- **Speed (after test):** Bar chart showing reps per 5-second bin, color-coded by performance

#### Submit Flow
When all 3 tests are completed:
1. Fetches final data from `/data/rom`, `/data/stability`, `/data/speed`
2. Inserts into Supabase `test_results` table:
   ```tsx
   {
     user_id: user.id,
     test_type: 'Arm - Abduction & Adduction',
     side: side,           // 'left' or 'right'
     rom_data: romData,    // Full JSON from backend
     stability_data: stabilityData,
     speed_data: speedData
   }
   ```
3. Navigates to Dashboard

### 7e. StandardTestPage — `StandardTestPage.tsx`

A **skeleton page** for tests that aren't fully implemented yet. Has:
- Same `TestPageLayout` with demo video
- Side toggle (LEFT/RIGHT)
- ROM/Stability/Speed tabs
- Start/Stop recording buttons
- Placeholder text where charts will go

### 7f. Reusable Components

#### `SideToggle.tsx`
Left/Right pill toggle. Props: `value`, `onChange`, `disabled`. Used in all ARM test pages.

#### `TestRecordCard.tsx`
Expandable card for displaying a previous test result on the Dashboard:
- **Collapsed:** Shows test type + side badge (LEFT=blue, RIGHT=green), date, max ROM, speed reps
- **Expanded:** Shows ROM line chart, speed bar chart, stability summary with per-phase std dev

#### `HeroModel.tsx`
React Three Fiber canvas loading `/models/scene.gltf` with orbit controls and auto-rotation.

#### `CustomCursor.tsx`
Custom circle cursor that scales up on hover over interactive elements.

---

## 8. Database — Supabase (Neon Postgres)

### Connection
```ts
// supabaseClient.ts
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
```

Environment variables are in `.env` at the project root.

### Tables

#### `profiles`
| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Matches Supabase auth user ID |
| `username` | TEXT | Display name |
| `email` | TEXT | User email |
| `gender` | TEXT | male / female / other |
| `age` | INTEGER | User age |
| `height_cm` | FLOAT | Height in centimeters |
| `weight_kg` | FLOAT | Weight in kilograms |
| `activity_level` | TEXT | sedentary / light / moderate / active / athlete |
| `has_injury` | BOOLEAN | Whether user has an injury |
| `injury_notes` | TEXT | Injury description (nullable) |
| `onboarding_complete` | BOOLEAN | Whether profile setup is done |
| `updated_at` | TIMESTAMP | Last profile update |

#### `test_results`
| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Auto-generated |
| `user_id` | UUID (FK) | References auth.users |
| `test_type` | TEXT | e.g. "Arm - Abduction & Adduction" |
| `side` | TEXT | 'left' or 'right' (DEFAULT 'right') |
| `rom_data` | JSONB | Full ROM test payload from backend |
| `stability_data` | JSONB | Full stability test payload from backend |
| `speed_data` | JSONB | Full speed test payload from backend |
| `created_at` | TIMESTAMP | Auto-generated |

---

## 9. Authentication & User Flow

```
┌─────────┐    ┌──────────┐    ┌─────────────┐    ┌──────┐
│  Signup  │───►│Onboarding│───►│    Home     │───►│Tests │
└─────────┘    │ (3 steps) │    │  (Landing)  │    └──────┘
               └──────────┘    └──────┬──────┘
┌─────────┐                          │
│  Login  │──────────────────────────┘
└─────────┘
```

1. **Signup** (`Signup.tsx`): Username + email + password with strength meter → creates Supabase auth user + `profiles` row → redirects to Onboarding
2. **Onboarding** (`Onboarding.tsx`): 3-step wizard:
   - Step 1: Gender + Age
   - Step 2: Height + Weight + Activity Level
   - Step 3: Injury/condition notes (optional)
   - Saves to `profiles` table, sets `onboarding_complete = true`
3. **Login** (`Login.tsx`): Email/password → checks `onboarding_complete` → routes to Onboarding or Home

---

## 10. Test System — How Tests Work

### End-to-End Flow for Abduction & Adduction

```
1. User navigates: Home → "Start Assessment" → TestSelection → "Abduction and Adduction"
2. Selects LEFT or RIGHT arm via SideToggle
3. ROM tab (must be done first):
   a. Reads instructions
   b. Clicks "Start Recording" → frontend calls GET /toggle_recording/rom/start
   c. Backend captures baseline roll, starts recording
   d. Frontend polls GET /data/rom every 200ms, renders live line chart
   e. User raises arm to max, lowers it
   f. Clicks "Stop Recording" → GET /toggle_recording/rom/stop
   g. Chart shows trajectory with peak marked, assessment badge appears

4. Stability tab (requires ROM):
   a. Clicks "Start Recording" → backend captures baseline, initializes 4 phases
   b. Phase loop (×4): user moves to target → 5s countdown → 5s hold → results computed
   c. Auto-stops after all 4 phases
   d. Results show per-phase stability metrics

5. Speed tab (requires ROM):
   a. Clicks "Start Recording" → 5s countdown → 30s active test
   b. Rep detection runs in backend thread
   c. Auto-stops at 30s, shows bar chart + total reps + consistency

6. All 3 complete → "Submit Results" button activates
7. Click submit → fetches final data from all 3 endpoints → inserts to Supabase → navigates to Dashboard
```

### Test Dependencies
- **Stability** and **Speed** tests both require the **ROM** test to be completed first
- ROM provides the user's max angle, which is used as the 4th stability target and the speed peak threshold

---

## 11. Dashboard & Previous Records

**`Dashboard.tsx`** has two sections:

### Profile Details
- Displays all profile fields from the `profiles` table
- Inline edit mode: toggle Edit → modify fields → Save (updates Supabase)

### Previous Test Results
- Fetches from `test_results` table, ordered by `created_at DESC`
- Each record rendered as a `TestRecordCard`:
  - Shows test type with colored **side badge** (LEFT=blue pill, RIGHT=green pill)
  - Date, Max ROM angle with assessment, Speed reps with consistency
  - Expandable section with ROM line chart, speed bar chart, stability phase summary
- "Get Analysis Report" button navigates to `/analysis-report` (placeholder page)

---

## 12. Running the Project

### Prerequisites
- Node.js (v18+)
- Python 3.8+
- Arduino IDE (for ESP32 firmware)

### Step 1: Backend
```bash
cd backend
pip install -r requirements.txt    # flask, flask-cors
python server.py                   # Starts on port 7777
```

### Step 2: Frontend
```bash
cd frontend-react
npm install
npm run dev                        # Starts on port 5173
```

### Step 3: IoT (Optional — for real sensor data)
1. Open `iot/iot.ino` in Arduino IDE
2. Update WiFi credentials and server IP
3. Flash to ESP32
4. Sensor data streams to backend automatically

### Environment Variables
Create `.env` in the project root:
```
VITE_SUPABASE_URL="https://your-project.supabase.co"
VITE_SUPABASE_ANON_KEY="your-anon-key"
```

---

## 13. API Reference

### Backend Server (Port 7777)

| Endpoint | Method | Source | Description |
|---|---|---|---|
| `/update` | POST | `server.py` | Receive IMU JSON from ESP32 |
| `/data` | GET | `server.py` | Latest raw IMU data |
| `/toggle_recording/<type>/<state>` | GET | `abduction.py` | Start/stop test (type: rom/stability/speed, state: start/stop) |
| `/data/rom` | GET | `abduction.py` | ROM test data with assessment |
| `/data/stability` | GET | `abduction.py` | Stability test data with phase info and results |
| `/data/speed` | GET | `abduction.py` | Speed test data with rep counts and consistency |

### Supabase (via JS SDK)

| Table | Operations Used |
|---|---|
| `profiles` | `select`, `insert`, `update`, `upsert` |
| `test_results` | `insert`, `select` (with `eq` + `order`) |
| `auth.users` | `signUp`, `signInWithPassword`, `getUser`, `getSession`, `signOut` |

---

*Last updated: April 29, 2026*
