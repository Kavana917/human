import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { Mail, Lock, Eye, EyeOff, Loader2, User } from 'lucide-react';

const Logo = () => (
    <div className="brand">
        <div className="brand-icon">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                <circle cx="20" cy="20" r="18" stroke="currentColor" strokeWidth="2.5" fill="none"/>
                <circle cx="20" cy="20" r="10" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.6"/>
                <circle cx="20" cy="20" r="3" fill="currentColor"/>
                <line x1="20" y1="2" x2="20" y2="10" stroke="currentColor" strokeWidth="1.5" opacity="0.4"/>
                <line x1="20" y1="30" x2="20" y2="38" stroke="currentColor" strokeWidth="1.5" opacity="0.4"/>
                <line x1="2" y1="20" x2="10" y2="20" stroke="currentColor" strokeWidth="1.5" opacity="0.4"/>
                <line x1="30" y1="20" x2="38" y2="20" stroke="currentColor" strokeWidth="1.5" opacity="0.4"/>
            </svg>
        </div>
        <h1 className="brand-name">MotionSync</h1>
        <p className="brand-tagline">Create your account</p>
    </div>
);

export default function Signup() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [password, setPassword] = useState('');
    const [strengthScore, setStrengthScore] = useState(0);

    useEffect(() => {
        let score = 0;
        if (password.length >= 6) score++;
        if (password.length >= 10) score++;
        if (/[A-Z]/.test(password)) score++;
        if (/[0-9]/.test(password)) score++;
        if (/[^A-Za-z0-9]/.test(password)) score++;
        setStrengthScore(score);
    }, [password]);

    const levels = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Excellent'];
    const colors = ['', '#ef4444', '#f97316', '#eab308', '#22c55e', '#111'];
    const widths = ['0%', '20%', '40%', '60%', '80%', '100%'];
    
    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setLoading(true);

        const formData = new FormData(e.currentTarget);
        const username = formData.get('username') as string;
        const email = formData.get('email') as string;
        const confirm = formData.get('confirm') as string;

        if (password !== confirm) {
            setError('Passwords do not match.');
            setLoading(false);
            return;
        }

        if (password.length < 6) {
            setError('Password must be at least 6 characters.');
            setLoading(false);
            return;
        }

        try {
            const { data, error: signUpError } = await supabase.auth.signUp({
                email,
                password,
                options: { data: { username } }
            });

            if (signUpError) throw signUpError;

            if (data.user) {
                // Upsert profile - if it fails due to RLS, the onboarding will handle insertion
                const { error: profileError } = await supabase.from('profiles').upsert({
                    id: data.user.id,
                    username,
                    email,
                    onboarding_complete: false
                });
                if (profileError) console.warn("Deferred to onboarding:", profileError);
            }

            if (data.session) {
                navigate('/onboarding');
            } else {
                setSuccess('Account created! Check your email to confirm, then log in.');
            }
        } catch (err: any) {
            setError(err.message || 'Sign up failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-card">
                <Logo />
                
                <form onSubmit={handleSubmit} autoComplete="on">
                    <div className="form-group">
                        <label>Username</label>
                        <div className="input-wrapper">
                            <User className="input-icon" />
                            <input type="text" name="username" placeholder="johndoe" required autoComplete="username" minLength={3} />
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Email</label>
                        <div className="input-wrapper">
                            <Mail className="input-icon" />
                            <input type="email" name="email" placeholder="you@example.com" required autoComplete="email" />
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Password</label>
                        <div className="input-wrapper">
                            <Lock className="input-icon" />
                            <input 
                                type={showPassword ? 'text' : 'password'} 
                                name="password" 
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••" 
                                required 
                                autoComplete="new-password" 
                            />
                            <button type="button" className="toggle-password" onClick={() => setShowPassword(!showPassword)}>
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                        <div className="password-strength">
                            <div className="strength-bar" style={{ width: widths[strengthScore], background: colors[strengthScore] }}></div>
                        </div>
                        <span className="strength-text" style={{ color: colors[strengthScore] }}>{levels[strengthScore]}</span>
                    </div>

                    <div className="form-group">
                        <label>Confirm Password</label>
                        <div className="input-wrapper">
                            <Lock className="input-icon" />
                            <input type={"password"} name="confirm" placeholder="••••••••" required autoComplete="new-password" />
                        </div>
                    </div>

                    <div className="error-message">{error}</div>
                    <div className="success-message">{success}</div>

                    <button type="submit" className="btn-primary" disabled={loading}>
                        {loading ? <Loader2 className="btn-loader" /> : <span>Create Account</span>}
                    </button>
                </form>

                <div className="auth-footer">
                    <p>Already have an account? <Link to="/login">Sign in</Link></p>
                </div>
            </div>
        </div>
    );
}
