import React, { useCallback } from 'react';
import { RotateCcw, Volume2 } from 'lucide-react';
import { useClipStore } from '../../store/clipStore';
import { AudioEffects, DEFAULT_AUDIO_EFFECTS } from '../../lib/audioEffects';

// ══════════════════════════════════════════════════════════════════════════════
// AudioEffectsPanel — Panel for audio effects on a selected clip
// ══════════════════════════════════════════════════════════════════════════════

interface AudioEffectsPanelProps {
    clipId: string;
}

// ── Toggle Switch Component ─────────────────────────────────────────────────

const Toggle: React.FC<{ value: boolean; onChange: (v: boolean) => void }> = ({ value, onChange }) => (
    <button
        onClick={() => onChange(!value)}
        className={`w-8 h-4 rounded-full transition-colors relative flex-shrink-0 ${
            value ? 'bg-purple-500' : 'bg-white/20'
        }`}
    >
        <div
            className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                value ? 'translate-x-4' : 'translate-x-0.5'
            }`}
        />
    </button>
);

// ── Slider Component ────────────────────────────────────────────────────────

const Slider: React.FC<{
    label: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    unit?: string;
    disabled?: boolean;
    onChange: (v: number) => void;
}> = ({ label, value, min, max, step = 1, unit = '', disabled = false, onChange }) => (
    <div className={disabled ? 'opacity-40' : ''}>
        <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] text-white/40 uppercase tracking-wider">{label}</label>
            <span className="text-[10px] text-white/50 font-mono">
                {typeof value === 'number' && !isNaN(value) ? (step < 1 ? value.toFixed(1) : value) : 0}{unit}
            </span>
        </div>
        <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            disabled={disabled}
            className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-purple-500 disabled:cursor-not-allowed"
        />
    </div>
);

// ── Section Header ──────────────────────────────────────────────────────────

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div className="space-y-2">
        <h4 className="text-[10px] font-semibold text-white/50 uppercase tracking-widest border-b border-white/5 pb-1">
            {title}
        </h4>
        {children}
    </div>
);

// ── Main Panel ──────────────────────────────────────────────────────────────

export const AudioEffectsPanel: React.FC<AudioEffectsPanelProps> = ({ clipId }) => {
    const { clips, setAudioEffects, resetAudioEffects } = useClipStore();
    const clip = clips.find((c) => c.id === clipId);

    if (!clip) return null;

    const effects: AudioEffects = (clip as any).audioEffects || { ...DEFAULT_AUDIO_EFFECTS };

    const update = useCallback(
        (updates: Partial<AudioEffects>) => {
            setAudioEffects(clipId, { ...effects, ...updates });
        },
        [clipId, effects, setAudioEffects]
    );

    const handleReset = () => {
        resetAudioEffects(clipId);
    };

    return (
        <div className="bg-black/50 border border-white/10 rounded-xl p-3 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Volume2 size={14} className="text-purple-400" />
                    <span className="text-xs font-semibold text-white/80 uppercase tracking-wider">
                        Audio Effects
                    </span>
                </div>
                <button
                    onClick={handleReset}
                    className="flex items-center gap-1 px-2 py-1 text-[10px] text-white/40 hover:text-white/70 hover:bg-white/5 rounded-md transition-colors"
                    title="Reset All Effects"
                >
                    <RotateCcw size={10} />
                    Reset
                </button>
            </div>

            {/* 1. Equalizer */}
            <Section title="Equalizer">
                <Slider
                    label="Low (100Hz)"
                    value={effects.eqLow}
                    min={-20}
                    max={20}
                    unit=" dB"
                    onChange={(v) => update({ eqLow: v })}
                />
                <Slider
                    label="Mid (1kHz)"
                    value={effects.eqMid}
                    min={-20}
                    max={20}
                    unit=" dB"
                    onChange={(v) => update({ eqMid: v })}
                />
                <Slider
                    label="High (8kHz)"
                    value={effects.eqHigh}
                    min={-20}
                    max={20}
                    unit=" dB"
                    onChange={(v) => update({ eqHigh: v })}
                />
            </Section>

            {/* 2. Filters */}
            <Section title="Filters">
                <Slider
                    label="High Pass"
                    value={effects.highpassFreq}
                    min={0}
                    max={500}
                    step={10}
                    unit=" Hz"
                    onChange={(v) => update({ highpassFreq: v })}
                />
                <Slider
                    label="Low Pass"
                    value={effects.lowpassFreq}
                    min={0}
                    max={20000}
                    step={100}
                    unit=" Hz"
                    onChange={(v) => update({ lowpassFreq: v })}
                />
            </Section>

            {/* 3. Dynamics */}
            <Section title="Dynamics">
                <div className="flex items-center justify-between">
                    <label className="text-[10px] text-white/40 uppercase tracking-wider">Compressor</label>
                    <Toggle value={effects.compressor} onChange={(v) => update({ compressor: v })} />
                </div>
                <Slider
                    label="Threshold"
                    value={effects.compressorThreshold}
                    min={-50}
                    max={0}
                    unit=" dB"
                    disabled={!effects.compressor}
                    onChange={(v) => update({ compressorThreshold: v })}
                />
                <Slider
                    label="Ratio"
                    value={effects.compressorRatio}
                    min={1}
                    max={20}
                    unit=":1"
                    disabled={!effects.compressor}
                    onChange={(v) => update({ compressorRatio: v })}
                />
                <div className="flex items-center justify-between pt-1">
                    <label className="text-[10px] text-white/40 uppercase tracking-wider">Noise Gate</label>
                    <Toggle value={effects.gate ?? false} onChange={(v) => update({ gate: v })} />
                </div>
                <Slider
                    label="Gate Threshold"
                    value={effects.gateThreshold ?? -50}
                    min={-80}
                    max={0}
                    unit=" dB"
                    disabled={!effects.gate}
                    onChange={(v) => update({ gateThreshold: v })}
                />
                <div className="flex items-center justify-between pt-1">
                    <label className="text-[10px] text-white/40 uppercase tracking-wider">Limiter</label>
                    <Toggle value={effects.limiter ?? false} onChange={(v) => update({ limiter: v })} />
                </div>
                <Slider
                    label="Ceiling"
                    value={effects.limiterLevel ?? 0.95}
                    min={0.1}
                    max={1.0}
                    step={0.01}
                    disabled={!effects.limiter}
                    onChange={(v) => update({ limiterLevel: v })}
                />
            </Section>

            {/* 4. Noise Reduction */}
            <Section title="Noise Reduction">
                <Slider
                    label="Intensity"
                    value={effects.noiseReduction}
                    min={0}
                    max={97}
                    onChange={(v) => update({ noiseReduction: v })}
                />
            </Section>

            {/* 5. Normalization */}
            <Section title="Normalization">
                <div className="flex items-center justify-between">
                    <label className="text-[10px] text-white/40 uppercase tracking-wider">
                        Loudness Norm (EBU R128)
                    </label>
                    <Toggle value={effects.loudnessNorm} onChange={(v) => update({ loudnessNorm: v })} />
                </div>
                <div className={effects.loudnessNorm ? '' : 'opacity-40'}>
                    <label className="text-[10px] text-white/40 uppercase tracking-wider block mb-1">Target</label>
                    <div className="grid grid-cols-3 gap-1">
                        {[
                            { lbl: 'YouTube', val: -14 },
                            { lbl: 'Podcast', val: -16 },
                            { lbl: 'Broadcast', val: -23 },
                        ].map((pr) => (
                            <button
                                key={pr.val}
                                disabled={!effects.loudnessNorm}
                                onClick={() => update({ loudnessTarget: pr.val })}
                                className={`text-[9px] py-1 rounded-md transition-colors disabled:cursor-not-allowed ${
                                    (effects.loudnessTarget ?? -14) === pr.val
                                        ? 'bg-purple-500/30 text-purple-200 border border-purple-500/40'
                                        : 'bg-white/5 text-white/50 hover:bg-white/10 border border-transparent'
                                }`}
                            >
                                {pr.lbl} {pr.val}
                            </button>
                        ))}
                    </div>
                </div>
            </Section>

            {/* 6. Fades */}
            <Section title="Fades">
                <Slider
                    label="Fade In"
                    value={effects.fadeInDuration}
                    min={0}
                    max={5}
                    step={0.1}
                    unit="s"
                    onChange={(v) => update({ fadeInDuration: v })}
                />
                <Slider
                    label="Fade Out"
                    value={effects.fadeOutDuration}
                    min={0}
                    max={5}
                    step={0.1}
                    unit="s"
                    onChange={(v) => update({ fadeOutDuration: v })}
                />
            </Section>

            {/* 7. Effects */}
            <Section title="Effects">
                <div className="flex items-center justify-between">
                    <label className="text-[10px] text-white/40 uppercase tracking-wider">Echo</label>
                    <Toggle value={effects.echo} onChange={(v) => update({ echo: v })} />
                </div>
                <Slider
                    label="Delay"
                    value={effects.echoDelay}
                    min={50}
                    max={1000}
                    step={10}
                    unit=" ms"
                    disabled={!effects.echo}
                    onChange={(v) => update({ echoDelay: v })}
                />
                <Slider
                    label="Decay"
                    value={effects.echoDecay}
                    min={0.1}
                    max={0.9}
                    step={0.05}
                    disabled={!effects.echo}
                    onChange={(v) => update({ echoDecay: v })}
                />
            </Section>
        </div>
    );
};
