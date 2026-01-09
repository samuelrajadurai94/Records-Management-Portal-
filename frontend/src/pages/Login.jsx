import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';

export default function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        try {
            await login(username, password);
            navigate('/');
        } catch (error) {
            setError('Password Wrong or Company Invalid');
        }
    };

    return (
        <div className="split-screen" style={{ height: '100vh', overflow: 'hidden' }}>
            {/* Left Side - Hero / Info */}
            <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: 'transparent', padding: 0, overflow: 'hidden' }}>
                {/* Background Image Layer - Subtle Blend if image exists */}
                <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    backgroundImage: 'url("/flight_hero_image.png")',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    opacity: 0.1
                }}></div>

                {/* Content Overlay */}
                <div className="animate-fade-in" style={{ position: 'relative', zIndex: 10, padding: '4rem', color: 'var(--text-main)', textAlign: 'center' }}>
                    <h1 style={{ fontSize: '5rem', fontWeight: 900, lineHeight: '1', marginBottom: '1.5rem', color: 'var(--text-main)' }}>
                        SPI AVIATIONS
                    </h1>
                    <p style={{ fontSize: '1.8rem', fontWeight: 400, marginBottom: '2rem', color: 'var(--secondary)' }}>
                        Global Leader in Aircraft Record Management
                    </p>

                    <p style={{ fontSize: '1.2rem', color: 'var(--text-dim)', maxWidth: '600px', margin: '0 auto' }}>
                        Organize your files and keep them safe, everywhere!
                    </p>
                </div>
            </div>

            {/* Right Side - Login Form */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.4)' }}>
                <div className="glass-panel animate-fade-in" style={{ padding: '3rem', width: '100%', maxWidth: '450px', margin: '2rem' }}>
                    <h2 style={{ textAlign: 'center', marginBottom: '2rem', color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 800 }}>LOG IN</h2>

                    {error && (
                        <div style={{ background: '#ffebeb', color: '#d00000', padding: '12px', borderRadius: '8px', marginBottom: '1.5rem', textAlign: 'center', fontWeight: 600 }}>
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit}>
                        <div style={{ marginBottom: '1.5rem' }}>
                            <label style={{ fontWeight: 600, display: 'block', marginBottom: '8px', marginLeft: '4px' }}>Company</label>
                            <input
                                type="text"
                                placeholder="Enter your Company ID"
                                value={username}
                                onChange={e => setUsername(e.target.value)}
                            />
                        </div>

                        <div style={{ marginBottom: '2rem', position: 'relative' }}>
                            <label style={{ fontWeight: 600, display: 'block', marginBottom: '8px', marginLeft: '4px' }}>Password</label>
                            <input
                                type={showPassword ? "text" : "password"}
                                placeholder="Enter your password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                style={{ paddingRight: '40px' }}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                style={{ position: 'absolute', right: '15px', top: '42px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)' }}
                            >
                                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                            </button>
                        </div>

                        <button type="submit" className="btn btn-primary" style={{ width: '100%', fontSize: '1.1rem', padding: '14px' }}>
                            Log in
                        </button>
                    </form>

                    <div style={{ marginTop: '2rem', textAlign: 'center' }}>
                        <span style={{ color: 'var(--text-dim)' }}>New here? </span>
                        <Link to="/register" style={{ color: 'var(--text-main)', fontWeight: 700 }}>Create an account</Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
