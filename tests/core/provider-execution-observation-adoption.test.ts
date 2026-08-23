import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';

const filesystemSeam = vi.hoisted(() => ({
  privateRoot: '',
  readsBeforeHook: 0,
  afterRead: undefined as (() => void) | undefined,
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    mkdtempSync: (prefix: string, options?: Parameters<typeof actual.mkdtempSync>[1]) => {
      if (filesystemSeam.privateRoot !== '' && prefix.includes('deckent-observation-adoption-')) {
        return actual.mkdtempSync(join(filesystemSeam.privateRoot, 'private-snapshot-'), options);
      }
      return actual.mkdtempSync(prefix, options);
    },
    readSync: (...args: Parameters<typeof actual.readSync>) => {
      const result = actual.readSync(...args);
      const hook = filesystemSeam.afterRead;
      if (hook && filesystemSeam.readsBeforeHook > 0) {
        filesystemSeam.readsBeforeHook -= 1;
      } else if (hook) {
        filesystemSeam.afterRead = undefined;
        hook();
      }
      return result;
    },
  };
});

import {
  inspectProviderExecutionObservationAdoption,
  planProviderExecutionObservationAdoption,
  ProviderExecutionObservationAdoptionError,
  verifyProviderExecutionObservationAdoption,
} from '../../src/core/provider-execution-observation-adoption.js';

const roots: string[] = [];

afterEach(() => {
  filesystemSeam.privateRoot = '';
  filesystemSeam.readsBeforeHook = 0;
  filesystemSeam.afterRead = undefined;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

interface LegacyRow {
  readonly executionId: string;
  readonly taskId: string;
  readonly attemptId: string;
  readonly principalDigest: string;
  readonly fence: string;
  readonly startJson: string;
  readonly endJson: string | null;
  readonly startSequence: number;
  readonly endSequence: number | null;
}

function legacyRow(index: number): LegacyRow {
  const executionId = `legacy-${String(index).padStart(3, '0')}`;
  return {
    executionId,
    taskId: `private-task-${index}`,
    attemptId: `private-attempt-${index}`,
    principalDigest: `private-principal-${index}`,
    fence: `private-fence-${index}`,
    startJson: ` { "type" : "start", "executionId" : "${executionId}", "sequence" : ${index * 2 + 1} } `,
    endJson: index % 2 === 0
      ? `\n{"sequence":${index * 2 + 2},"executionId":"${executionId}","type":"end"}\t`
      : null,
    startSequence: index * 2 + 1,
    endSequence: index % 2 === 0 ? index * 2 + 2 : null,
  };
}

function createSchema(db: Database.Database, version: 1 | 2, primaryKey = true): void {
  db.exec(`CREATE TABLE provider_execution_intervals (
    execution_id TEXT ${primaryKey ? 'PRIMARY KEY' : 'NOT NULL'},
    task_id TEXT NOT NULL, attempt_id TEXT NOT NULL, principal_digest TEXT NOT NULL,
    fence TEXT NOT NULL, start_json TEXT NOT NULL, end_json TEXT,
    start_sequence INTEGER NOT NULL, end_sequence INTEGER${version === 2
      ? ', run_id TEXT, retired INTEGER NOT NULL DEFAULT 0' : ''});
    CREATE TABLE provider_execution_contradictions (
      contradiction_id INTEGER PRIMARY KEY AUTOINCREMENT,
      principal_digest TEXT NOT NULL, payload_json TEXT NOT NULL);
    PRAGMA user_version = ${version};`);
}

function insertLegacy(db: Database.Database, row: LegacyRow, ownership?: {
  readonly runId: string | null;
  readonly retired: 0 | 1;
}): void {
  const suffix = ownership ? ', run_id, retired' : '';
  const placeholders = ownership ? '?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?' : '?, ?, ?, ?, ?, ?, ?, ?, ?';
  db.prepare(`INSERT INTO provider_execution_intervals
    (execution_id, task_id, attempt_id, principal_digest, fence, start_json, end_json,
      start_sequence, end_sequence${suffix}) VALUES (${placeholders})`).run(
    row.executionId, row.taskId, row.attemptId, row.principalDigest, row.fence,
    row.startJson, row.endJson, row.startSequence, row.endSequence,
    ...(ownership ? [ownership.runId, ownership.retired] : []),
  );
}

function fixture(options: { readonly count?: number; readonly targetPrimaryKey?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'deckent-observation-adoption-'));
  roots.push(root);
  const sourcePath = join(root, 'v1.db');
  const targetPath = join(root, 'v2.db');
  const source = new Database(sourcePath);
  const target = new Database(targetPath);
  createSchema(source, 1);
  createSchema(target, 2, options.targetPrimaryKey ?? true);
  const rows = Array.from({ length: options.count ?? 43 }, (_, index) => legacyRow(index));
  for (const row of rows) {
    insertLegacy(source, row);
    insertLegacy(target, row, { runId: null, retired: 0 });
  }
  source.prepare('INSERT INTO provider_execution_contradictions (principal_digest, payload_json) VALUES (?, ?)')
    .run('private-contradiction-principal', ' {"reason":"legacy byte evidence"} ');
  target.prepare('INSERT INTO provider_execution_contradictions (principal_digest, payload_json) VALUES (?, ?)')
    .run('private-contradiction-principal', ' {"reason":"legacy byte evidence"} ');
  insertLegacy(target, {
    ...legacyRow(900), executionId: 'owned-open', taskId: 'owned-task', principalDigest: 'owned-principal',
  }, { runId: 'run-open', retired: 0 });
  insertLegacy(target, {
    ...legacyRow(901), executionId: 'owned-retired', taskId: 'owned-task', principalDigest: 'owned-principal',
  }, { runId: 'run-retired', retired: 1 });
  source.close();
  target.close();
  return { paths: { v1PreimagePath: sourcePath, currentDatabasePath: targetPath }, rows };
}

function expectCode(action: () => unknown, code: string): void {
  expect(action).toThrowError(expect.objectContaining<Partial<ProviderExecutionObservationAdoptionError>>({ code }));
}

function stableMetadata(path: string) {
  const value = statSync(path, { bigint: true });
  return {
    dev: value.dev, ino: value.ino, mode: value.mode, uid: value.uid, gid: value.gid,
    size: value.size, mtimeNs: value.mtimeNs, ctimeNs: value.ctimeNs,
  };
}

describe('provider execution observation adoption proof', () => {
  it('proves all 43 legacy rows byte-exactly, separates extra owned rows, and never writes either database', () => {
    const { paths } = fixture();
    const sourceBefore = {
      bytes: readFileSync(paths.v1PreimagePath), metadata: stableMetadata(paths.v1PreimagePath),
    };
    const targetBefore = {
      bytes: readFileSync(paths.currentDatabasePath), metadata: stableMetadata(paths.currentDatabasePath),
    };
    expect([`${paths.v1PreimagePath}-wal`, `${paths.currentDatabasePath}-wal`].map(existsSync))
      .toEqual([false, false]);

    const inspection = inspectProviderExecutionObservationAdoption(paths, { pageSize: 7, maxRows: 100 });

    expect(inspection).toMatchObject({ sourceRowCount: 44, adoptedLegacyRowCount: 44 });
    expect(inspection.sourceRowLineageDigest).toBe(inspection.adoptedLegacyRowLineageDigest);
    expect(inspection.extraRunOwnedRows).toEqual([
      { executionId: 'owned-open', runId: 'run-open', retired: false },
      { executionId: 'owned-retired', runId: 'run-retired', retired: true },
    ]);
    expect({
      bytes: readFileSync(paths.v1PreimagePath), metadata: stableMetadata(paths.v1PreimagePath),
    }).toEqual(sourceBefore);
    expect({
      bytes: readFileSync(paths.currentDatabasePath), metadata: stableMetadata(paths.currentDatabasePath),
    }).toEqual(targetBefore);
    expect([`${paths.v1PreimagePath}-wal`, `${paths.currentDatabasePath}-wal`].map(existsSync))
      .toEqual([false, false]);
  });

  it.each([
    ['missing row', (db: Database.Database) => db.prepare('DELETE FROM provider_execution_intervals WHERE execution_id = ?').run('legacy-010'), 'MISSING_LEGACY_ROW'],
    ['changed start JSON bytes', (db: Database.Database) => db.prepare('UPDATE provider_execution_intervals SET start_json = ? WHERE execution_id = ?').run('{"semantically":"different"}', 'legacy-010'), 'LEGACY_ROW_MISMATCH'],
    ['changed end JSON bytes', (db: Database.Database) => db.prepare('UPDATE provider_execution_intervals SET end_json = end_json || ? WHERE execution_id = ?').run(' ', 'legacy-010'), 'LEGACY_ROW_MISMATCH'],
    ['owned legacy row', (db: Database.Database) => db.prepare('UPDATE provider_execution_intervals SET run_id = ? WHERE execution_id = ?').run('run-corrupt', 'legacy-010'), 'LEGACY_ROW_MISMATCH'],
    ['retired legacy row', (db: Database.Database) => db.prepare('UPDATE provider_execution_intervals SET retired = 1 WHERE execution_id = ?').run('legacy-010'), 'LEGACY_ROW_MISMATCH'],
  ] as const)('fails closed for %s', (_label, corrupt, code) => {
    const { paths } = fixture();
    const db = new Database(paths.currentDatabasePath);
    corrupt(db);
    db.close();
    expectCode(() => inspectProviderExecutionObservationAdoption(paths), code);
  });

  it('rejects a duplicate-capable identity schema before byte-identical rows can reach Map construction', () => {
    const { paths, rows } = fixture({ targetPrimaryKey: false });
    const db = new Database(paths.currentDatabasePath);
    db.prepare('DELETE FROM provider_execution_intervals WHERE execution_id = ?').run(rows[10]!.executionId);
    insertLegacy(db, rows[10]!, { runId: null, retired: 0 });
    insertLegacy(db, rows[10]!, { runId: null, retired: 0 });
    db.close();
    expectCode(() => inspectProviderExecutionObservationAdoption(paths), 'SCHEMA_MISMATCH');
  });

  it.each([
    ['nullable task identity', 'task_id TEXT', 'task_id TEXT NOT NULL'],
    ['wrong start sequence affinity', 'start_sequence TEXT NOT NULL', 'start_sequence INTEGER NOT NULL'],
    ['nullable retired marker', 'retired INTEGER DEFAULT 0', 'retired INTEGER NOT NULL DEFAULT 0'],
    ['wrong retired default', 'retired INTEGER NOT NULL DEFAULT 1', 'retired INTEGER NOT NULL DEFAULT 0'],
  ] as const)('rejects malformed required column properties: %s', (_label, replacement, canonicalDefinition) => {
    const { paths } = fixture();
    const db = new Database(paths.currentDatabasePath);
    const sql = (db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
      .pluck().get('provider_execution_intervals') as string).replace(canonicalDefinition, replacement);
    db.exec(`ALTER TABLE provider_execution_intervals RENAME TO malformed_intervals; ${sql};
      INSERT INTO provider_execution_intervals SELECT * FROM malformed_intervals;
      DROP TABLE malformed_intervals;`);
    db.close();
    expectCode(() => inspectProviderExecutionObservationAdoption(paths), 'SCHEMA_MISMATCH');
  });

  it('accepts the canonical fresh-v2 column order as well as migrated-v2 fixtures', () => {
    const { paths } = fixture({ count: 1 });
    const db = new Database(paths.currentDatabasePath);
    db.exec(`ALTER TABLE provider_execution_intervals RENAME TO migrated_intervals;
      CREATE TABLE provider_execution_intervals (
        execution_id TEXT PRIMARY KEY, run_id TEXT, task_id TEXT NOT NULL,
        attempt_id TEXT NOT NULL, principal_digest TEXT NOT NULL, fence TEXT NOT NULL,
        start_json TEXT NOT NULL, end_json TEXT, start_sequence INTEGER NOT NULL,
        end_sequence INTEGER, retired INTEGER NOT NULL DEFAULT 0);
      INSERT INTO provider_execution_intervals
        (execution_id, run_id, task_id, attempt_id, principal_digest, fence, start_json,
          end_json, start_sequence, end_sequence, retired)
        SELECT execution_id, run_id, task_id, attempt_id, principal_digest, fence, start_json,
          end_json, start_sequence, end_sequence, retired FROM migrated_intervals;
      DROP TABLE migrated_intervals;`);
    db.close();
    expect(inspectProviderExecutionObservationAdoption(paths)).toMatchObject({
      sourceRowCount: 2,
      adoptedLegacyRowCount: 2,
    });
  });

  it('rejects unowned extra rows and unsupported or structurally wrong schemas', () => {
    const unowned = fixture();
    const unownedDb = new Database(unowned.paths.currentDatabasePath);
    unownedDb.prepare('UPDATE provider_execution_intervals SET run_id = NULL WHERE execution_id = ?').run('owned-open');
    unownedDb.close();
    expectCode(() => inspectProviderExecutionObservationAdoption(unowned.paths), 'UNOWNED_EXTRA_ROW');

    const wrongVersion = fixture();
    const versionDb = new Database(wrongVersion.paths.currentDatabasePath);
    versionDb.pragma('user_version = 9');
    versionDb.close();
    expectCode(() => inspectProviderExecutionObservationAdoption(wrongVersion.paths), 'UNSUPPORTED_SCHEMA');

    const wrongShape = fixture();
    const shapeDb = new Database(wrongShape.paths.currentDatabasePath);
    shapeDb.exec('ALTER TABLE provider_execution_contradictions ADD COLUMN unexpected TEXT');
    shapeDb.close();
    expectCode(() => inspectProviderExecutionObservationAdoption(wrongShape.paths), 'SCHEMA_MISMATCH');
  });

  it('rejects a tampered plan digest and any database change after planning', () => {
    const { paths } = fixture();
    const inspection = inspectProviderExecutionObservationAdoption(paths);
    const plan = planProviderExecutionObservationAdoption({
      paths, inspection, clock: { now: () => new Date('2026-08-22T01:00:00.000Z') },
      ids: { nextId: () => 'adoption-1' },
    });
    expectCode(() => verifyProviderExecutionObservationAdoption({
      plan: { ...plan, planDigest: '0'.repeat(64) },
      clock: { now: () => new Date('2026-08-22T02:00:00.000Z') }, ids: { nextId: () => 'receipt-1' },
    }), 'CONCURRENT_CHANGE');

    const db = new Database(paths.currentDatabasePath);
    db.prepare('UPDATE provider_execution_intervals SET start_json = start_json || ? WHERE execution_id = ?')
      .run(' ', 'owned-open');
    db.close();
    expectCode(() => verifyProviderExecutionObservationAdoption({
      plan, clock: { now: () => new Date('2026-08-22T02:00:00.000Z') },
      ids: { nextId: () => 'receipt-1' },
    }), 'CONCURRENT_CHANGE');
  });

  it('returns a replay-stable, verifier-produced receipt without leaking legacy identities or mutating files', () => {
    const { paths } = fixture();
    const inspection = inspectProviderExecutionObservationAdoption(paths);
    const plan = planProviderExecutionObservationAdoption({
      paths, inspection, clock: { now: () => new Date('2026-08-22T01:00:00.000Z') },
      ids: { nextId: () => 'adoption-stable' },
    });
    const before = [readFileSync(paths.v1PreimagePath), readFileSync(paths.currentDatabasePath)] as const;
    const verify = () => verifyProviderExecutionObservationAdoption({
      plan, clock: { now: () => new Date('2026-08-22T02:00:00.000Z') },
      ids: { nextId: () => 'receipt-stable' }, bounds: { pageSize: 5, maxRows: 100 },
    });
    const first = verify();
    expect(verify()).toEqual(first);
    expect(first.databaseMutation).toBe('none');
    expect(first.receiptDigest).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.stringify(first)).not.toMatch(/private-(?:task|attempt|principal|fence)/u);
    expect(readFileSync(paths.v1PreimagePath)).toEqual(before[0]);
    expect(readFileSync(paths.currentDatabasePath)).toEqual(before[1]);
  });

  it('scans a multi-page large store within its bound and fails closed immediately above it', () => {
    const { paths } = fixture({ count: 257 });
    expect(inspectProviderExecutionObservationAdoption(paths, { pageSize: 17, maxRows: 260 }))
      .toMatchObject({ sourceRowCount: 258, adoptedLegacyRowCount: 258 });
    expectCode(
      () => inspectProviderExecutionObservationAdoption(paths, { pageSize: 17, maxRows: 257 }),
      'ROW_LIMIT_EXCEEDED',
    );
  }, 30_000);

  it('leaves pre-existing empty WAL and non-empty SHM sidecars byte- and metadata-stable', () => {
    const { paths } = fixture({ count: 2 });
    const sidecars = [
      `${paths.v1PreimagePath}-wal`, `${paths.v1PreimagePath}-shm`,
      `${paths.currentDatabasePath}-wal`, `${paths.currentDatabasePath}-shm`,
    ];
    writeFileSync(sidecars[0]!, Buffer.alloc(0));
    writeFileSync(sidecars[1]!, Buffer.from('source-shm-evidence'));
    writeFileSync(sidecars[2]!, Buffer.alloc(0));
    writeFileSync(sidecars[3]!, Buffer.from('target-shm-evidence'));
    for (const path of sidecars) chmodSync(path, 0o640);
    const before = sidecars.map(path => ({ bytes: readFileSync(path), metadata: stableMetadata(path) }));

    expect(inspectProviderExecutionObservationAdoption(paths)).toMatchObject({ sourceRowCount: 3 });

    expect(sidecars.map(path => ({ bytes: readFileSync(path), metadata: stableMetadata(path) }))).toEqual(before);
  });

  it.each(['v1PreimagePath', 'currentDatabasePath'] as const)(
    'rejects a non-empty WAL for %s without cleaning source-side evidence',
    (pathKey) => {
      const { paths } = fixture({ count: 1 });
      const walPath = `${paths[pathKey]}-wal`;
      const evidence = Buffer.from('uncheckpointed-wal-evidence');
      writeFileSync(walPath, evidence);
      const before = stableMetadata(walPath);
      expectCode(() => inspectProviderExecutionObservationAdoption(paths), 'CONCURRENT_CHANGE');
      expect(readFileSync(walPath)).toEqual(evidence);
      expect(stableMetadata(walPath)).toEqual(before);
    },
  );

  it('keeps the complete source tree stable and removes every private snapshot on success and failure', () => {
    const { paths } = fixture({ count: 3 });
    const root = join(paths.v1PreimagePath, '..');
    const privateRoot = join(root, 'hermetic-private-root');
    writeFileSync(join(root, 'unrelated evidence.txt'), 'do-not-clean');
    writeFileSync(`${paths.v1PreimagePath}-shm`, 'sidecar');
    writeFileSync(`${paths.currentDatabasePath}-wal`, Buffer.alloc(0));
    const sourceEntries = readdirSync(root).sort();
    const before = new Map(sourceEntries.map(name => {
      const path = join(root, name);
      return [name, { bytes: readFileSync(path), metadata: stableMetadata(path) }];
    }));
    mkdirSync(privateRoot);
    filesystemSeam.privateRoot = privateRoot;

    inspectProviderExecutionObservationAdoption(paths);
    expect(readdirSync(privateRoot)).toEqual([]);
    expect(readdirSync(root).filter(name => name !== 'hermetic-private-root').sort()).toEqual(sourceEntries);
    for (const [name, state] of before) {
      expect({ bytes: readFileSync(join(root, name)), metadata: stableMetadata(join(root, name)) }).toEqual(state);
    }

    writeFileSync(`${paths.v1PreimagePath}-wal`, 'reject-me');
    expectCode(() => inspectProviderExecutionObservationAdoption(paths), 'CONCURRENT_CHANGE');
    expect(readdirSync(privateRoot)).toEqual([]);

    rmSync(`${paths.v1PreimagePath}-wal`);
    const malformed = new Database(paths.currentDatabasePath);
    malformed.pragma('user_version = 9');
    malformed.close();
    expectCode(() => inspectProviderExecutionObservationAdoption(paths), 'UNSUPPORTED_SCHEMA');
    expect(readdirSync(privateRoot)).toEqual([]);
  });

  it.each(['v1PreimagePath', 'currentDatabasePath'] as const)(
    'deterministically rejects a descriptor-pinned main-file change for %s',
    (pathKey) => {
    const { paths } = fixture({ count: 80 });
    const before = readFileSync(paths[pathKey]);
    if (pathKey === 'currentDatabasePath') {
      const sourceSize = statSync(paths.v1PreimagePath).size;
      filesystemSeam.readsBeforeHook = Math.ceil(sourceSize / (64 * 1024)) * 2;
    }
    filesystemSeam.afterRead = () => {
      const changed = Buffer.from(before);
      changed[changed.length - 1] = changed[changed.length - 1]! ^ 1;
      writeFileSync(paths[pathKey], changed);
    };

    expectCode(() => inspectProviderExecutionObservationAdoption(paths), 'CONCURRENT_CHANGE');
    expect(readFileSync(paths[pathKey])).not.toEqual(before);
    },
  );

  it.each([
    'space safe.db',
    'unicode-évidence.db',
    'brackets (portable) [1].db',
  ])('handles portable Linux/macOS/Windows-safe filename %s without path-derived artifacts', (filename) => {
    const { paths } = fixture({ count: 1 });
    const renamedSource = join(paths.v1PreimagePath, '..', filename);
    renameSync(paths.v1PreimagePath, renamedSource);
    expect(inspectProviderExecutionObservationAdoption({ ...paths, v1PreimagePath: renamedSource }))
      .toMatchObject({ sourceRowCount: 2 });
  });

  it.each(['v1PreimagePath', 'currentDatabasePath'] as const)(
    'rejects a database symlink for %s without replacing it',
    (pathKey) => {
      const databaseLink = fixture({ count: 1 });
      const linkedPath = join(databaseLink.paths.v1PreimagePath, '..', `linked-${pathKey}.db`);
      symlinkSync(databaseLink.paths[pathKey], linkedPath);
      expectCode(() => inspectProviderExecutionObservationAdoption({
        ...databaseLink.paths, [pathKey]: linkedPath,
      }), 'SYMLINK_PATH');
      expect(lstatSync(linkedPath).isSymbolicLink()).toBe(true);
    },
  );

  it.each(['v1PreimagePath', 'currentDatabasePath'] as const)(
    'rejects a WAL symlink for %s without replacing it',
    (pathKey) => {
      const walLink = fixture({ count: 1 });
      const walTarget = join(walLink.paths.v1PreimagePath, '..', `wal-evidence-${pathKey}`);
      writeFileSync(walTarget, 'evidence');
      symlinkSync(walTarget, `${walLink.paths[pathKey]}-wal`);
      expectCode(() => inspectProviderExecutionObservationAdoption(walLink.paths), 'SYMLINK_PATH');
      expect(lstatSync(`${walLink.paths[pathKey]}-wal`).isSymbolicLink()).toBe(true);
    },
  );

  it('enforces the byte bound before SQLite opens', () => {
    const bounded = fixture({ count: 30 });
    const exactSize = statSync(bounded.paths.v1PreimagePath).size;
    expect(inspectProviderExecutionObservationAdoption(bounded.paths, { maxDatabaseBytes: exactSize }))
      .toMatchObject({ sourceRowCount: 31 });
    expectCode(() => inspectProviderExecutionObservationAdoption(
      bounded.paths, { maxDatabaseBytes: exactSize - 1 },
    ), 'ROW_LIMIT_EXCEEDED');
  });
});
