import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, OrbitControls } from '@react-three/drei';
import type { Group } from 'three';

const MODEL_PATH = '/models/scene.gltf';

function RotatingModel() {
    const groupRef = useRef<Group>(null);
    const { scene } = useGLTF(MODEL_PATH);

    useFrame((_state, delta) => {
        if (groupRef.current) {
            groupRef.current.rotation.y += delta * 0.3;
        }
    });

    return (
        <group ref={groupRef} scale={1.0} position={[0, -1.8, 0]}>
            <primitive object={scene} />
        </group>
    );
}

export default function HeroModel() {
    return (
        <div className="hero-model-container">
            <Canvas
                camera={{ position: [0, 0.8, 4.8], fov: 45 }}
                style={{ width: '100%', height: '100%' }}
                gl={{
                    antialias: true,
                    powerPreference: 'default',
                    failIfMajorPerformanceCaveat: false,
                }}
                dpr={[1, 1.5]}
                frameloop="always"
            >
                <ambientLight intensity={0.8} />
                <directionalLight position={[5, 5, 5]} intensity={1.5} />
                <directionalLight position={[-3, 3, -3]} intensity={0.5} />
                <hemisphereLight
                    color="#ffffff"
                    groundColor="#444444"
                    intensity={0.6}
                />
                <RotatingModel />
                <OrbitControls
                    enableZoom={false}
                    enablePan={false}
                    autoRotate={false}
                    maxPolarAngle={Math.PI / 1.8}
                    minPolarAngle={Math.PI / 3}
                />
            </Canvas>
        </div>
    );
}

useGLTF.preload(MODEL_PATH);
