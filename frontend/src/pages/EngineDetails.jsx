import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../api';
import {
    FileText, Folder, FolderOpen, ChevronRight, ChevronDown,
    ArrowLeft, Search, SortAsc, CheckSquare, LogOut, Loader, X,
    Shuffle, CheckCircle, AlertCircle, Info, Clock, Save, Edit3, Eye, ShieldAlert
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

// ─── LLP STATUS COMPONENT ──────────────────────────────────────────────────
const THRUST_RATINGS = ["7B20", "7B22", "7B24", "7B26", "7B27", "7B20E", "7B22E", "7B24E", "7B26E", "7B27E"];

function LlpFolderNode({ node, level = 0, onSelectFile, selectedFileId }) {
    const [isOpen, setIsOpen] = useState(false);

    if (node.type === 'file') {
        const isSelected = selectedFileId === node.id;
        return (
            <div
                onClick={() => onSelectFile(node)}
                style={{
                    padding: `6px 10px`, paddingLeft: `${(level * 16) + 10}px`,
                    display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer',
                    background: isSelected ? '#e0f2fe' : 'transparent',
                    borderLeft: isSelected ? '3px solid #0284c7' : '3px solid transparent',
                    color: isSelected ? '#0369a1' : '#334155',
                    fontSize: '0.85rem'
                }}
                onMouseEnter={e => !isSelected && (e.currentTarget.style.background = '#f1f5f9')}
                onMouseLeave={e => !isSelected && (e.currentTarget.style.background = 'transparent')}
            >
                <span style={{ fontSize: '1.2rem', color: '#64748b' }}>📄</span>
                <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{node.box_file_name}</span>
            </div>
        );
    }

    return (
        <div>
            <div
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    padding: `6px 10px`, paddingLeft: `${(level * 16) + 10}px`,
                    display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer',
                    color: '#1e293b', fontWeight: 600, fontSize: '0.85rem'
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
                <span style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', display: 'flex', color: '#94a3b8' }}>
                    <ChevronRight size={14} />
                </span>
                <span style={{ fontSize: '1.2rem' }}>{isOpen ? '📂' : '📁'}</span>
                <span>{node.name}</span>
            </div>
            {isOpen && (
                <div>
                    {Object.values(node.children).sort((a, b) => {
                        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
                        return a.name?.localeCompare(b.name || b.box_file_name);
                    }).map((child, i) => (
                        <LlpFolderNode
                            key={child.id || child.path || i}
                            node={child}
                            level={level + 1}
                            onSelectFile={onSelectFile}
                            selectedFileId={selectedFileId}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function LLPTable({ engineId, segData }) {
    const [llpData, setLlpData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);

    // File Selection State
    const [showFileModal, setShowFileModal] = useState(false);
    const [selectedLlpFile, setSelectedLlpFile] = useState(null);
    const [savedFileId, setSavedFileId] = useState(null); // ID from backend

    // Dropdown States
    const [selectedThrusts, setSelectedThrusts] = useState(["7B20", "7B24"]);

    const [showThrustDropdown, setShowThrustDropdown] = useState(false);
    const [metaStatus, setMetaStatus] = useState(null); // { type: 'success'|'error'|'info', message: string }

    useEffect(() => {
        fetchLLPData();
    }, [engineId]);

    const fetchLLPData = async () => {
        setLoading(true);
        try {
            const res = await api.get(`/engines/${engineId}/llp-records`);
            // res.data is now { records: [], selected_llp_file_id: string }
            setLlpData(res.data.records || []);
            setSavedFileId(res.data.selected_llp_file_id);
        } catch (err) {
            console.error("Failed to fetch LLP records", err);
        } finally {
            setLoading(false);
        }
    };

    // Auto-select the file from segData once both are available
    useEffect(() => {
        if (savedFileId && segData?.length > 0 && !selectedLlpFile) {
            console.log("Restoring selected LLP file search for ID:", savedFileId);
            const foundFile = segData.find(f => String(f.id) === String(savedFileId));
            if (foundFile) {
                console.log("Found saved file in segregation data:", foundFile.box_file_name);
                setSelectedLlpFile(foundFile);
            } else {
                console.warn("Saved LLP file ID not found in current segregation data:", savedFileId);
            }
        }
    }, [savedFileId, segData, selectedLlpFile]);

    const handleSave = async () => {
        setLoading(true);
        try {
            const payload = {
                records: llpData,
                selected_llp_file_id: selectedLlpFile?.id || null
            };
            await api.put(`/engines/${engineId}/llp-records`, payload);
            setIsEditing(false);
            await fetchLLPData();
        } catch (err) {
            console.error("Failed to save LLP records", err);
            alert("Error saving LLP records. Please try again.");
            setLoading(false);
        }
    };

    const handleInputChange = (recordId, field, value) => {
        setLlpData(prev => prev.map(row =>
            row.id === recordId ? { ...row, [field]: value } : row
        ));
    };

    const handleJsonbChange = (recordId, field, thrustKey, value) => {
        setLlpData(prev => prev.map(row => {
            if (row.id === recordId) {
                const updatedDict = { ...row[field], [thrustKey]: parseFloat(value) || 0 };
                return { ...row, [field]: updatedDict };
            }
            return row;
        }));
    };

    const toggleThrustSelection = (rating) => {
        setSelectedThrusts(prev =>
            prev.includes(rating) ? prev.filter(r => r !== rating) : [...prev, rating]
        );
    };

    // Group records by part_group
    const groupedData = llpData.reduce((acc, row) => {
        if (!acc[row.part_group]) acc[row.part_group] = [];
        acc[row.part_group].push(row);
        return acc;
    }, {});

    const applyMetadataToLlpData = async (file) => {
        setMetaStatus(null);
        setLoading(true);
        console.log("Loading exact metadata from file:", file.box_file_name, file.metadata_json);

        let meta = file.metadata_json;
        if (typeof meta === 'string') {
            try {
                meta = JSON.parse(meta);
            } catch (e) {
                console.error("Failed to parse metadata_json string", e);
                setMetaStatus({ type: 'error', message: "Invalid metadata format in file." });
                return;
            }
        }

        const metaRecords = meta.components || meta.records;

        if (!meta || !metaRecords || metaRecords.length === 0) {
            console.warn("No metadata records found in file.");
            setMetaStatus({ type: 'info', message: "No components found in this file's metadata." });
            return;
        }

        const exactRows = metaRecords.map((m, idx) => ({
            part_group: "EXTRACTED DATA",
            sr_no: idx + 1,
            description: m.component_description || m.description || "Unknown Component",
            part_number: String(m.part_number || ""),
            serial_number: String(m.serial_number || "")
        }));

        try {
            const payload = {
                records: exactRows,
                selected_llp_file_id: file.id ? String(file.id) : null
            };
            // Send to backend immediately
            await api.put(`/engines/${engineId}/llp-records`, payload);

            // Re-fetch to normalize and show preserved data
            await fetchLLPData();

            setMetaStatus({
                type: 'success',
                message: `Extracted and saved ${exactRows.length} items from ${file.box_file_name} directly to the database.`
            });
        } catch (err) {
            console.error("Failed to auto-save metadata", err);
            setMetaStatus({ type: 'error', message: "Failed to save extracted metadata to database." });
        } finally {
            setLoading(false);
        }
    };

    const getWorkflowColor = (status) => {
        switch (status) {
            case 'Client Approval': return { bg: '#e3f2fd', color: '#1565c0' };
            case 'Review': return { bg: '#fff3e0', color: '#e65100' };
            case 'Pending': return { bg: '#f5f5f5', color: '#616161' };
            default: return { bg: '#f5f5f5', color: '#616161' };
        }
    };

    if (loading && llpData.length === 0) return <div style={{ padding: '2rem', textAlign: 'center' }}><Loader className="spinner" /> Loading LLP Data...</div>;

    return (
        <div style={{ background: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Header controls */}
            <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#333' }}>LLP Status</h2>

                    {/* Multi-Select Dropdown for Columns */}
                    <div style={{ position: 'relative' }}>
                        <button
                            onClick={() => setShowThrustDropdown(!showThrustDropdown)}
                            style={{ padding: '0.4rem 0.8rem', background: '#fff', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                        >
                            Select Ratings <ChevronDown size={14} />
                        </button>
                        {showThrustDropdown && (
                            <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: '4px', background: 'white', border: '1px solid #ccc', borderRadius: '4px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', zIndex: 10, width: '200px', maxHeight: '300px', overflowY: 'auto' }}>
                                {THRUST_RATINGS.map(rating => (
                                    <label key={rating} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0' }}>
                                        <input
                                            type="checkbox"
                                            checked={selectedThrusts.includes(rating)}
                                            onChange={() => toggleThrustSelection(rating)}
                                        />
                                        {rating}
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* File Selection & Edit / Save Buttons */}
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                        <button
                            onClick={() => setShowFileModal(true)}
                            style={{
                                padding: '0.5rem 1rem', background: '#f8fafc', color: '#334155', border: '1px solid #cbd5e1',
                                borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem',
                                fontWeight: 600, fontSize: '0.85rem', boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                            }}
                        >
                            <FolderOpen size={16} color="#0284c7" /> Select LLP STATUS FILE
                        </button>
                        {selectedLlpFile && (
                            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, maxWidth: '250px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                Selected: {selectedLlpFile.box_file_name}
                            </span>
                        )}
                    </div>
                    {isEditing ? (
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button onClick={() => { setIsEditing(false); fetchLLPData(); }} style={{ padding: '0.5rem 1rem', background: '#f5f5f5', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                            <button onClick={handleSave} disabled={loading} style={{ padding: '0.5rem 1rem', background: '#2e7d32', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                {loading ? <Loader size={14} className="spinner" /> : <Save size={14} />} Save Changes
                            </button>
                        </div>
                    ) : (
                        <button onClick={() => setIsEditing(true)} style={{ padding: '0.5rem 1rem', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Edit3 size={14} /> Edit Table
                        </button>
                    )}
                </div>
            </div>

            {/* Meta Status Notification */}
            {metaStatus && (
                <div style={{
                    margin: '0.5rem 1.5rem', padding: '0.75rem 1rem', borderRadius: '6px',
                    background: metaStatus.type === 'success' ? '#f0fdf4' : metaStatus.type === 'error' ? '#fef2f2' : '#f0f9ff',
                    border: `1px solid ${metaStatus.type === 'success' ? '#bbf7d0' : metaStatus.type === 'error' ? '#fecaca' : '#bae6fd'}`,
                    color: metaStatus.type === 'success' ? '#166534' : metaStatus.type === 'error' ? '#991b1b' : '#075985',
                    fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem'
                }}>
                    {metaStatus.type === 'success' ? <CheckCircle size={16} /> : metaStatus.type === 'error' ? <AlertCircle size={16} /> : <Info size={16} />}
                    <span style={{ flex: 1 }}>{metaStatus.message}</span>
                    <button onClick={() => setMetaStatus(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: '2px' }}><X size={14} /></button>
                </div>
            )}

            {!selectedLlpFile ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem', color: '#64748b' }}>
                    <FolderOpen size={48} strokeWidth={1} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>File is not selected.</h3>
                    <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem' }}>Please select an LLP STATUS FILE from the controls above to view data.</p>
                </div>
            ) : (
                <div style={{ flex: 1, overflow: 'auto', padding: '0 1.5rem 1.5rem 1.5rem' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', marginTop: '1rem', minWidth: '1300px' }}>
                        <thead style={{ position: 'sticky', top: 0, zIndex: 5, background: 'white' }}>
                            <tr>
                                <th style={{ padding: '12px 10px', borderBottom: '2px solid #ccc', textAlign: 'center', background: '#f8f9fa', color: '#64748b', fontWeight: 700 }}>SR. NO.</th>
                                <th style={{ padding: '12px 10px', borderBottom: '2px solid #ccc', textAlign: 'left', background: '#f8f9fa', color: '#64748b', fontWeight: 700 }}>DESCRIPTION</th>
                                <th style={{ padding: '12px 10px', borderBottom: '2px solid #ccc', textAlign: 'center', background: '#f8f9fa', color: '#64748b', fontWeight: 700, minWidth: '110px' }}>PART NUMBER</th>
                                <th style={{ padding: '12px 10px', borderBottom: '2px solid #ccc', textAlign: 'center', background: '#f8f9fa', color: '#64748b', fontWeight: 700, minWidth: '110px' }}>SERIAL NUMBER</th>
                                <th style={{ padding: '12px 10px', borderBottom: '2px solid #ccc', textAlign: 'center', background: '#f8f9fa', color: '#64748b', fontWeight: 700 }}>TOTAL HOURS</th>
                                <th style={{ padding: '12px 10px', borderBottom: '2px solid #ccc', textAlign: 'center', background: '#f8f9fa', color: '#64748b', fontWeight: 700 }}>TOTAL CYCLES</th>
                                <th style={{ padding: '12px 10px', borderBottom: '2px solid #ccc', textAlign: 'center', background: '#f8f9fa', color: '#64748b', fontWeight: 700 }}>CYCLE USED %</th>
                                <th style={{ padding: '12px 10px', borderBottom: '2px solid #ccc', textAlign: 'center', background: '#f8f9fa', color: '#64748b', fontWeight: 700 }}>DOCS</th>
                                <th style={{ padding: '12px 10px', borderBottom: '2px solid #ccc', textAlign: 'center', background: '#f8f9fa', color: '#64748b', fontWeight: 700 }}>REVIEW WORKFLOW</th>
                                <th style={{ padding: '12px 10px', borderBottom: '2px solid #ccc', textAlign: 'center', background: '#f8f9fa', color: '#64748b', fontWeight: 700 }}>RAISE DISCREPANCY</th>
                            </tr>
                        </thead>
                        <tbody>
                            {llpData.length === 0 ? (
                                <tr>
                                    <td colSpan={10} style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>
                                        No data records found in the database for this engine.
                                    </td>
                                </tr>
                            ) : (
                                Object.entries(groupedData).map(([groupName, rows]) => (
                                    <React.Fragment key={groupName}>
                                        {groupName && groupName !== "EXTRACTED DATA" && (
                                            <tr>
                                                <td colSpan={10} style={{ padding: '10px 14px', background: '#1e293b', color: 'white', fontWeight: 700, letterSpacing: '0.5px' }}>
                                                    {groupName}
                                                </td>
                                            </tr>
                                        )}
                                        {rows.map(row => {
                                            const ratingToUse = "7B24"; // Defaulting since highlight logic is removed
                                            const limit = row.cycle_limits_dict?.[ratingToUse] || 0;
                                            const used = row.cycles_used_dict?.[ratingToUse] || 0;
                                            const cycleUsedPercent = limit > 0 ? ((used / limit) * 100).toFixed(2) : "0.00";
                                            const workflowStyle = getWorkflowColor(row.review_workflow);

                                            return (
                                                <tr key={row.id || row._tempId} style={{ borderBottom: '1px solid #eee' }} onMouseEnter={e => e.currentTarget.style.background = '#fafafa'} onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                                                    <td style={{ padding: '12px 10px', textAlign: 'center' }}>{row.sr_no}</td>
                                                    <td style={{ padding: '12px 10px', fontWeight: 500, color: '#334155' }}>
                                                        {row.description}
                                                        {isEditing && (
                                                            <div style={{ marginTop: '5px', display: 'flex', gap: '5px', fontSize: '0.7rem' }}>
                                                                <input placeholder="Lim" type="number" value={limit} onChange={e => handleJsonbChange(row.id, 'cycle_limits_dict', ratingToUse, e.target.value)} style={{ width: '40px', padding: '2px' }} title="Limit for this thrust" />
                                                                <input placeholder="Used" type="number" value={used} onChange={e => handleJsonbChange(row.id, 'cycles_used_dict', ratingToUse, e.target.value)} style={{ width: '40px', padding: '2px' }} title="Used for this thrust" />
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '12px 10px', textAlign: 'center', fontFamily: 'monospace', color: '#64748b' }}>
                                                        {isEditing ? <input value={row.part_number || ''} onChange={e => handleInputChange(row.id, 'part_number', e.target.value)} style={{ width: '100%', padding: '4px' }} /> : (row.part_number || '-')}
                                                    </td>
                                                    <td style={{ padding: '12px 10px', textAlign: 'center', fontFamily: 'monospace', color: '#64748b' }}>
                                                        {isEditing ? <input value={row.serial_number || ''} onChange={e => handleInputChange(row.id, 'serial_number', e.target.value)} style={{ width: '100%', padding: '4px' }} /> : (row.serial_number || '-')}
                                                    </td>
                                                    <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                                                        {isEditing ? <input type="number" value={row.total_hours} onChange={e => handleInputChange(row.id, 'total_hours', parseFloat(e.target.value) || 0)} style={{ width: '60px', padding: '4px', textAlign: 'center' }} /> : row.total_hours}
                                                    </td>
                                                    <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                                                        {isEditing ? <input type="number" value={row.total_cycles} onChange={e => handleInputChange(row.id, 'total_cycles', parseFloat(e.target.value) || 0)} style={{ width: '60px', padding: '4px', textAlign: 'center' }} /> : row.total_cycles}
                                                    </td>
                                                    <td style={{ padding: '12px 10px', textAlign: 'center', fontWeight: 700, color: '#1e293b' }}>
                                                        {cycleUsedPercent}%
                                                    </td>
                                                    <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                                                        <button style={{ background: 'transparent', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', color: '#94a3b8' }}>
                                                            <Eye size={16} />
                                                        </button>
                                                    </td>
                                                    <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                                                        {isEditing ? (
                                                            <select
                                                                value={row.review_workflow}
                                                                onChange={e => handleInputChange(row.id, 'review_workflow', e.target.value)}
                                                                style={{ padding: '4px 8px', borderRadius: '16px', border: '1px solid #cbd5e1', fontSize: '0.75rem', fontWeight: 600, outline: 'none' }}
                                                            >
                                                                <option value="Pending">Pending</option>
                                                                <option value="Review">Review</option>
                                                                <option value="Client Approval">Client Approval</option>
                                                            </select>
                                                        ) : (
                                                            <span style={{
                                                                background: workflowStyle.bg, color: workflowStyle.color,
                                                                padding: '4px 12px', borderRadius: '16px', fontSize: '0.75rem',
                                                                fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px'
                                                            }}>
                                                                {row.review_workflow} <ChevronDown size={12} />
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={row.raise_discrepancy}
                                                            disabled={!isEditing}
                                                            onChange={e => handleInputChange(row.id, 'raise_discrepancy', e.target.checked)}
                                                        />
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </React.Fragment>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* LLP File Selection Modal */}
            {
                showFileModal && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
                        background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        <div style={{
                            background: 'white', width: '600px', height: '80vh', borderRadius: '12px',
                            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                            display: 'flex', flexDirection: 'column', overflow: 'hidden'
                        }}>
                            <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <FolderOpen size={20} color="#0284c7" />
                                    <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#1e293b' }}>Select LLP STATUS FILE</h3>
                                </div>
                                <button onClick={() => setShowFileModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={20} /></button>
                            </div>

                            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
                                {/* Build and Render Tree */}
                                {(() => {
                                    const allFiles = segData || [];
                                    if (allFiles.length === 0) return <div style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>No LLP files found in segregation.</div>;

                                    const latestFiles = allFiles.filter(f => f.latest);
                                    const standardFiles = allFiles.filter(f => !f.latest);

                                    const root = { name: 'root', type: 'folder', children: {}, path: '' };

                                    // Build standard tree hierarchy
                                    standardFiles.forEach(f => {
                                        let parts = [];
                                        if (f.original_folder_path && f.original_folder_path !== 'root' && f.original_folder_path !== '.') {
                                            parts = f.original_folder_path.split('/').filter(p => p);
                                            if (parts[0] === 'RAW FOLDER') parts.shift();
                                        }
                                        let current = root;
                                        parts.forEach(part => {
                                            if (!current.children[part]) {
                                                current.children[part] = { name: part, type: 'folder', children: {}, path: current.path ? `${current.path}/${part}` : part };
                                            }
                                            current = current.children[part];
                                        });
                                        current.children[f.box_file_name] = { ...f, type: 'file' };
                                    });

                                    // Add ⭐ Latest virtual folder at the top
                                    const treeItems = Object.values(root.children).sort((a, b) => {
                                        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
                                        return a.name?.localeCompare(b.name || b.box_file_name);
                                    });

                                    if (latestFiles.length > 0) {
                                        const latestFolder = {
                                            name: '⭐ Latest',
                                            type: 'folder',
                                            children: latestFiles.reduce((acc, f) => {
                                                acc[f.box_file_id] = { ...f, type: 'file' };
                                                return acc;
                                            }, {}),
                                            path: 'latest'
                                        };
                                        treeItems.unshift(latestFolder);
                                    }

                                    return treeItems.map((child, i) => (
                                        <LlpFolderNode
                                            key={child.id || child.path || i}
                                            node={child}
                                            onSelectFile={(f) => {
                                                setSelectedLlpFile(f);
                                                applyMetadataToLlpData(f);
                                                setShowFileModal(false);
                                            }}
                                            selectedFileId={selectedLlpFile?.id}
                                        />
                                    ));
                                })()}
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
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
    const [fileStats, setFileStats] = useState(null);

    // Single full-pipeline state (replaces separate extraction + tagging states)
    const [pipelineStatus, setPipelineStatus] = useState('idle'); // idle|running|done|error
    const [pipelineProgress, setPipelineProgress] = useState({ total: 0, completed: 0, extracted: 0, tagged: 0, skipped: 0, errors: 0 });
    const [pipelinePollInterval, setPipelinePollInterval] = useState(null);
    const [pipelineError, setPipelineError] = useState(null);

    // Metadata Viewer state (META DATA TAGGING tab sidebar + panel)
    const [metaFiles, setMetaFiles] = useState([]);
    const [metaSelectedFile, setMetaSelectedFile] = useState(null);
    const [metaExpandedCategories, setMetaExpandedCategories] = useState({});
    // Per-file processing: { [file_id]: { status: 'idle'|'processing'|'error', message: '' } }
    const [fileProcessing, setFileProcessing] = useState({});

    const tabs = ['RAW FOLDER', 'FOLDER SEGREGATION', 'META DATA TAGGING', 'LLP STATUS', 'OPEN ITEM LIST', 'LLP TRACE', 'MINIPACK'];

    // ── Fetch file stats for metadata tab ──────────────────────────────────
    const fetchFileStats = useCallback(async () => {
        try {
            const res = await api.get(`/metadata/stats/${id}`);
            const stats = res.data;
            setFileStats(stats);
        } catch (err) {
            console.error('Failed to fetch file stats:', err);
        }
    }, [id]);

    // Fetch all files with metadata_json for the sidebar viewer
    const fetchMetaFiles = useCallback(async () => {
        try {
            const res = await api.get(`/metadata/file-metadata/${id}`);
            setMetaFiles(res.data);
        } catch (err) {
            console.error('Failed to fetch meta files:', err);
        }
    }, [id]);

    // Auto-fetch stats + meta files when switching to META DATA TAGGING tab
    useEffect(() => {
        if (activeTab === 'META DATA TAGGING') {
            fetchFileStats();
            fetchMetaFiles();
        }
    }, [activeTab, fetchFileStats, fetchMetaFiles]);

    // ── Start Full Pipeline (single-button: extract + tag for entire engine) ──
    const startFullPipeline = useCallback(async () => {
        setPipelineError(null);
        setPipelineStatus('running');
        setPipelineProgress({ total: 0, completed: 0, extracted: 0, tagged: 0, skipped: 0, errors: 0 });
        try {
            await api.post(`/metadata/pipeline/${id}`);
            const interval = setInterval(async () => {
                try {
                    const res = await api.get(`/metadata/pipeline/status/${id}`);
                    const data = res.data;
                    setPipelineProgress({
                        total: data.total,
                        completed: data.completed,
                        extracted: data.extracted ?? 0,
                        tagged: data.tagged ?? 0,
                        skipped: data.skipped ?? 0,
                        errors: data.errors ?? 0,
                    });
                    if (data.status === 'done') {
                        clearInterval(interval);
                        setPipelinePollInterval(null);
                        setPipelineStatus('done');
                        fetchFileStats();
                        fetchMetaFiles();
                    } else if (data.status === 'error') {
                        clearInterval(interval);
                        setPipelinePollInterval(null);
                        setPipelineStatus('error');
                        setPipelineError(data.error || 'Pipeline failed. Check server logs.');
                    }
                } catch (pollErr) {
                    console.error('Pipeline poll error:', pollErr);
                }
            }, 3000);
            setPipelinePollInterval(interval);
        } catch (err) {
            console.error('Failed to start pipeline:', err);
            setPipelineStatus('error');
            setPipelineError(err?.response?.data?.detail || 'Failed to start pipeline.');
        }
    }, [id, fetchMetaFiles, fetchFileStats]);

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
            // Skip the first segment (root/engine folder) — start hierarchy from sub-folders
            const parts = pathStr.split('/').filter(Boolean).slice(1);
            if (parts.length === 0) {
                root.files.push(file);
                continue;
            }
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

    // ── META DATA TAGGING: sidebar component ─────────────────────────────
    const MetaFileSidebar = () => {
        const hasMetadata = (f) => f.metadata_json && Object.keys(f.metadata_json).length > 0;

        // Group flat array into category → files (same structure as segData.segregated)
        const segregated = {};
        for (const f of metaFiles) {
            const cat = f.category || 'Unclassified';
            if (!segregated[cat]) segregated[cat] = [];
            segregated[cat].push(f);
        }

        // ── Flat file item (mirrors SegFlatFileItem) ──────────────────────
        const MetaFlatFileItem = ({ file }) => {
            const mStyle = METHOD_COLORS[file.method] || METHOD_COLORS['Unclassified'];
            const isSelected = metaSelectedFile?.id === file.id;
            const tagged = hasMetadata(file);
            return (
                <div
                    onClick={() => setMetaSelectedFile(file)}
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
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1
                        }}>{file.box_file_name}</span>
                        {tagged && <span style={{ fontSize: '0.65rem', flexShrink: 0 }}>🏷️</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', paddingLeft: '18px', marginTop: '2px' }}>
                        <span style={{
                            fontSize: '0.65rem', padding: '1px 5px', borderRadius: '8px',
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
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px'
                            }} title={file.original_folder_path}>
                                📂 {file.original_folder_path.split('/').pop()}
                            </span>
                        )}
                    </div>
                </div>
            );
        };

        // ── Recursive folder node (mirrors SegFolderNode) ─────────────────
        const MetaFolderNode = ({ node, level = 1, pathKey = '' }) => {
            const nodeKey = pathKey ? `${pathKey}/${node.name}` : node.name;
            const stateKey = `_mf_${nodeKey}`;
            const isOpen = !!metaExpandedCategories[stateKey];
            const childEntries = Object.values(node.children);
            const hasContent = childEntries.length > 0 || node.files.length > 0;
            if (!hasContent) return null;

            const countFiles = (n) => {
                let c = n.files.length;
                for (const ch of Object.values(n.children)) c += countFiles(ch);
                return c;
            };
            const fileCount = countFiles(node);

            return (
                <div>
                    <div
                        onClick={() => setMetaExpandedCategories(prev => ({ ...prev, [stateKey]: !prev[stateKey] }))}
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
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
                        <span style={{ background: '#e8eaf6', color: '#3949ab', borderRadius: '10px', padding: '0px 6px', fontSize: '0.65rem', fontWeight: 700, marginLeft: '4px' }}>{fileCount}</span>
                    </div>

                    {isOpen && (
                        <>
                            {childEntries.sort((a, b) => a.name.localeCompare(b.name)).map(child => (
                                <MetaFolderNode key={child.name} node={child} level={level + 1} pathKey={nodeKey} />
                            ))}
                            {node.files.map(file => {
                                const mStyle = METHOD_COLORS[file.method] || METHOD_COLORS['Unclassified'];
                                const isSelected = metaSelectedFile?.id === file.id;
                                const tagged = hasMetadata(file);
                                return (
                                    <div
                                        key={file.id}
                                        onClick={() => setMetaSelectedFile(file)}
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
                                            <span style={{ fontSize: '0.76rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                                {file.box_file_name}
                                            </span>
                                            {tagged && <span style={{ fontSize: '0.65rem', flexShrink: 0 }}>🏷️</span>}
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
                                        </div>
                                    </div>
                                );
                            })}
                        </>
                    )}
                </div>
            );
        };

        return (
            <>
                {Object.entries(segregated).map(([category, files]) => {
                    const catKey = `_mcat_${category}`;
                    const isCatOpen = !!metaExpandedCategories[catKey];

                    // Same split as SegCategoryTree
                    const treeFiles = files.filter(f => TREE_METHODS.has(f.method) && !f.latest);
                    const flatFiles = files.filter(f => !TREE_METHODS.has(f.method) && !f.latest);
                    const latestFiles = files.filter(f => f.latest);
                    const folderTree = treeFiles.length > 0 ? buildFolderTree(treeFiles) : null;

                    return (
                        <div key={category}>
                            {/* Category folder row */}
                            <div
                                onClick={() => setMetaExpandedCategories(prev => ({ ...prev, [catKey]: !prev[catKey] }))}
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
                                    {isCatOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                                </span>
                                {isCatOpen
                                    ? <FolderOpen size={15} style={{ marginRight: '6px', color: '#f59e0b' }} />
                                    : <Folder size={15} style={{ marginRight: '6px', color: '#f59e0b' }} />}
                                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {getCategoryIcon(category)} {category}
                                </span>
                                <span style={{ background: '#dbeafe', color: '#1d4ed8', borderRadius: '10px', padding: '1px 7px', fontSize: '0.7rem', fontWeight: 700, marginLeft: '4px' }}>
                                    {files.length}
                                </span>
                                {files.some(hasMetadata) && (
                                    <span style={{ fontSize: '0.65rem', marginLeft: '3px', flexShrink: 0 }}>🏷️</span>
                                )}
                            </div>

                            {/* Expanded content — mirrors SegCategoryTree exactly */}
                            {isCatOpen && (() => {
                                const latestKey = `_mlatest_${category}`;
                                const isLatestOpen = !!metaExpandedCategories[latestKey];
                                return (
                                    <>
                                        {/* ⭐ Latest folder */}
                                        {latestFiles.length > 0 && (
                                            <div>
                                                <div
                                                    onClick={() => setMetaExpandedCategories(prev => ({ ...prev, [latestKey]: !prev[latestKey] }))}
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
                                                    <span style={{ background: '#e8f5e9', color: '#2e7d32', borderRadius: '10px', padding: '0px 6px', fontSize: '0.65rem', fontWeight: 700, marginLeft: '4px' }}>
                                                        {latestFiles.length}
                                                    </span>
                                                </div>
                                                {isLatestOpen && latestFiles.map(file => (
                                                    <MetaFlatFileItem key={`mllatest_${file.id}`} file={file} />
                                                ))}
                                            </div>
                                        )}
                                        {/* Tree-rendered files (Folder Match / Manual / Extension / Unclassified) */}
                                        {folderTree && (
                                            <>
                                                {folderTree.files.map(file => (
                                                    <MetaFlatFileItem key={file.id} file={file} />
                                                ))}
                                                {Object.values(folderTree.children)
                                                    .sort((a, b) => a.name.localeCompare(b.name))
                                                    .map(child => (
                                                        <MetaFolderNode key={child.name} node={child} level={1} pathKey={category} />
                                                    ))
                                                }
                                            </>
                                        )}
                                        {/* Flat-rendered files (Direct Keyword / AI MODEL) */}
                                        {flatFiles.map(file => (
                                            <MetaFlatFileItem key={file.id} file={file} />
                                        ))}
                                    </>
                                );
                            })()}
                        </div>
                    );
                })}
            </>
        );
    };

    // ── META DATA TAGGING: metadata viewer panel ──────────────────────────
    // ── processFile: on-demand single-file extraction + tagging ─────────
    const processFile = useCallback(async (file) => {
        const fid = file.id;
        setFileProcessing(prev => ({ ...prev, [fid]: { status: 'processing', message: '' } }));
        try {
            const res = await api.post(`/metadata/process-file/${id}/${fid}`);
            const data = res.data;
            // Update metaFiles so sidebar badge refreshes
            setMetaFiles(prev => prev.map(f =>
                f.id === fid
                    ? { ...f, metadata_json: data.metadata_json, has_text: data.has_text, has_schema: data.has_schema }
                    : f
            ));
            // Update the selected file panel too
            setMetaSelectedFile(prev => prev?.id === fid
                ? { ...prev, metadata_json: data.metadata_json, has_text: data.has_text, has_schema: data.has_schema }
                : prev
            );
            setFileProcessing(prev => ({ ...prev, [fid]: { status: 'idle', message: '' } }));
        } catch (err) {
            const msg = err?.response?.data?.detail || 'Processing failed.';
            setFileProcessing(prev => ({ ...prev, [fid]: { status: 'error', message: msg } }));
        }
    }, [id]);

    // ── MetadataViewer: smart per-file viewer ─────────────────────────────
    const MetadataViewer = ({ file }) => {
        if (!file) {
            return (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', opacity: 0.55 }}>
                    <FileText size={60} style={{ marginBottom: '1rem', opacity: 0.3, color: '#6366f1' }} />
                    <h3 style={{ marginBottom: '0.5rem', color: '#444' }}>Select a File</h3>
                    <p style={{ fontSize: '0.9rem', color: '#666', maxWidth: '340px', lineHeight: 1.6 }}>
                        Click any file in the sidebar to view its tagged metadata.
                    </p>
                </div>
            );
        }

        const isPDF = file.box_file_name?.toLowerCase().endsWith('.pdf');
        const mj = file.metadata_json;
        const hasData = mj && Object.keys(mj).length > 0;
        const hasText = !!file.has_text;
        const hasSchema = !!file.has_schema;
        const procState = fileProcessing[file.id] || { status: 'idle', message: '' };
        const isProcessing = procState.status === 'processing';

        // Shared header card shown on every state
        const FileHeader = () => (
            <div style={{
                display: 'flex', alignItems: 'flex-start', gap: '12px',
                marginBottom: '1.5rem', padding: '16px',
                background: 'white', borderRadius: '12px',
                boxShadow: '0 1px 6px rgba(0,0,0,0.07)', border: '1px solid #e2e8f0'
            }}>
                <FileText size={38} color="#6366f1" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1a202c', marginBottom: '6px', wordBreak: 'break-word' }}>
                        {file.box_file_name}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        <span style={{ fontSize: '0.72rem', background: '#ede9fe', color: '#7c3aed', borderRadius: '20px', padding: '2px 10px', fontWeight: 600 }}>{file.category}</span>
                        <span style={{ fontSize: '0.72rem', background: '#e0f2fe', color: '#0369a1', borderRadius: '20px', padding: '2px 10px', fontWeight: 600 }}>{file.method}</span>
                        {hasText && <span style={{ fontSize: '0.7rem', background: '#d1fae5', color: '#065f46', borderRadius: '20px', padding: '2px 10px', fontWeight: 600 }}>✅ Text Extracted</span>}
                        {hasData && <span style={{ fontSize: '0.7rem', background: '#fef3c7', color: '#78350f', borderRadius: '20px', padding: '2px 10px', fontWeight: 600 }}>🏷️ Tagged</span>}
                    </div>
                </div>
            </div>
        );

        // ── State: non-PDF ────────────────────────────────────────────────
        if (!isPDF) {
            return (
                <div>
                    <FileHeader />
                    <div style={{ textAlign: 'center', padding: '2rem', opacity: 0.6 }}>
                        <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>ℹ️</div>
                        <h3 style={{ color: '#555', marginBottom: '0.5rem' }}>Non-PDF File</h3>
                        <p style={{ fontSize: '0.9rem', color: '#888' }}>
                            Metadata tagging is only supported for PDF files.
                        </p>
                    </div>
                </div>
            );
        }

        // ── State: no Pydantic schema for this category ───────────────────
        if (!hasSchema) {
            return (
                <div>
                    <FileHeader />
                    <div style={{ textAlign: 'center', padding: '2rem', opacity: 0.65 }}>
                        <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>⚠️</div>
                        <h3 style={{ color: '#92400e', marginBottom: '0.5rem' }}>No Schema Available</h3>
                        <p style={{ fontSize: '0.9rem', color: '#888' }}>
                            The category <strong>"{file.category}"</strong> does not have a metadata extraction schema defined.<br />
                            Metadata tagging is not supported for this document type.
                        </p>
                    </div>
                </div>
            );
        }

        // ── State: already tagged — show metadata ─────────────────────────
        if (hasData && !isProcessing) {
            const generalEntries = [];
            const componentSections = [];
            for (const [key, val] of Object.entries(mj)) {
                if (Array.isArray(val)) componentSections.push({ key, items: val });
                else if (val !== null && typeof val === 'object') componentSections.push({ key, items: [val] });
                else generalEntries.push([key, val]);
            }

            const fmtKey = (k) => k.replace(/_/g, ' ');
            const formatVal = (v) => {
                if (v === null || v === undefined) return '—';
                if (typeof v === 'boolean') return v ? 'Yes' : 'No';
                if (typeof v === 'object') return JSON.stringify(v);
                return String(v);
            };
            const labelStyle = { fontSize: '0.78rem', color: '#64748b', fontWeight: 600, padding: '9px 14px', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap', width: '35%', textTransform: 'capitalize', background: '#f8fafc' };
            const valStyle = { fontSize: '0.82rem', color: '#1e293b', padding: '9px 14px', borderBottom: '1px solid #f1f5f9', wordBreak: 'break-word' };
            const thStyle = { fontSize: '0.72rem', color: '#3b4a6b', fontWeight: 700, textTransform: 'capitalize', padding: '9px 12px', background: '#eef2ff', borderBottom: '2px solid #c7d2fe', whiteSpace: 'nowrap', textAlign: 'left' };
            const tdStyle = { fontSize: '0.78rem', color: '#1e293b', padding: '8px 12px', borderBottom: '1px solid #f1f5f9', wordBreak: 'break-word', verticalAlign: 'top' };

            return (
                <div>
                    <FileHeader />
                    {/* Re-tag button */}
                    <div style={{ marginBottom: '1rem', display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button
                            onClick={() => processFile(file)}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 16px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg,#0ea5e9,#6366f1)', color: 'white', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px rgba(99,102,241,0.25)' }}
                            onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                        >
                            🔄 Re-tag this file
                        </button>
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Re-run Gemini tagging to refresh metadata</span>
                    </div>

                    {/* General Fields */}
                    {generalEntries.length > 0 && (
                        <div style={{ marginBottom: '1.5rem', background: 'white', borderRadius: '12px', boxShadow: '0 1px 6px rgba(0,0,0,0.07)', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                            <div style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', padding: '10px 16px' }}>
                                <h4 style={{ margin: 0, color: 'white', fontSize: '0.88rem', fontWeight: 700 }}>📋 General Fields</h4>
                            </div>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <tbody>
                                    {generalEntries.map(([k, v], i) => (
                                        <tr key={k} style={{ background: i % 2 === 0 ? '#fafafa' : 'white' }}>
                                            <td style={labelStyle}>{fmtKey(k)}</td>
                                            <td style={valStyle}>{formatVal(v)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Component tables */}
                    {componentSections.map(({ key, items }) => {
                        if (!items || items.length === 0) return null;
                        const colKeys = [];
                        for (const item of items) {
                            if (item && typeof item === 'object' && !Array.isArray(item)) {
                                for (const k of Object.keys(item)) { if (!colKeys.includes(k)) colKeys.push(k); }
                            }
                        }
                        if (colKeys.length === 0) return null;
                        return (
                            <div key={key} style={{ marginBottom: '1.5rem', background: 'white', borderRadius: '12px', boxShadow: '0 1px 6px rgba(0,0,0,0.07)', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                                <div style={{ background: 'linear-gradient(135deg, #0ea5e9, #38bdf8)', padding: '10px 16px' }}>
                                    <h4 style={{ margin: 0, color: 'white', fontSize: '0.88rem', fontWeight: 700 }}>🔩 {fmtKey(key)}</h4>
                                </div>
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '400px' }}>
                                        <thead><tr>{colKeys.map(k => <th key={k} style={thStyle}>{fmtKey(k)}</th>)}</tr></thead>
                                        <tbody>
                                            {items.map((item, i) => (
                                                item && typeof item === 'object' && !Array.isArray(item) ? (
                                                    <tr key={i} style={{ background: i % 2 === 0 ? '#fafafa' : 'white' }}>
                                                        {colKeys.map(k => <td key={k} style={tdStyle}>{formatVal(item[k])}</td>)}
                                                    </tr>
                                                ) : (
                                                    <tr key={i}><td colSpan={colKeys.length} style={tdStyle}>{formatVal(item)}</td></tr>
                                                )
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        );
                    })}
                </div>
            );
        }

        // ── State: processing spinner ─────────────────────────────────────
        if (isProcessing) {
            return (
                <div>
                    <FileHeader />
                    <div style={{ textAlign: 'center', padding: '3rem' }}>
                        <Loader size={48} className="spinner" style={{ color: '#6366f1', marginBottom: '1rem' }} />
                        <h3 style={{ color: '#444', marginBottom: '0.5rem' }}>Processing…</h3>
                        <p style={{ fontSize: '0.9rem', color: '#666' }}>
                            {!hasText
                                ? 'Downloading from Box and extracting text, then running Gemini tagging…'
                                : 'Sending text to Gemini for metadata extraction…'}
                        </p>
                        <p style={{ fontSize: '0.78rem', color: '#999', marginTop: '0.5rem' }}>This may take up to 60 seconds.</p>
                    </div>
                </div>
            );
        }

        // ── State: error ──────────────────────────────────────────────────
        if (procState.status === 'error') {
            return (
                <div>
                    <FileHeader />
                    <div style={{ textAlign: 'center', padding: '2rem' }}>
                        <AlertCircle size={48} style={{ color: '#dc2626', marginBottom: '1rem' }} />
                        <h3 style={{ color: '#dc2626', marginBottom: '0.5rem' }}>Processing Failed</h3>
                        <p style={{ fontSize: '0.9rem', color: '#7f1d1d', marginBottom: '1.5rem', maxWidth: '400px', margin: '0 auto 1.5rem' }}>{procState.message}</p>
                        <button
                            onClick={() => processFile(file)}
                            style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', background: '#dc2626', color: 'white', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
                        >
                            🔄 Retry
                        </button>
                    </div>
                </div>
            );
        }

        // ── State: has text, no metadata ──────────────────────────────────
        if (hasText && !hasData) {
            return (
                <div>
                    <FileHeader />
                    <div style={{ textAlign: 'center', padding: '2.5rem' }}>
                        <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>🤖</div>
                        <h3 style={{ color: '#444', marginBottom: '0.5rem' }}>Ready to Tag</h3>
                        <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '1.5rem', lineHeight: 1.6 }}>
                            Text has already been extracted for this file.<br />
                            Click below to send it to Gemini and generate metadata.
                        </p>
                        <button
                            onClick={() => processFile(file)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 24px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg,#0ea5e9,#6366f1)', color: 'white', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', boxShadow: '0 4px 14px rgba(99,102,241,0.35)' }}
                            onMouseEnter={e => e.currentTarget.style.opacity = '0.88'}
                            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                        >
                            🤖 Tag this File
                        </button>
                    </div>
                </div>
            );
        }

        // ── State: no text, no metadata ───────────────────────────────────
        return (
            <div>
                <FileHeader />
                <div style={{ textAlign: 'center', padding: '2.5rem' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>📝</div>
                    <h3 style={{ color: '#444', marginBottom: '0.5rem' }}>Not Yet Processed</h3>
                    <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '1.5rem', lineHeight: 1.6 }}>
                        No text has been extracted for this file yet.<br />
                        Click below to download from Box, extract text, and generate metadata in one step.
                    </p>
                    <button
                        onClick={() => processFile(file)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 24px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg,#7c3aed,#6366f1)', color: 'white', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', boxShadow: '0 4px 14px rgba(124,58,237,0.35)' }}
                        onMouseEnter={e => e.currentTarget.style.opacity = '0.88'}
                        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                    >
                        📝 Extract Text &amp; Tag
                    </button>
                </div>
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
                    {/* Top action bar — single unified pipeline button */}
                    <div style={{
                        background: 'white', borderBottom: '1px solid #edf2f7',
                        padding: '0.6rem 1rem', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap'
                    }}>
                        <button
                            id="start-pipeline-btn"
                            onClick={startFullPipeline}
                            disabled={pipelineStatus === 'running'}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                padding: '8px 22px', borderRadius: '8px', border: 'none',
                                background: pipelineStatus === 'running'
                                    ? '#94a3b8'
                                    : 'linear-gradient(135deg, #7c3aed, #0ea5e9)',
                                color: 'white', fontWeight: 700, fontSize: '0.85rem',
                                cursor: pipelineStatus === 'running' ? 'not-allowed' : 'pointer',
                                boxShadow: '0 2px 10px rgba(99,102,241,0.35)', transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => { if (pipelineStatus !== 'running') e.currentTarget.style.opacity = '0.88'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
                        >
                            {pipelineStatus === 'running'
                                ? <Loader size={15} className="spinner" />
                                : <span style={{ fontSize: '15px' }}>🤖</span>}
                            {pipelineStatus === 'running'
                                ? `Processing… ${pipelineProgress.completed}/${pipelineProgress.total}`
                                : 'Meta Data Tagging — Entire Engine'}
                        </button>

                        {/* Pipeline progress badges */}
                        {pipelineStatus === 'running' && (
                            <>
                                <span style={{ fontSize: '0.77rem', color: '#7c3aed', fontWeight: 600, background: '#ede9fe', padding: '4px 12px', borderRadius: '100px' }}>
                                    📄 Extracted: {pipelineProgress.extracted}
                                </span>
                                <span style={{ fontSize: '0.77rem', color: '#0369a1', fontWeight: 600, background: '#e0f2fe', padding: '4px 12px', borderRadius: '100px' }}>
                                    🏷️ Tagged: {pipelineProgress.tagged}
                                </span>
                                {pipelineProgress.errors > 0 && (
                                    <span style={{ fontSize: '0.77rem', color: '#dc2626', fontWeight: 600, background: '#fef2f2', padding: '4px 12px', borderRadius: '100px' }}>
                                        ❌ Errors: {pipelineProgress.errors}
                                    </span>
                                )}
                            </>
                        )}
                        {pipelineStatus === 'done' && (
                            <span style={{ fontSize: '0.78rem', color: '#16a34a', fontWeight: 600, background: '#dcfce7', padding: '4px 12px', borderRadius: '100px' }}>
                                ✅ Done — {pipelineProgress.tagged} tagged, {pipelineProgress.extracted} extracted
                                {pipelineProgress.errors > 0 ? `, ${pipelineProgress.errors} errors` : ''}
                            </span>
                        )}
                        {pipelineStatus === 'error' && (
                            <span style={{ fontSize: '0.78rem', color: '#dc2626', fontWeight: 600, background: '#fef2f2', padding: '4px 12px', borderRadius: '100px' }}>
                                ❌ Pipeline Failed
                            </span>
                        )}
                    </div>

                    {/* ── Pipeline Error Toast ── */}
                    {pipelineStatus === 'error' && pipelineError && (
                        <div style={{
                            position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999,
                            background: '#fff', border: '1.5px solid #fca5a5', borderRadius: '12px',
                            boxShadow: '0 8px 32px rgba(220,38,38,0.15)',
                            padding: '14px 20px', maxWidth: '420px', display: 'flex', gap: '12px', alignItems: 'flex-start'
                        }}>
                            <span style={{ fontSize: '1.4rem', flexShrink: 0 }}>❌</span>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 700, color: '#dc2626', marginBottom: '4px', fontSize: '0.88rem' }}>Metadata Pipeline Error</div>
                                <div style={{ fontSize: '0.82rem', color: '#7f1d1d', lineHeight: 1.5 }}>{pipelineError}</div>
                            </div>
                            <button
                                onClick={() => { setPipelineStatus('idle'); setPipelineError(null); }}
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
                                { label: 'Tagged Files 🏷️', value: fileStats.files_with_tags ?? 0, icon: '🤖', color: '#0369a1', bg: '#e0f2fe' },
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

                    {/* ── Split Panel: Sidebar + Metadata Viewer ── */}
                    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

                        {/* LEFT SIDEBAR: Folder Hierarchy */}
                        <div style={{
                            width: `${sidebarWidth}px`, background: '#E3F2FD',
                            borderRight: '1px solid #e0e0e0', overflowY: 'auto',
                            padding: '0.75rem 0.5rem', position: 'relative', flexShrink: 0
                        }}>
                            {metaFiles.length === 0 ? (
                                <div style={{ textAlign: 'center', color: '#999', padding: '2rem 1rem', fontSize: '0.82rem' }}>
                                    <Folder size={32} style={{ opacity: 0.3, marginBottom: '0.5rem', display: 'block', margin: '0 auto 0.5rem' }} />
                                    <p>No files found.<br />Run segregation first.</p>
                                </div>
                            ) : <MetaFileSidebar />}

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

                        {/* RIGHT PANEL: Metadata Viewer */}
                        <div style={{ flex: 1, background: 'var(--background)', overflowY: 'auto', padding: '1.5rem' }}>
                            <MetadataViewer file={metaSelectedFile} />
                        </div>
                    </div>
                </div>
            )}

            {/* ── LLP STATUS TAB ── */}
            {activeTab === 'LLP STATUS' && (
                <div style={{ flex: 1, padding: '2rem', background: '#f5f5f5', overflowY: 'auto' }}>
                    <LLPTable
                        engineId={id}
                        segData={segData?.segregated ? Object.values(segData.segregated).flat() : []}
                    />
                </div>
            )}

            {/* ── OTHER TABS (placeholder) ── */}
            {activeTab !== 'RAW FOLDER' && activeTab !== 'FOLDER SEGREGATION' && activeTab !== 'META DATA TAGGING' && activeTab !== 'LLP STATUS' && (
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
