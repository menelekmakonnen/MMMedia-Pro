# Interview — Clean
**Mode ID:** `interview_clean`  ·  **Family:** Interview / Talking-Head
**Derived from edits:** DANIEL NYANYO, BLESS, Benedicta Gavor, Derrick, FREDRICK AMPOFO

Single-subject seated interview. Tightened with silence removal, kept invisible with soft seam transitions and motion-keyframe reframing so the conversation feels continuous, not chopped.

**Best for:** Long-form single-person interviews, founder/expert Q&A, podcast video.

## Canvas

1920x1080 · 16:9 · 29.97 fps

## Pacing

~8–18 cuts/min · avg clip 3.5–7.5s

Cut logic: **silence_removal**. Cut on dead air, breaths and filler; each seam should be covered by a reframe or soft transition.

## Reframing

Method: AE.ADBE Motion (scale+position keyframes) · scale 100–135%

Alternate wide <-> punch-in across consecutive sentences to disguise jump points; ease in/out 6-10 frames.

## Effect stack

- `AE.ADBE Motion` — reframe / punch-in

## Transitions

_Choose the transition that fits the moment; never default to a hard cut._

**Default:** seamless soft cut (2-4f dissolve)

Library: seamless soft cut (2-4f dissolve), reframe-covered cut, quick film dissolve on topic change

Use a reframe change on every silence-removal seam; on a topic/segment change use a short dissolve.

## Audio

- **dialogue:** primary, de-noised, leveled to ~-16 LUFS
- **music:** none or very low underscore
- **use_jl_cuts:** yes
- **note:** J/L cuts on every seam so audio carries across the visual change.

## Color

- **approach:** natural corrective grade, consistent skin tones
- **lumetri:** optional light contrast + warmth

## Titles & graphics

- **lower_thirds:** name + role on first appearance
- **captions:** optional

## Toggles

`broll_inserts`, `light_grade`, `lower_thirds`, `underscore_bed`

## Generator rules

1. Detect speech; remove silence/filler to set cut points.
1. On each cut, change framing (scale/position) rather than leaving an identical-frame jump.
1. Bridge audio across seams with short J/L overlaps.
1. Reserve dissolves for question/topic boundaries.
