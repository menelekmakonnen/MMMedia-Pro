# MMMedia Pro — God-Level Integration Roadmap

*Synthesis of a deep study across the Non_ICUNI tool ecosystem + MMMedia Pro / MMMedia Darkroom current state. Goal: make MMMedia Pro an autonomous, god-level engine for Trailers, Music Videos, Showreels, viral Social edits, Video Essays, and Short Films — with proper rendering and bridges to MMMedia Darkroom and Premiere Pro.*

Date: 2026-06-24

---

## 1. Where MMMedia Pro stands today

**Strong:** one coherent frame-based `Clip` model carrying the whole feature surface (speed/curves, zoom/Ken-Burns, ~20 looks, color grade, chroma key, text, audio FX, transitions, boomerang, per-property keyframes); a robust two-stage FFmpeg segment-stitch renderer with the deep-xfade-freeze bug already tamed; five working generators (trailer + music-video are excellent; showreel/essay/short-film exist); a background Smart Engine that scores/trims/scene-cuts/auto-grades; and — importantly — an existing **ICUNI Edit** lossless interchange (`lib/icuniEdit.ts`) already designed for a Premiere bridge via the sibling Edia app.

**The six output types, honestly:** Trailer ✅ god-tier · Music Video ✅ strong · Showreel ⚠️ real generator but fed **stubbed** metadata (shot type/emotion hardcoded) · Video Essay ⚠️ generator exists but B-roll matching is naive substring · Social ⚠️ only presets, no dedicated generator · Short Film ⚠️ assembly-cut only, no narrative intelligence.

**The single biggest unlock:** `src/lib/ai/clipAnalyzer.ts` and `clipIndexer.ts` already exist but are **not wired into the generators**. Real content understanding (shot type, emotion, faces, semantic B-roll relevance) is what separates the two god-tier types from the four scaffolded ones.

---

## 2. The opportunity catalog (what to bring in, and from where)

### A. Rendering & timing core
- **Integer-frame timing everywhere** *(libopenshot, FreeCut, all)* — resolve every cut/trim to an integer frame at a canonical project fps before emitting FFmpeg; reset `setpts`/`asetpts` at every stitch boundary. MMMedia Pro is mostly here; make `fps`/`sourceFps` non-optional and probe-enforced.
- **Single engine for preview ≡ export** *(FreeCut, HyperFrames)* — drive one compositor for live preview, then render the *identical* graph headlessly through FFmpeg. Never two divergent renderers. HyperFrames streams `VideoFrame`s straight into FFmpeg stdin (no temp PNGs); FreeCut runs the exact engine in headless Chrome for WYSIWYG.
- **Visually-lossless intermediate + HW encode + stream-copy** *(libopenshot, Pro assessment)* — the current double re-encode is the top fidelity risk. Use a high-bitrate/ProRes-class intermediate, stream-copy uniform clips, and offer NVENC/QSV on the final pass behind a probe + libx264 fallback.
- **Adaptive transition cap** — the silent `MAX_XFADES=20` ceiling turns dense music-video transitions into hard cuts. Bake transition boundaries as pre-rendered 2-clip intermediates so the cap can rise, and surface it in the parity report.
- **A/V-parity assertion** — assert per-intermediate `audio length == video length`, add `aresample=async=1`; kills drift on mixed-fps and speed-ramped edits.

### B. Effects, transitions, keyframes
- **Self-describing effect/transition registry** *(FreeCut)* — each effect is `{id, name, category, params:{default}, shader/filter, packUniforms}` auto-collected into a Map; effect panels build themselves from `params`. **Darkroom already ships a JSON effect/transition/speed-ramp registry** (`assets/registry.json`) — consume it directly as the shared preset library; its `{contrast,saturation,temperature}` map onto Pro's `colorGrading`.
- **`xfade`/`gl-transitions` table** *(libopenshot, omniclip)* — every classic transition reduces to "animate a luma mask threshold." Map transition name → `xfade=transition=X:duration:offset`; for preview, `gl-transitions` gives dozens of GLSL transitions in one import. (Complements the return-transitions feature already built.)
- **Keyframe curve type** *(libopenshot)* — `Keyframe{points:[{frame,value,interp:BEZIER|LINEAR|CONSTANT}]}` so every effect parameter is animatable and JSON-serializable.

### C. Autonomous direction (the god-level brain)
- **Index → Classify → Plan → Build loop** *(D2R/aidirector)* — multi-modal clip index (Whisper transcript via FTS5 + vision tags on keyframes + EXIF/date), A-roll/B-roll auto-classification (speech-density + face + camera-steadiness vs visual-interest + motion), then editorial B-roll rules: semantic match (narrator says "X" → overlay clip tagged "X" within ±1s), atmospheric establishing shots for intro/outro, and jump-cut coverage (mask speech cuts with 2-3s B-roll). This is the spine for Essay/Short-Film/Showreel autonomy. **Wire it to Pro's existing `clipAnalyzer`/`clipIndexer`.**
- **Per-type heuristics:** Trailers/Music Videos → cut on **downbeats**; Showreels → rank by visual-interest/motion, hard-cut on beats; Essays → semantic A/B-roll with TTS narration as spine; Social → hook-first ordering + 9:16 auto-reframe + kinetic captions; Short Films → chronological narrative plan with jump-cut coverage.
- **Declarative pipeline recipes** *(OpenMontage YAML `pipeline_defs`)* — each output type as a declarative recipe (aspect, pacing, transition/color defaults).

### D. Social / viral kit
- **Auto-reframe to 9:16 with smoothed subject keyframes** *(OpenReel `auto-reframe-engine.ts`)* — skin-region + connected-components detection needs **no ML dependency**, fully offline; emits FFmpeg `crop` keyframes. Platform presets baked in (TikTok/Reels/Shorts).
- **Word-level karaoke captions** *(OpenReel `caption-animation-renderer.ts` + WhisperX)* — per-word active/past/upcoming highlight, burn via FFmpeg. Essays + Social.
- **Beat-synced cutting** *(OpenReel `beat-detection-engine.ts`)* — onset → BPM + downbeats (WASM).
- **Hook-first pacing + loop-friendly endings** *(D2R social heuristics)*.

### E. Voice & audio
- **Pluggable TTS backend** *(voicebox)* — one `TTSBackend` protocol + registry; start with Kokoro (82M, fast CPU). Unlimited-length narration via sentence-boundary chunking + crossfade (Video Essays).
- **Ducking + loudness normalization** *(OpenReel `volume-automation.ts`, Pro assessment)* — `DuckingConfig` (threshold/reduction/attack/release/hold) to lower music under VO; normalize to platform LUFS targets (-14 YouTube, -16 podcast, etc.) on a mix bus.

### F. Motion graphics / titles
- **Title engine + text/SVG animation presets** *(OpenReel `title-engine.ts`)* — 20+ text-animation presets, lower-thirds, SVG animations. Pairs with a light compositing/layer model (a current gap).

### G. App craft & wholesomeness
- **Command-pattern undo/redo** *(Electrokit)* — route every clip/effect/order mutation through a `CommandManager` history; global Ctrl+Z / Shift+Ctrl+Z.
- **Electron hardening** *(Electrokit)* — Fuses (disable `RUN_AS_NODE`, ASAR integrity, cookie encryption), whitelist-only IPC channels, Zod schemas shared main↔renderer, `auto-unpack-natives` for ffmpeg.
- **Auto-update with progress UI** *(electron-updater)*; **auto-save + scheduled encrypted backups with one-click restore** — kills the fear of losing an edit.
- **DESIGN.md + design-review checklist** *(GStack)* — formal type scale, 4px spacing, radius hierarchy, motion tokens; WCAG AA, `focus-visible`, `prefers-reduced-motion`, warm empty states. Includes an **AI-slop blacklist to avoid** (purple gradients, 3-column icon-circle grids, centered-everything, emoji-as-design) — directly supports the existing anti-emoji / animated-icon tasks.
- **Socratic first-run + per-type presets** *(SuperPowers, PaperClip)* — a one-screen "what are you making?" picker that seeds a preset; lowers the skill floor. Local-first, no account, opt-out telemetry by default.
- **Keyboard-first** with a discoverable shortcut reference dialog.

---

## 3. The two bridges

### MMMedia Darkroom (sibling asset-browser + light editor)
Darkroom and Pro **already share a Manifest lineage** (`manifestBridge.js` ↔ `manifestBridge.ts`, same `timelineIn/Out`, `sourceIn/Out`, grid cells, `MANIFEST_VERSION`).
- **Promote the Manifest to one versioned schema** both apps import/export.
- **Darkroom → Pro:** curated/tagged media pool + selects (Darkroom is the better ingest/browse/tag surface) and the **effect/transition/speed-ramp JSON registry** as Pro's shared preset library.
- **Pro → Darkroom:** finished `EditDocument`/manifest for review/re-grade in Darkroom's lighter UI.
- **Must fix on import:** Darkroom sets `sourceDurationFrames: 9999` (unknown) and `volume ?? 1` (Pro uses 0–100) — normalize units and require a probe step; carry a degradation report since Pro's model is richer (round-trip is lossy).

### Premiere Pro
- **Primary (keep): ICUNI Edit** lossless JSON (`lib/icuniEdit.ts` + `icuniExport.ts`) with its `PREMIERE_SUPPORT` native/approx/unsupported map + degradation report, rebuilt into `.prproj` by **Edia** via ExtendScript/UXP. Richest, app-controlled, reports losses.
- **Add: FCPXML export** for universal interchange (no Edia required). Maps cleanly: trim/position/track, constant speed, reversed, volume/mute, cross-dissolve/dip, rotation, basic Lumetri color, text (approx). Approximated via keyframes: zoom/Ken-Burns, speed curves, shake, blur/sharpen/vignette/glow, optical-flow slowmo. Marker + report for the unmappable (doubleExposure, VHS, rgbSplit, hueCycle, parametric GLSL, boomerang unless pre-expanded).
- **Fallback: EDL (CMX3600)** for cuts-only lossless exchange — shotcut's `mlt2edl.js` is a dependency-free port. **Avoid** AAF / binary `.prproj`.

---

## 4. Phased plan

**P0 — Fidelity & correctness (do first; protects everything else)**
1. HW-encode + visually-lossless intermediate + stream-copy fast path *(med)*
2. A/V-parity assertion + `aresample=async=1` in the stitch *(easy)*
3. Adaptive xfade cap via pre-rendered transition pairs *(med)*
4. Platform loudness normalization + music-bed ducking on a mix bus *(easy)*

**P1 — Autonomy brain (turns 4 stubbed types god-tier)**
5. Wire `clipAnalyzer`/`clipIndexer` into showreel/essay/short-film; build the index→classify→plan→build loop *(hard)*
6. Beat-synced downbeat cutting as a shared service *(med)*
7. Dedicated **Social generator**: hook-first pacing, 9:16 auto-reframe, karaoke captions, safe-areas, loop endings *(med)*
8. Pluggable TTS + unlimited-length narration + ducking for Video Essays *(med)*

**P2 — Expressive surface & interchange**
9. Self-describing effect/transition registry; consume Darkroom's JSON registry; `xfade`/`gl-transitions` table *(med)*
10. Keyframe curve model for all effect params *(med)*
11. Title/motion-graphics engine + light layer/compositing model *(med→hard)*
12. Manifest schema unification with Darkroom + probe-on-import *(easy)*
13. FCPXML export (+ EDL fallback) alongside ICUNI Edit *(med)*

**P3 — Wholesome experience**
14. Command-pattern undo/redo *(hard)*
15. Electron Fuses + IPC whitelist + shared Zod validation *(med)*
16. Auto-save + scheduled backups + one-click restore; auto-update with progress UI *(med)*
17. DESIGN.md + design-review pass (ties off anti-emoji/animated-icon work); Socratic onboarding + per-type presets; shortcut reference dialog *(easy→med)*

---

## 5. Fast wins to start (high value / low risk)
- A/V-parity assertion + `aresample=async=1` *(easy)*
- Loudness normalization to platform LUFS + ducking *(easy)*
- Consume Darkroom's effect/transition JSON registry as a shared preset library *(easy)*
- `xfade`/`gl-transitions` transition table *(easy)*
- Word-level karaoke captions from Whisper *(easy)*
- Manifest unification + probe-on-import with Darkroom *(easy)*

---

## 6. Source map (who taught what)
- **libopenshot / openshot-qt / shotcut** → integer-frame timing, compositing order/blend modes, keyframe curves, JSON-diff mutation, mask→xfade transitions, MLT/EDL/`.osp` interchange.
- **FreeCut / omniclip / HyperFrames / OpenMontage** → single preview≡export engine, frame-stream-to-FFmpeg, self-describing effect registry, historical/non-historical state split, gl-transitions, YAML pipeline recipes, parallel frame-range sharding, WhisperX captions.
- **D2R / OpenReel / voicebox / palmier-pro** → index→classify→plan→build, A/B-roll rules, auto-reframe (no-ML), beat/downbeat detection, ducking, karaoke captions, pluggable TTS + unlimited narration, agent-controllable timeline (MCP) API.
- **Electrokit / GStack / SuperPowers / PaperClip / HeadRoom / Open-Notebook / Oxidus** → command-pattern undo, Electron fuses/IPC security, auto-update, backups, DESIGN.md + review rubric, Socratic onboarding, local-first trust, WCAG contrast tooling.
