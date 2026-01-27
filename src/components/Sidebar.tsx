import React from 'react';
import { LayoutDashboard, FolderOpen, Film, Radio, Share2 } from 'lucide-react';
import { useViewStore } from '../store/viewStore';
import { TabId } from '../types';
import clsx from 'clsx';

export const Sidebar: React.FC = () => {
    const { activeTab, setActiveTab } = useViewStore();

    const NavItem = ({ id, icon: Icon, label }: { id: TabId; icon: any; label: string }) => (
        <div
            onClick={() => setActiveTab(id)}
            className={clsx(
                "group relative flex items-center justify-center p-3 cursor-pointer transition-all duration-200 rounded-xl mb-4",
                activeTab === id ? "bg-primary/20 text-primary" : "text-gray-500 hover:bg-white/5 hover:text-white"
            )}
            title={label}
        >
            <Icon size={24} strokeWidth={1.5} />
            {activeTab === id && (
                <div className="absolute left-0 w-1 h-8 bg-primary rounded-r-full" />
            )}
        </div>
    );

    return (
        <div className="w-20 bg-[#080816] border-r border-white/5 flex flex-col items-center py-6 h-full z-20">
            <NavItem id="dashboard" icon={LayoutDashboard} label="Settings / Dashboard" />
            <NavItem id="media" icon={FolderOpen} label="Media Manager" />
            <NavItem id="timeline" icon={Film} label="Timeline Editor" />
            <NavItem id="godmode" icon={Radio} label="God Mode" />
            <div className="flex-grow" />
            <NavItem id="export" icon={Share2} label="Export" />
        </div>
    );
};
