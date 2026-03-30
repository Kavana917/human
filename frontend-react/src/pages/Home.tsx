import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { Activity, LayoutDashboard, LogOut } from 'lucide-react';

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
        <div className="home-container">
            <header className="home-header">
                <div>
                    <h1 className="home-title">Welcome, {name}</h1>
                    <p className="home-subtitle">Select an action below to continue</p>
                </div>
                <button onClick={handleLogout} className="btn-icon">
                    <LogOut size={20} />
                    <span>Logout</span>
                </button>
            </header>
            
            <div className="home-cards">
                <button className="home-action-card" onClick={() => navigate('/dashboard')}>
                    <LayoutDashboard size={48} className="action-icon" />
                    <h2>Dashboard</h2>
                    <p>View your profile details and previous test results from your motion evaluations.</p>
                </button>
                <button className="home-action-card primary" onClick={() => navigate('/tests')}>
                    <Activity size={48} className="action-icon" />
                    <h2>Take Test Now</h2>
                    <p>Proceed to select a new functional or mobility test for real-time assessment.</p>
                </button>
            </div>
        </div>
    );
}
