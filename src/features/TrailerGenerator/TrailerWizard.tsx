import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useMediaStore } from '../../store/mediaStore';
import { TrailerSettings, DEFAULT_TRAILER_SETTINGS } from '../../lib/trailerGenerator';
import { Wand2, Clock, Zap, Video, Scissors, PlayCircle, Music, Upload, Play, Pause, Trash2, Loader2, Sparkles, Smartphone, Monitor, Square, ArrowLeftRight, Layers } from 'lucide-react';
import { analyzeAudio, AudioAnalysisResult, SegmentType as _SegmentType } from '../../lib/audioAnalysis';
import clsx from 'clsx';

interface SliderProps {
    label: string; icon: React.ElementType; value: number;
    min: number; max: number; step: number;
    onChange: (v: number) => void; unit?: string; disabled?: boolean;
}

const SliderControl: React.FC<SliderProps> = ({ label, icon: Icon, value, min, max, step, onChange, unit = 's', disabled }) => (
    <div className={clsx("flex flex-col gap-2", disabled && "opacity-50 pointer-events-none")}>
        <div className="flex justify-between items-center text-xs font-bold uppercase tracking-wider text-white/70">
            <span className="flex items-center gap-1.5"><Icon size={12} /> {label}</span>
            <span className="text-primary font-mono">{parseFloat(String(value)).toFixed(1)}{unit}</span>
        </div>
        <input type="range" min={min} max={max} step={step} value={value}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className="w-full accent-primary h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer" />
        <div className="flex justify-between text-[10px] text-white/30 font-mono">
            <span>{min}{unit}</span><span>{max}{unit}</span>
        </div>
    </div>
);

interface WizardProps {
    onGenerate: (settings: TrailerSettings) => void;
}

export const TrailerWizard: React.FC<WizardProps> = ({ onGenerate }) => {
    const { files, orientationFilter, setOrientationFilter, selectedFileIds, preloadedAudioPath, preloadedAudioName, setPreloadedAudio } = useMediaStore();

    const [settings, setSettings] = useState<TrailerSettings>(() => {
        try {
            const saved = localStorage.getItem('mmm_trailer_settings');
            if (saved) {
                const parsed = JSON.parse(saved);
                delete parsed.audioAnalysis;
                return { ...DEFAULT_TRAILER_SETTINGS, ...parsed };
            }
        } catch {}
        return { ...DEFAULT_TRAILER_SETTINGS };
    });

    const [_audioFile, setAudioFile] = useState<File | null>(null);
    const [audioPlaying, setAudioPlaying] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [audioTrimStart, setAudioTrimStart] = useState<number>(0);
    const [audioTrimEnd, setAudioTrimEnd] = useState<number>(30);
    const [audioAnalysis, setAudioAnalysis] = useState<AudioAnalysisResult | null>(null);

    const audioRef = useRef<HTMLAudioElement>(null);
    const _audioInputRef = useRef<HTMLInputElement>(null);
    const waveformRef = useRef<HTMLCanvasElement>(null);
    const bestSegmentCycleRef = useRef<Record<number, number>>({});

    const [audioHistory, setAudioHistory] = useState<Array<{name: string; path: string}>>(() => {
        try {
            const saved = localStorage.getItem('mmm_audio_history');
            return saved ? JSON.parse(saved) : [];
        } catch { return []; }
    });
    const [showAudioHistory, setShowAudioHistory] = useState(false);
    const audioHistoryRef = useRef<HTMLDivElement>(null);

    const [isDragging, setIsDragging] = useState<'start' | 'end' | 'move' | null>(null);
    const [dragStartPos, setDragStartPos] = useState<number>(0);
    const [audioCurrentTime, setAudioCurrentTime] = useState<number>(0);
    const [analysisToast, setAnalysisToast] = useState<boolean>(false);
    const waveformWrapperRef = useRef<HTMLDivElement>(null);

    const [customSpeedEnabled, setCustomSpeedEnabled] = useState(false);

    // Restore persisted audio URL on mount
    const audioRestoredRef = useRef(false);
    useEffect(() => {
        if (audioRestoredRef.current) return;
        if (settings.audioUrl && settings.useAudioGuide && !audioUrl) {
            audioRestoredRef.current = true;
            setAudioUrl(settings.audioUrl);
            setAudioTrimStart(settings.audioTrimStart ?? 0);
            setAudioTrimEnd(settings.audioTrimEnd ?? 30);
        }
    }, []);

    useEffect(() => {
        if (!showAudioHistory) return;
        const handler = (e: MouseEvent) => {
            if (audioHistoryRef.current && !audioHistoryRef.current.contains(e.target as Node)) setShowAudioHistory(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showAudioHistory]);




    const preloadConsumedRef = useRef(false);
    useEffect(() => {
        if (preloadConsumedRef.current) return;
        if (!preloadedAudioPath || settings.useAudioGuide) return;
        preloadConsumedRef.current = true;

        const url = `file://${preloadedAudioPath}`;
        setAudioUrl(url);
        setAudioTrimStart(0);
        setAudioTrimEnd(30);
        update({
            audioFile: preloadedAudioName || 'Audio',
            audioUrl: url,
            audioFilePath: preloadedAudioPath,
            useAudioGuide: true,
            audioTrimStart: 0,
            audioTrimEnd: 30,
        });
        addToAudioHistory(preloadedAudioName || 'Audio', preloadedAudioPath);

        setPreloadedAudio(null, null);
    }, [preloadedAudioPath]);

    const TRANSIENT_KEYS = new Set(['audioAnalysis']);
    const update = (patch: Partial<TrailerSettings>) => setSettings(s => {
        const next = { ...s, ...patch };
        try {
            const persistable = { ...next };
            for (const key of TRANSIENT_KEYS) delete (persistable as any)[key];
            localStorage.setItem('mmm_trailer_settings', JSON.stringify(persistable));
        } catch {}
        return next;
    });

    const activePool = selectedFileIds.length > 0
        ? files.filter(f => selectedFileIds.includes(f.id))
        : files;
    const videoCount = activePool.filter(f => f.type === 'video').length;
    const audioCount = activePool.filter(f => f.type === 'audio').length;
    const hCount = activePool.filter(f => f.orientation === 'horizontal').length;
    const vCount = activePool.filter(f => f.orientation === 'vertical').length;
    const sqCount = activePool.filter(f => f.orientation === 'square').length;
    const hasMediaSelection = selectedFileIds.length > 0;

    const filteredVideoCount = orientationFilter === 'all'
        ? videoCount
        : activePool.filter(f => f.type === 'video' && f.orientation === orientationFilter).length;

    const handleAudioUpload = async () => {
        if (!window.ipcRenderer?.selectFiles) {
            console.error('[TrailerWizard] IPC not available for audio picker');
            return;
        }
        const result = await window.ipcRenderer.selectFiles('audio');
        if (!result.success || !result.files?.length) return;

        const picked = result.files[0];
        const filePath = picked.path;
        const url = `file://${filePath}`;

        if (audioUrl && audioUrl.startsWith('blob:')) URL.revokeObjectURL(audioUrl);
        setAudioFile(null);
        setAudioUrl(url);
        update({ audioFile: picked.filename, audioUrl: url, audioFilePath: filePath, useAudioGuide: true });
        addToAudioHistory(picked.filename, filePath);
    };

    const handleAudioLoaded = () => {
        const dur = audioRef.current?.duration || 0;
        // Don't overwrite trim if we restored from persisted settings
        if (audioRestoredRef.current && settings.audioTrimStart != null && settings.audioTrimEnd != null && settings.audioTrimEnd > 0) {
            // Already restored — only update duration ceiling
            audioRestoredRef.current = false; // consume the flag
            return;
        }
        setAudioTrimEnd(dur);
        update({ audioTrimStart: 0, audioTrimEnd: dur });
    };

    const addToAudioHistory = (name: string, path: string) => {
        setAudioHistory(prev => {
            const filtered = prev.filter(h => h.path !== path);
            const next = [{ name, path }, ...filtered].slice(0, 10);
            try { localStorage.setItem('mmm_audio_history', JSON.stringify(next)); } catch {}
            return next;
        });
    };

    const handleRemoveAudio = () => {
        if (audioUrl && audioUrl.startsWith('blob:')) URL.revokeObjectURL(audioUrl);
        setAudioFile(null); setAudioUrl(null); setAudioAnalysis(null);
        setAudioTrimStart(0); setAudioTrimEnd(30);
        update({ audioUrl: null, audioFile: null, audioFilePath: undefined, useAudioGuide: false, audioAnalysis: null, audioTrimStart: undefined, audioTrimEnd: undefined });
    };

    const handleRandomizeBeat = async () => {
        if (!audioUrl) return;
        setIsAnalyzing(true);
        try {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            let arrayBuffer: ArrayBuffer;
            if (audioUrl.startsWith('file:')) {
                // file:// URLs can't be fetched in Electron renderer — use IPC
                // Handle all variants: file:///C:/..., file://C:\..., file:/C:\...
                const filePath = decodeURIComponent(audioUrl.replace(/^file:\/{0,3}/, ''));
                const result = await window.ipcRenderer.readFileBuffer(filePath);
                if (!result?.success || !result.buffer) {
                    throw new Error(`Failed to read audio file: ${result?.error || 'unknown error'}`);
                }
                // IPC structured clone delivers Node Buffer as Uint8Array — get its underlying ArrayBuffer
                const raw = result.buffer;
                arrayBuffer = raw.buffer instanceof ArrayBuffer
                    ? raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)
                    : new Uint8Array(raw).buffer;
            } else {
                const response = await fetch(audioUrl);
                arrayBuffer = await response.arrayBuffer();
            }
            const decoded = await ctx.decodeAudioData(arrayBuffer);
            const result = await analyzeAudio(decoded, settings.beatSensitivity ?? 0.5);
            setAudioAnalysis(result);
            update({ audioAnalysis: result });
            
            const dropSeg = result.segments.find(s => s.type === 'drop');
            if (dropSeg) {
                const start = Math.max(0, dropSeg.start - (Math.random() * 2));
                const end = Math.min(start + settings.targetDuration, result.duration);
                setAudioTrimStart(start);
                setAudioTrimEnd(end);
                update({ audioTrimStart: start, audioTrimEnd: end });
            }
            
            setAnalysisToast(true);
            setTimeout(() => setAnalysisToast(false), 2000);
            await ctx.close();
        } catch (e) { console.warn(e); }
        finally { setIsAnalyzing(false); }
    };

    const toggleAudio = () => {
        if (!audioRef.current) return;
        if (audioPlaying) { audioRef.current.pause(); setAudioPlaying(false); }
        else {
            if (audioRef.current.currentTime < audioTrimStart || audioRef.current.currentTime >= audioTrimEnd) {
                audioRef.current.currentTime = audioTrimStart;
            }
            audioRef.current.play().catch(() => {});
            setAudioPlaying(true);
        }
    };

    const stopAudio = () => {
        if (!audioRef.current) return;
        audioRef.current.pause();
        audioRef.current.currentTime = audioTrimStart;
        setAudioCurrentTime(audioTrimStart);
        setAudioPlaying(false);
    };

    useEffect(() => {
        if (!audioRef.current || !audioPlaying) return;
        let raf: number;
        const loop = () => {
            if (audioRef.current) {
                const ct = audioRef.current.currentTime;
                setAudioCurrentTime(ct);
                if (ct >= audioTrimEnd) {
                    audioRef.current.pause();
                    audioRef.current.currentTime = audioTrimStart;
                    setAudioCurrentTime(audioTrimStart);
                    setAudioPlaying(false);
                } else {
                    raf = requestAnimationFrame(loop);
                }
            }
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, [audioPlaying, audioTrimEnd, audioTrimStart]);

    useEffect(() => {
        if (!isDragging || !audioAnalysis || !waveformWrapperRef.current) return;
        
        const handleMouseMove = (e: MouseEvent) => {
            const rect = waveformWrapperRef.current!.getBoundingClientRect();
            let x = e.clientX - rect.left;
            x = Math.max(0, Math.min(x, rect.width));
            const time = (x / rect.width) * audioAnalysis.duration;
            
            if (isDragging === 'start') {
                if (time < audioTrimEnd) { setAudioTrimStart(time); update({ audioTrimStart: time }); }
            } else if (isDragging === 'end') {
                if (time > audioTrimStart) { setAudioTrimEnd(time); update({ audioTrimEnd: time }); }
            } else if (isDragging === 'move') {
                const dur = audioTrimEnd - audioTrimStart;
                let newStart = time - dragStartPos;
                if (newStart < 0) newStart = 0;
                if (newStart + dur > audioAnalysis.duration) newStart = audioAnalysis.duration - dur;
                setAudioTrimStart(newStart);
                setAudioTrimEnd(newStart + dur);
                update({ audioTrimStart: newStart, audioTrimEnd: newStart + dur });
            }
        };
        
        const handleMouseUp = () => setIsDragging(null);
        
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, audioAnalysis, audioTrimStart, audioTrimEnd, dragStartPos]);

    const autoSelectBestSegment = (targetDur: number) => {
        if (!audioAnalysis || audioAnalysis.segments.length === 0) return;
        const segs = audioAnalysis.segments;
        const priority: Record<string, number> = { drop: 8, chorus: 7, buildup: 6, verse: 5, bridge: 4, intro: 3, breakdown: 2, outro: 1 };
        const scored = segs.map(s => ({
            ...s,
            score: (priority[s.type] || 1) * s.avgEnergy,
            dur: s.end - s.start,
        })).sort((a, b) => b.score - a.score);

        const cycleKey = targetDur;
        const prevIdx = bestSegmentCycleRef.current[cycleKey] ?? -1;
        const nextIdx = (prevIdx + 1) % scored.length;
        bestSegmentCycleRef.current[cycleKey] = nextIdx;

        const best = scored[nextIdx];
        if (best) {
            const segMid = (best.start + best.end) / 2;
            const halfDur = targetDur / 2;
            const start = Math.max(0, Math.min(segMid - halfDur, audioAnalysis.duration - targetDur));
            const end = Math.min(start + targetDur, audioAnalysis.duration);
            setAudioTrimStart(start);
            setAudioTrimEnd(end);
            update({ audioTrimStart: start, audioTrimEnd: end });
        }
    };

    const handleSegmentClick = (seg: { start: number; end: number }) => {
        const isIncluded = audioTrimStart <= seg.start && audioTrimEnd >= seg.end;
        if (isIncluded) {
            if (!audioAnalysis) return;
            const remaining = audioAnalysis.segments.filter(s => {
                if (s.start === seg.start && s.end === seg.end) return false;
                return audioTrimStart <= s.start && audioTrimEnd >= s.end;
            });
            if (remaining.length === 0) {
                setAudioTrimStart(0); setAudioTrimEnd(30);
                update({ audioTrimStart: 0, audioTrimEnd: 30, targetDuration: 30 });
            } else {
                const newStart = Math.min(...remaining.map(r => r.start));
                const newEnd = Math.max(...remaining.map(r => r.end));
                setAudioTrimStart(newStart); setAudioTrimEnd(newEnd);
                update({ audioTrimStart: newStart, audioTrimEnd: newEnd, targetDuration: Math.round(newEnd - newStart) });
            }
        } else {
            const newStart = Math.min(audioTrimStart, seg.start);
            const newEnd = Math.max(audioTrimEnd, seg.end);
            setAudioTrimStart(newStart); setAudioTrimEnd(newEnd);
            update({ audioTrimStart: newStart, audioTrimEnd: newEnd, targetDuration: Math.round(newEnd - newStart) });
        }
    };

    const handleGenerate = () => {
        const finalSettings: TrailerSettings = {
            ...settings,
            audioTrimStart, audioTrimEnd,
        } as any;

        onGenerate(finalSettings);
    };



    return (
        <div className="w-full h-full overflow-y-auto custom-scrollbar">
            <div className="max-w-4xl mx-auto p-8 flex flex-col gap-8">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-gradient-to-br from-purple-500 to-blue-600 rounded-lg shadow-lg">
                        <Wand2 size={20} className="text-white drop-shadow-md" />
                    </div>
                    <div>
                        <h2 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
                            Trailer Generator <span className="text-[10px] uppercase bg-white/10 px-1.5 py-0.5 rounded text-purple-300">Beta</span>
                        </h2>
                        <p className="text-xs text-white/50">Procedurally generate rapid-cut sequences from your media library.</p>
                    </div>
                </div>

                <div className="bg-black/40 rounded-xl border border-white/5 p-4 relative overflow-hidden space-y-4">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 blur-[50px] pointer-events-none rounded-full" />
                    <div>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Media Pool</span>
                        <div className="text-2xl font-black text-white">{videoCount} <span className="text-[10px] font-bold text-white/30 uppercase">Videos</span></div>
                        {audioCount > 0 && <div className="text-xs text-pink-400">{audioCount} audio files</div>}
                        {hasMediaSelection && (
                            <div className="text-[10px] text-purple-300 font-bold mt-1">
                                ✦ {selectedFileIds.length} selected — only these will be used
                            </div>
                        )}
                    </div>
                    {videoCount > 0 && (
                        <div className="space-y-2 pt-3 border-t border-white/5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-white/40 flex items-center gap-2">
                                <Monitor size={12} className="text-teal-400" /> Orientation Filter
                                <span className="ml-auto text-teal-300 font-mono">{filteredVideoCount} active</span>
                            </label>
                            <div className="flex gap-2">
                                {([
                                    { id: 'all' as const, icon: Video, label: 'All', count: videoCount },
                                    { id: 'horizontal' as const, icon: Monitor, label: 'Horizontal', count: hCount },
                                    { id: 'vertical' as const, icon: Smartphone, label: 'Vertical', count: vCount },
                                    { id: 'square' as const, icon: Square, label: 'Square', count: sqCount },
                                ]).map(o => (
                                    <button key={o.id} onClick={() => { setOrientationFilter(o.id); update({ orientationFilter: o.id }); }}
                                        className={clsx("flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-bold uppercase border transition-all",
                                            orientationFilter === o.id
                                                ? "bg-teal-600/20 border-teal-500/40 text-teal-200"
                                                : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10")}>
                                        <o.icon size={12} />
                                        {o.label} <span className="opacity-50">({o.count})</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                
                <div className="border border-white/5 rounded-xl bg-black/20 p-5 space-y-4">
                    <div className="flex items-center gap-2">
                        <Music size={16} className={settings.useAudioGuide ? "text-purple-400" : "text-white/40"} />
                        <span className="text-sm font-bold text-white">Beat Intelligence Engine</span>
                        {settings.useAudioGuide && <span className="text-[10px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full font-bold ml-auto">Active</span>}
                        {audioAnalysis && <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-bold">{audioAnalysis.bpm} BPM ({audioAnalysis.bpmConfidence}%)</span>}
                    </div>
                    <p className="text-[10px] text-white/40">Upload audio for intelligent beat-synced editing with rhythm detection, segment mapping, and drop-aware effects.</p>
                    {audioUrl && <audio ref={audioRef} src={audioUrl} onLoadedMetadata={handleAudioLoaded}
                        onTimeUpdate={(e) => { if ((e.target as HTMLAudioElement).currentTime >= audioTrimEnd) { (e.target as HTMLAudioElement).pause(); setAudioPlaying(false); }}} />}

                    {!settings.useAudioGuide ? (
                        <div className="relative" ref={audioHistoryRef}>
                            <div className="w-full flex items-center gap-0">
                                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                                    onClick={handleAudioUpload}
                                    className={clsx(
                                        "flex-1 flex justify-center items-center gap-2 py-3 border border-dashed border-white/20 hover:border-purple-500/50 hover:bg-purple-500/10 text-white/50 hover:text-white transition-colors text-xs font-bold",
                                        audioHistory.length > 0 ? "rounded-l-lg border-r-0" : "rounded-lg"
                                    )}>
                                    <Upload size={14} /> Select Audio / Song
                                </motion.button>
                                {audioHistory.length > 0 && (
                                    <button
                                        onClick={() => setShowAudioHistory(!showAudioHistory)}
                                        className={clsx(
                                            "px-3 py-3 rounded-r-lg border border-dashed border-white/20 hover:border-purple-500/50 hover:bg-purple-500/10 text-white/40 hover:text-white transition-all",
                                            showAudioHistory && "bg-purple-500/10 border-purple-500/40 text-purple-300"
                                        )}>
                                        <Clock size={13} className={clsx("transition-transform", showAudioHistory && "text-purple-300")} />
                                    </button>
                                )}
                            </div>
                            {showAudioHistory && audioHistory.length > 0 && (
                                <div className="absolute z-50 top-full mt-1 left-0 right-0 min-w-[240px] bg-black/95 border border-white/10 rounded-lg shadow-2xl backdrop-blur-xl overflow-hidden">
                                    <div className="px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-white/30 border-b border-white/5">Recent Audio</div>
                                    <div className="max-h-[200px] overflow-y-auto custom-scrollbar">
                                        {audioHistory.map((h, i) => (
                                            <div key={i} className="group flex items-center hover:bg-white/10 transition-colors">
                                                <button
                                                    onClick={() => {
                                                        const url = `file://${h.path}`;
                                                        if (audioUrl && audioUrl.startsWith('blob:')) URL.revokeObjectURL(audioUrl);
                                                        setAudioFile(null);
                                                        setAudioUrl(url);
                                                        update({ audioFile: h.name, audioUrl: url, audioFilePath: h.path, useAudioGuide: true });
                                                        setShowAudioHistory(false);
                                                    }}
                                                    className="flex-1 px-3 py-2 text-left text-xs text-white/70 hover:text-white transition-colors flex items-center gap-2 truncate min-w-0">
                                                    <Music size={11} className="text-purple-400 flex-shrink-0" />
                                                    <span className="truncate">{h.name}</span>
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setAudioHistory(prev => {
                                                            const next = prev.filter((_, idx) => idx !== i);
                                                            try { localStorage.setItem('mmm_audio_history', JSON.stringify(next)); } catch {}
                                                            return next;
                                                        });
                                                    }}
                                                    className="opacity-0 group-hover:opacity-100 p-1.5 mr-1 hover:bg-red-500/20 rounded text-white/20 hover:text-red-400 transition-all flex-shrink-0"
                                                    title="Remove from history">
                                                    <Trash2 size={11} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                    <button
                                        onClick={() => {
                                            setAudioHistory([]);
                                            try { localStorage.removeItem('mmm_audio_history'); } catch {}
                                            setShowAudioHistory(false);
                                        }}
                                        className="w-full px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-red-400/50 hover:text-red-400 hover:bg-red-500/10 border-t border-white/5 transition-colors">
                                        Clear All
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between bg-white/5 p-3 rounded-lg border border-white/10 relative overflow-hidden">
                                {analysisToast && <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center text-green-300 text-[10px] font-bold uppercase tracking-widest z-10 animate-pulse">Analysis Refreshed!</div>}
                                <div className="flex items-center gap-3 overflow-hidden z-0">
                                    <button onClick={toggleAudio} className="p-2 bg-purple-500/20 rounded-full text-white hover:text-purple-400 transition-colors">
                                        {audioPlaying ? <Pause size={14} /> : <Play size={14} />}
                                    </button>
                                    <button onClick={stopAudio} className="p-2 bg-white/5 rounded-full text-white/50 hover:text-red-400 transition-colors">
                                        <Square size={14} />
                                    </button>
                                    <div className="flex flex-col truncate">
                                        <span className="text-xs font-bold text-white truncate">{settings.audioFile}</span>
                                        <span className="text-[10px] text-white/40 font-mono">{audioCurrentTime.toFixed(1)}s / {audioAnalysis?.duration.toFixed(1) || '0.0'}s</span>
                                    </div>
                                </div>
                                <div className="flex gap-2 z-0">
                                    <button onClick={() => { setAudioTrimStart(0); setAudioTrimEnd(audioAnalysis ? audioAnalysis.duration : 0); update({ audioTrimStart: 0, audioTrimEnd: audioAnalysis ? audioAnalysis.duration : 0}); }}
                                        className="p-2 bg-blue-500/20 hover:bg-blue-500/40 rounded transition-colors text-blue-300 flex items-center gap-1 text-[10px] font-bold">
                                        <ArrowLeftRight size={14} /> Full Audio
                                    </button>
                                    <button onClick={handleRandomizeBeat} disabled={isAnalyzing}
                                        className="p-2 bg-purple-500/20 hover:bg-purple-500/40 rounded transition-colors text-purple-300 flex items-center gap-1 text-[10px] font-bold">
                                        {isAnalyzing ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                                        {!audioAnalysis ? 'Analyze' : 'Re-Analyze'}
                                    </button>
                                    <button onClick={handleRemoveAudio} className="p-2 bg-red-500/20 hover:bg-red-500/40 rounded text-red-400"><Trash2 size={14} /></button>
                                </div>
                            </div>

                            {audioAnalysis && (
                                <div ref={waveformWrapperRef} className="relative group cursor-crosshair select-none"
                                     onMouseDown={(e) => {
                                         const rect = waveformWrapperRef.current!.getBoundingClientRect();
                                         const x = e.clientX - rect.left;
                                         const time = (x / rect.width) * audioAnalysis.duration;
                                         const timeTolerance = (10 / rect.width) * audioAnalysis.duration;
                                         if (Math.abs(time - audioTrimStart) < timeTolerance) setIsDragging('start');
                                         else if (Math.abs(time - audioTrimEnd) < timeTolerance) setIsDragging('end');
                                         else if (time > audioTrimStart && time < audioTrimEnd) { setIsDragging('move'); setDragStartPos(time - audioTrimStart); }
                                         else if (time < audioTrimStart) { setIsDragging('start'); setAudioTrimStart(time); update({ audioTrimStart: time }); }
                                         else { setIsDragging('end'); setAudioTrimEnd(time); update({ audioTrimEnd: time }); }
                                     }}>
                                    <canvas ref={waveformRef} width={800} height={80}
                                        className="w-full h-20 rounded-lg bg-black/40 border border-white/5 pointer-events-none" />
                                    <div className="absolute inset-0 flex pointer-events-none opacity-40 group-hover:opacity-100 transition-opacity">
                                        {audioAnalysis.segments.map((seg, i) => {
                                            const left = (seg.start / audioAnalysis.duration) * 100;
                                            const width = ((seg.end - seg.start) / audioAnalysis.duration) * 100;
                                            const colors: Record<string, string> = {
                                                intro: 'bg-blue-500/20', buildup: 'bg-yellow-500/30', drop: 'bg-red-500/30',
                                                breakdown: 'bg-cyan-500/20', chorus: 'bg-pink-500/25', verse: 'bg-white/10',
                                                outro: 'bg-indigo-500/20', bridge: 'bg-emerald-500/20'
                                            };
                                            return (
                                                <div key={i} className={clsx("h-full relative transition-all border-r border-white/10", colors[seg.type] || 'bg-white/5')}
                                                    style={{ left: `${left}%`, width: `${width}%`, position: 'absolute' }}>
                                                    <span className="absolute bottom-0.5 left-1 text-[8px] font-black uppercase text-white/40 tracking-wider">{seg.type}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    
                                    <div className="absolute top-0 bottom-0 bg-blue-500/30 border-l-2 border-r-2 border-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.5)] pointer-events-none flex items-center justify-between"
                                         style={{ left: `${(audioTrimStart / audioAnalysis.duration) * 100}%`, width: `${((audioTrimEnd - audioTrimStart) / audioAnalysis.duration) * 100}%` }}>
                                         <div className="w-1.5 h-6 bg-white rounded-r-sm -ml-0.5 shadow-md" />
                                         <div className="w-1.5 h-6 bg-white rounded-l-sm -mr-0.5 shadow-md" />
                                    </div>

                                    <div className="absolute top-0 bottom-0 w-px bg-red-500 shadow-[0_0_8px_rgba(239,68,68,1)] pointer-events-none z-20"
                                         style={{ left: `${(audioCurrentTime / audioAnalysis.duration) * 100}%` }}>
                                         <div className="w-2 h-2 bg-red-500 rounded-full -ml-1 -top-1 absolute" />
                                    </div>
                                </div>
                            )}

                            {audioAnalysis && (
                                <div className="grid grid-cols-4 gap-2">
                                    {[
                                        { label: 'BPM', value: `${audioAnalysis.bpm}`, sub: `${audioAnalysis.bpmConfidence}% conf` },
                                        { label: 'Beats', value: `${audioAnalysis.beats.length}`, sub: `${audioAnalysis.beats.filter(b => b.onGrid).length} on-grid` },
                                        { label: 'Segments', value: `${audioAnalysis.segments.length}`, sub: audioAnalysis.segments.map(s => s.type).filter((v, i, a) => a.indexOf(v) === i).join(', ') },
                                        { label: 'Duration', value: `${audioAnalysis.duration.toFixed(1)}s`, sub: `${(audioAnalysis.duration / 60).toFixed(1)} min` },
                                    ].map(stat => (
                                        <div key={stat.label} className="bg-black/40 rounded-lg p-2.5 border border-white/5">
                                            <div className="text-[9px] font-black uppercase text-white/30 tracking-widest">{stat.label}</div>
                                            <div className="text-sm font-black text-white">{stat.value}</div>
                                            <div className="text-[9px] text-white/20 truncate">{stat.sub}</div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {audioAnalysis && (
                                <div className="flex gap-4">
                                    <div className="flex-1 space-y-1">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Start Time (s)</label>
                                        <input type="number" step="0.1" min="0" max={audioTrimEnd - 0.1} value={audioTrimStart.toFixed(1)}
                                            onChange={(e) => { const v = parseFloat(e.target.value); setAudioTrimStart(v); update({ audioTrimStart: v }); }}
                                            className="w-full bg-black/40 border border-white/10 rounded p-1.5 text-xs text-white" />
                                    </div>
                                    <div className="flex-1 space-y-1">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-white/40">End Time (s)</label>
                                        <input type="number" step="0.1" min={audioTrimStart + 0.1} max={audioAnalysis.duration} value={audioTrimEnd.toFixed(1)}
                                            onChange={(e) => { const v = parseFloat(e.target.value); setAudioTrimEnd(v); update({ audioTrimEnd: v }); }}
                                            className="w-full bg-black/40 border border-white/10 rounded p-1.5 text-xs text-white" />
                                    </div>
                                </div>
                            )}

                            {audioAnalysis && audioAnalysis.segments.length > 0 && (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Select Segments</span>
                                        <div className="flex items-center gap-1">
                                            {[10, 15, 30, 60].map(val => (
                                                <button key={val} onClick={() => { autoSelectBestSegment(val); update({ targetDuration: val }); }}
                                                    className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 hover:bg-purple-500/40 transition-colors text-[9px] font-bold">
                                                    Best {val}s
                                                </button>
                                            ))}
                                            <button onClick={() => autoSelectBestSegment(settings.targetDuration)}
                                                className="ml-2 text-[9px] font-bold text-purple-300 hover:text-purple-200 transition-colors uppercase tracking-wider flex items-center gap-1">
                                                <Sparkles size={10} /> Auto Select Best
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {audioAnalysis.segments.map((seg, i) => {
                                            const isActive = audioTrimStart <= seg.start && audioTrimEnd >= seg.end;
                                            const chipColors: Record<string, string> = {
                                                intro: 'blue', buildup: 'yellow', drop: 'red', breakdown: 'cyan',
                                                chorus: 'pink', verse: 'white', outro: 'indigo', bridge: 'emerald'
                                            };
                                            const c = chipColors[seg.type] || 'white';
                                            return (
                                                <button key={i} onClick={() => handleSegmentClick(seg)}
                                                    className={clsx("px-2 py-1 rounded-md text-[10px] font-bold uppercase transition-all border",
                                                        isActive ? `bg-${c}-500/20 text-${c}-300 border-${c}-500/30` : "bg-black/30 text-white/20 border-white/5 hover:text-white/40")}>
                                                    {seg.type} <span className="opacity-50 font-mono">{(seg.end - seg.start).toFixed(1)}s</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <div className="text-[9px] text-white/25 font-mono">
                                        Selected range: {audioTrimStart.toFixed(1)}s — {audioTrimEnd.toFixed(1)}s ({(audioTrimEnd - audioTrimStart).toFixed(1)}s)
                                    </div>
                                </div>
                            )}

                            <SliderControl label="Beat Sensitivity" icon={Zap} value={settings.beatSensitivity || 0.5}
                                min={0} max={1} step={0.1} unit="" onChange={(v) => update({ beatSensitivity: v })} />
                        </div>
                    )}
                </div>






                <div className="space-y-3 border border-white/5 rounded-xl bg-black/20 p-4">
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/40 flex items-center gap-2">
                        <Layers size={12} className="text-teal-400" /> Include Grids
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                        {([
                            { id: 'off' as const, label: 'Off', desc: 'No grid layouts' },
                            { id: 'mixed' as const, label: 'Mixed', desc: 'Grids sprinkled in' },
                            { id: 'grids-only' as const, label: 'Grids Only', desc: 'All clips use grids' },
                        ]).map(opt => (
                            <button key={opt.id} onClick={() => update({ includeGrids: opt.id } as any)}
                                className={clsx("p-2.5 rounded-lg border text-left transition-all",
                                    (settings.includeGrids || 'off') === opt.id
                                        ? "bg-teal-600/20 border-teal-500/40 shadow-[0_0_10px_rgba(20,184,166,0.15)]"
                                        : "bg-white/5 border-white/5 hover:bg-white/10")}>
                                <div className={clsx("text-[10px] font-black uppercase", (settings.includeGrids || 'off') === opt.id ? "text-teal-200" : "text-white/70")}>{opt.label}</div>
                                <div className="text-[9px] text-white/30">{opt.desc}</div>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-8 bg-black/20 p-5 rounded-xl border border-white/5 mt-6">
                    <div className="space-y-4">
                        <SliderControl label="Target Duration" icon={Clock} value={settings.targetDuration}
                            min={5} max={180} step={5} unit="s" onChange={(v) => {
                                update({ targetDuration: v });
                                if (settings.useAudioGuide && audioAnalysis) {
                                    autoSelectBestSegment(v);
                                }
                            }} />
                        <div className="flex flex-wrap gap-2">
                            {settings.useAudioGuide && audioAnalysis && (
                                <>
                                    <button onClick={() => update({ targetDuration: Math.round(audioTrimEnd - audioTrimStart) })}
                                        className={clsx("px-2 py-1.5 rounded-md text-[10px] font-bold transition-all border whitespace-nowrap",
                                            settings.targetDuration === Math.round(audioTrimEnd - audioTrimStart)
                                                ? "bg-primary text-white border-primary shadow-lg"
                                                : "bg-purple-500/20 text-purple-200 border-purple-500/30 hover:bg-purple-500/30")}>
                                        Selected Segment
                                    </button>
                                    <button onClick={() => update({ targetDuration: Math.round(audioAnalysis.duration) })}
                                        className={clsx("px-2 py-1.5 rounded-md text-[10px] font-bold transition-all border whitespace-nowrap",
                                            settings.targetDuration === Math.round(audioAnalysis.duration)
                                                ? "bg-primary text-white border-primary shadow-lg"
                                                : "bg-white/5 text-white/50 border-white/10 hover:bg-white/10")}>
                                        Full Audio
                                    </button>
                                </>
                            )}

                        </div>
                    </div>
                    <div className="space-y-6">
                        <SliderControl label="Shortest Clip" icon={Scissors} value={settings.shortestClip}
                            min={0.1} max={5} step={0.1} unit="s"
                            onChange={(v) => update({ shortestClip: v, longestClip: Math.max(v, settings.longestClip) })} />
                        <SliderControl label="Longest Clip" icon={Scissors} value={settings.longestClip}
                            min={0.5} max={10} step={0.1} unit="s"
                            onChange={(v) => update({ longestClip: v, shortestClip: Math.min(v, settings.shortestClip) })} />
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4">
                    <label className="flex flex-1 items-center justify-between p-4 rounded-xl border border-white/5 bg-white/5 cursor-pointer hover:bg-white/10 transition-colors">
                        <div className="flex flex-col gap-1">
                            <span className="text-sm font-bold text-white">Allow Duplicate Files</span>
                            <span className="text-[10px] text-white/40">Same file can appear multiple times.</span>
                        </div>
                        <div className="relative">
                            <input type="checkbox" className="sr-only" checked={settings.allowDuplicates}
                                onChange={(e) => update({ allowDuplicates: e.target.checked })} />
                            <div className={clsx("w-10 h-5 rounded-full transition-colors", settings.allowDuplicates ? "bg-purple-500" : "bg-black border border-white/20")}>
                                <div className={clsx("w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform", settings.allowDuplicates ? "translate-x-5" : "translate-x-0.5")} />
                            </div>
                        </div>
                    </label>
                    <label className="flex flex-1 items-center justify-between p-4 rounded-xl border border-white/5 bg-white/5 cursor-pointer hover:bg-white/10 transition-colors">
                        <div className="flex flex-col gap-1">
                            <span className="text-sm font-bold text-white">Force All Clips</span>
                            <span className="text-[10px] text-white/40">Every file appears at least once.</span>
                        </div>
                        <div className="relative">
                            <input type="checkbox" className="sr-only" checked={settings.useAllClips}
                                onChange={(e) => update({ useAllClips: e.target.checked })} />
                            <div className={clsx("w-10 h-5 rounded-full transition-colors", settings.useAllClips ? "bg-emerald-500" : "bg-black border border-white/20")}>
                                <div className={clsx("w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform", settings.useAllClips ? "translate-x-5" : "translate-x-0.5")} />
                            </div>
                        </div>
                    </label>
                </div>

                {/* Cinematic Speed */}
                <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/40 flex items-center gap-2">
                        <Clock size={12} className="text-blue-400" /> Cinematic Speed
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                        {[
                            { id: 'none', label: 'Normal', speed: '1x', desc: 'No speed modification' },
                            { id: 'slowmo', label: 'Slow-Mo', speed: '0.5x', desc: 'All clips at half speed' },
                            { id: 'fast', label: 'Fast', speed: '1.5x', desc: 'All clips at 1.5x' },
                            { id: 'hyper', label: 'Hyper', speed: '4x', desc: 'All clips at 4x speed' },
                        ].map(opt => (
                            <button key={opt.id} onClick={() => { update({ slowmoPolicy: opt.id as any }); setCustomSpeedEnabled(false); }}
                                className={clsx("p-2.5 rounded-lg border text-left transition-all",
                                    settings.slowmoPolicy === opt.id && !customSpeedEnabled
                                        ? "bg-blue-600/20 border-blue-500/40 shadow-[0_0_12px_rgba(59,130,246,0.15)]"
                                        : "bg-white/5 border-white/5 hover:bg-white/10")}>
                                <div className={clsx("text-[10px] font-black uppercase", settings.slowmoPolicy === opt.id && !customSpeedEnabled ? "text-blue-200" : "text-white/70")}>{opt.label} ({opt.speed})</div>
                                <div className="text-[9px] text-white/30">{opt.desc}</div>
                            </button>
                        ))}
                    </div>
                    <div className="space-y-2">
                        <button onClick={() => {
                            setCustomSpeedEnabled(!customSpeedEnabled);
                            if (!customSpeedEnabled) {
                                update({ slowmoPolicy: 'custom' as any, customSpeed: settings.customSpeed ?? 1.0 });
                            }
                        }}
                            className={clsx("px-3 py-1.5 rounded-lg border text-[10px] font-bold uppercase transition-all",
                                customSpeedEnabled
                                    ? "bg-blue-600/20 border-blue-500/40 text-blue-200"
                                    : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10")}>
                            Custom Speed
                        </button>
                        {customSpeedEnabled && (
                            <SliderControl label="Custom Speed" icon={Clock} value={settings.customSpeed ?? 1.0}
                                min={0.25} max={8} step={0.25} unit="x"
                                onChange={(v) => update({ customSpeed: v, slowmoPolicy: 'custom' as any })} />
                        )}
                    </div>
                    </div>

                {/* Boomerang Effect */}
                <div className="border border-cyan-500/10 rounded-xl bg-gradient-to-br from-cyan-900/10 to-teal-900/5 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="text-cyan-400 text-sm">🔁</span>
                            <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-200/70">Boomerang</span>
                            <span className="text-[9px] text-white/30">Forward ↔ Reverse</span>
                        </div>
                        <button
                            onClick={() => update({ boomerangAll: !settings.boomerangAll })}
                            className={clsx(
                                "relative w-10 h-5 rounded-full transition-all",
                                settings.boomerangAll
                                    ? "bg-cyan-500/60 shadow-[0_0_10px_rgba(6,182,212,0.3)]"
                                    : "bg-white/10"
                            )}>
                            <span className={clsx(
                                "absolute top-0.5 w-4 h-4 rounded-full transition-all",
                                settings.boomerangAll ? "left-5.5 bg-cyan-300" : "left-0.5 bg-white/40"
                            )} />
                        </button>
                    </div>
                </div>




                {/* Generate Button */}
                <div className="flex justify-end pt-4 border-t border-white/5">
                    <motion.button 
                        onClick={handleGenerate} 
                        disabled={videoCount === 0}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="px-6 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider text-white bg-gradient-to-r from-purple-600 to-blue-600 shadow-[0_0_20px_rgba(168,85,247,0.4)] hover:shadow-[0_0_30px_rgba(168,85,247,0.6)] flex items-center gap-2 disabled:opacity-50 disabled:grayscale">
                        <PlayCircle size={16} /> Generate Trailer
                    </motion.button>
                </div>
            </div>
        </div>
    );
};
