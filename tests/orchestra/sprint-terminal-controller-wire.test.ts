// Controller terminal handoff (487-003): the finalizer's fenced receipt
// (487-002) must carry authority through CLEANUP into COMPLETE exactly once,
// and every failure mode must degrade to a recoverable HOLD instead of a
// silent completion.

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { RECENT_WORKS_DIR } from '../../src/core/constants.js';
import { TaskEvaluation } from '../../src/core/types.js';
import type { SprintMetrics, Task, TaskResult } from '../../src/core/types.js';
import {
  buildFinalizerTerminalTruth,
  publishFencedSprintTerminalReceipt,
} from '../../src/orchestra/sprint-finalizer.js';
import {
  commitSprintTerminalHandoff,
  resolveSprintTerminalHandoff,
  sprintTerminalHandoffHoldError,
  sprintTerminalReceiptPath,
} from '../../src/orchestra/sprint-controller.js';
import type { SprintTerminalHandoffAuthorized } from '../../src/orchestra/sprint-controller.js';

const temporaryRoots: string[] = [];

function projectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-terminal-handoff-'));
  temporaryRoots.push(root);
  return root;
}

function task(id: string, sprintId: string): Task {
  return {
    id,
    title: 'Controller terminal handoff',
    description: '',
    model: 'claude-opus-5',
    effort: 'high',
    priority: 'NORMAL',
    reason: 'terminal handoff test',
    provider: 'claude',
    authMode: 'subscription',
    scope: {
      directories: ['src/orchestra/'], filesRead: [],
      filesWrite: ['src/orchestra/sprint-controller.ts'],
    },
    dependencies: [],
    goNogo: { goCriteria: 'handoff', noGoCriteria: 'early complete', techDebtAcceptable: 'none' },
    status: 'DONE',
    sprintId,
    assignedWorker: `w-${id}`,
    createdAt: '2026-07-31T00:00:00.000Z',
  } as Task;
}

function result(id: string, verdict: 'DONE' | 'NO_GO'): TaskResult {
  return {
    taskId: id,
    workerId: `w-${id}`,
    filesChanged: ['src/orchestra/sprint-controller.ts'],
    linesAdded: 1,
    linesRemoved: 0,
    testsPassed: verdict === 'DONE',
    coverage: 100,
    selfAssessment: verdict,
    notes: verdict,
    workAttribution: {
      state: 'VERIFIED',
      attemptId: `attempt-${id}-${verdict.toLowerCase()}`,
      baselineRef: `task-result-work-attribution-baseline:sha256:${'a'.repeat(64)}`,
      baselineSha256: 'a'.repeat(64),
      scopeDigest: (verdict === 'DONE' ? 'd' : 'f').repeat(64),
    },
  };
}

const metrics = { velocity: 1 } as unknown as SprintMetrics;
const coordinatorRetirementEvidence = {
  evidenceId: 'test-coordinator-retirement',
  kind: 'recovery-coordinator-retirement',
  state: 'VERIFIED',
  evidenceRef: 'test:coordinator-retired',
  requiredForCleanup: true,
} as const;

/** Publish a real fenced receipt for `sprintId` into a fresh project root. */
function publishReceipt(options: {
  readonly root: string;
  readonly sprintId: string;
  readonly verdict: 'DONE' | 'NO_GO';
  readonly runId?: string;
  readonly coordinatorGeneration?: number;
}): string {
  const taskId = `${options.sprintId.replace(/^sprint-/u, '')}-001`;
  const sprintTask = task(taskId, options.sprintId);
  const tasksDir = join(options.root, '.tasks');
  mkdirSync(tasksDir, { recursive: true });
  writeFileSync(join(tasksDir, `task-${taskId}.json`), JSON.stringify(sprintTask), 'utf-8');
  const truth = buildFinalizerTerminalTruth({
    tasks: [sprintTask],
    evaluations: new Map([[taskId, options.verdict === 'DONE' ? TaskEvaluation.DONE : TaskEvaluation.NO_GO]]),
    results: [result(taskId, options.verdict)],
    coordinatorEvidence: [coordinatorRetirementEvidence],
  });
  const publication = publishFencedSprintTerminalReceipt({
    projectRoot: options.root,
    sprint: { id: options.sprintId, number: 487, tasks: [sprintTask] } as Parameters<
      typeof publishFencedSprintTerminalReceipt
    >[0]['sprint'],
    truth,
    ...(options.runId ? { runId: options.runId } : {}),
    ...(options.coordinatorGeneration !== undefined
      ? { coordinatorGeneration: options.coordinatorGeneration }
      : {}),
    now: () => '2026-07-31T12:00:00.000Z',
  });
  return publication.artifactPath;
}

function writeArtifact(root: string, sprintId: string, payload: unknown): void {
  const path = sprintTerminalReceiptPath(root, sprintId);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(payload, null, 2), 'utf-8');
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('controller terminal handoff — receipt authority', () => {
  it('authorizes cleanup from a published receipt and carries the settled metrics forward', () => {
    const root = projectRoot();
    const artifactPath = publishReceipt({
      root, sprintId: 'sprint-487', verdict: 'DONE', runId: 'run-487', coordinatorGeneration: 7,
    });

    const authority = resolveSprintTerminalHandoff({
      projectRoot: root, sprintId: 'sprint-487', retroOutcome: metrics,
    });

    expect(authority.state).toBe('AUTHORIZED');
    const authorized = authority as SprintTerminalHandoffAuthorized;
    expect(authorized.artifactPath).toBe(artifactPath);
    expect(authorized.artifactPath).toBe(join(root, RECENT_WORKS_DIR, 'sprint-487-terminal-receipt.json'));
    expect(authorized.metrics).toBe(metrics);
    expect(authorized.receipt).toMatchObject({
      sprintId: 'sprint-487', runId: 'run-487', coordinatorGeneration: 7, authorityVersion: 1,
    });
    // The once-ledger key is the receipt's own fenced identity.
    const onDisk = JSON.parse(readFileSync(artifactPath, 'utf-8')) as {
      receipt: { logicalSettlementDigest: string };
    };
    expect(authorized.handoffKey).toBe(
      `sprint-487:run-487:7:1:COMPLETE:${onDisk.receipt.logicalSettlementDigest}`,
    );
  });

  it('holds a settled NO_GO sprint instead of fabricating cleanup authority', () => {
    const root = projectRoot();
    // A' terminal-publication fail-closed (sprint-537 wave, 2026-08-17): the
    // NO_GO run can no longer even MINT a COMPLETE receipt — publication is a
    // typed refusal, so the handoff holds on the absent receipt instead of the
    // old published-but-ineligible one. Cleanup authority is still never
    // fabricated — the guard just moved one boundary earlier.
    expect(() => publishReceipt({ root, sprintId: 'sprint-488', verdict: 'NO_GO' }))
      .toThrow(/TERMINAL_PUBLICATION_NOT_CLEANUP_CANDIDATE_BLOCKED/);

    const authority = resolveSprintTerminalHandoff({
      projectRoot: root, sprintId: 'sprint-488', retroOutcome: metrics,
    });

    expect(authority).toMatchObject({ state: 'HOLD', reasonCode: 'RECEIPT_MISSING' });
  });

  it('holds when no receipt was ever published', () => {
    const authority = resolveSprintTerminalHandoff({
      projectRoot: projectRoot(), sprintId: 'sprint-489', retroOutcome: metrics,
    });

    expect(authority).toMatchObject({ state: 'HOLD', reasonCode: 'RECEIPT_MISSING' });
  });

  it('never swallows a finalizer failure or an absent metrics outcome', () => {
    const root = projectRoot();
    publishReceipt({ root, sprintId: 'sprint-490', verdict: 'DONE' });

    const failed = resolveSprintTerminalHandoff({
      projectRoot: root,
      sprintId: 'sprint-490',
      retroOutcome: { finalizeFailed: true, error: 'disk full' },
    });
    const absent = resolveSprintTerminalHandoff({
      projectRoot: root, sprintId: 'sprint-490', retroOutcome: undefined,
    });

    // A published receipt does NOT rescue a failed finalize — the RETRO
    // failure is terminal-authority evidence in its own right.
    expect(failed).toMatchObject({
      state: 'HOLD', reasonCode: 'FINALIZER_FAILED', detail: 'disk full',
    });
    expect(absent).toMatchObject({
      state: 'HOLD', reasonCode: 'FINALIZER_FAILED', detail: 'metrics-absent',
    });
  });

  it('holds a malformed or foreign receipt rather than trusting it', () => {
    const root = projectRoot();
    writeArtifact(root, 'sprint-491', { version: 1, receipt: { version: 1, sprintId: 'sprint-491' } });
    writeArtifact(root, 'sprint-492', {
      version: 1,
      receipt: {
        version: 1, sprintId: 'sprint-999', runId: 'run-999',
        coordinatorGeneration: 1, authorityVersion: 1, logicalSettlementDigest: 'x',
        priorAuthorityVersion: 0,
      },
      terminalEvidence: { cleanupEligibility: { state: 'CANDIDATE', candidate: true, reasons: [] }, holds: [] },
    });

    expect(resolveSprintTerminalHandoff({
      projectRoot: root, sprintId: 'sprint-491', retroOutcome: metrics,
    })).toMatchObject({ state: 'HOLD', reasonCode: 'RECEIPT_MALFORMED' });
    expect(resolveSprintTerminalHandoff({
      projectRoot: root, sprintId: 'sprint-492', retroOutcome: metrics,
    })).toMatchObject({ state: 'HOLD', reasonCode: 'RECEIPT_SPRINT_MISMATCH' });
  });

  it('holds a receipt whose evidence still carries terminal holds', () => {
    const root = projectRoot();
    writeArtifact(root, 'sprint-493', {
      version: 1,
      receipt: {
        version: 1, sprintId: 'sprint-493', runId: 'run-493',
        coordinatorGeneration: 1, authorityVersion: 1, logicalSettlementDigest: 'digest',
        priorAuthorityVersion: 0,
      },
      terminalEvidence: {
        cleanupEligibility: { state: 'HOLD', candidate: false, reasons: ['ACTIVE_ATTEMPT'] },
        holds: [{ code: 'ACTIVE_ATTEMPT' }],
      },
    });

    expect(resolveSprintTerminalHandoff({
      projectRoot: root, sprintId: 'sprint-493', retroOutcome: metrics,
    })).toMatchObject({ state: 'HOLD', reasonCode: 'RECEIPT_CLEANUP_INELIGIBLE' });
  });
});

describe('controller terminal handoff — exactly-once publication', () => {
  it('claims the publication once and holds every replay of the same receipt', () => {
    const root = projectRoot();
    publishReceipt({ root, sprintId: 'sprint-494', verdict: 'DONE', runId: 'run-494' });
    const first = resolveSprintTerminalHandoff({
      projectRoot: root, sprintId: 'sprint-494', retroOutcome: metrics,
    }) as SprintTerminalHandoffAuthorized;
    const replay = resolveSprintTerminalHandoff({
      projectRoot: root, sprintId: 'sprint-494', retroOutcome: metrics,
    }) as SprintTerminalHandoffAuthorized;

    expect(commitSprintTerminalHandoff(first)).toBe(first);
    expect(commitSprintTerminalHandoff(replay)).toMatchObject({
      state: 'HOLD', reasonCode: 'DUPLICATE_PUBLICATION',
    });
    expect(commitSprintTerminalHandoff(first)).toMatchObject({
      state: 'HOLD', reasonCode: 'DUPLICATE_PUBLICATION',
    });
  });

  it('treats a re-published receipt under a fresh generation as a new publication', () => {
    const rootA = projectRoot();
    const rootB = projectRoot();
    publishReceipt({ root: rootA, sprintId: 'sprint-495', verdict: 'DONE', runId: 'run-495', coordinatorGeneration: 1 });
    publishReceipt({ root: rootB, sprintId: 'sprint-495', verdict: 'DONE', runId: 'run-495', coordinatorGeneration: 2 });

    const generationOne = resolveSprintTerminalHandoff({
      projectRoot: rootA, sprintId: 'sprint-495', retroOutcome: metrics,
    }) as SprintTerminalHandoffAuthorized;
    const generationTwo = resolveSprintTerminalHandoff({
      projectRoot: rootB, sprintId: 'sprint-495', retroOutcome: metrics,
    }) as SprintTerminalHandoffAuthorized;

    expect(generationOne.handoffKey).not.toBe(generationTwo.handoffKey);
    expect(commitSprintTerminalHandoff(generationOne).state).toBe('AUTHORIZED');
    expect(commitSprintTerminalHandoff(generationTwo).state).toBe('AUTHORIZED');
  });

  it('surfaces a HOLD as a typed recoverable DECKENT_E091 error', () => {
    const error = sprintTerminalHandoffHoldError({
      state: 'HOLD',
      sprintId: 'sprint-496',
      artifactPath: '/tmp/none.json',
      reasonCode: 'RECEIPT_MISSING',
      detail: 'no terminal receipt published',
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('DECKENT_E091');
    expect(error.message).toContain('terminal-authority-hold:sprint-496:RECEIPT_MISSING');
  });
});

describe('controller terminal handoff — production wiring', () => {
  const source = readFileSync(
    new URL('../../src/orchestra/sprint-controller.ts', import.meta.url),
    'utf-8',
  );
  const runSprintSource = source.slice(source.indexOf('export async function runSprint('));

  it('resolves the receipt before CLEANUP and publishes COMPLETE only after it', () => {
    const resolveIndex = runSprintSource.indexOf('resolveSprintTerminalHandoff({');
    const holdThrowIndex = runSprintSource.indexOf('throw sprintTerminalHandoffHoldError(terminalHandoff)');
    const cleanupIndex = runSprintSource.indexOf('scanInterval = await runCleanupPhase(');
    const commitIndex = runSprintSource.indexOf('commitSprintTerminalHandoff(terminalHandoff)');
    const authorityIndex = runSprintSource.indexOf('publishFinalSprintAuthority(');
    const completeIndex = runSprintSource.indexOf('sprint.status = SprintStatus.COMPLETE;');

    expect(resolveIndex).toBeGreaterThan(0);
    expect(holdThrowIndex).toBeGreaterThan(resolveIndex);
    expect(cleanupIndex).toBeGreaterThan(holdThrowIndex);
    expect(commitIndex).toBeGreaterThan(cleanupIndex);
    expect(authorityIndex).toBeGreaterThan(commitIndex);
    expect(completeIndex).toBeGreaterThan(authorityIndex);
  });

  it('hands off exactly once and drops the old post-cleanup finalize check', () => {
    expect(runSprintSource.match(/resolveSprintTerminalHandoff\(\{/gu)).toHaveLength(1);
    expect(runSprintSource.match(/commitSprintTerminalHandoff\(/gu)).toHaveLength(1);
    expect(runSprintSource.match(/scanInterval = await runCleanupPhase\(/gu)).toHaveLength(1);
    expect(runSprintSource).not.toContain('terminal-authority-not-published');
    // COMPLETE is published from the committed authority's metrics, never
    // from an unclaimed RETRO outcome.
    expect(runSprintSource).toContain('terminalPublication.metrics');
    const afterAuthority = runSprintSource.slice(runSprintSource.indexOf('publishFinalSprintAuthority('));
    expect(afterAuthority).not.toContain('progress: { done: sprint.tasks.length');
  });

  it('leaves PID and sprint-state authority intact on the HOLD path', () => {
    const holdThrowIndex = runSprintSource.indexOf('throw sprintTerminalHandoffHoldError(terminalHandoff)');
    const completeIndex = runSprintSource.indexOf('sprint.status = SprintStatus.COMPLETE;');
    expect(holdThrowIndex).toBeGreaterThan(0);
    expect(completeIndex).toBeGreaterThan(holdThrowIndex);

    // Nothing between the HOLD throw and COMPLETE tears down PID or sprint
    // state, so a held terminal authority stays recoverable.
    const handoffRegion = runSprintSource.slice(holdThrowIndex, completeIndex);
    expect(handoffRegion).not.toContain('clearSprintState(');
    expect(handoffRegion).not.toContain('clearPid(');
    const finallyBlock = runSprintSource.slice(runSprintSource.indexOf('  } finally {'));
    expect(finallyBlock).not.toContain('clearSprintState(');
    expect(finallyBlock).not.toContain('clearPid(');
  });
});
