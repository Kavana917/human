# ML Model Integration Plan — Demographic-Conditioned Kinematic Comparison

**Status:** Implemented (v1)
**Author:** design doc for STRYDE major project
**Scope:** Integrate the external `mlframework` k-NN model (`C:\Users\Dell\Downloads\mlframework`) into the STRYDE backend so the Analysis Report can compare a user's **measured** ROM / Stability against the model's **demographically-expected** values and flag meaningful variation.

---

## 1. Goal

Today the app grades a session against `normative.py` — a hand-written rule-based benchmark. This plan **supplements** (does not replace) that with the trained k-NN model from the IEEE paper ("Demographic-Conditioned Prediction of Shoulder Kinematics using k-Nearest Neighbour Regression").

For a given user profile (age, sex, height, weight, activity), the model predicts what a demographically-matched *healthy baseline* should achieve. We surface, on the Analysis Report:

- **Measured** value (from the user's IMU test).
- **Expected** value (from the k-NN model).
- **Deviation** (absolute + %) and a **variation verdict** (e.g. "meets / below / exceeds demographic expectation").

### In scope for comparison
| Metric | Comparable? | Notes |
|--------|-------------|-------|
| **ROM** (peak abduction °) | ✅ Yes | App `maxRoll` vs model ROM. Primary comparison. |
| **STABILITY** (angle SD °) | ✅ Yes | App `avg_sd` vs model STABILITY. Lower = steadier. |
| **SPEED** (peak angular velocity °/s) | ⚠️ Informational only | See §2. Shown, but **no deviation verdict**. |

### Decisions locked in (from planning)
1. **Supplement**, not replace: keep `normative.py` grading; add ML expected + deviation alongside.
2. **Speed:** compare only ROM & Stability against the model. Redefine the app's speed metric to **peak angular velocity (°/s)** (unit-compatible with the model) but display it as **informational** — no measured-vs-expected verdict, because the model's speed is calibrated to maximum-effort simulator ramps (140–552 °/s) vs. real self-paced motion (~48–99 °/s).
3. **Deploy in-process:** load the model inside the existing Flask backend. No separate microservice.
4. **Profile completeness:** `height_cm` and `weight_kg` are collected during onboarding for every user (shown on the dashboard), so the ML card is expected to render for all users. The graceful-degradation path (§9) remains as a safety net only.
5. **`gender = 'other'`:** default to **male (M)** for the model input, and **explicitly note this in the UI** ("Gender 'other' — demographic baseline computed using male reference").
6. **Movements for v1:** bundle both **abduction** and **adduction** models. Abduction is the active comparison (it's what the ROM test measures). See §5.2 / §14 for the adduction nuance.
7. **Tolerance bands:** proceed with the proposed ±6° (ROM) / ±0.6° (Stability); implementer's discretion to tune.

---

## 2. Why SPEED is informational only

The paper (Sec. IV-D) states the model's SPEED is a *simulator-protocol maximum-effort ramp velocity*, systematically ~3–5× higher than real self-paced peak angular velocity, and has **no real-world validation**. Redefining the app metric to °/s fixes the *unit* but not the *magnitude/protocol* gap. Therefore: we compute & display peak angular velocity (it's a genuine improvement over "reps in 30s" and is future-proofed for when the model's speed is validated), but we do **not** compute a deviation verdict for it.

---

## 3. The model interface (verified)

Artifacts live at `mlframework/trained_models/<movement>/`:
- `knn_model.pkl` — `sklearn.neighbors.KNeighborsRegressor` (joblib).
- `scaler.pkl` — `sklearn.preprocessing.StandardScaler` (joblib).
- `training_metrics.json` — contains `feature_weights_vector` (length-8, sums to 1) + metadata.

Relevant movement for this app: **`abduction`** (the ROM/stability test measures shoulder abduction). `adduction` model is available if we later add a distinct adduction metric.

**Inference pipeline** (no dependency on the `mlframework` package — pure sklearn objects):
```
X (1×8) = [age, sex_enc, height_cm, weight_kg, bmi, activity_enc, strength_decay, velocity_factor]
X_knn   = scaler.transform(X) * sqrt(feature_weights_vector)   # element-wise per column
y (1×3) = model.predict(X_knn)  ->  [ROM°, SPEED°/s, STABILITY°]
```

**Encodings & derived features** (inlined from `features.py` + `config/profiles.yaml`):
- `sex`: M=0, F=1.
- `activity`: sedentary=0, moderate=1, active=2.
- `bmi = weight_kg / (height_cm/100)^2`.
- `strength_decay = 1.0` if `age ≤ 40`, else `clamp(1.0 − 0.0045·(age−40), 0.78, 1.0)` (round 4dp).
- `velocity_factor = max(0.05, activity_vel · (0.28 + 0.72·strength_decay))`, where `activity_vel ∈ {sedentary:0.75, moderate:1.0, active:1.30}` (round 4dp).
- Post-prediction ROM cap: abduction ≤ 175°.

**Dependency pin:** the pickles were created with **scikit-learn 1.7.2** — the backend must install a 1.7.x sklearn to unpickle safely.

---

## 4. Architecture / data flow

```
Profile (Supabase)  ─┐
                     ├─> kinematics_model.predict_expected(profile, "abduction")
Measured metrics ────┘        (loads pkl once, caches in memory)
     │                                   │
     │                                   ▼
     └──────────────> comparison.compare(measured, expected)  ─> deviation + verdict
                                         │
                                         ▼
        analysis.py endpoints (/session, /30day) attach `ml_expected` + `ml_comparison`
                                         │
                                         ▼
                       AnalysisReport.tsx renders "Expected vs Measured" card
                                         │
                                         └─> ml_expected also injected into the Groq AI prompt
```

---

## 5. File-by-file changes

### 5.1 NEW — `backend/kinematics_model.py`
Self-contained predictor. Responsibilities:
- Lazy-load + in-memory cache of `(scaler, model, feature_weights)` per movement from `backend/ml_models/<movement>/`.
- `predict_expected(profile: dict, movement: str = "abduction") -> dict | None`
  - Map the app profile to model inputs (see §6 mapping table).
  - Returns `{"rom": float, "speed": float, "stability": float, "movement": str, "inputs_used": {...}}` or `None` if required inputs (height/weight) are missing.
- Inlines the encoding + derived-feature formulas from §3 (no `mlframework` import, no PyYAML).

### 5.2 NEW — `backend/ml_models/`  (copied artifacts)
Copy `mlframework/trained_models/abduction/` and `.../adduction/` into `backend/ml_models/` (only the 3 files each; ~270 KB per movement). The other four movements are optional/future. Rationale: keeps the backend self-contained and deployable without the external folder.

**Adduction nuance (v1):** both models are bundled, but the current test only captures a **peak abduction** angle (`rom_data.maxRoll`) — there is no distinct adduction ROM measurement in the pipeline today. So in v1 the *active* comparison uses the **abduction** model; the adduction model is loaded and its predicted values can be surfaced as a demographic reference, but a true measured-vs-expected adduction verdict is deferred until the test captures an adduction metric (see §14).

### 5.3 NEW — `backend/comparison.py`
- `compare_metric(measured, expected, kind, model_mae)` → deviation dict.
- `build_ml_comparison(measured_metrics, expected) -> dict` → assembles ROM + Stability comparisons (skips speed verdict).
- Verdict logic in §7.

### 5.4 EDIT — `backend/normative.py`
- `extract_session_metrics()`: add `peak_angular_velocity` (read `speed_data.peakAngularVelocity`, fall back to `None` for legacy rows). Keep existing `reps`/`rep_consistency` for backward compatibility with old records and existing normative speed grading.

### 5.5 EDIT — `backend/analysis.py`
- Import `kinematics_model` and `comparison`.
- `/api/analysis/session`: after `assess_session`, call `predict_expected(profile)` + `build_ml_comparison(...)`; add `ml_expected` and `ml_comparison` to the JSON response.
- `/api/analysis/30day`:
  - Same `ml_expected` + `ml_comparison` on the latest session.
  - Add `chart_data.reference_rom_expected = ml_expected["rom"]` so the chart draws the demographic-expected ROM line alongside the existing excellent/moderate lines.
  - Feed `ml_expected` into `generate_ai_insights(...)` so the Groq narrative can reference "measured vs demographically-expected".
- `generate_ai_insights(...)`: add an "## Demographic-Expected Baseline (k-NN model)" section to the prompt (ROM & Stability expected + deviation), with an explicit instruction that SPEED expected is not clinically comparable.

### 5.6 EDIT — `backend/abduction.py`  (SPEED redefinition)
- During the speed **active** phase, track peak angular velocity from the already-collected roll stream: maintain `speed_peak_angular_velocity = max(|Δroll/Δt|)` over consecutive samples (with light smoothing / outlier guard; the loop runs at ~20 Hz, `time.sleep(0.05)`).
  - This uses the numerical derivative of the baseline-corrected roll angle — matching the paper's `max |Δθ/Δt|` definition — so **no firmware change is required**.
- Add `"speedPeakAngularVelocity": <°/s>` to the `/data/speed` response (both active and complete states). Keep reps/bins/consistency as-is (still useful UI + backward compat).

### 5.7 EDIT — `backend/requirements.txt`
Add:
```
scikit-learn==1.7.2
joblib
```
(`numpy` already present; `PyYAML` NOT needed since constants are inlined.)

### 5.8 EDIT — `frontend-react/src/pages/tests/AbductionAdduction.tsx`
- Read `speedPeakAngularVelocity` from `/data/speed` and display it (live + final).
- On submit, add `peakAngularVelocity` into the `speed_data` JSONB payload (keep existing fields for backward compat).

### 5.9 EDIT — `frontend-react/src/pages/AnalysisReport.tsx`
- Extend the `AnalysisResponse` TS interface with `ml_expected` and `ml_comparison`.
- New **"Demographic Expectation (AI Model)"** card: for ROM and Stability, show Measured | Expected | Δ (abs + %) | verdict badge; show peak angular velocity as an informational row (no badge).
- When `ml_expected.inputs_used.gender_note` is present (gender = other), render a small disclaimer: *"Gender 'other' — demographic baseline computed using male reference."*
- Add the expected-ROM reference line to the 30-day chart (`reference_rom_expected`).

### 5.10 EDIT — `backend/seed_db.py`  (demo data)
- Include `peakAngularVelocity` in generated `speed_data` so seeded demos exercise the new field.

---

## 6. Profile → model input mapping

The app profile and the model use different vocabularies; map as follows:

| Model input | Source | Mapping / fallback |
|-------------|--------|--------------------|
| `age` | `profile.age` | default 30 if missing |
| `sex` | `profile.gender` | `male→M`, `female→F`, `other→M` **(default male; noted in UI)** |
| `height_cm` | `profile.height_cm` | always collected at onboarding; graceful skip only as a safety net |
| `weight_kg` | `profile.weight_kg` | always collected at onboarding; graceful skip only as a safety net |
| `activity` | `profile.activity_level` | `sedentary→sedentary`, `light→sedentary`, `moderate→moderate`, `active→active`, `athlete→active` |

`height_cm`/`weight_kg` are guaranteed by onboarding (also shown on the dashboard), so the ML card renders for all users in practice. When `gender = 'other'`, the model uses the **male** reference and the response sets `inputs_used.gender_note = "other -> male reference"` so the UI can display the disclaimer.

---

## 7. Deviation & verdict logic (`comparison.py`)

For each comparable metric, compute `deviation = measured − expected` and `pct = deviation/expected·100`. Apply a **tolerance band** derived from the model's reported MAE so we don't over-flag noise:

- **ROM** (higher = better; abduction external MAE ≈ 4.8°): tolerance band **±6°** (≈ MAE + margin).
  - `|deviation| ≤ band` → **"Meets demographic expectation"** (green)
  - `deviation > band` → **"Exceeds expectation"** (green/blue)
  - `−15° ≤ deviation < −band` → **"Slightly below expectation"** (orange)
  - `deviation < −15°` → **"Well below expectation"** (red) → risk flag
- **STABILITY** (lower SD = better; STABILITY MAE ≈ 0.41°): tolerance band **±0.6°**.
  - `measured ≤ expected + band` → **"As steady as expected or better"** (green)
  - `expected+band < measured ≤ expected+1.5` → **"Slightly less steady"** (orange)
  - `measured > expected + 1.5` → **"Less steady than expected"** (red)
- **SPEED**: no verdict — return `{ "informational": true, "measured_deg_s": x, "expected_deg_s": y, "note": "Model speed is a max-effort simulator metric; not directly comparable." }`

`build_ml_comparison` returns an overall `variation_summary` (worst-of ROM/Stability verdict) for the AI prompt and the card header. Exact thresholds are configurable constants at the top of `comparison.py`.

---

## 8. Response shape additions

`/api/analysis/session` and `/api/analysis/30day` gain:
```jsonc
"ml_expected": {
  "movement": "abduction",
  "rom": 148.3,            // °
  "stability": 1.9,        // ° SD
  "speed": 512.4,          // °/s (informational)
  "inputs_used": { "age": 34, "sex": "M", "height_cm": 178, "weight_kg": 74, "activity": "moderate", "bmi": 23.4 }
},
"ml_comparison": {
  "rom":       { "measured": 132.0, "expected": 148.3, "deviation": -16.3, "pct": -11.0, "verdict": "well_below", "label": "Well below expectation", "color": "red" },
  "stability": { "measured": 3.1,  "expected": 1.9,  "deviation":  1.2,  "pct":  63.2, "verdict": "less_steady", "label": "Less steady than expected", "color": "orange" },
  "speed":     { "informational": true, "measured_deg_s": 88.0, "expected_deg_s": 512.4, "note": "..." },
  "variation_summary": { "label": "Below demographic expectation", "color": "red" }
}
```
When ML can't run (missing height/weight or model load error): `"ml_expected": null, "ml_comparison": null` and the frontend hides the card gracefully.

---

## 9. Edge cases & safeguards

- **Missing height/weight** → ML skipped, card hidden, no error.
- **sklearn version mismatch** → guarded import; if unpickling fails, log once and return `None` (report still renders without the ML card). Document the `scikit-learn==1.7.2` pin in `requirements.txt`.
- **Legacy `speed_data` without `peakAngularVelocity`** → informational speed row shows "n/a".
- **`gender == 'other'`** → use the **male (M)** reference; response carries `gender_note` so the UI shows the disclaimer.
- **Model load cost** → load once at first request, cache module-level dict (models are ~130 KB each). Optionally warm-load at server startup in `server.py`.
- **ROM cap** → clip abduction prediction to ≤175° post-inference.

---

## 10. Dependencies & setup delta

- `pip install scikit-learn==1.7.2 joblib` (add to `backend/requirements.txt`).
- Copy `mlframework/trained_models/{abduction,adduction}/` → `backend/ml_models/`.
- No env-var changes. No DB schema migration (reusing `speed_data` JSONB).

---

## 11. Testing / validation plan

1. **Unit parity check:** call `kinematics_model.predict_expected` with the paper's prototype (age 29, M, 175 cm, 70 kg, moderate) and assert abduction ROM ≈ 162.5° (matches `predict_patient.py`).
2. **Endpoint smoke test:** hit `/api/analysis/session` for a seeded user, confirm `ml_expected` + `ml_comparison` present and sensible.
3. **Speed metric:** run a speed test, confirm `speedPeakAngularVelocity` populates and is a plausible °/s value.
4. **Graceful degradation:** null out a profile's height/weight, confirm the report still renders with the ML card hidden.
5. **Frontend:** verify the Expected-vs-Measured card and the new chart reference line render, and PDF export still works.

---

## 12. Rollout order (implementation sequence)

1. `backend/ml_models/` artifacts + `kinematics_model.py` + unit parity test.
2. `comparison.py`.
3. Wire into `analysis.py` (`/session` first, then `/30day` + AI prompt + chart ref line).
4. `abduction.py` peak-angular-velocity + `/data/speed` field.
5. Frontend: test page speed field & submit payload → then `AnalysisReport.tsx` card + chart line.
6. `seed_db.py` + `requirements.txt`.
7. End-to-end test.

---

## 13. Resolved decisions

1. **Height/weight** — collected at onboarding for every user (shown on dashboard). ML card renders for all users; graceful skip is a safety net only.
2. **`gender = 'other'`** — use the **male** reference; UI shows the disclaimer "Gender 'other' — demographic baseline computed using male reference."
3. **Tolerance bands** — proceed with ±6° (ROM) / ±0.6° (Stability); tune at implementer's discretion.
4. **Movements** — v1 bundles abduction + adduction models; abduction is the active comparison. Adduction verdict deferred (see §14).

## 14. Deferred / future work

- **True adduction comparison:** requires the test to capture a distinct adduction metric (e.g. peak adduction angle or adduction hold SD). Once available, wire it to the already-bundled adduction model using the same `comparison.py` logic.
- **SPEED verdict:** enable once the model's speed metric gains real-world validation (or the speed test adopts a max-effort protocol).
- **Other four movements** (flexion, extension, IR, ER): add models + tests if the app expands beyond abduction/adduction.
