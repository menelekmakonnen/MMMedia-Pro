# Branded Intro / Title Open
**Mode ID:** `branded_intro`  ·  **Family:** Intro / Titles
**Derived from edits:** AMOSA intro

Animated logo/title opener: kinetic text, gradient ramps, mirrored/kaleidoscopic motion, 3D card moves, track-matte reveals and drop shadows — a short branded sting to front any video.

**Best for:** Show/series intros, channel branding, segment openers.

## Canvas

1920x1080 (multi-cam-friendly) · 16:9 · 30 fps

## Pacing

4–12s total

Cut logic: **beat-synced reveals**. Short, punchy, lands on logo.

## Reframing

Method: AE.ADBE Geometry2 / Basic 3D moves

scale/rotate reveals into final lockup

## Effect stack

- `AE.ADBE Text` — animated title typography
- `AE.ADBE Ramp` — gradient backgrounds / sweeps
- `AE.ADBE Mirror` — kaleidoscopic / mirrored motion
- `AE.ADBE Basic 3D` — 3D card rotation
- `AE.ADBE Legacy Key Track Matte` — matte reveal of text/logo
- `AE.ADBE Drop Shadow` — depth on type
- `AE.ADBE Tint` — brand-color unify
- `AE.ADBE Geometry2` — transform moves

## Transitions

_Choose the transition that fits the moment; never default to a hard cut._

**Default:** matte reveal

Library: matte reveal, ramp/gradient wipe, 3D flip, dip-to-brand-color

Reveals are the transitions; land hard on the final logo lockup.

## Audio

- **music:** branded sting / riser
- **sfx:** whooshes + impact on logo land
- **dialogue:** none

## Color

- **approach:** brand palette enforced via Tint/ramps

## Titles & graphics

- **title:** primary animated typography
- **logo:** final lockup

## Toggles

`footage_behind_matte`, `riser_sfx`, `kaleidoscope`, `color_variant`

## Generator rules

1. Drive reveals off brand assets (logo, name, colors).
1. Sync reveal hits to sting/riser; land on logo lockup.
1. Keep total length short; enforce brand palette via tint/ramp.
