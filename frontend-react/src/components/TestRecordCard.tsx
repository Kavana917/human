import { useState } from 'react';
import { Calendar, ChevronDown, ChevronUp, Activity } from 'lucide-react';
import { Line, Bar } from 'react-chartjs-2';
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
import annotationPlugin from 'chartjs-plugin-annotation';
import { displayTestType } from '../pages/tests/testConfigs';

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

export default function TestRecordCard({ record }: { record: any }) {
    const [expanded, setExpanded] = useState(false);
    const date = new Date(record.created_at).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short'
    });

    const romData = record.rom_data;
    const stabilityData = record.stability_data;
    const speedData = record.speed_data;

    // Formatting chart configurations for historical view
    const renderRomChart = () => {
        if (!romData || !romData.times) return null;
        const data = {
            labels: romData.times.map((t: number) => t.toFixed(1)),
            datasets: [
                {
                    label: 'Relative Arm Angle (degrees)',
                    data: romData.rolls || [],
                    borderColor: 'dodgerblue',
                    backgroundColor: 'rgba(30, 144, 255, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0
                }
            ]
        };

        const options = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: { display: true, text: 'ROM: Angle Trajectory' },
                legend: { display: false }
            },
            scales: {
                y: { min: 0, max: 200 },
                x: { ticks: { maxTicksLimit: 10 } }
            }
        };

        return <div style={{ height: '200px', marginTop: '16px' }}><Line data={data} options={options} /></div>;
    };

    const renderSpeedChart = () => {
        const peaks: number[] = speedData?.speedAttemptPeaks || [];
        if (!speedData || peaks.length === 0) return null;
        const best = speedData.bestPeakAngularVelocity ?? speedData.peakAngularVelocity ?? 0;
        const data = {
            labels: peaks.map((_, i) => `Attempt ${i + 1}`),
            datasets: [
                {
                    label: 'Peak °/s',
                    data: peaks,
                    backgroundColor: peaks.map((p) =>
                        p >= best && best > 0 ? 'rgba(34, 197, 94, 0.8)' : 'rgba(59, 130, 246, 0.7)'
                    ),
                }
            ]
        };

        const options = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: `Speed — best ${Number(best).toFixed(1)} °/s`,
                },
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true, title: { display: true, text: '°/s' } }
            }
        };

        return <div style={{ height: '200px', marginTop: '16px' }}><Bar data={data} options={options} /></div>;
    };

    return (
        <div style={{
            background: '#fff',
            border: '1px solid #e5e5e5',
            borderRadius: '8px',
            padding: '24px',
            marginBottom: '16px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h3 style={{ margin: '0 0 8px 0', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Activity size={20} color="#111" />
                        {displayTestType(record.test_type)}
                        {record.test_type?.toLowerCase().includes('arm') && (
                            <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                padding: '2px 10px',
                                borderRadius: '12px',
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                letterSpacing: '0.05em',
                                backgroundColor: (record.side || 'right') === 'left' ? '#dbeafe' : '#dcfce7',
                                color: (record.side || 'right') === 'left' ? '#1e40af' : '#166534',
                                border: `1px solid ${(record.side || 'right') === 'left' ? '#93c5fd' : '#86efac'}`,
                            }}>
                                {(record.side || 'right').toUpperCase()}
                            </span>
                        )}
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#6b7280', fontSize: '0.9rem' }}>
                        <Calendar size={14} />
                        {date}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '16px', textAlign: 'center', flexWrap: 'wrap' }}>
                    <div style={{ background: '#f9fafb', padding: '8px 16px', borderRadius: '6px', border: '1px solid #e5e5e5' }}>
                        <div style={{ fontSize: '0.8rem', color: '#666' }}>Max ROM</div>
                        <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{romData?.maxRoll?.toFixed(0) || '-'}°</div>
                    </div>
                    <div style={{ background: '#f9fafb', padding: '8px 16px', borderRadius: '6px', border: '1px solid #e5e5e5' }}>
                        <div style={{ fontSize: '0.8rem', color: '#666' }}>Peak °/s</div>
                        <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>
                            {(() => {
                                const peak = speedData?.bestPeakAngularVelocity
                                    ?? speedData?.peakAngularVelocity
                                    ?? speedData?.speedPeakAngularVelocity;
                                return peak != null && Number(peak) > 0
                                    ? `${Number(peak).toFixed(0)}`
                                    : 'n/a';
                            })()}
                        </div>
                    </div>
                </div>
            </div>

            <button 
                onClick={() => setExpanded(!expanded)}
                style={{
                    background: 'none', border: 'none', color: '#3b82f6', 
                    display: 'flex', alignItems: 'center', gap: '4px',
                    fontSize: '0.9rem', cursor: 'pointer', marginTop: '16px',
                    padding: 0, fontWeight: 500
                }}
            >
                {expanded ? (
                    <><ChevronUp size={16} /> Hide Detailed Graphs</>
                ) : (
                    <><ChevronDown size={16} /> View Detailed Graphs</>
                )}
            </button>

            {expanded && (
                <div style={{ marginTop: '24px', borderTop: '1px solid #e5e5e5', paddingTop: '16px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                        <div style={{ background: '#fafafa', padding: '16px', borderRadius: '8px', border: '1px solid #e5e5e5' }}>
                            <h4 style={{ margin: '0 0 8px 0', fontSize: '1rem' }}>ROM Data</h4>
                            {renderRomChart()}
                        </div>
                        <div style={{ background: '#fafafa', padding: '16px', borderRadius: '8px', border: '1px solid #e5e5e5' }}>
                            <h4 style={{ margin: '0 0 8px 0', fontSize: '1rem' }}>Speed Data</h4>
                            {renderSpeedChart()}
                        </div>
                        <div style={{ background: '#fafafa', padding: '16px', borderRadius: '8px', border: '1px solid #e5e5e5', gridColumn: 'span 2' }}>
                            <h4 style={{ margin: '0 0 16px 0', fontSize: '1rem' }}>Stability Summary</h4>
                            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                                {stabilityData?.results && Object.entries(stabilityData.results).map(([phase, result]: [string, any]) => {
                                    const dev = result.std_deviation || 0;

                                    return (
                                        <div key={phase} style={{ flex: 1, background: '#fff', padding: '12px', borderRadius: '6px', border: '1px solid #e5e5e5', textAlign: 'center', minWidth: '120px' }}>
                                            <div style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>{result.target_angle}° Position</div>
                                            <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '4px' }}>SD: {dev.toFixed(2)}°</div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
