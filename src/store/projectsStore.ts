// ══════════════════════════════════════════════════════════════════════════════
// projectsStore.ts — The Project Manager.
//
// A "project" captures everything about a working session: the folders opened,
// the videos selected, which were used, every clip's include/exclude segments,
// and all edits generated inside it. Projects are the unit the user reloads.
//
// Persistence is two-tier:
//   • An in-app index (this persisted store) — always available, instant.
//   • Optional `.mmm` files on disk (JSON). Saved into a dedicated Documents
//     folder via Electron IPC when available (see lib/projectFs.ts); the path is
//     configurable in Settings. Import/export also works through the file dialog.
//
// A `.mmm` file is simply the JSON of one MMMProject.
// ══════════════════════════════════════════════════════════════════════════════

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import type { MediaSegment } from '../lib/mediaSegments';
import type { SavedEdit } from './savedEditsStore';
import { useMediaStore } from './mediaStore';
import { useProjectStore } from './projectStore';
import { saveProjectFile, loadProjectFile, listProjectFiles, type MmmListing } from '../lib/projectFs';

export const MMM_VERSION = 1;

export interface MMMProjectFile {
    id: string;
    path: string;
    filename: string;
    type: 'video' | 'audio' | 'image';
    orientation?: 'horizontal' | 'vertical' | 'square';
    width?: number;
    height?: number;
    rotation?: 0 | 90 | 180 | 270;
    trimIn?: number;
    trimOut?: number;
    segments?: MediaSegment[];
    /** Was this source actually used by a generated edit in this project? */
    used?: boolean;
}

export interface MMMProject {
    version: number;
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
    /** Folders opened for this project. */
    folders: string[];
    /** Ids of the files the user selected. */
    selectedFileIds: string[];
    /** Snapshot of the media + per-file segment decisions (source of truth). */
    files: MMMProjectFile[];
    /** Edits generated inside this project. */
    edits: SavedEdit[];
    settingsSnapshot?: Record<string, unknown>;
    thumbnailPath?: string;
    /** Absolute path of the .mmm file on disk, once saved. */
    filePath?: string;
}

interface ProjectsState {
    projects: MMMProject[];
    currentProjectId: string | null;
    /** Disk listings discovered from the projects folder (refreshed on demand). */
    diskProjects: MmmListing[];
    /** User-chosen .mmm storage folder (null = default Documents/MMMedia Projects). */
    projectsDir: string | null;

    setProjectsDir: (dir: string | null) => void;
    setCurrent: (id: string | null) => void;
    /** Build a project snapshot from the current media/segment state. */
    snapshotCurrent: (name?: string) => MMMProject;
    upsertProject: (p: MMMProject) => void;
    deleteProject: (id: string) => void;
    /** Attach a generated edit to a project (creating one if needed). Returns id. */
    attachEdit: (edit: SavedEdit, opts?: { name?: string }) => string;
    /** Persist a project to a .mmm file (silent if disk IPC available, else dialog). */
    saveToDisk: (id: string) => Promise<boolean>;
    /** Refresh the on-disk .mmm listing from the projects folder. */
    refreshDisk: () => Promise<void>;
    /** Reload a project into the tool (media + segments + selection + settings). */
    loadProject: (project: MMMProject) => Promise<void>;
    /** Import a .mmm from disk into the index (via dialog or path). */
    importFromDisk: (path?: string) => Promise<MMMProject | null>;
    /** Find or synthesize+store a project for a (possibly legacy) saved edit. */
    ensureProjectForEdit: (edit: SavedEdit) => MMMProject;
}

function foldersFromClips(clips: SavedEdit['clips']): string[] {
    const set = new Set<string>();
    for (const c of clips || []) {
        const p = (c as any)?.path as string | undefined;
        if (p) { const folder = p.replace(/[\\/][^\\/]+$/, ''); if (folder && folder !== p) set.add(folder); }
    }
    return [...set];
}

function snapshotFiles(): MMMProjectFile[] {
    const { files } = useMediaStore.getState();
    return files.map((f) => ({
        id: f.id, path: f.path, filename: f.filename, type: f.type,
        orientation: f.orientation, width: f.width, height: f.height, rotation: f.rotation,
        trimIn: f.trimIn, trimOut: f.trimOut, segments: f.segments,
    }));
}

function foldersFromState(): string[] {
    // Derive folders ONLY from the media actually imported into this project —
    // NOT from the global recentFolders list (which accumulates every folder ever
    // opened across all projects and would make a project reload everything).
    const { files } = useMediaStore.getState();
    const set = new Set<string>();
    for (const f of files) {
        if (f.path) {
            const folder = f.path.replace(/[\\/][^\\/]+$/, '');
            if (folder && folder !== f.path) set.add(folder);
        }
    }
    return [...set];
}

export const useProjectsStore = create<ProjectsState>()(
    persist(
        (set, get) => ({
            projects: [],
            currentProjectId: null,
            diskProjects: [],
            projectsDir: null,

            setProjectsDir: (dir) => set({ projectsDir: dir }),
            setCurrent: (id) => set({ currentProjectId: id }),

            snapshotCurrent: (name) => {
                const media = useMediaStore.getState();
                const settings = useProjectStore.getState().settings;
                const now = new Date().toISOString();
                const proj: MMMProject = {
                    version: MMM_VERSION,
                    id: uuidv4(),
                    name: name || settings?.name || `Project ${new Date().toLocaleString()}`,
                    createdAt: now,
                    updatedAt: now,
                    folders: foldersFromState(),
                    selectedFileIds: [...media.selectedFileIds],
                    files: snapshotFiles(),
                    edits: [],
                    settingsSnapshot: settings ? { ...settings } : undefined,
                };
                return proj;
            },

            upsertProject: (p) => set((s) => {
                const updated = { ...p, updatedAt: new Date().toISOString() };
                const exists = s.projects.some((x) => x.id === p.id);
                return {
                    projects: exists ? s.projects.map((x) => x.id === p.id ? updated : x) : [updated, ...s.projects],
                    currentProjectId: s.currentProjectId ?? p.id,
                };
            }),

            deleteProject: (id) => set((s) => ({
                projects: s.projects.filter((x) => x.id !== id),
                currentProjectId: s.currentProjectId === id ? null : s.currentProjectId,
            })),

            attachEdit: (edit, opts) => {
                const s = get();
                let project = s.currentProjectId ? s.projects.find((p) => p.id === s.currentProjectId) : undefined;
                if (!project) {
                    // Auto-create a project from the current state when an edit is generated.
                    project = s.snapshotCurrent(opts?.name);
                }
                // Mark used sources from the edit's clip paths.
                const usedPaths = new Set((edit.clips || []).map((c: any) => c?.path).filter(Boolean));
                const files = (project.files.length ? project.files : snapshotFiles()).map((f) => ({
                    ...f, used: f.used || usedPaths.has(f.path),
                }));
                const updated: MMMProject = {
                    ...project,
                    files,
                    edits: [edit, ...project.edits.filter((e) => e.id !== edit.id)],
                    thumbnailPath: project.thumbnailPath || edit.thumbnailPath,
                    updatedAt: new Date().toISOString(),
                };
                get().upsertProject(updated);
                set({ currentProjectId: updated.id });
                // Best-effort silent disk save.
                void get().saveToDisk(updated.id).catch(() => {});
                return updated.id;
            },

            saveToDisk: async (id) => {
                const proj = get().projects.find((p) => p.id === id);
                if (!proj) return false;
                const res = await saveProjectFile(proj, get().projectsDir);
                if (res?.success && res.filePath) {
                    get().upsertProject({ ...proj, filePath: res.filePath });
                    return true;
                }
                return false;
            },

            refreshDisk: async () => {
                const listing = await listProjectFiles(get().projectsDir);
                set({ diskProjects: listing });
            },

            loadProject: async (project) => {
                const media = useMediaStore.getState();
                const ipc: any = (window as any).ipcRenderer;
                // 1. Rebuild the media library — but only from the folders THIS
                // project's own files live in (derived from the file snapshot),
                // falling back to project.folders only when there's no snapshot.
                // This also repairs older projects saved with a bloated folder list.
                const fileFolders = new Set<string>();
                for (const f of project.files) {
                    if (f.path) {
                        const folder = f.path.replace(/[\\/][^\\/]+$/, '');
                        if (folder && folder !== f.path) fileFolders.add(folder);
                    }
                }
                const foldersToLoad = fileFolders.size > 0 ? [...fileFolders] : project.folders;
                media.clearLibrary();
                if (ipc?.loadFolder) {
                    for (const folder of foldersToLoad) {
                        try {
                            const r = await ipc.loadFolder(folder);
                            if (r?.success && r.files) {
                                const { buildMediaFile } = await import('../lib/mediaProbe');
                                const built = await Promise.all(r.files.map((file: any) => buildMediaFile(file)));
                                media.addFiles(built as any);
                                media.addRecentFolder(folder, built.length);
                            }
                        } catch { /* folder may be gone */ }
                    }
                }
                // 2. Re-apply per-file segment decisions + orientation by PATH.
                const norm = (p: string) => p.replace(/\\/g, '/').toLowerCase();
                const byPath = new Map(project.files.map((f) => [norm(f.path), f]));
                for (const f of useMediaStore.getState().files) {
                    const snap = f.path ? byPath.get(norm(f.path)) : undefined;
                    if (!snap) continue;
                    if (snap.segments) media.setFileSegments(f.id, snap.segments);
                    if (snap.orientation) media.updateFile(f.id, { orientation: snap.orientation });
                    if (snap.trimIn != null || snap.trimOut != null) media.setFileTrim(f.id, snap.trimIn ?? 0, snap.trimOut ?? f.duration);
                }
                // 3. Restore selection (by path → current ids).
                const selPaths = new Set(project.files.filter((f) => project.selectedFileIds.includes(f.id)).map((f) => norm(f.path)));
                const selIds = useMediaStore.getState().files.filter((f) => f.path && selPaths.has(norm(f.path))).map((f) => f.id);
                if (selIds.length) media.selectAllFiles(selIds);
                // 4. Restore generator settings snapshot.
                if (project.settingsSnapshot) {
                    try {
                        const persistable = { ...project.settingsSnapshot } as Record<string, unknown>;
                        delete persistable.audioAnalysis; delete persistable.narrationAnalysis; delete persistable.seed;
                        localStorage.setItem('mmm_trailer_settings', JSON.stringify(persistable));
                    } catch { /* ignore */ }
                }
                set({ currentProjectId: project.id });
            },

            importFromDisk: async (path) => {
                const proj = await loadProjectFile(path);
                if (!proj) return null;
                get().upsertProject(proj);
                return proj;
            },

            ensureProjectForEdit: (edit) => {
                const existing = get().projects.find((p) => p.edits.some((e) => e.id === edit.id));
                if (existing) return existing;
                const now = new Date().toISOString();
                // Scope folders to THIS edit's own clips — never trust
                // edit.sourceFolders, which historically captured every folder
                // ever opened (that's what made Open Project load all projects).
                const clipFolders = foldersFromClips(edit.clips);
                const project: MMMProject = {
                    version: MMM_VERSION,
                    id: uuidv4(),
                    name: edit.name || `Project ${new Date().toLocaleString()}`,
                    createdAt: edit.createdAt || now,
                    updatedAt: now,
                    folders: clipFolders.length ? clipFolders : (edit.sourceFolders ?? []),
                    selectedFileIds: [],
                    files: [],
                    edits: [edit],
                    settingsSnapshot: edit.settingsSnapshot as Record<string, unknown> | undefined,
                    thumbnailPath: edit.thumbnailPath,
                };
                get().upsertProject(project);
                void get().saveToDisk(project.id).catch(() => {});
                return project;
            },
        }),
        { name: 'mmm_projects', partialize: (s) => ({ projects: s.projects, currentProjectId: s.currentProjectId, projectsDir: s.projectsDir }) },
    ),
);
