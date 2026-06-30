import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import {
    LayoutGrid, Plus, Play, Pause, Trash2, ChevronDown,
    Wand2, Zap, Sparkles, Lock, Unlock, Monitor, Smartphone, Square,
    Lightbulb, Timer, ToggleLeft, ToggleRight
} from 'lucide-react';
import { useClipStore } from '../../store/clipStore';
import { useMediaStore } from '../../store/mediaStore';
import type { GridClip, GridFormat } from '../../types';
import { GridPlayer } from '../../components/GridPlayer';
import { GridCellEditor } from './GridCellEditor';
import { GridGlobalControls } from './GridGlobalControls';

// ─── Grid Edit Engine (created in parallel — import will resolve once available) ─
let generateGridSequence: ((grid: GridClip, mediaFiles: unknown[], audioAnalysis: unknown, fps: number) => Partial<GridClip>) | null = null;
try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const engine = require('../../lib/gridEditEngine');
    generateGridSequence = engine.generateGridSequence;
} catch {
    // gridEditEngine not yet built — generate buttons will show a fallback
}

// ─── Grid Format Presets ──────────────────────────────────────────────────────
const GRID_PRESETS = [
    { label: '2-Split H', cells: 2, format: 'horizontal' as GridFormat, icon: '▬▬' },
    { label: '2-Split V', cells: 2, format: 'vertical' as GridFormat, icon: '▮▮' },
    { label: '3-Panel', cells: 3, format: 'horizontal' as GridFormat, icon: '▬▬▬' },
    { label: '4-Grid', cells: 4, format: 'square' as GridFormat, icon: '⊞' },
    { label: '6-Grid', cells: 6, format: 'horizontal' as GridFormat, icon: '⊞⊞' },
    { label: '9-Grid', cells: 9, format: 'square' as GridFormat, icon: '⊞⊞⊞' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// GridEditorTab
// ═══════════════════════════════════════════════════════════════════════════════
export const GridEditorTab: React.FC = () => {
    const { clips, createGrid, updateGrid, deleteClip } = useClipStore();
    const { files } = useMediaStore();

    // Filter only grid clips
    const gridClips = clips.filter(c => c.type === 'grid') as GridClip[];

    const [selectedGridId, setSelectedGridId] = useState<string | null>(
        gridClips.length > 0 ? gridClips[0].id : null
    );
    const selectedGrid = gridClips.find(g => g.id === selectedGridId) || null;

    const [isPlaying, setIsPlaying] = useState(false);
    const [currentFrame, setCurrentFrame] = useState(0);
    const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
    const [showNewGridMenu, setShowNewGridMenu] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);

    // ── Subtab state ──────────────────────────────────────────────────────────
    const [activeSubTab, setActiveSubTab] = useState<'generator' | 'editor'>('generator');

    // ── Generator panel state ─────────────────────────────────────────────────
    const [genCells, setGenCells] = useState(4);
    const [genFormat, setGenFormat] = useState<GridFormat>('horizontal');
    const [gridDuration, setGridDuration] = useState(3);
    const [extendedDuration, setExtendedDuration] = useState(false);

    // ── Orientation auto-suggest ──────────────────────────────────────────────
    const hCount = files.filter(f => (f.width || 0) > (f.height || 0)).length;
    const vCount = files.filter(f => (f.height || 0) > (f.width || 0)).length;
    const sCount = files.filter(f => (f.width || 0) === (f.height || 0) && f.width).length;
    const suggestedFormat: GridFormat = vCount > hCount ? 'vertical' : hCount > vCount ? 'horizontal' : 'square';

    // Auto-select suggested format on mount / when media changes
    useEffect(() => {
        setGenFormat(suggestedFormat);
    }, [suggestedFormat]);

    const videoFiles = files.filter(f => f.type === 'video' || f.type === 'image');

    // ── Auto-select newly created grids ───────────────────────────────────────
    useEffect(() => {
        if (gridClips.length > 0 && !selectedGrid) {
            setSelectedGridId(gridClips[gridClips.length - 1].id);
        }
    }, [gridClips.length]);

    // Check grid completion
    const isGridComplete = selectedGrid
        ? selectedGrid.cells.every(c => (c.clips && c.clips.length > 0) || c.clip)
        : false;

    const filledCells = selectedGrid
        ? selectedGrid.cells.filter(c => (c.clips?.length ?? 0) > 0 || c.clip).length
        : 0;

    // ── Handlers ──────────────────────────────────────────────────────────────
    const handleCreateGrid = (numCells: number, format: GridFormat) => {
        createGrid(numCells, format);
        setShowNewGridMenu(false);
    };

    const handleDeleteGrid = (gridId: string) => {
        deleteClip(gridId);
        setSelectedGridId(null);
        setSelectedCellId(null);
    };

    const handleUpdateNumCells = (numCells: number) => {
        if (selectedGrid) {
            const newCells = Array.from({ length: numCells }).map((_, i) =>
                selectedGrid.cells[i] || {
                    id: crypto.randomUUID(),
                    clip: null,
                    clips: [],
                    x: 0, y: 0, width: 1, height: 1,
                }
            );
            updateGrid(selectedGrid.id, { numCells, cells: newCells });
        }
    };

    const handleAddToSequence = () => {
        if (!selectedGrid || !isGridComplete) return;
        const maxEnd = clips.reduce((max, c) => Math.max(max, c.endFrame), 0);
        updateGrid(selectedGrid.id, {
            startFrame: maxEnd,
            endFrame: maxEnd + (selectedGrid.endFrame - selectedGrid.startFrame),
        });
    };

    const handleGenerateAll = useCallback(async () => {
        if (!selectedGrid || !generateGridSequence) return;
        setIsGenerating(true);
        try {
            // audioAnalysis = null for now, will wire when audio analysis is integrated
            const updatedGrid = generateGridSequence(selectedGrid, videoFiles, null, 30);
            updateGrid(selectedGrid.id, updatedGrid);
        } catch (err) {
            console.error('[GridEditor] Generate all failed:', err);
        } finally {
            setIsGenerating(false);
        }
    }, [selectedGrid, videoFiles, updateGrid]);

    const handleRegenerateCell = useCallback(() => {
        if (!selectedGrid || !selectedCellId) return;
        // Mark cell for regeneration (engine picks this up)
        const { updateGridCell } = useClipStore.getState();
        updateGridCell(selectedGrid.id, selectedCellId, {
            isGenerated: false,
            generationSeed: Math.floor(Math.random() * 999999),
        });
    }, [selectedGrid, selectedCellId]);

    // ── Sync mode indicator ───────────────────────────────────────────────────
    const syncMode = selectedGrid?.syncMode ?? 'independent';

    // ══════════════════════════════════════════════════════════════════════════
    // RENDER
    // ══════════════════════════════════════════════════════════════════════════
    return (
        <div className="h-full flex flex-col bg-background overflow-hidden text-white relative">

            {/* ═══ SUBTAB BAR ═════════════════════════════════════════════ */}
            <div className="flex border-b border-white/5 bg-[#0a0a12] flex-shrink-0">
                {(['generator', 'editor'] as const).map(tab => (
                    <button key={tab} onClick={() => setActiveSubTab(tab)}
                        className={clsx("flex-1 py-2.5 text-[11px] font-bold uppercase tracking-wider transition-all border-b-2",
                            activeSubTab === tab
                                ? "text-primary border-primary bg-primary/5"
                                : "text-white/40 border-transparent hover:text-white/60 hover:bg-white/5")}>
                        {tab === 'generator' ? 'Grid Generator Engine' : 'Grid Editor'}
                    </button>
                ))}
            </div>

            {/* ═══ GENERATOR TAB ══════════════════════════════════════════ */}
            {activeSubTab === 'generator' && (
                <div className="flex-1 overflow-y-auto">
                    <div className="max-w-2xl mx-auto p-6 space-y-5">
                        {/* Header */}
                        <div className="text-center">
                            <h2 className="text-lg font-bold flex items-center justify-center gap-2">
                                <Sparkles size={18} className="text-primary" />
                                Grid Generator Engine
                            </h2>
                            <p className="text-[11px] text-white/40 mt-1">
                                Auto-generate complete grids with intelligent cell filling
                            </p>
                        </div>

                        {/* Orientation Auto-Suggest Banner */}
                        <div className="flex items-start gap-3 p-3 bg-primary/5 border border-primary/20 rounded-xl">
                            <Lightbulb size={16} className="text-primary mt-0.5 flex-shrink-0" />
                            <div>
                                <p className="text-[11px] font-bold text-primary">
                                    Suggested orientation: {suggestedFormat.charAt(0).toUpperCase() + suggestedFormat.slice(1)}
                                </p>
                                <p className="text-[10px] text-white/40 mt-0.5">
                                    Based on {hCount} horizontal, {vCount} vertical, and {sCount} square media file{(hCount + vCount + sCount) !== 1 ? 's' : ''}
                                </p>
                            </div>
                        </div>

                        {/* Format Selector */}
                        <div className="space-y-2">
                            <label className="text-[10px] text-white/40 uppercase font-bold tracking-wider">Format</label>
                            <div className="flex gap-2">
                                {([
                                    { fmt: 'horizontal' as GridFormat, icon: <Monitor size={14} />, label: 'Horizontal' },
                                    { fmt: 'vertical' as GridFormat, icon: <Smartphone size={14} />, label: 'Vertical' },
                                    { fmt: 'square' as GridFormat, icon: <Square size={14} />, label: 'Square' },
                                ]).map(({ fmt, icon, label }) => (
                                    <button
                                        key={fmt}
                                        onClick={() => setGenFormat(fmt)}
                                        className={clsx(
                                            'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all border',
                                            genFormat === fmt
                                                ? 'bg-primary/20 text-primary border-primary/40 shadow-lg shadow-primary/10'
                                                : 'bg-white/5 text-white/40 border-white/5 hover:bg-white/10 hover:border-white/10'
                                        )}
                                    >
                                        {icon} {label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Cell Count Slider */}
                        <div className="space-y-2">
                            <label className="text-[10px] text-white/40 uppercase font-bold tracking-wider">Cells</label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="range"
                                    min="2" max="12"
                                    value={genCells}
                                    onChange={e => setGenCells(parseInt(e.target.value))}
                                    className="flex-1 accent-primary h-1.5"
                                />
                                <span className="text-sm font-mono text-primary font-bold w-6 text-center">{genCells}</span>
                            </div>
                        </div>

                        {/* Duration Slider */}
                        <div className="space-y-2">
                            <label className="text-[10px] text-white/40 uppercase font-bold tracking-wider flex items-center gap-1.5">
                                <Timer size={10} /> Duration
                            </label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="range"
                                    min="1" max={extendedDuration ? 3600 : 5}
                                    step={extendedDuration ? (gridDuration > 60 ? 10 : 1) : 1}
                                    value={gridDuration}
                                    onChange={e => setGridDuration(parseInt(e.target.value))}
                                    className="flex-1 accent-primary h-1.5"
                                />
                                <span className="text-sm font-mono text-primary font-bold min-w-[3.5rem] text-center">
                                    {gridDuration >= 3600
                                        ? `${Math.floor(gridDuration / 3600)}h`
                                        : gridDuration >= 60
                                            ? `${Math.floor(gridDuration / 60)}m${gridDuration % 60 ? ` ${gridDuration % 60}s` : ''}`
                                            : `${gridDuration}s`}
                                </span>
                            </div>
                        </div>

                        {/* Extended Duration Toggle */}
                        <button
                            onClick={() => {
                                setExtendedDuration(!extendedDuration);
                                if (!extendedDuration && gridDuration > 5) {
                                    // keep current value when enabling extended
                                } else if (extendedDuration && gridDuration > 5) {
                                    setGridDuration(5);
                                }
                            }}
                            className={clsx(
                                'flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] font-bold transition-all border w-full',
                                extendedDuration
                                    ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                                    : 'bg-white/5 text-white/40 border-white/5 hover:bg-white/10'
                            )}
                        >
                            {extendedDuration ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                            Extended Duration (up to 1 hour)
                        </button>

                        {/* Generate Button */}
                        <button
                            onClick={() => {
                                handleCreateGrid(genCells, genFormat);
                                // Small delay to ensure grid is created before generating
                                setTimeout(() => handleGenerateAll(), 100);
                            }}
                            disabled={isGenerating || videoFiles.length === 0 || !generateGridSequence}
                            className={clsx(
                                'w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl text-[12px] font-bold uppercase tracking-wider transition-all border active:scale-[0.98]',
                                'bg-gradient-to-r from-violet-600/30 via-primary/30 to-indigo-600/30',
                                'hover:from-violet-600/50 hover:via-primary/50 hover:to-indigo-600/50',
                                'text-primary-light border-primary/30 hover:border-primary/50',
                                'shadow-[0_0_32px_rgba(var(--color-primary),0.25)]',
                                'disabled:opacity-40 disabled:grayscale disabled:cursor-not-allowed'
                            )}
                        >
                            <Zap size={18} className={clsx(isGenerating && 'animate-spin')} />
                            {isGenerating ? 'Generating...' : '⚡ Generate Grid'}
                        </button>

                        {/* Preview Area */}
                        {selectedGrid && (
                            <div className="border border-white/10 rounded-xl overflow-hidden bg-black/40">
                                <div className="p-2 border-b border-white/5 text-[9px] text-white/30 font-bold uppercase tracking-widest">
                                    Preview
                                </div>
                                <div className="aspect-video">
                                    <GridPlayer
                                        grid={selectedGrid}
                                        currentFrame={0}
                                        isPlaying={false}
                                        onFrameChange={() => {}}
                                        onCellClick={() => {}}
                                        selectedCellId={null}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ═══ EDITOR TAB ═════════════════════════════════════════════ */}
            {activeSubTab === 'editor' && (
            <div className="flex-1 flex flex-row overflow-hidden">

            {/* ═══ LEFT SIDEBAR: Grid List ════════════════════════════════ */}
            <div className="w-56 border-r border-white/5 bg-[#0a0a12] flex flex-col flex-shrink-0">
                {/* Header */}
                <div className="p-3 border-b border-white/5 flex items-center justify-between">
                    <h2 className="font-bold text-sm flex items-center gap-2">
                        <LayoutGrid size={14} className="text-primary" /> Grids
                    </h2>
                    <div className="relative">
                        <button
                            onClick={() => setShowNewGridMenu(!showNewGridMenu)}
                            className="p-1.5 hover:bg-white/10 rounded-lg text-white/60 hover:text-white transition-colors"
                            title="New Grid"
                        >
                            <Plus size={14} />
                        </button>

                        {/* New Grid Dropdown */}
                        <AnimatePresence>
                            {showNewGridMenu && (
                                <motion.div
                                    initial={{ opacity: 0, y: -4, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: -4, scale: 0.95 }}
                                    transition={{ duration: 0.15 }}
                                    className="absolute right-0 top-full mt-1 w-52 bg-[#111122] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden"
                                >
                                    <div className="p-2 text-[9px] text-white/30 font-bold uppercase tracking-widest">Quick Create</div>
                                    {GRID_PRESETS.map(preset => (
                                        <button
                                            key={preset.label}
                                            onClick={() => handleCreateGrid(preset.cells, preset.format)}
                                            className="w-full text-left px-3 py-2 text-[11px] text-white/70 hover:bg-primary/20 hover:text-white transition-colors flex items-center gap-2.5"
                                        >
                                            <span className="text-[10px] text-white/20 font-mono w-6">{preset.icon}</span>
                                            {preset.label}
                                            <span className="ml-auto text-[9px] text-white/20">{preset.cells}c</span>
                                        </button>
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                {/* Grid List */}
                <div className="flex-1 overflow-y-auto p-2 space-y-1.5 custom-scrollbar">
                    {gridClips.length === 0 ? (
                        <div className="p-4 text-white/30 text-[10px] text-center">
                            No grids yet.
                            <br />Click <Plus size={10} className="inline" /> to create one.
                        </div>
                    ) : (
                        gridClips.map(grid => {
                            const filled = grid.cells.filter(c => (c.clips?.length ?? 0) > 0 || c.clip).length;
                            const complete = filled === grid.numCells;
                            const isSelected = selectedGridId === grid.id;
                            return (
                                <motion.div
                                    key={grid.id}
                                    layout
                                    transition={{ layout: { duration: 0.2 } }}
                                    onClick={() => {
                                        setSelectedGridId(grid.id);
                                        setSelectedCellId(null);
                                    }}
                                    className={clsx(
                                        'p-2.5 rounded-lg cursor-pointer transition-all border group',
                                        isSelected
                                            ? 'bg-primary/20 border-primary/50 shadow-lg shadow-primary/10'
                                            : 'bg-white/5 border-transparent hover:bg-white/10 hover:border-white/10'
                                    )}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="font-semibold text-[11px] truncate">{grid.filename}</div>
                                        <button
                                            onClick={e => { e.stopPropagation(); handleDeleteGrid(grid.id); }}
                                            className="p-0.5 opacity-0 group-hover:opacity-100 hover:bg-red-500/20 rounded text-red-400/60 hover:text-red-400 transition-all"
                                        >
                                            <Trash2 size={10} />
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-[9px] text-white/40">{grid.numCells} cells</span>
                                        <span className="text-[9px] text-white/30">•</span>
                                        <span className="text-[9px] text-white/40">{grid.gridFormat}</span>
                                        {grid.syncMode === 'beat-locked' && (
                                            <Lock size={8} className="text-amber-400/40" />
                                        )}
                                        {complete && (
                                            <span className="text-[8px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded-full font-bold ml-auto">✓</span>
                                        )}
                                    </div>
                                    {/* Fill progress bar */}
                                    <div className="mt-1.5 h-0.5 bg-white/5 rounded-full overflow-hidden">
                                        <motion.div
                                            className={clsx(
                                                'h-full rounded-full',
                                                complete ? 'bg-emerald-500' : 'bg-primary/60'
                                            )}
                                            initial={false}
                                            animate={{ width: `${(filled / grid.numCells) * 100}%` }}
                                            transition={{ duration: 0.3 }}
                                        />
                                    </div>
                                </motion.div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* ═══ CENTER: Preview & Transport ════════════════════════════ */}
            <div className="flex-1 flex flex-col items-center justify-center bg-black/40 relative min-w-0">
                {selectedGrid ? (
                    <div className="w-full h-full flex flex-col p-4">
                        {/* Grid Preview Area */}
                        <div className="flex-1 min-h-0 flex items-center justify-center">
                            <div className="w-full max-w-3xl aspect-video bg-black rounded-xl border border-white/10 relative overflow-hidden shadow-2xl">
                                <GridPlayer
                                    grid={selectedGrid}
                                    currentFrame={currentFrame}
                                    isPlaying={isPlaying}
                                    onFrameChange={setCurrentFrame}
                                    onCellClick={(cellId: string) => setSelectedCellId(selectedCellId === cellId ? null : cellId)}
                                    selectedCellId={selectedCellId}
                                />
                                {/* Sync mode indicator overlay */}
                                <div className="absolute top-3 left-3 flex items-center gap-1.5">
                                    <span className={clsx(
                                        'flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-bold uppercase backdrop-blur-md border',
                                        syncMode === 'beat-locked'
                                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                            : 'bg-white/10 text-white/40 border-white/10'
                                    )}>
                                        {syncMode === 'beat-locked' ? <Lock size={8} /> : <Unlock size={8} />}
                                        {syncMode}
                                    </span>
                                    {selectedGrid.autoOrientation && (
                                        <span className="px-2 py-0.5 rounded-full text-[8px] font-bold uppercase backdrop-blur-md bg-white/10 text-white/30 border border-white/10">
                                            Auto-Orient
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* ── Generate Buttons ──────────────────────────────── */}
                        <div className="flex items-center justify-center gap-3 py-3">
                            {/* Generate All Cells */}
                            <button
                                onClick={handleGenerateAll}
                                disabled={!generateGridSequence || isGenerating || videoFiles.length === 0}
                                className={clsx(
                                    'flex items-center gap-2 px-5 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all active:scale-95 border',
                                    'bg-gradient-to-r from-violet-600/30 via-primary/30 to-indigo-600/30',
                                    'hover:from-violet-600/50 hover:via-primary/50 hover:to-indigo-600/50',
                                    'text-primary-light border-primary/30 hover:border-primary/50',
                                    'shadow-[0_0_24px_rgba(var(--color-primary),0.2)]',
                                    'disabled:opacity-40 disabled:grayscale disabled:cursor-not-allowed'
                                )}
                            >
                                <Wand2 size={16} className={clsx(isGenerating && 'animate-spin')} />
                                {isGenerating ? 'Generating...' : '🔮 Generate All Cells'}
                            </button>

                            {/* Regenerate Selected Cell */}
                            <AnimatePresence>
                                {selectedCellId && (
                                    <motion.button
                                        initial={{ opacity: 0, scale: 0.9, x: -10 }}
                                        animate={{ opacity: 1, scale: 1, x: 0 }}
                                        exit={{ opacity: 0, scale: 0.9, x: -10 }}
                                        transition={{ duration: 0.15 }}
                                        onClick={handleRegenerateCell}
                                        className="flex items-center gap-1.5 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all border border-white/10 hover:border-white/20 active:scale-95"
                                    >
                                        <Zap size={14} /> ⚡ Regen Cell
                                    </motion.button>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* ── Transport Bar ─────────────────────────────────── */}
                        <div className="flex items-center justify-center gap-4 py-2 border-t border-white/5 bg-black/20 -mx-4 px-4 rounded-b-xl">
                            {/* Play/Pause */}
                            <button
                                onClick={() => setIsPlaying(!isPlaying)}
                                className="w-10 h-10 bg-primary text-black flex items-center justify-center rounded-full hover:bg-primary/80 transition shadow-lg shadow-primary/20"
                            >
                                {isPlaying
                                    ? <Pause size={16} fill="currentColor" />
                                    : <Play size={16} fill="currentColor" className="ml-0.5" />}
                            </button>

                            {/* Frame Counter */}
                            <div className="text-[10px] font-mono text-white/40">
                                Frame {currentFrame}
                            </div>

                            {/* Cell Count Slider */}
                            <div className="flex items-center gap-2 ml-2">
                                <label className="text-[9px] text-white/30 uppercase font-bold">Cells</label>
                                <input
                                    type="range"
                                    min="2" max="12"
                                    value={selectedGrid.numCells}
                                    onChange={e => handleUpdateNumCells(parseInt(e.target.value))}
                                    className="w-20 accent-primary h-1"
                                    title="Number of Cells"
                                />
                                <span className="text-[10px] font-mono text-primary font-bold">{selectedGrid.numCells}</span>
                            </div>

                            {/* Divider */}
                            <div className="w-px h-5 bg-white/10" />

                            {/* Format Toggles */}
                            <div className="flex items-center gap-1">
                                {([
                                    { fmt: 'horizontal' as GridFormat, icon: <Monitor size={11} />, label: 'H' },
                                    { fmt: 'vertical' as GridFormat, icon: <Smartphone size={11} />, label: 'V' },
                                    { fmt: 'square' as GridFormat, icon: <Square size={11} />, label: 'S' },
                                ]).map(({ fmt, icon, label }) => (
                                    <button
                                        key={fmt}
                                        onClick={() => updateGrid(selectedGrid.id, { gridFormat: fmt })}
                                        className={clsx(
                                            'flex items-center gap-1 px-2 py-1.5 rounded-lg text-[9px] font-bold uppercase transition-all border',
                                            selectedGrid.gridFormat === fmt
                                                ? 'bg-primary/30 text-primary border-primary/30'
                                                : 'bg-white/5 text-white/40 border-white/5 hover:bg-white/10'
                                        )}
                                        title={fmt}
                                    >
                                        {icon}
                                    </button>
                                ))}
                            </div>

                            {/* Divider */}
                            <div className="w-px h-5 bg-white/10" />

                            {/* Cell fill stats */}
                            <div className="text-[9px] text-white/30 font-mono">
                                {filledCells}/{selectedGrid.numCells} filled
                            </div>

                            {/* Add to Sequence */}
                            {isGridComplete && (
                                <button
                                    onClick={handleAddToSequence}
                                    className="ml-2 px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-300 rounded-lg text-[9px] font-bold uppercase tracking-wider border border-emerald-500/20 hover:border-emerald-500/40 transition-all active:scale-95"
                                >
                                    ✓ Add to Sequence
                                </button>
                            )}
                        </div>
                    </div>
                ) : (
                    /* Empty State */
                    <div className="text-white/30 flex flex-col items-center">
                        <LayoutGrid size={48} className="mb-4 opacity-30" />
                        <p className="text-sm">Select or create a grid to begin</p>
                        <p className="text-[10px] text-white/20 mt-1 mb-4">
                            Grids split your video into independent cells, each powered by the EGE.
                        </p>
                        <button
                            onClick={() => handleCreateGrid(4, 'horizontal')}
                            className="px-4 py-2 bg-primary/20 hover:bg-primary/40 text-primary border border-primary/20 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all active:scale-95"
                        >
                            <Plus size={12} className="inline mr-1" /> Create 4-Grid
                        </button>
                    </div>
                )}
            </div>

            {/* ═══ RIGHT SIDEBAR: Context-Sensitive ═══════════════════════ */}
            <AnimatePresence mode="wait">
                {selectedGrid && (
                    <motion.div
                        key={selectedCellId || 'global'}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        transition={{ duration: 0.15 }}
                        className="w-80 flex-shrink-0"
                    >
                        {selectedCellId ? (
                            <GridCellEditor
                                grid={selectedGrid}
                                cellId={selectedCellId}
                                onClose={() => setSelectedCellId(null)}
                            />
                        ) : (
                            <GridGlobalControls grid={selectedGrid} />
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
            )}
        </div>
    );
};
