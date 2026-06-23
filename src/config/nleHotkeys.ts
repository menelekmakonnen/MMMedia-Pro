/**
 * NLE Keyboard Shortcuts Configuration
 *
 * Centralized hotkey definitions for the Sequence editor.
 * Uses `mod` for cross-platform Cmd (Mac) / Ctrl (Windows/Linux).
 *
 * This file is the single source of truth for shortcut bindings.
 * The runtime shortcut handler reads from this array and dispatches actions.
 * Users can eventually remap keys by overriding entries in localStorage.
 */

export interface HotkeyDef {
    /** Key combo string, e.g. 'space', 'ctrl+z', 'shift+delete'. */
    key: string;
    /** Machine-readable action identifier. */
    action: string;
    /** Human-readable label for the shortcut panel / tooltips. */
    label: string;
    /** Category for grouping in the keyboard shortcuts panel. */
    category:
        | 'transport'
        | 'tools'
        | 'edit'
        | 'navigation'
        | 'marking'
        | 'clipboard'
        | 'zoom'
        | 'source';
}

export const NLE_HOTKEYS: HotkeyDef[] = [
    // ─── Transport ────────────────────────────────────────────────────────────
    { key: 'space',       action: 'playPause',        label: 'Play / Pause',                    category: 'transport' },
    { key: 'j',           action: 'shuttleReverse',   label: 'Shuttle Reverse',                 category: 'transport' },
    { key: 'k',           action: 'shuttleStop',      label: 'Shuttle Stop',                    category: 'transport' },
    { key: 'l',           action: 'shuttleForward',   label: 'Shuttle Forward',                 category: 'transport' },
    { key: 'home',        action: 'goToStart',        label: 'Go to Start',                     category: 'transport' },
    { key: 'end',         action: 'goToEnd',          label: 'Go to End',                       category: 'transport' },

    // ─── Navigation ───────────────────────────────────────────────────────────
    { key: 'left',        action: 'prevFrame',        label: 'Previous Frame',                  category: 'navigation' },
    { key: 'right',       action: 'nextFrame',        label: 'Next Frame',                      category: 'navigation' },
    { key: 'shift+left',  action: 'prevFrames5',      label: 'Back 5 Frames',                   category: 'navigation' },
    { key: 'shift+right', action: 'nextFrames5',      label: 'Forward 5 Frames',                category: 'navigation' },
    { key: 'up',          action: 'prevEdit',         label: 'Previous Edit Point',             category: 'navigation' },
    { key: 'down',        action: 'nextEdit',         label: 'Next Edit Point',                 category: 'navigation' },
    { key: 'shift+up',    action: 'prevTrack',        label: 'Select Previous Track',           category: 'navigation' },
    { key: 'shift+down',  action: 'nextTrack',        label: 'Select Next Track',               category: 'navigation' },

    // ─── Tools ────────────────────────────────────────────────────────────────
    { key: 'v',           action: 'toolSelect',       label: 'Selection Tool',                  category: 'tools' },
    { key: 't',           action: 'toolTrim',         label: 'Trim Tool',                       category: 'tools' },
    { key: 'c',           action: 'toolRazor',        label: 'Razor Tool',                      category: 'tools' },
    { key: 'y',           action: 'toolSlip',         label: 'Slip Tool',                       category: 'tools' },
    { key: 'u',           action: 'toolSlide',        label: 'Slide Tool',                      category: 'tools' },
    { key: 'h',           action: 'toolHand',         label: 'Hand Tool',                       category: 'tools' },
    { key: 'r',           action: 'toolRateStretch',  label: 'Rate Stretch Tool',               category: 'tools' },
    { key: 's',           action: 'toggleSnap',       label: 'Toggle Snap',                     category: 'tools' },
    { key: 'shift+l',     action: 'toggleLink',       label: 'Toggle Linked Selection',         category: 'tools' },

    // ─── Edit ─────────────────────────────────────────────────────────────────
    { key: 'ctrl+k',      action: 'splitAtPlayhead',  label: 'Split at Playhead',               category: 'edit' },
    { key: 'alt+c',       action: 'splitAtPlayhead',  label: 'Split at Playhead (Alt)',         category: 'edit' },
    { key: 'delete',      action: 'deleteSelected',   label: 'Delete Selected (Lift)',          category: 'edit' },
    { key: 'backspace',   action: 'deleteSelected',   label: 'Delete Selected (Alt)',           category: 'edit' },
    { key: 'shift+delete', action: 'rippleDelete',    label: 'Ripple Delete',                   category: 'edit' },
    { key: 'ctrl+shift+delete', action: 'rippleDelete', label: 'Ripple Delete (Alt)',           category: 'edit' },
    { key: 'ctrl+d',      action: 'duplicate',        label: 'Duplicate Selected',              category: 'edit' },
    { key: 'ctrl+z',      action: 'undo',             label: 'Undo',                            category: 'edit' },
    { key: 'ctrl+shift+z', action: 'redo',            label: 'Redo',                            category: 'edit' },
    { key: 'ctrl+y',      action: 'redo',             label: 'Redo (Alt)',                      category: 'edit' },
    { key: 'e',           action: 'toggleEnabled',    label: 'Toggle Clip Enabled',             category: 'edit' },

    // ─── Clipboard ────────────────────────────────────────────────────────────
    { key: 'ctrl+c',      action: 'copy',             label: 'Copy',                            category: 'clipboard' },
    { key: 'ctrl+x',      action: 'cut',              label: 'Cut',                             category: 'clipboard' },
    { key: 'ctrl+v',      action: 'paste',            label: 'Paste',                           category: 'clipboard' },

    // ─── Source Monitor / Marking ─────────────────────────────────────────────
    { key: 'i',           action: 'markIn',           label: 'Mark In',                         category: 'marking' },
    { key: 'o',           action: 'markOut',          label: 'Mark Out',                        category: 'marking' },
    { key: 'alt+x',       action: 'clearInOut',       label: 'Clear In/Out',                    category: 'marking' },
    { key: ',',           action: 'insertEdit',       label: 'Insert Edit (Comma)',             category: 'source' },
    { key: '.',           action: 'overwriteEdit',    label: 'Overwrite Edit (Period)',         category: 'source' },

    // ─── Markers ──────────────────────────────────────────────────────────────
    { key: 'm',           action: 'addMarker',        label: 'Add Marker',                      category: 'marking' },
    { key: 'shift+m',     action: 'removeMarker',     label: 'Remove Marker',                   category: 'marking' },
    { key: '[',           action: 'prevMarker',       label: 'Previous Marker',                 category: 'marking' },
    { key: ']',           action: 'nextMarker',       label: 'Next Marker',                     category: 'marking' },

    // ─── Zoom ─────────────────────────────────────────────────────────────────
    { key: 'ctrl+=',      action: 'zoomIn',           label: 'Zoom In',                         category: 'zoom' },
    { key: 'ctrl+-',      action: 'zoomOut',          label: 'Zoom Out',                        category: 'zoom' },
    { key: '\\',          action: 'zoomToFit',        label: 'Zoom to Fit',                     category: 'zoom' },
    { key: 'shift+\\',    action: 'zoomTo100',        label: 'Zoom to 100%',                    category: 'zoom' },
    { key: 'ctrl+0',      action: 'zoomTo100',        label: 'Zoom to 100% (Alt)',              category: 'zoom' },
];

// ─── Lookup Helpers ───────────────────────────────────────────────────────────

/** Get the first hotkey definition for a given action name. */
export function getHotkeyForAction(action: string): HotkeyDef | undefined {
    return NLE_HOTKEYS.find((h) => h.action === action);
}

/** Get a display-friendly shortcut string for an action (e.g. "Ctrl+K"). */
export function getShortcutLabel(action: string): string {
    const def = getHotkeyForAction(action);
    if (!def) return '';

    return def.key
        .split('+')
        .map((token) => {
            const t = token.trim().toLowerCase();
            if (t === 'ctrl' || t === 'mod') return 'Ctrl';
            if (t === 'shift') return 'Shift';
            if (t === 'alt') return 'Alt';
            if (t === 'space') return 'Space';
            if (t === 'delete') return 'Del';
            if (t === 'backspace') return 'Bksp';
            return t.length === 1 ? t.toUpperCase() : t.charAt(0).toUpperCase() + t.slice(1);
        })
        .join('+');
}

/** Group all hotkeys by category. */
export function getHotkeysByCategory(): Map<HotkeyDef['category'], HotkeyDef[]> {
    const map = new Map<HotkeyDef['category'], HotkeyDef[]>();
    for (const hk of NLE_HOTKEYS) {
        const list = map.get(hk.category) ?? [];
        list.push(hk);
        map.set(hk.category, list);
    }
    return map;
}
