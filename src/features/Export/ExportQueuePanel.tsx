import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Download, Trash2, XCircle, CheckCircle2, Loader2, Clock,
    AlertTriangle, ChevronDown, BarChart3, HardDrive, Zap,
    ArrowUp, ArrowDown, Film, Ban,
} from 'lucide-react';
import clsx from 'clsx';
import type {
    ExportJob,
    ExportPriority,
    ExportStatus,
    QueueStats,
} from '../../lib/exportQueue';

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<ExportStatus, { label: string; icon: React.ElementType; color: string; bgColor: string }> = {
    queued: { label: 'Queued', icon: Clock, color: 'text-blue-400', bgColor: 'bg-blue-500/20' },
    rendering: { label: 'Rendering', icon: Loader2, color: 'text-amber-400', bgColor: 'bg-amber-500/20' },
    completed: { label: 'Completed', icon: CheckCircle2, color: 'text-emerald-400', bgColor: 'bg-emerald-500/20' },
    failed: { label: 'Failed', icon: AlertTriangle, color: 'text-red-400', bgColor: 'bg-red-500/20' },
    cancelled: { label: 'Cancelled', icon: Ban, color: 'text-white/40', bgColor: 'bg-white/10' },
};

const PRIORITY_CONFIG: Record<ExportPriority, { label: string; color: string; dotColor: string }> = {
    low: { label: 'Low', color: 'text-white/30', dotColor: 'bg-white/20' },
    normal: { label: 'Normal', color: 'text-blue-400', dotColor: 'bg-blue-500' },
    high: { label: 'High', color: 'text-amber-400', dotColor: 'bg-amber-500' },
    urgent: { label: 'Urgent', color: 'text-red-400', dotColor: 'bg-red-500' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatDuration(seconds: number): string {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}m ${s}s`;
}

function formatTimestamp(epoch: number): string {
    const d = new Date(epoch);
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

const StatCard: React.FC<{
    label: string;
    value: number;
    icon: React.ElementType;
    color: string;
}> = ({ label, value, icon: Icon, color }) => (
    <div className="bg-black/30 rounded-lg border border-white/5 p-3 flex items-center gap-3">
        <div className={clsx('p-1.5 rounded-lg', color.replace('text-', 'bg-').replace('400', '500/15'))}>
            <Icon size={14} className={color} />
        </div>
        <div>
            <div className="text-lg font-black text-white">{value}</div>
            <div className="text-[9px] font-bold uppercase tracking-wider text-white/40">{label}</div>
        </div>
    </div>
);

// ─── Job Row ──────────────────────────────────────────────────────────────────

const JobRow: React.FC<{
    job: ExportJob;
    onRemove: (id: string) => void;
    onCancel: (id: string) => void;
    onPriority: (id: string, priority: ExportPriority) => void;
}> = ({ job, onRemove, onCancel, onPriority }) => {
    const [expanded, setExpanded] = useState(false);
    const statusCfg = STATUS_CONFIG[job.status];
    const priorityCfg = PRIORITY_CONFIG[job.priority];
    const StatusIcon = statusCfg.icon;

    const isActive = job.status === 'queued' || job.status === 'rendering';
    const isDone = job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled';

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: -20, height: 0 }}
            className={clsx(
                'border rounded-lg overflow-hidden transition-all',
                job.status === 'rendering'
                    ? 'border-amber-500/30 bg-black/30'
                    : job.status === 'failed'
                        ? 'border-red-500/20 bg-black/20'
                        : 'border-white/8 bg-black/20',
            )}
        >
            {/* Main row */}
            <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/[0.03] transition-colors"
                onClick={() => setExpanded(!expanded)}
            >
                {/* Priority indicator */}
                <div className={clsx('w-2 h-2 rounded-full shrink-0', priorityCfg.dotColor)} />

                {/* Status icon */}
                <StatusIcon
                    size={14}
                    className={clsx(
                        statusCfg.color, 'shrink-0',
                        job.status === 'rendering' && 'animate-spin',
                    )}
                />

                {/* Name */}
                <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-white truncate">{job.name}</p>
                    <div className="flex items-center gap-2 text-[9px] text-white/30">
                        <span className="uppercase">{job.format} • {job.codec}</span>
                        <span>{job.resolution.width}×{job.resolution.height}</span>
                        <span>{job.fps}fps</span>
                    </div>
                </div>

                {/* Progress bar for rendering */}
                {job.status === 'rendering' && (
                    <div className="w-32 shrink-0">
                        <div className="flex justify-between text-[9px] mb-0.5">
                            <span className="text-amber-400 font-mono font-bold">{job.progress}%</span>
                            {job.estimatedTimeRemaining != null && (
                                <span className="text-white/30">{formatDuration(job.estimatedTimeRemaining)} left</span>
                            )}
                        </div>
                        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${job.progress}%` }}
                                transition={{ duration: 0.3 }}
                                className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full"
                            />
                        </div>
                    </div>
                )}

                {/* Status badge */}
                <span className={clsx(
                    'text-[9px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0',
                    statusCfg.bgColor, statusCfg.color,
                )}>
                    {statusCfg.label}
                </span>

                {/* Action buttons */}
                <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {isActive && (
                        <button
                            onClick={() => onCancel(job.id)}
                            className="p-1.5 rounded-lg hover:bg-red-500/10 text-white/30 hover:text-red-400 transition-colors"
                            title="Cancel"
                        >
                            <XCircle size={14} />
                        </button>
                    )}
                    {isDone && (
                        <button
                            onClick={() => onRemove(job.id)}
                            className="p-1.5 rounded-lg hover:bg-red-500/10 text-white/20 hover:text-red-400 transition-colors"
                            title="Remove"
                        >
                            <Trash2 size={13} />
                        </button>
                    )}
                </div>

                <ChevronDown
                    size={12}
                    className={clsx('text-white/20 transition-transform shrink-0', expanded && 'rotate-180')}
                />
            </div>

            {/* Expanded detail */}
            <AnimatePresence initial={false}>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="px-4 pb-4 pt-1 border-t border-white/5 space-y-3">
                            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[10px]">
                                <div className="flex justify-between">
                                    <span className="text-white/40">Output</span>
                                    <span className="text-white/60 font-mono truncate max-w-[200px]">{job.outputPath}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-white/40">Bitrate</span>
                                    <span className="text-white/60 font-mono">{job.bitrate || 'auto'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-white/40">Created</span>
                                    <span className="text-white/60 font-mono">{formatTimestamp(job.createdAt)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-white/40">Retries</span>
                                    <span className="text-white/60 font-mono">{job.retryCount}/{job.maxRetries}</span>
                                </div>
                                {job.fileSize != null && (
                                    <div className="flex justify-between">
                                        <span className="text-white/40">File Size</span>
                                        <span className="text-emerald-400 font-mono font-bold">{formatBytes(job.fileSize)}</span>
                                    </div>
                                )}
                                {job.error && (
                                    <div className="col-span-2 flex items-start gap-1.5 bg-red-500/10 border border-red-500/20 rounded-lg px-2 py-1.5">
                                        <AlertTriangle size={10} className="text-red-400 mt-0.5 shrink-0" />
                                        <span className="text-red-300">{job.error}</span>
                                    </div>
                                )}
                            </div>

                            {/* Priority controls */}
                            {isActive && (
                                <div className="space-y-1.5">
                                    <span className="text-[9px] font-bold uppercase tracking-wider text-white/30">Priority</span>
                                    <div className="flex gap-1.5">
                                        {(['low', 'normal', 'high', 'urgent'] as ExportPriority[]).map((p) => (
                                            <button
                                                key={p}
                                                onClick={() => onPriority(job.id, p)}
                                                className={clsx(
                                                    'flex-1 py-1.5 rounded-lg text-[9px] font-bold uppercase border transition-all',
                                                    job.priority === p
                                                        ? clsx(
                                                            PRIORITY_CONFIG[p].color,
                                                            'border-current bg-current/10',
                                                        )
                                                        : 'border-white/8 bg-white/5 text-white/30 hover:bg-white/10',
                                                )}
                                            >
                                                {PRIORITY_CONFIG[p].label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

// ─── Main Component ───────────────────────────────────────────────────────────

interface ExportQueuePanelProps {
    jobs: ExportJob[];
    onRemove: (id: string) => void;
    onCancel: (id: string) => void;
    onClearFinished: () => void;
    onSetPriority: (id: string, priority: ExportPriority) => void;
}

export const ExportQueuePanel: React.FC<ExportQueuePanelProps> = ({
    jobs,
    onRemove,
    onCancel,
    onClearFinished,
    onSetPriority,
}) => {
    // ── Stats ──
    const stats = useMemo<QueueStats>(() => {
        const s: QueueStats = { total: jobs.length, queued: 0, rendering: 0, completed: 0, failed: 0, cancelled: 0 };
        for (const job of jobs) {
            s[job.status] += 1;
        }
        return s;
    }, [jobs]);

    const hasFinished = stats.completed > 0 || stats.failed > 0 || stats.cancelled > 0;

    // ── Sort: rendering first, then queued (by priority desc), then completed/failed ──
    const sortedJobs = useMemo(() => {
        const statusOrder: Record<ExportStatus, number> = {
            rendering: 0,
            queued: 1,
            failed: 2,
            cancelled: 3,
            completed: 4,
        };
        const priorityOrder: Record<ExportPriority, number> = {
            urgent: 0,
            high: 1,
            normal: 2,
            low: 3,
        };
        return [...jobs].sort((a, b) => {
            const so = statusOrder[a.status] - statusOrder[b.status];
            if (so !== 0) return so;
            const po = priorityOrder[a.priority] - priorityOrder[b.priority];
            if (po !== 0) return po;
            return a.createdAt - b.createdAt;
        });
    }, [jobs]);

    return (
        <div className="w-full h-full overflow-y-auto custom-scrollbar">
            <div className="max-w-4xl mx-auto p-8 flex flex-col gap-6">
                {/* Header */}
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-gradient-to-br from-amber-500 to-red-600 rounded-lg shadow-lg">
                        <Download size={20} className="text-white drop-shadow-md" />
                    </div>
                    <div className="flex-1">
                        <h2 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
                            Export Queue
                            {stats.rendering > 0 && (
                                <span className="text-[10px] uppercase bg-amber-500/20 px-1.5 py-0.5 rounded text-amber-300 animate-pulse">
                                    {stats.rendering} Active
                                </span>
                            )}
                        </h2>
                        <p className="text-xs text-white/50">Manage batch rendering jobs with priority scheduling.</p>
                    </div>

                    {/* Clear finished */}
                    {hasFinished && (
                        <motion.button
                            whileHover={{ scale: 1.04 }}
                            whileTap={{ scale: 0.96 }}
                            onClick={onClearFinished}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-red-500/10 hover:border-red-500/30 text-xs font-bold text-white/50 hover:text-red-300 transition-all"
                        >
                            <Trash2 size={13} /> Clear Finished
                        </motion.button>
                    )}
                </div>

                {/* Stats bar */}
                <div className="grid grid-cols-5 gap-2">
                    <StatCard label="Total" value={stats.total} icon={Film} color="text-white/60" />
                    <StatCard label="Rendering" value={stats.rendering} icon={Loader2} color="text-amber-400" />
                    <StatCard label="Queued" value={stats.queued} icon={Clock} color="text-blue-400" />
                    <StatCard label="Completed" value={stats.completed} icon={CheckCircle2} color="text-emerald-400" />
                    <StatCard label="Failed" value={stats.failed} icon={AlertTriangle} color="text-red-400" />
                </div>

                {/* Job list */}
                <div className="space-y-2">
                    <AnimatePresence>
                        {sortedJobs.map((job) => (
                            <JobRow
                                key={job.id}
                                job={job}
                                onRemove={onRemove}
                                onCancel={onCancel}
                                onPriority={onSetPriority}
                            />
                        ))}
                    </AnimatePresence>
                </div>

                {/* Empty state */}
                {jobs.length === 0 && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex flex-col items-center justify-center py-20 text-center"
                    >
                        <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
                            <Download size={28} className="text-white/15" />
                        </div>
                        <p className="text-sm text-white/30 font-medium">No export jobs</p>
                        <p className="text-[10px] text-white/20 mt-1">
                            Add renders to the queue from the timeline or trailer generator.
                        </p>
                    </motion.div>
                )}
            </div>
        </div>
    );
};
