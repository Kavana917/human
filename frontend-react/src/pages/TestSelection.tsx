import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { ARM_MOVEMENTS } from './tests/testConfigs';

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
                <p className="page-subtitle">
                    Six shoulder movements aligned with the demographic kinematics model. Each test is recorded and compared separately.
                </p>
            </header>
            
            <section className="test-category-section">
                <h2 style={{ fontSize: '1.5rem', marginBottom: '24px', borderBottom: '1px solid #e5e5e5', paddingBottom: '12px', color: '#111' }}>ARM</h2>
                <div className="test-grid">
                    {ARM_MOVEMENTS.map(test => {
                        const Icon = test.icon;
                        return (
                            <button key={test.id} className="test-square" onClick={() => navigate(`/test/${test.id}`)}>
                                <div className="test-icon-wrapper">
                                    <Icon size={32} />
                                </div>
                                <h3>{test.title}</h3>
                                <p>{test.desc}</p>
                            </button>
                        );
                    })}
                </div>
            </section>
        </div>
    );
}
