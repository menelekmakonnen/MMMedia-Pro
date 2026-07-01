import React from 'react';

// ═══════════════════════════════════════════════════════════════════════════════
// SpaceBackground — Static space background (no animation loop)
//
// Renders a fixed star field using pure CSS gradients and box-shadows.
// Zero requestAnimationFrame, zero canvas, zero GPU overhead.
// ═══════════════════════════════════════════════════════════════════════════════

// Pre-computed star positions (no runtime randomness)
const STAR_LAYER_1 = Array.from({ length: 120 }, (_, i) => {
    const h = ((i * 2654435761) >>> 0) % 0x7FFFFFFF;
    const x = (h % 2000);
    const y = (((h >> 8) * 2654435761) >>> 0) % 2000;
    return `${x}px ${y}px 0px rgba(255,255,255,${0.3 + (i % 5) * 0.1})`;
}).join(',');

const STAR_LAYER_2 = Array.from({ length: 60 }, (_, i) => {
    const h = ((i * 1597334677) >>> 0) % 0x7FFFFFFF;
    const x = (h % 2000);
    const y = (((h >> 8) * 1597334677) >>> 0) % 2000;
    return `${x}px ${y}px 1px rgba(161,196,253,${0.2 + (i % 4) * 0.1})`;
}).join(',');

const STAR_LAYER_3 = Array.from({ length: 25 }, (_, i) => {
    const h = ((i * 668265263) >>> 0) % 0x7FFFFFFF;
    const x = (h % 2000);
    const y = (((h >> 8) * 668265263) >>> 0) % 2000;
    return `${x}px ${y}px 1.5px rgba(251,194,235,${0.15 + (i % 3) * 0.1})`;
}).join(',');

export const SpaceBackground: React.FC = () => (
    <div className="fixed inset-0" style={{ zIndex: -1, backgroundColor: '#000' }}>
        {/* Dense small stars */}
        <div
            className="absolute inset-0"
            style={{
                width: '2000px',
                height: '2000px',
                boxShadow: STAR_LAYER_1,
            }}
        />
        {/* Medium blue-tinted stars */}
        <div
            className="absolute inset-0"
            style={{
                width: '2000px',
                height: '2000px',
                boxShadow: STAR_LAYER_2,
            }}
        />
        {/* Sparse pink-tinted bright stars */}
        <div
            className="absolute inset-0"
            style={{
                width: '2000px',
                height: '2000px',
                boxShadow: STAR_LAYER_3,
            }}
        />
        {/* Subtle nebula glow */}
        <div
            className="absolute inset-0 pointer-events-none"
            style={{
                background: [
                    'radial-gradient(ellipse 600px 400px at 25% 30%, rgba(100,50,255,0.04), transparent)',
                    'radial-gradient(ellipse 500px 350px at 75% 65%, rgba(56,189,248,0.03), transparent)',
                    'radial-gradient(ellipse 400px 300px at 50% 80%, rgba(168,85,247,0.02), transparent)',
                ].join(', '),
            }}
        />
    </div>
);
