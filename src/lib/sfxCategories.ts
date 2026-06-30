/**
 * SFX Category Taxonomy
 *
 * Professional sound-effect category system modeled after broadcast/post-production
 * libraries (Boom, Soundsnap, Artlist). Each category carries subcategories with
 * keyword arrays used by `sfxCategorizer.ts` for filename-based auto-tagging.
 */

export interface SfxSubcategory {
    id: string;
    name: string;
    /** Keywords matched (case-insensitive) against filenames for auto-categorization. */
    keywords: string[];
}

export interface SfxCategory {
    id: string;
    name: string;
    /** Lucide icon name rendered in the sidebar. */
    icon: string;
    subcategories: SfxSubcategory[];
    description: string;
}

export const SFX_CATEGORIES: SfxCategory[] = [
    // ── Transitions ──────────────────────────────────────────────────────────
    {
        id: 'transitions',
        name: 'Transitions',
        icon: 'ArrowRightLeft',
        description: 'Swooshes, whooshes, risers, drops, and transition hits',
        subcategories: [
            {
                id: 'swoosh',
                name: 'Swoosh / Whoosh',
                keywords: ['swoosh', 'whoosh', 'swish', 'whip', 'flyby', 'fly-by', 'passby', 'pass-by', 'sweep'],
            },
            {
                id: 'riser',
                name: 'Risers',
                keywords: ['riser', 'rise', 'build', 'buildup', 'build-up', 'ascend', 'tension-rise', 'uplifter'],
            },
            {
                id: 'drop',
                name: 'Drops',
                keywords: ['drop', 'downfall', 'descend', 'downer', 'fall', 'dropdown'],
            },
            {
                id: 'transition-hit',
                name: 'Transition Hits',
                keywords: ['transition', 'trans-hit', 'stinger-hit', 'accent-hit', 'punch-hit'],
            },
        ],
    },

    // ── Impacts ───────────────────────────────────────────────────────────────
    {
        id: 'impacts',
        name: 'Impacts',
        icon: 'Zap',
        description: 'Bass drops, hits, slams, thuds, and booms',
        subcategories: [
            {
                id: 'bass-drop',
                name: 'Bass Drop',
                keywords: ['bass_drop', 'bassdrop', 'bass-drop', 'sub-drop', 'subdrop', 'sub_drop', 'low-end'],
            },
            {
                id: 'hit',
                name: 'Hits',
                keywords: ['hit', 'impact', 'punch', 'slam', 'smack', 'strike', 'thump', 'knock-hit'],
            },
            {
                id: 'thud',
                name: 'Thuds & Booms',
                keywords: ['thud', 'boom', 'rumble', 'thump', 'pound', 'stomp', 'crash', 'explosion', 'blast'],
            },
        ],
    },

    // ── Foley: Domestic ──────────────────────────────────────────────────────
    {
        id: 'foley-domestic',
        name: 'Foley — Domestic',
        icon: 'Home',
        description: 'Doors, footsteps, alarms, kitchen, household sounds',
        subcategories: [
            {
                id: 'doors',
                name: 'Doors',
                keywords: ['door', 'knock', 'creak', 'hinge', 'doorbell', 'slam-door', 'latch', 'lock', 'unlock'],
            },
            {
                id: 'footsteps',
                name: 'Footsteps',
                keywords: ['footstep', 'walk', 'step', 'stairs', 'running', 'jog', 'shuffle', 'heel'],
            },
            {
                id: 'alarms',
                name: 'Alarms & Clocks',
                keywords: ['alarm', 'clock', 'timer', 'beep-alarm', 'buzzer', 'wake-up', 'ring'],
            },
            {
                id: 'kitchen',
                name: 'Kitchen & Glass',
                keywords: ['kitchen', 'glass', 'plate', 'cup', 'pour', 'bottle', 'clink', 'dish', 'cutlery', 'knife', 'fork'],
            },
            {
                id: 'objects',
                name: 'Objects & Props',
                keywords: ['object', 'prop', 'paper', 'book', 'page', 'switch', 'toggle', 'zipper', 'bag', 'box', 'fabric', 'cloth', 'curtain'],
            },
        ],
    },

    // ── Foley: Body ──────────────────────────────────────────────────────────
    {
        id: 'foley-body',
        name: 'Foley — Body',
        icon: 'Hand',
        description: 'Claps, snaps, breaths, and body movement sounds',
        subcategories: [
            {
                id: 'claps',
                name: 'Claps & Snaps',
                keywords: ['clap', 'snap', 'finger-snap', 'handclap', 'applause'],
            },
            {
                id: 'breaths',
                name: 'Breaths',
                keywords: ['breath', 'inhale', 'exhale', 'gasp', 'sigh', 'pant', 'blow'],
            },
            {
                id: 'body-movement',
                name: 'Body Movement',
                keywords: ['body', 'movement', 'rustle', 'clothing', 'jacket', 'shirt'],
            },
        ],
    },

    // ── Ambience: Nature ─────────────────────────────────────────────────────
    {
        id: 'ambience-nature',
        name: 'Ambience — Nature',
        icon: 'Trees',
        description: 'Birds, wind, water, insects, and outdoor environments',
        subcategories: [
            {
                id: 'birds',
                name: 'Birds',
                keywords: ['bird', 'chirp', 'tweet', 'songbird', 'crow', 'seagull', 'owl', 'pigeon'],
            },
            {
                id: 'wind',
                name: 'Wind',
                keywords: ['wind', 'breeze', 'gust', 'gale', 'howl-wind'],
            },
            {
                id: 'water',
                name: 'Water',
                keywords: ['water', 'rain', 'river', 'stream', 'ocean', 'wave', 'splash', 'drip', 'waterfall', 'lake'],
            },
            {
                id: 'insects',
                name: 'Insects',
                keywords: ['insect', 'bee', 'bees', 'cricket', 'cicada', 'fly', 'mosquito', 'buzz'],
            },
            {
                id: 'nature-general',
                name: 'General Nature',
                keywords: ['nature', 'forest', 'jungle', 'field', 'meadow', 'thunder', 'storm', 'lightning'],
            },
        ],
    },

    // ── Ambience: Urban ──────────────────────────────────────────────────────
    {
        id: 'ambience-urban',
        name: 'Ambience — Urban',
        icon: 'Building2',
        description: 'Traffic, crowds, streets, and city environments',
        subcategories: [
            {
                id: 'traffic',
                name: 'Traffic',
                keywords: ['traffic', 'car', 'vehicle', 'horn', 'engine', 'highway', 'road', 'truck', 'bus', 'motorcycle'],
            },
            {
                id: 'crowds',
                name: 'Crowds & People',
                keywords: ['crowd', 'people', 'chatter', 'murmur', 'audience', 'stadium', 'walla', 'cafe', 'restaurant', 'bar'],
            },
            {
                id: 'street',
                name: 'Street & City',
                keywords: ['street', 'city', 'urban', 'subway', 'metro', 'train', 'construction', 'siren', 'ambulance', 'police'],
            },
            {
                id: 'room-tone',
                name: 'Room Tone',
                keywords: ['room-tone', 'roomtone', 'room_tone', 'interior', 'office', 'hvac', 'air-con', 'ac-hum', 'hum'],
            },
        ],
    },

    // ── Camera ───────────────────────────────────────────────────────────────
    {
        id: 'camera',
        name: 'Camera',
        icon: 'Camera',
        description: 'Shutter clicks, flash, film reel, and photography sounds',
        subcategories: [
            {
                id: 'shutter',
                name: 'Shutter & Click',
                keywords: ['shutter', 'camera', 'cam', 'click-cam', 'dslr', 'photo', 'snapshot', 'capture'],
            },
            {
                id: 'flash',
                name: 'Flash',
                keywords: ['flash', 'strobe', 'vgt_flash', 'bulb-flash', 'paparazzi'],
            },
            {
                id: 'film-reel',
                name: 'Film Reel',
                keywords: ['reel', 'film', 'projector', 'celluloid', 'sprocket', '8mm', '16mm', '35mm', 'film-strip'],
            },
        ],
    },

    // ── UI / Tech ────────────────────────────────────────────────────────────
    {
        id: 'ui-tech',
        name: 'UI / Tech',
        icon: 'Monitor',
        description: 'Clicks, beeps, notifications, and digital interface sounds',
        subcategories: [
            {
                id: 'clicks',
                name: 'Clicks & Taps',
                keywords: ['click', 'tap', 'button', 'ui-click', 'mouse', 'press', 'select'],
            },
            {
                id: 'beeps',
                name: 'Beeps & Tones',
                keywords: ['beep', 'bleep', 'tone', 'ping', 'chime', 'ding'],
            },
            {
                id: 'notifications',
                name: 'Notifications',
                keywords: ['notification', 'notify', 'alert', 'message', 'popup', 'badge', 'ringtone'],
            },
            {
                id: 'glitch-digital',
                name: 'Glitch & Digital',
                keywords: ['glitch', 'digital', 'error', 'static', 'interference', 'data', 'corrupt', 'malfunction', 'circuit'],
            },
        ],
    },

    // ── Musical ──────────────────────────────────────────────────────────────
    {
        id: 'musical',
        name: 'Musical',
        icon: 'Music',
        description: 'Stingers, accents, swells, and musical punctuation',
        subcategories: [
            {
                id: 'stingers',
                name: 'Stingers',
                keywords: ['stinger', 'sting', 'reveal', 'logo-sting', 'bumper'],
            },
            {
                id: 'accents',
                name: 'Accents',
                keywords: ['accent', 'flourish', 'ornament', 'musical-hit'],
            },
            {
                id: 'swells',
                name: 'Swells',
                keywords: ['swell', 'crescendo', 'pad', 'strings', 'orchestral', 'brass', 'horn'],
            },
        ],
    },

    // ── Cinematic ────────────────────────────────────────────────────────────
    {
        id: 'cinematic',
        name: 'Cinematic',
        icon: 'Film',
        description: 'Drones, tones, tension builders, and atmospheric textures',
        subcategories: [
            {
                id: 'drones',
                name: 'Drones',
                keywords: ['drone', 'ambient', 'atmosphere', 'atmos', 'texture', 'underscore'],
            },
            {
                id: 'tension',
                name: 'Tension',
                keywords: ['tension', 'suspense', 'horror', 'scary', 'eerie', 'dark', 'ominous', 'creepy'],
            },
            {
                id: 'cinematic-hit',
                name: 'Cinematic Hits',
                keywords: ['cinematic', 'epic', 'trailer-hit', 'braaam', 'inception', 'massive'],
            },
        ],
    },

    // ── Miscellaneous (catch-all) ────────────────────────────────────────────
    {
        id: 'miscellaneous',
        name: 'Miscellaneous',
        icon: 'MoreHorizontal',
        description: 'Uncategorized and general-purpose sound effects',
        subcategories: [
            {
                id: 'misc-general',
                name: 'General',
                keywords: [],
            },
        ],
    },
];

/** Quick lookup map: categoryId → SfxCategory */
export const CATEGORY_MAP = new Map<string, SfxCategory>(
    SFX_CATEGORIES.map((c) => [c.id, c]),
);

/** Quick lookup map: subcategoryId → SfxSubcategory */
export const SUBCATEGORY_MAP = new Map<string, SfxSubcategory>(
    SFX_CATEGORIES.flatMap((c) => c.subcategories.map((sc) => [sc.id, sc])),
);
