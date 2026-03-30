import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { Mail, Lock, Eye, EyeOff, Loader2 } from 'lucide-react';

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
        <p className="brand-tagline">Real-time motion intelligence</p>
    </div>
);

export default function Login() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const formData = new FormData(e.currentTarget);
        const email = formData.get('email') as string;
        const password = formData.get('password') as string;

        try {
            const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
            if (signInError) throw signInError;

            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('onboarding_complete')
                .eq('id', data.user.id)
                .single();

            if (profileError && profileError.code !== 'PGRST116') throw profileError;

            if (!profile || !profile.onboarding_complete) {
                navigate('/onboarding');
            } else {
                navigate('/');
            }
        } catch (err: any) {
            setError(err.message || 'Login failed. Please try again.');
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
                        <label htmlFor="email">Email</label>
                        <div className="input-wrapper">
                            <Mail className="input-icon" />
                            <input type="email" id="email" name="email" placeholder="you@example.com" required autoComplete="email" />
                        </div>
                    </div>

                    <div className="form-group">
                        <label htmlFor="password">Password</label>
                        <div className="input-wrapper">
                            <Lock className="input-icon" />
                            <input 
                                type={showPassword ? 'text' : 'password'} 
                                id="password" 
                                name="password" 
                                placeholder="••••••••" 
                                required 
                                autoComplete="current-password" 
                            />
                            <button 
                                type="button" 
                                className="toggle-password" 
                                onClick={() => setShowPassword(!showPassword)}
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>

                    <div className="error-message">{error}</div>

                    <button type="submit" className="btn-primary" disabled={loading}>
                        {loading ? <Loader2 className="btn-loader" /> : <span>Sign In</span>}
                    </button>
                </form>

                <div className="auth-footer">
                    <p>Don't have an account? <Link to="/signup">Create one</Link></p>
                </div>
            </div>
        </div>
    );
}
