import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Square, Send } from 'lucide-react';
import * as THREE from 'three';
import abductionVideo from '../../assets/abduction.mp4';
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
    assessment?: string;
    assessmentColor?: string;
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
}

export default function AbductionAdduction() {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('rom');
    const [isRecording, setIsRecording] = useState(false);
    const [chartData, setChartData] = useState<ChartData | null>(null);
    const [romCompleted, setRomCompleted] = useState(false);

    const handleBack = () => {
        navigate('/tests');
    };

    const toggleRecording = async () => {
        // Prevent stability test without ROM data
        if (activeTab === 'stability' && !romCompleted) {
            alert('Please complete the ROM test first before doing the stability test.');
            return;
        }
        const newState = !isRecording;
        setIsRecording(newState);
        try {
            await fetch(`http://localhost:5001/toggle_recording/${activeTab}/${newState ? 'start' : 'stop'}`);
        } catch (e) {
            console.error("Failed to toggle backend recording", e);
        }
    };

    const fetchChartData = useCallback(async () => {
        try {
            const res = await fetch(`http://localhost:5001/data/${activeTab}?t=${Date.now()}`);
            if (res.ok) {
                const data = await res.json();
                setChartData(data);
                
                // Track ROM completion
                if (activeTab === 'rom' && data.status === 'ok' && data.maxRoll) {
                    setRomCompleted(true);
                }
            }
        } catch (e) {
            console.error("Failed to fetch graph data", e);
        }
    }, [activeTab]);

    useEffect(() => {
        let interval: number;
        if (isRecording) {
            interval = setInterval(fetchChartData, 200);
        }
        return () => clearInterval(interval);
    }, [isRecording, activeTab, fetchChartData]);

    useEffect(() => {
        const controller = new AbortController();
        const fetchInitialData = async () => {
            try {
                const res = await fetch(`http://localhost:5001/data/${activeTab}?t=${Date.now()}`, {
                    signal: controller.signal
                });
                if (res.ok) {
                    const data = await res.json();
                    setChartData(data);
                }
            } catch (e: unknown) {
                if (e instanceof Error && e.name !== 'AbortError') {
                    console.error("Failed to fetch initial graph data", e);
                }
            }
        };
        fetchInitialData();
        
        return () => controller.abort();
    }, [activeTab]);

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
                        annotations: {
                            shoulderLevel: {
                                type: 'line' as const,
                                yMin: 90,
                                yMax: 90,
                                borderColor: 'orange',
                                borderWidth: 2,
                                borderDash: [5, 5],
                                label: {
                                    content: 'Shoulder Level (90°)',
                                    display: true,
                                    position: 'end',
                                    backgroundColor: 'orange',
                                    font: { size: 10 }
                                }
                            },
                            fullAbduction: {
                                type: 'line' as const,
                                yMin: 150,
                                yMax: 150,
                                borderColor: 'red',
                                borderWidth: 2,
                                borderDash: [5, 5],
                                label: {
                                    content: 'Full Abduction (150°)',
                                    display: true,
                                    position: 'end',
                                    backgroundColor: 'red',
                                    font: { size: 10 }
                                }
                            },
                            maximum: {
                                type: 'line' as const,
                                yMin: 180,
                                yMax: 180,
                                borderColor: 'darkred',
                                borderWidth: 2,
                                borderDash: [5, 5],
                                label: {
                                    content: 'Maximum (180°)',
                                    display: true,
                                    position: 'end',
                                    backgroundColor: 'darkred',
                                    font: { size: 10 }
                                }
                            }
                        }
                    }
                },
                scales: {
                    y: { 
                        title: { display: true, text: 'Relative Angle (degrees)' },
                        min: 0,
                        max: 200
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
            const targetAngles = [45, 90, 135, chartData.romMaxAngle || 150];
            
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
                        text: `Stability Test: Position ${chartData.currentPhase ? chartData.currentPhase + 1 : 1}/4`, 
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
            const data = {
                labels: chartData.bins || [],
                datasets: [
                    {
                        label: 'Reps',
                        data: chartData.reps || [],
                        backgroundColor: 'rgba(147, 112, 219, 0.8)',
                        borderColor: 'mediumpurple',
                        borderWidth: 1
                    }
                ]
            };

            const options = {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: "Speed: Reps per unit time (3s bins)", font: { size: 14 } },
                    legend: { display: false }
                },
                scales: {
                    y: { title: { display: true, text: 'Reps' }, beginAtZero: true, ticks: { stepSize: 1 } },
                    x: { title: { display: true, text: 'Time Window' } }
                }
            };
            return <Bar data={data} options={options} />;
        }
        return null;
    };

    return (
        <div className="page-container" style={{ maxWidth: '1400px', margin: '0 auto', padding: '48px 24px' }}>
            <header className="page-header" style={{ marginBottom: '32px' }}>
                <button onClick={handleBack} className="btn-icon">
                    <ArrowLeft size={20} />
                    <span>Back to Tests</span>
                </button>
                <div style={{ marginTop: '16px' }}>
                    <h1 className="page-title" style={{ margin: 0 }}>Abduction & Adduction</h1>
                </div>
            </header>

            <div className="test-layout-grid">
                {/* Left side: Demo Video */}
                <div className="video-section">
                    <h2 style={{ fontSize: '1.2rem', marginBottom: '16px', fontWeight: 500, borderBottom: '1px solid #e5e5e5', paddingBottom: '12px' }}>Demo Video</h2>
                    <video 
                        src={abductionVideo} 
                        controls 
                        autoPlay 
                        loop 
                        muted 
                        style={{ width: '100%', borderRadius: '8px' }}
                    />
                </div>

                {/* Right side: Test Area */}
                <div className="test-area-section">
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
                                📋 Instructions for ROM Test
                            </h3>
                            <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '0.95rem', color: '#333', lineHeight: '1.6' }}>
                                <li style={{ marginBottom: '8px' }}>Position your arm down at your side (starting position)</li>
                                <li style={{ marginBottom: '8px' }}>Click "Start Recording" to calibrate baseline</li>
                                <li style={{ marginBottom: '8px' }}>Slowly raise your arm upward as far as comfortable</li>
                                <li style={{ marginBottom: '8px' }}>Hold briefly at maximum position, then lower arm</li>
                                <li>Click "Stop Recording" when complete</li>
                            </ol>
                            <div style={{ marginTop: '16px', padding: '12px 16px', background: '#f8f8f8', borderRadius: '6px', fontSize: '0.9rem', color: '#111', border: '1px solid #e5e5e5' }}>
                                <strong>Expected Ranges:</strong> Shoulder Level (~90°) | Full Abduction (150-180°)
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
                                📋 Instructions for Stability Test
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
                                    <strong>⚠️ ROM Test Required:</strong> Please complete the ROM test first before attempting the stability test.
                                </div>
                            )}
                            <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '0.95rem', color: '#333', lineHeight: '1.6' }}>
                                <li style={{ marginBottom: '8px' }}>Click "Start Recording" to begin the 4-point stability test</li>
                                <li style={{ marginBottom: '8px' }}>Raise your arm to 45° and hold steady when prompted (3 seconds)</li>
                                <li style={{ marginBottom: '8px' }}>Move to 90° and hold steady when prompted (3 seconds)</li>
                                <li style={{ marginBottom: '8px' }}>Move to 135° and hold steady when prompted (3 seconds)</li>
                                <li style={{ marginBottom: '8px' }}>Move to your maximum angle and hold steady when prompted (3 seconds)</li>
                                <li>Test will complete automatically after all 4 positions</li>
                            </ol>
                            <div style={{ marginTop: '16px', padding: '12px 16px', background: '#f8f8f8', borderRadius: '6px', fontSize: '0.9rem', color: '#111', border: '1px solid #e5e5e5' }}>
                                <strong>Stability Metrics:</strong> {'<1° (Very Stable) | 1-3° (Stable) | >3° (Unstable)'}
                            </div>
                        </div>
                    )}

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

                        {/* ROM Assessment Display */}
                        {activeTab === 'rom' && chartData && chartData.status !== 'empty' && chartData.baselineSet && (
                            <div style={{ 
                                padding: '12px 16px', 
                                background: chartData.assessmentColor === 'green' ? '#f0fdf4' : 
                                          chartData.assessmentColor === 'orange' ? '#fffbeb' : '#fef2f2',
                                border: `1px solid ${chartData.assessmentColor === 'green' ? '#86efac' : 
                                                   chartData.assessmentColor === 'orange' ? '#fcd34d' : '#fca5a5'}`,
                                borderRadius: '8px',
                                margin: '0 16px 16px 16px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                            }}>
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: chartData.assessmentColor === 'green' ? '#166534' : 
                                                                                        chartData.assessmentColor === 'orange' ? '#92400e' : '#991b1b' }}>
                                        Assessment: {chartData.assessment}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '2px' }}>
                                        Max Angle: {chartData.maxRoll?.toFixed(1)}° | Baseline: {chartData.baseline?.toFixed(1)}°
                                    </div>
                                </div>
                                <div style={{ 
                                    width: '12px', 
                                    height: '12px', 
                                    borderRadius: '50%', 
                                    backgroundColor: chartData.assessmentColor 
                                }} />
                            </div>
                        )}

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
                                        Position {chartData.currentPhase ? chartData.currentPhase + 1 : 1}/4
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
                                
                                {/* Progress Bar */}
                                {(chartData.inTargetZone || chartData.zoneStatus === 'countdown') && (
                                    <div style={{ marginBottom: '8px' }}>
                                        <div style={{ fontSize: '0.8rem', color: '#374151', marginBottom: '4px' }}>
                                            {chartData.zoneStatus === 'countdown' ? 
                                                `Get Ready! ${(Math.max(0, 3 - (chartData.progress ? chartData.progress * 3 : 0))).toFixed(1)}s until hold starts` :
                                                `Hold Steady! ${(Math.max(0, 5 - (chartData.progress ? chartData.progress * 5 : 0))).toFixed(1)}s remaining`
                                            }
                                        </div>
                                        <div style={{ 
                                            width: '100%', 
                                            height: '8px', 
                                            backgroundColor: '#e5e7eb', 
                                            borderRadius: '4px',
                                            overflow: 'hidden'
                                        }}>
                                            <div style={{ 
                                                width: `${(chartData.progress || 0) * 100}%`, 
                                                height: '100%', 
                                                backgroundColor: '#22c55e',
                                                transition: 'width 0.3s ease'
                                            }} />
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

                        {/* Stability Test Results */}
                        {activeTab === 'stability' && chartData && chartData.testComplete && chartData.results && (
                            <div style={{ 
                                padding: '16px', 
                                background: '#fff', 
                                border: '1px solid #e5e5e5',
                                borderRadius: '8px',
                                margin: '0 16px 16px 16px',
                            }}>
                                <h4 style={{ margin: '0 0 12px 0', fontSize: '1rem', fontWeight: 600, color: '#111' }}>
                                    🎯 Stability Test Results
                                </h4>
                                {Object.entries(chartData.results).map(([phase, result]) => (
                                    <div key={phase} style={{ 
                                        padding: '8px 12px', 
                                        background: '#f9fafb', 
                                        borderRadius: '6px', 
                                        marginBottom: '8px',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}>
                                        <div>
                                            <div style={{ fontWeight: 500, fontSize: '0.9rem', color: '#111' }}>
                                                {result.target_angle}° Position
                                            </div>
                                            <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                                                Std Dev: {result.std_deviation.toFixed(2)}° | Range: {result.range.toFixed(2)}°
                                            </div>
                                        </div>
                                        <div style={{ 
                                            padding: '4px 8px', 
                                            borderRadius: '4px', 
                                            fontSize: '0.75rem', 
                                            fontWeight: 600,
                                            backgroundColor: result.std_deviation < 1 ? '#dcfce7' : 
                                                             result.std_deviation <= 3 ? '#fef3c7' : '#fee2e2',
                                            color: result.std_deviation < 1 ? '#166534' : 
                                                  result.std_deviation <= 3 ? '#92400e' : '#991b1b'
                                        }}>
                                            {result.std_deviation < 1 ? 'Very Stable' : 
                                             result.std_deviation <= 3 ? 'Stable' : 'Unstable'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="iot-canvas" style={{ flex: 1, position: 'relative', borderTop: '1px solid #e5e5e5', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', padding: '16px', minHeight: '400px' }}>
                            {renderChart()}
                        </div>
                    </div>

                    <div className="submit-section" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                        <button className="btn-primary" style={{ display: 'inline-flex', width: 'auto', padding: '14px 32px', gap: '8px' }}>
                            <span>Submit Results</span>
                            <Send size={16} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
