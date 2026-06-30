import React, { useState, useMemo, useCallback } from 'react';
import {
    X,
    Sparkles,
    Star,
    Eye,
    Shapes,
    ArrowLeftRight,
    Zap,
    Type,
    Move,
    Check,
    AlertCircle,
} from 'lucide-react';
import {
    type GraphicType,
    validateSPG,
    generateSPGHook,
    graphicTypeDescription,
    detectPowerWords,
    suggestPowerWords,
} from '../../lib/visualHook';
import type { TextOverlay, TextPosition } from '../../lib/textOverlay';

// ══════════════════════════════════════════════════════════════════════════════
// VisualHookPanel — SPG (Summarize → Power Word → Graphic) Visual Hook Builder
//
// A creative panel for constructing short, attention-grabbing text overlays
// following the SPG framework used in social video editing.
// ══════════════════════════════════════════════════════════════════════════════

interface VisualHookPanelProps {
    onApplyHook: (overlay: TextOverlay) => void;
    onClose?: () => void;
}

// ── Graphic type card metadata ───────────────────────────────────────────────

const GRAPHIC_ICONS: Record<GraphicType, React.FC<{ size?: number; className?: string }>> = {
    'borrowed-interest': Star,
    'value-preview': Eye,
    'symbolic': Shapes,
    'transformation': ArrowLeftRight,
};

const GRAPHIC_LABELS: Record<GraphicType, string> = {
    'borrowed-interest': 'Borrowed Interest',
    'value-preview': 'Value Preview',
    'symbolic': 'Symbolic',
    'transformation': 'Transformation',
};

const ALL_GRAPHIC_TYPES: GraphicType[] = [
    'borrowed-interest',
    'value-preview',
    'symbolic',
    'transformation',
];

// ── Position presets ─────────────────────────────────────────────────────────

const POSITION_OPTIONS: { value: TextPosition; label: string }[] = [
    { value: 'top-center', label: 'Top' },
    { value: 'center', label: 'Center' },
    { value: 'bottom-center', label: 'Bottom' },
];

// ── Power Word Tag ───────────────────────────────────────────────────────────

const PowerWordTag: React.FC<{
    word: string;
    detected?: boolean;
    onClick?: () => void;
}> = ({ word, detected, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        disabled={detected}
        className={`
            inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium
            transition-all duration-200
            ${detected
                ? 'bg-amber-500/25 text-amber-300 border border-amber-400/30 shadow-[0_0_8px_rgba(245,158,11,0.25)] cursor-default'
                : 'bg-white/5 text-white/40 border border-white/8 hover:bg-amber-500/15 hover:text-amber-300 hover:border-amber-400/20 cursor-pointer'
            }
        `}
    >
        {detected && <Zap size={9} className="text-amber-400" />}
        {word}
    </button>
);

// ── Graphic Type Card ────────────────────────────────────────────────────────

const GraphicCard: React.FC<{
    type: GraphicType;
    selected: boolean;
    onSelect: () => void;
}> = ({ type, selected, onSelect }) => {
    const Icon = GRAPHIC_ICONS[type];
    const label = GRAPHIC_LABELS[type];
    const info = graphicTypeDescription(type);

    return (
        <button
            type="button"
            onClick={onSelect}
            className={`
                relative flex flex-col items-center gap-1.5 p-3 rounded-xl
                border transition-all duration-300 text-center
                ${selected
                    ? 'bg-amber-500/10 border-amber-400/40 shadow-[0_0_16px_rgba(245,158,11,0.15)]'
                    : 'bg-white/[0.02] border-white/8 hover:bg-white/5 hover:border-white/15'
                }
            `}
        >
            <Icon
                size={20}
                className={`transition-colors duration-200 ${selected ? 'text-amber-400' : 'text-white/40'}`}
            />
            <span className={`text-xs font-medium ${selected ? 'text-amber-300' : 'text-white/70'}`}>
                {label}
            </span>
            <span className="text-[10px] text-white/35 leading-tight line-clamp-2">
                {info.description}
            </span>
            {selected && (
                <span className="absolute top-1.5 right-1.5">
                    <Check size={10} className="text-amber-400" />
                </span>
            )}
        </button>
    );
};

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════

export const VisualHookPanel: React.FC<VisualHookPanelProps> = ({ onApplyHook, onClose }) => {
    // ── State ────────────────────────────────────────────────────────────────
    const [hookText, setHookText] = useState('');
    const [graphicType, setGraphicType] = useState<GraphicType>('borrowed-interest');
    const [fontSize, setFontSize] = useState(56);
    const [position, setPosition] = useState<TextPosition>('center');

    // ── Derived data ─────────────────────────────────────────────────────────

    const wordCount = useMemo(() => {
        const trimmed = hookText.trim();
        if (trimmed.length === 0) return 0;
        return trimmed.split(/\s+/).length;
    }, [hookText]);

    const isWordCountValid = wordCount >= 3 && wordCount <= 7;

    const validation = useMemo(() => validateSPG(hookText), [hookText]);

    /** Power words detected in the current text */
    const detectedPowerWords = useMemo(() => {
        if (!hookText.trim()) return [];
        return detectPowerWords(hookText);
    }, [hookText]);

    /** Suggestions when no power word is present */
    const suggestions = useMemo(() => {
        if (detectedPowerWords.length > 0) return [];
        return suggestPowerWords(hookText);
    }, [hookText, detectedPowerWords]);

    const canApply = validation.valid && hookText.trim().length > 0;

    // ── Handlers ─────────────────────────────────────────────────────────────

    const handleInsertSuggestion = useCallback(
        (word: string) => {
            setHookText((prev) => {
                const trimmed = prev.trim();
                return trimmed ? `${trimmed} ${word}` : word;
            });
        },
        []
    );

    const handleApply = useCallback(() => {
        if (!canApply) return;

        const result = generateSPGHook({
            text: hookText.trim(),
            graphicType,
            fontSize,
            position,
        });

        const overlay: TextOverlay = {
            id: `hook-${Date.now()}`,
            text: result.overlay?.text ?? hookText.trim(),
            fontFamily: 'Impact',
            fontSize,
            fontColor: '#FFFFFF',
            fontWeight: 'bold',
            borderColor: '#000000',
            borderWidth: 2,
            position,
            offsetX: 0,
            offsetY: 0,
            startTime: 0,
            endTime: 3,
            animation: 'fade',
            animationDuration: 0.4,
            opacity: 1.0,
            shadow: true,
        };

        onApplyHook(overlay);
    }, [canApply, hookText, graphicType, fontSize, position, onApplyHook]);

    // ── Render ───────────────────────────────────────────────────────────────

    return (
        <div className="bg-[#0a0a0f]/95 backdrop-blur-xl border border-white/10 rounded-2xl
                        shadow-2xl shadow-black/40 overflow-hidden w-full max-w-md">

            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/8">
                <div className="flex items-center gap-2.5">
                    <Sparkles size={16} className="text-amber-400" />
                    <h3 className="text-sm font-semibold text-white/90 tracking-tight">
                        Visual Hook Builder
                    </h3>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20
                                     text-amber-400 border border-amber-500/25 uppercase tracking-widest">
                        SPG
                    </span>
                </div>
                {onClose && (
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg hover:bg-white/8 transition-colors"
                        title="Close panel"
                    >
                        <X size={14} className="text-white/40" />
                    </button>
                )}
            </div>

            <div className="p-5 space-y-5">
                {/* ── S — Summarize (Text Input) ──────────────────────────── */}
                <section className="space-y-2">
                    <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-white/50 uppercase tracking-wider flex items-center gap-1.5">
                            <Type size={11} className="text-amber-400/70" />
                            Summarize
                        </label>
                        <span
                            className={`
                                text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums
                                transition-colors duration-200
                                ${isWordCountValid
                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/25'
                                    : wordCount === 0
                                        ? 'bg-white/8 text-white/30 border border-white/10'
                                        : 'bg-red-500/20 text-red-400 border border-red-500/25'
                                }
                            `}
                        >
                            {wordCount}/7 words
                        </span>
                    </div>

                    <textarea
                        value={hookText}
                        onChange={(e) => setHookText(e.target.value)}
                        placeholder="Enter your hook text (3-7 words)"
                        rows={2}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5
                                   text-sm text-white/90 placeholder-white/20 resize-none
                                   focus:outline-none focus:border-amber-500/40 focus:ring-1 focus:ring-amber-500/20
                                   transition-all duration-200"
                    />

                    {/* Validation feedback */}
                    {hookText.trim().length > 0 && !validation.valid && (
                        <div className="flex items-start gap-1.5 text-[11px] text-red-400/80">
                            <AlertCircle size={12} className="mt-0.5 shrink-0" />
                            <span>{validation.issues?.join(' · ') ?? 'Invalid hook text'}</span>
                        </div>
                    )}
                    {hookText.trim().length > 0 && validation.valid && (
                        <div className="flex items-center gap-1.5 text-[11px] text-emerald-400/80">
                            <Check size={12} />
                            <span>Hook text looks great!</span>
                        </div>
                    )}
                </section>

                {/* ── P — Power Word Indicator ────────────────────────────── */}
                <section className="space-y-2">
                    <label className="text-xs font-semibold text-white/50 uppercase tracking-wider flex items-center gap-1.5">
                        <Zap size={11} className="text-amber-400/70" />
                        Power Words
                    </label>

                    {detectedPowerWords.length > 0 ? (
                        <div className="space-y-1.5">
                            <p className="text-[11px] text-emerald-400/70">
                                Detected in your text:
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                                {detectedPowerWords.map((w: string) => (
                                    <PowerWordTag key={w} word={w} detected />
                                ))}
                            </div>
                        </div>
                    ) : hookText.trim().length > 0 && suggestions.length > 0 ? (
                        <div className="space-y-1.5">
                            <p className="text-[11px] text-amber-400/60">
                                No power word detected — try adding one:
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                                {suggestions.slice(0, 8).map((w) => (
                                    <PowerWordTag
                                        key={w}
                                        word={w}
                                        onClick={() => handleInsertSuggestion(w)}
                                    />
                                ))}
                            </div>
                        </div>
                    ) : (
                        <p className="text-[11px] text-white/25 italic">
                            Type your hook text above to detect power words
                        </p>
                    )}
                </section>

                {/* ── G — Graphic Type Selector ───────────────────────────── */}
                <section className="space-y-2">
                    <label className="text-xs font-semibold text-white/50 uppercase tracking-wider flex items-center gap-1.5">
                        <Shapes size={11} className="text-amber-400/70" />
                        Graphic Type
                    </label>

                    <div className="grid grid-cols-2 gap-2">
                        {ALL_GRAPHIC_TYPES.map((type) => (
                            <GraphicCard
                                key={type}
                                type={type}
                                selected={graphicType === type}
                                onSelect={() => setGraphicType(type)}
                            />
                        ))}
                    </div>
                </section>

                {/* ── Preview Area ────────────────────────────────────────── */}
                <section className="space-y-2">
                    <label className="text-xs font-semibold text-white/50 uppercase tracking-wider">
                        Preview
                    </label>

                    {/* Simulated dark video frame */}
                    <div className="relative w-full aspect-video bg-gradient-to-br from-zinc-900 via-zinc-950 to-black
                                    rounded-xl border border-white/8 overflow-hidden flex items-center justify-center">
                        {/* Subtle grid pattern overlay */}
                        <div className="absolute inset-0 opacity-[0.03]"
                             style={{
                                 backgroundImage:
                                     'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)',
                                 backgroundSize: '20px 20px',
                             }}
                        />

                        {/* Hook text preview */}
                        <div
                            className={`
                                absolute px-4 w-full text-center transition-all duration-300
                                ${position === 'top-center' ? 'top-4' : ''}
                                ${position === 'center' ? 'top-1/2 -translate-y-1/2' : ''}
                                ${position === 'bottom-center' ? 'bottom-4' : ''}
                            `}
                        >
                            <span
                                className="font-['Impact',_sans-serif] text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]
                                           transition-all duration-300 leading-tight"
                                style={{ fontSize: `${Math.round(fontSize * 0.35)}px` }}
                            >
                                {hookText.trim() || 'Your Hook Text'}
                            </span>
                        </div>

                        {/* Frame label */}
                        <span className="absolute bottom-1.5 right-2 text-[9px] text-white/15 font-mono">
                            16:9 preview
                        </span>
                    </div>

                    {/* Font size + Position controls */}
                    <div className="grid grid-cols-2 gap-3">
                        {/* Font size slider */}
                        <div className="space-y-1">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] text-white/40">Size</span>
                                <span className="text-[10px] text-white/30 tabular-nums">{fontSize}px</span>
                            </div>
                            <input
                                type="range"
                                min={24}
                                max={96}
                                step={2}
                                value={fontSize}
                                onChange={(e) => setFontSize(Number(e.target.value))}
                                className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-amber-500"
                            />
                        </div>

                        {/* Position selector */}
                        <div className="space-y-1">
                            <div className="flex items-center gap-1">
                                <Move size={9} className="text-white/30" />
                                <span className="text-[10px] text-white/40">Position</span>
                            </div>
                            <div className="flex gap-1">
                                {POSITION_OPTIONS.map((opt) => (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => setPosition(opt.value)}
                                        className={`
                                            flex-1 text-[10px] py-1 rounded-md border transition-all duration-200
                                            ${position === opt.value
                                                ? 'bg-amber-500/15 border-amber-400/30 text-amber-300'
                                                : 'bg-white/[0.03] border-white/8 text-white/35 hover:text-white/50 hover:border-white/15'
                                            }
                                        `}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── Action Buttons ──────────────────────────────────────── */}
                <div className="pt-1">
                    <button
                        type="button"
                        onClick={handleApply}
                        disabled={!canApply}
                        className={`
                            w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl
                            text-sm font-semibold transition-all duration-300
                            ${canApply
                                ? 'bg-gradient-to-r from-amber-500/80 to-orange-500/80 text-white hover:from-amber-500 hover:to-orange-500 shadow-lg shadow-amber-500/20 active:scale-[0.98]'
                                : 'bg-white/5 text-white/20 border border-white/8 cursor-not-allowed'
                            }
                        `}
                    >
                        <Sparkles size={14} />
                        Apply to First Clip
                    </button>
                </div>
            </div>
        </div>
    );
};
