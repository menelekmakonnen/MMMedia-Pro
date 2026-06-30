// ══════════════════════════════════════════════════════════════════════════════
// deflickerFilter.ts — FFmpeg temporal-averaging deflicker
//
// Removes LED/fluorescent/screen flicker by blending each output frame with its
// neighbours — a weighted temporal average that smooths the brightness pulsing
// (typically 50/60 Hz) that shows up as rolling bands or flicker.
//
// This is the exact Premiere Pro "manual deflicker" technique expressed as a
// single FFmpeg `tmix` filter:
//
//   Premiere: stack 3 copies of the clip on 3 video tracks, set the middle to
//   66% opacity (offset +1 frame) and the top to 33% opacity (offset +2 frames),
//   then nest. Normal-blend compositing top-over-bottom collapses to a weighted
//   average of three consecutive frames:
//
//     out = 0.33·f(n+2) + 0.66·0.67·f(n+1) + 0.34·0.67·f(n)
//         = 0.2278·f(n) + 0.4422·f(n+1) + 0.33·f(n+2)
//
//   …which is precisely `tmix=frames=3:weights=0.2278 0.4422 0.33`.
//
// Expressing it as `tmix` (instead of split/offset/blend in a filter_complex)
// means deflicker composes into the normal single-input `-vf` chain, so it bakes
// into ordinary timeline renders AND standalone renders, on both the internal
// engine and Ender (which vendors this module).
// ══════════════════════════════════════════════════════════════════════════════

export type DeflickerLayers = 3 | 5;

/**
 * tmix weights for each preset, derived by collapsing the Premiere opacity-stack
 * compositing into a single weighted temporal average. Each weight set sums to
 * 1.0 (oldest frame → newest frame).
 *
 *  3-layer (standard): opacities 100% / 66% / 33%  → 0.2278 0.4422 0.33
 *  5-layer (heavy):    opacities 100/80/60/40/20%  → 0.0384 0.1536 0.288 0.32 0.20
 */
const TMIX_WEIGHTS: Record<DeflickerLayers, number[]> = {
    3: [0.2278, 0.4422, 0.33],
    5: [0.0384, 0.1536, 0.288, 0.32, 0.20],
};

/**
 * Build the single `tmix` video filter that performs deflicker.
 *
 * Returns a plain filter string (e.g. `tmix=frames=3:weights=0.2278 0.4422 0.33`)
 * suitable for pushing straight into a comma-joined `-vf` chain. tmix preserves
 * frame count, resolution and duration — it only blends each frame with its
 * temporal neighbours.
 *
 * @param layers  3 (standard) or 5 (heavy) temporal taps
 */
export function buildDeflickerVf(layers: DeflickerLayers = 3): string {
    const weights = TMIX_WEIGHTS[layers] ?? TMIX_WEIGHTS[3];
    return `tmix=frames=${weights.length}:weights=${weights.join(' ')}`;
}

/**
 * Build the full FFmpeg arguments for a standalone deflicker render
 * (Import Manager → "Render Deflickered Video", no other edits applied).
 *
 * @param inputPath    Absolute path to the source video
 * @param outputPath   Absolute path for the deflickered output
 * @param layers       Number of temporal taps (3 or 5)
 * @param _fps         Unused (kept for call-site compatibility — tmix works on
 *                     the frame sequence, no explicit fps needed)
 * @param includeAudio Whether to keep the original audio track
 */
export function buildDeflickerArgs(
    inputPath: string,
    outputPath: string,
    layers: DeflickerLayers,
    _fps: number,
    includeAudio: boolean,
): string[] {
    // `-vf` filters the auto-selected video stream; default stream selection also
    // carries one audio stream (re-encoded to AAC) unless `-an` strips it. We avoid
    // explicit `-map` so there's no `-vf`/`-map` interaction to get wrong.
    const args: string[] = [
        '-i', inputPath,
        '-vf', buildDeflickerVf(layers || 3),
    ];

    if (includeAudio) {
        args.push('-c:a', 'aac', '-b:a', '192k');
    } else {
        args.push('-an');
    }

    args.push(
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-crf', '18',
        '-pix_fmt', 'yuv420p',
        '-y',
        outputPath,
    );

    return args;
}
