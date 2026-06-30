// ══════════════════════════════════════════════════════════════════════════════
// MarkersPanel — Premiere-style Markers panel. Lists sequence markers, jumps the
// playhead on click, edits label/color, adds at playhead, and deletes. Wired to
// the timeline store's marker model. Toggle via Window ▸ Markers.
// ══════════════════════════════════════════════════════════════════════════════

import React from 'react';
import { X, Plus, Bookmark, Trash2 } from 'lucide-react';
import { useTimelineStore } from './timeline/useTimelineStore';
import { useProjectStore } from '../../store/projectStore';
import { formatTimecode } from '../../lib/time';

const MARKER_COLORS = ['#facc15', '#ef4444', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#f97316', '#06b6d4'];

export const MarkersPanel: React.FC = () => {
  const open = useTimelineStore((s) => s.markersPanelOpen);
  const toggle = useTimelineStore((s) => s.toggleMarkersPanel);
  const markers = useTimelineStore((s) => s.markers);
  const addMarker = useTimelineStore((s) => s.addMarker);
  const removeMarker = useTimelineStore((s) => s.removeMarker);
  const updateMarker = useTimelineStore((s) => s.updateMarker);
  const playhead = useTimelineStore((s) => s.playheadFrame);
  const setPlayhead = useTimelineStore((s) => s.setPlayheadFrame);
  const fps = useProjectStore((s) => s.settings.fps) ?? 30;

  if (!open) return null;

  const sorted = [...markers].sort((a, b) => a.frame - b.frame);

  return (
    <div className="fixed right-4 top-20 z-[180] w-[300px] max-h-[60vh] bg-[#0d0d1c] border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3 h-9 bg-[#11112a] border-b border-white/[0.06]">
        <span className="text-[11px] font-semibold text-white/80 flex items-center gap-1.5"><Bookmark size={12} className="text-amber-300" /> Markers</span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => addMarker({ id: crypto.randomUUID(), frame: playhead, label: `Marker ${markers.length + 1}`, color: MARKER_COLORS[markers.length % MARKER_COLORS.length] })}
            className="text-white/45 hover:text-amber-300 flex items-center gap-0.5 text-[10px]"
            title="Add marker at playhead (M)"
          >
            <Plus size={12} /> Add
          </button>
          <button onClick={toggle} className="text-white/40 hover:text-white"><X size={14} /></button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {sorted.length === 0 ? (
          <p className="text-[10px] text-white/30 text-center py-8">No markers. Press <b>M</b> or Add to drop one at the playhead.</p>
        ) : (
          sorted.map((m) => (
            <div key={m.id} className="flex items-center gap-2 px-2.5 py-1.5 border-b border-white/[0.04] hover:bg-white/[0.03] group">
              <button
                onClick={() => {
                  const idx = MARKER_COLORS.indexOf(m.color);
                  updateMarker(m.id, { color: MARKER_COLORS[(idx + 1) % MARKER_COLORS.length] });
                }}
                className="w-3 h-3 rounded-sm flex-shrink-0 ring-1 ring-white/20"
                style={{ background: m.color }}
                title="Cycle color"
              />
              <input
                value={m.label}
                onChange={(e) => updateMarker(m.id, { label: e.target.value })}
                className="flex-1 bg-transparent text-[10px] text-white/75 outline-none focus:bg-white/[0.05] rounded px-1 min-w-0"
              />
              <button
                onClick={() => setPlayhead(m.frame)}
                className="text-[9px] font-mono text-indigo-300/70 hover:text-indigo-200 flex-shrink-0"
                title="Jump to marker"
              >
                {formatTimecode(m.frame, fps)}
              </button>
              <button
                onClick={() => removeMarker(m.id)}
                className="text-white/20 hover:text-red-400 flex-shrink-0 opacity-0 group-hover:opacity-100"
                title="Delete marker"
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default MarkersPanel;
