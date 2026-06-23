# MMMedia Pro — Mastery Roadmap (1.5/5 → 5/5)
### A deep, systemic plan to make MMMedia Pro edit Trailers, Music Videos, Actor Showreels, YouTube Video Essays, and Short Films — with faithful render and a faithful Premiere bridge.

*Synthesis of a six-agent deep code investigation across MMMedia Pro, Edia Pro, and the open-source systems in `D:\ICUNI Group\Non_ICUNI` (Shotcut, OpenShot/libopenshot, Kdenlive, FreeCut, OpenReel, Omniclip). Every claim below is grounded in real reads of the actual source; file/line citations are inline and consolidated in the Appendix.*

---

## 0. How to read this document

The output ladder, by increasing complexity, is the organising spine of the whole plan:

| # | Output type | Driver | Today | Target |
|---|---|---|---|---|
| 1 | **Trailers** | Music energy | ~3.0/5 | 5/5 |
| 2 | **Music Videos** | Song structure + performance | ~2.5/5 | 5/5 |
| 3 | **Actor Showreels** | Best-shot curation | ~1.5/5 | 5/5 |
| 4 | **YouTube Video Essays** | A pre-recorded **voiceover** + matched B-roll | ~0.5/5 | 5/5 |
| 5 | **Short Films** | **Narrative / dialogue** | ~0/5 | 5/5 |

The system's overall level (~1.5/5) is gated by type 3+ because those require capabilities the engine does not have yet. This document explains *why*, then lays out the architecture and a phased build to close the gap.

---

## 1. Executive synthesis — the one root cause and the three pivots

### 1.1 The single root cause of the 1.5/5 ceiling
**MMMedia Pro has no model of CONTENT or NARRATIVE.** Its intelligence is real but one-dimensional: it is a *music-DSP + low-level pixel-statistics* engine. The Beat Intelligence Engine (`src/lib/audioAnalysisCore.ts`) is genuinely strong — multi-band onset detection, octave-corrected tempo, phase-aligned grids, downbeats, energy-aware structural segmentation. The only video "understanding" is motion energy, RGB histograms, and average luma/saturation, computed by FFmpeg passes in `TrailerRouter.tsx`. 

Nothing in the system knows **what a shot contains** (faces, who, shot scale, action, emotion), **what is being said** (no speech/transcript layer exists anywhere — confirmed by repo-wide search), or **how shots relate as a story**. Clips are independent samples selected by anti-repeat window-picking. Music is *mandatory* for any intelligence; with no music, generation degrades to a random procedural fill.

That is the whole ceiling. Trailers and music videos can live on rhythm alone, so the system reaches ~3/2.5. Showreels need shot/quality/face awareness; essays need speech + semantic B-roll matching; short films need narrative/dialogue/continuity — none of which the current architecture can represent.

### 1.2 The good news: every missing primitive already exists, on-device, in the mined repos
The FreeCut codebase is, in effect, the perception layer MMMedia is missing — and it runs entirely on-device (transformers.js + onnxruntime + WebGPU), which ports directly into an Electron renderer:
- **Whisper/Parakeet ASR with word-level timestamps** (`freecut/.../transcription/`).
- **CLIP image+text embeddings** with query-template ensembling and a precision-tuned accept gate (`freecut/.../embeddings/`, `scene-browser/utils/semantic-rank.ts`).
- **Scene/shot detection** (histogram + WebGPU optical flow + VLM verification) (`freecut/.../analysis/scene-detection.ts`).
- **VLM structured shot metadata** — caption + canonical shot-size taxonomy + subjects/action/lighting (`freecut/.../captioning/`).
- **Silence + filler-word removal** from transcript+audio (`freecut/.../timeline/utils/`).
- **Kokoro TTS** for script→VO (`freecut/.../kokoro-tts-service.ts`).
OpenReel adds portable **beat detection + a generic beat-synced auto-cut loop**. Omniclip provides the **serializable composition document** MMMedia's generators should emit.

### 1.3 The three architectural pivots that unlock all five levels
Everything in this roadmap reduces to three convergent pivots. They are interdependent and each unlocks multiple subsystems at once:

**Pivot A — A Perception Pre-Pass (the missing senses).** A cached, content-hashed analysis pass over the media library that produces, per *shot*, a `ShotAnalysis` record: transcript words (if speech), shot-type, subjects/faces, action, lighting, a 384-dim text embedding, a 512-dim CLIP image embedding, dominant-color palette, motion magnitude/coherence, and a quality score. This is the input every higher-level planner consumes. (Port FreeCut's `media-analysis-service.ts` orchestration + content-hash cache.)

**Pivot B — A Typed Planner Architecture emitting a CompositionSpec.** Today there are two hard-coded planners (trailer, music-video) and a "degrade to random fill" failure path. Replace this with a **planner interface keyed by output type** — `TrailerPlanner`, `MusicVideoPlanner`, `ShowreelPlanner`, `EssayPlanner`, `ShortFilmPlanner` — each consuming a typed analysis bundle `{ audio?, transcript?, content?, script? }` and emitting a **CompositionSpec** (adopt Omniclip's flat `{clips, tracks, filters, animations, transitions, settings}` document with timeline-position separated from source in/out, media referenced by content hash). One generic `assemble(cutGrid, shots, opts) → CompositionSpec` engine serves all types — beats, scene cuts, transcript boundaries and silence ranges are interchangeable cut-grid inputs.

**Pivot C — A Multi-Track Layer Compositor + Audio Mix Bus (in the render engine).** The current export engine flattens all video to a single concatenated track (`clip.track` is ignored for video) and mixes audio from t=0 with no `adelay` (so timeline-positioned audio is wrong at render). This single limitation blocks **captions, picture-in-picture, lower-thirds/titles-over-video, J/L cuts, and music ducking** — i.e., it blocks levels 3, 4, and 5 simultaneously, *and* render fidelity, *and* the Sequence NLE, *and* the Edia bridge. Building a true track-aware compositor (`overlay`/`blend` per track, low→high) plus an audio mix bus (per-clip `adelay`, `sidechaincompress` ducking, master `loudnorm`) is the highest-leverage single piece of engineering in the entire program.

### 1.4 The spine: one data model, four consumers
The Generator, the Sequence NLE, the Render engine, and the Edia bridge all read and write the **same `clipStore` + the same `filterBuilder`/composition document**. Therefore the data-model evolution is the shared spine: every schema upgrade (multi-track entity, generic keyframe channels, transitions-as-objects, independent A/V for J/L cuts, the CompositionSpec, perception metadata) benefits all four subsystems at once — and the Edia interchange must evolve in lockstep (it currently drops keyframes, color values, LUTs, stabilization, captions and even falsely advertises itself as "lossless"). Build the schema once; consume it everywhere.

### 1.5 The render-fidelity contract (must hold at every level)
The hard requirement — "everything we do can be rendered and will appear as it is supposed to" — is **violated today at two layers**: (a) the preview player routinely shows the *raw source* (no effects/color/zoom/text) while a proxy renders or if it fails, omits whole effect classes from proxy-invalidation, and fakes transitions/speed with CSS; (b) the render engine cannot express the multi-layer compositions levels 3–5 require. The contract is restored by: routing preview through the *same math* as render, fixing proxy field-coverage, and Pivot C. This is treated as a non-negotiable invariant throughout the roadmap, not a phase.

---

## 2. Current-state scorecard

### 2.1 Subsystem honesty check

**Generator (`src/lib/trailerGenerator.ts`, `musicVideo.ts`, `musicVideoBuild.ts`, `audioAnalysisCore.ts`)** — *Strong DSP, zero semantics.*
- The trailer engine has three modes: an "Intelligent Audio Beat Mode" (the flagship — per-segment adaptive beat patterns, sync strategies, cut cooldowns, per-segment clip params, anti-repeat best-trim selection, downbeat-scaled beat-drop impact stacks), a "use all clips" round-robin, and a pure procedural fill. `finalizeSequence` is the universal post-pass (clamp, boomerang expansion, transitions, color-per-section, shake/zoom/FX by `EffectApplyPolicy`, auto-fades).
- The music-video engine walks the whole song's structure, lays one shot per downbeat with per-section pacing, has an intro person-pull and shrink-to-corner outro + BTS slot, and is the only path with an editorial guardrail layer (`editRules.ts`).
- **Vestigial/unused intelligence that is already built:** `lyrics.ts` (lyric snapping — never called by the MV planner), `analyzeRhythmConsistency` and `detectPhrases` (computed, never read), `MediaFile.tags` (people/scene/location — no UI populates it; only `musicVideo.ts` reads it, so the person-pull/BTS features are effectively dead), `styleDNA` on `EditDocument` (defined, never produced or consumed), the `showreel` VideoMode (`editingModes.ts` — defined with `structure:'best-first'` but no planner implements it), and the bespoke impact-transition chains in `buildTransitionFilter` (never wired into the active engines).

**Render (`electron/main.ts`, `electron/filterBuilder.ts`)** — *Solid single-track engine; no compositing; preview diverges.*
- Default "segment" engine: per-clip capped intermediates via the shared `buildVideoFilter`/`buildClipAudioFilter`, then a run-grouped concat + boundary `xfade`/`acrossfade` (a real fix for the 125-deep-xfade freeze). Vidstab two-pass, grid compositing, frame-lock crop, glow/double-exposure fork-merge all live here.
- The **"Per-Clip" engine has its own thin inline filter path** that silently ignores colorGrading, parametric effects, text, chroma key, stabilize, keyframes, glow, double-exposure, shake, vignette, film grain — i.e. it is the lowest-fidelity path despite its name; either route it through `buildVideoFilter` or remove it.
- **No multi-layer video compositing** (`clip.track` ignored for video; clips flattened + concatenated). **Audio mixed from t=0 with no `adelay`** (timeline-positioned audio wrong at render). **No captions/subtitles filter, no sidechain ducking, no master loudness, no J/L cuts, no title-card/synthetic-clip type.** Color is BT.709-*tagged* only, never converted.
- **Preview ≠ render** in many places: player shows raw source until/unless a proxy is ready; `clipNeedsProxy` and the export hash omit glow/DE/motionBlur/rgbSplit/hueCycle/vhs/vibrationFlash/speedCurve/smoothSlowmo/audioEffects/stabilize/keyframes (so those silently differ and proxies cache-collide); transitions and variable speed are faked with CSS; `drawtext` uses a font *name* not a `fontfile=` and an unscaled `fontsize`.

**Sequence editor (`SequenceViewTab.tsx`, `clipStore.ts`)** — *A viewer with light affordances, not an NLE.*
- Tracks are synthesized at render-time in a `useMemo` (V1 / linked-shadow-audio A1 / music A2); the "A1" lane is **fabricated shadow audio locked 1:1 to video** — so J/L cuts are impossible by construction. Compositing is "topmost video track wins" (a single-layer switch, not blending). The clock is driven by `<video>.currentTime` with `Math.floor` mapping (not a master timeline clock); transitions are a 60 ms CSS opacity fade.
- The only real timeline edits are click-to-seek, drag-move of *music* clips (no snapping), and "magnetize" (re-packs track 1 only). The Inspector is the borrowed `ClipControls`. **Missing entirely:** blade/split, ripple/roll/slip/slide, trim handles on clips, cross-track drag, snapping, multi-track composite, timeline-positioned audio, transitions-as-objects, keyframe lanes (only brightness/contrast/saturation keyframes exist, Inspector-only), markers, copy/paste, and **undo/redo (no history middleware at all)**.

**Edia Pro bridge (`Edia Pro/com.icuni.chaosedit/...` + MMMedia `icuniExport.ts`/`icuniEdit.ts`)** — *Faithful for trims; lossy for everything that matters; falsely "lossless".*
- The round-trip carries frames→ticks and faithfully reconstructs: media import, source in/out, track placement, constant speed, and mute. Transitions and a few looks are crude parameter-less QE-DOM approximations.
- **Lost in transit:** reverse (marker only), volume (carried but never applied), speed ramps (collapsed to average), zoom/rotation/flip (ignored by the builder), color-grading *values* (a neutral Lumetri is added with no values), LUTs, **text overlays/captions** (carried but never applied), grids/PiP (flattened). **Lost before transit (never exported):** the new brightness/contrast/saturation keyframes, stabilization, audio effects, chroma key, rgbSplit/hueCycle/vhs. The exporter's "LOSSLESS from MMMedia's side" comment is false against the current `Clip` type.
- Two live export buttons feed two incompatible schemas (one targets deprecated tooling) — a real source of confusion.

### 2.2 Readiness per output type (what works *today*)
- **Trailers (3.0):** music-driven escalation, beat-synced cuts with cooldowns, drop-aware impact, transitions, motion-energy clip preference, auto color/fade. Missing: best/hero-shot selection, title/logo cards, real impact transitions at render, master loudness.
- **Music Videos (2.5):** whole-song structure, downbeat anchoring, per-section pacing, editorial rules. Dead: person-pull/BTS (no tags UI), lyric sync (`lyrics.ts` unwired), performance-vs-B-roll roles, vocal-onset cutting.
- **Showreels (1.5):** a `showreel` mode exists but no planner honors its structure → falls to random fill with music off. No faces, shot-typing, take-quality selection, or name cards.
- **Video Essays (0.5):** unsupported — no speech ingestion, no transcript, no semantic B-roll matching, no captions, no ducking; the entire brain is music-keyed.
- **Short Films (0):** unsupported — no script/scene/take model, no dialogue assembly, no coverage selection, no J/L cuts, no continuity, no multitrack mix.

---

## 3. The target architecture (the spine)

These are the shared components every output type and subsystem builds on. Build them once.

### 3.1 Perception Pre-Pass → `ShotAnalysis` (Pivot A)
A library-level, content-hash-cached analysis pass (port FreeCut `media-analysis-service.ts`). Run it once per source clip; results are reusable across every project and every output type. Run sequentially (one shared GPU device) to avoid OOM.

```ts
interface ShotAnalysis {           // one record per DETECTED SHOT (not per file)
  mediaId: string; startSec: number; endSec: number;
  shotType: 'ECU'|'CU'|'MCU'|'MS'|'MLS'|'LS'|'ELS';   // VLM canonical taxonomy
  subjects: string[]; action: string; setting: string;
  lighting: string; timeOfDay: string;
  caption: string;
  faces?: { id: string; bbox: [number,number,number,number]; size: number; expression?: string }[];
  textEmbedding: Float32Array;     // 384-d  (all-MiniLM-L6-v2, on fused caption+transcript+colors)
  imageEmbedding: Float32Array;    // 512-d  (CLIP vit-base-patch32)
  palette: LabColor[];             // dominant colors (CIELAB)
  motion: { magnitude: number; coherence: number; dominantDir: number };  // optical flow
  quality: number;                 // sharpness + exposure + face-size + stability composite
  transcriptWords?: { text: string; start: number; end: number; confidence: number }[];
}
```
Pipeline per file: scene/shot detect → per-shot VLM caption (shotType/subjects/action/lighting) → dominant colors → fused-text all-MiniLM embed → CLIP image embed → (if speech) ASR words → quality score. Persist as media-item AI metadata keyed by SHA-256 of source bytes; adopt FreeCut's cross-file cache (identical bytes reuse results). A no-GPU fallback path can use FFmpeg `select='gt(scene,…)'` for cuts and skip the VLM/CLIP features (feature-gate on `navigator.gpu`).

### 3.2 Typed Planner Architecture + `CompositionSpec` (Pivot B)
Replace the two hard-coded generators with a planner interface:
```ts
interface Planner { plan(input: AnalysisBundle, opts: PlanOpts): CompositionSpec }
type AnalysisBundle = { audio?: AudioAnalysisResult; transcript?: TranscriptResult;
                        shots?: ShotAnalysis[]; script?: ScriptModel };
```
`CompositionSpec` (adopt Omniclip's shape): a flat document `{ clips[], tracks[], filters[], animations[], transitions[], settings }` where every clip separates `timelineStart` from `sourceIn/sourceOut`, media is referenced by content hash, and text/title/caption elements are first-class effects on their own tracks. One generic `assemble(cutGrid: number[], shots: ShotAnalysis[], opts) → CompositionSpec` does the placement; the cut-grid is produced differently per type (beats, downbeats, scene cuts, transcript sentence boundaries, silence-stripped word ranges). The CompositionSpec compiles to MMMedia's existing FFmpeg pipeline (not Omniclip's WebCodecs renderer — but note Omniclip already delegates audio to FFmpeg, proving the path). The CompositionSpec also becomes the *interchange* the Edia bridge serialises (§5.4).

### 3.3 Multi-Track Compositor + Audio Mix Bus (Pivot C)
A new `electron/compositeBuilder.ts` that consumes tracks and emits a `filter_complex`:
- Per-clip subchain via the existing `buildVideoFilter`.
- Position each clip at its `timelineStart` (`tpad`/`setpts` + `overlay=enable='between(t,start,end)'`).
- Stack tracks low→high with `overlay` (normal) or `blend=all_mode=X` (22 MLT `CompositeType` modes map to FFmpeg `blend`) honoring per-clip alpha (keyframeable, §3.5).
- libopenshot's `Timeline::GetFrame` (sort by layer, alpha-composite top-down) is the reference algorithm; MMMedia's existing grid compositor (`renderGridClip`) and `doubleExposure` blend prove the primitives.
Audio mix bus (a new stage after per-clip `buildClipAudioFilter`): `adelay` each clip to its `timelineStart`, `amix`/`amerge` across tracks, `sidechaincompress` keyed on the dialogue/VO track for ducking, then a master two-pass `loudnorm` to a delivery target (−14 LUFS YouTube, −16 podcast). This one stage delivers timeline-correct audio, J/L cuts, ducking, and deliverable loudness.

### 3.4 Transitions as timeline objects + luma wipes
`clip.transition` already exists in the type but is driven only by a global strategy. Make transitions first-class objects `{fromClipId, toClipId, type, durationFrames, lumaFile?, align}` created on clip overlap (OpenShot/Shotcut model), feed the existing `buildTransitionChain`, and add a `maskedmerge`/`xfade=custom:expr` luma-wipe branch with a bundled PGM/PNG mask library (port Shotcut `lumaNN`/OpenShot mask assets). Wire the bespoke flash/glitch/whip chains that already exist in `buildTransitionFilter` into the active engine so impact transitions render as designed instead of being downgraded to `fadewhite`.

### 3.5 Generic keyframe channels (extend the proven substrate)
`src/lib/keyframes.ts` (`KfPoint[]` + `buildKeyframeExpr` → `eq=…:eval=frame`) already works and is isomorphic to libopenshot's `Point`. Generalize it:
- Add channels: `opacity, scaleX/Y, positionX/Y, rotation, volume`, plus per-effect-param keyframes — all baked into the compositor's `overlay`/`scale`/`rotate`/`colorchannelmixer aa=`/`volume=` expressions.
- Add the **30 missing easings** (Shotcut's Sine/Quad/Cubic/Quartic/Quintic/Expo/Circ as cubic-bezier entries; Back/Elastic/Bounce as closed-form functions in `kfValue` + FFmpeg expr). 
- Add `sliceKeyframesAt(kf, frame)` so the blade tool splits animation correctly; add `GetDelta`/`IsIncreasing` (libopenshot) for correct variable-speed audio resample ratios; add Catmull-Rom auto-handles for smooth curves without manual handle dragging.

### 3.6 The preview = render contract
Drive the preview from the *same* math as the export: a master timeline clock (fps-locked rAF accumulator), preview compositing that stacks layers like the compositor, preview transitions that use the xfade math, and proxy invalidation that covers **every** render-affecting field. Show an explicit "rendering preview / preview unavailable" state instead of silently falling back to raw source. This is an invariant maintained across all phases, not a one-off.

---

## 4. Output-type capability stacks (L1 → L5)

Each level is cumulative: it assumes everything below it plus the spine (§3). "Source" cites where the capability is mined from.

### L1 — Trailers (3.0 → 5)
*Definition: short, high-impact, music-driven montage that escalates to a climax.*
Already strong. To finish:
1. **Aesthetic/shot-quality scorer** — extend `clipScoring.ts` beyond motion with sharpness (variance-of-Laplacian), exposure (histogram clipping), face presence/size, and rule-of-thirds, sourced from the perception pass. Rank by *cinematic value*, not just motion.
2. **Title/logo/hero-shot system** — a synthetic title-card clip type + the SVG-title approach (OpenShot `title_editor.py` templates → SVG→PNG→`overlay`), and a "hero shot" reservation that forces the highest-quality shot onto the final drop/downbeat.
3. **Real impact transitions at render** — wire `buildTransitionFilter`'s flash/glitch/whip chains in; add luma wipes (§3.4).
4. **Master loudness** — `loudnorm` delivery pass (§3.3).
5. **Diversity constraint** — avoid consecutive same-subject/same-scene in best-trim selection (needs perception tags).

### L2 — Music Videos (2.5 → 5)
*Definition: song-structure-driven, performance + B-roll, look-forward styling.*
1. **Tagging + auto-tagging** — wire `MediaFile.tags` to a real UI *and* to auto-population from the perception pass (face clustering → people; VLM setting → scene/location). This revives the already-built person-pull/BTS/scene-targeting in `musicVideo.ts`.
2. **Lyric/vocal sync** — wire the existing `lyrics.ts` into the MV planner (accept LRC/word-timed lyrics — reuse the ASR layer); add vocal-onset detection (extend the mid-band analysis already in `audioAnalysisCore`) so cuts land on vocal phrases, not only downbeats.
3. **Performance vs B-roll roles** — extend `MvPoolItem`/`ClipRole` so verses favor performance footage, instrumental sections favor B-roll (role derived from perception: faces+speech → performance).
4. **Beat-effect/transition preview** — fix proxy coverage so the artist edits with the FX visible (§3.6).
5. **Animated PiP/captions** — keyframeable transform (§3.5) + compositor (§3.3).

### L3 — Actor Showreels (1.5 → 5)
*Definition: curated highlight reel showing an actor's range and best moments.*
1. **Face detection + identity clustering** — on-device face model (transformers.js ONNX) → `ShotAnalysis.faces`; cluster takes by identity so the reel can be built around the chosen actor.
2. **Best-take/quality selection** — the §L1 quality scorer + CLIP-dedup of near-identical takes (cosine-cluster, keep the highest quality per cluster) (FreeCut CLIP).
3. **Music-off structured planner** — implement a real `ShowreelPlanner` that honors `VideoMode.structure:'best-first'` (currently defined but unimplemented), pacing to a music bed via OpenReel's downbeats/segments auto-cut when music is present, or to shot rhythm when not.
4. **Name/title cards** — shared with L1's card system (SVG titles with slide/fade animations).
5. **Performance-moment detection** — face-size + speech presence to find delivery beats (depends on perception + transcript).

### L4 — YouTube Video Essays (0.5 → 5) — the big architectural jump
*Definition: a pre-recorded voiceover drives the edit; fitting B-roll is matched to the words; captions and ducked music throughout.*
This is a **new pipeline** (the driver is voice, not music) and the crux capability of the whole system. All primitives exist on-device in FreeCut. The `EssayPlanner`:
1. **Transcribe the VO** (Whisper/Parakeet, word timestamps) → strip silence + fillers (FreeCut) → tightened VO + rippled word timeline.
2. **Segment the transcript** into phrase/sentence B-roll slots `{text, start, end}` (punctuation + word-gap heuristics).
3. **Dual-embed each slot** — all-MiniLM (text↔caption) + CLIP-text (text↔thumbnail) with **query-template ensembling** (FreeCut `clip-provider.ts`).
4. **Match** each slot to the best shot via `semantic-rank`'s side-aware accept gate (`max(textCos, imageCos)` with mutual-confirmation for weak matches), with no-repeat cooldown and soft `shotType`/`subjects` filters.
5. **Place** B-roll trimmed to each slot's duration (fill short shots via OpenReel's smart re-time); a cut at each segment boundary, paced to narration.
6. **Captions** — group VO words into ~3 s lines → burned `subtitles`/`ass` or `drawtext` layer timed to the VO.
7. **Duck music** under the VO — `sidechaincompress` keyed on the VO track or volume keyframes at word/segment boundaries (§3.3).
This is fully assemblable from existing parts; it needs the perception pass, the EssayPlanner, the compositor, the caption render path, and the mix bus. (Optional: Kokoro TTS so a *script* without recorded VO can generate the VO, then run the identical pipeline.)

### L5 — Short Films (0 → 5) — mastery
*Definition: narrative assembly from coverage — dialogue-driven, continuity-aware, multitrack mix, graded.*
Builds on L4's perception/transcript + the NLE's J/L cuts + the compositor + the mix bus.
1. **Script/scene/take model** — a `ScriptModel` (scenes, lines, characters) + per-`MediaFile` slate metadata (scene #, take #, shot type, characters, line refs). New schema.
2. **Dialogue alignment** — transcribe each take, align to script lines (who-speaks-when, exact line boundaries).
3. **Coverage-aware planner** — for each scripted line, choose among available angles (master/OTS/CU/reaction) by take quality + continuity heuristics (consistent lighting/timeOfDay/setting across adjacent shots; direction-coherence from optical flow for screen-direction/180° checks). New selection algorithm with shot-type awareness.
4. **J/L cuts** — split-edit audio/video offsets, trivial in the CompositionSpec where audio and video are independent timeline effects; requires the real (not shadow) linked-audio track and the `adelay` mix bus.
5. **Reaction-shot insertion, performance-take selection** by emotion/delivery (face + speech + sentiment).
6. **Color + sound finishing** — 3-way wheels/curves/LUTs/scopes (Shotcut filters → FFmpeg `colorbalance`/`curves`/`lut3d`) + the dialogue/music/SFX multitrack mix with ducking and master loudness.

### 4.1 Capability → output-type matrix
| Capability (spine/feature) | L1 | L2 | L3 | L4 | L5 |
|---|---|---|---|---|---|
| Perception pass (shots/quality) | ◐ | ◐ | ● | ● | ● |
| ASR transcript + word times | – | ◐ (lyrics) | ◐ | ● | ● |
| CLIP semantic B-roll match | – | – | ◐ | ● | ● |
| Faces / identity | – | ◐ | ● | ◐ | ● |
| Typed planner + CompositionSpec | ● | ● | ● | ● | ● |
| Multi-track compositor | ◐ | ● | ● | ● | ● |
| Audio mix bus (duck + loudness) | ◐ | ● | ◐ | ● | ● |
| Captions render path | – | ◐ | ◐ | ● | ● |
| Title/name cards (SVG) | ● | ● | ● | ● | ● |
| Transitions-as-objects + luma | ● | ● | ◐ | ◐ | ◐ |
| Generic keyframes (pos/scale/opacity) | ● | ● | ● | ● | ● |
| J/L cuts (independent A/V) | – | – | ◐ | ● | ● |
| NLE manual-finish ops | ◐ | ◐ | ● | ● | ● |
| Script/scene/take model | – | – | – | – | ● |
| Color finishing (wheels/curves/scopes) | ◐ | ● | ● | ● | ● |
*● essential · ◐ valuable · – not required*

---

## 5. Subsystem plans

### 5.1 Generator intelligence (`src/lib/*`)
**Target architecture:** the typed planner interface (§3.2). Migration path that preserves the working trailer engine:
1. Extract the current `generateTrailerSequence` into a `TrailerPlanner` behind the interface; have it emit a `CompositionSpec` instead of a raw `Clip[]` (adapter keeps current behavior).
2. Promote `styleDNA` from vestigial to the **per-type intent contract**: each planner *emits* it; the assemble engine *consumes* it (cutDensity, zoomStrategy, colorMood, audioStrategy, speedRange).
3. Add the analysis bundle plumbing in `TrailerRouter.handleGenerate` — it already runs concurrency-limited FFmpeg passes with a progress store (`trailerSmartStore`); extend that exact pattern to run the ML perception passes and populate `AnalysisBundle`.
4. Implement planners in ladder order: `ShowreelPlanner` (L3), `EssayPlanner` (L4), `ShortFilmPlanner` (L5). The generic `assemble(cutGrid, shots, opts)` is shared.
5. **Cheap early wins (wire the dead code):** `lyrics.ts` → MV planner; `MediaFile.tags` → tagging UI + auto-tag; `analyzeRhythmConsistency`/`detectPhrases` → pacing; the `showreel` VideoMode `structure` → ShowreelPlanner; bespoke impact transitions → active engine.

### 5.2 Sequence NLE (`SequenceViewTab.tsx`, `clipStore.ts`)
Make the Sequence page a true Premiere-like NLE. Operations expressed as `Clip[]` mutations (Shotcut algorithms translated to MMMedia's explicit-`startFrame` model):
- **Tier 0 (foundations):** undo/redo history (wrap store with temporal middleware — none exists today); a master timeline clock (fps-locked) decoupled from `<video>.currentTime`; a **real track entity** (`tracks[]` with sparse numbering à la OpenShot, kind/order/opacity/blend/enabled/locked/solo) replacing the synthesized memo and the ignored `clip.track`.
- **Tier 1 (cut/trim, render-for-free):** blade/split at playhead (+ `sliceKeyframesAt`), trim handles on clip edges (reuse `updateClipSource`), ripple + ripple-delete, drag-move with snapping (port OpenShot `snapDeltaSec` + Shotcut 10px/4px thresholds, Alt-disable), copy/paste, fix duplicate-overlap.
- **Tier 2 (audio/dialogue):** timeline-positioned audio (`adelay` at render — fixes a real preview↔render bug), waveform lanes on the timeline, J/L cuts via real (non-shadow) linked-audio clips, volume automation keyframes + ducking.
- **Tier 3 (composite/motion):** multi-track video composite/overlay (preview + render), keyframe channels opacity/scale/x/y/rotation with an inline keyframe lane, roll/slip/slide.
- **Tier 4 (polish):** per-boundary transitions on the timeline, markers/regions, dynamic ruler + zoom-to-fit/playhead + frame-snap scrub.
**Golden rule:** store every edit as data on `Clip`/track entities and consume it in `filterBuilder` + the compositor using the same math the preview uses — `buildKeyframeExpr` and `computeClipTiming` are the working templates.

### 5.3 Render fidelity (`electron/*`)
- **P0 correctness:** fix proxy field-coverage + export hash (include glow/DE/motionBlur/rgbSplit/hueCycle/vhs/vibrationFlash/speedCurve/smoothSlowmo/audioEffects/stabilize/*Keyframes); show explicit preview states; fix `drawtext` (`fontfile=` + resolution-scaled size/position; verify escaping against the `-filter_complex_script` path actually used); bring the Per-Clip engine to parity or remove it.
- **P1 enablers:** multi-layer compositor (§3.3); burned captions (`subtitles`/`ass`); music ducking (`sidechaincompress`) + master `loudnorm`; synthetic title-card clip type; wire real impact-transition chains.
- **P2 polish:** J/L cuts in the data model + stitch; unify xfade/`acrossfade` A/V sync accounting (drift on long timelines); input color-space detection + `zscale`/tonemap so BT.709 tagging matches reality; render preview transitions/variable-speed; guard the Monolithic engine for many-short-clip timelines (apply run-grouping or auto-redirect to Segment).

### 5.4 Edia Pro ↔ Premiere bridge
The bridge must evolve in lockstep with the schema so edits survive into Premiere. The CompositionSpec (§3.2) should *become* the interchange (bump ICUNI Edit to v2.0).
- **P0 (stop the data loss at the export boundary — `icuniExport.ts`):** export the new keyframe channels, `stabilize`, `audioEffects`, `chromaKey`, `rgbSplit/hueCycle/vhs`, `blurAnimated`, `zoomSpeed`; make `colorGrading` a typed payload including `lutFile`. Either make "lossless" true or drop the claim.
- **P0 (apply what's already in the plan — `host/icuniBuilder.jsx`):** apply volume; rotation/flip via Motion (the deprecated `PremiereBuilder.js` shows the `properties[].setValue` pattern); zoom as Motion Scale/Position keyframes; speedCurve as Time-Remapping keyframes (not averaged); set actual Lumetri values and parametrize Gaussian-Blur/Unsharp.
- **P1 (reconstruct features):** **generic keyframe channel** in the schema (`keyframes: {property: KfPoint[]}`) → Edia writes Premiere keyframes uniformly (Motion Scale/Position/Rotation, Opacity, Lumetri, Time Remap) — the single highest-leverage schema change; text overlays → Essential Graphics; LUT via Lumetri Input LUT; transition duration/alignment; track creation + A/V linkage (`groupId`, explicit `tracks[]`).
- **P2:** grid/PiP compositing reconstruction (port the deprecated `PremiereBuilder.js` cell logic onto the v2 schema); stabilization → Warp Stabilizer; chroma key → Ultra Key; retire/clearly-label the legacy "Export Manifest" button; document the bridge.

---

## 6. Phased roadmap

Each phase states what it unlocks and its hard dependencies. Phases overlap where independent; the ordering reflects dependency, not strict sequence.

**Phase 0 — Fidelity & foundations (no new output capability, but everything depends on it).**
Render P0 fixes (preview=render contract, proxy coverage, drawtext, Per-Clip parity); NLE Tier 0 (undo/redo, master clock, real track entity); generic-keyframe substrate extension (channels + easings + slice/delta). *Unlocks: trustworthy preview, the data spine.*

**Phase 1 — Multi-track compositor + audio mix bus (Pivot C).**
`compositeBuilder.ts` (overlay/blend per track), `adelay` audio placement, sidechain ducking, master loudnorm, synthetic title-card clip type, SVG title system, transitions-as-objects + real impact/luma transitions. *Unlocks: L1→5 (title/logo cards, master loudness), and the rendering substrate for PiP/captions/ducking used by L2–L5. Finishes Trailers to ~5.*

**Phase 2 — Perception pre-pass (Pivot A) + planner architecture (Pivot B).**
Port FreeCut analysis (scene/shot detect, VLM shot-typing, CLIP+text embeddings, faces, quality, content-hash cache) into an Electron-side analysis service; build the planner interface + `assemble` engine + CompositionSpec; migrate the trailer engine onto it; wire the dead code (tags/lyrics/styleDNA/showreel structure). *Unlocks: L2 fully (tags+lyrics+roles), L3 (best-shot curation + ShowreelPlanner + name cards).*

**Phase 3 — Speech pipeline + EssayPlanner (L4).**
ASR (Whisper/Parakeet, word timestamps) + silence/filler cleanup; transcript segmentation; dual-embed semantic B-roll matcher (CLIP + all-MiniLM + side-aware accept gate); caption render path; ducking. *Unlocks: YouTube Video Essays to ~5.* (Depends on Phases 1+2.)

**Phase 4 — NLE editing depth.**
Tiers 1–3 of the Sequence NLE (blade/ripple/roll/slip/slide, trim handles, snapping, J/L cuts via real linked audio, keyframe lanes, multi-track composite UI, waveform lanes, automation). *Unlocks: professional manual finishing of any output; J/L cuts needed by L5.* (Composite/J-L depend on Phase 1.)

**Phase 5 — ShortFilmPlanner (L5).**
Script/scene/take model + slate metadata; dialogue alignment to script; coverage-aware planner (angle selection by quality + continuity); reaction insertion; color finishing (wheels/curves/LUTs/scopes); full multitrack dialogue/music/SFX mix. *Unlocks: Short Films — mastery.* (Depends on Phases 1–4.)

**Phase 6 — Bridge parity + delivery.**
Edia v2 schema (CompositionSpec interchange) + builder reconstruction (keyframes, color values, LUTs, captions, multitrack, PiP); retire legacy export; document. Continuous: keep Edia in lockstep with each schema change from Phases 0–5. *Unlocks: faithful Premiere round-trip for all five output types.*

---

## 7. Risks & invariants

1. **Preview = render is a contract, not a feature.** Every phase must keep them in sync (same math, full proxy coverage). Regressions here erode trust in the whole tool.
2. **On-device model assets.** FreeCut workers load models from CDN and set `allowLocalModels=false`. For Electron: pin one transformers.js version, set `env.allowLocalModels=true` + local `wasmPaths`/`localModelPath`, and **bundle** the assets (Whisper base ~140 MB or Parakeet ~600 MB; CLIP ~90 MB; all-MiniLM ~22 MB; LFM/Gemma VLM ~400–600 MB, WebGPU-required; Kokoro ~310 MB). Feature-gate VLM/optical-flow on `navigator.gpu`; provide FFmpeg fallbacks (scene detect via `select=scene`) where possible.
3. **The Edia "lossless" lie is a correctness bug, not cosmetics.** Until the schema carries keyframes/color/LUTs/captions/stabilize and the builder applies them, Premiere round-trips silently drop the look. Fix the export boundary first (data is lost before transit), then the builder.
4. **Don't let new output types degrade to the procedural-fill path.** The planner interface must fail loudly (or fall back intelligently) rather than silently producing random cuts when analysis is missing.
5. **Multi-track is load-bearing for four subsystems.** Sequencing it early (Phase 1) avoids building captions/PiP/J-L/ducking twice.
6. **Performance of the perception pass.** Run sequentially on one GPU device, cache by content hash across projects, and surface progress (extend the existing `trailerSmartStore` pattern) so a large library analysis is observable, not a hang.

---

## 8. Appendix — consolidated citations & asset list

**MMMedia Pro — generator:** `src/lib/trailerGenerator.ts` (`generateTrailerSequence` 267, `getBestTrimStart` 457, `finalizeSequence` 549, beat mode 875), `audioAnalysisCore.ts` (`analyzeBands` 612, `detectSegments` 430; unused `analyzeRhythmConsistency` 700, `detectPhrases` 752), `musicVideo.ts` (`planMusicVideo` 165), `musicVideoBuild.ts` (39), `editRules.ts` (57), `lyrics.ts` (unwired), `types.ts` (`Clip` 121, `EditDocument` 313, `styleDNA`), `store/mediaStore.ts` (`tags` 37), `TrailerRouter.tsx` (smart-prep 86-129).
**MMMedia Pro — render:** `electron/main.ts` (segment engine 741-1092, per-clip 1100-1502, monolithic 1511-1989, grid 536-726, vidstab 887-911, audio amix 1015-1029, preview-proxy 2267-2407), `electron/filterBuilder.ts` (`buildVideoFilter` 425-735, keyframed eq 517-523, transitions 944-1071, `computeClipTiming` 197-225), `electron/parametricEffects.ts`, `src/lib/{colorGrading,editEffectFilters,keyframes,audioEffects,textOverlay,transitions}.ts`, `src/features/VideoPlayer/VideoPlayerTab.tsx` (preview divergence 142-263), `src/features/Export/ExportTab.tsx`.
**MMMedia Pro — NLE:** `src/features/SequenceView/SequenceViewTab.tsx` (tracks memo 100-137, compositing 139-152, playback 172-263), `src/store/clipStore.ts` (`updateClipSource` 501-525, `magnetizeClips` 947-983; no history/split/ripple/markers), `src/features/Timeline/*`.
**Edia bridge:** producer `MMMedia/src/lib/{icuniEdit.ts,icuniExport.ts,icuniBridge.ts}`, `src/features/Export/PremiereTab.tsx`, `electron/main.ts:278`; consumer `Edia Pro/com.icuni.chaosedit/{shared/icuniEdit.js, client/src/bridge/icuniImport.js, host/icuniBuilder.jsx, host/index.jsx:83}`; legacy `MMMedia/src/scripts/premiere/PremiereBuilder.js` (grid/Motion pattern to port forward).
**Non_ICUNI — NLE engine:** libopenshot `src/{KeyFrame.cpp,Clip.h:331-368,AnimatedCurve.h,Enums.h:75-104,Timeline.h,Fraction.h,FrameMapper.h}`; shotcut `src/models/multitrackmodel.cpp` (split 1494, ripple-delete 1427, resize-trim 620/855, roll 2190/2277), `commands/timelinecommands.cpp:776` (slide), `models/keyframesmodel.h:34-70` (35 easings), `qml/views/timeline/Track.js:18` (snap), `qml/filters/{lift_gamma_gain,lut3d,huesaturation,loudness,volume}`, `widgets/scopes/`; openshot-qt `classes/project_data.py` (schema), `timeline/js/` (snapDeltaSec/state-machine), `windows/title_editor.py` + `templates/*.svg`.
**Non_ICUNI — intelligence:** freecut `src/features/media-library/transcription/workers/whisper.worker.ts` (word times 289-327), `infrastructure/analysis/embeddings/{clip-worker.ts,clip-provider.ts:159}`, `features/scene-browser/utils/semantic-rank.ts:142-179` (accept gate), `infrastructure/analysis/{scene-detection.ts,histogram-scene-detection.ts,optical-flow-analyzer.ts}`, `captioning/{lfm-captioning-provider.ts,scene-caption-format.ts:400}`, `features/media-library/services/media-analysis-service.ts` (orchestration + content-hash cache), `shared/utils/audio-silence.ts`, `timeline/utils/filler-word-removal-preview.ts`, `features/editor/services/kokoro-tts-service.ts`; openreel `packages/core/src/audio/beat-detection-engine.ts`, `timeline/auto-edit-service.ts`, `text/audio-text-sync-engine.ts`; omniclip `s/context/{types.ts,actions.ts}`, `compositor/parts/video-manager.ts`.

**On-device model/asset shopping list (bundle locally for Electron):** Whisper-base ONNX (~140 MB) or Parakeet-TDT-v3 (~600 MB) + ort wasm; CLIP vit-base-patch32 q8 (~90 MB); all-MiniLM-L6-v2 q8 (~22 MB); LFM2.5-VL-450M or Gemma VLM (~400–600 MB, WebGPU); Kokoro-82M (~310 MB, optional); a face-detection ONNX model; bundled luma-wipe masks + SVG title templates.

*End of roadmap. This document supersedes the earlier `MMMedia_Pro_Adoption_Report.docx` for strategic planning; that report remains valid as the effects/feature catalog.*
