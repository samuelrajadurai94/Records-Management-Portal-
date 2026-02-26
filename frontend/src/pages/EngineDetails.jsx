import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../api';
import {
    FileText, Folder, FolderOpen, ChevronRight, ChevronDown,
    ArrowLeft, Search, SortAsc, CheckSquare, LogOut, Loader, X,
    Shuffle, CheckCircle, AlertCircle, Clock
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

// ─── Method badge colours ────────────────────────────────────────────────────
const METHOD_COLORS = {
    'Folder Match': { bg: '#e8f5e9', color: '#2e7d32' },
    'AI MODEL': { bg: '#e3f2fd', color: '#1565c0' },
    'Direct Keyword': { bg: '#fff3e0', color: '#e65100' },
    'Manual': { bg: '#fce4ec', color: '#880e4f' },
    'Extension': { bg: '#f3e5f5', color: '#6a1b9a' },
    'Unclassified': { bg: '#f5f5f5', color: '#616161' },
};

const CATEGORY_ICONS = {
    'Engine Data Plate': '🔩',
    '16. Last Borescope Inspection': '📷',
    '14. Shop Visit Records': '🛠️',
    '20. LLP BTB Trace': '📋',
    '12. Manufacturer Delivery Docs': '📦',
    '17. Commercial': '💼',
    'Historical Misc': '🗂️',
    '21. AD': '⚠️',
    '22. SB': '📝',
    '26. QEC-LRU Inventory': '🔧',
    'Archive': '🗄️',
    'Other File Types': '📄',
    'Manual Segregation': '✋',
};

function getCategoryIcon(cat) {
    return CATEGORY_ICONS[cat] || '📁';
}

export default function EngineDetails() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user, logout } = useAuth();

    // RAW FOLDER state
    const [engine, setEngine] = useState(null);
    const [folderStructure, setFolderStructure] = useState(null);
    const [selectedFile, setSelectedFile] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [expandedFolders, setExpandedFolders] = useState({});
    const [sidebarWidth, setSidebarWidth] = useState(280);
    const [isResizing, setIsResizing] = useState(false);
    const [activeTab, setActiveTab] = useState('RAW FOLDER');

    // Segregation state
    const [segStatus, setSegStatus] = useState('idle');  // idle|running|done|error
    const [segData, setSegData] = useState(null);    // { summary, segregated }
    const [expandedCategories, setExpandedCategories] = useState({});
    const [segLoading, setSegLoading] = useState(false);
    const [segSelectedFile, setSegSelectedFile] = useState(null);
    const [segPollInterval, setSegPollInterval] = useState(null);

    // Metadata Extraction state
    const [extractionStatus, setExtractionStatus] = useState('idle'); // idle|running|done|error|all_done
    const [extractionProgress, setExtractionProgress] = useState({ total: 0, completed: 0 });
    const [extractionPollInterval, setExtractionPollInterval] = useState(null);
    const [fileStats, setFileStats] = useState(null);

    // Metadata Tagging state
    const [taggingStatus, setTaggingStatus] = useState('idle'); // idle|running|done|error
    const [taggingProgress, setTaggingProgress] = useState({ total: 0, completed: 0 });
    const [taggingPollInterval, setTaggingPollInterval] = useState(null);
    const [taggingError, setTaggingError] = useState(null);

    const tabs = ['RAW FOLDER', 'FOLDER SEGREGATION', 'META DATA TAGGING', 'OPEN ITEM LIST', 'LLP TRACE', 'MINIPACK'];

    // ── Fetch file stats for metadata tab ──────────────────────────────────
    const fetchFileStats = useCallback(async () => {
        try {
            const res = await api.get(`/metadata/stats/${id}`);
            const stats = res.data;
            setFileStats(stats);
            // Auto-detect if all PDFs already have text
            if (stats.total_pdf_files > 0 && stats.pdfs_with_text >= stats.total_pdf_files && extractionStatus === 'idle') {
                setExtractionStatus('all_done');
            }
        } catch (err) {
            console.error('Failed to fetch file stats:', err);
        }
    }, [id, extractionStatus]);

    // Auto-fetch stats when switching to META DATA TAGGING tab
    useEffect(() => {
        if (activeTab === 'META DATA TAGGING') {
            fetchFileStats();
        }
    }, [activeTab, fetchFileStats]);

    // ── Start Metadata Tagging ──────────────────────────────────────────────
    const startMetadataTagging = useCallback(async () => {
        setTaggingError(null);
        setTaggingStatus('running');
        setTaggingProgress({ total: 0, completed: 0 });
        try {
            await api.post(`/metadata/tag/${id}`);
            const interval = setInterval(async () => {
                try {
                    const res = await api.get(`/metadata/tag/status/${id}`);
                    const data = res.data;
                    setTaggingProgress({ total: data.total, completed: data.completed });
                    if (data.status === 'done') {
                        clearInterval(interval);
                        setTaggingPollInterval(null);
                        setTaggingStatus('done');
                    } else if (data.status === 'error') {
                        clearInterval(interval);
                        setTaggingPollInterval(null);
                        setTaggingStatus('error');
                        setTaggingError(data.error || 'Metadata tagging failed. Check server logs.');
                    }
                } catch (pollErr) {
                    console.error('Tagging poll error:', pollErr);
                }
            }, 3000);
            setTaggingPollInterval(interval);
        } catch (err) {
            console.error('Failed to start tagging:', err);
            setTaggingStatus('error');
            setTaggingError(err?.response?.data?.detail || 'Failed to start metadata tagging.');
        }
    }, [id]);

    // ── Fetch engine + Box structure ─────────────────────────────────────
    const fetchEngineData = useCallback(async () => {
        setLoading(true);
        try {
            const engRes = await api.get(`/engines/${id}`);
            setEngine(engRes.data);
            setLoading(false);
            if (engRes.data.box_folder_id) {
                const structureRes = await api.get(`/engines/${id}/box-structure`);
                setFolderStructure(structureRes.data);
                setExpandedFolders({ [structureRes.data.id]: true });
            }
        } catch (err) {
            console.error(err);
            setLoading(false);
            alert('Error loading engine data');
        }
    }, [id]);

    // Check if results already exist on load
    const fetchExistingResults = useCallback(async () => {
        try {
            const res = await api.get(`/segregation/results/${id}`);
            if (res.data.summary?.total_files > 0) {
                setSegData(res.data);
                setSegStatus(res.data.status || 'done');
            }
        } catch (_) { }
    }, [id]);

    useEffect(() => {
        fetchEngineData();
        fetchExistingResults();
    }, [id]);

    // Cleanup polling on unmount
    useEffect(() => {
        return () => { if (segPollInterval) clearInterval(segPollInterval); };
    }, [segPollInterval]);

    // ── Segregation trigger ───────────────────────────────────────────────
    const handleRunSegregation = async () => {
        if (segStatus === 'running') return;
        setSegStatus('running');
        setSegData(null);
        try {
            await api.post(`/segregation/run-box/${id}`);
            // Poll for completion
            const interval = setInterval(async () => {
                try {
                    const statusRes = await api.get(`/segregation/status/${id}`);
                    const s = statusRes.data.status;
                    if (s === 'done' || s === 'error') {
                        clearInterval(interval);
                        setSegPollInterval(null);
                        setSegStatus(s);
                        if (s === 'done') {
                            const resRes = await api.get(`/segregation/results/${id}`);
                            setSegData(resRes.data);
                        }
                    }
                } catch (_) { }
            }, 3000);
            setSegPollInterval(interval);
        } catch (err) {
            setSegStatus('error');
            console.error(err);
        }
    };

    // ── File click (Box embed) ─────────────────────────────────────────────
    const handleFileClick = async (file) => {
        try {
            const res = await api.get(`/engines/${id}/box-file/${file.id || file.box_file_id}`);
            setSelectedFile({ ...file, ...res.data });
        } catch (err) {
            console.error(err);
            alert('Error loading file');
        }
    };

    const handleSegFileClick = async (file) => {
        try {
            const res = await api.get(`/engines/${id}/box-file/${file.box_file_id}`);
            setSegSelectedFile({ ...file, ...res.data });
        } catch (err) {
            console.error(err);
            alert('Error loading file');
        }
    };

    // ── RAW FOLDER tree helpers ────────────────────────────────────────────
    const toggleFolder = async (folderId) => {
        const isExpanded = !!expandedFolders[folderId];
        if (!isExpanded) {
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
                    const updateTree = (item) => {
                        if (item.id === folderId) return { ...item, children: res.data, isLoaded: true };
                        if (item.children) return { ...item, children: item.children.map(updateTree) };
                        return item;
                    };
                    setFolderStructure(updateTree(folderStructure));
                } catch (err) {
                    console.error('Error loading folder contents:', err);
                }
            }
        }
        setExpandedFolders(prev => ({ ...prev, [folderId]: !prev[folderId] }));
    };

    // ── Sidebar resize ────────────────────────────────────────────────────
    const handleMouseDown = (e) => { setIsResizing(true); e.preventDefault(); };
    const handleMouseMove = (e) => {
        if (!isResizing) return;
        const w = e.clientX;
        if (w >= 200 && w <= 500) setSidebarWidth(w);
    };
    const handleMouseUp = () => setIsResizing(false);

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

    // ── RAW FOLDER tree components ────────────────────────────────────────
    const FileTreeItem = ({ file, level = 0 }) => {
        const isSelected = selectedFile?.id === file.id;
        return (
            <div
                onClick={() => handleFileClick(file)}
                style={{
                    display: 'flex', alignItems: 'center',
                    padding: '8px 12px', paddingLeft: `${12 + level * 20}px`,
                    cursor: 'pointer',
                    background: isSelected ? 'var(--primary)' : 'transparent',
                    color: isSelected ? 'white' : 'var(--primary)',
                    borderRadius: '4px', marginBottom: '2px',
                    fontWeight: isSelected ? 600 : 400,
                    fontSize: '0.85rem', transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'white'; }}
                onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
            >
                <FileText size={14} style={{ marginRight: '8px', flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {file.name}
                </span>
            </div>
        );
    };

    const FolderTreeItem = ({ item, level = 0 }) => {
        if (item.type === 'file') return <FileTreeItem file={item} level={level} />;
        const isExpanded = expandedFolders[item.id];
        return (
            <div>
                <div
                    onClick={() => toggleFolder(item.id)}
                    style={{
                        display: 'flex', alignItems: 'center',
                        padding: '8px 12px', paddingLeft: `${12 + level * 20}px`,
                        cursor: 'pointer', background: 'transparent',
                        color: 'var(--primary)', borderRadius: '4px',
                        marginBottom: '2px', fontWeight: 500,
                        fontSize: '0.9rem', transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'white'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                    <span style={{ marginRight: '6px', display: 'flex', alignItems: 'center' }}>
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </span>
                    {isExpanded
                        ? <FolderOpen size={16} style={{ marginRight: '8px' }} />
                        : <Folder size={16} style={{ marginRight: '8px' }} />}
                    <span>{item.name}</span>
                    {item.file_count > 0 && (
                        <span style={{
                            marginLeft: 'auto', fontSize: '0.75rem', opacity: 0.7,
                            background: '#e0e0e0', padding: '2px 6px', borderRadius: '10px'
                        }}>{item.file_count}</span>
                    )}
                </div>
                {isExpanded && item.children && item.children.length > 0 &&
                    item.children.map(child => <FolderTreeItem key={child.id} item={child} level={level + 1} />)}
                {isExpanded && item.isLoaded && (!item.children || item.children.length === 0) && (
                    <div style={{ paddingLeft: `${32 + level * 20}px`, fontSize: '0.8rem', color: '#999', paddingBottom: '4px' }}>
                        (Empty)
                    </div>
                )}
            </div>
        );
    };

    // ── FOLDER SEGREGATION tab components ─────────────────────────────────
    const SegStatusBadge = () => {
        if (segStatus === 'running') return (
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#1565c0', fontSize: '0.8rem' }}>
                <Loader size={14} className="spinner" /> Processing...
            </span>
        );
        if (segStatus === 'done') return (
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#2e7d32', fontSize: '0.8rem' }}>
                <CheckCircle size={14} /> Segregation Complete
            </span>
        );
        if (segStatus === 'error') return (
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#c62828', fontSize: '0.8rem' }}>
                <AlertCircle size={14} /> Failed
            </span>
        );
        return null;
    };

    // ── Helpers: build a nested folder tree from flat file list ──────────
    const TREE_METHODS = new Set(['Folder Match', 'Extension', 'Unclassified', 'Manual']);

    function buildFolderTree(files) {
        const root = { name: '', children: {}, files: [] };
        for (const file of files) {
            const pathStr = file.original_folder_path || '';
            if (!pathStr) {
                root.files.push(file);
                continue;
            }
            const parts = pathStr.split('/').filter(Boolean);
            let node = root;
            for (const part of parts) {
                if (!node.children[part]) {
                    node.children[part] = { name: part, children: {}, files: [] };
                }
                node = node.children[part];
            }
            node.files.push(file);
        }
        return root;
    }

    function countTreeFiles(node) {
        let count = node.files.length;
        for (const child of Object.values(node.children)) {
            count += countTreeFiles(child);
        }
        return count;
    }

    // ── Recursive folder-node renderer ────────────────────────────────────
    const SegFolderNode = ({ node, level = 1, pathKey = '' }) => {
        const nodeKey = pathKey ? `${pathKey}/${node.name}` : node.name;
        const isOpen = !!expandedCategories[`_folder_${nodeKey}`];
        const childEntries = Object.values(node.children);
        const hasContent = childEntries.length > 0 || node.files.length > 0;
        if (!hasContent) return null;
        const fileCount = countTreeFiles(node);

        return (
            <div>
                {/* Folder row */}
                <div
                    onClick={() => setExpandedCategories(prev => ({
                        ...prev, [`_folder_${nodeKey}`]: !prev[`_folder_${nodeKey}`]
                    }))}
                    style={{
                        display: 'flex', alignItems: 'center',
                        padding: '6px 8px', paddingLeft: `${10 + level * 18}px`,
                        cursor: 'pointer', background: 'transparent',
                        color: 'var(--primary)', borderRadius: '5px',
                        marginBottom: '1px', fontWeight: 500,
                        fontSize: '0.8rem', transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.6)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                    <span style={{ marginRight: '4px', display: 'flex', alignItems: 'center' }}>
                        {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </span>
                    {isOpen
                        ? <FolderOpen size={14} style={{ marginRight: '6px', color: '#f59e0b' }} />
                        : <Folder size={14} style={{ marginRight: '6px', color: '#f59e0b' }} />}
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {node.name}
                    </span>
                    <span style={{
                        background: '#e8eaf6', color: '#3949ab',
                        borderRadius: '10px', padding: '0px 6px',
                        fontSize: '0.65rem', fontWeight: 700, marginLeft: '4px'
                    }}>{fileCount}</span>
                </div>

                {/* Expanded children */}
                {isOpen && (
                    <>
                        {/* Sub-folders first */}
                        {childEntries
                            .sort((a, b) => a.name.localeCompare(b.name))
                            .map(child => (
                                <SegFolderNode key={child.name} node={child} level={level + 1} pathKey={nodeKey} />
                            ))
                        }
                        {/* Files at this level */}
                        {node.files.map(file => {
                            const mStyle = METHOD_COLORS[file.method] || METHOD_COLORS['Unclassified'];
                            const isSelected = segSelectedFile?.box_file_id === file.box_file_id;
                            return (
                                <div
                                    key={file.box_file_id}
                                    onClick={() => handleSegFileClick(file)}
                                    style={{
                                        display: 'flex', flexDirection: 'column',
                                        paddingLeft: `${10 + (level + 1) * 18}px`, paddingRight: '8px',
                                        paddingTop: '4px', paddingBottom: '4px',
                                        cursor: 'pointer', borderRadius: '4px',
                                        background: isSelected ? 'var(--primary)' : 'transparent',
                                        color: isSelected ? 'white' : 'inherit',
                                        marginBottom: '1px', transition: 'background 0.15s',
                                    }}
                                    onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.7)'; }}
                                    onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <FileText size={12} style={{ flexShrink: 0, opacity: 0.7 }} />
                                        <span style={{
                                            fontSize: '0.76rem', fontWeight: 500,
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                            flex: 1
                                        }}>{file.box_file_name}</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', paddingLeft: '18px', marginTop: '2px', flexWrap: 'wrap' }}>
                                        <span style={{
                                            fontSize: '0.63rem', padding: '1px 5px', borderRadius: '8px',
                                            background: isSelected ? 'rgba(255,255,255,0.25)' : mStyle.bg,
                                            color: isSelected ? 'white' : mStyle.color, fontWeight: 600
                                        }}>{file.method}</span>
                                        {file.confidence > 0 && (
                                            <span style={{ fontSize: '0.63rem', opacity: 0.7 }}>
                                                {(file.confidence * 100).toFixed(0)}%
                                            </span>
                                        )}
                                        {file.original_folder_path && (
                                            <span style={{
                                                fontSize: '0.6rem', opacity: 0.55,
                                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                maxWidth: '140px'
                                            }} title={file.original_folder_path}>
                                                📂 {file.original_folder_path}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </>
                )}
            </div>
        );
    };

    // ── Flat file-item renderer (for Direct Keyword / AI MODEL) ───────────
    const SegFlatFileItem = ({ file }) => {
        const mStyle = METHOD_COLORS[file.method] || METHOD_COLORS['Unclassified'];
        const isSelected = segSelectedFile?.box_file_id === file.box_file_id;
        return (
            <div
                onClick={() => handleSegFileClick(file)}
                style={{
                    display: 'flex', flexDirection: 'column',
                    paddingLeft: '28px', paddingRight: '8px',
                    paddingTop: '5px', paddingBottom: '5px',
                    cursor: 'pointer', borderRadius: '4px',
                    background: isSelected ? 'var(--primary)' : 'transparent',
                    color: isSelected ? 'white' : 'inherit',
                    marginBottom: '1px', transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.7)'; }}
                onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <FileText size={12} style={{ flexShrink: 0, opacity: 0.7 }} />
                    <span style={{
                        fontSize: '0.78rem', fontWeight: 500,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        flex: 1
                    }}>{file.box_file_name}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', paddingLeft: '18px', marginTop: '2px' }}>
                    <span style={{
                        fontSize: '0.65rem', padding: '1px 5px', borderRadius: '8px',
                        background: isSelected ? 'rgba(255,255,255,0.25)' : mStyle.bg,
                        color: isSelected ? 'white' : mStyle.color, fontWeight: 600
                    }}>{file.method}</span>
                    {file.confidence > 0 && (
                        <span style={{ fontSize: '0.65rem', opacity: 0.7 }}>
                            {(file.confidence * 100).toFixed(0)}%
                        </span>
                    )}
                    {file.original_folder_path && (
                        <span style={{
                            fontSize: '0.62rem', opacity: 0.6,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            maxWidth: '120px'
                        }} title={file.original_folder_path}>
                            📂 {file.original_folder_path.split('/').pop()}
                        </span>
                    )}
                </div>
            </div>
        );
    };

    const SegCategoryTree = () => {
        if (!segData || !segData.segregated) return null;
        const { segregated, summary } = segData;

        return (
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                {/* Left: category tree sidebar */}
                <div style={{
                    width: `${sidebarWidth}px`, background: '#E3F2FD',
                    borderRight: '1px solid #e0e0e0', overflowY: 'auto',
                    padding: '0.75rem 0.5rem', position: 'relative'
                }}>
                    {/* Summary bar */}
                    <div style={{
                        background: 'white', borderRadius: '8px',
                        padding: '8px 10px', marginBottom: '10px',
                        fontSize: '0.72rem', color: '#555',
                        display: 'flex', flexWrap: 'wrap', gap: '6px'
                    }}>
                        <span>📂 <b>{summary.total_files}</b> files</span>
                        <span>📄 <b>{summary.pdf_files}</b> PDFs</span>
                        <span>🖼 <b>{summary.media_files}</b> media</span>
                        <span>📎 <b>{summary.other_files}</b> other</span>
                        <span>🗂 <b>{summary.categories_found}</b> categories</span>
                    </div>

                    {Object.entries(segregated).map(([category, files]) => {
                        const isOpen = !!expandedCategories[category];

                        // Separate files: tree-methods vs flat-methods (exclude latest — shown in ⭐ Latest folder only)
                        const treeFiles = files.filter(f => TREE_METHODS.has(f.method) && !f.latest);
                        const flatFiles = files.filter(f => !TREE_METHODS.has(f.method) && !f.latest);
                        const folderTree = treeFiles.length > 0 ? buildFolderTree(treeFiles) : null;

                        return (
                            <div key={category}>
                                {/* Category folder row */}
                                <div
                                    onClick={() => setExpandedCategories(prev => ({
                                        ...prev, [category]: !prev[category]
                                    }))}
                                    style={{
                                        display: 'flex', alignItems: 'center',
                                        padding: '8px 10px', cursor: 'pointer',
                                        background: 'transparent', color: 'var(--primary)',
                                        borderRadius: '6px', marginBottom: '2px',
                                        fontWeight: 600, fontSize: '0.85rem',
                                        transition: 'background 0.2s',
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.background = 'white'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                                >
                                    <span style={{ marginRight: '4px', display: 'flex', alignItems: 'center' }}>
                                        {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                                    </span>
                                    {isOpen
                                        ? <FolderOpen size={15} style={{ marginRight: '6px', color: '#f59e0b' }} />
                                        : <Folder size={15} style={{ marginRight: '6px', color: '#f59e0b' }} />}
                                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {getCategoryIcon(category)} {category}
                                    </span>
                                    <span style={{
                                        background: '#dbeafe', color: '#1d4ed8',
                                        borderRadius: '10px', padding: '1px 7px',
                                        fontSize: '0.7rem', fontWeight: 700, marginLeft: '4px'
                                    }}>{files.length}</span>
                                </div>

                                {/* Expanded content */}
                                {isOpen && (() => {
                                    const latestFiles = files.filter(f => f.latest);
                                    const latestKey = `_latest_${category}`;
                                    const isLatestOpen = !!expandedCategories[latestKey];
                                    return (
                                        <>
                                            {/* ⭐ Latest folder — shown only if any latest files exist */}
                                            {latestFiles.length > 0 && (
                                                <div>
                                                    <div
                                                        onClick={() => setExpandedCategories(prev => ({
                                                            ...prev, [latestKey]: !prev[latestKey]
                                                        }))}
                                                        style={{
                                                            display: 'flex', alignItems: 'center',
                                                            padding: '6px 8px', paddingLeft: '28px',
                                                            cursor: 'pointer', background: 'transparent',
                                                            color: '#2e7d32', borderRadius: '5px',
                                                            marginBottom: '1px', fontWeight: 600,
                                                            fontSize: '0.8rem', transition: 'background 0.15s',
                                                        }}
                                                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(232,245,233,0.7)'; }}
                                                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                                                    >
                                                        <span style={{ marginRight: '4px', display: 'flex', alignItems: 'center' }}>
                                                            {isLatestOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                                        </span>
                                                        {isLatestOpen
                                                            ? <FolderOpen size={14} style={{ marginRight: '6px', color: '#2e7d32' }} />
                                                            : <Folder size={14} style={{ marginRight: '6px', color: '#2e7d32' }} />}
                                                        <span style={{ flex: 1 }}>⭐ Latest</span>
                                                        <span style={{
                                                            background: '#e8f5e9', color: '#2e7d32',
                                                            borderRadius: '10px', padding: '0px 6px',
                                                            fontSize: '0.65rem', fontWeight: 700, marginLeft: '4px'
                                                        }}>{latestFiles.length}</span>
                                                    </div>
                                                    {isLatestOpen && latestFiles.map(file => (
                                                        <SegFlatFileItem key={`latest_${file.box_file_id}`} file={file} />
                                                    ))}
                                                </div>
                                            )}
                                            {/* Tree-rendered files (Folder Match / Manual / Extension / Unclassified) */}
                                            {folderTree && (
                                                <>
                                                    {/* Files at root level (no folder path) */}
                                                    {folderTree.files.map(file => (
                                                        <SegFlatFileItem key={file.box_file_id} file={file} />
                                                    ))}
                                                    {/* Nested folder nodes */}
                                                    {Object.values(folderTree.children)
                                                        .sort((a, b) => a.name.localeCompare(b.name))
                                                        .map(child => (
                                                            <SegFolderNode key={child.name} node={child} level={1} pathKey={category} />
                                                        ))
                                                    }
                                                </>
                                            )}
                                            {/* Flat-rendered files (Direct Keyword / AI MODEL) */}
                                            {flatFiles.map(file => (
                                                <SegFlatFileItem key={file.box_file_id} file={file} />
                                            ))}
                                        </>
                                    );
                                })()}
                            </div>
                        );
                    })}

                    {/* Resize handle */}
                    <div
                        onMouseDown={handleMouseDown}
                        style={{
                            position: 'absolute', right: 0, top: 0, bottom: 0, width: '5px',
                            cursor: 'col-resize',
                            background: isResizing ? 'var(--primary)' : 'transparent',
                            transition: 'background 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(2,62,138,0.3)'}
                        onMouseLeave={(e) => !isResizing && (e.currentTarget.style.background = 'transparent')}
                    />
                </div>

                {/* Right: file preview */}
                <div style={{
                    flex: 1, background: 'var(--background)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden', position: 'relative'
                }}>
                    {segSelectedFile && (
                        <button
                            onClick={() => setSegSelectedFile(null)}
                            style={{
                                position: 'absolute', top: '10px', right: '10px',
                                background: 'rgba(0,0,0,0.5)', color: 'white',
                                border: 'none', borderRadius: '50%',
                                width: '32px', height: '32px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer', zIndex: 10
                            }}
                            title="Close preview"
                        ><X size={20} /></button>
                    )}
                    {segSelectedFile && segSelectedFile.embed_link ? (
                        <iframe
                            src={segSelectedFile.embed_link}
                            style={{ width: '100%', height: '100%', border: 'none' }}
                            title={segSelectedFile.box_file_name}
                            allowFullScreen
                        />
                    ) : (
                        <div style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>
                            <FileText size={64} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                            <p style={{ fontSize: '1.1rem', margin: 0 }}>
                                {segSelectedFile ? 'Loading preview...' : 'Select a file to preview'}
                            </p>
                        </div>
                    )}
                </div>

                {/* Right detail panel for seg selected file */}
                {segSelectedFile && (
                    <div style={{
                        width: '250px', background: '#E3F2FD',
                        borderLeft: '1px solid #e0e0e0',
                        padding: '1rem', overflowY: 'auto', display: 'flex', flexDirection: 'column'
                    }}>
                        <h3 style={{ marginTop: 0, fontSize: '1rem', marginBottom: '1rem' }}>File Details</h3>
                        <FileText size={40} color="var(--primary)" style={{ marginBottom: '0.75rem' }} />
                        <p style={{ fontWeight: 600, marginBottom: '0.5rem', wordBreak: 'break-word', fontSize: '0.85rem' }}>
                            {segSelectedFile.box_file_name}
                        </p>
                        <div style={{ fontSize: '0.78rem', color: '#555' }}>
                            <p><strong>Category:</strong> {segSelectedFile.category}</p>
                            <p><strong>Method:</strong> {segSelectedFile.method}</p>
                            {segSelectedFile.confidence > 0 && (
                                <p><strong>Confidence:</strong> {(segSelectedFile.confidence * 100).toFixed(1)}%</p>
                            )}
                            {segSelectedFile.original_folder_path && (
                                <p style={{ wordBreak: 'break-all' }}>
                                    <strong>Folder:</strong> {segSelectedFile.original_folder_path}
                                </p>
                            )}
                            {segSelectedFile.status && (
                                <p><strong>Status:</strong> {segSelectedFile.status}</p>
                            )}
                            {segSelectedFile.reason && (
                                <p><strong>Reason:</strong> {segSelectedFile.reason}</p>
                            )}
                        </div>
                        {segSelectedFile.download_url && (
                            <a
                                href={segSelectedFile.download_url}
                                target="_blank" rel="noopener noreferrer"
                                className="btn btn-primary"
                                style={{
                                    padding: '8px 16px', fontSize: '0.85rem',
                                    textDecoration: 'none', display: 'inline-block',
                                    alignSelf: 'flex-start', marginTop: '0.5rem'
                                }}
                            >Download</a>
                        )}
                    </div>
                )}
            </div>
        );
    };

    // ── Guards ────────────────────────────────────────────────────────────
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

    // ── RENDER ────────────────────────────────────────────────────────────
    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#5fe6efff' }}>
            {/* Header */}
            <div style={{
                background: '#5fe6efff', color: 'white',
                padding: '1rem 1.5rem',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button
                        onClick={() => navigate('/dashboard')}
                        style={{
                            background: 'rgba(255,255,255,0.2)', border: 'none',
                            color: 'var(--primary)', padding: '8px 12px', borderRadius: '4px',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '1rem'
                        }}
                    ><ArrowLeft size={18} /> Back</button>
                    <h2 style={{ margin: 0, fontSize: '1.2rem' }}>{engine.serial_number}</h2>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ position: 'relative' }}>
                        <Search size={18} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', opacity: 0.7 }} />
                        <input
                            type="text" placeholder="Search files..."
                            value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                            style={{ padding: '8px 12px 8px 36px', borderRadius: '4px', border: 'none', width: '250px', fontSize: '0.9rem' }}
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

            {/* Tab Bar */}
            <div style={{
                background: 'white', borderBottom: '1px solid #edf2f7',
                display: 'flex', padding: '0.75rem 1.5rem', gap: '0.5rem', alignItems: 'center'
            }}>
                {tabs.map(tab => (
                    <button
                        key={tab} onClick={() => setActiveTab(tab)}
                        style={{
                            padding: '0.6rem 1.25rem', border: 'none',
                            background: activeTab === tab ? 'var(--primary)' : 'transparent',
                            cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700,
                            color: activeTab === tab ? 'white' : '#718096',
                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                            letterSpacing: '0.05em', borderRadius: '100px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: activeTab === tab ? '0 4px 12px rgba(2,62,138,0.25)' : 'none',
                            transform: activeTab === tab ? 'scale(1.02)' : 'scale(1)',
                        }}
                        onMouseEnter={(e) => { if (activeTab !== tab) { e.currentTarget.style.background = '#f7fafc'; e.currentTarget.style.color = 'var(--primary)'; } }}
                        onMouseLeave={(e) => { if (activeTab !== tab) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#718096'; } }}
                    >{tab}</button>
                ))}
            </div>

            {/* ── RAW FOLDER TAB ── */}
            {activeTab === 'RAW FOLDER' && (
                <div style={{ display: 'flex', flex: 1, overflow: 'hidden', flexDirection: 'column' }}>
                    {/* "Do Folder Segregation" button bar */}
                    <div style={{
                        background: 'white', borderBottom: '1px solid #edf2f7',
                        padding: '0.6rem 1rem', display: 'flex', alignItems: 'center', gap: '12px'
                    }}>
                        <button
                            onClick={handleRunSegregation}
                            disabled={segStatus === 'running'}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                padding: '8px 18px', borderRadius: '8px', border: 'none',
                                background: segStatus === 'running' ? '#94a3b8' : 'linear-gradient(135deg, #023e8a, #0077b6)',
                                color: 'white', fontWeight: 700, fontSize: '0.82rem',
                                cursor: segStatus === 'running' ? 'not-allowed' : 'pointer',
                                boxShadow: '0 2px 8px rgba(2,62,138,0.3)',
                                transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => { if (segStatus !== 'running') e.currentTarget.style.opacity = '0.9'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
                        >
                            {segStatus === 'running'
                                ? <Loader size={15} className="spinner" />
                                : <Shuffle size={15} />}
                            {segStatus === 'running' ? 'Segregation Running...' : '🔀 Do Folder Segregation'}
                        </button>
                        <SegStatusBadge />
                        {segStatus === 'done' && (
                            <span
                                style={{ fontSize: '0.78rem', color: '#1565c0', cursor: 'pointer', textDecoration: 'underline' }}
                                onClick={() => setActiveTab('FOLDER SEGREGATION')}
                            >
                                → View Results in Folder Segregation Tab
                            </span>
                        )}
                    </div>

                    {/* Main RAW FOLDER layout */}
                    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                        {/* Sidebar */}
                        <div style={{
                            width: `${sidebarWidth}px`, background: '#E3F2FD',
                            borderRight: '1px solid #e0e0e0', overflowY: 'auto',
                            padding: '1rem 0.5rem', position: 'relative'
                        }}>
                            {folderStructure && <FolderTreeItem item={folderStructure} />}
                            {/* Resize handle */}
                            <div
                                onMouseDown={handleMouseDown}
                                style={{
                                    position: 'absolute', right: 0, top: 0, bottom: 0, width: '5px',
                                    cursor: 'col-resize',
                                    background: isResizing ? 'var(--primary)' : 'transparent',
                                    transition: 'background 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(2,62,138,0.3)'}
                                onMouseLeave={(e) => !isResizing && (e.currentTarget.style.background = 'transparent')}
                            />
                        </div>

                        {/* File preview */}
                        <div style={{
                            flex: 1, background: 'var(--background)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            overflow: 'hidden', position: 'relative'
                        }}>
                            {selectedFile && (
                                <button
                                    onClick={() => setSelectedFile(null)}
                                    style={{
                                        position: 'absolute', top: '10px', right: '10px',
                                        background: 'rgba(0,0,0,0.5)', color: 'white',
                                        border: 'none', borderRadius: '50%',
                                        width: '32px', height: '32px',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        cursor: 'pointer', zIndex: 10, transition: 'background 0.2s'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.7)'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.5)'}
                                    title="Close preview"
                                ><X size={20} /></button>
                            )}
                            {selectedFile && selectedFile.embed_link ? (
                                <iframe
                                    src={selectedFile.embed_link}
                                    style={{ width: '100%', height: '100%', border: 'none' }}
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

                        {/* File details panel */}
                        {selectedFile && (
                            <div style={{
                                width: '250px', background: '#E3F2FD',
                                borderLeft: '1px solid #e0e0e0', padding: '1rem',
                                overflowY: 'auto', display: 'flex', flexDirection: 'column'
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
                                        target="_blank" rel="noopener noreferrer"
                                        className="btn btn-primary"
                                        style={{
                                            padding: '8px 16px', fontSize: '0.85rem',
                                            textDecoration: 'none', display: 'inline-block', alignSelf: 'flex-start'
                                        }}
                                    >Download</a>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── FOLDER SEGREGATION TAB ── */}
            {activeTab === 'FOLDER SEGREGATION' && (
                <div style={{ display: 'flex', flex: 1, overflow: 'hidden', flexDirection: 'column' }}>
                    {/* Top action bar */}
                    <div style={{
                        background: 'white', borderBottom: '1px solid #edf2f7',
                        padding: '0.6rem 1rem', display: 'flex', alignItems: 'center', gap: '14px'
                    }}>
                        <button
                            onClick={handleRunSegregation}
                            disabled={segStatus === 'running'}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                padding: '7px 16px', borderRadius: '8px', border: 'none',
                                background: segStatus === 'running' ? '#94a3b8' : 'linear-gradient(135deg, #023e8a, #0077b6)',
                                color: 'white', fontWeight: 700, fontSize: '0.8rem',
                                cursor: segStatus === 'running' ? 'not-allowed' : 'pointer',
                                boxShadow: '0 2px 6px rgba(2,62,138,0.25)',
                            }}
                        >
                            {segStatus === 'running' ? <Loader size={13} className="spinner" /> : <Shuffle size={13} />}
                            {segStatus === 'running' ? 'Processing...' : '🔄 Re-run Segregation'}
                        </button>
                        <SegStatusBadge />
                    </div>

                    {/* Content */}
                    {segStatus === 'idle' && (
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--background)' }}>
                            <div style={{ textAlign: 'center', opacity: 0.6, maxWidth: '360px' }}>
                                <Shuffle size={52} style={{ marginBottom: '1rem', opacity: 0.4 }} />
                                <h3 style={{ marginBottom: '0.5rem' }}>No Segregation Yet</h3>
                                <p style={{ fontSize: '0.9rem', color: '#666' }}>
                                    Go to the <strong>RAW FOLDER</strong> tab and click
                                    <strong> 🔀 Do Folder Segregation</strong> to automatically classify all engine files.
                                </p>
                            </div>
                        </div>
                    )}
                    {segStatus === 'running' && (
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem', background: 'var(--background)' }}>
                            <Loader size={48} className="spinner" style={{ color: 'var(--primary)' }} />
                            <p style={{ color: '#555', fontSize: '1rem' }}>
                                Analysing Box files — this may take a few minutes for large folders...
                            </p>
                        </div>
                    )}
                    {segStatus === 'error' && (
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--background)' }}>
                            <div style={{ textAlign: 'center', color: '#c62828' }}>
                                <AlertCircle size={48} style={{ marginBottom: '1rem' }} />
                                <p>Segregation failed. Check server logs and try again.</p>
                            </div>
                        </div>
                    )}
                    {segStatus === 'done' && segData && <SegCategoryTree />}
                </div>
            )}

            {/* ── META DATA TAGGING TAB ── */}
            {activeTab === 'META DATA TAGGING' && (
                <div style={{ display: 'flex', flex: 1, overflow: 'hidden', flexDirection: 'column' }}>
                    {/* Top action bar */}
                    <div style={{
                        background: 'white', borderBottom: '1px solid #edf2f7',
                        padding: '0.6rem 1rem', display: 'flex', alignItems: 'center', gap: '14px'
                    }}>
                        <button
                            onClick={async () => {
                                try {
                                    const statsRes = await api.get(`/metadata/stats/${id}`);
                                    const stats = statsRes.data;
                                    setFileStats(stats);
                                    const remaining = stats.total_pdf_files - stats.pdfs_with_text;
                                    if (remaining <= 0) {
                                        setExtractionStatus('all_done');
                                        return;
                                    }
                                    setExtractionStatus('running');
                                    setExtractionProgress({ total: remaining, completed: 0 });
                                    await api.post(`/metadata/extract-text/${id}`);
                                    const interval = setInterval(async () => {
                                        try {
                                            const res = await api.get(`/metadata/extract-text/status/${id}`);
                                            const data = res.data;
                                            setExtractionProgress({ total: data.total, completed: data.completed });
                                            if (data.status === 'done' || data.status === 'error') {
                                                clearInterval(interval);
                                                setExtractionPollInterval(null);
                                                setExtractionStatus(data.status);
                                                fetchFileStats();
                                            }
                                        } catch (err) { console.error('Poll error:', err); }
                                    }, 3000);
                                    setExtractionPollInterval(interval);
                                } catch (err) {
                                    console.error('Failed to start extraction:', err);
                                    setExtractionStatus('error');
                                }
                            }}
                            disabled={extractionStatus === 'running'}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                padding: '8px 20px', borderRadius: '8px', border: 'none',
                                background: extractionStatus === 'running' ? '#94a3b8' : 'linear-gradient(135deg, #7c3aed, #a855f7)',
                                color: 'white', fontWeight: 700, fontSize: '0.82rem',
                                cursor: extractionStatus === 'running' ? 'not-allowed' : 'pointer',
                                boxShadow: '0 2px 8px rgba(124,58,237,0.3)', transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => { if (extractionStatus !== 'running') e.currentTarget.style.opacity = '0.9'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
                        >
                            {extractionStatus === 'running' ? <Loader size={15} className="spinner" /> : <FileText size={15} />}
                            {extractionStatus === 'running' ? 'Extracting Text...' : '📝 Text Extraction'}
                        </button>

                        {/* Extraction status badge */}
                        {extractionStatus === 'running' && (
                            <span style={{ fontSize: '0.78rem', color: '#7c3aed', fontWeight: 600, background: '#ede9fe', padding: '4px 12px', borderRadius: '100px' }}>
                                ⏳ {extractionProgress.completed} / {extractionProgress.total} files
                            </span>
                        )}
                        {extractionStatus === 'done' && (
                            <span style={{ fontSize: '0.78rem', color: '#16a34a', fontWeight: 600, background: '#dcfce7', padding: '4px 12px', borderRadius: '100px' }}>
                                ✅ Extraction Complete — {extractionProgress.total} files
                            </span>
                        )}
                        {extractionStatus === 'error' && (
                            <span style={{ fontSize: '0.78rem', color: '#dc2626', fontWeight: 600, background: '#fef2f2', padding: '4px 12px', borderRadius: '100px' }}>
                                ❌ Extraction Failed
                            </span>
                        )}

                        {/* Divider */}
                        <div style={{ width: '1px', height: '28px', background: '#e2e8f0', margin: '0 4px' }} />

                        {/* ── Start Metadata Tagging Button ── */}
                        <button
                            id="start-metadata-tagging-btn"
                            onClick={startMetadataTagging}
                            disabled={taggingStatus === 'running'}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                padding: '8px 20px', borderRadius: '8px', border: 'none',
                                background: taggingStatus === 'running' ? '#94a3b8' : 'linear-gradient(135deg, #0ea5e9, #6366f1)',
                                color: 'white', fontWeight: 700, fontSize: '0.82rem',
                                cursor: taggingStatus === 'running' ? 'not-allowed' : 'pointer',
                                boxShadow: '0 2px 8px rgba(99,102,241,0.3)', transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => { if (taggingStatus !== 'running') e.currentTarget.style.opacity = '0.88'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
                        >
                            {taggingStatus === 'running' ? <Loader size={15} className="spinner" /> : <span style={{ fontSize: '15px' }}>🤖</span>}
                            {taggingStatus === 'running' ? 'Tagging...' : 'Start Metadata Tagging'}
                        </button>

                        {/* Tagging status badge */}
                        {taggingStatus === 'running' && (
                            <span style={{ fontSize: '0.78rem', color: '#6366f1', fontWeight: 600, background: '#eef2ff', padding: '4px 12px', borderRadius: '100px' }}>
                                🤖 {taggingProgress.completed} / {taggingProgress.total} tagged
                            </span>
                        )}
                        {taggingStatus === 'done' && (
                            <span style={{ fontSize: '0.78rem', color: '#16a34a', fontWeight: 600, background: '#dcfce7', padding: '4px 12px', borderRadius: '100px' }}>
                                ✅ Tagging Complete — {taggingProgress.total} files
                            </span>
                        )}
                        {taggingStatus === 'error' && (
                            <span style={{ fontSize: '0.78rem', color: '#dc2626', fontWeight: 600, background: '#fef2f2', padding: '4px 12px', borderRadius: '100px' }}>
                                ❌ Tagging Failed
                            </span>
                        )}
                    </div>

                    {/* ── Tagging Error Toast ── */}
                    {taggingStatus === 'error' && taggingError && (
                        <div style={{
                            position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999,
                            background: '#fff', border: '1.5px solid #fca5a5', borderRadius: '12px',
                            boxShadow: '0 8px 32px rgba(220,38,38,0.15)',
                            padding: '14px 20px', maxWidth: '420px', display: 'flex', gap: '12px', alignItems: 'flex-start'
                        }}>
                            <span style={{ fontSize: '1.4rem', flexShrink: 0 }}>❌</span>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 700, color: '#dc2626', marginBottom: '4px', fontSize: '0.88rem' }}>Metadata Tagging Error</div>
                                <div style={{ fontSize: '0.82rem', color: '#7f1d1d', lineHeight: 1.5 }}>{taggingError}</div>
                            </div>
                            <button
                                onClick={() => { setTaggingStatus('idle'); setTaggingError(null); }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '1.1rem', paddingTop: '2px' }}
                            >✕</button>
                        </div>
                    )}

                    {/* ── Stats Cards ── */}
                    {fileStats && (
                        <div style={{
                            background: 'white', borderBottom: '1px solid #edf2f7',
                            padding: '0.75rem 1rem', display: 'flex', gap: '12px', flexWrap: 'wrap'
                        }}>
                            {[
                                { label: 'Total Files', value: fileStats.total_files, icon: '📁', color: '#3b82f6', bg: '#eff6ff' },
                                { label: 'PDF Files', value: fileStats.total_pdf_files, icon: '📄', color: '#7c3aed', bg: '#f5f3ff' },
                                { label: 'Media Files', value: fileStats.media_files, icon: '🎥', color: '#ec4899', bg: '#fdf2f8' },
                                { label: 'Other Files', value: fileStats.other_files, icon: '📎', color: '#f59e0b', bg: '#fffbeb' },
                                { label: 'PDFs with Text', value: fileStats.pdfs_with_text, icon: '✅', color: '#16a34a', bg: '#f0fdf4' },
                            ].map(stat => (
                                <div key={stat.label} style={{
                                    background: stat.bg, border: `1px solid ${stat.color}22`,
                                    borderRadius: '10px', padding: '10px 18px',
                                    display: 'flex', alignItems: 'center', gap: '10px',
                                    minWidth: '160px'
                                }}>
                                    <span style={{ fontSize: '1.3rem' }}>{stat.icon}</span>
                                    <div>
                                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: stat.color }}>{stat.value}</div>
                                        <div style={{ fontSize: '0.7rem', color: '#888', fontWeight: 600 }}>{stat.label}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Content area */}
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--background)' }}>
                        {extractionStatus === 'idle' && (
                            <div style={{ textAlign: 'center', opacity: 0.6, maxWidth: '420px' }}>
                                <FileText size={52} style={{ marginBottom: '1rem', opacity: 0.4, color: '#7c3aed' }} />
                                <h3 style={{ marginBottom: '0.5rem' }}>Text Extraction</h3>
                                <p style={{ fontSize: '0.9rem', color: '#666', lineHeight: 1.6 }}>
                                    Click <strong>📝 Text Extraction</strong> to extract text from all PDF files
                                    that haven't been processed yet. This will download each PDF from Box,
                                    run OCR if needed, and save the extracted text to the database.
                                </p>
                                {fileStats && fileStats.total_pdf_files > 0 && (
                                    <p style={{ fontSize: '0.82rem', color: '#7c3aed', fontWeight: 600, marginTop: '0.75rem' }}>
                                        ⏳ {fileStats.total_pdf_files - fileStats.pdfs_with_text} PDF files remaining to extract
                                    </p>
                                )}
                            </div>
                        )}
                        {extractionStatus === 'all_done' && (
                            <div style={{ textAlign: 'center', opacity: 0.85, maxWidth: '420px' }}>
                                <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🌟</div>
                                <h3 style={{ marginBottom: '0.5rem', color: '#16a34a' }}>All Files Extracted</h3>
                                <p style={{ fontSize: '0.9rem', color: '#666', lineHeight: 1.6 }}>
                                    All <strong>{fileStats?.total_pdf_files || 0}</strong> PDF files already have extracted text.
                                    No further extraction is needed. You can click the button again to re-check.
                                </p>
                            </div>
                        )}
                        {extractionStatus === 'running' && (
                            <div style={{ textAlign: 'center', maxWidth: '420px' }}>
                                <Loader size={48} className="spinner" style={{ color: '#7c3aed', marginBottom: '1rem' }} />
                                <p style={{ color: '#555', fontSize: '1rem', marginBottom: '0.5rem' }}>
                                    Extracting text from PDF files...
                                </p>
                                <p style={{ color: '#999', fontSize: '0.85rem' }}>
                                    Processing {extractionProgress.completed} of {extractionProgress.total} files.
                                    This may take several minutes for large engines.
                                </p>
                                {extractionProgress.total > 0 && (
                                    <div style={{ margin: '1rem auto', maxWidth: '300px', height: '8px', background: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
                                        <div style={{
                                            height: '100%', borderRadius: '4px',
                                            background: 'linear-gradient(90deg, #7c3aed, #a855f7)',
                                            width: `${(extractionProgress.completed / extractionProgress.total) * 100}%`,
                                            transition: 'width 0.5s ease'
                                        }} />
                                    </div>
                                )}
                            </div>
                        )}
                        {extractionStatus === 'done' && (
                            <div style={{ textAlign: 'center', opacity: 0.8, maxWidth: '420px' }}>
                                <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>✅</div>
                                <h3 style={{ marginBottom: '0.5rem', color: '#16a34a' }}>Extraction Complete</h3>
                                <p style={{ fontSize: '0.9rem', color: '#666' }}>
                                    Successfully extracted text from <strong>{extractionProgress.total}</strong> files.
                                    The data has been saved to the database and is ready for further processing.
                                </p>
                            </div>
                        )}
                        {extractionStatus === 'error' && (
                            <div style={{ textAlign: 'center', color: '#c62828' }}>
                                <AlertCircle size={48} style={{ marginBottom: '1rem' }} />
                                <p>Text extraction failed. Check server logs and try again.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── OTHER TABS (placeholder) ── */}
            {activeTab !== 'RAW FOLDER' && activeTab !== 'FOLDER SEGREGATION' && activeTab !== 'META DATA TAGGING' && (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--background)' }}>
                    <div style={{ textAlign: 'center', opacity: 0.5 }}>
                        <h2 style={{ marginBottom: '1rem' }}>{activeTab}</h2>
                        <p>This feature is coming soon.</p>
                    </div>
                </div>
            )}
        </div>
    );
}
