import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const SPEED_STEPS = [0.25, 0.5, 0.75, 1, 2, 5, 10, 20, 50, 75, 100];

interface SpeedControlProps {
    value: number;
    onChange: (speed: number) => void;
    size?: 'sm' | 'md' | 'lg';
}

export const SpeedControl: React.FC<SpeedControlProps> = ({
    value,
    onChange,
    size = 'md'
}) => {
    const currentIndex = SPEED_STEPS.findIndex(s => s === value);
    const validIndex = currentIndex === -1 ? SPEED_STEPS.findIndex(s => s === 1) : currentIndex;

    const handleDecrease = () => {
        if (validIndex > 0) {
            onChange(SPEED_STEPS[validIndex - 1]);
        }
    };

    const handleIncrease = () => {
        if (validIndex < SPEED_STEPS.length - 1) {
            onChange(SPEED_STEPS[validIndex + 1]);
        }
    };

    const handleReset = () => {
        onChange(1);
    };

    const sizeClasses = {
        sm: 'h-6 text-xs',
        md: 'h-7 text-sm',
        lg: 'h-8 text-base'
    };

    const buttonSizeClasses = {
        sm: 'h-6 w-6',
        md: 'h-7 w-7',
        lg: 'h-8 w-8'
    };

    return (
        <div className="flex items-center gap-1">
            <button
                className={`${buttonSizeClasses[size]} flex items-center justify-center hover:bg-white/10 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed`}
                onClick={handleDecrease}
                disabled={validIndex === 0}
                title="Decrease speed"
            >
                <ChevronLeft size={size === 'sm' ? 12 : size === 'md' ? 14 : 16} />
            </button>

            <div
                className={`${sizeClasses[size]} px-3 bg-black/30 rounded flex items-center justify-center font-mono text-white/90 cursor-pointer select-none min-w-[4rem]`}
                onDoubleClick={handleReset}
                title="Double-click to reset to 1x"
            >
                {value.toFixed(2)}x
            </div>

            <button
                className={`${buttonSizeClasses[size]} flex items-center justify-center hover:bg-white/10 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed`}
                onClick={handleIncrease}
                disabled={validIndex === SPEED_STEPS.length - 1}
                title="Increase speed"
            >
                <ChevronRight size={size === 'sm' ? 12 : size === 'md' ? 14 : 16} />
            </button>
        </div>
    );
};
