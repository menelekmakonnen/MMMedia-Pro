import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import {
    X, Plus, Trash2, ArrowRightLeft, Sparkles, Zap,
    ChevronDown, ChevronUp, Film, Smartphone, Monitor,
    RefreshCw, Lock, Unlock, Layers, Wand2, Square
} from 'lucide-react';
import { useClipStore } from '../../store/clipStore';
import type { Clip } from '../../store/clipStore';
import { useMediaStore } from '../../store/mediaStore';
import type { GridClip, GridCell, CellOrientation } from '../../types';
import { v4 as uuidv4 } from 'uuid';

// ─── Collapsible Section ──────────────────────────────────────────────────────
const Section: React.FC<{
    label: string;
    defaultOpen?: boolean;
    children: React.ReactNode;
}> = ({ label, defaultOpen = true, children }) => {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="border-b border-white/5">
            <button
                onClick={() => setOpen(!open)}
                className="w-full flex items-center justify-between px-3.5 py-2.5 hover:bg-white/5 transition-colors"
            >
                <span className="text-[9px] font-black uppercase tracking-widest text-white/30">{label}</span>
                {open ? <ChevronUp size={10} className="text-white/20" /> : <ChevronDown size={10} className="text-white/20" />}
            </button>
            <AnimatePresence initial={false}>
                {open && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="px-3.5 pb-3.5 space-y-2.5">
                            {children}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

// ─── Inherit Toggle ───────────────────────────────────────────────────────────
const InheritToggle: React.FC<{
    label: string;
    inherited: boolean;
    onToggle: () => void;
    children: React.ReactNode;
}> = ({ label, inherited, onToggle, children }) => (
    <div className="space-y-1.5">
        <div className="flex items-center justify-between">
            <span className="text-[10px] text-white/50">{label}</span>
            <button
                onClick={onToggle}
                className={clsx(
                    'flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-bold uppercase transition-all',
                    inherited
                        ? 'bg-accent/15 text-accent/80 hover:bg-accent/25'
                        : 'bg-white/5 text-white/30 hover:bg-white/10'
                )}
            >
                {inherited ? <Lock size={8} /> : <Unlock size={8} />}
                {inherited ? 'Inherit' : 'Override'}
            </button>
        </div>
        {!inherited && children}
    </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// GridCellEditor
// ═══════════════════════════════════════════════════════════════════════════════
interface GridCellEditorProps {
    grid: GridClip;
    cellId: string;
    onClose: () => void;
}

export const GridCellEditor: React.FC<GridCellEditorProps> = ({ grid, cellId, onClose }) => {
    const { files } = useMediaStore();
    const {
        addClipToGridCell,
        removeClipFromGridCell,
        shuffleGridCellClips,
        fluxGridCellClips,
        updateGridCell,
    } = useClipStore();

    const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
    const [inheritDuration, setInheritDuration] = useState(true);
    const [inheritTransition, setInheritTransition] = useState(true);
    const [inheritSpeed, setInheritSpeed] = useState(true);

    const cell = grid.cells.find(c => c.id === cellId);
    if (!cell) return null;

    const cellIndex = grid.cells.indexOf(cell) + 1;
    const cellClips = cell.clips || (cell.clip ? [cell.clip] : []);
    const videoFiles = files.filter(f => f.type === 'video' || f.type === 'image');
    const orientation: CellOrientation = cell.cellOrientation ?? 'auto';

    // ── Orientation badge color ───────────────────────────────────────────────
    const orientationBadge = {
        vertical: { icon: <Smartphone size={10} />, label: 'V', color: 'bg-violet-500/20 text-violet-300 border-violet-500/30' },
        horizontal: { icon: <Monitor size={10} />, label: 'H', color: 'bg-sky-500/20 text-sky-300 border-sky-500/30' },
        auto: { icon: <RefreshCw size={10} />, label: 'A', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
    }[orientation];

    // ── Handlers ──────────────────────────────────────────────────────────────
    const handleToggleSelect = (id: string) => {
        setSelectedFileIds(prev =>
            prev.includes(id) ? prev.filter(fid => fid !== id) : [...prev, id]
        );
    };

    const handleAddSelected = () => {
        const selectedFiles = files.filter(f => selectedFileIds.includes(f.id));
        if (selectedFiles.length === 0) return;

        const fps = 30;
        const gridDurationFrames = grid.endFrame - grid.startFrame || 150;

        for (const file of selectedFiles) {
            const durationFrames = Math.floor(file.duration * fps);
            const newClip: Clip = {
                id: uuidv4(),
                mediaLibraryId: file.id,
                type: file.type,
                path: file.path,
                filename: file.filename,
                startFrame: 0,
                endFrame: gridDurationFrames,
                sourceDurationFrames: durationFrames,
                trimStartFrame: 0,
                trimEndFrame: durationFrames,
                track: 1,
                speed: 1.0,
                volume: 100,
                reversed: false,
                isMuted: false,
                isPinned: false,
                origin: 'manual',
                locked: false
            };
            addClipToGridCell(grid.id, cellId, newClip);
        }
        setSelectedFileIds([]);
    };

    const handleOrientationChange = (o: CellOrientation) => {
        updateGridCell(grid.id, cellId, { cellOrientation: o });
    };

    const handleCellSettingsChange = (key: string, value: unknown) => {
        updateGridCell(grid.id, cellId, {
            cellSettings: { ...cell.cellSettings, [key]: value }
        });
    };

    const handleRegenerate = () => {
        // Placeholder: Will be wired to generateCellSequence from gridEditEngine
        updateGridCell(grid.id, cellId, {
            isGenerated: false,
            generationSeed: Math.floor(Math.random() * 999999),
        });
    };

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="h-full flex flex-col bg-[#080812] border-l border-white/10 animate-in slide-in-from-right duration-200">
            {/* ── Header ─────────────────────────────────────────────────── */}
            <div className="p-4 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-primary/10 to-transparent">
                <div className="flex items-center gap-2.5">
                    <div>
                        <h3 className="font-bold text-white/90 text-sm flex items-center gap-2">
                            <Film size={14} className="text-primary" />
                            Cell {cellIndex} Editor
                        </h3>
                        <p className="text-[9px] text-white/40 mt-0.5">
                            {cellClips.length} clip{cellClips.length !== 1 ? 's' : ''} in timeline
                        </p>
                    </div>
                    {/* Orientation Badge */}
                    <span className={clsx(
                        'flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-black uppercase border',
                        orientationBadge.color
                    )}>
                        {orientationBadge.icon}
                        {orientationBadge.label}
                    </span>
                </div>
                <button
                    onClick={onClose}
                    className="p-1.5 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-colors"
                >
                    <X size={16} />
                </button>
            </div>

            {/* ── Scrollable Body ────────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">

                {/* Orientation Selector */}
                <Section label="Cell Orientation">
                    <div className="flex gap-1.5">
                        {([
                            { value: 'vertical' as CellOrientation, icon: <Smartphone size={12} />, label: 'Vertical', sub: '9:16' },
                            { value: 'horizontal' as CellOrientation, icon: <Monitor size={12} />, label: 'Horizontal', sub: '16:9' },
                            { value: 'auto' as CellOrientation, icon: <RefreshCw size={12} />, label: 'Auto', sub: 'Detect' },
                        ]).map(opt => (
                            <button
                                key={opt.value}
                                onClick={() => handleOrientationChange(opt.value)}
                                className={clsx(
                                    'flex-1 flex flex-col items-center gap-1 py-2.5 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all border active:scale-95',
                                    orientation === opt.value
                                        ? 'bg-primary/20 text-primary border-primary/30 shadow-[0_0_10px_rgba(var(--color-primary),0.1)]'
                                        : 'bg-white/5 text-white/40 border-white/5 hover:bg-white/10 hover:text-white/60'
                                )}
                            >
                                {opt.icon}
                                <span>{opt.label}</span>
                                <span className="text-[7px] opacity-60">{opt.sub}</span>
                            </button>
                        ))}
                    </div>
                </Section>

                {/* Generate / Regenerate */}
                <Section label="Generation">
                    <button
                        onClick={handleRegenerate}
                        className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-violet-600/20 via-primary/20 to-indigo-600/20 hover:from-violet-600/30 hover:via-primary/30 hover:to-indigo-600/30 text-primary-light rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border border-primary/20 hover:border-primary/40 active:scale-95 shadow-[0_0_18px_rgba(var(--color-primary),0.15)]"
                    >
                        <Zap size={14} /> Regenerate This Cell
                    </button>
                    {cell.isGenerated && (
                        <p className="text-[8px] text-emerald-400/60 flex items-center gap-1">
                            <Wand2 size={8} /> Generated • Seed: {cell.generationSeed}
                        </p>
                    )}
                </Section>

                {/* Mini EGE Settings Overrides */}
                <Section label="EGE Overrides" defaultOpen={false}>
                    {/* Duration Override */}
                    <InheritToggle
                        label="Duration"
                        inherited={inheritDuration}
                        onToggle={() => setInheritDuration(!inheritDuration)}
                    >
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-[9px] text-white/40">Target Duration</span>
                                <span className="text-[9px] font-mono text-primary">
                                    {(cell.cellSettings as Record<string, unknown>)?.targetDuration as number || grid.masterDurationSec || 30}s
                                </span>
                            </div>
                            <input
                                type="range"
                                min={1}
                                max={120}
                                step={1}
                                value={(cell.cellSettings as Record<string, unknown>)?.targetDuration as number || grid.masterDurationSec || 30}
                                onChange={e => handleCellSettingsChange('targetDuration', parseInt(e.target.value))}
                                className="w-full accent-primary h-1"
                            />
                        </div>
                    </InheritToggle>

                    {/* Transition Override */}
                    <InheritToggle
                        label="Transition Style"
                        inherited={inheritTransition}
                        onToggle={() => setInheritTransition(!inheritTransition)}
                    >
                        <div className="relative">
                            <select
                                value={(cell.cellSettings as Record<string, unknown>)?.beatSyncStrategy as string || 'auto'}
                                onChange={e => handleCellSettingsChange('beatSyncStrategy', e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[10px] text-white/80 appearance-none cursor-pointer hover:border-white/20 transition-colors focus:outline-none focus:border-primary/50"
                            >
                                <option value="auto">Auto</option>
                                <option value="cut-on-beat">Cut on Beat</option>
                                <option value="transition-on-beat">Transition on Beat</option>
                                <option value="effect-on-drop">Effect on Drop</option>
                            </select>
                        </div>
                    </InheritToggle>

                    {/* Speed Override */}
                    <InheritToggle
                        label="Speed Policy"
                        inherited={inheritSpeed}
                        onToggle={() => setInheritSpeed(!inheritSpeed)}
                    >
                        <div className="relative">
                            <select
                                value={(cell.cellSettings as Record<string, unknown>)?.slowmoPolicy as string || 'none'}
                                onChange={e => handleCellSettingsChange('slowmoPolicy', e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[10px] text-white/80 appearance-none cursor-pointer hover:border-white/20 transition-colors focus:outline-none focus:border-primary/50"
                            >
                                <option value="none">Normal</option>
                                <option value="slowmo">Slow Motion</option>
                                <option value="fast">Fast</option>
                                <option value="hyper">Hyper</option>
                            </select>
                        </div>
                    </InheritToggle>
                </Section>

                {/* Cell Controls (Shuffle / Flux) */}
                {cellClips.length > 0 && (
                    <Section label="Manual Controls">
                        <div className="flex gap-2">
                            <button
                                onClick={() => shuffleGridCellClips(grid.id, cellId)}
                                className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border border-white/5 hover:border-white/20 active:scale-95"
                                title="Shuffle clips within this cell"
                            >
                                <ArrowRightLeft size={12} /> Shuffle
                            </button>
                            <button
                                onClick={() => fluxGridCellClips(grid.id, cellId)}
                                className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-primary/20 hover:bg-primary/40 text-primary-light rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border border-primary/20 hover:border-primary/40 active:scale-95"
                                title="Randomize durations & segments within this cell"
                            >
                                <Sparkles size={12} /> Flux
                            </button>
                        </div>
                    </Section>
                )}

                {/* Cell Clip List (Mini-Timeline) */}
                {cellClips.length > 0 && (
                    <Section label="Cell Timeline">
                        {cellClips.map((clip, idx) => (
                            <motion.div
                                key={clip.id}
                                layout
                                transition={{ layout: { duration: 0.2 } }}
                                className="flex items-center gap-2 bg-white/5 hover:bg-white/10 rounded-lg p-2 border border-white/5 group transition-all"
                            >
                                {/* Thumbnail */}
                                <div className="w-12 h-8 bg-black/50 rounded overflow-hidden flex-shrink-0">
                                    {clip.type === 'video' && (
                                        <video src={`file://${clip.path}`} className="w-full h-full object-cover" muted />
                                    )}
                                    {clip.type === 'image' && (
                                        <img src={`file://${clip.path}`} className="w-full h-full object-cover" alt="" />
                                    )}
                                </div>
                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="text-[10px] text-white/80 truncate font-medium">{clip.filename}</div>
                                    <div className="text-[8px] text-white/30 font-mono">
                                        {((clip.trimEndFrame - clip.trimStartFrame) / 30).toFixed(1)}s • {clip.speed}x
                                    </div>
                                </div>
                                {/* Order badge */}
                                <span className="text-[9px] text-white/20 font-mono">{idx + 1}</span>
                                {/* Remove */}
                                <button
                                    onClick={() => removeClipFromGridCell(grid.id, cellId, clip.id)}
                                    className="p-1 opacity-0 group-hover:opacity-100 hover:bg-red-500/20 rounded text-red-400/60 hover:text-red-400 transition-all"
                                >
                                    <Trash2 size={11} />
                                </button>
                            </motion.div>
                        ))}
                    </Section>
                )}

                {/* Media Picker */}
                <Section label="Add Media" defaultOpen={cellClips.length === 0}>
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-white/40">{videoFiles.length} available</span>
                        {selectedFileIds.length > 0 && (
                            <button
                                onClick={handleAddSelected}
                                className="flex items-center gap-1 px-2.5 py-1 bg-primary hover:bg-primary/80 text-white text-[9px] font-bold uppercase rounded-md transition-all active:scale-95 shadow-lg"
                            >
                                <Plus size={10} /> Add {selectedFileIds.length}
                            </button>
                        )}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 max-h-[260px] overflow-y-auto custom-scrollbar">
                        {videoFiles.map(file => {
                            const isSelected = selectedFileIds.includes(file.id);
                            return (
                                <div
                                    key={file.id}
                                    onClick={() => handleToggleSelect(file.id)}
                                    className={clsx(
                                        'relative border rounded-lg overflow-hidden cursor-pointer aspect-video bg-black/50 transition-all',
                                        isSelected
                                            ? 'border-primary ring-1 ring-primary/50'
                                            : 'border-white/10 hover:border-white/30'
                                    )}
                                >
                                    {file.type === 'video' ? (
                                        <video src={`file://${file.path}`} className="w-full h-full object-cover opacity-70" muted />
                                    ) : (
                                        <img src={`file://${file.path}`} className="w-full h-full object-cover opacity-70" alt="" />
                                    )}
                                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1 pt-4">
                                        <div className="text-[8px] text-white truncate font-medium">{file.filename}</div>
                                    </div>
                                    {isSelected && (
                                        <div className="absolute top-1 right-1 w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                                            <Plus size={10} className="text-white" />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    {videoFiles.length === 0 && (
                        <div className="text-center py-6 text-white/20 text-[10px]">
                            No media in library. Import files first.
                        </div>
                    )}
                </Section>

                {/* Cell Media Pool */}
                {cell.cellMediaIds && cell.cellMediaIds.length > 0 && (
                    <Section label="Assigned Media Pool" defaultOpen={false}>
                        <div className="space-y-1">
                            {cell.cellMediaIds.map(mid => {
                                const mediaFile = files.find(f => f.id === mid);
                                return mediaFile ? (
                                    <div key={mid} className="flex items-center gap-2 text-[10px] text-white/60 bg-white/5 rounded-lg px-2 py-1.5 border border-white/5">
                                        <Layers size={10} className="text-white/20 flex-shrink-0" />
                                        <span className="truncate">{mediaFile.filename}</span>
                                    </div>
                                ) : null;
                            })}
                        </div>
                        <p className="text-[8px] text-white/20">
                            {cell.cellMediaIds.length} file{cell.cellMediaIds.length !== 1 ? 's' : ''} assigned to this cell's media pool.
                        </p>
                    </Section>
                )}
            </div>
        </div>
    );
};
