import React from 'react';
import { motion } from 'framer-motion';
import { Sliders, FolderOpen, Film, Grid, Wand2, Share, MonitorPlay, PlayCircle, Settings, Save, Lock, Loader2, SlidersHorizontal } from 'lucide-react';
import { useViewStore } from '../store/viewStore';
import { useExportSettingsStore } from '../store/exportSettingsStore';
import { TabId } from '../types';
import clsx from 'clsx';

// Heavy pages that shouldn't be accessed during export
const HEAVY_TABS: TabId[] = ['timeline', 'grideditor', 'sequence', 'dashboard'];

export const Sidebar: React.FC = () => {
    const { activeTab, setActiveTab } = useViewStore();
    const isExporting = useExportSettingsStore(s => s.isExporting);

    const NavItem = ({ id, icon: Icon, label }: { id: TabId; icon: any; label: string }) => {
        const locked = isExporting && HEAVY_TABS.includes(id) && activeTab !== id;
        const isActive = activeTab === id;

        return (
            <motion.div
                onClick={() => !locked && setActiveTab(id)}
                whileHover={locked ? {} : { scale: 1.05 }}
                whileTap={locked ? {} : { scale: 0.95 }}
                className={clsx(
                    "group relative flex flex-col items-center justify-center py-2.5 px-1 transition-all duration-200 rounded-lg mx-2 mb-1 cursor-pointer",
                    locked && "opacity-20 cursor-not-allowed grayscale",
                    isActive
                        ? "bg-primary/15 text-primary"
                        : !locked && "text-white/40 hover:text-white/70 hover:bg-white/[0.04]"
                )}
                title={locked ? `${label} — locked during export` : label}
            >
                {/* Active indicator bar */}
                {isActive && (
                    <motion.div
                        layoutId="sidebarActiveBar"
                        className="absolute left-0 top-1.5 bottom-1.5 w-[3px] bg-primary rounded-r-full shadow-[0_0_8px_var(--color-primary)]"
                        transition={{ type: "spring", stiffness: 500, damping: 35 }}
                    />
                )}

                <motion.div
                    whileHover={locked ? {} : { rotate: 3 }}
                    transition={{ type: "spring", stiffness: 400 }}
                >
                    <Icon size={20} strokeWidth={1.5} />
                </motion.div>
                <span className={clsx(
                    "text-[8px] mt-1 font-semibold tracking-wider uppercase leading-none",
                    isActive ? "text-primary/80" : "text-white/25 group-hover:text-white/40"
                )}>
                    {label.split(' ')[0]}
                </span>

                {locked && (
                    <div className="absolute -top-0.5 -right-0.5 bg-amber-500/80 rounded-full p-0.5">
                        <Lock size={7} className="text-black" />
                    </div>
                )}
            </motion.div>
        );
    };

    return (
        <div className="w-[72px] bg-[#0e0e22] border-r border-white/[0.06] flex flex-col items-center py-4 h-full z-20">
            {/* Top nav group */}
            <div className="space-y-0.5 w-full">
                <NavItem id="dashboard" icon={Sliders} label="Config" />
                <NavItem id="media" icon={FolderOpen} label="Import" />
                <NavItem id="import-manager" icon={SlidersHorizontal} label="Manager" />
                <NavItem id="trailer" icon={Wand2} label="Producer" />
            </div>

            {/* Separator */}
            <div className="w-8 h-px bg-white/[0.06] my-2" />

            {/* Edit nav group */}
            <div className="space-y-0.5 w-full">
                <NavItem id="timeline" icon={Film} label="Clip Lab" />
                <NavItem id="grideditor" icon={Grid} label="Grid" />
                <NavItem id="sequence" icon={MonitorPlay} label="Sequence" />
                <NavItem id="videoplayer" icon={PlayCircle} label="Player" />
            </div>

            {/* Separator */}
            <div className="w-8 h-px bg-white/[0.06] my-2" />

            {/* Export */}
            <NavItem id="export" icon={Share} label="Export" />

            <div className="flex-grow" />

            {/* Render In Progress — pulsing indicator to jump to the live Render View */}
            {isExporting && (
                <motion.button
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    onClick={() => {
                        useExportSettingsStore.getState().setActiveTab('mp4');
                        setActiveTab('export');
                    }}
                    className="relative mx-2 mb-2 py-2 px-3 rounded-lg cursor-pointer group w-full"
                    title="Render in progress — click to view"
                >
                    {/* Pulsing glow ring */}
                    <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-amber-500/20 to-red-500/20 animate-pulse" />
                    <div className="absolute inset-0 rounded-lg border border-amber-500/30 shadow-[0_0_12px_rgba(245,158,11,0.2)]" />
                    <div className="relative flex flex-col items-center gap-0.5">
                        <Loader2 size={16} className="text-amber-400 animate-spin" />
                        <span className="text-[7px] font-black uppercase tracking-widest text-amber-300/80">Render</span>
                    </div>
                </motion.button>
            )}

            {/* Bottom nav group */}
            <div className="space-y-0.5 w-full">
                <NavItem id="edits" icon={Save} label="Edits" />
                <NavItem id="global-settings" icon={Settings} label="Settings" />
            </div>
        </div>
    );
};
