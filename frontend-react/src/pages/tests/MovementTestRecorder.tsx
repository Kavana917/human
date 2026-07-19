import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Play, Square, Send, Loader2 } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import * as THREE from 'three';
import TestPageLayout from './TestPageLayout';
import SideToggle from '../../components/SideToggle';
import { getMovementById, type MlMovementId } from './testConfigs';

const API_HOST = 'http://localhost:7777';

/** Shared ROM/Stability/Speed recorder. Prefer dedicated pages (AbductionTest / AdductionTest). */
export type MovementTestRecorderProps = {
  /** When set, locks this page to one movement and its namespaced API. */
  movementId?: MlMovementId;
};
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
  type ChartOptions
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
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

const IMUVisualizer = () => {
    const mountRef = useRef<HTMLDivElement>(null);
    const [imuData, setImuData] = useState({ pitch: 0, roll: 0, yaw: 0 });

    useEffect(() => {
        if (!mountRef.current) return;
        
        const currentMount = mountRef.current;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color('#fafafa');
        
        const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
        camera.position.set(0, 2, 5);
        camera.lookAt(0, 0, 0);

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(120, 110);
        renderer.setPixelRatio(window.devicePixelRatio);
        mountRef.current.appendChild(renderer.domElement);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
        directionalLight.position.set(5, 5, 5);
        scene.add(directionalLight);

        const geometry = new THREE.BoxGeometry(1.4, 0.25, 2.0);
        const materials = [
            new THREE.MeshStandardMaterial({ color: 0x1e40af, roughness: 0.5 }), // Right
            new THREE.MeshStandardMaterial({ color: 0x1e40af, roughness: 0.5 }), // Left
            new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.2 }), // Top
            new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.8 }), // Bottom
            new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.4 }), // Front (Yellow/Gold)
            new THREE.MeshStandardMaterial({ color: 0x1e40af, roughness: 0.5 })  // Back
        ];
        
        const sensorMesh = new THREE.Mesh(geometry, materials);
        scene.add(sensorMesh);

        const axesHelper = new THREE.AxesHelper(1.5);
        sensorMesh.add(axesHelper);

        let targetPitch = 0;
        let targetRoll = 0;
        let targetYaw = 0;
        let isFetching = false;
        
        const fetchInterval = setInterval(async () => {
            if (isFetching) return;
            isFetching = true;
            try {
                const response = await fetch(`http://127.0.0.1:7777/data?t=${Date.now()}`);
                if (response.ok) {
                    const data = await response.json();
                    setImuData({ pitch: data.pitch || 0, roll: data.roll || 0, yaw: data.yaw || 0 });
                    targetPitch = (data.pitch || 0) * (Math.PI / 180);
                    targetRoll = (data.roll || 0) * (Math.PI / 180);
                    targetYaw = (data.yaw || 0) * (Math.PI / 180);
                }
            } catch {
                // Ignore fetch errors to avoid spam
            } finally {
                isFetching = false;
            }
        }, 50);

        let animationFrameId: number;
        const animate = () => {
            sensorMesh.rotation.x += (targetPitch - sensorMesh.rotation.x) * 0.2;
            sensorMesh.rotation.z += (-targetRoll - sensorMesh.rotation.z) * 0.2;
            sensorMesh.rotation.y += (-targetYaw - sensorMesh.rotation.y) * 0.2;
            
            renderer.render(scene, camera);
            animationFrameId = requestAnimationFrame(animate);
        };

        animate();

        return () => {
            clearInterval(fetchInterval);
            cancelAnimationFrame(animationFrameId);
            if (currentMount && renderer.domElement) {
                currentMount.removeChild(renderer.domElement);
            }
            renderer.dispose();
            geometry.dispose();
        };
    }, []);

    return (
        <div 
            style={{ 
                width: '120px', 
                height: '110px', 
                borderRadius: '8px', 
                border: '1px solid #e5e5e5',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                background: '#fafafa',
                overflow: 'hidden',
                display: 'flex',
                alignSelf: 'center',
                flexDirection: 'column',
                position: 'relative',
                marginTop: '-8px',
                marginBottom: '-8px'
            }}
        >
            <div style={{ position: 'absolute', top: 4, left: 6, fontSize: '0.6rem', fontWeight: 700, color: '#4b5563', zIndex: 30, letterSpacing: '0.5px' }}>LIVE 3D</div>
            
            <div ref={mountRef} style={{ width: '100%', flex: 1 }} />

            <div style={{ 
                position: 'absolute', bottom: 4, left: 0, width: '100%', 
                textAlign: 'center', fontSize: '0.6rem', color: '#666', 
                fontFamily: 'monospace', fontWeight: 600, zIndex: 30
            }}>
                P:{imuData.pitch.toFixed(0)}° R:{imuData.roll.toFixed(0)}° Y:{imuData.yaw.toFixed(0)}°
            </div>
        </div>
    );
};

interface ChartData {
    status: string;
    times?: number[];
    rolls?: number[];
    pitches?: number[];
    bins?: string[];
    reps?: number[];
    maxIdx?: number;
    maxTime?: number;
    maxRoll?: number;
    baseline?: number;
    baselineSet?: boolean;
    referenceRanges?: {
        shoulderLevel: number;
        fullAbduction: number;
        maximum: number;
    };
    // Stability test specific fields
    currentPhase?: number;
    targetAngle?: number;
    currentAngle?: number;
    zoneStatus?: 'target' | 'approaching' | 'far' | 'countdown' | 'holding';
    progress?: number;
    progressType?: 'none' | 'countdown' | 'hold';
    holdProgress?: number;
    inTargetZone?: boolean;
    testComplete?: boolean;
    romMaxAngle?: number;
    romAvailable?: boolean;
    results?: {
        [phase: number]: {
            target_angle: number;
            std_deviation: number;
            range: number;
            mean_angle: number;
            sample_count: number;
        };
    };
    // Speed test — 3 max-effort ramps
    speedPhase?: 'countdown' | 'ready' | 'ramp' | 'rest' | 'complete';
    speedProgress?: number;
    speedAttempt?: number;
    speedAttemptTotal?: number;
    speedAttemptPeaks?: number[];
    speedCurrentRampPeak?: number;
    speedTestComplete?: boolean;
    speedUserMaxAngle?: number;
    speedPeakAngularVelocity?: number;
    peakAngularVelocity?: number;
    bestPeakAngularVelocity?: number;
    avgPeakAngularVelocity?: number;
}

function RecordedBadge() {
    return (
        <div
            style={{
                padding: '12px 16px',
                background: '#f0fdf4',
                border: '1px solid #86efac',
                borderRadius: '8px',
                margin: '0 16px 16px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
            }}
        >
            <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#166534' }}>Recorded</span>
            <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                Data captured for this test. Demographic analysis is available on the Analysis Report.
            </span>
        </div>
    );
}

export default function MovementTestRecorder({ movementId }: MovementTestRecorderProps) {
    const navigate = useNavigate();
    const { testId } = useParams();
    const resolvedId = movementId ?? testId;
    const movement = useMemo(() => getMovementById(resolvedId), [resolvedId]);
    const apiBase = movement ? `${API_HOST}/${movement.mlMovementId}` : API_HOST;

    const [activeTab, setActiveTab] = useState('rom');
    const [isRecording, setIsRecording] = useState(false);
    const [chartData, setChartData] = useState<ChartData | null>(null);
    const [romCompleted, setRomCompleted] = useState(false);
    const [stabilityCompleted, setStabilityCompleted] = useState(false);
    const [speedCompleted, setSpeedCompleted] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [side, setSide] = useState<'left' | 'right'>('right');
    const [sessionReady, setSessionReady] = useState(false);

    const resetLocalUi = useCallback(() => {
        setIsRecording(false);
        setChartData(null);
        setRomCompleted(false);
        setStabilityCompleted(false);
        setSpeedCompleted(false);
        setActiveTab('rom');
    }, []);

    const clearBackendSession = useCallback(async () => {
        try {
            await fetch(`${apiBase}/reset`, { method: 'POST' });
        } catch (e) {
            console.error('Failed to reset backend session', e);
        }
    }, [apiBase]);

    // Fresh page every visit: wipe prior in-memory recordings
    useEffect(() => {
        let cancelled = false;
        const boot = async () => {
            setSessionReady(false);
            resetLocalUi();
            await clearBackendSession();
            if (!cancelled) setSessionReady(true);
        };
        boot();
        return () => {
            cancelled = true;
        };
    }, [apiBase, resetLocalUi, clearBackendSession]);

    const handleSubmit = async () => {
        if (!movement) return;
        setIsSubmitting(true);
        try {
            // Get current user
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                alert("You must be logged in to save test results.");
                setIsSubmitting(false);
                return;
            }

            // Fetch final data for all 3 tests from the backend
            const [romRes, stabilityRes, speedRes] = await Promise.all([
                fetch(`${apiBase}/data/rom?t=${Date.now()}`),
                fetch(`${apiBase}/data/stability?t=${Date.now()}`),
                fetch(`${apiBase}/data/speed?t=${Date.now()}`)
            ]);

            if (!romRes.ok || !stabilityRes.ok || !speedRes.ok) {
                throw new Error("Failed to fetch all test data from backend");
            }

            const romData = await romRes.json();
            const stabilityData = await stabilityRes.json();
            const speedData = await speedRes.json();

            const { assessment: _a, assessmentColor: _c, ...romPayload } = romData;

            // Store in Supabase under the ML-aligned test_type for this movement
            const { error } = await supabase.from('test_results').insert([
                {
                    user_id: user.id,
                    test_type: movement.testType,
                    side: side,
                    rom_data: romPayload,
                    stability_data: stabilityData,
                    speed_data: speedData
                }
            ]);

            if (error) throw error;

            // Clear session so returning to this test is blank
            resetLocalUi();
            await clearBackendSession();
            
            // Navigate to Dashboard
            navigate('/dashboard');

        } catch (e) {
            console.error("Failed to submit results", e);
            alert("There was an error saving your results: " + (e as Error).message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const toggleRecording = async () => {
        // Prevent stability test without ROM data
        if (activeTab === 'stability' && !romCompleted) {
            alert('Please complete the ROM test first before doing the stability test.');
            return;
        }
        // Prevent speed test without ROM data
        if (activeTab === 'speed' && !romCompleted) {
            alert('Please complete the ROM test first before doing the speed test.');
            return;
        }
        if (!movement) return;
        const newState = !isRecording;
        setIsRecording(newState);
        try {
            const state = newState ? 'start' : 'stop';
            await fetch(`${apiBase}/toggle_recording/${activeTab}/${state}`);
            if (activeTab === 'rom' && !newState) {
                const res = await fetch(`${apiBase}/data/rom?t=${Date.now()}`);
                if (res.ok) {
                    const data = await res.json();
                    setChartData(data);
                    if (data.status === 'ok' && data.maxRoll) {
                        setRomCompleted(true);
                    }
                }
            }
        } catch (e) {
            console.error("Failed to toggle backend recording", e);
        }
    };

    const fetchChartData = useCallback(async () => {
        try {
            const res = await fetch(`${apiBase}/data/${activeTab}?t=${Date.now()}`);
            if (res.ok) {
                const data = await res.json();
                setChartData(data);
                
                // Track test completion (ROM completes on stop, not mid-recording)
                if (activeTab === 'stability' && data.testComplete) {
                    setStabilityCompleted(true);
                } else if (activeTab === 'speed' && data.speedTestComplete) {
                    setSpeedCompleted(true);
                }
            }
        } catch (e) {
            console.error("Failed to fetch graph data", e);
        }
    }, [activeTab, apiBase]);

    useEffect(() => {
        let interval: number;
        if (isRecording) {
            interval = setInterval(fetchChartData, 200);
        }
        return () => clearInterval(interval);
    }, [isRecording, activeTab, fetchChartData]);

    // Load chart for the active tab only after session reset (avoids stale prior-session data)
    useEffect(() => {
        if (!sessionReady) return;
        const controller = new AbortController();
        const fetchTabData = async () => {
            try {
                const res = await fetch(`${apiBase}/data/${activeTab}?t=${Date.now()}`, {
                    signal: controller.signal,
                });
                if (res.ok) {
                    const data = await res.json();
                    setChartData(data.status === 'empty' ? null : data);
                }
            } catch (e: unknown) {
                if (e instanceof Error && e.name !== 'AbortError') {
                    console.error('Failed to fetch tab graph data', e);
                }
            }
        };
        fetchTabData();
        return () => controller.abort();
    }, [activeTab, apiBase, sessionReady]);

    const renderChart = () => {
        if (!chartData || chartData.status === "empty") {
            return (
                <div style={{ color: 'grey', textAlign: 'center', fontSize: '1.2rem', fontWeight: 500 }}>
                    No Recording for {activeTab.toUpperCase()} yet.<br/>Press Start to begin.
                </div>
            );
        }

        if (activeTab === 'rom') {
            const data = {
                labels: chartData.times?.map((t: number) => t.toFixed(1)) || [],
                datasets: [
                    {
                        label: 'Relative Arm Angle (degrees)',
                        data: chartData.rolls || [],
                        borderColor: 'dodgerblue',
                        backgroundColor: 'rgba(30, 144, 255, 0.1)',
                        fill: true,
                        tension: 0.4,
                        pointRadius: chartData.times?.map((_: number, i: number) => i === chartData.maxIdx ? 6 : 0) || [],
                        pointBackgroundColor: chartData.times?.map((_: number, i: number) => i === chartData.maxIdx ? 'red' : 'dodgerblue') || []
                    }
                ]
            };

            const options: ChartOptions<'line'> = {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { 
                        display: true, 
                        text: `ROM: Angle Trajectory${chartData.baselineSet ? ' (Baseline Calibrated)' : ''}`, 
                        font: { size: 14 } 
                    },
                    legend: { display: true },
                    annotation: {
                        annotations: Object.fromEntries(
                            (movement?.romAnnotations ?? []).map((ann, i) => [
                                `ref${i}`,
                                {
                                    type: 'line' as const,
                                    yMin: ann.value,
                                    yMax: ann.value,
                                    borderColor: ann.color,
                                    borderWidth: 2,
                                    borderDash: [5, 5],
                                    label: {
                                        content: ann.label,
                                        display: true,
                                        position: 'end' as const,
                                        backgroundColor: ann.color,
                                        font: { size: 10 },
                                    },
                                },
                            ])
                        ),
                    }
                },
                scales: {
                    y: { 
                        title: { display: true, text: 'Relative Angle (degrees)' },
                        min: 0,
                        max: movement?.romYMax ?? 200
                    },
                    x: { title: { display: true, text: 'Progression / Time (s)' }, ticks: { maxTicksLimit: 10 } }
                }
            };
            return <Line data={data} options={options} />;
        }
        else if (activeTab === 'stability') {
            // Use roll data for abduction/adduction stability
            const data = {
                labels: chartData.times?.map((t: number) => t.toFixed(1)) || [],
                datasets: [
                    {
                        label: 'Arm Angle',
                        data: chartData.rolls || [],
                        borderColor: 'seagreen',
                        backgroundColor: 'rgba(46, 139, 87, 0.1)',
                        fill: false,
                        tension: 0.2,
                        pointRadius: 1,
                        pointHoverRadius: 4
                    }
                ]
            };

            // Create annotations for target zones
            interface AnnotationConfig {
                type: 'line';
                yMin: number;
                yMax: number;
                borderColor: string;
                borderWidth: number;
                borderDash?: number[];
                label?: {
                    content: string;
                    display: boolean;
                    position: 'start';
                    backgroundColor: string;
                    font: { size: number };
                    color: string;
                };
            }
            
            const annotations: { [key: string]: AnnotationConfig } = {};
            const fallback = movement?.stabilityFallbackTargets ?? [45, 90, 135, 150];
            const fromApi = (chartData as { targetAngles?: number[] }).targetAngles;
            const targetAngles =
                fromApi && fromApi.length >= 2
                    ? fromApi
                    : fallback.length === 2
                        ? [fallback[0], chartData.romMaxAngle || fallback[1]]
                        : [
                            fallback[0],
                            fallback[1],
                            fallback[2],
                            chartData.romMaxAngle || fallback[3],
                        ];
            const nPhases = targetAngles.length;
            
            targetAngles.forEach((angle, index) => {
                if (angle && angle > 0) {
                    annotations[`target${index}`] = {
                        type: 'line' as const,
                        yMin: angle,
                        yMax: angle,
                        borderColor: 'rgba(59, 130, 246, 0.8)',
                        borderWidth: 2,
                        borderDash: [5, 5],
                        label: {
                            content: `${angle}° Target`,
                            display: true,
                            position: 'start' as const,
                            backgroundColor: 'rgba(59, 130, 246, 0.8)',
                            font: { size: 10 },
                            color: 'white'
                        }
                    };
                    
                    // Add tolerance zones
                    annotations[`zone${index}Min`] = {
                        type: 'line' as const,
                        yMin: angle - 5,
                        yMax: angle - 5,
                        borderColor: 'rgba(59, 130, 246, 0.3)',
                        borderWidth: 1,
                        borderDash: [2, 2],
                    };
                    
                    annotations[`zone${index}Max`] = {
                        type: 'line' as const,
                        yMin: angle + 5,
                        yMax: angle + 5,
                        borderColor: 'rgba(59, 130, 246, 0.3)',
                        borderWidth: 1,
                        borderDash: [2, 2],
                    };
                }
            });

            const options = {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { 
                        display: true, 
                        text: `Stability Test: Position ${chartData.currentPhase ? chartData.currentPhase + 1 : 1}/${nPhases}`, 
                        font: { size: 14 } 
                    },
                    legend: { display: true },
                    annotation: {
                        annotations
                    }
                },
                scales: {
                    y: { 
                        title: { display: true, text: 'Arm Angle (degrees)' },
                        min: 0,
                        max: Math.max(...targetAngles) + 20
                    },
                    x: { title: { display: true, text: 'Time (s)' }, ticks: { maxTicksLimit: 10 } }
                }
            };
            return <Line data={data} options={options} />;
        }
        else if (activeTab === 'speed') {
            const phase = chartData.speedPhase || 'countdown';
            const attempt = chartData.speedAttempt || 1;
            const total = chartData.speedAttemptTotal || 3;
            const livePeak = chartData.speedCurrentRampPeak ?? chartData.speedPeakAngularVelocity ?? 0;
            const isAdduct = movement?.mlMovementId === 'adduction';
            const moveVerb = 'raise out to the side';
            const phaseTitle =
                phase === 'countdown' ? 'Get ready — keep arm down at your side' :
                phase === 'ready' ? `Attempt ${attempt}/${total} — ${moveVerb} as fast as you can` :
                phase === 'ramp' ? `Ramp ${attempt}/${total} — peak ${livePeak.toFixed(0)} °/s` :
                phase === 'rest' ? `Rest — return arm down for attempt ${attempt}/${total}` :
                `Complete — best ${(chartData.bestPeakAngularVelocity ?? chartData.peakAngularVelocity ?? 0).toFixed(1)} °/s`;

            if (!chartData.speedTestComplete) {
                const maxAngle =
                    chartData.speedUserMaxAngle ||
                    movement?.stabilityFallbackTargets?.[3] ||
                    150;
                const leaveBaselineThreshold = isAdduct ? 10 : 15;
                const enterBaselineThreshold = 5;
                const activeColor = phase === 'ramp' ? '#22c55e' : phase === 'rest' ? '#3b82f6' : '#f59e0b';

                const data = {
                    labels: chartData.times?.map((t: number) => t.toFixed(1)) || [],
                    datasets: [
                        {
                            label: 'Arm Angle',
                            data: chartData.rolls || [],
                            borderColor: activeColor,
                            backgroundColor: 'rgba(34, 197, 94, 0.1)',
                            fill: true,
                            tension: 0.2,
                            pointRadius: 0,
                            pointHoverRadius: 4,
                            borderWidth: 2
                        }
                    ]
                };

                const options: ChartOptions<'line'> = {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: { duration: 0 },
                    plugins: {
                        title: {
                            display: true,
                            text: phaseTitle,
                            font: { size: 14, weight: 'bold' },
                            color: phase === 'ramp' ? '#166534' : '#92400e'
                        },
                        legend: { display: false },
                        annotation: {
                            annotations: {
                                leaveLine: {
                                    type: 'line',
                                    yMin: leaveBaselineThreshold,
                                    yMax: leaveBaselineThreshold,
                                    borderColor: '#f59e0b',
                                    borderWidth: 1,
                                    borderDash: [3, 3],
                                    label: {
                                        display: true,
                                        content: `Start ramp (> ${leaveBaselineThreshold}°)`,
                                        position: 'end',
                                        backgroundColor: 'rgba(245, 158, 11, 0.7)',
                                        color: 'white',
                                        font: { size: 9 }
                                    }
                                },
                                enterLine: {
                                    type: 'line',
                                    yMin: enterBaselineThreshold,
                                    yMax: enterBaselineThreshold,
                                    borderColor: '#ef4444',
                                    borderWidth: 2,
                                    borderDash: [5, 5],
                                    label: {
                                        display: true,
                                        content: `Return base (<= ${enterBaselineThreshold}°)`,
                                        position: 'start',
                                        backgroundColor: 'rgba(239, 68, 68, 0.8)',
                                        color: 'white',
                                        font: { size: 10 }
                                    }
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            title: { display: true, text: 'Arm Angle (degrees)' },
                            min: 0,
                            max: Math.max(maxAngle + 20, movement?.romYMax ?? 180)
                        },
                        x: {
                            title: { display: true, text: 'Time (s)' },
                            ticks: { maxTicksLimit: 10 }
                        }
                    }
                };
                return <Line data={data} options={options} />;
            } else {
                const peaks = chartData.speedAttemptPeaks || [];
                const best = chartData.bestPeakAngularVelocity ?? chartData.peakAngularVelocity ?? 0;
                const data = {
                    labels: peaks.map((_, i) => `Attempt ${i + 1}`),
                    datasets: [
                        {
                            label: 'Peak °/s',
                            data: peaks,
                            backgroundColor: peaks.map((p: number) =>
                                p >= best && best > 0 ? 'rgba(34, 197, 94, 0.8)' : 'rgba(59, 130, 246, 0.7)'
                            ),
                            borderColor: 'rgba(107, 114, 128, 0.5)',
                            borderWidth: 1
                        }
                    ]
                };

                const options = {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        title: {
                            display: true,
                            text: `Best ${best.toFixed(1)} °/s · Avg ${(chartData.avgPeakAngularVelocity ?? 0).toFixed(1)} °/s`,
                            font: { size: 14, weight: 'bold' as const }
                        },
                        legend: { display: false }
                    },
                    scales: {
                        y: {
                            title: { display: true, text: 'Peak angular velocity (°/s)' },
                            beginAtZero: true,
                            max: Math.max(...peaks, 50) * 1.15
                        },
                        x: { title: { display: true, text: 'Attempt' } }
                    }
                };
                return <Bar data={data} options={options} />;
            }
        }
        return null;
    };

    if (!movement) {
        return (
            <TestPageLayout title="Unknown Test">
                <div style={{ padding: '24px', border: '1px solid #e5e5e5', borderRadius: '8px', background: '#fff' }}>
                    <h3 style={{ marginTop: 0, marginBottom: '12px' }}>Test not found</h3>
                    <p style={{ margin: 0, color: '#4b5563' }}>
                        This test is not one of the six ML-aligned shoulder movements.
                    </p>
                    <button
                        className="btn-primary"
                        style={{ marginTop: '16px', width: 'auto', display: 'inline-flex' }}
                        onClick={() => navigate('/tests')}
                    >
                        Go back to test selection
                    </button>
                </div>
            </TestPageLayout>
        );
    }

    return (
        <TestPageLayout title={movement.title} videoSrc={movement.videoSrc}>
                    {/* Instructions */}
                    {activeTab === 'rom' && !isRecording && (
                        <div style={{ 
                            padding: '24px', 
                            background: '#fff', 
                            border: '1px solid #e5e5e5',
                            borderRadius: '8px',
                            marginBottom: '20px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.02)'
                        }}>
                            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', fontWeight: 600, color: '#111' }}>
                                Instructions for {movement.title} ROM
                            </h3>
                            <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '0.95rem', color: '#333', lineHeight: '1.6' }}>
                                {movement.romInstructions.map((step, i) => (
                                    <li key={i} style={{ marginBottom: i < movement.romInstructions.length - 1 ? '8px' : 0 }}>
                                        {step}
                                    </li>
                                ))}
                            </ol>
                            <div style={{ marginTop: '16px', padding: '12px 16px', background: '#f8f8f8', borderRadius: '6px', fontSize: '0.9rem', color: '#111', border: '1px solid #e5e5e5' }}>
                                <strong>Expected Ranges:</strong> {movement.expectedRanges}
                            </div>
                        </div>
                    )}

                    {/* Speed Test Instructions */}
                    {activeTab === 'speed' && !isRecording && (
                        <div style={{ 
                            padding: '24px', 
                            background: '#fff', 
                            border: '1px solid #e5e5e5',
                            borderRadius: '8px',
                            marginBottom: '20px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.02)'
                        }}>
                            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', fontWeight: 600, color: '#111' }}>
                                Instructions for {movement.title} Speed
                            </h3>
                            {!romCompleted && (
                                <div style={{ 
                                    padding: '12px 16px', 
                                    background: '#fef2f2', 
                                    border: '1px solid #fca5a5',
                                    borderRadius: '6px', 
                                    marginBottom: '16px',
                                    fontSize: '0.9rem', 
                                    color: '#991b1b' 
                                }}>
                                    <strong>ROM required:</strong> Complete the ROM test first before the speed test.
                                </div>
                            )}
                            <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '0.95rem', color: '#333', lineHeight: '1.6' }}>
                                {movement.speedInstructions.map((step, i) => (
                                    <li key={i} style={{ marginBottom: i < movement.speedInstructions.length - 1 ? '8px' : 0 }}>
                                        {step}
                                    </li>
                                ))}
                                <li style={{ marginTop: '8px' }}>
                                    Primary score = <strong>best peak angular velocity (°/s)</strong> of the three attempts
                                </li>
                            </ol>
                            <div style={{ marginTop: '16px', padding: '12px 16px', background: '#f0fdf4', borderRadius: '6px', fontSize: '0.9rem', color: '#166534', border: '1px solid #86efac' }}>
                                {movement.speedTips}
                            </div>
                        </div>
                    )}

                    {/* Stability Test Instructions */}
                    {activeTab === 'stability' && !isRecording && (
                        <div style={{ 
                            padding: '24px', 
                            background: '#fff', 
                            border: '1px solid #e5e5e5',
                            borderRadius: '8px',
                            marginBottom: '20px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.02)'
                        }}>
                            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', fontWeight: 600, color: '#111' }}>
                                Instructions for {movement.title} Stability
                            </h3>
                            {!romCompleted && (
                                <div style={{ 
                                    padding: '12px 16px', 
                                    background: '#fef2f2', 
                                    border: '1px solid #fca5a5',
                                    borderRadius: '6px', 
                                    marginBottom: '16px',
                                    fontSize: '0.9rem', 
                                    color: '#991b1b' 
                                }}>
                                    <strong>ROM required:</strong> Complete the ROM test first before the stability test.
                                </div>
                            )}
                            <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '0.95rem', color: '#333', lineHeight: '1.6' }}>
                                {movement.stabilityInstructions.map((step, i) => (
                                    <li key={i} style={{ marginBottom: i < movement.stabilityInstructions.length - 1 ? '8px' : 0 }}>
                                        {step}
                                    </li>
                                ))}
                            </ol>
                        </div>
                    )}

                    <SideToggle value={side} onChange={setSide} disabled={isRecording} />

                    <div className="tabs-container">
                        <button className={`tab-btn ${activeTab === 'rom' ? 'active' : ''}`} onClick={() => setActiveTab('rom')}>ROM</button>
                        <button className={`tab-btn ${activeTab === 'stability' ? 'active' : ''}`} onClick={() => setActiveTab('stability')}>Stability</button>
                        <button className={`tab-btn ${activeTab === 'speed' ? 'active' : ''}`} onClick={() => setActiveTab('speed')}>Speed</button>
                    </div>

                    <div className="iot-space-container">
                        <div className="iot-header" style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', padding: '16px' }}>
                            <button className={`btn-primary start-btn ${isRecording ? 'recording' : ''}`} onClick={toggleRecording}>
                                {isRecording ? <Square size={16} /> : <Play size={16} />}
                                <span style={{ marginLeft: '8px' }}>{isRecording ? 'Stop Recording' : 'Start Recording'}</span>
                            </button>
                            <IMUVisualizer />
                        </div>

                        {activeTab === 'rom' && romCompleted && !isRecording && <RecordedBadge />}
                        {activeTab === 'speed' && speedCompleted && <RecordedBadge />}
                        {activeTab === 'stability' && stabilityCompleted && <RecordedBadge />}

                        {/* Speed Test Status Display */}
                        {activeTab === 'speed' && isRecording && chartData && (() => {
                            const phase = chartData.speedPhase || 'countdown';
                            const attempt = chartData.speedAttempt || 1;
                            const total = chartData.speedAttemptTotal || 3;
                            const phaseLabel =
                                phase === 'countdown' ? 'COUNTDOWN' :
                                phase === 'ready' ? 'READY' :
                                phase === 'ramp' ? 'RAMP' :
                                phase === 'rest' ? 'REST' : 'DONE';
                            const bg =
                                phase === 'countdown' ? '#fffbeb' :
                                phase === 'ramp' ? '#f0fdf4' :
                                phase === 'rest' ? '#eff6ff' : '#f0f9ff';
                            const border =
                                phase === 'countdown' ? '#fcd34d' :
                                phase === 'ramp' ? '#86efac' :
                                phase === 'rest' ? '#93c5fd' : '#93c5fd';
                            return (
                            <div style={{
                                padding: '12px 16px',
                                background: bg,
                                border: `1px solid ${border}`,
                                borderRadius: '8px',
                                margin: '0 16px 16px 16px',
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <div style={{ fontWeight: 600, fontSize: '1rem', color: '#111' }}>
                                        Attempt {attempt}/{total}
                                    </div>
                                    <div style={{
                                        padding: '4px 8px',
                                        borderRadius: '12px',
                                        fontSize: '0.8rem',
                                        fontWeight: 600,
                                        backgroundColor: phase === 'ramp' ? '#22c55e' : phase === 'countdown' ? '#f59e0b' : '#3b82f6',
                                        color: 'white'
                                    }}>
                                        {phaseLabel}
                                    </div>
                                </div>

                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-around',
                                    marginBottom: '12px',
                                    padding: '8px',
                                    background: 'rgba(255,255,255,0.5)',
                                    borderRadius: '6px'
                                }}>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#0ea5e9' }}>
                                            {(chartData.speedCurrentRampPeak ?? 0).toFixed(0)}
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>LIVE °/s</div>
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#059669' }}>
                                            {chartData.currentAngle?.toFixed(0) || 0}°
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>ANGLE</div>
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#6366f1' }}>
                                            {(chartData.speedAttemptPeaks || []).length}
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>DONE</div>
                                    </div>
                                </div>

                                {phase === 'countdown' && (
                                    <div style={{ marginBottom: '8px', textAlign: 'center' }}>
                                        <div style={{ fontSize: '3rem', fontWeight: 'bold', color: '#dc2626', marginBottom: '4px' }}>
                                            {Math.ceil(Math.max(0, 3 - (chartData.speedProgress ? chartData.speedProgress * 3 : 0)))}
                                        </div>
                                        <div style={{ fontSize: '0.9rem', fontWeight: 500, color: '#92400e' }}>
                                            Keep arm DOWN — get ready!
                                        </div>
                                    </div>
                                )}
                                {phase === 'ready' && (
                                    <div style={{ textAlign: 'center', marginBottom: '8px', fontWeight: 500, color: '#166534' }}>
                                        Raise your arm as fast as possible now
                                    </div>
                                )}
                                {phase === 'ramp' && (
                                    <div style={{ textAlign: 'center', marginBottom: '8px', fontWeight: 500, color: '#166534' }}>
                                        Keep going — then return arm down
                                    </div>
                                )}
                                {phase === 'rest' && (
                                    <div style={{ textAlign: 'center', marginBottom: '8px', fontWeight: 500, color: '#1e40af' }}>
                                        Rest at base — next attempt unlocking…
                                    </div>
                                )}

                                {(chartData.speedAttemptPeaks || []).length > 0 && (
                                    <div style={{ fontSize: '0.85rem', color: '#374151', marginBottom: '8px' }}>
                                        Peaks so far: {(chartData.speedAttemptPeaks || []).map((p, i) => `${i + 1}: ${p.toFixed(1)}`).join(' · ')} °/s
                                    </div>
                                )}

                                <div style={{
                                    width: '100%',
                                    height: '8px',
                                    backgroundColor: '#e5e5e5',
                                    borderRadius: '4px',
                                    overflow: 'hidden'
                                }}>
                                    <div style={{
                                        width: `${(chartData.speedProgress || 0) * 100}%`,
                                        height: '100%',
                                        backgroundColor: phase === 'countdown' ? '#f59e0b' : '#22c55e',
                                        borderRadius: '4px',
                                        transition: 'width 0.2s ease-out'
                                    }} />
                                </div>
                            </div>
                            );
                        })()}

                        {/* Stability Test Status Display */}
                        {activeTab === 'stability' && isRecording && chartData && (
                            <div style={{ 
                                padding: '12px 16px', 
                                background: '#f0f9ff', 
                                border: '1px solid #93c5fd',
                                borderRadius: '8px',
                                margin: '0 16px 16px 16px',
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1e40af' }}>
                                        Position {chartData.currentPhase ? chartData.currentPhase + 1 : 1}/{(chartData as { targetAngles?: number[] }).targetAngles?.length || movement?.stabilityFallbackTargets?.length || 4}
                                    </div>
                                    <div style={{ 
                                        width: '12px', 
                                        height: '12px', 
                                        borderRadius: '50%', 
                                        backgroundColor: chartData.inTargetZone ? '#22c55e' : '#f59e0b'
                                    }} />
                                </div>
                                <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '8px' }}>
                                    Target: {chartData.targetAngle?.toFixed(0)}° | Current: {chartData.currentAngle?.toFixed(1)}°
                                </div>
                                
                                {/* Countdown Timer */}
                                {(chartData.inTargetZone || chartData.zoneStatus === 'countdown') && (
                                    <div style={{ marginBottom: '8px', textAlign: 'center' }}>
                                        {chartData.zoneStatus === 'countdown' ? (
                                            <div style={{ 
                                                fontSize: '2rem', 
                                                fontWeight: 'bold', 
                                                color: '#dc2626',
                                                animation: 'blink 1s infinite',
                                                marginBottom: '4px'
                                            }}>
                                                {Math.ceil(Math.max(0, 5 - (chartData.progress ? chartData.progress * 5 : 0)))}
                                            </div>
                                        ) : (
                                            <div style={{ 
                                                fontSize: '1.5rem', 
                                                fontWeight: 'bold', 
                                                color: '#22c55e',
                                                marginBottom: '4px'
                                            }}>
                                                {Math.ceil(Math.max(0, 5 - (chartData.progress ? chartData.progress * 5 : 0)))}
                                            </div>
                                        )}
                                        <div style={{ fontSize: '0.8rem', color: '#374151' }}>
                                            {chartData.zoneStatus === 'countdown' ? 
                                                'Get Ready!' : 
                                                'Hold Steady!'
                                            }
                                        </div>
                                    </div>
                                )}
                                
                                <div style={{ fontSize: '0.8rem', color: '#374151' }}>
                                    Status: {chartData.zoneStatus === 'target' ? '✅ In Target Zone' : 
                                            chartData.zoneStatus === 'countdown' ? '⏰ Get Ready to Hold' :
                                            chartData.zoneStatus === 'holding' ? '💪 Holding Steady' :
                                            chartData.zoneStatus === 'approaching' ? '🎯 Approaching Target' : '📍 Move to Target Angle'}
                                </div>
                            </div>
                        )}

                        {/* Speed Test — raw metrics */}
                        {activeTab === 'speed' && chartData && chartData.speedTestComplete && (
                            <div style={{
                                padding: '16px',
                                background: '#fff',
                                border: '1px solid #e5e5e5',
                                borderRadius: '8px',
                                margin: '0 16px 16px 16px',
                            }}>
                                <h4 style={{ margin: '0 0 12px 0', fontSize: '1rem', fontWeight: 600, color: '#111' }}>
                                    Speed Test — Recorded
                                </h4>
                                <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                                    <div>
                                        <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>Best peak (°/s)</div>
                                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111' }}>
                                            {(chartData.bestPeakAngularVelocity ?? chartData.peakAngularVelocity ?? 0).toFixed(1)}
                                        </div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>Average (°/s)</div>
                                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111' }}>
                                            {(chartData.avgPeakAngularVelocity ?? 0).toFixed(1)}
                                        </div>
                                    </div>
                                </div>
                                {(chartData.speedAttemptPeaks || []).length > 0 && (
                                    <div style={{ marginTop: '12px', fontSize: '0.9rem', color: '#374151' }}>
                                        Attempts:{' '}
                                        {(chartData.speedAttemptPeaks || []).map((p, i) => (
                                            <span key={i} style={{ marginRight: '12px' }}>
                                                #{i + 1}: <strong>{p.toFixed(1)}</strong> °/s
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Stability Test — raw metrics */}
                        {activeTab === 'stability' && chartData && chartData.testComplete && chartData.results && (
                            <div style={{
                                padding: '16px',
                                background: '#fff',
                                border: '1px solid #e5e5e5',
                                borderRadius: '8px',
                                margin: '0 16px 16px 16px',
                            }}>
                                <h4 style={{ margin: '0 0 12px 0', fontSize: '1rem', fontWeight: 600, color: '#111' }}>
                                    Stability Test — Recorded
                                </h4>
                                {Object.entries(chartData.results).map(([phase, result]) => (
                                    <div key={phase} style={{
                                        padding: '8px 12px',
                                        background: '#f9fafb',
                                        borderRadius: '6px',
                                        marginBottom: '8px',
                                        fontSize: '0.9rem',
                                        color: '#374151',
                                    }}>
                                        <strong>{result.target_angle}°</strong> — Std dev {result.std_deviation.toFixed(2)}°, range {result.range.toFixed(2)}°
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="iot-canvas" style={{ flex: 1, position: 'relative', borderTop: '1px solid #e5e5e5', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', padding: '16px', minHeight: '400px' }}>
                            {renderChart()}
                        </div>
                    </div>

                    <div className="submit-section" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                        <button 
                            className="btn-primary" 
                            style={{ 
                                display: 'inline-flex', 
                                width: 'auto', 
                                padding: '14px 32px', 
                                gap: '8px',
                                backgroundColor: (romCompleted && stabilityCompleted && speedCompleted) ? '#111' : '#f9fafb',
                                color: (romCompleted && stabilityCompleted && speedCompleted) ? '#fff' : '#9ca3af',
                                border: (romCompleted && stabilityCompleted && speedCompleted) ? '1px solid #111' : '1px dashed #d1d5db',
                                cursor: (romCompleted && stabilityCompleted && speedCompleted) && !isSubmitting ? 'pointer' : 'not-allowed',
                                transition: 'all 0.2s ease-in-out'
                            }}
                            onClick={handleSubmit}
                            disabled={!(romCompleted && stabilityCompleted && speedCompleted) || isSubmitting}
                        >
                            {isSubmitting ? <Loader2 size={16} className="btn-loader" style={{ animation: 'spin 1s linear infinite' }} /> : (
                                <>
                                    <span>Submit Results</span>
                                    <Send size={16} />
                                </>
                            )}
                        </button>
                    </div>
        </TestPageLayout>
    );
}
