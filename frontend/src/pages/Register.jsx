import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, CheckCircle } from 'lucide-react';

export default function Register() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [showConfirmPass, setShowConfirmPass] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const { register } = useAuth();
    const navigate = useNavigate();

    const validatePassword = (pwd) => {
        if (pwd.length < 8) return "Password must be at least 8 characters long";
        if (!/[A-Z]/.test(pwd)) return "Password must contain at least one uppercase letter";
        if (!/[!@#$%^&*(),.?":{}|<>]/.test(pwd)) return "Password must contain at least one special symbol";
        return null;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        const pwdError = validatePassword(password);
        if (pwdError) {
            setError(pwdError);
            return;
        }

        if (password !== confirmPassword) {
            setError("Passwords do not match");
            return;
        }

        try {
            await register(username, password);
            setSuccess("Registration Successful! Redirecting to login...");
            setTimeout(() => {
                navigate('/login');
            }, 2000);
        } catch (err) {
            setError('Registration failed. Username may be taken.');
        }
    };

    return (
        <div className="container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
            <div className="glass-panel animate-fade-in" style={{ padding: '3rem', width: '100%', maxWidth: '500px' }}>
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <h1 className="logo-text">Create Account</h1>
                    <p style={{ color: 'var(--text-dim)' }}>SPI AVIATION RECORD MANAGEMENT</p>
                </div>

                {error && (
                    <div style={{ background: '#ffebeb', color: '#d00000', padding: '12px', borderRadius: '8px', marginBottom: '1.5rem', fontSize: '0.9rem', textAlign: 'center', fontWeight: 500 }}>
                        {error}
                    </div>
                )}

                {success && (
                    <div style={{ background: '#e6fffa', color: '#006d5b', padding: '12px', borderRadius: '8px', marginBottom: '1.5rem', fontSize: '0.9rem', textAlign: 'center', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                        <CheckCircle size={18} /> {success}
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ fontWeight: 600, fontSize: '0.9rem', marginLeft: '4px' }}>Company Name</label>
                        <input
                            type="text"
                            placeholder="Unique Company ID"
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                        />
                    </div>

                    <div style={{ marginBottom: '1rem', position: 'relative' }}>
                        <label style={{ fontWeight: 600, fontSize: '0.9rem', marginLeft: '4px' }}>Password</label>
                        <div style={{ marginBottom: '6px', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                            Must be 8+ chars, 1 uppercase, 1 symbol
                        </div>
                        <input
                            type={showPass ? "text" : "password"}
                            placeholder="Create password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            style={{ paddingRight: '40px' }}
                        />
                        <button
                            type="button"
                            onClick={() => setShowPass(!showPass)}
                            style={{ position: 'absolute', right: '12px', top: '70px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)' }}
                        >
                            {showPass ? <EyeOff size={20} /> : <Eye size={20} />}
                        </button>
                    </div>

                    <div style={{ marginBottom: '2rem', position: 'relative' }}>
                        <label style={{ fontWeight: 600, fontSize: '0.9rem', marginLeft: '4px' }}>Confirm Password</label>
                        <input
                            type={showConfirmPass ? "text" : "password"}
                            placeholder="Confirm password"
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                            style={{ paddingRight: '40px' }}
                        />
                        <button
                            type="button"
                            onClick={() => setShowConfirmPass(!showConfirmPass)}
                            style={{ position: 'absolute', right: '12px', top: '38px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)' }}
                        >
                            {showConfirmPass ? <EyeOff size={20} /> : <Eye size={20} />}
                        </button>
                    </div>

                    <button type="submit" disabled={success} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', opacity: success ? 0.7 : 1 }}>
                        {success ? 'Success!' : 'Get Started'}
                    </button>
                </form>

                <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.9rem' }}>
                    Already have an account? <Link to="/login" style={{ color: 'var(--text-main)', fontWeight: '700' }}>Log in</Link>
                </div>
            </div>
        </div>
    );
}
