/**
 * Export Queue — Manages batch rendering with priority, retry, and progress tracking.
 * ═══════════════════════════════════════════════════════════════════════════════════════
 */

import { v4 as uuidv4 } from 'uuid';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExportPriority = 'low' | 'normal' | 'high' | 'urgent';
export type ExportStatus = 'queued' | 'rendering' | 'completed' | 'failed' | 'cancelled';

// ─── Export Job ───────────────────────────────────────────────────────────────

export interface ExportJob {
    id: string;
    name: string;
    priority: ExportPriority;
    status: ExportStatus;

    // What to render
    projectId: string;
    clipIds?: string[];           // specific clips, or all if undefined
    timeRange?: { startFrame: number; endFrame: number };  // section of timeline

    // Export settings
    outputPath: string;
    format: 'mp4' | 'mov' | 'webm' | 'gif';
    codec: 'h264' | 'h265' | 'prores' | 'vp9' | 'gif';
    resolution: { width: number; height: number };
    fps: number;
    bitrate?: string;             // e.g. '10M'
    quality?: number;             // CRF value

    // Progress tracking
    progress: number;             // 0-100
    startedAt?: number;           // epoch ms
    completedAt?: number;
    estimatedTimeRemaining?: number;  // seconds
    fileSize?: number;            // bytes

    // Error handling
    error?: string;
    retryCount: number;
    maxRetries: number;

    // Metadata
    createdAt: number;
    queuedAt: number;
}

// ─── Queue Stats ──────────────────────────────────────────────────────────────

export interface QueueStats {
    total: number;
    queued: number;
    rendering: number;
    completed: number;
    failed: number;
    cancelled: number;
}

// ─── Priority Weights ─────────────────────────────────────────────────────────

/** Numeric weight for sorting — higher value = processed first. */
const PRIORITY_WEIGHT: Record<ExportPriority, number> = {
    low: 0,
    normal: 1,
    high: 2,
    urgent: 3,
};

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a new export job with sensible defaults.
 *
 * Override any setting via the optional `options` bag — everything else falls
 * back to 1920×1080 H.264 MP4 at 30 fps, normal priority, and 3 max retries.
 */
export function createExportJob(
    name: string,
    outputPath: string,
    projectId: string,
    options?: Partial<Pick<ExportJob,
        | 'format'
        | 'codec'
        | 'resolution'
        | 'fps'
        | 'bitrate'
        | 'quality'
        | 'priority'
        | 'clipIds'
        | 'timeRange'
        | 'maxRetries'
    >>,
): ExportJob {
    const now = Date.now();

    return {
        id: uuidv4(),
        name,
        priority: options?.priority ?? 'normal',
        status: 'queued',

        projectId,
        clipIds: options?.clipIds,
        timeRange: options?.timeRange,

        outputPath,
        format: options?.format ?? 'mp4',
        codec: options?.codec ?? 'h264',
        resolution: options?.resolution ?? { width: 1920, height: 1080 },
        fps: options?.fps ?? 30,
        bitrate: options?.bitrate,
        quality: options?.quality,

        progress: 0,

        error: undefined,
        retryCount: 0,
        maxRetries: options?.maxRetries ?? 3,

        createdAt: now,
        queuedAt: now,
    };
}

// ─── Export Queue Manager ─────────────────────────────────────────────────────

/**
 * Manages an ordered queue of {@link ExportJob}s with priority scheduling,
 * automatic retry on failure, and reactive listener notifications.
 */
export class ExportQueueManager {
    private jobs: ExportJob[] = [];
    private listeners: Set<(jobs: ExportJob[]) => void> = new Set();

    // ── Mutations ─────────────────────────────────────────────────────────

    /** Add a job to the queue. */
    enqueue(job: ExportJob): void {
        this.jobs.push(job);
        this.notify();
    }

    /** Remove a job from the queue entirely. */
    remove(jobId: string): void {
        this.jobs = this.jobs.filter((j) => j.id !== jobId);
        this.notify();
    }

    /** Cancel a running or queued job. */
    cancel(jobId: string): void {
        const job = this.findJob(jobId);
        if (!job) return;

        if (job.status === 'queued' || job.status === 'rendering') {
            job.status = 'cancelled';
            job.completedAt = Date.now();
            this.notify();
        }
    }

    // ── Scheduling ────────────────────────────────────────────────────────

    /**
     * Get the next job to process.
     *
     * Selection order:
     * 1. Highest priority (urgent > high > normal > low)
     * 2. Oldest `createdAt` timestamp (FIFO within the same priority)
     *
     * Only jobs with status `'queued'` are considered.
     */
    getNext(): ExportJob | undefined {
        const queued = this.jobs.filter((j) => j.status === 'queued');
        if (queued.length === 0) return undefined;

        queued.sort((a, b) => {
            const pw = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
            if (pw !== 0) return pw;
            return a.createdAt - b.createdAt;
        });

        return queued[0];
    }

    // ── Job Updates ───────────────────────────────────────────────────────

    /** Update a job's fields. Merges `updates` onto the existing job. */
    updateJob(jobId: string, updates: Partial<ExportJob>): void {
        const job = this.findJob(jobId);
        if (!job) return;

        Object.assign(job, updates);
        this.notify();
    }

    /**
     * Mark a job as failed, potentially scheduling a retry.
     *
     * If `retryCount < maxRetries` the job is re-queued with an incremented
     * retry counter and the method returns `true`. Otherwise the job stays
     * in `'failed'` status and `false` is returned.
     */
    markFailed(jobId: string, error: string): boolean {
        const job = this.findJob(jobId);
        if (!job) return false;

        job.error = error;
        job.retryCount += 1;

        if (job.retryCount < job.maxRetries) {
            job.status = 'queued';
            job.progress = 0;
            job.startedAt = undefined;
            this.notify();
            return true;
        }

        job.status = 'failed';
        job.completedAt = Date.now();
        this.notify();
        return false;
    }

    /** Mark a job as successfully completed. */
    markCompleted(jobId: string, fileSize?: number): void {
        const job = this.findJob(jobId);
        if (!job) return;

        job.status = 'completed';
        job.progress = 100;
        job.completedAt = Date.now();
        if (fileSize !== undefined) {
            job.fileSize = fileSize;
        }
        this.notify();
    }

    // ── Queries ───────────────────────────────────────────────────────────

    /** Get a shallow copy of all jobs. */
    getJobs(): ExportJob[] {
        return [...this.jobs];
    }

    /** Get aggregate queue statistics. */
    getStats(): QueueStats {
        const stats: QueueStats = {
            total: this.jobs.length,
            queued: 0,
            rendering: 0,
            completed: 0,
            failed: 0,
            cancelled: 0,
        };

        for (const job of this.jobs) {
            stats[job.status] += 1;
        }

        return stats;
    }

    // ── Housekeeping ──────────────────────────────────────────────────────

    /** Remove all completed, failed, and cancelled jobs from the queue. */
    clearFinished(): void {
        this.jobs = this.jobs.filter(
            (j) => j.status !== 'completed' && j.status !== 'failed' && j.status !== 'cancelled',
        );
        this.notify();
    }

    // ── Subscriptions ─────────────────────────────────────────────────────

    /**
     * Subscribe to queue changes.
     *
     * The listener is called with a snapshot of all jobs whenever the queue
     * is mutated. Returns an unsubscribe function.
     */
    subscribe(listener: (jobs: ExportJob[]) => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    // ── Priority ──────────────────────────────────────────────────────────

    /** Change a job's priority. */
    setPriority(jobId: string, priority: ExportPriority): void {
        const job = this.findJob(jobId);
        if (!job) return;

        job.priority = priority;
        this.notify();
    }

    // ── Internals ─────────────────────────────────────────────────────────

    /** Find a job by id, or `undefined`. */
    private findJob(jobId: string): ExportJob | undefined {
        return this.jobs.find((j) => j.id === jobId);
    }

    /** Notify all listeners with a snapshot of the current queue. */
    private notify(): void {
        const snapshot = this.getJobs();
        for (const listener of this.listeners) {
            listener(snapshot);
        }
    }
}
