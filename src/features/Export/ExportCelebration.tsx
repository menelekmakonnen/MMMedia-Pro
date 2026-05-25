import React from 'react';
import { motion } from 'framer-motion';
import { Trophy, FolderOpen, PlayCircle, ArrowRight, Sparkles } from 'lucide-react';

interface ExportReport {
    path: string; presetName: string; resolution: string;
    codec: string; duration: string; clipCount: number;
    elapsedSec: number; fileName: string;
}

interface Props {
    report: ExportReport;
    onDismiss: () => void;
}

export const ExportCelebration: React.FC<Props> = ({ report, onDismiss }) => {
    return (
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl"
        >
            {/* Confetti particles */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                {Array.from({ length: 40 }).map((_, i) => (
                    <motion.div
                        key={i}
                        className="absolute w-2 h-2 rounded-full"
                        style={{
                            background: ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899'][i % 6],
                            left: `${Math.random() * 100}%`,
                            top: '-5%',
                        }}
                        animate={{
                            y: ['0vh', `${80 + Math.random() * 40}vh`],
                            x: [0, (Math.random() - 0.5) * 200],
                            rotate: [0, Math.random() * 720],
                            opacity: [1, 0],
                        }}
                        transition={{
                            duration: 2.5 + Math.random() * 2,
                            delay: Math.random() * 1.5,
                            ease: 'easeOut',
                        }}
                    />
                ))}
            </div>

            <motion.div
                initial={{ scale: 0.8, opacity: 0, y: 30 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 200, damping: 20, delay: 0.2 }}
                className="relative max-w-lg w-full mx-4 bg-gradient-to-br from-[#0d1117] via-[#0a0f1a] to-[#0d1117] border border-emerald-500/20 rounded-2xl p-8 shadow-2xl shadow-emerald-500/10"
            >
                {/* Glow effects */}
                <div className="absolute -top-20 -right-20 w-60 h-60 bg-emerald-500/10 rounded-full blur-[80px] pointer-events-none" />
                <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-teal-500/8 rounded-full blur-[60px] pointer-events-none" />

                {/* Trophy header */}
                <div className="flex flex-col items-center gap-3 mb-6 relative z-10">
                    <motion.div
                        initial={{ scale: 0, rotate: -180 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: 'spring', stiffness: 200, damping: 12, delay: 0.4 }}
                        className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-2xl shadow-emerald-500/40"
                    >
                        <Trophy size={36} className="text-white drop-shadow-lg" />
                    </motion.div>
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="text-center">
                        <h2 className="text-2xl font-black tracking-tight text-white flex items-center gap-2 justify-center">
                            <Sparkles size={20} className="text-emerald-400" /> Export Complete <Sparkles size={20} className="text-emerald-400" />
                        </h2>
                        <p className="text-xs text-emerald-300/50 font-bold uppercase tracking-widest mt-1">
                            Rendered in {report.elapsedSec}s — flawless execution
                        </p>
                    </motion.div>
                </div>

                {/* Stats */}
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}
                    className="grid grid-cols-3 gap-2 mb-5 relative z-10">
                    {[
                        { label: 'Format', value: report.presetName },
                        { label: 'Resolution', value: report.resolution },
                        { label: 'Codec', value: report.codec },
                        { label: 'Duration', value: report.duration },
                        { label: 'Clips', value: String(report.clipCount) },
                        { label: 'Render Time', value: `${report.elapsedSec}s` },
                    ].map(stat => (
                        <div key={stat.label} className="bg-black/40 rounded-xl p-3 border border-emerald-500/10 text-center">
                            <div className="text-[8px] font-black uppercase text-emerald-300/40 tracking-widest mb-1">{stat.label}</div>
                            <div className="text-xs font-black text-white truncate">{stat.value}</div>
                        </div>
                    ))}
                </motion.div>

                {/* File path */}
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}
                    className="bg-black/40 rounded-lg p-3 border border-emerald-500/10 mb-5 relative z-10">
                    <div className="text-[8px] font-black uppercase text-emerald-300/40 tracking-widest mb-1">Output File</div>
                    <div className="text-[11px] font-mono text-emerald-200/80 truncate">{report.path}</div>
                </motion.div>

                {/* Actions */}
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }}
                    className="flex gap-2 relative z-10">
                    <button onClick={() => window.ipcRenderer.showItemInFolder(report.path)}
                        className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/20 text-emerald-200 font-bold text-[10px] uppercase tracking-wider transition-all">
                        <FolderOpen size={14} /> Open Folder
                    </button>
                    <button onClick={() => window.ipcRenderer.openPath(report.path)}
                        className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/20 text-emerald-200 font-bold text-[10px] uppercase tracking-wider transition-all">
                        <PlayCircle size={14} /> Play Video
                    </button>
                    <button onClick={onDismiss}
                        className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 font-bold text-[10px] uppercase tracking-wider transition-all">
                        <ArrowRight size={14} /> Export Another
                    </button>
                </motion.div>
            </motion.div>
        </motion.div>
    );
};
