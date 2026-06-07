import React, { useCallback } from 'react';
import { RotateCcw, Upload } from 'lucide-react';
import { useClipStore } from '../../store/clipStore';
import { DEFAULT_COLOR_GRADING, type ColorGrading } from '../../lib/colorGrading';

// ══════════════════════════════════════════════════════════════════════════════
// ColorGradingPanel — Per-clip color grading controls
// ══════════════════════════════════════════════════════════════════════════════

interface ColorGradingPanelProps {
    clipId: string;
}

// ── Reusable Slider ──────────────────────────────────────────────────────────

const GradingSlider: React.FC<{
    label: string;
    value: number;
    defaultValue: number;
    min: number;
    max: number;
    step: number;
    onChange: (value: number) => void;
}> = ({ label, value, defaultValue, min, max, step, onChange }) => {
    const isModified = Math.abs(value - defaultValue) > 0.001;
    const decimals = step < 0.1 ? 2 : step < 1 ? 1 : 0;

    return (
        <div className="flex items-center gap-2 py-0.5">
            <label className="text-xs text-white/50 w-20 shrink-0 truncate" title={label}>
                {label}
            </label>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                onDoubleClick={() => onChange(defaultValue)}
                className={`flex-1 h-1 rounded-lg appearance-none cursor-pointer ${
                    isModified
                        ? 'bg-purple-500/20 accent-purple-500'
                        : 'bg-white/10 accent-white/40'
                }`}
                title={`Double-click to reset (${defaultValue})`}
            />
            <span className={`text-xs w-12 text-right tabular-nums ${
                isModified ? 'text-purple-300' : 'text-white/35'
            }`}>
                {value.toFixed(decimals)}
            </span>
        </div>
    );
};

// ── Section Header ───────────────────────────────────────────────────────────

const SectionHeader: React.FC<{ title: string }> = ({ title }) => (
    <div className="text-[10px] uppercase tracking-wider text-white/30 font-semibold pt-2 pb-1 border-t border-white/5 first:border-t-0 first:pt-0">
        {title}
    </div>
);

// ── Main Panel ───────────────────────────────────────────────────────────────

export const ColorGradingPanel: React.FC<ColorGradingPanelProps> = ({ clipId }) => {
    const clip = useClipStore((s) => s.clips.find((c) => c.id === clipId));
    const grading: ColorGrading = clip?.colorGrading ?? { ...DEFAULT_COLOR_GRADING };

    const updateGrading = useCallback(
        (updates: Partial<ColorGrading>) => {
            useClipStore.getState().updateClip(clipId, {
                colorGrading: { ...grading, ...updates },
            });
        },
        [clipId, grading]
    );

    const handleResetAll = useCallback(() => {
        useClipStore.getState().updateClip(clipId, {
            colorGrading: { ...DEFAULT_COLOR_GRADING },
        });
    }, [clipId]);

    const handleLoadLUT = useCallback(async () => {
        try {
            const result = await (window as any).electronAPI.dialog.showOpenDialog({
                title: 'Load LUT File',
                filters: [{ name: 'LUT Files', extensions: ['cube'] }],
                properties: ['openFile'],
            });
            if (!result.canceled && result.filePaths?.[0]) {
                updateGrading({ lutFile: result.filePaths[0] });
            }
        } catch (err) {
            console.error('[ColorGradingPanel] Failed to open LUT dialog:', err);
        }
    }, [updateGrading]);

    const handleClearLUT = useCallback(() => {
        updateGrading({ lutFile: undefined });
    }, [updateGrading]);

    if (!clip) return null;

    return (
        <div className="space-y-1">
            {/* ── Basic ─────────────────────────────────────────────── */}
            <SectionHeader title="Basic" />
            <GradingSlider
                label="Temperature"
                value={grading.temperature}
                defaultValue={DEFAULT_COLOR_GRADING.temperature}
                min={-100} max={100} step={1}
                onChange={(v) => updateGrading({ temperature: v })}
            />
            <GradingSlider
                label="Tint"
                value={grading.tint}
                defaultValue={DEFAULT_COLOR_GRADING.tint}
                min={-100} max={100} step={1}
                onChange={(v) => updateGrading({ tint: v })}
            />

            {/* ── Tone ──────────────────────────────────────────────── */}
            <SectionHeader title="Tone" />
            <GradingSlider
                label="Exposure"
                value={grading.exposure}
                defaultValue={DEFAULT_COLOR_GRADING.exposure}
                min={-2} max={2} step={0.1}
                onChange={(v) => updateGrading({ exposure: v })}
            />
            <GradingSlider
                label="Contrast"
                value={grading.contrast}
                defaultValue={DEFAULT_COLOR_GRADING.contrast}
                min={0.5} max={2.0} step={0.05}
                onChange={(v) => updateGrading({ contrast: v })}
            />
            <GradingSlider
                label="Highlights"
                value={grading.highlights}
                defaultValue={DEFAULT_COLOR_GRADING.highlights}
                min={-100} max={100} step={1}
                onChange={(v) => updateGrading({ highlights: v })}
            />
            <GradingSlider
                label="Shadows"
                value={grading.shadows}
                defaultValue={DEFAULT_COLOR_GRADING.shadows}
                min={-100} max={100} step={1}
                onChange={(v) => updateGrading({ shadows: v })}
            />

            {/* ── Color ─────────────────────────────────────────────── */}
            <SectionHeader title="Color" />
            <GradingSlider
                label="Saturation"
                value={grading.saturation}
                defaultValue={DEFAULT_COLOR_GRADING.saturation}
                min={0} max={2.0} step={0.05}
                onChange={(v) => updateGrading({ saturation: v })}
            />
            <GradingSlider
                label="Vibrance"
                value={grading.vibrance}
                defaultValue={DEFAULT_COLOR_GRADING.vibrance}
                min={0} max={2.0} step={0.05}
                onChange={(v) => updateGrading({ vibrance: v })}
            />

            {/* ── LUT ───────────────────────────────────────────────── */}
            <SectionHeader title="LUT" />
            <div className="flex items-center gap-2 py-1">
                {grading.lutFile ? (
                    <>
                        <span className="text-xs text-white/50 truncate flex-1" title={grading.lutFile}>
                            {grading.lutFile.split(/[\\/]/).pop()}
                        </span>
                        <button
                            onClick={handleClearLUT}
                            className="text-[10px] text-red-400/60 hover:text-red-400 transition-colors"
                        >
                            Clear
                        </button>
                    </>
                ) : (
                    <span className="text-xs text-white/25 italic flex-1">No LUT loaded</span>
                )}
                <button
                    onClick={handleLoadLUT}
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-white/5 hover:bg-white/10
                               text-white/60 rounded border border-white/10 transition-colors"
                >
                    <Upload size={10} /> Load LUT
                </button>
            </div>

            {/* ── Reset ─────────────────────────────────────────────── */}
            <div className="pt-2 border-t border-white/5">
                <button
                    onClick={handleResetAll}
                    className="flex items-center gap-1.5 px-3 py-1.5 w-full text-xs text-white/50
                               hover:text-white/80 hover:bg-white/5 rounded transition-colors justify-center"
                >
                    <RotateCcw size={11} /> Reset All
                </button>
            </div>
        </div>
    );
};
