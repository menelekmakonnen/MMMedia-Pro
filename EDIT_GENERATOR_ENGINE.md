# The Edit Generator Engine (EGE) — Reliable · Infinite · Irreplaceable

Everything in MMMedia Pro exists to serve one spine: the **Edit Generator Engine** — the system that takes *intent + media + optional timing spines (audio beats / narration / storyboard)* and autonomously produces a finished, render-ready edit of any of the six types. This doc defines how we make that engine never-fail, never-run-dry, and impossible to replace.

---

## 1. Reliable — it never produces garbage

The EGE must guarantee a good edit every time, regardless of input quality.

- **Generation contract + validator/auto-repair.** Every generated `Clip[]` is checked against invariants before render: total duration within ±1 frame of target; no slot starves below `MIN_RENDERABLE`; the active timing spine (narration > beat > smart > else) is respected frame-for-frame; no black/empty frames; per-clip audio length == video length; pool not over-repeated. A repair pass fixes violations (re-fill starved slots, redistribute, widen pool) instead of shipping a broken edit.
- **Pool-sufficiency guard.** Detect "too few distinct sources for target duration" up front and respond by widening the pool, lowering per-clip reuse, or switching strategy — never silently loop the same 3 segments. (The Proceed-All / Disable-Smart options already feed the full pool; this generalizes it.)
- **Render-parity pre-flight.** Simulate the FFmpeg graph and assert offsets/durations/stream-lengths before encoding; surface warnings. Harden the stitch with `aresample=async=1` + A/V parity assertions.
- **Deterministic + seedable.** Same seed ⇒ same edit (reproducible), different seed ⇒ a fresh valid variant. Already partially true; make it a guarantee across every generator.
- **Graceful degradation everywhere.** Missing beats, narration, smart data, or storyboard each have a defined neutral fallback so the engine always completes.

## 2. Infinite — it never runs out of variety or capability

- **Style DNA + declarative recipes.** Each output type/sub-style is a data recipe (pacing curve, transition palette, color mood, effect frequencies, caption style, aspect, audio policy) — not hardcoded logic. New styles are added as data, forever, without touching the engine. (OpenMontage `pipeline_defs` + FreeCut registry pattern.)
- **Procedural variation operators.** Seedable operators — clip-ordering modes (built), rhythm patterns, effect rotation, transition variation, grade variants — compose to yield infinite distinct cuts from the same inputs.
- **Interchangeable timing spines.** The engine accepts any spine: beat grid, narration phrase grid, storyboard shot grid, or a plain rhythm. One core, many drivers.
- **Growable component registries.** Effects, transitions, captions, titles, grades all live in registries that expand without engine changes (and can ingest Darkroom's `assets/registry.json`).

## 3. Irreplaceable — it does what nothing else can

- **Multi-spine fusion.** Simultaneously honor narration + beat + storyboard + smart-engine via the priority cascade — no other tool fuses these autonomously.
- **Autonomous content understanding.** `clipAnalyzer`/`clipIndexer` feed editorial rules (A/B-roll, shot-type-aware sequencing, emotion arcs, semantic B-roll). This is the moat.
- **Six first-class output types, one core.** All share the same render engine, validator, and interchange to Premiere/Darkroom.
- **Closed-loop self-critique.** The engine scores its own output (pacing, variety, sync, hook strength) and auto-revises — an edit that improves itself.

---

## 4. Viral Social styles to lock in (the "infinitely useful" few)

Each is a **recipe** in the social style library — once locked in, always available, infinitely reusable across any media:

1. **Hook · Retention · Payoff** (talking-head) — sub-1.5s hook, word-by-word kinetic captions, keyword-triggered B-roll inserts, payoff button. The universal short-form spine.
2. **Beat-cut montage ("edit")** — hard cuts on downbeats with zoom-punch + flash/RGB-split transitions. The classic IG/TikTok edit.
3. **Auto-reframe repurpose** — any 16:9 source (podcast/interview) → 9:16 with subject tracking + burned captions. Infinite leverage on long content.
4. **Kinetic quote / text-reveal** — typography over ambient B-roll/music; faceless-channel staple.
5. **List / Top-N** — numbered segments, on-screen counter, transition per item.
6. **Transformation / Before-After** — split-screen or wipe reveal synced to a beat drop.
7. **Perfect loop** — first/last frame matched for seamless replay.
8. **Trend template (CapCut-style)** — beat-mapped time-coded slots the user drops clips into.
9. **Split-attention retention** — primary content top, satisfying/gameplay B-roll bottom.
10. **Photo-motion story** — stills → Ken Burns + parallax + narration; faceless storytelling.

Aspect/safe-area presets (9:16, 1:1, 4:5), platform loudness targets, and loop-friendly endings are shared services all styles draw on.

---

## 5. Short Film pipeline (storyboard → finished scenes)

A dedicated narrative generator distinct from the montage generators:

1. **Storyboard ingest** — structured model: `Film → Scene[] → Shot[]`; each Shot = `{description, shotType, targetDuration, dialogue/action, camera, audioCue}`. Authored in-app or imported (JSON/markdown/CSV).
2. **Shotlist generation** — expand the storyboard into an ordered shotlist with target durations and required coverage per scene.
3. **Take ingest & matching** — assign recorded takes/clips to shots via slate/filename convention, manual pick, or AI shot-type/face match. Rank multiple takes by quality score.
4. **Optional audio sync (mic).** Align a separate mic recording to camera audio per take via waveform **cross-correlation**; offset the mic track to the take.
5. **Shot cutting** — trim each chosen take to its shot in/out (auto-drop clapper/dead air), honoring the storyboard duration.
6. **Scene assembly** — arrange cut shots in storyboard order into one scene; apply scene-level grade + audio bed.
7. **Repeat per scene**, then assemble scenes into the film with transitions/score.
8. **Finish/interchange** — render via the core, or export ICUNI Edit / FCPXML to Premiere for finishing.

---

## 6. What this means for the build (engine-first ordering)

1. **Generation contract: validator + auto-repair + pool-sufficiency guard** — the reliability backbone every generator runs through. *(foundation)*
2. **Style recipe registry + variation operators** — the infinity backbone; refactor the six types to declarative recipes. *(foundation)*
3. **Timing-spine abstraction** — one interface for beat/narration/storyboard/rhythm spines. *(foundation)*
4. **Social style library** (the 10 above) on top of the registry. *(capability)*
5. **Short-film storyboard→scene pipeline** + audio-sync module. *(capability)*
6. **Autonomy brain** — wire `clipAnalyzer`/`clipIndexer` into showreel/essay/short-film/social. *(capability)*
7. **Render-fidelity hardening + interchange** (FCPXML/EDL, Darkroom registry). *(quality + reach)*

See `GODLEVEL_INTEGRATION_ROADMAP.md` for the full cross-tool source map and phasing.
