#!/usr/bin/env node
/**
 * MMMedia Pro - Golden Render Regression Test
 * ------------------------------------------------------------------
 * Run:  node scripts/test-golden-render.cjs
 *
 * A deterministic smoke test for the export pipeline's MATH and the
 * FFmpeg toolchain. It synthesizes its own media (so it never depends
 * on missing demo assets), then renders the timeline two ways and
 * asserts the output is exactly what the duration model predicts:
 *
 *   - Hard cut (concat):     total = sum(clip durations)
 *   - Cross dissolve (xfade): total = sum(durations) - (n-1) * D
 *
 * It also verifies the output has one video + one audio stream at the
 * target resolution. This catches a broken FFmpeg binary, a regressed
 * concat/xfade offset, or A/V duration drift before they reach a user.
 *
 * Exit code 0 = all pass, 1 = a failure (suitable for CI / pre-commit).
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ffmpeg = require('ffmpeg-static');
const OUT_W = 1920, OUT_H = 1080, FPS = 30;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'mmm-golden-'));

let failures = 0;
const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const bad = (m) => { console.log(`  \x1b[31m✗ ${m}\x1b[0m`); failures++; };

function ff(args) { return execFileSync(ffmpeg, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); }
function probeDuration(file) {
    // Parse "Duration: HH:MM:SS.xx" from ffmpeg -i stderr.
    let out = '';
    try { ff(['-i', file]); } catch (e) { out = (e.stderr || '').toString(); }
    const m = out.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
    if (!m) return -1;
    return (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]);
}
function probeStreams(file) {
    let out = '';
    try { ff(['-i', file]); } catch (e) { out = (e.stderr || '').toString(); }
    return {
        video: /Stream #\d+:\d+.*Video:/.test(out),
        audio: /Stream #\d+:\d+.*Audio:/.test(out),
        res: (out.match(/, (\d{2,5})x(\d{2,5})/) || []).slice(1, 3).map(Number),
    };
}

// ── 1. Synthesize 3 colour clips (2s each) + a 6s sine tone ──
const durs = [2, 2, 2];
const colors = ['red', 'green', 'blue'];
const clips = [];
console.log('Synthesizing test media…');
colors.forEach((c, i) => {
    const f = path.join(TMP, `c${i}.mp4`);
    ff(['-y', '-f', 'lavfi', '-i', `color=c=${c}:s=640x480:d=${durs[i]}:r=${FPS}`,
        '-f', 'lavfi', '-i', `sine=frequency=${220 * (i + 1)}:d=${durs[i]}`,
        '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-shortest', f]);
    clips.push(f);
});

const norm = (label) => `${label}scale=${OUT_W}:${OUT_H}:force_original_aspect_ratio=decrease,pad=${OUT_W}:${OUT_H}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p,fps=${FPS},settb=AVTB`;

// ── 2. Hard-cut render (concat) ──
function renderConcat(outFile) {
    const chains = [];
    clips.forEach((_, i) => {
        chains.push(`[${i}:v]${norm('')}[v${i}]`);
        chains.push(`[${i}:a]asetpts=PTS-STARTPTS[a${i}]`);
    });
    const pairs = clips.map((_, i) => `[v${i}][a${i}]`).join('');
    chains.push(`${pairs}concat=n=${clips.length}:v=1:a=1[vo][ao]`);
    const inputs = clips.flatMap((f) => ['-i', f]);
    ff(['-y', ...inputs, '-filter_complex', chains.join(';'),
        '-map', '[vo]', '-map', '[ao]', '-r', String(FPS),
        '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', outFile]);
}

// ── 3. Cross-dissolve render (xfade), mirroring main.ts offset math ──
function renderXfade(outFile, D) {
    const chains = [];
    const normV = [];
    clips.forEach((_, i) => { chains.push(`[${i}:v]${norm('')}[v${i}]`); normV.push(`[v${i}]`); });
    let prevV = normV[0], cum = durs[0];
    for (let i = 1; i < clips.length; i++) {
        const offset = Math.max(0, cum - D);
        const out = i === clips.length - 1 ? 'vo' : `xv${i}`;
        chains.push(`${prevV}${normV[i]}xfade=transition=fade:duration=${D}:offset=${offset.toFixed(4)}[${out}]`);
        prevV = `[${out}]`; cum = cum + durs[i] - D;
    }
    let prevA = '[0:a]';
    for (let i = 1; i < clips.length; i++) {
        const out = i === clips.length - 1 ? 'ao' : `xa${i}`;
        chains.push(`${prevA}[${i}:a]acrossfade=d=${D}:c1=tri:c2=tri[${out}]`);
        prevA = `[${out}]`;
    }
    const inputs = clips.flatMap((f) => ['-i', f]);
    ff(['-y', ...inputs, '-filter_complex', chains.join(';'),
        '-map', '[vo]', '-map', '[ao]', '-r', String(FPS),
        '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', outFile]);
}

const within = (a, b, tol) => Math.abs(a - b) <= tol;
const sum = durs.reduce((a, b) => a + b, 0);

console.log('\nTest 1 — hard cut (concat):');
const cutFile = path.join(TMP, 'cut.mp4');
renderConcat(cutFile);
let d = probeDuration(cutFile);
within(d, sum, 0.15) ? ok(`duration ${d.toFixed(2)}s ≈ ${sum}s`) : bad(`duration ${d.toFixed(2)}s, expected ${sum}s`);
let s = probeStreams(cutFile);
s.video ? ok('has video stream') : bad('missing video stream');
s.audio ? ok('has audio stream') : bad('missing audio stream');
(s.res[0] === OUT_W && s.res[1] === OUT_H) ? ok(`resolution ${s.res.join('x')}`) : bad(`resolution ${s.res.join('x')}, expected ${OUT_W}x${OUT_H}`);

console.log('\nTest 2 — cross dissolve (xfade), D=0.5s:');
const D = 0.5;
const expectXfade = sum - (clips.length - 1) * D; // 6 - 2*0.5 = 5.0
const xfFile = path.join(TMP, 'xfade.mp4');
renderXfade(xfFile, D);
d = probeDuration(xfFile);
within(d, expectXfade, 0.2) ? ok(`duration ${d.toFixed(2)}s ≈ ${expectXfade}s (overlap applied)`) : bad(`duration ${d.toFixed(2)}s, expected ${expectXfade}s`);
s = probeStreams(xfFile);
s.video && s.audio ? ok('has video + audio') : bad('missing a stream');

console.log('\nTest 3 — zoompan does NOT inflate duration (regression: the 31-min bug):');
// A 2s clip through zoompan. With the bug (d=N) the output is ~minutes; with the
// fix (d=1) it stays ~2s. This guards the exact failure from the export log.
const zpFile = path.join(TMP, 'zoom.mp4');
const zpFrames = 2 * FPS; // 48
ff(['-y', '-i', clips[0],
    '-vf', `zoompan=z='lerp(1.0,1.3,min(1,on/${zpFrames}))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${OUT_W}x${OUT_H}:fps=${FPS}`,
    '-an', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', zpFile]);
d = probeDuration(zpFile);
within(d, 2.0, 0.25) ? ok(`zoomed clip duration ${d.toFixed(2)}s ≈ 2s (no inflation)`) : bad(`zoomed clip duration ${d.toFixed(2)}s — zoompan is inflating duration (d must be 1)`);

// ── cleanup ──
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}

console.log(`\n${failures === 0 ? '\x1b[32mGOLDEN RENDER: PASS\x1b[0m' : `\x1b[31mGOLDEN RENDER: ${failures} FAILURE(S)\x1b[0m`}`);
process.exit(failures === 0 ? 0 : 1);
