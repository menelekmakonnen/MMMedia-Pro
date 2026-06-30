# MMMedia Pro — Generator Modes

Reusable editing-style templates ("Generator Modes") reverse-engineered from the Premiere
projects in `edit/`. Each mode captures a repeatable *look + pacing + effect recipe* so the
generator can rebuild that style from new footage.

Each mode ships as a machine-readable spec (`json/<id>.json`) and a readable writeup
(`modes/<id>.md`).

## Transition philosophy

Every mode favors **fitting transitions over hard cuts**. A hard cut is never the default —
each seam gets the transition that fits the moment (reframe-covered cut, soft dissolve,
blur/whip, match cut, graphic wipe, speed ramp). Hard straight cuts only survive when they
genuinely land better than any transition (e.g. on a hard musical hit).

## The modes

| # | Mode | Family | Aspect | Pace (cuts/min) | Derived from |
|---|------|--------|--------|-----------------|--------------|
| 1 | Interview — Clean | Interview | 16:9 | 8–18 | DANIEL NYANYO, BLESS, Benedicta Gavor, Derrick, FREDRICK AMPOFO |
| 2 | Interview — Dual Subject | Interview | 16:9 | 25–35 | AZASI AND DERRICK (+final) |
| 3 | Interview — Captioned (SRT) | Interview | 16:9 / 9:16 | 12–20 | FREDRICK SRT FILE |
| 4 | Interview — Blur Reveal | Interview | 16:9 | 10–18 | OWUSUAA INTERVIEW NEW |
| 5 | Interview — Music Bed | Interview | 16:9 | 2–8 | PARKER new |
| 6 | Talking-Head — Premium Explainer | Explainer | 16:9 | 22–30 | Cyber Security Regulation |
| 7 | Branded Intro / Title Open | Intro | 16:9 | sting (4–12s) | AMOSA intro |
| 8 | Music Video — Cinematic | Music | 16:9 | 60–100 | Soldier Music Video - Wonu |
| 9 | Social — Vertical Hyper-Cut | Social | 9:16 | 100–140 | dance |
| 10 | Social — Vertical Whip Vlog | Social | 9:16 | 25–45 | MorningWLK |
| 11 | Social — Vertical Short Punch | Social | 9:16 | 50–80 | ShaunaNN |
| 12 | Fitness — Exercise Demo | Instructional | 16:9 | 45–110 | BroganExercise (weights / without) |
| 13 | Cinematic Promo / Branded Story | Promo | 16:9 | 80–110 | Sara Chy - FINAL |

## The "AMOSA Interview" set

The 10 repeatable interview projects map onto modes 1–5 (the most-repeated, plain single-subject
edits collapse into **Interview — Clean**; the rest split out by their distinguishing trait —
dual subject, captions, blur reveal, music bed). Start any new interview from one of these five.

## Spec schema (json)

```
schema_version, mode_id, name, family, derived_from[], summary, best_for,
canvas{resolution, aspect, fps},
pacing{cuts_per_min|duration_sec, logic, avg_clip_sec, note},
source_layout{...},
reframe{method, scale_range_pct, pattern, purpose},
effect_stack[{match_name, role}],     # match_name = Premiere/AE effect identifier
transitions{philosophy, library[], default, notes},
color{...}, audio{...}, titles_graphics{...},
toggles[],                            # optional variant switches the generator can expose
generator_rules[]                     # ordered build steps for the generator
```

`effect_stack[].match_name` values are the real Premiere/After Effects effect identifiers
pulled from the source projects (e.g. `AE.ADBE Lumetri`, `AE.ADBE Gaussian Blur 2`,
`AE.ADBE Cross Dissolve New`), so they map directly back to applyable effects.

## How these were derived

Each `edit/*.xml` is a native Premiere project dump. They were parsed for sequence resolution,
frame rate, clip/transition counts, per-clip effect `MatchName`s, audio media, and timeline
duration to compute pacing (cuts/min) and the effect recipe behind each look.
