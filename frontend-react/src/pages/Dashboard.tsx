import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { ArrowLeft, User, Activity, Edit2, Check, X, Loader2 } from 'lucide-react';

export default function Dashboard() {
    const navigate = useNavigate();
    const [profile, setProfile] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    
    // Edit state
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState<any>({});

    useEffect(() => {
        let isMounted = true;
        
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (user) {
                supabase.from('profiles').select('*').eq('id', user.id).single()
                    .then(({ data }) => {
                        if (isMounted) {
                            setProfile({ email: user.email, ...data });
                            setEditForm({
                                height_cm: data.height_cm || '',
                                weight_kg: data.weight_kg || '',
                                activity_level: data.activity_level || 'sedentary',
                                has_injury: data.has_injury || false,
                                injury_notes: data.injury_notes || ''
                            });
                            setLoading(false);
                        }
                    });
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
                            <div className="profile-item">
                                <span className="label">Email</span>
                                <span className="value">{profile?.email || 'N/A'}</span>
                            </div>
                            <div className="profile-item">
                                <span className="label">Age</span>
                                <span className="value">{profile?.age || 'N/A'}</span>
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
                        <div className="section-header">
                            <Activity size={24} />
                            <h2>Previous Test Results</h2>
                        </div>
                        
                        <div className="results-list">
                            <div style={{ padding: '48px 32px', textAlign: 'center', background: '#fafafa', border: '1px dashed #e5e5e5', color: '#666', fontFamily: 'inherit' }}>
                                No previous test records available.
                            </div>
                        </div>
                    </section>
                </div>
            )}
        </div>
    );
}
