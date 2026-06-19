# Autonomous v2 — MissionStore Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the durable `MissionStore` module (SQLite-WAL `autonomous.db` + per-mission jsonl hot-path) with the Mission/WorkItem model, atomic claim, `MissionView` projection, and a backlog.json→db migration — as a standalone, fully-tested module that does NOT touch the live `backlog.json` consumers yet.

**Architecture:** A new isolated module `src/orchestra/autonomous/mission-store/`. `SqliteMissionStore` implements the `MissionStore` interface against a dedicated `.deckent/autonomous/autonomous.db` (better-sqlite3, WAL — mirrors `src/core/doc-tracking/store.ts`). High-frequency events go to per-mission `.deckent/autonomous/events/<id>.jsonl`. `SqliteMissionViewProvider` projects state for clients. A migration reads the legacy `backlog.json`. The live autonomous loop is UNCHANGED in this plan (the 213 existing tests stay green trivially); wiring the scheduler onto `MissionStore` is a later sub-project.

**Tech Stack:** TypeScript (ESM, Node16 — `.js` import suffixes), `better-sqlite3` (^12.10.0, already a dep), vitest.

## Global Constraints

- **ESM/Node16:** every relative import ends in `.js`.
- **Additive only:** create the new module; do NOT modify `src/orchestra/autonomous/backlog.ts` or any live consumer. The 213 existing autonomous tests must stay green untouched.
- **No new runtime dependency:** use `better-sqlite3` (already a dep). Import as `import Database from 'better-sqlite3';` + `import type { Database as DatabaseType } from 'better-sqlite3';` (mirror `src/core/doc-tracking/store.ts`).
- **SQLite pattern:** WAL mode (`db.pragma('journal_mode = WAL')`); `CREATE TABLE IF NOT EXISTS` (idempotent `migrate()`); `db.prepare(...).run/get/all()`. Synchronous (better-sqlite3) — keep queries single-row + indexed.
- **Hermetic tests:** all DBs/files under `os.tmpdir()`, cleaned in `afterEach`; no gitignored state; no `spawnSync`.
- **Atomic claim is the concurrency keystone:** `claimItem` MUST be a single `UPDATE ... WHERE status='pending'` returning `changes === 1` — never a read-then-write.
- **Paths:** `DECKENT_DIR = '.deckent'` (from `../../core/constants.js`). DB = `<root>/.deckent/autonomous/autonomous.db`; events = `<root>/.deckent/autonomous/events/<missionId>.jsonl`.
- `tsc --noEmit` clean.

---

### Task 1: Types + SqliteMissionStore skeleton (schema, migrate, recover)

**Files:**
- Create: `src/orchestra/autonomous/mission-store/mission-types.ts`
- Create: `src/orchestra/autonomous/mission-store/sqlite-mission-store.ts`
- Test: `tests/orchestra/autonomous/mission-store/sqlite-mission-store-schema.test.ts`

**Interfaces:**
- Produces: all v2 types + the `MissionStore` interface (Task 2/3 implement methods); `SqliteMissionStore` class with `migrate()`, `recover()`.

- [ ] **Step 1: Write the failing test**

```typescript
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

  it('recover() resets orphaned running work_items to pending', () => {
    const root = sandbox();
    const store = new SqliteMissionStore(root);
    store.migrate();
    store.__rawExec("INSERT INTO missions(id,kind,status,tenant,title,render_as,created_at,updated_at) VALUES('m1','goal','active','local','t','goal','t','t')");
    store.__rawExec("INSERT INTO work_items(id,mission_id,kind,status,render_as,policy,created_at,updated_at) VALUES('w1','m1','task','running','task','auto','t','t')");
    store.recover();
    expect(store.__rawGet("SELECT status FROM work_items WHERE id='w1'").status).toBe('pending');
    store.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/orchestra/autonomous/mission-store/sqlite-mission-store-schema.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `mission-types.ts`**

```typescript
// Autonomous v2 — durable mission/work-item model + store/view contracts.
export type MissionKind = 'list' | 'goal';
export type MissionStatus = 'pending' | 'active' | 'completed' | 'failed' | 'cancelled';
export type MissionRenderAs = 'checklist' | 'goal';

export type WorkItemKind = 'task' | 'sprint' | 'capability' | 'process';
export type WorkItemStatus = 'pending' | 'running' | 'done' | 'failed' | 'parked';
export type WorkItemRenderAs = 'task' | 'sprint' | 'workflow' | 'action';
export type WorkItemPolicy = 'auto' | 'approval-required' | 'risk-tagged';

export interface Progress { done: number; total: number; phase?: string; step?: string; }
export interface ResultLike { ok: boolean; reason?: string; [k: string]: unknown; }

export interface Mission {
  id: string; kind: MissionKind; status: MissionStatus; tenant: string;
  title: string; spec: Record<string, unknown> | null;
  createdBy: string | null; deliverTo: string | null; renderAs: MissionRenderAs;
  progress: Progress | null;
  createdAt: string; updatedAt: string; completedAt: string | null;
  lastResult: ResultLike | null;
}
export interface NewMission {
  id: string; kind: MissionKind; tenant?: string; title: string;
  spec?: Record<string, unknown>; createdBy?: string; deliverTo?: string;
  renderAs?: MissionRenderAs; progress?: Progress;
}
export interface WorkItem {
  id: string; missionId: string; kind: WorkItemKind; status: WorkItemStatus;
  spec: Record<string, unknown> | null; policy: WorkItemPolicy; renderAs: WorkItemRenderAs;
  progress: Progress | null; dependsOn: string[]; trigger: Record<string, unknown> | null;
  claimedAt: string | null; claimedBy: string | null;
  createdAt: string; updatedAt: string; lastResult: ResultLike | null;
}
export interface NewWorkItem {
  id: string; missionId: string; kind: WorkItemKind; spec?: Record<string, unknown>;
  policy?: WorkItemPolicy; renderAs?: WorkItemRenderAs; dependsOn?: string[];
  trigger?: Record<string, unknown>;
}
export interface MissionEvent { ts: string; workItemId?: string; type: string; data?: unknown; }

export interface MissionStore {
  migrate(): void;
  recover(): void;
  close(): void;
  createMission(m: NewMission): Mission;
  getMission(id: string): Mission | null;
  listMissions(f?: { status?: MissionStatus[]; tenant?: string }): Mission[];
  updateMissionStatus(id: string, status: MissionStatus, result?: ResultLike): void;
  setMissionProgress(id: string, progress: Progress): void;
  enqueueItem(item: NewWorkItem): WorkItem;
  queryDue(opts?: { tenant?: string; limit?: number }): WorkItem[];
  claimItem(id: string, by: string): boolean;
  updateItemStatus(id: string, status: WorkItemStatus, result?: ResultLike): void;
  listItems(missionId: string): WorkItem[];
}
```

- [ ] **Step 4: Write `sqlite-mission-store.ts` skeleton**

```typescript
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DECKENT_DIR } from '../../../core/constants.js';
import type { MissionStore } from './mission-types.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS missions (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, status TEXT NOT NULL,
  tenant TEXT NOT NULL DEFAULT 'local', title TEXT NOT NULL, spec TEXT,
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

/** Durable mission store (SQLite WAL). Implements the rest of MissionStore in later tasks. */
export class SqliteMissionStore /* implements MissionStore (completed across tasks) */ {
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

  // Test-only raw helpers (prefixed __ — not part of the public MissionStore surface).
  __rawTableNames(): string[] {
    return (this.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map(r => r.name);
  }
  __rawExec(sql: string): void { this.db.exec(sql); }
  __rawGet(sql: string): any { return this.db.prepare(sql).get(); }
}
```

> Note: `SqliteMissionStore` will fully `implements MissionStore` once Tasks 2-3 add the CRUD/claim methods. The `__raw*` helpers are test-only seams; keep them.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/orchestra/autonomous/mission-store/sqlite-mission-store-schema.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Typecheck + commit**

Run: `npm run lint` → no errors.
```bash
git add src/orchestra/autonomous/mission-store/mission-types.ts src/orchestra/autonomous/mission-store/sqlite-mission-store.ts tests/orchestra/autonomous/mission-store/sqlite-mission-store-schema.test.ts
git commit -m "feat(autonomous-v2): MissionStore types + SQLite schema/migrate/recover (foundation)"
```

---

### Task 2: Missions CRUD

**Files:**
- Modify: `src/orchestra/autonomous/mission-store/sqlite-mission-store.ts`
- Test: `tests/orchestra/autonomous/mission-store/missions-crud.test.ts`

**Interfaces:**
- Consumes: `SqliteMissionStore` (Task 1), `Mission`/`NewMission`/`MissionStatus`/`Progress`/`ResultLike` (Task 1).
- Produces: `createMission`, `getMission`, `listMissions`, `updateMissionStatus`, `setMissionProgress`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteMissionStore } from '../../../../src/orchestra/autonomous/mission-store/sqlite-mission-store.js';

const dirs: string[] = [];
function newStore() { const d = mkdtempSync(join(tmpdir(), 'mc-')); dirs.push(d); const s = new SqliteMissionStore(d); s.migrate(); return s; }
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe('Missions CRUD', () => {
  it('createMission applies defaults and getMission round-trips', () => {
    const s = newStore();
    const m = s.createMission({ id: 'm1', kind: 'goal', title: 'ship X', renderAs: 'goal', spec: { goal: 'X' } });
    expect(m.tenant).toBe('local');
    expect(m.status).toBe('pending');
    const got = s.getMission('m1')!;
    expect(got.title).toBe('ship X');
    expect(got.spec).toEqual({ goal: 'X' });
    s.close();
  });

  it('listMissions filters by status + tenant', () => {
    const s = newStore();
    s.createMission({ id: 'a', kind: 'list', title: 'A', renderAs: 'checklist', tenant: 't1' });
    s.createMission({ id: 'b', kind: 'goal', title: 'B', renderAs: 'goal', tenant: 't2' });
    s.updateMissionStatus('b', 'active');
    expect(s.listMissions({ status: ['active'] }).map(m => m.id)).toEqual(['b']);
    expect(s.listMissions({ tenant: 't1' }).map(m => m.id)).toEqual(['a']);
    s.close();
  });

  it('updateMissionStatus sets completed_at + last_result on completion; setMissionProgress persists', () => {
    const s = newStore();
    s.createMission({ id: 'm', kind: 'goal', title: 'm', renderAs: 'goal' });
    s.setMissionProgress('m', { done: 2, total: 5, phase: 'EXEC' });
    s.updateMissionStatus('m', 'completed', { ok: true, reason: 'done' });
    const got = s.getMission('m')!;
    expect(got.progress).toEqual({ done: 2, total: 5, phase: 'EXEC' });
    expect(got.completedAt).not.toBeNull();
    expect(got.lastResult).toEqual({ ok: true, reason: 'done' });
    s.close();
  });
});
```

- [ ] **Step 2: Run to verify it fails** — Run the file; FAIL (`createMission is not a function`).

- [ ] **Step 3: Implement the methods** (add to `SqliteMissionStore`, and a private row-mapper + `now()`):

```typescript
import type {
  Mission, NewMission, MissionStatus, Progress, ResultLike,
} from './mission-types.js';

// ... inside the class:
  private now(): string { return new Date().toISOString(); }
  private j(v: unknown): string | null { return v === undefined || v === null ? null : JSON.stringify(v); }
  private p<T>(s: unknown): T | null { return typeof s === 'string' && s.length ? JSON.parse(s) as T : null; }

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
```

- [ ] **Step 4: Run to verify it passes** — 3 tests PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npm run lint`.
```bash
git add src/orchestra/autonomous/mission-store/sqlite-mission-store.ts tests/orchestra/autonomous/mission-store/missions-crud.test.ts
git commit -m "feat(autonomous-v2): missions CRUD on MissionStore"
```

---

### Task 3: WorkItems + atomic claim (the concurrency keystone)

**Files:**
- Modify: `src/orchestra/autonomous/mission-store/sqlite-mission-store.ts`
- Test: `tests/orchestra/autonomous/mission-store/work-items-claim.test.ts`

**Interfaces:**
- Consumes: Task 1/2 types + store.
- Produces: `enqueueItem`, `queryDue`, `claimItem`, `updateItemStatus`, `listItems`. After this task `SqliteMissionStore implements MissionStore` fully — add `implements MissionStore` to the class declaration.

- [ ] **Step 1: Write the failing test (incl. the race test)**

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteMissionStore } from '../../../../src/orchestra/autonomous/mission-store/sqlite-mission-store.js';

const dirs: string[] = [];
function freshMission() {
  const d = mkdtempSync(join(tmpdir(), 'wi-')); dirs.push(d);
  const s = new SqliteMissionStore(d); s.migrate();
  s.createMission({ id: 'm', kind: 'list', title: 'm', renderAs: 'checklist' });
  return s;
}
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe('WorkItems + atomic claim', () => {
  it('enqueueItem + queryDue returns pending items (limit honored)', () => {
    const s = freshMission();
    s.enqueueItem({ id: 'w1', missionId: 'm', kind: 'task', spec: { description: 'a' } });
    s.enqueueItem({ id: 'w2', missionId: 'm', kind: 'sprint' });
    expect(s.queryDue().map(w => w.id)).toEqual(['w1', 'w2']);
    expect(s.queryDue({ limit: 1 }).map(w => w.id)).toEqual(['w1']);
    s.close();
  });

  it('claimItem is atomic — exactly one of N concurrent claims wins', () => {
    const s = freshMission();
    s.enqueueItem({ id: 'w', missionId: 'm', kind: 'task' });
    const results = [0, 1, 2, 3, 4].map(() => s.claimItem('w', 'caller'));
    expect(results.filter(Boolean).length).toBe(1);           // exactly one true
    expect(s.listItems('m')[0].status).toBe('running');
    s.close();
  });

  it('claimItem skips an already-running item; updateItemStatus persists result', () => {
    const s = freshMission();
    s.enqueueItem({ id: 'w', missionId: 'm', kind: 'task' });
    expect(s.claimItem('w', 'a')).toBe(true);
    expect(s.claimItem('w', 'b')).toBe(false);                // already running
    expect(s.queryDue().length).toBe(0);                       // not surfaced once running
    s.updateItemStatus('w', 'done', { ok: true, reason: 'ok' });
    expect(s.listItems('m')[0].lastResult).toEqual({ ok: true, reason: 'ok' });
    s.close();
  });
});
```

- [ ] **Step 2: Run to verify it fails** — FAIL (`enqueueItem is not a function`).

- [ ] **Step 3: Implement** (add to the class; mark `export class SqliteMissionStore implements MissionStore`):

```typescript
import type { WorkItem, NewWorkItem, WorkItemStatus } from './mission-types.js';

  private rowToItem = (r: any): WorkItem => ({
    id: r.id, missionId: r.mission_id, kind: r.kind, status: r.status, spec: this.p(r.spec),
    policy: r.policy, renderAs: r.render_as, progress: this.p(r.progress),
    dependsOn: this.p<string[]>(r.depends_on) ?? [], trigger: this.p(r.trigger),
    claimedAt: r.claimed_at, claimedBy: r.claimed_by, createdAt: r.created_at, updatedAt: r.updated_at,
    lastResult: this.p(r.last_result),
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
    return this.db.prepare('SELECT * FROM work_items WHERE id=?').get(item.id) as unknown as WorkItem &
      Record<string, never> /* mapped below */ as WorkItem;
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
```

> Fix `enqueueItem`'s return to use the mapper: replace its return line with
> `return this.rowToItem(this.db.prepare('SELECT * FROM work_items WHERE id=?').get(item.id));`

- [ ] **Step 4: Run to verify it passes** — 3 tests PASS (incl. the race test: exactly one claim wins).

- [ ] **Step 5: Typecheck + commit**

Run: `npm run lint` (confirm `implements MissionStore` satisfies the full interface).
```bash
git add src/orchestra/autonomous/mission-store/sqlite-mission-store.ts tests/orchestra/autonomous/mission-store/work-items-claim.test.ts
git commit -m "feat(autonomous-v2): work-items + atomic race-free claim (MissionStore complete)"
```

---

### Task 4: Per-mission jsonl hot-path events

**Files:**
- Create: `src/orchestra/autonomous/mission-store/mission-events.ts`
- Test: `tests/orchestra/autonomous/mission-store/mission-events.test.ts`

**Interfaces:**
- Consumes: `MissionEvent` (Task 1).
- Produces: `MissionEventLog` with `append(missionId, ev)`, `readTail(missionId, max?)`, `reset(missionId)`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MissionEventLog } from '../../../../src/orchestra/autonomous/mission-store/mission-events.js';

const dirs: string[] = [];
function sandbox() { const d = mkdtempSync(join(tmpdir(), 'mev-')); dirs.push(d); return d; }
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe('MissionEventLog (per-mission jsonl)', () => {
  it('append + readTail round-trips; reset unlinks the mission file', () => {
    const root = sandbox();
    const log = new MissionEventLog(root);
    log.append('m1', { ts: '2026-01-01T00:00:00Z', type: 'tick', data: { i: 1 } });
    log.append('m1', { ts: '2026-01-01T00:00:01Z', type: 'progress', data: { done: 1 } });
    const path = join(root, '.deckent', 'autonomous', 'events', 'm1.jsonl');
    expect(existsSync(path)).toBe(true);
    const tail = log.readTail('m1', 1);
    expect(tail.length).toBe(1);
    expect(tail[0].type).toBe('progress');
    log.reset('m1');
    expect(existsSync(path)).toBe(false);
    expect(log.readTail('m1')).toEqual([]); // missing file → empty, no throw
  });
});
```

- [ ] **Step 2: Run to verify it fails** — module not found.

- [ ] **Step 3: Write `mission-events.ts`**

```typescript
import { appendFileSync, mkdirSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { DECKENT_DIR } from '../../../core/constants.js';
import type { MissionEvent } from './mission-types.js';

/** Ephemeral hot-path event log: one append-only jsonl per mission; reset = unlink. */
export class MissionEventLog {
  private dir: string;
  constructor(projectRoot: string) {
    this.dir = join(projectRoot, DECKENT_DIR, 'autonomous', 'events');
  }
  private file(missionId: string): string { return join(this.dir, `${missionId}.jsonl`); }

  append(missionId: string, ev: MissionEvent): void {
    mkdirSync(this.dir, { recursive: true });
    appendFileSync(this.file(missionId), JSON.stringify(ev) + '\n', 'utf-8');
  }
  readTail(missionId: string, max = 200): MissionEvent[] {
    const f = this.file(missionId);
    if (!existsSync(f)) return [];
    const lines = readFileSync(f, 'utf-8').split('\n').filter(l => l.trim().length > 0);
    const slice = max > 0 ? lines.slice(-max) : lines;
    return slice.map(l => { try { return JSON.parse(l) as MissionEvent; } catch { return null; } }).filter(Boolean) as MissionEvent[];
  }
  reset(missionId: string): void {
    try { rmSync(this.file(missionId)); } catch { /* already gone — ephemeral, loss-tolerant */ }
  }
}
```

- [ ] **Step 4: Run to verify it passes** — PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
git add src/orchestra/autonomous/mission-store/mission-events.ts tests/orchestra/autonomous/mission-store/mission-events.test.ts
git commit -m "feat(autonomous-v2): per-mission jsonl hot-path event log (reset-on-complete)"
```

---

### Task 5: MissionView projection contract

**Files:**
- Create: `src/orchestra/autonomous/mission-store/mission-view.ts`
- Test: `tests/orchestra/autonomous/mission-store/mission-view.test.ts`

**Interfaces:**
- Consumes: `MissionStore`, `Mission`, `WorkItem`, `Progress` (Task 1-3).
- Produces: `MissionView` type + `projectMission(store, id): MissionView | null`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteMissionStore } from '../../../../src/orchestra/autonomous/mission-store/sqlite-mission-store.js';
import { projectMission } from '../../../../src/orchestra/autonomous/mission-store/mission-view.js';

const dirs: string[] = [];
function store() { const d = mkdtempSync(join(tmpdir(), 'mv-')); dirs.push(d); const s = new SqliteMissionStore(d); s.migrate(); return s; }
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe('MissionView projection', () => {
  it('projects mission + items + render_as + derived progress', () => {
    const s = store();
    s.createMission({ id: 'm', kind: 'list', title: 'L', renderAs: 'checklist' });
    s.enqueueItem({ id: 'w1', missionId: 'm', kind: 'sprint' });
    s.enqueueItem({ id: 'w2', missionId: 'm', kind: 'task' });
    s.claimItem('w1', 'x'); s.updateItemStatus('w1', 'done', { ok: true });
    const view = projectMission(s, 'm')!;
    expect(view.renderAs).toBe('checklist');
    expect(view.items.map(i => i.renderAs)).toEqual(['sprint', 'task']);
    expect(view.progress).toEqual({ done: 1, total: 2 }); // 1 of 2 items done
    expect(projectMission(s, 'missing')).toBeNull();
    s.close();
  });
});
```

- [ ] **Step 2: Run to verify it fails** — module not found.

- [ ] **Step 3: Write `mission-view.ts`**

```typescript
import type { MissionStore, Mission, WorkItem, Progress, MissionRenderAs } from './mission-types.js';

export interface MissionView {
  id: string; renderAs: MissionRenderAs; status: Mission['status']; title: string;
  progress: Progress; deliverTo: string | null; lastResult: Mission['lastResult'];
  items: Array<Pick<WorkItem, 'id' | 'kind' | 'status' | 'renderAs' | 'progress'>>;
}

/** Project a mission + its work-items into the canonical client-render contract. */
export function projectMission(store: MissionStore, id: string): MissionView | null {
  const m = store.getMission(id);
  if (!m) return null;
  const items = store.listItems(id);
  const done = items.filter(i => i.status === 'done').length;
  const progress: Progress = m.progress ?? { done, total: items.length };
  return {
    id: m.id, renderAs: m.renderAs, status: m.status, title: m.title,
    progress, deliverTo: m.deliverTo, lastResult: m.lastResult,
    items: items.map(i => ({ id: i.id, kind: i.kind, status: i.status, renderAs: i.renderAs, progress: i.progress })),
  };
}
```

- [ ] **Step 4: Run to verify it passes** — PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
git add src/orchestra/autonomous/mission-store/mission-view.ts tests/orchestra/autonomous/mission-store/mission-view.test.ts
git commit -m "feat(autonomous-v2): MissionView projection contract"
```

---

### Task 6: backlog.json → autonomous.db migration

**Files:**
- Create: `src/orchestra/autonomous/mission-store/mission-migrate.ts`
- Test: `tests/orchestra/autonomous/mission-store/mission-migrate.test.ts`

**Interfaces:**
- Consumes: `SqliteMissionStore` (Task 1-3), `BacklogEntry` shape (`../backlog-types.js`).
- Produces: `migrateBacklogJson(projectRoot, store): number` — imports legacy entries as a `legacy` mission's work-items; returns count imported; idempotent (no-op when missions already exist).

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteMissionStore } from '../../../../src/orchestra/autonomous/mission-store/sqlite-mission-store.js';
import { migrateBacklogJson } from '../../../../src/orchestra/autonomous/mission-store/mission-migrate.js';

const dirs: string[] = [];
function root() { const d = mkdtempSync(join(tmpdir(), 'mig-')); dirs.push(d); return d; }
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe('migrateBacklogJson', () => {
  it('imports legacy backlog entries as a legacy mission\'s work-items (idempotent)', () => {
    const r = root();
    mkdirSync(join(r, '.deckent', 'autonomous'), { recursive: true });
    writeFileSync(join(r, '.deckent', 'autonomous', 'backlog.json'), JSON.stringify({
      _version: '1.0',
      entries: [
        { id: 'e1', title: 'A', kind: 'task', spec: { description: 'do A' }, policy: 'auto', trigger: { type: 'one-off' }, status: 'pending' },
        { id: 'e2', title: 'B', kind: 'sprint', spec: { directivesRef: 'D' }, policy: 'auto', trigger: { type: 'one-off' }, status: 'done' },
      ],
    }), 'utf-8');
    const s = new SqliteMissionStore(r); s.migrate();
    const n = migrateBacklogJson(r, s);
    expect(n).toBe(2);
    const legacy = s.listMissions({})[0];
    expect(legacy.id).toBe('legacy');
    const items = s.listItems('legacy');
    expect(items.map(i => i.id).sort()).toEqual(['e1', 'e2']);
    expect(items.find(i => i.id === 'e2')!.kind).toBe('sprint');
    expect(migrateBacklogJson(r, s)).toBe(0); // idempotent — missions exist
    s.close();
  });
});
```

- [ ] **Step 2: Run to verify it fails** — module not found.

- [ ] **Step 3: Write `mission-migrate.ts`**

```typescript
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DECKENT_DIR } from '../../../core/constants.js';
import type { MissionStore } from './mission-types.js';
import type { BacklogEntry, BacklogStatus } from '../backlog-types.js';

const STATUS_MAP: Record<BacklogStatus, 'pending' | 'running' | 'done' | 'failed' | 'parked'> = {
  pending: 'pending', running: 'running', done: 'done', failed: 'failed', parked: 'parked',
};

/** One-time import of the legacy backlog.json into a `legacy` mission. No-op if missions already exist. */
export function migrateBacklogJson(projectRoot: string, store: MissionStore): number {
  if (store.listMissions({}).length > 0) return 0;
  const path = join(projectRoot, DECKENT_DIR, 'autonomous', 'backlog.json');
  if (!existsSync(path)) return 0;
  let entries: BacklogEntry[];
  try { entries = (JSON.parse(readFileSync(path, 'utf-8')) as { entries?: BacklogEntry[] }).entries ?? []; }
  catch { return 0; }
  if (entries.length === 0) return 0;

  store.createMission({ id: 'legacy', kind: 'list', title: 'Imported backlog', renderAs: 'checklist' });
  let n = 0;
  for (const e of entries) {
    if (!e?.id || !e?.kind) continue;
    const item = store.enqueueItem({
      id: e.id, missionId: 'legacy', kind: e.kind, spec: e.spec, policy: e.policy,
      trigger: e.trigger as unknown as Record<string, unknown>,
    });
    const mapped = STATUS_MAP[e.status] ?? 'pending';
    if (mapped !== 'pending') store.updateItemStatus(item.id, mapped);
    n++;
  }
  return n;
}
```

- [ ] **Step 4: Run to verify it passes** — PASS (2 imported, idempotent re-run = 0).

- [ ] **Step 5: Final verification + commit**

Run: `npm run lint` (tsc clean). Run the whole new module suite + confirm the live autonomous suite is untouched:
`npx vitest run tests/orchestra/autonomous/` → all green (new mission-store tests + the 213 existing autonomous tests, which never imported the new module).
```bash
git add src/orchestra/autonomous/mission-store/mission-migrate.ts tests/orchestra/autonomous/mission-store/mission-migrate.test.ts
git commit -m "feat(autonomous-v2): backlog.json -> autonomous.db migration (idempotent)"
```

---

## Self-Review (plan vs spec)

- **Spec coverage:** schema → Task 1; missions CRUD → Task 2; work-items + **atomic claim** → Task 3 (the race-free keystone, with the N-concurrent-claim test); jsonl hot-path (per-mission, reset=unlink) → Task 4; `MissionView` projection → Task 5; backlog.json migration → Task 6. The `MissionStore` interface is fully implemented across Tasks 1-3. `subscribe()` event-stream is intentionally deferred (the live stream belongs to the scheduler/dashboard sub-project — projection is the contract this plan delivers; noted as out-of-scope here to avoid building an unconsumed API, YAGNI).
- **Additive guarantee:** no live consumer (`backlog.ts`, the loop) is touched → the 213 existing autonomous tests stay green trivially; Task 6's final step verifies this.
- **Placeholder scan:** none — every code step shows complete code; the one `enqueueItem` return-line fix is called out explicitly.
- **Type consistency:** `MissionStore` methods defined in Task 1 are implemented with matching signatures in Tasks 2-3; `Mission`/`WorkItem`/`Progress`/`MissionEvent`/`MissionView` shapes are consistent across tasks; `projectMission(store, id)` (Task 5) consumes the Task 1-3 store; `migrateBacklogJson` (Task 6) consumes `BacklogEntry` from the real `../backlog-types.js`.
- **Deviation from spec (noted):** `MissionView` is delivered as a pure `projectMission` function (not a class with `subscribe`); the live `subscribe` stream is deferred to the scheduler/dashboard sub-project that actually consumes it. This keeps the foundation focused + avoids an unconsumed API.
