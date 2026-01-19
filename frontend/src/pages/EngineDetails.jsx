import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../api';
import { FileText, Folder, FolderOpen, ChevronRight, ChevronDown, ArrowLeft, Search, SortAsc, CheckSquare, LogOut, Loader, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function EngineDetails() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const [engine, setEngine] = useState(null);
    const [folderStructure, setFolderStructure] = useState(null);
    const [selectedFile, setSelectedFile] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [expandedFolders, setExpandedFolders] = useState({});
    const [sidebarWidth, setSidebarWidth] = useState(280);
    const [isResizing, setIsResizing] = useState(false);

    useEffect(() => {
        fetchEngineData();
    }, [id]);

    const fetchEngineData = async () => {
        setLoading(true);
        try {
            const engRes = await api.get(`/engines/${id}`);
            setEngine(engRes.data);

            // Show the page layout immediately after getting metadata
            setLoading(false);

            // Fetch Box folder structure in background
            if (engRes.data.box_folder_id) {
                const structureRes = await api.get(`/engines/${id}/box-structure`);
                setFolderStructure(structureRes.data);

                // Auto-expand root folder
                setExpandedFolders({ [structureRes.data.id]: true });
            }
        } catch (err) {
            console.error(err);
            setLoading(false);
            alert('Error loading engine data');
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

    const toggleFolder = async (folderId) => {
        // Find the folder in the structure to check if it's loaded
        const isExpanded = !!expandedFolders[folderId];

        if (!isExpanded) {
            // Check if we need to load children
            const findAndCheckFolder = (items) => {
                if (items.id === folderId) return items;
                if (items.children) {
                    for (const child of items.children) {
                        const found = findAndCheckFolder(child);
                        if (found) return found;
                    }
                }
                return null;
            };

            const targetFolder = findAndCheckFolder(folderStructure);
            if (targetFolder && targetFolder.type === 'folder' && targetFolder.isLoaded === false) {
                try {
                    const res = await api.get(`/engines/${id}/box-folder/${folderId}`);

                    // Update structure with new children
                    const updateTree = (item) => {
                        if (item.id === folderId) {
                            return { ...item, children: res.data, isLoaded: true };
                        }
                        if (item.children) {
                            return { ...item, children: item.children.map(updateTree) };
                        }
                        return item;
                    };

                    setFolderStructure(updateTree(folderStructure));
                } catch (err) {
                    console.error("Error loading folder contents:", err);
                }
            }
        }

        setExpandedFolders(prev => ({
            ...prev,
            [folderId]: !prev[folderId]
        }));
    };

    const handleMouseDown = (e) => {
        setIsResizing(true);
        e.preventDefault();
    };

    const handleMouseMove = (e) => {
        if (!isResizing) return;
        const newWidth = e.clientX;
        if (newWidth >= 200 && newWidth <= 500) {
            setSidebarWidth(newWidth);
        }
    };

    const handleMouseUp = () => {
        setIsResizing(false);
    };

    useEffect(() => {
        if (isResizing) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        } else {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        }
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing]);

    const FileTreeItem = ({ file, level = 0 }) => {
        const isSelected = selectedFile?.id === file.id;

        return (
            <div
                onClick={() => handleFileClick(file)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '8px 12px',
                    paddingLeft: `${12 + level * 20}px`,
                    cursor: 'pointer',
                    background: isSelected ? 'var(--primary)' : 'transparent',
                    color: isSelected ? 'white' : 'var(--primary)',
                    borderRadius: '4px',
                    marginBottom: '2px',
                    fontWeight: isSelected ? 600 : 400,
                    fontSize: '0.85rem',
                    transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'white';
                }}
                onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'transparent';
                }}
            >
                <FileText size={14} style={{ marginRight: '8px', flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {file.name}
                </span>
            </div>
        );
    };

    const FolderTreeItem = ({ item, level = 0 }) => {
        // Handle both folders and files
        if (item.type === 'file') {
            return <FileTreeItem file={item} level={level} />;
        }

        // Folder rendering
        const isExpanded = expandedFolders[item.id];
        const isFolder = item.type === 'folder';

        return (
            <div>
                <div
                    onClick={() => toggleFolder(item.id)}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '8px 12px',
                        paddingLeft: `${12 + level * 20}px`,
                        cursor: 'pointer',
                        background: 'transparent',
                        color: 'var(--primary)',
                        borderRadius: '4px',
                        marginBottom: '2px',
                        fontWeight: 500,
                        fontSize: '0.9rem',
                        transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'white';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                    }}
                >
                    <span style={{ marginRight: '6px', fontSize: '0.8rem', display: 'flex', alignItems: 'center' }}>
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </span>
                    {isExpanded ? <FolderOpen size={16} style={{ marginRight: '8px' }} /> : <Folder size={16} style={{ marginRight: '8px' }} />}
                    <span>{item.name}</span>
                    {item.file_count > 0 && (
                        <span style={{
                            marginLeft: 'auto',
                            fontSize: '0.75rem',
                            opacity: 0.7,
                            background: '#e0e0e0',
                            padding: '2px 6px',
                            borderRadius: '10px'
                        }}>
                            {item.file_count}
                        </span>
                    )}
                </div>
                {isExpanded && item.children && item.children.length > 0 && item.children.map(child => (
                    <FolderTreeItem key={child.id} item={child} level={level + 1} />
                ))}
                {isExpanded && item.isLoaded && (!item.children || item.children.length === 0) && (
                    <div style={{ paddingLeft: `${32 + level * 20}px`, fontSize: '0.8rem', color: '#999', paddingBottom: '4px' }}>
                        (Empty)
                    </div>
                )}
            </div>
        );
    };

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
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#5fe6efff' }}>
            {/* Header */}
            <div style={{
                background: '#5fe6efff',
                color: 'white',
                padding: '1rem 1.5rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button
                        onClick={() => navigate('/dashboard')}
                        style={{
                            background: 'rgba(255,255,255,0.2)',
                            border: 'none',
                            color: 'var(--primary)',
                            padding: '8px 12px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '1rem'
                        }}
                    >
                        <ArrowLeft size={18} /> Back
                    </button>
                    <h2 style={{ margin: 0, fontSize: '1.2rem' }}>
                        {engine.serial_number}
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
                    <button style={{ fontSize: '1rem', background: 'rgba(255,255,255,0.2)', border: 'none', color: 'var(--primary)', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <SortAsc size={18} /> Sort
                    </button>
                    <button style={{ fontSize: '1rem', background: 'rgba(255,255,255,0.2)', border: 'none', color: 'var(--primary)', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <CheckSquare size={18} /> Task
                    </button>
                    <button onClick={logout} style={{ background: 'transparent', border: 'none', color: 'var(--primary)', padding: '8px', cursor: 'pointer' }}>
                        <LogOut size={18} />
                    </button>
                </div>
            </div>


            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                {/* Sidebar - Complete Folder & File Tree */}
                <div style={{
                    width: `${sidebarWidth}px`,
                    background: '#E3F2FD',
                    borderRight: '1px solid #e0e0e0',
                    overflowY: 'auto',
                    padding: '1rem 0.5rem',
                    position: 'relative'
                }}>
                    {folderStructure && <FolderTreeItem item={folderStructure} />}

                    {/* Resize Handle */}
                    <div
                        onMouseDown={handleMouseDown}
                        style={{
                            position: 'absolute',
                            right: 0,
                            top: 0,
                            bottom: 0,
                            width: '5px',
                            cursor: 'col-resize',
                            background: isResizing ? 'var(--primary)' : 'transparent',
                            transition: 'background 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(2,62,138,0.3)'}
                        onMouseLeave={(e) => !isResizing && (e.currentTarget.style.background = 'transparent')}
                    />
                </div>

                {/* Main Content - File Preview */}
                <div style={{
                    flex: 1,
                    background: 'var(--background)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    position: 'relative'
                }}>
                    {selectedFile && (
                        <button
                            onClick={() => setSelectedFile(null)}
                            style={{
                                position: 'absolute',
                                top: '10px',
                                right: '10px',
                                background: 'rgba(0,0,0,0.5)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '50%',
                                width: '32px',
                                height: '32px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                zIndex: 10,
                                transition: 'background 0.2s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.7)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.5)'}
                            title="Close preview"
                        >
                            <X size={20} />
                        </button>
                    )}
                    {selectedFile && selectedFile.embed_link ? (
                        <iframe
                            src={selectedFile.embed_link}
                            style={{
                                width: '100%',
                                height: '100%',
                                border: 'none'
                            }}
                            title={selectedFile.file_info?.name || selectedFile.name}
                            allowFullScreen
                        />
                    ) : (
                        <div style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>
                            <FileText size={64} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                            <p style={{ fontSize: '1.1rem', margin: 0 }}>
                                {selectedFile ? 'Loading preview...' : 'Select a file to preview'}
                            </p>
                        </div>
                    )}
                </div>

                {/* File Details Panel */}
                {selectedFile && (
                    <div style={{
                        width: '250px',
                        background: '#E3F2FD',
                        borderLeft: '1px solid #e0e0e0',
                        padding: '1rem',
                        overflowY: 'auto',
                        display: 'flex',
                        flexDirection: 'column'
                    }}>
                        <h3 style={{ marginTop: 0, fontSize: '1rem', marginBottom: '1rem' }}>File Details</h3>
                        <div style={{ marginBottom: '1rem' }}>
                            <FileText size={48} color="var(--primary)" style={{ marginBottom: '0.75rem' }} />
                            <p style={{ fontWeight: 600, marginBottom: '0.5rem', wordBreak: 'break-word', fontSize: '0.9rem' }}>
                                {selectedFile.file_info?.name || selectedFile.name}
                            </p>
                            <p style={{ fontSize: '0.8rem', color: '#666', marginBottom: '0.25rem' }}>
                                <strong>Size:</strong> {(selectedFile.file_info?.size / 1024).toFixed(2)} KB
                            </p>
                            <p style={{ fontSize: '0.8rem', color: '#666', marginBottom: '0.25rem' }}>
                                <strong>Type:</strong> {selectedFile.file_info?.extension?.toUpperCase() || 'Unknown'}
                            </p>
                        </div>
                        {selectedFile.download_url && (
                            <a
                                href={selectedFile.download_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn btn-primary"
                                style={{
                                    padding: '8px 16px',
                                    fontSize: '0.85rem',
                                    textDecoration: 'none',
                                    display: 'inline-block',
                                    alignSelf: 'flex-start'
                                }}
                            >
                                Download
                            </a>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
