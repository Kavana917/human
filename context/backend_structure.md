# Backend & Database Structure Reference

> Complete reference of the backend architecture, Supabase schema, and exact data shapes stored in the database.

---

## 1. Supabase Tables

### `profiles` table

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | References `auth.users.id` |
| `username` | text | Display name |
| `email` | text | User email |
| `gender` | text | `"male"` / `"female"` / `"other"` |
| `age` | integer | User age |
| `height_cm` | float | Height in centimeters |
| `weight_kg` | float | Weight in kilograms |
| `activity_level` | text | `"sedentary"` / `"light"` / `"moderate"` / `"active"` / `"athlete"` |
| `has_injury` | boolean | Whether user has reported an injury |
| `injury_notes` | text | Free-form injury description |
| `onboarding_complete` | boolean | Whether onboarding wizard was completed |
| `updated_at` | timestamp | Last profile update |

### `test_results` table

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Auto-generated |
| `user_id` | UUID (FK) | References `profiles.id` |
| `test_type` | text | e.g., `"Arm - Abduction & Adduction"` |
| `side` | text | `"left"` or `"right"` |
| `rom_data` | jsonb | Full ROM test payload (see §2.1) |
| `stability_data` | jsonb | Full stability test payload (see §2.2) |
| `speed_data` | jsonb | Full speed test payload (see §2.3) |
| `created_at` | timestamp | Record creation time (auto-set by Supabase) |

---

## 2. Exact JSONB Shapes Stored in `test_results`

These are the **exact payloads** returned by the Flask backend endpoints and stored as-is into Supabase's JSONB columns.

### 2.1 `rom_data` — from `GET /data/rom`

```jsonc
{
  "status": "ok",
  "times": [0.05, 0.10, 0.15, ...],       // float[] — elapsed seconds since recording started
  "rolls": [2.3, 5.1, 12.8, ...],          // float[] — relative arm angle in degrees (baseline-corrected)
  "maxIdx": 47,                             // int — index of the maximum angle in the arrays
  "maxTime": 4.7,                           // float — timestamp of max angle
  "maxRoll": 142.5,                         // float — THE KEY METRIC: peak ROM in degrees
  "baseline": -3.2,                         // float — raw roll angle at calibration (arm down)
  "baselineSet": true,                      // bool — whether baseline was captured
  "assessment": "Moderate",                 // string — "Excellent" (≥150°) / "Moderate" (≥90°) / "Needs Improvement" (<90°)
  "assessmentColor": "orange",              // string — "green" / "orange" / "red"
  "referenceRanges": {
    "shoulderLevel": 90,                    // fixed reference
    "fullAbduction": 150,                   // fixed reference
    "maximum": 180                          // fixed reference
  }
}
```

**Key fields for analysis:**
- `maxRoll` → **Peak Range of Motion** (primary recovery metric)
- `times` + `rolls` → Full angle trajectory for that session
- `assessment` → Categorical label

---

### 2.2 `stability_data` — from `GET /data/stability`

```jsonc
{
  "status": "ok",
  "times": [0.05, 0.10, ...],              // float[] — elapsed seconds
  "pitches": [1.2, 1.3, ...],              // float[] — pitch angles (less relevant for abduction)
  "rolls": [44.8, 45.1, 45.3, ...],        // float[] — roll angles (primary data)
  "currentPhase": 3,                        // int — 0-3, which stability phase is active
  "targetAngle": 142,                       // float — current target angle in degrees
  "currentAngle": 141.8,                    // float — latest live angle
  "zoneStatus": "holding",                  // string — "far" / "approaching" / "target" / "countdown" / "holding"
  "progress": 0.85,                         // float 0-1 — progress through current countdown/hold
  "progressType": "hold",                   // string — "none" / "countdown" / "hold"
  "inTargetZone": true,                     // bool — whether angle is within ±5° of target
  "testComplete": true,                     // bool — all 4 phases done
  "romMaxAngle": 142.5,                     // float — user's max ROM (used for 4th target)
  "romAvailable": true,                     // bool — whether ROM test was done first

  // THE KEY DATA: per-phase stability results
  "results": {
    "0": {
      "target_angle": 45,                  // float — the target angle for this phase
      "std_deviation": 1.82,               // float — KEY METRIC: standard deviation during hold (degrees)
      "range": 5.3,                         // float — max - min angle during hold
      "mean_angle": 44.7,                  // float — average angle during hold
      "sample_count": 98                    // int — number of data points in hold window
    },
    "1": {
      "target_angle": 90,
      "std_deviation": 2.41,
      "range": 7.8,
      "mean_angle": 89.3,
      "sample_count": 102
    },
    "2": {
      "target_angle": 135,
      "std_deviation": 3.67,
      "range": 11.2,
      "mean_angle": 133.8,
      "sample_count": 95
    },
    "3": {
      "target_angle": 142,                  // this equals user's max ROM angle
      "std_deviation": 4.15,
      "range": 13.1,
      "mean_angle": 140.2,
      "sample_count": 88
    }
  }
}
```

**Key fields for analysis:**
- `results[phase].std_deviation` → **Stability metric** per position (lower = better neuromuscular control)
- Average of all 4 `std_deviation` values → **Session stability score**
- Assessment thresholds: SD <2° = Very Stable, ≤4° = Stable, >4° = Unstable

---

### 2.3 `speed_data` — from `GET /data/speed`

```jsonc
{
  "status": "ok",
  "bins": ["0-5s", "5-10s", "10-15s", "15-20s", "20-25s", "25-30s"],  // string[] — 6 time windows
  "reps": [2, 3, 3, 4, 3, 2],              // int[] — reps completed in each 5-second bin
  "speedPhase": "complete",                 // string — "countdown" / "active" / "complete"
  "speedProgress": 1.0,                     // float 0-1 — test completion progress
  "speedRepTimes": [3.2, 5.8, 8.1, ...],   // float[] — timestamps when each rep was counted (relative to test start)
  "speedTotalReps": 17,                     // int — KEY METRIC: total reps in 30 seconds
  "speedTestComplete": true,                // bool — test finished
  "speedUserMaxAngle": 142.5,              // float — user's max ROM angle
  "romMaxAngle": 142.5,                    // float — same as above
  "romAvailable": true,                     // bool
  "times": [0.1, 0.2, 0.3, ...],           // float[] — time series during active phase
  "rolls": [2.1, 15.3, 45.8, ...],         // float[] — angle during active phase
  "currentAngle": 3.2,                     // float — latest angle

  // Only present after test completion:
  "speedConsistency": 0.72,                 // float|null — KEY METRIC: std dev of inter-rep intervals (seconds)
  "speedRepsPerMinute": 34                  // int — extrapolated reps per minute
}
```

**Key fields for analysis:**
- `speedTotalReps` → **Repetition count** (secondary recovery metric)
- `speedConsistency` → SD of inter-rep timing (lower = more consistent)
- `bins` + `reps` → Distribution of performance across the 30-second window
- Assessment thresholds: ≥18 reps = Excellent, 10-17 = Good, <10 = Needs Attention

---

## 3. How Frontend Stores Data to Supabase

From `AbductionAdduction.tsx` (line ~251):

```typescript
const { error } = await supabase.from('test_results').insert([
    {
        user_id: user.id,                           // UUID from auth
        test_type: 'Arm - Abduction & Adduction',   // string literal
        side: side,                                  // 'left' or 'right'
        rom_data: romData,                           // ENTIRE /data/rom response as JSONB
        stability_data: stabilityData,               // ENTIRE /data/stability response as JSONB
        speed_data: speedData                        // ENTIRE /data/speed response as JSONB
    }
]);
```

**Important:** The full backend API response objects are stored as-is. This means all fields listed above (including `status`, `times`, `rolls`, etc.) are present in the JSONB columns.

---

## 4. How Frontend Fetches Data from Supabase

From `Dashboard.tsx` (line ~27):

```typescript
// Fetch all test results for the current user, newest first
const resultsRes = await supabase
    .from('test_results')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
```

Each row in `resultsRes.data` is a full test record with all 3 JSONB columns.

---

## 5. Data Available for 30-Day Analysis

For the analysis endpoint, we need to query the last 30 days of test_results for a user and extract:

| What to Extract | From Column | Field Path | Purpose |
|-----------------|-------------|------------|---------|
| **Test date** | `created_at` | top-level column | Timeline x-axis, consistency calculation |
| **Peak ROM** | `rom_data` | `.maxRoll` | Recovery slope (linear regression y-values) |
| **ROM assessment** | `rom_data` | `.assessment` | Categorical progress tracking |
| **Stability SDs** | `stability_data` | `.results["0"].std_deviation` ... `.results["3"].std_deviation` | Stability delta (average per session) |
| **Total reps** | `speed_data` | `.speedTotalReps` | Rep count trend (bar chart) |
| **Rep consistency** | `speed_data` | `.speedConsistency` | Motor control trend |
| **Test side** | `side` | top-level column | Filter left vs right |
| **Test type** | `test_type` | top-level column | Filter by test |

### Example Supabase query for analysis:

```python
# Server-side (Python with supabase-py)
from datetime import datetime, timedelta

thirty_days_ago = (datetime.utcnow() - timedelta(days=30)).isoformat()

response = supabase.table('test_results') \
    .select('created_at, rom_data, stability_data, speed_data, side, test_type') \
    .eq('user_id', user_id) \
    .gte('created_at', thirty_days_ago) \
    .order('created_at', desc=False) \
    .execute()
```

---

## 6. Flask Backend Endpoints (Current)

| Method | Endpoint | Module | Description |
|--------|----------|--------|-------------|
| `POST` | `/update` | `server.py` | Receive IMU data from ESP32 |
| `GET` | `/data` | `server.py` | Return latest raw IMU readings |
| `GET` | `/toggle_recording/<test_type>/<state>` | `abduction.py` | Start/stop recording (rom/stability/speed) |
| `GET` | `/data/rom` | `abduction.py` | Fetch ROM test results and graph data |
| `GET` | `/data/stability` | `abduction.py` | Fetch stability test results and graph data |
| `GET` | `/data/speed` | `abduction.py` | Fetch speed test results and graph data |

### To be added for analysis:

| Method | Endpoint | Module | Description |
|--------|----------|--------|-------------|
| `GET` | `/api/analysis/30day` | `analysis.py` (new) | Compute 30-day progress report with ML + AI |

---

## 7. Environment Variables

```env
VITE_SUPABASE_URL="https://wasgpvkcxalacrcesikn.supabase.co"    # Frontend (Vite)
VITE_SUPABASE_ANON_KEY="eyJ..."                                   # Frontend (Vite)
GROQ_API_KEY="gsk_..."                                            # Backend only (for AI analysis)
```

**Note:** The backend currently does NOT connect to Supabase directly. For the analysis feature, we need to add `supabase` (Python) and `python-dotenv` to the backend to query test_results server-side.
