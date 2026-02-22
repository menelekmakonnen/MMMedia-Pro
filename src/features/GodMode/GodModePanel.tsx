import React, { useState } from 'react';
import { Wand2, Zap, Brain, Sparkles, RefreshCw, Layers } from 'lucide-react';
import { AutomationCard } from './AutomationCard';
import { useClipStore } from '../../store/clipStore';
// import { useProjectStore } from '../../store/projectStore';

export const GodModePanel: React.FC = () => {
    const [isGenerating, setIsGenerating] = useState(false);
    const { clips, setClips } = useClipStore(); // Use store actions
    // const { settings } = useProjectStore();

    const handleAutoEdit = async () => {
        setIsGenerating(true);
        // Simulate processing
        await new Promise(resolve => setTimeout(resolve, 1500));
        setIsGenerating(false);
        // In a real implementation, this would call the randomization engine
        // to reorder, trim, and apply effects to clips based on the seed.
        console.log('Auto-Edit complete based on seed');

        // Mock effect: Shuffle clips
        if (clips.length > 0) {
            const shuffled = [...clips].sort(() => Math.random() - 0.5);
            setClips(shuffled);
        }
    };

    const handleSilenceRemoval = async () => {
        console.log('Silence Removal Triggered');
        // Mock logic: Reduce duration of all clips by 10%
        // We modify endFrame since duration property doesn't exist
        const shortened = clips.map(c => ({
            ...c,
            endFrame: c.startFrame + Math.floor((c.endFrame - c.startFrame) * 0.9)
        }));
        setClips(shortened);
    };

    const handleColorGrade = async () => {
        console.log('AI Color Grade Triggered');
        // Mock logic: Add 'graded' tag or similar metadata
    };

    return (
        <div className="h-full flex flex-col p-6 overflow-y-auto animate-in fade-in duration-300">
            {/* Header */}
            <div className="flex items-center gap-3 mb-8">
                <div className="p-3 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 shadow-lg shadow-violet-500/20">
                    <Sparkles className="text-white" size={24} />
                </div>
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">God Mode</h2>
                    <p className="text-white/50 text-sm">AI-driven creativity and automation.</p>
                </div>
            </div>

            {/* Main Automation Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <AutomationCard
                    title="Auto-Edit"
                    description="Generate a complete edit from your media using the current seed."
                    icon={Wand2}
                    color="text-violet-400"
                    onRun={handleAutoEdit}
                    isLoading={isGenerating}
                />

                <AutomationCard
                    title="Silence Remover"
                    description="Automatically detect and remove silent gaps in dialogue."
                    icon={Zap}
                    color="text-amber-400"
                    onRun={handleSilenceRemoval}
                />

                <AutomationCard
                    title="AI Color Match"
                    description="Match colors across all clips to a reference image."
                    icon={Brain}
                    color="text-emerald-400"
                    onRun={handleColorGrade}
                />

                <AutomationCard
                    title="Smart B-Roll"
                    description="Insert B-roll automatically based on voiceover context."
                    icon={Layers}
                    color="text-blue-400"
                    onRun={() => Promise.resolve(console.log("Smart B-Roll"))}
                />
            </div>

            {/* Randomization Engine Status */}
            <div className="mt-8 p-6 rounded-2xl bg-[#0d0d1a] border border-white/10">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                        <RefreshCw size={18} className="text-white/60" />
                        Randomization Engine
                    </h3>
                    <span className="text-xs font-mono bg-white/5 px-2 py-1 rounded text-white/40">SEED: 84729104</span>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="flex justify-between p-3 rounded-lg bg-white/5 border border-white/5">
                        <span className="text-white/60">Chaos Level</span>
                        <span className="text-violet-400 font-bold">15%</span>
                    </div>
                    <div className="flex justify-between p-3 rounded-lg bg-white/5 border border-white/5">
                        <span className="text-white/60">Pacing</span>
                        <span className="text-violet-400 font-bold">Dynamic</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
