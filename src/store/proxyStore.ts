import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface ProxyEntry {
    proxyPath: string;
    status: 'pending' | 'rendering' | 'ready' | 'failed';
    hash: string;        // hash of clip visual settings
    clipId: string;
}

interface ProxyStore {
    proxies: Record<string, ProxyEntry>;   // keyed by clipId
    requestProxy: (clipId: string, hash: string) => void;
    setProxyRendering: (clipId: string) => void;
    setProxyReady: (clipId: string, proxyPath: string) => void;
    setProxyFailed: (clipId: string) => void;
    invalidateProxy: (clipId: string) => void;
    getProxy: (clipId: string) => ProxyEntry | undefined;
    clearAllProxies: () => void;
}

export const useProxyStore = create<ProxyStore>()(
    persist(
        (set, get) => ({
            proxies: {},

            requestProxy: (clipId: string, hash: string) => {
                set((state) => ({
                    proxies: {
                        ...state.proxies,
                        [clipId]: {
                            clipId,
                            hash,
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

            setProxyReady: (clipId: string, proxyPath: string) => {
                set((state) => {
                    const existing = state.proxies[clipId];
                    if (!existing) return state;
                    return {
                        proxies: {
                            ...state.proxies,
                            [clipId]: { ...existing, proxyPath, status: 'ready' },
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
