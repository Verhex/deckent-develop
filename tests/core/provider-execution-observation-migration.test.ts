import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import {
  applyProviderExecutionObservationMigration,
  inspectProviderExecutionObservationMigration,
  planProviderExecutionObservationMigration,
  safeProviderExecutionObservationProjectPath,
  validateProviderExecutionObservationMigrationAuthority,
  type ProviderExecutionObservationMigrationAuthority,
  type ProviderExecutionObservationMigrationClock,
  type ProviderExecutionObservationMigrationIds,
  type ProviderExecutionObservationMigrationPlan,
} from '../../src/core/provider-execution-observation-migration.js';

const NOW = new Date('2026-08-22T12:00:00.000Z');
const clock: ProviderExecutionObservationMigrationClock = { now: () => new Date(NOW) };

describe('provider execution observation migration authority', () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  function fixture(options: { rows?: number; conflictingIndex?: boolean } = {}) {
    const root = mkdtempSync(join(tmpdir(), 'deckent-observation-migration-'));
    roots.push(root);
    const relativeDatabasePath = 'observations.db';
    const path = safeProviderExecutionObservationProjectPath(root, relativeDatabasePath);
    const db = new Database(path.databasePath);
    db.exec(`
      CREATE TABLE provider_execution_intervals (
        execution_id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        attempt_id TEXT NOT NULL,
        principal_digest TEXT NOT NULL,
        fence TEXT NOT NULL,
        start_json TEXT NOT NULL,
        end_json TEXT,
        start_sequence INTEGER NOT NULL,
        end_sequence INTEGER
      );
      CREATE TABLE provider_execution_contradictions (
        contradiction_id INTEGER PRIMARY KEY AUTOINCREMENT,
        principal_digest TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );
      PRAGMA user_version = 1;
    `);
    const rowCount = options.rows ?? 40;
    const insertInterval = db.prepare(`INSERT INTO provider_execution_intervals
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (let index = 0; index < rowCount; index += 1) {
      const executionId = `execution-${String(index).padStart(3, '0')}`;
      const start = JSON.stringify({ type: 'start', executionId, marker: index });
      const end = index % 2 === 0 ? JSON.stringify({ type: 'end', executionId, marker: index }) : null;
      insertInterval.run(executionId, `task-${index % 5}`, `attempt-${index}`, `principal-${index % 3}`,
        `fence-${index}`, start, end, index * 2 + 1, end === null ? null : index * 2 + 2);
    }
    const insertContradiction = db.prepare(
      'INSERT INTO provider_execution_contradictions (principal_digest, payload_json) VALUES (?, ?)',
    );
    for (let index = 0; index < 3; index += 1) {
      insertContradiction.run(`principal-${index}`, JSON.stringify({ contradiction: index }));
    }
    if (options.conflictingIndex) {
      db.exec('CREATE INDEX idx_provider_execution_run_scope ON provider_execution_intervals (task_id)');
    }
    db.close();
    return path;
  }

  function snapshot(databasePath: string) {
    const db = new Database(databasePath, { readonly: true, fileMustExist: true });
    try {
      return {
        version: db.pragma('user_version', { simple: true }),
        intervals: db.prepare('SELECT * FROM provider_execution_intervals ORDER BY execution_id').all(),
        contradictions: db.prepare('SELECT * FROM provider_execution_contradictions ORDER BY contradiction_id').all(),
        columns: db.pragma('table_info(provider_execution_intervals)'),
        indexes: db.pragma('index_list(provider_execution_intervals)'),
      };
    } finally { db.close(); }
  }

  function ids(...values: string[]): ProviderExecutionObservationMigrationIds {
    let cursor = 0;
    return { nextId: () => values[cursor++] ?? `unused-${cursor}` };
  }

  function plan(path: ReturnType<typeof fixture>, migrationId = 'migration-1') {
    const inspection = inspectProviderExecutionObservationMigration(path, { pageSize: 7 });
    return planProviderExecutionObservationMigration({ projectPath: path, inspection, clock, ids: ids(migrationId) });
  }

  function allow(value: ProviderExecutionObservationMigrationPlan): ProviderExecutionObservationMigrationAuthority {
    return {
      decision: 'allow', authorityId: 'authority-1', migrationId: value.migrationId,
      planDigest: value.planDigest, projectRoot: value.projectPath.projectRoot,
      relativeDatabasePath: value.projectPath.relativeDatabasePath,
      sourceSchemaDigest: value.sourceSchemaDigest,
      sourceRowLineageDigest: value.sourceRowLineageDigest,
      expiresAt: '2026-08-22T13:00:00.000Z',
    };
  }

  it('durably backs up and applies v1 while preserving the exact 43-row lineage and target index', () => {
    const path = fixture();
    const before = snapshot(path.databasePath);
    const migrationPlan = plan(path);
    expect(migrationPlan.sourceRowCount).toBe(43);

    const result = applyProviderExecutionObservationMigration({
      plan: migrationPlan, authority: allow(migrationPlan), clock, ids: ids('receipt-1'), bounds: { pageSize: 5 },
    });
    expect(result.state).toBe('applied');
    if (result.state !== 'applied') throw new Error('unreachable');

    const after = snapshot(path.databasePath);
    const backup = snapshot(result.backupPath);
    expect(after.version).toBe(2);
    expect(after.intervals.map(({ run_id: _runId, retired: _retired, ...row }) => row)).toEqual(before.intervals);
    expect(after.intervals.every(row => (row as { run_id: null }).run_id === null
      && (row as { retired: number }).retired === 0)).toBe(true);
    expect(after.contradictions).toEqual(before.contradictions);
    expect(backup).toEqual(before);
    expect(after.columns).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'run_id', type: 'TEXT' }),
      expect.objectContaining({ name: 'retired', type: 'INTEGER', notnull: 1, dflt_value: '0' }),
    ]));
    expect(after.indexes).toContainEqual(expect.objectContaining({ name: 'idx_provider_execution_run_scope' }));
    expect(result.receipt).toMatchObject({ rowCount: 43, targetRowLineageDigest: migrationPlan.sourceRowLineageDigest });
    expect(JSON.parse(readFileSync(result.receiptPath, 'utf8'))).toEqual(result.receipt);
    expect(result.receipt.backupDigest).toBe(createHash('sha256').update(readFileSync(result.backupPath)).digest('hex'));
    expect(lstatSync(result.backupPath).isFile()).toBe(true);
  });

  it('rejects absent, denied, expired, mismatched, and tampered authority before filesystem mutation', () => {
    const cases = ['absent', 'denied', 'expired', 'mismatch', 'tampered'] as const;
    for (const kind of cases) {
      const path = fixture({ rows: 1 });
      const migrationPlan = plan(path, `migration-${kind}`);
      const bytes = readFileSync(path.databasePath);
      let authority: ProviderExecutionObservationMigrationAuthority | undefined = allow(migrationPlan);
      let candidate = migrationPlan;
      if (kind === 'absent') authority = undefined;
      if (kind === 'denied') authority = { decision: 'deny', authorityId: 'authority-1' };
      if (kind === 'expired' && authority?.decision === 'allow') authority = { ...authority, expiresAt: NOW.toISOString() };
      if (kind === 'mismatch' && authority?.decision === 'allow') authority = { ...authority, migrationId: 'other' };
      if (kind === 'tampered') candidate = { ...migrationPlan, sourceRowCount: migrationPlan.sourceRowCount + 1 };
      expect(() => applyProviderExecutionObservationMigration({ plan: candidate, authority, clock, ids: ids('receipt') }))
        .toThrowError(expect.objectContaining({ code: kind === 'absent' ? 'AUTHORITY_REQUIRED'
          : kind === 'denied' ? 'AUTHORITY_DENIED' : kind === 'expired' ? 'AUTHORITY_EXPIRED' : 'AUTHORITY_MISMATCH' }));
      expect(readFileSync(path.databasePath)).toEqual(bytes);
      expect(existsSync(`${path.databasePath}.migration-${migrationPlan.migrationId}.bak`)).toBe(false);
    }
  });

  it('detects source tamper and first-writer-wins without overwriting either migrator evidence', () => {
    const path = fixture({ rows: 2 });
    const first = plan(path, 'first');
    const second = plan(path, 'second');
    const db = new Database(path.databasePath);
    db.prepare('UPDATE provider_execution_intervals SET fence = ? WHERE execution_id = ?').run('changed', 'execution-000');
    db.close();
    expect(() => applyProviderExecutionObservationMigration({ plan: first, authority: allow(first), clock, ids: ids('r1') }))
      .toThrowError(expect.objectContaining({ code: 'CONCURRENT_CHANGE' }));

    const fresh = plan(path, 'winner');
    const won = applyProviderExecutionObservationMigration({ plan: fresh, authority: allow(fresh), clock, ids: ids('winner-receipt') });
    expect(won.state).toBe('applied');
    expect(() => applyProviderExecutionObservationMigration({ plan: second, authority: allow(second), clock, ids: ids('loser-receipt') }))
      .toThrowError(expect.objectContaining({ code: 'CONCURRENT_CHANGE' }));
    expect(existsSync(`${path.databasePath}.migration-second.bak`)).toBe(false);
    if (won.state === 'applied') expect(readFileSync(won.receiptPath, 'utf8')).toContain('winner-receipt');
  });

  it('retains verified backup and rolls back the transaction when apply fails after backup', () => {
    const path = fixture({ rows: 2, conflictingIndex: true });
    const migrationPlan = plan(path, 'rollback');
    const before = snapshot(path.databasePath);
    expect(() => applyProviderExecutionObservationMigration({
      plan: migrationPlan, authority: allow(migrationPlan), clock, ids: ids('receipt'),
    })).toThrowError(expect.objectContaining({ code: 'APPLY_FAILED' }));
    expect(snapshot(path.databasePath)).toEqual(before);
    expect(snapshot(`${path.databasePath}.migration-rollback.bak`)).toEqual(before);
    expect(existsSync(`${path.databasePath}.migration-rollback.receipt.json`)).toBe(false);
  });

  it('models a receipt-window crash, then safely replays as already current without assigning legacy ownership', () => {
    const path = fixture({ rows: 2 });
    const migrationPlan = plan(path, 'crash-window');
    expect(() => applyProviderExecutionObservationMigration({
      plan: migrationPlan, authority: allow(migrationPlan), clock, ids: ids('../invalid-receipt'),
    })).toThrowError();
    const current = inspectProviderExecutionObservationMigration(path);
    expect(current).toMatchObject({ state: 'current', rowCount: 5, rowLineageDigest: migrationPlan.sourceRowLineageDigest });
    const replayPlan = planProviderExecutionObservationMigration({ projectPath: path, inspection: current, clock, ids: ids('replay') });
    const replay = applyProviderExecutionObservationMigration({ plan: replayPlan, authority: allow(replayPlan), clock, ids: ids('unused') });
    expect(replay).toMatchObject({ state: 'already-current' });
    const rows = snapshot(path.databasePath).intervals as Array<{ run_id: string | null; retired: number }>;
    expect(rows.every(row => row.run_id === null && row.retired === 0)).toBe(true);
  });

  it('rejects path escape, database symlinks, row/byte overruns, and invalid platform adapters', () => {
    const path = fixture({ rows: 8 });
    expect(() => safeProviderExecutionObservationProjectPath(path.projectRoot, '../outside.db'))
      .toThrowError(expect.objectContaining({ code: 'PATH_ESCAPE' }));
    const link = join(path.projectRoot, 'linked.db');
    symlinkSync(path.databasePath, link);
    expect(readlinkSync(link)).toBe(path.databasePath);
    expect(() => inspectProviderExecutionObservationMigration(
      safeProviderExecutionObservationProjectPath(path.projectRoot, 'linked.db'),
    )).toThrowError(expect.objectContaining({ code: 'SYMLINK_PATH' }));
    expect(() => inspectProviderExecutionObservationMigration(path, { maxRows: 10, pageSize: 2 }))
      .toThrowError(expect.objectContaining({ code: 'ROW_LIMIT_EXCEEDED' }));
    expect(() => inspectProviderExecutionObservationMigration(path, { maxDatabaseBytes: 1 }))
      .toThrowError(expect.objectContaining({ code: 'ROW_LIMIT_EXCEEDED' }));
    const inspection = inspectProviderExecutionObservationMigration(path, { maxRows: 11, pageSize: 1 });
    expect(inspection.rowCount).toBe(11);
    expect(() => planProviderExecutionObservationMigration({
      projectPath: path, inspection, clock: { now: () => new Date(Number.NaN) }, ids: ids('valid-id'),
    })).toThrowError(TypeError);
    expect(() => planProviderExecutionObservationMigration({
      projectPath: path, inspection, clock, ids: ids('../invalid-id'),
    })).toThrowError(TypeError);
    const validPlan = planProviderExecutionObservationMigration({ projectPath: path, inspection, clock, ids: ids('valid-id') });
    expect(() => validateProviderExecutionObservationMigrationAuthority(validPlan, allow(validPlan), NOW)).not.toThrow();
  });
});
