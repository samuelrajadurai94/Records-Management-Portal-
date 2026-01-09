import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api';
import { FileText, Folder, ArrowLeft, Upload, Settings, RefreshCw, Move } from 'lucide-react';

export default function EngineDetails() {
    const { id } = useParams();
    const [engine, setEngine] = useState(null);
    const [rawFiles, setRawFiles] = useState([]);
    const [segregatedFiles, setSegregatedFiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('raw'); // 'raw' or 'segregated'

    useEffect(() => {
        fetchData();
    }, [id]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const engRes = await api.get(`/engines/${id}`);
            setEngine(engRes.data);

            const filesRes = await api.get(`/files/${id}`);
            const files = filesRes.data;
            setRawFiles(files.filter(f => !f.is_segregated));
            setSegregatedFiles(files.filter(f => f.is_segregated));
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);
        formData.append('folder_name', 'root');
        formData.append('is_segregated', false); // Always upload to raw first

        try {
            await api.post(`/files/upload/${id}`, formData);
            fetchData(); // Refresh list
        } catch (err) {
            alert('Upload failed');
        }
    };

    const handleSegregation = async () => {
        try {
            const res = await api.post(`/segregation/run/${id}`);
            alert(res.data.message);
            fetchData();
        } catch (err) {
            alert('Segregation failed');
        }
    };

    const FileList = ({ files, type }) => {
        if (files.length === 0) {
            return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-dim)' }}>No files in this section.</div>;
        }

        // Group by folder
        const grouped = files.reduce((acc, file) => {
            const folder = file.folder_name || 'root';
            if (!acc[folder]) acc[folder] = [];
            acc[folder].push(file);
            return acc;
        }, {});

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {Object.entries(grouped).map(([folder, folderFiles]) => (
                    <div key={folder} className="glass-panel" style={{ padding: '1rem' }}>
                        {folder !== 'root' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem', fontWeight: 600, color: 'var(--primary)' }}>
                                <Folder size={18} /> {folder}
                            </div>
                        )}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
                            {folderFiles.map(file => (
                                <div key={file.id} style={{ background: 'rgba(255,255,255,0.5)', padding: '10px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '10px', border: '1px solid #e2e8f0' }}>
                                    <FileText size={20} color="var(--text-main)" />
                                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.9rem' }}>
                                        {file.filename}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    if (loading) return <div className="container">Loading...</div>;
    if (!engine) return <div className="container">Engine not found</div>;

    return (
        <div className="container">
            <div style={{ marginBottom: '2rem' }}>
                <Link to="/" className="btn btn-outline" style={{ marginBottom: '1rem', display: 'inline-flex' }}>
                    <ArrowLeft size={16} /> Back to Dashboard
                </Link>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h1 style={{ marginBottom: '0.5rem' }}>{engine.model_name}</h1>
                        <Badge text={`SN: ${engine.serial_number}`} />
                    </div>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
                            <Upload size={18} /> Upload Raw File
                            <input type="file" hidden onChange={handleUpload} />
                        </label>
                        <button onClick={handleSegregation} className="btn" style={{ background: '#2a9d8f', color: 'white' }}>
                            <RefreshCw size={18} /> Do Auto Segregation
                        </button>
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '1rem' }}>
                <TabButton
                    active={activeTab === 'raw'}
                    onClick={() => setActiveTab('raw')}
                    label="Raw Uploaded Files"
                    count={rawFiles.length}
                />
                <TabButton
                    active={activeTab === 'segregated'}
                    onClick={() => setActiveTab('segregated')}
                    label="Segregated Records"
                    count={segregatedFiles.length}
                />
            </div>

            <div className="animate-fade-in">
                <FileList files={activeTab === 'raw' ? rawFiles : segregatedFiles} type={activeTab} />
            </div>
        </div>
    );
}

const TabButton = ({ active, onClick, label, count }) => (
    <button
        onClick={onClick}
        style={{
            background: 'none',
            border: 'none',
            padding: '0.5rem 1rem',
            fontSize: '1.1rem',
            fontWeight: 600,
            color: active ? 'var(--primary)' : 'var(--text-dim)',
            borderBottom: active ? '2px solid var(--primary)' : '2px solid transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
        }}
    >
        {label}
        <span style={{ background: active ? 'var(--primary)' : '#e2e8f0', color: active ? 'white' : 'var(--text-dim)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.8rem' }}>
            {count}
        </span>
    </button>
);

const Badge = ({ text }) => (
    <span style={{
        background: '#e9ecef',
        color: 'var(--text-main)',
        padding: '4px 8px',
        borderRadius: '4px',
        fontSize: '0.9rem',
        fontWeight: 600
    }}>
        {text}
    </span>
);
