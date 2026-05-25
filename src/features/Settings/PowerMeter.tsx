import React, { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import { useAppHealthStore } from '../../store/appHealthStore';

interface PowerMeterProps {
    label?: string;
    color?: string;
    value?: number; // Optional controlled value
}

export const PowerMeter: React.FC<PowerMeterProps> = ({
    label = "System Power",
    color = "#8b5cf6",
    value: controlledValue
}) => {
    const { fps, state, errorCount } = useAppHealthStore();
    const [computedValue, setComputedValue] = useState(50);

    // Derive a composite "load" score from real metrics
    useEffect(() => {
        if (controlledValue !== undefined) return;

        // FPS component: 60fps = healthy (low load), <20fps = high load
        const fpsLoad = Math.max(0, Math.min(100, ((60 - Math.min(fps, 60)) / 60) * 100));
        
        // State component
        const stateLoad = state === 'error' ? 95 : state === 'slow' ? 70 : state === 'fast' ? 40 : state === 'active' ? 30 : 15;
        
        // Error component
        const errorLoad = Math.min(30, errorCount * 10);

        // Weighted composite (smooth towards target)
        const target = Math.min(98, Math.max(5, fpsLoad * 0.4 + stateLoad * 0.4 + errorLoad * 0.2));
        setComputedValue(prev => prev + (target - prev) * 0.3);
    }, [fps, state, errorCount, controlledValue]);

    const displayValue = controlledValue !== undefined ? controlledValue : computedValue;

    // Dynamic color based on load
    const dynamicColor = displayValue > 75 ? '#ef4444' : displayValue > 50 ? '#f59e0b' : displayValue > 25 ? color : '#22c55e';

    // SVG parameters
    const size = 120;
    const strokeWidth = 8;
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const offset = circumference - (displayValue / 100) * circumference;

    return (
        <div className="flex flex-col items-center justify-center p-4 bg-white/5 rounded-xl border border-white/10 backdrop-blur-sm">
            <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
                {/* Background Ring */}
                <svg className="transform -rotate-90 w-full h-full">
                    <circle
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        stroke="currentColor"
                        strokeWidth={strokeWidth}
                        fill="transparent"
                        className="text-black/30"
                    />
                    {/* Value Ring */}
                    <circle
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        stroke={dynamicColor}
                        strokeWidth={strokeWidth}
                        fill="transparent"
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                        strokeLinecap="round"
                        className="transition-all duration-1000 ease-out"
                    />
                </svg>

                {/* Center Text */}
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
                    <span className="text-2xl font-bold font-mono" style={{ color: dynamicColor }}>{Math.round(displayValue)}%</span>
                    <Activity size={16} className="text-white/40 mt-1 animate-pulse" />
                </div>
            </div>

            <span className="mt-3 text-xs font-medium uppercase tracking-wider text-white/60">
                {label}
            </span>
        </div>
    );
};
