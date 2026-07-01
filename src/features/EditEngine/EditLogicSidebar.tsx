import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useEditLogicStore } from '../../store/editLogicStore';
import type { ClipDecision } from '../../types/ClipDecision';
import { Film, GripVertical, X, ChevronRight, ChevronLeft, Zap, Sparkles, Clock, ArrowRightLeft } from 'lucide-react';
import clsx from 'clsx';
import { EditPlanPanel } from './EditPlanPanel';

// ═══════════════════════════════════════════════════════════════════════════════
// EditLogicSidebar — real-time edit decision panel (premium UI)
// ═══════════════════════════════════════════════════════════════════════════════

interface EditLogicSidebarProps {
    mode: 'settings' | 'player' | 'final';
}

// ── Transition badge accent colors (soft, refined) ───────────────────────────
const TX_ACCENT: Record<string, string> = {
    fade: '168,85,247',       // purple
    'fade-black': '99,102,241',
    'fade-white': '167,139,250',
    'zoom-in': '245,158,11',  // amber
    'zoom-out': '245,158,11',
    'zoom-through': '245,158,11',
    wipe: '6,182,212',        // cyan
    slide: '6,182,212',
    flash: '239,68,68',       // red
    glitch: '236,72,153',     // pink
    spin: '16,185,129',       // emerald
};

function getTxRgb(type: string | null): string {
    if (!type) return '255,255,255';
    return TX_ACCENT[type] || '139,92,246';
}

// ── Effect label mapping ─────────────────────────────────────────────────────
function fxLabel(effect: string): string {
    const m: Record<string, string> = {
        grain: 'Grain', vignette: 'Vig', letterbox: 'LB',
        chromatic: 'Chroma', 'motion-blur': 'M-Blur', glow: 'Glow',
        'double-exposure': '2×', 'triple-exposure': '3×',
        flash: 'Flash', 'rgb-split': 'RGB', 'hue-cycle': 'Hue',
        vhs: 'VHS', shake: 'Shake', boomerang: 'Boom', blur: 'Blur',
        'color-grade': 'Grade',
    };
    if (effect.startsWith('speed:')) return `⚡${effect.slice(6)}`;
    return m[effect] || effect;
}

// ── Clip Thumbnail (lazy video seek) ─────────────────────────────────────────
const ClipThumbnail: React.FC<{ path: string; seekTime: number; isActive: boolean }> = React.memo(
    ({ path, seekTime, isActive }) => {
        const videoRef = useRef<HTMLVideoElement>(null);
        const [loaded, setLoaded] = useState(false);

        useEffect(() => {
            const el = videoRef.current;
            if (!el) return;
            el.currentTime = seekTime;
            const onSeek = () => setLoaded(true);
            el.addEventListener('seeked', onSeek, { once: true });
            return () => el.removeEventListener('seeked', onSeek);
        }, [seekTime]);

        return (
            <div
                className="relative flex-shrink-0 rounded-md overflow-hidden transition-all duration-300"
                style={{
                    width: isActive ? 44 : 36,
                    height: isActive ? 44 : 36,
                    boxShadow: isActive
                        ? '0 0 16px rgba(139,92,246,0.25), 0 0 4px rgba(139,92,246,0.4)'
                        : 'none',
                }}
            >
                <video
                    ref={videoRef}
                    src={path}
                    className={clsx(
                        'w-full h-full object-cover transition-opacity duration-300',
                        loaded ? 'opacity-100' : 'opacity-0',
                    )}
                    muted
                    preload="metadata"
                />
                {!loaded && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/[0.02]">
                        <Film size={12} className="text-white/15" />
                    </div>
                )}
            </div>
        );
    },
);

// ── Decision Card ────────────────────────────────────────────────────────────
interface DecisionCardProps {
    decision: ClipDecision;
    index: number;
    isActive: boolean;
    interactive: boolean;
    onRemove?: (index: number) => void;
    onDragStart?: (index: number) => void;
    onDragOver?: (index: number) => void;
    onDragEnd?: () => void;
}

const DecisionCard: React.FC<DecisionCardProps> = React.memo(({
    decision, index, isActive, interactive,
    onRemove, onDragStart, onDragOver, onDragEnd,
}) => {
    const { sourceFilename, durationSec, transitionType, effects, speed } = decision;
    const name = sourceFilename.length > 20 ? sourceFilename.slice(0, 18) + '…' : sourceFilename;

    return (
        <div
            className={clsx(
                'group relative flex items-center gap-2.5 rounded-lg transition-all duration-300 ease-out',
                isActive
                    ? 'py-2.5 px-3 scale-[1.02]'
                    : 'py-1.5 px-2.5 hover:bg-white/[0.02]',
            )}
            style={isActive ? {
                background: 'linear-gradient(135deg, rgba(139,92,246,0.08) 0%, rgba(59,130,246,0.05) 100%)',
                boxShadow: '0 0 24px rgba(139,92,246,0.08), inset 0 0 0 1px rgba(139,92,246,0.12)',
            } : undefined}
            draggable={interactive}
            onDragStart={() => onDragStart?.(index)}
            onDragOver={(e) => { e.preventDefault(); onDragOver?.(index); }}
            onDragEnd={onDragEnd}
        >
            {/* Drag handle */}
            {interactive && (
                <div className="cursor-grab active:cursor-grabbing text-white/10 hover:text-white/30 transition-colors flex-shrink-0">
                    <GripVertical size={10} />
                </div>
            )}

            {/* Thumbnail */}
            <ClipThumbnail path={decision.sourcePath} seekTime={decision.trimRange[0]} isActive={isActive} />

            {/* Info stack */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                    <span className={clsx(
                        'text-[11px] font-semibold truncate transition-colors duration-200',
                        isActive ? 'text-white/90' : 'text-white/50',
                    )}>
                        {name}
                    </span>
                    {speed !== 1 && (
                        <span className="text-[8px] font-mono px-1 py-px rounded-sm bg-amber-400/10 text-amber-300/70">
                            {speed}×
                        </span>
                    )}
                </div>

                {/* Meta row */}
                <div className="flex items-center gap-2 mt-0.5">
                    <span className={clsx(
                        'text-[9px] font-mono flex items-center gap-0.5 transition-colors duration-200',
                        isActive ? 'text-white/40' : 'text-white/20',
                    )}>
                        <Clock size={7} />
                        {durationSec.toFixed(1)}s
                    </span>
                    {transitionType && (
                        <span
                            className="text-[7px] font-bold uppercase tracking-[0.08em] px-1.5 py-px rounded-sm"
                            style={{
                                background: `rgba(${getTxRgb(transitionType)},0.08)`,
                                color: `rgba(${getTxRgb(transitionType)},0.7)`,
                            }}
                        >
                            {transitionType}
                        </span>
                    )}
                </div>

                {/* Effects */}
                {effects.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                        {effects.slice(0, 3).map((fx) => (
                            <span key={fx} className={clsx(
                                'text-[7px] font-medium px-1 py-px rounded-sm transition-colors duration-200',
                                isActive ? 'bg-white/[0.06] text-white/35' : 'bg-white/[0.03] text-white/20',
                            )}>
                                {fxLabel(fx)}
                            </span>
                        ))}
                        {effects.length > 3 && (
                            <span className="text-[7px] text-white/15">+{effects.length - 3}</span>
                        )}
                    </div>
                )}
            </div>

            {/* Order index */}
            <span className={clsx(
                'text-[8px] font-mono flex-shrink-0 w-4 text-right transition-colors duration-200',
                isActive ? 'text-purple-400/40' : 'text-white/8',
            )}>
                {index + 1}
            </span>

            {/* Remove button */}
            {interactive && (
                <button
                    onClick={(e) => { e.stopPropagation(); onRemove?.(index); }}
                    className="absolute -right-0.5 -top-0.5 w-3.5 h-3.5 rounded-full bg-red-500/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 hover:scale-110"
                >
                    <X size={7} />
                </button>
            )}
        </div>
    );
});

// ── Transition Connector ─────────────────────────────────────────────────────
const TransitionConnector: React.FC<{
    type: string | null; durationMs: number; isActive: boolean;
}> = React.memo(({ type, durationMs, isActive }) => {
    if (!type) return (
        <div className="flex items-center justify-center h-2.5 px-6">
            <div className="w-px h-full bg-white/[0.04]" />
        </div>
    );

    const rgb = getTxRgb(type);
    return (
        <div className={clsx(
            'flex items-center justify-center gap-1.5 h-4 px-3 transition-all duration-300',
            isActive && 'opacity-100' ,
            !isActive && 'opacity-40',
        )}>
            <div className="flex-1 h-px" style={{ background: `rgba(${rgb},0.12)` }} />
            <ArrowRightLeft size={7} style={{ color: `rgba(${rgb},0.5)` }} />
            <span className="text-[6px] font-bold uppercase tracking-[0.12em]"
                style={{ color: `rgba(${rgb},0.5)` }}>
                {type}
            </span>
            <span className="text-[6px] font-mono text-white/15">{durationMs}ms</span>
            <div className="flex-1 h-px" style={{ background: `rgba(${rgb},0.12)` }} />
        </div>
    );
});

// ═══════════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════════

export const EditLogicSidebar: React.FC<EditLogicSidebarProps> = React.memo(({ mode }) => {
    const decisions = useEditLogicStore((s) => s.decisions);
    const activeClipIndex = useEditLogicStore((s) => s.activeClipIndex);
    const sidebarVisible = useEditLogicStore((s) => s.sidebarVisible);
    const isGenerating = useEditLogicStore((s) => s.isGeneratingPreview);
    const reorderDecision = useEditLogicStore((s) => s.reorderDecision);
    const removeDecision = useEditLogicStore((s) => s.removeDecision);
    const toggleSidebar = useEditLogicStore((s) => s.toggleSidebar);

    const scrollRef = useRef<HTMLDivElement>(null);
    const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
    const dragFromRef = useRef<number>(-1);
    const interactive = mode === 'settings';
    const isOverlay = mode === 'player' || mode === 'final';

    // Auto-scroll to center the active clip
    useEffect(() => {
        if (activeClipIndex < 0 || !scrollRef.current) return;
        const el = cardRefs.current[activeClipIndex];
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [activeClipIndex]);

    const handleDragStart = useCallback((i: number) => { dragFromRef.current = i; }, []);
    const handleDragOver = useCallback((i: number) => {
        if (dragFromRef.current === -1 || dragFromRef.current === i) return;
        reorderDecision(dragFromRef.current, i);
        dragFromRef.current = i;
    }, [reorderDecision]);
    const handleDragEnd = useCallback(() => { dragFromRef.current = -1; }, []);

    const totalDuration = decisions.reduce((sum, d) => sum + d.durationSec, 0);
    const fxCount = decisions.filter(d => d.effects.length > 0).length;
    const txCount = decisions.filter(d => d.transitionType).length;

    // ── Collapsed ──
    if (!sidebarVisible) {
        return (
            <button
                onClick={toggleSidebar}
                className={clsx(
                    'flex items-center justify-center w-5 rounded-l transition-all duration-200',
                    isOverlay
                        ? 'absolute right-0 top-1/2 -translate-y-1/2 z-40 h-16 bg-white/[0.03] hover:bg-white/[0.06]'
                        : 'h-16 self-center bg-white/[0.03] hover:bg-white/[0.06]',
                )}
                title="Show edit plan"
            >
                <ChevronLeft size={10} className="text-white/25" />
            </button>
        );
    }

    return (
        <div
            className={clsx(
                'flex flex-col h-full transition-all duration-300',
                isOverlay
                    ? 'absolute right-0 top-0 bottom-0 z-40 w-64'
                    : 'w-[270px]',
            )}
            style={{
                background: isOverlay
                    ? 'linear-gradient(180deg, rgba(6,6,16,0.75) 0%, rgba(10,10,20,0.65) 100%)'
                    : 'linear-gradient(180deg, rgba(8,8,18,0.95) 0%, rgba(6,6,14,0.98) 100%)',
            }}
        >
            {/* Render the full Edit Plan tree */}
            <EditPlanPanel />
        </div>
    );
});
