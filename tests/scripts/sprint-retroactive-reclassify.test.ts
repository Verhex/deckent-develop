import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';

import {
  parseArgs,
  parseTaskOutcomes,
  rewriteTaskOutcome,
  validateEntry,
  recomputeAgentStats,
  applyAgentStatsDelta,
  reclassifyEntries,
  runReclassify,
  pickAuditPath,
  VALID_DECISIONS,
} from '../../scripts/sprint-retroactive-reclassify.mjs';

function freshTmp(label: string): string {
  const dir = join(tmpdir(), `deckent-reclassify-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeDb(path: string): InstanceType<typeof Database> {
  const db = new Database(path);
  db.exec(`
    CREATE TABLE entries (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      sprint_id TEXT,
      content TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  return db;
}

function seedSprintEntry(db: InstanceType<typeof Database>, sprintId: string, body: string) {
  db.prepare(
    `INSERT INTO entries (id, type, sprint_id, content, updated_at) VALUES (?, 'sprint', ?, ?, ?)`,
  ).run(`sprint-log-${sprintId.replace('sprint-', '')}`, sprintId, body, new Date().toISOString());
}

const SPRINT_195_BODY = [
  '# sprint-195',
  '',
  '- Total tasks: 6',
  '- Completed: 3',
  '- NO_GO: 3',
  '- GO_WITH_TECH_DEBT: 0',
  '- Duration: 100ms',
  '',
  '## Task Outcomes',
  '- 195-001: DONE',
  '- 195-002: DONE',
  '- 195-003: DONE',
  '- 195-004: NO_GO',
  '- 195-004-fix: NO_GO',
  '- 195-005: NO_GO',
].join('\n');

describe('parseArgs', () => {
  it('parses flags and string values', () => {
    const got = parseArgs(['--sprint', 'sprint-195', '--task', '195-004', '--decision', 'DONE', '--dry-run']);
    expect(got.sprint).toBe('sprint-195');
    expect(got.task).toBe('195-004');
    expect(got.decision).toBe('DONE');
    expect(got['dry-run']).toBe(true);
  });
});

describe('parseTaskOutcomes', () => {
  it('extracts task outcomes from the canonical sprint body', () => {
    const map = parseTaskOutcomes(SPRINT_195_BODY);
    expect(map.size).toBe(6);
    expect(map.get('195-004')).toBe('NO_GO');
    expect(map.get('195-001')).toBe('DONE');
  });

  it('ignores lines outside the Task Outcomes section', () => {
    const body = '# foo\n- 999-999: NO_GO\n\n## Task Outcomes\n- 001-001: DONE\n';
    const map = parseTaskOutcomes(body);
    expect(map.has('999-999')).toBe(false);
    expect(map.get('001-001')).toBe('DONE');
  });
});

describe('rewriteTaskOutcome', () => {
  it('replaces a task line and recomputes counters', () => {
    const updated = rewriteTaskOutcome(SPRINT_195_BODY, '195-004', 'DONE');
    expect(updated).toMatch(/- 195-004: DONE/);
    expect(updated).toMatch(/- Completed: 4/);
    expect(updated).toMatch(/- NO_GO: 2/);
  });

  it('throws for a missing task id', () => {
    expect(() => rewriteTaskOutcome(SPRINT_195_BODY, '999-xxx', 'DONE')).toThrow(/not found/);
  });

  it('throws for an invalid decision string', () => {
    expect(() => rewriteTaskOutcome(SPRINT_195_BODY, '195-004', 'WAT' as any)).toThrow(/Invalid decision/);
  });
});

describe('validateEntry', () => {
  it('rejects missing fields', () => {
    expect(() => validateEntry({ sprint: 'sprint-195' } as any)).toThrow(/task/);
    expect(() => validateEntry({ sprint: 'sprint-195', task: 't', decision: 'NOT_A_THING' as any, reason: 'x' })).toThrow(
      /decision/,
    );
    expect(() => validateEntry({ sprint: 'sprint-195', task: 't', decision: 'DONE' } as any)).toThrow(/reason/);
  });

  it('accepts every member of VALID_DECISIONS', () => {
    for (const d of VALID_DECISIONS) {
      expect(validateEntry({ sprint: 's', task: 't', decision: d, reason: 'r' }).decision).toBe(d);
    }
  });
});

describe('recomputeAgentStats', () => {
  it('moves successRate up when NO_GO -> DONE', () => {
    const agent = { stats: { totalUses: 4, successRate: 0.5 } };
    recomputeAgentStats(agent, 'NO_GO', 'DONE');
    expect(agent.stats.successRate).toBeCloseTo(0.75, 4);
  });

  it('moves successRate down when DONE -> NO_GO', () => {
    const agent = { stats: { totalUses: 4, successRate: 0.75 } };
    recomputeAgentStats(agent, 'DONE', 'NO_GO');
    expect(agent.stats.successRate).toBeCloseTo(0.5, 4);
  });

  it('treats GO_WITH_TECH_DEBT as success and is a no-op when category unchanged', () => {
    const agent = { stats: { totalUses: 4, successRate: 0.5 } };
    recomputeAgentStats(agent, 'DONE', 'GO_WITH_TECH_DEBT');
    expect(agent.stats.successRate).toBeCloseTo(0.5, 4);
  });

  it('no-ops when totalUses is zero', () => {
    const agent = { stats: { totalUses: 0, successRate: 0 } };
    recomputeAgentStats(agent, 'NO_GO', 'DONE');
    expect(agent.stats.successRate).toBe(0);
  });
});

describe('applyAgentStatsDelta (file IO)', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = freshTmp('agent-stats');
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('updates an agent.json on disk', () => {
    const agentPath = join(tmp, 'agent.json');
    writeFileSync(agentPath, JSON.stringify({ id: 'a', stats: { totalUses: 10, successRate: 0.5 } }, null, 2));
    const r = applyAgentStatsDelta(agentPath, 'NO_GO', 'DONE');
    expect(r.applied).toBe(true);
    const after = JSON.parse(readFileSync(agentPath, 'utf-8'));
    expect(after.stats.successRate).toBeCloseTo(0.6, 4);
  });

  it('returns no-change when nothing flips', () => {
    const agentPath = join(tmp, 'agent.json');
    writeFileSync(agentPath, JSON.stringify({ id: 'a', stats: { totalUses: 10, successRate: 0.5 } }, null, 2));
    const r = applyAgentStatsDelta(agentPath, 'DONE', 'GO_WITH_TECH_DEBT');
    expect(r.applied).toBe(false);
  });

  it('returns manifest-missing for a non-existent file', () => {
    const r = applyAgentStatsDelta(join(tmp, 'missing.json'), 'NO_GO', 'DONE');
    expect(r.applied).toBe(false);
    expect(r.reason).toBe('manifest-missing');
  });
});

describe('reclassifyEntries', () => {
  let tmp: string;
  let dbPath: string;
  let db: InstanceType<typeof Database>;

  beforeEach(() => {
    tmp = freshTmp('reclassify');
    dbPath = join(tmp, 'memory.db');
    db = makeDb(dbPath);
    seedSprintEntry(db, 'sprint-195', SPRINT_195_BODY);
  });
  afterEach(() => {
    db.close();
    rmSync(tmp, { recursive: true, force: true });
  });

  it('reclassifies a single task and updates the sprint entry content', () => {
    const r = reclassifyEntries(db, [
      { sprint: 'sprint-195', task: '195-004', decision: 'DONE', reason: 'rescue' },
    ]);
    expect(r.applied).toHaveLength(1);
    expect(r.applied[0]).toMatchObject({ task: '195-004', before: 'NO_GO', after: 'DONE' });
    const row = db.prepare(`SELECT content FROM entries WHERE sprint_id = ?`).get('sprint-195') as { content: string };
    expect(row.content).toMatch(/- 195-004: DONE/);
    expect(row.content).toMatch(/- Completed: 4/);
  });

  it('is idempotent — second run is a no-op for the same target', () => {
    const list = [{ sprint: 'sprint-195', task: '195-004', decision: 'DONE', reason: 'rescue' }];
    reclassifyEntries(db, list);
    const second = reclassifyEntries(db, list);
    expect(second.applied).toHaveLength(0);
    expect(second.skipped).toHaveLength(1);
    expect(second.skipped[0].reason).toBe('already-classified');
  });

  it('skips entries whose sprint is missing or whose task is not in the outcomes section', () => {
    const r = reclassifyEntries(db, [
      { sprint: 'sprint-191', task: '191-001', decision: 'DONE', reason: 'ghost-sprint' },
      { sprint: 'sprint-195', task: '999-zzz', decision: 'DONE', reason: 'ghost-task' },
    ]);
    expect(r.applied).toHaveLength(0);
    expect(r.skipped).toHaveLength(2);
    expect(r.skipped.map((s) => s.reason).sort()).toEqual(['sprint-entry-missing', 'task-not-in-outcomes']);
  });

  it('processes a 6-entry bulk batch from --from-file shape', () => {
    seedSprintEntry(
      db,
      'sprint-194',
      [
        '# sprint-194',
        '- Total tasks: 5',
        '- Completed: 0',
        '- NO_GO: 5',
        '',
        '## Task Outcomes',
        '- 194-001: NO_GO',
        '- 194-002: NO_GO',
        '- 194-003: NO_GO',
        '- 194-004: NO_GO',
        '- 194-005: NO_GO',
      ].join('\n'),
    );
    const entries = [
      { sprint: 'sprint-194', task: '194-001', decision: 'DONE', reason: '+321 LoC' },
      { sprint: 'sprint-194', task: '194-002', decision: 'DONE', reason: '+911 LoC' },
      { sprint: 'sprint-194', task: '194-004', decision: 'DONE', reason: 'WORKER_NODE_OPTIONS' },
      { sprint: 'sprint-194', task: '194-005', decision: 'DONE', reason: '+328 LoC' },
      { sprint: 'sprint-195', task: '195-004', decision: 'DONE', reason: 'rubric 95+' },
      { sprint: 'sprint-195', task: '195-004-fix', decision: 'DONE', reason: 'container OOM not defect' },
    ];
    const r = reclassifyEntries(db, entries);
    expect(r.applied).toHaveLength(6);
    expect(r.skipped).toHaveLength(0);
  });

  it('recomputes agent stats when an agent id is supplied', () => {
    const agentsDir = join(tmp, 'agents');
    mkdirSync(join(agentsDir, 'temp-react-ts-specialist'), { recursive: true });
    writeFileSync(
      join(agentsDir, 'temp-react-ts-specialist', 'agent.json'),
      JSON.stringify({ id: 'temp-react-ts-specialist', stats: { totalUses: 1, successRate: 0 } }, null, 2),
    );
    const r = reclassifyEntries(
      db,
      [
        {
          sprint: 'sprint-195',
          task: '195-004',
          decision: 'DONE',
          reason: 'rescue',
          agent: 'temp-react-ts-specialist',
        },
      ],
      { agentsDir },
    );
    expect(r.applied).toHaveLength(1);
    expect(r.applied[0].agentStats?.applied).toBe(true);
    const after = JSON.parse(
      readFileSync(join(agentsDir, 'temp-react-ts-specialist', 'agent.json'), 'utf-8'),
    );
    expect(after.stats.successRate).toBe(1);
  });
});

describe('pickAuditPath', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = freshTmp('audit');
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('returns base path when nothing exists', () => {
    const p = pickAuditPath(tmp, '2026-05-26');
    expect(p).toBe(join(tmp, 'decision-reclassify-2026-05-26.json'));
  });

  it('appends a suffix when the base exists', () => {
    writeFileSync(join(tmp, 'decision-reclassify-2026-05-26.json'), '{}');
    const p = pickAuditPath(tmp, '2026-05-26');
    expect(p).toBe(join(tmp, 'decision-reclassify-2026-05-26-1.json'));
  });
});

describe('runReclassify (full flow)', () => {
  let tmp: string;
  let dbPath: string;
  let decisionsDir: string;

  beforeEach(() => {
    tmp = freshTmp('full');
    dbPath = join(tmp, 'memory.db');
    decisionsDir = join(tmp, 'decisions');
    const db = makeDb(dbPath);
    seedSprintEntry(db, 'sprint-195', SPRINT_195_BODY);
    db.close();
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('writes an audit file containing the applied and skipped arrays', () => {
    const result = runReclassify({
      dbPath,
      entries: [
        { sprint: 'sprint-195', task: '195-004', decision: 'DONE', reason: 'rescue' },
        { sprint: 'sprint-195', task: '195-003', decision: 'DONE', reason: 'already-done — skip' },
      ],
      decisionsDir,
      dateStr: '2026-05-26',
    });
    expect(result.applied).toHaveLength(1);
    expect(result.skipped).toHaveLength(1);
    expect(result.auditPath && existsSync(result.auditPath)).toBe(true);
    const audit = JSON.parse(readFileSync(result.auditPath!, 'utf-8'));
    expect(audit.applied).toHaveLength(1);
    expect(audit.skipped).toHaveLength(1);
    expect(audit.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('writes no audit file in dry-run mode and leaves the DB untouched', () => {
    const result = runReclassify({
      dbPath,
      entries: [{ sprint: 'sprint-195', task: '195-004', decision: 'DONE', reason: 'rescue' }],
      decisionsDir,
      dateStr: '2026-05-26',
      dryRun: true,
    });
    expect(result.auditPath).toBeNull();
    expect(existsSync(join(decisionsDir, 'decision-reclassify-2026-05-26.json'))).toBe(false);
    const db = new Database(dbPath, { readonly: true });
    try {
      const row = db.prepare(`SELECT content FROM entries WHERE sprint_id = ?`).get('sprint-195') as { content: string };
      expect(row.content).toMatch(/- 195-004: NO_GO/);
    } finally {
      db.close();
    }
  });

  it('rejects an empty entries array', () => {
    expect(() => runReclassify({ dbPath, entries: [], decisionsDir })).toThrow(/No reclassify/);
  });
});
