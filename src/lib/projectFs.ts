// ══════════════════════════════════════════════════════════════════════════════
// projectFs.ts — Renderer-side .mmm disk IO for the Project Manager.
//
// Prefers dedicated, SILENT Electron IPC (write/list/read into a Documents
// projects folder, path configurable in Settings). When those handlers aren't
// present yet (older app build), it gracefully falls back to the existing
// file-dialog IPC so save/open still work — just not silently.
//
// Channels (added in electron/main.ts):
//   project:get-dir        () -> { dir }
//   project:set-dir        (dir) -> { dir }
//   project:pick-dir       () -> { dir } | { canceled }
//   project:save           ({ name, content, dir? }) -> { success, filePath }
//   project:list           ({ dir? }) -> { items: MmmListing[] }
//   project:load           ({ path }) -> { content }
// ══════════════════════════════════════════════════════════════════════════════

import type { MMMProject } from '../store/projectsStore';

export interface MmmListing {
    name: string;
    path: string;
    updatedAt?: number;
}

function ipc(): any { return (window as any).ipcRenderer; }
async function tryInvoke<T>(channel: string, payload?: unknown): Promise<T | null> {
    const r = ipc();
    if (!r?.invoke) return null;
    try { return (await r.invoke(channel, payload)) as T; } catch { return null; }
}

const safeName = (name: string) => (name || 'project').replace(/[^a-z0-9-_ ]/gi, '_').slice(0, 80).trim() || 'project';

/** Default / configured projects directory, when the disk IPC is available. */
export async function getProjectsDir(): Promise<string | null> {
    const r = await tryInvoke<{ dir?: string }>('project:get-dir');
    return r?.dir ?? null;
}

/** Let the user pick a new projects directory (Settings). */
export async function pickProjectsDir(): Promise<string | null> {
    const r = await tryInvoke<{ dir?: string; canceled?: boolean }>('project:pick-dir');
    return r?.canceled ? null : (r?.dir ?? null);
}

/** Save a project as <dir>/<name>.mmm. Silent when IPC present; else dialog. */
export async function saveProjectFile(
    project: MMMProject,
    dir: string | null,
): Promise<{ success: boolean; filePath?: string }> {
    const content = JSON.stringify(project, null, 2);
    // Preferred: silent write into the projects folder.
    const silent = await tryInvoke<{ success?: boolean; filePath?: string }>('project:save', {
        name: safeName(project.name), content, dir: dir ?? undefined,
    });
    if (silent?.success && silent.filePath) return { success: true, filePath: silent.filePath };

    // Fallback: existing dialog-based save (writes a .mmm wherever the user picks).
    const r = ipc();
    if (r?.saveProject) {
        try {
            const res = await r.saveProject(content);
            if (res?.success || res?.filePath) return { success: true, filePath: res?.filePath };
        } catch { /* ignore */ }
    }
    return { success: false };
}

/** List .mmm files in the projects folder (requires disk IPC). */
export async function listProjectFiles(dir: string | null): Promise<MmmListing[]> {
    const r = await tryInvoke<{ items?: MmmListing[] }>('project:list', { dir: dir ?? undefined });
    return r?.items ?? [];
}

/** Load a project from a specific path (silent) or via dialog when no path. */
export async function loadProjectFile(path?: string): Promise<MMMProject | null> {
    if (path) {
        const r = await tryInvoke<{ content?: string }>('project:load', { path });
        if (r?.content) { try { return JSON.parse(r.content) as MMMProject; } catch { return null; } }
    }
    // Fallback: dialog open.
    const r = ipc();
    if (r?.loadProject) {
        try {
            const res = await r.loadProject();
            const content = typeof res === 'string' ? res : res?.content;
            if (content) return JSON.parse(content) as MMMProject;
        } catch { /* ignore */ }
    }
    return null;
}
