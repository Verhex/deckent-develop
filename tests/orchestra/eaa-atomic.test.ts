// ─── EAA atomic write tests (EVAL-AUDIT-ATOMIC, task 351-013) ───────────────
// Proves writeEvaluationAudit went from a plain writeFileSync to the same
// `.tmp` + `renameSync` atomic pattern as sprint-checkpoint.ts::writeCheckpoint
// and core/approval-broker.ts::atomicWriteJson: a crash mid-write must never
// leave a torn/half-written audit record — readers only ever see the prior
// file (untouched) or the fully new one.

// node:fs is mocked only to give the "rename fails" test control over a
// single renameSync call; every other export passes through to the real
// implementation (see tests/core/approval-broker.test.ts — vi.spyOn(fs, ...)
// throws under Node's native ESM loader, vi.mock is this project's supported
// pattern).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    renameSync: vi.fn(actual.renameSync),
  };
});

import { mkdtempSync, rmSync, readFileSync, readdirSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { EVALUATIONS_DIR } from '../../src/core/constants.js';
import {
  evaluationAuditPath,
  writeEvaluationAudit,
  type AuditSchemaValidation,
  type EvaluationAuditInput,
} from '../../src/orchestra/evaluation-audit-trail.js';

const mockedRenameSync = vi.mocked(renameSync);

const VALID_SCHEMA: AuditSchemaValidation = {
  valid: true,
  missingFields: [],
  coverageRelaxed: false,
};

function buildInput(overrides: Partial<EvaluationAuditInput> = {}): EvaluationAuditInput {
  return {
    ruleSet: 'CODE',
    schemaValidation: VALID_SCHEMA,
    criterionScores: [
      { name: 'correctness', score: 90, threshold: 60, weight: 1.0, passed: true, reason: 'tests passed' },
    ],
    totalScore: 90,
    decision: 'DONE',
    timestamp: '2026-07-01T14:15:53.000Z',
    ...overrides,
  };
}

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'deckent-eaa-atomic-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('writeEvaluationAudit — atomic write', () => {
  it('leaves no leftover .tmp sibling after a clean write', () => {
    writeEvaluationAudit(root, 'sprint-351', 'task-1', 1, buildInput());

    const sprintDir = join(root, EVALUATIONS_DIR, 'sprint-351');
    const files = readdirSync(sprintDir);
    expect(files).toContain('task-1-attempt-1.json');
    expect(files.some((f) => f.endsWith('.tmp'))).toBe(false);
  });

  it('refuses a conflicting rewrite before rename and leaves the prior record untouched', () => {
    // Seed an existing "old" record at this exact path.
    writeEvaluationAudit(root, 'sprint-351', 'task-2', 1, buildInput({ decision: 'NO_GO', totalScore: 10 }));
    const filePath = evaluationAuditPath(root, 'sprint-351', 'task-2', 1);
    const before = readFileSync(filePath, 'utf-8');
    mockedRenameSync.mockClear();

    // A durable evaluation identity is append-once. A differing retry must be
    // rejected before the atomic rename boundary instead of overwriting the
    // already-settled record.
    mockedRenameSync.mockImplementationOnce(() => {
      throw new Error('simulated rename failure');
    });

    expect(() =>
      writeEvaluationAudit(root, 'sprint-351', 'task-2', 1, buildInput({ decision: 'DONE', totalScore: 99 })),
    ).toThrow('EVALUATION_AUDIT_CONFLICT');

    expect(mockedRenameSync).not.toHaveBeenCalled();

    // The final file remains exactly what it was before.
    const after = readFileSync(filePath, 'utf-8');
    expect(after).toBe(before);
    expect(JSON.parse(after).decision).toBe('NO_GO');

    // No orphaned .tmp file left behind.
    const sprintDir = join(root, EVALUATIONS_DIR, 'sprint-351');
    const files = readdirSync(sprintDir);
    expect(files.some((f) => f.endsWith('.tmp'))).toBe(false);
    expect(files).toEqual(['task-2-attempt-1.json']);
  });

  it('recovers on retry after a simulated rename failure and produces the fully-new content (never partial)', () => {
    mockedRenameSync.mockImplementationOnce(() => {
      throw new Error('simulated rename failure');
    });
    expect(() =>
      writeEvaluationAudit(root, 'sprint-351', 'task-3', 1, buildInput()),
    ).toThrow('simulated rename failure');

    // The mock's base implementation still delegates to the real renameSync,
    // so a subsequent write succeeds normally and is the fully new record.
    const record = writeEvaluationAudit(root, 'sprint-351', 'task-3', 1, buildInput({ decision: 'GO_WITH_TECH_DEBT' }));

    const filePath = evaluationAuditPath(root, 'sprint-351', 'task-3', 1);
    const onDisk = JSON.parse(readFileSync(filePath, 'utf-8'));
    expect(onDisk).toEqual(record);
    expect(onDisk.decision).toBe('GO_WITH_TECH_DEBT');
  });

  it('creates no final file at all when the very first write for a path fails at rename time', () => {
    mockedRenameSync.mockImplementationOnce(() => {
      throw new Error('simulated rename failure');
    });

    expect(() =>
      writeEvaluationAudit(root, 'sprint-351', 'task-4', 1, buildInput()),
    ).toThrow('simulated rename failure');

    const sprintDir = join(root, EVALUATIONS_DIR, 'sprint-351');
    const files = readdirSync(sprintDir);
    expect(files).toEqual([]);
  });
});
