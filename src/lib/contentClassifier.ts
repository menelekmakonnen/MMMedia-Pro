import type { ClipAnalysisResult } from '../store/trailerSmartStore';

export type ContentLabel =
    | 'performance'
    | 'B-roll'
    | 'interview'
    | 'product-shot'
    | 'BTS'
    | 'crowd'
    | 'reaction'
    | 'landscape'
    | 'action'
    | 'establishing'
    | 'detail';

/**
 * Classify a clip into a high-level semantic content category based on
 * low-level visual and audio features extracted by the Smart Engine.
 */
export function classifyContent(
    filename: string,
    result: ClipAnalysisResult
): ContentLabel {
    const nameLower = filename.toLowerCase();
    const isStatic = result.energyLevel === 'static';
    const motion = result.score ?? 0;
    const hasFaces = result.hasFaces || (result.faceCount && result.faceCount > 0);
    const edgeDensity = result.edgeDensity ?? 0.3;

    // Filename keyword rules
    if (nameLower.includes('bts') || nameLower.includes('behind') || nameLower.includes('crew') || nameLower.includes('setup')) {
        return 'BTS';
    }
    if (nameLower.includes('interview') || nameLower.includes('talking') || nameLower.includes('speak') || nameLower.includes('host')) {
        return 'interview';
    }
    if (nameLower.includes('product') || nameLower.includes('packshot') || nameLower.includes('detail') || nameLower.includes('closeup')) {
        return nameLower.includes('product') ? 'product-shot' : 'detail';
    }
    if (nameLower.includes('landscape') || nameLower.includes('nature') || nameLower.includes('sky') || nameLower.includes('sea') || nameLower.includes('mount')) {
        return 'landscape';
    }
    if (nameLower.includes('establishing') || nameLower.includes('wide') || nameLower.includes('exterior') || nameLower.includes('aerial')) {
        return 'establishing';
    }
    if (nameLower.includes('performance') || nameLower.includes('sing') || nameLower.includes('dance') || nameLower.includes('stage')) {
        return 'performance';
    }
    if (nameLower.includes('crowd') || nameLower.includes('audience') || nameLower.includes('concert')) {
        return 'crowd';
    }
    if (nameLower.includes('react') || nameLower.includes('laugh') || nameLower.includes('gasp')) {
        return 'reaction';
    }

    // Feature-based fallback rules
    if (hasFaces) {
        if (isStatic || motion < 20) {
            return 'interview';
        }
        if (result.shotType === 'wide' || result.shotType === 'extreme-wide') {
            return 'crowd';
        }
        return 'reaction';
    }

    if (motion > 75) {
        return 'action';
    }

    if (result.shotType === 'extreme-wide' || result.shotType === 'aerial') {
        return 'establishing';
    }

    if (result.shotType === 'extreme-close-up' || result.shotType === 'close-up') {
        return 'detail';
    }

    if (edgeDensity < 0.15 && isStatic) {
        return 'landscape';
    }

    return 'B-roll';
}
