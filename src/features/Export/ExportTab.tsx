import React, { useState } from 'react';
import { Download, FileJson, FileCode, CheckCircle } from 'lucide-react';
import { useClipStore } from '../../store/clipStore';
import { useProjectStore } from '../../store/projectStore';
import { generateManifest } from '../../lib/manifestBridge';

export const ExportTab: React.FC = () => {
    const { clips } = useClipStore();
    const { settings } = useProjectStore();
    const [isExporting, setIsExporting] = useState(false);
    const [lastExportPath, setLastExportPath] = useState<string | null>(null);

    const handleExportManifest = async () => {
        if (clips.length === 0) {
            alert('Timeline is empty!');
            return;
        }

        try {
            setIsExporting(true);
            const manifest = generateManifest();

            const safeProjectName = settings.name?.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'mmmedia_project';

            // 1. Select Output File
            const { canceled, filePath } = await window.ipcRenderer.showExportDialog({
                defaultPath: `${safeProjectName}_manifest.json`,
                filters: [{ name: 'MMMedia Manifest', extensions: ['json'] }]
            });

            if (canceled || !filePath) {
                setIsExporting(false);
                return;
            }

            // 2. Save Manifest
            const result = await window.ipcRenderer.saveManifest(JSON.stringify(manifest, null, 2));

            if (result.success) {
                setLastExportPath(filePath);
            } else {
                alert(`Export Failed: ${result.error}`);
            }

        } catch (error) {
            console.error('Export error:', error);
            alert('An unexpected error occurred during export.');
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="h-full w-full flex flex-col p-8 gap-8 overflow-y-auto bg-[#080816]">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-white">Export Project</h1>
                <p className="text-white/50 text-sm mt-1">Export your timeline to professional editing software or social media.</p>
            </div>

            <div className="w-full max-w-2xl mx-auto">

                {/* 1. MMMedia Pro Manifest Export */}
                <div className="bg-[#1A1A2E] border border-white/10 rounded-2xl p-8 flex flex-col gap-6 hover:border-primary/50 transition-colors group shadow-2xl">
                    <div className="flex items-center gap-4">
                        <div className="h-16 w-16 rounded-2xl bg-indigo-900/30 flex items-center justify-center text-indigo-400 border border-indigo-500/20">
                            <FileCode size={32} />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-white">MMMedia Native Manifest</h2>
                            <p className="text-white/50">Export the raw timeline data payload for the MMMedia Premiere Pro Extension.</p>
                        </div>
                    </div>

                    <div className="bg-black/40 rounded-xl p-6 text-sm text-white/60 space-y-3 font-mono border border-white/5">
                        <div className="flex justify-between border-b border-white/5 pb-2">
                            <span>Manifest Format</span>
                            <span className="text-white">Native JSON payload</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Integration</span>
                            <span className="text-white">MMMedia Premiere Panel Extension</span>
                        </div>
                    </div>

                    <div className="mt-4 space-y-3">
                        <button
                            onClick={handleExportManifest}
                            disabled={clips.length === 0 || isExporting}
                            className="w-full h-14 bg-white text-black hover:bg-white/90 font-bold rounded-xl flex items-center justify-center gap-3 transition-all text-lg shadow-lg hover:shadow-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isExporting ? 'Saving Payload...' : (
                                <>
                                    <FileJson size={20} />
                                    Export Manifest Payload
                                </>
                            )}
                        </button>
                    </div>

                    {lastExportPath && (
                        <div className="flex items-center gap-2 text-green-400 text-sm bg-green-900/20 p-3 rounded-lg justify-center border border-green-500/20 mt-2">
                            <CheckCircle size={14} />
                            <span className="truncate max-w-md">Saved to: {lastExportPath}</span>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
};
