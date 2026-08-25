// 446-013 — ghost rejection and quality gate (hand-coded Slice-1 close).
// The api-design phantom-100% class dies at the source: outcomes attributed to
// contentless entities are rejected VISIBLY (counted), never recorded, never silent.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { recordOutcome, readCellsSnapshot } from '../../../src/core/routing/learning-cells.js';

function withTmpRoot(fn: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), 'r3-ghost-'));
  try {
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const BASE = {
  taskId: 't-1',
  sprintId: 'sprint-x',
  workType: 'build' as const,
  // 2026-08-25 (A2 fairness wave): canonical domain id is 'core/runtime';
  // legacy 'core-runtime' keys are migrated on read (normalizeLegacyCellKeys).
  domain: 'core/runtime',
  verdict: 'DONE' as const,
  quality: 90,
};

describe('ghost rejection + quality gate', () => {
  it('ghost outcome rejected + counted; cells untouched', () => {
    withTmpRoot((root) => {
      const result = recordOutcome(root, { ...BASE, agentId: 'ghost-agent' }, {
        ghostEntityIds: new Set(['ghost-agent']),
      });
      expect(result.recorded).toBe(false);
      expect(result.rejected?.reason).toBe('ghost-entity');

      const snapshot = readCellsSnapshot(root);
      expect(Object.keys(snapshot.cells)).toHaveLength(0);
      expect(snapshot.rejectedOutcomes['ghost-entity']).toBe(1);
    });
  });

  it('non-finite quality rejected visibly; finite out-of-range clamped', () => {
    withTmpRoot((root) => {
      const bad = recordOutcome(root, { ...BASE, agentId: 'a', quality: Number.NaN });
      expect(bad.recorded).toBe(false);
      expect(bad.rejected?.reason).toBe('malformed-quality');
      expect(readCellsSnapshot(root).rejectedOutcomes['malformed-quality']).toBe(1);

      const clamped = recordOutcome(root, { ...BASE, agentId: 'a', quality: 250 });
      expect(clamped.recorded).toBe(true);
      const cell = readCellsSnapshot(root).cells['build|core/runtime|a'];
      expect(cell?.qualitySum).toBe(100); // clamped to the scale ceiling
    });
  });

  it('non-ghost outcomes record normally alongside a rejected sibling (store byte-consistent)', () => {
    withTmpRoot((root) => {
      recordOutcome(root, { ...BASE, agentId: 'ghost-agent' }, { ghostEntityIds: new Set(['ghost-agent']) });
      const ok = recordOutcome(root, { ...BASE, taskId: 't-2', agentId: 'real-agent' }, {
        ghostEntityIds: new Set(['ghost-agent']),
      });
      expect(ok.recorded).toBe(true);
      const snapshot = readCellsSnapshot(root);
      expect(snapshot.cells['build|core/runtime|real-agent']?.uses).toBe(1);
      expect(snapshot.cells['build|core/runtime|ghost-agent']).toBeUndefined();
    });
  });
});
