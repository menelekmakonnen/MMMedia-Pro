// ══════════════════════════════════════════════════════════════════════════════
// Transition Registry — All FFmpeg xfade transition types
// ══════════════════════════════════════════════════════════════════════════════

export type TransitionCategory = 'fades' | 'wipes' | 'slides' | 'shapes' | 'diagonal' | 'slices' | 'special';

export interface TransitionDef {
    id: string;           // xfade name (e.g., 'fade', 'wipeleft')
    name: string;         // Display name (e.g., 'Fade', 'Wipe Left')
    category: TransitionCategory;
    description: string;  // Short description
    icon?: string;        // Lucide icon name
}

export const TRANSITION_REGISTRY: TransitionDef[] = [
    // ── Fades ──
    { id: 'cut',        name: 'Hard Cut',     category: 'fades', description: 'Instant cut with no transition effect',              icon: 'Scissors' },
    { id: 'fade',       name: 'Fade',         category: 'fades', description: 'Classic cross-dissolve between clips',               icon: 'SunDim' },
    { id: 'fadeblack',  name: 'Fade Black',   category: 'fades', description: 'Fade through black between clips',                   icon: 'Moon' },
    { id: 'fadewhite',  name: 'Fade White',   category: 'fades', description: 'Fade through white between clips',                   icon: 'Sun' },
    { id: 'fadegrays',  name: 'Fade Grays',   category: 'fades', description: 'Fade through grayscale between clips',               icon: 'Contrast' },
    { id: 'dissolve',   name: 'Dissolve',     category: 'fades', description: 'Gradual pixel-level dissolve transition',            icon: 'Sparkles' },

    // ── Wipes ──
    { id: 'wipeleft',    name: 'Wipe Left',     category: 'wipes', description: 'Hard wipe from right to left',                    icon: 'ArrowLeft' },
    { id: 'wiperight',   name: 'Wipe Right',    category: 'wipes', description: 'Hard wipe from left to right',                    icon: 'ArrowRight' },
    { id: 'wipeup',      name: 'Wipe Up',       category: 'wipes', description: 'Hard wipe from bottom to top',                    icon: 'ArrowUp' },
    { id: 'wipedown',    name: 'Wipe Down',     category: 'wipes', description: 'Hard wipe from top to bottom',                    icon: 'ArrowDown' },
    { id: 'wipetl',      name: 'Wipe TL',       category: 'wipes', description: 'Wipe from bottom-right to top-left corner',       icon: 'ArrowUpLeft' },
    { id: 'wipetr',      name: 'Wipe TR',       category: 'wipes', description: 'Wipe from bottom-left to top-right corner',       icon: 'ArrowUpRight' },
    { id: 'wipebl',      name: 'Wipe BL',       category: 'wipes', description: 'Wipe from top-right to bottom-left corner',       icon: 'ArrowDownLeft' },
    { id: 'wipebr',      name: 'Wipe BR',       category: 'wipes', description: 'Wipe from top-left to bottom-right corner',       icon: 'ArrowDownRight' },
    { id: 'smoothleft',  name: 'Smooth Left',   category: 'wipes', description: 'Soft-edge wipe from right to left',              icon: 'ChevronsLeft' },
    { id: 'smoothright', name: 'Smooth Right',  category: 'wipes', description: 'Soft-edge wipe from left to right',              icon: 'ChevronsRight' },
    { id: 'smoothup',    name: 'Smooth Up',     category: 'wipes', description: 'Soft-edge wipe from bottom to top',              icon: 'ChevronsUp' },
    { id: 'smoothdown',  name: 'Smooth Down',   category: 'wipes', description: 'Soft-edge wipe from top to bottom',              icon: 'ChevronsDown' },

    // ── Slides ──
    { id: 'slideleft',  name: 'Slide Left',   category: 'slides', description: 'Next clip slides in from the right',               icon: 'PanelLeft' },
    { id: 'slideright', name: 'Slide Right',  category: 'slides', description: 'Next clip slides in from the left',                icon: 'PanelRight' },
    { id: 'slideup',    name: 'Slide Up',     category: 'slides', description: 'Next clip slides in from below',                   icon: 'PanelTop' },
    { id: 'slidedown',  name: 'Slide Down',   category: 'slides', description: 'Next clip slides in from above',                   icon: 'PanelBottom' },

    // ── Shapes ──
    { id: 'circleopen',  name: 'Circle Open',   category: 'shapes', description: 'Circular iris opening from center',              icon: 'Circle' },
    { id: 'circleclose', name: 'Circle Close',  category: 'shapes', description: 'Circular iris closing to center',                icon: 'CircleDot' },
    { id: 'circlecrop',  name: 'Circle Crop',   category: 'shapes', description: 'Circular crop transition',                       icon: 'CircleDashed' },
    { id: 'vertopen',    name: 'Vert Open',     category: 'shapes', description: 'Vertical blinds opening from center',            icon: 'Columns2' },
    { id: 'vertclose',   name: 'Vert Close',    category: 'shapes', description: 'Vertical blinds closing to center',              icon: 'Columns3' },
    { id: 'horzopen',    name: 'Horz Open',     category: 'shapes', description: 'Horizontal blinds opening from center',          icon: 'Rows2' },
    { id: 'horzclose',   name: 'Horz Close',    category: 'shapes', description: 'Horizontal blinds closing to center',            icon: 'Rows3' },
    { id: 'rectcrop',    name: 'Rect Crop',     category: 'shapes', description: 'Rectangular crop reveal transition',             icon: 'Square' },
    { id: 'squeezeh',    name: 'Squeeze H',     category: 'shapes', description: 'Horizontal squeeze transition',                  icon: 'MoveHorizontal' },
    { id: 'squeezev',    name: 'Squeeze V',     category: 'shapes', description: 'Vertical squeeze transition',                    icon: 'MoveVertical' },

    // ── Diagonal ──
    { id: 'diagtl',  name: 'Diag TL',  category: 'diagonal', description: 'Diagonal wipe towards top-left',                       icon: 'ArrowUpLeft' },
    { id: 'diagtr',  name: 'Diag TR',  category: 'diagonal', description: 'Diagonal wipe towards top-right',                      icon: 'ArrowUpRight' },
    { id: 'diagbl',  name: 'Diag BL',  category: 'diagonal', description: 'Diagonal wipe towards bottom-left',                    icon: 'ArrowDownLeft' },
    { id: 'diagbr',  name: 'Diag BR',  category: 'diagonal', description: 'Diagonal wipe towards bottom-right',                   icon: 'ArrowDownRight' },

    // ── Slices ──
    { id: 'hlslice',  name: 'H-Left Slice',   category: 'slices', description: 'Horizontal left slice transition',                 icon: 'AlignLeft' },
    { id: 'hrslice',  name: 'H-Right Slice',  category: 'slices', description: 'Horizontal right slice transition',                icon: 'AlignRight' },
    { id: 'vuslice',  name: 'V-Up Slice',     category: 'slices', description: 'Vertical upward slice transition',                 icon: 'AlignStartVertical' },
    { id: 'vdslice',  name: 'V-Down Slice',   category: 'slices', description: 'Vertical downward slice transition',               icon: 'AlignEndVertical' },

    // ── Special ──
    { id: 'pixelize',  name: 'Pixelize',   category: 'special', description: 'Pixelation dissolve effect',                         icon: 'Grid3x3' },
    { id: 'distance',  name: 'Distance',   category: 'special', description: 'Color-distance based transition',                    icon: 'Radar' },
    { id: 'radial',    name: 'Radial',     category: 'special', description: 'Radial sweep transition',                            icon: 'RotateCw' },
    { id: 'hblur',     name: 'H-Blur',     category: 'special', description: 'Horizontal blur transition',                         icon: 'Blend' },
];

// ── Helper: group by category ──
export function getTransitionsByCategory(): Record<TransitionCategory, TransitionDef[]> {
    const groups: Record<TransitionCategory, TransitionDef[]> = {
        fades: [],
        wipes: [],
        slides: [],
        shapes: [],
        diagonal: [],
        slices: [],
        special: [],
    };
    for (const t of TRANSITION_REGISTRY) {
        groups[t.category].push(t);
    }
    return groups;
}

// ── Helper: lookup by id ──
export function getTransitionById(id: string): TransitionDef | undefined {
    return TRANSITION_REGISTRY.find(t => t.id === id);
}

// ── Flat list of all IDs ──
export const ALL_TRANSITION_IDS: string[] = TRANSITION_REGISTRY.map(t => t.id);

// ── Category display labels ──
export const CATEGORY_LABELS: Record<TransitionCategory, string> = {
    fades: 'Fades',
    wipes: 'Wipes',
    slides: 'Slides',
    shapes: 'Shapes',
    diagonal: 'Diagonal',
    slices: 'Slices',
    special: 'Special',
};
