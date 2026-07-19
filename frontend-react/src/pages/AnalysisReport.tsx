import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import generatePDF from 'react-to-pdf';
import {
    ArrowLeft, TrendingUp, CalendarCheck, Shield, Clock,
    Brain, Lightbulb, AlertTriangle, Telescope, Loader2,
    FileBarChart, BarChart3, Download, Target, Info
} from 'lucide-react';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    RadialLinearScale,
    PointElement,
    LineElement,
    BarElement,
    RadarController,
    Title,
    Tooltip,
    Legend,
    Filler,
} from 'chart.js';
import { Chart, Radar } from 'react-chartjs-2';
import annotationPlugin from 'chartjs-plugin-annotation';
import { TEST_TYPE_OPTIONS as TEST_OPTIONS } from './tests/testConfigs';

ChartJS.register(
    CategoryScale,
    LinearScale,
    RadialLinearScale,
    PointElement,
    LineElement,
    BarElement,
    RadarController,
    Title,
    Tooltip,
    Legend,
    Filler,
    annotationPlugin
);

interface AnalysisResponse {
    recovery_slope: {
        slope_per_day: number;
        intercept: number;
        r_squared: number;
        first_rom: number;
        latest_rom: number;
        direction: string;
        regression_line: number[];
    };
    consistency_index: {
        score: number;
        days_tested: number;
        days_in_range: number;
        longest_gap: number;
        label: string;
    };
    stability_delta: {
        initial_avg_sd: number;
        current_avg_sd: number;
        percent_improvement: number;
        sd_trend_slope: number;
        trend: string;
    } | null;
    predicted_recovery: {
        target_rom: number;
        base_days: number | null;
        adjusted_days: number | null;
        confidence: string;
        already_reached: boolean;
    } | null;
    chart_data: {
        dates: string[];
        max_rom_values: number[];
        rep_counts: number[];
        avg_stability_sds: (number | null)[];
        regression_line: number[];
        reference_rom_excellent?: number;
        reference_rom_moderate?: number;
        reference_speed_excellent?: number;
        reference_rom_expected?: number | null;
        peak_angular_velocities?: (number | null)[];
    };
    progress_targets?: ProgressTargets;
    normative_targets?: ProgressTargets;
    session_meta?: { session_date: string; created_at: string };
    ml_expected?: MlExpected | null;
    ml_comparison?: MlComparison | null;
    ai_insights: {
        summary?: string;
        detail?: string;
        recommendations?: string[];
        risk_flags?: string[];
        recovery_outlook?: string;
        error?: string;
    };
    meta: {
        user_id: string;
        test_type: string;
        side: string;
        record_count: number;
        date_range: { from: string; to: string };
    };
    error?: string;
    message?: string;
    record_count?: number;
}

/** Injury-aware bands for 30-day progress charts / recovery target — not session grades. */
interface ProgressTargets {
    rom_excellent: number;
    rom_moderate: number;
    rom_full_abduction: number;
    speed_excellent_deg_s?: number;
    speed_good_deg_s?: number;
    speed_excellent_reps?: number;
    speed_good_reps?: number;
    stability_excellent_sd: number;
    stability_moderate_sd: number;
    profile_summary: {
        age: number;
        gender: string;
        activity_level: string;
        has_injury: boolean;
    };
}

interface SessionMetrics {
    peak_rom: number;
    peak_angular_velocity?: number | null;
    avg_sd?: number | null;
}

interface MlExpected {
    movement: string;
    rom: number;
    speed: number;
    stability: number;
    inputs_used: {
        age: number;
        sex: string;
        height_cm: number;
        weight_kg: number;
        bmi: number;
        activity: string;
        gender_note?: string;
    };
}

interface MlMetricComparison {
    measured: number;
    expected: number;
    deviation: number;
    pct: number | null;
    verdict: string;
    label: string;
    color: string;
}

interface MlComparison {
    rom: MlMetricComparison | null;
    stability: MlMetricComparison | null;
    speed: {
        informational: boolean;
        measured_deg_s: number | null;
        expected_deg_s: number;
        note: string;
    };
    variation_summary: { label: string; color: string };
}

interface SessionResponse {
    session_metrics?: SessionMetrics;
    session_meta: { session_date: string; test_type: string; side: string };
    progress_targets?: ProgressTargets;
    normative_targets?: ProgressTargets;
    ml_expected?: MlExpected | null;
    ml_comparison?: MlComparison | null;
    error?: string;
    message?: string;
}

function tierColors(color: string) {
    if (color === 'green') return { bg: '#f0fdf4', border: '#86efac', text: '#166534' };
    if (color === 'orange') return { bg: '#fffbeb', border: '#fcd34d', text: '#92400e' };
    return { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b' };
}

function clampScore(n: number) {
    return Math.max(0, Math.min(100, Math.round(n)));
}

function mlMeaning(verdict: string): string {
    switch (verdict) {
        case 'meets':
        case 'as_steady':
            return 'You are performing in line with demographically matched healthy peers.';
        case 'exceeds':
            return 'You are above the demographic baseline — a strong result for your age and build.';
        case 'slightly_below':
        case 'slightly_less_steady':
            return 'Slightly below demographic expectation — a meaningful but not severe gap.';
        case 'well_below':
        case 'less_steady':
            return 'Notably below demographic expectation — worth tracking closely across sessions.';
        default:
            return 'Compared against a demographically matched healthy baseline.';
    }
}

function buildTakeaway(ml: MlComparison | null): string {
    const parts: string[] = [];
    if (ml?.rom) {
        parts.push(ml.rom.label.toLowerCase().replace('demographic expectation', 'demographic peers'));
    }
    if (ml?.stability) {
        const v = ml.stability.verdict;
        if (v === 'as_steady') parts.push('stability matches demographic expectation');
        else if (v === 'slightly_less_steady') parts.push('stability is slightly below demographic expectation');
        else if (v === 'less_steady') parts.push('stability is below demographic expectation');
        else parts.push(ml.stability.label.toLowerCase());
    }
    if (parts.length === 0) {
        return ml
            ? 'Latest session compared to your demographically matched healthy baseline.'
            : 'Demographic model unavailable — complete height and weight in your profile to unlock session comparison.';
    }
    return parts.map((p, i) => (i === 0 ? p.charAt(0).toUpperCase() + p.slice(1) : p)).join('; ') + '.';
}

export default function AnalysisReport() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<AnalysisResponse | null>(null);
    const [sessionData, setSessionData] = useState<SessionResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [progressNote, setProgressNote] = useState<string | null>(null);
    const [side, setSide] = useState<'left' | 'right'>('right');
    const [selectedTest, setSelectedTest] = useState<string>(TEST_OPTIONS[0].value);
    const [hasGenerated, setHasGenerated] = useState(false);
    const targetRef = useRef<HTMLDivElement>(null);

    const generateReport = async () => {
        setLoading(true);
        setError(null);
        setProgressNote(null);
        setData(null);
        setSessionData(null);

        try {
            let authSession = null;
            let sessionError = null;
            for (let i = 0; i < 3; i++) {
                const res = await supabase.auth.getSession();
                authSession = res.data.session;
                sessionError = res.error;
                if (!sessionError) break;
                await new Promise(r => setTimeout(r, 500));
            }

            if (sessionError || !authSession) {
                setError('You must be logged in. Please refresh the page.');
                setLoading(false);
                return;
            }

            const testType = encodeURIComponent(selectedTest);
            const headers = { Authorization: `Bearer ${authSession.access_token}` };
            const base = `http://localhost:7777/api/analysis`;
            const qs = `user_id=${authSession.user.id}&test_type=${testType}&side=${side}`;

            const [sessionRes, progressRes] = await Promise.all([
                fetch(`${base}/session?${qs}`, { headers }),
                fetch(`${base}/30day?${qs}`, { headers }),
            ]);

            const sessionJson: SessionResponse = await sessionRes.json();
            const progressJson: AnalysisResponse = await progressRes.json();

            if (sessionJson.error === 'no_session' || sessionJson.error === 'invalid_session') {
                setError(sessionJson.message || 'No test session found. Complete and submit a test first.');
                setHasGenerated(true);
                return;
            }
            if (sessionJson.session_metrics || sessionJson.ml_comparison || sessionJson.ml_expected) {
                setSessionData(sessionJson);
            }

            if (progressJson.error === 'insufficient_data') {
                setProgressNote(
                    progressJson.message ||
                    `30-day progress needs at least 3 sessions (found ${progressJson.record_count || 0}). Session comparison below uses your latest test.`
                );
            } else if (progressJson.error) {
                setProgressNote(`Progress tracking unavailable: ${progressJson.error}`);
            } else if (!progressRes.ok) {
                setProgressNote('Could not load 30-day progress data.');
            } else {
                setData(progressJson);
                if (!sessionJson.session_metrics && !sessionJson.ml_comparison && progressJson.ml_comparison) {
                    setSessionData({
                        session_meta: {
                            session_date: progressJson.session_meta?.session_date || '',
                            test_type: selectedTest,
                            side,
                        },
                        progress_targets: progressJson.progress_targets ?? progressJson.normative_targets,
                        normative_targets: progressJson.normative_targets,
                        ml_expected: progressJson.ml_expected,
                        ml_comparison: progressJson.ml_comparison,
                    });
                }
            }

            const hasSession =
                !!(sessionJson.session_metrics || sessionJson.ml_comparison || sessionJson.ml_expected) ||
                !!(progressJson.ml_comparison || progressJson.ml_expected);
            if (!hasSession && progressJson.error !== 'insufficient_data') {
                setError('Unable to generate report. Please try again.');
            }

            setHasGenerated(true);
        } catch (e) {
            setError((e as Error).message || 'Failed to generate report.');
            setHasGenerated(true);
        } finally {
            setLoading(false);
        }
    };

    const sessionMeta = sessionData?.session_meta ?? data?.session_meta;
    const progressTargets =
        sessionData?.progress_targets ??
        sessionData?.normative_targets ??
        data?.progress_targets ??
        data?.normative_targets ??
        null;
    const mlExpected = sessionData?.ml_expected ?? data?.ml_expected ?? null;
    const mlComparison = sessionData?.ml_comparison ?? data?.ml_comparison ?? null;
    const hasInjury = !!progressTargets?.profile_summary?.has_injury;

    const renderExecutiveSummary = () => {
        if (!mlComparison && !mlExpected && !sessionData) return null;
        const variation = mlComparison?.variation_summary;
        const inputs = mlExpected?.inputs_used;
        const takeaway = buildTakeaway(mlComparison);
        const varC = variation ? tierColors(variation.color) : null;
        const testLabel = selectedTest.replace('Arm - ', '');
        const sideLabel = (sessionMeta && 'side' in sessionMeta ? sessionMeta.side : side) || side;
        const dateLabel = sessionMeta && 'session_date' in sessionMeta
            ? sessionMeta.session_date
            : '';

        return (
            <section className="report-section report-summary">
                <div className="report-section-header">
                    <FileBarChart size={22} />
                    <h2>Executive Summary</h2>
                </div>
                <div className="report-summary-meta">
                    <span>{testLabel}</span>
                    <span>·</span>
                    <span style={{ textTransform: 'capitalize' }}>{sideLabel} side</span>
                    {dateLabel && (
                        <>
                            <span>·</span>
                            <span>{dateLabel}</span>
                        </>
                    )}
                    {inputs && (
                        <>
                            <span>·</span>
                            <span>
                                Model inputs: age {inputs.age}, {inputs.sex}, BMI {inputs.bmi}, {inputs.activity}
                            </span>
                        </>
                    )}
                    {hasInjury && (
                        <>
                            <span>·</span>
                            <span>Injury reported — progress bands below are injury-aware</span>
                        </>
                    )}
                </div>
                <div className="report-summary-grades report-summary-grades--single">
                    {variation && varC ? (
                        <div className="report-grade-card" style={{ background: varC.bg, borderColor: varC.border }}>
                            <div className="report-grade-label">
                                <Brain size={16} /> Demographic comparison
                            </div>
                            <div className="report-grade-value" style={{ color: varC.text }}>{variation.label}</div>
                        </div>
                    ) : (
                        <div className="report-grade-card" style={{ background: '#fffbeb', borderColor: '#fcd34d' }}>
                            <div className="report-grade-label">
                                <Brain size={16} /> Demographic comparison
                            </div>
                            <div className="report-grade-value" style={{ color: '#92400e' }}>
                                Unavailable — add height &amp; weight to your profile
                            </div>
                        </div>
                    )}
                </div>
                <div className="report-takeaway">
                    <Info size={16} />
                    <p>{takeaway}</p>
                </div>
            </section>
        );
    };

    const renderMlBenchmarks = () => {
        if (!mlComparison || !mlExpected) return null;
        const genderNote = mlExpected.inputs_used?.gender_note;

        type Row = {
            key: string;
            title: string;
            measured: string;
            label: string;
            detail: string;
            color: string;
            meaning: string;
            informational?: boolean;
        };

        const rows: Row[] = [];
        if (mlComparison.rom) {
            const r = mlComparison.rom;
            rows.push({
                key: 'rom',
                title: 'Range of Motion',
                measured: `${r.measured}°`,
                label: r.label,
                detail: `Expected ${r.expected}° · Δ ${r.deviation > 0 ? '+' : ''}${r.deviation}°${r.pct != null ? ` (${r.pct > 0 ? '+' : ''}${r.pct}%)` : ''}`,
                color: r.color,
                meaning: mlMeaning(r.verdict),
            });
        }
        if (mlComparison.stability) {
            const s = mlComparison.stability;
            rows.push({
                key: 'stability',
                title: 'Stability (avg hold SD)',
                measured: `${s.measured}°`,
                label: s.label,
                detail: `Expected ${s.expected}° · Δ ${s.deviation > 0 ? '+' : ''}${s.deviation}°`,
                color: s.color,
                meaning: mlMeaning(s.verdict),
            });
        }
        rows.push({
            key: 'speed',
            title: 'Peak Angular Velocity',
            measured: mlComparison.speed.measured_deg_s != null ? `${mlComparison.speed.measured_deg_s} °/s` : '—',
            label: 'Informational',
            detail: `Model expected ${mlComparison.speed.expected_deg_s}°/s (max-effort simulator protocol)`,
            color: 'orange',
            meaning: mlComparison.speed.note,
            informational: true,
        });

        return (
            <section className="report-section">
                <div className="report-section-header">
                    <Brain size={22} />
                    <h2>Demographic Comparison</h2>
                </div>
                <p className="report-section-desc">
                    Primary session analysis: measured values vs a demographically matched healthy baseline
                    from the k-NN kinematics model
                    {` (age ${mlExpected.inputs_used.age}, ${mlExpected.inputs_used.sex}, BMI ${mlExpected.inputs_used.bmi}, ${mlExpected.inputs_used.activity})`}.
                </p>
                {genderNote && (
                    <div className="report-note report-note-warn">
                        Gender &apos;other&apos; — demographic baseline computed using male reference.
                    </div>
                )}

                <div className="report-benchmark-rows">
                    {rows.map((row) => {
                        const c = tierColors(row.color);
                        return (
                            <div key={row.key} className="report-benchmark-row report-benchmark-row--ml">
                                <div className="report-benchmark-measured">
                                    <div className="metric-label">{row.title}</div>
                                    <div className="report-measured-value">{row.measured}</div>
                                    <div className="metric-sub">Your latest session</div>
                                </div>
                                <div className="report-benchmark-lens" style={{ background: c.bg, borderColor: c.border }}>
                                    <div className="report-lens-title">
                                        <Brain size={14} /> vs Demographic expected
                                        {row.informational && <span className="report-info-chip">Info</span>}
                                    </div>
                                    <div className="report-lens-badge" style={{ color: c.text }}>{row.label}</div>
                                    <div className="report-lens-detail">{row.detail}</div>
                                    <p className="report-meaning">{row.meaning}</p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </section>
        );
    };

    const renderBenchmarkBars = () => {
        if (!mlComparison || !mlExpected) return null;

        type BarRow = {
            label: string;
            unit: string;
            measuredRaw: number;
            expectedRaw: number;
            lowerBetter: boolean;
        };

        const rows: BarRow[] = [];
        if (mlComparison.rom) {
            rows.push({
                label: 'ROM',
                unit: '°',
                measuredRaw: mlComparison.rom.measured,
                expectedRaw: mlComparison.rom.expected,
                lowerBetter: false,
            });
        }
        if (mlComparison.stability) {
            rows.push({
                label: 'Stability',
                unit: '° SD',
                measuredRaw: mlComparison.stability.measured,
                expectedRaw: mlComparison.stability.expected,
                lowerBetter: true,
            });
        }
        if (mlComparison.speed.measured_deg_s != null) {
            rows.push({
                label: 'Speed',
                unit: '°/s',
                measuredRaw: mlComparison.speed.measured_deg_s,
                expectedRaw: mlComparison.speed.expected_deg_s,
                lowerBetter: false,
            });
        }

        if (rows.length === 0) return null;

        const toPct = (value: number, expected: number, lowerBetter: boolean) => {
            if (!expected || expected <= 0) return 0;
            if (lowerBetter) {
                const v = Math.max(value, 0.01);
                return Math.round(Math.min(150, (expected / v) * 100));
            }
            return Math.round(Math.min(150, (value / expected) * 100));
        };

        const measuredPct = rows.map((r) => toPct(r.measuredRaw, r.expectedRaw, r.lowerBetter));
        const expectedPct = rows.map(() => 100);

        const chartData = {
            labels: rows.map((r) => r.label),
            datasets: [
                {
                    label: 'Measured',
                    data: measuredPct,
                    backgroundColor: 'rgba(17, 17, 17, 0.85)',
                    borderRadius: 4,
                    barPercentage: 0.75,
                    categoryPercentage: 0.65,
                },
                {
                    label: 'Demographic expected',
                    data: expectedPct,
                    backgroundColor: 'rgba(59, 130, 246, 0.55)',
                    borderRadius: 4,
                    barPercentage: 0.75,
                    categoryPercentage: 0.65,
                },
            ],
        };

        const options = {
            indexAxis: 'y' as const,
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 4, right: 8, bottom: 0, left: 0 } },
            plugins: {
                title: {
                    display: true,
                    text: 'Measured vs Demographic Expected (%)',
                    font: { size: 14, weight: 600 as const },
                    color: '#111',
                    padding: { bottom: 10 },
                },
                legend: {
                    position: 'top' as const,
                    align: 'center' as const,
                    labels: { usePointStyle: true, padding: 12, font: { size: 11 }, boxWidth: 8 },
                },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.85)',
                    padding: 10,
                    cornerRadius: 6,
                    callbacks: {
                        label: (ctx: { datasetIndex: number; dataIndex: number; parsed: { x: number } }) => {
                            const row = rows[ctx.dataIndex];
                            const series = ctx.datasetIndex === 0 ? 'Measured' : 'Demographic expected';
                            const raw = ctx.datasetIndex === 0 ? row.measuredRaw : row.expectedRaw;
                            return `${series}: ${ctx.parsed.x}% (${raw}${row.unit})`;
                        },
                    },
                },
            },
            scales: {
                x: {
                    min: 0,
                    max: 150,
                    grid: { color: 'rgba(0,0,0,0.04)' },
                    ticks: {
                        font: { size: 11 },
                        callback: (v: string | number) => `${v}%`,
                    },
                    title: {
                        display: true,
                        text: '% of demographic expected (100% = model baseline)',
                        font: { size: 11 },
                        color: '#9ca3af',
                    },
                },
                y: {
                    grid: { display: false },
                    ticks: { font: { size: 12, weight: 500 as const } },
                },
            },
        };

        return (
            <div className="report-chart-panel report-chart-panel--equal">
                <div className="report-chart-canvas">
                    <Chart type="bar" data={chartData} options={options} />
                </div>
                <p className="report-chart-caption">
                    Normalized to the ML demographic baseline. Stability inverted (lower SD = higher %). Speed is informational.
                </p>
            </div>
        );
    };

    const renderRadarChart = () => {
        if (!mlComparison || !mlExpected) return null;
        const labels: string[] = [];
        const scores: number[] = [];

        if (mlComparison.rom) {
            labels.push('ROM');
            scores.push(clampScore((mlComparison.rom.measured / mlComparison.rom.expected) * 100));
        }
        if (mlComparison.stability) {
            labels.push('Stability');
            const sd = Math.max(mlComparison.stability.measured, 0.01);
            scores.push(clampScore((mlComparison.stability.expected / sd) * 100));
        }
        if (mlComparison.speed.measured_deg_s != null && mlComparison.speed.expected_deg_s > 0) {
            labels.push('Speed');
            scores.push(clampScore((mlComparison.speed.measured_deg_s / mlComparison.speed.expected_deg_s) * 100));
        }
        if (data?.consistency_index) {
            labels.push('Consistency');
            scores.push(clampScore(data.consistency_index.score));
        }

        if (labels.length < 3) return null;

        const chartData = {
            labels,
            datasets: [
                {
                    label: 'Score (0–100)',
                    data: scores,
                    backgroundColor: 'rgba(17, 17, 17, 0.08)',
                    borderColor: '#111',
                    borderWidth: 2,
                    pointBackgroundColor: '#111',
                    pointBorderColor: '#fff',
                    pointHoverBackgroundColor: '#3b82f6',
                    pointRadius: 4,
                },
            ],
        };

        const options = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Score Breakdown',
                    font: { size: 14, weight: 600 as const },
                    color: '#111',
                    padding: { bottom: 8 },
                },
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx: { raw: unknown }) => `Score: ${ctx.raw}/100`,
                    },
                },
            },
            scales: {
                r: {
                    min: 0,
                    max: 100,
                    ticks: { stepSize: 25, font: { size: 10 }, backdropColor: 'transparent' },
                    grid: { color: 'rgba(0,0,0,0.08)' },
                    pointLabels: { font: { size: 12, weight: 500 as const }, color: '#374151' },
                },
            },
        };

        return (
            <section className="report-section report-section--charts">
                <div className="report-section-header">
                    <BarChart3 size={22} />
                    <h2>Performance Overview</h2>
                </div>
                <p className="report-section-desc">
                    Left: measured vs demographic expected (same % scale).
                    Right: normalized 0–100 score vs the ML baseline
                    {data?.consistency_index ? ' plus testing consistency' : ''}.
                    Stability is inverted so higher always means better control.
                </p>
                <div className="report-charts-split">
                    {renderBenchmarkBars()}
                    <div className="report-chart-panel report-chart-panel--equal">
                        <div className="report-chart-canvas">
                            <Radar data={chartData} options={options} />
                        </div>
                        <p className="report-chart-caption">
                            Score axes: {labels.join(' · ')}. Outer ring = 100 (demographic expected).
                        </p>
                    </div>
                </div>
            </section>
        );
    };

    const renderChartsFallback = () => {
        if (!mlComparison || !mlExpected) return null;
        let axisCount = 0;
        if (mlComparison.rom) axisCount++;
        if (mlComparison.stability) axisCount++;
        if (mlComparison.speed.measured_deg_s != null) axisCount++;
        if (data?.consistency_index) axisCount++;
        if (axisCount >= 3) return null;

        return (
            <section className="report-section report-section--charts">
                <div className="report-section-header">
                    <BarChart3 size={22} />
                    <h2>Benchmark Comparison</h2>
                </div>
                <p className="report-section-desc">
                    Measured values vs demographically expected baseline (normalized %).
                </p>
                <div className="report-charts-single">
                    {renderBenchmarkBars()}
                </div>
            </section>
        );
    };

    const renderProgressChart = () => {
        if (!data?.chart_data) return null;
        const cd = data.chart_data;
        const romExcellent = cd.reference_rom_excellent ?? progressTargets?.rom_excellent ?? 150;
        const romModerate = cd.reference_rom_moderate ?? progressTargets?.rom_moderate ?? 90;
        const romExpected = cd.reference_rom_expected ?? mlExpected?.rom ?? null;
        const progressLabel = hasInjury ? 'Injury-aware' : 'Progress';

        const chartData = {
            labels: cd.dates,
            datasets: [
                {
                    type: 'line' as const,
                    label: 'Max ROM (°)',
                    data: cd.max_rom_values,
                    yAxisID: 'y',
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.08)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 5,
                    pointBackgroundColor: '#3b82f6',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointHoverRadius: 7,
                    borderWidth: 2.5,
                    order: 1,
                },
                {
                    type: 'line' as const,
                    label: 'Regression Fit',
                    data: cd.regression_line,
                    yAxisID: 'y',
                    borderColor: 'rgba(59, 130, 246, 0.4)',
                    borderDash: [6, 4],
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 0,
                    fill: false,
                    tension: 0,
                    order: 2,
                },
                {
                    type: 'bar' as const,
                    label: 'Peak °/s',
                    data: (cd.peak_angular_velocities ?? cd.rep_counts).map((v) => v ?? 0),
                    yAxisID: 'y1',
                    backgroundColor: (cd.peak_angular_velocities ?? cd.rep_counts).map((r) => {
                        const val = r ?? 0;
                        const exc = cd.reference_speed_excellent ?? progressTargets?.speed_excellent_deg_s ?? progressTargets?.speed_excellent_reps ?? 110;
                        const good = progressTargets?.speed_good_deg_s ?? progressTargets?.speed_good_reps ?? 75;
                        return val >= exc ? 'rgba(34, 197, 94, 0.7)' :
                            val >= good ? 'rgba(245, 158, 11, 0.7)' :
                                'rgba(239, 68, 68, 0.6)';
                    }),
                    borderRadius: 4,
                    barPercentage: 0.5,
                    order: 3,
                }
            ]
        };

        const options = {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index' as const, intersect: false },
            plugins: {
                title: {
                    display: true,
                    text: '30-Day ROM Trend & Peak Angular Velocity',
                    font: { size: 14, weight: 600 as const },
                    color: '#111',
                    padding: { bottom: 16 }
                },
                legend: {
                    display: true,
                    position: 'top' as const,
                    labels: { usePointStyle: true, padding: 16, font: { size: 12 } }
                },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.85)',
                    padding: 12,
                    titleFont: { size: 13 },
                    bodyFont: { size: 12 },
                    cornerRadius: 6,
                },
                annotation: {
                    annotations: {
                        romModerate: {
                            type: 'line' as const,
                            yMin: romModerate, yMax: romModerate, yScaleID: 'y',
                            borderColor: 'rgba(245, 158, 11, 0.5)',
                            borderWidth: 1.5,
                            borderDash: [4, 4],
                            label: {
                                content: `${romModerate}° ${progressLabel} moderate`,
                                display: true,
                                position: 'end' as const,
                                backgroundColor: 'rgba(245, 158, 11, 0.8)',
                                color: '#fff',
                                font: { size: 10 },
                                padding: 4,
                            }
                        },
                        romExcellent: {
                            type: 'line' as const,
                            yMin: romExcellent, yMax: romExcellent, yScaleID: 'y',
                            borderColor: 'rgba(34, 197, 94, 0.5)',
                            borderWidth: 1.5,
                            borderDash: [4, 4],
                            label: {
                                content: `${romExcellent}° ${progressLabel} excellent`,
                                display: true,
                                position: 'end' as const,
                                backgroundColor: 'rgba(34, 197, 94, 0.8)',
                                color: '#fff',
                                font: { size: 10 },
                                padding: 4,
                            }
                        },
                        ...(romExpected != null ? {
                            romExpected: {
                                type: 'line' as const,
                                yMin: romExpected, yMax: romExpected, yScaleID: 'y',
                                borderColor: 'rgba(37, 99, 235, 0.65)',
                                borderWidth: 1.5,
                                borderDash: [2, 3],
                                label: {
                                    content: `${romExpected}° Demographic expected`,
                                    display: true,
                                    position: 'start' as const,
                                    backgroundColor: 'rgba(37, 99, 235, 0.85)',
                                    color: '#fff',
                                    font: { size: 10 },
                                    padding: 4,
                                }
                            }
                        } : {})
                    }
                }
            },
            scales: {
                y: {
                    type: 'linear' as const,
                    position: 'left' as const,
                    title: { display: true, text: 'ROM (degrees)', font: { size: 12 }, color: '#3b82f6' },
                    min: 0,
                    max: 200,
                    grid: { color: 'rgba(0,0,0,0.04)' },
                    ticks: { color: '#3b82f6' },
                },
                y1: {
                    type: 'linear' as const,
                    position: 'right' as const,
                    title: { display: true, text: 'Peak °/s', font: { size: 12 }, color: '#22c55e' },
                    min: 0,
                    grid: { drawOnChartArea: false },
                    ticks: { color: '#22c55e' },
                },
                x: {
                    grid: { color: 'rgba(0,0,0,0.04)' },
                    ticks: { font: { size: 11 } },
                }
            }
        };

        return (
            <div className="report-chart-panel" style={{ height: 380 }}>
                <Chart type="bar" data={chartData} options={options} />
            </div>
        );
    };

    const renderStabilityTrend = () => {
        if (!data?.chart_data?.avg_stability_sds) return null;
        const cd = data.chart_data;
        const values = cd.avg_stability_sds;
        const hasData = values.some((v) => v != null);
        if (!hasData) return null;

        const excellentSd = progressTargets?.stability_excellent_sd ?? 2;
        const moderateSd = progressTargets?.stability_moderate_sd ?? 4;

        const chartData = {
            labels: cd.dates,
            datasets: [
                {
                    label: 'Avg hold SD (°)',
                    data: values.map((v) => v ?? NaN),
                    borderColor: '#0f766e',
                    backgroundColor: 'rgba(15, 118, 110, 0.1)',
                    fill: true,
                    tension: 0.35,
                    pointRadius: 4,
                    pointBackgroundColor: '#0f766e',
                    spanGaps: true,
                    borderWidth: 2,
                },
            ],
        };

        const options = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Stability Trend (lower is better)',
                    font: { size: 14, weight: 600 as const },
                    color: '#111',
                    padding: { bottom: 12 },
                },
                legend: { display: false },
                annotation: {
                    annotations: {
                        excellent: {
                            type: 'line' as const,
                            yMin: excellentSd, yMax: excellentSd,
                            borderColor: 'rgba(34, 197, 94, 0.5)',
                            borderWidth: 1.5,
                            borderDash: [4, 4],
                            label: {
                                content: `${excellentSd}° excellent`,
                                display: true,
                                position: 'end' as const,
                                backgroundColor: 'rgba(34, 197, 94, 0.8)',
                                color: '#fff',
                                font: { size: 10 },
                                padding: 4,
                            },
                        },
                        moderate: {
                            type: 'line' as const,
                            yMin: moderateSd, yMax: moderateSd,
                            borderColor: 'rgba(245, 158, 11, 0.5)',
                            borderWidth: 1.5,
                            borderDash: [4, 4],
                            label: {
                                content: `${moderateSd}° moderate`,
                                display: true,
                                position: 'end' as const,
                                backgroundColor: 'rgba(245, 158, 11, 0.8)',
                                color: '#fff',
                                font: { size: 10 },
                                padding: 4,
                            },
                        },
                    },
                },
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: { display: true, text: 'SD (degrees)', font: { size: 12 }, color: '#0f766e' },
                    grid: { color: 'rgba(0,0,0,0.04)' },
                },
                x: {
                    grid: { color: 'rgba(0,0,0,0.04)' },
                    ticks: { font: { size: 11 } },
                },
            },
        };

        return (
            <div className="report-chart-panel" style={{ height: 280, marginTop: 16 }}>
                <Chart type="line" data={chartData} options={options} />
            </div>
        );
    };

    const renderMetricCards = () => {
        if (!data) return null;
        const { recovery_slope: rs, consistency_index: ci, stability_delta: sd, predicted_recovery: pr } = data;

        const cards = [
            {
                icon: <TrendingUp size={22} />,
                label: 'Recovery Velocity',
                value: rs ? `${rs.slope_per_day > 0 ? '+' : ''}${rs.slope_per_day.toFixed(2)}°/day` : 'N/A',
                sub: rs ? `R² = ${rs.r_squared.toFixed(3)}` : '',
                caption: 'How fast your peak ROM is changing per day from the regression fit.',
                color: rs?.direction === 'improving' ? '#16a34a' : rs?.direction === 'declining' ? '#dc2626' : '#d97706',
                bg: rs?.direction === 'improving' ? '#f0fdf4' : rs?.direction === 'declining' ? '#fef2f2' : '#fffbeb',
                border: rs?.direction === 'improving' ? '#86efac' : rs?.direction === 'declining' ? '#fca5a5' : '#fcd34d',
            },
            {
                icon: <CalendarCheck size={22} />,
                label: 'Consistency Index',
                value: ci ? `${ci.score.toFixed(0)}%` : 'N/A',
                sub: ci ? `${ci.days_tested}/${ci.days_in_range} days · ${ci.label}` : '',
                caption: 'Share of days in the window with a completed test — habit strength.',
                color: ci && ci.score >= 60 ? '#16a34a' : ci && ci.score >= 40 ? '#d97706' : '#dc2626',
                bg: ci && ci.score >= 60 ? '#f0fdf4' : ci && ci.score >= 40 ? '#fffbeb' : '#fef2f2',
                border: ci && ci.score >= 60 ? '#86efac' : ci && ci.score >= 40 ? '#fcd34d' : '#fca5a5',
            },
            {
                icon: <Shield size={22} />,
                label: 'Stability Delta',
                value: sd ? `${sd.percent_improvement > 0 ? '↓' : '↑'} ${Math.abs(sd.percent_improvement).toFixed(1)}%` : 'N/A',
                sub: sd ? `${sd.initial_avg_sd.toFixed(1)}° → ${sd.current_avg_sd.toFixed(1)}°` : 'Insufficient data',
                caption: 'Change in hold sway early vs late in the window (↓ SD = better control).',
                color: sd?.trend === 'improving' ? '#16a34a' : sd?.trend === 'declining' ? '#dc2626' : '#6b7280',
                bg: sd?.trend === 'improving' ? '#f0fdf4' : sd?.trend === 'declining' ? '#fef2f2' : '#f9fafb',
                border: sd?.trend === 'improving' ? '#86efac' : sd?.trend === 'declining' ? '#fca5a5' : '#e5e5e5',
            },
            {
                icon: <Clock size={22} />,
                label: 'Predicted Recovery',
                value: pr?.already_reached ? 'Reached!' :
                    pr?.adjusted_days != null ? `~${Math.round(pr.adjusted_days)} days` : 'N/A',
                sub: pr?.confidence ? `Confidence: ${pr.confidence}` : '',
                caption: 'Estimated days to your ROM target at the current recovery slope.',
                color: pr?.already_reached ? '#16a34a' : pr?.confidence === 'high' ? '#16a34a' : pr?.confidence === 'moderate' ? '#d97706' : '#6b7280',
                bg: pr?.already_reached ? '#f0fdf4' : '#f9fafb',
                border: pr?.already_reached ? '#86efac' : '#e5e5e5',
            }
        ];

        return (
            <div className="analysis-metrics-grid">
                {cards.map((card, i) => (
                    <div key={i} className="analysis-metric-card" style={{ background: card.bg, borderColor: card.border }}>
                        <div className="metric-icon" style={{ color: card.color }}>{card.icon}</div>
                        <div className="metric-label">{card.label}</div>
                        <div className="metric-value" style={{ color: card.color }}>{card.value}</div>
                        <div className="metric-sub">{card.sub}</div>
                        <p className="report-kpi-caption">{card.caption}</p>
                    </div>
                ))}
            </div>
        );
    };

    const renderAIInsights = () => {
        if (!data?.ai_insights) return null;
        const ai = data.ai_insights;

        if (ai.error && !ai.summary) {
            return (
                <section className="report-section">
                    <div className="analysis-ai-panel">
                        <div className="ai-panel-header">
                            <Brain size={22} />
                            <h3>AI Insights</h3>
                            <span className="ai-badge">Powered by Groq</span>
                        </div>
                        <div className="ai-error-box">
                            <AlertTriangle size={18} />
                            <span>AI analysis unavailable: {ai.error}</span>
                        </div>
                    </div>
                </section>
            );
        }

        return (
            <section className="report-section">
                <div className="report-section-header">
                    <Brain size={22} />
                    <h2>AI Insights</h2>
                    <span className="report-section-badge">Powered by Groq</span>
                </div>

                <div className="analysis-ai-panel report-ai-refined">
                    {ai.summary && (
                        <div className="ai-section ai-lead-summary">
                            <div className="ai-section-header">
                                <FileBarChart size={18} />
                                <h4>Summary</h4>
                            </div>
                            <p>{ai.summary}</p>
                        </div>
                    )}

                    {ai.detail && (
                        <div className="ai-section">
                            <div className="ai-section-header">
                                <BarChart3 size={18} />
                                <h4>Detailed Analysis</h4>
                            </div>
                            <p>{ai.detail}</p>
                        </div>
                    )}

                    {ai.recommendations && ai.recommendations.length > 0 && (
                        <div className="ai-section">
                            <div className="ai-section-header">
                                <Lightbulb size={18} />
                                <h4>Recommendations</h4>
                            </div>
                            <ul className="ai-checklist">
                                {ai.recommendations.map((rec, i) => (
                                    <li key={i}>{rec}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div className="ai-secondary-grid">
                        {ai.risk_flags && ai.risk_flags.length > 0 ? (
                            <div className="ai-section ai-risk-section">
                                <div className="ai-section-header">
                                    <AlertTriangle size={18} />
                                    <h4>Risk Flags</h4>
                                </div>
                                <ul className="ai-risk-list">
                                    {ai.risk_flags.map((flag, i) => (
                                        <li key={i}>{flag}</li>
                                    ))}
                                </ul>
                            </div>
                        ) : (
                            <div className="ai-section ai-no-risk">
                                <div className="ai-section-header">
                                    <Shield size={18} />
                                    <h4>Risk Flags</h4>
                                </div>
                                <p>No concerns detected — great progress!</p>
                            </div>
                        )}

                        {ai.recovery_outlook && (
                            <div className="ai-section ai-outlook-section">
                                <div className="ai-section-header">
                                    <Telescope size={18} />
                                    <h4>Recovery Outlook</h4>
                                </div>
                                <p>{ai.recovery_outlook}</p>
                            </div>
                        )}
                    </div>
                </div>
            </section>
        );
    };

    return (
        <div className="page-container page-container--report">
            <header className="page-header">
                <button onClick={() => navigate('/dashboard')} className="btn-icon">
                    <ArrowLeft size={20} />
                    <span>Back to Dashboard</span>
                </button>
                <h1 className="page-title">Analysis Report</h1>
                <p className="page-subtitle">
                    Demographic ML comparison for your latest session, plus 30-day progress tracking and AI insights.
                </p>
            </header>

            <div className="analysis-controls">
                <div className="analysis-control-group" style={{ flex: 2 }}>
                    <label className="analysis-control-label">Test Type</label>
                    <select
                        className="analysis-test-type"
                        value={selectedTest}
                        onChange={(e) => setSelectedTest(e.target.value)}
                        disabled={loading}
                        style={{
                            width: '100%',
                            padding: '12px 16px',
                            border: '1px solid #e5e5e5',
                            borderRadius: '8px',
                            fontSize: '1rem',
                            color: '#111',
                            fontFamily: 'inherit',
                            backgroundColor: '#fff',
                            cursor: 'pointer',
                            outline: 'none',
                            appearance: 'auto'
                        }}
                    >
                        {TEST_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                </div>

                <div className="analysis-control-group">
                    <label className="analysis-control-label">Side</label>
                    <div className="analysis-side-toggle">
                        <button
                            className={`side-btn ${side === 'left' ? 'active' : ''}`}
                            onClick={() => setSide('left')}
                            disabled={loading}
                        >
                            Left
                        </button>
                        <button
                            className={`side-btn ${side === 'right' ? 'active' : ''}`}
                            onClick={() => setSide('right')}
                            disabled={loading}
                        >
                            Right
                        </button>
                    </div>
                </div>

                <button
                    className="analysis-generate-btn"
                    onClick={generateReport}
                    disabled={loading}
                >
                    {loading ? (
                        <>
                            <Loader2 size={18} className="btn-loader" />
                            <span>Analyzing...</span>
                        </>
                    ) : (
                        <>
                            <TrendingUp size={18} />
                            <span>Generate Report</span>
                        </>
                    )}
                </button>
            </div>

            {loading && (
                <div className="analysis-loading">
                    <div className="analysis-loading-content">
                        <Loader2 size={32} className="btn-loader" style={{ color: '#3b82f6' }} />
                        <h3>Building your analysis report...</h3>
                        <p>Computing demographic comparison, 30-day trends, and AI insights.</p>
                    </div>
                    <div className="skeleton-grid">
                        {[1, 2, 3, 4].map(i => (
                            <div key={i} className="skeleton-card">
                                <div className="skeleton-line short" />
                                <div className="skeleton-line" />
                                <div className="skeleton-line short" />
                            </div>
                        ))}
                    </div>
                    <div className="skeleton-chart" />
                    <div className="skeleton-ai">
                        <div className="skeleton-line" />
                        <div className="skeleton-line" />
                        <div className="skeleton-line short" />
                    </div>
                </div>
            )}

            {error && !loading && !sessionData && (
                <div className="analysis-error">
                    <AlertTriangle size={28} />
                    <h3>Unable to Generate Report</h3>
                    <p>{error}</p>
                    {!hasGenerated && (
                        <p style={{ marginTop: '8px', fontSize: '0.9rem', color: '#6b7280' }}>
                            Complete more test sessions and try again.
                        </p>
                    )}
                </div>
            )}

            {progressNote && !loading && (
                <div className="report-note report-note-warn" style={{ marginBottom: 16 }}>
                    {progressNote}
                </div>
            )}

            {(data || sessionData) && !loading && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
                        <button
                            className="report-pdf-btn"
                            onClick={() => generatePDF(targetRef, { filename: `Stryde-Analysis-${selectedTest.replace('Arm - ', '').replace(' ', '')}.pdf` })}
                        >
                            <Download size={16} />
                            <span>Download PDF</span>
                        </button>
                    </div>

                    <div ref={targetRef} className="analysis-results report-results">
                        {renderExecutiveSummary()}
                        {renderMlBenchmarks()}
                        {renderRadarChart()}
                        {renderChartsFallback()}

                        {data && (
                            <section className="report-section">
                                <div className="report-section-header">
                                    <TrendingUp size={22} />
                                    <h2>30-Day Progress</h2>
                                </div>
                                <p className="report-section-desc">
                                    Trend KPIs and chart reference bands use
                                    {hasInjury ? ' injury-aware ' : ' '}
                                    progress targets (not the demographic peer model).
                                    {hasInjury
                                        ? ' Expectations are lowered to reflect rehab context.'
                                        : ''}
                                </p>
                                <div className="analysis-meta" style={{ marginTop: 0 }}>
                                    <span>{data.meta.record_count} sessions</span>
                                    <span>·</span>
                                    <span>{data.meta.date_range.from} → {data.meta.date_range.to}</span>
                                    <span>·</span>
                                    <span style={{ textTransform: 'capitalize' }}>{data.meta.side} side</span>
                                    {progressTargets && (
                                        <>
                                            <span>·</span>
                                            <span>
                                                ROM goal {progressTargets.rom_full_abduction}°
                                                {hasInjury ? ' (injury-aware)' : ''}
                                            </span>
                                        </>
                                    )}
                                </div>

                                {renderMetricCards()}

                                <div style={{ marginTop: 24 }}>
                                    {renderProgressChart()}
                                    {renderStabilityTrend()}
                                </div>
                            </section>
                        )}

                        {renderAIInsights()}
                    </div>
                </div>
            )}

            {!loading && !error && !data && !sessionData && !hasGenerated && (
                <div className="analysis-empty">
                    <FileBarChart size={48} strokeWidth={1} />
                    <h3>Analysis Report</h3>
                    <p>Select your test side and click Generate Report for a demographic ML comparison and 30-day progress (requires 3+ sessions).</p>
                    <div className="analysis-features">
                        <div className="analysis-feature">
                            <Brain size={18} />
                            <span><strong>Demographic ML:</strong> Measured vs demographically matched healthy baseline</span>
                        </div>
                        <div className="analysis-feature">
                            <BarChart3 size={18} />
                            <span><strong>Charts:</strong> Measured vs expected, score radar, and 30-day trends</span>
                        </div>
                        <div className="analysis-feature">
                            <Target size={18} />
                            <span><strong>Progress targets:</strong> Injury-aware bands for recovery timelines (not session grades)</span>
                        </div>
                        <div className="analysis-feature">
                            <TrendingUp size={18} />
                            <span><strong>Recovery Slope:</strong> Linear regression on your peak ROM trend</span>
                        </div>
                        <div className="analysis-feature">
                            <CalendarCheck size={18} />
                            <span><strong>AI Insights:</strong> Personalized clinical analysis powered by Groq</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
