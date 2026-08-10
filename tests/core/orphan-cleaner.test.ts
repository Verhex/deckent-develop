// ═══ Orphan Cleaner Tests ══════════════════════════════════════════
// Sprint 144 Task 018: Post-finalize + Pre-flight orphan cleanup

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  INVOCATION_RECEIPT_SCHEMA_VERSION,
  type InvocationReceipt,
} from '../../src/core/invocation-receipt.js';
import { InvocationReceiptStore } from '../../src/core/invocation-receipt-store.js';
import {
  postFinalizeCleanup,
  preflightOrphanCleanup,
  previewFinalizeCleanup,
} from '../../src/core/orphan-cleaner.js';

function createTestRoot(): string {
  const root = join(tmpdir(), `deckent-orphan-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(root, { recursive: true });
  mkdirSync(join(root, '.tasks'), { recursive: true });
  mkdirSync(join(root, '.locks'), { recursive: true });
  return root;
}

function writeTaskJson(root: string, taskId: string, status: string): void {
  writeFileSync(
    join(root, '.tasks', `${taskId}.json`),
    JSON.stringify({ id: taskId.replace(/^task-/, ''), status }),
  );
}

function writeTaskHb(root: string, taskId: string): void {
  writeFileSync(
    join(root, '.tasks', `${taskId}.hb`),
    JSON.stringify({ taskId, timestamp: new Date().toISOString() }),
  );
}

function writeTaskResult(root: string, taskId: string): void {
  writeFileSync(
    join(root, '.tasks', `${taskId}.result`),
    JSON.stringify({ taskId, selfAssessment: 'DONE' }),
  );
}

function writeNotDispatchedReceipt(
  store: InvocationReceiptStore,
  taskId: string,
  tenantId: string,
  invocationId: string,
): void {
  const input: InvocationReceipt = {
    schemaVersion: INVOCATION_RECEIPT_SCHEMA_VERSION,
    invocationId,
    idempotencyKey: invocationId,
    tenantId,
    projectId: store.projectId,
    runId: 'sprint-144',
    taskId,
    callId: invocationId,
    role: 'worker',
    purpose: 'worker-execution',
    configured: { provider: null, model: null, source: 'none', reasonCode: 'no_provider' },
    requested: { provider: null, model: null, source: 'none', reasonCode: 'no_provider' },
    resolved: { provider: null, model: null, source: 'none', reasonCode: 'no_provider' },
    called: { provider: null, model: null, source: 'none', reasonCode: 'no_provider' },
    backend: { transport: 'local-runtime', executionBackend: 'unknown' },
    auth: { mode: 'unknown', accountRefHash: null },
    fallbackChain: [],
    reachability: { state: 'unknown', evidenceRef: null },
    limits: { state: 'unknown', evidenceRefs: [] },
    createdAt: '2026-07-20T00:00:00.000Z',
  };
  store.writeAtomic({
    receipt: input,
    events: [
      {
        eventId: `${invocationId}:rejected`,
        type: 'dispatch_rejected',
        occurredAt: input.createdAt,
        payload: {
          reasonCode: 'no_provider',
          evidenceRefs: [`evidence:${invocationId}`],
        },
      },
      {
        eventId: `${invocationId}:consumer`,
        type: 'consumer_settled',
        occurredAt: input.createdAt,
        payload: {
          outcome: 'accepted',
          reasonCode: 'no_provider',
          taskDisposition: 'not_dispatched',
          evidenceRefs: [`evidence:${invocationId}`],
        },
      },
    ],
  });
}

// ─── Post-Finalize Tests ───────────────────────────────────────────

describe('postFinalizeCleanup', () => {
  let testRoot: string;

  beforeEach(() => { testRoot = createTestRoot(); });
  afterEach(() => { rmSync(testRoot, { recursive: true, force: true }); });

  it('should archive DONE task files to .tasks/archive/sprint-NNN/', () => {
    writeTaskJson(testRoot, 'task-144-001', 'DONE');
    writeTaskHb(testRoot, 'task-144-001');
    writeTaskResult(testRoot, 'task-144-001');

    const report = postFinalizeCleanup(testRoot, 'sprint-144');

    expect(report.archivedFiles.length).toBe(3);
    expect(report.preservedFiles.length).toBe(0);

    const archiveDir = join(testRoot, '.tasks', 'archive', 'sprint-144');
    expect(existsSync(join(archiveDir, 'task-144-001.json'))).toBe(true);
    expect(existsSync(join(archiveDir, 'task-144-001.hb'))).toBe(true);
    expect(existsSync(join(archiveDir, 'task-144-001.result'))).toBe(true);

    // Original files should be gone
    expect(existsSync(join(testRoot, '.tasks', 'task-144-001.json'))).toBe(false);
  });

  it('should archive NO_GO task files', () => {
    writeTaskJson(testRoot, 'task-144-002', 'NO_GO');
    writeTaskResult(testRoot, 'task-144-002');

    const report = postFinalizeCleanup(testRoot, 'sprint-144');

    expect(report.archivedFiles.length).toBe(2);
    expect(report.preservedFiles.length).toBe(0);
  });

  it('should preserve EXECUTING task files', () => {
    writeTaskJson(testRoot, 'task-144-003', 'EXECUTING');
    writeTaskHb(testRoot, 'task-144-003');

    const report = postFinalizeCleanup(testRoot, 'sprint-144');

    expect(report.archivedFiles.length).toBe(0);
    expect(report.preservedFiles.length).toBe(2);

    // Original files should still exist
    expect(existsSync(join(testRoot, '.tasks', 'task-144-003.json'))).toBe(true);
    expect(existsSync(join(testRoot, '.tasks', 'task-144-003.hb'))).toBe(true);
  });

  it('should preserve PENDING task files', () => {
    writeTaskJson(testRoot, 'task-144-004', 'PENDING');

    const report = postFinalizeCleanup(testRoot, 'sprint-144');

    expect(report.archivedFiles.length).toBe(0);
    expect(report.preservedFiles.length).toBe(1);
  });

  it('archives a raw PENDING task only with exact receipt-backed terminal projection', () => {
    writeTaskJson(testRoot, 'task-144-004', 'PENDING');
    const projectedTaskIds: string[] = [];
    const report = postFinalizeCleanup(testRoot, 'sprint-144', {
      projectTaskExecutionState: taskId => {
        projectedTaskIds.push(taskId);
        return {
          effectiveStatus: 'NOT_DISPATCHED',
          evidenceRefs: ['invocation-event:a'],
          receiptRef: {
            invocationId: `receipt:${taskId}`,
            tenantId: 'local',
            projectId: 'project-a',
          },
        };
      },
    });

    expect(projectedTaskIds).toEqual(['144-004']);
    expect(report.archivedFiles).toContain('task-144-004.json');
    expect(existsSync(join(
      testRoot,
      '.tasks',
      'archive',
      'sprint-144',
      'task-144-004.json',
    ))).toBe(true);
  });

  it('uses the default read-only receipt projection and raw task tenant identity', () => {
    writeFileSync(
      join(testRoot, '.tasks', 'task-144-004.json'),
      JSON.stringify({
        id: '144-004',
        status: 'PENDING',
        actor: { tenantId: 'acme' },
      }),
    );
    const store = new InvocationReceiptStore(testRoot, {
      idFactory: () => 'project-a',
    });
    writeNotDispatchedReceipt(store, '144-004', 'acme', 'receipt-acme');
    store.close();

    const report = postFinalizeCleanup(testRoot, 'sprint-144');

    expect(report.archivedFiles).toContain('task-144-004.json');
    expect(existsSync(join(
      testRoot,
      '.tasks',
      'archive',
      'sprint-144',
      'task-144-004.json',
    ))).toBe(true);
  });

  it('preserves a PENDING task when receipt authority is ambiguous', () => {
    writeTaskJson(testRoot, 'task-144-004', 'PENDING');
    const store = new InvocationReceiptStore(testRoot, {
      idFactory: () => 'project-a',
    });
    writeNotDispatchedReceipt(store, '144-004', 'local', 'receipt-a');
    writeNotDispatchedReceipt(store, '144-004', 'local', 'receipt-b');
    store.close();

    const report = postFinalizeCleanup(testRoot, 'sprint-144');

    expect(report.archivedFiles).toEqual([]);
    expect(report.preservedFiles).toContain('task-144-004.json');
    expect(existsSync(join(testRoot, '.tasks', 'task-144-004.json'))).toBe(true);
  });

  it('preserves a PENDING task when the default receipt store is malformed', () => {
    writeTaskJson(testRoot, 'task-144-004', 'PENDING');
    mkdirSync(join(testRoot, '.deckent', 'runtime'), { recursive: true });
    writeFileSync(
      join(testRoot, '.deckent', 'runtime', 'invocations.db'),
      'not-a-sqlite-database',
    );

    const report = postFinalizeCleanup(testRoot, 'sprint-144');

    expect(report.archivedFiles).toEqual([]);
    expect(report.preservedFiles).toContain('task-144-004.json');
    expect(existsSync(join(testRoot, '.tasks', 'task-144-004.json'))).toBe(true);
  });

  it('preserves malformed canonical task identity without calling projection authority', () => {
    writeFileSync(
      join(testRoot, '.tasks', 'task-144-004.json'),
      JSON.stringify({ id: 'task-144-004', status: 'PENDING' }),
    );
    const projectedTaskIds: string[] = [];

    const report = postFinalizeCleanup(testRoot, 'sprint-144', {
      projectTaskExecutionState: taskId => {
        projectedTaskIds.push(taskId);
        return {
          effectiveStatus: 'NOT_DISPATCHED',
          evidenceRefs: ['evidence:a'],
          receiptRef: {
            invocationId: 'receipt:a',
            tenantId: 'local',
            projectId: 'project-a',
          },
        };
      },
    });

    expect(projectedTaskIds).toEqual([]);
    expect(report.archivedFiles).toEqual([]);
    expect(report.preservedFiles).toContain('task-144-004.json');
  });

  it('preserves projected terminal status when receipt/evidence proof is incomplete', () => {
    writeTaskJson(testRoot, 'task-144-004', 'PENDING');
    const report = postFinalizeCleanup(testRoot, 'sprint-144', {
      projectTaskExecutionState: () => ({
        effectiveStatus: 'NOT_DISPATCHED',
        evidenceRefs: [],
      }),
    });

    expect(report.archivedFiles).toEqual([]);
    expect(report.preservedFiles).toContain('task-144-004.json');
  });

  it('should clean stale locks (>5min)', () => {
    // Create a stale lock (timestamp in the past)
    const staleLock = {
      filePath: 'src/foo.ts',
      ownerWorkerId: 'w-dead',
      acquiredAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10min ago
      taskId: '144-001',
    };
    writeFileSync(
      join(testRoot, '.locks', 'src__foo.ts.lock'),
      JSON.stringify(staleLock),
    );

    const report = postFinalizeCleanup(testRoot, 'sprint-144');

    expect(report.staleLocksCleaned).toBe(1);
    expect(existsSync(join(testRoot, '.locks', 'src__foo.ts.lock'))).toBe(false);
  });

  it('should handle missing .tasks/ gracefully', () => {
    rmSync(join(testRoot, '.tasks'), { recursive: true });
    const report = postFinalizeCleanup(testRoot, 'sprint-144');
    expect(report.archivedFiles.length).toBe(0);
  });

  it('should handle invalid sprintId gracefully', () => {
    const report = postFinalizeCleanup(testRoot, 'invalid-id');
    expect(report.archivedFiles.length).toBe(0);
  });

  it('preserves tasks with unknown status (missing .json)', () => {
    // Only .hb file, no .json — no terminal proof, so preserve.
    writeTaskHb(testRoot, 'task-144-005');

    const report = postFinalizeCleanup(testRoot, 'sprint-144');

    expect(report.archivedFiles.length).toBe(0);
    expect(report.preservedFiles).toContain('task-144-005.hb');
  });

  it('archives unprefixed artifacts for a terminal task without touching other or taskless files', () => {
    writeTaskJson(testRoot, 'task-144-006-fix-fix', 'DONE');
    writeFileSync(join(testRoot, '.tasks', '144-006-fix-fix.hb'), JSON.stringify({ taskId: '144-006-fix-fix' }));
    writeFileSync(join(testRoot, '.tasks', '144-006-fix-fix.plan'), 'plan');
    writeFileSync(join(testRoot, '.tasks', '144-006-fix-fix.landing-proposal.json'), JSON.stringify({ taskId: '144-006-fix-fix' }));
    writeFileSync(join(testRoot, '.tasks', '143-006.hb'), JSON.stringify({ taskId: '143-006' }));
    writeFileSync(join(testRoot, '.tasks', 'unrelated.hb'), 'not a task artifact');

    const report = postFinalizeCleanup(testRoot, 'sprint-144');

    expect(report.archivedFiles).toEqual(expect.arrayContaining([
      'task-144-006-fix-fix.json',
      '144-006-fix-fix.hb',
      '144-006-fix-fix.plan',
      '144-006-fix-fix.landing-proposal.json',
    ]));
    expect(existsSync(join(testRoot, '.tasks', '143-006.hb'))).toBe(true);
    expect(existsSync(join(testRoot, '.tasks', 'unrelated.hb'))).toBe(true);
  });
});

// ─── Pre-flight Tests ──────────────────────────────────────────────

describe('preflightOrphanCleanup', () => {
  let testRoot: string;

  beforeEach(() => { testRoot = createTestRoot(); });
  afterEach(() => { rmSync(testRoot, { recursive: true, force: true }); });

  it('should move previous sprint files to archive', () => {
    // Sprint 143 leftover files
    writeTaskJson(testRoot, 'task-143-001', 'DONE');
    writeTaskHb(testRoot, 'task-143-001');
    // Sprint 144 current files (should be kept)
    writeTaskJson(testRoot, 'task-144-001', 'PENDING');

    const report = preflightOrphanCleanup(testRoot, 'sprint-144');

    expect(report.performed).toBe(true);
    expect(report.archivedFiles.length).toBe(2);
    expect(report.cleanedSprintIds).toContain('sprint-143');

    // Sprint 143 files archived
    const archiveDir = join(testRoot, '.tasks', 'archive', 'sprint-143');
    expect(existsSync(join(archiveDir, 'task-143-001.json'))).toBe(true);

    // Sprint 144 files preserved
    expect(existsSync(join(testRoot, '.tasks', 'task-144-001.json'))).toBe(true);
  });

  it('archives unprefixed previous-sprint artifacts without touching current or taskless files', () => {
    writeTaskJson(testRoot, 'task-143-003-fix-fix', 'DONE');
    writeFileSync(join(testRoot, '.tasks', '143-003-fix-fix.hb'), JSON.stringify({ taskId: '143-003-fix-fix' }));
    writeFileSync(join(testRoot, '.tasks', '143-003-fix-fix.plan'), 'plan');
    writeFileSync(join(testRoot, '.tasks', '143-003-fix-fix.landing-proposal.json'), JSON.stringify({ taskId: '143-003-fix-fix' }));
    writeTaskJson(testRoot, 'task-144-003', 'PENDING');
    writeFileSync(join(testRoot, '.tasks', '144-003.hb'), JSON.stringify({ taskId: '144-003' }));
    writeFileSync(join(testRoot, '.tasks', 'unrelated.hb'), 'not a task artifact');

    const report = preflightOrphanCleanup(testRoot, 'sprint-144');

    expect(report.archivedFiles).toEqual(expect.arrayContaining([
      'task-143-003-fix-fix.json',
      '143-003-fix-fix.hb',
      '143-003-fix-fix.plan',
      '143-003-fix-fix.landing-proposal.json',
    ]));
    expect(existsSync(join(testRoot, '.tasks', '144-003.hb'))).toBe(true);
    expect(existsSync(join(testRoot, '.tasks', 'unrelated.hb'))).toBe(true);
  });

  it('should skip cleanup if another live sprint pid exists', () => {
    // Create a PID file for sprint-143 with our own PID (alive)
    mkdirSync(join(testRoot, '.deckent', 'pids'), { recursive: true });
    writeFileSync(
      join(testRoot, '.deckent', 'pids', 'sprint-143.pid'),
      JSON.stringify({ pid: process.pid, sprintId: 'sprint-143' }),
    );

    writeTaskJson(testRoot, 'task-143-001', 'DONE');

    const report = preflightOrphanCleanup(testRoot, 'sprint-144');

    expect(report.performed).toBe(false);
    expect(report.skipReason).toContain('Live sprint detected');
    // Files should NOT be moved
    expect(existsSync(join(testRoot, '.tasks', 'task-143-001.json'))).toBe(true);
  });

  it('should proceed if pid file references a dead process', () => {
    // Create a PID file with a dead PID (99999999)
    mkdirSync(join(testRoot, '.deckent', 'pids'), { recursive: true });
    writeFileSync(
      join(testRoot, '.deckent', 'pids', 'sprint-143.pid'),
      JSON.stringify({ pid: 99999999, sprintId: 'sprint-143' }),
    );

    writeTaskJson(testRoot, 'task-143-001', 'DONE');

    const report = preflightOrphanCleanup(testRoot, 'sprint-144');

    expect(report.performed).toBe(true);
    expect(report.archivedFiles.length).toBe(1);
  });

  it('should handle no orphan files gracefully', () => {
    writeTaskJson(testRoot, 'task-144-001', 'PENDING');

    const report = preflightOrphanCleanup(testRoot, 'sprint-144');

    expect(report.performed).toBe(true);
    expect(report.archivedFiles.length).toBe(0);
  });

  it('should handle invalid sprintId', () => {
    const report = preflightOrphanCleanup(testRoot, 'bad-id');
    expect(report.performed).toBe(false);
    expect(report.skipReason).toContain('Cannot extract sprint number');
  });

  it('should clean files from multiple previous sprints', () => {
    writeTaskJson(testRoot, 'task-142-001', 'DONE');
    writeTaskJson(testRoot, 'task-143-001', 'DONE');
    writeTaskJson(testRoot, 'task-144-001', 'PENDING');

    const report = preflightOrphanCleanup(testRoot, 'sprint-144');

    expect(report.performed).toBe(true);
    expect(report.archivedFiles.length).toBe(2);
    expect(report.cleanedSprintIds).toContain('sprint-142');
    expect(report.cleanedSprintIds).toContain('sprint-143');
    expect(existsSync(join(testRoot, '.tasks', 'task-144-001.json'))).toBe(true);
  });

  it('preserves a previous sprint PENDING task instead of treating age as terminal proof', () => {
    writeTaskJson(testRoot, 'task-143-001', 'PENDING');
    writeTaskHb(testRoot, 'task-143-001');
    writeTaskJson(testRoot, 'task-144-001', 'PENDING');

    const report = preflightOrphanCleanup(testRoot, 'sprint-144');

    expect(report.archivedFiles).toEqual([]);
    expect(existsSync(join(testRoot, '.tasks', 'task-143-001.json'))).toBe(true);
    expect(existsSync(join(testRoot, '.tasks', 'task-143-001.hb'))).toBe(true);
  });
});

// ─── previewFinalizeCleanup (455-001 — read-only recover dry-run) ───

describe('previewFinalizeCleanup', () => {
  let testRoot: string;

  beforeEach(() => { testRoot = createTestRoot(); });
  afterEach(() => { rmSync(testRoot, { recursive: true, force: true }); });

  it('reports terminal files as archived + active as preserved, deleting NOTHING', () => {
    writeTaskJson(testRoot, 'task-144-001', 'DONE');
    writeTaskResult(testRoot, 'task-144-001');
    writeTaskJson(testRoot, 'task-144-002', 'PENDING');

    const preview = previewFinalizeCleanup(testRoot, 'sprint-144');

    expect(preview.archivedFiles).toContain('task-144-001.json');
    expect(preview.archivedFiles).toContain('task-144-001.result');
    expect(preview.preservedFiles).toContain('task-144-002.json');
    // Pure preview — every file still on disk.
    expect(existsSync(join(testRoot, '.tasks', 'task-144-001.json'))).toBe(true);
    expect(existsSync(join(testRoot, '.tasks', 'task-144-001.result'))).toBe(true);
    expect(existsSync(join(testRoot, '.tasks', 'task-144-002.json'))).toBe(true);
  });

  it('is sprint-scoped — never reports another sprint\'s files', () => {
    writeTaskJson(testRoot, 'task-144-001', 'DONE');
    writeTaskJson(testRoot, 'task-143-001', 'DONE');

    const preview = previewFinalizeCleanup(testRoot, 'sprint-144');

    expect(preview.archivedFiles).toContain('task-144-001.json');
    expect(preview.archivedFiles.some(f => f.startsWith('task-143'))).toBe(false);
    expect(preview.preservedFiles.some(f => f.startsWith('task-143'))).toBe(false);
  });

  it('preserves a pending fix task as an independent id (not archived)', () => {
    writeTaskJson(testRoot, 'task-144-005', 'PENDING'); // a pending fix task
    const preview = previewFinalizeCleanup(testRoot, 'sprint-144');
    expect(preview.preservedFiles).toContain('task-144-005.json');
    expect(preview.archivedFiles).not.toContain('task-144-005.json');
  });

  it('classifies xfix and chained fix artifacts as independent task ids', () => {
    writeTaskJson(testRoot, 'task-144-005', 'DONE');
    writeTaskJson(testRoot, 'task-144-005-xfix', 'PENDING');
    writeTaskJson(testRoot, 'task-144-005-xfix-fix', 'NO_GO');

    const preview = previewFinalizeCleanup(testRoot, 'sprint-144');

    expect(preview.archivedFiles).toContain('task-144-005.json');
    expect(preview.preservedFiles).toContain('task-144-005-xfix.json');
    expect(preview.archivedFiles).toContain('task-144-005-xfix-fix.json');
  });

  it('reports the SAME set postFinalizeCleanup actually archives/preserves', () => {
    writeTaskJson(testRoot, 'task-144-001', 'DONE');
    writeTaskResult(testRoot, 'task-144-001');
    writeTaskJson(testRoot, 'task-144-002', 'PENDING');

    const preview = previewFinalizeCleanup(testRoot, 'sprint-144');
    const real = postFinalizeCleanup(testRoot, 'sprint-144'); // mutates AFTER preview captured

    expect(new Set(real.archivedFiles)).toEqual(new Set(preview.archivedFiles));
    expect(new Set(real.preservedFiles)).toEqual(new Set(preview.preservedFiles));
  });

  it('returns empty sets for an unextractable sprintId', () => {
    const preview = previewFinalizeCleanup(testRoot, 'bad-id');
    expect(preview.archivedFiles).toEqual([]);
    expect(preview.preservedFiles).toEqual([]);
  });
});
