/**
 * God-Tier Beat Synchronization Engine
 * Multi-band spectral analysis with segment detection, rhythm intelligence,
 * and energy contour mapping for professional cinematic editing.
 */

// ═══════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════

export type BeatType = 'kick' | 'snare' | 'hat' | 'bass' | 'transient';
export type SegmentType = 'intro' | 'buildup' | 'drop' | 'breakdown' | 'chorus' | 'verse' | 'outro' | 'bridge';
export type EnergyEvent = 'riser' | 'drop' | 'silence' | 'peak' | 'sustain' | 'steady';

export interface BeatMarker {
    time: number;       // Seconds
    energy: number;     // Normalized 0-1
    type: BeatType;     // Classification
    onGrid: boolean;    // Quantized to BPM grid
}

export interface Segment {
    start: number;      // Seconds
    end: number;
    type: SegmentType;
    avgEnergy: number;  // 0-1
    peakEnergy: number; // 0-1
    beatCount: number;
}

export interface EnergyContour {
    time: number;
    energy: number;     // 0-1
    event: EnergyEvent;
}

export interface AudioAnalysisResult {
    bpm: number;
    bpmConfidence: number;  // 0-1
    offset: number;         // Seconds to first beat
    beats: BeatMarker[];
    segments: Segment[];
    energyContour: EnergyContour[];
    waveformData: number[];  // Downsampled for UI (~2000 points)
    duration: number;
    peaks: BeatMarker[];     // Legacy compat
}

// ═══════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════

const BAND_LOW = { min: 20, max: 150 };      // Kick / Bass
const BAND_MID = { min: 150, max: 2000 };    // Snare / Vocals
const BAND_HIGH = { min: 2000, max: 16000 }; // Hi-hat / Cymbals

const ENERGY_WINDOW_MS = 50;           // 50ms energy windows
const CONTOUR_RESOLUTION_MS = 100;     // 100ms energy contour resolution
const SEGMENT_WINDOW_S = 4;            // 4-second segment analysis windows
const MIN_BEAT_DISTANCE_S = 0.08;      // Min 80ms between beats (~750 BPM cap)
const WAVEFORM_POINTS = 2000;          // Points for UI waveform
const AUTOCORR_MIN_BPM = 60;
const AUTOCORR_MAX_BPM = 200;

// ═══════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════

/** Render audio through a band-pass filter */
const renderBand = async (
    audioBuffer: AudioBuffer,
    lowFreq: number,
    highFreq: number
): Promise<Float32Array> => {
    const ctx = new OfflineAudioContext(1, audioBuffer.length, audioBuffer.sampleRate);
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;

    // Low-pass at highFreq
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = highFreq;
    lpf.Q.value = 0.7;

    // High-pass at lowFreq
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

/** Compute RMS energy for a window of samples */
const rmsEnergy = (data: Float32Array, start: number, length: number): number => {
    let sum = 0;
    const end = Math.min(start + length, data.length);
    for (let i = start; i < end; i++) {
        sum += data[i] * data[i];
    }
    return Math.sqrt(sum / (end - start));
};

/** Detect onsets using adaptive threshold on energy function */
const detectOnsets = (
    data: Float32Array,
    sampleRate: number,
    minDistanceS: number,
    sensitivityMultiplier = 1.5
): { time: number; energy: number }[] => {
    const windowSize = Math.floor((ENERGY_WINDOW_MS / 1000) * sampleRate);
    const energies: number[] = [];

    // Compute energy for each window
    for (let i = 0; i < data.length - windowSize; i += windowSize) {
        energies.push(rmsEnergy(data, i, windowSize));
    }

    if (energies.length === 0) return [];

    // Normalize
    const maxEnergy = Math.max(...energies, 0.001);
    const normalized = energies.map(e => e / maxEnergy);

    // Adaptive threshold: rolling average * multiplier
    const rollingWindow = 8; // ~400ms context
    const onsets: { time: number; energy: number }[] = [];

    for (let i = 0; i < normalized.length; i++) {
        // Compute local average
        const start = Math.max(0, i - rollingWindow);
        const end = Math.min(normalized.length, i + rollingWindow + 1);
        let localSum = 0;
        for (let j = start; j < end; j++) localSum += normalized[j];
        const localAvg = localSum / (end - start);

        const threshold = Math.max(localAvg * sensitivityMultiplier, 0.15);

        if (normalized[i] > threshold) {
            const time = (i * windowSize) / sampleRate;
            // Debounce
            if (onsets.length === 0 || (time - onsets[onsets.length - 1].time) > minDistanceS) {
                onsets.push({ time, energy: normalized[i] });
            }
        }
    }

    return onsets;
};

/** Autocorrelation BPM estimation — much more accurate than interval histogram */
const estimateBPM = (
    onsets: { time: number }[],
    duration: number
): { bpm: number; confidence: number } => {
    if (onsets.length < 4) return { bpm: 120, confidence: 0 };

    // Create onset signal (1-second resolution bins)
    const binSize = 0.01; // 10ms bins
    const numBins = Math.floor(duration / binSize);
    const signal = new Float32Array(numBins);

    for (const onset of onsets) {
        const bin = Math.floor(onset.time / binSize);
        if (bin < numBins) signal[bin] = 1;
    }

    // Autocorrelation for BPM range
    const minLag = Math.floor(60 / (AUTOCORR_MAX_BPM * binSize));
    const maxLag = Math.floor(60 / (AUTOCORR_MIN_BPM * binSize));

    let bestLag = minLag;
    let bestCorr = -1;
    let totalCorr = 0;
    let corrCount = 0;

    for (let lag = minLag; lag <= Math.min(maxLag, numBins / 2); lag++) {
        let corr = 0;
        let count = 0;
        for (let i = 0; i < numBins - lag; i++) {
            corr += signal[i] * signal[i + lag];
            count++;
        }
        const normalized = count > 0 ? corr / count : 0;
        totalCorr += normalized;
        corrCount++;

        if (normalized > bestCorr) {
            bestCorr = normalized;
            bestLag = lag;
        }
    }

    const avgCorr = corrCount > 0 ? totalCorr / corrCount : 0;
    const bpm = 60 / (bestLag * binSize);
    const confidence = avgCorr > 0 ? Math.min(bestCorr / (avgCorr * 3), 1) : 0;

    // Quantize to common BPM values (round to nearest integer)
    return { bpm: Math.round(bpm), confidence: Math.round(confidence * 100) / 100 };
};

/** Quantize beats to the BPM grid */
const quantizeToGrid = (
    beats: { time: number; energy: number }[],
    bpm: number,
    offset: number,
    toleranceMs = 50
): boolean[] => {
    const beatInterval = 60 / bpm;
    const toleranceS = toleranceMs / 1000;

    return beats.map(beat => {
        // Find nearest grid position
        const gridPos = Math.round((beat.time - offset) / beatInterval) * beatInterval + offset;
        return Math.abs(beat.time - gridPos) <= toleranceS;
    });
};

/** Classify a beat based on which frequency band triggered it */
const classifyBeat = (
    lowEnergy: number,
    midEnergy: number,
    highEnergy: number
): BeatType => {
    const max = Math.max(lowEnergy, midEnergy, highEnergy);
    if (max < 0.01) return 'transient';
    if (lowEnergy === max) return lowEnergy > 0.5 ? 'kick' : 'bass';
    if (midEnergy === max) return 'snare';
    return 'hat';
};

/** Detect segments from energy contour */
const detectSegments = (
    contour: EnergyContour[],
    duration: number,
    beats: BeatMarker[]
): Segment[] => {
    if (contour.length === 0) return [];

    const segmentWindowPoints = Math.floor(SEGMENT_WINDOW_S / (CONTOUR_RESOLUTION_MS / 1000));
    const segments: Segment[] = [];

    // Compute energy stats per window
    const windowStats: { start: number; end: number; avg: number; peak: number; trend: number }[] = [];

    for (let i = 0; i < contour.length; i += segmentWindowPoints) {
        const windowSlice = contour.slice(i, i + segmentWindowPoints);
        if (windowSlice.length === 0) continue;

        const avg = windowSlice.reduce((s, c) => s + c.energy, 0) / windowSlice.length;
        const peak = Math.max(...windowSlice.map(c => c.energy));

        // Trend: positive = rising, negative = falling
        const firstHalf = windowSlice.slice(0, Math.floor(windowSlice.length / 2));
        const secondHalf = windowSlice.slice(Math.floor(windowSlice.length / 2));
        const firstAvg = firstHalf.length > 0 ? firstHalf.reduce((s, c) => s + c.energy, 0) / firstHalf.length : 0;
        const secondAvg = secondHalf.length > 0 ? secondHalf.reduce((s, c) => s + c.energy, 0) / secondHalf.length : 0;
        const trend = secondAvg - firstAvg;

        windowStats.push({
            start: windowSlice[0].time,
            end: windowSlice[windowSlice.length - 1].time,
            avg, peak, trend
        });
    }

    if (windowStats.length === 0) return [];

    // Global energy stats for classification thresholds
    const globalAvg = windowStats.reduce((s, w) => s + w.avg, 0) / windowStats.length;
    const globalMax = Math.max(...windowStats.map(w => w.peak));

    const highThreshold = globalAvg + (globalMax - globalAvg) * 0.5;
    const lowThreshold = globalAvg * 0.6;

    // Classify each window
    for (let i = 0; i < windowStats.length; i++) {
        const w = windowStats[i];
        let type: SegmentType;

        const isFirst = i < 2;
        const isLast = i >= windowStats.length - 2;

        if (isFirst && w.avg < highThreshold) {
            type = 'intro';
        } else if (isLast && w.avg < highThreshold) {
            type = 'outro';
        } else if (w.avg >= highThreshold && w.peak >= globalMax * 0.7) {
            type = 'drop';
        } else if (w.trend > 0.1 && w.avg < highThreshold) {
            type = 'buildup';
        } else if (w.avg >= globalAvg && w.avg < highThreshold) {
            type = 'chorus';
        } else if (w.avg < lowThreshold) {
            type = 'breakdown';
        } else if (w.trend < -0.1) {
            type = 'bridge';
        } else {
            type = 'verse';
        }

        // Count beats in this segment
        const beatCount = beats.filter(b => b.time >= w.start && b.time <= w.end).length;

        // Merge with previous segment if same type
        if (segments.length > 0 && segments[segments.length - 1].type === type) {
            const prev = segments[segments.length - 1];
            prev.end = w.end;
            prev.avgEnergy = (prev.avgEnergy + w.avg) / 2;
            prev.peakEnergy = Math.max(prev.peakEnergy, w.peak);
            prev.beatCount += beatCount;
        } else {
            segments.push({
                start: w.start,
                end: w.end,
                type,
                avgEnergy: w.avg,
                peakEnergy: w.peak,
                beatCount
            });
        }
    }

    // Ensure coverage
    if (segments.length > 0) {
        segments[0].start = 0;
        segments[segments.length - 1].end = duration;
    }

    return segments;
};

/** Build energy contour with event classification */
const buildEnergyContour = (
    data: Float32Array,
    sampleRate: number
): EnergyContour[] => {
    const windowSize = Math.floor((CONTOUR_RESOLUTION_MS / 1000) * sampleRate);
    const contour: EnergyContour[] = [];

    for (let i = 0; i < data.length - windowSize; i += windowSize) {
        const energy = rmsEnergy(data, i, windowSize);
        const time = i / sampleRate;
        contour.push({ time, energy, event: 'steady' });
    }

    if (contour.length === 0) return [];

    // Normalize
    const maxE = Math.max(...contour.map(c => c.energy), 0.001);
    contour.forEach(c => c.energy = c.energy / maxE);

    // Classify events
    const smoothWindow = 5;
    for (let i = smoothWindow; i < contour.length - smoothWindow; i++) {
        const prev = contour.slice(i - smoothWindow, i).reduce((s, c) => s + c.energy, 0) / smoothWindow;
        const next = contour.slice(i + 1, i + smoothWindow + 1).reduce((s, c) => s + c.energy, 0) / smoothWindow;
        const curr = contour[i].energy;

        const rising = next - prev;

        if (curr < 0.05) {
            contour[i].event = 'silence';
        } else if (rising > 0.15) {
            contour[i].event = 'riser';
        } else if (rising < -0.15) {
            contour[i].event = 'drop';
        } else if (curr > 0.8) {
            contour[i].event = 'peak';
        } else if (curr > 0.5) {
            contour[i].event = 'sustain';
        }
    }

    return contour;
};

/** Downsample raw audio to ~2000 points for waveform UI */
const downsampleWaveform = (audioBuffer: AudioBuffer, targetPoints: number): number[] => {
    const raw = audioBuffer.getChannelData(0);
    const blockSize = Math.floor(raw.length / targetPoints);
    const result: number[] = [];

    for (let i = 0; i < targetPoints; i++) {
        const start = i * blockSize;
        let max = 0;
        for (let j = 0; j < blockSize && start + j < raw.length; j++) {
            const abs = Math.abs(raw[start + j]);
            if (abs > max) max = abs;
        }
        result.push(max);
    }

    // Normalize
    const maxVal = Math.max(...result, 0.001);
    return result.map(v => v / maxVal);
};

// ═══════════════════════════════════════════════════════
//  MAIN ANALYSIS FUNCTION
// ═══════════════════════════════════════════════════════

export const analyzeAudio = async (audioBuffer: AudioBuffer, beatSensitivity = 0.5): Promise<AudioAnalysisResult> => {
    const sampleRate = audioBuffer.sampleRate;
    const duration = audioBuffer.duration;

    // 1. Multi-band spectral decomposition (parallel)
    const [lowBand, midBand, highBand] = await Promise.all([
        renderBand(audioBuffer, BAND_LOW.min, BAND_LOW.max),
        renderBand(audioBuffer, BAND_MID.min, BAND_MID.max),
        renderBand(audioBuffer, BAND_HIGH.min, BAND_HIGH.max),
    ]);

    // 2. Detect onsets per band with adaptive thresholds
    // beatSensitivity: 0 = hard drops only (high threshold), 1 = detect everything (low threshold)
    // Scale the multiplier inversely: sensitivity 0 → multiplier 2.5×, sensitivity 1 → multiplier 0.8×
    const sensFactor = 2.5 - (beatSensitivity * 1.7); // Range: 0.8 to 2.5
    const lowOnsets = detectOnsets(lowBand, sampleRate, MIN_BEAT_DISTANCE_S, 1.4 * sensFactor);
    const midOnsets = detectOnsets(midBand, sampleRate, MIN_BEAT_DISTANCE_S, 1.6 * sensFactor);
    const highOnsets = detectOnsets(highBand, sampleRate, MIN_BEAT_DISTANCE_S, 2.0 * sensFactor);

    // 3. Merge and classify beats
    const allOnsets = new Map<number, { low: number; mid: number; high: number }>();

    const quantizeTime = (t: number) => Math.round(t * 100) / 100; // 10ms resolution

    for (const o of lowOnsets) {
        const key = quantizeTime(o.time);
        const existing = allOnsets.get(key) || { low: 0, mid: 0, high: 0 };
        existing.low = Math.max(existing.low, o.energy);
        allOnsets.set(key, existing);
    }
    for (const o of midOnsets) {
        const key = quantizeTime(o.time);
        const existing = allOnsets.get(key) || { low: 0, mid: 0, high: 0 };
        existing.mid = Math.max(existing.mid, o.energy);
        allOnsets.set(key, existing);
    }
    for (const o of highOnsets) {
        const key = quantizeTime(o.time);
        const existing = allOnsets.get(key) || { low: 0, mid: 0, high: 0 };
        existing.high = Math.max(existing.high, o.energy);
        allOnsets.set(key, existing);
    }

    // Sort by time and build beat markers
    const sortedTimes = [...allOnsets.keys()].sort((a, b) => a - b);
    const rawBeats: { time: number; energy: number; type: BeatType }[] = sortedTimes.map(t => {
        const bands = allOnsets.get(t)!;
        const energy = Math.max(bands.low, bands.mid, bands.high);
        const type = classifyBeat(bands.low, bands.mid, bands.high);
        return { time: t, energy, type };
    });

    // 4. BPM via autocorrelation
    const { bpm, confidence } = estimateBPM(rawBeats, duration);
    const offset = rawBeats.length > 0 ? rawBeats[0].time : 0;

    // 5. Quantize to grid
    const gridFlags = quantizeToGrid(rawBeats, bpm, offset);
    const beats: BeatMarker[] = rawBeats
        .filter(b => b.time <= duration) // Clamp: discard beats beyond audio end (fixes loop bug)
        .map((b, i) => ({
            ...b,
            onGrid: gridFlags[i] ?? false
        }));

    // 6. Energy contour from mixed signal (use original channel)
    const fullSignal = audioBuffer.getChannelData(0);
    const contour = buildEnergyContour(fullSignal, sampleRate);

    // 7. Segment detection
    const segments = detectSegments(contour, duration, beats);

    // 8. Waveform downsampling for UI
    const waveformData = downsampleWaveform(audioBuffer, WAVEFORM_POINTS);

    return {
        bpm,
        bpmConfidence: confidence,
        offset,
        beats,
        segments,
        energyContour: contour,
        waveformData,
        duration,
        peaks: beats, // Legacy compatibility
    };
};
