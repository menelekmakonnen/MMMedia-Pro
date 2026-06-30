/**
 * SequenceLayout — Top-level tabbed layout for the NLE Sequence page.
 * ════════════════════════════════════════════════════════════════════════════
 * Renders a subtab bar (Upload | Media | Edit) at the top of the
 * Sequence area, with the active subtab's content below.
 *
 * - Upload → MediaManagerTab (media import)
 * - Media  → SequenceMediaPanel (media browser)
 * - Edit   → SequenceViewTab (timeline + mixer + effects + scopes)
 */

import React from 'react';
import { FolderOpen, Film, Upload } from 'lucide-react';
import clsx from 'clsx';

import { useSequenceViewStore, SequenceSubTab } from '../../store/sequenceViewStore';
import { SequenceViewTab } from './SequenceViewTab';
import { SequenceMediaPanel } from './SequenceMediaPanel';
import { MediaManagerTab } from '../MediaManager/MediaManagerTab';


// ─── Subtab Configuration ────────────────────────────────────────────────────

interface SubTabDef {
    id: SequenceSubTab;
    label: string;
    icon: React.ElementType;
}

const SUB_TABS: SubTabDef[] = [
    { id: 'upload',  label: 'Upload',  icon: Upload },
    { id: 'media',   label: 'Media',   icon: FolderOpen },
    { id: 'edit',    label: 'Edit',    icon: Film },
];

// ─── Component ───────────────────────────────────────────────────────────────

export const SequenceLayout: React.FC = () => {
    const { activeSubTab, setActiveSubTab } = useSequenceViewStore();

    const renderContent = () => {
        switch (activeSubTab) {
            case 'upload':
                return <MediaManagerTab />;
            case 'media':
                return <SequenceMediaPanel />;
            case 'edit':
                return <SequenceViewTab />;

            default:
                return <SequenceViewTab />;
        }
    };

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* ── Subtab Bar ── */}
            <div className="flex items-center gap-1.5 px-4 py-2 border-b border-white/5 bg-[#0a0a15] flex-shrink-0">
                {SUB_TABS.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeSubTab === tab.id;

                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveSubTab(tab.id)}
                            className={clsx(
                                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200',
                                isActive
                                    ? 'bg-gradient-to-r from-purple-600/80 to-indigo-600/80 text-white shadow-lg shadow-purple-500/20 ring-1 ring-purple-400/30'
                                    : 'bg-white/5 text-white/50 hover:text-white/80 hover:bg-white/10',
                            )}
                        >
                            <Icon size={14} />
                            <span>{tab.label}</span>
                        </button>
                    );
                })}
            </div>

            {/* ── Content ── */}
            <div className="flex-1 overflow-hidden">
                {renderContent()}
            </div>
        </div>
    );
};
