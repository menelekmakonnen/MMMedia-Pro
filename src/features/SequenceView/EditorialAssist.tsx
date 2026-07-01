import React, { useMemo } from 'react';
import { Scissors, Film, Eye, Gauge, Shield } from 'lucide-react';
import { useClipStore } from '../../store/clipStore';
import { useTrailerSmartStore } from '../../store/trailerSmartStore';

// ══════════════════════════════════════════════════════════════════════════════
// EditorialAssist — Read-only status panel for baked-in editorial rules.
//
// Sift Takes, Pacing Variety, Transition Discipline, and Eye Tracing are
// baked in as default logic — no user-facing controls. Their decisions
// appear in the Edit Plan sidebar. This panel shows compact status readouts.
// ══════════════════════════════════════════════════════════════════════════════

const DISSOLVE_TYPES = new Set(['fade', 'fadewhite', 'fadeblack', 'dissolve', 'crossdissolve']);

export const EditorialAssist: React.FC = () => {
    const clips = useClipStore((s) => s.clips);
    const getResult = useTrailerSmartStore((s) => s.getResult);

    // Visual clips on the spine, ordered by time.
    const videoClips = useMemo(
        () => clips.filter((c) => c.type !== 'audio').sort((a, b) => a.startFrame - b.startFrame),
        [clips],
    );

    // ── Pacing variety (clip-duration CoV) ──
    const pacing = useMemo(() => {
        const durs = videoClips.filter((c) => !c.disabled).map((c) => Math.max(1, c.endFrame - c.startFrame));
        if (durs.length < 2) return { variety: 0 };
        const mean = durs.reduce((a, b) => a + b, 0) / durs.length;
        const sd = Math.sqrt(durs.reduce((a, d) => a + (d - mean) ** 2, 0) / durs.length);
        const cov = mean > 0 ? sd / mean : 0;
        return { variety: Math.min(1, cov / 0.6) };
    }, [videoClips]);

    // ── Transition discipline ──
    const dissolveClips = useMemo(
        () => videoClips.filter((c) => c.transition && DISSOLVE_TYPES.has(String(c.transition.type))),
        [videoClips],
    );

    // ── Eye-trace: clips that report faces ──
    const faceClips = useMemo(
        () => videoClips.filter((c) => c.mediaLibraryId && getResult(c.mediaLibraryId)?.hasFaces),
        [videoClips, getResult],
    );

    const disabledCount = videoClips.filter((c) => c.disabled).length;

    return (
        <div className="w-full h-full overflow-y-auto bg-[#0b0b18] p-3 space-y-3 select-none">
            <p className="text-[9px] text-white/30 leading-relaxed px-0.5">
                Editorial rules from the music-video cutting playbook are <strong className="text-amber-400/60">baked in</strong> by
                default. Their decisions appear in the <strong className="text-indigo-400/60">Edit Plan</strong> sidebar.
            </p>

            {/* Compact status readout — no interactive controls */}
            <div className="rounded-lg border border-white/[0.05] bg-[#0d0d22]/50 p-3 space-y-2">
                <h4 className="text-[10px] font-black uppercase tracking-wider text-amber-400/50 flex items-center gap-1.5">
                    <Shield size={10} className="text-amber-400/50" />
                    Baked-in Rules
                </h4>

                {/* Sift Takes */}
                <div className="flex items-center gap-2 text-[9px]">
                    <Scissors size={9} className="text-purple-400/50" />
                    <span className="text-white/40">Sift Takes</span>
                    <span className="ml-auto text-[8px] text-white/20">
                        {disabledCount > 0 ? `${disabledCount} disabled` : 'all active'}
                    </span>
                </div>

                {/* Pacing */}
                <div className="flex items-center gap-2 text-[9px]">
                    <Gauge size={9} className="text-cyan-400/50" />
                    <span className="text-white/40">Pacing Variety</span>
                    <span className="ml-auto text-[8px] text-cyan-400/40 tabular-nums">
                        {Math.round(pacing.variety * 100)}%
                    </span>
                </div>

                {/* Transition Discipline */}
                <div className="flex items-center gap-2 text-[9px]">
                    <Film size={9} className="text-indigo-400/50" />
                    <span className="text-white/40">Transition Discipline</span>
                    <span className="ml-auto text-[8px] text-white/20">
                        {dissolveClips.length === 0 ? '✓ all cuts' : `${dissolveClips.length} dissolve(s)`}
                    </span>
                </div>

                {/* Eye Trace */}
                <div className="flex items-center gap-2 text-[9px]">
                    <Eye size={9} className="text-pink-400/50" />
                    <span className="text-white/40">Eye Trace</span>
                    <span className="ml-auto text-[8px] text-white/20">
                        {faceClips.length > 0 ? `${faceClips.length} face clip(s)` : 'active'}
                    </span>
                </div>
            </div>
        </div>
    );
};
