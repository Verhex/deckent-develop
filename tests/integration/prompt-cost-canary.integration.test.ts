import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CHANNELS, writeEvent } from '../../src/core/event-stream.js';
import { aggregateLineageUsageAuthority } from '../../src/core/lineage-usage-authority.js';
import { MemoryStore } from '../../src/core/memory-store.js';
import { createPromptCostCanaryTaskAuthority } from '../../src/core/prompt-cost-canary-task-authority.js';
import type { SprintTerminalReceiptV1 } from '../../src/core/sprint-terminal-publication.js';
import { readPromptCostCanaryArchiveCohort } from '../../src/core/prompt-cost-canary-archive.js';
import {
  publishOutermostSprintTerminalArchive,
  SPRINT_TERMINAL_COMPLETED_CHANNEL,
} from '../../src/orchestra/sprint-finalizer.js';

const REPOSITORY = fileURLToPath(new URL('../..', import.meta.url));
const execFileAsync = promisify(execFile);
const BASELINE = 'sprint-639';
const CANDIDATE = 'sprint-641';

interface RunResult { readonly code: number | null; readonly stdout: string; readonly stderr: string }
interface Projection {
  readonly mode: 'dry-run' | 'applied';
  readonly decisionDigest: string;
  readonly decision: { readonly disposition: 'PROMOTE' | 'HOLD' | 'REJECT'; readonly reasonCodes: readonly string[] };
  readonly measuredHitRatio: { readonly denominator: string; readonly baseline: number | null; readonly candidate: number | null };
  readonly providerReportedUsd: {
    readonly baseline: { readonly available: boolean; readonly exactUsd: number | null };
    readonly candidate: { readonly available: boolean; readonly exactUsd: number | null };
  };
  readonly qualityParity: { readonly baselinePassRate: number | null; readonly candidatePassRate: number | null };
  readonly receipt: null | { readonly state: string; readonly receiptId: string; readonly decisionDigest: string };
}

let checkout = '';
let entrypoint = '';

function archive(sprint: string): string {
  return join(checkout, '.deckent', 'archive', 'sprints', sprint);
}

function canonicalResult(sprint: string, ordinal: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const baseline = sprint === BASELINE;
  const inputTokens = baseline ? 60 : 20;
  const cacheReadTokens = baseline ? 40 : 80;
  const taskId = `${sprint.slice(7)}-${String(ordinal).padStart(3, '0')}`;
  const attemptId = `attempt-${sprint}-${ordinal}`;
  const providerReportedUsd = baseline ? 2 : 1;
  return {
    schemaVersion: '1.0', taskId, sprintId: sprint, workerId: `w-${sprint}-${ordinal}`,
    filesChanged: [{ path: 'src/canary.ts', status: 'modified', linesAdded: 1, linesRemoved: 0 }],
    totalLinesAdded: 1, totalLinesRemoved: 0,
    workAttribution: {
      state: 'VERIFIED', attemptId, baselineRef: `baseline-${sprint}`,
      scopeDigest: createHash('sha256').update(`${sprint}:${ordinal}`).digest('hex'),
    },
    tests: { passed: 1, failed: 0, total: 1, command: 'npx vitest run', orchestratorVerified: true },
    tsc: { clean: true, errors: 0 },
    selfAssessment: 'DONE', provider: 'codex', model: 'gpt-5.6-sol',
    tokenUsage: { inputTokens, outputTokens: 5, cacheReadTokens, cacheCreationTokens: 0,
      totalTokens: inputTokens + cacheReadTokens + 5, source: 'provider-adapter' },
    cost: { usd: 99, currency: 'USD', billingMode: 'api', pricingSource: 'reference-pricing', isLocal: false },
    providerBilling: {
      source: 'provider-envelope', provider: 'codex', currency: 'USD', providerReportedUsd,
      modelUsage: { 'gpt-5.6-sol': { inputTokens, outputTokens: 5, cacheReadTokens, cacheCreationTokens: 0, costUsd: providerReportedUsd } },
      capturedAt: '2026-08-24T00:00:00.000Z',
    },
    durationMs: 100, completedAt: '2026-08-24T00:00:00.000Z', notes: 'canonical canary evidence',
    ...overrides,
  };
}

function writeCohort(
  sprint: string,
  mutate?: (result: Record<string, unknown>, ordinal: number, taskId: string) => void,
): void {
  const tasks = join(checkout, '.tasks');
  const evaluations = join(checkout, '.deckent', 'runtime', 'evaluations', sprint);
  const recentWorks = join(checkout, '.deckent', 'recently-works');
  mkdirSync(tasks, { recursive: true });
  mkdirSync(evaluations, { recursive: true });
  mkdirSync(recentWorks, { recursive: true });
  mkdirSync(join(checkout, '.brain'), { recursive: true });
  const memory = new MemoryStore(join(checkout, '.brain', 'memory.db'));
  memory.close();
  const usageAttempts: Array<{
    id: string; taskId: string; logicalRootTaskId: string;
    inputTokens: number; outputTokens: number; cacheReadTokens: number;
    cacheCreationTokens: number; referenceCostUsd: number; invoicedCostUsd?: number;
  }> = [];
  const usageTasks: Array<{ id: string; billingAuthority: 'metered' }> = [];
  for (let ordinal = 1; ordinal <= 5; ordinal += 1) {
    const taskId = `${sprint.slice(7)}-${String(ordinal).padStart(3, '0')}`;
    const attemptId = `attempt-${sprint}-${ordinal}`;
    const definition = {
      title: `canary ${ordinal}`, description: 'production prompt cost canary',
      type: 'code-development' as const,
      scope: { directories: ['src/'], filesRead: [], filesWrite: ['src/canary.ts'] },
      dependencies: [],
      goNogo: { goCriteria: 'Tests pass', noGoCriteria: 'Tests fail', techDebtAcceptable: 'None' },
    };
    const promptCostCanary = createPromptCostCanaryTaskAuthority(definition, {
      codex_core_channel: true,
      codex_suppress_project_doc: true,
    });
    writeFileSync(join(tasks, `task-${taskId}.json`), JSON.stringify({
      id: taskId, ...definition,
      model: 'gpt-5.6-sol', effort: 'low', priority: 'NORMAL', reason: 'integration evidence',
      status: 'DONE', sprintId: sprint, createdAt: '2026-08-24T00:00:00.000Z',
      promptCostCanary,
    }), 'utf8');
    const result = canonicalResult(sprint, ordinal);
    if (ordinal === 5) result.selfAssessment = 'NO_GO';
    mutate?.(result, ordinal, taskId);
    writeFileSync(join(tasks, `task-${taskId}.result`), JSON.stringify(result), 'utf8');
    writeFileSync(join(tasks, `task-${taskId}.landing.json`), JSON.stringify({ taskId, untrusted: true }), 'utf8');
    writeFileSync(join(tasks, `task-${taskId}.skill.json`), JSON.stringify({ taskId, untrusted: true }), 'utf8');
    writeFileSync(join(evaluations, `${taskId}-attempt-1.json`), JSON.stringify({
      taskId, sprintId: sprint, attemptNum: 1, attemptId,
      decision: result.selfAssessment, totalScore: result.selfAssessment === 'NO_GO' ? 0 : 100,
    }), 'utf8');
    const tokenUsage = result.tokenUsage as Record<string, number>;
    const providerBilling = result.providerBilling as Record<string, number> | undefined;
    usageTasks.push({ id: taskId, billingAuthority: 'metered' });
    usageAttempts.push({
      id: attemptId, taskId, logicalRootTaskId: taskId,
      inputTokens: tokenUsage.inputTokens!, outputTokens: tokenUsage.outputTokens!,
      cacheReadTokens: tokenUsage.cacheReadTokens!,
      cacheCreationTokens: tokenUsage.cacheCreationTokens!,
      referenceCostUsd: (result.cost as Record<string, number>).usd!,
      ...(typeof providerBilling?.providerReportedUsd === 'number'
        ? { invoicedCostUsd: providerBilling.providerReportedUsd }
        : {}),
    });
    if (ordinal === 5) {
      const fixTaskId = `${taskId}-fix-fix`;
      const fixAttemptId = `${attemptId}-fix-done`;
      const fixResult = canonicalResult(sprint, ordinal, {
        taskId: fixTaskId,
        workerId: `w-${sprint}-${ordinal}-fix`,
        selfAssessment: 'DONE',
        workAttribution: {
          state: 'VERIFIED', attemptId: fixAttemptId, baselineRef: `baseline-${sprint}`,
          scopeDigest: createHash('sha256').update(`${sprint}:${ordinal}:fix`).digest('hex'),
        },
        tokenUsage: {
          inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0,
          totalTokens: 0, source: 'provider-adapter',
        },
        providerBilling: {
          source: 'provider-envelope', provider: 'codex', currency: 'USD', providerReportedUsd: 0,
          modelUsage: { 'gpt-5.6-sol': { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0 } },
          capturedAt: '2026-08-24T00:00:00.000Z',
        },
        cost: { usd: 0, currency: 'USD', billingMode: 'api', pricingSource: 'reference-pricing', isLocal: false },
      });
      mutate?.(fixResult, ordinal, fixTaskId);
      writeFileSync(join(tasks, `task-${fixTaskId}.json`), JSON.stringify({
        id: fixTaskId, ...definition, fixForTaskId: taskId,
        model: 'gpt-5.6-sol', effort: 'low', priority: 'NORMAL', reason: 'integration repair evidence',
        status: 'DONE', sprintId: sprint, createdAt: '2026-08-24T00:00:00.000Z', promptCostCanary,
      }), 'utf8');
      writeFileSync(join(tasks, `task-${fixTaskId}.result`), JSON.stringify(fixResult), 'utf8');
      writeFileSync(join(evaluations, `${fixTaskId}-attempt-2.json`), JSON.stringify({
        taskId: fixTaskId, sprintId: sprint, attemptNum: 2, attemptId: fixAttemptId,
        decision: fixResult.selfAssessment, totalScore: 100,
      }), 'utf8');
      usageTasks.push({ id: fixTaskId, billingAuthority: 'metered' });
      usageAttempts.push({
        id: fixAttemptId, taskId: fixTaskId, logicalRootTaskId: taskId,
        inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0,
        referenceCostUsd: 0, invoicedCostUsd: 0,
      });
    }
  }
  const receipt: SprintTerminalReceiptV1 = {
    version: 1, sprintId: sprint, runId: `run-${sprint}`, coordinatorGeneration: 1,
    terminalOutcome: 'COMPLETE',
    logicalSettlementDigest: createHash('sha256').update(`settlement:${sprint}`).digest('hex'),
    priorAuthorityVersion: 0, authorityVersion: 1,
  };
  const lineageUsage = aggregateLineageUsageAuthority({ tasks: usageTasks, attempts: usageAttempts });
  writeFileSync(join(recentWorks, `${sprint}-terminal-receipt.json`), `${JSON.stringify({
    version: 1, terminalOutcome: 'COMPLETE', receipt, lineageUsage,
  }, null, 2)}\n`, 'utf8');
  writeEvent(checkout, sprint, 'brain', '*', CHANNELS.SPRINT_PHASE_CHANGE, {
    sprintId: sprint, fromPhase: 'RETRO', toPhase: 'CLEANUP',
  });
  publishOutermostSprintTerminalArchive({
    projectRoot: checkout,
    sprintId: sprint,
    receipt,
    terminalEvents: [
      { channel: CHANNELS.SPRINT_PHASE_CHANGE, payload: {
        sprintId: sprint, fromPhase: 'DECAY', toPhase: 'COMPLETE', transitionKind: 'integration-canary',
      } },
      { channel: SPRINT_TERMINAL_COMPLETED_CHANNEL, payload: {
        sprintId: sprint, status: 'COMPLETE', phase: 'COMPLETE', terminalOutcome: 'COMPLETE',
      } },
    ],
  });
}

function resetArchives(
  baselineMutate?: (result: Record<string, unknown>, ordinal: number, taskId: string) => void,
  candidateMutate?: (result: Record<string, unknown>, ordinal: number, taskId: string) => void,
): void {
  rmSync(join(checkout, '.deckent'), { recursive: true, force: true });
  writeCohort(BASELINE, baselineMutate);
  writeCohort(CANDIDATE, candidateMutate);
}

function run(args: readonly string[]): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    for (const key of ['VITEST', 'VITEST_POOL_ID', 'VITEST_WORKER_ID', 'NODE_ENV', 'DECKENT_TEST_HERMETICITY']) delete env[key];
    const child = spawn(process.execPath, [entrypoint, ...args], {
      cwd: checkout, env, shell: false, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
    child.once('error', reject);
    child.once('close', code => resolve({ code, stdout, stderr }));
  });
}

async function compare(extra: readonly string[] = []): Promise<{ run: RunResult; value: Projection }> {
  const result = await run(['usage', '--baseline-sprint', BASELINE, '--candidate-sprint', CANDIDATE, '--json', ...extra]);
  return { run: result, value: JSON.parse(result.stdout) as Projection };
}

function treeDigest(root: string): string {
  const hash = createHash('sha256');
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(directory, entry.name);
      hash.update(entry.name).update(entry.isSymbolicLink() ? 'link' : entry.isDirectory() ? 'dir' : 'file');
      if (entry.isSymbolicLink()) hash.update(readFileSync(path));
      else if (entry.isDirectory()) walk(path);
      else hash.update(readFileSync(path));
    }
  };
  walk(root); return hash.digest('hex');
}

function receiptFiles(directory: string): string[] {
  const result: string[] = [];
  if (!existsSync(directory)) return result;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...receiptFiles(path));
    else if (entry.name.endsWith('.json')) result.push(path);
  }
  return result;
}

function canaryReceiptFiles(): string[] {
  return receiptFiles(join(checkout, '.deckent', 'prompt-cost-canary', 'receipts'));
}

function requireReadableArchive(): void {
  const value = readPromptCostCanaryArchiveCohort({ projectRoot: checkout, sprintIds: [BASELINE, CANDIDATE] });
  if (!value.ok) throw new Error(`CANARY_ARCHIVE_FIXTURE_REJECTED:${JSON.stringify(value.rejections)}`);
}

describe('real production prompt-cost canary fan-in and hostile replay', () => {
  beforeAll(async () => {
    checkout = mkdtempSync(join(tmpdir(), 'deckent-prompt-cost-canary-'));
    cpSync(REPOSITORY, checkout, { recursive: true, filter: source => {
      const relative = source.slice(REPOSITORY.length).replace(/^\//u, '');
      return !/^(?:node_modules|dist|\.brain|\.deckent|\.tasks|\.git)(?:\/|$)/u.test(relative);
    } });
    symlinkSync(join(REPOSITORY, 'node_modules'), join(checkout, 'node_modules'), 'dir');
    await execFileAsync(process.execPath, [join(REPOSITORY, 'node_modules', 'typescript', 'bin', 'tsc'),
      '--project', join(checkout, 'tsconfig.json')], { cwd: checkout, timeout: 120_000 });
    await execFileAsync(process.execPath, [join(checkout, 'scripts', 'copy-assets.mjs')], { cwd: checkout, timeout: 120_000 });
    entrypoint = join(checkout, 'dist', 'cli', 'entry.js');
    resetArchives();
  }, 150_000);

  afterAll(() => { if (checkout) rmSync(checkout, { recursive: true, force: true }); });

  it('fans in five real lineages, separates provider USD, and applies/replays one immutable receipt', async () => {
    resetArchives();
    const cohort = readPromptCostCanaryArchiveCohort({ projectRoot: checkout, sprintIds: [BASELINE, CANDIDATE] });
    expect(cohort.ok).toBe(true);
    if (!cohort.ok) throw new Error(`CANARY_ARCHIVE_FIXTURE_REJECTED:${JSON.stringify(cohort.rejections)}`);
    expect(cohort.samples).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sprintId: CANDIDATE, taskId: '641-005-fix-fix', attemptId: 'attempt-sprint-641-5-fix-done',
        attempt: 2, verdict: 'DONE', providerReportedUsd: { available: true, usd: 1, source: 'provider-envelope' },
      }),
    ]));
    const candidateManifest = JSON.parse(readFileSync(join(archive(CANDIDATE), 'manifest.json'), 'utf8')) as {
      artifacts: Array<{ path: string }>;
    };
    expect(candidateManifest.artifacts.map(artifact => artifact.path)).toEqual(expect.arrayContaining([
      'tasks/task-641-005.landing.json', 'tasks/task-641-005.skill.json',
    ]));
    const archiveBefore = treeDigest(join(checkout, '.deckent', 'archive'));
    const dryA = await compare(); const dryB = await compare();
    expect(dryA.run).toMatchObject({ code: 0, stderr: '' });
    expect(dryB.value).toEqual(dryA.value);
    expect(dryA.value).toMatchObject({ mode: 'dry-run', decision: { disposition: 'PROMOTE', reasonCodes: ['thresholds_satisfied'] },
      measuredHitRatio: { denominator: 'inputTokens+cacheReadTokens+cacheCreationTokens', baseline: 0.4, candidate: 0.8 },
      providerReportedUsd: { baseline: { available: true, exactUsd: 10 }, candidate: { available: true, exactUsd: 5 } },
      qualityParity: { baselinePassRate: 1, candidatePassRate: 1 }, receipt: null });
    expect(dryA.value.providerReportedUsd.baseline.exactUsd).not.toBe(495);
    expect(dryA.value.decisionDigest).toMatch(/^sha256:[a-f0-9]{64}$/u);

    const applied = await compare(['--apply', '--decision-digest', dryA.value.decisionDigest,
      '--environment', 'production', '--tenant', 'dogfood']);
    expect(applied.run).toMatchObject({ code: 0, stderr: '' });
    expect(applied.value.receipt).toMatchObject({ state: 'created', decisionDigest: dryA.value.decisionDigest,
      receiptId: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u) });
    const replay = await compare(['--apply', '--decision-digest', dryA.value.decisionDigest,
      '--environment', 'production', '--tenant', 'dogfood']);
    expect(replay.value.receipt).toEqual({ ...applied.value.receipt, state: 'existing-identical' });
    expect(treeDigest(join(checkout, '.deckent', 'archive'))).toBe(archiveBefore);
    const matching = canaryReceiptFiles().filter(path =>
      readFileSync(path, 'utf8').includes(applied.value.receipt!.receiptId));
    expect(matching).toHaveLength(1);
  }, 30_000);

  it('HOLDs rather than fabricating missing provider billing or an unmeasured cache denominator', async () => {
    resetArchives(undefined, result => { delete result.providerBilling; });
    expect((await compare()).value.decision).toEqual({ disposition: 'HOLD', costAuthority: null, reasonCodes: ['provider_reported_usd_unavailable'], planDigest: null, kernelDecisionDigest: null });

    resetArchives(undefined, (result, _ordinal, taskId) => {
      if (!taskId.endsWith('-fix-fix')) result.tokenUsage = { inputTokens: 0, outputTokens: 5, cacheReadTokens: 0, cacheCreationTokens: 0, totalTokens: 5, source: 'provider-adapter' };
    });
    requireReadableArchive();
    const unmeasured = await compare();
    expect(unmeasured.value.decision.disposition).toBe('HOLD');
    expect(unmeasured.value.decision.reasonCodes).toContain('cache_measurement_unavailable');
    expect(unmeasured.value.measuredHitRatio.candidate).toBeNull();
  });

  it('HOLDs an incomparable cohort and rejects a quality regression through the production kernel', async () => {
    resetArchives(undefined, result => {
      result.provider = 'different-provider';
      (result.providerBilling as Record<string, unknown>).provider = 'different-provider';
    });
    requireReadableArchive();
    const mismatch = await compare();
    expect(mismatch.value.decision.disposition).toBe('HOLD');
    expect(mismatch.value.decision.reasonCodes).toContain('provider_mismatch');

    resetArchives(undefined, (result, ordinal, taskId) => {
      if (ordinal === 5 && taskId.endsWith('-fix-fix')) result.selfAssessment = 'NO_GO';
    });
    const quality = await compare();
    expect(quality.value.decision.disposition).toBe('REJECT');
    expect(quality.value.decision.reasonCodes).toContain('quality_regression_exceeded');
  });

  it('returns bounded archive rejection for tamper and symlink evidence, and rejects a wrong digest', async () => {
    resetArchives();
    writeFileSync(join(archive(CANDIDATE), 'task-641-001.result'), '{"tampered":true}', 'utf8');
    const tampered = (await compare()).value;
    expect(tampered.decision).toEqual({ disposition: 'HOLD', costAuthority: null, reasonCodes: ['archive_evidence_rejected'], planDigest: null, kernelDecisionDigest: null });
    expect(tampered.providerReportedUsd).toEqual({
      baseline: { available: false, pricing: 'unmeasured', sampleCount: 0, availableSampleCount: 0, exactUsd: null },
      candidate: { available: false, pricing: 'unmeasured', sampleCount: 0, availableSampleCount: 0, exactUsd: null },
      delta: null,
    });

    resetArchives();
    const real = archive(CANDIDATE); const moved = `${real}-real`;
    cpSync(real, moved, { recursive: true }); rmSync(real, { recursive: true, force: true }); symlinkSync(moved, real, 'dir');
    expect(lstatSync(real).isSymbolicLink()).toBe(true);
    expect((await compare()).value.decision.reasonCodes).toEqual(['archive_evidence_rejected']);

    resetArchives();
    const wrong = await run(['usage', '--baseline-sprint', BASELINE, '--candidate-sprint', CANDIDATE, '--json',
      '--apply', '--decision-digest', `sha256:${'0'.repeat(64)}`]);
    expect(wrong.code).not.toBe(0);
    expect(`${wrong.stdout}${wrong.stderr}`).toMatch(/digest/i);
    expect(canaryReceiptFiles()).toEqual([]);
  });

  it('does not overwrite a colliding immutable receipt', async () => {
    resetArchives();
    const dry = await compare();
    const first = await compare(['--apply', '--decision-digest', dry.value.decisionDigest,
      '--environment', 'collision', '--tenant', 'tenant']);
    const receiptPath = canaryReceiptFiles().find(path =>
      readFileSync(path, 'utf8').includes(first.value.receipt!.receiptId));
    expect(receiptPath).toBeDefined();
    writeFileSync(receiptPath!, '{"collision":true}', 'utf8');
    const collision = await run(['usage', '--baseline-sprint', BASELINE, '--candidate-sprint', CANDIDATE, '--json',
      '--apply', '--decision-digest', dry.value.decisionDigest, '--environment', 'collision', '--tenant', 'tenant']);
    expect(collision.code).not.toBe(0);
    expect(`${collision.stdout}${collision.stderr}`).toMatch(/collision|receipt|immutable/i);
    expect(readFileSync(receiptPath!, 'utf8')).toBe('{"collision":true}');
  });
});
