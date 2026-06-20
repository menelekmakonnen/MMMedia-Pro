/**
 * ICUNI Edit Bridge (MMMedia Pro store → interchange)
 * Reads the live project + clip stores and produces a lossless ICUNI Edit
 * document for Edia / Premiere. Mirrors manifestBridge's store access, but emits
 * the full, versioned interchange instead of the legacy lossy manifest.
 */

import { useProjectStore } from '../store/projectStore';
import { useClipStore } from '../store/clipStore';
import { clipsToIcuniEdit } from './icuniExport';
import type { IcuniEdit } from './icuniEdit';

export function generateIcuniEdit(): IcuniEdit {
    const { settings } = useProjectStore.getState();
    const { clips } = useClipStore.getState();
    return clipsToIcuniEdit(clips, {
        name: settings.name || 'Untitled',
        fps: settings.fps || 30,
        width: settings.resolution?.width || 1920,
        height: settings.resolution?.height || 1080,
    });
}
