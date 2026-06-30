import React from 'react';
import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { NleQuickPresets } from './NleQuickPresets';
import { GeneratorModePanel } from './GeneratorModePanel';

// ─── Custom animated SVG icons for each generator mode ──────────────────────

/** Trailer icon — film strip with pulsing cut marks */
const TrailerIcon: React.FC<{ size?: number; className?: string; strokeWidth?: number }> = ({ size = 22, className }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={`${className ?? ''} gm-trailer`}>
        <rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <line x1="7" y1="4" x2="7" y2="20" stroke="currentColor" strokeWidth="1" opacity="0.5" />
        <line x1="12" y1="4" x2="12" y2="20" stroke="currentColor" strokeWidth="1.5" />
        <line x1="17" y1="4" x2="17" y2="20" stroke="currentColor" strokeWidth="1" opacity="0.5" />
        <polygon points="10,9 10,15 14,12" fill="currentColor" opacity="0.7" />
    </svg>
);

/** Music Video icon — waveform with musical note */
const MusicVideoIcon: React.FC<{ size?: number; className?: string; strokeWidth?: number }> = ({ size = 22, className }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={`${className ?? ''} gm-mv`}>
        <path d="M3 12h2l2-4 2 8 2-6 2 4 2-2h2l2-3 2 6h1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="18" cy="16" r="2" stroke="currentColor" strokeWidth="1.5" />
        <line x1="20" y1="8" x2="20" y2="16" stroke="currentColor" strokeWidth="1.5" />
        <path d="M20 8c1-0.5 2 0 2 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
);

/** Showreel icon — star spotlight with film border */
const ShowreelIcon: React.FC<{ size?: number; className?: string; strokeWidth?: number }> = ({ size = 22, className }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={`${className ?? ''} gm-reel`}>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
        <line x1="12" y1="3" x2="12" y2="9" stroke="currentColor" strokeWidth="1" opacity="0.4" />
        <line x1="12" y1="15" x2="12" y2="21" stroke="currentColor" strokeWidth="1" opacity="0.4" />
        <line x1="3" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="1" opacity="0.4" />
        <line x1="15" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="1" opacity="0.4" />
    </svg>
);

/** Video Essay icon — open book with pen/narration line */
const VideoEssayIcon: React.FC<{ size?: number; className?: string; strokeWidth?: number }> = ({ size = 22, className }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={`${className ?? ''} gm-essay`}>
        <path d="M4 19V5a2 2 0 012-2h8l6 6v10a2 2 0 01-2 2H6a2 2 0 01-2-2z" stroke="currentColor" strokeWidth="1.5" />
        <path d="M14 3v6h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="8" y1="13" x2="16" y2="13" stroke="currentColor" strokeWidth="1" opacity="0.5" />
        <line x1="8" y1="16" x2="13" y2="16" stroke="currentColor" strokeWidth="1" opacity="0.5" />
    </svg>
);

/** Short Film icon — clapperboard with scene markings */
const ShortFilmIcon: React.FC<{ size?: number; className?: string; strokeWidth?: number }> = ({ size = 22, className }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={`${className ?? ''} gm-clap`}>
        <rect x="3" y="8" width="18" height="13" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <path d="M3 8l3-5h12l3 5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <line x1="7" y1="3" x2="9" y2="8" stroke="currentColor" strokeWidth="1" opacity="0.5" />
        <line x1="12" y1="3" x2="13" y2="8" stroke="currentColor" strokeWidth="1" opacity="0.5" />
        <line x1="17" y1="3" x2="17" y2="8" stroke="currentColor" strokeWidth="1" opacity="0.5" />
    </svg>
);

/** Social Media icon — phone with play button and trending arrow */
const SocialMediaIcon: React.FC<{ size?: number; className?: string; strokeWidth?: number }> = ({ size = 22, className }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={`${className ?? ''} gm-social`}>
        <rect x="6" y="2" width="12" height="20" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <polygon points="10,9 10,15 15,12" fill="currentColor" opacity="0.7" />
        <path d="M14 18h2" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.5" />
        <path d="M17 6l2-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
        <path d="M19 4l0 2.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.4" />
        <path d="M19 4l-2.5 0" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.4" />
    </svg>
);

/** BTS icon — camera with behind-scenes clapperboard */
const BtsIcon: React.FC<{ size?: number; className?: string; strokeWidth?: number }> = ({ size = 22, className }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={`${className ?? ''} gm-bts`}>
        <rect x="2" y="9" width="15" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M17 13l4-2.5v7L17 15" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <circle cx="9" cy="14.5" r="2.5" stroke="currentColor" strokeWidth="1" opacity="0.4" />
        <path d="M5 9V6l3-3h4l3 3v3" stroke="currentColor" strokeWidth="1" opacity="0.5" strokeLinejoin="round" />
    </svg>
);

// ══════════════════════════════════════════════════════════════════════════════
// EditGeneratorHome — the entry screen of the Edit Generator Engine.
// The user picks ONE editing style; the engine then adapts the wizard, options,
// and generation pipeline to that project type. Complexity rises 1→5.
// ══════════════════════════════════════════════════════════════════════════════

export type EditType = 'trailer' | 'music-video' | 'showreel' | 'video-essay' | 'short-film' | 'social-media' | 'bts';

export interface EditTypeDef {
    id: EditType;
    label: string;
    tagline: string;
    description: string;
    icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
    accent: string;        // tailwind text color
    glow: string;          // box-shadow color
    complexity: number;    // 1..5
    driver: string;        // what the engine keys off
}

export const EDIT_TYPES: EditTypeDef[] = [
    {
        id: 'trailer',
        label: 'Trailer',
        tagline: 'Beat-driven hype',
        description: 'High-impact montage that escalates to a climax, cut to the energy of your music.',
        icon: TrailerIcon,
        accent: 'text-amber-400',
        glow: 'rgba(251,191,36,0.35)',
        complexity: 1,
        driver: 'Music energy',
    },
    {
        id: 'music-video',
        label: 'Music Video',
        tagline: 'Song-structured',
        description: 'Whole-song edit anchored to downbeats, with performance and B-roll paced per section.',
        icon: MusicVideoIcon,
        accent: 'text-fuchsia-400',
        glow: 'rgba(232,121,249,0.35)',
        complexity: 2,
        driver: 'Song structure',
    },
    {
        id: 'social-media',
        label: 'Social Media',
        tagline: 'Viral-ready formats',
        description: 'Optimized cuts for TikTok, Reels, Shorts, and Stories. Vertical-first, attention-grabbing hooks, trending edit styles.',
        icon: SocialMediaIcon,
        accent: 'text-pink-400',
        glow: 'rgba(244,114,182,0.35)',
        complexity: 2,
        driver: 'Platform + trend style',
    },
    {
        id: 'bts',
        label: 'BTS',
        tagline: 'Behind the scenes',
        description: 'Document the creative process. Setup → shoot → result intercuts, crew moments, and production diary formats.',
        icon: BtsIcon,
        accent: 'text-orange-400',
        glow: 'rgba(251,146,60,0.35)',
        complexity: 2,
        driver: 'Process + candids',
    },
];

interface EditGeneratorHomeProps {
    onSelect: (type: EditType) => void;
    /** Optional: which types are fully wired (others show a "Beta" tag). */
    readyTypes?: EditType[];
}

const ComplexityDots: React.FC<{ level: number }> = ({ level }) => (
    <div className="flex items-center gap-1" title={`Complexity ${level}/5`}>
        {[1, 2, 3, 4, 5].map((n) => (
            <span
                key={n}
                className={`w-1.5 h-1.5 rounded-full ${n <= level ? 'bg-white/70' : 'bg-white/15'}`}
            />
        ))}
    </div>
);

export const EditGeneratorHome: React.FC<EditGeneratorHomeProps> = ({ onSelect, readyTypes }) => {
    return (
        <>
        <style>{`
            @keyframes gm-pulse { 0%,100%{opacity:1} 50%{opacity:0.7;transform:scale(1.05)} }
            @keyframes gm-bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-2px)} }
            @keyframes gm-spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
            @keyframes gm-write { 0%,100%{transform:translateX(0)} 50%{transform:translateX(2px)} }
            @keyframes gm-snap { 0%,100%{transform:scaleY(1)} 20%{transform:scaleY(0.95)} 40%{transform:scaleY(1.02)} }
            .group:hover .gm-trailer { animation: gm-pulse 1.2s ease-in-out infinite; }
            .group:hover .gm-mv { animation: gm-bounce 0.8s ease-in-out infinite; }
            .group:hover .gm-reel { animation: gm-spin 2s linear infinite; }
            .group:hover .gm-essay { animation: gm-write 1s ease-in-out infinite; }
            .group:hover .gm-clap { animation: gm-snap 0.5s ease-in-out infinite; }
            @keyframes gm-viral { 0%,100%{transform:scale(1)} 25%{transform:scale(1.1) rotate(3deg)} 75%{transform:scale(0.95) rotate(-3deg)} }
            .group:hover .gm-social { animation: gm-viral 0.8s ease-in-out infinite; }
            @keyframes gm-rec { 0%,100%{opacity:1} 50%{opacity:0.5} }
            .group:hover .gm-bts { animation: gm-rec 1s ease-in-out infinite; }
        `}</style>
        <div className="h-full w-full overflow-y-auto p-8">
            <div className="max-w-5xl mx-auto">
                {/* Header */}
                <div className="mb-8 text-center">
                    <h1 className="text-2xl font-black tracking-tight text-white">Edit Generator</h1>
                    <p className="text-sm text-white/45 mt-1">
                        Choose what you’re making. The engine adapts every option and the whole pipeline to it.
                    </p>
                </div>

                {/* Type grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {EDIT_TYPES.map((t, i) => {
                        const Icon = t.icon;
                        const ready = !readyTypes || readyTypes.includes(t.id);
                        return (
                            <motion.button
                                key={t.id}
                                onClick={() => onSelect(t.id)}
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.05 }}
                                whileHover={{ scale: 1.02, y: -2 }}
                                whileTap={{ scale: 0.98 }}
                                className="group relative text-left rounded-2xl p-5 bg-white/[0.03] border border-white/10 hover:border-white/20 transition-colors overflow-hidden"
                                style={{ boxShadow: `0 0 0 0 ${t.glow}` }}
                            >
                                {/* hover glow */}
                                <div
                                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                                    style={{ boxShadow: `inset 0 0 40px -12px ${t.glow}` }}
                                />
                                <div className="relative">
                                    <div className="flex items-start justify-between mb-3">
                                        <div className={`p-2.5 rounded-xl bg-white/5 ${t.accent}`}>
                                            <Icon size={22} strokeWidth={1.6} />
                                        </div>
                                        <div className="flex flex-col items-end gap-1.5">
                                            <ComplexityDots level={t.complexity} />
                                            {!ready && (
                                                <span className="text-[8px] font-bold uppercase tracking-wider text-amber-300/80 bg-amber-500/10 px-1.5 py-0.5 rounded">
                                                    Beta
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <h2 className="text-base font-bold text-white">{t.label}</h2>
                                        <ChevronRight size={14} className="text-white/20 group-hover:text-white/50 transition-colors" />
                                    </div>
                                    <p className={`text-[11px] font-semibold uppercase tracking-wider mt-0.5 ${t.accent}`}>{t.tagline}</p>
                                    <p className="text-xs text-white/45 mt-2 leading-relaxed">{t.description}</p>
                                    <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
                                        <span className="text-[10px] text-white/30 uppercase tracking-wider">Driven by</span>
                                        <span className="text-[10px] text-white/55 font-medium">{t.driver}</span>
                                    </div>
                                </div>
                            </motion.button>
                        );
                    })}
                </div>

                {/* One-click automated NLE presets that operate on the live timeline */}
                <NleQuickPresets />

                {/* Generator Modes — style templates built from real edits, with toggles + SFX */}
                <GeneratorModePanel variant="full" />
            </div>
        </div>
        </>
    );
};
