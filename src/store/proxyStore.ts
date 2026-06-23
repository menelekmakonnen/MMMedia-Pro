import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface ProxyEntry {
    proxyPath: string;
    status: 'pending' | 'rendering' | 'ready' | 'failed';
    /** Authoritative Electron MD5 hash = the proxy filename id. Empty until ready.
     *  This is the ONLY value used to invalidate/delete the real proxy file. */
    hash: string;
    /** Renderer-side settings signature, used purely for change detection
     *  (do NOT use to delete files — it does not match the Electron filename). */
    settingsSig: string;
    clipId: string;
}

interface ProxyStore {
    proxies: Record<string, ProxyEntry>;   // keyed by clipId
    requestProxy: (clipId: string, settingsSig: string) => void;
    setProxyRendering: (clipId: string) => void;
    setProxyReady: (clipId: string, proxyPath: string, hash: string) => void;
    setProxyFailed: (clipId: string) => void;
    invalidateProxy: (clipId: string) => void;
    getProxy: (clipId: string) => ProxyEntry | undefined;
    clearAllProxies: () => void;
}

export const useProxyStore = create<ProxyStore>()(
    persist(
        (set, get) => ({
            proxies: {},

            requestProxy: (clipId: string, settingsSig: string) => {
                set((state) => ({
                    proxies: {
                        ...state.proxies,
                        [clipId]: {
                            clipId,
                            hash: '',          // unknown until Electron returns it
                            settingsSig,
                            proxyPath: '',
                            status: 'pending',
                        },
                    },
                }));
            },

            setProxyRendering: (clipId: string) => {
                set((state) => {
                    const existing = state.proxies[clipId];
                    if (!existing) return state;
                    return {
                        proxies: {
                            ...state.proxies,
                            [clipId]: { ...existing, status: 'rendering' },
                        },
                    };
                });
            },

            setProxyReady: (clipId: string, proxyPath: string, hash: string) => {
                set((state) => {
                    const existing = state.proxies[clipId];
                    if (!existing) return state;
                    return {
                        proxies: {
                            ...state.proxies,
                            // Store Electron's authoritative hash so invalidation
                            // deletes the correct <hash>.mp4 file.
                            [clipId]: { ...existing, proxyPath, hash, status: 'ready' },
                        },
                    };
                });
            },

            setProxyFailed: (clipId: string) => {
                set((state) => {
                    const existing = state.proxies[clipId];
                    if (!existing) return state;
                    return {
                        proxies: {
                            ...state.proxies,
                            [clipId]: { ...existing, status: 'failed' },
                        },
                    };
                });
            },

            invalidateProxy: (clipId: string) => {
                const proxy = get().proxies[clipId];
                if (proxy && proxy.proxyPath) {
                    // Request deletion via IPC (fire-and-forget)
                    try {
                        window.ipcRenderer?.invalidatePreviewProxy?.({ hash: proxy.hash });
                    } catch { /* ignore if IPC not available */ }
                }
                set((state) => {
                    const newProxies = { ...state.proxies };
                    delete newProxies[clipId];
                    return { proxies: newProxies };
                });
            },

            getProxy: (clipId: string) => {
                return get().proxies[clipId];
            },

            clearAllProxies: () => {
                set({ proxies: {} });
            },
        }),
        {
            name: 'mmmedia-proxy-storage',
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({
                proxies: state.proxies,
            }),
        }
    )
);
