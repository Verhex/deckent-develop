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

function fixture(sprintId: string, overrides: { terminalAttempt?: string; duplicateResult?: boolean; providerUsd?: number } = {}): string {
  const root = roots[0] ?? mkdtempSync(join(tmpdir(), 'canary-archive-'));
  if (roots.length === 0) roots.push(root);
  const archive = join(root, '.deckent/archive/sprints', sprintId);
  const taskId = `${sprintId.slice(7)}-001`;
  const attemptId = `attempt-${sprintId}`;
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
  const task = { id: taskId, ...definition, promptCostCanary };
  const result = {
    schemaVersion: '1.0', taskId, sprintId, workerId: `w-${taskId}`, provider: 'codex', model: 'gpt-x',
    attempt: 1, durationMs: 1234, filesChanged: [], totalLinesAdded: 0, totalLinesRemoved: 0,
    workAttribution: { state: 'VERIFIED', attemptId, baselineRef: 'base', scopeDigest: 'a'.repeat(64) },
    tokenUsage: { inputTokens: 10, outputTokens: 2, cacheReadTokens: 4, cacheCreationTokens: 1, totalTokens: 17, source: 'provider-adapter' },
    cost: { usd: 0.1, currency: 'USD', pricingSource: 'catalog', isLocal: false },
    ...(overrides.providerUsd === undefined ? {} : { providerBilling: { source: 'provider-envelope', provider: 'codex', currency: 'USD', providerReportedUsd: overrides.providerUsd, modelUsage: {}, capturedAt: '2026-08-24T00:00:00Z' } }),
    tests: { passed: 1, failed: 0, total: 1 }, tsc: { clean: true, errors: 0 }, selfAssessment: 'DONE',
  };
  const evaluation = { taskId, sprintId, attemptNum: 1, decision: 'DONE', totalScore: 91 };
  const terminalAttemptId = overrides.terminalAttempt ?? attemptId;
  const receipt = {
    version: 1, sprintId, runId: `run-${sprintId}`, coordinatorGeneration: 1,
    terminalOutcome: 'COMPLETE', logicalSettlementDigest: 'a'.repeat(64),
    priorAuthorityVersion: 0, authorityVersion: 1,
  };
  const lineageUsage = [{
    logicalRootTaskId: taskId, billingAuthority: 'metered',
    attempts: [{ id: terminalAttemptId, taskId, logicalRootTaskId: taskId,
      inputTokens: 10, outputTokens: 2, cacheReadTokens: 4, cacheCreationTokens: 1,
      referenceCostUsd: 0.1, invoicedCostUsd: 0.1 }],
    tokenUsage: { inputTokens: 10, outputTokens: 2, cacheReadTokens: 4, cacheCreationTokens: 1 },
    referenceCostUsd: 0.1, billedUsd: { state: 'known', usd: 0.1 },
  }];
  const files: Record<string, unknown> = {
    [`tasks/task-${taskId}.json`]: task,
    [`tasks/task-${taskId}.result`]: result,
    [`evaluations/${taskId}-attempt-1.json`]: evaluation,
    [`${sprintId}-terminal-receipt.json`]: { version: 1, terminalOutcome: 'COMPLETE', receipt, lineageUsage },
    'terminal-seal-receipt.json': { terminalReceipt: receipt },
  };
  if (overrides.duplicateResult) files[`tasks/task-${taskId}.result.json`] = result;
  const artifacts = Object.entries(files).map(([path, value]) => {
    const bytes = `${JSON.stringify(value)}\n`; mkdirSync(join(archive, path, '..'), { recursive: true }); writeFileSync(join(archive, path), bytes);
    return { path, family: path.startsWith('evaluations/') ? 'evaluations' : path.startsWith('tasks/') ? 'tasks' : 'run', bytes: Buffer.byteLength(bytes), sha256: createHash('sha256').update(bytes).digest('hex'), sources: [] };
  });
  writeFileSync(join(archive, 'manifest.json'), JSON.stringify({ kind: 'deckent.sprint-archive-manifest', schemaVersion: 1, sprintId, terminalOutcome: 'COMPLETE', artifactCount: artifacts.length, totalBytes: 0, familyCounts: {}, artifacts, conflicts: [], memoryReferences: [], contentDigest: `${sprintId}-digest` }));
  return root;
}

describe('canonical prompt-cost canary archive cohort', () => {
  it('reads exactly two sealed manifest-bound cohorts deterministically', () => {
    const root = fixture('sprint-700', { providerUsd: 0.08 }); fixture('sprint-701');
    const value = readPromptCostCanaryArchiveCohort({ projectRoot: root, sprintIds: ['sprint-700', 'sprint-701'] });
    expect(value.ok).toBe(true);
    if (!value.ok) return;
    expect(value.samples).toHaveLength(2);
    expect(value.samples[0]).toMatchObject({ sprintId: 'sprint-700', logicalLineageId: expect.stringMatching(/^prompt-cost-lineage:sha256:/u), attemptId: 'attempt-sprint-700', verdict: 'DONE', quality: 91, providerReportedUsd: { available: true, usd: 0.08, source: 'provider-envelope' }, durationMs: 1234 });
    expect(value.samples[1]?.providerReportedUsd).toEqual({ available: false, usd: null, source: null });
  });

  it('rejects duplicate cohorts and mixed task/result/evaluation attempt authority', () => {
    const root = fixture('sprint-702', { terminalAttempt: 'foreign-attempt' }); fixture('sprint-703');
    expect(readPromptCostCanaryArchiveCohort({ projectRoot: root, sprintIds: ['sprint-702', 'sprint-702'] })).toMatchObject({ ok: false, rejections: [{ reason: 'duplicate-sprint' }] });
    const mixed = readPromptCostCanaryArchiveCohort({ projectRoot: root, sprintIds: ['sprint-702', 'sprint-703'] });
    expect(mixed).toMatchObject({ ok: false, rejections: expect.arrayContaining([expect.objectContaining({ reason: 'mixed-authority', sprintId: 'sprint-702' })]) });
  });

  it('does not consult unmanifested legacy docs, evidence, or transcripts', () => {
    const root = fixture('sprint-704'); fixture('sprint-705');
    writeFileSync(join(root, '.deckent/archive/sprints/sprint-704/transcript.log'), '{not authority}');
    writeFileSync(join(root, '.deckent/archive/sprints/sprint-704/docs-evidence.json'), '{not authority}');
    const value = readPromptCostCanaryArchiveCohort({ projectRoot: root, sprintIds: ['sprint-704', 'sprint-705'] });
    expect(value.ok).toBe(true);
    expect(readFileSync(join(root, '.deckent/archive/sprints/sprint-704/transcript.log'), 'utf8')).toBe('{not authority}');
  });
});
