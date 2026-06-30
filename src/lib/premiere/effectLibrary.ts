// ══════════════════════════════════════════════════════════════════════════════
// effectLibrary.ts — Bridge the parametric effect registry into the Premiere
// Effect Controls model.
//
// When a user applies an effect from the Effects panel, it becomes a non-fixed
// EffectComponent on clip.effectControls.video, so it appears in the Effect
// Controls panel with keyframeable parameters — exactly like Premiere. We also
// project the component back onto clip.parametricEffects (single static values)
// so the existing FFmpeg export path keeps baking it until the renderer reads the
// Premiere model natively.
// ══════════════════════════════════════════════════════════════════════════════

import { EFFECT_REGISTRY, type ParametricEffect, type EffectParameter } from '../effectRegistry';
import {
  type EffectComponent, type EffectParam, type EffectControlsState,
  type ScalarParam, evalScalar,
} from './effectControls';

let _n = 0;
const uid = () => { try { return crypto.randomUUID(); } catch { return `fx-${Date.now()}-${_n++}`; } };

/** Convert one registry parameter to a Premiere-model EffectParam. */
function paramFromRegistry(p: EffectParameter): EffectParam {
  switch (p.type) {
    case 'toggle':
      return { id: p.key, name: p.label, type: 'bool', keyframed: false, value: Boolean(p.default), defaultValue: Boolean(p.default) };
    case 'select':
      return { id: p.key, name: p.label, type: 'enum', keyframed: false, value: String(p.default), defaultValue: String(p.default), options: p.options ?? [] };
    case 'color':
      return { id: p.key, name: p.label, type: 'color', keyframed: false, value: String(p.default), defaultValue: String(p.default) };
    case 'slider':
    default: {
      const isPct = p.unit === '%';
      return {
        id: p.key, name: p.label,
        type: isPct ? 'percent' : 'scalar',
        keyframed: false,
        value: Number(p.default) || 0,
        defaultValue: Number(p.default) || 0,
        min: p.min, max: p.max, step: p.step, unit: p.unit,
      } as ScalarParam;
    }
  }
}

/** Build a non-fixed video EffectComponent from a registry effect id. */
export function componentFromEffectId(effectId: string): EffectComponent | null {
  const def = EFFECT_REGISTRY.find((e) => e.id === effectId);
  if (!def) return null;
  return {
    id: uid(),
    matchName: `MA.${def.id}`,         // MMMedia match name (round-trips to our own registry)
    name: def.name,
    kind: 'video',
    fixed: false,
    enabled: true,
    expanded: true,
    params: def.parameters.map(paramFromRegistry),
  };
}

export interface AppliedParametric { effectId: string; params: Record<string, number | string | boolean> }

/** Static snapshot of a component's params for the legacy parametric export path. */
export function componentToParametric(c: EffectComponent): AppliedParametric | null {
  if (!c.matchName.startsWith('MA.')) return null;
  const effectId = c.matchName.slice(3);
  const params: Record<string, number | string | boolean> = {};
  for (const p of c.params) {
    if (p.type === 'bool') params[p.id] = p.value;
    else if (p.type === 'enum' || p.type === 'color') params[p.id] = p.value;
    else params[p.id] = evalScalar(p as ScalarParam, 0); // static value at clip start
  }
  return { effectId, params };
}

/** Project all non-fixed video components → clip.parametricEffects for export. */
export function effectControlsToParametric(state: EffectControlsState): AppliedParametric[] {
  return state.video
    .filter((c) => !c.fixed && c.enabled && c.matchName.startsWith('MA.'))
    .map(componentToParametric)
    .filter((x): x is AppliedParametric => x !== null);
}

/** Append a user effect (immutably) to a clip's effect-controls video stack. */
export function appendEffectComponent(state: EffectControlsState, comp: EffectComponent): EffectControlsState {
  return { ...state, video: [...state.video, comp] };
}

/** Remove a component by id (no-op for fixed effects). */
export function removeComponent(state: EffectControlsState, compId: string): EffectControlsState {
  return {
    ...state,
    video: state.video.filter((c) => c.id !== compId || c.fixed),
    audio: state.audio.filter((c) => c.id !== compId || c.fixed),
  };
}

/** Effects grouped by Premiere-style category for the browser. */
export function effectCatalog(): Record<string, ParametricEffect[]> {
  const out: Record<string, ParametricEffect[]> = {};
  for (const e of EFFECT_REGISTRY) (out[e.category] ??= []).push(e);
  return out;
}
