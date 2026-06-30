/**
 * PreviewBubble — Portal-based hover preview tooltip.
 * ════════════════════════════════════════════════════════════════════════════
 * Renders a floating preview bubble above (or below) the trigger element.
 * Uses ReactDOM.createPortal to document.body so it's NEVER hidden under
 * any layer. Zero memory cost when not hovered — content only mounts on
 * mouseEnter and unmounts instantly on mouseLeave.
 *
 * MEMORY SAFETY: The `preview` prop is React.ReactNode but is ONLY rendered
 * when `show` is true. To avoid leaking preview content across rapid
 * hover/unhover cycles, the portal is fully unmounted on hide with no
 * lingering timers.
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import ReactDOM from 'react-dom';

interface PreviewBubbleProps {
    /** The visual preview content (canvas, animation, SVG, etc.) */
    preview: React.ReactNode;
    /** Optional text description below the preview */
    description?: string;
    /** Bubble width in px (default 200) */
    width?: number;
    /** The trigger element to wrap */
    children: React.ReactNode;
}

interface BubblePos {
    top: number;
    left: number;
    arrowSide: 'bottom' | 'top';
}

export const PreviewBubble: React.FC<PreviewBubbleProps> = ({
    preview,
    description,
    width = 200,
    children,
}) => {
    const [show, setShow] = useState(false);
    const [pos, setPos] = useState<BubblePos | null>(null);
    const triggerRef = useRef<HTMLSpanElement>(null);
    const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isMountedRef = useRef(true);

    // Track mount state to prevent setState after unmount
    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
            if (hideTimer.current) {
                clearTimeout(hideTimer.current);
                hideTimer.current = null;
            }
        };
    }, []);

    const handleEnter = useCallback(() => {
        if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
        if (!triggerRef.current || !isMountedRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();
        const bubbleH = 140; // estimated max height
        const gap = 8;

        // Prefer above, flip below if not enough room
        const spaceAbove = rect.top;
        if (spaceAbove > bubbleH + gap) {
            setPos({
                top: rect.top - gap,
                left: rect.left + rect.width / 2,
                arrowSide: 'bottom',
            });
        } else {
            setPos({
                top: rect.bottom + gap,
                left: rect.left + rect.width / 2,
                arrowSide: 'top',
            });
        }
        setShow(true);
    }, []);

    const handleLeave = useCallback(() => {
        // Clear any pending show timer and hide immediately — no lingering portal
        if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
        hideTimer.current = setTimeout(() => {
            if (isMountedRef.current) {
                setShow(false);
                setPos(null);
            }
            hideTimer.current = null;
        }, 50);
    }, []);

    return (
        <>
            <span
                ref={triggerRef}
                onMouseEnter={handleEnter}
                onMouseLeave={handleLeave}
                style={{ display: 'inline-flex' }}
            >
                {children}
            </span>
            {show && pos && ReactDOM.createPortal(
                <div
                    onMouseEnter={() => { if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; } }}
                    onMouseLeave={handleLeave}
                    style={{
                        position: 'fixed',
                        zIndex: 99999,
                        top: pos.arrowSide === 'bottom' ? undefined : pos.top,
                        bottom: pos.arrowSide === 'bottom' ? `${window.innerHeight - pos.top}px` : undefined,
                        left: Math.max(width / 2 + 8, Math.min(pos.left, window.innerWidth - width / 2 - 8)),
                        transform: 'translateX(-50%)',
                        width,
                        pointerEvents: 'none',
                    }}
                >
                    <div style={{
                        background: 'rgba(10,10,26,0.95)',
                        backdropFilter: 'blur(12px)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 12,
                        padding: '10px 12px',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)',
                    }}>
                        {/* Preview content — ONLY rendered when visible */}
                        <div style={{
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            minHeight: 48,
                        }}>
                            {preview}
                        </div>
                        {/* Description text */}
                        {description && (
                            <div style={{
                                marginTop: 6,
                                fontSize: 10,
                                fontWeight: 600,
                                color: 'rgba(255,255,255,0.45)',
                                textAlign: 'center',
                                lineHeight: 1.3,
                            }}>
                                {description}
                            </div>
                        )}
                    </div>
                    {/* Arrow */}
                    <div style={{
                        position: 'absolute',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        ...(pos.arrowSide === 'bottom'
                            ? { bottom: -5, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: '6px solid rgba(10,10,26,0.95)' }
                            : { top: -5, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderBottom: '6px solid rgba(10,10,26,0.95)' }),
                        width: 0,
                        height: 0,
                    }} />
                </div>,
                document.body
            )}
        </>
    );
};
