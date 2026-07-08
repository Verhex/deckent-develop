import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';

import {
  parseArgs,
  parseTaskOutcomes,
  appendTaskOutcomes,
  buildBackfillSprintContent,
  backfillMissingSprintEntries,
  runReclassify,
} from '../../scripts/sprint-retroactive-reclassify.mjs';

function freshTmp(label: string): string {
  const dir = join(tmpdir(), `deckent-reclassify-backfill-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// Mirrors the columns backfillMissingSprintEntries' INSERT actually writes —
// a subset of the real `entries` table schema (src/core/memory-store.ts),
// all of which have defaults in production so this INSERT works unmodified
// against the live DB.
function makeDb(path: string): InstanceType<typeof Database> {
  const db = new Database(path);
  db.exec(`
    CREATE TABLE entries (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'system',
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      sprint_id TEXT,
      sprint_num INTEGER NOT NULL DEFAULT 0,
      decay_exempt INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

function seedSprintEntry(db: InstanceType<typeof Database>, sprintId: string, body: string) {
  db.prepare(
    `INSERT INTO entries (id, type, title, content, sprint_id, updated_at) VALUES (?, 'sprint', ?, ?, ?, ?)`,
  ).run(`sprint-log-${sprintId.replace('sprint-', '')}`, `Sprint ${sprintId}`, body, sprintId, new Date().toISOString());
}

function getContent(db: InstanceType<typeof Database>, sprintId: string): string {
  const row = db.prepare(`SELECT content FROM entries WHERE sprint_id = ? AND type = 'sprint'`).get(sprintId) as
    | { content: string }
    | undefined;
  if (!row) throw new Error(`no sprint row for ${sprintId}`);
  return row.content;
}

describe('parseArgs (backfill flags)', () => {
  it('parses --backfill-missing and --default-prior-decision', () => {
    const got = parseArgs(['--backfill-missing', '--default-prior-decision', 'GO_WITH_TECH_DEBT']);
    expect(got['backfill-missing']).toBe(true);
    expect(got['default-prior-decision']).toBe('GO_WITH_TECH_DEBT');
  });
});

describe('appendTaskOutcomes', () => {
  const body = [
    '# sprint-195',
    '',
    '- Total tasks: 3',
    '- Completed: 2',
    '- NO_GO: 1',
    '- GO_WITH_TECH_DEBT: 0',
    '',
    '## Task Outcomes',
    '- 195-001: DONE',
    '- 195-002: DONE',
    '- 195-003: NO_GO',
  ].join('\n');

  it('appends only the missing task lines, leaves existing ones untouched, and recomputes counters', () => {
    const updated = appendTaskOutcomes(body, [
      { task: '195-003', decision: 'DONE' }, // already present -> must be ignored
      { task: '195-004-fix', decision: 'NO_GO' },
    ]);
    expect(updated).toMatch(/- 195-004-fix: NO_GO — \(backfilled\)/);
    expect(updated).toMatch(/- 195-003: NO_GO$/m);
    expect(updated).toMatch(/- NO_GO: 2/);
    expect(updated).toMatch(/- Completed: 2/);
  });

  it('creates the Task Outcomes section when the entry has none', () => {
    const updated = appendTaskOutcomes('# sprint-500\n\n- Total tasks: 0\n', [{ task: '500-001', decision: 'NO_GO' }]);
    expect(updated).toMatch(/## Task Outcomes/);
    expect(updated).toMatch(/- 500-001: NO_GO — \(backfilled\)/);
  });

  it('is a no-op when every referenced task already has an outcome line', () => {
    const noopBody = '## Task Outcomes\n- 1-1: DONE\n';
    expect(appendTaskOutcomes(noopBody, [{ task: '1-1', decision: 'NO_GO' }])).toBe(noopBody);
  });
});

describe('buildBackfillSprintContent', () => {
  it('produces a parseable body whose counters match the given pairs', () => {
    const content = buildBackfillSprintContent('sprint-194', [
      { task: '194-001', decision: 'NO_GO' },
      { task: '194-002', decision: 'NO_GO' },
      { task: '194-004', decision: 'NO_GO' },
      { task: '194-005', decision: 'NO_GO' },
    ]);
    expect(content).toMatch(/^# sprint-194/);
    expect(content).toMatch(/- Total tasks: 4/);
    expect(content).toMatch(/- NO_GO: 4/);
    expect(content).toMatch(/- Completed: 0/);
    expect(content).toMatch(/Backfilled via sprint-retroactive-reclassify/);
    const outcomes = parseTaskOutcomes(content);
    expect(outcomes.size).toBe(4);
    expect(outcomes.get('194-001')).toBe('NO_GO');
  });
});

describe('backfillMissingSprintEntries', () => {
  let tmp: string;
  let dbPath: string;
  let db: InstanceType<typeof Database>;

  beforeEach(() => {
    tmp = freshTmp('unit');
    dbPath = join(tmp, 'memory.db');
    db = makeDb(dbPath);
  });
  afterEach(() => {
    db.close();
    rmSync(tmp, { recursive: true, force: true });
  });

  it('creates a sprint-log row for a sprint with no DB entry at all', () => {
    const entries = [
      { sprint: 'sprint-194', task: '194-001', decision: 'DONE', reason: 'x' },
      { sprint: 'sprint-194', task: '194-002', decision: 'DONE', reason: 'y' },
    ];
    const report = backfillMissingSprintEntries(db, entries);
    expect(report).toEqual([{ sprint: 'sprint-194', action: 'created', tasksBackfilled: ['194-001', '194-002'] }]);
    const content = getContent(db, 'sprint-194');
    expect(content).toMatch(/- 194-001: NO_GO/);
    expect(content).toMatch(/- 194-002: NO_GO/);
  });

  it('appends only the missing task line to an existing sprint row (task-not-in-outcomes case)', () => {
    seedSprintEntry(
      db,
      'sprint-195',
      ['# sprint-195', '## Task Outcomes', '- 195-004: NO_GO', '- 195-005: NO_GO'].join('\n'),
    );
    const report = backfillMissingSprintEntries(db, [
      { sprint: 'sprint-195', task: '195-004-fix', decision: 'DONE', reason: 'oom not defect' },
    ]);
    expect(report).toEqual([{ sprint: 'sprint-195', action: 'updated', tasksBackfilled: ['195-004-fix'] }]);
    const content = getContent(db, 'sprint-195');
    expect(content).toMatch(/- 195-004-fix: NO_GO — \(backfilled\)/);
    expect(content).toMatch(/- 195-004: NO_GO$/m); // untouched
  });

  it('is a no-op when every referenced task already has an outcome line', () => {
    seedSprintEntry(db, 'sprint-195', ['## Task Outcomes', '- 195-004: NO_GO'].join('\n'));
    const report = backfillMissingSprintEntries(db, [
      { sprint: 'sprint-195', task: '195-004', decision: 'DONE', reason: 'x' },
    ]);
    expect(report).toEqual([{ sprint: 'sprint-195', action: 'noop', tasksBackfilled: [] }]);
  });

  it('auto-flips the prior decision away from the target so it never lands on already-classified', () => {
    backfillMissingSprintEntries(db, [{ sprint: 'sprint-300', task: '300-001', decision: 'NO_GO', reason: 'x' }]);
    expect(parseTaskOutcomes(getContent(db, 'sprint-300')).get('300-001')).toBe('DONE');
  });

  it('honors an explicit defaultPriorDecision option', () => {
    backfillMissingSprintEntries(db, [{ sprint: 'sprint-301', task: '301-001', decision: 'DONE', reason: 'x' }], {
      defaultPriorDecision: 'GO_WITH_TECH_DEBT',
    });
    expect(parseTaskOutcomes(getContent(db, 'sprint-301')).get('301-001')).toBe('GO_WITH_TECH_DEBT');
  });

  it('honors a per-entry priorDecision override', () => {
    backfillMissingSprintEntries(db, [
      { sprint: 'sprint-302', task: '302-001', decision: 'DONE', reason: 'x', priorDecision: 'GO_WITH_TECH_DEBT' },
    ]);
    expect(parseTaskOutcomes(getContent(db, 'sprint-302')).get('302-001')).toBe('GO_WITH_TECH_DEBT');
  });

  it('makes no DB writes in dry-run mode', () => {
    const report = backfillMissingSprintEntries(
      db,
      [{ sprint: 'sprint-303', task: '303-001', decision: 'DONE', reason: 'x' }],
      { dryRun: true },
    );
    expect(report[0]).toMatchObject({ action: 'created' });
    const row = db.prepare(`SELECT content FROM entries WHERE sprint_id = ?`).get('sprint-303');
    expect(row).toBeUndefined();
  });
});

// born-504 — reproduces the exact historical shape: sprint-191/195 rows exist
// but are missing one task each; sprint-194/196 rows never got written at
// all (halted before finalize). 12 entries, 2 applied / 10 skipped without
// the fix; 12/12 applied with --backfill-missing.
const BORN_504_ENTRIES = [
  { sprint: 'sprint-191', task: '191-002', decision: 'DONE', reason: 'Disk verified — synthetic NO_GO.' },
  { sprint: 'sprint-194', task: '194-001', decision: 'DONE', reason: 'Disk verified — +321 LoC landed; synthetic NO_GO.' },
  { sprint: 'sprint-194', task: '194-002', decision: 'DONE', reason: 'Disk verified — +911 LoC landed; synthetic NO_GO.' },
  { sprint: 'sprint-194', task: '194-004', decision: 'DONE', reason: 'Disk verified — WORKER_NODE_OPTIONS wire landed; synthetic NO_GO.' },
  { sprint: 'sprint-194', task: '194-005', decision: 'DONE', reason: 'Disk verified — +328 LoC landed; synthetic NO_GO.' },
  { sprint: 'sprint-195', task: '195-004', decision: 'DONE', reason: 'Worker selfAssessment DONE on disk; outer NO_GO caused by container OOM, not a code defect.' },
  { sprint: 'sprint-195', task: '195-004-fix', decision: 'DONE', reason: 'Container OOM (exit 137); underlying patch correct on disk.' },
  { sprint: 'sprint-196', task: '196-003', decision: 'DONE', reason: 'Disk verified — +144 LoC plus 6 tests passing; synthetic NO_GO.' },
  { sprint: 'sprint-196', task: '196-005', decision: 'DONE', reason: 'Disk verified — new token-counter.ts plus 12 tests passing; synthetic NO_GO.' },
  { sprint: 'sprint-196', task: '196-008', decision: 'GO_WITH_TECH_DEBT', reason: 'Consolidated CHANGELOG entry landed; minor format diff vs template.' },
  { sprint: 'sprint-196', task: '196-003-fix', decision: 'DONE', reason: 'Container OOM (exit 137); underlying patch correct on disk.' },
  { sprint: 'sprint-196', task: '196-005-fix', decision: 'DONE', reason: 'Container OOM (exit 137); underlying patch correct on disk.' },
];

describe('born-504 — 12-entry batch across a partial DB gap', () => {
  let tmp: string;
  let dbPath: string;
  let decisionsDir: string;

  beforeEach(() => {
    tmp = freshTmp('born-504');
    dbPath = join(tmp, 'memory.db');
    decisionsDir = join(tmp, 'decisions');
    const db = makeDb(dbPath);
    // sprint-191 exists but only lists 191-002 (already NO_GO) — no gap here.
    seedSprintEntry(db, 'sprint-191', ['# sprint-191', '## Task Outcomes', '- 191-001: DONE', '- 191-002: NO_GO'].join('\n'));
    // sprint-195 exists but never got a 195-004-fix line (task-not-in-outcomes).
    seedSprintEntry(
      db,
      'sprint-195',
      [
        '# sprint-195',
        '## Task Outcomes',
        '- 195-001: DONE',
        '- 195-002: DONE',
        '- 195-003: DONE',
        '- 195-004: NO_GO',
        '- 195-005: NO_GO',
      ].join('\n'),
    );
    // sprint-194 / sprint-196 rows were never written at all (halted pre-finalize).
    db.close();
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('WITHOUT --backfill-missing reproduces the historical 2-applied/10-skipped split', () => {
    const result = runReclassify({ dbPath, entries: BORN_504_ENTRIES, decisionsDir, dateStr: '2026-07-08' });
    expect(result.applied).toHaveLength(2);
    expect(result.applied.map((a: { task: string }) => a.task).sort()).toEqual(['191-002', '195-004']);
    expect(result.skipped).toHaveLength(10);
    expect(result.skipped.filter((s: { reason: string }) => s.reason === 'sprint-entry-missing')).toHaveLength(9);
    expect(result.skipped.filter((s: { reason: string }) => s.reason === 'task-not-in-outcomes')).toHaveLength(1);
  });

  it('WITH --backfill-missing produces 12/12 applied and zero skipped', () => {
    const result = runReclassify({
      dbPath,
      entries: BORN_504_ENTRIES,
      decisionsDir,
      dateStr: '2026-07-08',
      backfillMissing: true,
    });
    expect(result.skipped).toHaveLength(0);
    expect(result.applied).toHaveLength(12);
    expect(
      result.backfill.filter((b: { action: string }) => b.action === 'created').map((b: { sprint: string }) => b.sprint).sort(),
    ).toEqual(['sprint-194', 'sprint-196']);
    expect(
      result.backfill.filter((b: { action: string }) => b.action === 'updated').map((b: { sprint: string }) => b.sprint),
    ).toEqual(['sprint-195']);

    expect(result.auditPath && existsSync(result.auditPath)).toBe(true);
    const audit = JSON.parse(readFileSync(result.auditPath!, 'utf-8'));
    expect(audit.applied).toHaveLength(12);
    expect(audit.skipped).toHaveLength(0);
    expect(audit.backfill).toBeDefined();
  });
});
