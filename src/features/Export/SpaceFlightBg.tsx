import React, { useEffect, useRef } from 'react';

/**
 * SpaceFlightBg — A progress-reactive space flight based on the existing
 * SpaceBackground procedural system. Reuses the same hash, phenomena,
 * and rendering approach but adds:
 *  - Speed tied to export progress (cruise → warp)
 *  - Solar system reveal on success
 *  - Wormhole collapse on failure
 */

// Deterministic hash for procedural generation — no stored state
const hash = (n: number): number => {
    let h = n | 0;
    h = ((h >> 16) ^ h) * 0x45d9f3b;
    h = ((h >> 16) ^ h) * 0x45d9f3b;
    h = (h >> 16) ^ h;
    return (h & 0x7fffffff) / 0x7fffffff;
};
const hash2 = (a: number, b: number): number => hash(a * 374761393 + b * 668265263);

interface Props {
    progress: number;       // 0–100
    status: 'active' | 'success' | 'failed';
}

export const SpaceFlightBg: React.FC<Props> = ({ progress, status }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const propsRef = useRef({ progress, status });
    propsRef.current = { progress, status };

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;

        let animId: number;
        let w = canvas.width = canvas.offsetWidth * window.devicePixelRatio;
        let h = canvas.height = canvas.offsetHeight * window.devicePixelRatio;
        const scale = window.devicePixelRatio;

        const handleResize = () => {
            w = canvas.width = canvas.offsetWidth * window.devicePixelRatio;
            h = canvas.height = canvas.offsetHeight * window.devicePixelRatio;
        };
        window.addEventListener('resize', handleResize);

        // ===== TRAVEL STATE =====
        let zPos = 0;
        let frameCount = 0;
        let solarReveal = 0;
        let wormholeAngle = 0;

        const CHUNK_DEPTH = 800;
        const STARS_PER_CHUNK = 80;
        const MAX_PHENOMENA = 3;

        // ===== PROCEDURAL STAR FIELD (same as SpaceBackground) =====
        const getStarInChunk = (chunkIdx: number, starIdx: number) => {
            const seed = chunkIdx * 10000 + starIdx;
            return {
                x: hash(seed) * w, y: hash(seed + 1) * h,
                z: chunkIdx * CHUNK_DEPTH + hash(seed + 2) * CHUNK_DEPTH,
                r: 0.2 + hash(seed + 3) * 0.8,
                baseAlpha: 0.15 + hash(seed + 4) * 0.5,
                pulseSpeed: 0.002 + hash(seed + 5) * 0.008,
                color: hash(seed + 6) > 0.85 ? '#a1c4fd' : (hash(seed + 7) > 0.9 ? '#fbc2eb' : '#ffffff')
            };
        };

        // ===== PROCEDURAL PHENOMENA (same as SpaceBackground) =====
        const getPhenomenonInChunk = (chunkIdx: number, phenIdx: number) => {
            const seed = chunkIdx * 50000 + phenIdx * 777;
            if (hash(seed) >= 0.35) return null;
            const typeRoll = hash(seed + 1);
            const type = typeRoll < 0.25 ? 'blackhole' : typeRoll < 0.50 ? 'nebula' : typeRoll < 0.70 ? 'asteroid' : typeRoll < 0.85 ? 'star' : 'comet';
            return {
                type, x: 0.1 * w + hash(seed + 2) * 0.8 * w, y: 0.1 * h + hash(seed + 3) * 0.8 * h,
                z: chunkIdx * CHUNK_DEPTH + hash(seed + 4) * CHUNK_DEPTH, size: 30 + hash(seed + 5) * 120,
                hue: hash(seed + 6) * 360, rotation: hash(seed + 7) * Math.PI * 2,
                rotSpeed: (hash(seed + 8) - 0.5) * 0.003, cometAngle: hash(seed + 9) * Math.PI * 2,
                cometSpeed: 0.5 + hash(seed + 10) * 2,
            };
        };

        // ===== RENDER HELPERS (matching SpaceBackground quality) =====
        const drawStar = (sx: number, sy: number, r: number, alpha: number, color: string) => {
            if (alpha <= 0 || r <= 0) return;
            ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2);
            ctx.fillStyle = color; ctx.globalAlpha = Math.min(1, alpha); ctx.fill();
            if (r > 0.6 && alpha > 0.4) {
                ctx.beginPath(); ctx.arc(sx, sy, r * 3, 0, Math.PI * 2);
                ctx.fillStyle = color; ctx.globalAlpha = alpha * 0.1; ctx.fill();
            }
        };

        const drawNebula = (px: number, py: number, size: number, life: number, hue: number, rot: number) => {
            if (life <= 0) return;
            ctx.save(); ctx.globalCompositeOperation = 'screen';
            ctx.translate(px, py); ctx.rotate(rot);
            const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, size);
            grad.addColorStop(0, `hsla(${hue}, 80%, 50%, ${0.08 * life})`);
            grad.addColorStop(0.4, `hsla(${(hue + 30) % 360}, 60%, 40%, ${0.04 * life})`);
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad; ctx.scale(1.6, 0.7);
            ctx.fillRect(-size, -size, size * 2, size * 2); ctx.restore();
        };

        const drawBlackhole = (px: number, py: number, size: number, life: number) => {
            if (life <= 0) return;
            ctx.save(); ctx.globalCompositeOperation = 'source-over';
            const grad = ctx.createRadialGradient(px, py, size * 0.05, px, py, size);
            grad.addColorStop(0, 'rgba(0,0,0,1)'); grad.addColorStop(0.25, `rgba(0,0,0,${0.95 * life})`);
            grad.addColorStop(0.5, `rgba(100,50,255,${0.15 * life})`); grad.addColorStop(0.7, `rgba(56,189,248,${0.1 * life})`);
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad; ctx.globalAlpha = life;
            ctx.fillRect(px - size, py - size, size * 2, size * 2);
            ctx.beginPath(); ctx.ellipse(px, py, size * 0.5, size * 0.15, 0, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(180,140,255,${0.5 * life})`; ctx.lineWidth = 1.5; ctx.globalAlpha = life; ctx.stroke();
            ctx.restore();
        };

        const drawAsteroid = (px: number, py: number, size: number, life: number, rot: number, seed: number) => {
            if (life <= 0) return;
            ctx.save(); ctx.translate(px, py); ctx.rotate(rot); ctx.globalAlpha = life;
            ctx.beginPath();
            for (let i = 0; i < 7; i++) {
                const angle = (i / 7) * Math.PI * 2;
                const jitter = 0.6 + hash2(seed, i) * 0.8;
                const r = size * 0.3 * jitter;
                if (i === 0) ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
                else ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
            }
            ctx.closePath(); ctx.fillStyle = `rgba(120,110,100,${0.8 * life})`; ctx.fill();
            ctx.strokeStyle = `rgba(180,170,150,${0.4 * life})`; ctx.lineWidth = 0.5; ctx.stroke();
            ctx.restore();
        };

        const drawBrightStar = (px: number, py: number, size: number, life: number, hue: number) => {
            if (life <= 0) return;
            ctx.save(); ctx.globalCompositeOperation = 'screen';
            const grad = ctx.createRadialGradient(px, py, 0, px, py, size);
            grad.addColorStop(0, `hsla(${hue}, 20%, 95%, ${0.9 * life})`);
            grad.addColorStop(0.1, `hsla(${hue}, 60%, 80%, ${0.5 * life})`);
            grad.addColorStop(0.4, `hsla(${hue}, 80%, 50%, ${0.1 * life})`);
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad; ctx.globalAlpha = life;
            ctx.fillRect(px - size, py - size, size * 2, size * 2);
            ctx.globalAlpha = 0.3 * life; ctx.fillStyle = `hsla(${hue}, 30%, 90%, 0.4)`;
            ctx.fillRect(px - size * 0.8, py - 0.5, size * 1.6, 1);
            ctx.fillRect(px - 0.5, py - size * 0.8, 1, size * 1.6);
            ctx.restore();
        };

        // ===== SOLAR SYSTEM DRAWING =====
        const PLANET_DATA = [
            { dist: 60, r: 4, hue: 200, speed: 1.2 },
            { dist: 100, r: 6, hue: 280, speed: 0.8 },
            { dist: 145, r: 8, hue: 20, speed: 0.5 },
            { dist: 195, r: 5, hue: 130, speed: 0.3 },
            { dist: 250, r: 10, hue: 40, speed: 0.2 },
        ];

        const drawSolarSystem = (reveal: number) => {
            const cx = w / 2, cy = h / 2;
            // Sun
            const sunR = 12 + reveal * 24;
            const sunGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, sunR * 4);
            sunGlow.addColorStop(0, `rgba(255,220,80,${reveal * 0.9})`);
            sunGlow.addColorStop(0.3, `rgba(255,150,30,${reveal * 0.3})`);
            sunGlow.addColorStop(0.6, `rgba(255,80,0,${reveal * 0.08})`);
            sunGlow.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 1;
            ctx.fillStyle = sunGlow;
            ctx.fillRect(cx - sunR * 5, cy - sunR * 5, sunR * 10, sunR * 10);
            ctx.beginPath(); ctx.arc(cx, cy, sunR * reveal, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255,230,100,${reveal})`; ctx.fill();
            // Planets
            const time = frameCount * 0.004;
            for (const p of PLANET_DATA) {
                const orbitR = p.dist * scale * reveal;
                ctx.beginPath(); ctx.ellipse(cx, cy, orbitR, orbitR * 0.35, 0, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(255,255,255,${reveal * 0.04})`; ctx.lineWidth = 0.5; ctx.stroke();
                const angle = time * p.speed;
                const px = cx + Math.cos(angle) * orbitR;
                const py = cy + Math.sin(angle) * orbitR * 0.35;
                const pr = p.r * scale * reveal;
                ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2);
                ctx.fillStyle = `hsla(${p.hue}, 60%, 60%, ${reveal})`; ctx.fill();
                // Planet glow
                const pg = ctx.createRadialGradient(px, py, 0, px, py, pr * 3);
                pg.addColorStop(0, `hsla(${p.hue}, 60%, 60%, ${reveal * 0.3})`);
                pg.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = pg; ctx.fillRect(px - pr * 4, py - pr * 4, pr * 8, pr * 8);
            }
        };

        // ===== WORMHOLE DRAWING =====
        const drawWormhole = (angle: number) => {
            const cx = w / 2, cy = h / 2;
            ctx.globalCompositeOperation = 'screen';
            // Spiral rings
            for (let i = 0; i < 8; i++) {
                const r = 20 + i * 30 * scale;
                ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.strokeStyle = `hsla(${270 + i * 10}, 70%, 50%, ${0.12 - i * 0.012})`;
                ctx.lineWidth = 2 + i * 0.5; ctx.globalAlpha = 1; ctx.stroke();
            }
            // Core glow
            const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 60 * scale);
            glow.addColorStop(0, 'rgba(180,50,255,0.5)');
            glow.addColorStop(0.5, 'rgba(100,30,200,0.15)');
            glow.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = glow;
            ctx.fillRect(cx - 80 * scale, cy - 80 * scale, 160 * scale, 160 * scale);
        };

        // ===== MAIN RENDER =====
        const render = () => {
            const { progress: prog, status: st } = propsRef.current;
            frameCount++;

            // Speed based on progress
            let speed = 0.5 + (prog / 100) * 6;
            if (prog > 85) speed = 6 + (prog - 85) * 1.5;
            if (st === 'success') { speed = Math.max(0.05, speed * (1 - solarReveal)); solarReveal = Math.min(1, solarReveal + 0.006); }
            if (st === 'failed') { speed = 0.3; wormholeAngle += 0.03; }

            zPos += speed;

            // Background
            ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
            ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, w, h);

            const currentChunk = Math.floor(zPos / CHUNK_DEPTH);
            const chunks = [currentChunk - 1, currentChunk, currentChunk + 1];

            // LAYER 1: Phenomena
            for (const ci of chunks) {
                for (let pi = 0; pi < MAX_PHENOMENA; pi++) {
                    const p = getPhenomenonInChunk(ci, pi);
                    if (!p) continue;
                    const dz = p.z - zPos;
                    const depthScale = CHUNK_DEPTH / (CHUNK_DEPTH + Math.abs(dz));
                    if (depthScale < 0.05) continue;
                    const px = (p.x - w / 2) * depthScale + w / 2;
                    const py = (p.y - h / 2) * depthScale + h / 2;
                    const sz = p.size * depthScale;
                    const life = Math.max(0, Math.min(1, 1 - Math.abs(dz) / CHUNK_DEPTH));
                    const rot = p.rotation + frameCount * p.rotSpeed;

                    if (p.type === 'nebula') drawNebula(px, py, sz, life, p.hue, rot);
                    if (p.type === 'blackhole') drawBlackhole(px, py, sz, life);
                    if (p.type === 'asteroid') drawAsteroid(px, py, sz, life, rot, ci * 50000 + pi * 777);
                    if (p.type === 'star') drawBrightStar(px, py, sz, life, p.hue);
                }
            }

            // LAYER 2: Stars with warp streaks at high speed
            ctx.globalCompositeOperation = 'screen';
            for (const ci of chunks) {
                for (let si = 0; si < STARS_PER_CHUNK; si++) {
                    const s = getStarInChunk(ci, si);
                    const dz = s.z - zPos;
                    const depthScale = CHUNK_DEPTH / (CHUNK_DEPTH + Math.abs(dz));
                    if (depthScale < 0.03) continue;
                    let sx = (s.x - w / 2) * depthScale + w / 2;
                    let sy = (s.y - h / 2) * depthScale + h / 2;
                    const sr = s.r * depthScale;
                    const pulse = Math.sin(frameCount * s.pulseSpeed + s.z * 0.01) * 0.3 + 0.7;
                    const alpha = s.baseAlpha * depthScale * pulse;

                    // Wormhole: spiral stars toward center
                    if (st === 'failed') {
                        const dist = Math.hypot(sx - w / 2, sy - h / 2);
                        const a = Math.atan2(sy - h / 2, sx - w / 2) + wormholeAngle * (150 / (dist + 40));
                        const nd = dist * (1 - Math.max(0, 1 - dist / (Math.max(w, h) * 0.5)) * 0.025);
                        sx = w / 2 + Math.cos(a) * nd;
                        sy = h / 2 + Math.sin(a) * nd;
                    }

                    // Warp streaks when speed > 4
                    if (speed > 4 && sr > 0.3) {
                        const streakLen = Math.min(sr * speed * 0.6, 25);
                        const angle = Math.atan2(sy - h / 2, sx - w / 2);
                        ctx.beginPath(); ctx.moveTo(sx, sy);
                        ctx.lineTo(sx - Math.cos(angle) * streakLen, sy - Math.sin(angle) * streakLen);
                        ctx.strokeStyle = `rgba(180,200,255,${alpha * 0.5})`;
                        ctx.lineWidth = sr * 0.5; ctx.globalAlpha = 1; ctx.stroke();
                    }

                    drawStar(sx, sy, sr, alpha, s.color);
                }
            }

            // LAYER 3: Success — solar system
            if (st === 'success' && solarReveal > 0.05) {
                drawSolarSystem(solarReveal);
            }

            // LAYER 3b: Failure — wormhole
            if (st === 'failed') {
                drawWormhole(wormholeAngle);
            }

            // Depth HUD
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 0.25; ctx.fillStyle = '#ffffff';
            ctx.font = `${10 * scale}px monospace`; ctx.textAlign = 'center';
            const depth = Math.floor(zPos);
            ctx.fillText(`DEPTH  +${depth.toLocaleString()} LY`, w / 2, h - 20 * scale);
            ctx.globalAlpha = 1;

            animId = requestAnimationFrame(render);
        };

        animId = requestAnimationFrame(render);
        return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', handleResize); };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full"
            style={{ zIndex: 0, pointerEvents: 'none', backgroundColor: '#000' }}
        />
    );
};
