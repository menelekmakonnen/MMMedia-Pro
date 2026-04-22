import React from 'react';
import { motion } from 'framer-motion';
import { useUserStore, ThemeName, SidebarPosition, TimecodeFormat, TransitionStrategy, ViewMode } from '../../store/userStore';
import { Palette, TerminalSquare, Check, Sidebar, Image, Play, Settings2 } from 'lucide-react';
import clsx from 'clsx';

export const GlobalSettingsTab: React.FC = () => {
    const { 
        theme, setTheme, 
        enableAnimations, setEnableAnimations,
        defaultAutoMagnet, setDefaultAutoMagnet,
        showDeveloperMode, setShowDeveloperMode,
        sidebarPosition, setSidebarPosition,
        enableSpaceBackground, setEnableSpaceBackground,
        timecodeFormat, setTimecodeFormat,
        defaultTransition, setDefaultTransition,
        mediaManagerView, setMediaManagerView
    } = useUserStore();

    const themes: { id: ThemeName, name: string, colors: string[] }[] = [
        { id: 'purple', name: 'Deep Space Purple', colors: ['bg-[#080512]', 'bg-[#9D00FF]'] },
        { id: 'neon', name: 'Cyberpunk Neon', colors: ['bg-[#05050A]', 'bg-[#FF0055]'] },
        { id: 'ocean', name: 'Ocean Depth', colors: ['bg-[#020813]', 'bg-[#00A3FF]'] },
        { id: 'hacker', name: 'Terminal Green', colors: ['bg-[#000500]', 'bg-[#00FF00]'] },
    ];

    const SegmentControl = <T extends string>({ options, value, onChange }: { options: {id: T, label: string}[], value: T, onChange: (val: T) => void }) => (
        <div className="flex gap-2">
            {options.map((opt) => (
                <button
                    key={opt.id}
                    onClick={() => onChange(opt.id)}
                    className={clsx(
                        "flex-1 py-1.5 rounded-md text-[10px] font-bold transition-all border",
                        value === opt.id ? "bg-primary text-white border-primary shadow-lg" : "bg-white/5 text-white/50 border-white/10 hover:bg-white/10"
                    )}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    );

    return (
        <div className="w-full h-full overflow-y-auto custom-scrollbar">
            <div className="max-w-4xl mx-auto p-8 flex flex-col gap-8">
                {/* Header */}
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-gradient-to-br from-primary to-secondary rounded-lg shadow-lg">
                        <Settings2 size={20} className="text-white drop-shadow-md" />
                    </div>
                    <div>
                        <h2 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
                            Global Settings
                        </h2>
                        <p className="text-xs text-white/50">Configure layout, workflow defaults, and app behavior across all sessions.</p>
                    </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-8">
                    
                    {/* Left Column */}
                    <div className="flex flex-col gap-8">
                        {/* 1. Appearance & Layout */}
                        <div className="border border-white/5 rounded-xl bg-black/20 p-5 space-y-5">
                            <div className="flex items-center gap-2">
                                <Palette size={16} className="text-primary-300" />
                                <span className="text-sm font-bold text-white">Appearance & Layout</span>
                            </div>

                            {/* Theme */}
                            <div className="space-y-3">
                                <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Application Theme</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {themes.map((t) => (
                                        <motion.button
                                            key={t.id}
                                            onClick={() => setTheme(t.id)}
                                            whileHover={{ scale: 1.05, y: -2 }}
                                            whileTap={{ scale: 0.95 }}
                                            className={clsx(
                                                "flex flex-col gap-3 p-3 text-left rounded-xl transition-colors border group relative overflow-hidden",
                                                theme === t.id ? "bg-primary/10 border-primary/50 shadow-[0_0_15px_rgba(var(--color-primary),0.2)]" : "bg-white/5 border-white/5 hover:border-white/20"
                                            )}
                                        >
                                            {theme === t.id && <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 to-transparent pointer-events-none" />}
                                            <div className="flex justify-between items-start">
                                                <div className="flex gap-1.5 mb-1">
                                                    <div className={`w-3 h-3 rounded-full border border-white/20 ${t.colors[0]}`} />
                                                    <div className={`w-3 h-3 rounded-full border border-white/20 ${t.colors[1]} -ml-1.5`} />
                                                </div>
                                                {theme === t.id && (
                                                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring" }}>
                                                        <Check size={14} className="text-primary-300" />
                                                    </motion.div>
                                                )}
                                            </div>
                                            <div>
                                                <div className={clsx("text-xs font-bold truncate transition-colors", theme === t.id ? "text-primary-200" : "text-white/80")}>{t.name}</div>
                                            </div>
                                        </motion.button>
                                    ))}
                                </div>
                            </div>

                            {/* Sidebar Position */}
                            <div className="space-y-3">
                                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 flex justify-between items-center">
                                    <span>Sidebar Position</span>
                                    <Sidebar size={12} className="text-white/30" />
                                </label>
                                <SegmentControl<SidebarPosition> 
                                    options={[{id: 'left', label: 'Left Side'}, {id: 'right', label: 'Right Side'}]}
                                    value={sidebarPosition}
                                    onChange={setSidebarPosition}
                                />
                            </div>

                            {/* Space Background Toggle */}
                            <label className="flex flex-1 items-center justify-between p-4 rounded-xl border border-white/5 bg-white/5 cursor-pointer hover:bg-white/10 transition-colors">
                                <div className="flex flex-col gap-1">
                                    <span className="text-sm font-bold text-white">Cosmic Background</span>
                                    <span className="text-[10px] text-white/40">Render procedural stars behind the interface.</span>
                                </div>
                                <div className="relative">
                                    <input type="checkbox" className="sr-only" checked={enableSpaceBackground} onChange={(e) => setEnableSpaceBackground(e.target.checked)} />
                                    <div className={clsx("w-10 h-5 rounded-full transition-colors", enableSpaceBackground ? "bg-primary" : "bg-black border border-white/20")}>
                                        <div className={clsx("w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform", enableSpaceBackground ? "translate-x-5" : "translate-x-0.5")} />
                                    </div>
                                </div>
                            </label>

                            {/* Animations Toggle */}
                            <label className="flex flex-1 items-center justify-between p-4 rounded-xl border border-white/5 bg-white/5 cursor-pointer hover:bg-white/10 transition-colors">
                                <div className="flex flex-col gap-1">
                                    <span className="text-sm font-bold text-white">Micro-Animations</span>
                                    <span className="text-[10px] text-white/40">Spring physics on hover and tap.</span>
                                </div>
                                <div className="relative">
                                    <input type="checkbox" className="sr-only" checked={enableAnimations} onChange={(e) => setEnableAnimations(e.target.checked)} />
                                    <div className={clsx("w-10 h-5 rounded-full transition-colors", enableAnimations ? "bg-primary" : "bg-black border border-white/20")}>
                                        <div className={clsx("w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform", enableAnimations ? "translate-x-5" : "translate-x-0.5")} />
                                    </div>
                                </div>
                            </label>

                        </div>
                    </div>

                    {/* Right Column */}
                    <div className="flex flex-col gap-8">
                        {/* 2. Editing & Playback */}
                        <div className="border border-white/5 rounded-xl bg-black/20 p-5 space-y-5">
                            <div className="flex items-center gap-2">
                                <Play size={16} className="text-accent" />
                                <span className="text-sm font-bold text-white">Editing Defaults</span>
                            </div>

                            {/* Default Transition */}
                            <div className="space-y-3">
                                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 block">Default Transition Strategy</label>
                                <select 
                                    value={defaultTransition}
                                    onChange={(e) => setDefaultTransition(e.target.value as TransitionStrategy)}
                                    className="w-full bg-black/50 border border-white/10 text-white text-xs font-bold rounded-md px-3 py-2.5 outline-none cursor-pointer"
                                >
                                    <option value="cut">Hard Cut (Default)</option>
                                    <option value="cross-dissolve">Cross Dissolve</option>
                                    <option value="fade-to-black">Fade to Black</option>
                                </select>
                            </div>

                            {/* Timecode Format */}
                            <div className="space-y-3">
                                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 block">Sequence Timecode</label>
                                <SegmentControl<TimecodeFormat> 
                                    options={[{id: 'timecode', label: 'MM:SS:FF'}, {id: 'frames', label: 'Absolute Frames'}]}
                                    value={timecodeFormat}
                                    onChange={setTimecodeFormat}
                                />
                            </div>

                            {/* Auto-Magnet Toggle */}
                            <label className="flex flex-1 items-center justify-between p-4 rounded-xl border border-white/5 bg-white/5 cursor-pointer hover:bg-white/10 transition-colors">
                                <div className="flex flex-col gap-1 pr-4">
                                    <span className="text-sm font-bold text-white">Timeline Auto-Magnet</span>
                                    <span className="text-[10px] text-white/40">Automatically snap clips together after deletion/trimming.</span>
                                </div>
                                <div className="relative flex-shrink-0">
                                    <input type="checkbox" className="sr-only" checked={defaultAutoMagnet} onChange={(e) => setDefaultAutoMagnet(e.target.checked)} />
                                    <div className={clsx("w-10 h-5 rounded-full transition-colors", defaultAutoMagnet ? "bg-accent" : "bg-black border border-white/20")}>
                                        <div className={clsx("w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform", defaultAutoMagnet ? "translate-x-5" : "translate-x-0.5")} />
                                    </div>
                                </div>
                            </label>
                        </div>

                        {/* 3. Media & Workspace */}
                        <div className="border border-white/5 rounded-xl bg-black/20 p-5 space-y-5">
                            <div className="flex items-center gap-2">
                                <Image size={16} className="text-accent" />
                                <span className="text-sm font-bold text-white">Media & Workspace</span>
                            </div>

                            <div className="space-y-3">
                                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 block">Default Media View</label>
                                <SegmentControl<ViewMode> 
                                    options={[{id: 'grid', label: 'Grid Thumbnails'}, {id: 'list', label: 'Compact List'}]}
                                    value={mediaManagerView}
                                    onChange={setMediaManagerView}
                                />
                            </div>

                            {/* Developer Mode Toggle */}
                            <label className="flex flex-1 items-center justify-between p-4 rounded-xl border border-white/5 bg-white/5 cursor-pointer hover:bg-white/10 transition-colors">
                                <div className="flex flex-col gap-1 pr-4">
                                    <span className="flex items-center gap-2 text-sm font-bold text-white">
                                        Developer Mode <TerminalSquare size={12} className="text-white/40" />
                                    </span>
                                    <span className="text-[10px] text-white/40">Show raw JSON states & diagnostics.</span>
                                </div>
                                <div className="relative flex-shrink-0">
                                    <input type="checkbox" className="sr-only" checked={showDeveloperMode} onChange={(e) => setShowDeveloperMode(e.target.checked)} />
                                    <div className={clsx("w-10 h-5 rounded-full transition-colors", showDeveloperMode ? "bg-white" : "bg-black border border-white/20")}>
                                        <div className={clsx("w-4 h-4 bg-black rounded-full absolute top-0.5 transition-transform", showDeveloperMode ? "translate-x-5" : "translate-x-0.5")} />
                                    </div>
                                </div>
                            </label>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
