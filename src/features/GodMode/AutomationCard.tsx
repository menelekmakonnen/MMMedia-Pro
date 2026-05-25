import React, { useState } from 'react';
import { Loader2, LucideIcon } from 'lucide-react';

interface AutomationCardProps {
    title: string;
    description: string;
    icon: LucideIcon;
    color: string;
    onRun: () => Promise<void>;
    compact?: boolean;
    iconSize?: number;
}

export const AutomationCard: React.FC<AutomationCardProps> = ({
    title,
    description,
    icon: Icon,
    color,
    onRun,
    compact = false,
    iconSize = 18,
}) => {
    const [running, setRunning] = useState(false);

    const handleRun = async () => {
        if (running) return;
        setRunning(true);
        try {
            await onRun();
        } finally {
            setRunning(false);
        }
    };

    return (
        <button
            onClick={handleRun}
            disabled={running}
            className={`group relative flex ${compact ? 'flex-col items-center justify-center p-2' : 'items-center gap-3 p-3'} rounded-xl border border-white/5 bg-white/[0.03] hover:bg-white/[0.07] hover:border-white/15 transition-all active:scale-95 disabled:opacity-50`}
            title={description}
        >
            <div className={`${color} ${running ? 'animate-spin' : 'group-hover:scale-110'} transition-transform flex-shrink-0`}>
                {running ? <Loader2 size={iconSize} /> : <Icon size={iconSize} />}
            </div>
            {!compact && (
                <div className="text-left min-w-0">
                    <div className="text-[10px] font-black uppercase tracking-wider text-white/80 leading-none">{title}</div>
                    <div className="text-[9px] text-white/30 mt-0.5 truncate">{description}</div>
                </div>
            )}
            {compact && (
                <span className="text-[8px] font-bold uppercase tracking-wider text-white/50 mt-1 leading-none">{title}</span>
            )}
        </button>
    );
};
