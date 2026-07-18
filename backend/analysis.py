"""
30-Day Longitudinal Progress Report — Analysis Module
Computes ML metrics (linear regression, consistency, stability delta, prediction)
and generates AI insights via Groq LLM.
Registered as a Flask Blueprint on the main server.
"""

import os
import json
import traceback
from datetime import datetime, timedelta, timezone
from flask import Blueprint, request, jsonify
import numpy as np
import requests
import urllib.parse

from normative import get_normative_targets, extract_session_metrics, assess_session

analysis_bp = Blueprint('analysis', __name__)

# ---------------------------------------------------------------------------
# Shared references — set by server.py at startup
# ---------------------------------------------------------------------------
_supabase_url = None
_supabase_key = None
_groq_api_key = None


def init(supabase_url, supabase_key, groq_api_key):
    """Called by server.py to inject the Supabase client and Groq key."""
    global _supabase_url, _supabase_key, _groq_api_key
    _supabase_url = supabase_url
    _supabase_key = supabase_key
    _groq_api_key = groq_api_key


def get_db_client():
    if not _supabase_url or not _supabase_key:
        return None
        
    from supabase import create_client, ClientOptions
    auth_header = request.headers.get('Authorization')
    print(f"[Analysis] Received Auth Header: {bool(auth_header)}")
    
    if auth_header and auth_header.startswith('Bearer '):
        token = auth_header.replace('Bearer ', '')
        options = ClientOptions(headers={'Authorization': f'Bearer {token}'})
        return create_client(_supabase_url, _supabase_key, options=options)
    
    return create_client(_supabase_url, _supabase_key)


# ===========================================================================
# DATA EXTRACTION — Pull arrays from Supabase JSONB
# ===========================================================================

def extract_sessions(rows):
    """
    Extract ML-ready arrays from raw Supabase test_results rows.
    Each row has: created_at, rom_data (jsonb), stability_data (jsonb), speed_data (jsonb)
    """
    sessions = []

    for row in rows:
        # --- Date ---
        created = row.get('created_at', '')
        try:
            dt = datetime.fromisoformat(created.replace('Z', '+00:00'))
        except Exception:
            continue

        # --- ROM ---
        rom = row.get('rom_data') or {}
        peak_rom = rom.get('maxRoll')
        if peak_rom is None:
            continue  # skip sessions without ROM data — can't do regression
        assessment = rom.get('assessment', '')

        # --- Speed ---
        speed = row.get('speed_data') or {}
        reps = speed.get('speedTotalReps', 0) or 0
        rep_consistency = speed.get('speedConsistency')

        # --- Stability ---
        stab = row.get('stability_data') or {}
        stab_results = stab.get('results') or {}
        phase_sds = []
        for i in range(4):
            phase = stab_results.get(str(i))
            if phase and 'std_deviation' in phase:
                phase_sds.append(phase['std_deviation'])

        avg_sd = sum(phase_sds) / len(phase_sds) if phase_sds else None

        sessions.append({
            'date': dt,
            'peak_rom': float(peak_rom),
            'assessment': assessment,
            'reps': int(reps),
            'rep_consistency': float(rep_consistency) if rep_consistency is not None else None,
            'avg_sd': float(avg_sd) if avg_sd is not None else None,
            'phase_sds': phase_sds,
        })

    # Sort by date ascending
    sessions.sort(key=lambda s: s['date'])
    return sessions


# ===========================================================================
# ML COMPUTATIONS
# ===========================================================================

def compute_recovery_slope(sessions):
    """
    Linear regression: y = mx + c on (day_index, peak_ROM).
    Returns slope (°/day), intercept, R², direction.
    """
    if len(sessions) < 2:
        return None

    first_date = sessions[0]['date']
    days = np.array([(s['date'] - first_date).total_seconds() / 86400 for s in sessions])
    roms = np.array([s['peak_rom'] for s in sessions])

    # Fit linear regression
    coefficients = np.polyfit(days, roms, 1)
    slope = float(coefficients[0])
    intercept = float(coefficients[1])

    # R² (coefficient of determination)
    y_pred = np.polyval(coefficients, days)
    ss_res = float(np.sum((roms - y_pred) ** 2))
    ss_tot = float(np.sum((roms - np.mean(roms)) ** 2))
    r_squared = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0.0

    # Direction classification
    if slope > 0.1:
        direction = "improving"
    elif slope < -0.1:
        direction = "declining"
    else:
        direction = "plateau"

    # Regression line values for chart
    regression_line = [float(v) for v in y_pred]

    return {
        'slope_per_day': round(slope, 3),
        'intercept': round(intercept, 1),
        'r_squared': round(r_squared, 4),
        'first_rom': round(float(roms[0]), 1),
        'latest_rom': round(float(roms[-1]), 1),
        'direction': direction,
        'regression_line': regression_line,
    }


def compute_consistency_index(sessions, window_days=30):
    """
    Consistency = (unique test days / window) × 100, penalized by longest gap.
    """
    if not sessions:
        return None

    test_dates = sorted(set(s['date'].date() for s in sessions))
    days_tested = len(test_dates)

    # Gap analysis
    gaps = []
    for i in range(1, len(test_dates)):
        gap = (test_dates[i] - test_dates[i - 1]).days
        gaps.append(gap)
    longest_gap = max(gaps) if gaps else 0

    # Base score
    base_score = (days_tested / window_days) * 100

    # Gap penalty: 2 points per day beyond 3
    gap_penalty = max(0, (longest_gap - 3)) * 2

    # Final score clamped 0-100
    score = max(0.0, min(100.0, base_score - gap_penalty))

    # Label
    if score >= 80:
        label = "Excellent"
    elif score >= 60:
        label = "Good"
    elif score >= 40:
        label = "Fair"
    else:
        label = "Poor"

    return {
        'score': round(score, 1),
        'days_tested': days_tested,
        'days_in_range': window_days,
        'longest_gap': longest_gap,
        'label': label,
    }


def compute_stability_delta(sessions):
    """
    Compare avg stability SD between early sessions and recent sessions.
    Also compute linear trend slope on the SDs.
    """
    # Filter sessions with stability data
    valid = [(s, i) for i, s in enumerate(sessions) if s['avg_sd'] is not None]
    if len(valid) < 2:
        return None

    first_date = sessions[0]['date']
    days_arr = [(s['date'] - first_date).total_seconds() / 86400 for s, _ in valid]
    sds_arr = [s['avg_sd'] for s, _ in valid]
    n = len(sds_arr)

    # Split into early ⅓ and recent ⅓
    split = max(1, n // 3)
    early = sds_arr[:split]
    recent = sds_arr[-split:]

    initial_avg_sd = float(np.mean(early))
    current_avg_sd = float(np.mean(recent))

    # Percent improvement (positive = improved = SD decreased)
    if initial_avg_sd > 0:
        percent_improvement = ((initial_avg_sd - current_avg_sd) / initial_avg_sd) * 100
    else:
        percent_improvement = 0.0

    # Linear trend on SDs
    sd_slope = float(np.polyfit(days_arr, sds_arr, 1)[0])

    if sd_slope < -0.01:
        trend = "improving"
    elif sd_slope > 0.01:
        trend = "declining"
    else:
        trend = "stable"

    return {
        'initial_avg_sd': round(initial_avg_sd, 2),
        'current_avg_sd': round(current_avg_sd, 2),
        'percent_improvement': round(percent_improvement, 1),
        'sd_trend_slope': round(sd_slope, 4),
        'trend': trend,
    }


def compute_predicted_recovery(recovery_slope, consistency_index, target_rom=None):
    """
    Extrapolate: days = (target - current) / slope, adjusted by consistency.
    """
    if not recovery_slope or not consistency_index:
        return None

    if target_rom is None:
        target_rom = 150

    latest_rom = recovery_slope['latest_rom']
    slope = recovery_slope['slope_per_day']
    r_squared = recovery_slope['r_squared']
    consistency_score = consistency_index['score']

    if latest_rom >= target_rom:
        return {
            'target_rom': target_rom,
            'base_days': 0,
            'adjusted_days': 0,
            'confidence': "achieved",
            'already_reached': True,
        }

    if slope <= 0:
        return {
            'target_rom': target_rom,
            'base_days': None,
            'adjusted_days': None,
            'confidence': "n/a",
            'already_reached': False,
        }

    base_days = (target_rom - latest_rom) / slope

    # Consistency multiplier: poor consistency stretches prediction
    consistency_multiplier = 1 + (1 - consistency_score / 100) * 1.0
    adjusted_days = base_days * consistency_multiplier

    # Confidence
    n = 1  # will be overridden
    if r_squared > 0.8:
        confidence = "high"
    elif r_squared > 0.5:
        confidence = "moderate"
    else:
        confidence = "low"

    return {
        'target_rom': target_rom,
        'base_days': round(base_days, 1),
        'adjusted_days': round(adjusted_days, 1),
        'confidence': confidence,
        'already_reached': False,
    }


# ===========================================================================
# AI LAYER — Groq LLM
# ===========================================================================

def generate_ai_insights(sessions, profile, recovery_slope, consistency_index,
                         stability_delta, predicted_recovery, test_type, side):
    """
    Send computed metrics + profile to Groq LLaMA 3.3 70B for clinical narrative.
    Returns structured JSON: summary, detail, recommendations, risk_flags, recovery_outlook.
    """
    if not _groq_api_key:
        return {'error': 'Groq API key not configured'}

    try:
        from groq import Groq
        client = Groq(api_key=_groq_api_key)
    except Exception as e:
        return {'error': f'Failed to initialize Groq client: {str(e)}'}

    # Build per-session trend lines
    first_date = sessions[0]['date']
    trend_lines = []
    for s in sessions:
        day_idx = int((s['date'] - first_date).total_seconds() / 86400)
        date_str = s['date'].strftime('%b %d')
        phase_str = ""
        if s['phase_sds']:
            phase_str = f" [4 phases: {', '.join(f'{sd:.1f}°' for sd in s['phase_sds'])}]"
        line = (
            f"Day {day_idx} ({date_str}): ROM={s['peak_rom']:.1f}°, "
            f"Reps={s['reps']}, "
            f"AvgSD={s['avg_sd']:.2f}°{phase_str}" if s['avg_sd'] is not None
            else f"Day {day_idx} ({date_str}): ROM={s['peak_rom']:.1f}°, "
                 f"Reps={s['reps']}, AvgSD=N/A"
        )
        line += f", Assessment={s['assessment']}"
        trend_lines.append(line)

    trend_data = "\n".join(trend_lines)

    # Profile data
    age = profile.get('age', 'Unknown')
    gender = profile.get('gender', 'Unknown')
    activity_level = profile.get('activity_level', 'Unknown')
    injury_notes = profile.get('injury_notes') or 'None reported'
    has_injury = profile.get('has_injury', False)
    if not has_injury:
        injury_notes = 'None reported'

    # Build stability section
    stab_section = "Data not available (insufficient stability tests)"
    if stability_delta:
        stab_section = (
            f"- Early avg SD: {stability_delta['initial_avg_sd']:.2f}° → "
            f"Current avg SD: {stability_delta['current_avg_sd']:.2f}°\n"
            f"- Change: {stability_delta['percent_improvement']:+.1f}%\n"
            f"- Trend: {stability_delta['trend']}\n"
            f"- SD categories: <2° Very Stable | 2-4° Stable | >4° Unstable"
        )

    # Build prediction section
    pred_section = "Cannot predict (insufficient data or no progress)"
    if predicted_recovery and predicted_recovery.get('base_days') is not None:
        pred_section = (
            f"- Target ROM: {predicted_recovery['target_rom']}° (full abduction)\n"
            f"- Estimated days at current rate: {predicted_recovery['base_days']:.0f}\n"
            f"- Adjusted for consistency: {predicted_recovery['adjusted_days']:.0f} days\n"
            f"- Confidence: {predicted_recovery['confidence']}"
        )
    elif predicted_recovery and predicted_recovery.get('already_reached'):
        pred_section = f"- Target ROM of {predicted_recovery['target_rom']}° has been REACHED!"

    system_prompt = (
        "You are a clinical AI assistant for STRYDE, a shoulder rehabilitation "
        "monitoring system. You analyze objective movement data collected from "
        "IMU sensors during functional tests. Provide evidence-based insights "
        "in clear, professional language. Do not diagnose — frame observations "
        "as data patterns. Always respond with valid JSON only, no markdown."
    )

    user_prompt = f"""Analyze this patient's 30-day rehabilitation progress:

## Patient Profile
- Age: {age} | Gender: {gender} | Activity Level: {activity_level}
- Reported Condition: {injury_notes}
- Test: {test_type} | Side: {side}

## Computed Metrics (last 30 days, {len(sessions)} sessions)

### Recovery Slope (Linear Regression: y = mx + c)
- Recovery Velocity (m): {recovery_slope['slope_per_day']:+.3f}°/day
- Starting ROM (c): {recovery_slope['intercept']:.1f}°
- Current ROM (latest session): {recovery_slope['latest_rom']:.1f}°
- R² goodness of fit: {recovery_slope['r_squared']:.4f}
- Direction: {recovery_slope['direction']}

### Consistency Index
- Score: {consistency_index['score']:.0f}/100 ({consistency_index['label']})
- Days with tests: {consistency_index['days_tested']} out of {consistency_index['days_in_range']}
- Longest gap between tests: {consistency_index['longest_gap']} days

### Stability — Neuromuscular Control (σ trend)
{stab_section}

### Recovery Prediction
{pred_section}

### Raw Session-by-Session Data
{trend_data}

Respond with EXACTLY this JSON structure (no extra text):
{{
  "summary": "2-3 sentence clinical progress summary",
  "detail": "1 paragraph deeper analysis connecting the metrics together",
  "recommendations": [
    "Specific actionable recommendation 1",
    "Specific actionable recommendation 2",
    "Specific actionable recommendation 3"
  ],
  "risk_flags": ["concern 1", "concern 2"] ,
  "recovery_outlook": "1 sentence prognosis based on the data"
}}

If there are no risk flags, use an empty array: "risk_flags": []
"""

    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.3,
            max_tokens=700,
            response_format={"type": "json_object"}
        )

        content = response.choices[0].message.content
        ai_result = json.loads(content)

        # Validate expected keys
        expected = ['summary', 'detail', 'recommendations', 'risk_flags', 'recovery_outlook']
        for key in expected:
            if key not in ai_result:
                ai_result[key] = "" if key != 'recommendations' and key != 'risk_flags' else []

        return ai_result

    except Exception as e:
        print(f"[Analysis] Groq API error: {e}")
        traceback.print_exc()
        return {
            'error': f'AI analysis failed: {str(e)}',
            'summary': '',
            'detail': '',
            'recommendations': [],
            'risk_flags': [],
            'recovery_outlook': ''
        }


# ===========================================================================
# HELPERS — Supabase HTTP
# ===========================================================================

def _supabase_headers():
    auth_header = request.headers.get('Authorization', '')
    return {
        'apikey': _supabase_key,
        'Authorization': auth_header if auth_header else f'Bearer {_supabase_key}',
        'Content-Type': 'application/json',
    }


def fetch_profile(user_id: str) -> dict:
    headers = _supabase_headers()
    profile_url = (
        f"{_supabase_url}/rest/v1/profiles"
        f"?id=eq.{user_id}"
        f"&select=age,gender,activity_level,has_injury,injury_notes,height_cm,weight_kg"
    )
    profile_resp = requests.get(profile_url, headers=headers)
    profile_data = profile_resp.json() if profile_resp.status_code == 200 else []
    return profile_data[0] if profile_data else {}


def fetch_latest_test_result(user_id: str, test_type: str, side: str):
    headers = _supabase_headers()
    params = {
        'user_id': f'eq.{user_id}',
        'test_type': f'eq.{test_type}',
        'side': f'eq.{side}',
        'order': 'created_at.desc',
        'limit': '1',
        'select': 'id,created_at,rom_data,stability_data,speed_data',
    }
    url = f"{_supabase_url}/rest/v1/test_results"
    resp = requests.get(url, headers=headers, params=params)
    if resp.status_code != 200:
        return None
    rows = resp.json()
    return rows[0] if rows else None


# ===========================================================================
# ENDPOINT
# ===========================================================================

@analysis_bp.route('/api/analysis/debug')
def analysis_debug():
    """Debug endpoint to check what data exists in Supabase for a user."""
    user_id = request.args.get('user_id')
    db = get_db_client()
    if not user_id or not db:
        return jsonify({'error': 'user_id required and supabase must be initialized'}), 400

    try:
        # Fetch ALL test results for this user (no filters)
        all_resp = db.table('test_results') \
            .select('id, created_at, test_type, side') \
            .eq('user_id', user_id) \
            .order('created_at', desc=True) \
            .execute()

        rows = all_resp.data or []
        return jsonify({
            'total_records': len(rows),
            'records': rows,
            'user_id': user_id,
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@analysis_bp.route('/api/analysis/session')
def analysis_session():
    """
    GET /api/analysis/session?user_id=&test_type=&side=
  Profile-aware assessment of the most recent test session vs normative targets.
    """
    user_id = request.args.get('user_id')
    test_type = request.args.get('test_type', 'Arm - Abduction & Adduction')
    side = request.args.get('side', 'right')

    if not user_id:
        return jsonify({'error': 'user_id is required'}), 400
    if not _supabase_url or not _supabase_key:
        return jsonify({'error': 'Supabase client not initialized'}), 500

    try:
        profile = fetch_profile(user_id)
        row = fetch_latest_test_result(user_id, test_type, side)

        if not row:
            return jsonify({
                'error': 'no_session',
                'message': f'No saved test found for "{test_type}" ({side} side). Complete and submit a test first.',
            }), 200

        metrics = extract_session_metrics(row)
        if not metrics:
            return jsonify({
                'error': 'invalid_session',
                'message': 'Latest session has no valid ROM data.',
            }), 200

        assessment = assess_session(metrics, profile)
        norms = assessment['normative_targets']

        created = row.get('created_at', '')
        try:
            session_date = datetime.fromisoformat(created.replace('Z', '+00:00')).strftime('%Y-%m-%d %H:%M')
        except Exception:
            session_date = created

        return jsonify({
            'session_assessment': assessment,
            'session_metrics': metrics,
            'session_meta': {
                'test_result_id': row.get('id'),
                'created_at': created,
                'session_date': session_date,
                'test_type': test_type,
                'side': side,
            },
            'normative_targets': norms,
        })

    except Exception as e:
        print(f"[Analysis] Session error: {e}")
        traceback.print_exc()
        return jsonify({'error': f'Session analysis failed: {str(e)}'}), 500


@analysis_bp.route('/api/analysis/30day')
def analysis_30day():
    """
    GET /api/analysis/30day?user_id=<uuid>&test_type=<type>&side=<left|right>
    Returns ML metrics + AI insights for 30-day longitudinal progress report.
    """
    user_id = request.args.get('user_id')
    test_type = request.args.get('test_type', 'Arm - Abduction & Adduction')
    side = request.args.get('side', 'right')

    print(f"\n[Analysis] === 30-Day Report Request ===")
    print(f"[Analysis] user_id: {user_id}")
    print(f"[Analysis] test_type: '{test_type}'")
    print(f"[Analysis] side: '{side}'")

    if not user_id:
        return jsonify({'error': 'user_id is required'}), 400

    db = get_db_client()
    if not db:
        return jsonify({'error': 'Supabase client not initialized'}), 500

    try:
        # --- Fetch test results (last 30 days) via direct HTTP request ---
        thirty_days_ago = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
        
        headers = _supabase_headers()

        # 1. Debug: Fetch total records for this user (any type/side)
        debug_url = f"{_supabase_url}/rest/v1/test_results?user_id=eq.{user_id}&order=created_at.desc&limit=10"
        debug_resp = requests.get(debug_url, headers=headers)
        debug_rows = debug_resp.json() if debug_resp.status_code == 200 else []

        # 2. Main query: Fetch filtered results
        query_params = {
            'user_id': f'eq.{user_id}',
            'test_type': f'eq.{test_type}',
            'side': f'eq.{side}',
            'created_at': f'gte.{thirty_days_ago}',
            'order': 'created_at.asc',
            'select': 'created_at,rom_data,stability_data,speed_data'
        }
        main_url = f"{_supabase_url}/rest/v1/test_results"
        results_resp = requests.get(main_url, headers=headers, params=query_params)
        
        if results_resp.status_code != 200:
            print(f"[Analysis] Supabase Query Error: {results_resp.text}")
            rows = []
        else:
            rows = results_resp.json()

        import json
        with open('debug.json', 'w') as f:
            json.dump({
                'auth_header_received': request.headers.get('Authorization', ''),
                'debug_url': debug_url,
                'debug_status': debug_resp.status_code,
                'debug_response': debug_rows,
                'main_params': query_params,
                'main_status': results_resp.status_code,
                'main_rows_count': len(rows),
                'main_rows_data': rows
            }, f, indent=2)

        profile = fetch_profile(user_id)
        norms = get_normative_targets(profile)
        target_rom = norms['rom_full_abduction']

        # --- Extract sessions ---
        sessions = extract_sessions(rows)
        print(f"[Analysis] Valid sessions extracted: {len(sessions)}")

        if len(sessions) < 3:
            # Also try without the side filter to give a helpful message
            any_side_params = {
                'user_id': f'eq.{user_id}',
                'test_type': f'eq.{test_type}',
                'created_at': f'gte.{thirty_days_ago}',
                'select': 'created_at,side'
            }
            any_side_resp = requests.get(main_url, headers=headers, params=any_side_params)
            any_side_rows = any_side_resp.json() if any_side_resp.status_code == 200 else []
            sides_found = list(set(r.get('side', 'unknown') for r in any_side_rows))
            
            raw_count = len(rows)
            valid_count = len(sessions)
            
            if raw_count > valid_count:
                msg = f'Need at least 3 valid test sessions for analysis. Found {raw_count} saved tests for "{test_type}" ({side} side), but only {valid_count} contained valid sensor data (Max ROM).'
            else:
                msg = f'Need at least 3 test sessions for analysis. Found {valid_count} for "{test_type}" ({side} side) in the last 30 days.'

            return jsonify({
                'error': 'insufficient_data',
                'message': msg,
                'record_count': valid_count,
                'debug': {
                    'total_user_records': len(debug_rows),
                    'filtered_by_type_and_date': len(any_side_rows),
                    'sides_available': sides_found,
                    'existing_records': [
                        {'date': dr.get('created_at'), 'type': dr.get('test_type'), 'side': dr.get('side')}
                        for dr in debug_rows
                    ]
                }
            }), 200

        # --- ML Computations ---
        recovery_slope = compute_recovery_slope(sessions)
        consistency_index = compute_consistency_index(sessions)
        stability_delta = compute_stability_delta(sessions)
        predicted_recovery = compute_predicted_recovery(
            recovery_slope, consistency_index, target_rom=target_rom
        )

        # --- Normative assessment for latest session ---
        session_assessment = None
        session_meta = None
        if rows:
            latest_row = rows[-1]
            latest_metrics = extract_session_metrics(latest_row)
            if latest_metrics:
                session_assessment = assess_session(latest_metrics, profile)
                created = latest_row.get('created_at', '')
                try:
                    session_date = datetime.fromisoformat(
                        created.replace('Z', '+00:00')
                    ).strftime('%Y-%m-%d %H:%M')
                except Exception:
                    session_date = created
                session_meta = {'session_date': session_date, 'created_at': created}

        # --- Chart data ---
        first_date = sessions[0]['date']
        chart_data = {
            'dates': [s['date'].strftime('%b %d') for s in sessions],
            'max_rom_values': [round(s['peak_rom'], 1) for s in sessions],
            'rep_counts': [s['reps'] for s in sessions],
            'avg_stability_sds': [round(s['avg_sd'], 2) if s['avg_sd'] is not None else None for s in sessions],
            'regression_line': recovery_slope['regression_line'] if recovery_slope else [],
            'reference_rom_excellent': norms['rom_excellent'],
            'reference_rom_moderate': norms['rom_moderate'],
            'reference_speed_excellent': norms['speed_excellent_reps'],
        }

        # --- AI Insights (Groq) ---
        ai_insights = generate_ai_insights(
            sessions, profile, recovery_slope, consistency_index,
            stability_delta, predicted_recovery, test_type, side
        )

        # --- Build response ---
        response = {
            'recovery_slope': recovery_slope,
            'consistency_index': consistency_index,
            'stability_delta': stability_delta,
            'predicted_recovery': predicted_recovery,
            'chart_data': chart_data,
            'ai_insights': ai_insights,
            'normative_targets': norms,
            'session_assessment': session_assessment,
            'session_meta': session_meta,
            'meta': {
                'user_id': user_id,
                'test_type': test_type,
                'side': side,
                'record_count': len(sessions),
                'date_range': {
                    'from': sessions[0]['date'].strftime('%Y-%m-%d'),
                    'to': sessions[-1]['date'].strftime('%Y-%m-%d'),
                }
            }
        }

        return jsonify(response)

    except Exception as e:
        print(f"[Analysis] Error: {e}")
        traceback.print_exc()
        return jsonify({'error': f'Analysis failed: {str(e)}'}), 500
