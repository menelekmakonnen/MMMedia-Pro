# Sequence Page → Full NLE — Integration Notes

This pass took the partially-built NLE in `src/features/SequenceView` from a
non-rendering shell to a working, wired-up editor, and added the Upload sub-tab
and one-click Edit-Generator presets the product brief called for. It was
informed by studying the reference editors in `D:\ICUNI Group\Non_ICUNI`
(freecut, omniclip, shotcut, openshot, libopenshot) plus the non-video apps
(Electrokit, GStack, SuperPowers, GAS-Engine) for engineering patterns.

## What was already there (prior session)
- Modular timeline components (`timeline/TimelineCanvas`, `TimelineTrack`,
  `TimelineClip`, `TimelineRuler`, `TimelinePlayhead`, `TimelineMarkers`).
- A complete, undoable **action library** (`actions/`): split, trim, ripple/roll,
  slip/slide, rate-stretch, ripple-delete, lift, copy/paste/cut/duplicate,
  enable/disable, **nest / unnest subsequences**, track CRUD, move-clip-to-track.
- `AudioMixer`, `EffectsBrowser`, `ScopePanel`, `KeyboardShortcutsOverlay`.
- Canonical `store/timelineStore.ts` (string-id tracks, prerender/proxy hooks,
  in/out, markers, JKL) and a numeric-id local stub the components actually use.
- Shared `components/ContextMenu.tsx` hook (submenus) and `SequenceLayout`
  sub-tab shell (Media | Edit | Mix | Effects | Scopes).

## What this pass fixed / added
1. **Timeline now renders.** The components read `timeline/useTimelineStore`,
   whose `tracks` array was empty and never populated. Added
   `hooks/useDeriveTracks.ts` which derives a track per `clip.track` value (plus
   canonical V1/A1/A2) and keeps it in sync — never removing user-added or
   reordered tracks. Added `setTracks` to the stub store.
2. **Fixed the double-gutter.** `TimelineCanvas` rendered a 200px `TrackControls`
   column *and* each `TimelineTrack`'s own 200px header, misaligned with the
   ruler. Removed the standalone column; Add-Track (video/audio) buttons now
   live in the ruler's left header. Playhead/markers are offset by the 200px
   header width so they align with clip positions.
3. **Unified selection.** Clicking/right-clicking a clip now mirrors the
   timeline-store selection into `clipStore.selectedClipIds`, so the action
   library and the Inspector both see the same selection.
4. **Right-click context menus** (`menus/contextMenus.tsx`):
   - Clip: Split at playhead, Cut/Copy/Paste/Duplicate, Speed presets + Reverse,
     Move to Track, Enable/Disable, Nest/Unnest Subsequence, Ripple/Lift delete.
   - Track header: add/remove/reorder, lock/hide/mute, height presets.
5. **Upload sub-tab.** `SequenceLayout` gained an **Upload** tab that renders the
   full `MediaManagerTab` import page (per the brief: "works just like the import
   page"). `SequenceSubTab` extended with `'upload'`.
6. **Edit-Generator presets** (`lib/nlePresets.ts` + `EditEngine/NleQuickPresets.tsx`):
   one-click, undoable looks over the live timeline — Auto Crossfades, Punch-In
   Zoom, Teal & Orange grade, Cinematic Bars, Film Texture, Speed Ramp, Hard
   Cuts, Clear Looks. Shown as a strip on the Edit Generator home.

## Engineering lessons applied
- **Command-pattern undo/redo** (Electrokit/freecut): every new mutation —
  context-menu actions and presets — goes through `createSetClipsCommand` +
  `historyStore`, so all of it is a single Ctrl+Z step.
- **Derive-don't-duplicate** track model (libopenshot/openshot): tracks are
  derived from clip data and merged additively, preserving user intent.

## Session 2 — additional features (all build-green)
7. **Drag-to-move clips** (`TimelineClip`): pointer-drag the clip body to move it
   along time and **across tracks** (resolved via `data-track-id`/`data-track-type`
   on lanes; same-type only). Single undo step via `createSetClipsCommand`.
8. **Snapping engine** wired (`useSnapCalculator`): drag + both trim edges snap to
   clip edges, playhead, markers, and in/out points when snap is on.
9. **Stub timeline store enhanced** (`timeline/useTimelineStore`): `setTracks`,
   `playbackRate`, `prerenderEnabled`, `prerenderCache`, `requestPrerender`.
10. **Pre-render / proxy ruler bar**: a Zap toggle in the track header turns on
    proxy generation for visible video clips; a status strip under the ruler shows
    green (cached) / amber (rendering) per clip. Calls
    `ipcRenderer.generatePreviewProxy`.
11. **Viewport culling**: `TimelineCanvas.trackClipMap` only emits clips inside the
    visible frame window (±1 screen), so very long sequences stay light.
12. **Keyboard shortcuts** wired to the action library + store (`SequenceViewTab`):
    B split, Ctrl+D duplicate, Del lift / Shift+Del ripple, M marker, I/O in-out,
    Space/J/K/L transport, arrows nudge, +/- zoom, Shift+Z fit, Home. The `?`
    overlay was corrected to match.
13. **Electron security hardening** (`electron/main.ts`): default-deny permission
    handler, `setWindowOpenHandler` (external links → system browser, no in-app
    popups), `will-navigate` guard pinning the renderer to local content, and a
    CSP via `onHeadersReceived` (packaged builds only, so dev HMR is untouched).

## Remaining follow-ups
- Migrate timeline components from the numeric-id stub to the richer canonical
  `store/timelineStore.ts` (string ids) — needs the Track shape reconciled.
- Whitelisted **typed IPC** + Zod payload validation + path-traversal guards
  (Electrokit pattern) — larger refactor of the IPC surface.
- Content-hash proxy caching + idle background pre-render of the visible range.
- In/Out range visualisation on the ruler (state + snapping already exist).
- Research notes: `lessons-non-nle.md`, `lessons-nle-web.md`, `lessons-nle-desktop.md`.
