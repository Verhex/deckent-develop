import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  listFlowIds,
  loadApprovedSnapshot,
  loadPlannedSprint,
  loadRunFlowRecoveryManifest,
  prepareStartAttempt,
  recordStartAttemptProcessSpawned,
  RunFlowStoreError,
  saveApprovedSnapshot,
  settleStartAttempt,
  type StoredApprovedSnapshot,
} from '../../src/core/run-flow-store.js';
import { SprintPhase, SprintStatus } from '../../src/core/sprint-types.js';

let root: string;

function storeDir(): string {
  return join(root, '.deckent', 'runtime', 'run-flow-store');
}

function snapshot(flowId: string, revision: number): StoredApprovedSnapshot {
  return {
    flowId,
    revision,
    planDigest: `digest-${revision}`,
    approvedBy: { id: 'migration-owner' },
    approvedAt: `2026-07-28T00:00:0${revision}.000Z`,
    sprint: {
      id: `sprint-${revision}`,
      number: revision,
      status: SprintStatus.PLANNING,
      phase: SprintPhase.PLAN,
      tasks: [],
      workers: [],
    },
  };
}

beforeEach(() => {
  root = join(tmpdir(), `run-flow-store-migration-${crypto.randomUUID()}`);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('run-flow-store — legacy migration and projection recovery', () => {
  it('imports valid JSONL once, records malformed evidence, and ignores later projection tampering', () => {
    mkdirSync(storeDir(), { recursive: true });
    const legacy = snapshot('legacy-flow', 1);
    const snapshotPath = join(storeDir(), 'legacy-flow.snapshot.jsonl');
    const original = `${JSON.stringify(legacy)}\n{"broken":\n`;
    writeFileSync(snapshotPath, original, 'utf8');
    writeFileSync(
      join(storeDir(), 'plan-only.plan.jsonl'),
      JSON.stringify({
        flowId: 'plan-only',
        revision: 7,
        sprint: { id: 'legacy-plan' },
        planDigest: 'legacy-digest',
        planDigestVersion: 2,
      }) + '\n',
      'utf8',
    );

    expect(loadApprovedSnapshot(root, 'legacy-flow')).toEqual(legacy);
    expect(loadPlannedSprint(root, 'plan-only')?.revision).toBe(7);
    expect(listFlowIds(root)).toEqual(['legacy-flow', 'plan-only']);
    expect(readFileSync(snapshotPath, 'utf8')).toBe(original);

    const dbPath = join(storeDir(), 'run-flow-authority.sqlite');
    expect(existsSync(dbPath)).toBe(true);
    const db = new Database(dbPath, { readonly: true });
    try {
      const issueCount = db.prepare(`
        SELECT COUNT(*) AS count FROM run_flow_migration_issues
      `).get() as { count: number };
      const sources = db.prepare(`
        SELECT source, COUNT(*) AS count FROM run_flow_records GROUP BY source
      `).all() as { source: string; count: number }[];
      expect(issueCount.count).toBe(1);
      expect(sources).toEqual([{ source: 'legacy-jsonl', count: 2 }]);
    } finally {
      db.close();
    }

    // JSONL is now projection-only. A fabricated later line cannot override
    // the already-migrated canonical authority.
    writeFileSync(snapshotPath, `${original}${JSON.stringify(snapshot('legacy-flow', 99))}\n`, 'utf8');
    expect(loadApprovedSnapshot(root, 'legacy-flow')).toEqual(legacy);
  });

  it('rebuilds a projection from canonical rows when a crash intent is present', () => {
    const first = snapshot('recovery-flow', 1);
    const second = snapshot('recovery-flow', 2);
    saveApprovedSnapshot(root, first);

    const projectionPath = join(storeDir(), 'recovery-flow.snapshot.jsonl');
    const intentPath = `${projectionPath}.projection-intent`;
    writeFileSync(projectionPath, '', 'utf8');
    writeFileSync(intentPath, JSON.stringify({ token: 'crashed-writer' }) + '\n', 'utf8');

    saveApprovedSnapshot(root, second);

    const records = readFileSync(projectionPath, 'utf8')
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line));
    expect(records).toEqual([first, second]);
    expect(existsSync(intentPath)).toBe(false);
    expect(loadApprovedSnapshot(root, 'recovery-flow')).toEqual(second);
  });

  it('upgrades v2 atomically and keeps generation recovery manifests immutable', () => {
    mkdirSync(storeDir(), { recursive: true });
    const dbPath = join(storeDir(), 'run-flow-authority.sqlite');
    const legacy = new Database(dbPath);
    legacy.pragma('user_version = 2');
    legacy.close();

    expect(loadApprovedSnapshot(root, 'never-written')).toBeUndefined();

    const first = prepareStartAttempt(root, {
      flowId: 'manifest-flow',
      revision: 1,
      planDigest: 'manifest-digest',
      attemptId: 'manifest-attempt-1',
      preparedAt: '2026-07-28T10:00:00.000Z',
      lineage: {
        tenantId: 'tenant-1',
        projectId: 'project-1',
        actor: { id: 'actor-1' },
        origin: 'api',
        correlationId: 'manifest-correlation-1',
        idempotencyKey: 'manifest-idempotency-1',
        parentPlanLineageHash: 'a'.repeat(64),
        parentCorrelationId: 'manifest-plan-correlation',
        authorizationAuthority: 'approved-actor:actor-1',
      },
      owner: {
        process: { pid: 4101, startToken: 'start-4101', evidence: 'verified' },
        ownerNonce: 'manifest-owner-1',
        leaseUntil: '2026-07-28T10:01:00.000Z',
      },
    }).attempt;
    settleStartAttempt(root, {
      flowId: first.flowId,
      revision: first.revision,
      planDigest: first.planDigest,
      generation: first.generation,
      attemptId: first.attemptId,
      ownerNonce: first.owner.ownerNonce,
      settlement: {
        state: 'BLOCKED',
        code: 'OWNER_HOLD',
        settledAt: '2026-07-28T10:00:30.000Z',
      },
      authority: { kind: 'owner-capability' },
    });
    const second = prepareStartAttempt(root, {
      flowId: 'manifest-flow',
      revision: 1,
      planDigest: 'manifest-digest',
      attemptId: 'manifest-attempt-2',
      preparedAt: '2026-07-28T10:02:00.000Z',
      lineage: {
        ...first.lineage,
        correlationId: 'manifest-correlation-2',
        idempotencyKey: 'manifest-idempotency-2',
      },
      owner: {
        process: { pid: 4102, startToken: 'start-4102', evidence: 'verified' },
        ownerNonce: 'manifest-owner-2',
        leaseUntil: '2026-07-28T10:03:00.000Z',
      },
      expectedPrevious: {
        generation: first.generation,
        attemptId: first.attemptId,
      },
    }).attempt;

    expect(loadRunFlowRecoveryManifest(root, second.flowId, second.generation))
      .toMatchObject({
        attemptId: second.attemptId,
        predecessorAttemptId: first.attemptId,
        predecessorSettlement: { state: 'BLOCKED', code: 'OWNER_HOLD' },
      });

    const upgraded = new Database(dbPath);
    try {
      expect(upgraded.pragma('user_version', { simple: true })).toBe(3);
      expect(() => upgraded.prepare(`
        UPDATE run_flow_recovery_manifests
        SET recorded_at = '2030-01-01T00:00:00.000Z'
        WHERE flow_id = 'manifest-flow' AND generation = 2
      `).run()).toThrow(/immutable/);
      expect(() => upgraded.prepare(`
        DELETE FROM run_flow_recovery_manifests
        WHERE flow_id = 'manifest-flow' AND generation = 2
      `).run()).toThrow(/immutable/);
    } finally {
      upgraded.close();
    }

    const legacyMissingManifest = new Database(dbPath);
    try {
      legacyMissingManifest.exec('DROP TRIGGER run_flow_recovery_manifests_no_delete');
      legacyMissingManifest.prepare(`
        DELETE FROM run_flow_recovery_manifests
        WHERE flow_id = 'manifest-flow' AND generation = 2
      `).run();
    } finally {
      legacyMissingManifest.close();
    }
    expect(() => recordStartAttemptProcessSpawned(root, {
      flowId: second.flowId,
      revision: second.revision,
      planDigest: second.planDigest,
      generation: second.generation,
      attemptId: second.attemptId,
      ownerNonce: second.owner.ownerNonce,
      process: { pid: 4202, startToken: 'start-4202', evidence: 'verified' },
      spawnedAt: '2026-07-28T10:02:30.000Z',
    })).toThrowError(expect.objectContaining<Partial<RunFlowStoreError>>({
      code: 'START_ATTEMPT_RECOVERY_MANIFEST_MISSING',
    }));
  });
});
