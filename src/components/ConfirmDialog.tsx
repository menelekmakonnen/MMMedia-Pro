import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';
import { create } from 'zustand';

/* ═══════════════════════════════════════════════════════════
 *  Confirm Dialog Store — global state for confirm popups
 * ═══════════════════════════════════════════════════════════ */

interface ConfirmOptions {
    title?: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'warning' | 'info';
}

interface ConfirmState {
    isOpen: boolean;
    options: ConfirmOptions | null;
    _resolve: ((value: boolean) => void) | null;
    open: (options: ConfirmOptions) => Promise<boolean>;
    close: (result: boolean) => void;
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
    isOpen: false,
    options: null,
    _resolve: null,
    open: (options) => {
        return new Promise<boolean>((resolve) => {
            set({ isOpen: true, options, _resolve: resolve });
        });
    },
    close: (result) => {
        const { _resolve } = get();
        _resolve?.(result);
        set({ isOpen: false, options: null, _resolve: null });
    },
}));

/** Shorthand for use outside React components */
export const confirm = (message: string, options?: Partial<Omit<ConfirmOptions, 'message'>>): Promise<boolean> => {
    return useConfirmStore.getState().open({ message, ...options });
};

/* ═══════════════════════════════════════════════════════════
 *  Variant Styles
 * ═══════════════════════════════════════════════════════════ */

const VARIANT_STYLES = {
    danger: {
        iconColor: 'text-red-400',
        iconBg: 'bg-red-500/10 border-red-500/20',
        confirmBg: 'bg-gradient-to-r from-red-600 to-rose-600 hover:shadow-[0_0_20px_rgba(239,68,68,0.3)]',
        glowColor: 'bg-red-500/10',
    },
    warning: {
        iconColor: 'text-amber-400',
        iconBg: 'bg-amber-500/10 border-amber-500/20',
        confirmBg: 'bg-gradient-to-r from-amber-600 to-orange-600 hover:shadow-[0_0_20px_rgba(245,158,11,0.3)]',
        glowColor: 'bg-amber-500/10',
    },
    info: {
        iconColor: 'text-indigo-400',
        iconBg: 'bg-indigo-500/10 border-indigo-500/20',
        confirmBg: 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:shadow-[0_0_20px_rgba(99,102,241,0.3)]',
        glowColor: 'bg-indigo-500/10',
    },
};

/* ═══════════════════════════════════════════════════════════
 *  ConfirmDialog Component — rendered once in App.tsx
 * ═══════════════════════════════════════════════════════════ */

export const ConfirmDialog: React.FC = () => {
    const { isOpen, options, close } = useConfirmStore();
    const confirmBtnRef = useRef<HTMLButtonElement>(null);

    const variant = options?.variant ?? 'danger';
    const styles = VARIANT_STYLES[variant];

    // Focus the confirm button on open
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => confirmBtnRef.current?.focus(), 100);
        }
    }, [isOpen]);

    // Handle Escape key
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') close(false);
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [isOpen, close]);

    return (
        <AnimatePresence>
            {isOpen && options && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="fixed inset-0 z-[10000] flex items-center justify-center"
                >
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        onClick={() => close(false)}
                    />

                    {/* Dialog */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                        className="relative w-full max-w-md mx-4 bg-[#0f0f1a]/95 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl"
                    >
                        {/* Decorative glow */}
                        <div className={`absolute -top-20 -right-20 w-48 h-48 ${styles.glowColor} rounded-full blur-[60px] pointer-events-none`} />

                        {/* Close button */}
                        <button
                            onClick={() => close(false)}
                            className="absolute top-4 right-4 text-white/30 hover:text-white/70 transition-colors z-10"
                        >
                            <X size={16} />
                        </button>

                        {/* Content */}
                        <div className="relative p-6 pt-8 flex flex-col items-center text-center gap-4">
                            {/* Icon */}
                            <div className={`w-14 h-14 rounded-xl ${styles.iconBg} border flex items-center justify-center ${styles.iconColor}`}>
                                <AlertTriangle size={28} />
                            </div>

                            {/* Title */}
                            {options.title && (
                                <h3 className="text-base font-black text-white tracking-tight">
                                    {options.title}
                                </h3>
                            )}

                            {/* Message */}
                            <p className="text-sm text-white/60 leading-relaxed max-w-sm whitespace-pre-line">
                                {options.message}
                            </p>
                        </div>

                        {/* Actions */}
                        <div className="relative px-6 pb-6 flex gap-3">
                            <button
                                onClick={() => close(false)}
                                className="flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider text-white/60 bg-white/5 border border-white/10 hover:bg-white/10 hover:text-white/90 transition-all"
                            >
                                {options.cancelText || 'Cancel'}
                            </button>
                            <button
                                ref={confirmBtnRef}
                                onClick={() => close(true)}
                                className={`flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider text-white ${styles.confirmBg} transition-all shadow-lg`}
                            >
                                {options.confirmText || 'Confirm'}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
