import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Onboarding from './pages/Onboarding';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import TestSelection from './pages/TestSelection';
import IotTest from './pages/IotTest';
import AbductionAdduction from './pages/tests/AbductionAdduction';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f8f8f8', color: '#111' }}>Loading...</div>;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={session ? <Home /> : <Navigate to="/login" replace />} />
        <Route path="/dashboard" element={session ? <Dashboard /> : <Navigate to="/login" replace />} />
        <Route path="/tests" element={session ? <TestSelection /> : <Navigate to="/login" replace />} />
        <Route path="/test/abduction-adduction" element={session ? <AbductionAdduction /> : <Navigate to="/login" replace />} />
        <Route path="/test/:testId" element={session ? <IotTest /> : <Navigate to="/login" replace />} />
        <Route path="/login" element={!session ? <Login /> : <Navigate to="/" replace />} />
        <Route path="/signup" element={!session ? <Signup /> : <Navigate to="/" replace />} />
        <Route path="/onboarding" element={session ? <Onboarding /> : <Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
