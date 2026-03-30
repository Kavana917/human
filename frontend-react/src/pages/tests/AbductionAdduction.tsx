import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Square, Send, Loader2 } from 'lucide-react';
import * as THREE from 'three';
import abductionVideo from '../../assets/abduction.mp4';

const IMUVisualizer = () => {
    const mountRef = useRef<HTMLDivElement>(null);
    const [imuData, setImuData] = useState({ pitch: 0, roll: 0, yaw: 0 });

    useEffect(() => {
        if (!mountRef.current) return;

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
            } catch (err) {
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
            if (mountRef.current && renderer.domElement) {
                mountRef.current.removeChild(renderer.domElement);
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

export default function AbductionAdduction() {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('rom');
    const [isRecording, setIsRecording] = useState(false);
    const [plotUrl, setPlotUrl] = useState('');

    const handleBack = () => {
        navigate('/tests');
    };

    const toggleRecording = async () => {
        const newState = !isRecording;
        setIsRecording(newState);
        try {
            await fetch(`http://localhost:5001/toggle_recording/${activeTab}/${newState ? 'start' : 'stop'}`);
        } catch (e) {
            console.error("Failed to toggle backend recording", e);
        }
    };

    useEffect(() => {
        let interval: any;
        if (isRecording) {
            interval = setInterval(() => {
                setPlotUrl(`http://localhost:5001/plot/${activeTab}?t=${Date.now()}`);
            }, 1000); // 1 FPS refresh for matplotlib live graph frame
        }
        return () => clearInterval(interval);
    }, [isRecording, activeTab]);

    useEffect(() => {
        // Fetch static graph snapshot whenever active tab changes, regardless of recording state
        setPlotUrl(`http://localhost:5001/plot/${activeTab}?t=${Date.now()}`);
    }, [activeTab]);

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
                        className="demo-video-player"
                    />
                </div>

                {/* Right side: Test Area */}
                <div className="test-area-section">
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

                        <div className="iot-canvas" style={{ flex: 1, position: 'relative', borderTop: '1px solid #e5e5e5', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', padding: '16px' }}>
                            {plotUrl ? (
                                <img src={plotUrl} alt={`Matplotlib ${activeTab} Graph`} style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} onLoad={(e) => { e.currentTarget.style.display = 'block'; }} />
                            ) : (
                                <Loader2 className="btn-loader" size={48} color="#ccc" />
                            )}
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
