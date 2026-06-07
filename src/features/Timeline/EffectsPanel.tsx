import React, { useState, useMemo, useCallback } from 'react';
import { Plus, Trash2, ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';
import { useClipStore } from '../../store/clipStore';
import {
    EFFECT_REGISTRY,
    getEffectsByCategory,
    getEffectById,
    getDefaultParams,
    type ParametricEffect,
    type EffectParameter,
} from '../../lib/effectRegistry';

// ══════════════════════════════════════════════════════════════════════════════
// EffectsPanel — Add / Remove / Configure parametric effects on a clip
// ══════════════════════════════════════════════════════════════════════════════

interface EffectsPanelProps {
    clipId: string;
}

// Category display metadata
const CATEGORY_META: Record<string, { label: string; color: string }> = {
    color: { label: 'Color', color: 'bg-blue-500/20 text-blue-300' },
    style: { label: 'Style', color: 'bg-purple-500/20 text-purple-300' },
    blur: { label: 'Blur', color: 'bg-cyan-500/20 text-cyan-300' },
    sharpen: { label: 'Sharpen', color: 'bg-amber-500/20 text-amber-300' },
    distortion: { label: 'Distortion', color: 'bg-red-500/20 text-red-300' },
};

// ── Parameter Editor ─────────────────────────────────────────────────────────

const ParamSlider: React.FC<{
    param: EffectParameter;
    value: number | string | boolean;
    onChange: (key: string, value: number | string | boolean) => void;
}> = ({ param, value, onChange }) => {
    const numValue = Number(value);
    const defaultNum = Number(param.default);

    return (
        <div className="flex items-center gap-2 py-1">
            <label className="text-xs text-white/50 w-24 shrink-0 truncate" title={param.label}>
                {param.label}
            </label>
            <input
                type="range"
                min={param.min}
                max={param.max}
                step={param.step}
                value={numValue}
                onChange={(e) => onChange(param.key, parseFloat(e.target.value))}
                onDoubleClick={() => onChange(param.key, param.default)}
                className="flex-1 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-purple-500"
                title={`Double-click to reset to ${param.default}`}
            />
            <span className="text-xs text-white/40 w-14 text-right tabular-nums">
                {numValue.toFixed(param.step && param.step < 1 ? 2 : 0)}
                {param.unit ? ` ${param.unit}` : ''}
            </span>
        </div>
    );
};

const ParamToggle: React.FC<{
    param: EffectParameter;
    value: boolean;
    onChange: (key: string, value: boolean) => void;
}> = ({ param, value, onChange }) => (
    <div className="flex items-center justify-between py-1">
        <label className="text-xs text-white/50">{param.label}</label>
        <button
            onClick={() => onChange(param.key, !value)}
            className={`w-8 h-4 rounded-full transition-colors relative ${value ? 'bg-purple-500' : 'bg-white/15'
                }`}
        >
            <span
                className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${value ? 'translate-x-4' : 'translate-x-0.5'
                    }`}
            />
        </button>
    </div>
);

const ParamSelect: React.FC<{
    param: EffectParameter;
    value: string;
    onChange: (key: string, value: string) => void;
}> = ({ param, value, onChange }) => (
    <div className="flex items-center gap-2 py-1">
        <label className="text-xs text-white/50 w-24 shrink-0 truncate">{param.label}</label>
        <select
            value={value}
            onChange={(e) => onChange(param.key, e.target.value)}
            className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-0.5 text-xs text-white/70
                       focus:outline-none focus:border-purple-500/50"
        >
            {param.options?.map((opt) => (
                <option key={opt} value={opt} className="bg-zinc-900">
                    {opt.replace(/_/g, ' ')}
                </option>
            ))}
        </select>
    </div>
);

const ParamColor: React.FC<{
    param: EffectParameter;
    value: string;
    onChange: (key: string, value: string) => void;
}> = ({ param, value, onChange }) => (
    <div className="flex items-center gap-2 py-1">
        <label className="text-xs text-white/50 w-24 shrink-0">{param.label}</label>
        <input
            type="color"
            value={value}
            onChange={(e) => onChange(param.key, e.target.value)}
            className="w-6 h-6 rounded border border-white/10 cursor-pointer bg-transparent"
        />
        <span className="text-xs text-white/40">{value}</span>
    </div>
);

// ── Effect Card ──────────────────────────────────────────────────────────────

const EffectCard: React.FC<{
    effectId: string;
    params: Record<string, number | string | boolean>;
    index: number;
    onUpdate: (index: number, params: Record<string, number | string | boolean>) => void;
    onRemove: (index: number) => void;
}> = ({ effectId, params, index, onUpdate, onRemove }) => {
    const [expanded, setExpanded] = useState(true);
    const effect = getEffectById(effectId);

    if (!effect) return null;

    const cat = CATEGORY_META[effect.category] || { label: effect.category, color: 'bg-white/10 text-white/50' };

    const handleParamChange = useCallback(
        (key: string, value: number | string | boolean) => {
            onUpdate(index, { ...params, [key]: value });
        },
        [index, params, onUpdate]
    );

    const handleResetAll = useCallback(() => {
        onUpdate(index, getDefaultParams(effectId));
    }, [index, effectId, onUpdate]);

    return (
        <div className="border border-white/8 rounded-lg bg-white/[0.02] overflow-hidden transition-all duration-200">
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-white/5"
                onClick={() => setExpanded(!expanded)}>
                {expanded
                    ? <ChevronDown size={12} className="text-white/30" />
                    : <ChevronRight size={12} className="text-white/30" />
                }
                <span className="text-xs font-medium text-white/80 flex-1">{effect.name}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${cat.color}`}>
                    {cat.label}
                </span>
                <button
                    onClick={(e) => { e.stopPropagation(); handleResetAll(); }}
                    className="p-1 hover:bg-white/10 rounded transition-colors"
                    title="Reset to defaults"
                >
                    <RotateCcw size={10} className="text-white/30" />
                </button>
                <button
                    onClick={(e) => { e.stopPropagation(); onRemove(index); }}
                    className="p-1 hover:bg-red-500/20 rounded transition-colors"
                    title="Remove effect"
                >
                    <Trash2 size={11} className="text-red-400/50" />
                </button>
            </div>

            {/* Parameters */}
            {expanded && (
                <div className="px-3 pb-2 space-y-0.5 border-t border-white/5">
                    {effect.parameters.map((param) => {
                        const value = params[param.key] !== undefined ? params[param.key] : param.default;
                        switch (param.type) {
                            case 'slider':
                                return <ParamSlider key={param.key} param={param} value={value} onChange={handleParamChange} />;
                            case 'toggle':
                                return <ParamToggle key={param.key} param={param} value={!!value} onChange={handleParamChange} />;
                            case 'select':
                                return <ParamSelect key={param.key} param={param} value={String(value)} onChange={handleParamChange} />;
                            case 'color':
                                return <ParamColor key={param.key} param={param} value={String(value)} onChange={handleParamChange} />;
                            default:
                                return null;
                        }
                    })}
                </div>
            )}
        </div>
    );
};

// ── Main Panel ───────────────────────────────────────────────────────────────

export const EffectsPanel: React.FC<EffectsPanelProps> = ({ clipId }) => {
    const clip = useClipStore((s) => s.clips.find((c) => c.id === clipId));
    const [dropdownOpen, setDropdownOpen] = useState(false);

    const effectsByCategory = useMemo(() => getEffectsByCategory(), []);
    const appliedEffects = clip?.parametricEffects ?? [];

    const updateEffects = useCallback(
        (updated: typeof appliedEffects) => {
            useClipStore.getState().updateClip(clipId, { parametricEffects: updated });
        },
        [clipId]
    );

    const handleAddEffect = useCallback(
        (effectId: string) => {
            const defaults = getDefaultParams(effectId);
            const updated = [...appliedEffects, { effectId, params: defaults }];
            updateEffects(updated);
            setDropdownOpen(false);
        },
        [appliedEffects, updateEffects]
    );

    const handleUpdateEffect = useCallback(
        (index: number, params: Record<string, number | string | boolean>) => {
            const updated = appliedEffects.map((e, i) => (i === index ? { ...e, params } : e));
            updateEffects(updated);
        },
        [appliedEffects, updateEffects]
    );

    const handleRemoveEffect = useCallback(
        (index: number) => {
            const updated = appliedEffects.filter((_, i) => i !== index);
            updateEffects(updated);
        },
        [appliedEffects, updateEffects]
    );

    if (!clip) return null;

    return (
        <div className="space-y-2">
            {/* Header + Add Button */}
            <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-white/60 uppercase tracking-wider">Effects</h4>
                <div className="relative">
                    <button
                        onClick={() => setDropdownOpen(!dropdownOpen)}
                        className="flex items-center gap-1 px-2 py-1 text-xs bg-purple-500/15 hover:bg-purple-500/25
                                   text-purple-300 rounded border border-purple-500/20 transition-colors"
                    >
                        <Plus size={12} /> Add
                    </button>

                    {/* Dropdown */}
                    {dropdownOpen && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
                            <div className="absolute right-0 top-full mt-1 w-56 bg-zinc-900 border border-white/10
                                            rounded-lg shadow-xl z-50 max-h-72 overflow-y-auto py-1">
                                {Object.entries(effectsByCategory).map(([category, effects]) => {
                                    const cat = CATEGORY_META[category] || { label: category, color: '' };
                                    return (
                                        <div key={category}>
                                            <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-white/30 font-semibold">
                                                {cat.label}
                                            </div>
                                            {effects.map((effect) => (
                                                <button
                                                    key={effect.id}
                                                    onClick={() => handleAddEffect(effect.id)}
                                                    className="w-full text-left px-3 py-1.5 text-xs text-white/70
                                                               hover:bg-white/5 hover:text-white/90 transition-colors"
                                                    title={effect.description}
                                                >
                                                    {effect.name}
                                                </button>
                                            ))}
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Applied Effects */}
            {appliedEffects.length === 0 ? (
                <p className="text-xs text-white/25 italic py-2">No effects applied</p>
            ) : (
                <div className="space-y-1.5">
                    {appliedEffects.map((effect, i) => (
                        <EffectCard
                            key={`${effect.effectId}-${i}`}
                            effectId={effect.effectId}
                            params={effect.params}
                            index={i}
                            onUpdate={handleUpdateEffect}
                            onRemove={handleRemoveEffect}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};
