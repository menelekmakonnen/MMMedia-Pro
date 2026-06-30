/**
 * SFX Auto-Categorizer
 *
 * Scores a filename against every subcategory's keywords and returns the
 * best match.  Scoring uses keyword length as a weight so more-specific
 * keywords (e.g. "bass_drop") beat generic ones ("drop").
 *
 * Falls back to `miscellaneous / misc-general` when no keywords match.
 */

import { SFX_CATEGORIES } from './sfxCategories';

export interface CategorizationResult {
    categoryId: string;
    subcategoryId: string;
}

/**
 * Categorize a sound-effect file by its filename.
 *
 * The filename is normalised (lowercased, common separators replaced with
 * spaces) then each subcategory keyword is tested for a match.  The
 * subcategory with the highest cumulative score wins.
 */
export function categorizeSfx(filename: string): CategorizationResult {
    // Normalise: strip extension, collapse separators
    const normalised = filename
        .replace(/\.[^.]+$/, '')        // strip file extension
        .toLowerCase()
        .replace(/[_\-\.]+/g, ' ')      // separators → spaces
        .replace(/\s+/g, ' ')
        .trim();

    let bestCategoryId = 'miscellaneous';
    let bestSubcategoryId = 'misc-general';
    let bestScore = 0;

    for (const category of SFX_CATEGORIES) {
        if (category.id === 'miscellaneous') continue; // skip catch-all during scoring

        for (const sub of category.subcategories) {
            let score = 0;

            for (const keyword of sub.keywords) {
                const kw = keyword.toLowerCase().replace(/[_\-\.]+/g, ' ');

                if (normalised.includes(kw)) {
                    // Weight by keyword length — longer = more specific = higher score
                    score += kw.length;
                }
            }

            if (score > bestScore) {
                bestScore = score;
                bestCategoryId = category.id;
                bestSubcategoryId = sub.id;
            }
        }
    }

    return { categoryId: bestCategoryId, subcategoryId: bestSubcategoryId };
}

/**
 * Batch-categorize an array of filenames.
 * Useful for the initial folder scan.
 */
export function categorizeSfxBatch(
    filenames: string[],
): Map<string, CategorizationResult> {
    const results = new Map<string, CategorizationResult>();
    for (const fn of filenames) {
        results.set(fn, categorizeSfx(fn));
    }
    return results;
}
