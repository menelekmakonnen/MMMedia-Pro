# Talking-Head — Premium Explainer
**Mode ID:** `talkinghead_premium`  ·  **Family:** Talking-Head / Explainer
**Derived from edits:** Cyber Security Regulation

Highly produced single-presenter explainer: cross-dissolves between beats, graded look, on-screen caption capsules, zoom-blur emphasis transitions, and B-roll/graphic inserts over a music bed.

**Best for:** Educational/explainer videos, thought-leadership, branded long-form.

## Canvas

1440x1080 or 1920x1080 · 4:3 source / 16:9 · 25 fps

## Pacing

~22–30 cuts/min · avg clip 2.0–3.5s

Cut logic: **silence_removal + broll_coverage**. 

## Reframing

Method: AE.ADBE Motion + AE.ADBE Geometry2 (Transform) · scale 100–140%

punch-ins on emphasis; transform for push/zoom moves

## Effect stack

- `AE.ADBE Motion` — reframe
- `AE.ADBE Lumetri` — color grade
- `AE.ADBE Capsule` — caption capsule lower-third / keyword pills
- `AE.ADBE Geometry2` — transform push/zoom
- `AE.ADBE Color Balance 2` — secondary color
- `AE.ADBE Brightness & Contrast 2` — pop

## Transitions

_Choose the transition that fits the moment; never default to a hard cut._

**Default:** AE.ADBE Cross Dissolve New

Library: AE.ADBE Cross Dissolve New, ZoomBlur (HitFilm) on emphasis, CineStyle look transition, seamless soft cut

Default to short cross-dissolves between talking beats; zoom-blur for energetic emphasis; cut straight to B-roll where it reads cleaner.

## Audio

- **dialogue:** primary, processed
- **music:** consistent bed (.m4a/.wav), ducked
- **use_jl_cuts:** yes

## Color

- **approach:** polished branded grade
- **lumetri:** contrast, color balance, brightness/contrast pop

## Titles & graphics

- **captions:** capsule-styled keyword callouts
- **lower_thirds:** branded
- **graphics:** explainer motion graphics

## Toggles

`zoom_blur_emphasis`, `keyword_capsules`, `broll_graphics`, `branded_lowerthirds`

## Generator rules

1. Cross-dissolve between presenter beats by default; reserve straight changes for B-roll entry.
1. Surface keywords as capsule callouts synced to speech.
1. Insert topic B-roll/graphics generously; grade everything to one look.
1. Use zoom-blur transitions sparingly for emphasis.
