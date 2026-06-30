# Music Video — Cinematic
**Mode ID:** `music_video_cinematic`  ·  **Family:** Music / Performance
**Derived from edits:** Soldier Music Video - Wonu

Beat-cut performance/narrative music video with stylized looks — graded color, gaussian/lens blur, lens distortion, find-edges/invert treatments and masked composites, all on the beat.

**Best for:** Music videos, performance pieces, stylized brand films.

## Canvas

1920x1080 (4K source) · 16:9 · 25 fps

## Pacing

~60–100 cuts/min · avg clip 0.6–1.2s

Cut logic: **beat_sync**. 

## Reframing

Method: AE.ADBE Motion + Geometry · scale 100–150%

energetic punch-ins on hits

## Effect stack

- `AE.ADBE Lumetri` — cinematic grade / looks
- `AE.ADBE Gaussian Blur 2` — blur transitions / dream beats
- `AE.ADBE AEMask` — masked composites
- `AE.ADBE ProcAmp` — contrast/sat punch
- `PR.ADBE Lens Distortion` — lens warp stylization
- `AE.ADBE Find Edges` — stylized treatment
- `AE.ADBE Tint` — duotone moments
- `AE.ADBE Invert` — flash/negative hits

## Transitions

_Choose the transition that fits the moment; never default to a hard cut._

**Default:** blur dissolve on beat

Library: blur dissolve on beat, cross dissolve, lens-distortion whip, flash cut, match cut

Every transition lands on a beat; vary blur dissolves, whips and match cuts. Straight changes only when they fall on a hard hit.

## Audio

- **music:** master track drives everything
- **dialogue:** none
- **sync:** cut strictly to beat grid

## Color

- **approach:** strong cinematic looks, scene-specific
- **lumetri:** multiple graded looks

## Titles & graphics

- **lyrics:** optional kinetic
- **artist_tag:** intro/outro

## Toggles

`duotone_sections`, `negative_flashes`, `lyric_text`, `speed_ramps`

## Generator rules

1. Detect beat grid; place every cut/transition on a beat.
1. Rotate stylized looks per section (verse/chorus).
1. Use blur/whip transitions to ride energy; mask for composites.
