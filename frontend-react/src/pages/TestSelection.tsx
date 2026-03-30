import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Activity, Compass, Wind, RotateCw, Settings } from 'lucide-react';

const ARM_TESTS = [
    { id: 'abduction-adduction', name: 'Abduction and Adduction', desc: 'Assess the range of lateral arm movement away from and towards the body.', icon: Activity },
    { id: 'flexion-extension', name: 'Flexion and Extension', desc: 'Measure the upward and backward swing of the arm to evaluate shoulder mobility.', icon: Compass },
    { id: 'internal-rotation', name: 'Internal Rotation', desc: 'Evaluate the inward rotation of the shoulder joint towards the body.', icon: RotateCw },
    { id: 'external-rotation', name: 'External Rotation', desc: 'Evaluate the outward rotation of the shoulder joint away from the body.', icon: Wind },
    { id: 'horizontal-abduction-adduction', name: 'Horizontal Abduction and Adduction', desc: 'Measure arm movement across the body and away from it at shoulder level.', icon: Settings },
];

export default function TestSelection() {
    const navigate = useNavigate();

    return (
        <div className="page-container">
            <header className="page-header">
                <button onClick={() => navigate('/')} className="btn-icon">
                    <ArrowLeft size={20} />
                    <span>Back</span>
                </button>
                <h1 className="page-title">Select a Test</h1>
                <p className="page-subtitle">Choose from the available functional and mobility evaluations below.</p>
            </header>
            
            <section className="test-category-section">
                <h2 style={{ fontSize: '1.5rem', marginBottom: '24px', borderBottom: '1px solid #e5e5e5', paddingBottom: '12px', color: '#111' }}>ARM</h2>
                <div className="test-grid">
                    {ARM_TESTS.map(test => {
                        const Icon = test.icon;
                        return (
                            <button key={test.id} className="test-square" onClick={() => navigate(`/test/${test.id}`)}>
                                <div className="test-icon-wrapper">
                                    <Icon size={32} />
                                </div>
                                <h3>{test.name}</h3>
                                <p>{test.desc}</p>
                            </button>
                        );
                    })}
                </div>
            </section>
        </div>
    );
}
