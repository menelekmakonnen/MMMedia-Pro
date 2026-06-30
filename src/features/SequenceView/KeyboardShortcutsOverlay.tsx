import React from 'react';
import { X, HelpCircle, Command } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

const SHORTCUT_GROUPS = [
    {
        title: 'Timeline Tools',
        keys: [
            { key: 'V', desc: 'Selection Tool' },
            { key: 'T', desc: 'Trim Controls Tool' },
            { key: 'C', desc: 'Razor Tool' },
            { key: 'Y', desc: 'Slip Adjust Tool' },
            { key: 'U', desc: 'Slide Adjust Tool' },
            { key: 'H', desc: 'Hand/Scroll Tool' },
            { key: 'R', desc: 'Rate Stretch Tool' },
            { key: 'S', desc: 'Toggle Magnetic Snap' },
        ],
    },
    {
        title: 'Playback & Transport',
        keys: [
            { key: 'Space', desc: 'Play / Pause toggle' },
            { key: 'L', desc: 'Play forward' },
            { key: 'K', desc: 'Pause' },
            { key: 'J', desc: 'Pause and step back one frame' },
            { key: 'Left / Right', desc: 'Step playhead backward / forward 1 frame' },
            { key: 'Shift + Left/Right', desc: 'Step playhead 10 frames' },
            { key: 'Home', desc: 'Jump to start of sequence' },
        ],
    },
    {
        title: 'Editing & Timeline Operations',
        keys: [
            { key: 'B', desc: 'Split clip(s) at playhead position' },
            { key: 'Ctrl + D', desc: 'Duplicate selected clip(s)' },
            { key: 'M', desc: 'Add timeline marker at playhead' },
            { key: 'I / O', desc: 'Set In / Out point at playhead' },
            { key: 'Delete', desc: 'Lift clip (leave gap)' },
            { key: 'Shift + Del', desc: 'Ripple Delete (close gap)' },
            { key: 'E', desc: 'Enable / Disable selected clip(s)' },
        ],
    },
    {
        title: 'Workspace Navigation',
        keys: [
            { key: '+ / -', desc: 'Zoom in / out timeline scale' },
            { key: 'Shift + Z', desc: 'Fit entire sequence inside window' },
            { key: 'Ctrl + Z', desc: 'Undo edit action' },
            { key: 'Ctrl + Shift + Z', desc: 'Redo edit action' },
            { key: 'Esc', desc: 'Cancel selection / reset to Selection Tool' },
        ],
    },
];

export const KeyboardShortcutsOverlay: React.FC<Props> = ({ isOpen, onClose }) => {
    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md">
                    {/* Modal body */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 15 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 15 }}
                        className="w-full max-w-2xl bg-[#0d0d22]/90 border border-white/10 rounded-2xl p-6 shadow-2xl flex flex-col max-h-[85vh] text-white relative"
                    >
                        {/* Close button */}
                        <button
                            onClick={onClose}
                            className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-white/5 text-white/40 hover:text-white transition-colors"
                        >
                            <X size={16} />
                        </button>

                        {/* Title header */}
                        <div className="flex items-center gap-2 mb-6 border-b border-white/5 pb-4">
                            <HelpCircle className="text-purple-400" size={20} />
                            <div>
                                <h2 className="text-lg font-black tracking-wide">NLE Keyboard Shortcuts</h2>
                                <p className="text-xs text-white/30 font-medium">Standard Premiere / DaVinci Resolve bindings</p>
                            </div>
                        </div>

                        {/* Shortcuts lists grid */}
                        <div className="flex-1 overflow-y-auto grid grid-cols-2 gap-6 pr-2 select-none">
                            {SHORTCUT_GROUPS.map((group) => (
                                <div key={group.title} className="space-y-3">
                                    <h3 className="text-xs font-black text-purple-400/80 uppercase tracking-widest border-b border-purple-500/10 pb-1">
                                        {group.title}
                                    </h3>
                                    <div className="space-y-2">
                                        {group.keys.map((item) => (
                                            <div key={item.key} className="flex justify-between items-start gap-4">
                                                <span className="text-[10px] text-white/50 leading-relaxed font-semibold">
                                                    {item.desc}
                                                </span>
                                                <kbd className="px-2 py-0.5 rounded bg-[#151532] border border-white/10 font-mono text-[9px] font-bold text-indigo-300 shadow-sm shrink-0 whitespace-nowrap">
                                                    {item.key}
                                                </kbd>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Footer details */}
                        <div className="mt-6 border-t border-white/5 pt-4 flex items-center justify-between text-[10px] text-white/20">
                            <div className="flex items-center gap-1">
                                <Command size={10} />
                                <span>Press <kbd className="bg-[#151532] px-1 border border-white/10 font-mono">?</kbd> key to open/close this helper modal</span>
                            </div>
                            <button
                                onClick={onClose}
                                className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold transition-all shadow-md shadow-purple-600/10"
                            >
                                Got it
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};
