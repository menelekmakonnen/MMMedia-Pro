import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import {
    LayoutGrid, ArrowRightLeft, Sparkles, Zap, Upload,
    Music, Sliders, Lock, Unlock, ChevronDown, ChevronUp,
    RefreshCw, Eye, Monitor, Smartphone, Square
} from 'lucide-react';
import { useClipStore } from '../../store/clipStore';
import { useMediaStore } from '../../store/mediaStore';
import type { GridClip, BackgroundFillMode } from '../../types';

// ─── Types ────────────────────────────────────────────────────────────────────
type DistributionStrategy = 'round-robin' | 'by-orientation' | 'random';

interface GridGlobalControlsProps {
    grid: GridClip;
}

// ─── Collapsible Section ──────────────────────────────────────────────────────
const Section: React.FC<{
    label: string;
    defaultOpen?: boolean;
    children: React.ReactNode;
    accent?: string;
}> = ({ label, defaultOpen = true, children, accent }) => {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="border-b border-white/5">
            <button
                onClick={() => setOpen(!open)}
                className="w-full flex items-center justify-between px-3.5 py-2.5 hover:bg-white/5 transition-colors"
            >
                <span className={clsx(
                    'text-[9px] font-black uppercase tracking-widest',
                    accent || 'text-white/30'
                )}>
                    {label}
                </span>
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

// ─── Two-Way Toggle ───────────────────────────────────────────────────────────
const ToggleButtons: React.FC<{
    options: { value: string; label: string; icon?: React.ReactNode }[];
    value: string;
    onChange: (v: string) => void;
}> = ({ options, value, onChange }) => (
    <div className="flex gap-1">
        {options.map(opt => (
            <button
                key={opt.value}
                onClick={() => onChange(opt.value)}
                className={clsx(
                    'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all border active:scale-95',
                    value === opt.value
                        ? 'bg-primary/20 text-primary border-primary/30 shadow-[0_0_10px_rgba(var(--color-primary),0.1)]'
                        : 'bg-white/5 text-white/40 border-white/5 hover:bg-white/10 hover:text-white/60'
                )}
            >
                {opt.icon}{opt.label}
            </button>
        ))}
    </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// GridGlobalControls
// ═══════════════════════════════════════════════════════════════════════════════
export const GridGlobalControls: React.FC<GridGlobalControlsProps> = ({ grid }) => {
    const {
        updateGrid,
        shuffleGridItems,
        globalFluxGrid,
        globalChaosGrid,
        distributeMediaToGrid
    } = useClipStore();
    const { files } = useMediaStore();

    const [distributionStrategy, setDistributionStrategy] = useState<DistributionStrategy>('round-robin');

    const videoFiles = files.filter(f => f.type === 'video' || f.type === 'image');
    const audioFiles = files.filter(f => f.type === 'audio');
    const filledCells = grid.cells.filter(c => (c.clips && c.clips.length > 0) || c.clip).length;
    const totalClips = grid.cells.reduce((sum, c) => sum + (c.clips?.length || (c.clip ? 1 : 0)), 0);

    const masterDuration = grid.masterDurationSec ?? 30;
    const syncMode = grid.syncMode ?? 'independent';
    const autoOrientation = grid.autoOrientation ?? true;
    const bgMode: BackgroundFillMode = grid.backgroundMode ?? 'blur';

    // ── Handlers ──────────────────────────────────────────────────────────────
    const handleAutoDistribute = () => {
        if (videoFiles.length === 0) return;
        distributeMediaToGrid(grid.id, videoFiles);
    };

    const handleMasterDuration = (val: number) => {
        updateGrid(grid.id, { masterDurationSec: val });
    };

    const handleSyncMode = (mode: string) => {
        updateGrid(grid.id, { syncMode: mode as 'beat-locked' | 'independent' });
    };

    const handleAutoOrientation = () => {
        updateGrid(grid.id, { autoOrientation: !autoOrientation });
    };

    const handleBackgroundMode = (mode: string) => {
        updateGrid(grid.id, { backgroundMode: mode as BackgroundFillMode });
    };

    const handleMasterAudio = (audioId: string) => {
        updateGrid(grid.id, { masterAudioId: audioId || undefined });
    };

    const handleGridSettingsChange = (key: string, value: unknown) => {
        updateGrid(grid.id, {
            gridSettings: { ...grid.gridSettings, [key]: value }
        });
    };

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="h-full flex flex-col bg-[#080812] border-l border-white/10">
            {/* ── Header ─────────────────────────────────────────────────── */}
            <div className="p-4 border-b border-white/5 bg-gradient-to-r from-accent/10 to-transparent">
                <h3 className="font-bold text-white/90 text-sm flex items-center gap-2">
                    <LayoutGrid size={14} className="text-accent" />
                    Grid Controls
                </h3>
                <p className="text-[9px] text-white/40 mt-0.5">
                    {grid.numCells} cells • {filledCells} filled • {totalClips} clips
                </p>
            </div>

            {/* ── Stats Row ──────────────────────────────────────────────── */}
            <div className="px-3.5 py-3 border-b border-white/5">
                <div className="grid grid-cols-3 gap-2">
                    {[
                        { label: 'Cells', value: grid.numCells, color: 'text-white' },
                        { label: 'Filled', value: filledCells, color: 'text-primary' },
                        { label: 'Clips', value: totalClips, color: 'text-accent' },
                    ].map(stat => (
                        <div key={stat.label} className="bg-white/5 rounded-lg p-2 border border-white/5">
                            <div className="text-[8px] font-black uppercase text-white/30 tracking-widest">{stat.label}</div>
                            <div className={clsx('text-lg font-black', stat.color)}>{stat.value}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Scrollable Body ────────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">

                {/* Master Settings */}
                <Section label="Master Settings" accent="text-primary/60">
                    {/* Duration Slider */}
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[10px] text-white/50">Master Duration</span>
                            <span className="text-[10px] font-mono text-primary font-bold">{masterDuration}s</span>
                        </div>
                        <input
                            type="range"
                            min={1}
                            max={120}
                            step={1}
                            value={masterDuration}
                            onChange={e => handleMasterDuration(parseInt(e.target.value))}
                            className="w-full accent-primary h-1"
                        />
                        <div className="flex justify-between text-[8px] text-white/20 mt-0.5">
                            <span>1s</span><span>60s</span><span>120s</span>
                        </div>
                    </div>

                    {/* Sync Mode */}
                    <div>
                        <span className="text-[10px] text-white/50 block mb-1.5">Sync Mode</span>
                        <ToggleButtons
                            options={[
                                { value: 'beat-locked', label: 'Beat-Locked', icon: <Lock size={10} /> },
                                { value: 'independent', label: 'Independent', icon: <Unlock size={10} /> },
                            ]}
                            value={syncMode}
                            onChange={handleSyncMode}
                        />
                        <p className="text-[8px] text-white/20 mt-1">
                            {syncMode === 'beat-locked'
                                ? 'All cells cut on the same beat timing.'
                                : 'Each cell runs its own pacing independently.'}
                        </p>
                    </div>

                    {/* Auto-Orientation */}
                    <button
                        onClick={handleAutoOrientation}
                        className={clsx(
                            'w-full flex items-center justify-between py-2 px-3 rounded-lg text-[10px] font-bold transition-all border active:scale-95',
                            autoOrientation
                                ? 'bg-primary/15 text-primary border-primary/20'
                                : 'bg-white/5 text-white/40 border-white/5 hover:bg-white/10'
                        )}
                    >
                        <span className="flex items-center gap-2">
                            <Eye size={12} />
                            Auto-Orientation
                        </span>
                        <span className={clsx(
                            'text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full',
                            autoOrientation ? 'bg-primary/30 text-primary' : 'bg-white/10 text-white/30'
                        )}>
                            {autoOrientation ? 'ON' : 'OFF'}
                        </span>
                    </button>

                    {/* Background Mode */}
                    <div>
                        <span className="text-[10px] text-white/50 block mb-1.5">Background Fill</span>
                        <ToggleButtons
                            options={[
                                { value: 'blur', label: 'Blur' },
                                { value: 'black', label: 'Black' },
                            ]}
                            value={bgMode}
                            onChange={handleBackgroundMode}
                        />
                    </div>
                </Section>

                {/* Master Audio Guide */}
                <Section label="Audio Guide" defaultOpen={false}>
                    <div>
                        <span className="text-[10px] text-white/50 block mb-1.5">Master Audio File</span>
                        <div className="relative">
                            <select
                                value={grid.masterAudioId || ''}
                                onChange={e => handleMasterAudio(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[10px] text-white/80 appearance-none cursor-pointer hover:border-white/20 transition-colors focus:outline-none focus:border-primary/50"
                            >
                                <option value="">No audio guide</option>
                                {audioFiles.map(a => (
                                    <option key={a.id} value={a.id}>{a.filename}</option>
                                ))}
                            </select>
                            <Music size={10} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 pointer-events-none" />
                        </div>
                    </div>
                    {/* Waveform Placeholder */}
                    {grid.masterAudioId && (
                        <div className="h-16 bg-white/5 rounded-lg border border-white/5 flex items-center justify-center">
                            <span className="text-[9px] text-white/20 italic">Waveform visualization</span>
                        </div>
                    )}
                </Section>

                {/* Grid-Level EGE Settings */}
                <Section label="Default EGE Settings" defaultOpen={false} accent="text-accent/50">
                    {/* Transition Style */}
                    <div>
                        <span className="text-[10px] text-white/50 block mb-1.5">Transition Style</span>
                        <div className="relative">
                            <select
                                value={(grid.gridSettings as Record<string, unknown>)?.beatSyncStrategy as string || 'auto'}
                                onChange={e => handleGridSettingsChange('beatSyncStrategy', e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[10px] text-white/80 appearance-none cursor-pointer hover:border-white/20 transition-colors focus:outline-none focus:border-primary/50"
                            >
                                <option value="auto">Auto</option>
                                <option value="cut-on-beat">Cut on Beat</option>
                                <option value="transition-on-beat">Transition on Beat</option>
                                <option value="effect-on-drop">Effect on Drop</option>
                                <option value="groove-ride">Groove Ride</option>
                            </select>
                            <Sliders size={10} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 pointer-events-none" />
                        </div>
                    </div>

                    {/* Speed Range */}
                    <div>
                        <span className="text-[10px] text-white/50 block mb-1.5">Speed Policy</span>
                        <div className="relative">
                            <select
                                value={(grid.gridSettings as Record<string, unknown>)?.slowmoPolicy as string || 'none'}
                                onChange={e => handleGridSettingsChange('slowmoPolicy', e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[10px] text-white/80 appearance-none cursor-pointer hover:border-white/20 transition-colors focus:outline-none focus:border-primary/50"
                            >
                                <option value="none">Normal Speed</option>
                                <option value="slowmo">Slow Motion</option>
                                <option value="fast">Fast Motion</option>
                                <option value="hyper">Hyper Speed</option>
                            </select>
                        </div>
                    </div>

                    {/* Clip Duration Range */}
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[10px] text-white/50">Shortest Clip</span>
                            <span className="text-[10px] font-mono text-white/60">
                                {(grid.gridSettings as Record<string, unknown>)?.shortestClip as number || 0.3}s
                            </span>
                        </div>
                        <input
                            type="range"
                            min={0.1}
                            max={5}
                            step={0.1}
                            value={(grid.gridSettings as Record<string, unknown>)?.shortestClip as number || 0.3}
                            onChange={e => handleGridSettingsChange('shortestClip', parseFloat(e.target.value))}
                            className="w-full accent-accent h-1"
                        />
                    </div>
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[10px] text-white/50">Longest Clip</span>
                            <span className="text-[10px] font-mono text-white/60">
                                {(grid.gridSettings as Record<string, unknown>)?.longestClip as number || 3}s
                            </span>
                        </div>
                        <input
                            type="range"
                            min={0.5}
                            max={15}
                            step={0.5}
                            value={(grid.gridSettings as Record<string, unknown>)?.longestClip as number || 3}
                            onChange={e => handleGridSettingsChange('longestClip', parseFloat(e.target.value))}
                            className="w-full accent-accent h-1"
                        />
                    </div>
                </Section>

                {/* Media Distribution */}
                <Section label="Media Distribution">
                    {/* Strategy Selector */}
                    <div>
                        <span className="text-[10px] text-white/50 block mb-1.5">Distribution Strategy</span>
                        <div className="flex gap-1">
                            {([
                                { value: 'round-robin' as DistributionStrategy, label: 'Round-Robin' },
                                { value: 'by-orientation' as DistributionStrategy, label: 'Orientation' },
                                { value: 'random' as DistributionStrategy, label: 'Random' },
                            ]).map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => setDistributionStrategy(opt.value)}
                                    className={clsx(
                                        'flex-1 py-1.5 rounded-lg text-[8px] font-bold uppercase tracking-wider transition-all border active:scale-95',
                                        distributionStrategy === opt.value
                                            ? 'bg-primary/20 text-primary border-primary/30'
                                            : 'bg-white/5 text-white/40 border-white/5 hover:bg-white/10'
                                    )}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Auto-Distribute Button */}
                    <button
                        onClick={handleAutoDistribute}
                        disabled={videoFiles.length === 0}
                        className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-primary to-secondary text-white font-bold text-[10px] uppercase tracking-wider rounded-lg transition-all hover:shadow-[0_0_15px_rgba(var(--color-primary),0.3)] active:scale-95 disabled:opacity-40 disabled:grayscale border border-primary/30"
                    >
                        <Upload size={12} /> Auto-Distribute ({videoFiles.length} files)
                    </button>
                    <p className="text-[8px] text-white/20">
                        Distributes media across {grid.numCells} cells using {distributionStrategy} strategy.
                    </p>
                </Section>

                {/* Global Actions */}
                <Section label="Global Actions">
                    <div className="space-y-2">
                        <button
                            onClick={() => shuffleGridItems(grid.id)}
                            className="w-full flex items-center justify-center gap-2 py-2.5 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border border-white/5 hover:border-white/20 active:scale-95"
                            title="Shuffle clip assignments across all cells"
                        >
                            <ArrowRightLeft size={14} /> Shuffle All Cells
                        </button>

                        <button
                            onClick={() => globalFluxGrid(grid.id)}
                            className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary/20 hover:bg-primary/40 text-primary-light rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border border-primary/20 hover:border-primary/40 active:scale-95 shadow-[0_0_10px_rgba(var(--color-primary),0.1)]"
                            title="Randomize durations & segments across all cells"
                        >
                            <Sparkles size={14} /> Flux All Cells
                        </button>

                        <button
                            onClick={() => globalChaosGrid(grid.id)}
                            className="w-full flex items-center justify-center gap-2 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border border-red-500/10 hover:border-red-500/30 active:scale-95"
                            title="Shuffle + Flux everything"
                        >
                            <Zap size={14} fill="currentColor" /> Chaos Mode
                        </button>
                    </div>
                </Section>
            </div>

            {/* ── Footer Properties ──────────────────────────────────────── */}
            <div className="p-3.5 border-t border-white/5 bg-black/20">
                <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">Properties</span>
                <div className="mt-2 space-y-1.5 text-[10px]">
                    <div className="flex justify-between text-white/50">
                        <span>Format</span>
                        <span className="font-mono text-white/70">{grid.gridFormat}</span>
                    </div>
                    <div className="flex justify-between text-white/50">
                        <span>Duration</span>
                        <span className="font-mono text-white/70">{((grid.endFrame - grid.startFrame) / 30).toFixed(1)}s</span>
                    </div>
                    <div className="flex justify-between text-white/50">
                        <span>Background</span>
                        <span className="font-mono text-white/70">{bgMode}</span>
                    </div>
                    <div className="flex justify-between text-white/50">
                        <span>Sync</span>
                        <span className="font-mono text-white/70">{syncMode}</span>
                    </div>
                    <div className="flex justify-between text-white/50">
                        <span>Orientation</span>
                        <span className="font-mono text-white/70">{autoOrientation ? 'Auto' : 'Manual'}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
