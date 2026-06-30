import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * Section Store
 * ════════════════════════════════════════════════════════════════════════════
 * Manages timeline sections — named, colored ranges that partition the
 * timeline into logical blocks (Intro, Verse 1, Chorus 1, Drop 2…).
 *
 * Sections can be created manually or auto-generated from audio analysis
 * segments, giving instant structure to a music-video timeline.
 *
 * Persisted to localStorage under 'mmmedia-sections'.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type AudioSegmentType =
    | 'intro'
    | 'verse'
    | 'chorus'
    | 'drop'
    | 'bridge'
    | 'outro'
    | 'buildup'
    | 'breakdown';

export interface TimelineSection {
    id: string;
    name: string;
    startFrame: number;
    endFrame: number;
    /** Hex color for the section header / timeline tint */
    color: string;
    collapsed: boolean;
    /** Optional link to audio analysis segment */
    audioSegmentType?: AudioSegmentType;
}

// ─── Color palette by segment type ────────────────────────────────────────────

const SECTION_COLORS: Record<string, string> = {
    intro:     '#6366f1', // indigo
    verse:     '#8b5cf6', // violet
    chorus:    '#ec4899', // pink
    drop:      '#ef4444', // red
    bridge:    '#f59e0b', // amber
    outro:     '#6366f1', // indigo
    buildup:   '#f97316', // orange
    breakdown: '#14b8a6', // teal
};
const DEFAULT_SECTION_COLOR = '#64748b'; // slate (custom)

function colorForType(type: string): string {
    return SECTION_COLORS[type] ?? DEFAULT_SECTION_COLOR;
}

// ─── ID generator ─────────────────────────────────────────────────────────────

let _sectionCounter = 0;
function nextSectionId(): string {
    return `sec_${Date.now().toString(36)}_${(++_sectionCounter).toString(36)}`;
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface SectionStore {
    sections: TimelineSection[];

    // ── CRUD ─────────────────────────────────────────────────────────────
    addSection:    (section: Omit<TimelineSection, 'id'>) => void;
    updateSection: (id: string, updates: Partial<TimelineSection>) => void;
    removeSection: (id: string) => void;

    // ── Collapse / expand ────────────────────────────────────────────────
    toggleCollapse: (id: string) => void;
    collapseAll:    () => void;
    expandAll:      () => void;

    // ── Audio-analysis integration ───────────────────────────────────────
    /** Auto-generate sections from audio analysis segments. */
    generateFromAudioAnalysis: (
        segments: { type: string; startSec: number; endSec: number }[],
        fps: number,
    ) => void;

    // ── Bulk ─────────────────────────────────────────────────────────────
    clearSections: () => void;
}

export const useSectionStore = create<SectionStore>()(
    persist(
        (set) => ({
            sections: [],

            // ─── CRUD ─────────────────────────────────────────────────────────

            addSection: (section) =>
                set((state) => ({
                    sections: [
                        ...state.sections,
                        { ...section, id: nextSectionId() },
                    ].sort((a, b) => a.startFrame - b.startFrame),
                })),

            updateSection: (id, updates) =>
                set((state) => ({
                    sections: state.sections
                        .map((s) => (s.id === id ? { ...s, ...updates } : s))
                        .sort((a, b) => a.startFrame - b.startFrame),
                })),

            removeSection: (id) =>
                set((state) => ({
                    sections: state.sections.filter((s) => s.id !== id),
                })),

            // ─── Collapse / expand ────────────────────────────────────────────

            toggleCollapse: (id) =>
                set((state) => ({
                    sections: state.sections.map((s) =>
                        s.id === id ? { ...s, collapsed: !s.collapsed } : s,
                    ),
                })),

            collapseAll: () =>
                set((state) => ({
                    sections: state.sections.map((s) => ({ ...s, collapsed: true })),
                })),

            expandAll: () =>
                set((state) => ({
                    sections: state.sections.map((s) => ({ ...s, collapsed: false })),
                })),

            // ─── Audio-analysis integration ───────────────────────────────────

            generateFromAudioAnalysis: (segments, fps) => {
                // Count duplicates so we can label "Verse 1", "Verse 2", etc.
                const typeCounts: Record<string, number> = {};

                const prettify = (raw: string): string => {
                    const lower = raw.toLowerCase();
                    const labels: Record<string, string> = {
                        intro:     'Intro',
                        verse:     'Verse',
                        chorus:    'Chorus',
                        drop:      'Drop',
                        bridge:    'Bridge',
                        outro:     'Outro',
                        buildup:   'Buildup',
                        breakdown: 'Breakdown',
                    };
                    return labels[lower] ?? raw.charAt(0).toUpperCase() + raw.slice(1);
                };

                const newSections: TimelineSection[] = segments.map((seg) => {
                    const typeKey = seg.type.toLowerCase();
                    typeCounts[typeKey] = (typeCounts[typeKey] ?? 0) + 1;
                    const count = typeCounts[typeKey];
                    const label = prettify(seg.type);
                    // Only append a number if there will be more than one of this
                    // type — we do a second pass below to strip lone numbers.
                    const name = `${label} ${count}`;

                    return {
                        id: nextSectionId(),
                        name,
                        startFrame: Math.round(seg.startSec * fps),
                        endFrame: Math.round(seg.endSec * fps),
                        color: colorForType(typeKey),
                        collapsed: false,
                        audioSegmentType: (SECTION_COLORS[typeKey] ? typeKey : undefined) as
                            | AudioSegmentType
                            | undefined,
                    };
                });

                // Strip trailing " 1" from types that only appear once.
                for (const [typeKey, count] of Object.entries(typeCounts)) {
                    if (count === 1) {
                        const label = prettify(typeKey);
                        const solo = newSections.find(
                            (s) => s.name === `${label} 1`,
                        );
                        if (solo) solo.name = label;
                    }
                }

                set({ sections: newSections });
            },

            // ─── Bulk ─────────────────────────────────────────────────────────

            clearSections: () => set({ sections: [] }),
        }),
        {
            name: 'mmmedia-sections',
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({
                sections: state.sections,
            }),
        },
    ),
);
