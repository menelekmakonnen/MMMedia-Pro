// ══════════════════════════════════════════════════════════════════════════════
// SequenceMenuBar — Premiere-style application menu bar for the Sequence page.
// File · Edit · Clip · Sequence · Marker · View — with real wired actions.
// ══════════════════════════════════════════════════════════════════════════════

import React, { useState, useRef, useEffect } from 'react';
import clsx from 'clsx';
import { useClipStore } from '../../store/clipStore';
import { useProjectStore } from '../../store/projectStore';
import { useTimelineStore } from './timeline/useTimelineStore';
import { useHistoryStore } from '../../store/historyStore';
import { useSequenceViewStore } from '../../store/sequenceViewStore';
import { usePremiereFxStore } from '../../store/premiereFxStore';
import {
  splitAtPlayhead, deleteSelectedClips, rippleDeleteSelectedClips,
  copySelectedClips, pasteAtPlayhead, cutSelectedClips, duplicateSelectedClips,
  toggleClipEnabled,
} from './actions';
import { downloadFcpxml } from '../../lib/premiere/fcpxmlExport';
import { parseFcpxml } from '../../lib/premiere/fcpxmlImport';
import { prprojToXml, parsePrproj } from '../../lib/premiere/prprojImport';
import {
  applyAttributes, migrateClipToEffectControls, syncEffectControlsToLegacy,
  type AttributeSelection,
} from '../../lib/premiere/effectControls';
import { effectControlsToParametric } from '../../lib/premiere/effectLibrary';

interface MenuItem {
  label: string;
  shortcut?: string;
  run?: () => void;
  disabled?: boolean;
  checked?: boolean;
  separator?: boolean;
}
interface Menu { title: string; items: MenuItem[] }

export const SequenceMenuBar: React.FC = () => {
  const [open, setOpen] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const clips = useClipStore((s) => s.clips);
  const selectedClipIds = useClipStore((s) => s.selectedClipIds);
  const updateClip = useClipStore((s) => s.updateClip);
  const settings = useProjectStore((s) => s.settings);
  const snapEnabled = useTimelineStore((s) => s.snapEnabled);
  const toggleSnap = useTimelineStore((s) => s.toggleSnapEnabled);
  const showGuides = useTimelineStore((s) => s.showGuides);
  const toggleGuides = useTimelineStore((s) => s.toggleGuides);
  const playhead = useTimelineStore((s) => s.playheadFrame);
  const addMarker = useTimelineStore((s) => s.addMarker);
  const markers = useTimelineStore((s) => s.markers);
  const { undo, redo, canUndo, canRedo } = useHistoryStore();
  const { attributeClip, attributeSourceName } = usePremiereFxStore();

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (barRef.current && !barRef.current.contains(e.target as Node)) setOpen(null); };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, []);

  const W = settings.resolution?.width ?? 1920;
  const H = settings.resolution?.height ?? 1080;

  const pasteAttributes = () => {
    if (!attributeClip) return;
    const sel: AttributeSelection = { motion: true, opacity: true, timeRemap: false, speed: false, effects: true, audioEffects: true };
    const ids = selectedClipIds.length ? selectedClipIds : [];
    for (const id of ids) {
      const clip = clips.find((c) => c.id === id);
      if (!clip) continue;
      const target = clip.effectControls ?? migrateClipToEffectControls(clip as any, W, H);
      const next = applyAttributes(target, attributeClip, sel);
      updateClip(id, {
        effectControls: next,
        parametricEffects: effectControlsToParametric(next),
        ...syncEffectControlsToLegacy(next, W, H),
      } as any);
    }
  };

  const exportFcpxml = () => {
    const name = String((settings as any).projectName || 'sequence').replace(/[^\w.-]+/g, '_');
    downloadFcpxml(clips, { fps: settings.fps, resolution: settings.resolution }, `${name}.fcpxml`);
  };

  const importProject = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.fcpxml,.xml,.prproj';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const isPrproj = /\.prproj$/i.test(file.name);
        const seq = isPrproj
          ? parsePrproj(await prprojToXml(await file.arrayBuffer()), settings.fps)
          : parseFcpxml(await file.text());
        useProjectStore.getState().updateSettings?.({
          fps: seq.fps,
          resolution: { width: seq.width, height: seq.height, label: `${seq.width}x${seq.height}` },
        } as any);
        useClipStore.getState().setClips(seq.clips);
        if (seq.warnings.length) {
          window.alert(`Imported "${seq.name}" — ${seq.clips.length} clip(s).\n\nNotes:\n• ${seq.warnings.join('\n• ')}`);
        }
      } catch (e) {
        window.alert('Import failed: ' + (e as Error).message);
      }
    };
    input.click();
  };

  const menus: Menu[] = [
    {
      title: 'File',
      items: [
        { label: 'Import: Final Cut Pro XML…', shortcut: '⌃I', run: importProject },
        { label: 'Import: Premiere Project (.prproj)…', run: importProject },
        { separator: true, label: '' },
        { label: 'Export: Final Cut Pro XML…', shortcut: '⌃M', run: exportFcpxml },
        { label: 'Export: Premiere (FCPXML)…', run: exportFcpxml },
      ],
    },
    {
      title: 'Edit',
      items: [
        { label: 'Undo', shortcut: '⌃Z', run: undo, disabled: !canUndo },
        { label: 'Redo', shortcut: '⌃⇧Z', run: redo, disabled: !canRedo },
        { separator: true, label: '' },
        { label: 'Cut', shortcut: '⌃X', run: cutSelectedClips, disabled: !selectedClipIds.length },
        { label: 'Copy', shortcut: '⌃C', run: copySelectedClips, disabled: !selectedClipIds.length },
        { label: 'Paste', shortcut: '⌃V', run: () => pasteAtPlayhead(playhead) },
        {
          label: attributeClip ? `Paste Attributes (from ${attributeSourceName ?? 'clip'})` : 'Paste Attributes',
          shortcut: '⌃⌥V', run: pasteAttributes, disabled: !attributeClip || !selectedClipIds.length,
        },
        { separator: true, label: '' },
        { label: 'Duplicate', shortcut: '⌃⇧/', run: duplicateSelectedClips, disabled: !selectedClipIds.length },
        { label: 'Delete (Lift)', shortcut: 'Del', run: deleteSelectedClips, disabled: !selectedClipIds.length },
        { label: 'Ripple Delete', shortcut: '⇧Del', run: rippleDeleteSelectedClips, disabled: !selectedClipIds.length },
      ],
    },
    {
      title: 'Clip',
      items: [
        { label: 'Speed / Duration…', shortcut: '⌃R', run: () => useSequenceViewStore.getState().setSpeedDialogOpen(true), disabled: !selectedClipIds.length },
        { label: 'Enable / Disable', shortcut: 'E', run: () => selectedClipIds.forEach(toggleClipEnabled), disabled: !selectedClipIds.length },
        { label: 'Duplicate', run: duplicateSelectedClips, disabled: !selectedClipIds.length },
      ],
    },
    {
      title: 'Sequence',
      items: [
        { label: 'Add Edit (Razor at Playhead)', shortcut: '⌃K', run: () => splitAtPlayhead(playhead) },
      ],
    },
    {
      title: 'Marker',
      items: [
        {
          label: 'Add Marker', shortcut: 'M',
          run: () => addMarker({ id: crypto.randomUUID(), frame: playhead, label: `Marker ${markers.length + 1}`, color: '#facc15' }),
        },
      ],
    },
    {
      title: 'View',
      items: [
        { label: 'Snap', shortcut: 'S', run: toggleSnap, checked: snapEnabled },
        { label: 'Show Guides', run: toggleGuides, checked: showGuides },
      ],
    },
  ];

  return (
    <div ref={barRef} className="h-7 flex items-center px-1 bg-[#0a0a14] border-b border-white/[0.06] flex-shrink-0 select-none relative z-40">
      {menus.map((m) => (
        <div key={m.title} className="relative">
          <button
            onClick={() => setOpen((o) => (o === m.title ? null : m.title))}
            onMouseEnter={() => open && setOpen(m.title)}
            className={clsx('px-2.5 h-7 text-[11px] transition-colors', open === m.title ? 'bg-white/[0.08] text-white' : 'text-white/55 hover:text-white/90')}
          >
            {m.title}
          </button>
          {open === m.title && (
            <div className="absolute left-0 top-7 min-w-[230px] bg-[#15152b] border border-white/10 rounded-b-lg shadow-2xl py-1 z-50">
              {m.items.map((it, i) =>
                it.separator ? (
                  <div key={i} className="my-1 border-t border-white/[0.06]" />
                ) : (
                  <button
                    key={i}
                    disabled={it.disabled}
                    onClick={() => { it.run?.(); setOpen(null); }}
                    className={clsx(
                      'w-full flex items-center justify-between gap-6 px-3 py-1 text-[11px] text-left transition-colors',
                      it.disabled ? 'text-white/20 cursor-default' : 'text-white/75 hover:bg-indigo-500/25 hover:text-white',
                    )}
                  >
                    <span className="flex items-center gap-1.5">
                      {it.checked !== undefined && <span className="w-3 text-indigo-300">{it.checked ? '✓' : ''}</span>}
                      {it.label}
                    </span>
                    {it.shortcut && <span className="text-[9px] text-white/30 font-mono">{it.shortcut}</span>}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default SequenceMenuBar;
