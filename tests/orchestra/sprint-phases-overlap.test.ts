// ═══ Sprint 324 324-004 — Post-Execution Worker Overlap Detection ══════════
// Validates that detectOverlaps correctly identifies files changed by >1 worker
// (the logic wired into runEvaluatePhase as a post-execution check).
//
// Pattern mirrors sprint-phases-ci-intersection.test.ts: tests the overlap
// detection logic directly, not the full runEvaluatePhase lifecycle.

import { describe, it, expect } from 'vitest';
import { ResultMerger } from '../../src/orchestra/result-merger.js';
import type { OverlapDetectable } from '../../src/orchestra/result-merger.js';

// ─── Helpers ──────────────────────────────────────────────────────────

function makeResult(taskId: string, filesChanged: string[]): OverlapDetectable {
  return { taskId, filesChanged };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Post-Execution Overlap Detection (sprint-phases EVALUATE wire)', () => {
  const merger = new ResultMerger();

  // ─── Overlap detected — 2-worker-same-file → RED → GREEN ────────

  it('detects overlap when 2 workers changed the same file', () => {
    const results: OverlapDetectable[] = [
      makeResult('324-001', ['src/orchestra/sprint-phases.ts', 'src/orchestra/brain.ts']),
      makeResult('324-002', ['src/orchestra/sprint-phases.ts', 'src/core/types.ts']),
    ];
    const overlaps = merger.detectOverlaps(results);
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]!.file).toBe('src/orchestra/sprint-phases.ts');
    expect(overlaps[0]!.workers).toContain('324-001');
    expect(overlaps[0]!.workers).toContain('324-002');
  });

  it('detects multiple overlapping files across workers', () => {
    const results: OverlapDetectable[] = [
      makeResult('t-001', ['src/a.ts', 'src/b.ts', 'src/c.ts']),
      makeResult('t-002', ['src/a.ts', 'src/b.ts']),
      makeResult('t-003', ['src/d.ts']),
    ];
    const overlaps = merger.detectOverlaps(results);
    expect(overlaps).toHaveLength(2);
    const files = overlaps.map(o => o.file);
    expect(files).toContain('src/a.ts');
    expect(files).toContain('src/b.ts');
  });

  it('includes all worker IDs for a 3-way overlap', () => {
    const results: OverlapDetectable[] = [
      makeResult('w1', ['shared.ts']),
      makeResult('w2', ['shared.ts']),
      makeResult('w3', ['shared.ts']),
    ];
    const overlaps = merger.detectOverlaps(results);
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]!.workers).toEqual(['w1', 'w2', 'w3']);
  });

  // ─── No overlap — workers are clean ─────────────────────────────

  it('returns empty when workers changed disjoint files', () => {
    const results: OverlapDetectable[] = [
      makeResult('w1', ['src/a.ts', 'src/b.ts']),
      makeResult('w2', ['src/c.ts', 'src/d.ts']),
    ];
    expect(merger.detectOverlaps(results)).toEqual([]);
  });

  it('returns empty for a single worker (no other worker to overlap with)', () => {
    const results: OverlapDetectable[] = [
      makeResult('w1', ['src/a.ts', 'src/b.ts', 'src/c.ts']),
    ];
    expect(merger.detectOverlaps(results)).toEqual([]);
  });

  it('returns empty when results list is empty', () => {
    expect(merger.detectOverlaps([])).toEqual([]);
  });

  it('returns empty when workers changed no files', () => {
    const results: OverlapDetectable[] = [
      makeResult('w1', []),
      makeResult('w2', []),
    ];
    expect(merger.detectOverlaps(results)).toEqual([]);
  });

  // ─── Input filtering mirrors runEvaluatePhase wire ──────────────
  // The wire filters out results with empty filesChanged before calling
  // detectOverlaps. These tests verify the filter logic independently.

  it('workers with empty filesChanged contribute no overlaps', () => {
    const all: OverlapDetectable[] = [
      makeResult('w1', ['src/x.ts']),
      makeResult('w2', []),
      makeResult('w3', ['src/x.ts']),
    ];
    // Simulating the .filter(r => r.filesChanged.length > 0) in the wire
    const filtered = all.filter(r => r.filesChanged.length > 0);
    const overlaps = merger.detectOverlaps(filtered);
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]!.file).toBe('src/x.ts');
    expect(overlaps[0]!.workers).toEqual(['w1', 'w3']);
  });

  it('overlap check short-circuits when fewer than 2 workers have filesChanged', () => {
    const all: OverlapDetectable[] = [
      makeResult('w1', ['src/a.ts']),
      makeResult('w2', []),
    ];
    // Simulating: if (overlapInput.length >= 2) guard in sprint-phases wire
    const filtered = all.filter(r => r.filesChanged.length > 0);
    // Only 1 worker has files — no overlap possible
    expect(filtered).toHaveLength(1);
    const overlaps = merger.detectOverlaps(filtered);
    expect(overlaps).toEqual([]);
  });
});
