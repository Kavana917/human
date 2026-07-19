import { useEffect, useState, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { LogOut, ArrowRight } from 'lucide-react';
import HeroModel from '../components/HeroModel';

export default function Home() {
    const navigate = useNavigate();
    const [name, setName] = useState('User');

    useEffect(() => {
        let isMounted = true;
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (user && isMounted) {
                supabase.from('profiles').select('username').eq('id', user.id).single()
                    .then(({ data }) => {
                        if (data?.username && isMounted) {
                            setName(data.username);
                        }
                    });
            }
        });
        return () => { isMounted = false; };
    }, []);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigate('/login');
    };

    return (
        <div className="landing-container">
            {/* Top Bar */}
            <header className="landing-nav">
                <div className="landing-brand">STRYDE</div>
                <button onClick={handleLogout} className="btn-icon">
                    <LogOut size={16} />
                    <span>Logout</span>
                </button>
            </header>

            {/* HERO / ACTION SECTION */}
            <section className="landing-hero">
                <div className="hero-content">
                    <div className="hero-text">
                        <h1 className="hero-title">Welcome,<br />{name}.</h1>
                        <p className="hero-subtitle">What would you like to do today?</p>

                        <div className="hero-actions">
                            <button className="btn-landing-primary" onClick={() => navigate('/dashboard')}>
                                View Dashboard
                            </button>
                            <button className="btn-landing-secondary" onClick={() => navigate('/tests')}>
                                Start Assessment
                            </button>
                        </div>
                    </div>
                    <div className="hero-model-wrapper">
                        <Suspense fallback={<div className="model-loading">Loading 3D Model...</div>}>
                            <HeroModel />
                        </Suspense>
                    </div>
                </div>
            </section>

            {/* HOW IT WORKS */}
            <section className="landing-section border-top">
                <div className="section-header-huge">
                    <h2 className="section-title-huge">How it works</h2>
                    <span className="section-number">01</span>
                </div>

                <div className="steps-grid">
                    <div className="step-card">
                        <div className="step-num">1</div>
                        <h3>Wear sensor</h3>
                        <p>Attach the IoT ESP32 sensor securely to the required body segment.</p>
                    </div>
                    <div className="step-card">
                        <div className="step-num">2</div>
                        <h3>Perform movement</h3>
                        <p>Follow the on-screen instructions to execute the mobility assessment.</p>
                    </div>
                    <div className="step-card">
                        <div className="step-num">3</div>
                        <h3>AI analyzes</h3>
                        <p>Our algorithms assess your live telemetry for stability and range of motion.</p>
                    </div>
                    <div className="step-card">
                        <div className="step-num">4</div>
                        <h3>Get results</h3>
                        <p>Review comprehensive metrics comparing your performance against baselines.</p>
                    </div>
                </div>
            </section>

            {/* AVAILABLE TESTS */}
            <section className="landing-section border-top">
                <div className="section-header-huge">
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '32px', flexWrap: 'wrap' }}>
                        <h2 className="section-title-huge">Available tests</h2>
                        <button className="btn-landing-primary" onClick={() => navigate('/tests')} style={{ padding: '12px 24px', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            Take Test <ArrowRight size={16} />
                        </button>
                    </div>
                    <span className="section-number">02</span>
                </div>

                <div className="tests-landing-grid">
                    <div className="landing-test-card" style={{ minHeight: 'auto', padding: '32px' }}>
                        <div className="test-card-content">
                            <div className="step-num" style={{ marginBottom: '24px' }}>01</div>
                            <h4>Shoulder</h4>
                            <h3>Abduction</h3>
                            <p>Raise the arm out to the side — coronal plane ROM, stability, and speed.</p>
                        </div>
                    </div>
                    <div className="landing-test-card" style={{ minHeight: 'auto', padding: '32px' }}>
                        <div className="test-card-content">
                            <div className="step-num" style={{ marginBottom: '24px' }}>02</div>
                            <h4>Shoulder</h4>
                            <h3>Adduction</h3>
                            <p>Bring the arm back toward the body — separate from abduction for ML comparison.</p>
                        </div>
                    </div>
                    <div className="landing-test-card" style={{ minHeight: 'auto', padding: '32px' }}>
                        <div className="test-card-content">
                            <div className="step-num" style={{ marginBottom: '24px' }}>03</div>
                            <h4>Shoulder</h4>
                            <h3>Flexion</h3>
                            <p>Raise the arm forward and up — sagittal plane glenohumeral flexion.</p>
                        </div>
                    </div>
                    <div className="landing-test-card" style={{ minHeight: 'auto', padding: '32px' }}>
                        <div className="test-card-content">
                            <div className="step-num" style={{ marginBottom: '24px' }}>04</div>
                            <h4>Shoulder</h4>
                            <h3>Extension</h3>
                            <p>Move the arm backward behind the body — sagittal plane extension.</p>
                        </div>
                    </div>
                    <div className="landing-test-card" style={{ minHeight: 'auto', padding: '32px' }}>
                        <div className="test-card-content">
                            <div className="step-num" style={{ marginBottom: '24px' }}>05</div>
                            <h4>Shoulder</h4>
                            <h3>Internal Rotation</h3>
                            <p>Rotate the upper arm inward — axial yaw toward the body.</p>
                        </div>
                    </div>
                    <div className="landing-test-card" style={{ minHeight: 'auto', padding: '32px' }}>
                        <div className="test-card-content">
                            <div className="step-num" style={{ marginBottom: '24px' }}>06</div>
                            <h4>Shoulder</h4>
                            <h3>External Rotation</h3>
                            <p>Rotate the upper arm outward — axial yaw away from the body.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* ABOUT STRYDE */}
            <section className="landing-section border-top">
                <div className="section-header-huge">
                    <h2 className="section-title-huge">About Stryde</h2>
                    <span className="section-number">03</span>
                </div>
                <div className="about-content">
                    <p className="lead-text">
                        STRYDE is an intelligent system for quantitative analysis of human movement using wearable sensors, Internet of Things (IoT), and Artificial Intelligence (AI).
                    </p>
                    <div className="about-details">
                        <p>
                            It bridges the gap between traditional subjective movement assessment and the need for objective, real-time, and scalable evaluation of functional mobility. Utilizing wearable IMUs, the system captures motion data sent securely to a backend server for processing.
                        </p>
                        <p>
                            Metrics like Range of Motion, Stability, and Speed are computed in real-time, delivering actionable insights for physical therapy, occupational health, and sports performance outside typical laboratory settings.
                        </p>
                    </div>
                </div>
            </section>

            {/* USE CASES */}
            <section className="landing-section border-top">
                <div className="section-header-huge">
                    <h2 className="section-title-huge">Use cases</h2>
                    <span className="section-number">04</span>
                </div>

                <div className="use-cases-grid">
                    <div className="use-case-card">
                        <div className="use-case-index">01</div>
                        <div className="use-case-body">
                            <h3 className="use-case-title">Post-Operative Orthopedic Recovery</h3>
                            <div className="use-case-detail">
                                <span className="use-case-label">Context</span>
                                <p>Following joint replacement or ligament repair (e.g., ACL or rotator cuff surgery), surgeons need to track the return of functional movement.</p>
                            </div>
                            <div className="use-case-detail">
                                <span className="use-case-label">Value</span>
                                <p>Instead of periodic visual checks, the system provides a continuous "30-day report" showing the exact angle of recovery, proving the effectiveness of the surgery.</p>
                            </div>
                        </div>
                    </div>

                    <div className="use-case-card">
                        <div className="use-case-index">02</div>
                        <div className="use-case-body">
                            <h3 className="use-case-title">Military Selection &amp; Physical Readiness</h3>
                            <div className="use-case-detail">
                                <span className="use-case-label">Context</span>
                                <p>Defense organizations require candidates to meet specific physical thresholds for elite roles.</p>
                            </div>
                            <div className="use-case-detail">
                                <span className="use-case-label">Value</span>
                                <p>The system acts as a "Digital Biomarker," filtering for candidates who meet "Ideal Person" benchmarks for range of motion (ROM) and stability under fatigue.</p>
                            </div>
                        </div>
                    </div>

                    <div className="use-case-card">
                        <div className="use-case-index">03</div>
                        <div className="use-case-body">
                            <h3 className="use-case-title">Neurological Rehabilitation</h3>
                            <p className="use-case-subtitle">Stroke &amp; Parkinson's</p>
                            <div className="use-case-detail">
                                <span className="use-case-label">Context</span>
                                <p>Patients with neurological conditions often suffer from tremors or decreased mobility.</p>
                            </div>
                            <div className="use-case-detail">
                                <span className="use-case-label">Value</span>
                                <p>The "Stability Index" measures micro-variations and tremors that are invisible to the human eye, helping neurologists adjust medication or therapy based on objective data.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <footer className="landing-footer border-top">
                <p>&copy; {new Date().getFullYear()} STRYDE. All rights reserved.</p>
                <p>Not a replacement for clinical diagnosis.</p>
            </footer>
        </div>
    );
}

