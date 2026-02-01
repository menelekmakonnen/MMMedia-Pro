import React, { useState } from 'react';
import { Download, FileVideo, HardDrive, Settings } from 'lucide-react';
import { useClipStore } from '../../store/clipStore';

export const ExportTab: React.FC = () => {
    const { clips } = useClipStore();
    const [format, setFormat] = useState('mp4');
    const [codec, setCodec] = useState('h264');
    const [resolution, setResolution] = useState('1080p');
    const [fps, setFps] = useState('30');
    const [quality, setQuality] = useState('high');
    const [isExporting, setIsExporting] = useState(false);
    const [progress, setProgress] = useState(0);

    // Calculate total duration
    const totalDurationFrames = clips.reduce((acc, clip) => acc + (clip.endFrame - clip.startFrame), 0);
    const durationSeconds = totalDurationFrames / 30; // Assuming 30fps

    // Estimate file size (very rough approximation)
    const bitrateMap: Record<string, number> = {
        'high': 15, // Mbps
        'medium': 8,
        'low': 4
    };

    const estimatedSizeMB = (durationSeconds * bitrateMap[quality]) / 8;

    const handleExport = async () => {
        setIsExporting(true);
        setProgress(0);

        // Mock export process
        for (let i = 0; i <= 100; i += 5) {
            setProgress(i);
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        setTimeout(() => {
            alert(`Export Complete! Saved as project.${format}`);
            setIsExporting(false);
            setProgress(0);
        }, 500);
    };

    return (
        <div className="h-full w-full flex flex-col p-8 gap-8 overflow-y-auto">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Export Project</h1>
                <p className="text-white/50 text-sm mt-1">Render your timeline to a final media file.</p>
            </div>

            <div className="flex gap-8">
                {/* Settings Column */}
                <div className="flex-1 space-y-6">
                    {/* Format Section */}
                    <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                        <div className="flex items-center gap-2 mb-4">
                            <FileVideo className="text-primary" size={20} />
                            <h2 className="text-lg font-semibold">Output Format</h2>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs uppercase tracking-wider text-white/40 mb-2 font-semibold">Container</label>
                                <select
                                    value={format}
                                    onChange={(e) => setFormat(e.target.value)}
                                    className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-3 text-white appearance-none focus:border-primary/50 focus:outline-none"
                                >
                                    <option value="mp4">MP4 (MPEG-4)</option>
                                    <option value="mov">MOV (QuickTime)</option>
                                    <option value="avi">AVI (Audio Video Interleave)</option>
                                    <option value="webm">WebM</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs uppercase tracking-wider text-white/40 mb-2 font-semibold">Codec</label>
                                <select
                                    value={codec}
                                    onChange={(e) => setCodec(e.target.value)}
                                    className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-3 text-white appearance-none focus:border-primary/50 focus:outline-none"
                                >
                                    <option value="h264">H.264 (AVC)</option>
                                    <option value="h265">H.265 (HEVC)</option>
                                    <option value="prores">Apple ProRes 422</option>
                                    <option value="dnxhd">Avid DNxHD</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Video Settings */}
                    <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                        <div className="flex items-center gap-2 mb-4">
                            <Settings className="text-primary" size={20} />
                            <h2 className="text-lg font-semibold">Video Settings</h2>
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <label className="block text-xs uppercase tracking-wider text-white/40 mb-2 font-semibold">Resolution</label>
                                <select
                                    value={resolution}
                                    onChange={(e) => setResolution(e.target.value)}
                                    className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-3 text-white appearance-none focus:border-primary/50 focus:outline-none"
                                >
                                    <option value="2160p">4K (3840x2160)</option>
                                    <option value="1440p">2K (2560x1440)</option>
                                    <option value="1080p">1080p (1920x1080)</option>
                                    <option value="720p">720p (1280x720)</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs uppercase tracking-wider text-white/40 mb-2 font-semibold">Frame Rate</label>
                                <select
                                    value={fps}
                                    onChange={(e) => setFps(e.target.value)}
                                    className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-3 text-white appearance-none focus:border-primary/50 focus:outline-none"
                                >
                                    <option value="60">60 FPS</option>
                                    <option value="30">30 FPS</option>
                                    <option value="24">24 FPS</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs uppercase tracking-wider text-white/40 mb-2 font-semibold">Quality</label>
                                <select
                                    value={quality}
                                    onChange={(e) => setQuality(e.target.value)}
                                    className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-3 text-white appearance-none focus:border-primary/50 focus:outline-none"
                                >
                                    <option value="high">High (15 Mbps)</option>
                                    <option value="medium">Medium (8 Mbps)</option>
                                    <option value="low">Low (4 Mbps)</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Summary Column */}
                <div className="w-96 flex flex-col gap-6">
                    <div className="bg-white/5 border border-white/10 rounded-xl p-6 flex-1 flex flex-col">
                        <div className="flex items-center gap-2 mb-6">
                            <HardDrive className="text-primary" size={20} />
                            <h2 className="text-lg font-semibold">Export Summary</h2>
                        </div>

                        <div className="space-y-4 flex-1">
                            <div className="flex justify-between items-center py-2 border-b border-white/5">
                                <span className="text-white/40">Total Duration</span>
                                <span className="font-mono">{durationSeconds.toFixed(2)}s</span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-white/5">
                                <span className="text-white/40">Estimated Size</span>
                                <span className="font-mono text-accent">{estimatedSizeMB.toFixed(1)} MB</span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-white/5">
                                <span className="text-white/40">Video Codec</span>
                                <span className="font-mono uppercase">{codec}</span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-white/5">
                                <span className="text-white/40">Audio Codec</span>
                                <span className="font-mono">AAC 320kbps</span>
                            </div>
                        </div>

                        {/* Export Button */}
                        <div className="mt-8">
                            {isExporting ? (
                                <div className="space-y-3">
                                    <div className="flex justify-between text-sm">
                                        <span>Rendering...</span>
                                        <span>{progress}%</span>
                                    </div>
                                    <div className="h-2 bg-black/50 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-primary transition-all duration-100 ease-out"
                                            style={{ width: `${progress}%` }}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <button
                                    onClick={handleExport}
                                    disabled={clips.length === 0}
                                    className="w-full h-14 bg-primary hover:bg-primary/80 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98]"
                                >
                                    <Download size={20} />
                                    Export Video
                                </button>
                            )}
                            {clips.length === 0 && (
                                <p className="text-center text-xs text-red-400 mt-3">Add media to timeline to export</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
