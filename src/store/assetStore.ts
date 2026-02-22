import { create } from 'zustand';
import { Asset, SpeedRamp, Effect } from '../types';

// Import assets directly
import rampFlashIn from '../assets/speed-ramps/ramp_flash_in.json';
import fxBwContrast from '../assets/effects/fx_bw_contrast.json';

interface AssetStore {
    speedRamps: SpeedRamp[];
    effects: Effect[];
    isLoading: boolean;

    getAsset: (id: string) => Asset | undefined;
    getSpeedRamp: (id: string) => SpeedRamp | undefined;
    getEffect: (id: string) => Effect | undefined;
}

// Map the imported JSONs to a lookup
const speedRampMap: Record<string, SpeedRamp> = {
    'ramp_flash_in': rampFlashIn as SpeedRamp
};

const effectMap: Record<string, Effect> = {
    'fx_bw_contrast': fxBwContrast as Effect
};

export const useAssetStore = create<AssetStore>(() => ({
    speedRamps: Object.values(speedRampMap),
    effects: Object.values(effectMap),
    isLoading: false,

    getAsset: (id) => {
        return speedRampMap[id] || effectMap[id];
    },

    getSpeedRamp: (id) => {
        return speedRampMap[id];
    },

    getEffect: (id) => {
        return effectMap[id];
    }
}));
