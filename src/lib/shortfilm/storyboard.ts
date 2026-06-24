// ══════════════════════════════════════════════════════════════════════════════
// storyboard.ts — The Short Film data model + storyboard parser.
//
// A Film is an ordered list of Scenes; each Scene an ordered list of Shots. This
// is the human-authored intent that drives the whole Short Film pipeline:
// storyboard → shotlist → take matching → audio sync → cutting → assembly.
//
// `parseStoryboard(input)` accepts either:
//   • JSON  — a serialized `Film` (detected when the trimmed input starts with
//     `{` or `[`; a bare `[]` is read as a scene array and wrapped into a Film).
//   • Markdown — a lightweight convention (documented below).
//
// MARKDOWN CONVENTION
// ───────────────────
//   # Film Title                     → film.title
//   ## Scene Name                    → starts a new Scene (id auto-slugged)
//   - meta lines under a scene (before any shot) set scene fields:
//       grade: teal-orange
//       audioBed: room-tone.wav
//   ### Shot description              → starts a new Shot in the current scene
//   - shot meta lines (key: value) set shot fields:
//       shotType: close-up           (alias of `type`)
//       duration: 4.5                (seconds → targetDurationSec; alias `dur`)
//       dialogue: "Line of dialogue"
//       action: He turns away.
//       camera: slow push-in
//       audioCue: door slam
//   Any non-meta line under a shot is appended to its `description`.
//   Shots may also be written inline as a bullet with a trailing `[shotType, Ns]`
//   tag, e.g.  `- Hero enters [wide, 6s]`.
//
// PURE: no React / IPC / FFmpeg. Returns plain data. Deterministic.
// ══════════════════════════════════════════════════════════════════════════════

export type StoryboardShotType =
    | 'establishing' | 'wide' | 'master' | 'medium' | 'close-up' | 'extreme-close-up'
    | 'over-the-shoulder' | 'two-shot' | 'insert' | 'cutaway' | 'reaction' | 'pov';

export interface Shot {
    id: string;
    description: string;
    shotType: StoryboardShotType;
    targetDurationSec: number;
    dialogue?: string;
    action?: string;
    camera?: string;
    audioCue?: string;
}

export interface Scene {
    id: string;
    name: string;
    shots: Shot[];
    /** Color-grade hint applied to the whole scene (free-form preset name). */
    grade?: string;
    /** Background audio bed (room tone / score) file hint for this scene. */
    audioBed?: string;
}

export interface Film {
    title: string;
    scenes: Scene[];
}

// ─── Shot-type normalization ─────────────────────────────────────────────────

const SHOT_TYPE_ALIASES: Record<string, StoryboardShotType> = {
    'establishing': 'establishing', 'est': 'establishing', 'establish': 'establishing',
    'wide': 'wide', 'ws': 'wide', 'long': 'wide', 'full': 'wide',
    'master': 'master',
    'medium': 'medium', 'mid': 'medium', 'ms': 'medium', 'mcu': 'medium',
    'close-up': 'close-up', 'closeup': 'close-up', 'close up': 'close-up', 'cu': 'close-up',
    'extreme-close-up': 'extreme-close-up', 'ecu': 'extreme-close-up', 'extreme close-up': 'extreme-close-up',
    'over-the-shoulder': 'over-the-shoulder', 'ots': 'over-the-shoulder', 'over the shoulder': 'over-the-shoulder',
    'two-shot': 'two-shot', '2-shot': 'two-shot', 'two shot': 'two-shot',
    'insert': 'insert', 'detail': 'insert',
    'cutaway': 'cutaway', 'cut-away': 'cutaway',
    'reaction': 'reaction',
    'pov': 'pov', 'point-of-view': 'pov',
};

/** Map a free-form shot-type string to a canonical StoryboardShotType (defaults to medium). */
export function normalizeShotType(raw: string | undefined): StoryboardShotType {
    if (!raw) return 'medium';
    const k = raw.toLowerCase().trim();
    return SHOT_TYPE_ALIASES[k] ?? (k as StoryboardShotType in SHOT_TYPE_ALIASES ? (k as StoryboardShotType) : 'medium');
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function slug(s: string, fallback: string): string {
    const out = s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return out || fallback;
}

/** Parse a duration token like "4.5", "4.5s", "90f" (frames at 30fps display only → sec). */
function parseDurationSec(raw: string): number | undefined {
    const t = raw.trim().toLowerCase();
    const f = t.match(/^([\d.]+)\s*f$/);
    if (f) return parseFloat(f[1]) / 30;
    const s = t.match(/^([\d.]+)\s*s?$/);
    if (s) return parseFloat(s[1]);
    return undefined;
}

// ─── JSON normalization ──────────────────────────────────────────────────────

function coerceShot(raw: any, sceneIdx: number, shotIdx: number): Shot {
    const id = String(raw?.id ?? `s${sceneIdx + 1}-sh${shotIdx + 1}`);
    return {
        id,
        description: String(raw?.description ?? raw?.desc ?? ''),
        shotType: normalizeShotType(raw?.shotType ?? raw?.type),
        targetDurationSec: Number(raw?.targetDurationSec ?? raw?.duration ?? raw?.dur ?? 0) || 0,
        dialogue: raw?.dialogue != null ? String(raw.dialogue) : undefined,
        action: raw?.action != null ? String(raw.action) : undefined,
        camera: raw?.camera != null ? String(raw.camera) : undefined,
        audioCue: raw?.audioCue != null ? String(raw.audioCue) : undefined,
    };
}

function coerceScene(raw: any, idx: number): Scene {
    const name = String(raw?.name ?? raw?.title ?? `Scene ${idx + 1}`);
    const id = String(raw?.id ?? slug(name, `scene-${idx + 1}`));
    const shots = Array.isArray(raw?.shots) ? raw.shots.map((s: any, i: number) => coerceShot(s, idx, i)) : [];
    return {
        id,
        name,
        shots,
        grade: raw?.grade != null ? String(raw.grade) : undefined,
        audioBed: raw?.audioBed != null ? String(raw.audioBed) : undefined,
    };
}

function coerceFilm(raw: any): Film {
    if (Array.isArray(raw)) {
        return { title: 'Untitled Film', scenes: raw.map((s, i) => coerceScene(s, i)) };
    }
    const scenes = Array.isArray(raw?.scenes) ? raw.scenes.map((s: any, i: number) => coerceScene(s, i)) : [];
    return { title: String(raw?.title ?? 'Untitled Film'), scenes };
}

// ─── Markdown parsing ────────────────────────────────────────────────────────

function parseMarkdown(input: string): Film {
    const film: Film = { title: 'Untitled Film', scenes: [] };
    let scene: Scene | null = null;
    let shot: Shot | null = null;
    let sceneIdx = -1;
    let shotIdx = -1;

    const startShot = (description: string, inlineType?: string, inlineDur?: number): Shot => {
        if (!scene) {
            scene = { id: 'scene-1', name: 'Scene 1', shots: [] };
            film.scenes.push(scene);
            sceneIdx = 0;
        }
        shotIdx = scene.shots.length;
        const s: Shot = {
            id: `${scene.id}-sh${shotIdx + 1}`,
            description: description.trim(),
            shotType: normalizeShotType(inlineType),
            targetDurationSec: inlineDur ?? 0,
        };
        scene.shots.push(s);
        return s;
    };

    const applyMeta = (target: 'scene' | 'shot', key: string, value: string) => {
        const k = key.toLowerCase().trim();
        const v = value.trim().replace(/^["']|["']$/g, '');
        if (target === 'shot' && shot) {
            if (k === 'shottype' || k === 'type') shot.shotType = normalizeShotType(v);
            else if (k === 'duration' || k === 'dur' || k === 'targetdurationsec') {
                const d = parseDurationSec(v); if (d != null) shot.targetDurationSec = d;
            } else if (k === 'dialogue' || k === 'line') shot.dialogue = v;
            else if (k === 'action') shot.action = v;
            else if (k === 'camera' || k === 'cam') shot.camera = v;
            else if (k === 'audiocue' || k === 'audio' || k === 'sfx') shot.audioCue = v;
        } else if (target === 'scene' && scene) {
            if (k === 'grade' || k === 'color' || k === 'lut') scene.grade = v;
            else if (k === 'audiobed' || k === 'bed' || k === 'roomtone') scene.audioBed = v;
        }
    };

    for (const rawLine of input.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) continue;

        // # Title
        let m = line.match(/^#\s+(.*)$/);
        if (m) { film.title = m[1].trim(); continue; }

        // ## Scene
        m = line.match(/^##\s+(.*)$/);
        if (m) {
            const name = m[1].trim();
            sceneIdx++;
            scene = { id: slug(name, `scene-${sceneIdx + 1}`), name, shots: [] };
            film.scenes.push(scene);
            shot = null;
            continue;
        }

        // ### Shot
        m = line.match(/^###\s+(.*)$/);
        if (m) { shot = startShot(m[1].trim()); continue; }

        // Bullet line: either a meta `- key: value` or an inline shot `- desc [type, Ns]`
        m = line.match(/^[-*]\s+(.*)$/);
        if (m) {
            const body = m[1].trim();
            const inline = body.match(/^(.*?)\s*\[([^\]]+)\]\s*$/);
            if (inline) {
                // Inline shot definition with a [type, duration] tag.
                const desc = inline[1].trim();
                let inlineType: string | undefined;
                let inlineDur: number | undefined;
                for (const tok of inline[2].split(',').map(t => t.trim())) {
                    const d = parseDurationSec(tok);
                    if (d != null && /\d/.test(tok)) inlineDur = d;
                    else inlineType = tok;
                }
                shot = startShot(desc, inlineType, inlineDur);
                continue;
            }
            const kv = body.match(/^([A-Za-z][\w -]*?)\s*:\s*(.*)$/);
            if (kv) {
                applyMeta(shot ? 'shot' : 'scene', kv[1], kv[2]);
                continue;
            }
            // Plain bullet with no tag/meta → treat as a shot description.
            shot = startShot(body);
            continue;
        }

        // Bare `key: value` line (no bullet) — also accepted as meta.
        m = line.match(/^([A-Za-z][\w -]*?)\s*:\s*(.*)$/);
        if (m && (shot || scene)) { applyMeta(shot ? 'shot' : 'scene', m[1], m[2]); continue; }

        // Free text under a shot → appended to its description.
        if (shot) {
            shot.description = shot.description ? `${shot.description} ${line}` : line;
        }
    }

    return film;
}

// ─── Public entry ────────────────────────────────────────────────────────────

/**
 * Parse a storyboard (JSON or markdown) into a Film. JSON is detected by a
 * leading `{` or `[`; everything else is parsed as the markdown convention above.
 * Throws only on malformed JSON that *looks* like JSON.
 */
export function parseStoryboard(input: string): Film {
    const trimmed = (input ?? '').trim();
    if (!trimmed) return { title: 'Untitled Film', scenes: [] };

    if (trimmed[0] === '{' || trimmed[0] === '[') {
        const data = JSON.parse(trimmed);
        return coerceFilm(data);
    }
    return parseMarkdown(trimmed);
}

/** Convenience: total target seconds across every shot in the film. */
export function filmTargetSeconds(film: Film): number {
    return film.scenes.reduce(
        (sum, sc) => sum + sc.shots.reduce((s, sh) => s + (sh.targetDurationSec || 0), 0),
        0,
    );
}
