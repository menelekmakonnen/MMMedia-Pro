import React, { useEffect, useRef } from 'react';
import { useAppHealthStore } from '../store/appHealthStore';

/**
 * AppHealthMonitor — Invisible component that tracks scroll velocity,
 * FPS, and error events, feeding the appHealthStore that drives the
 * living logo's visual state.
 *
 * Mount once in App.tsx. It uses requestAnimationFrame for FPS tracking
 * and a global scroll listener for velocity detection.
 */
export const AppHealthMonitor: React.FC = () => {
    const { setState, setScrollVelocity, setFps, incrementError } = useAppHealthStore();
    const lastScrollY = useRef(0);
    const lastScrollTime = useRef(Date.now());
    const scrollTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const frameTimestamps = useRef<number[]>([]);
    const animFrameId = useRef<number | undefined>(undefined);

    useEffect(() => {
        // ── Scroll Velocity Tracking ────────────────────────────────
        const handleScroll = () => {
            const now = Date.now();
            const dt = now - lastScrollTime.current;
            if (dt > 0) {
                const dy = Math.abs(window.scrollY - lastScrollY.current);
                const velocity = (dy / dt) * 1000; // px/sec
                setScrollVelocity(velocity);

                if (velocity > 300) {
                    setState('fast');
                } else if (velocity > 50) {
                    setState('active');
                }
            }
            lastScrollY.current = window.scrollY;
            lastScrollTime.current = now;

            // Reset to idle after scroll stops
            if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
            scrollTimeout.current = setTimeout(() => {
                setScrollVelocity(0);
                // Only reset to idle if not in error/loading state
                const currentState = useAppHealthStore.getState().state;
                if (currentState !== 'error' && currentState !== 'loading') {
                    setState('idle');
                }
            }, 800);
        };

        // Also listen on all scrollable containers (delegated)
        const handleScrollCapture = (e: Event) => {
            const target = e.target as HTMLElement;
            if (!target) return;
            const now = Date.now();
            const dt = now - lastScrollTime.current;
            if (dt > 16) { // throttle to ~60fps
                const velocity = Math.min(1000, (100 / dt) * 1000);
                setScrollVelocity(velocity);
                if (velocity > 300) setState('fast');
                else if (velocity > 50) setState('active');

                lastScrollTime.current = now;

                if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
                scrollTimeout.current = setTimeout(() => {
                    setScrollVelocity(0);
                    const currentState = useAppHealthStore.getState().state;
                    if (currentState !== 'error' && currentState !== 'loading') {
                        setState('idle');
                    }
                }, 800);
            }
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        document.addEventListener('scroll', handleScrollCapture, { capture: true, passive: true });

        // ── FPS Tracking ────────────────────────────────────────────
        const measureFps = (timestamp: number) => {
            frameTimestamps.current.push(timestamp);
            // Keep last 60 timestamps
            if (frameTimestamps.current.length > 60) {
                frameTimestamps.current.shift();
            }
            if (frameTimestamps.current.length >= 2) {
                const first = frameTimestamps.current[0];
                const last = frameTimestamps.current[frameTimestamps.current.length - 1];
                const elapsed = last - first;
                if (elapsed > 0) {
                    const fps = Math.round(((frameTimestamps.current.length - 1) / elapsed) * 1000);
                    setFps(fps);

                    // Auto-detect slow performance
                    const currentState = useAppHealthStore.getState().state;
                    if (fps < 20 && currentState !== 'error') {
                        setState('slow');
                    } else if (fps >= 50 && currentState === 'slow') {
                        setState('idle');
                    }
                }
            }
            animFrameId.current = requestAnimationFrame(measureFps);
        };
        animFrameId.current = requestAnimationFrame(measureFps);

        // ── Global Error Tracking ───────────────────────────────────
        const handleError = (e: ErrorEvent) => {
            console.warn('[HealthMonitor] Caught error:', e.message);
            incrementError();
        };
        const handleUnhandledRejection = (e: PromiseRejectionEvent) => {
            console.warn('[HealthMonitor] Unhandled rejection:', e.reason);
            incrementError();
        };

        window.addEventListener('error', handleError);
        window.addEventListener('unhandledrejection', handleUnhandledRejection);

        return () => {
            window.removeEventListener('scroll', handleScroll);
            document.removeEventListener('scroll', handleScrollCapture, { capture: true } as any);
            window.removeEventListener('error', handleError);
            window.removeEventListener('unhandledrejection', handleUnhandledRejection);
            if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
            if (animFrameId.current) cancelAnimationFrame(animFrameId.current);
        };
    }, [setState, setScrollVelocity, setFps, incrementError]);

    return null; // Invisible — just monitoring
};
