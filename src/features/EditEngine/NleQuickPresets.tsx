/**
 * NleQuickPresets — a one-click strip of automated NLE looks for the Edit
 * Generator. Each card applies a coherent professional treatment across the
 * clips currently on the timeline (single undo step), so users get a finished
 * result without opening the inspector.
 */
import React from 'react';
import { motion } from 'framer-motion';
import {
  Blend, ZoomIn, Palette, RectangleHorizontal, Film, Gauge, Scissors, Eraser, Sparkles,
} from 'lucide-react';
import { NLE_PRESETS } from '../../lib/nlePresets';
import { useClipStore } from '../../store/clipStore';
import { toast } from '../../components/Toast';

const ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  Blend, ZoomIn, Palette, RectangleHorizontal, Film, Gauge, Scissors, Eraser,
};

export const NleQuickPresets: React.FC = () => {
  const clipCount = useClipStore((s) => s.clips.length);

  const run = (preset: (typeof NLE_PRESETS)[number]) => {
    if (clipCount === 0) {
      toast.warning('Add clips to the timeline first, then apply a preset.');
      return;
    }
    const n = preset.apply();
    if (n === 0) {
      toast.info(`${preset.label}: no eligible video clips on the timeline.`);
    } else {
      toast.success(`${preset.label} applied to ${n} clip${n > 1 ? 's' : ''}. (Ctrl+Z to undo)`);
    }
  };

  return (
    <div className="mt-10">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={15} className="text-purple-300" />
        <h2 className="text-sm font-bold text-white/80">Quick NLE Presets</h2>
        <span className="text-[11px] text-white/35">
          One-click looks applied to your current timeline{clipCount > 0 ? ` (${clipCount} clips)` : ''}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
        {NLE_PRESETS.map((p, i) => {
          const Icon = ICONS[p.icon] ?? Sparkles;
          return (
            <motion.button
              key={p.id}
              onClick={() => run(p)}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.97 }}
              className="group text-left rounded-xl p-3 bg-white/[0.03] border border-white/10 hover:border-white/20 transition-colors"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className={`p-1.5 rounded-lg bg-white/5 ${p.accent}`}>
                  <Icon size={15} />
                </span>
                <span className="text-xs font-bold text-white/85">{p.label}</span>
              </div>
              <p className="text-[10px] text-white/40 leading-relaxed">{p.description}</p>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};
