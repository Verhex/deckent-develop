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
