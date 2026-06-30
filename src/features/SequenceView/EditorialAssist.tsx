import React, { useMemo } from 'react';
import { Scissors, AlertTriangle, Film, Eye, Gauge, EyeOff, Check } from 'lucide-react';
import { useClipStore, type Clip } from '../../store/clipStore';
import { useTimelineStore } from './timeline/useTimelineStore';
import { useTrailerSmartStore } from '../../store/trailerSmartStore';
import {
    detect30DegreeViolations,
    planEyeTraceReframe,
    type AdjacencyClip,
    type ShotGrammar,
} from '../../lib/ege/editorialRules';

// ══════════════════════════════════════════════════════════════════════════════
// EditorialAssist — Sequence-view companion to the EGE's editorial brain.
//
// Surfaces Parker-Walbeck cutting rules as manual tools over the current
// timeline: take-sifting (enable/disable), 30°-rule jump-cut warnings, pacing
// variety readout, transition discipline (hard cuts), and an eye-trace reframe.
// All edits go through the clip store's non-destructive `disabled` flag and the
// existing transition / zoom fields — nothing here is irreversible.
// ══════════════════════════════════════════════════════════════════════════════

const DISSOLVE_TYPES = new Set(['fade', 'fadewhite', 'fadeblack', 'dissolve', 'crossdissolve']);

const Section: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
    <div className="rounded-lg border border-white/[0.05] bg-[#0d0d22]/50 p-3">
        <h4 className="text-[10px] font-black uppercase tracking-wider text-white/55 flex items-center gap-1.5 mb-2">
            {icon}
            {title}
        </h4>
        {children}
    </div>
);

const Btn: React.FC<{ onClick: () => void; disabled?: boolean; children: React.ReactNode; tone?: 'default' | 'warn' }> = ({
    onClick, disabled, children, tone = 'default',
}) => (
    <button
        onClick={onClick}
        disabled={disabled}
        className={
            'px-2 py-1 rounded text-[9px] font-bold border transition-colors disabled:opacity-25 disabled:cursor-not-allowed ' +
            (tone === 'warn'
                ? 'border-amber-500/30 text-amber-300 hover:bg-amber-500/10'
                : 'border-white/10 text-white/70 hover:bg-white/[0.06] hover:text-white')
        }
    >
        {children}
    </button>
);

export const EditorialAssist: React.FC = () => {
    const clips = useClipStore((s) => s.clips);
    const updateClip = useClipStore((s) => s.updateClip);
    const selectedItemIds = useTimelineStore((s) => s.selectedItemIds);
    const getResult = useTrailerSmartStore((s) => s.getResult);

    const selectedIds = useMemo(() => Array.from(selectedItemIds), [selectedItemIds]);

    // Visual clips on the spine, ordered by time.
    const videoClips = useMemo(
        () => clips.filter((c) => c.type !== 'audio').sort((a, b) => a.startFrame - b.startFrame),
        [clips],
    );

    // Map clip id → shot grammar via its source MediaFile's smart analysis.
    const grammarOf = useMemo(() => {
        const byId = new Map<string, ShotGrammar>();
        for (const c of videoClips) {
            const r = c.mediaLibraryId ? getResult(c.mediaLibraryId) : undefined;
            if (r?.shotType || r?.cameraMovement) {
                byId.set(c.id, { shotScale: r.shotType, cameraMotion: r.cameraMovement });
            }
        }
        return (id: string): ShotGrammar | undefined => byId.get(id);
    }, [videoClips, getResult]);

    // ── 30°-rule violations ──
    const violations = useMemo(() => {
        const adj: AdjacencyClip[] = videoClips.map((c) => ({
            id: c.id,
            startFrame: c.startFrame,
            endFrame: c.endFrame,
            track: 0, // treat the visual spine as one track for adjacency
        }));
        return detect30DegreeViolations(adj, grammarOf, 0);
    }, [videoClips, grammarOf]);

    const analyzedCount = useMemo(
        () => videoClips.filter((c) => grammarOf(c.id)).length,
        [videoClips, grammarOf],
    );

    // ── Pacing variety (clip-duration CoV) ──
    const pacing = useMemo(() => {
        const durs = videoClips.filter((c) => !c.disabled).map((c) => Math.max(1, c.endFrame - c.startFrame));
        if (durs.length < 2) return { cov: 0, variety: 0, monotonyRuns: 0 };
        const mean = durs.reduce((a, b) => a + b, 0) / durs.length;
        const sd = Math.sqrt(durs.reduce((a, d) => a + (d - mean) ** 2, 0) / durs.length);
        const cov = mean > 0 ? sd / mean : 0;
        // Runs of ≥3 near-equal (±8%) durations read as "slave to the beat".
        let runs = 0, run = 1;
        for (let i = 1; i < durs.length; i++) {
            if (Math.abs(durs[i] - durs[i - 1]) <= 0.08 * mean) run++;
            else { if (run >= 3) runs++; run = 1; }
        }
        if (run >= 3) runs++;
        return { cov, variety: Math.min(1, cov / 0.6), monotonyRuns: runs };
    }, [videoClips]);

    // ── Transition discipline ──
    const dissolveClips = useMemo(
        () => videoClips.filter((c) => c.transition && DISSOLVE_TYPES.has(String(c.transition.type))),
        [videoClips],
    );

    // ── Eye-trace: clips that report faces (recompose candidates) ──
    const faceClips = useMemo(
        () => videoClips.filter((c) => c.mediaLibraryId && getResult(c.mediaLibraryId)?.hasFaces),
        [videoClips, getResult],
    );

    // ── Actions ──
    const setDisabledFor = (ids: string[], disabled: boolean) => ids.forEach((id) => updateClip(id, { disabled } as Partial<Clip>));

    const soloSelected = () => {
        const sel = new Set(selectedIds);
        videoClips.forEach((c) => updateClip(c.id, { disabled: !sel.has(c.id) } as Partial<Clip>));
    };

    const hardenTransitions = (ids: string[]) =>
        ids.forEach((id) => updateClip(id, { transition: { type: 'cut', durationFrames: 0 } } as Partial<Clip>));

    const stabilizeFraming = (ids: string[]) => {
        ids.forEach((id) => {
            // Without a stored face box we apply a gentle, consistent recompose so
            // the subject sits on the eye line across cuts. When a box is present
            // upstream, planEyeTraceReframe yields a precise zoom + origin.
            const plan = planEyeTraceReframe({ cx: 0.5, cy: 0.42, width: 0.3, height: 0.4 }, { maxZoomPercent: 118 })
                ?? { zoomLevel: 112, zoomOrigin: 'center' as const };
            updateClip(id, { zoomLevel: plan.zoomLevel, zoomOrigin: plan.zoomOrigin } as Partial<Clip>);
        });
    };

    const selectPair = (aId: string, bId: string) =>
        useTimelineStore.getState().setSelectedItemIds(new Set([aId, bId]));

    const disabledCount = videoClips.filter((c) => c.disabled).length;

    return (
        <div className="w-full h-full overflow-y-auto bg-[#0b0b18] p-3 space-y-3 select-none">
            <p className="text-[9px] text-white/30 leading-relaxed px-0.5">
                Editorial assists from the music-video cutting playbook. Sift takes, catch jump cuts,
                keep pacing dynamic, and keep cuts hard. All non-destructive.
            </p>

            {/* 1. Sift takes */}
            <Section icon={<Scissors size={11} className="text-purple-400" />} title="Sift takes">
                <p className="text-[9px] text-white/35 mb-2">
                    Stack your takes and keep the best sections enabled. {disabledCount > 0 ? `${disabledCount} clip(s) disabled.` : ''}
                </p>
                <div className="flex flex-wrap gap-1.5">
                    <Btn onClick={() => setDisabledFor(selectedIds, true)} disabled={selectedIds.length === 0}>
                        <span className="inline-flex items-center gap-1"><EyeOff size={9} /> Disable selected</span>
                    </Btn>
                    <Btn onClick={() => setDisabledFor(selectedIds, false)} disabled={selectedIds.length === 0}>
                        <span className="inline-flex items-center gap-1"><Check size={9} /> Enable selected</span>
                    </Btn>
                    <Btn onClick={soloSelected} disabled={selectedIds.length === 0}>Solo selected</Btn>
                    <Btn onClick={() => setDisabledFor(videoClips.map((c) => c.id), false)} disabled={disabledCount === 0}>
                        Enable all
                    </Btn>
                </div>
            </Section>

            {/* 30° rule jump-cut list removed — the 30° rule is controlled by the
                Off / Partial / All triple toggle in the Edit Generator. */}

            {/* 3. Pacing */}
            <Section icon={<Gauge size={11} className="text-cyan-400" />} title="Pacing variety">
                <div className="flex items-center gap-2 mb-1.5">
                    <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full bg-cyan-400/70" style={{ width: `${Math.round(pacing.variety * 100)}%` }} />
                    </div>
                    <span className="text-[9px] font-bold text-cyan-300 tabular-nums">{Math.round(pacing.variety * 100)}%</span>
                </div>
                <p className="text-[9px] text-white/35">
                    {pacing.monotonyRuns > 0
                        ? `${pacing.monotonyRuns} run(s) of near-equal cuts — vary the pace (longer in verses, faster in choruses) instead of cutting on a fixed beat.`
                        : 'Pacing is dynamic — cut lengths vary with the song. ✓'}
                </p>
            </Section>

            {/* 4. Transition discipline */}
            <Section icon={<Film size={11} className="text-indigo-400" />} title="Transition discipline">
                {dissolveClips.length === 0 ? (
                    <p className="text-[9px] text-emerald-300/70">All hard cuts — energy maintained. ✓</p>
                ) : (
                    <div className="space-y-1.5">
                        <p className="text-[9px] text-white/40">{dissolveClips.length} dissolve(s). Reserve these for slow, atmospheric moments only.</p>
                        <Btn onClick={() => hardenTransitions(dissolveClips.map((c) => c.id))} tone="warn">Harden all to cuts</Btn>
                    </div>
                )}
            </Section>

            {/* 5. Eye trace */}
            <Section icon={<Eye size={11} className="text-pink-400" />} title="Eye trace">
                <p className="text-[9px] text-white/35 mb-2">
                    Keep the subject in a consistent screen region so the viewer's eye never hunts.
                    {faceClips.length > 0 ? ` ${faceClips.length} clip(s) with faces.` : ''}
                </p>
                <div className="flex flex-wrap gap-1.5">
                    <Btn onClick={() => stabilizeFraming(selectedIds)} disabled={selectedIds.length === 0}>Recompose selected</Btn>
                    <Btn onClick={() => stabilizeFraming(faceClips.map((c) => c.id))} disabled={faceClips.length === 0}>Recompose face clips</Btn>
                </div>
            </Section>
        </div>
    );
};
