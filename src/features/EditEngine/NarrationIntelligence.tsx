/**
 * Narration Intelligence — Upload, preview, and analyze voiceover/narration
 * ════════════════════════════════════════════════════════════════════════════
 * Mirrors Beat Intelligence's visual language: dark panels, teal accent,
 * canvas waveform, stat grid, section chips, and merge-strategy selector.
 *
 * Accepts narration audio + optional transcript, renders analysis results,
 * and exposes a merge-strategy picker when beat intelligence coexists.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    Mic, Play, Pause, Square, Loader2, Trash2,
    FileText, Scissors, BarChart3, Type, Upload,
    Clock, Zap, Activity,
} from 'lucide-react';
import clsx from 'clsx';

// ─── Types from analysis modules ─────────────────────────────────────────────
import type {
    NarrationAnalysisResult,
    NarrationPhrase,
    NarrationSection,
    SpeechRegion,
    EmphasisPoint,
} from '../../lib/narrationAnalysis';
import type { MergeStrategy } from '../../lib/intelligenceMerger';

// ─── Props ───────────────────────────────────────────────────────────────────

interface NarrationIntelligenceProps {
    narrationFile: string | null;
    narrationName: string | null;
    narrationUrl: string | null;
    transcript: string | null;
    analysis: NarrationAnalysisResult | null;
    isAnalyzing: boolean;
    onUpload: (file: File) => void;
    onTranscriptChange: (text: string) => void;
    onAnalyze: () => void;
    onRemove: () => void;
    /** Current merge strategy (shown when beat intelligence is also active) */
    mergeStrategy?: MergeStrategy;
    onMergeStrategyChange?: (strategy: MergeStrategy) => void;
    /** true when beat analysis also exists */
    hasBeatIntelligence?: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ACCEPTED_AUDIO = '.mp3,.wav,.m4a,.ogg,.flac';

const SECTION_COLORS: Record<NarrationSection['type'], { bg: string; text: string; border: string }> = {
    intro:      { bg: 'bg-emerald-500/20', text: 'text-emerald-300', border: 'border-emerald-500/30' },
    argument:   { bg: 'bg-blue-500/20',    text: 'text-blue-300',    border: 'border-blue-500/30' },
    example:    { bg: 'bg-purple-500/20',   text: 'text-purple-300',  border: 'border-purple-500/30' },
    transition: { bg: 'bg-amber-500/20',    text: 'text-amber-300',   border: 'border-amber-500/30' },
    climax:     { bg: 'bg-red-500/20',      text: 'text-red-300',     border: 'border-red-500/30' },
    conclusion: { bg: 'bg-gray-500/20',     text: 'text-gray-300',    border: 'border-gray-500/30' },
};

const MERGE_OPTIONS: Array<{ key: MergeStrategy; label: string; desc: string }> = [
    { key: 'narration-leads', label: 'Narration Leads', desc: 'Cuts on phrases, music fills gaps' },
    { key: 'music-leads',     label: 'Music Leads',     desc: 'Cuts on beats, narration rides over' },
    { key: 'balanced',        label: 'Balanced',        desc: 'Nearest natural boundary' },
    { key: 'ducking',         label: 'Ducking',         desc: 'Music ducks under speech' },
];

// ─── Utility ─────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = (seconds % 60).toFixed(1);
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// ─── Waveform Renderer ──────────────────────────────────────────────────────

function drawNarrationWaveform(
    canvas: HTMLCanvasElement,
    analysis: NarrationAnalysisResult,
) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    const dur = analysis.duration;
    if (dur <= 0) return;

    const toX = (t: number) => (t / dur) * width;

    // Clear
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);

    // Speech regions — filled teal bars
    ctx.fillStyle = 'rgba(20, 184, 166, 0.30)'; // teal-500/30
    for (const region of analysis.speechRegions) {
        const x = toX(region.start);
        const w = toX(region.end) - x;
        const barH = height * 0.6 * Math.max(0.3, region.avgEnergy);
        const y = (height - barH) / 2;
        ctx.fillRect(x, y, Math.max(1, w), barH);
    }

    // Silence regions — dim subtle bars
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    for (const region of analysis.silenceRegions) {
        const x = toX(region.start);
        const w = toX(region.end) - x;
        ctx.fillRect(x, height * 0.35, Math.max(1, w), height * 0.3);
    }

    // Phrase boundary markers — vertical dashed lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.20)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    for (const phrase of analysis.phrases) {
        const x = toX(phrase.start);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }
    ctx.setLineDash([]);

    // Emphasis points — bright dots sized by intensity
    for (const point of analysis.emphasisPoints) {
        const x = toX(point.time);
        const radius = 4 + point.intensity * 6; // 4-10px
        ctx.beginPath();
        ctx.arc(x, height / 2, radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(45, 212, 191, ${0.5 + point.intensity * 0.5})`; // teal-400
        ctx.fill();
    }

    // Cut points — amber diamond markers
    ctx.fillStyle = 'rgba(245, 158, 11, 0.8)'; // amber-500
    for (const cp of analysis.cutPoints) {
        const x = toX(cp);
        const size = 5;
        ctx.beginPath();
        ctx.moveTo(x, height - size * 2);
        ctx.lineTo(x + size, height - size);
        ctx.lineTo(x, height);
        ctx.lineTo(x - size, height - size);
        ctx.closePath();
        ctx.fill();
    }
}

// ─── Component ───────────────────────────────────────────────────────────────

export const NarrationIntelligence: React.FC<NarrationIntelligenceProps> = ({
    narrationFile,
    narrationName,
    narrationUrl,
    transcript,
    analysis,
    isAnalyzing,
    onUpload,
    onTranscriptChange,
    onAnalyze,
    onRemove,
    mergeStrategy,
    onMergeStrategyChange,
    hasBeatIntelligence,
}) => {
    // ── Refs ─────────────────────────────────────────────────────────────
    const fileInputRef = useRef<HTMLInputElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const dropZoneRef = useRef<HTMLDivElement>(null);

    // ── Local state ──────────────────────────────────────────────────────
    const [isPlaying, setIsPlaying] = useState(false);
    const [isDraggingOver, setIsDraggingOver] = useState(false);

    // ── Audio playback ───────────────────────────────────────────────────
    const togglePlay = useCallback(() => {
        const el = audioRef.current;
        if (!el) return;
        if (el.paused) {
            el.play().catch(() => {});
            setIsPlaying(true);
        } else {
            el.pause();
            setIsPlaying(false);
        }
    }, []);

    const stopPlayback = useCallback(() => {
        const el = audioRef.current;
        if (!el) return;
        el.pause();
        el.currentTime = 0;
        setIsPlaying(false);
    }, []);

    // Sync playing state with audio element events
    useEffect(() => {
        const el = audioRef.current;
        if (!el) return;
        const onEnded = () => setIsPlaying(false);
        const onPause = () => setIsPlaying(false);
        el.addEventListener('ended', onEnded);
        el.addEventListener('pause', onPause);
        return () => {
            el.removeEventListener('ended', onEnded);
            el.removeEventListener('pause', onPause);
        };
    }, [narrationUrl]);

    // ── Waveform drawing ─────────────────────────────────────────────────
    useEffect(() => {
        if (canvasRef.current && analysis) {
            drawNarrationWaveform(canvasRef.current, analysis);
        }
    }, [analysis]);

    // ── File handling ────────────────────────────────────────────────────
    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) onUpload(file);
        // Reset so re-selecting the same file works
        if (fileInputRef.current) fileInputRef.current.value = '';
    }, [onUpload]);

    const handleUploadClick = useCallback(() => {
        fileInputRef.current?.click();
    }, []);

    // ── Drag-and-drop ────────────────────────────────────────────────────
    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDraggingOver(true);
    }, []);

    const handleDragLeave = useCallback(() => {
        setIsDraggingOver(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDraggingOver(false);
        const file = e.dataTransfer.files[0];
        if (file) onUpload(file);
    }, [onUpload]);

    // ── Derived ──────────────────────────────────────────────────────────
    const hasFile = !!narrationFile || !!narrationUrl;
    const charCount = transcript?.length ?? 0;

    // ── Render ───────────────────────────────────────────────────────────
    return (
        <div className="border border-white/5 rounded-xl bg-black/20 p-5 space-y-4">
            {/* ═══ Header Row ═══ */}
            <div className="flex items-center gap-2">
                <Mic size={16} className={hasFile ? 'text-teal-400' : 'text-white/40'} />
                <span className="text-sm font-bold text-white">Narration Intelligence</span>
                {hasFile && (
                    <span className="text-[10px] bg-teal-500/20 text-teal-300 px-2 py-0.5 rounded-full font-bold ml-auto animate-pulse">
                        Active
                    </span>
                )}
                {analysis && (
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-bold">
                        {Math.round(analysis.averageWPM)} WPM
                    </span>
                )}
            </div>

            <p className="text-[10px] text-white/40">
                Upload narration audio for intelligent phrase detection, emphasis mapping, and speech-aware cut points.
            </p>

            {/* ═══ Hidden audio element ═══ */}
            {narrationUrl && (
                <audio ref={audioRef} src={narrationUrl} preload="metadata" />
            )}

            {/* ═══ Hidden file input ═══ */}
            <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_AUDIO}
                onChange={handleFileSelect}
                className="hidden"
            />

            {/* ═══ Upload Zone (no file loaded) ═══ */}
            {!hasFile && (
                <div
                    ref={dropZoneRef}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={handleUploadClick}
                    className={clsx(
                        'flex flex-col items-center justify-center gap-2 py-6 border border-dashed rounded-lg cursor-pointer transition-all text-xs font-bold',
                        isDraggingOver
                            ? 'border-teal-500/60 bg-teal-500/10 text-teal-300'
                            : 'border-white/20 hover:border-teal-500/50 hover:bg-teal-500/10 text-white/50 hover:text-white'
                    )}
                >
                    <Upload size={20} className={isDraggingOver ? 'text-teal-400' : ''} />
                    <span>{isDraggingOver ? 'Drop audio file here' : 'Upload Narration'}</span>
                    <span className="text-[9px] text-white/25 font-normal">
                        MP3, WAV, M4A, OGG, FLAC
                    </span>
                </div>
            )}

            {/* ═══ File Loaded State ═══ */}
            {hasFile && (
                <div className="flex items-center justify-between bg-white/5 p-3 rounded-lg border border-white/10">
                    <div className="flex items-center gap-3 overflow-hidden">
                        <button
                            onClick={togglePlay}
                            className="p-2 bg-teal-500/20 rounded-full text-white hover:text-teal-400 transition-colors"
                        >
                            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                        </button>
                        <button
                            onClick={stopPlayback}
                            className="p-2 bg-white/5 rounded-full text-white/50 hover:text-red-400 transition-colors"
                        >
                            <Square size={14} />
                        </button>
                        <div className="flex items-center gap-2 truncate">
                            <FileText size={14} className="text-teal-400 flex-shrink-0" />
                            <span className="text-xs font-bold text-white truncate">
                                {narrationName || narrationFile || 'Narration'}
                            </span>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={onAnalyze}
                            disabled={isAnalyzing}
                            className="p-2 bg-teal-500/20 hover:bg-teal-500/40 rounded transition-colors text-teal-300 flex items-center gap-1 text-[10px] font-bold"
                        >
                            {isAnalyzing
                                ? <Loader2 size={14} className="animate-spin" />
                                : <Zap size={14} />}
                            {!analysis ? 'Analyze' : 'Re-Analyze'}
                        </button>
                        <button
                            onClick={() => { stopPlayback(); onRemove(); }}
                            className="p-2 bg-red-500/20 hover:bg-red-500/40 rounded text-red-400 transition-colors"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                </div>
            )}

            {/* ═══ Transcript Input ═══ */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/40 flex items-center gap-1.5">
                        <Type size={10} />
                        Transcript
                    </label>
                    {charCount > 0 && (
                        <span className="text-[9px] bg-white/5 text-white/30 px-2 py-0.5 rounded-full font-mono">
                            {charCount.toLocaleString()} chars
                        </span>
                    )}
                </div>
                <textarea
                    value={transcript ?? ''}
                    onChange={(e) => onTranscriptChange(e.target.value)}
                    placeholder="Paste transcript here (optional — improves phrase detection and keyword extraction)"
                    rows={3}
                    className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-xs text-white placeholder:text-white/20 resize-none focus:outline-none focus:border-teal-500/40 transition-colors"
                />
                {!transcript && (
                    <p className="text-[9px] text-white/25 italic">
                        No transcript — audio-only analysis will detect pauses and emphasis
                    </p>
                )}
            </div>

            {/* ═══ Waveform Canvas ═══ */}
            {analysis && (
                <div className="relative">
                    <canvas
                        ref={canvasRef}
                        width={800}
                        height={120}
                        className="w-full rounded-lg border border-white/5"
                        style={{ height: '120px' }}
                    />
                    {/* Legend overlay */}
                    <div className="absolute bottom-1.5 right-2 flex items-center gap-3 text-[8px] text-white/30">
                        <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-sm bg-teal-500/50 inline-block" />
                            Speech
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-teal-400 inline-block" />
                            Emphasis
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="w-2 h-2 bg-amber-500 inline-block" style={{ clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' }} />
                            Cut
                        </span>
                    </div>
                </div>
            )}

            {/* ═══ Stats Grid (2×3) ═══ */}
            {analysis && (
                <div className="grid grid-cols-3 gap-2">
                    {[
                        {
                            label: 'WPM',
                            value: Math.round(analysis.averageWPM).toString(),
                            sub: 'avg speaking rate',
                            Icon: Activity,
                        },
                        {
                            label: 'Phrases',
                            value: analysis.phrases.length.toString(),
                            sub: `${analysis.phrases.filter(p => p.text).length} with text`,
                            Icon: FileText,
                        },
                        {
                            label: 'Sections',
                            value: analysis.sections.length.toString(),
                            sub: analysis.sections.map(s => s.type).filter((v, i, a) => a.indexOf(v) === i).join(', ') || '—',
                            Icon: BarChart3,
                        },
                        {
                            label: 'Duration',
                            value: formatDuration(analysis.duration),
                            sub: `${(analysis.duration / 60).toFixed(1)} min`,
                            Icon: Clock,
                        },
                        {
                            label: 'Cut Points',
                            value: analysis.cutPoints.length.toString(),
                            sub: `${analysis.cutPoints.length} total`,
                            Icon: Scissors,
                        },
                        {
                            label: 'Emphasis',
                            value: analysis.emphasisPoints.length.toString(),
                            sub: `${analysis.emphasisPoints.filter(e => e.intensity > 0.7).length} strong`,
                            Icon: Zap,
                        },
                    ].map(stat => (
                        <div key={stat.label} className="bg-black/40 rounded-lg p-2.5 border border-white/5">
                            <div className="flex items-center gap-1.5">
                                <stat.Icon size={10} className="text-teal-400/60" />
                                <span className="text-[9px] font-black uppercase text-white/30 tracking-widest">
                                    {stat.label}
                                </span>
                            </div>
                            <div className="text-sm font-black text-white mt-0.5">{stat.value}</div>
                            <div className="text-[9px] text-white/20 truncate">{stat.sub}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* ═══ Section Chips ═══ */}
            {analysis && analysis.sections.length > 0 && (
                <div className="space-y-2">
                    <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider">
                        Detected Sections
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                        {analysis.sections.map((sec, i) => {
                            const colors = SECTION_COLORS[sec.type] || SECTION_COLORS.conclusion;
                            return (
                                <span
                                    key={i}
                                    className={clsx(
                                        'px-2 py-1 rounded-md text-[10px] font-bold uppercase border transition-all',
                                        colors.bg, colors.text, colors.border,
                                    )}
                                >
                                    {sec.type}
                                    <span className="opacity-50 font-mono ml-1">
                                        {(sec.end - sec.start).toFixed(1)}s
                                    </span>
                                </span>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ═══ Intelligence Merge Strategy ═══ */}
            {hasBeatIntelligence && onMergeStrategyChange && (
                <div className="space-y-2 pt-2 border-t border-white/5">
                    <div className="flex items-center gap-2">
                        <span className="text-sm">🔀</span>
                        <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider">
                            Intelligence Merge
                        </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                        {MERGE_OPTIONS.map(opt => {
                            const isActive = mergeStrategy === opt.key;
                            return (
                                <button
                                    key={opt.key}
                                    onClick={() => onMergeStrategyChange(opt.key)}
                                    className={clsx(
                                        'flex flex-col px-3 py-2 rounded-lg text-left transition-all border',
                                        isActive
                                            ? 'bg-teal-500/20 border-teal-500/40 text-teal-300'
                                            : 'bg-black/30 border-white/5 text-white/40 hover:text-white/60 hover:border-white/10'
                                    )}
                                >
                                    <span className="text-[10px] font-bold">{opt.label}</span>
                                    <span className="text-[8px] opacity-60 mt-0.5">{opt.desc}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default NarrationIntelligence;
