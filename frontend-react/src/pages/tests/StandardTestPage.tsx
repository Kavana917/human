import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Play, Square, Send } from 'lucide-react';
import TestPageLayout from './TestPageLayout';
import { TEST_LAYOUT_CONFIGS } from './testConfigs';
import SideToggle from '../../components/SideToggle';

const TABS = [
  { id: 'rom', label: 'ROM' },
  { id: 'stability', label: 'Stability' },
  { id: 'speed', label: 'Speed' },
] as const;

export default function StandardTestPage() {
  const navigate = useNavigate();
  const { testId } = useParams();
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]['id']>('rom');
  const [isRecording, setIsRecording] = useState(false);
  const [side, setSide] = useState<'left' | 'right'>('right');

  const config = useMemo(() => {
    if (!testId) return null;
    return TEST_LAYOUT_CONFIGS[testId] ?? null;
  }, [testId]);

  if (!config) {
    return (
      <TestPageLayout title="Unknown Test">
        <div style={{ padding: '24px', border: '1px solid #e5e5e5', borderRadius: '8px', background: '#fff' }}>
          <h3 style={{ marginTop: 0, marginBottom: '12px' }}>Test not found</h3>
          <p style={{ margin: 0, color: '#4b5563' }}>This test id is not configured yet.</p>
          <button className="btn-primary" style={{ marginTop: '16px', width: 'auto', display: 'inline-flex' }} onClick={() => navigate('/tests')}>
            Go back to test selection
          </button>
        </div>
      </TestPageLayout>
    );
  }

  return (
    <TestPageLayout title={config.title} videoSrc={config.videoSrc}>
      <div style={{ padding: '24px', background: '#fff', border: '1px solid #e5e5e5', borderRadius: '8px', marginBottom: '20px', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', fontWeight: 600, color: '#111' }}>Instructions</h3>
        <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '0.95rem', color: '#333', lineHeight: '1.6' }}>
          <li style={{ marginBottom: '8px' }}>Position yourself in frame and keep posture stable.</li>
          <li style={{ marginBottom: '8px' }}>Press Start Recording when you are ready.</li>
          <li style={{ marginBottom: '8px' }}>Perform controlled movement through your available range.</li>
          <li>Press Stop Recording and review results before submitting.</li>
        </ol>
      </div>

      <SideToggle value={side} onChange={setSide} disabled={isRecording} />

      <div className="tabs-container">
        {TABS.map((tab) => (
          <button key={tab.id} className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="iot-space-container">
        <div className="iot-header" style={{ justifyContent: 'space-between' }}>
          <button className={`btn-primary start-btn ${isRecording ? 'recording' : ''}`} onClick={() => setIsRecording((prev) => !prev)}>
            {isRecording ? <Square size={16} /> : <Play size={16} />}
            <span style={{ marginLeft: '8px' }}>{isRecording ? 'Stop Recording' : 'Start Recording'}</span>
          </button>
          <div style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: 600 }}>
            {activeTab.toUpperCase()} mode
          </div>
        </div>

        <div style={{ flex: 1, borderTop: '1px solid #e5e5e5', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', padding: '16px', minHeight: '400px' }}>
          <div style={{ textAlign: 'center', color: '#4b5563' }}>
            <h4 style={{ marginTop: 0, marginBottom: '10px', color: '#111' }}>{config.title}</h4>
            <p style={{ margin: 0 }}>
              Basic layout is ready. Plug in {activeTab.toUpperCase()} visualization and scoring logic here.
            </p>
          </div>
        </div>
      </div>

      <div className="submit-section" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
        <button className="btn-primary" style={{ display: 'inline-flex', width: 'auto', padding: '14px 32px', gap: '8px' }}>
          <span>Submit Results</span>
          <Send size={16} />
        </button>
      </div>
    </TestPageLayout>
  );
}
