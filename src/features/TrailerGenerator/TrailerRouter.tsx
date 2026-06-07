import React, { useState, useEffect, useRef } from 'react';
import { TrailerWizard } from './TrailerWizard';
import { TrailerPlayer } from './TrailerPlayer';
import { TrailerSettings, generateTrailerSequence, extractBeatTimestamps } from '../../lib/trailerGenerator';
import { generateSeed } from '../../lib/random';
import { useClipStore } from '../../store/clipStore';
import { useMediaStore } from '../../store/mediaStore';
import { useGodModeStore } from '../../store/godModeStore';

export const TrailerRouter: React.FC = () => {
    const [activeView, setActiveView] = useState<'wizard' | 'player'>('wizard');
    const [settings, setSettings] = useState<TrailerSettings | null>(null);
    const [preGeneratedClips, setPreGeneratedClips] = useState<any[]>([]);
    const { setClips } = useClipStore();
    const { files } = useMediaStore();
    const autoGenerateConsumed = useRef(false);

    // ── AUTO-GENERATE: if GodMode tab pre-built settings, skip wizard ──
    const { autoGenerate, lastGeneratedSettings, clearAutoGenerate } = useGodModeStore();

    useEffect(() => {
        if (autoGenerate && lastGeneratedSettings && !autoGenerateConsumed.current) {
            autoGenerateConsumed.current = true;
            clearAutoGenerate();
            handleGenerate(lastGeneratedSettings);
        }
    }, [autoGenerate, lastGeneratedSettings]);

    const handleGenerate = async (newSettings: TrailerSettings) => {
        if (!newSettings.seed) {
            newSettings.seed = generateSeed();
        }
        setSettings(newSettings);

        // Generate clips and push to timeline
        let beatTimestamps = newSettings.beatTimestamps;
        if (newSettings.useAudioGuide && newSettings.audioUrl && !beatTimestamps) {
            // If we already have pre-computed audio analysis (from GodMode or Wizard),
            // extract beats directly — avoids fetch() on file:// URLs which fails in Electron
            if (newSettings.audioAnalysis && newSettings.audioAnalysis.beats?.length > 0) {
                const trimStart = newSettings.audioTrimStart || 0;
                const trimEnd = newSettings.audioTrimEnd || 30;
                const safeTrimEnd = Math.min(trimEnd, newSettings.audioAnalysis.duration);
                beatTimestamps = newSettings.audioAnalysis.beats
                    .filter(b => b.time >= trimStart && b.time <= safeTrimEnd)
                    .map(b => b.time - trimStart);
                if (beatTimestamps.length === 0 || beatTimestamps[0] > 0.5) beatTimestamps.unshift(0);
                const duration = safeTrimEnd - trimStart;
                if (beatTimestamps[beatTimestamps.length - 1] < duration - 0.5) beatTimestamps.push(duration);
                console.log(`[TrailerRouter] Extracted ${beatTimestamps.length} beats from pre-computed analysis`);
            } else {
                // Fallback: try extractBeatTimestamps (may fail with file:// URLs)
                beatTimestamps = await extractBeatTimestamps(
                    newSettings.audioUrl,
                    newSettings.audioTrimStart || 0,
                    newSettings.audioTrimEnd || 30,
                    newSettings.audioAnalysis
                );
            }
        }

        // ── MEDIA SELECTION LOGIC ──────────────────────────────────────────
        // If the user selected specific files in the Media Library (via Ctrl/Shift click),
        // only those files are used for generation. If nothing is selected, use all files.
        const { selectedFileIds } = useMediaStore.getState();
        const pool = selectedFileIds.length > 0
            ? files.filter(f => selectedFileIds.includes(f.id))
            : files;

        const clips = generateTrailerSequence(pool, { ...newSettings, beatTimestamps });
        setPreGeneratedClips(clips);
        if (clips.length > 0) {
            // ⚠ EXPORT PIPELINE: Preserve existing audio clips (track 2) from the store.
            // generateTrailerSequence() only produces video clips. If the user imported
            // background music via the Media Manager, those audio clips live on track 2
            // and must NOT be wiped when replacing the video sequence.
            const { clips: existingClips } = useClipStore.getState();
            const existingAudioClips = existingClips.filter(c => c.type === 'audio');
            setClips([...clips as any, ...existingAudioClips]);
        }

        setActiveView('player');
    };

    const handleDiscard = () => {
        setSettings(null);
        setActiveView('wizard');
    };

    const handleSettings = () => {
        setActiveView('wizard');
    };

    return (
        <div className="w-full h-full bg-[#050505]">
            {activeView === 'wizard' || !settings ? (
                <TrailerWizard onGenerate={handleGenerate} />
            ) : (
                <TrailerPlayer 
                    settings={settings} 
                    preGeneratedClips={preGeneratedClips}
                    onDiscard={handleDiscard} 
                    onSettings={handleSettings} 
                />
            )}
        </div>
    );
};
