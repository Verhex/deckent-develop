import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  canonicalTaskResultBytes,
  canonicalTaskResultJson,
  decodeCanonicalTaskResultBytes,
  readTaskResult,
  TaskResultWriteError,
  writeTaskResultAtomic,
  type CanonicalTaskResultDocument,
} from '../../src/core/task-result-write-authority.js';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function result(taskId = '621-002'): Record<string, unknown> {
  return {
    schemaVersion: '1.0', taskId, workerId: 'w-621-002', provider: 'codex', model: 'gpt',
    agent: null, skills: [], attempt: 1, isPriorityFix: false, fixForTaskId: null,
    filesChanged: [], diskVerified: false, boundaryViolations: [],
    totalLinesAdded: 1, totalLinesRemoved: 0,
    tokenUsage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0, totalTokens: 2, source: 'provider-adapter' },
    cost: { usd: 0, currency: 'USD', pricingSource: 'test', isLocal: false },
    tests: { passed: 1, failed: 0, total: 1, coverage: null, command: null, orchestratorVerified: false },
    tsc: { clean: true, errors: 0 }, selfAssessment: 'DONE', goCriteria: [], notes: '',
    brainEvaluation: null, brainEvaluationReason: null, rubricScores: null, totalScore: null,
    honestGate: { flagged: false, violation: null }, handoffNotes: null, sharedNotes: [], auditorValidation: null,
  };
}

describe('task result write authority', () => {
  it('publishes canonical bytes atomically and is restart-readable/idempotent', () => {
    const root = mkdtempSync(join(tmpdir(), 'result-authority-')); roots.push(root);
    const path = join(root, 'terminal.result');
    expect(writeTaskResultAtomic({ path, taskId: '621-002', attemptId: 'attempt-1', result: result() }).state).toBe('written');
    expect(readTaskResult(path, { taskId: '621-002', attemptId: 'attempt-1' }).result.taskId).toBe('621-002');
    expect(writeTaskResultAtomic({ path, taskId: '621-002', attemptId: 'attempt-1', result: result() }).state).toBe('already-written');
    expect(readFileSync(path).at(-1)).toBe(10);
  });

  it('preserves first-writer authority and reports conflicting content', () => {
    const root = mkdtempSync(join(tmpdir(), 'result-authority-')); roots.push(root);
    const path = join(root, 'terminal.result');
    writeTaskResultAtomic({ path, taskId: '621-002', attemptId: 'a', result: result() });
    const changed = { ...result(), notes: 'different' };
    expect(() => writeTaskResultAtomic({ path, taskId: '621-002', attemptId: 'a', result: changed })).toThrowError(expect.objectContaining({ code: 'conflict' }));
  });

  it('rejects wrong identities and non-canonical, invalid UTF-8/JSON, and oversize bytes', () => {
    const doc = { schemaVersion: 1, taskId: '621-002', attemptId: 'a', result: result() } as CanonicalTaskResultDocument;
    const bytes = canonicalTaskResultBytes(doc);
    expect(() => decodeCanonicalTaskResultBytes(bytes, { taskId: 'other', attemptId: 'a' })).toThrowError(expect.objectContaining({ code: 'identity-mismatch' }));
    expect(() => decodeCanonicalTaskResultBytes(Buffer.from([0xff]), { taskId: '621-002', attemptId: 'a' })).toThrowError(expect.objectContaining({ code: 'invalid-utf8' }));
    expect(() => decodeCanonicalTaskResultBytes(Buffer.from('{'), { taskId: '621-002', attemptId: 'a' })).toThrowError(expect.objectContaining({ code: 'invalid-json' }));
    expect(() => decodeCanonicalTaskResultBytes(Buffer.from(` ${Buffer.from(bytes).toString('utf8')}`), { taskId: '621-002', attemptId: 'a' })).toThrowError(expect.objectContaining({ code: 'non-canonical-bytes' }));
    expect(() => decodeCanonicalTaskResultBytes(bytes, { taskId: '621-002', attemptId: 'a' }, 2)).toThrowError(expect.objectContaining({ code: 'oversize' }));
  });

  it('fails closed for unsupported values rather than JSON.stringify normalization', () => {
    for (const value of [Number.NaN, 1n, { value: undefined }, 'line\nfeed']) {
      expect(() => canonicalTaskResultJson(value)).toThrow(TaskResultWriteError);
    }
    const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
    expect(() => canonicalTaskResultJson(cyclic)).toThrowError(expect.objectContaining({ code: 'invalid-value' }));
    expect(() => canonicalTaskResultJson({ 'line\nfeed': true })).toThrowError(expect.objectContaining({ code: 'invalid-value' }));
  });

  it('rejects schema defaults and unknown properties instead of silently normalizing them', () => {
    const root = mkdtempSync(join(tmpdir(), 'result-authority-')); roots.push(root);
    const path = join(root, 'normalized.result');
    const { schemaVersion: _omitted, ...missingDefault } = result();
    expect(() => writeTaskResultAtomic({ path, taskId: '621-002', attemptId: 'a', result: missingDefault }))
      .toThrowError(expect.objectContaining({ code: 'schema-invalid' }));
    expect(() => writeTaskResultAtomic({ path, taskId: '621-002', attemptId: 'a', result: { ...result(), unknown: true } }))
      .toThrowError(expect.objectContaining({ code: 'schema-invalid' }));
    expect(() => readFileSync(path)).toThrow();
  });

  it('does not publish when schema validation or Windows adapter publication fails', () => {
    const root = mkdtempSync(join(tmpdir(), 'result-authority-')); roots.push(root);
    const invalidPath = join(root, 'invalid.result');
    expect(() => writeTaskResultAtomic({ path: invalidPath, taskId: '621-002', attemptId: 'a', result: { taskId: '621-002' } })).toThrowError(expect.objectContaining({ code: 'schema-invalid' }));
    expect(() => readFileSync(invalidPath)).toThrow();
    const windowsPath = join(root, 'windows.result');
    expect(() => writeTaskResultAtomic({
      path: windowsPath, taskId: '621-002', attemptId: 'a', result: result(),
      renameAdapter: { platform: 'windows', renameAbsent: () => { throw Object.assign(new Error('sharing violation'), { code: 'EPERM' }); } },
    })).toThrowError(expect.objectContaining({ code: 'io-failure' }));
    expect(() => readFileSync(windowsPath)).toThrow();
  });
});
