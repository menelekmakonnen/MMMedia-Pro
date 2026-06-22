import React from 'react';
import { motion } from 'framer-motion';
import { Film, Music, Star, BookOpen, Clapperboard, ChevronRight } from 'lucide-react';

// ══════════════════════════════════════════════════════════════════════════════
// EditGeneratorHome — the entry screen of the Edit Generator Engine.
// The user picks ONE editing style; the engine then adapts the wizard, options,
// and generation pipeline to that project type. Complexity rises 1→5.
// ══════════════════════════════════════════════════════════════════════════════

export type EditType = 'trailer' | 'music-video' | 'showreel' | 'video-essay' | 'short-film';

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
        icon: Film,
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
        icon: Music,
        accent: 'text-fuchsia-400',
        glow: 'rgba(232,121,249,0.35)',
        complexity: 2,
        driver: 'Song structure',
    },
    {
        id: 'showreel',
        label: 'Actor Showreel',
        tagline: 'Best-moment curation',
        description: 'Curated Hook → Body → Closer reel of an actor’s strongest, most diverse performances.',
        icon: Star,
        accent: 'text-cyan-400',
        glow: 'rgba(34,211,238,0.35)',
        complexity: 3,
        driver: 'Shot quality + faces',
    },
    {
        id: 'video-essay',
        label: 'Video Essay',
        tagline: 'Narration-led B-roll',
        description: 'Drop in a voiceover; the engine transcribes it and lays fitting B-roll, captions, and ducked music to match.',
        icon: BookOpen,
        accent: 'text-emerald-400',
        glow: 'rgba(52,211,153,0.35)',
        complexity: 4,
        driver: 'Voiceover transcript',
    },
    {
        id: 'short-film',
        label: 'Short Film',
        tagline: 'Narrative mastery',
        description: 'Dialogue-driven assembly from coverage — angle selection, J/L cuts, continuity, color and sound.',
        icon: Clapperboard,
        accent: 'text-rose-400',
        glow: 'rgba(251,113,133,0.35)',
        complexity: 5,
        driver: 'Script + dialogue',
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
            </div>
        </div>
    );
};
