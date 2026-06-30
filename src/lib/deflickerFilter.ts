// ══════════════════════════════════════════════════════════════════════════════
// deflickerFilter.ts — FFmpeg filter graph for temporal-averaging deflicker
//
// Removes LED/fluorescent light flicker by stacking N copies of the same clip
// at decreasing opacity with 1-frame temporal offsets. The temporal averaging
// smooths out flicker cycles (typically 50/60 Hz) that appear as rolling bands
// or brightness pulsing in video footage.
//
// 3-layer (standard):  100% + 66% (offset +1fr) + 33% (offset +2fr)
// 5-layer (heavy):     100% + 80% (offset +1fr) + 60% (+2fr) + 40% (+3fr) + 20% (+4fr)
// ══════════════════════════════════════════════════════════════════════════════

export type DeflickerLayers = 3 | 5;

/**
 * Opacities for each overlay layer (base layer is always 100% / implicit).
 * These produce a weighted temporal average that preserves detail while
 * smoothing flicker.  The base is the "loudest" frame; each subsequent
 * offset frame contributes less.
 */
const LAYER_OPACITIES: Record<DeflickerLayers, number[]> = {
    3: [0.66, 0.33],           // 2 overlay layers on top of the base
    5: [0.80, 0.60, 0.40, 0.20], // 4 overlay layers on top of the base
};

/**
 * Build the FFmpeg `-filter_complex` graph string for deflickering.
 *
 * The technique:
 *   1. Split the input into N streams
 *   2. Offset each overlay stream by 1, 2, … N-1 frames using `setpts`
 *   3. Blend each overlay onto the base at decreasing opacity using `blend`
 *
 * @param layers  Number of temporal layers (3 or 5)
 * @param fps     Project frame rate (used to compute 1-frame PTS offset)
 * @returns       A complete filter_complex string for a single-input graph
 *
 * @example
 *   // 3-layer:
 *   // [0:v]split=3[df_base][df_s1][df_s2];
 *   // [df_s1]setpts=PTS+(1/30)/TB[df_off1];
 *   // [df_s2]setpts=PTS+(2/30)/TB[df_off2];
 *   // [df_base][df_off1]blend=all_mode=normal:all_opacity=0.66[df_m1];
 *   // [df_m1][df_off2]blend=all_mode=normal:all_opacity=0.33[df_out]
 */
export function buildDeflickerGraph(layers: DeflickerLayers, fps: number): string {
    const opacities = LAYER_OPACITIES[layers];
    const totalStreams = 1 + opacities.length; // base + overlays
    const frameDuration = 1 / fps;             // seconds per frame

    const parts: string[] = [];

    // 1. Split input into N streams
    const splitLabels = [`[df_base]`];
    for (let i = 1; i < totalStreams; i++) {
        splitLabels.push(`[df_s${i}]`);
    }
    parts.push(`[0:v]split=${totalStreams}${splitLabels.join('')}`);

    // 2. Offset each overlay stream by i frames
    for (let i = 1; i < totalStreams; i++) {
        const offsetSec = (i * frameDuration).toFixed(6);
        parts.push(`[df_s${i}]setpts=PTS+${offsetSec}/TB[df_off${i}]`);
    }

    // 3. Blend each overlay onto the accumulator
    let accLabel = 'df_base';
    for (let i = 0; i < opacities.length; i++) {
        const overlayIdx = i + 1;
        const outLabel = i === opacities.length - 1 ? 'df_out' : `df_m${overlayIdx}`;
        parts.push(
            `[${accLabel}][df_off${overlayIdx}]blend=all_mode=normal:all_opacity=${opacities[i]}[${outLabel}]`
        );
        accLabel = outLabel;
    }

    return parts.join(';\n');
}

/**
 * Build the full FFmpeg arguments for a standalone deflicker render.
 *
 * @param inputPath   Absolute path to the source video
 * @param outputPath  Absolute path for the deflickered output
 * @param layers      Number of temporal layers
 * @param fps         Project frame rate
 * @param includeAudio Whether to include the original audio track
 * @returns           Array of FFmpeg argument strings
 */
export function buildDeflickerArgs(
    inputPath: string,
    outputPath: string,
    layers: DeflickerLayers,
    fps: number,
    includeAudio: boolean,
): string[] {
    const graph = buildDeflickerGraph(layers, fps);

    const args: string[] = [
        '-i', inputPath,
        '-filter_complex', `${graph}`,
        '-map', '[df_out]',
    ];

    if (includeAudio) {
        args.push('-map', '0:a?', '-c:a', 'copy');
    } else {
        args.push('-an');
    }

    // Output encoding
    args.push(
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-crf', '18',
        '-pix_fmt', 'yuv420p',
        '-y',                  // Overwrite
        outputPath,
    );

    return args;
}

/**
 * Build a per-clip deflicker filter chain that can be prepended to
 * an existing `-vf` or `-filter_complex` pipeline.
 *
 * This returns just the split/offset/blend portion without input/output
 * label assignments, suitable for embedding into a larger filter graph
 * managed by filterBuilder.ts.
 *
 * @param inputLabel   The label of the incoming video stream (e.g. '[v_in]')
 * @param outputLabel  The label for the deflickered output (e.g. '[v_df]')
 * @param layers       Number of temporal layers
 * @param fps          Project frame rate
 */
export function buildDeflickerChain(
    inputLabel: string,
    outputLabel: string,
    layers: DeflickerLayers,
    fps: number,
): string {
    const opacities = LAYER_OPACITIES[layers];
    const totalStreams = 1 + opacities.length;
    const frameDuration = 1 / fps;

    const parts: string[] = [];

    // Strip brackets for label construction
    const inLabel = inputLabel.replace(/[\[\]]/g, '');
    const outLabel = outputLabel.replace(/[\[\]]/g, '');

    // 1. Split
    const splitLabels = [`[${inLabel}_base]`];
    for (let i = 1; i < totalStreams; i++) {
        splitLabels.push(`[${inLabel}_s${i}]`);
    }
    parts.push(`${inputLabel}split=${totalStreams}${splitLabels.join('')}`);

    // 2. Offset
    for (let i = 1; i < totalStreams; i++) {
        const offsetSec = (i * frameDuration).toFixed(6);
        parts.push(`[${inLabel}_s${i}]setpts=PTS+${offsetSec}/TB[${inLabel}_off${i}]`);
    }

    // 3. Blend
    let accLabel = `${inLabel}_base`;
    for (let i = 0; i < opacities.length; i++) {
        const overlayIdx = i + 1;
        const curOutLabel = i === opacities.length - 1 ? outLabel : `${inLabel}_m${overlayIdx}`;
        parts.push(
            `[${accLabel}][${inLabel}_off${overlayIdx}]blend=all_mode=normal:all_opacity=${opacities[i]}[${curOutLabel}]`
        );
        accLabel = curOutLabel;
    }

    return parts.join(';\n');
}
