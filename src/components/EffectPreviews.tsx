/**
 * EffectPreviews — Animated preview content for the PreviewBubble system.
 * ════════════════════════════════════════════════════════════════════════════
 * Pure CSS/SVG animations depicting each effect/option accurately.
 * All animations use CSS @keyframes (no JS timers) for zero overhead.
 */
import React from 'react';

/* ── Shared styles ───────────────────────────────────────────────────────── */
const BOX = { width: 60, height: 40, borderRadius: 4, position: 'relative' as const, overflow: 'hidden' as const };
const PURPLE_BG = 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)';
const TEAL_BG = 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)';
const uid = (() => { let c = 0; return () => `ep-${++c}`; })();

/* ══════════════════════════════════════════════════════════════════════════
 * 1. DURATION PRESET PREVIEW — Range bar
 * ══════════════════════════════════════════════════════════════════════════ */
export const DurationPresetPreview: React.FC<{ shortest: number; longest: number }> = ({ shortest, longest }) => {
    const max = 6;
    const l = (shortest / max) * 100;
    const r = (longest / max) * 100;
    return (
        <div style={{ width: '100%', height: 28, position: 'relative' }}>
            <div style={{ position: 'absolute', top: 10, left: 0, right: 0, height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.06)' }} />
            <div style={{ position: 'absolute', top: 10, left: `${l}%`, width: `${r - l}%`, height: 8, borderRadius: 4, background: 'linear-gradient(90deg, #7c3aed, #3b82f6)', boxShadow: '0 0 8px rgba(124,58,237,0.3)' }} />
            <div style={{ position: 'absolute', top: 0, left: `${l}%`, fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace', transform: 'translateX(-50%)' }}>{shortest}s</div>
            <div style={{ position: 'absolute', top: 0, left: `${r}%`, fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace', transform: 'translateX(-50%)' }}>{longest}s</div>
        </div>
    );
};

/* ══════════════════════════════════════════════════════════════════════════
 * 2. SPEED CURVE PREVIEW — Small canvas-like SVG
 * ══════════════════════════════════════════════════════════════════════════ */
const SPEED_CURVES: Record<string, (t: number) => number> = {
    'constant': () => 0.5,
    'ramp-up': (t) => t * t * 0.8 + 0.1,
    'ramp-down': (t) => (1 - t) * (1 - t) * 0.8 + 0.1,
    's-curve': (t) => 0.5 + 0.4 * Math.sin(t * Math.PI),
    'ramp-freeze': (t) => t < 0.5 ? t * 1.6 + 0.1 : 0.9,
    'burst-landing': (t) => t < 0.2 ? 0.1 + t * 4.5 : 0.9 * Math.exp(-(t - 0.2) * 3) + 0.1,
    'oscillating': (t) => 0.5 + 0.35 * Math.sin(t * Math.PI * 3),
};

export const SpeedCurvePreview: React.FC<{ preset: string }> = ({ preset }) => {
    const fn = SPEED_CURVES[preset] || SPEED_CURVES['constant'];
    const w = 140, h = 56;
    const points: string[] = [];
    for (let i = 0; i <= 40; i++) {
        const t = i / 40;
        const y = 1 - fn(t);
        points.push(`${(t * w).toFixed(1)},${(y * h).toFixed(1)}`);
    }
    const line = points.join(' ');
    return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
            <rect width={w} height={h} rx={4} fill="rgba(255,255,255,0.03)" />
            {/* 1x reference line */}
            <line x1={0} y1={h / 2} x2={w} y2={h / 2} stroke="rgba(255,255,255,0.08)" strokeDasharray="3,3" />
            {/* Curve */}
            <polyline points={line} fill="none" stroke="url(#spGrad)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            {/* Fill under curve */}
            <polygon points={`0,${h} ${line} ${w},${h}`} fill="url(#spGrad)" opacity={0.1} />
            <defs>
                <linearGradient id="spGrad" x1="0" y1="0" x2={w} y2="0">
                    <stop offset="0%" stopColor="#7c3aed" />
                    <stop offset="100%" stopColor="#3b82f6" />
                </linearGradient>
            </defs>
            <text x={2} y={h - 2} fontSize={7} fill="rgba(255,255,255,0.25)" fontFamily="monospace">0x</text>
            <text x={w - 12} y={h - 2} fontSize={7} fill="rgba(255,255,255,0.25)" fontFamily="monospace">2x</text>
        </svg>
    );
};

/* ══════════════════════════════════════════════════════════════════════════
 * 3. BOOMERANG PRESET PREVIEW — CSS animated motion
 * ══════════════════════════════════════════════════════════════════════════ */
const BOOMERANG_KEYFRAMES: Record<string, string> = {
    classic: `@keyframes bm-classic{0%,100%{transform:translateX(0)}50%{transform:translateX(24px)}}`,
    slowmo: `@keyframes bm-slowmo{0%,100%{transform:translateX(0)}50%{transform:translateX(24px)}}`,
    echo: `@keyframes bm-echo{0%,100%{transform:translateX(0);opacity:1}25%{transform:translateX(16px);opacity:0.7}50%{transform:translateX(24px);opacity:0.4}75%{transform:translateX(16px);opacity:0.7}}`,
    duo: `@keyframes bm-duo{0%,100%{transform:translateX(0)}25%{transform:translateX(20px)}50%{transform:translateX(4px)}75%{transform:translateX(16px)}}`,
    stutter: `@keyframes bm-stutter{0%,100%{transform:translateX(0)}10%{transform:translateX(6px)}20%{transform:translateX(2px)}30%{transform:translateX(10px)}40%{transform:translateX(4px)}50%{transform:translateX(14px)}60%{transform:translateX(8px)}70%{transform:translateX(4px)}80%{transform:translateX(2px)}}`,
    whiplash: `@keyframes bm-whiplash{0%,100%{transform:translateX(0)}20%{transform:translateX(28px)}35%{transform:translateX(-4px)}50%{transform:translateX(8px)}65%{transform:translateX(-2px)}}`,
};

export const BoomerangPreview: React.FC<{ preset: string }> = ({ preset }) => {
    const kf = BOOMERANG_KEYFRAMES[preset] || BOOMERANG_KEYFRAMES['classic'];
    const dur = preset === 'slowmo' ? '2.5s' : preset === 'stutter' ? '0.8s' : '1.5s';
    const id = `bm-${preset}`;
    return (
        <div style={{ width: 80, height: 36, position: 'relative', display: 'flex', alignItems: 'center' }}>
            <style>{kf}</style>
            {/* Track */}
            <div style={{ position: 'absolute', top: '50%', left: 10, right: 10, height: 2, borderRadius: 1, background: 'rgba(255,255,255,0.08)', transform: 'translateY(-50%)' }} />
            {/* Moving dot */}
            <div style={{
                width: 10, height: 10, borderRadius: '50%',
                background: PURPLE_BG,
                boxShadow: '0 0 8px rgba(124,58,237,0.5)',
                marginLeft: 10,
                animation: `${id} ${dur} ease-in-out infinite`,
            }} />
            {preset === 'echo' && (
                <>
                    <div style={{ position: 'absolute', width: 8, height: 8, borderRadius: '50%', background: 'rgba(124,58,237,0.3)', left: 10, top: '50%', transform: 'translateY(-50%)', animation: `${id} ${dur} ease-in-out infinite`, animationDelay: '0.1s' }} />
                    <div style={{ position: 'absolute', width: 6, height: 6, borderRadius: '50%', background: 'rgba(124,58,237,0.15)', left: 10, top: '50%', transform: 'translateY(-50%)', animation: `${id} ${dur} ease-in-out infinite`, animationDelay: '0.2s' }} />
                </>
            )}
        </div>
    );
};

/* ══════════════════════════════════════════════════════════════════════════
 * 4. ZOOM VALUE PREVIEW — Frame crop visualization
 * ══════════════════════════════════════════════════════════════════════════ */
export const ZoomValuePreview: React.FC<{ value: number }> = ({ value }) => {
    const scale = 100 / value;
    const visiblePct = Math.round(scale * 100);
    return (
        <div style={{ width: 80, height: 52, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            {/* Outer frame (source) */}
            <div style={{ width: 64, height: 36, borderRadius: 3, border: '1px solid rgba(255,255,255,0.15)', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {/* Inner crop area */}
                <div style={{
                    width: `${scale * 100}%`, height: `${scale * 100}%`,
                    borderRadius: 2,
                    background: 'linear-gradient(135deg, rgba(124,58,237,0.3), rgba(59,130,246,0.3))',
                    border: '1px solid rgba(124,58,237,0.5)',
                    transition: 'all 0.3s ease',
                }} />
            </div>
            <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>{visiblePct}% visible</span>
        </div>
    );
};

/* ══════════════════════════════════════════════════════════════════════════
 * 5. ZOOM SPEED PREVIEW — Animated zoom demonstration
 * ══════════════════════════════════════════════════════════════════════════ */
export const ZoomSpeedPreview: React.FC<{ speed: string }> = ({ speed }) => {
    const dur = speed === 'instant' ? '0.1s' : speed === 'fast' ? '0.5s' : speed === 'slow' ? '2s' : '1s';
    const kfName = `zs-${speed}`;
    return (
        <div style={{ width: 64, height: 40, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <style>{`@keyframes ${kfName}{0%,100%{transform:scale(1)}50%{transform:scale(1.35)}}`}</style>
            <div style={{
                width: 48, height: 30, borderRadius: 3,
                background: PURPLE_BG,
                animation: `${kfName} ${dur} ease-in-out infinite`,
                opacity: 0.7,
            }} />
        </div>
    );
};

/* ══════════════════════════════════════════════════════════════════════════
 * 6. BEAT DROP IMPACT PREVIEW — Expanding pulse rings
 * ══════════════════════════════════════════════════════════════════════════ */
export const BeatDropPreview: React.FC<{ intensity: string }> = ({ intensity }) => {
    const rings = intensity === 'off' ? 0 : intensity === 'subtle' ? 1 : intensity === 'medium' ? 2 : intensity === 'heavy' ? 3 : 4;
    const kfName = 'bd-pulse';
    return (
        <div style={{ width: 64, height: 64, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <style>{`@keyframes ${kfName}{0%{transform:scale(0.3);opacity:0.8}100%{transform:scale(1.8);opacity:0}}`}</style>
            {/* Center dot */}
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f97316', boxShadow: '0 0 6px rgba(249,115,22,0.5)', zIndex: 1 }} />
            {/* Pulse rings */}
            {Array.from({ length: rings }).map((_, i) => (
                <div key={i} style={{
                    position: 'absolute', width: 24, height: 24, borderRadius: '50%',
                    border: '2px solid rgba(249,115,22,0.5)',
                    animation: `${kfName} ${1.2 - i * 0.1}s ease-out infinite`,
                    animationDelay: `${i * 0.2}s`,
                }} />
            ))}
        </div>
    );
};

/* ══════════════════════════════════════════════════════════════════════════
 * 7a. SHAKE POLICY PREVIEW — Timeline with beat dots
 * ══════════════════════════════════════════════════════════════════════════ */
export const ShakePolicyPreview: React.FC<{ policy: string }> = ({ policy }) => {
    const dots = policy === 'off' ? [] :
        policy === 'sparingly' ? [0.2, 0.6, 0.9] :
        policy === 'heavy-beats-only' ? [0.15, 0.45, 0.75] :
        [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
    return (
        <div style={{ width: 120, height: 32, position: 'relative' }}>
            {/* Timeline bar */}
            <div style={{ position: 'absolute', top: 14, left: 0, right: 0, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }} />
            {/* Waveform hint */}
            {[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9].map((t, i) => (
                <div key={i} style={{
                    position: 'absolute', bottom: 16, left: `${t * 100}%`,
                    width: 2, height: 4 + Math.sin(i * 1.3) * 6, borderRadius: 1,
                    background: 'rgba(255,255,255,0.08)',
                    transform: 'translateX(-50%)',
                }} />
            ))}
            {/* Beat dots */}
            {dots.map((t, i) => (
                <div key={i} style={{
                    position: 'absolute', top: 12, left: `${t * 100}%`,
                    width: 8, height: 8, borderRadius: '50%',
                    background: '#ef4444',
                    boxShadow: '0 0 4px rgba(239,68,68,0.5)',
                    transform: 'translate(-50%, -50%)',
                }} />
            ))}
        </div>
    );
};

/* ══════════════════════════════════════════════════════════════════════════
 * 7b. SHAKE TYPE PREVIEW — CSS transform animation
 * ══════════════════════════════════════════════════════════════════════════ */
const SHAKE_KEYFRAMES: Record<string, string> = {
    impact: `@keyframes sk-impact{0%,100%{transform:translate(0,0)}10%{transform:translate(-4px,-2px)}20%{transform:translate(3px,1px)}30%{transform:translate(-2px,2px)}40%{transform:translate(1px,-1px)}50%{transform:translate(0,0)}}`,
    handheld: `@keyframes sk-handheld{0%,100%{transform:translate(0,0) rotate(0deg)}25%{transform:translate(1px,0.5px) rotate(0.3deg)}50%{transform:translate(-0.5px,1px) rotate(-0.2deg)}75%{transform:translate(0.5px,-0.5px) rotate(0.1deg)}}`,
    earthquake: `@keyframes sk-earthquake{0%,100%{transform:translate(0,0)}5%{transform:translate(-6px,3px)}10%{transform:translate(5px,-4px)}15%{transform:translate(-4px,5px)}20%{transform:translate(6px,-2px)}25%{transform:translate(-3px,4px)}30%{transform:translate(2px,-3px)}35%{transform:translate(0,0)}}`,
    vibration: `@keyframes sk-vibration{0%,100%{transform:translateX(0)}25%{transform:translateX(-2px)}50%{transform:translateX(2px)}75%{transform:translateX(-1px)}}`,
    whip: `@keyframes sk-whip{0%,100%{transform:translateX(0)}15%{transform:translateX(12px)}30%{transform:translateX(-3px)}45%{transform:translateX(1px)}60%{transform:translateX(0)}}`,
    all: `@keyframes sk-all{0%,100%{transform:translate(0,0)}12%{transform:translate(-4px,-2px)}25%{transform:translate(2px,3px)}37%{transform:translateX(6px)}50%{transform:translate(-2px,-1px)}62%{transform:translate(1px,2px)}75%{transform:translateX(-3px)}87%{transform:translate(2px,-1px)}}`,
};

export const ShakeTypePreview: React.FC<{ type: string }> = ({ type }) => {
    const kf = SHAKE_KEYFRAMES[type] || SHAKE_KEYFRAMES['impact'];
    const dur = type === 'vibration' ? '0.15s' : type === 'handheld' ? '2s' : '0.6s';
    const kfName = `sk-${type}`;
    return (
        <div style={{ width: 72, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <style>{kf}</style>
            <div style={{
                ...BOX, width: 52, height: 32,
                background: PURPLE_BG,
                animation: `${kfName} ${dur} ease-in-out infinite`,
            }} />
        </div>
    );
};

/* ══════════════════════════════════════════════════════════════════════════
 * 8. TRENDING EFFECT PREVIEWS
 * ══════════════════════════════════════════════════════════════════════════ */

export const DoubleExposurePreview: React.FC = () => (
    <div style={{ width: 72, height: 48, position: 'relative' }}>
        <style>{`@keyframes de-shift{0%,100%{transform:translate(0,0)}50%{transform:translate(6px,4px)}}@keyframes de-hue{0%,100%{filter:hue-rotate(0deg)}50%{filter:hue-rotate(40deg)}}`}</style>
        <div style={{ ...BOX, width: 48, height: 32, position: 'absolute', top: 4, left: 4, background: 'linear-gradient(135deg, #ff6b6b, #feca57, #ff9ff3)', opacity: 0.7, animation: 'de-hue 3s ease-in-out infinite' }} />
        <div style={{ ...BOX, width: 48, height: 32, position: 'absolute', top: 8, left: 16, background: 'linear-gradient(135deg, #0abde3, #48dbfb, #1dd1a1)', opacity: 0.55, mixBlendMode: 'screen', animation: 'de-shift 2s ease-in-out infinite' }} />
    </div>
);

export const MotionBlurPreview: React.FC = () => (
    <div style={{ width: 72, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <style>{`@keyframes mb-sweep{0%,100%{transform:translateX(0);filter:blur(0px)}50%{transform:translateX(8px);filter:blur(3px)}}`}</style>
        <div style={{ ...BOX, width: 48, height: 32, background: PURPLE_BG, animation: 'mb-sweep 1.5s ease-in-out infinite' }} />
    </div>
);

export const GlowPreview: React.FC = () => (
    <div style={{ width: 72, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <style>{`@keyframes gl-pulse{0%,100%{box-shadow:0 0 4px rgba(124,58,237,0.3)}50%{box-shadow:0 0 20px rgba(124,58,237,0.6),0 0 40px rgba(124,58,237,0.2)}}`}</style>
        <div style={{ ...BOX, width: 48, height: 32, background: PURPLE_BG, borderRadius: 6, animation: 'gl-pulse 2s ease-in-out infinite' }} />
    </div>
);

export const VibrationFlashPreview: React.FC = () => (
    <div style={{ width: 72, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <style>{`@keyframes vf-punch{0%,100%{transform:translate(0,0);filter:brightness(1)}15%{transform:translate(-2px,1px);filter:brightness(1.8)}30%{transform:translate(1px,-1px);filter:brightness(1.2)}45%{transform:translate(0,0);filter:brightness(1)}}`}</style>
        <div style={{ ...BOX, width: 48, height: 32, background: PURPLE_BG, animation: 'vf-punch 1s ease-out infinite' }} />
    </div>
);

export const SlowmoPreview: React.FC = () => (
    <div style={{ width: 72, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        <style>{`@keyframes sm-move{0%{left:8px}100%{left:48px}}`}</style>
        <div style={{ ...BOX, width: 56, height: 32, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ position: 'absolute', width: 8, height: 8, borderRadius: '50%', background: PURPLE_BG, top: 12, animation: 'sm-move 3s linear infinite' }} />
            {/* Interpolation ghost frames */}
            <div style={{ position: 'absolute', width: 6, height: 6, borderRadius: '50%', background: 'rgba(124,58,237,0.3)', top: 13, animation: 'sm-move 3s linear infinite', animationDelay: '-0.15s' }} />
            <div style={{ position: 'absolute', width: 4, height: 4, borderRadius: '50%', background: 'rgba(124,58,237,0.15)', top: 14, animation: 'sm-move 3s linear infinite', animationDelay: '-0.3s' }} />
        </div>
    </div>
);

export const RgbSplitPreview: React.FC = () => (
    <div style={{ width: 72, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <style>{`@keyframes rgb-r{0%,100%{transform:translate(-2px,0)}50%{transform:translate(2px,0)}}@keyframes rgb-b{0%,100%{transform:translate(2px,0)}50%{transform:translate(-2px,0)}}`}</style>
        <div style={{ position: 'relative', width: 48, height: 32 }}>
            <div style={{ ...BOX, width: 48, height: 32, position: 'absolute', background: 'rgba(239,68,68,0.4)', animation: 'rgb-r 1.5s ease-in-out infinite', mixBlendMode: 'screen' }} />
            <div style={{ ...BOX, width: 48, height: 32, position: 'absolute', background: 'rgba(34,197,94,0.4)' }} />
            <div style={{ ...BOX, width: 48, height: 32, position: 'absolute', background: 'rgba(59,130,246,0.4)', animation: 'rgb-b 1.5s ease-in-out infinite', mixBlendMode: 'screen' }} />
        </div>
    </div>
);

export const HueCyclePreview: React.FC = () => (
    <div style={{ width: 72, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <style>{`@keyframes hc-rot{0%{filter:hue-rotate(0deg)}100%{filter:hue-rotate(360deg)}}`}</style>
        <div style={{ ...BOX, width: 48, height: 32, background: 'linear-gradient(135deg, #ef4444, #f97316, #eab308, #22c55e, #3b82f6, #8b5cf6)', animation: 'hc-rot 3s linear infinite' }} />
    </div>
);

export const VhsPreview: React.FC = () => (
    <div style={{ width: 72, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <style>{`@keyframes vhs-jit{0%,100%{transform:translateX(0)}25%{transform:translateX(1px)}50%{transform:translateX(-1px)}75%{transform:translateX(0.5px)}}`}</style>
        <div style={{ ...BOX, width: 48, height: 32, background: PURPLE_BG, position: 'relative', animation: 'vhs-jit 0.2s steps(4) infinite' }}>
            {/* Scan lines */}
            {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: i * 4, height: 1, background: 'rgba(0,0,0,0.25)' }} />
            ))}
            {/* Chromatic shift bar */}
            <div style={{ position: 'absolute', left: -2, right: 0, top: 12, height: 3, background: 'rgba(0,255,255,0.15)' }} />
        </div>
    </div>
);

/* ══════════════════════════════════════════════════════════════════════════
 * POLICY-MODULATED EFFECT PREVIEW
 * Shows the actual effect animation at different frequencies based on policy.
 * "off" = static/grayed, "sparingly" = occasional bursts, "per-beat" = rhythmic,
 * "every-clip" = always on.
 * ══════════════════════════════════════════════════════════════════════════ */

/** Keyframes for policy-based opacity modulation */
const POLICY_KEYFRAMES = {
    off: '', // no animation — rendered static
    sparingly: `@keyframes pm-spar{0%,18%{opacity:0.08}20%,30%{opacity:1}32%,68%{opacity:0.08}70%,80%{opacity:1}82%,100%{opacity:0.08}}`,
    'per-beat': `@keyframes pm-beat{0%,8%{opacity:0.1}10%,20%{opacity:1}22%,33%{opacity:0.1}35%,45%{opacity:1}47%,58%{opacity:0.1}60%,70%{opacity:1}72%,83%{opacity:0.1}85%,95%{opacity:1}97%,100%{opacity:0.1}}`,
    'every-clip': '', // always on — no animation needed
};

const PolicyModulatedPreview: React.FC<{ policy: string; children: React.ReactNode }> = ({ policy, children }) => {
    if (policy === 'off') {
        return (
            <div style={{ width: 80, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                <div style={{ opacity: 0.15, filter: 'grayscale(100%)' }}>{children}</div>
                <div style={{ position: 'absolute', fontSize: 8, fontWeight: 700, color: 'rgba(255,255,255,0.3)', bottom: 2, textTransform: 'uppercase', letterSpacing: 1 }}>OFF</div>
            </div>
        );
    }
    if (policy === 'every-clip') {
        return (
            <div style={{ width: 80, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {children}
            </div>
        );
    }
    const kf = POLICY_KEYFRAMES[policy as keyof typeof POLICY_KEYFRAMES] || '';
    const animName = policy === 'sparingly' ? 'pm-spar' : 'pm-beat';
    const dur = policy === 'sparingly' ? '4s' : '2.5s';
    return (
        <div style={{ width: 80, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <style>{kf}</style>
            <div style={{ animation: `${animName} ${dur} ease-in-out infinite` }}>{children}</div>
        </div>
    );
};

/* ── Effect-specific policy previews ─────────────────────────────────────
 * Each shows the actual effect animation modulated by the policy frequency.
 */

export const DoubleExposurePolicyPreview: React.FC<{ policy: string }> = ({ policy }) => (
    <PolicyModulatedPreview policy={policy}><DoubleExposurePreview /></PolicyModulatedPreview>
);

export const MotionBlurPolicyPreview: React.FC<{ policy: string }> = ({ policy }) => (
    <PolicyModulatedPreview policy={policy}><MotionBlurPreview /></PolicyModulatedPreview>
);

export const GlowPolicyPreview: React.FC<{ policy: string }> = ({ policy }) => (
    <PolicyModulatedPreview policy={policy}><GlowPreview /></PolicyModulatedPreview>
);

export const VibrationFlashPolicyPreview: React.FC<{ policy: string }> = ({ policy }) => (
    <PolicyModulatedPreview policy={policy}><VibrationFlashPreview /></PolicyModulatedPreview>
);

export const SlowmoPolicyPreview: React.FC<{ policy: string }> = ({ policy }) => (
    <PolicyModulatedPreview policy={policy}><SlowmoPreview /></PolicyModulatedPreview>
);

export const RgbSplitPolicyPreview: React.FC<{ policy: string }> = ({ policy }) => (
    <PolicyModulatedPreview policy={policy}><RgbSplitPreview /></PolicyModulatedPreview>
);

export const HueCyclePolicyPreview: React.FC<{ policy: string }> = ({ policy }) => (
    <PolicyModulatedPreview policy={policy}><HueCyclePreview /></PolicyModulatedPreview>
);

export const VhsPolicyPreview: React.FC<{ policy: string }> = ({ policy }) => (
    <PolicyModulatedPreview policy={policy}><VhsPreview /></PolicyModulatedPreview>
);

/* ── Double Exposure Shape Previews ──────────────────────────────────── */
export const DoubleExposureShapePreview: React.FC<{ mode: string }> = ({ mode }) => (
    <div style={{ width: 72, height: 48, position: 'relative' }}>
        {mode === 'full' && (
            <>
                <div style={{ position: 'absolute', top: 4, left: 4, width: 48, height: 32, borderRadius: 4, background: PURPLE_BG, opacity: 0.6 }} />
                <div style={{ position: 'absolute', top: 8, left: 16, width: 48, height: 32, borderRadius: 4, background: TEAL_BG, opacity: 0.5 }} />
            </>
        )}
        {mode === 'shaped' && (
            <>
                <div style={{ position: 'absolute', top: 4, left: 4, width: 48, height: 32, borderRadius: 4, background: PURPLE_BG, opacity: 0.6 }} />
                <div style={{ position: 'absolute', top: 8, left: 16, width: 36, height: 24, borderRadius: 12, background: TEAL_BG, opacity: 0.5 }} />
            </>
        )}
        {mode === 'mix' && (
            <>
                <div style={{ position: 'absolute', top: 4, left: 4, width: 48, height: 32, borderRadius: 4, background: PURPLE_BG, opacity: 0.6 }} />
                <div style={{ position: 'absolute', top: 6, left: 12, width: 28, height: 22, borderRadius: 8, background: TEAL_BG, opacity: 0.5 }} />
                <div style={{ position: 'absolute', top: 14, left: 30, width: 32, height: 20, borderRadius: 4, background: TEAL_BG, opacity: 0.35 }} />
            </>
        )}
    </div>
);

/** Generic fallback — kept for backward compat but prefer effect-specific ones above */
export const EffectPolicyPreview: React.FC<{ policy: string }> = ({ policy }) => {
    const dots = policy === 'off' ? [] :
        policy === 'sparingly' ? [0.3, 0.7] :
        policy === 'per-beat' ? [0.15, 0.3, 0.45, 0.6, 0.75, 0.9] :
        [0.08, 0.18, 0.28, 0.38, 0.48, 0.58, 0.68, 0.78, 0.88, 0.98];
    return (
        <div style={{ width: 100, height: 20, position: 'relative' }}>
            <div style={{ position: 'absolute', top: 9, left: 0, right: 0, height: 2, borderRadius: 1, background: 'rgba(255,255,255,0.06)' }} />
            {dots.map((t, i) => (
                <div key={i} style={{
                    position: 'absolute', top: 6, left: `${t * 100}%`,
                    width: 6, height: 6, borderRadius: '50%',
                    background: '#6366f1',
                    boxShadow: '0 0 3px rgba(99,102,241,0.5)',
                    transform: 'translateX(-50%)',
                }} />
            ))}
        </div>
    );
};
