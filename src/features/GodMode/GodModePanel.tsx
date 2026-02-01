import React, { useState } from 'react';
import {
    Trash2,
    Database,
    Activity,
    RefreshCw,
    Wand2,
    Scissors,
    Smartphone,
    Type,
    Music,
    Share2,
    Terminal,
    X
} from 'lucide-react';
import { useClipStore } from '../../store/clipStore';
import { AutomationCard } from './AutomationCard';

interface GodModePanelProps {
    onClose: () => void;
}

export const GodModePanel: React.FC<GodModePanelProps> = ({ onClose }) => {
    const store = useClipStore();
    const { clips, nukeLibrary, setGlobalFlux } = store;
    const [showDevZone, setShowDevZone] = useState(false);

    // Create a safe copy of state to display
    const stateDump = JSON.stringify({
        clipsCount: clips.length,
        clipIds: clips.map(c => c.id),
    }, null, 2);

    // Simulated Automation Tasks
    const simulateTask = (duration: number) => {
        return new Promise<void>(resolve => setTimeout(resolve, duration));
    };

    const runAutoEdit = async () => {
        console.log('[God Mode] Running Auto-Edit...');
        await simulateTask(1500);
        setGlobalFlux(); // Use actual internal chaos function
        console.log('[God Mode] Auto-Edit Complete');
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-[#050510] border border-white/10 rounded-2xl w-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden relative">

                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 hover:bg-white/10 rounded-full text-white/40 hover:text-white transition-colors z-10"
                >
                    <X size={24} />
                </button>

                {/* Header */}
                <div className="p-8 pb-4 shrink-0 border-b border-white/5 bg-[#050510]">
                    <div className="flex items-center gap-3 mb-2">
                        <Wand2 className="text-primary" size={28} />
                        <h1 className="text-2xl font-bold bg-gradient-to-r from-white to-white/50 bg-clip-text text-transparent">
                            Automation Suite
                        </h1>
                    </div>
                </div>

                {/* Scrollable Content */}
                <div className="overflow-y-auto custom-scrollbar flex-1 p-8">
                    {/* Automation Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                        <AutomationCard
                            title="Auto-Edit"
                            description="Automatically trim and arrange clips based on visual flux analysis."
                            icon={Scissors}
                            color="text-pink-500"
                            onRun={runAutoEdit}
                        />
                        <AutomationCard
                            title="Viral Shorts"
                            description="Detect highlights and reformat for vertical 9:16."
                            icon={Smartphone}
                            color="text-indigo-500"
                            onRun={async () => await simulateTask(2000)}
                        />
                        <AutomationCard
                            title="Silence Remover"
                            description="Strip out dead air and pauses."
                            icon={Activity}
                            color="text-emerald-500"
                            onRun={async () => await simulateTask(1200)}
                        />
                        <AutomationCard
                            title="Auto-Captions"
                            description="Transcribes audio and generates synchronized subtitles."
                            icon={Type}
                            color="text-orange-500"
                            onRun={async () => await simulateTask(2500)}
                        />
                        <AutomationCard
                            title="Music Remix"
                            description="Retimes background music to match edit points."
                            icon={Music}
                            color="text-blue-500"
                            onRun={async () => await simulateTask(1800)}
                        />
                        <AutomationCard
                            title="Social Blast"
                            description="Auto-post sequence to all social accounts."
                            icon={Share2}
                            color="text-red-500"
                            onRun={async () => await simulateTask(3000)}
                        />
                    </div>

                    {/* Developer Zone Toggle */}
                    <div className="py-2">
                        <button
                            onClick={() => setShowDevZone(!showDevZone)}
                            className="flex items-center gap-2 text-white/20 hover:text-white/60 transition-colors text-sm font-mono uppercase tracking-wider"
                        >
                            <Terminal size={14} />
                            {showDevZone ? 'Hide Developer Zone' : 'Show Developer Zone'}
                        </button>
                    </div>

                    {/* Developer Zone */}
                    {showDevZone && (
                        <div className="pt-4 pb-8 animate-in slide-in-from-top-4 duration-300">
                            <div className="bg-black/40 border border-red-500/20 rounded-xl p-6 overflow-hidden">
                                <div className="flex items-center gap-2 mb-6 text-red-400">
                                    <Database size={20} />
                                    <h2 className="text-lg font-semibold">Danger Zone & State Inspector</h2>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                    <div className="space-y-4">
                                        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                                            <h3 className="text-red-400 font-medium mb-2 flex items-center gap-2">
                                                <Trash2 size={16} />
                                                Nuclear Option
                                            </h3>
                                            <button
                                                onClick={nukeLibrary}
                                                className="w-full bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/40 px-4 py-2 rounded transition-colors text-sm font-semibold"
                                            >
                                                NUKE LIBRARY
                                            </button>
                                        </div>
                                        <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                                            <h3 className="text-blue-400 font-medium mb-2 flex items-center gap-2">
                                                <RefreshCw size={16} />
                                                Force Refresh
                                            </h3>
                                            <button
                                                onClick={() => window.location.reload()}
                                                className="w-full bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/40 px-4 py-2 rounded transition-colors text-sm font-semibold"
                                            >
                                                RELOAD WINDOW
                                            </button>
                                        </div>
                                    </div>
                                    <div className="bg-black/50 rounded-lg border border-white/10 p-4 font-mono text-xs overflow-auto max-h-[300px]">
                                        <pre className="text-green-400/80">{stateDump}</pre>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
