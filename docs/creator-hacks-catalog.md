# Premiere MD — Creator Editing Hacks Catalog

Techniques mined from 83 "Premiere MD" social-media editing tutorials, structured for porting into MMMedia Pro. Each entry condenses the real method (skits ignored) with parameter values, effect names, and shortcuts preserved.

## Summary

83 source files. 76 carry a concrete technique; 7 are pure skit / sponsor-only / opinion with no portable method (see "Non-techniques" at the end).

### Count per Category

| Category | Count |
|---|---|
| KEYBINDING | 11 |
| TOOL | 17 |
| EFFECT-PRESET | 14 |
| WORKFLOW | 15 |
| AUDIO | 7 |
| COLOR | 3 |
| EXTERNAL | 16 |
| (Non-technique skits) | 7 |

### Count per Portability

| Portability | Count |
|---|---|
| HIGH | 41 |
| MEDIUM | 16 |
| LOW | 19 |

---

## KEYBINDING

| Technique | What it achieves | Method | Portability | Source file |
|---|---|---|---|---|
| Rate Stretch Tool shortcut | Drag-to-retime clips without the speed dialog | Press **R** (or pick from toolbar); drag clip longer to slow down, shorter to speed up; works on audio too (whooshes). Watch frame rate when slowing. | HIGH | C6yoHeZOEa5.txt |
| Tilde / Ctrl+Tilde full screen | Maximize a panel or go true full-screen | Press **~** to fill screen with the selected panel; **Ctrl+~** removes the whole UI for true full-screen. Also a top-right icon. | HIGH | Cy0zzmTuL5G.txt |
| Snapping toggle (S) | Toggle clip/playhead snapping on the timeline | Click the magnet icon near the timeline or press **S** to toggle snapping; off = precise free movement, on = snaps to clips/points. | HIGH | CyV5aymOw2Q.txt |
| Rolling Edit Tool (N) | Move a cut point between two clips without changing total duration | Press **N** (or toolbar); hover an edit point and drag left/right — one clip extends as the adjacent shortens. | HIGH | DW9FCS3ETxA.txt |
| Add Edit hotkey (remap to C) | Cut at playhead without the razor tool | Keyboard Shortcuts -> search **Add Edit**, change default Cmd/Ctrl+K to **C**; also set **Add Edit to All Tracks** to **Shift+C** to cut every track at the playhead. | HIGH | DWrJ53jEQw2.txt |
| JKL(N) navigation | Scrub/shuttle the timeline at variable speed | **L** = play/fast-forward (repeat presses accelerate), **J** = same in reverse, **K** = pause/play. Great for podcast/interview review. | HIGH | DX625A0xDT8.txt |
| Audio gain via brackets | Adjust clip gain fast from the keyboard | Select audio clip; press **[** / **]** to change gain by 1 dB; **Shift+[ / Shift+]** for 5 dB steps. | HIGH | DYM3BxjxB_O.txt |
| Minimize/Expand all tracks | Collapse or grow all video+audio track heights at once | Wrench icon -> minimize/expand-all-tracks buttons; default **Shift+ (-)** to minimize, **Shift+ (+)** to expand (remappable). | HIGH | DYXKNGBxZcs.txt |
| Enable/Disable clip (hotkey it) | Toggle a clip invisible without deleting it | Right-click clip -> **Enable** to toggle visibility; hotkey it in Keyboard Shortcuts to A/B two stacked clips instantly. | HIGH | Cyn6kHyOa2Z.txt |
| Paste Attributes (Opt/Alt+Cmd+V) | Copy a stack of effects from one clip to another | **Cmd+C** the source clip, then **Opt+Cmd+V** on target -> Paste Attributes dialog (motion, opacity, video/audio effects). Remappable. | HIGH | CyvqH8JLnlJ.txt |
| Copy frame to clipboard (Arrow plugin) | Paste current frame anywhere / paste web images into timeline | Hotkey copies the current frame to clipboard for Docs/Slack; right-click any web image -> Copy Image, then Overwrite into timeline. (Arrow plugin -- see EXTERNAL.) | LOW | DYSAhphRywe.txt |

---

## TOOL

| Technique | What it achieves | Method | Portability | Source file |
|---|---|---|---|---|
| Auto-Reframe Sequence | Batch-convert horizontal footage to vertical with tracking | In a 9x16 timeline: Sequence -> **Auto-Reframe Sequence**; set aspect ratio + motion tracking (leave Default for natural), keep **Don't Nest Clips**. Auto-tracks subject; manual cleanup sometimes needed. | MEDIUM | C11-9VmrniC.txt |
| Track Mask (mask tracker) | Auto-track a mask across frames instead of keyframing each | After making a mask, use the play-button arrows by the mask path: left arrows track backward, right track forward, end buttons step one frame. For blur/color/power-windows. | HIGH | C7O9kUnuwvZ.txt |
| Object Masking / roto tool | One-click subject roto inside the editor (no After Effects) | Duplicate clip (Alt+drag up); pick a clear frame; select **Object Masking** tool; hover -> auto-detects subject, click to select (click more parts to add); track with the middle (both-directions) arrow; assign mask to a property (e.g. drag to Opacity to put text behind subject). | MEDIUM | DX__7q1RcGP.txt |
| Show only keyframed properties | Filter Effect Controls to just animated params | Click the funnel icon (bottom-right of Effect Controls) -> **Show Only Keyframed Properties**. | HIGH | Cz89s7YrtzR.txt |
| Toggle Direct Manipulation | Grab/transform or crop the clip directly in the program monitor | Program-monitor icon toggles between **Transform** (move/scale handles) and **Crop** handles on the clip itself. | HIGH | DXEzdB5ke1h.txt |
| Crop in program monitor | Crop a clip with on-screen handles, not sliders | Bottom-left program-monitor dropdown -> **Crop**; drag top/bottom/left/right handles, updates live. Bind a hotkey to toggle. | HIGH | DZsIesVR4An.txt |
| Scene Edit Detection | Auto-cut a single clip into its constituent shots | Right-click clip -> **Scene Edit Detection**; adds edits wherever the shot changes. Great for downloaded/no-original footage. | MEDIUM | CzT0E40rmzV.txt |
| Un-nest via Insert/Overwrite-as-nests toggle | Bring a nested sequence in as individual clips | Toggle off the **Insert and Overwrite sequences as nests or individual clips** button (top-left of timeline); re-drag the nested sequence and it expands into its component clips. | HIGH | DWy3csokV_H.txt |
| Pancake / stacked timelines | Reference multiple timelines at once for selects | Drag a timeline tab onto the timeline area; drop it (commonly above the active one). Raw footage on top, selects on bottom = non-destructive selects workflow. | MEDIUM | DZC2HoqRyX_.txt |
| Stack Timelines (DaVinci viewer) | View multiple timelines without the media pool | Edit page -> timeline-view-options icon (middle-left) -> **Stack Timelines**; add timelines; top arrow switches between them. | LOW | C8Ue2F-O6fy.txt |
| Select Label Group | Select every clip sharing a label color at once | Right-click clip -> Label -> **Select Label Group** (top of submenu) selects all clips of that color. Bind to a hotkey. | HIGH | DYj_13RFsmZ.txt |
| Select All Matching | Select every instance of the same source clip | Edit menu -> **Select All Matching** selects every instance of that exact source across the timeline. Bind to a hotkey. | HIGH | DaDa7NZxK2C.txt |
| Show Audio Time Units | Zoom timeline finer than frames (to audio samples) | Right-click the timeline time display -> **Show Audio Time Units** (switches to samples). Sequence Settings -> Audio can change display to milliseconds. | MEDIUM | DZfZRL2RRBL.txt |
| Metadata display cleanup | Hide clutter columns in the project panel | Right-click project panel -> **Metadata Display**; check/uncheck which fields show. | HIGH | Czl1DP1LpG6.txt |
| Custom label colors | Rename and recolor the project's label palette | Settings -> **Labels**; edit each default color's name and color value. | HIGH | CzY8yoBryCY.txt |
| In/Out points to measure length | Read the exact duration of a selection | Mark **I** and **O** on timeline (or source monitor); program monitor shows timeline timecode bottom-left and the selected-section duration in grey bottom-right. | HIGH | Cx5lfmNLrJH.txt |
| Generative Extend (tool) | AI-extend a clip's tail (best for audio room tone) | Toolbar -> **Generative Extend** tool; drag the clip tail out; it generates up to ~10s (best for room tone/ambience; flags AI section). | LOW | DZ5Mdu0uqlC.txt |

---

## EFFECT-PRESET

| Technique | What it achieves | Method | Portability | Source file |
|---|---|---|---|---|
| Corner Pin screen replacement | Replace a screen (TV/phone/monitor) in footage | Match scale of replacement to the screen, apply **Corner Pin**, drag the four corner circles to the screen corners (or use X/Y values). Best on static shots; moving shots need hand-tracking. | HIGH | C1kBXBkLuyE.txt |
| Tint logo recolor | Recolor a PNG logo without Photoshop | Effects -> **Tint** on the logo; map the white/black values to your target colors. Also works on footage for stylized looks. | HIGH | C66P7Y0uz6s.txt |
| Censor (Mosaic / Gaussian Blur) | Pixelate or blur a face/logo and track it | Apply **Mosaic** (raise horizontal/vertical block amounts), mask the subject, add slight feather, then track-select-forward to follow it; **Gaussian Blur** for a softer look. | HIGH | C7EwEZxumwI.txt |
| Light bloom (Luma Key + Gaussian) | Glow on highlights only | Duplicate clip (Alt+drag up); **Luma Key** on top, disable bottom, tune threshold/cutoff to isolate highlights; add **Gaussian Blur** to the top clip; re-enable bottom and refine. | HIGH | Cydma1eO33N.txt |
| Horizontal Flip continuity fix | Mirror a shot to fix screen direction/continuity | Effects -> **Horizontal Flip** on the clip; mirrors movement L<->R. Watch for backwards text (signs/clothing). | HIGH | CyQwmYcOy_6.txt |
| Smooth Zoom (Transform + motion blur) | Buttery keyframed zooms, savable as preset | **Transform** effect; set **Shutter Angle 180** (motion blur); keyframe Scale + Position start->end; first keyframe **Temporal Interpolation -> Ease Out**, second **Ease In**. Right-click -> **Save as Preset** ("Smooth Zoom"). | HIGH | DXo3q8XEVjM.txt |
| Long Shadow text effect | Stylized 3D/streaky text shadow | Effects -> **Long Shadow** on text; tune Angle (direction), Length (3D depth), Colorize, Duo Color (gradient), Alpha Falloff (0% = thick, raise for streaky). Keyframeable. | HIGH | DW34PgzkVJM.txt |
| Logo Cutout effect | Cut a logo off its background in-editor | Effects -> **Logo Cutout** on clip; if auto fails set detection to **Manual**, Mode = Unmold Light (bright bg) / Unmold Dark (dark bg); dial Threshold, Feather, Choke Mask. | MEDIUM | DY7N-PxxZtB.txt |
| See-through screen effect | Stylized translucent screen-recording look | Flip Horizontal; opacity ~70%; **Lens Distortion** (fill alpha off, adjust curvature); **Chromatic Aberration** R=5/G=0/B=2; **VR Glow** luma 0.4, radius 273, brightness 1.4, saturation 1.8; **Camera Blur** ~3 masked to edges only; optional scale keyframe to "move through" it. | MEDIUM | DXb_8YHgHpr.txt |
| Vertical-in-horizontal blur preset | Blurred scaled background for vertical clip in 16x9 | Duplicate vertical clip on top; **Transform** on bottom, scale to fill; **Gaussian Blur** on same; Ctrl/Cmd-select both effects -> right-click **Save Preset** to combine into one reusable effect. | HIGH | DYpGBMexmlD.txt |
| Blanking Fill (DaVinci) | Auto blurred fill for vertical clip in horizontal timeline | Edit page Effects -> OpenFX -> search **Blanking Fill**, apply; Inspector -> Zoom Mode = **Zoom to Timeline**; adjust blend edges, blur, fade; optional drop shadow. | LOW | C8FCk6rueA2.txt |
| Frame Blending motion blur | Smooth out a sped-up time-lapse | Rate-stretch the clip to length; right-click -> Speed/Duration; Time Interpolation = **Frame Blending**; OK and render. | MEDIUM | C7oslF8urjs.txt |
| Motion Tween transition | Animate position/scale/rotation between two states without keyframes | Cut the clip; reposition/rescale/rotate the second half; drag **Motion Tween** (Video Transitions) onto the cut; tune ease/overshoot/bounce in transition controls; reposition recalculates automatically. | HIGH | DZU2QMQRTc7.txt |
| Audio ring-out (Studio Reverb) | Make audio trail off with reverb tail | Alt-click waveform to add keyframes fading volume to 0 at the ring point; add **Studio Reverb**, raise Decay + Room Size. For short SFX, duplicate the clip a few times (vol 0), nest, and apply reverb to the nest. Save as preset. | MEDIUM | DXt_o_uEeCR.txt |

---

## WORKFLOW

| Technique | What it achieves | Method | Portability | Source file |
|---|---|---|---|---|
| Project template (in-app) | Reuse a bin/folder structure for every new project | Make a project "Project Template" with all your bins; save it; Home -> New Project -> Project Template dropdown -> Add Template -> pick the saved project -> Save. New projects spawn with all bins. | MEDIUM | C8KL-1IO7GL.txt |
| Template folder structure | Standardized on-disk folder layout per project | Root -> Assets (Footage/Audio/Graphics), Edits (program files), Exports (versions + final deliverables). Duplicate the template per new project; mirror it inside the Premiere project too. | HIGH | CyLmcnDrgmN.txt |
| Workspaces save/reset | Recover or save a custom panel layout | Cycle Workspaces dropdown to find your layout; add panels via Window; **Save as New Workspace**; if windows drift, Window -> **Reset to Saved Layout**. | HIGH | C7edlXoO3Wy.txt |
| Client watermark + timecode | Anti-theft overlay + on-screen timecode for client reviews | Type tool: project name + version, simple font, black bg @ 50%, bottom-center. Add Transparent Video (project panel sticky-note icon), drag above everything, apply **Timecode** effect: source = Generate, uncheck field symbol, match sequence frame rate; keep it inset so it can't be cropped out. | HIGH | Cx-usEyum-T.txt |
| Safe Margins overlay | Keep titles/action from being cropped on social | Right-click program monitor -> **Safe Margins**; outer = Action Safe, inner = Title Safe. | HIGH | CxsseIMuj86.txt |
| Transparent video export | Export video with alpha like a PNG | Export -> Format = **QuickTime**, Preset = **Apple ProRes 4444 with alpha** -> produces an MOV with transparency. For logo/text animations or cutouts. | MEDIUM | CzG5YP8Okkb.txt |
| Color space fix for iPhone HDR | Stop iPhone HDR footage looking washed/wrong | Sequence -> Sequence Settings -> Color -> set working color space to **Rec. 709**. | HIGH | C1uUQYTrGUC.txt |
| Auto-transcribe clips | Transcribe clips automatically on import | Settings -> Transcription -> **Automatically Transcribe Clips** (all clips or timeline-only). Speeds caption/text-based work. | MEDIUM | CzwIhFML4IY.txt |
| Text-based editing | Edit the timeline by deleting transcript text | Window -> Text -> Transcribe; select a sentence and Backspace to remove it from the timeline; the three-dot markers are dead spaces -- delete to remove pauses. | MEDIUM | DY2Cucvx8U-.txt |
| Disable audio scrubbing | Stop the scrub sound while navigating | Settings -> Audio -> turn off **Play Audio While Scrubbing**. | HIGH | CyD3DbIuU7g.txt |
| Global FX Mute | Kill all effects at once to fix laggy playback | Add the **Global FX Mute** button to the program monitor (via the + button editor); click to disable all sequence effects temporarily, click again to restore. | HIGH | DXPGox5kaP0.txt |
| Project Manager consolidate | Collect/consolidate all project assets to hand off | File -> **Project Manager**; pick sequences -> **Collect Files to New Location**; set destination; **Calculate** for size; check **Exclude Unused Clips** to trim. | MEDIUM | DZIFEwHuHuN.txt |
| Second-monitor playback | Show the program monitor full-screen on another display/TV | Settings -> Playback -> choose the video stream / Monitor 2 for full-frame program-monitor output. | MEDIUM | CzL9xAPLWlA.txt |
| DaVinci custom hotkeys | Set up beginner-friendly DaVinci shortcuts | DaVinci Resolve -> Keyboard Customization: Split Clip = **C**, Ripple end-to-playhead = **W**, start-to-playhead = **Q**, plus timeline zoom in/out. Delete conflicting bindings first. | LOW | C7wbOzCOSHY.txt |
| Auto-Reframe Sequence (cross-ref) | Batch horizontal->vertical (see TOOL) | Sequence -> Auto-Reframe Sequence. | MEDIUM | C11-9VmrniC.txt |

---

## AUDIO

| Technique | What it achieves | Method | Portability | Source file |
|---|---|---|---|---|
| Enhanced Speech (AI cleanup) | Rescue bad/windy on-camera audio | Essential Sound panel (Window) -> assign clip to **Dialogue** -> click **Enhance Speech**; AI cleans the clip. Adjust mix amount to reduce robotic artifacts. | MEDIUM | C6_eL41uBHc.txt |
| Hard Limiter on master | Stop audio peaking across the whole mix | Open Audio Track Mixer (Window); on the **Master** track dropdown -> **Amplitude and Compression -> Hard Limiter**; reduces anything above threshold. | HIGH | Cxx2g1UOmeV.txt |
| Audio gain via brackets (cross-ref) | Fast gain change | Brackets +/-1 dB, Shift+brackets +/-5 dB. | HIGH | DYM3BxjxB_O.txt |
| Audio ring-out (cross-ref) | Reverb-tail trail off | Studio Reverb tail; nest short SFX. | MEDIUM | DXt_o_uEeCR.txt |
| Generative Extend for room tone | Generate ambience/room tone | Generative Extend tool, drag tail; best for room tone. | LOW | DZ5Mdu0uqlC.txt |
| Rate Stretch on SFX (cross-ref) | Retime repetitive whooshes/SFX | R tool drag on audio clips. | HIGH | C6yoHeZOEa5.txt |
| Wilhelm scream lore (raw SFX) | History/source of a famous stock scream | No method -- informational (origin: 1951 Distant Drums, named after Pvt. Wilhelm in 1953). Provides the raw clip. | LOW | CzeGsblp-dB.txt |

---

## COLOR

| Technique | What it achieves | Method | Portability | Source file |
|---|---|---|---|---|
| Hue/Saturation Curves recolor | Change the color of an object in-shot | Lumetri -> Curves -> **Hue Saturation Curves**; eyedropper the color in **Hue vs Hue**, drag the middle dot up/down to shift it. Mask around oranges (skin) to avoid funky tones. | HIGH | C1pJBeyLAgD.txt |
| Color space fix (cross-ref) | iPhone HDR -> Rec.709 | Sequence Settings -> Color -> Rec.709. | HIGH | C1uUQYTrGUC.txt |
| Track-mask power windows (cross-ref) | Tracked masks for local color | Mask + auto-track for power windows / local grades. | HIGH | C7O9kUnuwvZ.txt |

---

## EXTERNAL (third-party plugin / website / hardware / sponsor)

| Technique | What it achieves | Method / Dependency | Portability | Source file |
|---|---|---|---|---|
| Make Big Films free VFX | Free explosions/fire/smoke/muzzle/blood/sparks | Account on **MakeBigFilms.com** -> Free Effects tab -> Get This Effect -> download. | LOW | C2AUN7NOD9r.txt |
| Alibi Music | Hollywood-grade music library + Premiere extension | **Alibi Music** library/extension; stems + 30/15/5s versions; listen/download in-timeline. (Sponsor.) | LOW | C9NHq_uuZxQ.txt |
| Alibi Music (sponsor read 2) | Same as above (longer sponsor read) | **Alibi Music** -- sponsor read, no new method. | LOW | Cy59JDrulVt.txt |
| Film Crux free SFX | 1000+ cinematic SFX (hits/risers/whooshes) | **FilmCrux.com** -> Film Crux Plus -> account -> code **BROS** for 1 free month -> download packs -> cancel. | LOW | CyixWuIx_Q1.txt |
| Soundly Place It plugin | Make SFX sit in a scene (speaker/space/wall) | Free **Soundly Place It** plugin (getsoundly.com -> Tools); Manage Audio Plugins -> Scan; apply Place It; tune Speaker, Space, Wall. | LOW | Cz314y-LauQ.txt |
| Soundly (search-and-drag SFX) | 250k+ SFX, drag-and-drop into editor | **Soundly** plugin (getsoundly.com); code **bros** = 3 months free; set audio storage folder. (Sponsor.) | LOW | DYw8G60Rzq3.txt |
| Saber plugin (lightsabers) | Glowing lightsaber/energy in After Effects | **Video Copilot Saber** (free); new Solid -> Saber, transparent composite; keyframe Core Start/End, Core Size, Roundness, Offset 0->100%; roto subject for behind-effect. | LOW | Czq_AlzLhlH.txt |
| Film Impact dashboard | Built-in Premiere text/graphic animation presets | **Film Impact dashboard** (Window -> Extensions); apply animation/text presets; type = Overshoot/Bounce/Bezier; typewriter text effect. | LOW | DXJ9B9JEf6v.txt |
| AutoCut | AI silence/podcast/caption auto-cutting | **AutoCut** extension (Window -> Extensions): AutoCut Silences (validate sections, noise threshold/pacing, cut+delete), AutoCut Podcast, Repeat, Captions, Resize. (Sponsor, 14-day trial.) | LOW | DXzKB_ERMLl.txt |
| MX Master 3S + LogiOptions+ | Programmable mouse buttons for edit hotkeys | **Logitech MX Master 3S** + **LogiOptions+**; map side buttons to zoom in/out, top button to delete, sideways wheel to horizontal scroll; per-app profiles. | LOW | DXhIW_wkW5p.txt |
| Cinecom Handheld preset | Free fake-handheld motion preset | **Cinecom handheld preset** (free / $9 commercial); import presets via Effects hamburger; wide->telephoto, normal/extreme motion; great on graphics too. | LOW | DYFLaxdRaOM.txt |
| Arrow plugin | Copy frames to clipboard / paste web images in | **Arrow** (Knights of the Editing Table, knightsoftheeditingtable.com); copy current frame; right-click web image -> Copy -> Overwrite into timeline. | LOW | DYSAhphRywe.txt |
| Premiere Composer (Mr. Horse) | Drop-in timers/counters/graphics | **Mr. Horse Premiere Composer** (paid); Product Manager -> Timers and Counters; Window -> Extensions -> Premiere Composer; many timer/counter styles. | LOW | DYe4W1uxNkE.txt |
| Portal plugin | Quick-launch favorite folders from Premiere | **Portal** (Knights of the Editing Table, free); Window -> Extensions -> Portal; drag folders in -> tabs that open Finder to that folder. | LOW | DZNOoIYOMSF.txt |
| Dagger + Spellbook plugins | Search-and-apply any effect via a command palette | **Dagger** (Knights of the Editing Table, free) + **Spellbook** hotkey manager; bind Dagger (e.g. Shift+Space); type effect name -> Enter to apply to clip. | LOW | DZxSFKUhrPc.txt |
| Mocha planar tracking | Planar track / convert tracks to AE data or masks | **Mocha** (in After Effects): apply Mocha, spline-select, track fwd/back; export Transform to a Null to parent assets; or "Create AE Masks" to convert Mocha mask into an AE mask. | LOW | DZ-SJOpRjwo.txt, DZaGJrORCrn.txt |
| ChatGPT-generated AE scripts | Generate JSX scripts to automate AE busywork | Ask **ChatGPT** for a downloadable AE .jsx (e.g. 5x5 grid of precomps, or batch font/hex changes); File -> Scripts -> Run Script. | LOW | DZm-7aWRqCs.txt, DaLROWHuSBL.txt |

---

## Non-techniques (skit / sponsor / opinion only)

| File | Nature | Salvageable mention |
|---|---|---|
| DLU47kWOTuS.txt | Narrative episode | Names generative extend, AI search, proxies, smooth zooms, 3-point editing (all covered elsewhere). |
| DWmDzWfDno2.txt | Narrative episode | Mentions autosave/backup project files, the **Loop button**, and beta "bio-masking" -- no how-to. |
| DYip6_POVsD.txt | Storage skit | Name-drops Samsung T7 4TB, SanDisk, Western Digital -- hardware, no method. |
| DaG2DrnuDun.txt | Pure skit | None. |
| DXW1TKyEdLV.txt | Opinion (Kiss/Marry/Kill of NLEs) | None. |
| CzeGsblp-dB.txt | Wilhelm scream lore | Listed in AUDIO for completeness; informational only. |
| (DZ-SJOpRjwo / DZaGJrORCrn) | Mocha tutorials | Real method, kept in EXTERNAL (external dependency). |
