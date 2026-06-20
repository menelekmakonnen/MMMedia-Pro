/**
 * Beat Intelligence Engine — Web-Audio Shell
 * ════════════════════════════════════════════════════════════════════════════
 * Thin wrapper around the pure DSP core (audioAnalysisCore.ts):
 *   1. Decode the AudioBuffer into a mono downmix + three band-pass signals
 *      (this is the only part that needs Web Audio / OfflineAudioContext).
 *   2. Hand the raw Float32Arrays to the core — preferably inside a Web Worker
 *      so the heavy synchronous DSP never blocks the UI thread.
 *   3. Fall back to inline execution if a worker can't be created.
 *
 * The public surface (analyzeAudio, types, analyzeRhythmConsistency,
 * detectPhrases) is unchanged so existing call-sites keep working.
 */

import {
    analyzeBands,
    type AudioAnalysisResult,
    type BandSignals,
} from './audioAnalysisCore';

// Re-export the full type + helper surface so importers don't need to change.
export type {
    BeatType,
    SegmentType,
    EnergyEvent,
    BeatMarker,
    Segment,
    EnergyContour,
    BpmCandidate,
    AudioAnalysisResult,
    RhythmProfile,
    MusicPhrase,
} from './audioAnalysisCore';
export {
    analyzeRhythmConsistency,
    detectPhrases,
    analyzeBands,
    arrayMax,
    arrayMin,
} from './audioAnalysisCore';

// ─── Band definitions ──────────────────────────────────────────────────────
const BAND_LOW = { min: 20, max: 150 };      // Kick / Bass
const BAND_MID = { min: 150, max: 2000 };    // Snare / Vocals
const BAND_HIGH = { min: 2000, max: 16000 }; // Hi-hat / Cymbals

/** Render audio through a band-pass filter (Web Audio, off the main JS thread). */
const renderBand = async (
    audioBuffer: AudioBuffer,
    lowFreq: number,
    highFreq: number,
): Promise<Float32Array> => {
    const ctx = new OfflineAudioContext(1, audioBuffer.length, audioBuffer.sampleRate);
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;

    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = highFreq;
    lpf.Q.value = 0.7;

    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = lowFreq;
    hpf.Q.value = 0.7;

    source.connect(hpf);
    hpf.connect(lpf);
    lpf.connect(ctx.destination);
    source.start(0);

    const rendered = await ctx.startRendering();
    return rendered.getChannelData(0);
};

/** Average all channels into a single mono Float32Array (stereo-aware). */
const downmixMono = (audioBuffer: AudioBuffer): Float32Array => {
    const channels = audioBuffer.numberOfChannels;
    if (channels === 1) return audioBuffer.getChannelData(0).slice();
    const len = audioBuffer.length;
    const out = new Float32Array(len);
    for (let c = 0; c < channels; c++) {
        const data = audioBuffer.getChannelData(c);
        for (let i = 0; i < len; i++) out[i] += data[i];
    }
    for (let i = 0; i < len; i++) out[i] /= channels;
    return out;
};

// ─── Worker orchestration ──────────────────────────────────────────────────

let worker: Worker | null = null;
let workerUnavailable = false;
let reqId = 0;

function getWorker(): Worker | null {
    if (workerUnavailable) return null;
    if (worker) return worker;
    try {
        // Vite resolves this URL at build time and bundles the worker.
        worker = new Worker(new URL('./audioAnalysis.worker.ts', import.meta.url), { type: 'module' });
        return worker;
    } catch {
        workerUnavailable = true;
        return null;
    }
}

function runInWorker(bands: BandSignals, beatSensitivity: number): Promise<AudioAnalysisResult> {
    const w = getWorker();
    if (!w) return Promise.reject(new Error('worker-unavailable'));

    return new Promise<AudioAnalysisResult>((resolve, reject) => {
        const id = ++reqId;
        const timeout = setTimeout(() => {
            w.removeEventListener('message', onMsg);
            reject(new Error('worker-timeout'));
        }, 60_000);

        const onMsg = (ev: MessageEvent) => {
            const data = ev.data as { id: number; ok: boolean; result?: AudioAnalysisResult; error?: string };
            if (!data || data.id !== id) return;
            clearTimeout(timeout);
            w.removeEventListener('message', onMsg);
            if (data.ok && data.result) resolve(data.result);
            else reject(new Error(data.error || 'worker-error'));
        };
        w.addEventListener('message', onMsg);

        // Transfer the underlying buffers (zero-copy) — they aren't reused here.
        w.postMessage(
            { id, bands, beatSensitivity },
            [bands.mono.buffer, bands.low.buffer, bands.mid.buffer, bands.high.buffer],
        );
    });
}

// ─── Public entry ──────────────────────────────────────────────────────────

/**
 * Analyze an AudioBuffer for tempo, beat grid, downbeats and song structure.
 * @param audioBuffer    Decoded audio.
 * @param beatSensitivity 0 = hard drops only … 1 = detect everything (default 0.5).
 */
export const analyzeAudio = async (
    audioBuffer: AudioBuffer,
    beatSensitivity = 0.5,
): Promise<AudioAnalysisResult> => {
    const sampleRate = audioBuffer.sampleRate;
    const duration = audioBuffer.duration;

    // Band decomposition + downmix on the main thread (Web Audio is required here,
    // but startRendering runs off the JS thread so the UI stays responsive).
    const [low, mid, high] = await Promise.all([
        renderBand(audioBuffer, BAND_LOW.min, BAND_LOW.max),
        renderBand(audioBuffer, BAND_MID.min, BAND_MID.max),
        renderBand(audioBuffer, BAND_HIGH.min, BAND_HIGH.max),
    ]);
    const mono = downmixMono(audioBuffer);

    const bands: BandSignals = { mono, low, mid, high, sampleRate, duration };

    // Prefer the worker; fall back to inline if it can't run.
    try {
        return await runInWorker(bands, beatSensitivity);
    } catch {
        return analyzeBands(bands, beatSensitivity);
    }
};
