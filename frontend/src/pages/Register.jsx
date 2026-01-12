import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { Plane, Eye, EyeOff, AlertCircle, CheckCircle } from 'lucide-react';

export default function Register() {
    const { register } = useAuth();
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        company_name: '',
        email: '',
        password: '',
        confirm_password: ''
    });
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const validatePassword = (pwd) => {
        // Min 8 chars, 1 caps, 1 symbol
        const regex = /^(?=.*[A-Z])(?=.*[!@#$&*])(?=.*[0-9].*)(?=.{8,})/;
        return regex.test(pwd);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (!validatePassword(formData.password)) {
            setError("Password must contain 1 Uppercase Letter, 1 Symbol, and be at least 8 characters long.");
            return;
        }

        if (formData.password !== formData.confirm_password) {
            setError("Passwords do not match.");
            return;
        }

        try {
            await register(formData.company_name, formData.email, formData.password);
            setSuccess("Registration successful! Redirecting to login...");
            setTimeout(() => {
                navigate('/login?role=client');
            }, 2000);
        } catch (err) {
            console.error(err);
            setError('Registration failed. Email might be already registered.');
        }
    };

    return (
        <div className="center-container">
            <div className="glass-panel animate-scale-in" style={{ width: '400px', padding: '2.5rem' }}>
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <div style={{ display: 'inline-flex', padding: '12px', background: 'var(--primary)', borderRadius: '16px', marginBottom: '1rem' }}>
                        <Plane color="white" size={32} />
                    </div>
                    <h2 style={{ margin: 0, color: 'var(--primary)' }}>Create Account</h2>
                    <p style={{ color: 'var(--text-dim)', marginTop: '0.5rem' }}>Register your company with SPI Aviations</p>
                </div>

                {error && <div style={{ background: '#ffebee', color: '#c62828', padding: '12px', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' }}><AlertCircle size={16} /> {error}</div>}
                {success && <div style={{ background: '#e8f5e9', color: '#2e7d32', padding: '12px', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' }}><CheckCircle size={16} /> {success}</div>}

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, color: 'var(--text-main)', fontSize: '0.9rem' }}>Company Name</label>
                        <input
                            placeholder="e.g. Acme Aviation"
                            value={formData.company_name}
                            onChange={e => setFormData({ ...formData, company_name: e.target.value })}
                            required
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, color: 'var(--text-main)', fontSize: '0.9rem' }}>Email Address</label>
                        <input
                            type="email"
                            placeholder="name@company.com"
                            value={formData.email}
                            onChange={e => setFormData({ ...formData, email: e.target.value })}
                            required
                        />
                    </div>

                    <div style={{ position: 'relative' }}>
                        <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, color: 'var(--text-main)', fontSize: '0.9rem' }}>Password</label>
                        <div style={{ position: 'relative' }}>
                            <input
                                type={showPassword ? "text" : "password"}
                                placeholder="Create a password"
                                value={formData.password}
                                onChange={e => setFormData({ ...formData, password: e.target.value })}
                                required
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

                    <div style={{ position: 'relative' }}>
                        <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, color: 'var(--text-main)', fontSize: '0.9rem' }}>Confirm Password</label>
                        <div style={{ position: 'relative' }}>
                            <input
                                type={showConfirm ? "text" : "password"}
                                placeholder="Confirm your password"
                                value={formData.confirm_password}
                                onChange={e => setFormData({ ...formData, confirm_password: e.target.value })}
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowConfirm(!showConfirm)}
                                style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)' }}
                            >
                                {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>

                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', background: 'rgba(0,0,0,0.03)', padding: '8px', borderRadius: '6px' }}>
                        <strong>Note:</strong> Password must be at least 8 characters long, contain 1 Uppercase Letter, and 1 Symbol.
                    </div>

                    <button type="submit" className="btn btn-primary" style={{ marginTop: '0.5rem', background: 'var(--primary)', color: 'white' }}>
                        Register
                    </button>
                </form>

                <p style={{ textAlign: 'center', marginTop: '1.5rem', color: 'var(--text-dim)', fontSize: '0.9rem' }}>
                    Already have an account? <Link to="/login" style={{ color: 'var(--primary)', fontWeight: 600 }}>Sign In</Link>
                </p>
            </div>
        </div>
    );
}
