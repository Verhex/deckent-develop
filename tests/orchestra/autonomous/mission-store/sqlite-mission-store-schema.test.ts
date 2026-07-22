import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteMissionStore } from '../../../../src/orchestra/autonomous/mission-store/sqlite-mission-store.js';

const dirs: string[] = [];
function sandbox(): string { const d = mkdtempSync(join(tmpdir(), 'mstore-')); dirs.push(d); return d; }
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe('SqliteMissionStore — schema', () => {
  it('migrate() creates missions + work_items tables (idempotent)', () => {
    const store = new SqliteMissionStore(sandbox());
    store.migrate();
    store.migrate(); // idempotent — must not throw
    const tables = store.__rawTableNames();
    expect(tables).toContain('missions');
    expect(tables).toContain('work_items');
    store.close();
  });

  it('recover() parks orphaned running work_items with reconciliation evidence', () => {
    const root = sandbox();
    const store = new SqliteMissionStore(root);
    store.migrate();
    store.__rawExec("INSERT INTO missions(id,kind,status,tenant,title,render_as,created_at,updated_at) VALUES('m1','goal','active','local','t','goal','t','t')");
    store.__rawExec("INSERT INTO work_items(id,mission_id,kind,status,render_as,policy,created_at,updated_at) VALUES('w1','m1','task','running','task','auto','t','t')");
    store.recover();
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
