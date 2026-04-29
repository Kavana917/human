import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileBarChart } from 'lucide-react';

export default function AnalysisReport() {
    const navigate = useNavigate();

    return (
        <div className="page-container">
            <header className="page-header">
                <button onClick={() => navigate('/dashboard')} className="btn-icon">
                    <ArrowLeft size={20} />
                    <span>Back to Dashboard</span>
                </button>
                <h1 className="page-title">Analysis Report</h1>
                <p className="page-subtitle">Comprehensive analysis of your test performance and progress.</p>
            </header>

            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '80px 32px',
                background: '#fafafa',
                border: '1px dashed #e5e5e5',
                marginTop: '32px',
                gap: '16px',
                color: '#999'
            }}>
                <FileBarChart size={48} strokeWidth={1} />
                <p style={{ fontSize: '1.1rem', fontWeight: 500, color: '#666', margin: 0 }}>
                    Analysis report coming soon.
                </p>
                <p style={{ fontSize: '0.9rem', margin: 0 }}>
                    This page will display detailed insights and trends from your test history.
                </p>
            </div>
        </div>
    );
}
