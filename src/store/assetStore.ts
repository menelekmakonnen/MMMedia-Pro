import { create } from 'zustand';
import { Effect } from '../types';
import registry from '../assets/registry.json';

// Import all effect JSONs
import fx_bw_contrast from '../assets/effects/fx_bw_contrast.json';
import fx_cinematic_teal_v1 from '../assets/effects/fx_cinematic_teal_v1.json';
import fx_gen_5 from '../assets/effects/fx_gen_5.json';
import fx_gen_6 from '../assets/effects/fx_gen_6.json';
import fx_gen_7 from '../assets/effects/fx_gen_7.json';
import fx_gen_8 from '../assets/effects/fx_gen_8.json';
import fx_gen_9 from '../assets/effects/fx_gen_9.json';
import fx_gen_10 from '../assets/effects/fx_gen_10.json';
import fx_gen_11 from '../assets/effects/fx_gen_11.json';
import fx_gen_12 from '../assets/effects/fx_gen_12.json';
import fx_gen_13 from '../assets/effects/fx_gen_13.json';
import fx_gen_14 from '../assets/effects/fx_gen_14.json';
import fx_gen_15 from '../assets/effects/fx_gen_15.json';
import fx_gen_16 from '../assets/effects/fx_gen_16.json';
import fx_gen_17 from '../assets/effects/fx_gen_17.json';
import fx_gen_18 from '../assets/effects/fx_gen_18.json';
import fx_gen_19 from '../assets/effects/fx_gen_19.json';
import fx_gen_20 from '../assets/effects/fx_gen_20.json';
import fx_neon_glow_v1 from '../assets/effects/fx_neon_glow_v1.json';
import fx_vintage_film_v1 from '../assets/effects/fx_vintage_film_v1.json';

const effectMap: Record<string, Effect> = {
    'fx_bw_contrast': fx_bw_contrast as Effect,
    'fx_cinematic_teal_v1': fx_cinematic_teal_v1 as Effect,
    'fx_gen_5': fx_gen_5 as Effect,
    'fx_gen_6': fx_gen_6 as Effect,
    'fx_gen_7': fx_gen_7 as Effect,
    'fx_gen_8': fx_gen_8 as Effect,
    'fx_gen_9': fx_gen_9 as Effect,
    'fx_gen_10': fx_gen_10 as Effect,
    'fx_gen_11': fx_gen_11 as Effect,
    'fx_gen_12': fx_gen_12 as Effect,
    'fx_gen_13': fx_gen_13 as Effect,
    'fx_gen_14': fx_gen_14 as Effect,
    'fx_gen_15': fx_gen_15 as Effect,
    'fx_gen_16': fx_gen_16 as Effect,
    'fx_gen_17': fx_gen_17 as Effect,
    'fx_gen_18': fx_gen_18 as Effect,
    'fx_gen_19': fx_gen_19 as Effect,
    'fx_gen_20': fx_gen_20 as Effect,
    'fx_neon_glow_v1': fx_neon_glow_v1 as Effect,
    'fx_vintage_film_v1': fx_vintage_film_v1 as Effect,
};

interface AssetStore {
    effects: Effect[];
    getEffect: (id: string) => Effect | undefined;
}

export const useAssetStore = create<AssetStore>(() => ({
    effects: Object.values(effectMap),
    getEffect: (id) => effectMap[id],
}));
