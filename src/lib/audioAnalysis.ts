
/**
 * Analyze audio buffer to detect peaks and estimate BPM.
 * This is a simplified beat detection algorithm suitable for client-side use.
 */

export interface BeatMarker {
    time: number; // Seconds
    energy: number; // Normalized 0-1
}

export interface AudioAnalysisResult {
    bpm: number;
    peaks: BeatMarker[];
    offset: number; // Seconds to first beat
}

// Low-pass filter to isolate beat frequencies (kick drum, bass)
const LOW_PASS_FREQUENCY = 150;

export const analyzeAudio = async (audioBuffer: AudioBuffer): Promise<AudioAnalysisResult> => {
    const offlineContext = new OfflineAudioContext(1, audioBuffer.length, audioBuffer.sampleRate);
    const source = offlineContext.createBufferSource();
    source.buffer = audioBuffer;

    // Filter
    const filter = offlineContext.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = LOW_PASS_FREQUENCY;

    source.connect(filter);
    filter.connect(offlineContext.destination);
    source.start(0);

    const renderedBuffer = await offlineContext.startRendering();
    const data = renderedBuffer.getChannelData(0);

    // Peak Detection
    const peaks: BeatMarker[] = [];
    const threshold = 0.3; // Minimum energy threshold
    const minDistance = 0.25; // Seconds between beats (max 240 BPM)

    // Window size for energy calculation (e.g., 50ms)
    const windowSize = Math.floor(0.05 * audioBuffer.sampleRate);

    for (let i = 0; i < data.length - windowSize; i += windowSize) {
        let sum = 0;
        for (let j = 0; j < windowSize; j++) {
            sum += Math.abs(data[i + j]);
        }
        const energy = sum / windowSize;

        if (energy > threshold) {
            const time = i / audioBuffer.sampleRate;

            // Debounce
            if (peaks.length === 0 || (time - peaks[peaks.length - 1].time > minDistance)) {
                peaks.push({ time, energy });
            }
        }
    }

    // BPM Estimation (Interval Histogram)
    const intervals: number[] = [];
    for (let i = 1; i < peaks.length; i++) {
        intervals.push(peaks[i].time - peaks[i - 1].time);
    }

    // Group intervals
    const histogram: Record<string, number> = {};
    intervals.forEach(interval => {
        const rounded = Math.round(interval * 10) / 10; // Round to 0.1s
        histogram[rounded] = (histogram[rounded] || 0) + 1;
    });

    // Find most common interval
    let maxCount = 0;
    let bestInterval = 0.5; // Default 120 BPM

    Object.entries(histogram).forEach(([interval, count]) => {
        if (count > maxCount) {
            maxCount = count;
            bestInterval = parseFloat(interval);
        }
    });

    const bpm = 60 / bestInterval;

    return {
        bpm: Math.round(bpm),
        peaks,
        offset: peaks[0]?.time || 0
    };
};
