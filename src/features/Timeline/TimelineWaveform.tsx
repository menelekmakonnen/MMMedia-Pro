import React, { useEffect, useRef, useState, memo } from 'react';

interface TimelineWaveformProps {
    path: string;
    width: number;
    height: number;
    color?: string;
}

const waveformCache = new Map<string, Float32Array>();

export const TimelineWaveform: React.FC<TimelineWaveformProps> = memo(({ path, width, height, color = '#8b5cf6' }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [audioData, setAudioData] = useState<Float32Array | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;

        const loadAudio = async () => {
            if (waveformCache.has(path)) {
                setAudioData(waveformCache.get(path)!);
                setLoading(false);
                return;
            }

            try {
                // Read via IPC
                const result = await (window as any).ipcRenderer.readFileBuffer(path);
                if (!result.success) {
                    if (result.isTooLarge) {
                        if (isMounted) {
                            setAudioData(null);
                            setLoading(false);
                            // Set a "skip" state in the cache so we don't try again
                            waveformCache.set(path, new Float32Array(0));
                        }
                        return;
                    }
                    throw new Error(result.error || "Empty buffer");
                }
                if (!result.buffer) {
                    throw new Error("Empty buffer");
                }
                const arrayBuffer = result.buffer.buffer; // Uint8Array to ArrayBuffer

                // Decode audio
                const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

                // Downsample for visualization (get peaks)
                const rawData = audioBuffer.getChannelData(0); // Use first channel
                const samples = 1000; // Resolution
                const blockSize = Math.floor(rawData.length / samples);
                const filteredData = new Float32Array(samples);

                for (let i = 0; i < samples; i++) {
                    const start = i * blockSize;
                    let sum = 0;
                    for (let j = 0; j < blockSize; j++) {
                        sum += Math.abs(rawData[start + j]);
                    }
                    filteredData[i] = sum / blockSize;
                }

                // Normalize
                const multiplier = Math.pow(Math.max(...filteredData), -1);
                const normalizedData = filteredData.map(n => n * multiplier);

                if (isMounted) {
                    waveformCache.set(path, normalizedData);
                    setAudioData(normalizedData);
                    setLoading(false);
                }

                audioContext.close();
            } catch (error: any) {
                // Suppress "File size is greater than 2 GiB" error as we handle it gracefully via UI placeholder
                const isLargeFileError = error?.message?.includes("File size") && error?.message?.includes("2 GiB");

                if (!isLargeFileError) {
                    console.error("Failed to load waveform:", error);
                }

                if (isMounted) {
                    setLoading(false);
                    setAudioData(null);
                }
            }
        };

        setLoading(true);
        loadAudio();

        return () => { isMounted = false; };
    }, [path]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear
        ctx.clearRect(0, 0, width, height);

        if (!audioData) {
            // Draw placeholder text for large files
            ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.font = '10px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Waveform skipped (File > 2GB)', width / 2, height / 2 + 4);
            return;
        }

        // Draw
        ctx.fillStyle = color;
        ctx.beginPath();

        const barWidth = width / audioData.length;

        audioData.forEach((val, index) => {
            const x = index * barWidth;
            const barHeight = val * height;
            // Draw centered
            const y = (height - barHeight) / 2;

            ctx.rect(x, y, barWidth, barHeight);
        });

        ctx.fill();

    }, [audioData, width, height, color]);

    if (loading) return <div className="absolute inset-0 flex items-center justify-center opacity-20 text-xs text-white/40">Loading waveform...</div>

    return (
        <canvas
            ref={canvasRef}
            width={width}
            height={height}
            className="w-full h-full opacity-50"
        />
    );
});
