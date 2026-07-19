# Speed test redesign — wipe / reseed demo data

After deploying the 3-ramp speed test, refresh demo `test_results` so Analysis Report uses the new `speed_data` shape (best/avg peak °/s).

## Steps

1. Restart the Flask backend (`python server.py` in `backend/`).
2. In the app, open **Analysis Report** and click **Generate Report** once (writes a fresh auth token to `backend/debug.json`).
3. From `backend/`:

```powershell
python seed_db.py
```

This deletes seeded rows for all listed test types (including **Arm - Abduction & Adduction**) for that user and inserts sessions with:

- `speedAttemptPeaks` (3 values)
- `bestPeakAngularVelocity` / `peakAngularVelocity` / `avgPeakAngularVelocity`

4. Generate the report again — Profile Assessment should show **Speed (peak °/s)** with real values (not n/a).

## Backfill existing rows (without wiping)

If the dashboard still shows Peak °/s as `n/a` on old sessions, patch them in place:

```powershell
cd backend
python backfill_speed_peaks.py
```

Use `--force` to rewrite all speed peaks (e.g. after a bad backfill):

```powershell
python backfill_speed_peaks.py --force
```

Then refresh the dashboard.

## Live IMU check

On **Abduction & Adduction → Speed**: countdown → 3 max-effort ramps → submit → report should show measured best peak °/s.
