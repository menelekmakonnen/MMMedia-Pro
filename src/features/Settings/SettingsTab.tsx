import React from 'react';
import { useProjectStore, ResolutionPreset } from '../../store/projectStore';
import { Settings, Save, Zap, Upload, FileJson } from 'lucide-react';
import { PowerMeter } from './PowerMeter';
// import { useClipStore } from '../../store/clipStore'; // Dynamic import used below

export const SettingsTab: React.FC = () => {
    const { settings, updateSettings, setResolution } = useProjectStore();

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
                                <label className="block text-xs font-medium text-white/40 mb-1 uppercase tracking-wider">Resolution</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {(['720p', '1080p', '4K'] as ResolutionPreset[]).map((res) => (
                                        <button
                                            key={res}
                                            onClick={() => setResolution(res)}
                                            className={`px-4 py-3 rounded-lg text-sm font-medium transition-all ${settings.resolution.label.includes(res)
                                                ? 'bg-primary text-white shadow-lg shadow-primary/25 ring-1 ring-white/20'
                                                : 'bg-[#0a0a15] text-white/60 hover:text-white hover:bg-white/10'
                                                }`}
                                        >
                                            {res}
                                        </button>
                                    ))}
                                </div>
                                <div className="mt-2 text-xs text-white/30 text-right">
                                    Output: {settings.resolution.width} x {settings.resolution.height}
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-white/40 mb-1 uppercase tracking-wider">Frame Rate</label>
                                <select
                                    value={settings.fps}
                                    onChange={(e) => updateSettings({ fps: Number(e.target.value) })}
                                    className="w-full bg-[#0a0a15] border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-primary/50"
                                >
                                    <option value="24">24 fps (Cinema)</option>
                                    <option value="30">30 fps (TV/Web)</option>
                                    <option value="60">60 fps (High Motion)</option>
                                    <option value="120">120 fps (Smooth)</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-white/40 mb-1 uppercase tracking-wider">Aspect Ratio</label>
                                <select
                                    value={`${settings.resolution.width}:${settings.resolution.height}`}
                                    onChange={(e) => {
                                        const ratio = e.target.value;
                                        let width = settings.resolution.width;
                                        let height = settings.resolution.height;

                                        // Calculate new dimensions based on ratio
                                        const baseHeight = settings.resolution.height;
                                        switch (ratio) {
                                            case '16:9':
                                                width = Math.round(baseHeight * (16 / 9));
                                                break;
                                            case '9:16':
                                                width = Math.round(baseHeight * (9 / 16));
                                                break;
                                            case '4:3':
                                                width = Math.round(baseHeight * (4 / 3));
                                                break;
                                            case '1:1':
                                                width = baseHeight;
                                                break;
                                            case '21:9':
                                                width = Math.round(baseHeight * (21 / 9));
                                                break;
                                        }

                                        updateSettings({
                                            resolution: {
                                                width,
                                                height,
                                                label: `${width}x${height}`
                                            }
                                        });
                                    }}
                                    className="w-full bg-[#0a0a15] border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-primary/50"
                                >
                                    <option value="16:9">16:9 (Widescreen)</option>
                                    <option value="9:16">9:16 (Vertical/Mobile)</option>
                                    <option value="4:3">4:3 (Standard)</option>
                                    <option value="1:1">1:1 (Square)</option>
                                    <option value="21:9">21:9 (Ultrawide)</option>
                                </select>
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

                    {/* God Mode Toggle */}
                    <div className="p-6 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="h-10 w-10 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400">
                                <Zap size={20} />
                            </div>
                            <div>
                                <h3 className="font-medium text-white/90">God Mode</h3>
                                <p className="text-xs text-white/40">Enable AI automation tools</p>
                            </div>
                        </div>
                        <button className="h-8 w-14 bg-primary rounded-full relative transition-all hover:bg-primary/80">
                            <div className="absolute top-1 right-1 h-6 w-6 bg-white rounded-full shadow-sm" />
                        </button>
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
