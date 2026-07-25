import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteMissionStore } from '../../../../src/orchestra/autonomous/mission-store/sqlite-mission-store.js';
import Database from 'better-sqlite3';

const dirs: string[] = [];
function sandbox(): string { const d = mkdtempSync(join(tmpdir(), 'mstore-')); dirs.push(d); return d; }
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe('SqliteMissionStore — schema', () => {
  it('migrate() creates mission, work-item, and approval-outbox tables (idempotent)', () => {
    const store = new SqliteMissionStore(sandbox());
    store.migrate();
    store.migrate(); // idempotent — must not throw
    const tables = store.__rawTableNames();
    expect(tables).toContain('missions');
    expect(tables).toContain('work_items');
    expect(tables).toContain('work_item_admission_fences');
    expect(tables).toContain('work_item_approvals');
    expect(tables).toContain('mission_engine_lease');
    expect(tables).toContain('mission_dispatch_recoveries');
    expect(tables).toContain('mission_dispatch_recovery_acknowledgements');
    expect(tables).toContain('mission_graph_authorities');
    expect(tables).toContain('work_item_dependencies');
    expect(tables).toContain('work_item_dependency_readiness');
    expect(tables).toContain('mission_dependency_reconcile_queue');
    expect(tables).toContain('mission_graph_migration_evidence');
    store.close();
  });

  it('keeps normalized dependency authority default-off and requires an explicit composition reference', () => {
    const root = sandbox();
    expect(() => new SqliteMissionStore(root, { dependencyAuthorityMode: 'normalized-v1' }))
      .toThrow('MISSION_DEPENDENCY_AUTHORITY_REF_REQUIRED');

    const legacy = new SqliteMissionStore(root);
    legacy.migrate();
    legacy.createMission({ id: 'legacy-default', kind: 'list', title: 'legacy' });
    expect(legacy.getDependencyAuthority('legacy-default')).toBeNull();
    legacy.close();

    const normalized = new SqliteMissionStore(sandbox(), {
      dependencyAuthorityMode: 'normalized-v1',
      dependencyAuthorityRef: 'owner-decision:m4-108',
    });
    normalized.migrate();
    normalized.createMission({ id: 'normalized-explicit', kind: 'list', title: 'normalized' });
    expect(normalized.getDependencyAuthority('normalized-explicit')).toMatchObject({
      schemaVersion: 1,
      missionId: 'normalized-explicit',
      state: 'active',
      sourceKind: 'new-v1',
      activationRef: 'owner-decision:m4-108',
    });
    normalized.close();
  });

  it('creates a normalized mission batch atomically without JSON dependency authority', () => {
    const store = new SqliteMissionStore(sandbox(), {
      dependencyAuthorityMode: 'normalized-v1',
      dependencyAuthorityRef: 'owner-decision:m4-108',
    });
    store.migrate();
    store.createMissionWithItems(
      { id: 'normalized-batch', kind: 'list', title: 'normalized batch' },
      [
        {
          id: 'child',
          missionId: 'normalized-batch',
          kind: 'task',
          dependsOn: ['root'],
        },
        {
          id: 'root',
          missionId: 'normalized-batch',
          kind: 'task',
        },
      ],
    );

    expect(store.__rawGet(`SELECT COUNT(*) AS count FROM work_items
      WHERE mission_id='normalized-batch' AND depends_on IS NOT NULL`)).toEqual({ count: 0 });
    expect(store.__rawGet(`SELECT COUNT(*) AS count FROM work_item_dependencies
      WHERE mission_id='normalized-batch'`)).toEqual({ count: 1 });
    expect(store.listItems('normalized-batch').find((item) => item.id === 'child')!.dependsOn)
      .toEqual(['root']);
    expect(store.queryDue().map((item) => item.id)).toEqual(['root']);

    expect(() => store.createMissionWithItems(
      { id: 'normalized-cycle', kind: 'list', title: 'invalid cycle' },
      [
        { id: 'cycle-a', missionId: 'normalized-cycle', kind: 'task', dependsOn: ['cycle-b'] },
        { id: 'cycle-b', missionId: 'normalized-cycle', kind: 'task', dependsOn: ['cycle-a'] },
      ],
    )).toThrow('MISSION_BATCH_INVALID: dependency cycle');
    expect(store.getMission('normalized-cycle')).toBeNull();
    expect(store.__rawGet(`SELECT COUNT(*) AS count FROM work_item_dependencies
      WHERE mission_id='normalized-cycle'`)).toEqual({ count: 0 });
    store.close();
  });

  it('additively upgrades a pre-fence work_items table without deleting rows', () => {
    const root = sandbox();
    const dir = join(root, '.deckent', 'autonomous');
    mkdirSync(dir, { recursive: true });
    const legacy = new Database(join(dir, 'autonomous.db'));
    legacy.exec(`
      CREATE TABLE missions (id TEXT PRIMARY KEY, kind TEXT NOT NULL, status TEXT NOT NULL,
        tenant TEXT NOT NULL, title TEXT NOT NULL, spec TEXT, created_by TEXT, deliver_to TEXT,
        render_as TEXT NOT NULL, progress TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        completed_at TEXT, last_result TEXT);
      CREATE TABLE work_items (id TEXT PRIMARY KEY, mission_id TEXT NOT NULL REFERENCES missions(id),
        kind TEXT NOT NULL, status TEXT NOT NULL, spec TEXT, policy TEXT NOT NULL DEFAULT 'auto',
        render_as TEXT NOT NULL, progress TEXT, depends_on TEXT, trigger TEXT, claimed_at TEXT,
        claimed_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_result TEXT);
      INSERT INTO missions(id,kind,status,tenant,title,render_as,created_at,updated_at)
        VALUES('legacy','list','pending','local','legacy','checklist','t','t');
      INSERT INTO work_items(id,mission_id,kind,status,render_as,policy,created_at,updated_at)
        VALUES('legacy-task','legacy','task','pending','task','auto','t','t');
    `);
    legacy.close();

    const store = new SqliteMissionStore(root);
    store.migrate();
    const columns = store.__rawGet(`SELECT group_concat(name, ',') AS names FROM pragma_table_info('work_items')`);
    expect(columns.names).toContain('revision');
    expect(columns.names).toContain('claim_registry_revision');
    expect(columns.names).toContain('claim_registry_digest');
    expect(columns.names).toContain('claim_attempt_id');
    expect(columns.names).toContain('claim_fence_token_hash');
    expect(store.__rawGet("SELECT id,revision FROM work_items WHERE id='legacy-task'"))
      .toEqual({ id: 'legacy-task', revision: 0 });
    expect(store.__rawTableNames()).toContain('work_item_admission_fences');
    expect(store.getDependencyAuthority('legacy')).toBeNull();
    store.close();
  });

  it('prepares but never activates a valid legacy graph without an exact digest-bound decision', () => {
    const store = new SqliteMissionStore(sandbox());
    store.migrate();
    store.createMission({ id: 'migration', kind: 'list', title: 'migration' });
    store.enqueueItem({ id: 'upstream', missionId: 'migration', kind: 'task' });
    store.enqueueItem({
      id: 'downstream',
      missionId: 'migration',
      kind: 'task',
      dependsOn: ['upstream'],
    });

    const prepared = store.prepareNormalizedDependencyMigration('migration');
    expect(prepared).toMatchObject({
      state: 'migration-pending',
      sourceKind: 'legacy-json-v1',
      activationRef: null,
    });
    expect(prepared.graphDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(store.queryDue()).toEqual([]);
    expect(store.__rawGet(`SELECT COUNT(*) AS count FROM work_item_dependencies
      WHERE mission_id='migration'`)).toEqual({ count: 1 });

    expect(() => store.activateNormalizedDependencyAuthority({
      schemaVersion: 1,
      missionId: 'migration',
      expectedGraphDigest: '0'.repeat(64),
      approvedBy: 'owner',
      approvalRef: 'owner-decision:m4-108-activation',
      approvedAt: '2026-07-25T08:00:00.000Z',
    })).toThrow('MISSION_DEPENDENCY_ACTIVATION_DIGEST_MISMATCH');
    expect(store.getDependencyAuthority('migration')!.state).toBe('migration-pending');

    const active = store.activateNormalizedDependencyAuthority({
      schemaVersion: 1,
      missionId: 'migration',
      expectedGraphDigest: prepared.graphDigest,
      approvedBy: 'owner',
      approvalRef: 'owner-decision:m4-108-activation',
      approvedAt: '2026-07-25T08:00:00.000Z',
    });
    expect(active).toMatchObject({
      state: 'active',
      graphDigest: prepared.graphDigest,
      activationRef: 'owner-decision:m4-108-activation',
    });
    expect(store.queryDue().map((item) => item.id)).toEqual(['upstream']);
    store.close();
  });

  it('quarantines malformed legacy dependency evidence without partial activation', () => {
    const store = new SqliteMissionStore(sandbox());
    store.migrate();
    store.createMission({ id: 'corrupt-graph', kind: 'list', title: 'corrupt' });
    store.enqueueItem({ id: 'corrupt-item', missionId: 'corrupt-graph', kind: 'task' });
    store.__rawExec(`UPDATE work_items SET depends_on='{"not":"an-array"}'
      WHERE id='corrupt-item'`);

    const authority = store.prepareNormalizedDependencyMigration('corrupt-graph');
    expect(authority).toMatchObject({
      state: 'quarantined',
      sourceKind: 'legacy-json-v1',
    });
    expect(authority.quarantineReason).toContain('non-string dependency list');
    expect(store.queryDue()).toEqual([]);
    expect(store.__rawGet(`SELECT COUNT(*) AS count FROM work_item_dependencies
      WHERE mission_id='corrupt-graph'`)).toEqual({ count: 0 });
    expect(() => store.activateNormalizedDependencyAuthority({
      schemaVersion: 1,
      missionId: 'corrupt-graph',
      expectedGraphDigest: authority.graphDigest,
      approvedBy: 'owner',
      approvalRef: 'owner-decision:invalid',
      approvedAt: '2026-07-25T08:00:00.000Z',
    })).toThrow('MISSION_DEPENDENCY_ACTIVATION_QUARANTINED');
    store.close();
  });

  it('validates reconciliation bounds before mutating legacy runtime admission state', () => {
    const store = new SqliteMissionStore(sandbox());
    store.migrate();
    store.createMission({ id: 'invalid-bounds', kind: 'list', title: 'invalid bounds' });
    store.enqueueItem({ id: 'unsupported-before-reconcile', missionId: 'invalid-bounds', kind: 'task' });
    store.__rawExec(`UPDATE work_items SET kind='unsupported-kind'
      WHERE id='unsupported-before-reconcile'`);

    expect(() => store.reconcilePendingDependencies({ maxEdges: 1, maxEdgesPerJob: 2 }))
      .toThrow('MISSION_DEPENDENCY_RECONCILE_BOUNDS_INVALID');
    expect(store.__rawGet(`SELECT status FROM work_items
      WHERE id='unsupported-before-reconcile'`)).toEqual({ status: 'pending' });
    store.close();
  });

  it('recover() parks orphaned running work_items with reconciliation evidence', () => {
    const root = sandbox();
    const store = new SqliteMissionStore(root);
    store.migrate();
    store.__rawExec("INSERT INTO missions(id,kind,status,tenant,title,render_as,created_at,updated_at) VALUES('m1','goal','active','local','t','goal','t','t')");
    store.__rawExec("INSERT INTO work_items(id,mission_id,kind,status,render_as,policy,created_at,updated_at) VALUES('w1','m1','task','running','task','auto','t','t')");
    const lease = store.acquireEngineLease('schema-recovery', 30_000)!;
    store.recover(lease);
    const row = store.__rawGet("SELECT status,last_result FROM work_items WHERE id='w1'");
    expect(row.status).toBe('parked');
    expect(JSON.parse(row.last_result).reason).toContain('RECOVERY_RECONCILIATION_REQUIRED');
    store.close();
  });

  it('enforces mission foreign keys on direct work-item writes', () => {
    const store = new SqliteMissionStore(sandbox());
    store.migrate();
    expect(() => store.__rawExec("INSERT INTO work_items(id,mission_id,kind,status,render_as,policy,created_at,updated_at) VALUES('orphan','missing','task','pending','task','auto','t','t')"))
      .toThrow(/FOREIGN KEY constraint failed/i);
    store.close();
  });
});
