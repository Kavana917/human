import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import generatePDF from 'react-to-pdf';
import {
    ArrowLeft, TrendingUp, CalendarCheck, Shield, Clock,
    Brain, Lightbulb, AlertTriangle, Telescope, Loader2,
    FileBarChart, BarChart3, Download
} from 'lucide-react';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    Title,
    Tooltip,
    Legend,
    Filler,
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
import annotationPlugin from 'chartjs-plugin-annotation';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
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
    };
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

const TEST_OPTIONS = [
    { value: 'Arm - Abduction & Adduction', label: 'Arm - Abduction & Adduction' },
    { value: 'Arm - Flexion & Extension', label: 'Arm - Flexion & Extension' },
    { value: 'Arm - Internal Rotation', label: 'Arm - Internal Rotation' },
    { value: 'Arm - External Rotation', label: 'Arm - External Rotation' },
    { value: 'Arm - Horizontal Abduction & Adduction', label: 'Arm - Horizontal Abduction & Adduction' },
];

export default function AnalysisReport() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<AnalysisResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [side, setSide] = useState<'left' | 'right'>('right');
    const [selectedTest, setSelectedTest] = useState<string>(TEST_OPTIONS[0].value);
    const [hasGenerated, setHasGenerated] = useState(false);
    const targetRef = useRef<HTMLDivElement>(null);

    const generateReport = async () => {
        setLoading(true);
        setError(null);
        setData(null);

        try {
            let session = null;
            let sessionError = null;
            // Retry mechanism for Supabase Lock Acquire Timeout
            for (let i = 0; i < 3; i++) {
                const res = await supabase.auth.getSession();
                session = res.data.session;
                sessionError = res.error;
                if (!sessionError) break;
                await new Promise(r => setTimeout(r, 500)); // wait 500ms and retry
            }

            if (sessionError || !session) {
                setError('You must be logged in. Please refresh the page.');
                setLoading(false);
                return;
            }

            const testType = encodeURIComponent(selectedTest);
            const url = `http://localhost:7777/api/analysis/30day?user_id=${session.user.id}&test_type=${testType}&side=${side}`;

            const res = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${session.access_token}`
                }
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || `Server error ${res.status}`);
            }

            const result: AnalysisResponse = await res.json();

            if (result.error === 'insufficient_data') {
                setError(result.message || `Need at least 3 test sessions. Found ${result.record_count || 0}.`);
            } else if (result.error) {
                setError(result.error);
            } else {
                setData(result);
            }
            setHasGenerated(true);
        } catch (e) {
            setError((e as Error).message || 'Failed to generate report.');
            setHasGenerated(true);
        } finally {
            setLoading(false);
        }
    };

    const renderChart = () => {
        if (!data?.chart_data) return null;
        const cd = data.chart_data;

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
                    label: 'Rep Count',
                    data: cd.rep_counts,
                    yAxisID: 'y1',
                    backgroundColor: cd.rep_counts.map((r: number) =>
                        r >= 18 ? 'rgba(34, 197, 94, 0.7)' :
                            r >= 10 ? 'rgba(245, 158, 11, 0.7)' :
                                'rgba(239, 68, 68, 0.6)'
                    ),
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
                    text: '30-Day ROM Trend & Repetition Performance',
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
                        shoulderLevel: {
                            type: 'line' as const,
                            yMin: 90, yMax: 90, yScaleID: 'y',
                            borderColor: 'rgba(245, 158, 11, 0.5)',
                            borderWidth: 1.5,
                            borderDash: [4, 4],
                            label: {
                                content: '90° Shoulder Level',
                                display: true,
                                position: 'end' as const,
                                backgroundColor: 'rgba(245, 158, 11, 0.8)',
                                color: '#fff',
                                font: { size: 10 },
                                padding: 4,
                            }
                        },
                        fullAbduction: {
                            type: 'line' as const,
                            yMin: 150, yMax: 150, yScaleID: 'y',
                            borderColor: 'rgba(34, 197, 94, 0.5)',
                            borderWidth: 1.5,
                            borderDash: [4, 4],
                            label: {
                                content: '150° Full Abduction',
                                display: true,
                                position: 'end' as const,
                                backgroundColor: 'rgba(34, 197, 94, 0.8)',
                                color: '#fff',
                                font: { size: 10 },
                                padding: 4,
                            }
                        }
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
                    title: { display: true, text: 'Rep Count', font: { size: 12 }, color: '#22c55e' },
                    min: 0,
                    grid: { drawOnChartArea: false },
                    ticks: { stepSize: 2, color: '#22c55e' },
                },
                x: {
                    grid: { color: 'rgba(0,0,0,0.04)' },
                    ticks: { font: { size: 11 } },
                }
            }
        };

        return (
            <div style={{ height: '380px', padding: '24px', background: '#fff', border: '1px solid #e5e5e5', borderRadius: '8px' }}>
                <Chart type="bar" data={chartData} options={options} />
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
                color: rs?.direction === 'improving' ? '#16a34a' : rs?.direction === 'declining' ? '#dc2626' : '#d97706',
                bg: rs?.direction === 'improving' ? '#f0fdf4' : rs?.direction === 'declining' ? '#fef2f2' : '#fffbeb',
                border: rs?.direction === 'improving' ? '#86efac' : rs?.direction === 'declining' ? '#fca5a5' : '#fcd34d',
            },
            {
                icon: <CalendarCheck size={22} />,
                label: 'Consistency Index',
                value: ci ? `${ci.score.toFixed(0)}%` : 'N/A',
                sub: ci ? `${ci.days_tested}/${ci.days_in_range} days · ${ci.label}` : '',
                color: ci && ci.score >= 60 ? '#16a34a' : ci && ci.score >= 40 ? '#d97706' : '#dc2626',
                bg: ci && ci.score >= 60 ? '#f0fdf4' : ci && ci.score >= 40 ? '#fffbeb' : '#fef2f2',
                border: ci && ci.score >= 60 ? '#86efac' : ci && ci.score >= 40 ? '#fcd34d' : '#fca5a5',
            },
            {
                icon: <Shield size={22} />,
                label: 'Stability Delta',
                value: sd ? `${sd.percent_improvement > 0 ? '↓' : '↑'} ${Math.abs(sd.percent_improvement).toFixed(1)}%` : 'N/A',
                sub: sd ? `${sd.initial_avg_sd.toFixed(1)}° → ${sd.current_avg_sd.toFixed(1)}°` : 'Insufficient data',
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
            );
        }

        return (
            <div className="analysis-ai-panel">
                <div className="ai-panel-header">
                    <Brain size={22} />
                    <h3>AI-Powered Insights</h3>
                    <span className="ai-badge">Powered by Groq</span>
                </div>

                {ai.summary && (
                    <div className="ai-section">
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
                        <ol className="ai-recommendations">
                            {ai.recommendations.map((rec, i) => (
                                <li key={i}>{rec}</li>
                            ))}
                        </ol>
                    </div>
                )}

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
        );
    };

    return (
        <div className="page-container">
            <header className="page-header">
                <button onClick={() => navigate('/dashboard')} className="btn-icon">
                    <ArrowLeft size={20} />
                    <span>Back to Dashboard</span>
                </button>
                <h1 className="page-title">Analysis Report</h1>
                <p className="page-subtitle">30-Day Longitudinal Progress Report — ML-powered trend analysis with AI clinical insights.</p>
            </header>

            {/* Controls */}
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

            {/* Loading State */}
            {loading && (
                <div className="analysis-loading">
                    <div className="analysis-loading-content">
                        <Loader2 size={32} className="btn-loader" style={{ color: '#3b82f6' }} />
                        <h3>Computing your 30-day analysis...</h3>
                        <p>Running linear regression, computing stability trends, and generating AI insights.</p>
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

            {/* Error State */}
            {error && !loading && (
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

            {/* Results */}
            {data && !loading && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
                        <button 
                            onClick={() => generatePDF(targetRef, {filename: `Stryde-Analysis-${selectedTest.replace('Arm - ', '').replace(' ', '')}.pdf`})}
                            style={{ 
                                display: 'inline-flex', alignItems: 'center', gap: '8px', 
                                padding: '10px 16px', backgroundColor: '#111', color: '#fff', 
                                border: 'none', borderRadius: '8px', cursor: 'pointer',
                                fontSize: '0.95rem', fontWeight: 500, boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                            }}
                        >
                            <Download size={16} />
                            <span>Download PDF</span>
                        </button>
                    </div>

                    <div ref={targetRef} className="analysis-results" style={{ padding: '24px', backgroundColor: '#fcfcfc', borderRadius: '12px' }}>
                        <div style={{ marginBottom: '24px', borderBottom: '1px solid #e5e5e5', paddingBottom: '16px' }}>
                            <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#111' }}>Progress Report: {selectedTest.replace('Arm - ', '')}</h2>
                            <div className="analysis-meta" style={{ marginTop: '12px' }}>
                                <span>{data.meta.record_count} sessions</span>
                                <span>·</span>
                                <span>{data.meta.date_range.from} → {data.meta.date_range.to}</span>
                                <span>·</span>
                                <span style={{ textTransform: 'capitalize' }}>{data.meta.side} side</span>
                            </div>
                        </div>

                        {/* Metric Cards */}
                        {renderMetricCards()}

                        {/* Chart */}
                        <div style={{ marginTop: '32px' }}>
                            {renderChart()}
                        </div>

                        {/* AI Insights */}
                        <div style={{ marginTop: '32px' }}>
                            {renderAIInsights()}
                        </div>
                    </div>
                </div>
            )}

            {/* Empty State */}
            {!loading && !error && !data && !hasGenerated && (
                <div className="analysis-empty">
                    <FileBarChart size={48} strokeWidth={1} />
                    <h3>30-Day Longitudinal Progress Report</h3>
                    <p>Select your test side and click "Generate Report" to analyze your progress over the last 30 days.</p>
                    <div className="analysis-features">
                        <div className="analysis-feature">
                            <TrendingUp size={18} />
                            <span><strong>Recovery Slope:</strong> Linear regression on your peak ROM trend</span>
                        </div>
                        <div className="analysis-feature">
                            <CalendarCheck size={18} />
                            <span><strong>Consistency Index:</strong> How regularly you've been testing</span>
                        </div>
                        <div className="analysis-feature">
                            <Shield size={18} />
                            <span><strong>Stability Delta:</strong> Neuromuscular control improvement over time</span>
                        </div>
                        <div className="analysis-feature">
                            <Brain size={18} />
                            <span><strong>AI Insights:</strong> Personalized clinical analysis powered by Groq</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
