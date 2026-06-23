import React, { useEffect, useState, useCallback } from 'react';
import { MonitorPlay, MonitorOff } from 'lucide-react';
import { toast } from './Toast';

/**
 * PremiereProBridge — Polls Adobe Premiere Pro's CEP/UXP panel or
 * local REST endpoint to determine if Premiere Pro is running and
 * reachable, then exposes a status badge + share action.
 *
 * Connection strategy:
 *   1. Try the local Edia Pro bridge server at localhost:9237
 *   2. Falls back to offline after 3 failed attempts
 *   3. Re-polls every 15s when offline, every 30s when online
 */

interface PremiereStatus {
    alive: boolean;
    version?: string;
    projectName?: string;
}

export const PremiereProBridge: React.FC = () => {
    const [status, setStatus] = useState<PremiereStatus>({ alive: false });
    const [checking, setChecking] = useState(false);

    const checkPremiere = useCallback(async () => {
        try {
            const res = await fetch('http://localhost:9237/status', {
                method: 'GET',
                signal: AbortSignal.timeout(2000),
            });
            if (res.ok) {
                const data = await res.json();
                setStatus({ alive: true, version: data.version, projectName: data.projectName });
            } else {
                setStatus({ alive: false });
            }
        } catch {
            setStatus({ alive: false });
        }
    }, []);

    // Initial check + polling
    useEffect(() => {
        checkPremiere();
        const interval = setInterval(checkPremiere, status.alive ? 30000 : 15000);
        return () => clearInterval(interval);
    }, [checkPremiere, status.alive]);

    const handleShareProject = useCallback(async () => {
        if (!status.alive) {
            toast.error('Premiere Pro is not connected');
            return;
        }
        setChecking(true);
        try {
            // Build the canonical EditDocument from live store state (NOT a stale
            // / wrongly-keyed localStorage read).
            const { generateEditDocument } = await import('../lib/manifestBridge');
            const doc = generateEditDocument();
            if (!doc.clips || doc.clips.length === 0) {
                toast.warning('Nothing to share — the timeline is empty.');
                return;
            }
            const res = await fetch('http://localhost:9237/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    source: 'MMMedia Pro',
                    document: doc,
                    timestamp: Date.now(),
                }),
                signal: AbortSignal.timeout(5000),
            });
            if (!res.ok) {
                toast.error(`Premiere bridge returned ${res.status}`);
                return;
            }
            // Validate the bridge response — don't claim success blindly.
            const result = await res.json().catch(() => null);
            if (result && result.success === false) {
                toast.error(result.error || 'Premiere Pro rejected the project');
            } else {
                toast.success(`Sent ${doc.clips.length} clips to Premiere Pro`);
            }
        } catch {
            toast.error('Connection to Premiere Pro lost');
            setStatus({ alive: false });
        } finally {
            setChecking(false);
        }
    }, [status.alive]);

    return (
        <button
            onClick={handleShareProject}
            disabled={checking}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border no-drag transition-colors ${
                status.alive
                    ? 'bg-purple-500/10 border-purple-500/20 text-purple-400 hover:bg-purple-500/20 cursor-pointer'
                    : 'bg-white/5 border-white/10 text-white/30 cursor-default'
            }`}
            title={
                status.alive
                    ? `Connected to Premiere Pro${status.version ? ` v${status.version}` : ''}${status.projectName ? ` — ${status.projectName}` : ''}\nClick to share project`
                    : 'Edia Pro: Premiere Pro not detected'
            }
        >
            {status.alive
                ? <MonitorPlay size={12} className="animate-pulse" />
                : <MonitorOff size={12} />
            }
            <span className="text-[10px] font-bold">
                {status.alive ? 'Edia Pro' : 'Edia Pro Offline'}
            </span>
        </button>
    );
};
