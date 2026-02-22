import React, { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';

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
    const [internalValue, setInternalValue] = useState(0);

    // Use controlled value if provided, otherwise internal state
    const displayValue = controlledValue !== undefined ? controlledValue : internalValue;

    useEffect(() => {
        if (controlledValue !== undefined) return;

        // Simulate fluctuating power levels
        const interval = setInterval(() => {
            setInternalValue(prev => {
                const change = (Math.random() - 0.5) * 10;
                const newValue = prev + change;
                return Math.max(20, Math.min(98, newValue)); // Keep between 20% and 98%
            });
        }, 1000);

        return () => clearInterval(interval);
    }, [controlledValue]);

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
                        stroke={color}
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
                    <span className="text-2xl font-bold font-mono">{Math.round(displayValue)}%</span>
                    <Activity size={16} className="text-white/40 mt-1 animate-pulse" />
                </div>
            </div>

            <span className="mt-3 text-xs font-medium uppercase tracking-wider text-white/60">
                {label}
            </span>
        </div>
    );
};
