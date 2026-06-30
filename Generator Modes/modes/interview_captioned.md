# Interview — Captioned (SRT)
**Mode ID:** `interview_captioned`  ·  **Family:** Interview / Talking-Head
**Derived from edits:** FREDRICK SRT FILE, FREDRICK AMPOFO

Clean interview with burned-in, styled captions driven from an SRT — built for silent-autoplay feeds while staying a polished talking-head edit.

**Best for:** Social-distributed interview clips, accessibility-first uploads.

## Canvas

1920x1080 (or 1080x1920 export) · 16:9 / 9:16 · 29.97 fps

## Pacing

~12–20 cuts/min · avg clip 3.0–6.0s

Cut logic: **silence_removal**. 

## Reframing

Method: AE.ADBE Motion · scale 100–130%

Punch-ins on key phrases; keep subject clear of caption safe-area.

## Effect stack

- `AE.ADBE Motion` — reframe
- `SRT` — captions

## Transitions

_Choose the transition that fits the moment; never default to a hard cut._

**Default:** seamless soft cut

Library: seamless soft cut, reframe-covered cut, short dissolve on topic change

Keep transitions subtle so captions remain readable; no flashy wipes over text.

## Audio

- **dialogue:** primary, leveled
- **music:** optional low bed
- **use_jl_cuts:** yes

## Color

- **approach:** natural grade
- **lumetri:** light contrast

## Titles & graphics

- **captions:** REQUIRED — SRT-driven, styled, animated in
- **lower_thirds:** optional

## Toggles

`word_level_highlight`, `vertical_export`, `emoji_keywords`, `underscore_bed`

## Generator rules

1. Ingest/auto-generate SRT; render styled captions in safe area.
1. Sync caption appearance to speech; optionally highlight active word.
1. Keep reframes from colliding with caption zone.
1. Prefer subtle seams so text stays legible.
