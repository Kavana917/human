import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { ArrowLeft, User, Activity, Edit2, Check, X, Loader2, FileBarChart } from 'lucide-react';
import TestRecordCard from '../components/TestRecordCard';
import { reseedAllDemoResults } from '../lib/seedDemoResults';

export default function Dashboard() {
    const navigate = useNavigate();
    const [profile, setProfile] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    
    // Edit state
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState<any>({});
    
    // Test results
    const [testResults, setTestResults] = useState<any[]>([]);
    const [reseeding, setReseeding] = useState(false);

    const reloadResults = async (userId: string) => {
        const resultsRes = await supabase
            .from('test_results')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });
        setTestResults(resultsRes.data || []);
    };

    const handleForceReseed = async () => {
        if (!confirm('Replace ALL previous test results with fresh demo data for the 6 ML-aligned shoulder tests?')) {
            return;
        }
        setReseeding(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            localStorage.removeItem('stryde_demo_reseed_v3');
            const seeded = await reseedAllDemoResults(true);
            await reloadResults(user.id);
            alert(seeded ? `Inserted ${seeded.inserted} demo sessions.` : 'Reseed skipped.');
        } catch (e) {
            console.error(e);
            alert('Reseed failed: ' + (e as Error).message);
        } finally {
            setReseeding(false);
        }
    };

    useEffect(() => {
        let isMounted = true;
        
        supabase.auth.getUser().then(async ({ data: { user } }) => {
            if (user) {
                try {
                    const profileRes = await supabase.from('profiles').select('*').eq('id', user.id).single();

                    // One-time wipe + insert of ML-aligned demo sessions (all 6 movements)
                    try {
                        const seeded = await reseedAllDemoResults(false);
                        if (seeded) {
                            console.log(`[Dashboard] Reseeded ${seeded.inserted} demo test results`);
                        }
                    } catch (seedErr) {
                        console.error('Demo reseed failed', seedErr);
                    }

                    const resultsRes = await supabase.from('test_results').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
                    const rows = resultsRes.data || [];
                    
                    if (isMounted) {
                        setProfile({ email: user.email, ...profileRes.data });
                        setTestResults(rows);
                        setEditForm({
                            age: profileRes.data.age || '',
                            height_cm: profileRes.data.height_cm || '',
                            weight_kg: profileRes.data.weight_kg || '',
                            activity_level: profileRes.data.activity_level || 'sedentary',
                            has_injury: profileRes.data.has_injury || false,
                            injury_notes: profileRes.data.injury_notes || ''
                        });
                        setLoading(false);
                    }
                } catch (e) {
                    console.error("Dashboard fetch error", e);
                    if (isMounted) setLoading(false);
                }
            } else {
                if (isMounted) navigate('/login');
            }
        });

        return () => { isMounted = false; };
    }, [navigate]);

    const handleEditToggle = () => {
        if (!isEditing) {
            // reset form to current profile
            setEditForm({
                age: profile.age || '',
                height_cm: profile.height_cm || '',
                weight_kg: profile.weight_kg || '',
                activity_level: profile.activity_level || 'sedentary',
                has_injury: profile.has_injury || false,
                injury_notes: profile.injury_notes || ''
            });
        }
        setIsEditing(!isEditing);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const updates = {
                    age: parseInt(editForm.age, 10),
                    height_cm: parseFloat(editForm.height_cm),
                    weight_kg: parseFloat(editForm.weight_kg),
                    activity_level: editForm.activity_level,
                    has_injury: editForm.has_injury,
                    injury_notes: editForm.has_injury ? editForm.injury_notes : null,
                    updated_at: new Date().toISOString()
                };

                const { error } = await supabase.from('profiles').update(updates).eq('id', user.id);
                if (error) throw error;
                
                setProfile({ ...profile, ...updates });
                setIsEditing(false);
            }
        } catch (err) {
            console.error("Failed to update profile", err);
            alert("Failed to update profile.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="page-container">
            <header className="page-header">
                <button onClick={() => navigate('/')} className="btn-icon">
                    <ArrowLeft size={20} />
                    <span>Back to Home</span>
                </button>
                <h1 className="page-title">Dashboard</h1>
                <p className="page-subtitle">View your profile details and full motion evaluation history.</p>
            </header>
            
            {loading ? (
                <div style={{ padding: '40px 0', color: '#666' }}>Loading data...</div>
            ) : (
                <div className="dashboard-content">
                    <section className="profile-section">
                        <div className="section-header" style={{ justifyContent: 'space-between', display: 'flex', alignItems: 'center', marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid #e5e5e5', color: '#111' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <User size={24} />
                                <h2 style={{ fontSize: '1.5rem', fontWeight: 500, letterSpacing: '-0.02em', margin: 0 }}>Profile Details</h2>
                            </div>
                            {!isEditing ? (
                                <button onClick={handleEditToggle} className="btn-icon" style={{ margin: 0 }}>
                                    <Edit2 size={16} />
                                    <span>Edit</span>
                                </button>
                            ) : (
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button onClick={handleEditToggle} className="btn-icon" style={{ margin: 0, color: '#dc2626' }}>
                                        <X size={16} />
                                        <span>Cancel</span>
                                    </button>
                                    <button onClick={handleSave} className="btn-icon" style={{ margin: 0, color: '#16a34a' }} disabled={saving}>
                                        {saving ? <Loader2 size={16} className="btn-loader" /> : <Check size={16} />}
                                        <span>Save</span>
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="profile-grid">
                            <div className="profile-item">
                                <span className="label">Username</span>
                                <span className="value">{profile?.username || 'N/A'}</span>
                            </div>
                            <div className="profile-item" style={{ gridColumn: 'span 2', wordBreak: 'break-all' }}>
                                <span className="label">Email</span>
                                <span className="value">{profile?.email || 'N/A'}</span>
                            </div>
                            <div className="profile-item">
                                <span className="label">Age</span>
                                {isEditing ? (
                                    <input 
                                        type="number" 
                                        style={{ marginTop: '8px', padding: '12px', border: '1px solid #111', fontFamily: 'inherit', outline: 'none' }}
                                        value={editForm.age} 
                                        onChange={e => setEditForm({...editForm, age: e.target.value})} 
                                    />
                                ) : (
                                    <span className="value">{profile?.age || 'N/A'}</span>
                                )}
                            </div>

                            {/* Editable Fields Below */}
                            <div className="profile-item">
                                <span className="label">Height (cm)</span>
                                {isEditing ? (
                                    <input 
                                        type="number" 
                                        style={{ marginTop: '8px', padding: '12px', border: '1px solid #111', fontFamily: 'inherit', outline: 'none' }}
                                        value={editForm.height_cm} 
                                        onChange={e => setEditForm({...editForm, height_cm: e.target.value})} 
                                    />
                                ) : (
                                    <span className="value">{profile?.height_cm || '-'}</span>
                                )}
                            </div>
                            <div className="profile-item">
                                <span className="label">Weight (kg)</span>
                                {isEditing ? (
                                    <input 
                                        type="number" 
                                        style={{ marginTop: '8px', padding: '12px', border: '1px solid #111', fontFamily: 'inherit', outline: 'none' }}
                                        value={editForm.weight_kg} 
                                        onChange={e => setEditForm({...editForm, weight_kg: e.target.value})} 
                                    />
                                ) : (
                                    <span className="value">{profile?.weight_kg || '-'}</span>
                                )}
                            </div>
                            <div className="profile-item">
                                <span className="label">Activity Level</span>
                                {isEditing ? (
                                    <div className="input-wrapper" style={{ marginTop: '8px', border: '1px solid #111' }}>
                                        <select 
                                            style={{ padding: '12px 12px 12px 12px', width: '100%', fontFamily: 'inherit', border: 'none', appearance: 'none', outline: 'none' }}
                                            value={editForm.activity_level}
                                            onChange={e => setEditForm({...editForm, activity_level: e.target.value})}
                                        >
                                            <option value="sedentary">Sedentary</option>
                                            <option value="light">Lightly Active</option>
                                            <option value="moderate">Moderately Active</option>
                                            <option value="active">Very Active</option>
                                            <option value="athlete">Athlete</option>
                                        </select>
                                    </div>
                                ) : (
                                    <span className="value" style={{ textTransform: 'capitalize' }}>
                                        {profile?.activity_level ? profile.activity_level.replace('-',' ') : '-'}
                                    </span>
                                )}
                            </div>
                            
                            <div className="profile-item" style={{ gridColumn: '1 / -1' }}>
                                <span className="label">Injury / Notes</span>
                                {isEditing ? (
                                    <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontFamily: 'inherit' }}>
                                            <input 
                                                type="checkbox" 
                                                checked={editForm.has_injury} 
                                                onChange={e => setEditForm({...editForm, has_injury: e.target.checked})} 
                                                style={{ width: '18px', height: '18px', accentColor: '#111' }}
                                            />
                                            I have an injury or condition
                                        </label>
                                        {editForm.has_injury && (
                                            <textarea 
                                                style={{ padding: '12px', border: '1px solid #111', minHeight: '80px', fontFamily: 'inherit', outline: 'none', resize: 'vertical' }}
                                                value={editForm.injury_notes}
                                                onChange={e => setEditForm({...editForm, injury_notes: e.target.value})}
                                                placeholder="Describe your condition..."
                                            />
                                        )}
                                    </div>
                                ) : (
                                    <span className="value" style={{ fontSize: '1rem', marginTop: '4px', fontWeight: 400, color: '#333' }}>
                                        {profile?.has_injury ? profile.injury_notes : 'None reported.'}
                                    </span>
                                )}
                            </div>
                        </div>
                    </section>

                    <section className="results-section">
                        <div className="section-header" style={{ justifyContent: 'space-between', display: 'flex', alignItems: 'center', marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid #e5e5e5', color: '#111' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <Activity size={24} />
                                <h2 style={{ fontSize: '1.5rem', fontWeight: 500, letterSpacing: '-0.02em', margin: 0 }}>Previous Test Results</h2>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                <button
                                    onClick={handleForceReseed}
                                    className="btn-icon"
                                    disabled={reseeding}
                                    style={{ margin: 0, padding: '12px 16px', borderRadius: '6px', gap: '8px', fontWeight: 500, fontSize: '0.9rem', border: '1px solid #e5e5e5', cursor: 'pointer', background: '#fff' }}
                                >
                                    {reseeding ? <Loader2 size={16} className="btn-loader" /> : <Activity size={16} />}
                                    <span>{reseeding ? 'Reseeding…' : 'Reseed demo data'}</span>
                                </button>
                                <button
                                    id="get-analysis-report-btn"
                                    onClick={() => navigate('/analysis-report')}
                                    className="btn-icon"
                                    style={{ margin: 0, background: '#111', color: '#fff', padding: '12px 24px', borderRadius: '6px', gap: '10px', fontWeight: 500, fontSize: '1rem', border: 'none', cursor: 'pointer' }}
                                >
                                    <FileBarChart size={20} />
                                    <span>Get Analysis Report</span>
                                </button>
                            </div>
                        </div>
                        
                        <div className="results-list">
                            {testResults.length === 0 ? (
                                <div style={{ padding: '48px 32px', textAlign: 'center', background: '#fafafa', border: '1px dashed #e5e5e5', color: '#666', fontFamily: 'inherit' }}>
                                    No previous test records available.
                                </div>
                            ) : (
                                testResults.map(record => (
                                    <TestRecordCard key={record.id} record={record} />
                                ))
                            )}
                        </div>
                    </section>
                </div>
            )}
        </div>
    );
}
