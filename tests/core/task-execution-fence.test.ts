import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  existsSync,
  linkSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  EXECUTION_LOCK_AUTHORITY_ANCHOR_FILENAME,
  EXECUTION_LOCK_AUTHORITY_SENTINEL_FILENAME,
  EXECUTION_LOCK_DB_META_VERSION,
  EXECUTION_LOCK_COORDINATION_DB_FILENAME,
  EXECUTION_LOCK_MOUNT_ADOPTION_DIRECTORY,
  EXECUTION_LOCK_RECOVERY_ATTESTATION_SCHEMA_VERSION,
  EXECUTION_LOCK_SCHEMA_VERSION,
  PROJECT_MAINTENANCE_LOCK_TASK_ID,
  MAX_EXECUTION_LOCK_LEASE_MS,
  MAX_EXECUTION_LOCK_TASK_ID_BYTES,
  ExecutionLockError,
  acquireExecutionLock,
  acquireProjectMaintenanceLock,
  adoptExecutionLockAuthorityMount,
  assertExecutionLockFencingProgression,
  beginExecutionLockIrreversibleBoundary,
  checkExecutionLock,
  checkProjectMaintenanceLock,
  completeExecutionLockIrreversibleBoundary,
  quarantineExecutionLock,
  recoverQuarantinedExecutionLock,
  releaseExecutionLock,
  renewExecutionLock,
  withExecutionLock,
  withExecutionLockOutcome,
  type ExecutionLockInfo,
  type ExecutionLockProcessProbe,
} from '../../src/core/file-lock.js';

const BASE_TIME = Date.parse('2026-07-27T12:00:00.000Z');

function executionLockPath(root: string, taskId: string): string {
  const hash = createHash('sha256').update(taskId).digest('hex');
  return join(root, '.locks', `${hash}.executionlock`);
}

function readLock(root: string, taskId: string): ExecutionLockInfo {
  return JSON.parse(readFileSync(executionLockPath(root, taskId), 'utf8')) as ExecutionLockInfo;
}

function executionAuthorityDbPath(root: string): string {
  return join(root, '.locks', EXECUTION_LOCK_COORDINATION_DB_FILENAME);
}

function simulateExecutionAuthorityRemount(root: string): {
  readonly originalMountId: string;
  readonly simulatedMountId: string;
} {
  const anchorPath = join(root, EXECUTION_LOCK_AUTHORITY_ANCHOR_FILENAME);
  const anchor = JSON.parse(readFileSync(anchorPath, 'utf8')) as {
    project: { mountId: string };
    locks: { mountId: string };
  };
  const originalMountId = anchor.project.mountId;
  const simulatedMountId = String(BigInt(originalMountId) + 1n);
  const remounted = JSON.stringify({
    ...anchor,
    project: { ...anchor.project, mountId: simulatedMountId },
    locks: { ...anchor.locks, mountId: simulatedMountId },
  });
  writeFileSync(anchorPath, remounted, 'utf8');
  // FAZ4B: production artık parent-dizinde byte-eşdeğer bir root-binding
  // kopyası tutuyor (executionLockRootBindingPath) ve mutation-sonu doğrulama
  // binding.raw === anchor.raw şartı koşuyor. Gerçek bir remount'ta iki kayıt
  // da aynı (eski) mount id'yi taşır — simülasyon iki dosyayı birlikte yazar.
  const bindingKey = createHash('sha256')
    .update(basename(root), 'utf8')
    .digest('hex');
  const bindingPath = join(
    dirname(root),
    `.deckent-execution-lock-root-binding.${bindingKey}.json`,
  );
  if (existsSync(bindingPath)) {
    writeFileSync(bindingPath, remounted, 'utf8');
  }
  return { originalMountId, simulatedMountId };
}

function seedLegacyV2ExecutionAuthority(
  root: string,
  taskId: string,
): ExecutionLockInfo {
  const locksDir = join(root, '.locks');
  mkdirSync(locksDir, { recursive: true });
  const epoch = '10000000-0000-4000-8000-000000000001';
  const ownerId = '20000000-0000-4000-8000-000000000002';
  const legacy = {
    schemaVersion: 2,
    taskId,
    actor: 'dispatch',
    ownerId,
    pid: process.pid,
    hostInstanceId: 'legacy-host',
    bootSessionId: 'legacy-boot',
    processSessionId: 'legacy-process',
    fencingToken: {
      epoch,
      counter: 7,
      nonce: '1'.repeat(32),
    },
    acquiredAt: '2026-07-27T10:00:00.000Z',
    renewedAt: '2026-07-27T10:00:05.000Z',
    leaseDurationMs: 30_000,
  };
  writeFileSync(
    join(locksDir, EXECUTION_LOCK_AUTHORITY_SENTINEL_FILENAME),
    JSON.stringify({
      schemaVersion: 1,
      authorityEpoch: epoch,
      createdAt: '2026-07-27T09:59:59.000Z',
    }),
    'utf8',
  );
  writeFileSync(executionLockPath(root, taskId), JSON.stringify(legacy), 'utf8');
  const db = new Database(executionAuthorityDbPath(root));
  db.pragma('journal_mode = DELETE');
  db.pragma('synchronous = FULL');
  db.exec(`
    CREATE TABLE execution_lock_meta (
      singleton INTEGER NOT NULL PRIMARY KEY CHECK(singleton = 1),
      meta_version INTEGER NOT NULL CHECK(meta_version = 2),
      authority_epoch TEXT NOT NULL CHECK(length(authority_epoch) = 36),
      fencing_counter INTEGER NOT NULL CHECK(fencing_counter >= 0)
    ) STRICT;
    CREATE TABLE execution_lock_active (
      task_id TEXT NOT NULL PRIMARY KEY,
      owner_id TEXT NOT NULL UNIQUE,
      fencing_epoch TEXT NOT NULL CHECK(length(fencing_epoch) = 36),
      fencing_counter INTEGER NOT NULL CHECK(fencing_counter > 0),
      fencing_nonce TEXT NOT NULL CHECK(
        length(fencing_nonce) = 32
        AND fencing_nonce NOT GLOB '*[^0-9a-f]*'
      ),
      payload_json TEXT NOT NULL,
      UNIQUE(fencing_epoch, fencing_counter, fencing_nonce)
    ) STRICT, WITHOUT ROWID;
    INSERT INTO execution_lock_meta(
      singleton, meta_version, authority_epoch, fencing_counter
    ) VALUES (1, 2, '${epoch}', 7);
    PRAGMA user_version = 2;
  `);
  db.prepare(`
    INSERT INTO execution_lock_active(
      task_id, owner_id, fencing_epoch, fencing_counter, fencing_nonce,
      payload_json
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    taskId,
    ownerId,
    epoch,
    7,
    '1'.repeat(32),
    JSON.stringify(legacy),
  );
  db.close();
  return {
    ...legacy,
    schemaVersion: EXECUTION_LOCK_SCHEMA_VERSION,
  } as ExecutionLockInfo;
}

function waitForChildExit(child: ChildProcessWithoutNullStreams): Promise<number | null> {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => resolve(code));
  });
}

function waitForFile(path: string, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const poll = (): void => {
      if (existsSync(path)) {
        resolve();
      } else if (Date.now() >= deadline) {
        reject(new Error(`timed out waiting for ${path}`));
      } else {
        setTimeout(poll, 10);
      }
    };
    poll();
  });
}

describe('task execution lock authority', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deckent-execution-lock-'));
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(root, { recursive: true, force: true });
  });

  it('publishes an exact schema-v3 document with a durable compound fence', () => {
    const taskId = 'run-enterprise-001';
    const lock = acquireExecutionLock(root, taskId, 'dispatch', {
      leaseDurationMs: 45_000,
      now: () => BASE_TIME,
    });

    const files = readdirSync(join(root, '.locks'));
    expect(files.filter(file => file.endsWith('.executionlock'))).toEqual([
      `${createHash('sha256').update(taskId).digest('hex')}.executionlock`,
    ]);
    expect(lock).toEqual({
      schemaVersion: EXECUTION_LOCK_SCHEMA_VERSION,
      taskId,
      actor: 'dispatch',
      ownerId: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
      ),
      pid: process.pid,
      hostInstanceId: expect.stringMatching(/^[A-Za-z0-9._:-]{1,128}$/u),
      bootSessionId: expect.stringMatching(/^[A-Za-z0-9._:-]{1,128}$/u),
      processSessionId: expect.stringMatching(/^[A-Za-z0-9._:-]{1,128}$/u),
      fencingToken: {
        epoch: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
        ),
        counter: 1,
        nonce: expect.stringMatching(/^[0-9a-f]{32}$/u),
      },
      acquiredAt: '2026-07-27T12:00:00.000Z',
      renewedAt: '2026-07-27T12:00:00.000Z',
      leaseDurationMs: 45_000,
    });
    expect(Object.keys(readLock(root, taskId)).sort()).toEqual([
      'acquiredAt',
      'actor',
      'bootSessionId',
      'fencingToken',
      'hostInstanceId',
      'leaseDurationMs',
      'ownerId',
      'pid',
      'processSessionId',
      'renewedAt',
      'schemaVersion',
      'taskId',
    ]);
    expect(Object.keys(lock.fencingToken).sort()).toEqual([
      'counter',
      'epoch',
      'nonce',
    ]);
    expect(JSON.parse(readFileSync(
      join(root, '.locks', EXECUTION_LOCK_AUTHORITY_SENTINEL_FILENAME),
      'utf8',
    ))).toEqual({
      schemaVersion: 1,
      authorityEpoch: lock.fencingToken.epoch,
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/u),
    });
    expect(readdirSync(join(root, '.locks')).some(file => file.includes('.tmp-'))).toBe(false);
  });

  it('initializes exact DB v3 quarantine tables, indexes, and guards', () => {
    const lock = acquireExecutionLock(root, 'schema-v3', 'dispatch');
    releaseExecutionLock(root, lock.taskId, lock.ownerId);
    const db = new Database(executionAuthorityDbPath(root), { readonly: true });

    expect(db.pragma('user_version', { simple: true }))
      .toBe(EXECUTION_LOCK_DB_META_VERSION);
    expect(db.prepare(`
      SELECT meta_version
        FROM execution_lock_meta
       WHERE singleton = 1
    `).get()).toEqual({ meta_version: 3 });
    const objects = db.prepare(`
      SELECT type, name
        FROM sqlite_master
       WHERE name LIKE 'execution_lock_quarantine%'
       ORDER BY type, name
    `).all();
    expect(objects).toEqual(expect.arrayContaining([
      { type: 'index', name: 'execution_lock_quarantine_one_terminal' },
      { type: 'table', name: 'execution_lock_quarantine' },
      { type: 'table', name: 'execution_lock_quarantine_audit' },
      { type: 'trigger', name: 'execution_lock_quarantine_audit_no_delete' },
      { type: 'trigger', name: 'execution_lock_quarantine_audit_no_update' },
      { type: 'trigger', name: 'execution_lock_quarantine_monotonic_update' },
      { type: 'trigger', name: 'execution_lock_quarantine_terminal_delete' },
    ]));
    db.close();
  });

  it('keeps migration, projection, and quarantine reconciliation bounded by keyset pages', () => {
    const source = readFileSync(
      join(process.cwd(), 'src', 'core', 'file-lock.ts'),
      'utf8',
    );
    const auditLoader = source.slice(
      source.indexOf('function loadExecutionLockQuarantineAuditPage'),
      source.indexOf('function loadExecutionLockQuarantinePage'),
    );
    expect(auditLoader).toContain(
      'JOIN execution_lock_quarantine AS quarantine',
    );
    expect(auditLoader).toContain('WHERE quarantine.task_id > ?');
    expect(auditLoader).toContain('LIMIT ?');
    expect(auditLoader).not.toContain(' IN (');
    expect(auditLoader).not.toContain('.all(...');
    const quarantineLoader = source.slice(
      source.indexOf('function loadExecutionLockQuarantinePage'),
      source.indexOf('function loadExecutionLockQuarantineRows'),
    );
    expect(quarantineLoader).toContain('WHERE task_id > ?');
    expect(quarantineLoader).toContain('LIMIT ?');
    const migrationLoader = source.slice(
      source.indexOf('function loadLegacyV2ExecutionLockActivePage'),
      source.indexOf('function executionLockGenerationEquals'),
    );
    expect(migrationLoader).toContain('WHERE task_id > ?');
    expect(migrationLoader).toContain('LIMIT ?');
    const projectionScanner = source.slice(
      source.indexOf('function scanExecutionLockProjections'),
      source.indexOf('function loadExecutionLockActivePage'),
    );
    expect(projectionScanner).toContain('activeByOwner.get(');
    expect(projectionScanner).toContain('activeByTask.get(');
    expect(projectionScanner).not.toContain('active.find(');

    const seed = acquireExecutionLock(root, 'audit-history-seed', 'dispatch');
    releaseExecutionLock(root, seed.taskId, seed.ownerId);
    const db = new Database(executionAuthorityDbPath(root));
    const insert = db.prepare(`
      INSERT INTO execution_lock_quarantine_audit(
        event_id, action, quarantine_id, task_id, owner_id, fencing_epoch,
        fencing_counter, fencing_nonce, occurred_at, payload_json
      ) VALUES (?, 'completed', ?, ?, ?, ?, ?, ?, ?, '{}')
    `);
    db.transaction(() => {
      for (let index = 0; index < 2_500; index++) {
        insert.run(
          randomUUID(),
          randomUUID(),
          `historical-${index}`,
          randomUUID(),
          seed.fencingToken.epoch,
          index + 1,
          index.toString(16).padStart(32, '0'),
          new Date(BASE_TIME + index).toISOString(),
        );
      }
    })();
    db.close();

    const next = acquireExecutionLock(root, 'audit-history-next', 'dispatch');
    expect(next.fencingToken.counter).toBeGreaterThan(seed.fencingToken.counter);
    expect(releaseExecutionLock(root, next.taskId, next.ownerId)).toBe(true);
  });

  it('keeps normal task renewal and release task-scoped with more than a thousand unrelated canonical rows', () => {
    const target = acquireExecutionLock(
      root,
      'high-cardinality-target',
      'dispatch',
      { now: () => BASE_TIME },
    );
    const db = new Database(executionAuthorityDbPath(root));
    const insert = db.prepare(`
      INSERT INTO execution_lock_active(
        task_id, owner_id, fencing_epoch, fencing_counter, fencing_nonce,
        payload_json
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    db.transaction(() => {
      for (let index = 0; index < 1_100; index++) {
        const counter = index + 2;
        const taskId = `unrelated-${index.toString().padStart(4, '0')}`;
        const ownerId =
          `10000000-0000-4000-8000-${counter.toString(16).padStart(12, '0')}`;
        const nonce = counter.toString(16).padStart(32, '0');
        const lock: ExecutionLockInfo = {
          schemaVersion: EXECUTION_LOCK_SCHEMA_VERSION,
          taskId,
          actor: 'dispatch',
          ownerId,
          pid: 42,
          hostInstanceId: 'scale-host',
          bootSessionId: 'scale-boot',
          processSessionId: 'scale-process',
          fencingToken: {
            epoch: target.fencingToken.epoch,
            counter,
            nonce,
          },
          acquiredAt: '2026-07-27T12:00:00.000Z',
          renewedAt: '2026-07-27T12:00:00.000Z',
          leaseDurationMs: 30_000,
        };
        insert.run(
          taskId,
          ownerId,
          lock.fencingToken.epoch,
          counter,
          nonce,
          JSON.stringify(lock),
        );
      }
      db.prepare(`
        UPDATE execution_lock_meta
           SET fencing_counter = 1101
         WHERE singleton = 1
      `).run();
    })();
    db.close();

    const renewed = renewExecutionLock(
      root,
      target.taskId,
      target.ownerId,
      { now: () => BASE_TIME + 10 },
    );
    expect(renewed.renewedAt).toBe('2026-07-27T12:00:00.010Z');
    expect(releaseExecutionLock(
      root,
      renewed.taskId,
      renewed.ownerId,
    )).toBe(true);
    expect(checkExecutionLock(root, target.taskId)).toEqual({
      state: 'absent',
    });
    const retained = new Database(executionAuthorityDbPath(root), {
      readonly: true,
    });
    expect(retained.prepare(`
      SELECT COUNT(*) AS count
        FROM execution_lock_active
    `).get()).toEqual({ count: 1_100 });
    retained.close();
  });

  it('transactionally migrates real v2 payloads into deterministic audited quarantine', () => {
    const taskId = 'legacy-v2-active';
    const expected = seedLegacyV2ExecutionAuthority(root, taskId);

    const firstInspection = checkExecutionLock(root, taskId);
    expect(firstInspection).toEqual({
      state: 'quarantined',
      lock: expected,
      quarantine: expect.objectContaining({
        state: 'quarantined',
        reason: 'legacy-v2-active',
        lock: expected,
        evidenceRefs: expect.arrayContaining([
          'migration:execution-lock-db-v2',
        ]),
      }),
    });
    expect(readLock(root, taskId)).toEqual(expected);

    const db = new Database(executionAuthorityDbPath(root));
    expect(db.pragma('user_version', { simple: true })).toBe(3);
    const firstRows = {
      quarantine: db.prepare(`
        SELECT quarantine_id, payload_json
          FROM execution_lock_quarantine
      `).all(),
      audit: db.prepare(`
        SELECT event_id, payload_json
          FROM execution_lock_quarantine_audit
         ORDER BY event_id
      `).all(),
    };
    db.close();

    expect(checkExecutionLock(root, taskId)).toEqual(firstInspection);
    const replayDb = new Database(executionAuthorityDbPath(root), {
      readonly: true,
    });
    expect({
      quarantine: replayDb.prepare(`
        SELECT quarantine_id, payload_json
          FROM execution_lock_quarantine
      `).all(),
      audit: replayDb.prepare(`
        SELECT event_id, payload_json
          FROM execution_lock_quarantine_audit
         ORDER BY event_id
      `).all(),
    }).toEqual(firstRows);
    replayDb.close();

    const oldReader = new Database(executionAuthorityDbPath(root), {
      readonly: true,
    });
    expect(() => {
      const version = oldReader.pragma('user_version', { simple: true });
      if (version !== 2) throw new Error(`old-binary-refused-v${version}`);
    }).toThrow('old-binary-refused-v3');
    oldReader.close();
  });

  it('rolls back the entire v2 migration when any legacy row is malformed', () => {
    const taskId = 'legacy-v2-atomic-rollback';
    seedLegacyV2ExecutionAuthority(root, taskId);
    const db = new Database(executionAuthorityDbPath(root));
    db.prepare(`
      INSERT INTO execution_lock_active(
        task_id, owner_id, fencing_epoch, fencing_counter, fencing_nonce,
        payload_json
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      'legacy-v2-malformed',
      '30000000-0000-4000-8000-000000000003',
      '10000000-0000-4000-8000-000000000001',
      8,
      '2'.repeat(32),
      '{"schemaVersion":2',
    );
    const before = db.prepare(`
      SELECT task_id, payload_json
        FROM execution_lock_active
       ORDER BY task_id
    `).all();
    db.close();

    expect(checkExecutionLock(root, taskId)).toEqual(
      expect.objectContaining({ state: 'malformed' }),
    );

    const after = new Database(executionAuthorityDbPath(root), {
      readonly: true,
    });
    expect(after.pragma('user_version', { simple: true })).toBe(2);
    expect(after.prepare(`
      SELECT task_id, payload_json
        FROM execution_lock_active
       ORDER BY task_id
    `).all()).toEqual(before);
    expect(after.prepare(`
      SELECT COUNT(*) AS count
        FROM sqlite_master
       WHERE name IN (
         'execution_lock_quarantine',
         'execution_lock_quarantine_audit'
       )
    `).get()).toEqual({ count: 0 });
    after.close();
  });

  it('uses a unique owner generation and rejects concurrent task re-entry', () => {
    const first = acquireExecutionLock(root, 'same-task', 'dispatch');

    expect(() => acquireExecutionLock(root, 'same-task', 'dispatch')).toThrowError(
      expect.objectContaining({
        name: 'ExecutionLockError',
        reason: 'held',
        conflictingOwnerId: first.ownerId,
      }),
    );
  });

  it('renews only the owning generation and preserves immutable metadata', () => {
    const first = acquireExecutionLock(root, 'renew-task', 'dispatch', {
      leaseDurationMs: 2_000,
      now: () => BASE_TIME,
    });
    const renewed = renewExecutionLock(root, 'renew-task', first.ownerId, {
      now: () => BASE_TIME + 750,
    });

    expect(renewed).toEqual({
      ...first,
      renewedAt: '2026-07-27T12:00:00.750Z',
    });
    expect(readLock(root, 'renew-task')).toEqual(renewed);
    expect(() => renewExecutionLock(root, 'renew-task', randomUUID())).toThrowError(
      expect.objectContaining({ reason: 'ownership-lost' }),
    );
    expect(readLock(root, 'renew-task')).toEqual(renewed);
  });

  it('releases only the owning generation', () => {
    const lock = acquireExecutionLock(root, 'release-task', 'settlement');

    expect(() => releaseExecutionLock(
      root,
      'release-task',
      randomUUID(),
    )).toThrowError(expect.objectContaining({ reason: 'ownership-lost' }));
    expect(checkExecutionLock(root, 'release-task').state).toBe('held');
    expect(releaseExecutionLock(root, 'release-task', lock.ownerId)).toBe(true);
    expect(releaseExecutionLock(root, 'release-task', lock.ownerId)).toBe(false);
    expect(checkExecutionLock(root, 'release-task')).toEqual({ state: 'absent' });
  });

  it('commits an in-flight boundary before side effects and never lease-retires it', () => {
    const lock = acquireExecutionLock(root, 'irreversible-task', 'dispatch', {
      leaseDurationMs: 100,
      now: () => BASE_TIME,
    });
    const boundary = beginExecutionLockIrreversibleBoundary(
      root,
      lock,
      { evidenceRefs: ['dispatch:write-boundary'] },
      { now: () => BASE_TIME + 10 },
    );

    expect(checkExecutionLock(root, lock.taskId)).toEqual({
      state: 'quarantined',
      lock,
      quarantine: boundary,
    });
    expect(boundary).toMatchObject({
      state: 'in-flight',
      reason: 'irreversible-boundary',
      quarantinedAt: null,
      lock,
    });
    expect(() => releaseExecutionLock(root, lock.taskId, lock.ownerId))
      .toThrowError(expect.objectContaining({ reason: 'quarantined' }));
    expect(() => acquireExecutionLock(root, lock.taskId, 'settlement', {
      now: () => BASE_TIME + 101,
      livenessProbe: { inspect: () => 'dead' },
    })).toThrowError(expect.objectContaining({
      reason: 'quarantined',
      conflictingOwnerId: lock.ownerId,
    }));
    expect(() => acquireProjectMaintenanceLock(root, {
      now: () => BASE_TIME + 101,
      livenessProbe: { inspect: () => 'dead' },
    })).toThrowError(expect.objectContaining({ reason: 'quarantined' }));

    const unrelated = acquireExecutionLock(
      root,
      'independent-task',
      'dispatch',
    );
    expect(releaseExecutionLock(
      root,
      unrelated.taskId,
      unrelated.ownerId,
    )).toBe(true);
  });

  it('requires the exact live owner and exact fence to renew and complete in-flight work', () => {
    const lock = acquireExecutionLock(root, 'boundary-owner', 'dispatch', {
      now: () => BASE_TIME,
      leaseDurationMs: 1_000,
    });
    const boundary = beginExecutionLockIrreversibleBoundary(
      root,
      lock,
      { evidenceRefs: ['dispatch:boundary'] },
      { now: () => BASE_TIME + 1 },
    );
    const foreignIdentity = {
      hostInstanceId: 'foreign-host',
      bootSessionId: 'foreign-boot',
      processSessionId: 'foreign-process',
    };

    expect(() => renewExecutionLock(
      root,
      lock.taskId,
      lock.ownerId,
      {
        now: () => BASE_TIME + 10,
        runtimeIdentity: foreignIdentity,
      },
    )).toThrowError(expect.objectContaining({ reason: 'foreign-host' }));
    expect(() => quarantineExecutionLock(
      root,
      lock,
      {
        reason: 'partial-mutation',
        evidenceRefs: ['dispatch:error'],
      },
      { runtimeIdentity: foreignIdentity },
    )).toThrowError(expect.objectContaining({ reason: 'foreign-host' }));
    expect(() => completeExecutionLockIrreversibleBoundary(
      root,
      lock,
      {
        quarantineId: boundary.quarantineId,
        evidenceRefs: ['dispatch:committed'],
      },
      { ownerPid: process.pid + 1 },
    )).toThrowError(expect.objectContaining({ reason: 'foreign-host' }));

    const renewed = renewExecutionLock(
      root,
      lock.taskId,
      lock.ownerId,
      { now: () => BASE_TIME + 20 },
    );
    expect(() => completeExecutionLockIrreversibleBoundary(
      root,
      lock,
      {
        quarantineId: boundary.quarantineId,
        evidenceRefs: ['dispatch:committed'],
      },
    )).toThrowError(expect.objectContaining({ reason: 'ownership-lost' }));

    const completed = completeExecutionLockIrreversibleBoundary(
      root,
      renewed,
      {
        quarantineId: boundary.quarantineId,
        evidenceRefs: ['dispatch:committed'],
      },
      { now: () => BASE_TIME + 30 },
    );
    expect(completed).toMatchObject({
      completed: expect.objectContaining({
        quarantineId: boundary.quarantineId,
        state: 'in-flight',
      }),
      audit: expect.objectContaining({ action: 'completed' }),
      projectionCleanup: 'completed',
    });
    expect(checkExecutionLock(root, lock.taskId)).toEqual({ state: 'absent' });

    const db = new Database(executionAuthorityDbPath(root), { readonly: true });
    expect(db.prepare(`
      SELECT action
        FROM execution_lock_quarantine_audit
       WHERE quarantine_id = ?
       ORDER BY action
    `).all(boundary.quarantineId)).toEqual([
      { action: 'boundary-entered' },
      { action: 'completed' },
    ]);
    db.close();
  });

  it('keeps a committed completion authoritative when projection cleanup is uncertain', () => {
    const lock = acquireExecutionLock(
      root,
      'completion-projection-uncertain',
      'dispatch',
      { now: () => BASE_TIME },
    );
    const boundary = beginExecutionLockIrreversibleBoundary(
      root,
      lock,
      { evidenceRefs: ['dispatch:boundary'] },
      { now: () => BASE_TIME + 1 },
    );
    const projectionPath = executionLockPath(root, lock.taskId);

    const completed = completeExecutionLockIrreversibleBoundary(
      root,
      lock,
      {
        quarantineId: boundary.quarantineId,
        evidenceRefs: ['dispatch:committed'],
      },
      {
        now: () => BASE_TIME + 2,
        terminalCommitObserver: () => {
          unlinkSync(projectionPath);
          mkdirSync(projectionPath);
        },
      },
    );

    expect(completed).toMatchObject({
      audit: expect.objectContaining({ action: 'completed' }),
      projectionCleanup: 'uncertain',
    });
    const db = new Database(executionAuthorityDbPath(root), { readonly: true });
    expect(db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM execution_lock_active) AS active,
        (SELECT COUNT(*) FROM execution_lock_quarantine) AS quarantine
    `).get()).toEqual({ active: 0, quarantine: 0 });
    expect(db.prepare(`
      SELECT action
        FROM execution_lock_quarantine_audit
       WHERE quarantine_id = ?
       ORDER BY occurred_at, action
    `).all(boundary.quarantineId)).toEqual([
      { action: 'boundary-entered' },
      { action: 'completed' },
    ]);
    db.close();

    expect(checkExecutionLock(root, lock.taskId).state).toBe('malformed');
    rmSync(projectionPath, { recursive: true, force: true });
    expect(checkExecutionLock(root, lock.taskId)).toEqual({ state: 'absent' });
  });

  it('monotonically quarantines failures and recovers only verified exact attestations', () => {
    const lock = acquireExecutionLock(root, 'operator-recovery', 'dispatch', {
      now: () => BASE_TIME,
    });
    const boundary = beginExecutionLockIrreversibleBoundary(
      root,
      lock,
      { evidenceRefs: ['dispatch:boundary'] },
      { now: () => BASE_TIME + 1 },
    );
    const quarantine = quarantineExecutionLock(
      root,
      lock,
      {
        reason: 'partial-mutation',
        evidenceRefs: ['dispatch:partial-write'],
      },
      { now: () => BASE_TIME + 2 },
    );
    const repeated = quarantineExecutionLock(
      root,
      lock,
      {
        reason: 'release-fault',
        evidenceRefs: ['dispatch:release-fault'],
      },
      { now: () => BASE_TIME + 3 },
    );
    expect(repeated).toEqual(quarantine);
    expect(quarantine).toMatchObject({
      quarantineId: boundary.quarantineId,
      state: 'quarantined',
      reason: 'partial-mutation',
    });
    expect(() => renewExecutionLock(root, lock.taskId, lock.ownerId))
      .toThrowError(expect.objectContaining({ reason: 'quarantined' }));

    const attestation = {
      schemaVersion: EXECUTION_LOCK_RECOVERY_ATTESTATION_SCHEMA_VERSION,
      quarantineId: quarantine.quarantineId,
      fencingToken: lock.fencingToken,
      operatorId: 'operator-primary',
      justification: 'Verified partial write disposition',
      evidenceRefs: ['approval:recovery-001'],
      attestedAt: new Date(BASE_TIME + 4).toISOString(),
    } as const;
    expect(() => recoverQuarantinedExecutionLock(
      root,
      lock,
      {
        ...attestation,
        attestedAt: new Date(BASE_TIME - (16 * 60 * 1_000)).toISOString(),
      },
      {
        now: () => BASE_TIME + 4,
        recoveryAttestationVerifier: () => true,
      },
    )).toThrowError(expect.objectContaining({ reason: 'invalid-input' }));
    expect(() => recoverQuarantinedExecutionLock(
      root,
      lock,
      {
        ...attestation,
        fencingToken: {
          ...attestation.fencingToken,
          nonce: 'f'.repeat(32),
        },
      },
      {
        now: () => BASE_TIME + 4,
        recoveryAttestationVerifier: () => true,
      },
    )).toThrowError(expect.objectContaining({ reason: 'invalid-input' }));
    expect(() => recoverQuarantinedExecutionLock(
      root,
      lock,
      {
        ...attestation,
        attestedAt: new Date(BASE_TIME + 1).toISOString(),
      },
      {
        now: () => BASE_TIME + 4,
        recoveryAttestationVerifier: () => true,
      },
    )).toThrowError(expect.objectContaining({ reason: 'invalid-input' }));
    expect(() => recoverQuarantinedExecutionLock(
      root,
      lock,
      attestation,
      {
        now: () => BASE_TIME + 4,
        recoveryAttestationVerifier: () => false,
      },
    )).toThrowError(expect.objectContaining({ reason: 'invalid-input' }));
    expect(checkExecutionLock(root, lock.taskId).state).toBe('quarantined');

    const guardedDb = new Database(executionAuthorityDbPath(root));
    expect(() => guardedDb.prepare(`
      DELETE FROM execution_lock_quarantine
       WHERE quarantine_id = ?
    `).run(quarantine.quarantineId)).toThrow(
      /quarantine delete requires terminal audit/u,
    );
    expect(() => guardedDb.prepare(`
      DELETE FROM execution_lock_quarantine_audit
       WHERE quarantine_id = ?
    `).run(quarantine.quarantineId)).toThrow(/audit is append-only/u);
    expect(() => guardedDb.prepare(`
      UPDATE execution_lock_quarantine
         SET state = 'in-flight'
       WHERE quarantine_id = ?
    `).run(quarantine.quarantineId)).toThrow(/transition is not monotonic/u);
    guardedDb.close();

    let verificationDigest = '';
    const recovered = recoverQuarantinedExecutionLock(
      root,
      lock,
      attestation,
      {
        now: () => BASE_TIME + 4,
        recoveryAttestationVerifier: context => {
          verificationDigest = context.quarantineDigest;
          return context.attestation.operatorId === 'operator-primary'
            && context.quarantine.quarantineId === quarantine.quarantineId;
        },
      },
    );
    expect(verificationDigest).toMatch(/^[0-9a-f]{64}$/u);
    expect(recovered).toMatchObject({
      recovered: quarantine,
      audit: expect.objectContaining({ action: 'recovered' }),
      projectionCleanup: 'completed',
    });
    expect(checkExecutionLock(root, lock.taskId)).toEqual({ state: 'absent' });

    const db = new Database(executionAuthorityDbPath(root), { readonly: true });
    expect(db.prepare(`
      SELECT action
        FROM execution_lock_quarantine_audit
       WHERE quarantine_id = ?
       ORDER BY occurred_at, action
    `).all(quarantine.quarantineId)).toEqual([
      { action: 'boundary-entered' },
      { action: 'quarantined' },
      { action: 'recovered' },
    ]);
    db.close();
  });

  it('keeps a committed recovery authoritative when projection cleanup is uncertain', () => {
    const lock = acquireExecutionLock(
      root,
      'recovery-projection-uncertain',
      'dispatch',
      { now: () => BASE_TIME },
    );
    const quarantine = quarantineExecutionLock(
      root,
      lock,
      {
        reason: 'partial-mutation',
        evidenceRefs: ['dispatch:partial-write'],
      },
      { now: () => BASE_TIME + 1 },
    );
    const projectionPath = executionLockPath(root, lock.taskId);
    const recovered = recoverQuarantinedExecutionLock(
      root,
      lock,
      {
        schemaVersion: EXECUTION_LOCK_RECOVERY_ATTESTATION_SCHEMA_VERSION,
        quarantineId: quarantine.quarantineId,
        fencingToken: lock.fencingToken,
        operatorId: 'operator-projection-recovery',
        justification: 'Verified projection cleanup fault disposition',
        evidenceRefs: ['approval:recovery-projection-001'],
        attestedAt: new Date(BASE_TIME + 2).toISOString(),
      },
      {
        now: () => BASE_TIME + 2,
        recoveryAttestationVerifier: () => true,
        terminalCommitObserver: () => {
          unlinkSync(projectionPath);
          mkdirSync(projectionPath);
        },
      },
    );

    expect(recovered).toMatchObject({
      recovered: quarantine,
      audit: expect.objectContaining({ action: 'recovered' }),
      projectionCleanup: 'uncertain',
    });
    const db = new Database(executionAuthorityDbPath(root), { readonly: true });
    expect(db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM execution_lock_active) AS active,
        (SELECT COUNT(*) FROM execution_lock_quarantine) AS quarantine
    `).get()).toEqual({ active: 0, quarantine: 0 });
    expect(db.prepare(`
      SELECT action
        FROM execution_lock_quarantine_audit
       WHERE quarantine_id = ?
       ORDER BY occurred_at, action
    `).all(quarantine.quarantineId)).toEqual([
      { action: 'quarantined' },
      { action: 'recovered' },
    ]);
    db.close();

    expect(checkExecutionLock(root, lock.taskId).state).toBe('malformed');
    rmSync(projectionPath, { recursive: true, force: true });
    expect(checkExecutionLock(root, lock.taskId)).toEqual({ state: 'absent' });
  });

  it('never unlinks a successor projection after the released DB commit', () => {
    const first = acquireExecutionLock(root, 'release-successor', 'dispatch');
    let successor: ExecutionLockInfo | undefined;

    expect(releaseExecutionLock(
      root,
      first.taskId,
      first.ownerId,
      {
        releaseCommitObserver: () => {
          successor = acquireExecutionLock(
            root,
            first.taskId,
            'settlement',
          );
        },
      },
    )).toBe(true);

    expect(successor).toBeDefined();
    expect(successor!.ownerId).not.toBe(first.ownerId);
    expect(successor!.fencingToken.counter).toBeGreaterThan(
      first.fencingToken.counter,
    );
    expect(readLock(root, first.taskId)).toEqual(successor);
    expect(checkExecutionLock(root, first.taskId)).toEqual({
      state: 'held',
      lock: successor,
    });
  });

  it('surfaces a committed release when lock-directory projection cleanup loses its generation', () => {
    const lock = acquireExecutionLock(
      root,
      'release-directory-generation-loss',
      'dispatch',
    );
    const locksDir = join(root, '.locks');
    const retiredLocksDir = join(root, '.locks-release-retired');
    let failure: unknown;
    try {
      releaseExecutionLock(root, lock.taskId, lock.ownerId, {
        releaseCommitObserver: () => {
          renameSync(locksDir, retiredLocksDir);
          mkdirSync(locksDir);
        },
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toEqual(expect.objectContaining({
      canonicalCommitState: 'committed',
      recoveryLock: lock,
    }));
    expect(readdirSync(locksDir)).toEqual([]);
    const retiredDb = new Database(join(
      retiredLocksDir,
      EXECUTION_LOCK_COORDINATION_DB_FILENAME,
    ), { readonly: true });
    expect(retiredDb.prepare(`
      SELECT COUNT(*) AS count
        FROM execution_lock_active
       WHERE task_id = ?
    `).get(lock.taskId)).toEqual({ count: 0 });
    retiredDb.close();
  });

  it('never recovers a non-expired lock even when a probe reports dead', () => {
    const probe: ExecutionLockProcessProbe = { inspect: vi.fn(() => 'dead') };
    const first = acquireExecutionLock(root, 'fresh-task', 'dispatch', {
      leaseDurationMs: 1_000,
      now: () => BASE_TIME,
    });

    expect(() => acquireExecutionLock(root, 'fresh-task', 'settlement', {
      now: () => BASE_TIME + 999,
      processProbe: probe,
    })).toThrowError(expect.objectContaining({
      reason: 'held',
      conflictingOwnerId: first.ownerId,
    }));
    expect(probe.inspect).not.toHaveBeenCalled();
  });

  it('recovers an expired generation only after its owner is proven dead', () => {
    const first = acquireExecutionLock(root, 'dead-task', 'dispatch', {
      leaseDurationMs: 1_000,
      now: () => BASE_TIME,
    });
    const deadProbe: ExecutionLockProcessProbe = { inspect: vi.fn(() => 'dead') };

    const recovered = acquireExecutionLock(root, 'dead-task', 'settlement', {
      leaseDurationMs: 2_000,
      now: () => BASE_TIME + 1_000,
      processProbe: deadProbe,
    });

    expect(deadProbe.inspect).toHaveBeenCalledWith(
      expect.objectContaining({ pid: process.pid }),
      expect.objectContaining({
        hostInstanceId: first.hostInstanceId,
        bootSessionId: first.bootSessionId,
      }),
    );
    expect(recovered.ownerId).not.toBe(first.ownerId);
    expect(recovered.actor).toBe('settlement');
    expect(readLock(root, 'dead-task')).toEqual(recovered);
  });

  it.each([
    ['alive', 'held'],
    ['unknown', 'liveness-unknown'],
  ] as const)(
    'preserves an expired generation when owner liveness is %s',
    (state, reason) => {
      const first = acquireExecutionLock(root, `preserve-${state}`, 'dispatch', {
        leaseDurationMs: 100,
        now: () => BASE_TIME,
      });
      const probe: ExecutionLockProcessProbe = { inspect: vi.fn(() => state) };

      expect(() => acquireExecutionLock(root, `preserve-${state}`, 'settlement', {
        now: () => BASE_TIME + 101,
        processProbe: probe,
      })).toThrowError(expect.objectContaining({
        reason,
        conflictingOwnerId: first.ownerId,
      }));
      expect(readLock(root, `preserve-${state}`).ownerId).toBe(first.ownerId);
    },
  );

  it('fails closed for malformed lock metadata and exposes malformed inspection state', () => {
    const taskId = 'malformed-task';
    mkdirSync(join(root, '.locks'), { recursive: true });
    writeFileSync(executionLockPath(root, taskId), JSON.stringify({
      schemaVersion: 1,
      taskId,
      actor: 'dispatch',
    }), 'utf8');

    expect(checkExecutionLock(root, taskId)).toEqual({
      state: 'malformed',
      lockPath: executionLockPath(root, taskId),
      reason: 'invalid-projection',
    });
    expect(() => acquireExecutionLock(root, taskId, 'settlement', {
      processProbe: { inspect: () => 'dead' },
    })).toThrowError(expect.objectContaining({ reason: 'malformed' }));
    expect(readFileSync(executionLockPath(root, taskId), 'utf8')).toContain('"dispatch"');
  });

  it('fails closed for a malformed per-task mutation guard', () => {
    const taskId = 'malformed-guard-task';
    const lockPath = executionLockPath(root, taskId);
    mkdirSync(join(root, '.locks'), { recursive: true });
    writeFileSync(`${lockPath}.guard`, '{not-json', 'utf8');

    expect(() => acquireExecutionLock(root, taskId, 'dispatch', {
      processProbe: { inspect: () => 'dead' },
    })).toThrowError(expect.objectContaining({ reason: 'malformed' }));
    expect(readFileSync(`${lockPath}.guard`, 'utf8')).toBe('{not-json');
  });

  it('fails closed on crashed temp/sidecar artifacts and leaves no unbounded artifacts', () => {
    const taskId = 'artifact-hold-task';
    mkdirSync(join(root, '.locks'), { recursive: true });
    const sidecar = `${executionLockPath(root, taskId)}.tmp-crashed-writer`;
    writeFileSync(sidecar, 'staged', 'utf8');

    expect(() => acquireExecutionLock(root, taskId, 'dispatch')).toThrowError(
      expect.objectContaining({ reason: 'malformed' }),
    );
    expect(readFileSync(sidecar, 'utf8')).toBe('staged');

    rmSync(sidecar);
    const tokens: number[] = [];
    for (let index = 0; index < 8; index++) {
      const lock = acquireExecutionLock(root, `bounded-${index}`, 'dispatch');
      tokens.push(lock.fencingToken.counter);
      releaseExecutionLock(root, lock.taskId, lock.ownerId);
    }
    expect(tokens).toEqual([...tokens].sort((left, right) => left - right));
    expect(new Set(tokens).size).toBe(tokens.length);
    expect(readdirSync(join(root, '.locks')).filter(
      entry => entry.includes('.executionlock'),
    )).toEqual([]);
  });

  it('reconciles canonical DB authority after projection loss without reusing a fence', () => {
    const first = acquireExecutionLock(root, 'projection-crash', 'dispatch');
    unlinkSync(executionLockPath(root, first.taskId));

    expect(checkExecutionLock(root, first.taskId)).toEqual({
      state: 'held',
      lock: first,
    });
    expect(readLock(root, first.taskId)).toEqual(first);
    releaseExecutionLock(root, first.taskId, first.ownerId);

    const second = acquireExecutionLock(root, 'projection-crash', 'dispatch');
    expect(second.fencingToken.epoch).toBe(first.fencingToken.epoch);
    expect(second.fencingToken.counter).toBeGreaterThan(
      first.fencingToken.counter,
    );
  });

  it('holds on canonical DB loss and never silently resets the authority epoch', () => {
    const first = acquireExecutionLock(root, 'db-loss', 'dispatch');
    const epoch = first.fencingToken.epoch;
    releaseExecutionLock(root, first.taskId, first.ownerId);
    unlinkSync(join(
      root,
      '.locks',
      EXECUTION_LOCK_COORDINATION_DB_FILENAME,
    ));

    expect(checkExecutionLock(root, first.taskId)).toEqual({
      state: 'malformed',
      lockPath: executionLockPath(root, first.taskId),
      reason: 'authority-state-missing',
    });
    expect(() => acquireExecutionLock(root, 'db-loss-retry', 'dispatch'))
      .toThrowError(expect.objectContaining({
        reason: 'authority-state-missing',
      }));
    expect(JSON.parse(readFileSync(
      join(root, '.locks', EXECUTION_LOCK_AUTHORITY_SENTINEL_FILENAME),
      'utf8',
    ))).toMatchObject({ authorityEpoch: epoch });
    expect(existsSync(join(
      root,
      '.locks',
      EXECUTION_LOCK_COORDINATION_DB_FILENAME,
    ))).toBe(false);
  });

  it('keeps restored-snapshot fences byte-unique and rejects counter replay', () => {
    const first = acquireExecutionLock(root, 'snapshot-first', 'dispatch');
    releaseExecutionLock(root, first.taskId, first.ownerId);
    const dbPath = join(
      root,
      '.locks',
      EXECUTION_LOCK_COORDINATION_DB_FILENAME,
    );
    const snapshotPath = join(root, 'authority-snapshot.sqlite3');
    copyFileSync(dbPath, snapshotPath);

    const issued = acquireExecutionLock(root, 'snapshot-issued', 'dispatch');
    releaseExecutionLock(root, issued.taskId, issued.ownerId);
    copyFileSync(snapshotPath, dbPath);

    const replayedCounter =
      acquireExecutionLock(root, 'snapshot-replayed', 'dispatch');
    expect(replayedCounter.fencingToken).toMatchObject({
      epoch: issued.fencingToken.epoch,
      counter: issued.fencingToken.counter,
    });
    expect(replayedCounter.fencingToken.nonce)
      .not.toBe(issued.fencingToken.nonce);
    expect(JSON.stringify(replayedCounter.fencingToken))
      .not.toBe(JSON.stringify(issued.fencingToken));

    expect(() => assertExecutionLockFencingProgression(
      first.fencingToken,
      issued.fencingToken,
      issued.taskId,
    )).not.toThrow();
    expect(() => assertExecutionLockFencingProgression(
      issued.fencingToken,
      replayedCounter.fencingToken,
      replayedCounter.taskId,
    )).toThrowError(expect.objectContaining({ reason: 'authority-lost' }));
    expect(() => assertExecutionLockFencingProgression(
      issued.fencingToken,
      first.fencingToken,
      first.taskId,
    )).toThrowError(expect.objectContaining({ reason: 'authority-lost' }));
  });

  it('holds on DB/sentinel epoch disagreement', () => {
    const first = acquireExecutionLock(root, 'epoch-mismatch', 'dispatch');
    releaseExecutionLock(root, first.taskId, first.ownerId);
    const sentinelPath = join(
      root,
      '.locks',
      EXECUTION_LOCK_AUTHORITY_SENTINEL_FILENAME,
    );
    const sentinel = JSON.parse(readFileSync(sentinelPath, 'utf8')) as {
      schemaVersion: number;
      authorityEpoch: string;
      createdAt: string;
    };
    writeFileSync(sentinelPath, JSON.stringify({
      ...sentinel,
      authorityEpoch: randomUUID(),
    }), 'utf8');

    expect(() => acquireExecutionLock(root, 'epoch-mismatch-retry', 'dispatch'))
      .toThrowError(expect.objectContaining({
        reason: 'authority-epoch-mismatch',
      }));
  });

  it('keeps cross-namespace mount ids observational and can audit an explicit metadata adoption', () => {
    const first = acquireExecutionLock(root, 'mount-adoption-seed', 'dispatch');
    releaseExecutionLock(root, first.taskId, first.ownerId);
    const { originalMountId, simulatedMountId } =
      simulateExecutionAuthorityRemount(root);
    const anchorPath = join(root, EXECUTION_LOCK_AUTHORITY_ANCHOR_FILENAME);
    const before = readFileSync(anchorPath, 'utf8');

    const namespacePeer = acquireExecutionLock(
      root,
      'mount-namespace-peer',
      'dispatch',
    );
    expect(namespacePeer.fencingToken.epoch).toBe(first.fencingToken.epoch);
    releaseExecutionLock(root, namespacePeer.taskId, namespacePeer.ownerId);

    const planned = adoptExecutionLockAuthorityMount(root);
    expect(planned).toMatchObject({
      decision: 'eligible',
      authorityEpoch: first.fencingToken.epoch,
      previous: { mountId: simulatedMountId },
      current: { mountId: originalMountId },
    });
    expect(readFileSync(anchorPath, 'utf8')).toBe(before);
    expect(existsSync(join(
      root,
      '.locks',
      EXECUTION_LOCK_MOUNT_ADOPTION_DIRECTORY,
    ))).toBe(false);

    const operatorId = 'operator-1';
    const justification = 'verified WSL remount with stable directory identities';
    const adopted = adoptExecutionLockAuthorityMount(root, {
      apply: true,
      operatorId,
      justification,
      now: () => BASE_TIME,
    });
    expect(adopted).toMatchObject({
      decision: 'adopted',
      authorityEpoch: first.fencingToken.epoch,
      previous: { mountId: simulatedMountId },
      current: { mountId: originalMountId },
    });
    expect(adopted.evidenceRefs).toEqual(expect.arrayContaining([
      expect.stringMatching(/^execution-lock-mount-adoption:sha256:[a-f0-9]{64}$/u),
    ]));

    const anchorAfter = JSON.parse(readFileSync(anchorPath, 'utf8')) as {
      authorityEpoch: string;
      project: { mountId: string };
      locks: { mountId: string };
    };
    expect(anchorAfter).toMatchObject({
      authorityEpoch: first.fencingToken.epoch,
      project: { mountId: originalMountId },
      locks: { mountId: originalMountId },
    });
    const auditDirectory = join(
      root,
      '.locks',
      EXECUTION_LOCK_MOUNT_ADOPTION_DIRECTORY,
    );
    const auditFiles = readdirSync(auditDirectory);
    expect(auditFiles).toHaveLength(1);
    const auditRaw = readFileSync(join(auditDirectory, auditFiles[0]!), 'utf8');
    expect(auditRaw).not.toContain(operatorId);
    expect(auditRaw).not.toContain(justification);
    expect(auditRaw).toContain(simulatedMountId);
    expect(auditRaw).toContain(originalMountId);

    expect(adoptExecutionLockAuthorityMount(root)).toMatchObject({
      decision: 'not-required',
      authorityEpoch: first.fencingToken.epoch,
    });
    const next = acquireExecutionLock(root, 'mount-adoption-next', 'dispatch');
    expect(next.fencingToken.epoch).toBe(first.fencingToken.epoch);
    expect(next.fencingToken.counter).toBeGreaterThan(first.fencingToken.counter);
    releaseExecutionLock(root, next.taskId, next.ownerId);
  });

  it('refuses mount adoption while a canonical execution is active', () => {
    const active = acquireExecutionLock(root, 'mount-adoption-active', 'dispatch');
    simulateExecutionAuthorityRemount(root);

    expect(() => adoptExecutionLockAuthorityMount(root, {
      apply: true,
      operatorId: 'operator-1',
      justification: 'must not adopt while active',
    })).toThrowError(expect.objectContaining({
      reason: 'project-active',
    }));
    const db = new Database(executionAuthorityDbPath(root), { readonly: true });
    expect(db.prepare(`
      SELECT owner_id
        FROM execution_lock_active
       WHERE task_id = ?
    `).get(active.taskId)).toEqual({ owner_id: active.ownerId });
    db.close();
    expect(existsSync(join(
      root,
      '.locks',
      EXECUTION_LOCK_MOUNT_ADOPTION_DIRECTORY,
    ))).toBe(false);
  });

  it('rejects a second authority bootstrap after the bound lock directory is replaced', () => {
    const lock = acquireExecutionLock(
      root,
      'directory-generation-split',
      'dispatch',
    );
    const locksDir = join(root, '.locks');
    const retiredLocksDir = join(root, '.locks-generation-retired');
    renameSync(locksDir, retiredLocksDir);
    mkdirSync(locksDir);

    expect(() => acquireExecutionLock(
      root,
      lock.taskId,
      'settlement',
    )).toThrowError(expect.objectContaining({
      reason: 'authority-epoch-mismatch',
    }));
    expect(() => acquireExecutionLock(
      root,
      'directory-generation-contender',
      'dispatch',
    )).toThrowError(expect.objectContaining({
      reason: 'authority-epoch-mismatch',
    }));
    expect(readdirSync(locksDir)).toEqual([]);
    expect(readFileSync(
      join(root, '.deckent-execution-lock-authority.anchor.json'),
      'utf8',
    )).toContain(lock.fencingToken.epoch);
    expect(() => adoptExecutionLockAuthorityMount(root, {
      apply: true,
      operatorId: 'operator-1',
      justification: 'directory replacement is not a remount',
    })).toThrowError(expect.objectContaining({
      reason: 'authority-state-missing',
    }));
  });

  it('rejects a second authority bootstrap after the bound project directory is replaced', () => {
    const lock = acquireExecutionLock(
      root,
      'project-generation-split',
      'dispatch',
    );
    const retiredRoot = `${root}-generation-retired`;
    renameSync(root, retiredRoot);
    mkdirSync(root);

    expect(() => acquireExecutionLock(
      root,
      'project-generation-contender',
      'dispatch',
    )).toThrowError(expect.objectContaining({
      reason: 'authority-epoch-mismatch',
    }));
    expect(existsSync(join(
      root,
      '.locks',
      EXECUTION_LOCK_COORDINATION_DB_FILENAME,
    ))).toBe(false);
    expect(existsSync(join(
      root,
      '.locks',
      EXECUTION_LOCK_AUTHORITY_SENTINEL_FILENAME,
    ))).toBe(false);

    rmSync(root, { recursive: true, force: true });
    renameSync(retiredRoot, root);
    releaseExecutionLock(root, lock.taskId, lock.ownerId);
  });

  it('surfaces a committed renewal when projection repair loses the lock-directory generation', () => {
    const lock = acquireExecutionLock(
      root,
      'renew-directory-generation-loss',
      'dispatch',
      { now: () => BASE_TIME },
    );
    const locksDir = join(root, '.locks');
    const retiredLocksDir = join(root, '.locks-renew-retired');
    let failure: unknown;
    try {
      renewExecutionLock(root, lock.taskId, lock.ownerId, {
        now: () => BASE_TIME + 10,
        projectionPublisher: () => {
          renameSync(locksDir, retiredLocksDir);
          mkdirSync(locksDir);
          throw new Error('injected directory-generation loss');
        },
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toEqual(expect.objectContaining({
      canonicalCommitState: 'committed',
      recoveryLock: expect.objectContaining({
        taskId: lock.taskId,
        ownerId: lock.ownerId,
        renewedAt: '2026-07-27T12:00:00.010Z',
      }),
    }));
    const retiredDb = new Database(join(
      retiredLocksDir,
      EXECUTION_LOCK_COORDINATION_DB_FILENAME,
    ), { readonly: true });
    expect(JSON.parse((retiredDb.prepare(`
      SELECT payload_json
        FROM execution_lock_active
       WHERE task_id = ?
    `).get(lock.taskId) as { payload_json: string }).payload_json))
      .toEqual(expect.objectContaining({
        renewedAt: '2026-07-27T12:00:00.010Z',
      }));
    retiredDb.close();
  });

  it('surfaces a committed renewal after exact projection reconciliation', () => {
    const lock = acquireExecutionLock(
      root,
      'renew-projection-reconciled',
      'dispatch',
      { now: () => BASE_TIME },
    );
    let failure: unknown;
    try {
      renewExecutionLock(root, lock.taskId, lock.ownerId, {
        now: () => BASE_TIME + 10,
        projectionPublisher: () => {
          throw new Error('injected projection publication failure');
        },
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toEqual(expect.objectContaining({
      reason: 'mutation-conflict',
      canonicalCommitState: 'committed',
      recoveryLock: expect.objectContaining({
        taskId: lock.taskId,
        ownerId: lock.ownerId,
        renewedAt: '2026-07-27T12:00:00.010Z',
      }),
    }));
    expect(checkExecutionLock(root, lock.taskId)).toEqual({
      state: 'held',
      lock: expect.objectContaining({
        taskId: lock.taskId,
        ownerId: lock.ownerId,
        renewedAt: '2026-07-27T12:00:00.010Z',
      }),
    });
  });

  it('rejects hardlinked DB, sentinel, and projection authority files', () => {
    const cases = ['database', 'sentinel', 'projection'] as const;
    for (const kind of cases) {
      const caseRoot = join(root, kind);
      mkdirSync(caseRoot);
      const lock = acquireExecutionLock(caseRoot, `hardlink-${kind}`, 'dispatch');
      if (kind !== 'projection') {
        releaseExecutionLock(caseRoot, lock.taskId, lock.ownerId);
      }
      const authorityPath = kind === 'database'
        ? join(
          caseRoot,
          '.locks',
          EXECUTION_LOCK_COORDINATION_DB_FILENAME,
        )
        : kind === 'sentinel'
          ? join(
            caseRoot,
            '.locks',
            EXECUTION_LOCK_AUTHORITY_SENTINEL_FILENAME,
          )
          : executionLockPath(caseRoot, lock.taskId);
      linkSync(authorityPath, join(caseRoot, `${kind}-alias`));

      expect(() => acquireExecutionLock(
        caseRoot,
        kind === 'projection'
          ? lock.taskId
          : `hardlink-${kind}-contender`,
        'dispatch',
      )).toThrowError(expect.objectContaining({ reason: 'malformed' }));
      expect(checkExecutionLock(caseRoot, lock.taskId)).toEqual(
        expect.objectContaining({
          state: 'malformed',
          reason: 'unsafe-entry',
        }),
      );
    }
  });

  it('burns the fence and compensates the exact DB owner on projection publish failure', () => {
    let failure: unknown;
    try {
      acquireExecutionLock(root, 'publish-compensation', 'dispatch', {
        projectionPublisher: () => {
          throw new Error('injected projection failure');
        },
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toEqual(expect.objectContaining({
      reason: 'mutation-conflict',
      recoveryLock: undefined,
    }));
    expect(checkExecutionLock(root, 'publish-compensation')).toEqual({
      state: 'absent',
    });

    const retry = acquireExecutionLock(root, 'publish-compensation', 'dispatch');
    expect(retry.fencingToken.counter).toBeGreaterThan(1);
  });

  it('never unlinks a successor projection after the compensated DB commit', () => {
    let successor: ExecutionLockInfo | undefined;
    let failure: unknown;
    try {
      acquireExecutionLock(
        root,
        'publish-compensation-successor',
        'dispatch',
        {
          projectionPublisher: () => {
            throw new Error('injected projection failure');
          },
          compensationCommitObserver: compensated => {
            successor = acquireExecutionLock(
              root,
              compensated.taskId,
              'settlement',
            );
          },
        },
      );
    } catch (error) {
      failure = error;
    }

    expect(failure).toEqual(expect.objectContaining({
      reason: 'mutation-conflict',
      recoveryLock: undefined,
    }));
    expect(successor).toBeDefined();
    expect(successor!.fencingToken.counter).toBeGreaterThan(1);
    expect(readLock(root, successor!.taskId)).toEqual(successor);
    expect(checkExecutionLock(root, successor!.taskId)).toEqual({
      state: 'held',
      lock: successor,
    });
  });

  it('reclaims an exact-owner crashed staging file only after owner death proof', () => {
    const first = acquireExecutionLock(root, 'staging-crash', 'dispatch', {
      leaseDurationMs: 100,
      now: () => BASE_TIME,
    });
    const stagingPath =
      `${executionLockPath(root, first.taskId)}.tmp-${first.ownerId}`;
    writeFileSync(stagingPath, '{"partial":', 'utf8');

    expect(() => acquireExecutionLock(root, first.taskId, 'settlement', {
      now: () => BASE_TIME + 101,
      livenessProbe: { inspect: () => 'alive' },
    })).toThrowError(expect.objectContaining({ reason: 'held' }));
    expect(readFileSync(stagingPath, 'utf8')).toBe('{"partial":');

    const recovered = acquireExecutionLock(root, first.taskId, 'settlement', {
      now: () => BASE_TIME + 101,
      livenessProbe: { inspect: () => 'dead' },
    });
    expect(recovered.fencingToken.epoch).toBe(first.fencingToken.epoch);
    expect(recovered.fencingToken.counter).toBeGreaterThan(
      first.fencingToken.counter,
    );
    expect(readdirSync(join(root, '.locks'))).not.toContain(
      `${createHash('sha256').update(first.taskId).digest('hex')}.executionlock.tmp-${first.ownerId}`,
    );
  });

  it('serializes mutations across processes with BEGIN IMMEDIATE', async () => {
    const seed = acquireExecutionLock(root, 'sqlite-seed', 'dispatch');
    releaseExecutionLock(root, seed.taskId, seed.ownerId);
    const dbPath = join(root, '.locks', 'execution-lock-authority.sqlite3');
    const readyPath = join(root, 'transaction-ready');
    const childCode = `
      const Database = require('better-sqlite3');
      const fs = require('node:fs');
      const db = new Database(${JSON.stringify(dbPath)});
      db.pragma('busy_timeout = 1000');
      db.exec('BEGIN IMMEDIATE');
      fs.writeFileSync(${JSON.stringify(readyPath)}, 'ready');
      setTimeout(() => {
        db.exec('COMMIT');
        db.close();
        process.exit(0);
      }, 750);
    `;
    const child = spawn(process.execPath, ['-e', childCode], {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    await waitForFile(readyPath);

    expect(() => acquireExecutionLock(root, 'cross-process', 'dispatch'))
      .toThrowError(expect.objectContaining({ reason: 'mutation-conflict' }));

    expect(await waitForChildExit(child)).toBe(0);
    const acquired = acquireExecutionLock(root, 'cross-process', 'dispatch');
    expect(acquired.taskId).toBe('cross-process');
  });

  it('provides project-wide maintenance admission and ownerPid authority', () => {
    const active = acquireExecutionLock(root, 'active-before-clean', 'dispatch');
    expect(() => acquireProjectMaintenanceLock(root)).toThrowError(
      expect.objectContaining({
        reason: 'project-active',
        conflictingOwnerId: active.ownerId,
      }),
    );
    releaseExecutionLock(root, active.taskId, active.ownerId);

    const maintenance = acquireProjectMaintenanceLock(root, {
      ownerPid: process.pid,
    });
    expect(maintenance).toMatchObject({
      taskId: PROJECT_MAINTENANCE_LOCK_TASK_ID,
      actor: 'maintenance',
      pid: process.pid,
    });
    expect(checkProjectMaintenanceLock(root)).toEqual({
      state: 'held',
      lock: maintenance,
    });
    expect(() => acquireExecutionLock(root, 'blocked-during-clean', 'dispatch'))
      .toThrowError(expect.objectContaining({
        reason: 'maintenance-held',
        conflictingOwnerId: maintenance.ownerId,
      }));
    expect(releaseExecutionLock(
      root,
      PROJECT_MAINTENANCE_LOCK_TASK_ID,
      maintenance.ownerId,
    )).toBe(true);
  });

  it('rejects a maintenance actor on a non-maintenance projection', () => {
    const lock = acquireExecutionLock(root, 'actor-pair-normal', 'dispatch');
    writeFileSync(
      executionLockPath(root, lock.taskId),
      JSON.stringify({ ...lock, actor: 'maintenance' }),
      'utf8',
    );

    expect(checkExecutionLock(root, lock.taskId)).toEqual(
      expect.objectContaining({
        state: 'malformed',
        reason: 'invalid-projection',
      }),
    );
  });

  it('rejects a non-maintenance actor on the maintenance projection', () => {
    const lock = acquireProjectMaintenanceLock(root);
    writeFileSync(
      executionLockPath(root, lock.taskId),
      JSON.stringify({ ...lock, actor: 'dispatch' }),
      'utf8',
    );

    expect(checkProjectMaintenanceLock(root)).toEqual(
      expect.objectContaining({
        state: 'malformed',
        reason: 'invalid-projection',
      }),
    );
  });

  it('returns typed foreign-host HOLD unless a distributed probe proves dead', () => {
    const ownerIdentity = {
      hostInstanceId: 'host-a',
      bootSessionId: 'boot-a',
      processSessionId: 'session-a',
    };
    const contenderIdentity = {
      hostInstanceId: 'host-b',
      bootSessionId: 'boot-b',
      processSessionId: 'session-b',
    };
    const first = acquireExecutionLock(root, 'foreign-task', 'dispatch', {
      leaseDurationMs: 100,
      now: () => BASE_TIME,
      runtimeIdentity: ownerIdentity,
    });

    expect(() => acquireExecutionLock(root, 'foreign-task', 'settlement', {
      now: () => BASE_TIME + 101,
      runtimeIdentity: contenderIdentity,
    })).toThrowError(expect.objectContaining({
      reason: 'foreign-host',
      conflictingOwnerId: first.ownerId,
    }));

    const recovered = acquireExecutionLock(root, 'foreign-task', 'settlement', {
      now: () => BASE_TIME + 101,
      runtimeIdentity: contenderIdentity,
      livenessProbe: { inspect: () => 'dead' },
    });
    expect(recovered.ownerId).not.toBe(first.ownerId);
  });

  it('fails closed when .locks is a symlink/junction', () => {
    const target = join(root, 'redirected-locks');
    mkdirSync(target);
    symlinkSync(target, join(root, '.locks'), process.platform === 'win32' ? 'junction' : 'dir');

    expect(() => acquireExecutionLock(root, 'unsafe-directory', 'dispatch'))
      .toThrowError(expect.objectContaining({ reason: 'malformed' }));
    expect(checkExecutionLock(root, 'unsafe-directory')).toEqual(
      expect.objectContaining({
        state: 'malformed',
        reason: 'unsafe-directory',
      }),
    );
  });

  it('fails closed on symlink and oversized projection entries', () => {
    const taskId = 'unsafe-projection';
    mkdirSync(join(root, '.locks'), { recursive: true });
    const target = join(root, 'projection-target.json');
    writeFileSync(target, '{}', 'utf8');
    symlinkSync(target, executionLockPath(root, taskId), 'file');

    expect(checkExecutionLock(root, taskId)).toEqual(expect.objectContaining({
      state: 'malformed',
      reason: 'unsafe-entry',
    }));
    expect(() => acquireExecutionLock(root, taskId, 'dispatch'))
      .toThrowError(expect.objectContaining({ reason: 'malformed' }));

    rmSync(executionLockPath(root, taskId));
    writeFileSync(
      executionLockPath(root, taskId),
      'x'.repeat(16_385),
      'utf8',
    );
    expect(checkExecutionLock(root, taskId)).toEqual(expect.objectContaining({
      state: 'malformed',
    }));
  });

  it('preserves a completed value as typed uncertainty when quarantine persistence is unreadable', async () => {
    let observed: unknown;
    const value = await withExecutionLock(
      root,
      'completed-quarantine',
      'dispatch',
      lock => {
        writeFileSync(
          `${executionLockPath(root, 'completed-quarantine')}.tmp-${lock.ownerId}`,
          'fault',
          'utf8',
        );
        return 'committed';
      },
      { onOutcome: outcome => { observed = outcome; } },
    );

    expect(value).toBe('committed');
    expect(observed).toEqual(expect.objectContaining({
      status: 'completed',
      authority: 'uncertain',
      value: 'committed',
      fault: expect.objectContaining({ phase: 'release' }),
      evidenceRefs: expect.arrayContaining(['recovery:exact-lock-handle']),
    }));
    expect(checkExecutionLock(root, 'completed-quarantine').state).toBe('malformed');
  });

  it('aborts cooperatively and reports uncertainty when heartbeat quarantine cannot persist', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    let signalWasAborted = false;
    const running = withExecutionLockOutcome(
      root,
      'heartbeat-quarantine',
      'dispatch',
      async context => {
        writeFileSync(
          `${executionLockPath(root, 'heartbeat-quarantine')}.tmp-${context.lock.ownerId}`,
          'fault',
          'utf8',
        );
        await new Promise<void>(resolve => setTimeout(resolve, 25));
        signalWasAborted = context.signal.aborted;
        return 'committed';
      },
      { leaseDurationMs: 100, heartbeatIntervalMs: 20 },
    );

    await vi.advanceTimersByTimeAsync(25);
    await expect(running).resolves.toEqual(expect.objectContaining({
      status: 'completed',
      authority: 'uncertain',
      value: 'committed',
      fault: expect.objectContaining({ phase: 'heartbeat' }),
      evidenceRefs: expect.arrayContaining(['recovery:exact-lock-handle']),
    }));
    expect(signalWasAborted).toBe(true);
    expect(checkExecutionLock(root, 'heartbeat-quarantine').state).toBe('malformed');
  });

  it('labels a completed outcome quarantined only after exact durable re-read', async () => {
    let boundaryId = '';
    const outcome = await withExecutionLockOutcome(
      root,
      'durable-outcome-quarantine',
      'dispatch',
      context => {
        boundaryId = beginExecutionLockIrreversibleBoundary(
          root,
          context.lock,
          { evidenceRefs: ['operation:irreversible'] },
        ).quarantineId;
        return 'committed';
      },
    );

    expect(outcome).toEqual(expect.objectContaining({
      status: 'completed',
      authority: 'quarantined',
      value: 'committed',
      quarantine: expect.objectContaining({
        quarantineId: boundaryId,
        state: 'quarantined',
        reason: 'release-fault',
      }),
    }));
    expect(checkExecutionLock(root, 'durable-outcome-quarantine'))
      .toEqual(expect.objectContaining({
        state: 'quarantined',
        quarantine: expect.objectContaining({ quarantineId: boundaryId }),
      }));
  });

  it('heartbeats a long operation and releases the lock after natural completion', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    let observedRenewedAt: string | undefined;

    const running = withExecutionLock(
      root,
      'heartbeat-task',
      'dispatch',
      async () => {
        await new Promise<void>(resolve => setTimeout(resolve, 65));
        const state = checkExecutionLock(root, 'heartbeat-task');
        if (state.state === 'held') observedRenewedAt = state.lock.renewedAt;
        return 'completed';
      },
      {
        leaseDurationMs: 100,
        heartbeatIntervalMs: 20,
      },
    );

    await vi.advanceTimersByTimeAsync(65);
    await expect(running).resolves.toBe('completed');
    expect(Date.parse(observedRenewedAt!)).toBeGreaterThanOrEqual(BASE_TIME + 60);
    expect(checkExecutionLock(root, 'heartbeat-task')).toEqual({ state: 'absent' });
  });

  it('exposes the renewed live lock handle to the protected operation', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    let initialRenewedAt = '';
    let liveRenewedAt = '';
    const running = withExecutionLockOutcome(
      root,
      'heartbeat-live-handle',
      'dispatch',
      async context => {
        initialRenewedAt = context.lock.renewedAt;
        await new Promise<void>(resolve => setTimeout(resolve, 25));
        liveRenewedAt = context.lock.renewedAt;
        context.assertAuthority();
        return 'completed';
      },
      {
        leaseDurationMs: 100,
        heartbeatIntervalMs: 20,
      },
    );

    await vi.advanceTimersByTimeAsync(25);
    await expect(running).resolves.toEqual(expect.objectContaining({
      status: 'completed',
      authority: 'released',
      value: 'completed',
    }));
    expect(initialRenewedAt).toBe('2026-07-27T12:00:00.000Z');
    expect(liveRenewedAt).toBe('2026-07-27T12:00:00.020Z');
  });

  it('releases its generation when the protected operation throws', async () => {
    await expect(withExecutionLock(
      root,
      'operation-failure',
      'settlement',
      () => {
        throw new Error('operation failed');
      },
    )).rejects.toThrow('operation failed');

    expect(checkExecutionLock(root, 'operation-failure')).toEqual({ state: 'absent' });
  });

  it('validates task, lease, and heartbeat inputs before publishing authority', async () => {
    expect(() => acquireExecutionLock(root, '', 'dispatch')).toThrowError(
      expect.objectContaining({ reason: 'invalid-input' }),
    );
    expect(() => acquireExecutionLock(root, 'bad-lease', 'dispatch', {
      leaseDurationMs: 0,
    })).toThrowError(expect.objectContaining({ reason: 'invalid-input' }));
    expect(() => acquireExecutionLock(
      root,
      'x'.repeat(MAX_EXECUTION_LOCK_TASK_ID_BYTES + 1),
      'dispatch',
    )).toThrowError(expect.objectContaining({ reason: 'invalid-input' }));
    expect(() => acquireExecutionLock(root, 'oversized-lease', 'dispatch', {
      leaseDurationMs: MAX_EXECUTION_LOCK_LEASE_MS + 1,
    })).toThrowError(expect.objectContaining({ reason: 'invalid-input' }));
    expect(() => acquireExecutionLock(root, 'clock-overflow', 'dispatch', {
      now: () => 8_640_000_000_000_000,
      leaseDurationMs: 1,
    })).toThrowError(expect.objectContaining({ reason: 'invalid-input' }));
    await expect(withExecutionLock(
      root,
      'bad-heartbeat',
      'dispatch',
      () => undefined,
      { leaseDurationMs: 100, heartbeatIntervalMs: 100 },
    )).rejects.toThrowError(expect.objectContaining({ reason: 'invalid-input' }));
    expect(checkExecutionLock(root, 'bad-heartbeat')).toEqual({ state: 'absent' });
  });
});
