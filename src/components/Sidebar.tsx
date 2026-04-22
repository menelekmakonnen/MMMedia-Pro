import React from 'react';
import { motion } from 'framer-motion';
import { Sliders, FolderOpen, Film, Grid, Wand2, Share, MonitorPlay, Settings, Sparkles } from 'lucide-react';
import { useViewStore } from '../store/viewStore';
import { TabId } from '../types';
import clsx from 'clsx';

export const Sidebar: React.FC = () => {
    const { activeTab, setActiveTab } = useViewStore();

    const NavItem = ({ id, icon: Icon, label }: { id: TabId; icon: any; label: string }) => (
        <motion.div
            onClick={() => setActiveTab(id)}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className={clsx(
                "group relative flex items-center justify-center p-3 cursor-pointer transition-colors duration-200 rounded-xl mb-4",
                activeTab === id ? "bg-primary/20 text-primary shadow-[0_0_15px_rgba(var(--color-primary),0.3)]" : "text-gray-500 hover:bg-white/5 hover:text-white"
            )}
            title={label}
        >
            <motion.div whileHover={{ rotate: 5 }} transition={{ type: "spring", stiffness: 400 }}>
                <Icon size={24} strokeWidth={1.5} />
            </motion.div>
            {activeTab === id && (
                <motion.div 
                    layoutId="sidebarActiveIndicator"
                    className="absolute left-0 w-1 h-8 bg-primary rounded-r-full shadow-[0_0_10px_var(--color-primary)]" 
                />
            )}
        </motion.div>
    );

    return (
        <div className="w-20 bg-[#080816]/80 backdrop-blur-md border-r border-white/5 flex flex-col items-center py-6 h-full z-20">
            <NavItem id="dashboard" icon={Sliders} label="Project Config" />
            <NavItem id="media" icon={FolderOpen} label="Import Media" />
            <NavItem id="godmode" icon={Sparkles} label="God Mode" />
            <NavItem id="trailer" icon={Wand2} label="Trailer Generator" />
            <NavItem id="timeline" icon={Film} label="Timeline Editor" />
            <NavItem id="grideditor" icon={Grid} label="Grid Editor" />
            <NavItem id="sequence" icon={MonitorPlay} label="Sequence View" />
            <div className="flex-grow" />
            <NavItem id="export" icon={Share} label="Export Manifest" />
            <NavItem id="global-settings" icon={Settings} label="Global Settings" />
        </div>
    );
};
