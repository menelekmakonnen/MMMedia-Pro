/**
 * CreatorHacksPanel
 * ════════════════════════════════════════════════════════════════════════════
 * Standalone panel for the Creator Hacks feature — universal editing effects
 * derived from 83 social-media editing-tip transcripts. Each hack has:
 *   • On/off toggle
 *   • On-hover preview (CSS-based live preview of what the effect does)
 *   • Inline adjustable parameters (sliders, dropdowns)
 *   • Frequency slider for effects that are applied probabilistically
 *
 * The panel stores state in generatorModeStore under a special "_global" mode
 * key so that hacks persist across mode switches and apply universally.
 */

import React, { useState, useCallback } from 'react';
import * as Icons from 'lucide-react';
import clsx from 'clsx';
import { useGeneratorModeStore } from '../../store/generatorModeStore';

// ─── Icon resolver ───────────────────────────────────────────────────────────

const Icon: React.FC<{ name?: string; size?: number; className?: string }> = ({ name, size = 16, className }) => {
    const Cmp = (name && (Icons as Record<string, unknown>)[name]) as
        | React.ComponentType<{ size?: number; className?: string }>
        | undefined;
    const Fallback = Icons.Sparkles;
    const C = Cmp ?? Fallback;
    return <C size={size} className={className} />;
};

// ─── Hack definition ─────────────────────────────────────────────────────────

interface HackParam {
    key: string;
    label: string;
    min: number;
    max: number;
    step: number;
    default: number;
    unit?: string;
}

interface CreatorHack {
    id: string;
    label: string;
    description: string;
    icon: string;
    category: 'visual' | 'audio' | 'motion';
    /** CSS filter or transform applied to the preview swatch on hover. */
    cssPreview: string;
    /** Default on/off. */
    defaultOn: boolean;
    /** Adjustable parameters. */
    params: HackParam[];
    /** When true, a frequency slider controls how many clips get this. */
    hasFrequency?: boolean;
    defaultFrequency?: number;
}

const CREATOR_HACKS: CreatorHack[] = [
    // ── Visual ──
    {
        id: 'bloom',
        label: 'Light Bloom',
        description: 'Soft dreamy glow on highlights — duplicates layer with blur and screen blend.',
        icon: 'Sparkles',
        category: 'visual',
        cssPreview: 'brightness(1.3) contrast(1.05) saturate(1.1)',
        defaultOn: false,
        params: [
            { key: 'intensity', label: 'Intensity', min: 10, max: 100, step: 5, default: 40, unit: '%' },
            { key: 'radius', label: 'Radius', min: 5, max: 60, step: 1, default: 20, unit: 'px' },
            { key: 'threshold', label: 'Threshold', min: 100, max: 250, step: 5, default: 180 },
        ],
        hasFrequency: true,
        defaultFrequency: 40,
    },
    {
        id: 'blur_bg',
        label: 'Blur Background',
        description: 'Fill letterbox/pillarbox areas with a blurred, scaled copy of the source.',
        icon: 'Layers',
        category: 'visual',
        cssPreview: 'blur(8px) scale(1.4)',
        defaultOn: false,
        params: [
            { key: 'sigma', label: 'Blur Amount', min: 5, max: 40, step: 1, default: 20, unit: 'px' },
            { key: 'opacity', label: 'BG Opacity', min: 30, max: 100, step: 5, default: 80, unit: '%' },
        ],
    },

    // ── Audio ──
    {
        id: 'hard_limiter',
        label: 'Hard Limiter',
        description: 'Brickwall peak limiter — prevents peaking and distortion.',
        icon: 'Gauge',
        category: 'audio',
        cssPreview: 'none',
        defaultOn: true,
        params: [
            { key: 'level', label: 'Ceiling', min: -6, max: 0, step: 0.5, default: -1, unit: 'dB' },
        ],
    },
    {
        id: 'ring_out',
        label: 'Audio Ring-out',
        description: 'Dramatic pitch-dropping trail-off at cut points for cinematic impact.',
        icon: 'Volume1',
        category: 'audio',
        cssPreview: 'none',
        defaultOn: false,
        params: [
            { key: 'duration', label: 'Duration', min: 0.3, max: 2.0, step: 0.1, default: 0.8, unit: 's' },
            { key: 'pitchDrop', label: 'Pitch Drop', min: 0, max: 12, step: 1, default: 3, unit: 'st' },
        ],
        hasFrequency: true,
        defaultFrequency: 25,
    },

    // ── Motion ──
    {
        id: 'smooth_zoom',
        label: 'Smooth Zoom',
        description: 'Motion-blurred zooms via Transform with shutter angle — buttery punch-ins.',
        icon: 'ZoomIn',
        category: 'motion',
        cssPreview: 'scale(1.15)',
        defaultOn: false,
        params: [
            { key: 'shutterAngle', label: 'Shutter', min: 90, max: 360, step: 45, default: 180, unit: '°' },
        ],
        hasFrequency: true,
        defaultFrequency: 50,
    },
    {
        id: 'motion_tween',
        label: 'Motion Tween',
        description: 'Auto-animate position/scale/rotation between clips — smooth spatial transitions.',
        icon: 'Waypoints',
        category: 'motion',
        cssPreview: 'translateX(5px) rotate(1deg)',
        defaultOn: false,
        params: [
            { key: 'durationFrames', label: 'Duration', min: 4, max: 24, step: 2, default: 8, unit: 'f' },
        ],
        hasFrequency: true,
        defaultFrequency: 30,
    },
    {
        id: 'handheld_shake',
        label: 'Handheld Shake',
        description: 'Subtle organic camera movement — makes static tripod footage feel alive.',
        icon: 'Move',
        category: 'motion',
        cssPreview: 'translate(1px, -1px) rotate(0.3deg)',
        defaultOn: false,
        params: [
            { key: 'intensity', label: 'Intensity', min: 5, max: 80, step: 5, default: 35, unit: '%' },
        ],
        hasFrequency: true,
        defaultFrequency: 60,
    },
];

// Store key for global hacks (mode-independent)
const GLOBAL_HACKS_KEY = '_global_hacks';

// ─── Category badge colours ──────────────────────────────────────────────────

const CAT_STYLES: Record<string, { bg: string; text: string; border: string; glow: string }> = {
    visual: { bg: 'bg-purple-500/10', text: 'text-purple-300', border: 'border-purple-500/20', glow: 'shadow-purple-500/10' },
    audio:  { bg: 'bg-cyan-500/10',   text: 'text-cyan-300',   border: 'border-cyan-500/20',   glow: 'shadow-cyan-500/10' },
    motion: { bg: 'bg-amber-500/10',  text: 'text-amber-300',  border: 'border-amber-500/20',  glow: 'shadow-amber-500/10' },
};

// ─── Single hack card ────────────────────────────────────────────────────────

const HackCard: React.FC<{
    hack: CreatorHack;
    enabled: boolean;
    paramValues: Record<string, number>;
    frequency?: number;
    onToggle: () => void;
    onParamChange: (key: string, value: number) => void;
    onFrequencyChange?: (v: number) => void;
}> = ({ hack, enabled, paramValues, frequency, onToggle, onParamChange, onFrequencyChange }) => {
    const [hovered, setHovered] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const cat = CAT_STYLES[hack.category];

    return (
        <div
            className={clsx(
                'relative rounded-xl border transition-all duration-300 overflow-hidden group',
                enabled
                    ? `${cat.border} ${cat.bg} shadow-md ${cat.glow}`
                    : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/10',
            )}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            {/* ── Preview swatch (on hover) ── */}
            {hack.cssPreview !== 'none' && hovered && (
                <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden rounded-xl">
                    <div
                        className="absolute inset-0 transition-all duration-500"
                        style={{
                            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
                            filter: hack.cssPreview,
                            opacity: enabled ? 0.35 : 0.15,
                        }}
                    />
                    {/* Animated shimmer on hover */}
                    <div
                        className="absolute inset-0 animate-pulse"
                        style={{
                            background: `radial-gradient(circle at 30% 40%, ${cat.text.replace('text-', '').replace('-300', '')}/10, transparent 60%)`,
                            opacity: 0.4,
                        }}
                    />
                </div>
            )}

            {/* ── Main row ── */}
            <div className="relative z-10 flex items-start gap-3 p-3">
                {/* Toggle + icon */}
                <button
                    type="button"
                    onClick={onToggle}
                    className="flex-shrink-0 mt-0.5"
                >
                    <span
                        className={clsx(
                            'relative flex items-center justify-center w-9 h-9 rounded-lg transition-all duration-300',
                            enabled
                                ? `${cat.bg} ${cat.border} border`
                                : 'bg-white/[0.04] border border-white/[0.06]',
                        )}
                    >
                        <Icon
                            name={hack.icon}
                            size={16}
                            className={clsx(
                                'transition-colors duration-300',
                                enabled ? cat.text : 'text-white/30',
                            )}
                        />
                        {/* Active indicator dot */}
                        {enabled && (
                            <span className={clsx(
                                'absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full',
                                hack.category === 'visual' ? 'bg-purple-400' :
                                hack.category === 'audio' ? 'bg-cyan-400' : 'bg-amber-400',
                            )} />
                        )}
                    </span>
                </button>

                {/* Text content */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className={clsx(
                            'text-[12px] font-bold transition-colors',
                            enabled ? 'text-white' : 'text-white/70',
                        )}>
                            {hack.label}
                        </span>
                        <span className={clsx(
                            'text-[8px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded-full',
                            cat.bg, cat.text,
                        )}>
                            {hack.category}
                        </span>
                    </div>
                    <p className="text-[10.5px] text-white/40 leading-snug mt-0.5">{hack.description}</p>

                    {/* Expand/collapse for adjustments */}
                    {enabled && hack.params.length > 0 && (
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                            className="flex items-center gap-1 mt-1.5 text-[10px] text-white/40 hover:text-white/70 transition-colors"
                        >
                            <Icon name={expanded ? 'ChevronUp' : 'Settings2'} size={10} />
                            {expanded ? 'Hide adjustments' : `${hack.params.length} adjustable parameter${hack.params.length > 1 ? 's' : ''}`}
                        </button>
                    )}
                </div>

                {/* On/off switch */}
                <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    onClick={onToggle}
                    className="flex-shrink-0 mt-1"
                >
                    <span
                        className={clsx(
                            'relative w-9 h-5 rounded-full transition-colors duration-300 block',
                            enabled ? 'bg-primary' : 'bg-white/15',
                        )}
                    >
                        <span
                            className={clsx(
                                'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-300',
                                enabled && 'translate-x-4',
                            )}
                        />
                    </span>
                </button>
            </div>

            {/* ── Adjustable parameters (expanded) ── */}
            {enabled && expanded && (
                <div className="relative z-10 px-3 pb-3 space-y-2.5 border-t border-white/[0.04] pt-2.5 ml-12">
                    {hack.params.map((p) => (
                        <div key={p.key} className="flex items-center gap-2">
                            <label className="text-[10px] text-white/45 w-16 flex-shrink-0 truncate" title={p.label}>
                                {p.label}
                            </label>
                            <input
                                type="range"
                                min={p.min}
                                max={p.max}
                                step={p.step}
                                value={paramValues[p.key] ?? p.default}
                                onChange={(e) => onParamChange(p.key, Number(e.target.value))}
                                className="flex-1 h-1 accent-primary cursor-pointer"
                            />
                            <span className="text-[10px] text-white/50 w-10 text-right font-mono tabular-nums">
                                {paramValues[p.key] ?? p.default}{p.unit ?? ''}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {/* ── Frequency slider (when applicable and enabled) ── */}
            {enabled && hack.hasFrequency && onFrequencyChange && (
                <div className="relative z-10 px-3 pb-2.5 ml-12">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-white/35 flex-shrink-0">Frequency</span>
                        <input
                            type="range"
                            min={0}
                            max={100}
                            step={5}
                            value={frequency ?? hack.defaultFrequency ?? 50}
                            onChange={(e) => onFrequencyChange(Number(e.target.value))}
                            className="flex-1 h-1 accent-primary cursor-pointer"
                        />
                        <span className="text-[10px] text-white/50 w-8 text-right font-mono tabular-nums">
                            {frequency ?? hack.defaultFrequency ?? 50}%
                        </span>
                    </div>
                    <p className="text-[9px] text-white/25 mt-0.5 ml-0">
                        Applied to {frequency ?? hack.defaultFrequency ?? 50}% of clips
                    </p>
                </div>
            )}
        </div>
    );
};

// ─── Panel ───────────────────────────────────────────────────────────────────

export const CreatorHacksPanel: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
    const setToggle = useGeneratorModeStore((s) => s.setToggle);
    const getToggles = useGeneratorModeStore((s) => s.getToggles);

    // Use the global hacks key for toggle state
    const toggles = getToggles(GLOBAL_HACKS_KEY);

    const handleToggle = useCallback((hackId: string) => {
        const current = toggles[hackId] ?? CREATOR_HACKS.find((h) => h.id === hackId)?.defaultOn ?? false;
        setToggle(GLOBAL_HACKS_KEY, hackId, !current);
    }, [toggles, setToggle]);

    const handleParamChange = useCallback((hackId: string, paramKey: string, value: number) => {
        setToggle(GLOBAL_HACKS_KEY, `${hackId}_p_${paramKey}`, value as unknown as boolean);
    }, [setToggle]);

    const handleFrequencyChange = useCallback((hackId: string, value: number) => {
        setToggle(GLOBAL_HACKS_KEY, `${hackId}_freq`, value as unknown as boolean);
    }, [setToggle]);

    const getParamValues = useCallback((hackId: string): Record<string, number> => {
        const vals: Record<string, number> = {};
        const hack = CREATOR_HACKS.find((h) => h.id === hackId);
        if (!hack) return vals;
        for (const p of hack.params) {
            const stored = toggles[`${hackId}_p_${p.key}`];
            vals[p.key] = typeof stored === 'number' ? stored : (stored as unknown as number) ?? p.default;
        }
        return vals;
    }, [toggles]);

    const activeCount = CREATOR_HACKS.filter((h) => {
        const val = toggles[h.id];
        return val === true || (val === undefined && h.defaultOn);
    }).length;

    const categories = [
        { id: 'visual', label: 'Visual FX', icon: 'Sparkles' },
        { id: 'audio', label: 'Audio FX', icon: 'AudioLines' },
        { id: 'motion', label: 'Motion FX', icon: 'Move3d' },
    ] as const;

    return (
        <div className={clsx(compact ? 'p-2.5' : 'mt-8')}>
            {/* Header */}
            <div className="mb-4">
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20">
                        <Icons.Wand2 size={16} className="text-amber-400" />
                    </div>
                    <div>
                        <h2 className={clsx(compact ? 'text-sm' : 'text-lg', 'font-black text-white')}>
                            Creator Hacks
                        </h2>
                        <p className="text-[11px] text-white/40">
                            {activeCount} active · Auto-applied when generating edits
                        </p>
                    </div>
                </div>
                <p className={clsx('text-[11.5px] text-white/45 mt-2 leading-relaxed', compact && 'text-[10.5px]')}>
                    Effects and techniques from 83 creator tutorials — toggle on, adjust parameters,
                    and they'll be stamped onto clips when you apply any Generator Mode.
                </p>
            </div>

            {/* Category sections */}
            {categories.map((cat) => {
                const hacks = CREATOR_HACKS.filter((h) => h.category === cat.id);
                if (hacks.length === 0) return null;
                const catStyle = CAT_STYLES[cat.id];

                return (
                    <div key={cat.id} className="mb-5">
                        <div className="flex items-center gap-2 mb-2 px-1">
                            <Icon name={cat.icon} size={12} className={catStyle.text} />
                            <span className={clsx('text-[10px] uppercase tracking-wider font-bold', catStyle.text)}>
                                {cat.label}
                            </span>
                            <span className="text-[9px] text-white/20 ml-auto">
                                {hacks.filter((h) => {
                                    const val = toggles[h.id];
                                    return val === true || (val === undefined && h.defaultOn);
                                }).length}/{hacks.length}
                            </span>
                        </div>
                        <div className={clsx('grid gap-2', compact ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2')}>
                            {hacks.map((h) => {
                                const isEnabled = toggles[h.id] === true || (toggles[h.id] === undefined && h.defaultOn);
                                return (
                                    <HackCard
                                        key={h.id}
                                        hack={h}
                                        enabled={isEnabled}
                                        paramValues={getParamValues(h.id)}
                                        frequency={toggles[`${h.id}_freq`] as unknown as number}
                                        onToggle={() => handleToggle(h.id)}
                                        onParamChange={(k, v) => handleParamChange(h.id, k, v)}
                                        onFrequencyChange={
                                            h.hasFrequency
                                                ? (v) => handleFrequencyChange(h.id, v)
                                                : undefined
                                        }
                                    />
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
