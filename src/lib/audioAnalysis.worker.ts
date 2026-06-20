/**
 * Beat Intelligence Engine — Web Worker
 * Runs the pure DSP core off the main thread. The shell (audioAnalysis.ts)
 * transfers the band Float32Arrays in; we run analyzeBands and post the result
 * back. All heavy synchronous loops happen here, keeping the UI responsive.
 */

import { analyzeBands, type BandSignals } from './audioAnalysisCore';

interface WorkerRequest {
    id: number;
    bands: BandSignals;
    beatSensitivity: number;
}

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
    const { id, bands, beatSensitivity } = ev.data;
    try {
        const result = analyzeBands(bands, beatSensitivity);
        (self as unknown as Worker).postMessage({ id, ok: true, result });
    } catch (err) {
        (self as unknown as Worker).postMessage({
            id,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
        });
    }
};
