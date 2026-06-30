import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FolderGit2, ChevronRight, ChevronLeft, ChevronUp, ChevronDown, Layers, Film, Clock, Trash2, FolderOpen, Download } from 'lucide-react';
import clsx from 'clsx';
import { useProjectsStore, type MMMProject } from '../store/projectsStore';
import { useViewStore } from '../store/viewStore';
import { toast } from './Toast';

// ══════════════════════════════════════════════════════════════════════════════
// ProjectDrawer — a pocket drawer (right edge or bottom) with a visible handle
// that lists past .mmm projects and reloads them into the tool. Shared by the
// Import Manager, the Edits page (right) and the Home/Config page (bottom).
// ══════════════════════════════════════════════════════════════════════════════

const fmtDate = (iso?: string | number) => {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

interface ProjectDrawerProps {
    side: 'right' | 'bottom';
}

export const ProjectDrawer: React.FC<ProjectDrawerProps> = ({ side }) => {
    const [open, setOpen] = useState(false);
    const projects = useProjectsStore((s) => s.projects);
    const diskProjects = useProjectsStore((s) => s.diskProjects);
    const refreshDisk = useProjectsStore((s) => s.refreshDisk);
    const loadProject = useProjectsStore((s) => s.loadProject);
    const deleteProject = useProjectsStore((s) => s.deleteProject);
    const importFromDisk = useProjectsStore((s) => s.importFromDisk);
    const setActiveTab = useViewStore((s) => s.setActiveTab);
    const [busy, setBusy] = useState(false);
    const [confirmDel, setConfirmDel] = useState<string | null>(null);

    useEffect(() => { if (open) void refreshDisk(); }, [open, refreshDisk]);

    // Merge the in-app index with any on-disk .mmm not yet imported.
    const knownPaths = new Set(projects.map((p) => p.filePath).filter(Boolean));
    const diskOnly = diskProjects.filter((d) => !knownPaths.has(d.path));

    const handleOpen = async (p: MMMProject) => {
        setBusy(true);
        try {
            await loadProject(p);
            toast.success(`Loaded project "${p.name}"`);
            setActiveTab('import-manager');
            setOpen(false);
        } catch {
            toast.error('Failed to load project');
        } finally { setBusy(false); }
    };

    const handleOpenDisk = async (path: string) => {
        setBusy(true);
        try {
            const p = await importFromDisk(path);
            if (p) await handleOpen(p);
            else toast.error('Could not read .mmm file');
        } finally { setBusy(false); }
    };

    const isRight = side === 'right';
    const panelMotion = isRight
        ? { initial: { x: '100%' }, animate: { x: 0 }, exit: { x: '100%' } }
        : { initial: { y: '100%' }, animate: { y: 0 }, exit: { y: '100%' } };

    const HandleIcon = isRight ? (open ? ChevronRight : ChevronLeft) : (open ? ChevronDown : ChevronUp);

    return (
        <>
            {/* Handle — always visible */}
            <button
                onClick={() => setOpen((o) => !o)}
                className={clsx(
                    'fixed z-[60] flex items-center gap-1.5 bg-[#13132b] border border-white/10 text-white/70 hover:text-white hover:bg-[#1b1b3a] shadow-lg transition-colors',
                    isRight
                        ? 'right-0 top-1/2 -translate-y-1/2 flex-col py-3 px-1.5 rounded-l-lg'
                        : 'bottom-0 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-t-lg',
                )}
                title="Projects"
            >
                <FolderGit2 size={14} className="text-primary" />
                <span className={clsx('text-[9px] font-black uppercase tracking-wider', isRight && '[writing-mode:vertical-rl]')}>Projects</span>
                <HandleIcon size={12} />
            </button>

            <AnimatePresence>
                {open && (
                    <>
                        <motion.div className="fixed inset-0 z-[55] bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
                        <motion.div
                            {...panelMotion}
                            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
                            className={clsx(
                                'fixed z-[58] bg-[#0b0b18] border-white/10 flex flex-col',
                                isRight ? 'right-0 top-0 bottom-0 w-[340px] border-l' : 'bottom-0 left-0 right-0 h-[44vh] border-t',
                            )}
                        >
                            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                                <h3 className="text-xs font-black text-white/80 flex items-center gap-2"><FolderGit2 size={14} className="text-primary" /> Project Manager</h3>
                                <button onClick={() => importFromDisk().then((p) => p && refreshDisk())}
                                        className="text-[9px] font-bold text-white/50 hover:text-white inline-flex items-center gap-1">
                                    <Download size={11} /> Import .mmm
                                </button>
                            </div>

                            <div className={clsx('flex-1 overflow-y-auto p-3', !isRight && 'grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2 content-start')}>
                                {projects.length === 0 && diskOnly.length === 0 && (
                                    <div className="text-center text-white/30 text-[11px] py-10">
                                        No projects yet. Generate an edit or curate clips in the Import Manager — a project is saved automatically.
                                    </div>
                                )}

                                {projects.map((p) => {
                                    const usedCount = p.files.filter((f) => f.used).length;
                                    return (
                                        <div key={p.id} className={clsx('rounded-lg border border-white/[0.06] bg-[#0d0d22]/60 p-2.5 mb-2', !isRight && 'mb-0')}>
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <div className="text-[11px] font-bold text-white/85 truncate">{p.name}</div>
                                                    <div className="text-[8px] text-white/35 flex items-center gap-2 mt-0.5">
                                                        <span className="inline-flex items-center gap-0.5"><Clock size={8} /> {fmtDate(p.updatedAt)}</span>
                                                        <span className="inline-flex items-center gap-0.5"><Film size={8} /> {p.edits.length} edit(s)</span>
                                                        <span className="inline-flex items-center gap-0.5"><Layers size={8} /> {usedCount}/{p.files.length} used</span>
                                                    </div>
                                                </div>
                                                {confirmDel === p.id ? (
                                                    <button onClick={() => { deleteProject(p.id); setConfirmDel(null); }} onMouseLeave={() => setConfirmDel(null)}
                                                            className="text-[8px] text-red-400 font-bold px-1.5 py-1 rounded bg-red-500/15">Confirm</button>
                                                ) : (
                                                    <button onClick={() => setConfirmDel(p.id)} className="text-white/30 hover:text-red-400 p-1"><Trash2 size={11} /></button>
                                                )}
                                            </div>
                                            <button onClick={() => handleOpen(p)} disabled={busy}
                                                    className="w-full mt-2 py-1.5 rounded-md bg-primary/20 hover:bg-primary/30 text-primary text-[10px] font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-40">
                                                <FolderOpen size={11} /> Open Project
                                            </button>
                                        </div>
                                    );
                                })}

                                {diskOnly.map((d) => (
                                    <div key={d.path} className={clsx('rounded-lg border border-white/[0.04] bg-[#0d0d22]/40 p-2.5 mb-2', !isRight && 'mb-0')}>
                                        <div className="text-[11px] font-bold text-white/70 truncate">{d.name}</div>
                                        <div className="text-[8px] text-white/30 mt-0.5">on disk · {fmtDate(d.updatedAt)}</div>
                                        <button onClick={() => handleOpenDisk(d.path)} disabled={busy}
                                                className="w-full mt-2 py-1.5 rounded-md bg-white/5 hover:bg-white/10 text-white/70 text-[10px] font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-40">
                                            <FolderOpen size={11} /> Open Project
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </>
    );
};
