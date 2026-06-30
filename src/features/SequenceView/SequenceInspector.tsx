import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ChevronRight, ChevronDown, Info, Film, Clock, Layers, Bookmark,
    Activity, Volume2, VolumeX, Move, RotateCcw, Gauge, Palette,
    Sun, Contrast, Droplets, Zap, Eye, Sliders, Hash, Flame, Loader2,
    Scissors, Trash2, Copy, ToggleLeft, SkipForward, FileVideo
} from 'lucide-react';
import clsx from 'clsx';
import { useClipStore, Clip } from '../../store/clipStore';
import { useProjectStore } from '../../store/projectStore';
import { useMarkerStore } from '../../store/markerStore';
import { useTrailerSmartStore } from '../../store/trailerSmartStore';
import { useTimelineStore } from './timeline/useTimelineStore';
import { useUserStore } from '../../store/userStore';
import { useAutoSmartEngine } from '../../lib/smartEngine';
import { TrailerGradeEnhance } from '../EditEngine/EditGradeEnhance';
import { ClipControls } from '../Timeline/ClipControls';
import { formatTimecode } from '../../lib/time';
import {
    splitClipAtFrame,
    deleteSelectedClips,
    rippleDeleteSelectedClips,
    duplicateSelectedClips,
    copySelectedClips,
    toggleClipEnabled,
} from './actions';

interface SequenceInspectorProps {
    selectedClipId: string | null;
    currentFrame: number;
    onJumpToFrame: (frame: number) => void;
    maxFrame: number;
}

/** Collapsible panel section header */
const SectionHeader: React.FC<{
    title: string;
    icon: React.ReactNode;
    isOpen: boolean;
    onToggle: () => void;
    badge?: string;
    accentColor?: string;
}> = ({ title, icon, isOpen, onToggle, badge, accentColor }) => (
    <button
        onClick={onToggle}
        className={clsx(
            'w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-white/[0.03] group',
            isOpen && 'bg-white/[0.02]'
        )}
    >
        <motion.div
            animate={{ rotate: isOpen ? 90 : 0 }}
            transition={{ duration: 0.15 }}
            className="text-white/25"
        >
            <ChevronRight size={10} />
        </motion.div>
        <span className={clsx('text-white/30', accentColor)}>
            {icon}
        </span>
        <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-white/45 group-hover:text-white/60 transition-colors flex-1">
            {title}
        </span>
        {badge && (
            <span className="text-[8px] font-mono bg-white/[0.06] text-white/30 px-1.5 py-0.5 rounded">
                {badge}
            </span>
        )}
    </button>
);

/** Compact action button for the Quick Actions grid */
const ActionButton: React.FC<{
    icon: React.ReactNode;
    label: string;
    shortcut?: string;
    onClick: () => void;
    variant?: 'default' | 'danger';
    active?: boolean;
    disabled?: boolean;
}> = ({ icon, label, shortcut, onClick, variant = 'default', active, disabled }) => (
    <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.96 }}
        onClick={onClick}
        disabled={disabled}
        title={shortcut ? `${label} (${shortcut})` : label}
        className={clsx(
            'flex flex-col items-center gap-0.5 py-1.5 px-1 rounded transition-all text-center',
            disabled && 'opacity-30 cursor-not-allowed',
            variant === 'danger'
                ? 'text-red-400/60 hover:text-red-400 hover:bg-red-400/10'
                : active
                    ? 'text-primary/80 hover:text-primary hover:bg-primary/10'
                    : 'text-white/40 hover:text-white/70 hover:bg-white/5'
        )}
    >
        {icon}
        <span className="text-[8px] font-medium leading-none">{label}</span>
        {shortcut && <span className="text-[7px] opacity-40 font-mono">{shortcut}</span>}
    </motion.button>
);

/** Slider row used for transform/color/audio controls */
const SliderRow: React.FC<{
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (val: number) => void;
    unit?: string;
    accent?: string;
}> = ({ label, value, min, max, step, onChange, unit = '', accent = 'accent-primary' }) => (
    <div className="flex items-center gap-2 px-3 py-0.5">
        <span className="text-[9px] text-white/30 w-14 truncate">{label}</span>
        <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className={clsx(
                'flex-1 h-0.5 bg-white/10 rounded-full appearance-none cursor-pointer',
                '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary/70 [&::-webkit-slider-thumb]:hover:bg-primary',
                accent
            )}
        />
        <span className="text-[9px] font-mono text-white/25 w-10 text-right">
            {typeof value === 'number' ? (Number.isInteger(value) ? value : value.toFixed(1)) : value}{unit}
        </span>
    </div>
);

/** Toggle row for boolean controls */
const ToggleRow: React.FC<{
    label: string;
    value: boolean;
    onChange: (val: boolean) => void;
    icon?: React.ReactNode;
}> = ({ label, value, onChange, icon }) => (
    <div className="flex items-center gap-2 px-3 py-0.5">
        {icon && <span className="text-white/20">{icon}</span>}
        <span className="text-[9px] text-white/30 flex-1">{label}</span>
        <button
            onClick={() => onChange(!value)}
            className={clsx(
                'w-7 h-3.5 rounded-full transition-all duration-200 relative',
                value ? 'bg-primary/40' : 'bg-white/10'
            )}
        >
            <motion.div
                animate={{ x: value ? 14 : 2 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                className={clsx(
                    'absolute top-0.5 w-2.5 h-2.5 rounded-full transition-colors',
                    value ? 'bg-primary' : 'bg-white/30'
                )}
            />
        </button>
    </div>
);

export const SequenceInspector: React.FC<SequenceInspectorProps> = ({
    selectedClipId,
    currentFrame,
    onJumpToFrame,
    maxFrame,
}) => {
    const { clips, updateClip } = useClipStore();
    const { settings: projectSettings, updateSettings: updateProjectSettings } = useProjectStore();
    const { markers } = useMarkerStore();
    const fps = projectSettings.fps || 30;

    const selectedClip = selectedClipId ? clips.find((c) => c.id === selectedClipId) : null;

    // Collapsible section state
    // Auto-run Smart Engine analysis when clips are on the timeline
    useAutoSmartEngine();

    const smartStore = useTrailerSmartStore();

    const [openSections, setOpenSections] = useState<Record<string, boolean>>({
        info: true,
        transform: false,
        speed: false,
        color: false,
        audio: true,
        effects: false,
        energy: true,
        trackMixer: true,
        markers: true,
        seqInfo: true,
        audioMeter: true,
        clipControls: false,
    });

    const toggleSection = useCallback((key: string) => {
        setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
    }, []);

    const totalDurationTC = formatTimecode(maxFrame, fps);
    const clipCount = clips.filter((c) => !c.disabled).length;

    // ═══ NO CLIP SELECTED ═══
    if (!selectedClip) {
        return (
            <div className="h-full flex flex-col bg-[#0d0d1a] overflow-hidden">
                {/* Header */}
                <div className="h-7 flex items-center px-3 border-b border-white/[0.06] flex-shrink-0 bg-[#111122]/60">
                    <Sliders size={11} className="text-white/25 mr-2" />
                    <span className="text-[10px] uppercase tracking-[0.15em] font-semibold text-white/35">
                        Inspector
                    </span>
                </div>

                <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/5">
                    {/* Sequence Info */}
                    <SectionHeader
                        title="Sequence Info"
                        icon={<Info size={11} />}
                        isOpen={openSections.seqInfo}
                        onToggle={() => toggleSection('seqInfo')}
                    />
                    <AnimatePresence>
                        {openSections.seqInfo && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.15 }}
                                className="overflow-hidden"
                            >
                                <div className="px-3 py-2 space-y-1.5 border-b border-white/[0.03]">
                                    <InfoRow label="Duration" value={totalDurationTC} />
                                    <InfoRow label="FPS" value={`${fps}`} />
                                    <InfoRow label="Clips" value={`${clipCount}`} />
                                    <InfoRow label="Aspect" value={projectSettings.aspectRatio} />
                                    <InfoRow label="Resolution" value={`${projectSettings.resolution.width}×${projectSettings.resolution.height}`} />
                                    <InfoRow label="Frame" value={`${currentFrame} / ${maxFrame}`} mono />
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Markers */}
                    <SectionHeader
                        title="Markers"
                        icon={<Bookmark size={11} />}
                        isOpen={openSections.markers}
                        onToggle={() => toggleSection('markers')}
                        badge={markers.length > 0 ? `${markers.length}` : undefined}
                    />
                    <AnimatePresence>
                        {openSections.markers && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.15 }}
                                className="overflow-hidden"
                            >
                                <div className="border-b border-white/[0.03]">
                                    {markers.length === 0 ? (
                                        <div className="px-3 py-3 text-[9px] text-white/15 text-center">
                                            No markers set
                                        </div>
                                    ) : (
                                        <div className="max-h-36 overflow-y-auto">
                                            {markers.slice(0, 50).map((marker) => (
                                                <button
                                                    key={marker.id}
                                                    onClick={() => onJumpToFrame(marker.frame)}
                                                    className="w-full flex items-center gap-2 px-3 py-1 hover:bg-white/[0.03] transition-colors text-left"
                                                >
                                                    <div
                                                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                                        style={{ backgroundColor: marker.color }}
                                                    />
                                                    <span className="text-[9px] text-white/40 flex-1 truncate">
                                                        {marker.label}
                                                    </span>
                                                    <span className="text-[8px] font-mono text-white/20">
                                                        {formatTimecode(marker.frame, fps)}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Energy Analysis (auto-run from Smart Engine) */}
                    <SectionHeader
                        title="Energy Analysis"
                        icon={<Flame size={11} />}
                        isOpen={openSections.energy}
                        onToggle={() => toggleSection('energy')}
                        accentColor="text-orange-400"
                        badge={smartStore.totalCount > 0
                            ? (smartStore.isFullyAnalyzed
                                ? `${smartStore.analyzedCount} clips`
                                : `${smartStore.analyzedCount}/${smartStore.totalCount}`)
                            : undefined}
                    />
                    <AnimatePresence>
                        {openSections.energy && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.15 }}
                                className="overflow-hidden"
                            >
                                <div className="px-3 py-3 border-b border-white/[0.03] space-y-2">
                                    {smartStore.totalCount === 0 ? (
                                        <p className="text-[10px] text-white/30 italic">Load media to begin auto-analysis…</p>
                                    ) : !smartStore.isFullyAnalyzed ? (
                                        <div className="space-y-1.5">
                                            <div className="flex items-center gap-1.5 text-[10px] text-amber-300">
                                                <Loader2 size={10} className="animate-spin" />
                                                Auto-analyzing… {smartStore.analyzedCount}/{smartStore.totalCount} clips
                                            </div>
                                            <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                                                <div
                                                    className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all"
                                                    style={{ width: `${smartStore.totalCount > 0 ? (smartStore.analyzedCount / smartStore.totalCount) * 100 : 0}%` }}
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="text-[10px] text-emerald-400 font-medium">✓ All clips analyzed</p>
                                    )}

                                    {/* Energy breakdown badges */}
                                    {smartStore.analyzedCount > 0 && (() => {
                                        const counts: Record<string, number> = { intense: 0, high: 0, moderate: 0, low: 0, static: 0 };
                                        Object.values(smartStore.analysisResults).forEach((r: any) => {
                                            if (r?.energyLevel && counts[r.energyLevel] !== undefined) counts[r.energyLevel]++;
                                        });
                                        const badges: Array<[string, string]> = [
                                            ['intense', 'bg-red-500/20 text-red-300 border-red-500/30'],
                                            ['high', 'bg-orange-500/20 text-orange-300 border-orange-500/30'],
                                            ['moderate', 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'],
                                            ['low', 'bg-blue-500/20 text-blue-300 border-blue-500/30'],
                                            ['static', 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30'],
                                        ];
                                        return (
                                            <div className="flex flex-wrap gap-1">
                                                {badges.map(([level, cls]) => (
                                                    counts[level] > 0 && (
                                                        <span key={level} className={clsx('px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase border flex items-center gap-1', cls)}>
                                                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-current" />
                                                            {level} {counts[level]}
                                                        </span>
                                                    )
                                                ))}
                                            </div>
                                        );
                                    })()}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Audio Meter (visual only) */}
                    <SectionHeader
                        title="Audio Levels"
                        icon={<Activity size={11} />}
                        isOpen={openSections.audioMeter}
                        onToggle={() => toggleSection('audioMeter')}
                    />
                    <AnimatePresence>
                        {openSections.audioMeter && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.15 }}
                                className="overflow-hidden"
                            >
                                <div className="px-3 py-3 border-b border-white/[0.03]">
                                    <AudioMeterVisual />
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Track Mixer moved beside the timeline tracks (folded by default). */}
                </div>
            </div>
        );
    }

    // ═══ CLIP SELECTED ═══
    const clip = selectedClip;
    const clipDuration = clip.endFrame - clip.startFrame;
    const clipDurationTC = formatTimecode(clipDuration, fps);
    const clipSpeed = clip.speed ?? 1;
    const clipVolume = clip.volume ?? 100;
    const clipMuted = clip.isMuted ?? false;
    const clipReversed = clip.reversed ?? false;

    // Color grading values
    const cg = clip.colorGrading;
    const exposure = cg?.exposure ?? 0;
    const contrast = cg?.contrast ?? 1;
    const saturation = cg?.saturation ?? 1;
    const temperature = cg?.temperature ?? 0;

    return (
        <div className="h-full flex flex-col bg-[#0d0d1a] overflow-hidden">
            {/* Header */}
            <div className="h-7 flex items-center justify-between px-3 border-b border-white/[0.06] flex-shrink-0 bg-[#111122]/60">
                <div className="flex items-center gap-2 min-w-0">
                    <Film size={11} className="text-primary/50 flex-shrink-0" />
                    <span className="text-[10px] font-semibold text-white/50 truncate">
                        {clip.filename}
                    </span>
                </div>
                <span className="text-[8px] font-mono text-white/20 flex-shrink-0 ml-2">{clipDurationTC}</span>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/5">
                {/* Clip Info */}
                <SectionHeader
                    title="Clip Info"
                    icon={<Info size={11} />}
                    isOpen={openSections.info}
                    onToggle={() => toggleSection('info')}
                />
                <AnimatePresence>
                    {openSections.info && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="overflow-hidden"
                        >
                            <div className="px-3 py-2 space-y-1 border-b border-white/[0.03]">
                                <InfoRow label="Type" value={clip.type} />
                                <InfoRow label="Duration" value={`${clipDuration}f · ${clipDurationTC}`} />
                                <InfoRow label="In / Out" value={`${clip.startFrame} → ${clip.endFrame}`} mono />
                                <InfoRow label="Track" value={`${clip.track}`} />
                                <InfoRow label="Speed" value={`${clipSpeed}×`} mono />
                                {clip.path && (
                                    <InfoRow label="Source" value={clip.path.split(/[\\/]/).pop() || clip.path} />
                                )}
                            </div>

                            {/* ── Source Trim Visualization ── */}
                            <div className="px-3 py-2 space-y-1.5 border-b border-white/[0.03]">
                                <div className="flex items-center gap-1 mb-1">
                                    <FileVideo size={9} className="text-white/25" />
                                    <span className="text-[8px] uppercase tracking-wider text-white/25 font-semibold">Source Window</span>
                                </div>
                                <InfoRow label="Src In" value={`${clip.trimStartFrame}`} mono />
                                <InfoRow label="Src Out" value={`${clip.trimEndFrame}`} mono />
                                <InfoRow label="Src Total" value={`${clip.sourceDurationFrames}f`} mono />
                                {/* Usage bar */}
                                <div className="h-1.5 rounded-full bg-white/5 overflow-hidden mt-1">
                                    <div
                                        className="h-full rounded-full bg-gradient-to-r from-primary/40 to-primary/70 transition-all"
                                        style={{
                                            marginLeft: `${clip.sourceDurationFrames > 0 ? (clip.trimStartFrame / clip.sourceDurationFrames) * 100 : 0}%`,
                                            width: `${clip.sourceDurationFrames > 0 ? ((clip.trimEndFrame - clip.trimStartFrame) / clip.sourceDurationFrames) * 100 : 100}%`,
                                        }}
                                    />
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ── Quick Actions ── */}
                <SectionHeader
                    title="Quick Actions"
                    icon={<Scissors size={11} />}
                    isOpen={openSections.quickActions ?? true}
                    onToggle={() => toggleSection('quickActions')}
                    accentColor="text-red-400/40"
                />
                <AnimatePresence>
                    {(openSections.quickActions ?? true) && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="overflow-hidden"
                        >
                            <div className="px-3 py-2 border-b border-white/[0.03] grid grid-cols-3 gap-1">
                                <ActionButton
                                    icon={<Scissors size={10} />}
                                    label="Split"
                                    shortcut="Ctrl+K"
                                    onClick={() => splitClipAtFrame(clip.id, currentFrame)}
                                />
                                <ActionButton
                                    icon={<Trash2 size={10} />}
                                    label="Delete"
                                    shortcut="Del"
                                    onClick={() => {
                                        useClipStore.getState().selectSingleClip(clip.id);
                                        deleteSelectedClips();
                                    }}
                                    variant="danger"
                                />
                                <ActionButton
                                    icon={<Trash2 size={10} />}
                                    label="Ripple Del"
                                    shortcut="Shift+Del"
                                    onClick={() => {
                                        useClipStore.getState().selectSingleClip(clip.id);
                                        rippleDeleteSelectedClips();
                                    }}
                                    variant="danger"
                                />
                                <ActionButton
                                    icon={<Copy size={10} />}
                                    label="Duplicate"
                                    shortcut="Ctrl+D"
                                    onClick={() => {
                                        useClipStore.getState().selectSingleClip(clip.id);
                                        duplicateSelectedClips();
                                    }}
                                />
                                <ActionButton
                                    icon={<Copy size={10} />}
                                    label="Copy"
                                    shortcut="Ctrl+C"
                                    onClick={() => {
                                        useClipStore.getState().selectSingleClip(clip.id);
                                        copySelectedClips();
                                    }}
                                />
                                <ActionButton
                                    icon={<ToggleLeft size={10} />}
                                    label={clip.disabled ? 'Enable' : 'Disable'}
                                    shortcut="E"
                                    onClick={() => toggleClipEnabled(clip.id)}
                                    active={!clip.disabled}
                                />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Transform */}
                <SectionHeader
                    title="Transform"
                    icon={<Move size={11} />}
                    isOpen={openSections.transform}
                    onToggle={() => toggleSection('transform')}
                />
                <AnimatePresence>
                    {openSections.transform && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="overflow-hidden"
                        >
                            <div className="py-1.5 border-b border-white/[0.03]">
                                <SliderRow
                                    label="Zoom"
                                    value={clip.zoomLevel ?? 100}
                                    min={50}
                                    max={300}
                                    step={1}
                                    onChange={(v) => updateClip(clip.id, { zoomLevel: v } as any)}
                                    unit="%"
                                />
                                <SliderRow
                                    label="Zoom Start"
                                    value={clip.zoomStart ?? 100}
                                    min={50}
                                    max={300}
                                    step={1}
                                    onChange={(v) => updateClip(clip.id, { zoomStart: v } as any)}
                                    unit="%"
                                />
                                <SliderRow
                                    label="Zoom End"
                                    value={clip.zoomEnd ?? 100}
                                    min={50}
                                    max={300}
                                    step={1}
                                    onChange={(v) => updateClip(clip.id, { zoomEnd: v } as any)}
                                    unit="%"
                                />
                                <SliderRow
                                    label="Rotation"
                                    value={clip.rotation ?? 0}
                                    min={0}
                                    max={270}
                                    step={90}
                                    onChange={(v) => updateClip(clip.id, { rotation: v as 0 | 90 | 180 | 270 } as any)}
                                    unit="°"
                                />
                                <div className="flex items-center gap-2 px-3 py-1">
                                    <ToggleRow
                                        label="Flip H"
                                        value={clip.flipH ?? false}
                                        onChange={(v) => updateClip(clip.id, { flipH: v } as any)}
                                    />
                                    <ToggleRow
                                        label="Flip V"
                                        value={clip.flipV ?? false}
                                        onChange={(v) => updateClip(clip.id, { flipV: v } as any)}
                                    />
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Speed */}
                <SectionHeader
                    title="Speed"
                    icon={<Gauge size={11} />}
                    isOpen={openSections.speed}
                    onToggle={() => toggleSection('speed')}
                    badge={clipSpeed !== 1 ? `${clipSpeed}×` : undefined}
                />
                <AnimatePresence>
                    {openSections.speed && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="overflow-hidden"
                        >
                            <div className="py-1.5 border-b border-white/[0.03]">
                                <SliderRow
                                    label="Speed"
                                    value={clipSpeed}
                                    min={0.1}
                                    max={4}
                                    step={0.05}
                                    onChange={(v) => useClipStore.getState().setClipSpeed(clip.id, v)}
                                    unit="×"
                                />
                                <ToggleRow
                                    label="Reverse"
                                    value={clipReversed}
                                    onChange={(v) => updateClip(clip.id, { reversed: v } as any)}
                                    icon={<RotateCcw size={10} />}
                                />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Grade & Enhance (per-clip — like Premiere Pro's Lumetri) */}
                <SectionHeader
                    title="Grade & Enhance"
                    icon={<Palette size={11} />}
                    isOpen={openSections.color}
                    onToggle={() => toggleSection('color')}
                    accentColor="text-amber-400/40"
                />
                <AnimatePresence>
                    {openSections.color && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="overflow-hidden"
                        >
                            <div className="px-1 py-2 border-b border-white/[0.03]">
                                <TrailerGradeEnhance
                                    colorGrading={clip.colorGrading as any}
                                    effects={(clip.parametricEffects || []) as any}
                                    onColorGradingChange={(grading) =>
                                        updateClip(clip.id, { colorGrading: grading } as any)
                                    }
                                    onEffectsChange={(effects) =>
                                        updateClip(clip.id, { parametricEffects: effects } as any)
                                    }
                                />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Audio */}
                <SectionHeader
                    title="Audio"
                    icon={<Volume2 size={11} />}
                    isOpen={openSections.audio}
                    onToggle={() => toggleSection('audio')}
                    badge={clipMuted ? 'MUTE' : undefined}
                />
                <AnimatePresence>
                    {openSections.audio && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="overflow-hidden"
                        >
                            <div className="py-1.5 border-b border-white/[0.03]">
                                <SliderRow
                                    label="Volume"
                                    value={clipVolume}
                                    min={0}
                                    max={200}
                                    step={1}
                                    onChange={(v) => useClipStore.getState().setClipVolume(clip.id, v)}
                                    unit="%"
                                />
                                <ToggleRow
                                    label="Mute"
                                    value={clipMuted}
                                    onChange={(v) => useClipStore.getState().setClipMuted(clip.id, v)}
                                    icon={clipMuted ? <VolumeX size={10} /> : <Volume2 size={10} />}
                                />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Track Mixer moved beside the timeline tracks (folded by default). */}

                {/* Effects list (parametric) */}
                <SectionHeader
                    title="Effects"
                    icon={<Zap size={11} />}
                    isOpen={openSections.effects}
                    onToggle={() => toggleSection('effects')}
                    badge={
                        (clip.parametricEffects?.length ?? 0) > 0
                            ? `${clip.parametricEffects!.length}`
                            : undefined
                    }
                    accentColor="text-purple-400/40"
                />
                <AnimatePresence>
                    {openSections.effects && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="overflow-hidden"
                        >
                            <div className="border-b border-white/[0.03]">
                                {(!clip.parametricEffects || clip.parametricEffects.length === 0) ? (
                                    <div className="px-3 py-3 text-[9px] text-white/15 text-center">
                                        No effects applied
                                    </div>
                                ) : (
                                    <div className="py-1">
                                        {clip.parametricEffects.map((pe, i) => (
                                            <div
                                                key={`${pe.effectId}-${i}`}
                                                className="flex items-center gap-2 px-3 py-1 hover:bg-white/[0.02] transition-colors"
                                            >
                                                <Zap size={9} className="text-purple-400/40" />
                                                <span className="text-[9px] text-white/40 flex-1 truncate">
                                                    {pe.effectId}
                                                </span>
                                                <Eye size={9} className="text-white/20" />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Per-Clip Energy (from Smart Engine analysis) */}
                {(() => {
                    const clipResult = smartStore.getResult(clip.id) ||
                        (clip.path ? smartStore.getResult(clip.path) : undefined);
                    if (!clipResult?.analyzed) return null;
                    const levelColors: Record<string, string> = {
                        intense: 'bg-red-500/20 text-red-300 border-red-500/30',
                        high: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
                        moderate: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
                        low: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
                        static: 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30',
                    };
                    return (
                        <div className="px-3 py-2 border-b border-white/[0.03]">
                            <div className="flex items-center justify-between">
                                <span className="text-[9px] uppercase tracking-wider text-white/30 font-bold">Energy</span>
                                <span className={clsx(
                                    'px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border',
                                    levelColors[clipResult.energyLevel] || 'bg-white/10 text-white/50'
                                )}>
                                    {clipResult.energyLevel}
                                </span>
                            </div>
                            <div className="mt-1.5 h-1.5 rounded-full bg-white/5 overflow-hidden">
                                <div
                                    className="h-full rounded-full bg-gradient-to-r from-blue-500 via-yellow-500 to-red-500 transition-all"
                                    style={{ width: `${clipResult.score}%` }}
                                />
                            </div>
                            <div className="flex justify-between mt-0.5">
                                <span className="text-[8px] text-white/20">Score</span>
                                <span className="text-[8px] text-white/40 font-mono">{clipResult.score}/100</span>
                            </div>
                        </div>
                    );
                })()}

                {/* Full Clip Controls (the existing detailed panel) */}
                <SectionHeader
                    title="Detailed Controls"
                    icon={<Sliders size={11} />}
                    isOpen={openSections.clipControls}
                    onToggle={() => toggleSection('clipControls')}
                />
                <AnimatePresence>
                    {openSections.clipControls && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="overflow-hidden"
                        >
                            <div className="border-b border-white/[0.03]">
                                <ClipControls clipId={clip.id} variant="sidebar" />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

// ─── Helper Components ────────────────────────────────────────────────────────

const InfoRow: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
    <div className="flex items-center justify-between">
        <span className="text-[9px] text-white/25">{label}</span>
        <span className={clsx('text-[9px] text-white/45', mono && 'font-mono')}>{value}</span>
    </div>
);

/** Static stereo audio meter visualization */
const AudioMeterVisual: React.FC = () => {
    // Simulated stereo levels for visual polish
    const levels = [0.65, 0.58];
    const labels = ['L', 'R'];

    return (
        <div className="flex items-end gap-2 h-16">
            {levels.map((level, i) => (
                <div key={labels[i]} className="flex flex-col items-center gap-1 flex-1">
                    <div className="w-full h-12 bg-[#080810] rounded-sm overflow-hidden relative border border-white/[0.04]">
                        {/* Peak zone markers */}
                        <div className="absolute top-0 left-0 right-0 h-[15%] bg-red-500/5 border-b border-red-500/10" />
                        <div className="absolute top-[15%] left-0 right-0 h-[15%] bg-yellow-500/5 border-b border-yellow-500/10" />

                        {/* Level bar */}
                        <div
                            className="absolute bottom-0 left-0 right-0 transition-all duration-300"
                            style={{ height: `${level * 100}%` }}
                        >
                            <div className="w-full h-full" style={{
                                background: `linear-gradient(to top, #22c55e 0%, #22c55e 60%, #eab308 80%, #ef4444 100%)`,
                            }} />
                        </div>
                    </div>
                    <span className="text-[7px] text-white/20 font-mono">{labels[i]}</span>
                </div>
            ))}
            {/* dB Scale */}
            <div className="flex flex-col justify-between h-12 text-[6px] font-mono text-white/15">
                <span>0</span>
                <span>-12</span>
                <span>-24</span>
                <span>-∞</span>
            </div>
        </div>
    );
};



