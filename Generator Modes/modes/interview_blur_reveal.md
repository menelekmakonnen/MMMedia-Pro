# Interview — Blur Reveal
**Mode ID:** `interview_blur_reveal`  ·  **Family:** Interview / Talking-Head
**Derived from edits:** OWUSUAA INTERVIEW NEW

Interview with masked background defocus and reveal framing — blur the surroundings to isolate the subject, then rack focus / reveal for emphasis.

**Best for:** Stylized portrait interviews, emotional or premium tone.

## Canvas

1920x1080 · 16:9 · 29.97 fps

## Pacing

~10–18 cuts/min · avg clip 3.0–6.0s

Cut logic: **silence_removal**. 

## Reframing

Method: AE.ADBE Motion · scale 100–130%

punch-ins paired with focus shifts

## Effect stack

- `AE.ADBE AEMask` — isolate subject from background
- `AE.ADBE Gaussian Blur 2` — background defocus / reveal
- `AE.ADBE Opacity` — reveal / blend layers
- `AE.ADBE Motion` — reframe

## Transitions

_Choose the transition that fits the moment; never default to a hard cut._

**Default:** focus-pull (blur) transition

Library: focus-pull (blur) transition, soft dissolve, reframe-covered cut

Use the blur itself as the transition between beats; dissolve on topic changes.

## Audio

- **dialogue:** primary
- **music:** low emotive bed common
- **use_jl_cuts:** yes

## Color

- **approach:** slightly cinematic, lifted blacks optional
- **lumetri:** soft contrast + subtle warmth

## Titles & graphics

- **lower_thirds:** name+role
- **captions:** optional

## Toggles

`focus_pull_transitions`, `vignette`, `emotive_bed`, `captions`

## Generator rules

1. Mask subject; apply graded background blur for separation.
1. Use blur ramps as transitions on emphasis beats.
1. Keep mask tracking clean on subject motion.
