import React, { useState } from 'react';
import { LucideIcon, Play, Check, Loader2 } from 'lucide-react';

interface AutomationCardProps {
    title: string;
    description: string;
    icon: LucideIcon;
    onRun: () => Promise<void>;
    color?: string;
    compact?: boolean;
    iconSize?: number;
}

export const AutomationCard: React.FC<AutomationCardProps> = ({
    title,
    description,
    icon: Icon,
    onRun,
    color = "text-primary",
    compact = false,
    iconSize = 18
}) => {
    const [status, setStatus] = useState<'idle' | 'running' | 'completed'>('idle');

    const handleRun = async () => {
        if (status === 'running') return;

        setStatus('running');
        try {
            await onRun();
            setStatus('completed');
            setTimeout(() => setStatus('idle'), 2000); // Reset after 2s
        } catch (error) {
            console.error("Automation failed:", error);
            setStatus('idle');
        }
    };

    if (compact) {
        return (
            <button
                onClick={handleRun}
                disabled={status === 'running'}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border border-white/5 transition-all active:scale-95 group relative overflow-hidden ${status === 'running' ? 'bg-white/5 cursor-wait' : 'bg-white/5 hover:bg-white/10 hover:border-white/20'
                    }`}
            >
                <div className={`mb-1 ${color} ${status === 'running' ? 'animate-pulse' : 'group-hover:scale-110 transition-transform'}`}>
                    {status === 'running' ? <Loader2 size={iconSize} className="animate-spin" /> : <Icon size={iconSize} />}
                </div>
                <div className="text-[10px] font-bold text-white/70 uppercase tracking-tighter">
                    {status === 'running' ? 'Running...' : status === 'completed' ? 'Done' : title}
                </div>
                {status === 'completed' && (
                    <div className="absolute top-1 right-1 text-green-400">
                        <Check size={10} />
                    </div>
                )}
            </button>
        );
    }

    return (
        <div className="bg-surface-light border border-white/5 rounded-xl p-6 flex flex-col hover:border-white/20 transition-all group relative overflow-hidden">
            {/* Background Glow */}
            <div className={`absolute -right-10 -top-10 w-32 h-32 ${color} opacity-5 blur-3xl group-hover:opacity-10 transition-opacity`} />

            <div className="flex items-start justify-between mb-4">
                <div className={`p-3 rounded-lg bg-white/5 ${color}`}>
                    <Icon size={24} />
                </div>
                {status === 'completed' && (
                    <div className="text-green-400 animate-in fade-in zoom-in duration-300">
                        <Check size={20} />
                    </div>
                )}
            </div>

            <h3 className="text-lg font-semibold text-white/90 mb-2">{title}</h3>
            <p className="text-sm text-white/50 mb-6 flex-1">{description}</p>

            <button
                onClick={handleRun}
                disabled={status === 'running'}
                className={`flex items-center justify-center gap-2 w-full py-3 rounded-lg font-medium transition-all ${status === 'running'
                    ? 'bg-white/5 text-white/50 cursor-wait'
                    : 'bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20 hover:shadow-primary/40'
                    }`}
            >
                {status === 'running' ? (
                    <>
                        <Loader2 size={16} className="animate-spin" />
                        Processing...
                    </>
                ) : status === 'completed' ? (
                    <>
                        <Check size={16} />
                        Done
                    </>
                ) : (
                    <>
                        <Play size={16} fill="currentColor" />
                        Run Selection
                    </>
                )}
            </button>
        </div>
    );
};
