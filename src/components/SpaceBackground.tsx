import React, { useEffect, useRef } from 'react';
import { useMediaStore } from '../store/mediaStore';

// Deterministic hash for procedural generation — no stored state
const hash = (n: number): number => {
    let h = n | 0;
    h = ((h >> 16) ^ h) * 0x45d9f3b;
    h = ((h >> 16) ^ h) * 0x45d9f3b;
    h = (h >> 16) ^ h;
    return (h & 0x7fffffff) / 0x7fffffff; // 0..1
};

const hash2 = (a: number, b: number): number => hash(a * 374761393 + b * 668265263);

interface Transient {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    decay: number;
    type: 'comet' | 'shootingStar';
    tailLength: number;
    hue: number;
}

export const SpaceBackground: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const files = useMediaStore((s) => s.files);
    const isLibraryLoaded = files && files.length > 0;

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;

        let animationFrameId: number;
        let w = canvas.width = window.innerWidth;
        let h = canvas.height = window.innerHeight;

        const handleResize = () => {
            w = canvas.width = window.innerWidth;
            h = canvas.height = window.innerHeight;
        };
        window.addEventListener('resize', handleResize);

        // ===== TRAVEL STATE =====
        let zPos = 0;
        let zVelocity = 0;
        const drift = 0.02;
        const CHUNK_DEPTH = 800;
        const STARS_PER_CHUNK = 60;
        const MAX_PHENOMENA = 3;

        const transients: Transient[] = [];
        const MAX_TRANSIENTS = 4;

        // ===== WHEEL HANDLER =====
        const handleWheel = (e: WheelEvent) => {
            if (isLibraryLoaded) return;
            e.preventDefault();
            zVelocity += e.deltaY * 0.15;
        };

        if (!isLibraryLoaded) {
            canvas.style.pointerEvents = 'auto';
            canvas.addEventListener('wheel', handleWheel, { passive: false });
        } else {
            canvas.style.pointerEvents = 'none';
        }

        // ===== PROCEDURAL STAR FIELD =====
        const getStarInChunk = (chunkIdx: number, starIdx: number) => {
            const seed = chunkIdx * 10000 + starIdx;
            return {
                x: hash(seed) * w,
                y: hash(seed + 1) * h,
                z: chunkIdx * CHUNK_DEPTH + hash(seed + 2) * CHUNK_DEPTH,
                r: 0.2 + hash(seed + 3) * 0.8,
                baseAlpha: 0.15 + hash(seed + 4) * 0.5,
                pulseSpeed: 0.002 + hash(seed + 5) * 0.008,
                color: hash(seed + 6) > 0.85 ? '#a1c4fd' : (hash(seed + 7) > 0.9 ? '#fbc2eb' : '#ffffff')
            };
        };

        // ===== PROCEDURAL PHENOMENA =====
        const getPhenomenonInChunk = (chunkIdx: number, phenIdx: number) => {
            const seed = chunkIdx * 50000 + phenIdx * 777;
            const exists = hash(seed) < 0.35;
            if (!exists) return null;

            const typeRoll = hash(seed + 1);
            let type: string;
            if (typeRoll < 0.25) type = 'blackhole';
            else if (typeRoll < 0.50) type = 'nebula';
            else if (typeRoll < 0.70) type = 'asteroid';
            else if (typeRoll < 0.85) type = 'star';
            else type = 'comet';

            return {
                type,
                x: 0.1 * w + hash(seed + 2) * 0.8 * w,
                y: 0.1 * h + hash(seed + 3) * 0.8 * h,
                z: chunkIdx * CHUNK_DEPTH + hash(seed + 4) * CHUNK_DEPTH,
                size: 30 + hash(seed + 5) * 120,
                hue: hash(seed + 6) * 360,
                rotation: hash(seed + 7) * Math.PI * 2,
                rotSpeed: (hash(seed + 8) - 0.5) * 0.003,
                cometAngle: hash(seed + 9) * Math.PI * 2,
                cometSpeed: 0.5 + hash(seed + 10) * 2,
            };
        };

        // ===== SPAWN EPHEMERAL TRANSIENTS =====
        let frameCount = 0;
        const spawnTransient = () => {
            if (transients.length >= MAX_TRANSIENTS) return;
            if (Math.random() > (isLibraryLoaded ? 0.001 : 0.004)) return;

            const isComet = Math.random() > 0.6;
            transients.push({
                x: Math.random() * w,
                y: isComet ? -20 : Math.random() * h * 0.3,
                vx: (Math.random() - 0.3) * (isComet ? 3 : 50),
                vy: 1 + Math.random() * (isComet ? 4 : 40),
                life: 1.0,
                decay: isComet ? 0.003 : 0.12,
                type: isComet ? 'comet' : 'shootingStar',
                tailLength: isComet ? 40 + Math.random() * 80 : 8 + Math.random() * 15,
                hue: Math.random() * 60 + 180
            });
        };

        // ===== RENDER FUNCTIONS =====
        const drawStar = (sx: number, sy: number, r: number, alpha: number, color: string) => {
            if (alpha <= 0 || r <= 0) return;
            ctx.beginPath();
            ctx.arc(sx, sy, r, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.globalAlpha = Math.min(1, alpha);
            ctx.fill();
            if (r > 0.6 && alpha > 0.4) {
                ctx.beginPath();
                ctx.arc(sx, sy, r * 3, 0, Math.PI * 2);
                ctx.fillStyle = color;
                ctx.globalAlpha = alpha * 0.1;
                ctx.fill();
            }
        };

        const drawNebula = (px: number, py: number, size: number, life: number, hue: number, rot: number) => {
            if (life <= 0) return;
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            ctx.translate(px, py);
            ctx.rotate(rot);
            const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, size);
            grad.addColorStop(0, `hsla(${hue}, 80%, 50%, ${0.08 * life})`);
            grad.addColorStop(0.4, `hsla(${(hue + 30) % 360}, 60%, 40%, ${0.04 * life})`);
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.scale(1.6, 0.7);
            ctx.fillRect(-size, -size, size * 2, size * 2);
            ctx.restore();
        };

        const drawBlackhole = (px: number, py: number, size: number, life: number) => {
            if (life <= 0) return;
            ctx.save();
            ctx.globalCompositeOperation = 'source-over';
            const grad = ctx.createRadialGradient(px, py, size * 0.05, px, py, size);
            grad.addColorStop(0, 'rgba(0,0,0,1)');
            grad.addColorStop(0.25, `rgba(0,0,0,${0.95 * life})`);
            grad.addColorStop(0.5, `rgba(100,50,255,${0.15 * life})`);
            grad.addColorStop(0.7, `rgba(56,189,248,${0.1 * life})`);
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.globalAlpha = life;
            ctx.fillRect(px - size, py - size, size * 2, size * 2);
            ctx.beginPath();
            ctx.ellipse(px, py, size * 0.5, size * 0.15, 0, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(180,140,255,${0.5 * life})`;
            ctx.lineWidth = 1.5;
            ctx.globalAlpha = life;
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(px, py, size * 0.2, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255,255,255,${0.3 * life})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
            ctx.restore();
        };

        const drawAsteroid = (px: number, py: number, size: number, life: number, rot: number, seed: number) => {
            if (life <= 0) return;
            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(rot);
            ctx.globalAlpha = life;
            ctx.beginPath();
            const points = 7;
            for (let i = 0; i < points; i++) {
                const angle = (i / points) * Math.PI * 2;
                const jitter = 0.6 + hash2(seed, i) * 0.8;
                const r = size * 0.3 * jitter;
                if (i === 0) ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
                else ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
            }
            ctx.closePath();
            ctx.fillStyle = `rgba(120,110,100,${0.8 * life})`;
            ctx.fill();
            ctx.strokeStyle = `rgba(180,170,150,${0.4 * life})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
            ctx.restore();
        };

        const drawBrightStar = (px: number, py: number, size: number, life: number, hue: number) => {
            if (life <= 0) return;
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            const grad = ctx.createRadialGradient(px, py, 0, px, py, size);
            grad.addColorStop(0, `hsla(${hue}, 20%, 95%, ${0.9 * life})`);
            grad.addColorStop(0.1, `hsla(${hue}, 60%, 80%, ${0.5 * life})`);
            grad.addColorStop(0.4, `hsla(${hue}, 80%, 50%, ${0.1 * life})`);
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.globalAlpha = life;
            ctx.fillRect(px - size, py - size, size * 2, size * 2);
            ctx.globalAlpha = 0.3 * life;
            ctx.fillStyle = `hsla(${hue}, 30%, 90%, 0.4)`;
            ctx.fillRect(px - size * 0.8, py - 0.5, size * 1.6, 1);
            ctx.fillRect(px - 0.5, py - size * 0.8, 1, size * 1.6);
            ctx.restore();
        };

        // ===== MAIN RENDER LOOP =====
        const render = () => {
            frameCount++;

            if (!isLibraryLoaded) {
                zPos += zVelocity + drift;
                zVelocity *= 0.92;
            } else {
                zPos += 0.15;
            }

            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1;
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, w, h);

            const currentChunk = Math.floor(zPos / CHUNK_DEPTH);
            const chunksToRender = [currentChunk - 1, currentChunk, currentChunk + 1];

            // LAYER 1: Phenomena
            for (const ci of chunksToRender) {
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
                    if (p.type === 'comet') {
                        const cx = px + Math.cos(p.cometAngle) * frameCount * p.cometSpeed * 0.02 * depthScale;
                        const cy = py + Math.sin(p.cometAngle) * frameCount * p.cometSpeed * 0.01 * depthScale;
                        ctx.save();
                        ctx.globalCompositeOperation = 'screen';
                        ctx.beginPath();
                        ctx.arc(cx, cy, sz * 0.12, 0, Math.PI * 2);
                        ctx.fillStyle = `rgba(200,230,255,${0.8 * life})`;
                        ctx.globalAlpha = life;
                        ctx.fill();
                        const tailAngle = p.cometAngle + Math.PI;
                        const tx = cx + Math.cos(tailAngle) * sz * 1.5;
                        const ty = cy + Math.sin(tailAngle) * sz * 0.8;
                        const tGrad = ctx.createLinearGradient(cx, cy, tx, ty);
                        tGrad.addColorStop(0, `rgba(150,200,255,${0.4 * life})`);
                        tGrad.addColorStop(0.5, `rgba(100,150,255,${0.1 * life})`);
                        tGrad.addColorStop(1, 'rgba(0,0,0,0)');
                        ctx.beginPath();
                        ctx.moveTo(cx, cy);
                        ctx.quadraticCurveTo(
                            (cx + tx) / 2 + (Math.sin(tailAngle) * sz * 0.3),
                            (cy + ty) / 2 + (Math.cos(tailAngle) * sz * 0.3),
                            tx, ty
                        );
                        ctx.quadraticCurveTo(
                            (cx + tx) / 2 - (Math.sin(tailAngle) * sz * 0.3),
                            (cy + ty) / 2 - (Math.cos(tailAngle) * sz * 0.3),
                            cx, cy
                        );
                        ctx.fillStyle = tGrad;
                        ctx.globalAlpha = life * 0.6;
                        ctx.fill();
                        ctx.restore();
                    }
                }
            }

            // LAYER 2: Stars
            ctx.globalCompositeOperation = 'screen';
            for (const ci of chunksToRender) {
                for (let si = 0; si < STARS_PER_CHUNK; si++) {
                    const s = getStarInChunk(ci, si);
                    const dz = s.z - zPos;
                    const depthScale = CHUNK_DEPTH / (CHUNK_DEPTH + Math.abs(dz));
                    if (depthScale < 0.03) continue;

                    const sx = (s.x - w / 2) * depthScale + w / 2;
                    const sy = (s.y - h / 2) * depthScale + h / 2;
                    const sr = s.r * depthScale;
                    const pulse = Math.sin(frameCount * s.pulseSpeed + s.z * 0.01) * 0.3 + 0.7;
                    const alpha = s.baseAlpha * depthScale * pulse;

                    drawStar(sx, sy, sr, alpha, s.color);
                }
            }

            // LAYER 3: Ephemeral transients
            ctx.globalCompositeOperation = 'screen';
            for (let i = transients.length - 1; i >= 0; i--) {
                const t = transients[i];
                t.x += t.vx;
                t.y += t.vy;
                t.life -= t.decay;

                if (t.life <= 0 || t.x < -100 || t.x > w + 100 || t.y > h + 100) {
                    transients.splice(i, 1);
                    continue;
                }

                if (t.type === 'shootingStar') {
                    const sx = t.x - t.vx * 3;
                    const sy = t.y - t.vy * 3;
                    const grad = ctx.createLinearGradient(sx, sy, t.x, t.y);
                    grad.addColorStop(0, 'rgba(255,255,255,0)');
                    grad.addColorStop(1, `rgba(255,255,255,${t.life})`);
                    ctx.beginPath();
                    ctx.moveTo(sx, sy);
                    ctx.lineTo(t.x, t.y);
                    ctx.strokeStyle = grad;
                    ctx.lineWidth = 1.5;
                    ctx.globalAlpha = 1;
                    ctx.stroke();
                } else {
                    ctx.globalAlpha = t.life;
                    ctx.beginPath();
                    ctx.arc(t.x, t.y, 2, 0, Math.PI * 2);
                    ctx.fillStyle = `hsla(${t.hue}, 60%, 80%, ${t.life})`;
                    ctx.fill();
                    const tailX = t.x - t.vx * t.tailLength;
                    const tailY = t.y - t.vy * t.tailLength;
                    const cGrad = ctx.createLinearGradient(t.x, t.y, tailX, tailY);
                    cGrad.addColorStop(0, `hsla(${t.hue}, 50%, 70%, ${0.4 * t.life})`);
                    cGrad.addColorStop(1, 'rgba(0,0,0,0)');
                    ctx.beginPath();
                    ctx.moveTo(t.x, t.y);
                    ctx.lineTo(tailX, tailY);
                    ctx.strokeStyle = cGrad;
                    ctx.lineWidth = 1;
                    ctx.stroke();
                }
            }

            ctx.globalAlpha = 1;
            spawnTransient();

            // Depth HUD (interactive mode only)
            if (!isLibraryLoaded && Math.abs(zVelocity) > 0.3) {
                const hudAlpha = Math.min(0.4, Math.abs(zVelocity) * 0.02);
                ctx.globalAlpha = hudAlpha;
                ctx.fillStyle = '#ffffff';
                ctx.font = '10px monospace';
                ctx.textAlign = 'center';
                const depth = Math.floor(zPos);
                ctx.fillText(`DEPTH  ${depth >= 0 ? '+' : ''}${depth.toLocaleString()} LY`, w / 2, h - 30);
                ctx.globalAlpha = 1;
            }

            animationFrameId = requestAnimationFrame(render);
        };

        render();

        return () => {
            window.removeEventListener('resize', handleResize);
            canvas.removeEventListener('wheel', handleWheel);
            canvas.style.pointerEvents = 'none';
            cancelAnimationFrame(animationFrameId);
        };
    }, [isLibraryLoaded]);

    return (
        <canvas
            ref={canvasRef}
            className="fixed inset-0 w-full h-full"
            style={{ backgroundColor: '#000', zIndex: -1 }}
        />
    );
};
