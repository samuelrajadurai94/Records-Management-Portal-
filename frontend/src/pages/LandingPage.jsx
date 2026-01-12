import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Plane, Users, ShieldCheck } from 'lucide-react';

export default function LandingPage() {
    const navigate = useNavigate();

    return (
        <div style={{ minHeight: '100vh', display: 'flex' }}>
            {/* Left Side: Hero / Branding */}
            <div style={{ flex: 1, background: 'var(--background)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'center', color: 'var(--text-main)', padding: '4rem', paddingTop: '8rem' }}>
                <div className="animate-fade-in" style={{ textAlign: 'center' }}>
                    <div style={{ marginBottom: '2rem', display: 'inline-flex', padding: '2rem', border: '2px solid var(--text-main)', borderRadius: '50%' }}>
                        <Plane size={80} color="var(--text-main)" />
                    </div>
                    <h1 style={{ fontSize: '3rem', marginBottom: '1rem', fontWeight: 900, color: 'var(--text-main)', textTransform: 'uppercase', maxWidth: '600px', lineHeight: '1.2' }}>
                        SPI AVIATION RECORDS MANAGEMENT SYSTEM
                    </h1>
                    <p style={{ fontSize: '1.5rem', opacity: 0.8, maxWidth: '500px', lineHeight: 1.6 }}>
                        Secure. Organized. Everywhere.
                    </p>
                </div>
            </div>

            {/* Right Side: Login Options */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: '#E3F2FD', padding: '2rem' }}>
                <div className="animate-fade-in" style={{ width: '100%', maxWidth: '400px' }}>
                    <h2 style={{ textAlign: 'center', marginBottom: '2rem', fontSize: '2rem', color: 'var(--primary)' }}>Welcome Portal</h2>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        {/* Client Login Button */}
                        <div
                            className="btn-hover-effect"
                            style={{ padding: '1.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '1rem', border: '2px solid var(--primary)', borderRadius: '16px', transition: 'all 0.3s', background: 'white', color: 'var(--primary)' }}
                            onClick={() => navigate('/login?role=client')}
                            onMouseOver={(e) => { e.currentTarget.style.background = 'var(--primary)'; e.currentTarget.style.color = 'white' }}
                            onMouseOut={(e) => { e.currentTarget.style.background = 'white'; e.currentTarget.style.color = 'var(--primary)' }}
                        >
                            <div style={{ padding: '8px' }}>
                                <Users size={24} color="currentColor" />
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'inherit' }}>Client Login</h3>
                            </div>
                        </div>

                        {/* SPI Team Login Button */}
                        <div
                            className="btn-hover-effect"
                            style={{ padding: '1.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '1rem', border: '2px solid var(--primary)', borderRadius: '16px', transition: 'all 0.3s', background: 'white', color: 'var(--primary)' }}
                            onClick={() => navigate('/login?role=spi')}
                            onMouseOver={(e) => { e.currentTarget.style.background = 'var(--primary)'; e.currentTarget.style.color = 'white' }}
                            onMouseOut={(e) => { e.currentTarget.style.background = 'white'; e.currentTarget.style.color = 'var(--primary)' }}
                        >
                            <div style={{ padding: '8px' }}>
                                <ShieldCheck size={24} color="currentColor" />
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'inherit' }}>SPI Login</h3>
                            </div>
                        </div>
                    </div>

                    <div style={{ marginTop: '3rem', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <p style={{ fontSize: '0.9rem', color: '#666' }}>Need an account?</p>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem' }}>
                            <span
                                style={{ color: 'var(--primary)', cursor: 'pointer', fontWeight: '800', textDecoration: 'underline' }}
                                onClick={() => navigate('/register')}
                            >
                                Client Register
                            </span>
                            <span
                                style={{ color: '#666', cursor: 'pointer', fontWeight: '600' }}
                                onClick={() => navigate('/register')}
                            >
                                SPI Register
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
