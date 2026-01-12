import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { Plane, Lock, Users, ShieldCheck, Eye, EyeOff } from 'lucide-react';

export default function Login() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    // Determine role from URL query param (default to client)
    const searchParams = new URLSearchParams(location.search);
    const role = searchParams.get('role') || 'client';
    const isSpi = role === 'spi';

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        try {
            await login(email, password);
            navigate('/dashboard');
        } catch (err) {
            setError('Invalid credentials');
        }
    };

    return (
        <div className="center-container">
            <div className="glass-panel animate-scale-in" style={{ width: '400px', padding: '2.5rem', borderTop: isSpi ? '4px solid var(--accent)' : '4px solid var(--primary)' }}>
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <div style={{
                        display: 'inline-flex', padding: '12px',
                        background: isSpi ? 'var(--accent)' : 'var(--primary)',
                        borderRadius: '50%', marginBottom: '1rem'
                    }}>
                        {isSpi ? <ShieldCheck color="white" size={32} /> : <Users color="white" size={32} />}
                    </div>
                    <h2 style={{ margin: 0, color: 'var(--text-main)' }}>{isSpi ? 'SPI Team Login' : 'Client Login'}</h2>
                    <p style={{ color: 'var(--text-dim)', marginTop: '0.5rem' }}>Welcome back to the portal</p>
                </div>

                {error && <div style={{ background: '#ffebee', color: '#c62828', padding: '10px', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.9rem' }}>{error}</div>}

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ position: 'relative' }}>
                        <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, color: 'var(--text-main)', fontSize: '0.9rem' }}>Email Address</label>
                        <input
                            type="email"
                            placeholder="Enter your email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            required
                            style={{ paddingLeft: '1rem' }}
                        />
                    </div>

                    <div style={{ position: 'relative' }}>
                        <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, color: 'var(--text-main)', fontSize: '0.9rem' }}>Password</label>
                        <div style={{ position: 'relative' }}>
                            <input
                                type={showPassword ? "text" : "password"}
                                placeholder="Enter your password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                required
                                style={{ paddingLeft: '1rem' }}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)' }}
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>

                    <button type="submit" className={`btn ${isSpi ? 'btn-outline' : 'btn-primary'}`} style={{ marginTop: '0.5rem', justifyContent: 'center', background: isSpi ? 'transparent' : 'var(--primary)', color: isSpi ? 'var(--primary)' : 'white', borderColor: 'var(--primary)' }}>
                        Sign In <Lock size={16} style={{ marginLeft: '8px' }} />
                    </button>
                </form>

                <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
                    <button
                        onClick={() => navigate('/')}
                        style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '0.85rem' }}
                    >
                        ← Back to Role Selection
                    </button>
                </div>
            </div>
        </div>
    );
}
