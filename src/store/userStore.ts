import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeName = 'purple' | 'neon' | 'ocean' | 'hacker';
export type SidebarPosition = 'left' | 'right';
export type TimecodeFormat = 'timecode' | 'frames';
export type TransitionStrategy = 'cut' | 'cross-dissolve' | 'fade-to-black';
export type ViewMode = 'grid' | 'list';

interface UserState {
    theme: ThemeName;
    enableAnimations: boolean;
    defaultAutoMagnet: boolean;
    showDeveloperMode: boolean;
    
    // New Settings
    sidebarPosition: SidebarPosition;
    enableSpaceBackground: boolean;
    timecodeFormat: TimecodeFormat;
    defaultTransition: TransitionStrategy;
    mediaManagerView: ViewMode;

    // Global Volume (persists across pages & reloads)
    masterVolume: number;
    isMasterMuted: boolean;
    
    // Actions
    setTheme: (theme: ThemeName) => void;
    setEnableAnimations: (enable: boolean) => void;
    setDefaultAutoMagnet: (enable: boolean) => void;
    setShowDeveloperMode: (enable: boolean) => void;
    setSidebarPosition: (pos: SidebarPosition) => void;
    setEnableSpaceBackground: (enable: boolean) => void;
    setTimecodeFormat: (format: TimecodeFormat) => void;
    setDefaultTransition: (transition: TransitionStrategy) => void;
    setMediaManagerView: (view: ViewMode) => void;
    setMasterVolume: (vol: number) => void;
    setIsMasterMuted: (muted: boolean) => void;
}

export const useUserStore = create<UserState>()(
    persist(
        (set) => ({
            theme: 'purple',
            enableAnimations: true,
            defaultAutoMagnet: false,
            showDeveloperMode: false,
            
            sidebarPosition: 'left',
            enableSpaceBackground: true,
            timecodeFormat: 'timecode',
            defaultTransition: 'cut',
            mediaManagerView: 'grid',
            masterVolume: 1,
            isMasterMuted: false,
            
            setTheme: (theme) => set({ theme }),
            setEnableAnimations: (enableAnimations) => set({ enableAnimations }),
            setDefaultAutoMagnet: (defaultAutoMagnet) => set({ defaultAutoMagnet }),
            setShowDeveloperMode: (showDeveloperMode) => set({ showDeveloperMode }),
            setSidebarPosition: (sidebarPosition) => set({ sidebarPosition }),
            setEnableSpaceBackground: (enableSpaceBackground) => set({ enableSpaceBackground }),
            setTimecodeFormat: (timecodeFormat) => set({ timecodeFormat }),
            setDefaultTransition: (defaultTransition) => set({ defaultTransition }),
            setMediaManagerView: (mediaManagerView) => set({ mediaManagerView }),
            setMasterVolume: (masterVolume) => set({ masterVolume: Math.max(0, Math.min(1, masterVolume)) }),
            setIsMasterMuted: (isMasterMuted) => set({ isMasterMuted }),
        }),
        {
            name: 'mmmedia-user-storage',
        }
    )
);
