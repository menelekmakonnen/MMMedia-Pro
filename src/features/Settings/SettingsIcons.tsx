import React from 'react';

/**
 * Custom inline SVG icons for the Project Settings option groups.
 * All use `currentColor` so they inherit the button's text colour (active vs idle).
 */

/** A rectangle drawn at the exact aspect ratio (portrait / landscape / square). */
export const AspectIcon: React.FC<{ ratio: string; size?: number }> = ({ ratio, size = 22 }) => {
    const [a, b] = ratio.split(':').map(Number);
    const aspect = a && b ? a / b : 1; // width / height
    const max = 18;
    let w = max, h = max;
    if (aspect >= 1) { w = max; h = max / aspect; } else { h = max; w = max * aspect; }
    const x = (24 - w) / 2;
    const y = (24 - h) / 2;
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x={x} y={y} width={w} height={h} rx={2} stroke="currentColor" strokeWidth={1.6} />
            <line x1={12} y1={y + 1.5} x2={12} y2={y + h - 1.5} stroke="currentColor" strokeWidth={0.8} opacity={0.35} />
        </svg>
    );
};

/** A speed gauge whose needle angle scales with the frame rate. */
export const FrameRateIcon: React.FC<{ fps: number; size?: number }> = ({ fps, size = 22 }) => {
    // Map 24..120 fps → needle sweep 180°(left) .. 0°(right).
    const t = Math.max(0, Math.min(1, (fps - 24) / (120 - 24)));
    const angle = Math.PI * (1 - t); // radians
    const cx = 12, cy = 15.5, r = 7;
    const tipX = cx + r * Math.cos(angle);
    const tipY = cy - r * Math.sin(angle);
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            {/* Gauge arc */}
            <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} stroke="currentColor" strokeWidth={1.5} opacity={0.5} strokeLinecap="round" />
            {/* Tick marks */}
            {[0, 0.25, 0.5, 0.75, 1].map((tick, i) => {
                const ta = Math.PI * (1 - tick);
                return (
                    <line key={i}
                        x1={cx + (r - 1.5) * Math.cos(ta)} y1={cy - (r - 1.5) * Math.sin(ta)}
                        x2={cx + r * Math.cos(ta)} y2={cy - r * Math.sin(ta)}
                        stroke="currentColor" strokeWidth={0.8} opacity={0.4} />
                );
            })}
            {/* Needle */}
            <line x1={cx} y1={cy} x2={tipX} y2={tipY} stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
            <circle cx={cx} cy={cy} r={1.4} fill="currentColor" />
        </svg>
    );
};

/** Blur = soft gradient fill; Black = solid fill — inside a monitor frame. */
export const BackgroundFillIcon: React.FC<{ mode: 'blur' | 'black'; size?: number }> = ({ mode, size = 22 }) => {
    const gid = `bgfill-blur-${mode}`;
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <defs>
                <radialGradient id={gid} cx="50%" cy="45%" r="70%">
                    <stop offset="0%" stopColor="currentColor" stopOpacity={0.55} />
                    <stop offset="55%" stopColor="currentColor" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="currentColor" stopOpacity={0.05} />
                </radialGradient>
            </defs>
            {/* Outer monitor frame */}
            <rect x={3} y={5} width={18} height={14} rx={2.5} stroke="currentColor" strokeWidth={1.6} />
            {mode === 'blur' ? (
                <>
                    {/* Soft blurred background suggestion */}
                    <rect x={4.5} y={6.5} width={15} height={11} rx={1.5} fill={`url(#${gid})`} />
                    {/* Centered vertical clip (the sharp foreground) */}
                    <rect x={9.5} y={7} width={5} height={10} rx={1} stroke="currentColor" strokeWidth={1.3} />
                </>
            ) : (
                <>
                    {/* Solid black bars: fill the frame, leave a centered clip */}
                    <rect x={4.5} y={6.5} width={15} height={11} rx={1.5} fill="currentColor" opacity={0.85} />
                    <rect x={9.5} y={7} width={5} height={10} rx={1} fill="#0b0b14" stroke="currentColor" strokeWidth={1} />
                </>
            )}
        </svg>
    );
};
