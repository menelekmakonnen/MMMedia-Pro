/**
 * shotClassifier.ts — Shot type classification for intelligent clip selection.
 *
 * Classifies each clip by its shot type (wide, close-up, aerial, etc.),
 * enabling the generator to make intelligent composition decisions:
 *   - "I need a close-up here because the last 3 clips were wide shots"
 *   - "Interleave performance and B-roll for music videos"
 *   - "Ensure showreel has variety — never two wide shots adjacent"
 *
 * Classification uses FFmpeg-extracted features (no ML required):
 *   - Edge density → wide (low) vs. close-up (high)
 *   - Face region ratio → talking-head / performance
 *   - Motion magnitude → static vs. action
 *   - Histogram spread → screen recording detection
 *   - Aspect + motion profile → aerial / drone detection
 *
 * Deeply connected to: smartEngine.ts (analysis pass), trailerGenerator.ts (weighted selection),
 *                       trailerSmartStore.ts (results storage), clipIntelligence.ts (scoring)
 */

// ── Shot Type Taxonomy ───────────────────────────────────────────────────────

/**
 * Primary shot type classification.
 *
 * Ordered by camera-to-subject distance (wide → close) plus special types.
 */
export type ShotType =
    | 'extreme-wide'     // EWS: establishing shot, landscapes, architecture
    | 'wide'             // WS: full body in frame, environment visible
    | 'medium-wide'      // MWS: knees up, common for dialogue scenes
    | 'medium'           // MS: waist up, standard narrative shot
    | 'medium-close'     // MCU: chest up, emotional connection
    | 'close-up'         // CU: face fills frame, detail emphasis
    | 'extreme-close'    // ECU: eye, mouth, single detail
    | 'aerial'           // Drone / bird's eye / overhead
    | 'pov'              // Point-of-view / first-person
    | 'over-shoulder'    // OTS: two-shot from behind one character
    | 'insert'           // Detail insert: hands, objects, screens
    | 'talking-head'     // Webcam / interview / solo speaker
    | 'performance'      // Live performance / music video performance
    | 'screen-recording' // Desktop / app / UI capture
    | 'text-slide'       // Title card / text on solid background
    | 'static-product'   // Product photography / still life
    | 'action'           // High-motion: sports, stunts, fight
    | 'timelapse'        // Accelerated footage
    | 'unknown';         // Cannot classify

/**
 * Camera movement classification.
 */
export type CameraMovement =
    | 'static'          // Locked off, no movement
    | 'pan'             // Horizontal rotation
    | 'tilt'            // Vertical rotation
    | 'dolly'           // Forward/backward movement
    | 'truck'           // Lateral movement
    | 'crane'           // Vertical + forward combined
    | 'handheld'        // Organic, shaky movement
    | 'gimbal'          // Stabilised fluid movement
    | 'zoom'            // Optical/digital zoom
    | 'orbit'           // Circular movement around subject
    | 'whip'            // Very fast pan/tilt (intentional blur)
    | 'unknown';

/**
 * Subject composition classification.
 */
export type SubjectComposition =
    | 'centered'        // Subject in centre frame
    | 'rule-of-thirds'  // Subject on 1/3 gridlines
    | 'leading-space'   // Subject with space in movement direction
    | 'symmetrical'     // Balanced symmetry
    | 'off-center'      // Deliberate off-centre placement
    | 'full-frame'      // Subject fills entire frame
    | 'negative-space'  // Large empty areas with small subject
    | 'unknown';

// ── Classification Result ────────────────────────────────────────────────────

export interface ShotClassification {
    /** Primary shot type */
    shotType: ShotType;
    /** Confidence in the classification (0-1) */
    confidence: number;
    /** Secondary shot type (if ambiguous) */
    secondaryShotType?: ShotType;
    /** Detected camera movement */
    cameraMovement: CameraMovement;
    /** Camera movement intensity (0-1, where 0=static, 1=extreme motion) */
    movementIntensity: number;
    /** Subject composition */
    composition: SubjectComposition;
    /** Whether faces are detected in the frame */
    hasFaces: boolean;
    /** Approximate number of faces */
    faceCount: number;
    /** Face region ratio: what fraction of the frame is occupied by faces (0-1) */
    faceRegionRatio: number;
    /** Edge density (0-1): low=smooth/wide, high=detailed/close-up */
    edgeDensity: number;
    /** Whether the shot is likely a static image (photo) vs. video */
    isStatic: boolean;
    /** Dominant visual region (normalised x, y, w, h — salient area) */
    salientRegion: { x: number; y: number; w: number; h: number };
}

// ── Shot Type Metadata ───────────────────────────────────────────────────────

interface ShotTypeMeta {
    label: string;
    abbrev: string;
    description: string;
    /** Cinematic rules: what shot types pair well after this one */
    goodFollowers: ShotType[];
    /** Shot types that should NOT follow this one (visual jumps) */
    badFollowers: ShotType[];
    /** Relative energy weight (0-1) for pacing calculations */
    energyWeight: number;
}

export const SHOT_TYPE_META: Record<ShotType, ShotTypeMeta> = {
    'extreme-wide': {
        label: 'Extreme Wide', abbrev: 'EWS',
        description: 'Establishing shot showing the full environment',
        goodFollowers: ['wide', 'medium-wide', 'aerial', 'medium'],
        badFollowers: ['extreme-wide', 'text-slide'],
        energyWeight: 0.3,
    },
    'wide': {
        label: 'Wide Shot', abbrev: 'WS',
        description: 'Full body in frame with environment visible',
        goodFollowers: ['medium', 'medium-wide', 'close-up', 'insert'],
        badFollowers: ['extreme-wide'],
        energyWeight: 0.4,
    },
    'medium-wide': {
        label: 'Medium Wide', abbrev: 'MWS',
        description: 'Knees up, common for dialogue scenes',
        goodFollowers: ['medium', 'close-up', 'over-shoulder', 'wide'],
        badFollowers: ['medium-wide'],
        energyWeight: 0.5,
    },
    'medium': {
        label: 'Medium Shot', abbrev: 'MS',
        description: 'Waist up — the standard narrative shot',
        goodFollowers: ['close-up', 'medium-close', 'wide', 'insert', 'over-shoulder'],
        badFollowers: ['medium'],
        energyWeight: 0.5,
    },
    'medium-close': {
        label: 'Medium Close-Up', abbrev: 'MCU',
        description: 'Chest up — emotional connection',
        goodFollowers: ['close-up', 'medium', 'wide', 'insert'],
        badFollowers: ['medium-close'],
        energyWeight: 0.6,
    },
    'close-up': {
        label: 'Close-Up', abbrev: 'CU',
        description: 'Face fills frame — maximum emotional impact',
        goodFollowers: ['extreme-close', 'medium', 'wide', 'insert', 'over-shoulder'],
        badFollowers: ['close-up'],
        energyWeight: 0.7,
    },
    'extreme-close': {
        label: 'Extreme Close-Up', abbrev: 'ECU',
        description: 'Single detail: eye, mouth, texture',
        goodFollowers: ['close-up', 'medium', 'wide'],
        badFollowers: ['extreme-close'],
        energyWeight: 0.8,
    },
    'aerial': {
        label: 'Aerial / Drone', abbrev: 'AER',
        description: 'Bird\'s eye or elevated drone shot',
        goodFollowers: ['wide', 'extreme-wide', 'medium', 'pov'],
        badFollowers: ['aerial'],
        energyWeight: 0.5,
    },
    'pov': {
        label: 'POV', abbrev: 'POV',
        description: 'First-person point-of-view shot',
        goodFollowers: ['close-up', 'medium', 'over-shoulder', 'insert'],
        badFollowers: ['pov'],
        energyWeight: 0.6,
    },
    'over-shoulder': {
        label: 'Over the Shoulder', abbrev: 'OTS',
        description: 'Two-shot from behind one character',
        goodFollowers: ['close-up', 'medium', 'over-shoulder'],
        badFollowers: ['wide'],
        energyWeight: 0.5,
    },
    'insert': {
        label: 'Insert / Detail', abbrev: 'INS',
        description: 'Detail shot: hands, objects, screens',
        goodFollowers: ['medium', 'close-up', 'wide'],
        badFollowers: ['insert'],
        energyWeight: 0.6,
    },
    'talking-head': {
        label: 'Talking Head', abbrev: 'TH',
        description: 'Solo speaker facing camera (webcam/interview)',
        goodFollowers: ['insert', 'wide', 'close-up', 'medium'],
        badFollowers: ['talking-head'],
        energyWeight: 0.4,
    },
    'performance': {
        label: 'Performance', abbrev: 'PERF',
        description: 'Live performance, music video performance',
        goodFollowers: ['close-up', 'wide', 'aerial', 'insert', 'medium'],
        badFollowers: [],
        energyWeight: 0.7,
    },
    'screen-recording': {
        label: 'Screen Recording', abbrev: 'SCR',
        description: 'Desktop or app screen capture',
        goodFollowers: ['talking-head', 'insert', 'close-up'],
        badFollowers: ['screen-recording'],
        energyWeight: 0.2,
    },
    'text-slide': {
        label: 'Text Slide', abbrev: 'TXT',
        description: 'Title card or text on a solid/gradient background',
        goodFollowers: ['wide', 'medium', 'aerial', 'close-up'],
        badFollowers: ['text-slide'],
        energyWeight: 0.1,
    },
    'static-product': {
        label: 'Product Shot', abbrev: 'PROD',
        description: 'Static product photography or still life',
        goodFollowers: ['close-up', 'insert', 'medium', 'wide'],
        badFollowers: ['static-product'],
        energyWeight: 0.3,
    },
    'action': {
        label: 'Action', abbrev: 'ACT',
        description: 'High-motion: sports, stunts, fight choreography',
        goodFollowers: ['close-up', 'wide', 'medium', 'insert', 'pov'],
        badFollowers: ['static-product', 'text-slide', 'screen-recording'],
        energyWeight: 0.9,
    },
    'timelapse': {
        label: 'Timelapse', abbrev: 'TL',
        description: 'Accelerated footage showing time passage',
        goodFollowers: ['wide', 'medium', 'aerial'],
        badFollowers: ['timelapse'],
        energyWeight: 0.4,
    },
    'unknown': {
        label: 'Unknown', abbrev: '?',
        description: 'Could not classify the shot type',
        goodFollowers: ['medium', 'wide', 'close-up'],
        badFollowers: [],
        energyWeight: 0.5,
    },
};

// ── Classification Heuristics ────────────────────────────────────────────────

/**
 * Classify a shot based on extracted FFmpeg features.
 *
 * This runs entirely on pre-computed data — no FFmpeg calls here.
 * The Smart Engine extracts these features and calls this function.
 *
 * @param features - Pre-extracted frame analysis features
 * @returns ShotClassification result
 */
export function classifyShot(features: {
    /** Average edge density across sampled frames (0-1) */
    edgeDensity: number;
    /** Average motion magnitude between frames (0-1, normalised) */
    motionMagnitude: number;
    /** Face region ratio: fraction of frame occupied by faces (0-1) */
    faceRegionRatio: number;
    /** Number of faces detected */
    faceCount: number;
    /** Whether the clip is essentially static (< 2% pixel change between frames) */
    isStatic: boolean;
    /** Histogram uniformity: how flat the luma histogram is (0-1) */
    histogramUniformity: number;
    /** Whether the clip has sharp UI-like edges (for screen recording detection) */
    hasUIEdges: boolean;
    /** Average luma (brightness) of the frame (0-255) */
    avgLuma: number;
    /** Salient region (normalised x, y, w, h) */
    salientRegion: { x: number; y: number; w: number; h: number };
    /** Clip aspect ratio (w/h) */
    aspectRatio: number;
    /** Duration in seconds */
    duration: number;
    /** Standard deviation of motion between frames */
    motionStdDev: number;
}): ShotClassification {
    const {
        edgeDensity, motionMagnitude, faceRegionRatio, faceCount,
        isStatic, histogramUniformity, hasUIEdges, salientRegion,
        motionStdDev,
    } = features;

    let shotType: ShotType = 'unknown';
    let confidence = 0.5;
    let secondaryShotType: ShotType | undefined;

    // ── Definitive classifications (high confidence) ──

    // Screen recording: very uniform histogram + UI edges + static
    if (hasUIEdges && histogramUniformity > 0.7 && motionMagnitude < 0.15) {
        shotType = 'screen-recording';
        confidence = 0.9;
    }
    // Text slide: very low edge density + static + high histogram uniformity
    else if (edgeDensity < 0.08 && isStatic && histogramUniformity > 0.6) {
        shotType = 'text-slide';
        confidence = 0.85;
    }
    // Timelapse: static camera (low motion std dev) but high motion magnitude
    else if (motionStdDev < 0.05 && motionMagnitude > 0.4 && faceRegionRatio < 0.05) {
        shotType = 'timelapse';
        confidence = 0.7;
    }
    // Talking head: single face, large face region, relatively static
    else if (faceCount === 1 && faceRegionRatio > 0.15 && motionMagnitude < 0.3) {
        shotType = 'talking-head';
        confidence = 0.8;
        if (faceRegionRatio > 0.3) {
            secondaryShotType = 'close-up';
        }
    }
    // Performance: faces visible + significant motion
    else if (faceCount >= 1 && faceRegionRatio > 0.08 && motionMagnitude > 0.35) {
        shotType = 'performance';
        confidence = 0.65;
        secondaryShotType = 'action';
    }
    // Action: very high motion, low face presence
    else if (motionMagnitude > 0.6 && faceRegionRatio < 0.1) {
        shotType = 'action';
        confidence = 0.7;
    }

    // ── Distance-based classifications (camera-to-subject) ──
    else if (faceCount >= 1) {
        // Face-based distance estimation
        if (faceRegionRatio > 0.4) {
            shotType = 'extreme-close';
            confidence = 0.75;
        } else if (faceRegionRatio > 0.2) {
            shotType = 'close-up';
            confidence = 0.8;
        } else if (faceRegionRatio > 0.1) {
            shotType = 'medium-close';
            confidence = 0.7;
        } else if (faceRegionRatio > 0.05) {
            shotType = 'medium';
            confidence = 0.65;
            secondaryShotType = 'medium-wide';
        } else {
            shotType = 'wide';
            confidence = 0.6;
        }
    }

    // ── Non-face classifications (by edge density + motion) ──
    else if (edgeDensity > 0.6) {
        // High detail = close-up or insert
        shotType = isStatic ? 'static-product' : 'insert';
        confidence = 0.6;
        secondaryShotType = 'close-up';
    } else if (edgeDensity < 0.15 && motionMagnitude < 0.2) {
        // Very smooth, wide, low motion = establishing/aerial
        shotType = 'extreme-wide';
        confidence = 0.55;
        secondaryShotType = 'aerial';
    } else if (edgeDensity < 0.25) {
        shotType = 'wide';
        confidence = 0.5;
    } else {
        shotType = 'medium';
        confidence = 0.4;
    }

    // ── Camera movement classification ──
    let cameraMovement: CameraMovement = 'unknown';
    let movementIntensity = motionMagnitude;

    if (motionMagnitude < 0.05) {
        cameraMovement = 'static';
        movementIntensity = 0;
    } else if (motionStdDev > 0.2) {
        cameraMovement = 'handheld';
    } else if (motionMagnitude > 0.7) {
        cameraMovement = 'whip';
    } else if (motionStdDev < 0.05) {
        cameraMovement = 'gimbal';
    } else {
        cameraMovement = 'pan'; // default for moderate smooth motion
    }

    // ── Composition classification ──
    let composition: SubjectComposition = 'unknown';
    const cx = salientRegion.x + salientRegion.w / 2;
    const cy = salientRegion.y + salientRegion.h / 2;

    if (Math.abs(cx - 0.5) < 0.08 && Math.abs(cy - 0.5) < 0.08) {
        composition = 'centered';
    } else if (
        (Math.abs(cx - 0.333) < 0.1 || Math.abs(cx - 0.667) < 0.1) &&
        (Math.abs(cy - 0.333) < 0.1 || Math.abs(cy - 0.667) < 0.1)
    ) {
        composition = 'rule-of-thirds';
    } else if (salientRegion.w * salientRegion.h > 0.7) {
        composition = 'full-frame';
    } else if (salientRegion.w * salientRegion.h < 0.1) {
        composition = 'negative-space';
    } else {
        composition = 'off-center';
    }

    return {
        shotType,
        confidence,
        secondaryShotType,
        cameraMovement,
        movementIntensity,
        composition,
        hasFaces: faceCount > 0,
        faceCount,
        faceRegionRatio,
        edgeDensity,
        isStatic,
        salientRegion,
    };
}

// ── Shot Diversity Scoring ───────────────────────────────────────────────────

/**
 * Score a clip sequence for shot type diversity (0-1, where 1 = perfectly diverse).
 * Penalises consecutive same-type shots and rewards variety.
 */
export function scoreShotDiversity(shotTypes: ShotType[]): number {
    if (shotTypes.length < 2) return 1;

    let penaltySum = 0;
    const typeCounts: Record<string, number> = {};

    for (let i = 0; i < shotTypes.length; i++) {
        const type = shotTypes[i];
        typeCounts[type] = (typeCounts[type] || 0) + 1;

        // Penalise consecutive same-type shots
        if (i > 0 && shotTypes[i] === shotTypes[i - 1]) {
            penaltySum += 0.3;
        }
        // Penalise bad followers (from cinematic grammar)
        if (i > 0) {
            const prevMeta = SHOT_TYPE_META[shotTypes[i - 1]];
            if (prevMeta.badFollowers.includes(type)) {
                penaltySum += 0.2;
            }
        }
    }

    // Reward variety: more unique types = higher score
    const uniqueTypes = Object.keys(typeCounts).length;
    const varietyBonus = Math.min(uniqueTypes / 5, 1) * 0.3;

    const maxPenalty = (shotTypes.length - 1) * 0.3;
    const penaltyRatio = maxPenalty > 0 ? penaltySum / maxPenalty : 0;

    return Math.max(0, Math.min(1, (1 - penaltyRatio) * 0.7 + varietyBonus));
}

/**
 * Suggest the best shot type for the next clip, given the sequence so far.
 * Uses cinematic grammar rules from SHOT_TYPE_META.
 */
export function suggestNextShotType(
    previousShots: ShotType[],
    availableTypes: ShotType[],
): ShotType {
    if (previousShots.length === 0) {
        // Opening: prefer establishing shots
        const openers: ShotType[] = ['extreme-wide', 'wide', 'aerial'];
        const available = openers.filter(t => availableTypes.includes(t));
        return available[0] || availableTypes[0] || 'medium';
    }

    const lastShot = previousShots[previousShots.length - 1];
    const meta = SHOT_TYPE_META[lastShot];

    // Prefer good followers that are available
    const goodAvailable = meta.goodFollowers.filter(t => availableTypes.includes(t));
    if (goodAvailable.length > 0) return goodAvailable[0];

    // Avoid bad followers
    const safeTypes = availableTypes.filter(t => !meta.badFollowers.includes(t));
    return safeTypes[0] || availableTypes[0] || 'medium';
}

/**
 * Group shot types into higher-level categories for UI display.
 */
export function getShotCategory(type: ShotType): string {
    const categories: Record<string, ShotType[]> = {
        'Close': ['extreme-close', 'close-up', 'medium-close', 'insert'],
        'Medium': ['medium', 'medium-wide', 'over-shoulder'],
        'Wide': ['wide', 'extreme-wide', 'aerial'],
        'Special': ['pov', 'talking-head', 'performance', 'action', 'timelapse'],
        'Other': ['screen-recording', 'text-slide', 'static-product', 'unknown'],
    };
    for (const [cat, types] of Object.entries(categories)) {
        if (types.includes(type)) return cat;
    }
    return 'Other';
}
