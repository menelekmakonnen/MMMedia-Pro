import React, { useState } from 'react';
import { Shuffle } from 'lucide-react';
import { useUserStore } from '../../store/userStore';
import { getTransitionsByCategory, getTransitionById, CATEGORY_LABELS, type TransitionCategory } from '../../lib/transitions';
import clsx from 'clsx';

/**
 * Default Transition picker. Lives on the Trailer Generator page (moved here from
 * the Config page). Backed by the shared userStore.defaultTransition, so the
 * choice still applies during Monolithic export.
 */
export const DefaultTransitionPicker: React.FC = () => {
    const defaultTransition = useUserStore(s => s.defaultTransition);
    const setDefaultTransition = useUserStore(s => s.setDefaultTransition);
    const [activeTransitionTab, setActiveTransitionTab] = useState<TransitionCategory>('basic');
    const transitionsByCategory = getTransitionsByCategory();
    const categoryKeys = Object.keys(transitionsByCategory) as TransitionCategory[];
    const selectedTransitionDef = getTransitionById(defaultTransition);

    return (
        <div className="border border-white/5 rounded-xl bg-black/20 p-5 space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Shuffle size={16} className="text-primary-300" />
                    <span className="text-sm font-bold text-white">Default Transition</span>
                </div>
                {selectedTransitionDef && (
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-white/40 uppercase tracking-wider">Active:</span>
                        <span className="px-2 py-0.5 bg-primary/20 border border-primary/30 rounded text-[10px] font-bold text-primary-300">
                            {selectedTransitionDef.name}
                        </span>
                    </div>
                )}
            </div>

            <p className="text-[10px] text-white/40">
                Choose the default transition between clips. Applied during Monolithic export.
            </p>

            {/* Category Tabs */}
            <div className="flex gap-1 overflow-x-auto custom-scrollbar pb-1">
                {categoryKeys.map((cat) => (
                    <button
                        key={cat}
                        onClick={() => setActiveTransitionTab(cat)}
                        className={clsx(
                            "px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-all border",
                            activeTransitionTab === cat
                                ? "bg-primary/80 text-white border-primary shadow-[0_0_12px_rgba(var(--color-primary),0.3)]"
                                : "bg-white/5 text-white/50 border-white/10 hover:bg-white/10 hover:text-white/80"
                        )}
                    >
                        {CATEGORY_LABELS[cat]}
                        <span className="ml-1 text-[9px] opacity-60">{transitionsByCategory[cat].length}</span>
                    </button>
                ))}
            </div>

            {/* Transition Grid */}
            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2">
                {transitionsByCategory[activeTransitionTab].map((t) => {
                    const isSelected = defaultTransition === t.id;
                    return (
                        <button
                            key={t.id}
                            onClick={() => setDefaultTransition(t.id)}
                            title={t.description}
                            className={clsx(
                                "relative flex flex-col items-center justify-center gap-1 p-3 rounded-lg text-center transition-all border-2",
                                isSelected
                                    ? "bg-primary/20 border-primary text-white shadow-[0_0_20px_rgba(var(--color-primary),0.3)] ring-2 ring-primary/50 ring-offset-1 ring-offset-black/50"
                                    : "bg-white/5 border-transparent text-white/60 hover:bg-white/10 hover:text-white/90 hover:border-white/20"
                            )}
                        >
                            <span className={clsx("text-[11px] font-bold leading-tight", isSelected ? "text-white" : "text-white/70")}>
                                {t.name}
                            </span>
                            <span className={clsx("text-[8px] font-mono uppercase tracking-wider", isSelected ? "text-primary-300" : "text-white/30")}>
                                {t.id}
                            </span>
                            {isSelected && (
                                <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-primary rounded-full shadow-[0_0_6px_rgba(var(--color-primary),0.8)]" />
                            )}
                        </button>
                    );
                })}
            </div>

            {selectedTransitionDef && (
                <div className="mt-1 text-[10px] text-white/30 italic">
                    {selectedTransitionDef.description}
                </div>
            )}
        </div>
    );
};
