import React, { useEffect, useState } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { Plane, Plus, LogOut, ArrowRight, LayoutGrid, HardDrive, Clock, Star, Trash2, Users, ChevronLeft, ChevronRight, Settings } from 'lucide-react';

export default function Dashboard() {
    const [engines, setEngines] = useState([]);
    const { user, logout } = useAuth();
    const [showAddModal, setShowAddModal] = useState(false);
    const [newEngine, setNewEngine] = useState({ model_name: '', serial_number: '', local_path: '' });
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

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
            setNewEngine({ model_name: '', serial_number: '', local_path: '' });
            fetchEngines();
            alert('Engine added and Box upload started (check backend console for progress)');
        } catch (err) {
            console.error(err);
            alert('Failed to add engine. Check if the local path exists and backend is running.');
        }
    };

    const SidebarItem = ({ icon: Icon, label, active, count }) => (
        <div style={{
            display: 'flex', alignItems: 'center', padding: '12px 16px',
            marginBottom: '4px', cursor: 'pointer',
            background: active ? 'rgba(0,0,0,0.05)' : 'transparent',
            color: active ? 'var(--primary)' : 'var(--text-main)',
            borderRight: active ? '3px solid var(--primary)' : '3px solid transparent',
            fontWeight: active ? 600 : 400
        }}>
            <Icon size={20} style={{ marginRight: isSidebarOpen ? '12px' : 0 }} />
            {isSidebarOpen && <span style={{ flex: 1 }}>{label}</span>}
            {isSidebarOpen && count && <span style={{ background: 'var(--primary)', color: 'white', padding: '2px 8px', borderRadius: '10px', fontSize: '0.75rem' }}>{count}</span>}
        </div>
    );

    return (
        <div style={{ display: 'flex', height: '100vh', background: 'var(--background)' }}>
            {/* Sidebar */}
            <div style={{
                width: isSidebarOpen ? '260px' : '80px',
                background: '#E3F2FD', // Matching Light Blue Theme from image
                transition: 'width 0.3s ease',
                display: 'flex', flexDirection: 'column',
                borderRight: '1px solid rgba(0,0,0,0.1)',
                position: 'relative'
            }}>
                {/* Logo Area */}
                <div style={{ padding: '24px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ minWidth: '40px', height: '40px', background: 'var(--primary)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Plane color="white" size={24} />
                    </div>
                    {isSidebarOpen && <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden' }}>SPI Records</h2>}
                </div>

                {/* Navigation Items */}
                <div style={{ flex: 1, padding: '16px 0', overflowY: 'auto' }}>
                    {isSidebarOpen && <h4 style={{ padding: '0 16px', marginBottom: '8px', color: 'var(--text-dim)', fontSize: '0.8rem', textTransform: 'uppercase' }}>File Manager</h4>}

                    <SidebarItem icon={LayoutGrid} label="Overview" active />
                    <SidebarItem icon={HardDrive} label="My Storage" count={engines.length} />
                    <SidebarItem icon={Clock} label="Recent Files" />
                    <SidebarItem icon={Star} label="Favorites" />
                    <SidebarItem icon={Trash2} label="Trash bin" />

                    <div style={{ height: '24px' }}></div>

                    {isSidebarOpen && <h4 style={{ padding: '0 16px', marginBottom: '8px', color: 'var(--text-dim)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Shared Files</h4>}
                    <SidebarItem icon={Users} label="Team" />
                </div>

                {/* Toggle Button */}
                <button
                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                    style={{
                        position: 'absolute', top: '50%', right: '-12px',
                        width: '24px', height: '24px', borderRadius: '50%',
                        background: 'white', border: '1px solid #ddd',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                    }}
                >
                    {isSidebarOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
                </button>

                <div style={{ padding: '16px', borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                    <button onClick={logout} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', width: '100%' }}>
                        <LogOut size={20} />
                        {isSidebarOpen && <span>Sign Out</span>}
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem' }}>
                    <div>
                        <h2 style={{ fontSize: '2rem', color: 'var(--primary)', marginBottom: '0.5rem', fontWeight: 800 }}>
                            Welcome, {user?.company_name || 'Client'}
                        </h2>
                        <p style={{ color: 'var(--text-dim)' }}>Manage your aircraft records securely.</p>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button className="btn btn-outline" style={{ borderRadius: '50%', width: '40px', height: '40px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Settings size={20} />
                        </button>
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Aircraft Engines</h1>
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
                                    {eng.box_folder_id && <span style={{ fontSize: '0.8rem', color: 'green' }}>Box Linked</span>}
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

            {/* Add Modal - Unchanged logic */}
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
                                required
                            />
                            <input
                                placeholder="Serial Number"
                                value={newEngine.serial_number}
                                onChange={e => setNewEngine({ ...newEngine, serial_number: e.target.value })}
                                required
                            />
                            <div style={{ margin: '10px 0' }}>
                                <label style={{ fontSize: '0.8rem', color: '#666', display: 'block', marginBottom: '4px' }}>
                                    Local Data Path (Optional):
                                </label>
                                <input
                                    placeholder="D:\Path\To\Records"
                                    value={newEngine.local_path}
                                    onChange={e => setNewEngine({ ...newEngine, local_path: e.target.value })}
                                />
                                <small style={{ color: '#888', fontSize: '0.75rem' }}>
                                    Files from this folder will be uploaded to Box.
                                </small>
                            </div>
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
