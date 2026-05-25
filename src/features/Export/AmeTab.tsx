import React from 'react';
import { MonitorUp, Film, CheckCircle, XCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { useClipStore } from '../../store/clipStore';
import { useExportSettingsStore } from '../../store/exportSettingsStore';
import { ExportProgress } from './ExportProgress';
import { getOutputDimensions, EXPORT_PRESETS } from '../../lib/exportPresets';

interface Props { isExporting: boolean; progress: number; startTime: number; onExport: () => void; disabled: boolean; }

export const AmeTab: React.FC<Props> = ({ isExporting, progress, startTime, onExport, disabled }) => {
    const { clips } = useClipStore();
    const { orientation } = useExportSettingsStore();
    const preset = EXPORT_PRESETS.find(p => p.id === 'hd_1080')!;
    const dims = getOutputDimensions(preset, orientation);

    if (isExporting) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-8">
                <ExportProgress progress={progress} presetName="AME Intermediate" clips={clips} startTime={startTime} />
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col lg:flex-row gap-6 p-6 overflow-y-auto custom-scrollbar">
            {/* Left: Illustration */}
            <div className="lg:w-[320px] flex-shrink-0 flex flex-col items-center justify-center gap-6">
                <div className="w-32 h-32 rounded-2xl bg-gradient-to-br from-cyan-600/20 to-emerald-600/20 border border-cyan-500/20 flex items-center justify-center shadow-2xl shadow-cyan-500/10">
                    <MonitorUp size={56} className="text-cyan-400/60" />
                </div>
                <div className="text-center">
                    <h3 className="text-lg font-black text-white">Adobe Media Encoder</h3>
                    <p className="text-[10px] text-white/40 mt-1 max-w-[240px]">
                        Render a high-quality intermediate and open automatically in Adobe Media Encoder for final encoding.
                    </p>
                </div>
            </div>

            {/* Right: Details */}
            <div className="flex-1 flex flex-col gap-5 min-w-0">
                <div className="bg-black/30 rounded-xl border border-white/5 p-4 space-y-2">
                    <div className="text-[9px] font-black uppercase tracking-widest text-white/30">Export Settings</div>
                    {[
                        ['Format', 'High Quality MP4 (Lossless H.264)'],
                        ['Resolution', `${dims.w} × ${dims.h}`],
                        ['Bitrate', 'Lossless (CRF 0)'],
                        ['Audio', 'AAC 320 kbps'],
                        ['Workflow', 'Render → Auto-launch AME'],
                    ].map(([l, v]) => (
                        <div key={l} className="flex justify-between text-[10px] font-mono">
                            <span className="text-white/30">{l}</span>
                            <span className="text-white font-bold">{v}</span>
                        </div>
                    ))}
                </div>

                <div className="bg-black/30 rounded-xl border border-white/5 p-4">
                    <div className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-3">AME Detection</div>
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                            <CheckCircle size={16} className="text-cyan-400/70" />
                        </div>
                        <div>
                            <div className="text-xs font-bold text-white">Auto-detect on export</div>
                            <div className="text-[9px] text-white/30">Scans C:\Program Files\Adobe for Media Encoder</div>
                        </div>
                    </div>
                </div>

                <div className="flex-1" />

                <motion.button onClick={onExport} disabled={disabled} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                    className="w-full py-3.5 rounded-xl text-xs font-black uppercase tracking-wider text-white bg-gradient-to-r from-cyan-600 to-emerald-600 shadow-[0_0_30px_rgba(6,182,212,0.3)] hover:shadow-[0_0_40px_rgba(6,182,212,0.5)] flex items-center justify-center gap-2 disabled:opacity-40 disabled:grayscale transition-all">
                    <Film size={16} /> Export via Adobe Media Encoder
                </motion.button>
            </div>
        </div>
    );
};
