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
    const [csn, setCsn] = useState('');
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

    // Unified Add Engine Modal state
    const [uploadMethod, setUploadMethod] = useState('local'); // 'local' or 'box'
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


    const handleAddEngine = async (e) => {
        e.preventDefault();

        if (uploadMethod === 'box' && !boxLinkUrl.trim()) {
            setBoxLinkError('Box shared link is required.');
            return;
        }

        setIsUploading(true);
        setShowAddModal(false);
        const currentSerial = serialNumber;

        if (uploadMethod === 'local') {
            if (!selectedFiles || selectedFiles.length === 0) {
                setIsUploading(false);
                return;
            }

            setUploadStage('Initializing Box folder structure...');
            setUploadProgress(5);
            setUploadFilesTotal(selectedFiles.length);
            setUploadFilesCompleted(0);
            setUploadErrors([]);
            setUploadComplete(false);
            setUploadSummary(null);
            setUploadedEngineSerial(currentSerial);

            try {
                // 1. Extract unique folders (excluding the local root folder name)
                const foldersSet = new Set();
                for (let i = 0; i < selectedFiles.length; i++) {
                    const file = selectedFiles[i];
                    const relPath = file.webkitRelativePath || file.name;
                    const parts = relPath.split('/');
                    if (parts.length > 2) {
                        const folderParts = parts.slice(1, -1);
                        let builtPath = "";
                        for (const p of folderParts) {
                            builtPath = builtPath ? builtPath + "/" + p : p;
                            foldersSet.add(builtPath);
                        }
                    }
                }
                const folders = Array.from(foldersSet);

                // 2. Call init
                const initRes = await api.post('/engines/init', {
                    serial_number: currentSerial,
                    csn_value: parseInt(csn || '0', 10),
                    folders: folders
                });

                const { engine_id, folder_mapping } = initRes.data;

                // 3. Sequential Upload — one file at a time, fully awaited
                setUploadStage('Uploading files to Box...');
                const filesArray = Array.from(selectedFiles);
                let completed = 0;
                let errors = [];

                for (const file of filesArray) {
                    try {
                        const relPath = file.webkitRelativePath || file.name;
                        const parts = relPath.split('/');
                        let semanticPath = "RAW FOLDER";
                        // parts[0] = root folder name on disk (stripped)
                        // parts[last] = file name
                        // Everything in between = subfolder path
                        if (parts.length > 2) {
                            semanticPath = parts.slice(1, -1).join('/');
                        }

                        const targetFolderId = folder_mapping[semanticPath] || folder_mapping["RAW FOLDER"];

                        if (!targetFolderId) {
                            throw new Error(`Could not resolve Box folder ID for path: ${semanticPath}`);
                        }

                        const fd = new FormData();
                        fd.append('box_folder_id', targetFolderId);
                        fd.append('file', file);

                        let retries = 3;
                        let success = false;
                        let lastErr = null;

                        while (retries > 0 && !success) {
                            try {
                                await api.post(`/engines/${engine_id}/upload-single-file`, fd, {
                                    timeout: 1800000, // 30 min timeout for large files via Box chunked upload
                                });
                                success = true;
                            } catch (e) {
                                lastErr = e;
                                retries--;
                                if (retries > 0) {
                                    // Exponential backoff: 3s → 6s → 12s
                                    const waitMs = (4 - retries) * 3000;
                                    console.warn(`Retrying ${file.name} in ${waitMs / 1000}s... (${retries} left)`);
                                    await new Promise(r => setTimeout(r, waitMs));
                                }
                            }
                        }

                        if (!success) {
                            throw lastErr || new Error("Upload failed after 3 attempts");
                        }

                        completed++;
                        setUploadFilesCompleted(completed);
                        setUploadProgress(5 + Math.floor((completed / filesArray.length) * 95));

                    } catch (err) {
                        errors.push(`${file.name}: ${err.message}`);
                        setUploadErrors([...errors]);
                        console.error(`Error uploading ${file.name}:`, err);
                    }
                }


                // Done
                setUploadSummary({
                    serial: currentSerial,
                    succeeded: completed,
                    total: filesArray.length,
                    errors: errors,
                    isError: errors.length > 0
                });
                setUploadComplete(true);
                setTimeout(() => setUploadComplete(false), 12000);
                fetchEngines();
                setIsUploading(false);
                setUploadStage('');

                setSerialNumber('');
                setCsn('');
                setSelectedFiles(null);
            } catch (err) {
                setIsUploading(false);
                setUploadStage('');
                setUploadProgress(0);
                if (err?.response?.status === 400 && err?.response?.data?.detail?.toLowerCase().includes('already exists')) {
                    alert(`Engine serial number "${currentSerial}" already exists. Please use a different serial number.`);
                } else {
                    const detail = err?.response?.data?.detail || err.message;
                    alert(`Upload failed: ${detail}`);
                }
            }
        } else {
            // BOX IMPORT LOGIC
            setUploadProgress(5);
            setUploadComplete(false);
            setUploadSummary(null);
            setUploadErrors([]);
            setUploadFilesCompleted(0);
            setUploadFilesTotal(1);
            setUploadedEngineSerial(currentSerial);
            setUploadStage('Connecting to Box, creating folder structure...');

            let pollInterval = null;

            try {
                const formData = new FormData();
                formData.append('serial_number', currentSerial);
                formData.append('csn', csn || '0');
                formData.append('box_link', boxLinkUrl);

                pollInterval = setInterval(async () => {
                    try {
                        const encodedSN = encodeURIComponent(currentSerial);
                        const statusRes = await api.get(`/engines/upload-status/${encodedSN}`);
                        const d = statusRes.data;
                        const serverProgress = d.progress ?? 0;

                        if (d.status === 'running' || serverProgress > 0) {
                            setUploadStage(serverProgress < 40 ? 'Creating folder structure in Box...' : 'Copying files from source to your Box storage...');
                            setUploadProgress(serverProgress);
                            setUploadFilesCompleted(d.completed ?? 0);
                            setUploadFilesTotal(d.total ?? 0);
                            setUploadErrors(d.errors ?? []);
                        }

                        if (d.status === 'done' || d.status === 'error' || serverProgress >= 100) {
                            clearInterval(pollInterval);
                            pollInterval = null;
                            const succeeded = d.status === 'done' ? 1 : 0;
                            setUploadSummary({
                                serial: currentSerial,
                                succeeded: succeeded,
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
                        }
                    } catch (err) {
                        console.error('Polling error:', err);
                    }
                }, 1500);

                await api.post('/engines/import-from-link', formData);

                setSerialNumber('');
                setCsn('');
                setBoxLinkUrl('');
                setBoxLinkError('');
            } catch (err) {
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
                        <button onClick={() => { setShowAddModal(true); setUploadMethod('local'); setBoxLinkError(''); }} className="btn btn-primary" disabled={isUploading}>
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
                                    <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>SN: {eng.serial_number} | CSN: {eng.csn_value ?? 0}</p>
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

            {showAddModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center',
                    backdropFilter: 'blur(4px)', zIndex: 100
                }}>
                    <div className="glass-panel animate-fade-in" style={{ padding: '2rem', width: '450px', background: 'white', borderRadius: '16px' }}>
                        <h2 style={{ marginBottom: '1.5rem' }}>Add New Engine</h2>

                        {/* Method Selection Tabs */}
                        <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '12px', marginBottom: '1.5rem' }}>
                            <button
                                onClick={() => setUploadMethod('local')}
                                style={{
                                    flex: 1, padding: '10px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                                    background: uploadMethod === 'local' ? 'white' : 'transparent',
                                    boxShadow: uploadMethod === 'local' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none',
                                    fontWeight: 600, color: uploadMethod === 'local' ? 'var(--primary)' : '#64748b',
                                    transition: 'all 0.2s'
                                }}
                            >
                                Local Folder
                            </button>
                            <button
                                onClick={() => setUploadMethod('box')}
                                style={{
                                    flex: 1, padding: '10px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                                    background: uploadMethod === 'box' ? 'white' : 'transparent',
                                    boxShadow: uploadMethod === 'box' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none',
                                    fontWeight: 600, color: uploadMethod === 'box' ? 'var(--primary)' : '#64748b',
                                    transition: 'all 0.2s'
                                }}
                            >
                                Box Link
                            </button>
                        </div>

                        <form onSubmit={handleAddEngine}>
                            <label style={{ fontWeight: 600, fontSize: '0.9rem', display: 'block', marginBottom: '6px' }}>Engine Serial Number</label>
                            <input
                                placeholder="e.g. 577270"
                                value={serialNumber}
                                onChange={e => setSerialNumber(e.target.value)}
                                required
                                style={{ marginBottom: '1.5rem', width: '100%' }}
                            />

                            <label style={{ fontWeight: 600, fontSize: '0.9rem', display: 'block', marginBottom: '6px' }}>CSN (Cycles Since New)</label>
                            <input
                                type="number"
                                placeholder="e.g. 1500 (Optional, defaults to 0)"
                                value={csn}
                                onChange={e => setCsn(e.target.value)}
                                style={{ marginBottom: '1.5rem', width: '100%' }}
                            />

                            {uploadMethod === 'local' ? (
                                <div style={{ margin: '0 0 1.5rem', padding: '20px', background: '#f8f9fa', borderRadius: '12px', border: '2px dashed #cbd5e1' }}>
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
                                    <small style={{ color: '#64748b', fontSize: '0.8rem', display: 'block', marginTop: '12px', lineHeight: 1.5 }}>
                                        All files within the selected folder will be uploaded.
                                    </small>
                                </div>
                            ) : (
                                <div style={{ marginBottom: '1.5rem' }}>
                                    <label style={{ fontWeight: 600, fontSize: '0.9rem', display: 'block', marginBottom: '6px' }}>Box Shared Link URL</label>
                                    <input
                                        placeholder="https://app.box.com/s/..."
                                        value={boxLinkUrl}
                                        onChange={e => setBoxLinkUrl(e.target.value)}
                                        style={{ marginBottom: '0.5rem', width: '100%' }}
                                    />
                                    <small style={{ color: '#64748b', display: 'block', marginBottom: '1rem', lineHeight: 1.5 }}>
                                        Paste the shared link of the folder. It must allow downloads.
                                    </small>
                                    {boxLinkError && (
                                        <p style={{ color: '#e53e3e', fontSize: '0.875rem', marginBottom: '1rem' }}>⚠️ {boxLinkError}</p>
                                    )}
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                                <button type="button" onClick={() => setShowAddModal(false)} className="btn btn-outline" style={{ flex: 1 }} disabled={isUploading}>Cancel</button>
                                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={isUploading}>
                                    {isUploading ? 'Processing...' : (uploadMethod === 'local' ? 'Add Engine' : 'Start Import')}
                                </button>
                            </div>
                        </form>
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
