import React from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { DEFAULT_AUDIO_EFFECTS, AudioEffects } from '../../lib/audioEffects';
import type { TrailerSettings } from '../../lib/trailerGenerator';

interface Props { settings: TrailerSettings; update: (patch: Partial<TrailerSettings>) => void; }

/** Mini animated meter visualizing how a dynamics stage shapes the signal. */
const Meter: React.FC<{ kind: 'gate' | 'limiter' | 'loudness'; active: boolean }> = ({ kind, active }) => {
    const bars = 14;
    return (
        <div className="flex items-end gap-[2px] h-6 mt-1" aria-hidden>
            {Array.from({ length: bars }).map((_, i) => {
                const base = 0.35 + 0.55 * Math.abs(Math.sin((i / bars) * Math.PI * 1.6));
                // gate: zero out the quiet (left) bars; limiter: cap the loud (tall) bars; loudness: even out
                let h = base;
                if (kind === 'gate') h = base < 0.5 ? 0.08 : base;
                else if (kind === 'limiter') h = Math.min(base, 0.78);
                else if (kind === 'loudness') h = 0.45 + base * 0.25;
                const color = !active ? 'bg-white/10'
                    : kind === 'gate' ? 'bg-cyan-400/70'
                    : kind === 'limiter' ? 'bg-amber-400/70'
                    : 'bg-emerald-400/70';
                return <div key={i} className={`w-full rounded-sm transition-all ${color} ${active ? 'animate-pulse' : ''}`}
                    style={{ height: `${Math.round(h * 100)}%`, animationDelay: `${i * 40}ms` }} />;
            })}
            {kind === 'limiter' && active && <div className="absolute" />}
        </div>
    );
};

export const TrailerAudioDynamics: React.FC<Props> = ({ settings, update }) => {
    const audio: AudioEffects = { ...DEFAULT_AUDIO_EFFECTS, ...((settings.globalAudioEffects as any) || {}) };
    const setAudio = (patch: Partial<AudioEffects>) => update({ globalAudioEffects: { ...audio, ...patch } as any });

    const Toggle: React.FC<{ label: string; on: boolean; onChange: (v: boolean) => void }> = ({ label, on, onChange }) => (
        <label className="flex items-center justify-between cursor-pointer">
            <span className="text-[11px] font-bold uppercase tracking-wide text-white/70">{label}</span>
            <div className="relative">
                <input type="checkbox" className="sr-only" checked={on} onChange={(e) => onChange(e.target.checked)} />
                <div className={`w-10 h-5 rounded-full transition-colors ${on ? 'bg-purple-500' : 'bg-black border border-white/20'}`}>
                    <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </div>
            </div>
        </label>
    );

    return (
        <div className="pt-3 mt-1 border-t border-white/10 space-y-3">
            <div className="flex items-center gap-2">
                <SlidersHorizontal size={14} className="text-purple-400" />
                <span className="text-xs font-bold text-white">Audio Dynamics</span>
                <span className="text-[9px] text-white/35 ml-auto">applied to the mixed soundtrack</span>
            </div>

            <div className="bg-black/30 rounded-lg p-2.5 relative">
                <Toggle label="Noise Gate" on={audio.gate ?? false} onChange={(v) => setAudio({ gate: v })} />
                <p className="text-[10px] text-white/40 mt-1">Silences signal below the threshold — kills hiss and room tone between hits.</p>
                <Meter kind="gate" active={audio.gate ?? false} />
            </div>

            <div className="bg-black/30 rounded-lg p-2.5 relative">
                <Toggle label="Limiter" on={audio.limiter ?? false} onChange={(v) => setAudio({ limiter: v })} />
                <p className="text-[10px] text-white/40 mt-1">Brick-wall ceiling on peaks so the track never clips after beats/effects.</p>
                <Meter kind="limiter" active={audio.limiter ?? false} />
            </div>

            <div className="bg-black/30 rounded-lg p-2.5 relative">
                <Toggle label="Loudness Normalize" on={audio.loudnessNorm ?? false} onChange={(v) => setAudio({ loudnessNorm: v })} />
                <p className="text-[10px] text-white/40 mt-1">EBU R128 normalization to a platform target so every export lands at the same perceived volume.</p>
                <Meter kind="loudness" active={audio.loudnessNorm ?? false} />
                {audio.loudnessNorm && (
                    <div className="grid grid-cols-3 gap-1 pt-2">
                        {[{ l: 'YouTube', v: -14 }, { l: 'Podcast', v: -16 }, { l: 'Broadcast', v: -23 }].map((p) => (
                            <button key={p.v} onClick={() => setAudio({ loudnessTarget: p.v })}
                                className={`text-[9px] py-1 rounded ${(audio.loudnessTarget ?? -14) === p.v ? 'bg-purple-500/30 text-white' : 'bg-white/5 text-white/50 hover:bg-white/10'}`}>{p.l}<br />{p.v} LUFS</button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
