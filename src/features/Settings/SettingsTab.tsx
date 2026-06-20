import React, { useState, useEffect } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { Save, Upload, FileJson, Settings, Film, Activity, Shuffle } from 'lucide-react';
import { PowerMeter } from './PowerMeter';
import { useAppHealthStore } from '../../store/appHealthStore';
import { useClipStore } from '../../store/clipStore';
import { useMediaStore } from '../../store/mediaStore';
import { useUserStore } from '../../store/userStore';
import { getTransitionsByCategory, getTransitionById, CATEGORY_LABELS, type TransitionCategory } from '../../lib/transitions';
import clsx from 'clsx';
import { toast } from '../../components/Toast';
// import { useClipStore } from '../../store/clipStore'; // Dynamic import used below

export const SettingsTab: React.FC = () => {
    const { settings, updateSettings } = useProjectStore();
    const { fps, state, errorCount: _errorCount } = useAppHealthStore();
    const clipCount = useClipStore(s => s.clips.length);
    const mediaCount = useMediaStore(s => s.files.length);
    const [memMB, setMemMB] = useState(0);

    // Transition picker state
    const defaultTransition = useUserStore(s => s.defaultTransition);
    const setDefaultTransition = useUserStore(s => s.setDefaultTransition);
    const [activeTransitionTab, setActiveTransitionTab] = useState<TransitionCategory>('basic');
    const transitionsByCategory = getTransitionsByCategory();
    const categoryKeys = Object.keys(transitionsByCategory) as TransitionCategory[];

    // Poll real memory usage every 2s (Chrome/Electron performance.memory)
    useEffect(() => {
        const poll = () => {
            const perf = (performance as any);
            if (perf.memory) {
                setMemMB(Math.round(perf.memory.usedJSHeapSize / 1024 / 1024));
            }
        };
        poll();
        const id = setInterval(poll, 2000);
        return () => clearInterval(id);
    }, []);

    const stateLabel = state === 'error' ? 'ERROR' : state === 'slow' ? 'SLOW' : state === 'loading' ? 'LOADING' : 'ONLINE';

    // Static color maps to avoid dynamic Tailwind class purging
    const STATE_COLORS: Record<string, { bg: string; border: string; text: string; dot: string }> = {
        red: { bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400', dot: 'bg-red-400' },
        yellow: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', text: 'text-yellow-400', dot: 'bg-yellow-400' },
        green: { bg: 'bg-green-500/10', border: 'border-green-500/20', text: 'text-green-400', dot: 'bg-green-400' },
    };
    const stateColor = state === 'error' ? 'red' : state === 'slow' ? 'yellow' : 'green';
    const sc = STATE_COLORS[stateColor];
    const fpsColor = fps >= 50 ? 'text-green-400' : fps >= 30 ? 'text-yellow-400' : 'text-red-400';

    const selectedTransitionDef = getTransitionById(defaultTransition);

    return (
        <div className="w-full h-full overflow-y-auto custom-scrollbar">
            <div className="max-w-4xl mx-auto p-8 flex flex-col gap-8">

                {/* Header */}
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-gradient-to-br from-primary to-secondary rounded-lg shadow-lg">
                        <Settings size={20} className="text-white drop-shadow-md" />
                    </div>
                    <div>
                        <h2 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
                            Project Settings
                        </h2>
                        <p className="text-xs text-white/50">Configure your workspace and engine parameters.</p>
                    </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-8">
                    {/* Left Column: Project Config */}
                    <div className="flex flex-col gap-8">
                        
                        {/* General Configuration */}
                        <div className="border border-white/5 rounded-xl bg-black/20 p-5 space-y-5">
                            <div className="flex items-center gap-2">
                                <Film size={16} className="text-primary-300" />
                                <span className="text-sm font-bold text-white">General Configuration</span>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label htmlFor="projectName" className="text-[10px] font-black uppercase tracking-widest text-white/40 block mb-2">Project Name</label>
                                    <input
                                        id="projectName"
                                        type="text"
                                        value={settings.name}
                                        onChange={(e) => updateSettings({ name: e.target.value })}
                                        className="w-full bg-black/50 border border-white/10 rounded-lg p-3 text-white text-sm font-bold outline-none focus:border-primary/50 transition-colors"
                                    />
                                </div>

                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-white/40 block mb-2">Aspect Ratio</label>
                                    <div className="grid grid-cols-5 gap-2">
                                        {(['9:16', '16:9', '1:1', '4:3', '21:9'] as const).map((ratio) => (
                                            <button
                                                key={ratio}
                                                onClick={() => useProjectStore.getState().setAspectRatio(ratio)}
                                                className={clsx(
                                                    "flex-1 py-2 rounded-md text-[10px] font-bold transition-all border text-center",
                                                    settings.aspectRatio === ratio
                                                        ? "bg-primary/80 text-white border-primary shadow-[0_0_15px_rgba(var(--color-primary),0.3)]"
                                                        : "bg-white/5 text-white/50 border-white/10 hover:bg-white/10 hover:text-white/80"
                                                )}
                                            >
                                                {ratio}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="mt-1.5 text-[10px] font-mono text-white/30 text-right">
                                        Output: {settings.resolution.width} x {settings.resolution.height}
                                    </div>
                                </div>

                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-white/40 block mb-2">Frame Rate</label>
                                    <div className="grid grid-cols-4 gap-2">
                                        {[24, 30, 60, 120].map((fps) => (
                                            <button
                                                key={fps}
                                                onClick={() => updateSettings({ fps })}
                                                className={clsx(
                                                    "flex-1 py-2 rounded-md text-[10px] font-bold transition-all border text-center",
                                                    settings.fps === fps
                                                        ? "bg-primary/80 text-white border-primary shadow-[0_0_15px_rgba(var(--color-primary),0.3)]"
                                                        : "bg-white/5 text-white/50 border-white/10 hover:bg-white/10 hover:text-white/80"
                                                )}
                                            >
                                                {fps}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="mt-1.5 text-[10px] font-mono text-white/30 text-right">
                                        {settings.fps === 24 ? 'Cinema' : settings.fps === 30 ? 'TV/Web' : settings.fps === 60 ? 'High Motion' : 'Smooth'}
                                    </div>
                                </div>

                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-white/40 block mb-2">Background Fill</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            onClick={() => updateSettings({ backgroundFillMode: 'blur' })}
                                            className={clsx(
                                                "flex-1 py-2 rounded-md text-[10px] font-bold transition-all border text-center uppercase tracking-wider",
                                                settings.backgroundFillMode === 'blur'
                                                    ? "bg-indigo-600 text-white border-indigo-500 shadow-[0_0_15px_rgba(79,70,229,0.4)]"
                                                    : "bg-white/5 text-white/50 border-white/10 hover:bg-white/10 hover:text-white/80"
                                            )}
                                        >
                                            Blur
                                        </button>
                                        <button
                                            onClick={() => updateSettings({ backgroundFillMode: 'black' })}
                                            className={clsx(
                                                "flex-1 py-2 rounded-md text-[10px] font-bold transition-all border text-center uppercase tracking-wider",
                                                settings.backgroundFillMode === 'black'
                                                    ? "bg-indigo-600 text-white border-indigo-500 shadow-[0_0_15px_rgba(79,70,229,0.4)]"
                                                    : "bg-white/5 text-white/50 border-white/10 hover:bg-white/10 hover:text-white/80"
                                            )}
                                        >
                                            Black
                                        </button>
                                    </div>
                                    <div className="mt-1.5 text-[10px] text-white/40">
                                        Fill mode for videos that don't match the aspect ratio
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>

                    {/* Right Column: Engine Dashboard & Actions */}
                    <div className="flex flex-col gap-8">

                        {/* Actions Block */}
                        <div className="border border-white/5 rounded-xl bg-black/20 p-5 relative overflow-hidden">
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-4">Project Actions</h3>

                            <div className="grid grid-cols-2 gap-2">
                                {/* Load Project */}
                                <button
                                    onClick={async () => {
                                        await window.ipcRenderer.loadProject().then(async (res) => {
                                            if (res.success && res.content) {
                                                try {
                                                    const data = JSON.parse(res.content);
                                                    if (data.version && data.clips && data.project) {
                                                        // EditDocument format (v2+)
                                                        const { loadEditDocumentToStores } = await import('../../lib/manifestBridge');
                                                        loadEditDocumentToStores(data);
                                                        toast.success(`Project Loaded: ${data.project?.name || 'Untitled'} (${data.clips.length} clips)`);
                                                    } else if (data.manifestVersion) {
                                                        // Legacy Manifest format
                                                        const { loadManifestToStore } = await import('../../lib/manifestBridge');
                                                        loadManifestToStore(data);
                                                        toast.success(`Legacy Manifest Loaded: ${data.project?.name || 'Untitled'}`);
                                                    } else if (data.settings && data.clips) {
                                                        // Legacy { settings, clips } format
                                                        const { updateSettings } = useProjectStore.getState();
                                                        const { setClips } = useClipStore.getState();
                                                        updateSettings(data.settings);
                                                        setClips(data.clips);
                                                        toast.success(`Project Loaded: ${data.settings?.name || 'Untitled'} (${data.clips.length} clips)`);
                                                    } else {
                                                        toast.error('Unrecognized project format.');
                                                    }
                                                } catch (e) {
                                                    toast.error('Failed to parse project: ' + e);
                                                }
                                            }
                                        });
                                    }}
                                    className="flex flex-col items-center justify-center gap-2 p-4 bg-white/5 text-white/70 border border-white/5 rounded-xl hover:bg-white/10 hover:border-white/20 hover:text-white transition-all group"
                                >
                                    <Upload size={18} className="text-white/40 group-hover:text-white transition-colors" />
                                    <span className="text-[10px] font-bold uppercase tracking-wider">Load Project</span>
                                </button>

                                {/* Save Project (Primary) */}
                                <button
                                    onClick={async () => {
                                        const { generateEditDocument } = await import('../../lib/manifestBridge');
                                        const doc = generateEditDocument();
                                        const projectData = JSON.stringify(doc, null, 2);
                                        await window.ipcRenderer.saveProject(projectData);
                                    }}
                                    className="flex flex-col items-center justify-center gap-2 p-4 bg-primary/20 text-primary-300 border border-primary/30 rounded-xl hover:bg-primary/80 hover:text-white hover:border-primary transition-all group shadow-[0_0_15px_rgba(var(--color-primary),0.1)]"
                                >
                                    <Save size={18} className="group-hover:scale-110 transition-transform" />
                                    <span className="text-[10px] font-bold uppercase tracking-wider">Save Project</span>
                                </button>

                                {/* Import Manifest */}
                                <button
                                    onClick={async () => {
                                        await window.ipcRenderer.importManifest().then(async res => {
                                            if (res.success && res.content) {
                                                try {
                                                    const manifest = JSON.parse(res.content);
                                                    const { loadManifestToStore } = await import('../../lib/manifestBridge');
                                                    loadManifestToStore(manifest);
                                                    toast.success("Manifest Imported Successfully! Found " + (manifest.clips?.length || 0) + " clips.");
                                                } catch (e) {
                                                    toast.error("Failed to parse manifest: " + e);
                                                }
                                            }
                                        })
                                    }}
                                    className="flex flex-col items-center justify-center gap-2 p-4 bg-white/5 text-white/70 border border-white/5 rounded-xl hover:bg-white/10 hover:border-white/20 hover:text-white transition-all group"
                                >
                                    <FileJson size={18} className="text-white/40 group-hover:text-white transition-colors" />
                                    <span className="text-[10px] font-bold text-center uppercase tracking-wider">Import Manifest</span>
                                </button>

                                {/* Export Manifest */}
                                <button
                                    onClick={async () => {
                                        const { generateManifest } = await import('../../lib/manifestBridge');
                                        const manifest = generateManifest();
                                        const json = JSON.stringify(manifest, null, 2);
                                        await window.ipcRenderer.exportManifest(json);
                                    }}
                                    className="flex flex-col items-center justify-center gap-2 p-4 bg-white/5 text-white/70 border border-white/5 rounded-xl hover:bg-white/10 hover:border-white/20 hover:text-white transition-all group"
                                >
                                    <FileJson size={18} className="text-white/40 group-hover:text-white transition-colors" />
                                    <span className="text-[10px] font-bold text-center uppercase tracking-wider">Export Manifest</span>
                                </button>
                            </div>
                        </div>

                        {/* Engine Status */}
                        <div className="border border-white/10 rounded-xl bg-gradient-to-br from-[#1a1a2e] to-[#0d0d1a] p-5 relative overflow-hidden group">
                            {/* Glow effect */}
                            <div className="absolute -top-20 -right-20 w-64 h-64 bg-primary/20 rounded-full blur-[80px]" />

                            <div className="flex justify-between items-center mb-6 relative z-10">
                                <div className="flex items-center gap-2">
                                    <Activity size={16} className="text-primary-300" />
                                    <h2 className="text-sm font-bold text-white">Engine Status</h2>
                                </div>
                                <div className={`px-2 py-0.5 ${sc.bg} border ${sc.border} rounded text-[10px] ${sc.text} font-mono font-bold flex items-center gap-1.5`}>
                                    <div className={`w-1.5 h-1.5 rounded-full ${sc.dot} animate-pulse`} />
                                    {stateLabel}
                                </div>
                            </div>

                            <div className="flex flex-col items-center justify-center py-2 relative z-10">
                                <PowerMeter label="Render Core" color="var(--color-primary)" />

                                <div className="grid grid-cols-3 gap-2 w-full mt-6">
                                    <div className="bg-black/40 p-2 rounded-lg text-center border border-white/5">
                                        <div className="text-[10px] text-white/40 mb-0.5 font-bold">MEM</div>
                                        <div className="text-sm font-mono font-bold text-white/90">{memMB > 1024 ? (memMB / 1024).toFixed(1) : memMB}<span className="text-[10px] font-normal text-white/40 ml-0.5">{memMB > 1024 ? 'GB' : 'MB'}</span></div>
                                    </div>
                                    <div className="bg-black/40 p-2 rounded-lg text-center border border-white/5">
                                        <div className="text-[10px] text-white/40 mb-0.5 font-bold">FPS</div>
                                        <div className={clsx("text-sm font-mono font-bold", fpsColor)}>{fps}</div>
                                    </div>
                                    <div className="bg-black/40 p-2 rounded-lg text-center border border-white/5">
                                        <div className="text-[10px] text-white/40 mb-0.5 font-bold">LOAD</div>
                                        <div className="text-sm font-mono font-bold text-white/90">{clipCount + mediaCount}<span className="text-[10px] font-normal text-white/40 ml-0.5">items</span></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>

            </div>
        </div>
    );
};
