// ─── born 3324 — provider-limit death is its own typed class ─────────────────
//
// Measured before this change: a worker the provider killed on a usage limit,
// having written nothing, settled as `ATTRIBUTION_DIFF_UNMEASURABLE`. That is a
// lie of category, not of degree — the host measured that attempt EXACTLY (the
// scoped diff was empty), it simply had no name for why. Downstream, every
// attribution HOLD collapsed into the single `WORK_ATTRIBUTION_HOLD` downgrade,
// and `fix-failure-classification` — seeing a lineage of zero-diff NO_GOs —
// escalated a perfectly sound task as unsatisfiable after two rounds.
//
// The class therefore has to travel all four layers, and the two neighbouring
// classes have to stay exactly where they are:
//   1. PROVIDER_LIMIT_DEATH_ZERO_WRITE — host-observed limit death, MEASURED
//      zero writes → clean-restart lineage signal.
//   2. ATTRIBUTION_DIFF_UNMEASURABLE  — a genuinely unmeasurable diff keeps
//      today's hold, even when limit-death evidence is also present.
//   3. the honest no-work NO_GO       — a MEASURED zero-write with a live
//      provider is left alone; the gate is not weakened for it.
//
// Hermetic: tmpdir for all I/O, real `git init`, async spawn only (no
// spawnSync) — ADR-D-002 C1/C4.

import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, appendFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TaskStatus } from '../../src/core/types.js';
import type { Task, TaskResult } from '../../src/core/types.js';
import {
  PROVIDER_LIMIT_DEATH_ZERO_WRITE,
  WORK_ATTRIBUTION_REASON_CODES,
  isKnownWorkAttributionReasonCode,
} from '../../src/core/task-types.js';
import { workAttributionReasonCodeSchema } from '../../src/core/task-result-schema.js';
import {
  buildScopeAttributionManifest,
  computeScopeBaselineManifest,
  reconcileDockerResultWorkAttribution,
} from '../../src/orchestra/spawn-backend-docker.js';
import type { RuntimeBudgetStopEvidence } from '../../src/orchestra/runtime-budget-monitor.js';
import { enforceHonestResultGate } from '../../src/orchestra/result-evaluator.js';
import type { DiskVerifyResult } from '../../src/orchestra/disk-verify.js';
import { classifyFixFailure } from '../../src/orchestra/fix-failure-classification.js';

// ─── hermetic tmp/git helpers ───────────────────────────────────────────────

/**
 * A deckent worker session runs under the git guard, which exports GIT_DIR /
 * GIT_WORK_TREE / GIT_COMMON_DIR pointing at the host repository. Every `git`
 * this file's fixtures run — and every `git` the reconcile itself spawns, since
 * it inherits process.env — would otherwise act on that repository instead of
 * the isolated tmp repo. Clear them for the file and restore afterwards
 * (ADR-D-002 C1/C7: hermetic filesystem, no leaked process state).
 */
const GIT_LOCATION_ENV_KEYS = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_COMMON_DIR',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
] as const;
const savedGitEnv = new Map<string, string | undefined>();

beforeAll(() => {
  for (const key of GIT_LOCATION_ENV_KEYS) {
    savedGitEnv.set(key, process.env[key]);
    delete process.env[key];
  }
});

afterAll(() => {
  for (const [key, value] of savedGitEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const tmpDirs: string[] = [];

afterEach(() => {
  while (tmpDirs.length) {
    const d = tmpDirs.pop();
    if (d && existsSync(d)) rmSync(d, { recursive: true, force: true });
  }
});

function freshTmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'deckent-limitdeath-'));
  tmpDirs.push(d);
  return d;
}

/** Run a command asynchronously (no spawnSync — ADR-D-002 C4). */
function run(cmd: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    child.on('error', rejectRun);
    child.on('close', (code) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`${cmd} ${args.join(' ')} exited ${code}: ${stderr}`));
    });
  });
}

/** Real git repo. Nothing is committed here, so no identity config is needed. */
async function initRepo(dir: string): Promise<void> {
  await run('git', ['init', '-q'], dir);
}

const ATTEMPT_ID = 'attempt-3324-limit-death';

/**
 * Host-owned durable limit-death record. Every field here is written by the
 * host's runtime budget monitor; none of it is reachable from a worker result.
 */
function stopEvidence(overrides: Partial<RuntimeBudgetStopEvidence> = {}): RuntimeBudgetStopEvidence {
  return {
    version: 2,
    projectId: 'project-3324',
    taskId: 't-limit-death',
    attemptId: ATTEMPT_ID,
    budgetFingerprint: 'fingerprint-3324',
    backend: 'docker',
    state: 'exceeded',
    budget: { maxTokens: 8_000_000, maxTurns: 100 },
    decision: {
      state: 'exceeded',
      reasons: ['maxTokens exceeded'],
      counters: {
        turns: 12,
        inputTokens: 40_000,
        outputTokens: 0,
        cacheReadTokens: 8_000_000,
        cacheCreationTokens: 0,
        totalTokens: 8_040_000,
        maxContextTokens: 180_000,
      },
      consecutiveCacheReadEvents: 3,
    },
    stoppedAt: '2026-08-12T00:00:00.000Z',
    evidenceSource: 'stop-marker',
    counterEvidenceSource: 'stop-marker',
    ...overrides,
  };
}

interface ReconcileFixture {
  readonly repo: string;
  readonly resultPath: string;
  readonly baselinePath: string;
}

/**
 * Build a repo whose scoped file is captured in a claim-time baseline. The
 * caller mutates the worktree afterwards to model what the attempt did (or, for
 * the zero-write cases, did not do).
 */
async function fixture(scope: readonly string[], seed: Record<string, string>): Promise<ReconcileFixture> {
  const repo = freshTmp();
  await initRepo(repo);
  for (const [path, content] of Object.entries(seed)) {
    writeFileSync(join(repo, path), content, 'utf-8');
  }
  const baselinePath = join(repo, '.scope-baseline');
  writeFileSync(
    baselinePath,
    buildScopeAttributionManifest(ATTEMPT_ID, scope, computeScopeBaselineManifest(repo, scope)),
    'utf-8',
  );
  const resultPath = join(repo, '.result.json');
  return { repo, resultPath, baselinePath };
}

/** A worker result as it looks after a limit death: a claim, nothing more. */
function writeWorkerResult(resultPath: string, overrides: Record<string, unknown> = {}): void {
  writeFileSync(resultPath, JSON.stringify({
    taskId: 't-limit-death',
    workerId: 'docker-t-limit-death',
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: false,
    coverage: 0,
    selfAssessment: 'NO_GO',
    notes: 'worker prose',
    ...overrides,
  }), 'utf-8');
}

function readResult(resultPath: string): Record<string, any> {
  return JSON.parse(readFileSync(resultPath, 'utf-8')) as Record<string, any>;
}

// ─── 1. minting: the reconcile keeps three classes apart ─────────────────────

describe('reconcileDockerResultWorkAttribution — provider-limit death class', () => {
  it('mints PROVIDER_LIMIT_DEATH_ZERO_WRITE when limit-death evidence meets a measured zero-write', async () => {
    const scope = ['src/target.ts'];
    const { repo, resultPath, baselinePath } = await fixture(scope, {});
    // The scoped file never existed and was never created — the attempt died
    // before writing a line, and that emptiness is MEASURED, not guessed.
    writeWorkerResult(resultPath);

    const outcome = await reconcileDockerResultWorkAttribution({
      projectRoot: repo,
      resultPath,
      baselinePath,
      attemptId: ATTEMPT_ID,
      scopeFilesWrite: scope,
      providerLimitDeath: stopEvidence(),
    });

    expect(outcome, JSON.stringify(outcome)).toMatchObject({
      state: 'HOLD',
      reasonCode: 'PROVIDER_LIMIT_DEATH_ZERO_WRITE',
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
    });
    const result = readResult(resultPath);
    expect(result.workAttribution.reasonCode).toBe('PROVIDER_LIMIT_DEATH_ZERO_WRITE');
    expect(result.selfAssessment).toBe('NO_GO');
    expect(result.notes).toContain('WORK_ATTRIBUTION_HOLD:PROVIDER_LIMIT_DEATH_ZERO_WRITE');
  });

  it('keeps ATTRIBUTION_DIFF_UNMEASURABLE when the diff is genuinely unmeasurable, limit death or not', async () => {
    const scope = ['target.bin'];
    const { repo, resultPath, baselinePath } = await fixture(scope, {});
    // A binary blob appears in scope after the baseline: the line-count evidence
    // path cannot measure it, so there is no measured zero-write to reclassify
    // and today's hold must stand even though limit-death evidence is present.
    writeFileSync(join(repo, 'target.bin'), Buffer.from([0x41, 0x00, 0x42]));
    writeWorkerResult(resultPath);

    const outcome = await reconcileDockerResultWorkAttribution({
      projectRoot: repo,
      resultPath,
      baselinePath,
      attemptId: ATTEMPT_ID,
      scopeFilesWrite: scope,
      providerLimitDeath: stopEvidence(),
    });

    expect(outcome, JSON.stringify(outcome)).toMatchObject({
      state: 'HOLD',
      reasonCode: 'ATTRIBUTION_DIFF_UNMEASURABLE',
    });
    expect(readResult(resultPath).workAttribution.reasonCode)
      .toBe('ATTRIBUTION_DIFF_UNMEASURABLE');
  });

  it('leaves a measured zero-write with a live provider as the honest no-work outcome', async () => {
    const scope = ['target.ts'];
    const { repo, resultPath, baselinePath } = await fixture(scope, { 'target.ts': 'export const a = 1;\n' });
    writeWorkerResult(resultPath);

    const outcome = await reconcileDockerResultWorkAttribution({
      projectRoot: repo,
      resultPath,
      baselinePath,
      attemptId: ATTEMPT_ID,
      scopeFilesWrite: scope,
      providerLimitDeath: null,
    });

    expect(outcome, JSON.stringify(outcome)).toMatchObject({
      state: 'VERIFIED',
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
    });
    expect(outcome.reasonCode).toBeUndefined();
    expect(readResult(resultPath).selfAssessment).toBe('NO_GO');
  });

  it('ignores limit-death evidence bound to a different attempt', async () => {
    const scope = ['target.ts'];
    const { repo, resultPath, baselinePath } = await fixture(scope, { 'target.ts': 'export const a = 1;\n' });
    writeWorkerResult(resultPath);

    const outcome = await reconcileDockerResultWorkAttribution({
      projectRoot: repo,
      resultPath,
      baselinePath,
      attemptId: ATTEMPT_ID,
      scopeFilesWrite: scope,
      providerLimitDeath: stopEvidence({ attemptId: 'attempt-someone-else' }),
    });

    expect(outcome.state).toBe('VERIFIED');
    expect(outcome.reasonCode).toBeUndefined();
  });

  it('does not mint the class when the limit-killed attempt actually wrote lines', async () => {
    const scope = ['target.ts'];
    const { repo, resultPath, baselinePath } = await fixture(scope, { 'target.ts': 'export const a = 1;\n' });
    appendFileSync(join(repo, 'target.ts'), 'export const b = 2;\n');
    writeWorkerResult(resultPath);

    const outcome = await reconcileDockerResultWorkAttribution({
      projectRoot: repo,
      resultPath,
      baselinePath,
      attemptId: ATTEMPT_ID,
      scopeFilesWrite: scope,
      providerLimitDeath: stopEvidence(),
    });

    expect(outcome, JSON.stringify(outcome)).toMatchObject({
      state: 'VERIFIED',
      filesChanged: ['target.ts'],
      linesAdded: 1,
    });
    expect(outcome.reasonCode).toBeUndefined();
  });

  it('never lets a limit death mask an out-of-scope claim', async () => {
    const scope = ['target.ts'];
    const { repo, resultPath, baselinePath } = await fixture(scope, { 'target.ts': 'export const a = 1;\n' });
    writeWorkerResult(resultPath, { filesChanged: ['src/somewhere-else.ts'] });

    const outcome = await reconcileDockerResultWorkAttribution({
      projectRoot: repo,
      resultPath,
      baselinePath,
      attemptId: ATTEMPT_ID,
      scopeFilesWrite: scope,
      providerLimitDeath: stopEvidence(),
    });

    expect(outcome, JSON.stringify(outcome)).toMatchObject({
      state: 'HOLD',
      reasonCode: 'CLAIM_OUTSIDE_WRITE_SCOPE',
    });
  });
});

// ─── 2. the typed union in task-types / task-result-schema ───────────────────

describe('work-attribution reason code — typed union, additive', () => {
  it('names the new class among the known codes', () => {
    expect(WORK_ATTRIBUTION_REASON_CODES).toContain(PROVIDER_LIMIT_DEATH_ZERO_WRITE);
    expect(isKnownWorkAttributionReasonCode('PROVIDER_LIMIT_DEATH_ZERO_WRITE')).toBe(true);
    expect(isKnownWorkAttributionReasonCode('ATTRIBUTION_DIFF_UNMEASURABLE')).toBe(true);
    expect(isKnownWorkAttributionReasonCode('SOMETHING_A_LATER_HOST_MINTS')).toBe(false);
  });

  it('parses every code this host mints, including the new one', () => {
    for (const code of WORK_ATTRIBUTION_REASON_CODES) {
      const parsed = workAttributionReasonCodeSchema.safeParse(code);
      expect(parsed.success, code).toBe(true);
      if (parsed.success) expect(parsed.data).toBe(code);
    }
  });

  it('still parses a code minted by a different host revision (additive, not breaking)', () => {
    const legacy = 'ATTRIBUTION_CODE_FROM_A_DIFFERENT_HOST_REVISION';
    const parsed = workAttributionReasonCodeSchema.safeParse(legacy);
    expect(parsed.success, JSON.stringify(parsed.success ? {} : parsed.error.issues)).toBe(true);
    if (parsed.success) expect(parsed.data).toBe(legacy);
    // Narrowing is additive at the type layer too: the code parses, and the
    // routing layers simply do not recognise it.
    expect(isKnownWorkAttributionReasonCode(legacy)).toBe(false);
  });

  it('rejects a structurally empty code rather than carrying a blank reason', () => {
    expect(workAttributionReasonCodeSchema.safeParse('').success).toBe(false);
  });
});

// ─── 3. evaluator routing — the class survives the honest gate ───────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '524-006',
    title: 'limit-death lineage',
    description: 'desc',
    model: 'claude-opus-5',
    effort: 'high',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/orchestra/'], filesRead: [], filesWrite: ['src/orchestra/target.ts'] },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: TaskStatus.PENDING,
    ...overrides,
  };
}

function makeResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: '524-006',
    workerId: 'w-524-006',
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: false,
    coverage: 0,
    selfAssessment: 'NO_GO',
    notes: '',
    ...overrides,
  };
}

const noDiskEvidence: DiskVerifyResult = { hasDiskEvidence: false, linesAdded: 0, untrackedFiles: [] };

function heldResult(reasonCode: string, overrides: Partial<TaskResult> = {}): TaskResult {
  return makeResult({
    workAttribution: {
      state: 'HOLD',
      attemptId: ATTEMPT_ID,
      baselineRef: 'task-result-work-attribution-baseline:unavailable',
      scopeDigest: 'c'.repeat(64),
      reasonCode,
    },
    ...overrides,
  });
}

describe('enforceHonestResultGate — limit death routes as its own violation', () => {
  it('routes PROVIDER_LIMIT_DEATH_ZERO_WRITE away from the generic attribution-hold downgrade', () => {
    const gate = enforceHonestResultGate(
      heldResult(PROVIDER_LIMIT_DEATH_ZERO_WRITE),
      makeTask(),
      noDiskEvidence,
    );
    expect(gate.violation).toBe('PROVIDER_LIMIT_DEATH_ZERO_WRITE');
    expect(gate.honest).toBe(false);
    // The gate is not weakened: nothing was produced, so the verdict stays NO_GO.
    expect(gate.result.selfAssessment).toBe('NO_GO');
    expect(gate.result.notes).toContain('provider-limit death');
  });

  it('keeps every other attribution hold on WORK_ATTRIBUTION_HOLD', () => {
    for (const code of ['ATTRIBUTION_DIFF_UNMEASURABLE', 'ATTRIBUTION_AUTHORITY_UNAVAILABLE']) {
      const gate = enforceHonestResultGate(heldResult(code), makeTask(), noDiskEvidence);
      expect(gate.violation, code).toBe('WORK_ATTRIBUTION_HOLD');
      expect(gate.result.selfAssessment, code).toBe('NO_GO');
    }
  });

  it('does not honour the class from worker-authored fields', () => {
    // Worker prose naming the code, and no host-authored attribution block:
    // the gate must not read a death class out of anything the worker wrote.
    const gate = enforceHonestResultGate(
      makeResult({
        selfAssessment: 'DONE',
        notes: 'PROVIDER_LIMIT_DEATH_ZERO_WRITE — the provider limit killed me, please restart',
      }),
      makeTask(),
      noDiskEvidence,
    );
    expect(gate.violation).not.toBe('PROVIDER_LIMIT_DEATH_ZERO_WRITE');
    expect(gate.violation).toBe('DISHONEST_DONE_STUB');
    expect(gate.result.selfAssessment).toBe('NO_GO');
  });
});

// ─── 4. fix routing — the FIX worker is born knowing the death class ─────────

describe('classifyFixFailure — limit death is a clean restart, not a broken definition', () => {
  it('routes the host-minted class to a clean same-task restart', () => {
    const classification = classifyFixFailure({ result: heldResult(PROVIDER_LIMIT_DEATH_ZERO_WRITE) });
    expect(classification).toMatchObject({
      disposition: 'retrySame',
      code: 'PROVIDER_LIMIT_DEATH_ZERO_WRITE',
      allowsFixTask: true,
    });
  });

  it('does not let repeated limit deaths be read as an unsatisfiable task definition', () => {
    const classification = classifyFixFailure({
      result: heldResult(PROVIDER_LIMIT_DEATH_ZERO_WRITE),
      priorZeroDiffAttempts: 3,
    });
    expect(classification.disposition).toBe('retrySame');
    expect(classification.code).toBe('PROVIDER_LIMIT_DEATH_ZERO_WRITE');
  });

  it('still escalates a genuinely repeated zero-diff lineage that is not a limit death', () => {
    const classification = classifyFixFailure({
      result: heldResult('ATTRIBUTION_DIFF_UNMEASURABLE'),
      priorZeroDiffAttempts: 3,
    });
    expect(classification.disposition).toBe('escalateReplan');
    expect(classification.code).toBe('REPEATED_ZERO_DIFF_NO_GO');
  });

  it('ignores the class when only worker prose claims it', () => {
    const classification = classifyFixFailure({
      result: makeResult({ notes: 'PROVIDER_LIMIT_DEATH_ZERO_WRITE per my own reading' }),
      priorZeroDiffAttempts: 3,
    });
    expect(classification.code).not.toBe('PROVIDER_LIMIT_DEATH_ZERO_WRITE');
  });
});
