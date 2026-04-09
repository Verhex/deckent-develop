/**
 * Tests for task-specific tsc error intersection logic in sprint-phases.ts.
 *
 * The CI Guardian now uses parseTscErrorFiles() to determine which files have
 * tsc errors, then checks intersection with task's filesChanged. Only tasks
 * whose changed files overlap with tsc error files get downgraded.
 */
import { describe, it, expect } from 'vitest';
import { parseTscErrorFiles } from '../../src/core/plugin-hooks.js';

// ─── Intersection Helper (mirrors sprint-phases.ts logic) ────────────────────

/**
 * Replicate the intersection logic from runEvaluatePhase:
 * Given tsc output and task's filesChanged, determine if this task caused the error.
 */
function hasTaskTscOverlap(tscOutput: string, filesChanged: string[]): boolean {
  const tscErrorFiles = parseTscErrorFiles(tscOutput);
  const taskFiles = new Set(filesChanged);
  return tscErrorFiles.some(f => taskFiles.has(f));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('CI Guardian — Task-Specific tsc Intersection', () => {
  const TSC_OUTPUT_SINGLE = 'src/core/config.ts(12,5): error TS2345: Argument of type "string" is not assignable...';

  const TSC_OUTPUT_MULTI = [
    'src/core/config.ts(12,5): error TS2345: Argument of type "string"...',
    'src/orchestra/brain.ts(44,10): error TS7006: Parameter "x" implicitly has an "any" type.',
    'src/cli/commands/start.ts(8,1): error TS2307: Cannot find module...',
  ].join('\n');

  // ─── Overlap detected — task IS responsible ──────────────────────

  it('detects overlap when task changed the file with tsc error', () => {
    expect(
      hasTaskTscOverlap(TSC_OUTPUT_SINGLE, ['src/core/config.ts', 'src/core/types.ts']),
    ).toBe(true);
  });

  it('detects overlap when task changed one of multiple error files', () => {
    expect(
      hasTaskTscOverlap(TSC_OUTPUT_MULTI, ['src/orchestra/brain.ts']),
    ).toBe(true);
  });

  it('detects overlap when task changed all error files', () => {
    expect(
      hasTaskTscOverlap(TSC_OUTPUT_MULTI, [
        'src/core/config.ts',
        'src/orchestra/brain.ts',
        'src/cli/commands/start.ts',
      ]),
    ).toBe(true);
  });

  // ─── No overlap — task is NOT responsible ────────────────────────

  it('returns false when task changed unrelated files', () => {
    expect(
      hasTaskTscOverlap(TSC_OUTPUT_SINGLE, ['src/orchestra/brain.ts', 'src/cli/start.ts']),
    ).toBe(false);
  });

  it('returns false when task changed no files', () => {
    expect(
      hasTaskTscOverlap(TSC_OUTPUT_MULTI, []),
    ).toBe(false);
  });

  it('returns false when tsc output is empty (no errors)', () => {
    expect(
      hasTaskTscOverlap('', ['src/core/config.ts', 'src/orchestra/brain.ts']),
    ).toBe(false);
  });

  it('returns false when tsc output has no error lines', () => {
    expect(
      hasTaskTscOverlap('Compilation complete.', ['src/core/config.ts']),
    ).toBe(false);
  });

  // ─── Edge cases ──────────────────────────────────────────────────

  it('handles duplicate tsc errors for the same file', () => {
    const output = [
      'src/core/config.ts(12,5): error TS2345: First error',
      'src/core/config.ts(20,3): error TS7006: Second error',
    ].join('\n');
    expect(hasTaskTscOverlap(output, ['src/core/config.ts'])).toBe(true);
  });

  it('is case-sensitive for file paths', () => {
    const output = 'src/Core/Config.ts(12,5): error TS2345: ...';
    // Task changed lowercase path — no overlap with PascalCase error
    expect(hasTaskTscOverlap(output, ['src/core/config.ts'])).toBe(false);
  });

  it('handles Windows-style backslash paths in tsc output', () => {
    const output = 'src\\core\\config.ts(12,5): error TS2345: Argument...';
    // filesChanged uses forward slashes — no overlap with backslash paths
    expect(hasTaskTscOverlap(output, ['src/core/config.ts'])).toBe(false);
    // But if filesChanged also uses backslashes, it should match
    expect(hasTaskTscOverlap(output, ['src\\core\\config.ts'])).toBe(true);
  });

  // ─── Multi-task scenario simulation ──────────────────────────────

  describe('multi-task scenario', () => {
    const tscOutput = [
      'src/core/config.ts(12,5): error TS2345: Argument...',
      'src/orchestra/sprint-phases.ts(100,3): error TS7006: Parameter...',
    ].join('\n');

    it('task A (changed config.ts) → responsible', () => {
      expect(hasTaskTscOverlap(tscOutput, ['src/core/config.ts', 'src/core/types.ts'])).toBe(true);
    });

    it('task B (changed sprint-phases.ts) → responsible', () => {
      expect(hasTaskTscOverlap(tscOutput, ['src/orchestra/sprint-phases.ts'])).toBe(true);
    });

    it('task C (changed unrelated files) → NOT responsible', () => {
      expect(hasTaskTscOverlap(tscOutput, ['src/cli/commands/help.ts', 'README.md'])).toBe(false);
    });
  });
});
