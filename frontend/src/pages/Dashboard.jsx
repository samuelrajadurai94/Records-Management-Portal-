import React, { useEffect, useState } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { Plane, Plus, LogOut, ArrowRight } from 'lucide-react';

export default function Dashboard() {
    const [engines, setEngines] = useState([]);
    const { user, logout } = useAuth();
    const [showAddModal, setShowAddModal] = useState(false);
    const [newEngine, setNewEngine] = useState({ model_name: '', serial_number: '' });

    useEffect(() => {
        fetchEngines();
    }, []);

    const fetchEngines = async () => {
        try {
            const res = await api.get('/engines/');
            setEngines(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    const handleAddEngine = async (e) => {
        e.preventDefault();
        try {
            await api.post('/engines/', newEngine);
            setShowAddModal(false);
            setNewEngine({ model_name: '', serial_number: '' });
            fetchEngines();
        } catch (err) {
            alert('Failed to add engine');
        }
    };

    return (
        <div style={{ minHeight: '100vh', paddingBottom: '2rem' }}>
            {/* Navbar */}
            <div className="glass-panel" style={{ borderRadius: 0, marginBottom: '2rem', borderLeft: 0, borderRight: 0, borderTop: 0 }}>
                <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Plane color="var(--primary)" size={28} />
                        <h2 className="logo-text" style={{ fontSize: '1.2rem', margin: 0 }}>SPI Aviations</h2>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <span style={{ fontWeight: 600 }}>{user?.username}</span>
                        <button onClick={logout} className="btn btn-outline" style={{ padding: '8px 16px' }}>
                            <LogOut size={16} /> Sign Out
                        </button>
                    </div>
                </div>
            </div>

            <div className="container">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                    <h1>Aircraft Engines</h1>
                    <button onClick={() => setShowAddModal(true)} className="btn btn-primary">
                        <Plus size={18} /> Add New Engine
                    </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
                    {engines.map(eng => (
                        <div key={eng.id} className="glass-panel animate-fade-in" style={{ padding: '1.5rem', transition: 'transform 0.2s', position: 'relative' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{eng.model_name}</h3>
                                    <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>SN: {eng.serial_number}</p>
                                </div>
                                <Plane size={24} color="var(--text-dim)" />
                            </div>
                            <Link to={`/engine/${eng.id}`} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                                View Records <ArrowRight size={16} />
                            </Link>
                        </div>
                    ))}

                    {engines.length === 0 && (
                        <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', color: 'var(--text-dim)' }}>
                            No engines found. Add one to get started.
                        </div>
                    )}
                </div>
            </div>

            {showAddModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center',
                    backdropFilter: 'blur(4px)', zIndex: 100
                }}>
                    <div className="glass-panel animate-fade-in" style={{ padding: '2rem', width: '400px', background: 'white' }}>
                        <h2>Add New Engine</h2>
                        <form onSubmit={handleAddEngine}>
                            <input
                                placeholder="Model Name (e.g. Gulfstream G650)"
                                value={newEngine.model_name}
                                onChange={e => setNewEngine({ ...newEngine, model_name: e.target.value })}
                            />
                            <input
                                placeholder="Serial Number"
                                value={newEngine.serial_number}
                                onChange={e => setNewEngine({ ...newEngine, serial_number: e.target.value })}
                            />
                            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                                <button type="button" onClick={() => setShowAddModal(false)} className="btn btn-outline" style={{ flex: 1 }}>Cancel</button>
                                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Add</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
