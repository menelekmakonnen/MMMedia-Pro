/**
 * SFX / Foley Browser Tab
 *
 * Full-featured sound-effect browser component for the Media Manager.
 *
 * ┌─────────────────────────────────────────┐
 * │ 🔍 Search SFX...           [+ Folder]   │
 * ├─────────────────────────────────────────┤
 * │ ⭐ Favorites  🕐 Recent   📁 All       │
 * ├──────────┬──────────────────────────────┤
 * │ Category │  SFX File List               │
 * │ sidebar  │  ┌─────────────────────────┐ │
 * │          │  │ 🔊 swoosh_01.wav        │ │
 * │          │  │   0.4s | Swoosh          │ │
 * │          │  │ [▶] [⭐] [+ TL]         │ │
 * │          │  ├─────────────────────────┤ │
 * │          │  │ 🔊 bass_drop.mp3        │ │
 * │          │  │   0.8s | Impact          │ │
 * │          │  │ [▶] [⭐] [+ TL]         │ │
 * │          │  └─────────────────────────┘ │
 * └──────────┴──────────────────────────────┘
 *
 * ── IPC handler needed (add to electron/main.ts) ─────────────────────────────
 *
 * Channel: 'scan-sfx-folder'
 * Input:   string (absolute folder path)
 * Returns: Promise<{
 *   success: boolean;
 *   files?: Array<{
 *     path: string;      // absolute file path
 *     filename: string;  // basename
 *     size: number;      // bytes
 *     duration: number;  // seconds (from ffprobe)
 *   }>;
 *   error?: string;
 * }>
 *
 * Implementation sketch (Node / Electron main process):
 *   1. fs.readdirSync(folder) – recursively list files
 *   2. Filter by audio extensions: .wav, .mp3, .ogg, .flac, .aac, .m4a, .aif, .aiff
 *   3. For each file, run ffprobe to get duration:
 *      `ffprobe -v quiet -print_format json -show_format <path>`
 *      → parseFloat(format.duration)
 *   4. Return the file list sorted alphabetically.
 *
 * Channel: 'select-folder'
 * Input:   void
 * Returns: Promise<{ canceled: boolean; folderPath?: string }>
 *   Uses Electron's dialog.showOpenDialog({ properties: ['openDirectory'] }).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useRef, useMemo, useCallback } from 'react';
import {
    Search,
    FolderPlus,
    Star,
    Clock,
    FolderOpen,
    Play,
    Square,
    Plus,
    Volume2,
    Trash2,
    ArrowRightLeft,
    Zap,
    Home,
    Hand,
    Trees,
    Building2,
    Camera,
    Monitor,
    Music,
    Film,
    MoreHorizontal,
    Loader2,
    ChevronRight,
} from 'lucide-react';
import { useSfxStore, SfxFile } from '../../store/sfxStore';
import { useClipStore, Clip } from '../../store/clipStore';
import { SFX_CATEGORIES, CATEGORY_MAP, SUBCATEGORY_MAP } from '../../lib/sfxCategories';
import { categorizeSfx } from '../../lib/sfxCategorizer';
import { toast } from '../../components/Toast';
import { v4 as uuidv4 } from 'uuid';

// ── Lucide icon resolver ─────────────────────────────────────────────────────
// Maps the string icon names in SfxCategory to actual Lucide components.
const ICON_MAP: Record<string, React.FC<{ size?: number; style?: React.CSSProperties }>> = {
    ArrowRightLeft,
    Zap,
    Home,
    Hand,
    Trees,
    Building2,
    Camera,
    Monitor,
    Music,
    Film,
    MoreHorizontal,
};

// ── View modes ───────────────────────────────────────────────────────────────
type BrowseMode = 'all' | 'favorites' | 'recent';

// ── Styles ───────────────────────────────────────────────────────────────────
const S = {
    root: {
        display: 'flex',
        flexDirection: 'column' as const,
        height: '100%',
        background: '#1a1a2e',
        color: '#e0e0e0',
        fontSize: 13,
        overflow: 'hidden',
    },
    toolbar: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 10px',
        borderBottom: '1px solid #2a2a3e',
        flexShrink: 0,
    },
    searchWrap: {
        display: 'flex',
        alignItems: 'center',
        flex: 1,
        background: '#12121f',
        borderRadius: 6,
        padding: '0 8px',
        border: '1px solid #2a2a3e',
    },
    searchInput: {
        flex: 1,
        background: 'none',
        border: 'none',
        outline: 'none',
        color: '#e0e0e0',
        fontSize: 13,
        padding: '6px 4px',
    },
    addBtn: {
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        background: '#7c3aed',
        border: 'none',
        borderRadius: 6,
        color: '#fff',
        padding: '6px 10px',
        cursor: 'pointer',
        fontSize: 12,
        fontWeight: 600,
        whiteSpace: 'nowrap' as const,
        flexShrink: 0,
    },
    tabs: {
        display: 'flex',
        gap: 0,
        borderBottom: '1px solid #2a2a3e',
        flexShrink: 0,
    },
    tab: (active: boolean) => ({
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        padding: '7px 14px',
        background: active ? '#22223a' : 'transparent',
        borderBottom: active ? '2px solid #7c3aed' : '2px solid transparent',
        color: active ? '#e0e0e0' : '#888',
        cursor: 'pointer',
        fontSize: 12,
        fontWeight: active ? 600 : 400,
        border: 'none',
        borderTop: 'none',
        borderLeft: 'none',
        borderRight: 'none',
    }),
    body: {
        display: 'flex',
        flex: 1,
        overflow: 'hidden',
    },
    sidebar: {
        width: 140,
        flexShrink: 0,
        overflowY: 'auto' as const,
        borderRight: '1px solid #2a2a3e',
        padding: '4px 0',
    },
    sidebarItem: (active: boolean) => ({
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 10px',
        cursor: 'pointer',
        background: active ? '#2d2b55' : 'transparent',
        color: active ? '#c4b5fd' : '#aaa',
        fontSize: 12,
        fontWeight: active ? 600 : 400,
        borderLeft: active ? '3px solid #7c3aed' : '3px solid transparent',
        whiteSpace: 'nowrap' as const,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
    }),
    sidebarCount: {
        marginLeft: 'auto',
        fontSize: 10,
        color: '#666',
        flexShrink: 0,
    },
    subcategoryItem: (active: boolean) => ({
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 10px 4px 26px',
        cursor: 'pointer',
        background: active ? '#2d2b55' : 'transparent',
        color: active ? '#c4b5fd' : '#777',
        fontSize: 11,
        borderLeft: active ? '3px solid #a78bfa' : '3px solid transparent',
    }),
    fileList: {
        flex: 1,
        overflowY: 'auto' as const,
        padding: '4px 8px',
    },
    fileCard: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 10px',
        background: '#12121f',
        borderRadius: 6,
        marginBottom: 4,
        border: '1px solid #2a2a3e',
    },
    fileInfo: {
        flex: 1,
        minWidth: 0,
    },
    filename: {
        fontSize: 12,
        fontWeight: 500,
        color: '#e0e0e0',
        whiteSpace: 'nowrap' as const,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
    },
    fileMeta: {
        fontSize: 10,
        color: '#888',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        marginTop: 2,
    },
    categoryBadge: {
        fontSize: 9,
        padding: '1px 5px',
        borderRadius: 3,
        background: '#2d2b55',
        color: '#a78bfa',
        fontWeight: 600,
    },
    iconBtn: (color?: string) => ({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: color || '#888',
        padding: 4,
        borderRadius: 4,
    }),
    emptyState: {
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 12,
        color: '#666',
        fontSize: 13,
        padding: 24,
        textAlign: 'center' as const,
    },
    folderList: {
        padding: '6px 10px',
        borderTop: '1px solid #2a2a3e',
        flexShrink: 0,
        maxHeight: 72,
        overflowY: 'auto' as const,
        fontSize: 11,
        color: '#777',
    },
    folderTag: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        background: '#22223a',
        borderRadius: 4,
        padding: '2px 6px',
        margin: '2px 3px',
        fontSize: 10,
        color: '#aaa',
    },
} as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(s: number): string {
    if (s <= 0) return '–';
    if (s < 60) return `${s.toFixed(1)}s`;
    const m = Math.floor(s / 60);
    const sec = Math.round(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
}

function formatSize(bytes: number): string {
    if (bytes <= 0) return '';
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Component
// ═══════════════════════════════════════════════════════════════════════════════

export const SFXBrowserTab: React.FC = () => {
    // ── Store bindings ──
    const sfxFolders = useSfxStore((s) => s.sfxFolders);
    const sfxFiles = useSfxStore((s) => s.sfxFiles);
    const favorites = useSfxStore((s) => s.favorites);
    const recentlyUsed = useSfxStore((s) => s.recentlyUsed);
    const searchQuery = useSfxStore((s) => s.searchQuery);
    const activeCategory = useSfxStore((s) => s.activeCategory);
    const activeSubcategory = useSfxStore((s) => s.activeSubcategory);

    const {
        addSfxFolder,
        removeSfxFolder,
        addSfxFiles,
        toggleFavorite,
        recordUsage,
        setSearchQuery,
        setActiveCategory,
        setActiveSubcategory,
    } = useSfxStore.getState();

    // ── Local state ──
    const [browseMode, setBrowseMode] = useState<BrowseMode>('all');
    const [playingPath, setPlayingPath] = useState<string | null>(null);
    const [scanning, setScanning] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // ── Audio preview ──
    const handlePlay = useCallback((sfx: SfxFile) => {
        if (playingPath === sfx.path) {
            // Stop
            audioRef.current?.pause();
            setPlayingPath(null);
            return;
        }
        if (audioRef.current) {
            audioRef.current.pause();
        }
        const audio = new Audio(`file://${sfx.path}`);
        audio.volume = 0.7;
        audio.onended = () => setPlayingPath(null);
        audio.onerror = () => {
            toast.error(`Cannot play: ${sfx.filename}`);
            setPlayingPath(null);
        };
        audio.play().catch(() => {
            toast.error(`Playback failed: ${sfx.filename}`);
            setPlayingPath(null);
        });
        audioRef.current = audio;
        setPlayingPath(sfx.path);
    }, [playingPath]);

    // ── Add to timeline ──
    const handleAddToTimeline = useCallback((sfx: SfxFile) => {
        const { addClip } = useClipStore.getState();
        recordUsage(sfx.path);

        addClip({
            id: uuidv4(),
            type: 'audio',
            path: sfx.path,
            filename: sfx.filename,
            startFrame: 0,
            endFrame: Math.floor(sfx.duration * 30) || 30,
            sourceDurationFrames: Math.floor(sfx.duration * 30) || 30,
            trimStartFrame: 0,
            trimEndFrame: Math.floor(sfx.duration * 30) || 30,
            track: 102,
            speed: 1.0,
            volume: 100,
            reversed: false,
            isMuted: false,
            isPinned: false,
            origin: 'manual',
            locked: false,
        } as Clip);

        toast.success(`Added "${sfx.filename}" to SFX track`);
    }, [recordUsage]);

    // ── Folder add (IPC) ──
    const handleAddFolder = useCallback(async () => {
        try {
            setScanning(true);

            // Step 1: Pick folder
            const ipc = window.ipcRenderer as any;
            if (!ipc?.selectFiles) {
                toast.error('Electron IPC not available');
                setScanning(false);
                return;
            }
            const result = await ipc.selectFiles('folder');
            if (!result?.success || !result.files?.length) {
                setScanning(false);
                return;
            }

            // selectFiles('folder') returns a single entry with the folder path
            const folderPath: string = result.files[0].path;
            const folderName = folderPath.split(/[\\/]/).pop() || folderPath;

            // Register the folder
            addSfxFolder(folderPath, folderName);

            // Step 2: Scan folder for audio files via IPC
            // Falls back to treating the initial file list as audio if scan-sfx-folder isn't implemented
            let scannedFiles: Array<{ path: string; filename: string; size: number; duration: number }> = [];

            if (ipc.invoke) {
                try {
                    const scanResult = await ipc.invoke('scan-sfx-folder', folderPath);
                    if (scanResult?.success && scanResult.files) {
                        scannedFiles = scanResult.files;
                    }
                } catch {
                    // IPC handler not registered yet — fall back
                }
            }

            // Fallback: if the initial selectFiles returned audio-looking files, use those
            if (scannedFiles.length === 0 && result.files) {
                const audioExts = new Set(['wav', 'mp3', 'ogg', 'flac', 'aac', 'm4a', 'aif', 'aiff', 'opus']);
                scannedFiles = result.files
                    .filter((f: any) => {
                        const ext = (f.filename || f.path || '').split('.').pop()?.toLowerCase() || '';
                        return audioExts.has(ext);
                    })
                    .map((f: any) => ({
                        path: f.path,
                        filename: f.filename || f.path.split(/[\\/]/).pop() || 'unknown',
                        size: f.size || 0,
                        duration: f.duration || 0,
                    }));
            }

            // Step 3: Auto-categorize and add to store
            const sfxEntries: SfxFile[] = scannedFiles.map((f) => {
                const { categoryId, subcategoryId } = categorizeSfx(f.filename);
                return {
                    path: f.path,
                    filename: f.filename,
                    categoryId,
                    subcategoryId,
                    duration: f.duration,
                    size: f.size,
                    folderId: folderPath,
                };
            });

            addSfxFiles(sfxEntries);
            toast.success(`Added ${sfxEntries.length} SFX files from "${folderName}"`);
        } catch (err) {
            toast.error('Failed to add SFX folder');
        } finally {
            setScanning(false);
        }
    }, [addSfxFolder, addSfxFiles]);

    // ── Remove folder ──
    const handleRemoveFolder = useCallback((path: string) => {
        removeSfxFolder(path);
        toast.info('SFX folder removed');
    }, [removeSfxFolder]);

    // ── Filtering & counting ──
    const categoryCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const f of sfxFiles) {
            counts[f.categoryId] = (counts[f.categoryId] || 0) + 1;
        }
        return counts;
    }, [sfxFiles]);

    const subcategoryCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const f of sfxFiles) {
            counts[f.subcategoryId] = (counts[f.subcategoryId] || 0) + 1;
        }
        return counts;
    }, [sfxFiles]);

    const filteredFiles = useMemo(() => {
        let pool: SfxFile[] = [];

        // 1. Start with the right pool based on browse mode
        if (browseMode === 'favorites') {
            const favSet = new Set(favorites);
            pool = sfxFiles.filter((f) => favSet.has(f.path));
        } else if (browseMode === 'recent') {
            const pathIndex = new Map(sfxFiles.map((f) => [f.path, f]));
            pool = recentlyUsed
                .map((p) => pathIndex.get(p))
                .filter((f): f is SfxFile => !!f);
        } else {
            pool = sfxFiles;
        }

        // 2. Category / subcategory filter (only in 'all' mode)
        if (browseMode === 'all' && activeCategory) {
            pool = pool.filter((f) => f.categoryId === activeCategory);
            if (activeSubcategory) {
                pool = pool.filter((f) => f.subcategoryId === activeSubcategory);
            }
        }

        // 3. Search filter
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            pool = pool.filter((f) => f.filename.toLowerCase().includes(q));
        }

        return pool;
    }, [sfxFiles, browseMode, favorites, recentlyUsed, activeCategory, activeSubcategory, searchQuery]);

    // ── Active category's subcategories ──
    const activeSubcategories = useMemo(() => {
        if (!activeCategory) return [];
        const cat = CATEGORY_MAP.get(activeCategory);
        return cat?.subcategories || [];
    }, [activeCategory]);

    // ── Render ───────────────────────────────────────────────────────────────

    return (
        <div style={S.root}>
            {/* ── Toolbar ── */}
            <div style={S.toolbar}>
                <div style={S.searchWrap}>
                    <Search size={14} style={{ color: '#666', flexShrink: 0 }} />
                    <input
                        style={S.searchInput}
                        placeholder="Search SFX..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <button
                    style={S.addBtn}
                    onClick={handleAddFolder}
                    disabled={scanning}
                    title="Add SFX library folder"
                >
                    {scanning ? <Loader2 size={14} className="spin" /> : <FolderPlus size={14} />}
                    <span>+ Folder</span>
                </button>
            </div>

            {/* ── Mode tabs ── */}
            <div style={S.tabs}>
                <button style={S.tab(browseMode === 'favorites')} onClick={() => setBrowseMode('favorites')}>
                    <Star size={13} /> Favorites
                </button>
                <button style={S.tab(browseMode === 'recent')} onClick={() => setBrowseMode('recent')}>
                    <Clock size={13} /> Recent
                </button>
                <button style={S.tab(browseMode === 'all')} onClick={() => setBrowseMode('all')}>
                    <FolderOpen size={13} /> All
                </button>
            </div>

            {/* ── Body: sidebar + file list ── */}
            <div style={S.body}>
                {/* Category sidebar (only in "All" mode) */}
                {browseMode === 'all' && (
                    <div style={S.sidebar}>
                        {/* "All" entry */}
                        <div
                            style={S.sidebarItem(!activeCategory)}
                            onClick={() => setActiveCategory(null)}
                        >
                            <FolderOpen size={13} />
                            <span>All</span>
                            <span style={S.sidebarCount}>{sfxFiles.length}</span>
                        </div>

                        {SFX_CATEGORIES.map((cat) => {
                            const Icon = ICON_MAP[cat.icon] || Volume2;
                            const isActive = activeCategory === cat.id;
                            const count = categoryCounts[cat.id] || 0;

                            return (
                                <React.Fragment key={cat.id}>
                                    <div
                                        style={S.sidebarItem(isActive)}
                                        onClick={() => setActiveCategory(isActive ? null : cat.id)}
                                        title={cat.description}
                                    >
                                        <Icon size={13} />
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{cat.name}</span>
                                        <span style={S.sidebarCount}>{count}</span>
                                    </div>

                                    {/* Subcategories (expanded when active) */}
                                    {isActive && activeSubcategories.map((sc) => (
                                        <div
                                            key={sc.id}
                                            style={S.subcategoryItem(activeSubcategory === sc.id)}
                                            onClick={() => setActiveSubcategory(activeSubcategory === sc.id ? null : sc.id)}
                                        >
                                            <ChevronRight size={10} />
                                            <span>{sc.name}</span>
                                            <span style={S.sidebarCount}>{subcategoryCounts[sc.id] || 0}</span>
                                        </div>
                                    ))}
                                </React.Fragment>
                            );
                        })}
                    </div>
                )}

                {/* ── File list ── */}
                <div style={S.fileList}>
                    {filteredFiles.length === 0 ? (
                        <div style={S.emptyState}>
                            {sfxFiles.length === 0 ? (
                                <>
                                    <Volume2 size={32} style={{ color: '#444' }} />
                                    <div>No SFX files loaded</div>
                                    <div style={{ fontSize: 11, color: '#555' }}>
                                        Click <strong>+ Folder</strong> to add an SFX library directory
                                    </div>
                                </>
                            ) : browseMode === 'favorites' ? (
                                <>
                                    <Star size={28} style={{ color: '#444' }} />
                                    <div>No favourites yet</div>
                                    <div style={{ fontSize: 11, color: '#555' }}>
                                        Star SFX files to add them here
                                    </div>
                                </>
                            ) : browseMode === 'recent' ? (
                                <>
                                    <Clock size={28} style={{ color: '#444' }} />
                                    <div>No recently used SFX</div>
                                    <div style={{ fontSize: 11, color: '#555' }}>
                                        Add SFX to your timeline and they'll appear here
                                    </div>
                                </>
                            ) : (
                                <>
                                    <Search size={28} style={{ color: '#444' }} />
                                    <div>No matches found</div>
                                </>
                            )}
                        </div>
                    ) : (
                        filteredFiles.map((sfx) => {
                            const isPlaying = playingPath === sfx.path;
                            const isFav = favorites.includes(sfx.path);
                            const subcat = SUBCATEGORY_MAP.get(sfx.subcategoryId);

                            return (
                                <div key={sfx.path} style={S.fileCard}>
                                    {/* Sound icon */}
                                    <Volume2 size={16} style={{ color: '#7c3aed', flexShrink: 0 }} />

                                    {/* Info */}
                                    <div style={S.fileInfo}>
                                        <div style={S.filename} title={sfx.path}>
                                            {sfx.filename}
                                        </div>
                                        <div style={S.fileMeta}>
                                            <span>{formatDuration(sfx.duration)}</span>
                                            {sfx.size > 0 && <span>{formatSize(sfx.size)}</span>}
                                            {subcat && (
                                                <span style={S.categoryBadge}>{subcat.name}</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <button
                                        style={S.iconBtn(isPlaying ? '#7c3aed' : undefined)}
                                        onClick={() => handlePlay(sfx)}
                                        title={isPlaying ? 'Stop preview' : 'Preview'}
                                    >
                                        {isPlaying ? <Square size={14} /> : <Play size={14} />}
                                    </button>

                                    <button
                                        style={S.iconBtn(isFav ? '#eab308' : undefined)}
                                        onClick={() => toggleFavorite(sfx.path)}
                                        title={isFav ? 'Remove from favourites' : 'Add to favourites'}
                                    >
                                        <Star size={14} fill={isFav ? '#eab308' : 'none'} />
                                    </button>

                                    <button
                                        style={S.iconBtn('#7c3aed')}
                                        onClick={() => handleAddToTimeline(sfx)}
                                        title="Add to timeline (SFX track)"
                                    >
                                        <Plus size={14} />
                                    </button>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* ── Registered folders footer ── */}
            {sfxFolders.length > 0 && (
                <div style={S.folderList}>
                    {sfxFolders.map((f) => (
                        <span key={f.path} style={S.folderTag}>
                            <FolderOpen size={10} />
                            <span title={f.path}>{f.name}</span>
                            <button
                                style={{ ...S.iconBtn('#666'), padding: 0, marginLeft: 2 }}
                                onClick={() => handleRemoveFolder(f.path)}
                                title="Remove folder"
                            >
                                <Trash2 size={9} />
                            </button>
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
};

export default SFXBrowserTab;
