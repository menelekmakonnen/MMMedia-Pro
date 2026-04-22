/**
 * SFX Synthesizer — Procedural Sound Effects Engine
 * 
 * Generates whooshes, risers, impacts, and camera shutter sounds
 * using the Web Audio API. No external audio files required.
 * 
 * Volume is controlled per-effect to remain non-intrusive.
 */

let audioCtx: AudioContext | null = null;

const getCtx = (): AudioContext => {
    if (!audioCtx) audioCtx = new AudioContext();
    return audioCtx;
};

export type SFXType = 'whoosh' | 'riser' | 'impact' | 'shutter' | 'glitch' | 'ding';

export interface SFXOptions {
    volume?: number;  // 0.0 - 1.0, default 0.15 (subtle)
    duration?: number; // seconds
    pitch?: number;   // multiplier, 1.0 = normal
}

/**
 * Play a procedurally-generated sound effect.
 * Volume defaults to 0.15 (non-intrusive).
 */
export const playSFX = (type: SFXType, opts: SFXOptions = {}) => {
    const ctx = getCtx();
    const vol = opts.volume ?? 0.15;
    const dur = opts.duration ?? 0.3;
    const pitch = opts.pitch ?? 1.0;
    const now = ctx.currentTime;

    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.value = vol;

    switch (type) {
        case 'whoosh': {
            // White noise swept through a bandpass filter
            const bufferSize = Math.floor(ctx.sampleRate * dur);
            const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.5;

            const src = ctx.createBufferSource();
            src.buffer = buffer;

            const bp = ctx.createBiquadFilter();
            bp.type = 'bandpass';
            bp.frequency.setValueAtTime(200 * pitch, now);
            bp.frequency.exponentialRampToValueAtTime(4000 * pitch, now + dur * 0.7);
            bp.frequency.exponentialRampToValueAtTime(200 * pitch, now + dur);
            bp.Q.value = 2;

            gain.gain.setValueAtTime(vol, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

            src.connect(bp).connect(gain);
            src.start(now);
            src.stop(now + dur);
            break;
        }

        case 'riser': {
            // Rising sine wave with increasing frequency
            const osc = ctx.createOscillator();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(100 * pitch, now);
            osc.frequency.exponentialRampToValueAtTime(3000 * pitch, now + dur);

            gain.gain.setValueAtTime(0.001, now);
            gain.gain.linearRampToValueAtTime(vol, now + dur * 0.9);
            gain.gain.linearRampToValueAtTime(0, now + dur);

            osc.connect(gain);
            osc.start(now);
            osc.stop(now + dur);
            break;
        }

        case 'impact': {
            // Low-frequency thump with rapid decay
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(150 * pitch, now);
            osc.frequency.exponentialRampToValueAtTime(30, now + dur);

            gain.gain.setValueAtTime(vol * 2, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

            // Add a noise transient layer
            const noiseDur = Math.min(0.05, dur * 0.2);
            const nBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * noiseDur), ctx.sampleRate);
            const nData = nBuf.getChannelData(0);
            for (let i = 0; i < nData.length; i++) nData[i] = (Math.random() * 2 - 1) * 0.3;
            const nSrc = ctx.createBufferSource();
            nSrc.buffer = nBuf;

            const nGain = ctx.createGain();
            nGain.gain.setValueAtTime(vol, now);
            nGain.gain.exponentialRampToValueAtTime(0.001, now + noiseDur);
            nSrc.connect(nGain).connect(ctx.destination);

            osc.connect(gain);
            osc.start(now);
            osc.stop(now + dur);
            nSrc.start(now);
            nSrc.stop(now + noiseDur);
            break;
        }

        case 'shutter': {
            // Camera shutter: two quick clicks
            const clickDur = 0.02;
            for (let c = 0; c < 2; c++) {
                const offset = c * 0.06;
                const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * clickDur), ctx.sampleRate);
                const d = buf.getChannelData(0);
                for (let i = 0; i < d.length; i++) {
                    d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (d.length * 0.1));
                }
                const s = ctx.createBufferSource();
                s.buffer = buf;
                const cGain = ctx.createGain();
                cGain.gain.value = vol * 1.5;
                s.connect(cGain).connect(ctx.destination);
                s.start(now + offset);
                s.stop(now + offset + clickDur);
            }
            break;
        }

        case 'glitch': {
            // Digital glitch: rapid random-pitch oscillator bursts
            const steps = 6;
            const stepDur = dur / steps;
            for (let g = 0; g < steps; g++) {
                const osc = ctx.createOscillator();
                osc.type = 'square';
                osc.frequency.value = (200 + Math.random() * 2000) * pitch;

                const gGain = ctx.createGain();
                gGain.gain.setValueAtTime(vol * (Math.random() * 0.5 + 0.5), now + g * stepDur);
                gGain.gain.setValueAtTime(0, now + (g + 0.8) * stepDur);

                osc.connect(gGain).connect(ctx.destination);
                osc.start(now + g * stepDur);
                osc.stop(now + (g + 1) * stepDur);
            }
            break;
        }

        case 'ding': {
            // Bright metallic ding
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = 2200 * pitch;

            gain.gain.setValueAtTime(vol, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

            osc.connect(gain);
            osc.start(now);
            osc.stop(now + dur);
            break;
        }
    }
};

/**
 * Generate an AudioBuffer of an SFX for mixing into export.
 * Returns a Float32Array of samples at 44100Hz.
 */
export const renderSFXBuffer = (type: SFXType, opts: SFXOptions = {}): Float32Array => {
    const sampleRate = 44100;
    const dur = opts.duration ?? 0.3;
    const vol = opts.volume ?? 0.15;
    const pitch = opts.pitch ?? 1.0;
    const len = Math.floor(sampleRate * dur);
    const out = new Float32Array(len);

    switch (type) {
        case 'whoosh':
            for (let i = 0; i < len; i++) {
                const t = i / sampleRate;
                const freq = 200 * pitch + (4000 * pitch - 200 * pitch) * Math.min(1, t / (dur * 0.7));
                const env = Math.exp(-3 * t / dur);
                out[i] = (Math.random() * 2 - 1) * vol * env * Math.sin(2 * Math.PI * freq * t) * 0.5;
            }
            break;
        case 'impact':
            for (let i = 0; i < len; i++) {
                const t = i / sampleRate;
                const freq = 150 * pitch * Math.exp(-5 * t / dur);
                const env = Math.exp(-8 * t / dur);
                out[i] = Math.sin(2 * Math.PI * freq * t) * vol * env;
            }
            break;
        case 'riser':
            for (let i = 0; i < len; i++) {
                const t = i / sampleRate;
                const freq = 100 * pitch * Math.exp(3.4 * t / dur);
                const env = Math.min(1, t / (dur * 0.9));
                out[i] = Math.sin(2 * Math.PI * freq * t) * vol * env * 0.5;
            }
            break;
        default:
            // Fallback: simple click
            for (let i = 0; i < Math.min(len, 500); i++) {
                out[i] = (Math.random() * 2 - 1) * vol * Math.exp(-i / 50);
            }
    }
    return out;
};
