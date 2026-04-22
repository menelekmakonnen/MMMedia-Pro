import React, { useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import { create } from 'zustand';

/* ═══════════════════════════════════════════════════════════
 *  Toast Store — global state for in-app notifications
 * ═══════════════════════════════════════════════════════════ */

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
    id: string;
    message: string;
    variant: ToastVariant;
    duration?: number; // ms, default 4000
}

interface ToastStore {
    toasts: ToastItem[];
    addToast: (message: string, variant?: ToastVariant, duration?: number) => void;
    removeToast: (id: string) => void;
}

let _toastCounter = 0;

export const useToastStore = create<ToastStore>((set) => ({
    toasts: [],
    addToast: (message, variant = 'info', duration = 4000) => {
        const id = `toast_${Date.now()}_${_toastCounter++}`;
        set((s) => ({ toasts: [...s.toasts, { id, message, variant, duration }] }));
    },
    removeToast: (id) => {
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    },
}));

/** Shorthand functions for use anywhere (no hooks required) */
export const toast = {
    success: (msg: string, duration?: number) => useToastStore.getState().addToast(msg, 'success', duration),
    error: (msg: string, duration?: number) => useToastStore.getState().addToast(msg, 'error', duration ?? 6000),
    warning: (msg: string, duration?: number) => useToastStore.getState().addToast(msg, 'warning', duration ?? 5000),
    info: (msg: string, duration?: number) => useToastStore.getState().addToast(msg, 'info', duration),
};

/* ═══════════════════════════════════════════════════════════
 *  Visual config per variant
 * ═══════════════════════════════════════════════════════════ */

const VARIANT_CONFIG: Record<ToastVariant, {
    icon: React.ReactNode;
    bg: string;
    border: string;
    glow: string;
    text: string;
    progressColor: string;
}> = {
    success: {
        icon: <CheckCircle size={16} />,
        bg: 'bg-emerald-950/80',
        border: 'border-emerald-500/30',
        glow: 'shadow-[0_0_20px_rgba(16,185,129,0.15)]',
        text: 'text-emerald-300',
        progressColor: 'bg-emerald-500',
    },
    error: {
        icon: <XCircle size={16} />,
        bg: 'bg-red-950/80',
        border: 'border-red-500/30',
        glow: 'shadow-[0_0_20px_rgba(239,68,68,0.15)]',
        text: 'text-red-300',
        progressColor: 'bg-red-500',
    },
    warning: {
        icon: <AlertTriangle size={16} />,
        bg: 'bg-amber-950/80',
        border: 'border-amber-500/30',
        glow: 'shadow-[0_0_20px_rgba(245,158,11,0.15)]',
        text: 'text-amber-300',
        progressColor: 'bg-amber-500',
    },
    info: {
        icon: <Info size={16} />,
        bg: 'bg-indigo-950/80',
        border: 'border-indigo-500/30',
        glow: 'shadow-[0_0_20px_rgba(99,102,241,0.15)]',
        text: 'text-indigo-300',
        progressColor: 'bg-indigo-500',
    },
};

/* ═══════════════════════════════════════════════════════════
 *  Single Toast Item
 * ═══════════════════════════════════════════════════════════ */

const ToastNotification: React.FC<{ item: ToastItem }> = ({ item }) => {
    const { removeToast } = useToastStore();
    const config = VARIANT_CONFIG[item.variant];
    const duration = item.duration ?? 4000;

    useEffect(() => {
        const timer = setTimeout(() => removeToast(item.id), duration);
        return () => clearTimeout(timer);
    }, [item.id, duration, removeToast]);

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95, transition: { duration: 0.2 } }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className={`
                relative min-w-[320px] max-w-[480px] rounded-xl border backdrop-blur-xl overflow-hidden
                ${config.bg} ${config.border} ${config.glow}
            `}
        >
            <div className="flex items-start gap-3 p-3.5 pr-10">
                <div className={`mt-0.5 flex-shrink-0 ${config.text}`}>
                    {config.icon}
                </div>
                <p className="text-xs text-white/90 font-medium leading-relaxed break-words">
                    {item.message}
                </p>
            </div>

            {/* Close button */}
            <button
                onClick={() => removeToast(item.id)}
                className="absolute top-3 right-3 text-white/30 hover:text-white/70 transition-colors"
            >
                <X size={14} />
            </button>

            {/* Auto-dismiss progress bar */}
            <div className="h-[2px] w-full bg-white/5">
                <motion.div
                    className={`h-full ${config.progressColor} opacity-60`}
                    initial={{ width: '100%' }}
                    animate={{ width: '0%' }}
                    transition={{ duration: duration / 1000, ease: 'linear' }}
                />
            </div>
        </motion.div>
    );
};

/* ═══════════════════════════════════════════════════════════
 *  Toast Container — rendered once in App.tsx
 * ═══════════════════════════════════════════════════════════ */

export const ToastContainer: React.FC = () => {
    const { toasts } = useToastStore();

    return (
        <div className="fixed top-12 right-4 z-[9999] flex flex-col gap-2 pointer-events-auto">
            <AnimatePresence mode="popLayout">
                {toasts.map((t) => (
                    <ToastNotification key={t.id} item={t} />
                ))}
            </AnimatePresence>
        </div>
    );
};
