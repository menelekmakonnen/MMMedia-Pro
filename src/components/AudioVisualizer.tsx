import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
    videoElement: HTMLVideoElement | null;
    width?: number;
    height?: number;
    barColor?: string;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({
    videoElement,
    width = 200,
    height = 40,
    barColor = '#06b6d4' // Cyan/Teal secondary color
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animationRef = useRef<number | undefined>(undefined);

    useEffect(() => {
        if (!videoElement) return;

        try {
            // Initialize Audio Content if needed
            if (!audioContextRef.current) {
                audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            }

            const ctx = audioContextRef.current!;

            // Create source only once
            if (!sourceRef.current) {
                // Check if element is already connected (can cause error if re-connected)
                // For simplicity, we assume one connection.
                try {
                    sourceRef.current = ctx.createMediaElementSource(videoElement);
                } catch (e) {
                    console.warn("MediaElementSource attached?", e);
                    return; // Already attached likely
                }
            }

            if (!analyserRef.current && sourceRef.current) {
                analyserRef.current = ctx.createAnalyser();
                analyserRef.current.fftSize = 64; // Low resolution for simple bars
                sourceRef.current.connect(analyserRef.current);
                analyserRef.current.connect(ctx.destination);
            }

            const render = () => {
                if (!canvasRef.current || !analyserRef.current) return;

                const canvas = canvasRef.current;
                const canvasCtx = canvas.getContext('2d');
                if (!canvasCtx) return;

                const bufferLength = analyserRef.current.frequencyBinCount;
                const dataArray = new Uint8Array(bufferLength);
                analyserRef.current.getByteFrequencyData(dataArray);

                canvasCtx.clearRect(0, 0, width, height);

                const barWidth = (width / bufferLength) * 2;
                let x = 0;

                for (let i = 0; i < bufferLength; i++) {
                    const barHeight = (dataArray[i] / 255) * height;

                    canvasCtx.fillStyle = barColor;
                    // Draw centered vertically
                    const y = (height - barHeight) / 2;

                    // Rounded caps look nice
                    canvasCtx.beginPath();
                    canvasCtx.roundRect(x, y, barWidth - 1, barHeight, 2);
                    canvasCtx.fill();

                    x += barWidth;
                }

                animationRef.current = requestAnimationFrame(render);
            };

            render();

        } catch (error) {
            console.error("Audio Visualizer Init Error:", error);
        }

        return () => {
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
            // Don't close audio context or disconnect source abruptly as it might break video playback audio
            // Just stop rendering
        };
    }, [videoElement, width, height, barColor]);

    return (
        <canvas
            ref={canvasRef}
            width={width}
            height={height}
            className="opacity-80"
        />
    );
};
