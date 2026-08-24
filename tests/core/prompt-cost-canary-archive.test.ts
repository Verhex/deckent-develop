import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPromptCostCanaryTaskAuthority } from '../../src/core/prompt-cost-canary-task-authority.js';

vi.mock('../../src/core/sprint-archive.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/core/sprint-archive.js')>();
  return {
    ...actual,
    verifySprintArchive: vi.fn(() => ({ ok: true, checked: 3, missing: [], mismatched: [], untracked: [], manifestDigestValid: true })),
    verifySprintArchiveTerminal: vi.fn((_root: string, sprintId: string) => ({
      sprintId, ok: true, reasonCodes: [], manifestDigest: `${sprintId}-digest`, sealReceiptSha256: 'x', brainIndexSha256: null, guardedSummarySha256: null,
    })),
  };
});

import { readPromptCostCanaryArchiveCohort } from '../../src/core/prompt-cost-canary-archive.js';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

type Attempt = {
  readonly taskId: string;
  readonly attemptId: string;
  readonly fixForTaskId?: string;
  readonly verdict?: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO';
  readonly quality?: number;
  readonly usage?: readonly [number, number, number, number];
  readonly providerUsd?: number;
};

function fixture(sprintId: string, attempts: readonly Attempt[] = [], options: {
  readonly sidecars?: boolean;
  readonly duplicateResult?: boolean;
  readonly evaluationAttemptId?: string;
  readonly conflicts?: readonly unknown[];
} = {}): string {
  const root = roots[0] ?? mkdtempSync(join(tmpdir(), 'canary-archive-'));
  if (roots.length === 0) roots.push(root);
  const archive = join(root, '.deckent/archive/sprints', sprintId);
  const rootTaskId = `${sprintId.slice(7)}-001`;
  const resolvedAttempts = attempts.length > 0 ? attempts : [{ taskId: rootTaskId, attemptId: `attempt-${sprintId}`, providerUsd: 0.08 }];
  const definition = {
    title: 'Prompt canary', description: 'Compare the same production workload.',
    type: 'code-development' as const,
    scope: { directories: ['src/'], filesRead: [], filesWrite: ['src/canary.ts'] },
    dependencies: [],
    goNogo: { goCriteria: 'Tests pass', noGoCriteria: 'Tests fail', techDebtAcceptable: 'None' },
  };
  const promptCostCanary = createPromptCostCanaryTaskAuthority(definition, {
    codex_core_channel: true,
    codex_suppress_project_doc: false,
  });
  const receipt = {
    version: 1, sprintId, runId: `run-${sprintId}`, coordinatorGeneration: 1,
    terminalOutcome: 'COMPLETE', logicalSettlementDigest: 'a'.repeat(64),
    priorAuthorityVersion: 0, authorityVersion: 1,
  };
  const files: Record<string, unknown> = {};
  const terminalAttempts = resolvedAttempts.map((attempt, index) => {
    const [inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens] = attempt.usage ?? [10 + index, 2, 4, 1];
    const task = { id: attempt.taskId, ...definition, promptCostCanary, ...(attempt.fixForTaskId ? { fixForTaskId: attempt.fixForTaskId } : {}) };
    const result = {
      schemaVersion: '1.0', taskId: attempt.taskId, sprintId, workerId: `w-${attempt.taskId}`, provider: 'codex', model: 'gpt-x',
      durationMs: 1000 + index, filesChanged: [], totalLinesAdded: 0, totalLinesRemoved: 0,
      workAttribution: { state: 'VERIFIED', attemptId: attempt.attemptId, baselineRef: 'base', scopeDigest: 'a'.repeat(64) },
      tokenUsage: { inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens, totalTokens: inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens, source: 'provider-adapter' },
      cost: { usd: 999, currency: 'USD', pricingSource: 'reference-catalog', isLocal: false },
      ...(attempt.providerUsd === undefined ? {} : { providerBilling: { source: 'provider-envelope', provider: 'codex', currency: 'USD', providerReportedUsd: attempt.providerUsd, modelUsage: {}, capturedAt: '2026-08-24T00:00:00Z' } }),
      tests: { passed: 1, failed: 0, total: 1 }, tsc: { clean: true, errors: 0 }, selfAssessment: attempt.verdict ?? 'DONE',
    };
    files[`tasks/task-${attempt.taskId}.json`] = task;
    files[`tasks/task-${attempt.taskId}.result`] = result;
    files[`evaluations/arbitrary-${index}.json`] = {
      taskId: attempt.taskId, sprintId, attemptId: options.evaluationAttemptId ?? attempt.attemptId,
      decision: attempt.verdict ?? 'DONE', totalScore: attempt.quality ?? 91,
    };
    return {
      id: attempt.attemptId, taskId: attempt.taskId, logicalRootTaskId: rootTaskId,
      ...(attempt.fixForTaskId ? { fixForTaskId: attempt.fixForTaskId } : {}),
      inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens, referenceCostUsd: 999, invoicedCostUsd: 0.1,
    };
  });
  if (options.sidecars) {
    files[`tasks/task-${rootTaskId}.landing.json`] = { taskId: rootTaskId, untrusted: true };
    files[`tasks/task-${rootTaskId}.skill.json`] = { taskId: rootTaskId, untrusted: true };
  }
  if (options.duplicateResult) files[`tasks/task-${rootTaskId}.result.json`] = files[`tasks/task-${rootTaskId}.result`]!;
  const usage = terminalAttempts.reduce((total, attempt) => ({
    inputTokens: total.inputTokens + attempt.inputTokens, outputTokens: total.outputTokens + attempt.outputTokens,
    cacheReadTokens: total.cacheReadTokens + attempt.cacheReadTokens, cacheCreationTokens: total.cacheCreationTokens + attempt.cacheCreationTokens,
  }), { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 });
  files[`${sprintId}-terminal-receipt.json`] = {
    version: 1, terminalOutcome: 'COMPLETE', receipt,
    lineageUsage: [{ logicalRootTaskId: rootTaskId, billingAuthority: 'metered', attempts: terminalAttempts, tokenUsage: usage, referenceCostUsd: 1998, billedUsd: { state: 'known', usd: terminalAttempts.length / 10 } }],
  };
  files['terminal-seal-receipt.json'] = { terminalReceipt: receipt };
  const artifacts = Object.entries(files).map(([path, value]) => {
    const bytes = `${JSON.stringify(value)}\n`; mkdirSync(join(archive, path, '..'), { recursive: true }); writeFileSync(join(archive, path), bytes);
    return { path, family: path.startsWith('evaluations/') ? 'evaluations' : path.startsWith('tasks/') ? 'tasks' : 'run', bytes: Buffer.byteLength(bytes), sha256: createHash('sha256').update(bytes).digest('hex'), sources: [] };
  });
  writeFileSync(join(archive, 'manifest.json'), JSON.stringify({ kind: 'deckent.sprint-archive-manifest', schemaVersion: 1, sprintId, terminalOutcome: 'COMPLETE', artifactCount: artifacts.length, totalBytes: 0, familyCounts: {}, artifacts, conflicts: options.conflicts ?? [], memoryReferences: [], contentDigest: `${sprintId}-digest` }));
  return root;
}

describe('canonical prompt-cost canary archive cohort', () => {
  it('ignores landing and skill sidecars while reading only canonical task roles', () => {
    const root = fixture('sprint-700', [], { sidecars: true }); fixture('sprint-701');
    const value = readPromptCostCanaryArchiveCohort({ projectRoot: root, sprintIds: ['sprint-700', 'sprint-701'] });
    expect(value.ok).toBe(true);
    if (!value.ok) return;
    expect(value.samples[0]).toMatchObject({ sprintId: 'sprint-700', attemptId: 'attempt-sprint-700', verdict: 'DONE', quality: 91 });
  });

  it('folds root NO_GO and FIX DONE by terminal lineage identity, not filename order', () => {
    const rootTaskId = '702-001';
    const root = fixture('sprint-702', [
      { taskId: rootTaskId, attemptId: 'root-no-go', verdict: 'NO_GO', quality: 15, usage: [10, 2, 4, 1], providerUsd: 0.08 },
      { taskId: `${rootTaskId}-fix-fix`, fixForTaskId: rootTaskId, attemptId: 'fix-done', verdict: 'DONE', quality: 97, usage: [20, 3, 5, 2], providerUsd: 0.12 },
    ]);
    fixture('sprint-703');
    const value = readPromptCostCanaryArchiveCohort({ projectRoot: root, sprintIds: ['sprint-702', 'sprint-703'] });
    expect(value.ok).toBe(true);
    if (!value.ok) return;
    expect(value.samples[0]).toMatchObject({ taskId: '702-001-fix-fix', attemptId: 'fix-done', attempt: 2, verdict: 'DONE', quality: 97, tokenUsage: { inputTokens: 30, outputTokens: 5, cacheReadTokens: 9, cacheCreationTokens: 3, totalTokens: 47 }, providerReportedUsd: { available: true, usd: 0.2, source: 'provider-envelope' } });
    expect(value.samples[0]?.billingSource.pricingSource).toBe('reference-catalog');
  });

  it('rejects duplicate canonical results, mismatched exact evaluation identity, and conflicted manifests', () => {
    const root = fixture('sprint-704', [], { duplicateResult: true }); fixture('sprint-705');
    expect(readPromptCostCanaryArchiveCohort({ projectRoot: root, sprintIds: ['sprint-704', 'sprint-705'] })).toMatchObject({ ok: false, rejections: expect.arrayContaining([expect.objectContaining({ reason: 'invalid-artifact', sprintId: 'sprint-704' })]) });
    roots.splice(0).forEach(path => rmSync(path, { recursive: true, force: true }));
    const mismatchRoot = fixture('sprint-706', [], { evaluationAttemptId: 'foreign-attempt' }); fixture('sprint-707', [], { conflicts: [{ path: 'tasks/task-707-001.json' }] });
    expect(readPromptCostCanaryArchiveCohort({ projectRoot: mismatchRoot, sprintIds: ['sprint-706', 'sprint-707'] })).toMatchObject({ ok: false, rejections: expect.arrayContaining([
      expect.objectContaining({ reason: 'incomplete-lineage', sprintId: 'sprint-706' }),
      expect.objectContaining({ reason: 'invalid-manifest', sprintId: 'sprint-707' }),
    ]) });
  });

  it('does not consult unmanifested legacy docs, evidence, or transcripts', () => {
    const root = fixture('sprint-708'); fixture('sprint-709');
    writeFileSync(join(root, '.deckent/archive/sprints/sprint-708/transcript.log'), '{not authority}');
    writeFileSync(join(root, '.deckent/archive/sprints/sprint-708/docs-evidence.json'), '{not authority}');
    expect(readPromptCostCanaryArchiveCohort({ projectRoot: root, sprintIds: ['sprint-708', 'sprint-709'] }).ok).toBe(true);
    expect(readFileSync(join(root, '.deckent/archive/sprints/sprint-708/transcript.log'), 'utf8')).toBe('{not authority}');
  });
});
