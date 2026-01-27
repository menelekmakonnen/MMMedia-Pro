import React, { useState } from 'react';
import { Share2, FileCheck, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useProjectStore } from '../../store/projectStore';
import { useClipStore } from '../../store/clipStore';
import { generateManifest } from '../../lib/manifestBridge';

export const ExportTab: React.FC = () => {
    const { settings } = useProjectStore();
    const { clips } = useClipStore();
    const [exportStatus, setExportStatus] = useState<'idle' | 'success' | 'error'>('idle');

    const handleExportManifest = async () => {
        try {
            const manifest = generateManifest();
            const manifestJson = JSON.stringify(manifest, null, 2);

            const result = await window.ipcRenderer.exportManifest(manifestJson);

            if (result.success) {
                setExportStatus('success');
                setTimeout(() => setExportStatus('idle'), 3000);
            } else {
                setExportStatus('error');
            }
        } catch (error) {
            console.error('Export failed:', error);
            setExportStatus('error');
        }
    };

    const handleSaveProject = async () => {
        try {
            const projectData = {
                settings,
                clips,
                version: '1.0.0',
                savedAt: new Date().toISOString()
            };

            const result = await window.ipcRenderer.saveProject(JSON.stringify(projectData, null, 2));

            if (result.success) {
                setExportStatus('success');
                setTimeout(() => setExportStatus('idle'), 3000);
            } else {
                setExportStatus('error');
            }
        } catch (error) {
            console.error('Save failed:', error);
            setExportStatus('error');
        }
    };

    return (
        <div className="h-full w-full flex flex-col p-8 gap-6 overflow-y-auto">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Export</h1>
                <p className="text-white/50 text-sm mt-1">Export your project or manifest file.</p>
            </div>

            {/* Export Options */}
            <div className="grid grid-cols-2 gap-6">
                {/* Export Manifest */}
                <div className="bg-white/5 border border-white/10 rounded-xl p-6 hover:bg-white/10 transition-colors">
                    <div className="flex items-start gap-4">
                        <div className="p-3 bg-primary/20 rounded-lg">
                            <FileCheck className="text-primary" size={24} />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-lg font-semibold text-white/90 mb-2">Export Manifest</h3>
                            <p className="text-sm text-white/50 mb-4">
                                Export a portable JSON manifest of your project for use in other tools or workflows.
                            </p>
                            <button
                                onClick={handleExportManifest}
                                className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/80 text-white rounded-lg transition-colors font-medium"
                            >
                                <Share2 size={16} />
                                Export Manifest
                            </button>
                        </div>
                    </div>
                </div>

                {/* Save Project */}
                <div className="bg-white/5 border border-white/10 rounded-xl p-6 hover:bg-white/10 transition-colors">
                    <div className="flex items-start gap-4">
                        <div className="p-3 bg-green-500/20 rounded-lg">
                            <CheckCircle2 className="text-green-400" size={24} />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-lg font-semibold text-white/90 mb-2">Save Project</h3>
                            <p className="text-sm text-white/50 mb-4">
                                Save your complete project as a .mmm file including all settings and clip data.
                            </p>
                            <button
                                onClick={handleSaveProject}
                                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors font-medium"
                            >
                                <CheckCircle2 size={16} />
                                Save Project
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Status Messages */}
            {exportStatus === 'success' && (
                <div className="bg-green-500/20 border border-green-500/50 rounded-lg p-4 flex items-center gap-3">
                    <CheckCircle2 className="text-green-400" size={20} />
                    <div>
                        <p className="text-green-400 font-medium">Export Successful!</p>
                        <p className="text-green-400/70 text-sm">Your file has been saved.</p>
                    </div>
                </div>
            )}

            {exportStatus === 'error' && (
                <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 flex items-center gap-3">
                    <AlertCircle className="text-red-400" size={20} />
                    <div>
                        <p className="text-red-400 font-medium">Export Failed</p>
                        <p className="text-red-400/70 text-sm">Please try again.</p>
                    </div>
                </div>
            )}

            {/* Project Info */}
            <div className="mt-8 bg-black/30 rounded-xl p-6 border border-white/5">
                <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-4">Project Info</h3>
                <div className="grid grid-cols-3 gap-4">
                    <div>
                        <div className="text-xs text-white/40 mb-1">Project Name</div>
                        <div className="text-sm text-white/90">{settings.name}</div>
                    </div>
                    <div>
                        <div className="text-xs text-white/40 mb-1">Resolution</div>
                        <div className="text-sm text-white/90">{settings.resolution.width}x{settings.resolution.height}</div>
                    </div>
                    <div>
                        <div className="text-xs text-white/40 mb-1">Frame Rate</div>
                        <div className="text-sm text-white/90">{settings.fps} FPS</div>
                    </div>
                    <div>
                        <div className="text-xs text-white/40 mb-1">Total Clips</div>
                        <div className="text-sm text-white/90">{clips.length}</div>
                    </div>
                </div>
            </div>
        </div>
    );
};
