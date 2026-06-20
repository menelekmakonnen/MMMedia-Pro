# Deprecated — superseded by Edia (ChaosEdit)

This in-repo Premiere extension is **no longer the bridge** between MMMedia Pro
and Premiere Pro. It only consumed the legacy lossy `manifest.json` (basic
placement + constant speed) and has diverged from MMMedia's current feature set.

**Use Edia (ChaosEdit) instead.** MMMedia now exports the shared, versioned
**ICUNI Edit** interchange (`Export → Premiere → "Export for Edia (ICUNI Edit)"`,
producing `edit.icuni.json`). Open that file in the Edia panel
("Import MMMedia Edit") and it rebuilds the timeline natively in Premiere:
trim, order, constant speed (incl. average of speed ramps), transitions, and
zoom/motion — approximating effects where Premiere allows and reporting anything
that can't transfer.

Schema source of truth: `src/lib/icuniEdit.ts` (MMMedia) ⇄
`shared/icuniEdit.js` (Edia). Keep them in sync.
