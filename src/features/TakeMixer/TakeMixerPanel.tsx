import React, { useState, useMemo, useCallback } from 'react';
import { useClipStore, Clip } from '../../store/clipStore';
import { useMediaStore } from '../../store/mediaStore';
import { useProjectStore } from '../../store/projectStore';
import { DEFAULT_FPS } from '../../lib/time';
import { SeededRandom, generateSeed } from '../../lib/random';
import { v4 as uuidv4 } from 'uuid';
import {
    Layers, RefreshCw, ArrowLeftRight, Clock, Film, Hash,
    Shuffle, Loader
} from 'lucide-react';
import clsx from 'clsx';

interface Take {
    id: string;
    seed: string;
    clips: Clip[];
    clipCount: number;
    totalDuration: number; // seconds
    transitionCount: number;
}

export const TakeMixerPanel: React.FC = () => {
    const { clips: mainClips, setClips: setMainClips } = useClipStore();
    const { files: mediaFiles } = useMediaStore();
    const { settings } = useProjectStore();
    const fps = settings?.fps || DEFAULT_FPS;

    const [takes, setTakes] = useState<Take[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);

    const baseSeed = settings.seed || generateSeed();

    const videoMediaFiles = useMemo(() =>
        mediaFiles.filter(f => f.type === 'video' || f.type === 'image'),
        [mediaFiles]
    );

    const generateTakes = useCallback(() => {
        if (videoMediaFiles.length === 0) return;
        setIsGenerating(true);

        // Generate 5 alternate timelines with different seeds
        const newTakes: Take[] = [];

        for (let t = 0; t < 5; t++) {
            const seed = `${baseSeed}_take_${t + 1}_${Date.now()}`;
            const rng = new SeededRandom(seed);

            const numClips = rng.randInt(5, Math.min(15, videoMediaFiles.length * 2));
            const generatedClips: Clip[] = [];
            let currentFrame = 0;

            for (let i = 0; i < numClips; i++) {
                const sourceFile = rng.choice(videoMediaFiles);
                if (!sourceFile) continue;

                const sourceDurationFrames = Math.floor((sourceFile.duration || 10) * fps);
                const minFrames = Math.max(1, Math.floor(1 * fps));
                const maxFrames = Math.min(Math.floor(8 * fps), sourceDurationFrames);

                if (maxFrames <= minFrames) continue;

                const durationFrames = rng.randInt(minFrames, maxFrames);
                const maxStart = Math.max(0, sourceDurationFrames - durationFrames);
                const trimStart = rng.randInt(0, maxStart);

                generatedClips.push({
                    id: uuidv4(),
                    type: sourceFile.type as 'video' | 'image',
                    path: sourceFile.path,
                    filename: sourceFile.filename,
                    startFrame: currentFrame,
                    endFrame: currentFrame + durationFrames,
                    sourceDurationFrames,
                    trimStartFrame: trimStart,
                    trimEndFrame: trimStart + durationFrames,
                    track: 1,
                    speed: 1.0,
                    volume: 100,
                    reversed: rng.random() < 0.1, // 10% chance of reverse
                    locked: false,
                    origin: 'auto',
                });

                currentFrame += durationFrames;
            }

            const totalDuration = currentFrame / fps;
            const transitionCount = Math.max(0, generatedClips.length - 1);

            newTakes.push({
                id: uuidv4(),
                seed,
                clips: generatedClips,
                clipCount: generatedClips.length,
                totalDuration,
                transitionCount,
            });
        }

        setTakes(newTakes);
        setIsGenerating(false);
    }, [videoMediaFiles, baseSeed, fps]);

    const swapClipIntoMain = useCallback((takeId: string, clipIndex: number) => {
        const take = takes.find(t => t.id === takeId);
        if (!take) return;
        const takeClip = take.clips[clipIndex];
        if (!takeClip) return;

        // Find main timeline video clips
        const mainVideoClips = mainClips.filter(c => c.type !== 'audio');
        const mainAudioClips = mainClips.filter(c => c.type === 'audio');

        if (clipIndex < mainVideoClips.length) {
            // Replace existing clip at same index
            const target = mainVideoClips[clipIndex];
            const newClip: Clip = {
                ...takeClip,
                id: target.id, // Keep the same ID for stability
                startFrame: target.startFrame,
                endFrame: target.startFrame + (takeClip.endFrame - takeClip.startFrame),
                origin: 'manual',
            };
            const updatedVideoClips = mainVideoClips.map((c, i) => i === clipIndex ? newClip : c);
            setMainClips([...updatedVideoClips, ...mainAudioClips]);
        } else {
            // Append as new clip at end
            const lastEnd = mainVideoClips.length > 0 ? Math.max(...mainVideoClips.map(c => c.endFrame)) : 0;
            const duration = takeClip.endFrame - takeClip.startFrame;
            const newClip: Clip = {
                ...takeClip,
                id: uuidv4(),
                startFrame: lastEnd,
                endFrame: lastEnd + duration,
                origin: 'manual',
            };
            setMainClips([...mainClips, newClip]);
        }
    }, [takes, mainClips, setMainClips]);

    return (
        <div className="w-full h-full overflow-y-auto custom-scrollbar">
            <div className="p-4 space-y-4">

                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-md" style={{ background: 'rgba(34,197,94,0.15)' }}>
                            <Layers size={14} className="text-green-400" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-white">Take Mixer</h3>
                            <p className="text-[10px] text-white/40">Generate alternate timeline variations</p>
                        </div>
                    </div>
                </div>

                {/* Generate button */}
                <button
                    onClick={generateTakes}
                    disabled={isGenerating || videoMediaFiles.length === 0}
                    className={clsx(
                        'w-full flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border',
                        videoMediaFiles.length === 0
                            ? 'bg-white/5 text-white/20 border-white/5 cursor-not-allowed'
                            : 'bg-green-600/20 text-green-300 border-green-500/30 hover:bg-green-600/40 shadow-[0_0_15px_rgba(34,197,94,0.1)]'
                    )}
                >
                    {isGenerating ? (
                        <><Loader size={14} className="animate-spin" /> Generating...</>
                    ) : (
                        <><Shuffle size={14} /> Generate 5 Takes</>
                    )}
                </button>

                {videoMediaFiles.length === 0 && (
                    <p className="text-center text-[10px] text-white/30">Import media files first to generate takes.</p>
                )}

                {/* Takes */}
                {takes.length > 0 && (
                    <div className="space-y-3">
                        {takes.map((take, takeIdx) => (
                            <div key={take.id}
                                className="border border-white/5 rounded-xl bg-black/20 p-3 space-y-2 hover:border-white/10 transition-all"
                            >
                                {/* Take header */}
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-white">Take {takeIdx + 1}</span>
                                        <span className="text-[9px] font-mono text-white/20">{take.seed.slice(-8)}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <TakeStat icon={<Film size={10} />} value={`${take.clipCount}`} label="clips" />
                                        <TakeStat icon={<Clock size={10} />} value={`${take.totalDuration.toFixed(1)}s`} label="dur" />
                                        <TakeStat icon={<ArrowLeftRight size={10} />} value={`${take.transitionCount}`} label="trans" />
                                    </div>
                                </div>

                                {/* Mini timeline strip */}
                                <div className="relative h-8 bg-black/40 rounded-lg overflow-hidden border border-white/5">
                                    {take.clips.map((clip, clipIdx) => {
                                        const totalFrames = take.clips.length > 0
                                            ? Math.max(...take.clips.map(c => c.endFrame))
                                            : 1;
                                        const left = (clip.startFrame / totalFrames) * 100;
                                        const width = ((clip.endFrame - clip.startFrame) / totalFrames) * 100;

                                        return (
                                            <button
                                                key={clip.id}
                                                onClick={() => swapClipIntoMain(take.id, clipIdx)}
                                                className="absolute top-0.5 bottom-0.5 rounded cursor-pointer hover:brightness-125 transition-all group"
                                                style={{
                                                    left: `${left}%`,
                                                    width: `${Math.max(width, 0.5)}%`,
                                                    background: `hsl(${(clipIdx * 37) % 360}, 50%, 35%)`,
                                                }}
                                                title={`${clip.filename} — Click to swap into main timeline`}
                                            >
                                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <ArrowLeftRight size={8} className="text-white" />
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Clip labels (scrollable) */}
                                <div className="flex gap-1 overflow-x-auto custom-scrollbar pb-0.5">
                                    {take.clips.slice(0, 8).map((clip, clipIdx) => (
                                        <button
                                            key={clip.id}
                                            onClick={() => swapClipIntoMain(take.id, clipIdx)}
                                            className="shrink-0 px-1.5 py-0.5 rounded text-[8px] font-mono text-white/40 bg-white/5 hover:bg-white/10 hover:text-white/60 transition-all truncate max-w-[80px]"
                                            title={clip.filename}
                                        >
                                            {clip.filename.split('.')[0]}
                                        </button>
                                    ))}
                                    {take.clips.length > 8 && (
                                        <span className="shrink-0 px-1.5 py-0.5 text-[8px] text-white/20">+{take.clips.length - 8}</span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

const TakeStat: React.FC<{ icon: React.ReactNode; value: string; label: string }> = ({ icon, value, label }) => (
    <div className="flex items-center gap-1">
        <span className="text-white/30">{icon}</span>
        <span className="text-[10px] font-mono text-white/50">{value}</span>
        <span className="text-[8px] text-white/20">{label}</span>
    </div>
);
