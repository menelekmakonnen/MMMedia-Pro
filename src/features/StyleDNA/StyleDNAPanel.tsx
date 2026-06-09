import React, { useState, useMemo } from 'react';
import { useStyleStore, StyleDNA } from '../../store/styleStore';
import { 
    Palette, Plus, Trash2, Wand2, Download, Sliders, 
    Sparkles, Music, Zap, ChevronDown, ChevronUp 
} from 'lucide-react';
import clsx from 'clsx';

const ZOOM_OPTIONS: StyleDNA['zoomStrategy'][] = ['none', 'subtle', 'aggressive', 'ken-burns'];
const AUDIO_OPTIONS: StyleDNA['audioStrategy'][] = ['free', 'beat-sync', 'rhythmic'];
const COLOR_PRESETS = ['natural', 'cinematic', 'warm', 'cool', 'vintage', 'neon', 'desaturated', 'custom'];

export const StyleDNAPanel: React.FC = () => {
    const { styles, activeStyleId, saveStyle, deleteStyle, applyStyle, extractStyleFromTimeline } = useStyleStore();
    const [expandedId, setExpandedId] = useState<string | null>(null);

    // Editing state for "new style" form
    const [isCreating, setIsCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [newCutDensity, setNewCutDensity] = useState(1.5);
    const [newZoomStrategy, setNewZoomStrategy] = useState<StyleDNA['zoomStrategy']>('subtle');
    const [newTransitionAggression, setNewTransitionAggression] = useState(40);
    const [newColorMood, setNewColorMood] = useState('natural');
    const [newAudioStrategy, setNewAudioStrategy] = useState<StyleDNA['audioStrategy']>('free');
    const [newEffectIntensity, setNewEffectIntensity] = useState(30);
    const [newSpeedMin, setNewSpeedMin] = useState(0.8);
    const [newSpeedMax, setNewSpeedMax] = useState(1.5);

    const handleExtract = () => {
        const extracted = extractStyleFromTimeline();
        saveStyle({
            name: extracted.name,
            cutDensity: extracted.cutDensity,
            zoomStrategy: extracted.zoomStrategy,
            transitionAggression: extracted.transitionAggression,
            colorMood: extracted.colorMood,
            audioStrategy: extracted.audioStrategy,
            effectIntensity: extracted.effectIntensity,
            speedRange: extracted.speedRange,
        });
    };

    const handleSaveNew = () => {
        if (!newName.trim()) return;
        saveStyle({
            name: newName.trim(),
            cutDensity: newCutDensity,
            zoomStrategy: newZoomStrategy,
            transitionAggression: newTransitionAggression,
            colorMood: newColorMood,
            audioStrategy: newAudioStrategy,
            effectIntensity: newEffectIntensity,
            speedRange: [newSpeedMin, newSpeedMax],
        });
        setIsCreating(false);
        setNewName('');
    };

    return (
        <div className="w-full h-full overflow-y-auto custom-scrollbar">
            <div className="p-4 space-y-4">

                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-md" style={{ background: 'rgba(168,85,247,0.15)' }}>
                            <Palette size={14} className="text-purple-400" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-white">Style DNA</h3>
                            <p className="text-[10px] text-white/40">Save and apply editing fingerprints</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <button
                            onClick={handleExtract}
                            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/40 transition-all"
                            title="Analyze current timeline and extract style"
                        >
                            <Download size={10} />
                            Extract
                        </button>
                        <button
                            onClick={() => setIsCreating(!isCreating)}
                            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold bg-white/5 text-white/60 border border-white/10 hover:bg-white/10 transition-all"
                        >
                            <Plus size={10} />
                            New
                        </button>
                    </div>
                </div>

                {/* New Style Form */}
                {isCreating && (
                    <div className="border border-purple-500/30 rounded-xl bg-purple-500/5 p-4 space-y-3">
                        <input
                            type="text"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder="Style name..."
                            className="w-full bg-black/50 border border-white/10 rounded-lg p-2.5 text-white text-xs font-bold outline-none focus:border-purple-500/50 transition-colors"
                        />

                        <SliderControl label="Cut Density" value={newCutDensity} min={0.5} max={4.0} step={0.1}
                            onChange={setNewCutDensity} unit=" cuts/s" />

                        <SelectControl label="Zoom Strategy" value={newZoomStrategy}
                            options={ZOOM_OPTIONS} onChange={(v) => setNewZoomStrategy(v as StyleDNA['zoomStrategy'])} />

                        <SliderControl label="Transition Aggression" value={newTransitionAggression} min={0} max={100} step={5}
                            onChange={setNewTransitionAggression} unit="%" />

                        <SelectControl label="Color Mood" value={newColorMood}
                            options={COLOR_PRESETS} onChange={setNewColorMood} />

                        <SelectControl label="Audio Strategy" value={newAudioStrategy}
                            options={AUDIO_OPTIONS} onChange={(v) => setNewAudioStrategy(v as StyleDNA['audioStrategy'])} />

                        <SliderControl label="Effect Intensity" value={newEffectIntensity} min={0} max={100} step={5}
                            onChange={setNewEffectIntensity} unit="%" />

                        <div className="grid grid-cols-2 gap-2">
                            <SliderControl label="Speed Min" value={newSpeedMin} min={0.25} max={2.0} step={0.05}
                                onChange={setNewSpeedMin} unit="x" />
                            <SliderControl label="Speed Max" value={newSpeedMax} min={0.5} max={4.0} step={0.1}
                                onChange={setNewSpeedMax} unit="x" />
                        </div>

                        <div className="flex gap-2 pt-1">
                            <button onClick={handleSaveNew}
                                className="flex-1 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-purple-600 text-white hover:bg-purple-500 transition-all">
                                Save Style
                            </button>
                            <button onClick={() => setIsCreating(false)}
                                className="px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-white/5 text-white/50 hover:bg-white/10 transition-all">
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {/* Style Cards */}
                {styles.length === 0 && !isCreating && (
                    <div className="text-center py-8 text-white/20 text-xs">
                        <Sparkles size={24} className="mx-auto mb-2 opacity-30" />
                        <p>No saved styles yet.</p>
                        <p className="text-[10px] mt-1">Extract from your timeline or create a new one.</p>
                    </div>
                )}

                <div className="space-y-2">
                    {styles.map((style) => {
                        const isActive = activeStyleId === style.id;
                        const isExpanded = expandedId === style.id;

                        return (
                            <div key={style.id}
                                className={clsx(
                                    'border rounded-xl p-3 transition-all',
                                    isActive
                                        ? 'border-purple-500/40 bg-purple-500/10 shadow-[0_0_15px_rgba(168,85,247,0.1)]'
                                        : 'border-white/5 bg-black/20 hover:border-white/10'
                                )}
                            >
                                {/* Card header */}
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <div className={clsx(
                                            'w-2 h-2 rounded-full shrink-0',
                                            isActive ? 'bg-purple-400 shadow-[0_0_8px_rgba(168,85,247,0.6)]' : 'bg-white/20'
                                        )} />
                                        <span className="text-xs font-bold text-white truncate">{style.name}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button onClick={() => applyStyle(style.id)}
                                            className={clsx(
                                                'px-2 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider transition-all',
                                                isActive ? 'bg-purple-500/30 text-purple-300' : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/70'
                                            )}>
                                            {isActive ? 'Active' : 'Apply'}
                                        </button>
                                        <button onClick={() => setExpandedId(isExpanded ? null : style.id)}
                                            className="p-1 rounded text-white/30 hover:text-white/60 transition-colors">
                                            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                        </button>
                                        <button onClick={() => deleteStyle(style.id)}
                                            className="p-1 rounded text-white/20 hover:text-red-400 transition-colors">
                                            <Trash2 size={12} />
                                        </button>
                                    </div>
                                </div>

                                {/* Mini stats */}
                                <div className="flex gap-3 mt-2">
                                    <MiniStat label="Cuts" value={`${style.cutDensity}/s`} />
                                    <MiniStat label="Zoom" value={style.zoomStrategy} />
                                    <MiniStat label="FX" value={`${style.effectIntensity}%`} />
                                    <MiniStat label="Speed" value={`${style.speedRange[0]}-${style.speedRange[1]}x`} />
                                </div>

                                {/* Expanded details */}
                                {isExpanded && (
                                    <div className="mt-3 pt-3 border-t border-white/5 space-y-1.5">
                                        <DetailRow label="Cut Density" value={`${style.cutDensity} cuts/second`} />
                                        <DetailRow label="Zoom Strategy" value={style.zoomStrategy} />
                                        <DetailRow label="Transition Aggression" value={`${style.transitionAggression}%`} />
                                        <DetailRow label="Color Mood" value={style.colorMood} />
                                        <DetailRow label="Audio Strategy" value={style.audioStrategy} />
                                        <DetailRow label="Effect Intensity" value={`${style.effectIntensity}%`} />
                                        <DetailRow label="Speed Range" value={`${style.speedRange[0]}x – ${style.speedRange[1]}x`} />
                                        <DetailRow label="Created" value={new Date(style.createdAt).toLocaleDateString()} />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

// ── Reusable controls ──

const SliderControl: React.FC<{
    label: string; value: number; min: number; max: number; step: number;
    onChange: (v: number) => void; unit?: string;
}> = ({ label, value, min, max, step, onChange, unit }) => (
    <div>
        <div className="flex justify-between mb-1">
            <span className="text-[10px] text-white/40">{label}</span>
            <span className="text-[10px] font-mono text-white/60">{value.toFixed(step < 1 ? 2 : 0)}{unit}</span>
        </div>
        <input type="range" min={min} max={max} step={step} value={value}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className="w-full h-1 rounded-full appearance-none cursor-pointer"
            style={{ accentColor: 'rgb(168,85,247)', background: 'rgba(255,255,255,0.1)' }}
        />
    </div>
);

const SelectControl: React.FC<{
    label: string; value: string; options: string[]; onChange: (v: string) => void;
}> = ({ label, value, options, onChange }) => (
    <div>
        <span className="text-[10px] text-white/40 block mb-1">{label}</span>
        <div className="flex flex-wrap gap-1">
            {options.map((opt) => (
                <button key={opt} onClick={() => onChange(opt)}
                    className={clsx(
                        'px-2 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider border transition-all',
                        value === opt
                            ? 'bg-purple-500/30 text-purple-300 border-purple-500/40'
                            : 'bg-white/5 text-white/40 border-white/5 hover:bg-white/10'
                    )}>
                    {opt}
                </button>
            ))}
        </div>
    </div>
);

const MiniStat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <div>
        <span className="text-[8px] text-white/30 uppercase tracking-wider block">{label}</span>
        <span className="text-[10px] text-white/60 font-mono">{value}</span>
    </div>
);

const DetailRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <div className="flex justify-between">
        <span className="text-[10px] text-white/30">{label}</span>
        <span className="text-[10px] text-white/60 font-mono">{value}</span>
    </div>
);
