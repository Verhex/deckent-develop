import { describe, it, expect } from 'vitest';
import { ConflictResolver } from '../../src/orchestra/conflict-resolver.js';
import type { WorkerResult, Conflict } from '../../src/orchestra/conflict-resolver.js';

describe('ConflictResolver', () => {
  const resolver = new ConflictResolver();

  // ─── detectConflicts ─────────────────────────────────────────────

  describe('detectConflicts', () => {
    it('returns empty array for empty results', () => {
      expect(resolver.detectConflicts([])).toEqual([]);
    });

    it('returns empty array for single worker', () => {
      const results: WorkerResult[] = [
        { taskId: 'w1', filesChanged: ['src/a.ts', 'src/b.ts'] },
      ];
      expect(resolver.detectConflicts(results)).toEqual([]);
    });

    it('detects same_file_write conflict', () => {
      const results: WorkerResult[] = [
        { taskId: 'w1', filesChanged: ['src/shared.ts'] },
        { taskId: 'w2', filesChanged: ['src/shared.ts'] },
      ];
      const conflicts = resolver.detectConflicts(results);
      const sameFile = conflicts.filter(c => c.type === 'same_file_write');
      expect(sameFile.length).toBeGreaterThan(0);
      expect(sameFile[0]!.files).toContain('src/shared.ts');
      expect(sameFile[0]!.workers).toContain('w1');
      expect(sameFile[0]!.workers).toContain('w2');
    });

    it('detects test_interference conflict', () => {
      const results: WorkerResult[] = [
        { taskId: 'w1', filesChanged: ['tests/foo.test.ts'] },
        { taskId: 'w2', filesChanged: ['tests/foo.test.ts'] },
      ];
      const conflicts = resolver.detectConflicts(results);
      const testConflicts = conflicts.filter(c => c.type === 'test_interference');
      expect(testConflicts.length).toBeGreaterThan(0);
    });

    it('detects scope_overlap when 2+ files overlap', () => {
      const results: WorkerResult[] = [
        { taskId: 'w1', filesChanged: ['src/a.ts', 'src/b.ts', 'src/c.ts'] },
        { taskId: 'w2', filesChanged: ['src/a.ts', 'src/b.ts', 'src/d.ts'] },
      ];
      const conflicts = resolver.detectConflicts(results);
      const overlap = conflicts.filter(c => c.type === 'scope_overlap');
      expect(overlap.length).toBeGreaterThan(0);
      expect(overlap[0]!.files).toContain('src/a.ts');
      expect(overlap[0]!.files).toContain('src/b.ts');
    });

    it('does not report scope_overlap for single file overlap', () => {
      const results: WorkerResult[] = [
        { taskId: 'w1', filesChanged: ['src/a.ts', 'src/b.ts'] },
        { taskId: 'w2', filesChanged: ['src/a.ts', 'src/c.ts'] },
      ];
      const conflicts = resolver.detectConflicts(results);
      const overlap = conflicts.filter(c => c.type === 'scope_overlap');
      expect(overlap).toHaveLength(0);
    });

    it('no conflicts when workers touch different files', () => {
      const results: WorkerResult[] = [
        { taskId: 'w1', filesChanged: ['src/a.ts'] },
        { taskId: 'w2', filesChanged: ['src/b.ts'] },
      ];
      expect(resolver.detectConflicts(results)).toEqual([]);
    });

    it('handles three workers with shared file', () => {
      const results: WorkerResult[] = [
        { taskId: 'w1', filesChanged: ['src/index.ts'] },
        { taskId: 'w2', filesChanged: ['src/index.ts'] },
        { taskId: 'w3', filesChanged: ['src/index.ts'] },
      ];
      const conflicts = resolver.detectConflicts(results);
      const sameFile = conflicts.filter(c => c.type === 'same_file_write');
      expect(sameFile.length).toBeGreaterThan(0);
    });

    it('recognizes .spec.ts as test file', () => {
      const results: WorkerResult[] = [
        { taskId: 'w1', filesChanged: ['tests/foo.spec.ts'] },
        { taskId: 'w2', filesChanged: ['tests/foo.spec.ts'] },
      ];
      const conflicts = resolver.detectConflicts(results);
      const testConflicts = conflicts.filter(c => c.type === 'test_interference');
      expect(testConflicts.length).toBeGreaterThan(0);
    });

    it('recognizes __tests__ directory as test file', () => {
      const results: WorkerResult[] = [
        { taskId: 'w1', filesChanged: ['src/__tests__/utils.ts'] },
        { taskId: 'w2', filesChanged: ['src/__tests__/utils.ts'] },
      ];
      const conflicts = resolver.detectConflicts(results);
      const testConflicts = conflicts.filter(c => c.type === 'test_interference');
      expect(testConflicts.length).toBeGreaterThan(0);
    });

    it('handles workers with empty filesChanged', () => {
      const results: WorkerResult[] = [
        { taskId: 'w1', filesChanged: [] },
        { taskId: 'w2', filesChanged: [] },
      ];
      expect(resolver.detectConflicts(results)).toEqual([]);
    });
  });

  // ─── resolveConflict ─────────────────────────────────────────────

  describe('resolveConflict', () => {
    const conflict: Conflict = {
      type: 'same_file_write',
      files: ['src/shared.ts'],
      workers: ['w1', 'w2'],
      detail: 'test conflict',
    };

    it('last_writer_wins picks last worker', () => {
      const result = resolver.resolveConflict(conflict, 'last_writer_wins');
      expect(result.resolved).toBe(true);
      expect(result.winner).toBe('w2');
    });

    it('first_writer_wins picks first worker', () => {
      const result = resolver.resolveConflict(conflict, 'first_writer_wins');
      expect(result.resolved).toBe(true);
      expect(result.winner).toBe('w1');
    });

    it('manual returns unresolved', () => {
      const result = resolver.resolveConflict(conflict, 'manual');
      expect(result.resolved).toBe(false);
      expect(result.winner).toBeUndefined();
    });

    it('returns unresolved for empty workers', () => {
      const empty: Conflict = { type: 'same_file_write', files: [], workers: [], detail: '' };
      const result = resolver.resolveConflict(empty, 'last_writer_wins');
      expect(result.resolved).toBe(false);
    });
  });

  // ─── generateConflictReport ──────────────────────────────────────

  describe('generateConflictReport', () => {
    it('returns "No conflicts detected" for empty list', () => {
      expect(resolver.generateConflictReport([])).toBe('No conflicts detected.');
    });

    it('generates report with conflict details', () => {
      const conflicts: Conflict[] = [
        {
          type: 'same_file_write',
          files: ['src/a.ts'],
          workers: ['w1', 'w2'],
          detail: 'File "src/a.ts" modified by workers: w1, w2',
        },
      ];
      const report = resolver.generateConflictReport(conflicts);
      expect(report).toContain('Conflict Report (1 conflict)');
      expect(report).toContain('[same_file_write]');
      expect(report).toContain('src/a.ts');
    });

    it('pluralizes correctly for multiple conflicts', () => {
      const conflicts: Conflict[] = [
        { type: 'same_file_write', files: ['a.ts'], workers: ['w1'], detail: 'd1' },
        { type: 'scope_overlap', files: ['b.ts'], workers: ['w2'], detail: 'd2' },
      ];
      const report = resolver.generateConflictReport(conflicts);
      expect(report).toContain('2 conflicts');
    });
  });
});
