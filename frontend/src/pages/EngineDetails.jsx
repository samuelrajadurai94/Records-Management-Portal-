import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../api';
import { FileText, Folder, FolderOpen, ChevronRight, ChevronDown, ArrowLeft, Search, SortAsc, CheckSquare, LogOut, Loader } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function EngineDetails() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const [engine, setEngine] = useState(null);
    const [folderStructure, setFolderStructure] = useState(null);
    const [currentFolderId, setCurrentFolderId] = useState(null);
    const [currentFiles, setCurrentFiles] = useState([]);
    const [currentFolders, setCurrentFolders] = useState([]);
    const [selectedFile, setSelectedFile] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [expandedFolders, setExpandedFolders] = useState({});

    useEffect(() => {
        fetchEngineData();
    }, [id]);

    const fetchEngineData = async () => {
        setLoading(true);
        try {
            const engRes = await api.get(`/engines/${id}`);
            setEngine(engRes.data);

            // Fetch Box folder structure
            if (engRes.data.box_folder_id) {
                const structureRes = await api.get(`/engines/${id}/box-structure`);
                setFolderStructure(structureRes.data);
                setCurrentFolderId(structureRes.data.id);

                // Auto-expand root folder
                setExpandedFolders({ [structureRes.data.id]: true });

                // Load root folder contents
                loadFolderContents(structureRes.data.id);
            }
        } catch (err) {
            console.error(err);
            alert('Error loading engine data');
        } finally {
            setLoading(false);
        }
    };

    const loadFolderContents = async (folderId) => {
        try {
            const res = await api.get(`/engines/${id}/box-folder/${folderId}`);
            setCurrentFiles(res.data.files || []);
            setCurrentFolders(res.data.folders || []);
            setCurrentFolderId(folderId);
            setSelectedFile(null);
        } catch (err) {
            console.error(err);
        }
    };

    const handleFileClick = async (file) => {
        try {
            const res = await api.get(`/engines/${id}/box-file/${file.id}`);
            setSelectedFile({ ...file, ...res.data });
        } catch (err) {
            console.error(err);
            alert('Error loading file');
        }
    };

    const toggleFolder = (folderId) => {
        setExpandedFolders(prev => ({
            ...prev,
            [folderId]: !prev[folderId]
        }));
    };

    const FolderTreeItem = ({ folder, level = 0 }) => {
        const isExpanded = expandedFolders[folder.id];
        const isActive = currentFolderId === folder.id;

        return (
            <div>
                <div
                    onClick={() => {
                        toggleFolder(folder.id);
                        loadFolderContents(folder.id);
                    }}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '8px 12px',
                        paddingLeft: `${12 + level * 20}px`,
                        cursor: 'pointer',
                        background: isActive ? 'var(--primary)' : 'transparent',
                        color: isActive ? 'white' : '#333',
                        borderRadius: '4px',
                        marginBottom: '2px',
                        fontWeight: isActive ? 600 : 400,
                        fontSize: '0.9rem',
                        transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                        if (!isActive) e.currentTarget.style.background = '#f0f0f0';
                    }}
                    onMouseLeave={(e) => {
                        if (!isActive) e.currentTarget.style.background = 'transparent';
                    }}
                >
                    {folder.children && folder.children.length > 0 && (
                        <span style={{ marginRight: '6px', fontSize: '0.8rem' }}>
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </span>
                    )}
                    {isExpanded ? <FolderOpen size={16} style={{ marginRight: '8px' }} /> : <Folder size={16} style={{ marginRight: '8px' }} />}
                    <span>{folder.name}</span>
                    {folder.file_count > 0 && (
                        <span style={{
                            marginLeft: 'auto',
                            fontSize: '0.75rem',
                            opacity: 0.7,
                            background: isActive ? 'rgba(255,255,255,0.2)' : '#e0e0e0',
                            padding: '2px 6px',
                            borderRadius: '10px'
                        }}>
                            {folder.file_count}
                        </span>
                    )}
                </div>
                {isExpanded && folder.children && folder.children.map(child => (
                    <FolderTreeItem key={child.id} folder={child} level={level + 1} />
                ))}
            </div>
        );
    };

    const filteredFiles = currentFiles.filter(file =>
        file.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                <Loader size={48} className="spinner" />
            </div>
        );
    }

    if (!engine) return <div className="container">Engine not found</div>;

    if (!engine.box_folder_id) {
        return (
            <div className="container" style={{ textAlign: 'center', padding: '4rem' }}>
                <h2>No Records Available</h2>
                <p style={{ color: 'var(--text-dim)', marginBottom: '2rem' }}>
                    This engine doesn't have any records uploaded to Box yet.
                </p>
                <Link to="/" className="btn btn-primary">
                    <ArrowLeft size={16} /> Back to Dashboard
                </Link>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f5f5f5' }}>
            {/* Header */}
            <div style={{
                background: 'var(--primary)',
                color: 'white',
                padding: '1rem 1.5rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button
                        onClick={() => navigate('/')}
                        style={{
                            background: 'rgba(255,255,255,0.2)',
                            border: 'none',
                            color: 'white',
                            padding: '8px 12px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <ArrowLeft size={16} /> Back
                    </button>
                    <h2 style={{ margin: 0, fontSize: '1.2rem' }}>
                        {engine.serial_number} - {engine.model_name}
                    </h2>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ position: 'relative' }}>
                        <Search size={18} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', opacity: 0.7 }} />
                        <input
                            type="text"
                            placeholder="Search files..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{
                                padding: '8px 12px 8px 36px',
                                borderRadius: '4px',
                                border: 'none',
                                width: '250px',
                                fontSize: '0.9rem'
                            }}
                        />
                    </div>
                    <button style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <SortAsc size={16} /> Sort
                    </button>
                    <button style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <CheckSquare size={16} /> Task
                    </button>
                    <button onClick={logout} style={{ background: 'transparent', border: 'none', color: 'white', padding: '8px', cursor: 'pointer' }}>
                        <LogOut size={18} />
                    </button>
                </div>
            </div>

            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                {/* Sidebar - Folder Tree */}
                <div style={{
                    width: '280px',
                    background: 'white',
                    borderRight: '1px solid #e0e0e0',
                    overflowY: 'auto',
                    padding: '1rem 0.5rem'
                }}>
                    {folderStructure && <FolderTreeItem folder={folderStructure} />}
                </div>

                {/* Main Content - File List */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#333' }}>
                            Total Files: {filteredFiles.length}
                        </h3>
                    </div>

                    {/* Folders */}
                    {currentFolders.length > 0 && (
                        <div style={{ marginBottom: '1.5rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '1rem' }}>
                                {currentFolders.map(folder => (
                                    <div
                                        key={folder.id}
                                        onClick={() => loadFolderContents(folder.id)}
                                        style={{
                                            background: 'white',
                                            padding: '1rem',
                                            borderRadius: '8px',
                                            border: '1px solid #e0e0e0',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            gap: '8px',
                                            transition: 'all 0.2s',
                                            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                                            e.currentTarget.style.transform = 'translateY(-2px)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)';
                                            e.currentTarget.style.transform = 'translateY(0)';
                                        }}
                                    >
                                        <Folder size={40} color="#FFC107" />
                                        <span style={{ fontSize: '0.85rem', textAlign: 'center', wordBreak: 'break-word' }}>
                                            {folder.name}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Files */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '1rem' }}>
                        {filteredFiles.map(file => (
                            <div
                                key={file.id}
                                onClick={() => handleFileClick(file)}
                                style={{
                                    background: 'white',
                                    padding: '1rem',
                                    borderRadius: '8px',
                                    border: selectedFile?.id === file.id ? '2px solid var(--primary)' : '1px solid #e0e0e0',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: '8px',
                                    transition: 'all 0.2s',
                                    boxShadow: selectedFile?.id === file.id ? '0 4px 12px rgba(2,62,138,0.2)' : '0 1px 3px rgba(0,0,0,0.05)'
                                }}
                                onMouseEnter={(e) => {
                                    if (selectedFile?.id !== file.id) {
                                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                                        e.currentTarget.style.transform = 'translateY(-2px)';
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (selectedFile?.id !== file.id) {
                                        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)';
                                        e.currentTarget.style.transform = 'translateY(0)';
                                    }
                                }}
                            >
                                <FileText size={40} color="var(--primary)" />
                                <span style={{ fontSize: '0.85rem', textAlign: 'center', wordBreak: 'break-word' }}>
                                    {file.name}
                                </span>
                            </div>
                        ))}
                    </div>

                    {filteredFiles.length === 0 && currentFolders.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '3rem', color: '#999' }}>
                            <FileText size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                            <p>No files in this folder</p>
                        </div>
                    )}
                </div>

                {/* File Preview Panel */}
                {selectedFile && (
                    <div style={{
                        width: '350px',
                        background: 'white',
                        borderLeft: '1px solid #e0e0e0',
                        padding: '1.5rem',
                        overflowY: 'auto'
                    }}>
                        <h3 style={{ marginTop: 0, fontSize: '1.1rem', marginBottom: '1rem' }}>File Details</h3>
                        <div style={{ marginBottom: '1rem' }}>
                            <FileText size={64} color="var(--primary)" style={{ marginBottom: '1rem' }} />
                            <p style={{ fontWeight: 600, marginBottom: '0.5rem', wordBreak: 'break-word' }}>
                                {selectedFile.file_info?.name || selectedFile.name}
                            </p>
                            <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.25rem' }}>
                                <strong>Size:</strong> {(selectedFile.file_info?.size / 1024).toFixed(2)} KB
                            </p>
                            <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.25rem' }}>
                                <strong>Type:</strong> {selectedFile.file_info?.extension?.toUpperCase() || 'Unknown'}
                            </p>
                        </div>
                        {selectedFile.download_url && (
                            <a
                                href={selectedFile.download_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn btn-primary"
                                style={{ width: '100%', justifyContent: 'center', textDecoration: 'none' }}
                            >
                                Download / View
                            </a>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
