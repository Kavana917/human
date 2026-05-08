# 30-Day Longitudinal Progress Report Architecture

This document outlines the complete architecture, implementation details, and code references for the "30-Day Longitudinal Progress Report" feature. This feature provides advanced ML-powered statistical tracking and AI-driven clinical insights based on biomechanical sensor data.

---

## 1. System Overview

The analysis engine is built to aggregate a user's raw IMU sensor data collected over the trailing 30 days, run mathematical models (like linear regression) to identify trends, and feed those trends into an AI language model to generate human-readable clinical feedback. 

**Key Features:**
- **Dynamic Filtering:** Users can filter their historical data by Test Type (via a dynamically populated dropdown) and Body Side (Left/Right).
- **ML Linear Regression:** Calculates the exact trajectory of recovery (the "Recovery Slope") using `numpy`.
- **AI Clinical Insights:** Orchestrates with Groq (LLaMA3) to evaluate statistical trends and flag potential risks.
- **PDF Generation:** Allows the user to instantly download a pixel-perfect snapshot of their report using `react-to-pdf`.

---

## 2. Frontend Implementation (`AnalysisReport.tsx`)

The frontend acts as the control center, fetching data securely and rendering complex visual charts.

### **Authentication & Request Handling**
We implemented a secure fetch mechanism that passes the user's JWT token to the backend. To fix a known frontend bug in `supabase-js` where concurrent session requests cause a lock collision, we implemented a robust retry loop.

```tsx
// Reference: frontend-react/src/pages/AnalysisReport.tsx

// Retry mechanism for Supabase Lock Acquire Timeout
for (let i = 0; i < 3; i++) {
    const res = await supabase.auth.getSession();
    session = res.data.session;
    sessionError = res.error;
    if (!sessionError) break;
    await new Promise(r => setTimeout(r, 500)); // wait 500ms and retry
}

// Securely pass token to Python Backend
const res = await fetch(url, {
    headers: {
        'Authorization': `Bearer ${session.access_token}`
    }
});
```

### **Data Visualization**
We utilized `react-chartjs-2` to render a mixed-type chart that displays three crucial dimensions of data simultaneously:
1. **Max ROM (Line Chart):** Actual peak angles achieved on specific dates.
2. **Regression Fit (Dashed Line):** The mathematically computed trendline.
3. **Rep Count (Bar Chart):** A dual-axis overlay showing exercise volume, color-coded by performance thresholds.

### **PDF Export**
We integrated `react-to-pdf` to allow users to save their progress. We wrapped the entire results container in a React `useRef`, enabling a one-click snapshot without relying on inconsistent native browser print dialogues.

```tsx
// Reference: frontend-react/src/pages/AnalysisReport.tsx
import generatePDF from 'react-to-pdf';
const targetRef = useRef<HTMLDivElement>(null);

<button onClick={() => generatePDF(targetRef, {filename: `Stryde-Analysis-${selectedTest.replace('Arm - ', '').replace(' ', '')}.pdf`})}>
    <Download size={16} /> Download PDF
</button>

<div ref={targetRef} className="analysis-results"> ... </div>
```

---

## 3. Backend Engine (`analysis.py`)

The unified Python Flask server is responsible for enforcing security, running statistical models, and interfacing with Groq.

### **Bypassing the Supabase-Py RLS Issue**
We encountered a critical bug where the official `supabase-py` library was forcibly overriding our authenticated user JWT with the public anonymous key during requests, causing Supabase Row Level Security (RLS) to return 0 records. We bypassed this by rewriting the database queries using the raw Python `requests` library.

```python
# Reference: backend/analysis.py

auth_header = request.headers.get('Authorization', '')
headers = {
    'apikey': _supabase_key,
    'Authorization': auth_header if auth_header else f'Bearer {_supabase_key}',
    'Content-Type': 'application/json'
}

# Raw HTTP GET guarantees the JWT is passed exactly as received
main_url = f"{_supabase_url}/rest/v1/test_results"
results_resp = requests.get(main_url, headers=headers, params=query_params)
```

### **Linear Regression (Machine Learning)**
To determine if a user is improving, stagnating, or degrading, we extract their Peak ROM and use `numpy.polyfit` to calculate a degree-1 polynomial (linear regression line).

```python
# Reference: backend/analysis.py

import numpy as np

# 'days_elapsed' is an array of days since the first test (X-axis)
# 'max_roms' is an array of the peak angles (Y-axis)
slope, intercept = np.polyfit(days_elapsed, max_roms, 1)

# A positive slope means ROM is increasing over time
regression_line = [round(slope * x + intercept, 2) for x in days_elapsed]
```

### **AI Clinical Analysis (Groq Orchestration)**
Once the statistical payload is assembled (slope, stability deviations, rep counts), it is injected into a strict system prompt and sent to Groq. We enforce a JSON schema response to guarantee the frontend can render the insights properly without parsing raw text.

```python
# Reference: backend/analysis.py

prompt = f"""
You are an expert orthopedic AI. Analyze this 30-day patient data:
Patient Profile: {profile.get('age', 'Unknown')}yo {profile.get('gender', 'Unknown')}
Tests logged: {len(sessions)}
Recovery Slope: {slope:.2f} degrees/day
...
Return ONLY valid JSON with keys: 'summary', 'detail', 'recommendations', 'risk_flags', 'recovery_outlook'.
"""

chat_completion = client.chat.completions.create(
    messages=[{"role": "user", "content": prompt}],
    model="llama3-8b-8192",
    response_format={"type": "json_object"}
)
```

---

## 4. Testing Infrastructure (`seed_db.py`)

To ensure the graphs and AI logic functioned correctly, we built a Python script to seed the database with highly realistic mock data. 

**Methodology:**
- Created 32 distinct records across 4 new functional test types.
- Generated comprehensive `times`, `rolls`, and `pitches` continuous arrays for each session to ensure "Detailed Graph" views do not crash.
- Programmed a deliberate mathematical improvement curve over 4 sessions (Day -28 to Day -1) so the regression line visibly trends upward.

```python
# Reference: backend/seed_db.py

# Simulated progress over 30 days (0.0 to 1.0)
progress = session_info['progress'] 

# ROM improves strictly according to progress curve
base_rom = 75 + (80 * progress) + random.uniform(-4, 4)

# Stability Standard Deviation decreases (improves)
base_sd = 5.5 - (4.0 * progress) + random.uniform(-0.4, 0.4)
```
