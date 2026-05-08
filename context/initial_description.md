# STRYDE — Initial Project Description

> **Human Movement Functional Assessment and Analysis System using IoT and AI**

---

## 1. Project Overview

STRYDE is an intelligent, web-based system for **quantitative analysis of human movement** using wearable IMU sensors, IoT (ESP32 microcontroller), and algorithmic analysis. It bridges the gap between traditional subjective movement assessment and the need for objective, real-time, and scalable evaluation of functional mobility.

The system captures acceleration and angular velocity data from an **MPU6050 IMU sensor** attached to the user's body segment. This data is transmitted wirelessly over Wi-Fi to a **Python Flask backend**, which processes it in real-time and computes biomechanical metrics. Results are visualized on a **React (Vite + TypeScript) frontend** and persisted to a **Supabase (PostgreSQL)** cloud database.

**Product Name:** STRYDE  
**Tagline:** Real-time motion intelligence

---

## 2. System Architecture

```
┌─────────────────┐       Wi-Fi / HTTP POST        ┌──────────────────────┐
│   ESP32 + IMU   │  ──────────────────────────────▶│   Python Flask       │
│   (MPU6050)     │       JSON @ 10 Hz              │   Backend Server     │
│   iot/iot.ino   │                                  │   Port 7777          │
└─────────────────┘                                  │   backend/server.py  │
                                                     │   backend/abduction.py│
                                                     └──────────┬───────────┘
                                                                │ HTTP API
                                                                │ (REST)
                                                     ┌──────────▼───────────┐
                                                     │   React Frontend     │
                                                     │   (Vite + TypeScript)│
                                                     │   Port 5173 (dev)    │
                                                     └──────────┬───────────┘
                                                                │
                                                     ┌──────────▼───────────┐
                                                     │   Supabase           │
                                                     │   (Auth + Postgres)  │
                                                     │   Cloud-hosted       │
                                                     └──────────────────────┘
```

### Communication Flow

1. **ESP32 → Backend:** IMU sensor data (pitch, roll, ax, ay, az, gx, gy, gz) sent as JSON via HTTP POST to `/update` at ~10 Hz.
2. **Backend → Frontend:** Frontend polls backend REST endpoints for real-time test data (ROM, Stability, Speed) at ~200ms intervals during active recording.
3. **Frontend → Supabase:** Test results, user profiles, and auth state are persisted to the Supabase Postgres database via the Supabase JS client.

---

## 3. Technology Stack

| Layer | Technology | Details |
|-------|-----------|---------|
| **Hardware** | ESP32 + MPU6050 IMU | Wearable sensor module, reads at ~50 Hz, sends at ~10 Hz |
| **Firmware** | Arduino (C++) | `iot/iot.ino` — reads raw accelerometer/gyroscope, computes pitch/roll, POSTs JSON |
| **Backend** | Python 3 + Flask | Unified server on port 7777, Flask Blueprints for modular test logic |
| **Frontend** | React 19 + TypeScript + Vite 8 | SPA with routing, 3D visualization, Chart.js graphs |
| **Auth & DB** | Supabase | Authentication (email/password), Postgres for profiles & test results |
| **3D Rendering** | Three.js + React Three Fiber | Hero model on homepage, live IMU 3D visualizer on test page |
| **Charts** | Chart.js + react-chartjs-2 | Real-time line/bar charts with annotation plugin |
| **Icons** | Lucide React | Consistent icon library across UI |
| **Styling** | Vanilla CSS | Swiss/minimalist design aesthetic, `index.css` (~27 KB) |

---

## 4. Directory Structure

```
majproj/
├── .env                          # Supabase URL + Anon Key
├── .gitignore
├── project_description.txt       # Academic project description
├── initial_setup.md              # Setup instructions
├── context/                      # Context documents
│   └── initial_description.md    # ← This file
│
├── backend/
│   ├── server.py                 # Unified Flask server (entry point)
│   ├── abduction.py              # Shoulder abduction/adduction test module (Blueprint)
│   └── requirements.txt          # Flask, flask-cors
│
├── iot/
│   └── iot.ino                   # ESP32 Arduino firmware
│
└── frontend-react/
    ├── package.json
    ├── vite.config.ts
    ├── index.html
    ├── public/
    │   └── models/scene.gltf     # 3D human model for hero section
    └── src/
        ├── main.tsx              # React entry point
        ├── App.tsx               # Root component with routing & auth guard
        ├── App.css               # App-level styles
        ├── index.css             # Global design system (~27 KB)
        ├── supabaseClient.ts     # Supabase client init
        ├── assets/
        │   ├── abduction.mp4     # Demo video for abduction test
        │   ├── flexion.mp4       # Demo video for flexion test
        │   ├── internalexternal.mp4
        │   ├── hero.png
        │   └── logo.png
        ├── components/
        │   ├── CustomCursor.tsx   # Custom animated cursor effect
        │   ├── CustomCursor.css
        │   ├── HeroModel.tsx     # 3D rotating GLTF model (homepage hero)
        │   ├── SideToggle.tsx    # Left/Right arm selector toggle
        │   └── TestRecordCard.tsx # Expandable card for historical test results
        └── pages/
            ├── Home.tsx           # Landing/homepage with hero, how-it-works, tests, about
            ├── Login.tsx          # Email/password login
            ├── Signup.tsx         # Registration with password strength meter
            ├── Onboarding.tsx     # 3-step profile setup (gender, metrics, health)
            ├── Dashboard.tsx      # User profile + test history
            ├── TestSelection.tsx  # Grid of available arm tests
            ├── IotTest.tsx        # (Legacy/unused test page)
            ├── AnalysisReport.tsx # Placeholder for AI analysis reports
            └── tests/
                ├── TestPageLayout.tsx      # Shared 2-column layout (video + test area)
                ├── testConfigs.ts          # Test metadata registry (title, video)
                ├── AbductionAdduction.tsx  # FULLY IMPLEMENTED test page (~1230 lines)
                └── StandardTestPage.tsx    # Scaffold for other tests (not yet wired to backend)
```

---

## 5. Backend Details

### 5.1 Unified Flask Server (`server.py`)

- Single entry point running on **port 7777** with CORS enabled.
- Receives real-time IMU data from ESP32 via `POST /update`.
- Serves raw IMU data via `GET /data`.
- Loads test-specific logic as **Flask Blueprints** (currently only `abduction.py`).
- Launches background data collection threads for each test module on startup.

### 5.2 Abduction Test Module (`abduction.py`) — ~600 lines

This is the core algorithmic module. It implements three sub-tests for **shoulder abduction & adduction**:

#### ROM (Range of Motion) Test
- **Purpose:** Measures the maximum angle achieved during a lateral arm raise.
- **Mechanism:** Captures baseline roll angle at start. Background thread samples relative roll angle continuously. Computes max angle and provides assessment.
- **Assessment Thresholds:**
  - ≥150° → Excellent (green)
  - ≥90° → Moderate (orange)
  - <90° → Needs Improvement (red)
- **Reference Ranges:** Shoulder Level (90°), Full Abduction (150°), Maximum (180°)
- **Endpoint:** `GET /data/rom`

#### Stability Test
- **Purpose:** Evaluates the user's ability to hold specific joint positions with minimal variation.
- **Mechanism:** 4-phase test at target angles [45°, 90°, 135°, user's max ROM angle]. For each phase:
  1. User navigates arm to target angle (±5° tolerance zone).
  2. 5-second countdown once in zone.
  3. 5-second hold period — data collected for analysis.
  4. Standard deviation and range computed from hold data.
- **Assessment:**
  - SD < 2° → Very Stable
  - SD ≤ 4° → Stable
  - SD > 4° → Unstable
- **Dependency:** Requires ROM test to be completed first (uses max ROM angle for 4th position).
- **Auto-stop:** Recording stops automatically after all 4 phases complete.
- **Endpoint:** `GET /data/stability`

#### Speed Test
- **Purpose:** Measures how many repetitions the user can perform in 30 seconds, reflecting coordination and functional performance.
- **Mechanism:**
  1. 5-second countdown period.
  2. 30-second active test period.
  3. Rep detection logic: Leave base (>15°) → reach peak (≥max(90°, userMax - 10°)) = 1 rep counted.
  4. Consistency measured via standard deviation of inter-rep intervals.
- **Assessment:**
  - ≥18 reps = Excellent, 10-17 = Good, <10 = Needs Attention
  - Consistency <0.5s = Very Consistent, 0.5-1.0s = Consistent, >1.0s = Inconsistent
- **Auto-stop:** Recording stops automatically after 30 seconds.
- **Endpoint:** `GET /data/speed`

### 5.3 API Endpoints Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/update` | Receive IMU data from ESP32 |
| `GET` | `/data` | Return latest raw IMU readings |
| `GET` | `/toggle_recording/<test_type>/<state>` | Start/stop recording (rom/stability/speed, start/stop) |
| `GET` | `/data/rom` | Fetch ROM test results and graph data |
| `GET` | `/data/stability` | Fetch stability test results and graph data |
| `GET` | `/data/speed` | Fetch speed test results and graph data |

---

## 6. Frontend Details

### 6.1 Routing & Auth

All routes are protected via Supabase session checks in `App.tsx`. Unauthenticated users are redirected to `/login`. The routing table:

| Path | Component | Auth | Description |
|------|-----------|------|-------------|
| `/` | `Home` | Required | Landing page with hero, how-it-works, tests preview, about |
| `/login` | `Login` | Guest only | Email/password sign in |
| `/signup` | `Signup` | Guest only | Registration with password strength |
| `/onboarding` | `Onboarding` | Required | 3-step profile setup (runs once after signup) |
| `/dashboard` | `Dashboard` | Required | Profile details (editable) + test history |
| `/tests` | `TestSelection` | Required | Grid of available arm tests |
| `/test/abduction-adduction` | `AbductionAdduction` | Required | Fully implemented test page |
| `/test/:testId` | `StandardTestPage` | Required | Scaffold for other tests |
| `/analysis-report` | `AnalysisReport` | Required | Placeholder for future AI reports |

### 6.2 Pages

#### Home (`Home.tsx`)
- Hero section with personalized welcome message and a **rotating 3D GLTF human model** (via React Three Fiber).
- "View Dashboard" and "Start Assessment" CTAs.
- "How it Works" — 4-step process cards.
- "Available Tests" — 6 test cards (Shoulder Abduction, Elbow Flexion, Hip Extension, Knee Flexion, Lateral Flexion, Shoulder Rotation).
- "About Stryde" — project description.
- "Use Cases" — 3 detailed cards (Post-Op Recovery, Military Selection, Neurological Rehab).
- Footer with disclaimer.

#### Login (`Login.tsx`) & Signup (`Signup.tsx`)
- Clean, minimalist auth forms with SVG logo.
- Lucide icons for input fields.
- Password visibility toggle.
- Signup includes username field, password strength meter (5 levels: Weak → Excellent), confirm password.
- Auto-redirect to onboarding after signup.

#### Onboarding (`Onboarding.tsx`)
- 3-step wizard with progress dots:
  - **Step 1:** Gender selection (Male/Female/Other with emoji icons) + Age input.
  - **Step 2:** Height (cm), Weight (kg), Activity Level dropdown (Sedentary → Athlete).
  - **Step 3:** Injury/condition toggle + optional notes textarea.
- Upserts profile data to Supabase `profiles` table.
- Sets `onboarding_complete = true` and redirects to home.

#### Dashboard (`Dashboard.tsx`)
- **Profile Section:** Displays username, email, age, height, weight, activity level, injury notes. All fields (except username/email) are inline-editable with save/cancel.
- **Test Results Section:** Renders historical test records using `TestRecordCard` component. "Get Analysis Report" button navigates to `/analysis-report`.
- Fetches from Supabase `profiles` and `test_results` tables.

#### TestSelection (`TestSelection.tsx`)
- ARM tests grid with 5 configured tests:
  1. Abduction & Adduction
  2. Flexion & Extension
  3. Internal Rotation
  4. External Rotation
  5. Horizontal Abduction & Adduction
- Each card shows icon, name, description. Clicking navigates to `/test/<testId>`.

#### AbductionAdduction (`AbductionAdduction.tsx`) — **FULLY IMPLEMENTED** (~1230 lines)
- Uses `TestPageLayout` for 2-column layout (demo video on left, test area on right).
- **SideToggle:** Left/Right arm selector (locked during recording).
- **3 tabs:** ROM, Stability, Speed — each with dedicated instructions panel.
- **Live IMU 3D Visualizer:** Real-time Three.js box that mirrors the physical sensor orientation.
- **Real-time Chart.js graphs:**
  - ROM: Line chart with annotation lines at 90°, 150°, 180°. Max angle highlighted in red.
  - Stability: Line chart with target zone annotations, phase indicator, countdown/hold progress.
  - Speed: Real-time angle line chart during active test → transitions to bar chart (reps per 5-second window) after completion.
- **Status indicators:** Phase/angle/zone status display for stability. Rep count + progress bar for speed.
- **Submit:** Fetches final data from all 3 sub-tests, bundles into a single record, and inserts into Supabase `test_results` table with `user_id`, `test_type`, `side`, `rom_data`, `stability_data`, `speed_data`.

#### StandardTestPage (`StandardTestPage.tsx`) — **SCAFFOLD ONLY**
- Uses `TestPageLayout` + `testConfigs.ts` to render basic layout for non-abduction tests.
- Has tab UI (ROM/Stability/Speed), start/stop button, side toggle, and submit button.
- **Not wired to backend** — displays placeholder "Plug in visualization and scoring logic here."

### 6.3 Reusable Components

| Component | Description |
|-----------|-------------|
| `CustomCursor` | Global custom cursor effect with CSS animations |
| `HeroModel` | Three.js Canvas with rotating GLTF model, ambient/directional/hemisphere lighting, orbit controls |
| `SideToggle` | Left/Right toggle button group with disabled state during recording |
| `TestRecordCard` | Expandable card showing test summary (Max ROM, Speed Reps, assessment labels) + detailed Chart.js graphs (ROM line chart, Speed bar chart, Stability summary grid) |

---

## 7. Database Schema (Supabase / PostgreSQL)

### `profiles` table

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | References `auth.users.id` |
| `username` | text | Display name |
| `email` | text | User email |
| `gender` | text | male / female / other |
| `age` | integer | User age |
| `height_cm` | float | Height in centimeters |
| `weight_kg` | float | Weight in kilograms |
| `activity_level` | text | sedentary / light / moderate / active / athlete |
| `has_injury` | boolean | Whether user has reported an injury |
| `injury_notes` | text | Free-form injury description |
| `onboarding_complete` | boolean | Whether onboarding wizard was completed |
| `updated_at` | timestamp | Last profile update |

### `test_results` table

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Auto-generated |
| `user_id` | UUID (FK) | References `profiles.id` |
| `test_type` | text | e.g., "Arm - Abduction & Adduction" |
| `side` | text | "left" or "right" |
| `rom_data` | jsonb | Full ROM test payload (times, rolls, maxRoll, assessment, etc.) |
| `stability_data` | jsonb | Full stability test payload (results per phase, std_deviation, etc.) |
| `speed_data` | jsonb | Full speed test payload (bins, reps, totalReps, consistency, etc.) |
| `created_at` | timestamp | Record creation time |

---

## 8. IoT Firmware (`iot/iot.ino`)

- **MCU:** ESP32 with I²C on pins 19 (SDA) and 5 (SCL).
- **Sensor:** MPU6050 at address `0x68`.
- **Reading rate:** ~50 Hz sensor loop (20ms delay).
- **Transmit rate:** ~10 Hz HTTP POST (100ms interval).
- **Data sent:** pitch, roll (degrees), ax/ay/az (g-force normalized to 16384), gx/gy/gz (raw gyro), timestamp, test label.
- **Angle computation:** Roll and Pitch calculated from accelerometer using `atan2`.
- **Network:** Connects to configured Wi-Fi SSID, POSTs JSON to configured server URL.

---

## 9. Design Aesthetic

- **Style:** Clean, Swiss/minimalist design with monochromatic palette (black `#111`, white `#f8f8f8`, neutral grays).
- **Typography:** System font stack via `inherit`.
- **Layout:** Responsive grids, generous padding, subtle borders (`#e5e5e5`), minimal shadows.
- **Interactions:** Custom cursor effect, hover animations, smooth transitions.
- **Branding:** SVG target/crosshair logo, "STRYDE" wordmark in the nav.

---

## 10. Current Implementation Status

| Feature | Status | Notes |
|---------|--------|-------|
| ESP32 firmware | ✅ Complete | Sends IMU data at 10 Hz |
| Unified Python backend | ✅ Complete | Single Flask server, Blueprint architecture |
| Abduction/Adduction test (ROM) | ✅ Complete | Full baseline calibration, angle tracking, assessment |
| Abduction/Adduction test (Stability) | ✅ Complete | 4-phase positional hold test with countdown |
| Abduction/Adduction test (Speed) | ✅ Complete | 30s timed rep counting with consistency scoring |
| Auth (Login/Signup) | ✅ Complete | Supabase email/password auth |
| Onboarding wizard | ✅ Complete | 3-step profile setup |
| Dashboard (Profile) | ✅ Complete | View + inline edit profile |
| Dashboard (Test History) | ✅ Complete | Expandable cards with charts |
| Side selection (Left/Right) | ✅ Complete | Persisted to DB |
| 3D Hero model | ✅ Complete | Rotating GLTF human figure |
| Live IMU 3D visualizer | ✅ Complete | Real-time sensor orientation box |
| Custom cursor | ✅ Complete | Animated cursor effect |
| Homepage (full landing) | ✅ Complete | Hero, how-it-works, tests, about, use cases |
| Test Selection page | ✅ Complete | 5 arm tests listed |
| Other test pages (Flexion, Rotation, etc.) | 🟡 Scaffold only | Layout ready, not wired to backend |
| Analysis Report page | 🟡 Placeholder | Empty "coming soon" page |
| AI-powered analysis | ❌ Not started | Future feature |
| Demographic-based reference profiles | ❌ Not started | Mentioned in description but not implemented |
| Multiple body segment tests (leg, spine) | ❌ Not started | Only arm tests exist |

---

## 11. Key Dependencies

### Backend (Python)
```
flask
flask-cors
```

### Frontend (Node.js)
```
react, react-dom (v19)
react-router-dom (v7)
@supabase/supabase-js (v2)
three (v0.183), @react-three/fiber (v9), @react-three/drei (v10)
chart.js (v4), react-chartjs-2 (v5), chartjs-plugin-annotation (v3)
lucide-react (v1)
vite (v8), typescript (~5.9)
```

---

## 12. How to Run

### Backend
```bash
cd backend
pip install -r requirements.txt
python server.py
# Runs on http://0.0.0.0:7777
```

### Frontend
```bash
cd frontend-react
npm install
npm run dev
# Runs on http://localhost:5173
```

### IoT
1. Flash `iot/iot.ino` to ESP32 via Arduino IDE.
2. Update Wi-Fi SSID/password and server URL in the sketch.
3. Connect MPU6050 to ESP32 (SDA→GPIO19, SCL→GPIO5).

### Environment Variables
Create `.env` in project root with:
```
VITE_SUPABASE_URL=<your-supabase-url>
VITE_SUPABASE_ANON_KEY=<your-supabase-anon-key>
```
