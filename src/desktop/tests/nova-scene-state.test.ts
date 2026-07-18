// P19 — Komuta-sahnesi durum-makinesi pinleri: idle/READY yazısının TEK
// otoritesi deriveSceneState'tir; exhaustive tarama + adlı-regresyonlar.

import { describe, expect, it } from 'vitest';
import { deriveSceneState, type OrderPhase, type SceneInput } from '../src/renderer/nova/scene-state.js';

const BOOLS = [false, true] as const;
const ORDERS: Array<OrderPhase | null> = [null, 'previewing', 'ready', 'starting'];

function allInputs(): SceneInput[] {
  const out: SceneInput[] = [];
  for (const offline of BOOLS)
    for (const sprintActive of BOOLS)
      for (const draftNonEmpty of BOOLS)
        for (const order of ORDERS)
          for (const chatStreaming of BOOLS)
            out.push({ offline, sprintActive, draftNonEmpty, order, chatStreaming });
  return out;
}

describe('deriveSceneState — exhaustive priority invariants (64 combos)', () => {
  it('honors strict priority OFFLINE > RUNNING > ORDER > CHAT > COMPOSING > IDLE', () => {
    for (const input of allInputs()) {
      const { state } = deriveSceneState(input);
      const expected = input.offline ? 'OFFLINE'
        : input.sprintActive ? 'RUNNING'
        : input.order !== null ? 'ORDER'
        : input.chatStreaming ? 'CHAT'
        : input.draftNonEmpty ? 'COMPOSING'
        : 'IDLE';
      expect(state, JSON.stringify(input)).toBe(expected);
    }
  });

  it('idle line shows ONLY in IDLE/OFFLINE; READY center label ONLY in IDLE', () => {
    for (const input of allInputs()) {
      const { state, visibility } = deriveSceneState(input);
      const label = JSON.stringify(input);
      if (visibility.idleLine !== 'hidden') expect(['IDLE', 'OFFLINE'], label).toContain(state);
      if (visibility.centerLabel === 'ready') expect(state, label).toBe('IDLE');
      if (visibility.centerLabel === 'phase') expect(state, label).toBe('RUNNING');
    }
  });
});

describe('deriveSceneState — named P19 regressions', () => {
  const base: SceneInput = { offline: false, sprintActive: false, draftNonEmpty: false, order: null, chatStreaming: false };

  it('READY dies on the first keystroke (draft-only → COMPOSING, nothing painted)', () => {
    expect(deriveSceneState({ ...base, draftNonEmpty: true })).toEqual({
      state: 'COMPOSING',
      visibility: { idleLine: 'hidden', centerLabel: 'none' },
    });
  });

  it('order in flight hides idle text through every card phase', () => {
    for (const order of ['previewing', 'ready', 'starting'] as const) {
      expect(deriveSceneState({ ...base, order }).visibility.idleLine).toBe('hidden');
    }
  });

  it('chat streaming (draft already cleared by Enter) does NOT fall back to READY', () => {
    expect(deriveSceneState({ ...base, chatStreaming: true })).toEqual({
      state: 'CHAT',
      visibility: { idleLine: 'hidden', centerLabel: 'ellipsis' },
    });
  });

  it('offline wins even over a stale active snapshot (connectivity honesty)', () => {
    expect(deriveSceneState({ ...base, offline: true, sprintActive: true })).toEqual({
      state: 'OFFLINE',
      visibility: { idleLine: 'offline', centerLabel: 'none' },
    });
  });

  it('all-quiet is IDLE with the breathing ready label', () => {
    expect(deriveSceneState(base)).toEqual({
      state: 'IDLE',
      visibility: { idleLine: 'idle', centerLabel: 'ready' },
    });
  });
});
