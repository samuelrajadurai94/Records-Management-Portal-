import React, { useEffect, useState } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { Plane, Plus, LogOut, ArrowRight, LayoutGrid, HardDrive, Clock, Star, Trash2, Users, ChevronLeft, ChevronRight, Settings, Link2 } from 'lucide-react';

export default function Dashboard() {
    const [engines, setEngines] = useState([]);
    const { user, logout } = useAuth();
    const [showAddModal, setShowAddModal] = useState(false);
    const [serialNumber, setSerialNumber] = useState('');
    const [selectedFiles, setSelectedFiles] = useState(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadComplete, setUploadComplete] = useState(false);
    const [uploadedEngineSerial, setUploadedEngineSerial] = useState('');
    const [uploadFilesCompleted, setUploadFilesCompleted] = useState(0);
    const [uploadFilesTotal, setUploadFilesTotal] = useState(0);
    const [uploadErrors, setUploadErrors] = useState([]);
    const [uploadSummary, setUploadSummary] = useState(null); // { serial, succeeded, total, errors }
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [engineToDelete, setEngineToDelete] = useState(null);
    const [deleteComplete, setDeleteComplete] = useState(false);
    const [deletedEngineSerial, setDeletedEngineSerial] = useState('');
    // Box Link Import states
    const [showBoxLinkModal, setShowBoxLinkModal] = useState(false);
    const [boxLinkStep, setBoxLinkStep] = useState(1); // 1=form, 2=confirm
    const [boxLinkSerial, setBoxLinkSerial] = useState('');
    const [boxLinkUrl, setBoxLinkUrl] = useState('');
    const [boxLinkError, setBoxLinkError] = useState('');

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

    const [uploadStage, setUploadStage] = useState('');

    const handleBoxLinkImport = async () => {
        if (!boxLinkSerial.trim() || !boxLinkUrl.trim()) {
            setBoxLinkError('Both serial number and Box link are required.');
            return;
        }
        setBoxLinkError('');
        setIsUploading(true);
        setUploadProgress(5);
        setUploadComplete(false);
        setUploadSummary(null);
        setUploadErrors([]);
        setUploadFilesCompleted(0);
        setUploadFilesTotal(1);
        setUploadedEngineSerial(boxLinkSerial);
        setUploadStage('Connecting to Box, creating folder structure...');
        setShowBoxLinkModal(false);
        setBoxLinkStep(1);

        const currentSerial = boxLinkSerial;
        let pollInterval = null;

        try {
            const formData = new FormData();
            formData.append('serial_number', currentSerial);
            formData.append('box_link', boxLinkUrl);

            // Start polling
            pollInterval = setInterval(async () => {
                try {
                    const encodedSN = encodeURIComponent(currentSerial);
                    const statusRes = await api.get(`/engines/upload-status/${encodedSN}`);
                    const d = statusRes.data;
                    if (d.status === 'running' || d.progress > 0) {
                        setUploadProgress(d.progress ?? 5);
                        setUploadStage(d.progress < 40
                            ? 'Creating folder structure in Box...'
                            : 'Copying files from source to your Box storage...');
                    }
                    if (d.status === 'done' || d.status === 'error') {
                        clearInterval(pollInterval);
                        pollInterval = null;
                        setUploadSummary({
                            serial: currentSerial,
                            succeeded: d.status === 'done' ? 1 : 0,
                            total: 1,
                            errors: d.errors ?? [],
                            isError: d.status === 'error',
                        });
                        setUploadComplete(true);
                        setUploadedEngineSerial(currentSerial);
                        setTimeout(() => setUploadComplete(false), 12000);
                        fetchEngines();
                        setIsUploading(false);
                        setUploadStage('');
                        setBoxLinkSerial('');
                        setBoxLinkUrl('');
                    }
                } catch (pollErr) {
                    console.error('Box link poll error:', pollErr);
                }
            }, 1500);

            await api.post('/engines/import-from-link', formData);
        } catch (err) {
            if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
            const status = err?.response?.status;
            const detail = err?.response?.data?.detail || '';
            if (status === 400 && detail.toLowerCase().includes('already exists')) {
                alert(`Engine serial number "${currentSerial}" already exists. Use a different serial number.`);
            } else {
                alert(detail || 'Failed to import from Box link. Check console for details.');
            }
            setIsUploading(false);
            setUploadProgress(0);
            setUploadStage('');
        }
    };

    const handleAddEngine = async (e) => {
        e.preventDefault();
        setIsUploading(true);
        setUploadProgress(0);
        setUploadComplete(false);
        setUploadSummary(null);
        setUploadErrors([]);
        setUploadFilesCompleted(0);
        setUploadFilesTotal(0);
        setUploadedEngineSerial(serialNumber);
        setUploadStage('Initializing upload...');

        const currentSerial = serialNumber;
        // Declare OUTSIDE try so catch can always clear it
        let pollInterval = null;

        try {
            const formData = new FormData();
            formData.append('serial_number', currentSerial);

            if (selectedFiles) {
                for (let i = 0; i < selectedFiles.length; i++) {
                    formData.append('files', selectedFiles[i]);
                }
            }

            setShowAddModal(false);

            // 1. Start Polling for unified backend progress
            pollInterval = setInterval(async () => {
                try {
                    const encodedSN = encodeURIComponent(currentSerial);
                    const statusRes = await api.get(`/engines/upload-status/${encodedSN}`);
                    const d = statusRes.data;
                    const serverProgress = d.progress ?? 0;

                    // Update UI whenever we have server info
                    if (d.status === 'running' || serverProgress > 0) {
                        // Dynamically update stage based on progress
                        const stage = serverProgress <= 30
                            ? 'Saving files to server...'
                            : 'Uploading files to Box...';
                        setUploadStage(stage);

                        setUploadProgress(serverProgress);
                        setUploadFilesCompleted(d.completed ?? 0);
                        setUploadFilesTotal(d.total ?? 0);
                        setUploadErrors(d.errors ?? []);
                    }

                    // Terminal states: always stop polling
                    if (d.status === 'done' || d.status === 'error' || serverProgress >= 100) {
                        clearInterval(pollInterval);
                        pollInterval = null;
                        const succeeded = (d.total ?? 0) - (d.errors?.length ?? 0);
                        setUploadSummary({
                            serial: currentSerial,
                            succeeded,
                            total: d.total ?? 0,
                            errors: d.errors ?? [],
                            isError: d.status === 'error',
                        });
                        setUploadComplete(true);
                        setUploadedEngineSerial(currentSerial);
                        setTimeout(() => setUploadComplete(false), 12000);
                        fetchEngines();
                        setIsUploading(false);
                        setUploadStage('');
                    }
                } catch (err) {
                    console.error('Polling error:', err);
                }
            }, 1000);

            // 2. Transmit files to backend
            await api.post('/engines/', formData);

            setSerialNumber('');
            setSelectedFiles(null);
        } catch (err) {
            // Always clear the interval on any error
            if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }

            const status = err?.response?.status;
            const detail = err?.response?.data?.detail || '';

            if (status === 400 && detail.toLowerCase().includes('already exists')) {
                alert(`Engine serial number "${currentSerial}" already exists. Please use a different serial number.`);
            } else {
                console.error('Upload failed', err);
                alert(detail || 'Failed to add engine. Check console for details.');
            }

            setIsUploading(false);
            setUploadProgress(0);
            setUploadStage('');
        }
    };

    const confirmDeleteEngine = (engine) => {
        setEngineToDelete(engine);
        setShowDeleteConfirm(true);
    };

    const handleDeleteEngine = async () => {
        if (!engineToDelete) return;

        const serial = engineToDelete.serial_number;
        try {
            await api.delete(`/engines/${engineToDelete.id}`);
            setShowDeleteConfirm(false);
            setEngineToDelete(null);

            // Show success message
            setDeletedEngineSerial(serial);
            setDeleteComplete(true);
            setTimeout(() => setDeleteComplete(false), 5000);

            fetchEngines();
        } catch (error) {
            console.error(error);
            alert('Error deleting engine');
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
                        {isSidebarOpen && <span>Log out</span>}
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
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                        <button
                            onClick={() => { setShowBoxLinkModal(true); setBoxLinkStep(1); setBoxLinkError(''); }}
                            className="btn btn-outline"
                            disabled={isUploading}
                            title="Import folder from Box shared link"
                            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                            <Link2 size={16} /> Import from Box Link
                        </button>
                        <button onClick={() => setShowAddModal(true)} className="btn btn-primary" disabled={isUploading}>
                            <Plus size={18} /> ADD NEW ENGINE
                        </button>
                    </div>
                </div>

                {/* Upload Progress Indicator */}
                {isUploading && !uploadComplete && (
                    <div className="glass-panel animate-fade-in" style={{
                        padding: '2rem',
                        marginBottom: '2rem',
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        color: 'white'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                            <Plane size={32} style={{ animation: 'pulse 2s infinite' }} />
                            <div style={{ flex: 1 }}>
                                <h3 style={{ margin: 0, marginBottom: '0.25rem', color: 'white' }}>
                                    {uploadStage || `Uploading Engine: ${uploadedEngineSerial}`}
                                </h3>
                                <p style={{ margin: 0, opacity: 0.9, fontSize: '0.9rem' }}>
                                    {uploadFilesTotal > 0
                                        ? `${uploadFilesCompleted} / ${uploadFilesTotal} files uploaded`
                                        : 'Preparing upload...'}
                                </p>
                            </div>
                            <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>{uploadProgress}%</span>
                        </div>

                        {/* Progress Bar */}
                        <div style={{
                            width: '100%', height: '12px',
                            background: 'rgba(255,255,255,0.2)', borderRadius: '10px', overflow: 'hidden',
                            marginBottom: '0.75rem'
                        }}>
                            <div style={{
                                width: `${uploadProgress}%`, height: '100%',
                                background: 'white', borderRadius: '10px',
                                transition: 'width 0.5s ease',
                                boxShadow: '0 0 10px rgba(255,255,255,0.5)'
                            }} />
                        </div>

                        {/* Live error list */}
                        {uploadErrors.length > 0 && (
                            <div style={{
                                background: 'rgba(0,0,0,0.25)', borderRadius: '8px',
                                padding: '0.75rem', marginTop: '0.5rem', maxHeight: '120px', overflowY: 'auto'
                            }}>
                                <p style={{ margin: '0 0 0.4rem', fontWeight: 600, fontSize: '0.85rem' }}>
                                    ⚠️ {uploadErrors.length} file{uploadErrors.length > 1 ? 's' : ''} skipped:
                                </p>
                                {uploadErrors.map((e, i) => (
                                    <p key={i} style={{ margin: '2px 0', fontSize: '0.75rem', opacity: 0.85, wordBreak: 'break-all' }}>
                                        • {e}
                                    </p>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Upload Summary / Complete Message */}
                {uploadComplete && uploadSummary && (
                    <div className="glass-panel animate-fade-in" style={{
                        padding: '2rem',
                        marginBottom: '2rem',
                        background: uploadSummary.errors.length > 0
                            ? 'linear-gradient(135deg, #f7971e 0%, #ffd200 100%)'
                            : 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
                        color: uploadSummary.errors.length > 0 ? '#1a1a1a' : 'white',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                            <span style={{ fontSize: '2.5rem' }}>
                                {uploadSummary.errors.length === 0 ? '✅' : '⚠️'}
                            </span>
                            <div>
                                <h3 style={{ margin: 0, marginBottom: '0.25rem' }}>
                                    {uploadSummary.errors.length === 0
                                        ? 'Upload Complete!'
                                        : 'Upload Finished with Skipped Files'}
                                </h3>
                                <p style={{ margin: 0, fontSize: '1rem' }}>
                                    <strong>{uploadSummary.succeeded}</strong> of <strong>{uploadSummary.total}</strong> files
                                    successfully uploaded for engine <strong>{uploadSummary.serial}</strong>.
                                </p>
                            </div>
                        </div>

                        {/* Skipped files list */}
                        {uploadSummary.errors.length > 0 && (
                            <div style={{
                                background: 'rgba(0,0,0,0.1)', borderRadius: '8px',
                                padding: '0.75rem', maxHeight: '180px', overflowY: 'auto'
                            }}>
                                <p style={{ margin: '0 0 0.5rem', fontWeight: 600, fontSize: '0.9rem' }}>
                                    {uploadSummary.errors.length} file{uploadSummary.errors.length > 1 ? 's' : ''} skipped:
                                </p>
                                {uploadSummary.errors.map((e, i) => (
                                    <p key={i} style={{ margin: '3px 0', fontSize: '0.78rem', wordBreak: 'break-all' }}>
                                        • {e}
                                    </p>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Delete Complete Message */}
                {deleteComplete && (
                    <div className="glass-panel animate-fade-in" style={{
                        padding: '1.5rem',
                        marginBottom: '2rem',
                        background: 'linear-gradient(135deg, #f85032 0%, #e73827 100%)',
                        color: 'white',
                        textAlign: 'center'
                    }}>
                        <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🗑️</div>
                        <h3 style={{ margin: 0, marginBottom: '0.5rem', fontSize: '1.2rem', color: 'white' }}>
                            Folder Deleted Successfully
                        </h3>
                        <p style={{ margin: 0, fontSize: '1rem', opacity: 0.9 }}>
                            Engine <strong>{deletedEngineSerial}</strong> and its Box records have been removed.
                        </p>
                    </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
                    {engines.map(eng => (
                        <div key={eng.id} className="glass-panel animate-fade-in" style={{ padding: '1.5rem', transition: 'transform 0.2s', position: 'relative' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{eng.model_name}</h3>
                                    <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>SN: {eng.serial_number}</p>
                                    {eng.box_folder_id && <span style={{ fontSize: '0.8rem', color: 'green' }}>Box Linked</span>}
                                </div>
                                <div style={{ display: 'flex', gap: '8px', zIndex: 10, position: 'relative' }}>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            e.preventDefault();
                                            confirmDeleteEngine(eng);
                                        }}
                                        style={{
                                            background: 'transparent',
                                            border: 'none',
                                            cursor: 'pointer',
                                            padding: '4px',
                                            color: '#e53e3e',
                                            opacity: 0.7,
                                            transition: 'opacity 0.2s',
                                            zIndex: 20
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
                                        onMouseLeave={(e) => e.currentTarget.style.opacity = 0.7}
                                    >
                                        <Trash2 size={20} style={{ pointerEvents: 'none' }} />
                                    </button>
                                    <Plane size={24} color="var(--text-dim)" />
                                </div>
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
                                placeholder="Engine Serial Number"
                                value={serialNumber}
                                onChange={e => setSerialNumber(e.target.value)}
                                required
                                style={{ marginBottom: '1rem' }}
                            />

                            <div style={{ margin: '15px 0', padding: '20px', background: '#f8f9fa', borderRadius: '12px', border: '2px dashed #ccc' }}>
                                <label style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-main)', display: 'block', marginBottom: '12px' }}>
                                    Select Folder from Computer
                                </label>

                                <div style={{ position: 'relative' }}>
                                    <input
                                        type="file"
                                        webkitdirectory=""
                                        directory=""
                                        multiple
                                        onChange={(e) => setSelectedFiles(e.target.files)}
                                        style={{
                                            opacity: 0, position: 'absolute', top: 0, left: 0,
                                            width: '100%', height: '100%', cursor: 'pointer'
                                        }}
                                    />
                                    <div style={{
                                        background: 'white', border: '2px solid var(--primary)', borderRadius: '12px',
                                        padding: '16px', textAlign: 'center', color: 'var(--primary)', fontWeight: 600, pointerEvents: 'none',
                                        transition: 'all 0.2s ease'
                                    }}>
                                        {selectedFiles && selectedFiles.length > 0 ?
                                            `✓ ${selectedFiles.length} files selected` :
                                            '📁 Click to Select Folder'
                                        }
                                    </div>
                                </div>

                                <small style={{ color: '#666', fontSize: '0.8rem', display: 'block', marginTop: '12px', lineHeight: 1.5 }}>
                                    Choose a folder containing your engine records. All files will be uploaded to Box.
                                </small>
                            </div>

                            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                                <button type="button" onClick={() => setShowAddModal(false)} className="btn btn-outline" style={{ flex: 1 }} disabled={isUploading}>Cancel</button>
                                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={isUploading}>
                                    {isUploading ? 'Uploading...' : 'Add Engine'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Box Link Import Modal */}
            {showBoxLinkModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.55)', display: 'flex', justifyContent: 'center', alignItems: 'center',
                    backdropFilter: 'blur(4px)', zIndex: 100
                }}>
                    <div className="glass-panel animate-fade-in" style={{ padding: '2.5rem', width: '480px', background: 'white', borderRadius: '16px' }}>

                        {boxLinkStep === 1 && (
                            <>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem' }}>
                                    <div style={{ background: '#EBF8FF', borderRadius: '50%', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Link2 size={22} color="#3182ce" />
                                    </div>
                                    <div>
                                        <h2 style={{ margin: 0, fontSize: '1.3rem' }}>Import from Box Link</h2>
                                        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-dim)' }}>Copy a folder directly from another Box account</p>
                                    </div>
                                </div>

                                <label style={{ fontWeight: 600, fontSize: '0.9rem', display: 'block', marginBottom: '6px' }}>Engine Serial Number</label>
                                <input
                                    placeholder="e.g. 577270"
                                    value={boxLinkSerial}
                                    onChange={e => setBoxLinkSerial(e.target.value)}
                                    style={{ marginBottom: '1.25rem', width: '100%' }}
                                />

                                <label style={{ fontWeight: 600, fontSize: '0.9rem', display: 'block', marginBottom: '6px' }}>Box Shared Link URL</label>
                                <input
                                    placeholder="https://app.box.com/s/..."
                                    value={boxLinkUrl}
                                    onChange={e => setBoxLinkUrl(e.target.value)}
                                    style={{ marginBottom: '0.5rem', width: '100%' }}
                                />
                                <small style={{ color: '#718096', display: 'block', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                                    Paste the shared link URL for the folder you want to import. The folder must allow downloads.
                                </small>

                                {boxLinkError && (
                                    <p style={{ color: '#e53e3e', fontSize: '0.875rem', marginBottom: '1rem' }}>⚠️ {boxLinkError}</p>
                                )}

                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <button type="button" onClick={() => setShowBoxLinkModal(false)} className="btn btn-outline" style={{ flex: 1 }}>Cancel</button>
                                    <button
                                        type="button"
                                        className="btn btn-primary"
                                        style={{ flex: 1 }}
                                        onClick={() => {
                                            if (!boxLinkSerial.trim() || !boxLinkUrl.trim()) {
                                                setBoxLinkError('Both serial number and Box link are required.');
                                            } else {
                                                setBoxLinkError('');
                                                setBoxLinkStep(2);
                                            }
                                        }}
                                    >
                                        Continue →
                                    </button>
                                </div>
                            </>
                        )}

                        {boxLinkStep === 2 && (
                            <>
                                <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                                    <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🔗</div>
                                    <h2 style={{ margin: 0, marginBottom: '0.5rem' }}>Confirm Import</h2>
                                    <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>Please review the details before proceeding.</p>
                                </div>

                                <div style={{ background: '#F7FAFC', borderRadius: '12px', padding: '1.25rem', marginBottom: '1.5rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                                        <span style={{ color: 'var(--text-dim)', fontSize: '0.875rem' }}>Engine Serial</span>
                                        <strong style={{ fontSize: '0.875rem' }}>{boxLinkSerial}</strong>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', flexDirection: 'column', gap: '4px' }}>
                                        <span style={{ color: 'var(--text-dim)', fontSize: '0.875rem' }}>Box Shared Link</span>
                                        <span style={{ fontSize: '0.78rem', wordBreak: 'break-all', color: '#3182ce' }}>{boxLinkUrl}</span>
                                    </div>
                                </div>

                                <p style={{ color: '#718096', fontSize: '0.85rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                                    The folder from this link will be copied into your Box storage under:
                                    <br /><strong>Company → {boxLinkSerial} → RAW FOLDER</strong>
                                </p>

                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <button type="button" onClick={() => setBoxLinkStep(1)} className="btn btn-outline" style={{ flex: 1 }}>← Back</button>
                                    <button
                                        type="button"
                                        className="btn btn-primary"
                                        style={{ flex: 1 }}
                                        onClick={handleBoxLinkImport}
                                    >
                                        ✓ Start Import
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteConfirm && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center',
                    backdropFilter: 'blur(4px)', zIndex: 100
                }}>
                    <div className="glass-panel animate-fade-in" style={{ padding: '2rem', width: '400px', background: 'white', textAlign: 'center' }}>
                        <div style={{ width: '60px', height: '60px', background: '#ffebeb', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
                            <Trash2 size={32} color="#e53e3e" />
                        </div>

                        <h2 style={{ marginBottom: '0.5rem', color: '#1a202c' }}>Delete Engine?</h2>

                        <p style={{ color: '#718096', marginBottom: '2rem' }}>
                            Are you sure you want to delete <strong style={{ color: '#2d3748' }}>{engineToDelete?.model_name}</strong>?<br />
                            This action cannot be undone and will delete all associated files from Box.
                        </p>

                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button
                                onClick={() => setShowDeleteConfirm(false)}
                                className="btn btn-outline"
                                style={{ flex: 1 }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDeleteEngine}
                                className="btn"
                                style={{
                                    flex: 1,
                                    background: '#e53e3e',
                                    color: 'white',
                                    border: 'none'
                                }}
                            >
                                Delete Engine
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
