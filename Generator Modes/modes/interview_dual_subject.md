# Interview — Dual Subject
**Mode ID:** `interview_dual_subject`  ·  **Family:** Interview / Talking-Head
**Derived from edits:** AZASI AND DERRICK, AZASI AND DERRICK final

Two-person conversation cut at a high tempo, bouncing between speakers with reframes so a single or dual source reads as a multi-cam shoot.

**Best for:** Two-guest interviews, host+guest, debate/dialogue.

## Canvas

1920x1080 · 16:9 · 29.97 fps

## Pacing

~25–35 cuts/min · avg clip 1.5–3.0s

Cut logic: **speaker_change + silence_removal**. Cut to whoever is speaking; add reaction shots of the listener.

## Reframing

Method: AE.ADBE Motion (crop+scale to isolate each speaker from a wide) · scale 100–160%

Speaker A single / Speaker B single / occasional two-shot for emphasis.

## Effect stack

- `AE.ADBE Motion` — isolate speaker / reaction reframe

## Transitions

_Choose the transition that fits the moment; never default to a hard cut._

**Default:** reframe-covered cut

Library: reframe-covered cut, seamless soft cut, short dissolve on topic change

Speaker-to-speaker changes are covered by the framing change; soften with 2-3f dissolve where motion is jarring.

## Audio

- **dialogue:** both mics, balanced; duck cross-talk
- **music:** low underscore optional
- **use_jl_cuts:** yes
- **note:** Lead picture changes with audio using L-cuts for natural back-and-forth.

## Color

- **approach:** match both subjects to one look
- **lumetri:** shot-matching priority

## Titles & graphics

- **lower_thirds:** name+role for each speaker on first line
- **captions:** optional

## Toggles

`reaction_shots`, `two_shot_emphasis`, `captions`, `underscore_bed`

## Generator rules

1. Diarize speakers; assign picture to the active speaker.
1. Cut in listener reactions on emphatic lines.
1. Cover every speaker switch with a distinct frame, not an identical jump.
1. Match grade across the two subjects.
