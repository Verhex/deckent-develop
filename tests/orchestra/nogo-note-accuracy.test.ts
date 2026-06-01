/**
 * Tests for buildAccurateNoGoNote — Sprint 210 210-008
 *
 * Verifies that NO_GO notes accurately reflect the real cause:
 * - result exists with self-NO_GO → says "worker self-NO_GO, N files"
 * - crash fallback result (no .result file) → says "no result file"
 */
import { describe, it, expect } from 'vitest';
import {
  buildAccurateNoGoNote,
  buildEnrichedFixReason,
} from '../../src/orchestra/result-evaluator.js';
import type { TaskResult } from '../../src/core/types.js';

function makeResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: '210-008',
    workerId: 'w-210-008',
    filesChanged: ['src/core/foo.ts'],
    linesAdded: 10,
    linesRemoved: 2,
    testsPassed: false,
    coverage: 0,
    selfAssessment: 'NO_GO',
    notes: 'tests failed due to missing mock',
    ...overrides,
  };
}

describe('buildAccurateNoGoNote()', () => {
  it('result-var: worker self-NO_GO note includes files and lines', () => {
    const result = makeResult({
      selfAssessment: 'NO_GO',
      filesChanged: ['src/a.ts', 'src/b.ts'],
      linesAdded: 42,
      notes: 'type error in handler',
    });
    const note = buildAccurateNoGoNote(result);
    expect(note).toContain('worker self-NO_GO');
    expect(note).toContain('2 files');
    expect(note).toContain('42 lines added');
  });

  it('result-yok: crash fallback note says "no result file"', () => {
    const result = makeResult({
      filesChanged: [],
      linesAdded: 0,
      notes: 'Worker exited without writing result file',
      selfAssessment: 'NO_GO',
    });
    const note = buildAccurateNoGoNote(result);
    expect(note).toContain('no result file');
    expect(note).not.toContain('worker self-NO_GO');
  });

  it('self-NO_GO: 0 files is shown accurately (files=0 note)', () => {
    const result = makeResult({
      selfAssessment: 'NO_GO',
      filesChanged: [],
      linesAdded: 0,
      notes: 'could not locate target function',
    });
    const note = buildAccurateNoGoNote(result);
    expect(note).toContain('worker self-NO_GO');
    expect(note).toContain('0 files');
    expect(note).toContain('0 lines added');
  });

  it('docker crash pattern "exited without writing result" maps to no-result note', () => {
    const result = makeResult({
      filesChanged: [],
      linesAdded: 0,
      notes: 'Worker exited without writing result (exitCode=1)',
      selfAssessment: 'NO_GO',
    });
    const note = buildAccurateNoGoNote(result);
    expect(note).toContain('no result file');
  });

  it('buildEnrichedFixReason includes accurateReason as second element', () => {
    const result = makeResult({
      selfAssessment: 'NO_GO',
      filesChanged: ['src/foo.ts'],
      linesAdded: 5,
      notes: 'assertion failed',
    });
    const reason = buildEnrichedFixReason('210-008', result);
    expect(reason).toContain('Task 210-008 evaluated as NO_GO');
    expect(reason).toContain('worker self-NO_GO');
    expect(reason).toContain('1 files');
  });
});
