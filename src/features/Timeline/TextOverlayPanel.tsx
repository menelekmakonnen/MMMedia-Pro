import React, { useState, useCallback } from 'react';
import { Plus, Trash2, ChevronDown, ChevronRight, Type, Bold, Eye, EyeOff } from 'lucide-react';
import { useClipStore } from '../../store/clipStore';
import { TextOverlay, DEFAULT_TEXT_OVERLAY, TextPosition, TextAnimation } from '../../lib/textOverlay';

// ══════════════════════════════════════════════════════════════════════════════
// TextOverlayPanel — Panel for editing text overlays on a selected clip
// ══════════════════════════════════════════════════════════════════════════════

interface TextOverlayPanelProps {
    clipId: string;
}

const FONT_FAMILIES = [
    'Arial', 'Impact', 'Courier New', 'Georgia',
    'Times New Roman', 'Verdana', 'Comic Sans MS', 'Trebuchet MS',
];

const POSITIONS: { label: string; value: TextPosition }[] = [
    { label: '↖', value: 'top-left' },
    { label: '↑', value: 'top-center' },
    { label: '↗', value: 'top-right' },
    { label: '←', value: 'center-left' },
    { label: '●', value: 'center' },
    { label: '→', value: 'center-right' },
    { label: '↙', value: 'bottom-left' },
    { label: '↓', value: 'bottom-center' },
    { label: '↘', value: 'bottom-right' },
];

const ANIMATIONS: { label: string; value: TextAnimation }[] = [
    { label: 'None', value: 'none' },
    { label: 'Fade', value: 'fade' },
    { label: 'Slide Up', value: 'slide-up' },
    { label: 'Slide Down', value: 'slide-down' },
    { label: 'Slide Left', value: 'slide-left' },
    { label: 'Slide Right', value: 'slide-right' },
    { label: 'Typewriter', value: 'typewriter' },
];

// ── Collapsible Overlay Item ────────────────────────────────────────────────

const OverlayItem: React.FC<{
    clipId: string;
    overlay: TextOverlay;
}> = ({ clipId, overlay }) => {
    const [expanded, setExpanded] = useState(true);
    const { updateTextOverlay, removeTextOverlay } = useClipStore();
    const [showBorder, setShowBorder] = useState(
        !!(overlay.borderWidth && overlay.borderWidth > 0)
    );

    const update = useCallback(
        (updates: Partial<TextOverlay>) => {
            updateTextOverlay(clipId, overlay.id, updates);
        },
        [clipId, overlay.id, updateTextOverlay]
    );

    return (
        <div className="border border-white/10 rounded-lg mb-2 overflow-hidden bg-black/30">
            {/* Header */}
            <button
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-colors text-left"
                onClick={() => setExpanded(!expanded)}
            >
                {expanded ? (
                    <ChevronDown size={14} className="text-white/40" />
                ) : (
                    <ChevronRight size={14} className="text-white/40" />
                )}
                <Type size={14} className="text-purple-400" />
                <span className="text-xs text-white/70 truncate flex-1">
                    {overlay.text || 'Empty Text'}
                </span>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        removeTextOverlay(clipId, overlay.id);
                    }}
                    className="p-1 hover:bg-red-500/20 rounded transition-colors"
                    title="Delete Overlay"
                >
                    <Trash2 size={12} className="text-red-400/60" />
                </button>
            </button>

            {/* Body */}
            {expanded && (
                <div className="px-3 pb-3 space-y-3">
                    {/* Text Input */}
                    <div>
                        <label className="text-[10px] text-white/40 uppercase tracking-wider block mb-1">Text</label>
                        <textarea
                            value={overlay.text}
                            onChange={(e) => update({ text: e.target.value })}
                            className="w-full bg-black/40 border border-white/10 rounded-md px-2 py-1.5 text-xs text-white/90 resize-none focus:outline-none focus:border-purple-500/40"
                            rows={2}
                            placeholder="Enter text..."
                        />
                    </div>

                    {/* Font Family */}
                    <div>
                        <label className="text-[10px] text-white/40 uppercase tracking-wider block mb-1">Font</label>
                        <select
                            value={overlay.fontFamily}
                            onChange={(e) => update({ fontFamily: e.target.value })}
                            className="w-full bg-black/40 border border-white/10 rounded-md px-2 py-1.5 text-xs text-white/90 focus:outline-none focus:border-purple-500/40"
                        >
                            {FONT_FAMILIES.map((f) => (
                                <option key={f} value={f}>{f}</option>
                            ))}
                        </select>
                    </div>

                    {/* Font Size */}
                    <div>
                        <label className="text-[10px] text-white/40 uppercase tracking-wider block mb-1">
                            Size: {overlay.fontSize}px
                        </label>
                        <input
                            type="range"
                            min={12}
                            max={120}
                            value={overlay.fontSize}
                            onChange={(e) => update({ fontSize: parseInt(e.target.value) })}
                            className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-purple-500"
                        />
                    </div>

                    {/* Font Color + Weight */}
                    <div className="flex items-center gap-2">
                        <div className="flex-1">
                            <label className="text-[10px] text-white/40 uppercase tracking-wider block mb-1">Color</label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="color"
                                    value={overlay.fontColor}
                                    onChange={(e) => update({ fontColor: e.target.value })}
                                    className="w-8 h-6 bg-transparent border-0 cursor-pointer rounded"
                                />
                                <span className="text-[10px] text-white/50 font-mono">{overlay.fontColor}</span>
                            </div>
                        </div>
                        <button
                            onClick={() => update({ fontWeight: overlay.fontWeight === 'bold' ? 'normal' : 'bold' })}
                            className={`p-1.5 rounded-md border transition-colors ${
                                overlay.fontWeight === 'bold'
                                    ? 'bg-purple-500/20 border-purple-500/30 text-purple-300'
                                    : 'bg-black/30 border-white/10 text-white/40'
                            }`}
                            title="Bold"
                        >
                            <Bold size={14} />
                        </button>
                    </div>

                    {/* Position Grid */}
                    <div>
                        <label className="text-[10px] text-white/40 uppercase tracking-wider block mb-1">Position</label>
                        <div className="grid grid-cols-3 gap-1 w-24">
                            {POSITIONS.map((p) => (
                                <button
                                    key={p.value}
                                    onClick={() => update({ position: p.value })}
                                    className={`w-7 h-7 rounded text-[10px] flex items-center justify-center transition-colors ${
                                        overlay.position === p.value
                                            ? 'bg-purple-500/30 text-purple-300 border border-purple-500/40'
                                            : 'bg-black/40 text-white/40 border border-white/10 hover:bg-white/10'
                                    }`}
                                    title={p.value}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Offset X/Y */}
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="text-[10px] text-white/40 uppercase tracking-wider block mb-1">
                                Offset X: {overlay.offsetX}
                            </label>
                            <input
                                type="range"
                                min={-200}
                                max={200}
                                value={overlay.offsetX}
                                onChange={(e) => update({ offsetX: parseInt(e.target.value) })}
                                className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-purple-500"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] text-white/40 uppercase tracking-wider block mb-1">
                                Offset Y: {overlay.offsetY}
                            </label>
                            <input
                                type="range"
                                min={-200}
                                max={200}
                                value={overlay.offsetY}
                                onChange={(e) => update({ offsetY: parseInt(e.target.value) })}
                                className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-purple-500"
                            />
                        </div>
                    </div>

                    {/* Start/End Time */}
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="text-[10px] text-white/40 uppercase tracking-wider block mb-1">Start (s)</label>
                            <input
                                type="number"
                                min={0}
                                step={0.1}
                                value={overlay.startTime}
                                onChange={(e) => update({ startTime: parseFloat(e.target.value) || 0 })}
                                className="w-full bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-white/90 focus:outline-none focus:border-purple-500/40"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] text-white/40 uppercase tracking-wider block mb-1">End (s)</label>
                            <input
                                type="number"
                                min={0}
                                step={0.1}
                                value={overlay.endTime}
                                onChange={(e) => update({ endTime: parseFloat(e.target.value) || 0 })}
                                className="w-full bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-white/90 focus:outline-none focus:border-purple-500/40"
                            />
                        </div>
                    </div>

                    {/* Animation */}
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="text-[10px] text-white/40 uppercase tracking-wider block mb-1">Animation</label>
                            <select
                                value={overlay.animation}
                                onChange={(e) => update({ animation: e.target.value as TextAnimation })}
                                className="w-full bg-black/40 border border-white/10 rounded-md px-2 py-1.5 text-xs text-white/90 focus:outline-none focus:border-purple-500/40"
                            >
                                {ANIMATIONS.map((a) => (
                                    <option key={a.value} value={a.value}>{a.label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] text-white/40 uppercase tracking-wider block mb-1">
                                Duration: {overlay.animationDuration.toFixed(1)}s
                            </label>
                            <input
                                type="range"
                                min={0.1}
                                max={2.0}
                                step={0.1}
                                value={overlay.animationDuration}
                                onChange={(e) => update({ animationDuration: parseFloat(e.target.value) })}
                                className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-purple-500"
                            />
                        </div>
                    </div>

                    {/* Opacity */}
                    <div>
                        <label className="text-[10px] text-white/40 uppercase tracking-wider block mb-1">
                            Opacity: {Math.round(overlay.opacity * 100)}%
                        </label>
                        <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.05}
                            value={overlay.opacity}
                            onChange={(e) => update({ opacity: parseFloat(e.target.value) })}
                            className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-purple-500"
                        />
                    </div>

                    {/* Shadow Toggle */}
                    <div className="flex items-center justify-between">
                        <label className="text-[10px] text-white/40 uppercase tracking-wider">Shadow</label>
                        <button
                            onClick={() => update({ shadow: !overlay.shadow })}
                            className={`w-8 h-4 rounded-full transition-colors relative ${
                                overlay.shadow ? 'bg-purple-500' : 'bg-white/20'
                            }`}
                        >
                            <div
                                className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                                    overlay.shadow ? 'translate-x-4' : 'translate-x-0.5'
                                }`}
                            />
                        </button>
                    </div>

                    {/* Border Toggle + Settings */}
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <label className="text-[10px] text-white/40 uppercase tracking-wider">Border (Outline)</label>
                            <button
                                onClick={() => {
                                    setShowBorder(!showBorder);
                                    if (showBorder) {
                                        update({ borderWidth: 0, borderColor: undefined });
                                    } else {
                                        update({ borderWidth: 2, borderColor: '#000000' });
                                    }
                                }}
                                className={`w-8 h-4 rounded-full transition-colors relative ${
                                    showBorder ? 'bg-purple-500' : 'bg-white/20'
                                }`}
                            >
                                <div
                                    className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                                        showBorder ? 'translate-x-4' : 'translate-x-0.5'
                                    }`}
                                />
                            </button>
                        </div>
                        {showBorder && (
                            <div className="flex items-center gap-2 mt-1">
                                <input
                                    type="color"
                                    value={overlay.borderColor || '#000000'}
                                    onChange={(e) => update({ borderColor: e.target.value })}
                                    className="w-6 h-5 bg-transparent border-0 cursor-pointer rounded"
                                />
                                <input
                                    type="range"
                                    min={1}
                                    max={10}
                                    value={overlay.borderWidth || 2}
                                    onChange={(e) => update({ borderWidth: parseInt(e.target.value) })}
                                    className="flex-1 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                />
                                <span className="text-[10px] text-white/40 w-6 text-right">{overlay.borderWidth || 2}px</span>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

// ── Main Panel ──────────────────────────────────────────────────────────────

export const TextOverlayPanel: React.FC<TextOverlayPanelProps> = ({ clipId }) => {
    const { clips, addTextOverlay } = useClipStore();
    const clip = clips.find((c) => c.id === clipId);

    if (!clip) return null;

    const overlays: TextOverlay[] = (clip as any).textOverlays || [];

    const handleAdd = () => {
        const newOverlay: TextOverlay = {
            ...DEFAULT_TEXT_OVERLAY,
            id: crypto.randomUUID(),
        };
        addTextOverlay(clipId, newOverlay);
    };

    return (
        <div className="bg-black/50 border border-white/10 rounded-xl p-3">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <Type size={14} className="text-purple-400" />
                    <span className="text-xs font-semibold text-white/80 uppercase tracking-wider">
                        Text Overlays
                    </span>
                    {overlays.length > 0 && (
                        <span className="text-[10px] text-purple-400/60 bg-purple-500/10 px-1.5 py-0.5 rounded-full">
                            {overlays.length}
                        </span>
                    )}
                </div>
                <button
                    onClick={handleAdd}
                    className="p-1 hover:bg-purple-500/20 rounded-lg border border-transparent hover:border-purple-500/20 transition-all"
                    title="Add Text Overlay"
                >
                    <Plus size={14} className="text-purple-400" />
                </button>
            </div>

            {/* Overlay List */}
            {overlays.length === 0 ? (
                <div className="text-center py-4">
                    <Type size={20} className="mx-auto text-white/20 mb-2" />
                    <p className="text-[10px] text-white/30">No text overlays</p>
                    <p className="text-[10px] text-white/20">Click + to add one</p>
                </div>
            ) : (
                <div>
                    {overlays.map((overlay) => (
                        <OverlayItem
                            key={overlay.id}
                            clipId={clipId}
                            overlay={overlay}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};
