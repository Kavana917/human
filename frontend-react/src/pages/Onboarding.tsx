import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { Loader2, Check } from 'lucide-react';

export default function Onboarding() {
    const navigate = useNavigate();
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');


    const [gender, setGender] = useState('');
    const [age, setAge] = useState('');
    const [height, setHeight] = useState('');
    const [weight, setWeight] = useState('');
    const [activityLevel, setActivityLevel] = useState('');
    const [hasInjury, setHasInjury] = useState(false);
    const [injuryNotes, setInjuryNotes] = useState('');

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                // Check if already complete
                supabase.from('profiles').select('onboarding_complete').eq('id', session.user.id).single()
                    .then(({ data }) => {
                        if (data?.onboarding_complete) navigate('/');
                    });
            }
        });
    }, [navigate]);

    const handleNextStep1 = () => {
        if (!gender) return setError('Please select your gender.');
        const a = parseInt(age);
        if (isNaN(a) || a < 10 || a > 120) return setError('Please enter a valid age (10-120).');
        setError('');
        setStep(2);
    };

    const handleNextStep2 = () => {
        const h = parseFloat(height);
        const w = parseFloat(weight);
        if (isNaN(h) || h < 50 || h > 300) return setError('Please enter a valid height (50-300 cm).');
        if (isNaN(w) || w < 20 || w > 500) return setError('Please enter a valid weight (20-500 kg).');
        if (!activityLevel) return setError('Please select your activity level.');
        setError('');
        setStep(3);
    };

    const handleSubmitProfile = async () => {
        setLoading(true);
        setError('');
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("No user found");

            const profilePayload = {
                gender,
                age: parseInt(age),
                height_cm: parseFloat(height),
                weight_kg: parseFloat(weight),
                activity_level: activityLevel,
                has_injury: hasInjury,
                injury_notes: hasInjury ? injuryNotes : null,
                onboarding_complete: true,
                updated_at: new Date().toISOString()
            };

            const { data: existingProfile } = await supabase.from('profiles').select('id').eq('id', user.id).maybeSingle();

            if (existingProfile) {
                const { error } = await supabase.from('profiles').update(profilePayload).eq('id', user.id);
                if (error) throw error;
            } else {
                const usernameStr = user.user_metadata?.username || (user.email ? user.email.split('@')[0] + Math.floor(Math.random()*100) : 'user');
                const { error } = await supabase.from('profiles').insert({
                    id: user.id,
                    email: user.email,
                    username: usernameStr,
                    ...profilePayload
                });
                if (error) throw error;
            }

            setStep(4); // Success step
            setTimeout(() => {
                navigate('/');
            }, 2000);
        } catch (err: any) {
            setError(err.message || 'Failed to save. Please try again.');
            setLoading(false);
        }
    };

    return (
        <div className="auth-container" style={{ background: '#f8f8f8' }}>
            <div className="auth-card onboarding-card">
                {step < 4 && (
                    <div className="step-indicator">
                        {[1, 2, 3].map(s => (
                            <div key={s} className={`step-dot ${s === step ? 'active' : s < step ? 'completed' : ''}`}></div>
                        ))}
                    </div>
                )}

                {step === 1 && (
                    <div className="form-step active">
                        <h2 className="step-title">About You</h2>
                        <p className="step-subtitle">Help us personalize your experience</p>

                        <label style={{ display: 'block', marginBottom: '12px', fontSize: '0.85rem', fontWeight: 500, color: '#111' }}>Gender</label>
                        <div className="gender-options">
                            {[ {id: 'male', icon: '🧑', label: 'Male'}, {id: 'female', icon: '👩', label: 'Female'}, {id: 'other', icon: '🧑‍🤝‍🧑', label: 'Other'}].map(opt => (
                                <div key={opt.id} className={`gender-option ${gender === opt.id ? 'selected' : ''}`} onClick={() => setGender(opt.id)}>
                                    <span className="gender-icon">{opt.icon}</span>
                                    <span className="gender-label">{opt.label}</span>
                                </div>
                            ))}
                        </div>

                        <div className="form-group">
                            <label>Age</label>
                            <div className="input-wrapper">
                                <input type="number" value={age} onChange={(e) => setAge(e.target.value)} placeholder="25" min="10" max="120" />
                                <span className="input-unit">years</span>
                            </div>
                        </div>

                        <div className="error-message">{error}</div>
                        <button type="button" className="btn-primary" onClick={handleNextStep1}>Continue</button>
                    </div>
                )}

                {step === 2 && (
                    <div className="form-step active">
                        <h2 className="step-title">Body Metrics</h2>
                        <p className="step-subtitle">We'll use this to calibrate your tracking</p>

                        <div className="form-row">
                            <div className="form-group">
                                <label>Height</label>
                                <div className="input-wrapper">
                                    <input type="number" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="170" />
                                    <span className="input-unit">cm</span>
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Weight</label>
                                <div className="input-wrapper">
                                    <input type="number" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="70" step="0.1" />
                                    <span className="input-unit">kg</span>
                                </div>
                            </div>
                        </div>

                        <div className="form-group">
                            <label>Activity Level</label>
                            <div className="input-wrapper">
                                <select value={activityLevel} onChange={(e) => setActivityLevel(e.target.value)}>
                                    <option value="" disabled>Select your activity level</option>
                                    <option value="sedentary">Sedentary — Little to no exercise</option>
                                    <option value="light">Lightly Active — 1-3 days/week</option>
                                    <option value="moderate">Moderately Active — 3-5 days/week</option>
                                    <option value="active">Very Active — 6-7 days/week</option>
                                    <option value="athlete">Athlete — Intense daily training</option>
                                </select>
                            </div>
                        </div>

                        <div className="error-message">{error}</div>
                        <div className="btn-row">
                            <button type="button" className="btn-secondary" onClick={() => setStep(1)}>Back</button>
                            <button type="button" className="btn-primary" style={{ flex: 2 }} onClick={handleNextStep2}>Continue</button>
                        </div>
                    </div>
                )}

                {step === 3 && (
                    <div className="form-step active">
                        <h2 className="step-title">Health Notes</h2>
                        <p className="step-subtitle">Optional — helps us tailor recommendations</p>

                        <div className={`toggle-container ${hasInjury ? 'active' : ''}`} onClick={() => setHasInjury(!hasInjury)}>
                            <span className="toggle-label-text">I have an injury or condition</span>
                            <div className="toggle-switch"></div>
                        </div>

                        {hasInjury && (
                            <textarea 
                                className="injury-textarea visible" 
                                value={injuryNotes} 
                                onChange={(e) => setInjuryNotes(e.target.value)} 
                                placeholder="Describe your injury or condition (e.g., knee replacement, rotator cuff tear, scoliosis...)"
                            ></textarea>
                        )}

                        <div className="error-message">{error}</div>
                        <div className="btn-row">
                            <button type="button" className="btn-secondary" onClick={() => setStep(2)}>Back</button>
                            <button type="button" className="btn-primary" style={{ flex: 2 }} onClick={handleSubmitProfile} disabled={loading}>
                                {loading ? <Loader2 className="btn-loader" /> : <span>Complete Setup</span>}
                            </button>
                        </div>
                    </div>
                )}

                {step === 4 && (
                    <div className="form-step active">
                        <div className="success-screen">
                            <div className="success-checkmark">
                                <Check size={32} />
                            </div>
                            <h2 className="step-title">You're all set!</h2>
                            <p className="step-subtitle" style={{marginBottom: 0}}>Your profile has been saved. Redirecting to your dashboard…</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
