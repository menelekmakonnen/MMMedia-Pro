/**
 * GeneratorModePanel
 * ════════════════════════════════════════════════════════════════════════════
 * Shared UI for the Generator Modes feature. Renders the 13 editing-style modes
 * (grouped by family), a detail view for the focused mode, the per-mode toggle
 * SWITCHES, and an Apply button that transforms the live timeline + auto-places
 * SFX via `applyGeneratorMode()`.
 *
 * Used in two places:
 *   • variant="full"    — Edit Generator home (wide, card grid).
 *   • variant="compact" — Sequence page left panel (narrow column).
 */

import React, { useMemo, useState } from 'react';
import * as Icons from 'lucide-react';
import clsx from 'clsx';
import {
    GENERATOR_MODES,
    GENERATOR_MODE_FAMILIES,
    getGeneratorMode,
    type GeneratorMode,
    type ModeToggle,
} from '../../lib/generatorModes';
import { useGeneratorModeStore } from '../../store/generatorModeStore';
import { applyGeneratorMode, applyModeCanvas, type ApplyModeResult } from '../../lib/generatorModeApply';
import { useClipStore } from '../../store/clipStore';
import { useProjectStore } from '../../store/projectStore';

// ─── Icon resolver ───────────────────────────────────────────────────────────

const Icon: React.FC<{ name?: string; size?: number; className?: string }> = ({ name, size = 16, className }) => {
    const Cmp = (name && (Icons as Record<string, unknown>)[name]) as
        | React.ComponentType<{ size?: number; className?: string }>
        | undefined;
    const Fallback = Icons.Sparkles;
    const C = Cmp ?? Fallback;
    return <C size={size} className={className} />;
};

// ─── Toggle switch ───────────────────────────────────────────────────────────

const ModeSwitch: React.FC<{
    toggle: ModeToggle;
    checked: boolean;
    onChange: (v: boolean) => void;
    frequency?: number;
    onFrequencyChange?: (v: number) => void;
}> = ({ toggle, checked, onChange, frequency, onFrequencyChange }) => (
    <div className="w-full">
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={() => onChange(!checked)}
            className="w-full flex items-start gap-3 text-left rounded-lg px-2.5 py-2 hover:bg-white/[0.04] transition-colors group"
        >
            <span
                className={clsx(
                    'mt-0.5 flex-shrink-0 relative w-9 h-5 rounded-full transition-colors',
                    checked ? 'bg-primary' : 'bg-white/15',
                )}
            >
                <span
                    className={clsx(
                        'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
                        checked && 'translate-x-4',
                    )}
                />
            </span>
            <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-[12px] font-semibold text-white/85">
                    {toggle.icon && <Icon name={toggle.icon} size={12} className="text-white/45" />}
                    {toggle.label}
                </span>
                <span className="block text-[10.5px] text-white/40 leading-snug mt-0.5">{toggle.description}</span>
            </span>
        </button>
        {/* Frequency slider — only shown when toggle has frequency control and is on */}
        {toggle.hasFrequency && checked && onFrequencyChange && (
            <div className="flex items-center gap-2 px-3 pb-2 ml-12">
                <span className="text-[10px] text-white/35 flex-shrink-0">Freq</span>
                <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={frequency ?? toggle.defaultFrequency ?? 50}
                    onChange={(e) => onFrequencyChange(Number(e.target.value))}
                    className="flex-1 h-1 accent-primary cursor-pointer"
                    onClick={(e) => e.stopPropagation()}
                />
                <span className="text-[10px] text-white/50 w-8 text-right font-mono">
                    {frequency ?? toggle.defaultFrequency ?? 50}%
                </span>
            </div>
        )}
    </div>
);

// ─── Mode list item ──────────────────────────────────────────────────────────

const ModeListItem: React.FC<{
    mode: GeneratorMode;
    active: boolean;
    onClick: () => void;
    compact?: boolean;
}> = ({ mode, active, onClick, compact }) => (
    <button
        type="button"
        onClick={onClick}
        className={clsx(
            'w-full text-left rounded-xl border transition-colors flex items-start gap-2.5',
            compact ? 'p-2.5' : 'p-3',
            active
                ? 'border-primary/60 bg-primary/[0.08]'
                : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]',
        )}
    >
        <span className={clsx('p-1.5 rounded-lg bg-white/5 flex-shrink-0', mode.accent)}>
            <Icon name={mode.icon} size={compact ? 14 : 16} />
        </span>
        <span className="min-w-0">
            <span className="block text-[12.5px] font-bold text-white truncate">{mode.name}</span>
            {!compact && (
                <span className="block text-[10.5px] text-white/40 leading-snug mt-0.5 line-clamp-2">{mode.summary}</span>
            )}
        </span>
    </button>
);

// ─── Detail view ─────────────────────────────────────────────────────────────

const Pill: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <span className="inline-block text-[10px] text-white/55 bg-white/[0.06] rounded px-1.5 py-0.5">{children}</span>
);

const ModeDetail: React.FC<{ mode: GeneratorMode; compact?: boolean }> = ({ mode, compact }) => {
    const getToggles = useGeneratorModeStore((s) => s.getToggles);
    const setToggle = useGeneratorModeStore((s) => s.setToggle);
    const resetToggles = useGeneratorModeStore((s) => s.resetToggles);
    // Subscribe to the override map so switches re-render on change.
    useGeneratorModeStore((s) => s.toggleState[mode.id]);
    const toggles = getToggles(mode.id);

    const clipCount = useClipStore((s) => s.clips.filter((c) => c.type === 'video' || c.type === 'image').length);
    const [result, setResult] = useState<ApplyModeResult | null>(null);

    // Canvas / sequence preset state (reactive to the project store).
    const projAspect = useProjectStore((s) => s.settings.aspectRatio);
    const projFps = useProjectStore((s) => s.settings.fps);
    const canvasMatches = projAspect === mode.canvas.aspect && projFps === mode.canvas.fps;
    const matchCanvasOnApply = useGeneratorModeStore((s) => s.matchCanvasOnApply);
    const setMatchCanvasOnApply = useGeneratorModeStore((s) => s.setMatchCanvasOnApply);

    const onMatchCanvas = () => {
        applyModeCanvas(mode.id);
    };

    const onApply = () => {
        if (matchCanvasOnApply) applyModeCanvas(mode.id);
        const r = applyGeneratorMode(mode.id);
        setResult(r);
    };

    const pace = mode.pacing.cutsPerMin
        ? `${mode.pacing.cutsPerMin[0]}–${mode.pacing.cutsPerMin[1]} cuts/min`
        : mode.pacing.logic;

    return (
        <div className="flex flex-col gap-3">
            {/* Header */}
            <div>
                <div className="flex items-center gap-2">
                    <span className={clsx('p-1.5 rounded-lg bg-white/5', mode.accent)}>
                        <Icon name={mode.icon} size={16} />
                    </span>
                    <div className="min-w-0">
                        <h3 className="text-sm font-black text-white truncate">{mode.name}</h3>
                        <p className="text-[10px] uppercase tracking-wider text-white/35">{mode.family}</p>
                    </div>
                </div>
                <p className="text-[11.5px] text-white/55 leading-relaxed mt-2">{mode.summary}</p>
            </div>

            {/* Facts */}
            <div className="flex flex-wrap gap-1.5">
                <Pill>{mode.canvas.aspect}</Pill>
                <Pill>{mode.canvas.resolution}</Pill>
                <Pill>{mode.canvas.fps} fps</Pill>
                <Pill>{pace}</Pill>
            </div>

            {/* Canvas — one-click sequence preset */}
            <button
                type="button"
                onClick={onMatchCanvas}
                disabled={canvasMatches}
                className={clsx(
                    'w-full flex items-center justify-between rounded-lg border px-2.5 py-2 transition-colors',
                    canvasMatches
                        ? 'border-emerald-500/30 bg-emerald-500/[0.06] cursor-default'
                        : 'border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.05]',
                )}
                title={`Set the sequence to ${mode.canvas.aspect} · ${mode.canvas.fps} fps`}
            >
                <span className="flex items-center gap-2 min-w-0">
                    <Icon name={canvasMatches ? 'Check' : 'Frame'} size={13} className={canvasMatches ? 'text-emerald-400' : 'text-white/45'} />
                    <span className="text-[11.5px] font-semibold text-white/80 truncate">
                        {canvasMatches ? 'Sequence canvas matches' : `Match canvas → ${mode.canvas.aspect} · ${mode.canvas.fps} fps`}
                    </span>
                </span>
                {!canvasMatches && (
                    <span className="text-[10px] text-white/35 flex-shrink-0">now {projAspect} · {projFps}fps</span>
                )}
            </button>

            {/* Transitions */}
            <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-2.5">
                <p className="text-[10px] uppercase tracking-wider text-white/35 mb-1">Transitions (no hard cuts)</p>
                <p className="text-[11.5px] text-white/75 font-semibold">{mode.transitions.default}</p>
                <p className="text-[10.5px] text-white/45 leading-snug mt-1">{mode.transitions.notes}</p>
            </div>

            {/* Toggles */}
            <div>
                <div className="flex items-center justify-between mb-1 px-1">
                    <p className="text-[10px] uppercase tracking-wider text-white/35">Mode Switches</p>
                    <button
                        type="button"
                        onClick={() => resetToggles(mode.id)}
                        className="text-[10px] text-white/35 hover:text-white/70 transition-colors"
                    >
                        Reset
                    </button>
                </div>
                <div className={clsx('grid gap-0.5', compact ? 'grid-cols-1' : 'grid-cols-2')}>
                    {mode.toggles.map((t, i) => {
                        const HACK_IDS = ['bloom', 'blur_bg', 'ring_out', 'hard_limiter', 'smooth_zoom', 'motion_tween', 'handheld_shake'];
                        const isFirstHack = HACK_IDS.includes(t.id) && (i === 0 || !HACK_IDS.includes(mode.toggles[i - 1]?.id));
                        return (
                            <React.Fragment key={t.id}>
                                {isFirstHack && (
                                    <div className={clsx('py-1.5 px-1', compact ? 'col-span-1' : 'col-span-2')}>
                                        <p className="text-[9.5px] uppercase tracking-wider text-amber-400/50 font-bold">✦ Creator Hacks</p>
                                    </div>
                                )}
                                <ModeSwitch
                                    toggle={t}
                                    checked={toggles[t.id] !== false}
                                    onChange={(v) => setToggle(mode.id, t.id, v)}
                                    frequency={toggles[`${t.id}_freq`] as unknown as number}
                                    onFrequencyChange={
                                        t.hasFrequency
                                            ? (v: number) => setToggle(mode.id, `${t.id}_freq`, v as unknown as boolean)
                                            : undefined
                                    }
                                />
                            </React.Fragment>
                        );
                    })}
                </div>
            </div>

            {/* Derived-from credit */}
            <p className="text-[10px] text-white/30 leading-snug px-1">
                Derived from: {mode.derivedFrom.join(', ')}
            </p>

            {/* Apply */}
            <div className="flex flex-col gap-1.5">
                <button
                    type="button"
                    onClick={() => setMatchCanvasOnApply(!matchCanvasOnApply)}
                    role="switch"
                    aria-checked={matchCanvasOnApply}
                    className="flex items-center gap-2 self-start text-[11px] text-white/55 hover:text-white/80 transition-colors px-1"
                >
                    <span className={clsx('relative w-7 h-4 rounded-full transition-colors', matchCanvasOnApply ? 'bg-primary' : 'bg-white/15')}>
                        <span className={clsx('absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform', matchCanvasOnApply && 'translate-x-3')} />
                    </span>
                    Also set sequence canvas on apply
                </button>
                <button
                    type="button"
                    onClick={onApply}
                    disabled={clipCount === 0}
                    className={clsx(
                        'w-full rounded-xl py-2.5 text-[12.5px] font-bold transition-colors flex items-center justify-center gap-2',
                        clipCount === 0
                            ? 'bg-white/[0.04] text-white/25 cursor-not-allowed'
                            : 'bg-primary text-white hover:bg-primary/90',
                    )}
                >
                    <Icon name="Wand2" size={14} />
                    {clipCount === 0 ? 'Add clips to the timeline first' : `Apply to ${clipCount} clip${clipCount === 1 ? '' : 's'}`}
                </button>
                {result && (
                    <div className="text-[11px] text-center text-white/55">
                        Applied <span className="text-white/80 font-semibold">{result.modeName}</span> · {result.clipsAffected} clip
                        {result.clipsAffected === 1 ? '' : 's'} styled
                        {result.sfxPlaced > 0 && <> · {result.sfxPlaced} SFX placed</>}
                        {result.sfxLibraryEmpty && <span className="block text-amber-300/80 mt-0.5">No SFX in library — add a folder in the SFX Browser to enable sound.</span>}
                    </div>
                )}
            </div>
        </div>
    );
};

// ─── Panel ───────────────────────────────────────────────────────────────────

export interface GeneratorModePanelProps {
    variant?: 'full' | 'compact';
}

export const GeneratorModePanel: React.FC<GeneratorModePanelProps> = ({ variant = 'full' }) => {
    const compact = variant === 'compact';
    const selectedModeId = useGeneratorModeStore((s) => s.selectedModeId);
    const setSelectedMode = useGeneratorModeStore((s) => s.setSelectedMode);

    const selected = useMemo(() => getGeneratorMode(selectedModeId ?? '') ?? null, [selectedModeId]);

    const grouped = useMemo(
        () =>
            GENERATOR_MODE_FAMILIES.map((family) => ({
                family,
                modes: GENERATOR_MODES.filter((m) => m.family === family),
            })).filter((g) => g.modes.length > 0),
        [],
    );

    const list = (
        <div className={clsx('flex flex-col gap-3', compact && 'p-2.5')}>
            {grouped.map((g) => (
                <div key={g.family}>
                    <p className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5 px-1">{g.family}</p>
                    <div className={clsx('grid gap-1.5', compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2')}>
                        {g.modes.map((m) => (
                            <ModeListItem
                                key={m.id}
                                mode={m}
                                active={m.id === selectedModeId}
                                onClick={() => setSelectedMode(m.id)}
                                compact={compact}
                            />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );

    // ── Compact (sequence sidebar): list on top, detail below, single column ──
    if (compact) {
        return (
            <div className="h-full overflow-y-auto">
                <div className="p-2.5 border-b border-white/[0.06]">
                    <h2 className="text-[12px] font-black text-white">Generator Modes</h2>
                    <p className="text-[10px] text-white/40 mt-0.5">Style the live timeline + auto-SFX.</p>
                </div>
                {selected ? (
                    <div className="p-2.5">
                        <button
                            type="button"
                            onClick={() => setSelectedMode(null)}
                            className="flex items-center gap-1 text-[11px] text-white/45 hover:text-white/80 mb-2.5"
                        >
                            <Icon name="ChevronLeft" size={13} /> All modes
                        </button>
                        <ModeDetail mode={selected} compact />
                    </div>
                ) : (
                    list
                )}
            </div>
        );
    }

    // ── Full (Edit Generator home): two columns ──
    return (
        <div className="mt-8">
            <div className="mb-4">
                <h2 className="text-lg font-black text-white">Generator Modes</h2>
                <p className="text-[12px] text-white/45 mt-0.5">
                    Style templates built from your real edits. Pick a mode, flip the switches, and apply it over the live
                    timeline — fitting transitions and SFX included.
                </p>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5">
                <div>{list}</div>
                <div className="rounded-2xl bg-white/[0.02] border border-white/10 p-4 h-fit lg:sticky lg:top-4">
                    {selected ? (
                        <ModeDetail mode={selected} />
                    ) : (
                        <div className="text-center py-10">
                            <Icon name="Wand2" size={22} className="mx-auto text-white/20" />
                            <p className="text-[12px] text-white/40 mt-2">Select a mode to see its switches and apply it.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
