/**
 * generatorModeConfig.ts — Generator-mode subcategories.
 *
 * Subcategories have been removed from every Edit Generator mode: each mode now
 * edits from its own intelligence + the user's toggles, with no sub-variant
 * picker. The types and accessors are kept (returning empty) so existing
 * consumers compile and simply render no subcategory list.
 */

export interface ModeSubcategory {
    id: string;
    label: string;
    /** One-line summary shown in the UI tooltip */
    summary: string;
    /** Detailed engine behavior description — used by generation pipeline */
    engineBehavior: string;
    /** Optional icon hint (lucide icon name) */
    icon?: string;
}

export interface ModeConfig {
    id: string;
    subcategories: ModeSubcategory[];
}

// Subcategories removed for all modes (intentionally empty).
export const MODE_SUBCATEGORIES: Record<string, ModeSubcategory[]> = {};

/** Get subcategories for a mode — always empty now. */
export const getSubcategories = (modeId: string): ModeSubcategory[] =>
    MODE_SUBCATEGORIES[modeId] ?? [];

/** Get a specific subcategory by mode + sub ID — none exist now. */
export const getSubcategory = (_modeId: string, _subId: string): ModeSubcategory | undefined =>
    undefined;
