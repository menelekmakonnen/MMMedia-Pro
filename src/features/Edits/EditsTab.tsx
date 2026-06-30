import React, { useState, useCallback, useMemo } from 'react';
import { useSavedEditsStore, SavedEdit } from '../../store/savedEditsStore';
import { useClipStore } from '../../store/clipStore';
import { useProjectStore } from '../../store/projectStore';
import { useViewStore } from '../../store/viewStore';
import { useMediaStore } from '../../store/mediaStore';
import { useProjectsStore } from '../../store/projectsStore';
import { ProjectDrawer } from '../../components/ProjectDrawer';
import { generateManifest } from '../../lib/manifestBridge';
import { buildMediaFile } from '../../lib/mediaProbe';
import {
    Trash2, Film, PlayCircle, HardDriveDownload, Calendar, AlertCircle,
    Save, FolderUp, Clock, Layers, AlertTriangle, Sparkles, Search, SortDesc, Play, FolderOpen
} from 'lucide-react';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from '../../components/Toast';
import { DEFAULT_FPS } from '../../lib/time';

/* ── Animated Thumbnail Placeholder ────────────────────────────────── */
const AnimatedThumbnail = ({ clipCount = 0 }: { clipCount?: number }) => (
    <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0" style={{
            background: 'linear-gradient(135deg, #0a0a1a 0%, #111 30%, #1a0a2e 60%, #0a0a1a 100%)',
            backgroundSize: '300% 300%',
            animation: 'gm-gradient-shift 8s ease infinite',
        }} />
        {/* Film strip perforations */}
        <div className="absolute left-0 top-0 bottom-0 w-5 flex flex-col items-center justify-around py-2">
            {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="w-2.5 h-3 rounded-sm bg-white/[0.08] border border-white/10" />
            ))}
        </div>
        <div className="absolute right-0 top-0 bottom-0 w-5 flex flex-col items-center justify-around py-2">
            {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="w-2.5 h-3 rounded-sm bg-white/[0.08] border border-white/10" />
            ))}
        </div>
        {/* Waveform bars */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-end gap-[2px] h-8">
            {Array.from({ length: 16 }).map((_, i) => (
                <div key={i} className="w-[3px] rounded-full bg-primary"
                    style={{
                        height: `${12 + Math.sin(i * 0.7) * 10}px`,
                        opacity: 0.3 + Math.sin(i * 0.5) * 0.2,
                        animation: `gm-waveform 1.5s ease-in-out ${i * 0.08}s infinite alternate`,
                    }} />
            ))}
        </div>
        {/* Center icon */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1">
            <Film size={28} className="text-white/20" style={{ animation: 'gm-icon-pulse 2.5s ease-in-out infinite' }} />
            {clipCount > 0 && <span className="text-[10px] font-mono font-bold text-white/25">{clipCount} cuts</span>}
        </div>
    </div>
);

/* ── Re-Link Modal ─────────────────────────────────────────────────── */
const RelinkModal = ({ missingFiles, totalFiles, onProceed, onCancel }: {
    missingFiles: string[]; totalFiles: number;
    onProceed: () => void; onCancel: () => void;
}) => (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onCancel}>
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
            className="bg-[#0d0d1a] border border-amber-500/30 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-amber-500/20"><AlertTriangle size={20} className="text-amber-400" /></div>
                <div>
                    <h3 className="text-sm font-black text-white">Missing Source Files</h3>
                    <p className="text-[11px] text-white/40 mt-0.5">{missingFiles.length} of {totalFiles} files could not be found</p>
                </div>
            </div>
            <div className="max-h-48 overflow-y-auto custom-scrollbar mb-4 space-y-1.5">
                {missingFiles.map((path, i) => (
                    <div key={i} className="flex items-center gap-2 text-[10px] font-mono text-red-400/80 bg-red-500/5 px-3 py-1.5 rounded-lg border border-red-500/10">
                        <AlertCircle size={10} className="flex-shrink-0" /><span className="truncate">{path}</span>
                    </div>
                ))}
            </div>
            <p className="text-[10px] text-white/30 mb-4">Missing files will appear as black clips. You can still load the edit to recover existing media.</p>
            <div className="flex gap-2">
                <button onClick={onCancel} className="flex-1 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 text-xs font-bold border border-white/10 transition-colors">Cancel</button>
                <button onClick={onProceed} className="flex-1 py-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 text-xs font-bold border border-amber-500/30 transition-colors">Load Anyway</button>
            </div>
        </motion.div>
    </div>
);

/* ═══════════════════════════════════════════════════════════════════════
 * EditsTab — Saved Edits & Trailers manager
 * ═══════════════════════════════════════════════════════════════════════ */
export const EditsTab: React.FC = () => {
    const { savedEdits, removeEdit, updateEditLastOpened } = useSavedEditsStore();
    const { setClips } = useClipStore();
    const { setActiveTab } = useViewStore();

    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    const [relinkState, setRelinkState] = useState<{ edit: SavedEdit; missingFiles: string[]; totalFiles: number } | null>(null);
    const [search, setSearch] = useState('');

    const checkFileExists = useCallback(async (filePath: string) => {
        try {
            if (window.ipcRenderer?.checkFileExists) {
                const result = await window.ipcRenderer.checkFileExists(filePath);
                return result?.exists !== false;
            }
        } catch { /* fallback */ }
        return true;
    }, []);

    /** Extract unique folder paths from clip file paths (fallback for legacy edits) */
    const extractFoldersFromClips = (clips: SavedEdit['clips']): string[] => {
        const folders = new Set<string>();
        for (const clip of clips) {
            if (clip.path) {
                const folder = clip.path.replace(/[\\/][^\\/]+$/, '');
                if (folder && folder !== clip.path) folders.add(folder);
            }
        }
        return [...folders];
    };

    const doLoadEdit = useCallback(async (edit: SavedEdit) => {
        const mediaStore = useMediaStore.getState();

        // ── 1. Restore source files into Media Manager ──────────────
        // Scope the restore to the folders THIS edit's clips actually live in.
        // We derive them from the clips themselves rather than trusting
        // `edit.sourceFolders`, which historically captured the global list of
        // every folder ever opened (mediaStore.recentFolders) — that made loading
        // one edit pull in every past project's sources. Fall back to the stored
        // folders only when the clips carry no usable paths.
        const clipFolders = extractFoldersFromClips(edit.clips);
        const foldersToLoad = clipFolders.length > 0
            ? clipFolders
            : (edit.sourceFolders ?? []);

        if (foldersToLoad.length > 0) {
            mediaStore.clearLibrary();
            let totalLoaded = 0;
            for (const folder of foldersToLoad) {
                try {
                    const result = await (window.ipcRenderer as any).loadFolder(folder);
                    if (result?.success && result.files) {
                        const newFiles = await Promise.all(
                            result.files.map((file: any) => buildMediaFile(file))
                        );
                        mediaStore.addFiles(newFiles as any);
                        mediaStore.addRecentFolder(folder, newFiles.length);
                        totalLoaded += newFiles.length;
                    }
                } catch (err) {
                    console.warn('[EditsTab] Failed to load folder:', folder, err);
                }
            }
            if (totalLoaded > 0) {
                console.log(`[EditsTab] Restored ${totalLoaded} source files from ${foldersToLoad.length} folder(s)`);
            }
        }

        // ── 2. Preload audio for Beat Intelligence ──────────────────
        if (edit.audioFilePath) {
            mediaStore.setPreloadedAudio(edit.audioFilePath, edit.audioFileName || 'Audio');
        }

        // ── 3. Restore generator settings snapshot ──────────────────
        if (edit.settingsSnapshot) {
            try {
                const persistable = { ...edit.settingsSnapshot };
                delete persistable.audioAnalysis;
                delete persistable.narrationAnalysis;
                delete persistable.seed; // don't pin future generations to this edit's seed
                localStorage.setItem('mmm_trailer_settings', JSON.stringify(persistable));
            } catch (err) {
                console.warn('[EditsTab] Failed to restore settings:', err);
            }
        }

        // ── 4. Load clips into timeline ─────────────────────────────
        setClips(edit.clips);
        updateEditLastOpened(edit.id);

        // ── 5. Select this edit's source files in the Media Library ──
        // Match by path (file ids are re-derived from the path on reload), so the
        // Import/Media Library page opens with exactly this edit's clips selected
        // and ready — not every file in the restored folders.
        const norm = (p: string) => p.replace(/\\/g, '/').toLowerCase();
        const editPaths = new Set(edit.clips.map((c) => c.path).filter(Boolean).map((p) => norm(p as string)));
        const loadedFiles = useMediaStore.getState().files;
        const selectIds = loadedFiles.filter((f) => f.path && editPaths.has(norm(f.path))).map((f) => f.id);
        if (selectIds.length > 0) mediaStore.selectAllFiles(selectIds);
        else mediaStore.clearSelection();

        // ── 6. Navigate to the Import / Media Library page ──────────
        setActiveTab('media');
        setRelinkState(null);
        toast.success(`Loaded "${edit.name}" — ${selectIds.length} source clip(s) selected and ready`);
    }, [setClips, setActiveTab, updateEditLastOpened]);

    // Open Project — the new flow that replaces "Open in Timeline". Finds (or
    // synthesizes) the .mmm project for this edit, reloads its media + segment
    // decisions, restores the edit's clips, and opens the project workspace.
    const handleOpenProject = useCallback(async (edit: SavedEdit) => {
        const ps = useProjectsStore.getState();
        const project = ps.ensureProjectForEdit(edit);
        try {
            await ps.loadProject(project);
        } catch { /* folders may be missing; continue with the edit's clips */ }
        setClips(edit.clips);
        updateEditLastOpened(edit.id);
        setActiveTab('import-manager');
        toast.success(`Opened project "${project.name}"`);
    }, [setClips, setActiveTab, updateEditLastOpened]);

    const handleLoadToTimeline = useCallback(async (edit: SavedEdit) => {
        if (edit.clips && edit.clips.length > 0) {
            const uniquePaths = [...new Set(edit.clips.map(c => c.path).filter(Boolean))];
            const checks = await Promise.all(uniquePaths.map(async path => ({
                path, exists: await checkFileExists(path)
            })));
            const missing = checks.filter(c => !c.exists).map(c => c.path);
            if (missing.length > 0) {
                setRelinkState({ edit, missingFiles: missing, totalFiles: uniquePaths.length });
                return;
            }
        }
        await doLoadEdit(edit);
    }, [checkFileExists, doLoadEdit]);

    const handleExportManifest = async (edit: SavedEdit) => {
        try {
            // Temporarily set clips for manifest generation
            const prevClips = useClipStore.getState().clips;
            setClips(edit.clips);
            const manifest = generateManifest();
            setClips(prevClips);
            const result = await window.ipcRenderer.saveManifest(JSON.stringify(manifest, null, 2));
            if (result.success) toast.success(`Manifest exported for "${edit.name}"`);
            else toast.error(`Export failed: ${result.error}`);
        } catch (error) {
            toast.error('Failed to export manifest');
        }
    };

    const handleSaveMmm = async () => {
        try {
            const safeProjectName = useProjectStore.getState().settings.name?.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'mmmedia';
            const { canceled, filePath } = await window.ipcRenderer.showExportDialog({
                defaultPath: `${safeProjectName}_edits.mmm`,
                filters: [{ name: 'MMMedia Project', extensions: ['mmm'] }]
            });
            if (canceled || !filePath) return;
            const payload = JSON.stringify({ savedEdits: useSavedEditsStore.getState().savedEdits }, null, 2);
            await (window.ipcRenderer as any).writeFile(filePath, payload);
            toast.success(`Saved ${savedEdits.length} edits to .mmm`);
        } catch (err) {
            console.error('Failed to save .mmm:', err);
            toast.error('Failed to save .mmm file');
        }
    };

    const handleLoadMmm = async () => {
        try {
            const result = await window.ipcRenderer.loadProject();
            if (result.success && result.content) {
                const payload = JSON.parse(result.content);
                if (payload.savedEdits) {
                    useSavedEditsStore.getState().loadEdits(payload.savedEdits);
                    toast.success(`Loaded ${payload.savedEdits.length} saved edits`);
                }
            }
        } catch (err) {
            console.error('Failed to load .mmm:', err);
            toast.error('Failed to load .mmm file');
        }
    };

    // Sort by most recently opened, then created
    const sortedEdits = useMemo(() => {
        let edits = [...(savedEdits || [])].sort((a, b) => {
            const aTime = a.lastOpenedAt || a.createdAt || '';
            const bTime = b.lastOpenedAt || b.createdAt || '';
            return new Date(bTime).getTime() - new Date(aTime).getTime();
        });
        if (search) {
            const q = search.toLowerCase();
            edits = edits.filter(e => e.name.toLowerCase().includes(q) || e.godModeVibe?.toLowerCase().includes(q));
        }
        return edits;
    }, [savedEdits, search]);

    const formatDuration = (dur: number) => {
        if (dur >= 60) return `${Math.floor(dur / 60)}m ${Math.round(dur % 60)}s`;
        return `${Math.round(dur)}s`;
    };

    return (
        <div className="w-full h-full overflow-y-auto custom-scrollbar">
            <ProjectDrawer side="right" />
            <div className="max-w-6xl mx-auto p-8 flex flex-col gap-6 h-full">
                {/* Header */}
                <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-gradient-to-br from-purple-500 to-blue-600 rounded-lg shadow-lg">
                            <Film size={20} className="text-white drop-shadow-md" />
                        </div>
                        <div>
                            <h2 className="text-lg font-black tracking-tight text-white">Saved Edits & Trailers</h2>
                            <p className="text-xs text-white/50">
                                {sortedEdits.length > 0
                                    ? `${sortedEdits.length} saved edit${sortedEdits.length !== 1 ? 's' : ''} · Click to restore to timeline`
                                    : 'Manage and export your procedurally generated sequences.'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={handleLoadMmm}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-[10px] font-bold uppercase tracking-wider border border-white/5 transition-all">
                            <FolderUp size={14} /> Load .mmm
                        </button>
                        <button onClick={handleSaveMmm}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/20 hover:bg-primary/40 text-primary-300 hover:text-white text-[10px] font-bold uppercase tracking-wider border border-primary/30 transition-all">
                            <Save size={14} /> Save .mmm
                        </button>
                    </div>
                </div>

                {/* Search Bar */}
                {sortedEdits.length > 3 && (
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                            placeholder="Search edits..."
                            className="w-full bg-black/30 border border-white/5 rounded-lg pl-9 pr-4 py-2.5 text-xs text-white placeholder-white/20 outline-none focus:border-primary/30 transition-colors" />
                    </div>
                )}

                {/* Grid */}
                <div className="flex-1">
                    {sortedEdits.length === 0 ? (
                        /* Empty State */
                        <div className="h-full flex flex-col items-center justify-center text-white/20 gap-6 min-h-[400px]">
                            <div className="w-24 h-24 rounded-full border border-dashed border-white/20 flex items-center justify-center relative overflow-hidden">
                                <Film size={40} className="text-white/30" style={{ animation: 'gm-icon-pulse 3s ease-in-out infinite' }} />
                                <div className="absolute inset-0 bg-gradient-to-t from-primary/5 to-transparent" />
                            </div>
                            <div className="text-center">
                                <h3 className="text-xl font-bold text-white/60 mb-2">No Saved Edits</h3>
                                <p className="text-sm font-medium text-white/30">Use the Trailer Generator to create sequences,<br />then press "Keep Edit" to save them here.</p>
                            </div>
                            <button onClick={() => setActiveTab('trailer')}
                                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary/20 hover:bg-primary/40 text-primary-300 text-xs font-bold uppercase tracking-wider border border-primary/30 transition-all">
                                <Sparkles size={16} /> Go to Trailer Generator
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                            <AnimatePresence>
                                {sortedEdits.map((edit, idx) => (
                                    <motion.div layout
                                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.9 }}
                                        transition={{ delay: idx * 0.04, type: 'spring', stiffness: 300, damping: 25 }}
                                        key={edit.id}
                                        className="bg-black/40 rounded-2xl border border-white/5 overflow-hidden shadow-2xl group flex flex-col hover:border-white/15 hover:shadow-[0_0_30px_rgba(var(--color-primary),0.08)] transition-all duration-300"
                                    >
                                        {/* Thumbnail — 4:5 vertical */}
                                        <div className="relative aspect-[4/5] border-b border-white/5 flex flex-col justify-end overflow-hidden group/thumb cursor-pointer"
                                            onClick={() => handleOpenProject(edit)}
                                            onMouseEnter={(e) => {
                                                const vid = e.currentTarget.querySelector('video');
                                                if (vid) { vid.play().catch(() => {}); }
                                            }}
                                            onMouseLeave={(e) => {
                                                const vid = e.currentTarget.querySelector('video');
                                                if (vid) { vid.pause(); }
                                            }}>
                                            {/* Real video thumbnail or animated fallback */}
                                            {(() => {
                                                const thumbPath = edit.thumbnailPath || edit.clips?.find(c => c.type === 'video' && c.path)?.path;
                                                if (thumbPath) {
                                                    return (
                                                        <video
                                                            src={`file://${thumbPath}`}
                                                            className="absolute inset-0 w-full h-full object-cover"
                                                            muted
                                                            loop
                                                            playsInline
                                                            preload="metadata"
                                                            onLoadedMetadata={(e) => {
                                                                const vid = e.currentTarget;
                                                                if (vid.duration > 1) vid.currentTime = 1;
                                                                else if (vid.duration > 0) vid.currentTime = vid.duration * 0.3;
                                                            }}
                                                        />
                                                    );
                                                }
                                                return <AnimatedThumbnail clipCount={edit.clipCount} />;
                                            })()}
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none" />
                                            {/* Play icon on hover */}
                                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity duration-200 pointer-events-none z-10">
                                                <div className="w-12 h-12 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
                                                    <Play size={22} className="text-white/80 ml-0.5" />
                                                </div>
                                            </div>
                                            {/* Shimmer on hover */}
                                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.03] to-transparent opacity-0 group-hover/thumb:opacity-100 transition-opacity duration-500 pointer-events-none" style={{ transform: 'skewX(-20deg)' }} />
                                            {/* Stat badges */}
                                            <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
                                                <div className="bg-black/60 px-2 py-1 rounded text-[10px] font-mono font-bold text-white/50 flex items-center gap-1 backdrop-blur-sm border border-white/10">
                                                    <Layers size={9} /> {edit.clipCount}
                                                </div>
                                                <div className="bg-black/60 px-2 py-1 rounded text-[10px] font-mono font-bold text-white/50 flex items-center gap-1 backdrop-blur-sm border border-white/10">
                                                    <Clock size={9} /> {formatDuration(edit.duration)}
                                                </div>
                                            </div>
                                            {/* GodMode badge */}
                                            {edit.godModeVibe && (
                                                <div className="absolute top-3 left-3 z-10">
                                                    <div className="bg-yellow-500/20 px-2 py-1 rounded text-[9px] font-bold text-yellow-300 border border-yellow-500/20 backdrop-blur-sm uppercase tracking-wider">
                                                        ⚡ {edit.godModeVibe}
                                                    </div>
                                                </div>
                                            )}
                                            {/* Title overlay */}
                                            <div className="px-4 py-3 relative z-10 w-full">
                                                <h3 className="text-sm font-black text-white truncate drop-shadow-md group-hover/thumb:text-primary-300 transition-colors">
                                                    {edit.name}
                                                </h3>
                                                <div className="text-[10px] text-white/50 uppercase tracking-widest font-bold flex items-center gap-1.5 mt-0.5">
                                                    <Calendar size={10} />
                                                    {new Date(edit.createdAt).toLocaleDateString()}
                                                    {edit.lastOpenedAt && (
                                                        <span className="text-white/25 ml-1">· opened {new Date(edit.lastOpenedAt).toLocaleDateString()}</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="p-3 flex flex-col gap-2">
                                            <button onClick={() => handleOpenProject(edit)}
                                                className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-white/5 hover:bg-primary text-white/80 hover:text-white text-xs font-bold transition-all border border-white/5 group/btn">
                                                <FolderOpen size={14} className="group-hover/btn:animate-pulse" /> Open Project
                                            </button>
                                            <div className="flex gap-2">
                                                <button onClick={() => {
                                                    setClips(edit.clips);
                                                    updateEditLastOpened(edit.id);
                                                    setActiveTab('export');
                                                    toast.success(`Loaded "${edit.name}" — ready to render`);
                                                }}
                                                    className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-purple-500/10 hover:bg-purple-500/30 text-purple-400 hover:text-purple-200 text-xs font-bold transition-all border border-purple-500/20">
                                                    <HardDriveDownload size={14} /> Render
                                                </button>
                                                {deleteConfirm === edit.id ? (
                                                    <button
                                                        onClick={() => { removeEdit(edit.id); setDeleteConfirm(null); toast.success('Edit deleted'); }}
                                                        onMouseLeave={() => setDeleteConfirm(null)}
                                                        className="w-10 flex items-center justify-center rounded-xl bg-red-500/80 hover:bg-red-500 text-white transition-all shadow-[0_0_15px_rgba(239,68,68,0.5)]"
                                                        title="Click again to confirm">
                                                        <AlertCircle size={14} />
                                                    </button>
                                                ) : (
                                                    <button onClick={() => setDeleteConfirm(edit.id)}
                                                        className="w-10 flex items-center justify-center rounded-xl bg-white/5 hover:bg-red-500/20 text-white/40 hover:text-red-400 border border-transparent hover:border-red-500/30 transition-all">
                                                        <Trash2 size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>
                    )}
                </div>
            </div>

            {/* Re-link modal */}
            <AnimatePresence>
                {relinkState && (
                    <RelinkModal
                        missingFiles={relinkState.missingFiles}
                        totalFiles={relinkState.totalFiles}
                        onProceed={() => doLoadEdit(relinkState.edit)}
                        onCancel={() => setRelinkState(null)}
                    />
                )}
            </AnimatePresence>

            {/* Keyframe animations */}
            <style>{`
                @keyframes gm-gradient-shift {
                    0% { background-position: 0% 50%; }
                    50% { background-position: 100% 50%; }
                    100% { background-position: 0% 50%; }
                }
                @keyframes gm-waveform {
                    0% { transform: scaleY(0.5); }
                    100% { transform: scaleY(1.3); }
                }
                @keyframes gm-icon-pulse {
                    0%, 100% { opacity: 0.15; transform: scale(1); }
                    50% { opacity: 0.35; transform: scale(1.1); }
                }
            `}</style>
        </div>
    );
};
