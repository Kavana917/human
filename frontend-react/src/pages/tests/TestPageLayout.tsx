import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

interface TestPageLayoutProps {
  title: string;
  videoSrc?: string;
  children: ReactNode;
}

export default function TestPageLayout({ title, videoSrc, children }: TestPageLayoutProps) {
  const navigate = useNavigate();

  return (
    <div className="page-container" style={{ maxWidth: '1400px', margin: '0 auto', padding: '48px 24px' }}>
      <header className="page-header" style={{ marginBottom: '32px' }}>
        <button onClick={() => navigate('/tests')} className="btn-icon">
          <ArrowLeft size={20} />
          <span>Back to Tests</span>
        </button>
        <div style={{ marginTop: '16px' }}>
          <h1 className="page-title" style={{ margin: 0 }}>{title}</h1>
        </div>
      </header>

      <div className="test-layout-grid">
        <div className="video-section">
          <h2 style={{ fontSize: '1.2rem', marginBottom: '16px', fontWeight: 500, borderBottom: '1px solid #e5e5e5', paddingBottom: '12px' }}>Demo Video</h2>
          {videoSrc ? (
            <video
              src={videoSrc}
              controls
              autoPlay
              loop
              muted
              className="demo-video-player"
              style={{ borderRadius: '8px' }}
            />
          ) : (
            <div className="demo-video-player" style={{ borderRadius: '8px', border: '1px dashed #d1d5db', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontSize: '0.95rem' }}>
              Demo video coming soon
            </div>
          )}
        </div>

        <div className="test-area-section">{children}</div>
      </div>
    </div>
  );
}
