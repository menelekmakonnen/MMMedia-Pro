import React from 'react';
import { useProjectStore } from '../../store/projectStore';
import { Settings, Save, Upload, FileJson } from 'lucide-react';
import { PowerMeter } from './PowerMeter';
// import { useClipStore } from '../../store/clipStore'; // Dynamic import used below

export const SettingsTab: React.FC = () => {
    const { settings, updateSettings } = useProjectStore();

    return (
        <div className="flex h-full w-full flex-col gap-8 p-8 overflow-y-auto w-full max-w-5xl mx-auto animate-in fade-in duration-300">

            {/* Header */}
            <div className="flex items-center gap-4 border-b border-white/10 pb-6">
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center shadow-lg shadow-primary/20">
                    <Settings className="text-white" size={24} />
                </div>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Project Settings</h1>
                    <p className="text-white/50 text-sm mt-1">Configure your workspace and engine parameters.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Left Column: Project Config */}
                <div className="flex flex-col gap-6">
                    <div className="p-6 rounded-2xl bg-white/5 border border-white/5 backdrop-blur-sm">
                        <h2 className="text-lg font-semibold mb-4 text-white/90">General Configuration</h2>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-white/40 mb-1 uppercase tracking-wider">Project Name</label>
                                <input
                                    type="text"
                                    value={settings.name}
                                    onChange={(e) => updateSettings({ name: e.target.value })}
                                    className="w-full bg-[#0a0a15] border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-primary/50 transition-colors"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-white/40 mb-2 uppercase tracking-wider">Aspect Ratio</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {(['9:16', '16:9', '1:1', '4:3', '21:9'] as const).map((ratio) => (
                                        <button
                                            key={ratio}
                                            onClick={() => useProjectStore.getState().setAspectRatio(ratio)}
                                            className={`px-3 py-3 rounded-lg text-sm font-medium transition-all ${settings.aspectRatio === ratio
                                                ? 'bg-primary text-white shadow-lg shadow-primary/25 ring-1 ring-white/20'
                                                : 'bg-[#0a0a15] text-white/60 hover:text-white hover:bg-white/10'
                                                }`}
                                        >
                                            {ratio}
                                        </button>
                                    ))}
                                </div>
                                <div className="mt-2 text-xs text-white/30 text-right">
                                    Output: {settings.resolution.width} x {settings.resolution.height}
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-white/40 mb-2 uppercase tracking-wider">Frame Rate</label>
                                <div className="grid grid-cols-4 gap-2">
                                    {[24, 30, 60, 120].map((fps) => (
                                        <button
                                            key={fps}
                                            onClick={() => updateSettings({ fps })}
                                            className={`px-3 py-3 rounded-lg text-sm font-medium transition-all ${settings.fps === fps
                                                ? 'bg-primary text-white shadow-lg shadow-primary/25 ring-1 ring-white/20'
                                                : 'bg-[#0a0a15] text-white/60 hover:text-white hover:bg-white/10'
                                                }`}
                                        >
                                            {fps}
                                        </button>
                                    ))}
                                </div>
                                <div className="mt-2 text-xs text-white/30 text-right">
                                    {settings.fps === 24 ? 'Cinema' : settings.fps === 30 ? 'TV/Web' : settings.fps === 60 ? 'High Motion' : 'Smooth'}
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-white/40 mb-2 uppercase tracking-wider">Background Fill</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => updateSettings({ backgroundFillMode: 'blur' })}
                                        className={`px-4 py-3 rounded-lg text-sm font-medium transition-all ${settings.backgroundFillMode === 'blur'
                                            ? 'bg-primary text-white shadow-lg shadow-primary/25 ring-1 ring-white/20'
                                            : 'bg-[#0a0a15] text-white/60 hover:text-white hover:bg-white/10'
                                            }`}
                                    >
                                        Blur
                                    </button>
                                    <button
                                        onClick={() => updateSettings({ backgroundFillMode: 'black' })}
                                        className={`px-4 py-3 rounded-lg text-sm font-medium transition-all ${settings.backgroundFillMode === 'black'
                                            ? 'bg-primary text-white shadow-lg shadow-primary/25 ring-1 ring-white/20'
                                            : 'bg-[#0a0a15] text-white/60 hover:text-white hover:bg-white/10'
                                            }`}
                                    >
                                        Black
                                    </button>
                                </div>
                                <div className="mt-2 text-xs text-white/40">
                                    Fill mode for videos that don't match the aspect ratio
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column: Engine Dashboard */}
                <div className="flex flex-col gap-6">
                    <div className="p-6 rounded-2xl bg-gradient-to-br from-[#1a1a2e] to-[#0d0d1a] border border-white/10 relative overflow-hidden group">
                        {/* Glow effect */}
                        <div className="absolute -top-20 -right-20 w-64 h-64 bg-primary/20 rounded-full blur-[80px]" />

                        <div className="flex justify-between items-start mb-6 relative z-10">
                            <h2 className="text-lg font-semibold text-white/90">Engine Status</h2>
                            <div className="px-2 py-1 bg-green-500/10 border border-green-500/20 rounded text-xs text-green-400 font-mono flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                                ONLINE
                            </div>
                        </div>

                        <div className="flex flex-col items-center justify-center py-4 relative z-10">
                            <PowerMeter label="Render Core" color="#8b5cf6" />

                            <div className="grid grid-cols-3 gap-4 w-full mt-6">
                                <div className="bg-black/30 p-3 rounded-lg text-center backdrop-blur-sm border border-white/5">
                                    <div className="text-xs text-white/40 mb-1">MEM</div>
                                    <div className="text-lg font-mono font-bold text-white/90">1.2<span className="text-xs font-normal text-white/40 ml-1">GB</span></div>
                                </div>
                                <div className="bg-black/30 p-3 rounded-lg text-center backdrop-blur-sm border border-white/5">
                                    <div className="text-xs text-white/40 mb-1">FPS</div>
                                    <div className="text-lg font-mono font-bold text-white/90">60</div>
                                </div>
                                <div className="bg-black/30 p-3 rounded-lg text-center backdrop-blur-sm border border-white/5">
                                    <div className="text-xs text-white/40 mb-1">GPU</div>
                                    <div className="text-lg font-mono font-bold text-green-400">ON</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer Actions */}
            <div className="mt-auto flex justify-end gap-3 pt-6 border-t border-white/5">

                {/* Load Project */}
                <button
                    onClick={async () => {
                        await window.ipcRenderer.loadProject().then(res => {
                            if (res.success && res.content) {
                                const data = JSON.parse(res.content);
                                console.log("Loaded Project:", data);
                                alert("Project Loaded: " + (data.settings?.name || "Untitled"));
                                // TODO: Hydrate stores
                            }
                        });
                    }}
                    className="flex items-center gap-2 px-4 py-3 bg-[#0a0a15] text-white/70 border border-white/10 rounded-lg hover:bg-white/5 hover:text-white transition-colors text-sm"
                >
                    <Upload size={16} />
                    Load Project
                </button>

                <div className="w-px h-10 bg-white/10 mx-2" />

                {/* Import Manifest */}
                <button
                    onClick={async () => {
                        // Dynamic import to avoid circular dependencies if any
                        await window.ipcRenderer.importManifest().then(async res => {
                            if (res.success && res.content) {
                                try {
                                    const manifest = JSON.parse(res.content);
                                    const { loadManifestToStore } = await import('../../lib/manifestBridge');
                                    loadManifestToStore(manifest);
                                    alert("Manifest Imported Successfully! Found " + manifest.media.length + " clips.");
                                } catch (e) {
                                    alert("Failed to parse manifest: " + e);
                                }
                            }
                        })
                    }}
                    className="flex items-center gap-2 px-4 py-3 bg-[#0a0a15] text-white border border-white/10 rounded-lg hover:bg-white/5 transition-colors text-sm"
                >
                    <FileJson size={16} />
                    Import Manifest
                </button>

                {/* Export Manifest */}
                <button
                    onClick={async () => {
                        const { generateManifest } = await import('../../lib/manifestBridge');
                        const manifest = generateManifest();
                        const json = JSON.stringify(manifest, null, 2);
                        await window.ipcRenderer.exportManifest(json);
                    }}
                    className="flex items-center gap-2 px-4 py-3 bg-[#0a0a15] text-white border border-white/10 rounded-lg hover:bg-white/5 transition-colors text-sm"
                >
                    <FileJson size={16} />
                    Export Manifest
                </button>

                {/* Save Project (Primary) */}
                <button
                    onClick={async () => {
                        const { settings } = useProjectStore.getState();
                        const { clips } = await import('../../store/clipStore').then(m => m.useClipStore.getState());
                        const projectData = JSON.stringify({ settings, clips }, null, 2);
                        await window.ipcRenderer.saveProject(projectData);
                    }}
                    className="flex items-center gap-2 px-6 py-3 bg-white text-black font-semibold rounded-lg hover:bg-gray-200 transition-colors shadow-lg shadow-white/10"
                >
                    <Save size={18} />
                    Save Project
                </button>
            </div>

        </div>
    );
};
