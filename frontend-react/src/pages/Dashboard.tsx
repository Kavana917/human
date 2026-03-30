import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';

export default function Dashboard() {
    const navigate = useNavigate();
    const mountRef = useRef<HTMLDivElement>(null);
    const [acc, setAcc] = useState({ x: 0, y: 0, z: 0 });
    const [gyro, setGyro] = useState({ x: 0, y: 0, z: 0 });
    const [pitch, setPitch] = useState(0);
    const [roll, setRoll] = useState(0);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigate('/login');
    };

    useEffect(() => {
        let isMounted = true;

        // Check onboarding completion just in case
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (user) {
                supabase.from('profiles').select('onboarding_complete').eq('id', user.id).single()
                    .then(({ data }) => {
                        if (isMounted && (!data || !data.onboarding_complete)) {
                            navigate('/onboarding');
                        }
                    });
            }
        });

        // 3D Scene Code
        if (!mountRef.current) return;
        const currentRef = mountRef.current;

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        
        renderer.setSize(window.innerWidth, window.innerHeight);
        currentRef.appendChild(renderer.domElement);

        const geometry = new THREE.BoxGeometry(3.5, 0.4, 2);
        const materials = [
            new THREE.MeshBasicMaterial({color: 0xff0000}), 
            new THREE.MeshBasicMaterial({color: 0xff8800}), 
            new THREE.MeshBasicMaterial({color: 0x0000ff}), 
            new THREE.MeshBasicMaterial({color: 0x555555}), 
            new THREE.MeshBasicMaterial({color: 0x00ff00}), 
            new THREE.MeshBasicMaterial({color: 0x0088ff})  
        ];
        const board = new THREE.Mesh(geometry, materials);
        scene.add(board);
        camera.position.z = 6;

        let reqId: number;

        const animate = async () => {
            if (!isMounted) return;
            reqId = requestAnimationFrame(animate);

            try {
                const response = await fetch('http://localhost:7777/data');
                if (response.ok) {
                    const data = await response.json();
                    
                    board.rotation.x = data.pitch;
                    board.rotation.z = -data.roll;

                    setAcc({ x: data.ax, y: data.ay, z: data.az });
                    setGyro({ x: data.gx, y: data.gy, z: data.gz });
                    setPitch(data.pitch);
                    setRoll(data.roll);
                }
            } catch (err) {
                // Ignore fetch errors to avoid spamming console when server is down
            }

            renderer.render(scene, camera);
        };

        animate();

        const handleResize = () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        };
        window.addEventListener('resize', handleResize);

        return () => {
            isMounted = false;
            cancelAnimationFrame(reqId);
            window.removeEventListener('resize', handleResize);
            if (currentRef) {
                currentRef.removeChild(renderer.domElement);
            }
            geometry.dispose();
            renderer.dispose();
        };
    }, [navigate]);

    return (
        <div className="dashboard-container">
            <div className="dashboard-ui">
                <h2>IMU LIVE TELEMETRY</h2>
                <div>ACCEL X/Y/Z: <span className="val">{acc.x}, {acc.y}, {acc.z}</span></div>
                <div>GYRO X/Y/Z: <span className="val">{gyro.x}, {gyro.y}, {gyro.z}</span></div>
                <hr />
                <div>PITCH: <span className="val">{(pitch * 180 / Math.PI).toFixed(2)}</span>°</div>
                <div>ROLL: <span className="val">{(roll * 180 / Math.PI).toFixed(2)}</span>°</div>
                <hr />
                <button onClick={handleLogout} className="logout-btn-dash">LOGOUT</button>
            </div>
            
            <div ref={mountRef} style={{ width: '100vw', height: '100vh' }}></div>
        </div>
    );
}
