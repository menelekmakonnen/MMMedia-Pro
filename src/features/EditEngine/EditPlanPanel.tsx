import React, { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import { useEditLogicStore } from '../../store/editLogicStore';
import { useClipStore } from '../../store/clipStore';
import { buildEditPlan } from '../../lib/editPlanBuilder';
import {
    Brain, GripVertical, ChevronDown, ChevronRight, Zap, Shield, Eye,
    Scissors, Gauge, Film, Music, Volume2, Sparkles, Clock, Move,
    Palette, RefreshCw, ArrowRightLeft, Layers, AlertTriangle,
} from 'lucide-react';
import type { EditPlan, GlobalDecisionNode, ClipDecisionNode, ClipFeatureNode, DecisionSource } from '../../types/EditPlanTypes';

// ═══════════════════════════════════════════════════════════════════════════════
// EditPlanPanel — Comprehensive edit decision workflow (premium UI)
//
// Shows every feature used in the current edit as a structured decision tree.
// Users can reorder clip decisions for different results. This is the foundation
// for future AI management of the edit.
// ═══════════════════════════════════════════════════════════════════════════════

// ── Source badge colors ──────────────────────────────────────────────────────

const SOURCE_STYLE: Record<DecisionSource, { bg: string; text: string; label: string }> = {
    'editorial-rule': { bg: 'rgba(99,102,241,0.15)', text: '#818cf8', label: 'Editorial Rule' },
    'generator-mode': { bg: 'rgba(168,85,247,0.15)', text: '#c084fc', label: 'Generator Mode' },
    'creator-hack':   { bg: 'rgba(6,182,212,0.15)',  text: '#67e8f9', label: 'Creator Hack' },
    'user-manual':    { bg: 'rgba(16,185,129,0.15)', text: '#6ee7b7', label: 'User' },
    'baked-in':       { bg: 'rgba(245,158,11,0.15)', text: '#fbbf24', label: 'Built-in' },
    'preset':         { bg: 'rgba(236,72,153,0.15)', text: '#f472b6', label: 'Preset' },
    'style-recipe':   { bg: 'rgba(239,68,68,0.15)',  text: '#fca5a5', label: 'Recipe' },
};

const SourceBadge: React.FC<{ source: DecisionSource }> = ({ source }) => {
    const s = SOURCE_STYLE[source];
    return (
        <span
            className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider"
            style={{ background: s.bg, color: s.text }}
        >
            {s.label}
        </span>
    );
};

// ── Category icon map ────────────────────────────────────────────────────────

const CAT_ICON: Record<string, React.ReactNode> = {
    visual: <Sparkles size={10} className="text-purple-400" />,
    audio: <Volume2 size={10} className="text-cyan-400" />,
    motion: <Move size={10} className="text-amber-400" />,
    timing: <Clock size={10} className="text-blue-400" />,
    editorial: <Shield size={10} className="text-amber-400" />,
    composition: <Layers size={10} className="text-emerald-400" />,
    global: <Brain size={10} className="text-indigo-400" />,
};

// ── Section header ───────────────────────────────────────────────────────────

const SectionHeader: React.FC<{
    title: string;
    icon: React.ReactNode;
    count?: number;
    expanded: boolean;
    onToggle: () => void;
    accentColor?: string;
}> = ({ title, icon, count, expanded, onToggle, accentColor = '139,92,246' }) => (
    <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg transition-all duration-200 group"
        style={{
            background: expanded ? `rgba(${accentColor},0.08)` : 'transparent',
            border: `1px solid rgba(${accentColor},${expanded ? 0.2 : 0.06})`,
        }}
    >
        {icon}
        <span className="text-[10px] font-black uppercase tracking-[0.12em] text-white/60 group-hover:text-white/80 flex-1 text-left">
            {title}
        </span>
        {count !== undefined && (
            <span
                className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: `rgba(${accentColor},0.2)`, color: `rgba(${accentColor},1)` }}
            >
                {count}
            </span>
        )}
        {expanded
            ? <ChevronDown size={12} className="text-white/30" />
            : <ChevronRight size={12} className="text-white/30" />
        }
    </button>
);

// ── Global decision row ──────────────────────────────────────────────────────

const GlobalRow: React.FC<{ node: GlobalDecisionNode }> = ({ node }) => (
    <div
        className="flex items-start gap-2 px-3 py-2 rounded-md transition-all duration-200 hover:bg-white/[0.03]"
        style={{ borderLeft: '2px solid rgba(245,158,11,0.3)' }}
    >
        <div className="flex-shrink-0 mt-0.5">{CAT_ICON[node.category] || CAT_ICON.global}</div>
        <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[10px] font-bold text-white/80">{node.label}</span>
                <SourceBadge source={node.source} />
            </div>
            <p className="text-[9px] text-white/40 leading-relaxed">{node.description}</p>
        </div>
    </div>
);

// ── Clip feature pill ────────────────────────────────────────────────────────

const FeaturePill: React.FC<{ feat: ClipFeatureNode }> = ({ feat }) => {
    const [showParams, setShowParams] = useState(false);
    const s = SOURCE_STYLE[feat.source];

    return (
        <div className="inline-block mr-1 mb-1">
            <button
                onClick={() => setShowParams(!showParams)}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-bold transition-all duration-150 hover:scale-105"
                style={{ background: s.bg, color: s.text, border: `1px solid ${s.text}22` }}
            >
                {CAT_ICON[feat.featureId?.includes('audio') ? 'audio' : 'visual']}
                {feat.label}
            </button>
            {showParams && Object.keys(feat.params).length > 0 && (
                <div
                    className="mt-0.5 px-2 py-1 rounded text-[8px] text-white/40 border border-white/[0.04]"
                    style={{ background: 'rgba(0,0,0,0.3)' }}
                >
                    {Object.entries(feat.params).map(([k, v]) => (
                        <span key={k} className="mr-2">
                            <span className="text-white/25">{k}:</span>{' '}
                            <span className="text-white/60">{String(v)}</span>
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
};

// ── Clip card ────────────────────────────────────────────────────────────────

const ClipCard: React.FC<{
    node: ClipDecisionNode;
    isActive: boolean;
    onDragStart: (e: React.DragEvent, i: number) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent, i: number) => void;
    index: number;
}> = ({ node, isActive, onDragStart, onDragOver, onDrop, index }) => {
    const [expanded, setExpanded] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    const [thumbLoaded, setThumbLoaded] = useState(false);

    useEffect(() => {
        const el = videoRef.current;
        if (!el || !node.sourcePath) return;
        el.currentTime = node.trimRange[0];
        const onSeek = () => setThumbLoaded(true);
        el.addEventListener('seeked', onSeek, { once: true });
        return () => el.removeEventListener('seeked', onSeek);
    }, [node.sourcePath, node.trimRange]);

    const totalFeatures = node.features.length + node.audioFeatures.length;

    return (
        <div
            draggable
            onDragStart={(e) => onDragStart(e, index)}
            onDragOver={onDragOver}
            onDrop={(e) => onDrop(e, index)}
            className="rounded-lg border transition-all duration-300 group cursor-grab active:cursor-grabbing"
            style={{
                background: isActive
                    ? 'linear-gradient(135deg, rgba(139,92,246,0.08) 0%, rgba(6,182,212,0.05) 100%)'
                    : 'rgba(255,255,255,0.015)',
                borderColor: isActive ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.04)',
                boxShadow: isActive ? '0 0 20px rgba(139,92,246,0.08)' : 'none',
            }}
        >
            {/* Header row */}
            <div className="flex items-center gap-2 px-2.5 py-2">
                <GripVertical size={12} className="text-white/15 group-hover:text-white/30 flex-shrink-0" />

                {/* Thumbnail */}
                <div className="relative flex-shrink-0 w-10 h-10 rounded-md overflow-hidden bg-black/50">
                    {node.sourcePath && (
                        <video
                            ref={videoRef}
                            src={node.sourcePath}
                            className={`w-full h-full object-cover transition-opacity duration-300 ${thumbLoaded ? 'opacity-100' : 'opacity-0'}`}
                            muted
                            playsInline
                            preload="metadata"
                        />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    <span className="absolute bottom-0.5 right-0.5 text-[7px] font-bold text-white/60 tabular-nums">
                        {node.order + 1}
                    </span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-white/80 truncate">{node.filename}</span>
                        {node.speed !== 1 && (
                            <span className="text-[8px] font-bold text-amber-400/70 px-1 py-0.5 rounded bg-amber-500/10">
                                ⚡{node.speed}×
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2 text-[8px] text-white/30 mt-0.5">
                        <span>{node.durationSec}s</span>
                        <span>·</span>
                        <span>{node.trimRange[0]}–{node.trimRange[1]}s</span>
                        {node.transitionType && (
                            <>
                                <span>·</span>
                                <span className="text-indigo-400/60">{node.transitionType}</span>
                            </>
                        )}
                    </div>
                </div>

                {/* Feature count */}
                {totalFeatures > 0 && (
                    <span className="text-[8px] font-bold text-purple-400/80 px-1.5 py-0.5 rounded-full bg-purple-500/10">
                        ✦{totalFeatures}
                    </span>
                )}

                <button
                    onClick={() => setExpanded(!expanded)}
                    className="p-1 rounded hover:bg-white/[0.05] transition-colors"
                >
                    {expanded
                        ? <ChevronDown size={11} className="text-white/30" />
                        : <ChevronRight size={11} className="text-white/30" />
                    }
                </button>
            </div>

            {/* Expanded detail */}
            {expanded && (
                <div className="px-3 pb-2.5 space-y-1.5 border-t border-white/[0.03]">
                    {/* Selection reason */}
                    <div className="text-[8px] text-white/30 italic pt-1.5">{node.selectionReason}</div>

                    {/* Transition */}
                    {node.transitionReason && (
                        <div className="flex items-center gap-1 text-[8px]">
                            <ArrowRightLeft size={9} className="text-indigo-400/60" />
                            <span className="text-white/40">{node.transitionReason}</span>
                        </div>
                    )}

                    {/* Visual/motion features */}
                    {node.features.length > 0 && (
                        <div>
                            <span className="text-[8px] font-bold text-white/25 uppercase tracking-wider">Effects</span>
                            <div className="mt-0.5">
                                {node.features.map((f, i) => (
                                    <FeaturePill key={`${f.featureId}-${i}`} feat={f} />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Audio features */}
                    {node.audioFeatures.length > 0 && (
                        <div>
                            <span className="text-[8px] font-bold text-white/25 uppercase tracking-wider">Audio</span>
                            <div className="mt-0.5">
                                {node.audioFeatures.map((f, i) => (
                                    <FeaturePill key={`${f.featureId}-${i}`} feat={f} />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════════
// EditPlanPanel — main component
// ═══════════════════════════════════════════════════════════════════════════════

export const EditPlanPanel: React.FC = () => {
    const editPlan = useEditLogicStore((s) => s.editPlan);
    const setEditPlan = useEditLogicStore((s) => s.setEditPlan);
    const activeClipIndex = useEditLogicStore((s) => s.activeClipIndex);
    const expandedSections = useEditLogicStore((s) => s.expandedSections);
    const toggleSection = useEditLogicStore((s) => s.toggleSection);
    const reorderClipNode = useEditLogicStore((s) => s.reorderClipNode);
    const planModified = useEditLogicStore((s) => s.planModified);
    const clips = useClipStore((s) => s.clips);

    // Build plan when clips change
    const plan = useMemo(() => {
        if (clips.length === 0) return null;
        return buildEditPlan(30);
    }, [clips]);

    useEffect(() => {
        if (plan) setEditPlan(plan);
    }, [plan, setEditPlan]);

    const displayPlan = editPlan || plan;

    // ── Drag handlers ──
    const dragIndex = useRef(-1);

    const onDragStart = useCallback((_e: React.DragEvent, i: number) => {
        dragIndex.current = i;
    }, []);

    const onDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
    }, []);

    const onDrop = useCallback((e: React.DragEvent, dropIndex: number) => {
        e.preventDefault();
        if (dragIndex.current >= 0 && dragIndex.current !== dropIndex) {
            reorderClipNode(dragIndex.current, dropIndex);
        }
        dragIndex.current = -1;
    }, [reorderClipNode]);

    const handleRefresh = useCallback(() => {
        const fresh = buildEditPlan(30);
        setEditPlan(fresh);
    }, [setEditPlan]);

    if (!displayPlan) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12 opacity-50">
                <Brain size={32} className="text-white/20 mb-3" />
                <p className="text-[11px] font-medium text-white/30">No edit plan yet</p>
                <p className="text-[9px] text-white/20 mt-1">Generate an edit to see the decision workflow</p>
            </div>
        );
    }

    const globalExpanded = expandedSections.has('global');
    const clipsExpanded = expandedSections.has('clips');
    const audioExpanded = expandedSections.has('audio');

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.04]">
                <Brain size={14} className="text-indigo-400" />
                <span className="text-[11px] font-black uppercase tracking-[0.1em] text-white/60 flex-1">
                    Edit Plan
                </span>
                {planModified && (
                    <span className="text-[8px] font-bold text-amber-400 px-1.5 py-0.5 rounded bg-amber-500/10 flex items-center gap-1">
                        <AlertTriangle size={8} /> Modified
                    </span>
                )}
                <button
                    onClick={handleRefresh}
                    className="p-1 rounded hover:bg-white/[0.05] transition-colors"
                    title="Refresh plan from current state"
                >
                    <RefreshCw size={12} className="text-white/30 hover:text-white/60" />
                </button>
                <div className="text-[8px] text-white/25 tabular-nums">
                    {displayPlan.stats.totalClips} clips · {displayPlan.stats.totalDurationSec}s · {displayPlan.stats.featureCount} fx
                </div>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-2 py-2 space-y-2">

                {/* ── Global Decisions ── */}
                <SectionHeader
                    title="Global Decisions"
                    icon={<Brain size={12} className="text-indigo-400" />}
                    count={5 + displayPlan.global.creatorHacks.length}
                    expanded={globalExpanded}
                    onToggle={() => toggleSection('global')}
                    accentColor="99,102,241"
                />
                {globalExpanded && (
                    <div className="space-y-1 ml-1">
                        <GlobalRow node={displayPlan.global.generatorMode} />

                        {/* Baked-in editorial rules */}
                        <div className="px-2 py-1.5">
                            <span className="text-[8px] font-bold text-amber-400/50 uppercase tracking-wider flex items-center gap-1">
                                <Shield size={8} /> Baked-in Rules
                            </span>
                        </div>
                        <GlobalRow node={displayPlan.global.siftTakes} />
                        <GlobalRow node={displayPlan.global.pacingStrategy} />
                        <GlobalRow node={displayPlan.global.transitionDiscipline} />
                        <GlobalRow node={displayPlan.global.eyeTrace} />

                        {/* Creator Hacks */}
                        {displayPlan.global.creatorHacks.length > 0 && (
                            <>
                                <div className="px-2 py-1.5">
                                    <span className="text-[8px] font-bold text-cyan-400/50 uppercase tracking-wider flex items-center gap-1">
                                        <Zap size={8} /> Creator Hacks
                                    </span>
                                </div>
                                {displayPlan.global.creatorHacks.map((h) => (
                                    <GlobalRow key={h.nodeId} node={h} />
                                ))}
                            </>
                        )}

                        {/* Editorial score */}
                        <GlobalRow node={displayPlan.global.editorialScore} />
                    </div>
                )}

                {/* ── Clip Decisions ── */}
                <SectionHeader
                    title="Clip Decisions"
                    icon={<Film size={12} className="text-purple-400" />}
                    count={displayPlan.clips.length}
                    expanded={clipsExpanded}
                    onToggle={() => toggleSection('clips')}
                    accentColor="168,85,247"
                />
                {clipsExpanded && (
                    <div className="space-y-1.5 ml-1">
                        {displayPlan.clips.map((clip, i) => (
                            <ClipCard
                                key={clip.clipId}
                                node={clip}
                                isActive={i === activeClipIndex}
                                onDragStart={onDragStart}
                                onDragOver={onDragOver}
                                onDrop={onDrop}
                                index={i}
                            />
                        ))}
                    </div>
                )}

                {/* ── Audio Decisions ── */}
                <SectionHeader
                    title="Audio Decisions"
                    icon={<Music size={12} className="text-cyan-400" />}
                    count={(displayPlan.audio.musicTrack ? 1 : 0) + displayPlan.audio.sfxPlacements.length}
                    expanded={audioExpanded}
                    onToggle={() => toggleSection('audio')}
                    accentColor="6,182,212"
                />
                {audioExpanded && (
                    <div className="space-y-1 ml-1">
                        {displayPlan.audio.musicTrack && (
                            <div className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-white/[0.03]"
                                style={{ borderLeft: '2px solid rgba(6,182,212,0.3)' }}>
                                <Music size={10} className="text-cyan-400/60" />
                                <div className="flex-1">
                                    <span className="text-[10px] font-bold text-white/70">{displayPlan.audio.musicTrack.label}</span>
                                    <p className="text-[8px] text-white/35">{displayPlan.audio.musicTrack.description}</p>
                                </div>
                                <SourceBadge source={displayPlan.audio.musicTrack.source} />
                            </div>
                        )}
                        {displayPlan.audio.sfxPlacements.map((sfx) => (
                            <div key={sfx.nodeId} className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-white/[0.03]"
                                style={{ borderLeft: '2px solid rgba(6,182,212,0.15)' }}>
                                <Volume2 size={9} className="text-cyan-400/40" />
                                <span className="text-[9px] text-white/50 flex-1">{sfx.description}</span>
                                <SourceBadge source={sfx.source} />
                            </div>
                        ))}
                        {!displayPlan.audio.musicTrack && displayPlan.audio.sfxPlacements.length === 0 && (
                            <p className="text-[9px] text-white/20 px-3 py-2 italic">No audio decisions</p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
