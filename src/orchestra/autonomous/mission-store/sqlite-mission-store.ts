import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DECKENT_DIR } from '../../../core/constants.js';
import type {
  MissionStore, Mission, NewMission, MissionStatus, Progress, ResultLike,
  WorkItem, NewWorkItem, WorkItemStatus,
} from './mission-types.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS missions (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, status TEXT NOT NULL,
  tenant TEXT NOT NULL, title TEXT NOT NULL, spec TEXT,
  created_by TEXT, deliver_to TEXT, render_as TEXT NOT NULL, progress TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT, last_result TEXT );
CREATE TABLE IF NOT EXISTS work_items (
  id TEXT PRIMARY KEY, mission_id TEXT NOT NULL REFERENCES missions(id), kind TEXT NOT NULL,
  status TEXT NOT NULL, spec TEXT, policy TEXT NOT NULL DEFAULT 'auto', render_as TEXT NOT NULL,
  progress TEXT, depends_on TEXT, trigger TEXT, claimed_at TEXT, claimed_by TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_result TEXT );
CREATE INDEX IF NOT EXISTS idx_wi_mission_status ON work_items(mission_id, status);
CREATE INDEX IF NOT EXISTS idx_wi_status ON work_items(status);
CREATE INDEX IF NOT EXISTS idx_m_status_tenant ON missions(status, tenant);
`;

/** Durable mission store (SQLite WAL) — the autonomous-v2 single source of truth. */
export class SqliteMissionStore implements MissionStore {
  protected db: DatabaseType;
  constructor(projectRoot: string) {
    const dir = join(projectRoot, DECKENT_DIR, 'autonomous');
    mkdirSync(dir, { recursive: true });
    this.db = new Database(join(dir, 'autonomous.db'));
    this.db.pragma('journal_mode = WAL');
  }
  migrate(): void { this.db.exec(SCHEMA); }
  recover(): void {
    this.db.prepare("UPDATE work_items SET status='pending', claimed_at=NULL, claimed_by=NULL WHERE status='running'").run();
  }
  close(): void { this.db.close(); }

  private now(): string { return new Date().toISOString(); }
  private j(v: unknown): string | null { return v === undefined || v === null ? null : JSON.stringify(v); }
  private p<T>(s: unknown): T | null { return typeof s === 'string' && s.length ? JSON.parse(s) as T : null; }

  // --- Missions CRUD ---
  private rowToMission = (r: any): Mission => ({
    id: r.id, kind: r.kind, status: r.status, tenant: r.tenant, title: r.title,
    spec: this.p(r.spec), createdBy: r.created_by, deliverTo: r.deliver_to, renderAs: r.render_as,
    progress: this.p<Progress>(r.progress), createdAt: r.created_at, updatedAt: r.updated_at,
    completedAt: r.completed_at, lastResult: this.p<ResultLike>(r.last_result),
  });

  createMission(m: NewMission): Mission {
    const ts = this.now();
    this.db.prepare(`INSERT INTO missions(id,kind,status,tenant,title,spec,created_by,deliver_to,render_as,progress,created_at,updated_at)
      VALUES(@id,@kind,'pending',@tenant,@title,@spec,@createdBy,@deliverTo,@renderAs,@progress,@ts,@ts)`).run({
      id: m.id, kind: m.kind, tenant: m.tenant ?? 'local', title: m.title, spec: this.j(m.spec),
      createdBy: m.createdBy ?? null, deliverTo: m.deliverTo ?? null,
      renderAs: m.renderAs ?? (m.kind === 'list' ? 'checklist' : 'goal'),
      progress: this.j(m.progress), ts,
    });
    return this.getMission(m.id)!;
  }
  getMission(id: string): Mission | null {
    const r = this.db.prepare('SELECT * FROM missions WHERE id=?').get(id);
    return r ? this.rowToMission(r) : null;
  }
  listMissions(f?: { status?: MissionStatus[]; tenant?: string }): Mission[] {
    const where: string[] = []; const args: unknown[] = [];
    if (f?.status?.length) { where.push(`status IN (${f.status.map(() => '?').join(',')})`); args.push(...f.status); }
    if (f?.tenant) { where.push('tenant=?'); args.push(f.tenant); }
    const sql = `SELECT * FROM missions ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at`;
    return (this.db.prepare(sql).all(...args) as any[]).map(this.rowToMission);
  }
  updateMissionStatus(id: string, status: MissionStatus, result?: ResultLike): void {
    const ts = this.now();
    const completedAt = status === 'completed' || status === 'failed' || status === 'cancelled' ? ts : null;
    this.db.prepare(`UPDATE missions SET status=@status, updated_at=@ts,
      completed_at=COALESCE(@completedAt, completed_at), last_result=COALESCE(@result, last_result) WHERE id=@id`)
      .run({ id, status, ts, completedAt, result: result ? JSON.stringify(result) : null });
  }
  setMissionProgress(id: string, progress: Progress): void {
    this.db.prepare('UPDATE missions SET progress=?, updated_at=? WHERE id=?').run(JSON.stringify(progress), this.now(), id);
  }

  // --- Work-items + atomic claim ---
  private rowToItem = (r: any): WorkItem => ({
    id: r.id, missionId: r.mission_id, kind: r.kind, status: r.status, spec: this.p(r.spec),
    policy: r.policy, renderAs: r.render_as, progress: this.p<Progress>(r.progress),
    dependsOn: this.p<string[]>(r.depends_on) ?? [], trigger: this.p(r.trigger),
    claimedAt: r.claimed_at, claimedBy: r.claimed_by, createdAt: r.created_at, updatedAt: r.updated_at,
    lastResult: this.p<ResultLike>(r.last_result),
  });
  private defaultRenderAs(kind: NewWorkItem['kind']): WorkItem['renderAs'] {
    return kind === 'sprint' ? 'sprint' : kind === 'process' ? 'workflow' : kind === 'capability' ? 'action' : 'task';
  }

  enqueueItem(item: NewWorkItem): WorkItem {
    const ts = this.now();
    this.db.prepare(`INSERT INTO work_items(id,mission_id,kind,status,spec,policy,render_as,depends_on,trigger,created_at,updated_at)
      VALUES(@id,@missionId,@kind,'pending',@spec,@policy,@renderAs,@dependsOn,@trigger,@ts,@ts)
      ON CONFLICT(id) DO NOTHING`).run({
      id: item.id, missionId: item.missionId, kind: item.kind, spec: this.j(item.spec),
      policy: item.policy ?? 'auto', renderAs: item.renderAs ?? this.defaultRenderAs(item.kind),
      dependsOn: this.j(item.dependsOn ?? []), trigger: this.j(item.trigger ?? null), ts,
    });
    return this.rowToItem(this.db.prepare('SELECT * FROM work_items WHERE id=?').get(item.id));
  }
  queryDue(opts?: { tenant?: string; limit?: number }): WorkItem[] {
    // pending items whose mission matches the optional tenant, ordered by creation.
    const args: unknown[] = [];
    let sql = `SELECT wi.* FROM work_items wi JOIN missions m ON m.id = wi.mission_id WHERE wi.status='pending'`;
    if (opts?.tenant) { sql += ' AND m.tenant=?'; args.push(opts.tenant); }
    sql += ' ORDER BY wi.created_at';
    if (opts?.limit && opts.limit > 0) { sql += ' LIMIT ?'; args.push(opts.limit); }
    return (this.db.prepare(sql).all(...args) as any[]).map(this.rowToItem);
  }
  claimItem(id: string, by: string): boolean {
    const info = this.db.prepare(`UPDATE work_items SET status='running', claimed_at=@ts, claimed_by=@by, updated_at=@ts
      WHERE id=@id AND status='pending'`).run({ id, by, ts: this.now() });
    return info.changes === 1;
  }
  updateItemStatus(id: string, status: WorkItemStatus, result?: ResultLike): void {
    this.db.prepare('UPDATE work_items SET status=?, last_result=COALESCE(?, last_result), updated_at=? WHERE id=?')
      .run(status, result ? JSON.stringify(result) : null, this.now(), id);
  }
  listItems(missionId: string): WorkItem[] {
    return (this.db.prepare('SELECT * FROM work_items WHERE mission_id=? ORDER BY created_at').all(missionId) as any[]).map(this.rowToItem);
  }

  // Test-only raw helpers (prefixed __ — not part of the public MissionStore surface).
  __rawTableNames(): string[] {
    return (this.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map(r => r.name);
  }
  __rawExec(sql: string): void { this.db.exec(sql); }
  __rawGet(sql: string): any { return this.db.prepare(sql).get(); }
}
