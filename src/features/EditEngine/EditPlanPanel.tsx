import React, { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import { useEditLogicStore } from '../../store/editLogicStore';
import { useClipStore } from '../../store/clipStore';
import { buildEditPlan } from '../../lib/editPlanBuilder';
import {
    Brain, GripVertical, Zap, Shield, Eye, Lock, Unlock,
    Scissors, Gauge, Film, Music, Volume2, Sparkles, Clock, Move,
    RefreshCw, ArrowRightLeft, Layers, AlertTriangle, Power,
} from 'lucide-react';
import type { EditPlan, GlobalDecisionNode, ClipDecisionNode, ClipFeatureNode, DecisionSource } from '../../types/EditPlanTypes';

// ═══════════════════════════════════════════════════════════════════════════════
// EditPlanPanel — Flat decision list (no groups).
//
// Every decision — global, per-clip, and audio — lives in a single draggable
// list. Users can reorder and toggle (on/off) any decision. Only "Duration"
// is pinned to the top by default (since everything else depends on it) but
// the user can unlock it to move freely.
// ═══════════════════════════════════════════════════════════════════════════════

// ── Unified decision node ────────────────────────────────────────────────────

type UnifiedDecision = {
    uid: string;
    kind: 'global' | 'clip' | 'audio';
    label: string;
    description: string;
    source: DecisionSource;
    icon: React.ReactNode;
    enabled: boolean;
    /** If true, this decision is pinned at the top and cannot be moved unless unlocked. */
    pinned: boolean;
    /** If true, user unlocked the pin. */
    unlocked: boolean;
    /** Features on this decision (for clip nodes). */
    features?: ClipFeatureNode[];
    /** Original data ref for param display. */
    data?: Record<string, unknown>;
    /** Clip filename (for clip nodes). */
    filename?: string;
    /** Clip order index. */
    order?: number;
    /** Duration in seconds. */
    durationSec?: number;
    /** Speed multiplier. */
    speed?: number;
    /** Transition info. */
    transitionType?: string | null;
    transitionReason?: string;
};

// ── Source badge ──────────────────────────────────────────────────────────────

const SOURCE_STYLE: Record<DecisionSource, { bg: string; text: string; label: string }> = {
    'editorial-rule': { bg: 'rgba(99,102,241,0.15)', text: '#818cf8', label: 'Rule' },
    'generator-mode': { bg: 'rgba(168,85,247,0.15)', text: '#c084fc', label: 'Mode' },
    'creator-hack':   { bg: 'rgba(6,182,212,0.15)',  text: '#67e8f9', label: 'Hack' },
    'user-manual':    { bg: 'rgba(16,185,129,0.15)', text: '#6ee7b7', label: 'User' },
    'baked-in':       { bg: 'rgba(245,158,11,0.15)', text: '#fbbf24', label: 'Core' },
    'preset':         { bg: 'rgba(236,72,153,0.15)', text: '#f472b6', label: 'Preset' },
    'style-recipe':   { bg: 'rgba(239,68,68,0.15)',  text: '#fca5a5', label: 'Recipe' },
};

const SourceBadge: React.FC<{ source: DecisionSource }> = ({ source }) => {
    const s = SOURCE_STYLE[source];
    return (
        <span
            className="inline-flex items-center px-1.5 py-0.5 rounded text-[7px] font-bold uppercase tracking-wider flex-shrink-0"
            style={{ background: s.bg, color: s.text }}
        >
            {s.label}
        </span>
    );
};

// ── Icons for decision kinds ─────────────────────────────────────────────────

function iconForGlobal(label: string): React.ReactNode {
    if (label.includes('Mode')) return <Brain size={11} className="text-purple-400" />;
    if (label.includes('Pacing')) return <Gauge size={11} className="text-cyan-400" />;
    if (label.includes('Transition')) return <ArrowRightLeft size={11} className="text-indigo-400" />;
    if (label.includes('Eye')) return <Eye size={11} className="text-pink-400" />;
    if (label.includes('Sift')) return <Scissors size={11} className="text-purple-400" />;
    if (label.includes('Quality')) return <Sparkles size={11} className="text-amber-400" />;
    if (label.includes('Duration')) return <Clock size={11} className="text-blue-400" />;
    return <Shield size={11} className="text-amber-400" />;
}

// ── Decision row ─────────────────────────────────────────────────────────────

const DecisionRow: React.FC<{
    decision: UnifiedDecision;
    index: number;
    onToggle: (uid: string) => void;
    onUnlockPin: (uid: string) => void;
    onDragStart: (e: React.DragEvent, i: number) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent, i: number) => void;
}> = ({ decision, index, onToggle, onUnlockPin, onDragStart, onDragOver, onDrop }) => {
    const canDrag = !decision.pinned || decision.unlocked;

    return (
        <div
            draggable={canDrag}
            onDragStart={canDrag ? (e) => onDragStart(e, index) : undefined}
            onDragOver={onDragOver}
            onDrop={(e) => onDrop(e, index)}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-md transition-all duration-150 group"
            style={{
                opacity: decision.enabled ? 1 : 0.35,
                background: decision.enabled ? 'rgba(255,255,255,0.015)' : 'transparent',
                border: '1px solid',
                borderColor: decision.pinned && !decision.unlocked
                    ? 'rgba(59,130,246,0.15)'
                    : 'rgba(255,255,255,0.03)',
                cursor: canDrag ? 'grab' : 'default',
            }}
        >
            {/* Drag handle */}
            <div className="flex-shrink-0 w-4 flex items-center justify-center">
                {canDrag ? (
                    <GripVertical size={10} className="text-white/10 group-hover:text-white/30" />
                ) : (
                    <button
                        onClick={() => onUnlockPin(decision.uid)}
                        className="p-0 hover:text-blue-400 transition-colors"
                        title="Unlock to move"
                    >
                        <Lock size={9} className="text-blue-400/40" />
                    </button>
                )}
            </div>

            {/* On/off toggle */}
            <button
                onClick={() => onToggle(decision.uid)}
                className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded transition-colors"
                style={{
                    background: decision.enabled ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.03)',
                }}
                title={decision.enabled ? 'Disable' : 'Enable'}
            >
                <Power
                    size={9}
                    className={decision.enabled ? 'text-emerald-400' : 'text-white/20'}
                />
            </button>

            {/* Icon */}
            <div className="flex-shrink-0 w-5 flex items-center justify-center">
                {decision.icon}
            </div>

            {/* Label + description */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-white/75 truncate">{decision.label}</span>
                    {decision.speed && decision.speed !== 1 && (
                        <span className="text-[7px] font-bold text-amber-400/70 px-1 rounded bg-amber-500/10">
                            {decision.speed}×
                        </span>
                    )}
                    {decision.durationSec != null && (
                        <span className="text-[7px] text-white/25 tabular-nums">{decision.durationSec}s</span>
                    )}
                </div>
                <p className="text-[8px] text-white/30 truncate leading-tight">{decision.description}</p>
            </div>

            {/* Pin unlock indicator */}
            {decision.pinned && decision.unlocked && (
                <Unlock size={8} className="text-blue-400/30 flex-shrink-0" />
            )}

            {/* Source badge */}
            <SourceBadge source={decision.source} />
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════════
// EditPlanPanel — main component
// ═══════════════════════════════════════════════════════════════════════════════

export const EditPlanPanel: React.FC = () => {
    const editPlan = useEditLogicStore((s) => s.editPlan);
    const setEditPlan = useEditLogicStore((s) => s.setEditPlan);
    const planModified = useEditLogicStore((s) => s.planModified);
    const setPlanModified = useEditLogicStore((s) => s.setPlanModified);
    const clips = useClipStore((s) => s.clips);

    // ── Build plan from stores ──
    const plan = useMemo(() => {
        if (clips.length === 0) return null;
        return buildEditPlan(30);
    }, [clips]);

    useEffect(() => {
        if (plan) setEditPlan(plan);
    }, [plan, setEditPlan]);

    const displayPlan = editPlan || plan;

    // ── Decision toggles ──
    const [disabledIds, setDisabledIds] = useState<Set<string>>(new Set());
    const [unlockedPins, setUnlockedPins] = useState<Set<string>>(new Set());
    const [decisionOrder, setDecisionOrder] = useState<string[] | null>(null);

    // ── Build flat decision list ──
    const flatDecisions: UnifiedDecision[] = useMemo(() => {
        if (!displayPlan) return [];

        const list: UnifiedDecision[] = [];

        // 1. Duration decision (always first, pinned)
        list.push({
            uid: 'duration',
            kind: 'global',
            label: 'Target Duration',
            description: `${displayPlan.stats.totalDurationSec}s total · ${displayPlan.stats.totalClips} clips`,
            source: 'baked-in',
            icon: <Clock size={11} className="text-blue-400" />,
            enabled: !disabledIds.has('duration'),
            pinned: true,
            unlocked: unlockedPins.has('duration'),
        });

        // 2. Generator Mode
        const gm = displayPlan.global.generatorMode;
        list.push({
            uid: gm.nodeId,
            kind: 'global',
            label: gm.label,
            description: gm.description,
            source: gm.source,
            icon: iconForGlobal(gm.label),
            enabled: !disabledIds.has(gm.nodeId),
            pinned: false,
            unlocked: false,
        });

        // 3. Baked-in rules
        const rules = [
            displayPlan.global.siftTakes,
            displayPlan.global.pacingStrategy,
            displayPlan.global.transitionDiscipline,
            displayPlan.global.eyeTrace,
        ];
        for (const r of rules) {
            list.push({
                uid: r.nodeId,
                kind: 'global',
                label: r.label,
                description: r.description,
                source: r.source,
                icon: iconForGlobal(r.label),
                enabled: !disabledIds.has(r.nodeId),
                pinned: false,
                unlocked: false,
            });
        }

        // 4. Creator Hacks
        for (const h of displayPlan.global.creatorHacks) {
            list.push({
                uid: h.nodeId,
                kind: 'global',
                label: h.label,
                description: h.description,
                source: h.source,
                icon: <Zap size={11} className="text-cyan-400" />,
                enabled: !disabledIds.has(h.nodeId),
                pinned: false,
                unlocked: false,
            });
        }

        // 5. Editorial Score
        const es = displayPlan.global.editorialScore;
        list.push({
            uid: es.nodeId,
            kind: 'global',
            label: es.label,
            description: es.description,
            source: es.source,
            icon: iconForGlobal(es.label),
            enabled: !disabledIds.has(es.nodeId),
            pinned: false,
            unlocked: false,
        });

        // 6. Per-clip decisions
        for (const c of displayPlan.clips) {
            const allFeats = [...c.features, ...c.audioFeatures];
            list.push({
                uid: c.clipId,
                kind: 'clip',
                label: c.filename,
                description: `${c.selectionReason}${c.transitionType ? ` · ${c.transitionType}` : ''}`,
                source: 'generator-mode',
                icon: <Film size={11} className="text-purple-400/70" />,
                enabled: !disabledIds.has(c.clipId),
                pinned: false,
                unlocked: false,
                features: allFeats,
                filename: c.filename,
                order: c.order,
                durationSec: c.durationSec,
                speed: c.speed,
                transitionType: c.transitionType,
                transitionReason: c.transitionReason,
            });
        }

        // 7. Audio decisions
        if (displayPlan.audio.musicTrack) {
            const mt = displayPlan.audio.musicTrack;
            list.push({
                uid: mt.nodeId,
                kind: 'audio',
                label: mt.label,
                description: mt.description,
                source: mt.source,
                icon: <Music size={11} className="text-cyan-400" />,
                enabled: !disabledIds.has(mt.nodeId),
                pinned: false,
                unlocked: false,
            });
        }
        for (const sfx of displayPlan.audio.sfxPlacements) {
            list.push({
                uid: sfx.nodeId,
                kind: 'audio',
                label: sfx.label,
                description: sfx.description,
                source: sfx.source,
                icon: <Volume2 size={11} className="text-cyan-400/60" />,
                enabled: !disabledIds.has(sfx.nodeId),
                pinned: false,
                unlocked: false,
            });
        }

        return list;
    }, [displayPlan, disabledIds, unlockedPins]);

    // ── Ordered list (respecting user reorder) ──
    const orderedDecisions = useMemo(() => {
        if (!decisionOrder) return flatDecisions;
        const byUid = new Map(flatDecisions.map(d => [d.uid, d]));
        const ordered: UnifiedDecision[] = [];
        for (const uid of decisionOrder) {
            const d = byUid.get(uid);
            if (d) ordered.push(d);
        }
        // Append any new decisions not in the saved order
        for (const d of flatDecisions) {
            if (!decisionOrder.includes(d.uid)) ordered.push(d);
        }
        // Pinned items that aren't unlocked stay at position 0
        const pinned = ordered.filter(d => d.pinned && !d.unlocked);
        const rest = ordered.filter(d => !(d.pinned && !d.unlocked));
        return [...pinned, ...rest];
    }, [flatDecisions, decisionOrder]);

    // ── Handlers ──
    const handleToggle = useCallback((uid: string) => {
        setDisabledIds(prev => {
            const next = new Set(prev);
            if (next.has(uid)) next.delete(uid);
            else next.add(uid);
            return next;
        });
        setPlanModified(true);
    }, [setPlanModified]);

    const handleUnlockPin = useCallback((uid: string) => {
        setUnlockedPins(prev => {
            const next = new Set(prev);
            next.add(uid);
            return next;
        });
    }, []);

    const dragIndex = useRef(-1);

    const onDragStart = useCallback((_e: React.DragEvent, i: number) => {
        dragIndex.current = i;
    }, []);

    const onDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
    }, []);

    const onDrop = useCallback((e: React.DragEvent, dropIndex: number) => {
        e.preventDefault();
        const from = dragIndex.current;
        if (from < 0 || from === dropIndex) { dragIndex.current = -1; return; }

        const currentOrder = orderedDecisions.map(d => d.uid);
        const [moved] = currentOrder.splice(from, 1);
        currentOrder.splice(dropIndex, 0, moved);
        setDecisionOrder(currentOrder);
        setPlanModified(true);
        dragIndex.current = -1;
    }, [orderedDecisions, setPlanModified]);

    const handleRefresh = useCallback(() => {
        const fresh = buildEditPlan(30);
        setEditPlan(fresh);
        setDecisionOrder(null);
        setDisabledIds(new Set());
        setUnlockedPins(new Set());
    }, [setEditPlan]);

    // ── Empty state ──
    if (!displayPlan || orderedDecisions.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12 opacity-50">
                <Brain size={32} className="text-white/20 mb-3" />
                <p className="text-[11px] font-medium text-white/30">No edit plan yet</p>
                <p className="text-[9px] text-white/20 mt-1">Generate an edit to see the decision workflow</p>
            </div>
        );
    }

    const enabledCount = orderedDecisions.filter(d => d.enabled).length;

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.04]">
                <Brain size={13} className="text-indigo-400" />
                <span className="text-[10px] font-black uppercase tracking-[0.1em] text-white/50 flex-1">
                    Edit Plan
                </span>
                {planModified && (
                    <span className="text-[7px] font-bold text-amber-400 px-1.5 py-0.5 rounded bg-amber-500/10 flex items-center gap-1">
                        <AlertTriangle size={7} /> Modified
                    </span>
                )}
                <button
                    onClick={handleRefresh}
                    className="p-1 rounded hover:bg-white/[0.05] transition-colors"
                    title="Reset plan"
                >
                    <RefreshCw size={11} className="text-white/25 hover:text-white/50" />
                </button>
                <span className="text-[7px] text-white/20 tabular-nums">
                    {enabledCount}/{orderedDecisions.length}
                </span>
            </div>

            {/* Flat decision list */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-1.5 py-1.5 space-y-0.5">
                {orderedDecisions.map((d, i) => (
                    <DecisionRow
                        key={d.uid}
                        decision={d}
                        index={i}
                        onToggle={handleToggle}
                        onUnlockPin={handleUnlockPin}
                        onDragStart={onDragStart}
                        onDragOver={onDragOver}
                        onDrop={onDrop}
                    />
                ))}
            </div>
        </div>
    );
};
