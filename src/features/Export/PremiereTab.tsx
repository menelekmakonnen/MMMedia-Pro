import React from 'react';
import { FileCode, FileJson, Layers, Clock, Settings2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useClipStore } from '../../store/clipStore';
import { useProjectStore } from '../../store/projectStore';
import { generateManifest } from '../../lib/manifestBridge';
import { generateIcuniEdit } from '../../lib/icuniBridge';
import { toast } from '../../components/Toast';

interface Props { isExporting: boolean; onExport: () => void; disabled: boolean; }

export const PremiereTab: React.FC<Props> = ({ isExporting, onExport, disabled }) => {
    const { clips } = useClipStore();
    const { settings } = useProjectStore();
    const videoClips = clips.filter(c => c.type !== 'audio');
    const audioClips = clips.filter(c => c.type === 'audio');
    const maxFrame = videoClips.length > 0 ? Math.max(...videoClips.map(c => c.endFrame)) : 0;
    const dur = maxFrame / (settings.fps || 30);

    const [icuniBusy, setIcuniBusy] = React.useState(false);
    const handleExportIcuni = async () => {
        setIcuniBusy(true);
        try {
            const edit = generateIcuniEdit();
            const res = await window.ipcRenderer.exportIcuniEdit(JSON.stringify(edit, null, 2));
            if (res?.success) toast.success('Exported ICUNI Edit — open it in Edia to rebuild in Premiere');
            else if (!(res as any)?.canceled) toast.error('ICUNI export failed');
        } catch {
            toast.error('ICUNI export failed');
        } finally {
            setIcuniBusy(false);
        }
    };

    return (
        <div className="flex-1 flex flex-col lg:flex-row gap-6 p-6 overflow-y-auto custom-scrollbar">
            {/* Left: Illustration */}
            <div className="lg:w-[320px] flex-shrink-0 flex flex-col items-center justify-center gap-6">
                <div className="w-32 h-32 rounded-2xl bg-gradient-to-br from-blue-600/20 to-indigo-600/20 border border-blue-500/20 flex items-center justify-center shadow-2xl shadow-blue-500/10">
                    <FileCode size={56} className="text-blue-400/60" />
                </div>
                <div className="text-center">
                    <h3 className="text-lg font-black text-white">Premiere Pro</h3>
                    <p className="text-[10px] text-white/40 mt-1 max-w-[240px]">
                        Export the raw timeline manifest for the MMMedia Premiere Pro Extension panel.
                    </p>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20">
                    <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                    <span className="text-[9px] font-bold uppercase tracking-wider text-blue-300/70">Extension Required</span>
                </div>
            </div>

            {/* Right: Manifest preview + export */}
            <div className="flex-1 flex flex-col gap-5 min-w-0">
                <div className="bg-black/30 rounded-xl border border-white/5 p-4 space-y-3">
                    <div className="text-[9px] font-black uppercase tracking-widest text-white/30">Manifest Preview</div>
                    <div className="grid grid-cols-2 gap-2">
                        {[
                            { icon: <Layers size={12} />, label: 'Video Clips', value: String(videoClips.length) },
                            { icon: <Layers size={12} />, label: 'Audio Tracks', value: String(audioClips.length) },
                            { icon: <Clock size={12} />, label: 'Duration', value: dur > 0 ? `${Math.floor(dur / 60)}:${String(Math.floor(dur % 60)).padStart(2, '0')}` : '—' },
                            { icon: <Settings2 size={12} />, label: 'FPS', value: `${settings.fps || 30}` },
                        ].map(s => (
                            <div key={s.label} className="bg-black/40 rounded-lg p-3 border border-white/5 flex items-center gap-3">
                                <div className="text-blue-400/50">{s.icon}</div>
                                <div>
                                    <div className="text-[8px] font-black uppercase text-white/25 tracking-wider">{s.label}</div>
                                    <div className="text-sm font-black text-white">{s.value}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-black/30 rounded-xl border border-white/5 p-4 space-y-2">
                    <div className="text-[9px] font-black uppercase tracking-widest text-white/30">Integration Details</div>
                    {[
                        ['Format', 'Native JSON Payload (.mmm)'],
                        ['Target', 'MMMedia Premiere Panel Extension'],
                        ['Project', settings.name || 'Untitled'],
                        ['Resolution', `${settings.resolution?.width || 1920} × ${settings.resolution?.height || 1080}`],
                    ].map(([l, v]) => (
                        <div key={l} className="flex justify-between text-[10px] font-mono">
                            <span className="text-white/30">{l}</span>
                            <span className="text-white font-bold">{v}</span>
                        </div>
                    ))}
                </div>

                <div className="flex-1" />

                <motion.button onClick={onExport} disabled={disabled} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                    className="w-full py-3.5 rounded-xl text-xs font-black uppercase tracking-wider text-white bg-gradient-to-r from-blue-600 to-indigo-600 shadow-[0_0_30px_rgba(59,130,246,0.3)] hover:shadow-[0_0_40px_rgba(59,130,246,0.5)] flex items-center justify-center gap-2 disabled:opacity-40 disabled:grayscale transition-all">
                    <FileJson size={16} /> {isExporting ? 'Saving...' : 'Export Manifest for Premiere'}
                </motion.button>

                <motion.button onClick={handleExportIcuni} disabled={icuniBusy} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                    className="w-full py-3 rounded-xl text-xs font-black uppercase tracking-wider text-indigo-200 bg-indigo-600/15 border border-indigo-500/30 hover:bg-indigo-600/25 flex items-center justify-center gap-2 disabled:opacity-40 transition-all">
                    <FileCode size={16} /> {icuniBusy ? 'Saving…' : 'Export for Edia (ICUNI Edit)'}
                </motion.button>
                <p className="text-[9px] text-white/30 text-center">Edia (ChaosEdit) is the official bridge — it rebuilds this edit natively in Premiere, approximating effects and reporting anything that can’t transfer.</p>
            </div>
        </div>
    );
};
