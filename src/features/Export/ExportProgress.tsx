import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Film, Clock, HardDrive, Zap, Music } from 'lucide-react';
import { Clip } from '../../types';

interface Props {
    progress: number;
    presetName: string;
    clips: Clip[];
    startTime: number;
    projectName?: string;
    exportFilename?: string;
    resolution?: string;
    duration?: number;
    status?: 'active' | 'success' | 'failed';
}

export const ExportProgress: React.FC<Props> = ({
    progress, presetName, clips, startTime,
    projectName, exportFilename, resolution, duration, status = 'active'
}) => {
    const [currentThumbIdx, setCurrentThumbIdx] = useState(0);
    const videoClips = clips.filter(c => c.type === 'video');
    const audioClips = clips.filter(c => c.type === 'audio');

    useEffect(() => {
        if (videoClips.length <= 1) return;
        const interval = setInterval(() => {
            setCurrentThumbIdx(prev => (prev + 1) % videoClips.length);
        }, 2500);
        return () => clearInterval(interval);
    }, [videoClips.length]);

    useEffect(() => {
        if (videoClips.length === 0) return;
        const idx = Math.min(Math.floor((progress / 100) * videoClips.length), videoClips.length - 1);
        setCurrentThumbIdx(idx);
    }, [Math.floor(progress / 10)]);

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const eta = progress > 2 ? Math.round((elapsed / progress) * (100 - progress)) : 0;
    const currentClip = videoClips[currentThumbIdx];
    const circumference = 2 * Math.PI * 54;
    const strokeDashoffset = circumference - (progress / 100) * circumference;

    const formatTime = (s: number) => {
        if (s < 60) return `${s}s`;
        return `${Math.floor(s / 60)}m ${s % 60}s`;
    };

    // SVG bar gradient IDs
    const barGradId = 'export-bar-grad';
    const barGlowId = 'export-bar-glow';

    return (
        <div className="flex flex-col items-center gap-5 py-4 relative z-10 w-full max-w-2xl mx-auto">
            {/* Project Info Header */}
            <div className="w-full grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                    { icon: Film, label: 'Project', value: projectName || 'Untitled', color: 'text-violet-300' },
                    { icon: Clock, label: 'Duration', value: duration ? `${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, '0')}` : '—', color: 'text-cyan-300' },
                    { icon: Zap, label: 'Resolution', value: resolution || presetName, color: 'text-amber-300' },
                    { icon: Music, label: 'Tracks', value: `${videoClips.length}V + ${audioClips.length}A`, color: 'text-pink-300' },
                ].map(({ icon: Icon, label, value, color }) => (
                    <div key={label} className="bg-black/40 backdrop-blur-sm border border-white/5 rounded-xl p-3 text-center">
                        <Icon size={14} className={`${color} mx-auto mb-1 opacity-60`} />
                        <div className="text-[8px] font-black uppercase tracking-widest text-white/25">{label}</div>
                        <div className="text-[11px] font-bold text-white/80 truncate mt-0.5">{value}</div>
                    </div>
                ))}
            </div>

            {/* Thumbnail + circular progress */}
            <div className="relative w-44 h-44">
                <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="4" />
                    <circle cx="60" cy="60" r="54" fill="none"
                        stroke={status === 'failed' ? '#ef4444' : status === 'success' ? '#22c55e' : 'url(#progressGrad)'}
                        strokeWidth="4" strokeLinecap="round"
                        strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
                        className="transition-all duration-500 ease-out"
                        filter={status === 'success' ? 'url(#successGlow)' : undefined}
                    />
                    <defs>
                        <linearGradient id="progressGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#8b5cf6" />
                            <stop offset="50%" stopColor="#06b6d4" />
                            <stop offset="100%" stopColor="#a855f7" />
                        </linearGradient>
                        <filter id="successGlow">
                            <feGaussianBlur stdDeviation="3" result="blur" />
                            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                        </filter>
                    </defs>
                </svg>
                <div className="absolute inset-3 rounded-full overflow-hidden bg-black/60 border border-white/10">
                    {currentClip ? (
                        <motion.video
                            key={currentClip.id}
                            initial={{ opacity: 0, scale: 1.1 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.6 }}
                            src={`file://${currentClip.path}`}
                            className="w-full h-full object-cover"
                            muted preload="metadata"
                            ref={(el) => { if (el) el.currentTime = (currentClip.trimStartFrame ?? 0) / 30; }}
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center">
                            <Loader2 size={24} className="text-white/20 animate-spin" />
                        </div>
                    )}
                </div>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="bg-black/70 backdrop-blur-sm rounded-full px-3 py-1">
                        <span className="text-lg font-black font-mono text-white">{progress}%</span>
                    </div>
                </div>
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-6 text-[10px] font-mono">
                <div className="text-center">
                    <div className="text-white/30 uppercase tracking-wider mb-0.5">Encoding</div>
                    <div className="text-white/80 font-bold">{presetName}</div>
                </div>
                <div className="w-px h-6 bg-white/10" />
                <div className="text-center">
                    <div className="text-white/30 uppercase tracking-wider mb-0.5">Elapsed</div>
                    <div className="text-white/80 font-bold">{formatTime(elapsed)}</div>
                </div>
                <div className="w-px h-6 bg-white/10" />
                <div className="text-center">
                    <div className="text-white/30 uppercase tracking-wider mb-0.5">ETA</div>
                    <div className="text-primary-300 font-bold">{eta > 0 ? `~${formatTime(eta)}` : '—'}</div>
                </div>
                <div className="w-px h-6 bg-white/10" />
                <div className="text-center">
                    <div className="text-white/30 uppercase tracking-wider mb-0.5">Est. Size</div>
                    <div className="text-cyan-300 font-bold flex items-center gap-1"><HardDrive size={9} /> —</div>
                </div>
            </div>

            {/* Rich SVG Progress Bar */}
            <div className="w-full max-w-md">
                <svg width="100%" height="28" viewBox="0 0 400 28" className="drop-shadow-lg">
                    <defs>
                        <linearGradient id={barGradId} x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor="#7c3aed" />
                            <stop offset="30%" stopColor="#8b5cf6" />
                            <stop offset="60%" stopColor="#06b6d4" />
                            <stop offset="100%" stopColor="#a855f7" />
                        </linearGradient>
                        <filter id={barGlowId}>
                            <feGaussianBlur stdDeviation="2" result="blur" />
                            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                        </filter>
                        <clipPath id="barClip"><rect x="4" y="4" width="392" height="20" rx="10" /></clipPath>
                    </defs>
                    {/* Background track */}
                    <rect x="4" y="4" width="392" height="20" rx="10" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                    {/* Segment markers */}
                    {[25, 50, 75].map(pct => (
                        <line key={pct} x1={4 + (392 * pct / 100)} y1="6" x2={4 + (392 * pct / 100)} y2="22" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                    ))}
                    {/* Progress fill */}
                    <rect x="4" y="4" width={Math.max(0, 392 * progress / 100)} height="20" rx="10"
                        fill={status === 'failed' ? '#ef4444' : status === 'success' ? '#22c55e' : `url(#${barGradId})`}
                        filter={`url(#${barGlowId})`}
                        clipPath="url(#barClip)"
                    >
                        {status === 'active' && <animate attributeName="opacity" values="0.85;1;0.85" dur="2s" repeatCount="indefinite" />}
                    </rect>
                    {/* Leading edge glow */}
                    {status === 'active' && progress > 2 && progress < 100 && (
                        <circle cx={4 + 392 * progress / 100} cy="14" r="6"
                            fill="none" stroke="rgba(139,92,246,0.6)" strokeWidth="2"
                            filter={`url(#${barGlowId})`}>
                            <animate attributeName="r" values="4;8;4" dur="1.5s" repeatCount="indefinite" />
                            <animate attributeName="opacity" values="0.8;0.3;0.8" dur="1.5s" repeatCount="indefinite" />
                        </circle>
                    )}
                    {/* Percentage label on bar */}
                    {progress > 8 && (
                        <text x={Math.min(4 + 392 * progress / 100 - 8, 380)} y="18" fill="white" fontSize="9" fontWeight="900" fontFamily="monospace" textAnchor="end">{progress}%</text>
                    )}
                </svg>
            </div>

            {/* Clip counter */}
            {currentClip && (
                <div className="text-[9px] text-white/25 font-mono">
                    Clip {currentThumbIdx + 1} of {videoClips.length} · {currentClip.filename}
                </div>
            )}

            {/* Export filename */}
            {exportFilename && (
                <div className="text-[8px] text-white/15 font-mono truncate max-w-xs">{exportFilename}</div>
            )}
        </div>
    );
};
