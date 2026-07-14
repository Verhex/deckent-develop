// tests/core/routing/learning-cells.test.ts
//
// Sprint-446 Task 446-012 — learning-cells sidecar module. Hermetic: every
// fixture project lives under a throwaway os.tmpdir() sandbox created per
// test and removed in afterEach (CUSTOM Test Hermeticity) — this suite NEVER
// touches the real project's `.deckent/stats/routing-cells.json`.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  readCellsSnapshot,
  recordOutcome,
  buildCellKey,
  CELLS_SCHEMA_VERSION,
  CELLS_RELATIVE_PATH,
  RECENT_KEYS_RING_CAP,
  type RecordOutcomeInput,
} from '../../../src/core/routing/learning-cells.js';
import { InvalidWorkTypeError } from '../../../src/core/routing/types.js';

const sandboxes: string[] = [];

function makeSandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), 'deckent-learning-cells-'));
  sandboxes.push(dir);
  return dir;
}

function baseInput(overrides: Partial<RecordOutcomeInput> = {}): RecordOutcomeInput {
  return {
    taskId: 'task-1',
    sprintId: 'sprint-446',
    workType: 'build',
    domain: 'core/runtime',
    agentId: 'implementer',
    verdict: 'DONE',
    quality: 80,
    ...overrides,
  };
}

afterEach(() => {
  while (sandboxes.length > 0) {
    const dir = sandboxes.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe('readCellsSnapshot — fresh project', () => {
  it('returns an empty, schema-valid, deep-frozen snapshot when no ledger file exists yet', () => {
    const root = makeSandbox();

    const snapshot = readCellsSnapshot(root);

    expect(snapshot).toEqual({ schemaVersion: CELLS_SCHEMA_VERSION, cells: {}, recentKeys: [], rejectedOutcomes: {} });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.cells)).toBe(true);
    expect(Object.isFrozen(snapshot.recentKeys)).toBe(true);
  });

  it('degrades a corrupt/malformed existing file to an empty valid snapshot rather than throwing', () => {
    const root = makeSandbox();
    const dir = join(root, '.deckent', 'stats');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'routing-cells.json'), '{ not valid json ', 'utf8');

    expect(() => readCellsSnapshot(root)).not.toThrow();
    const snapshot = readCellsSnapshot(root);
    expect(snapshot).toEqual({ schemaVersion: CELLS_SCHEMA_VERSION, cells: {}, recentKeys: [], rejectedOutcomes: {} });
  });

  it('degrades a well-formed-JSON-but-wrong-shape file (cells as an array) to an empty valid snapshot', () => {
    const root = makeSandbox();
    const dir = join(root, '.deckent', 'stats');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'routing-cells.json'), JSON.stringify({ schemaVersion: 1, cells: [], recentKeys: 'nope' }), 'utf8');

    const snapshot = readCellsSnapshot(root);
    expect(snapshot.cells).toEqual({});
    expect(snapshot.recentKeys).toEqual([]);
  });
});

describe('recordOutcome — write + accumulate', () => {
  it('creates the ledger file on disk at the exact relative path and readCellsSnapshot reflects it', () => {
    const root = makeSandbox();

    const result = recordOutcome(root, baseInput());

    expect(result).toEqual({ recorded: true, cellKey: buildCellKey('build', 'core/runtime', 'implementer') });

    const snapshot = readCellsSnapshot(root);
    expect(snapshot.schemaVersion).toBe(CELLS_SCHEMA_VERSION);
    expect(snapshot.cells[result.cellKey]).toEqual({
      uses: 1,
      successes: 1,
      qualitySum: 80,
      lastSprint: 'sprint-446',
    });
    expect(readdirSync(join(root, '.deckent', 'stats'))).toContain('routing-cells.json');
  });

  it('accumulates uses/successes/qualitySum across TWO DIFFERENT tasks that share the same cell identity', () => {
    const root = makeSandbox();

    recordOutcome(root, baseInput({ taskId: 'task-1', sprintId: 'sprint-446', quality: 80, verdict: 'DONE' }));
    const second = recordOutcome(
      root,
      baseInput({ taskId: 'task-2', sprintId: 'sprint-446', quality: 60, verdict: 'GO_WITH_TECH_DEBT' }),
    );

    expect(second.recorded).toBe(true);
    const snapshot = readCellsSnapshot(root);
    const cell = snapshot.cells[buildCellKey('build', 'core/runtime', 'implementer')];
    expect(cell).toEqual({ uses: 2, successes: 2, qualitySum: 140, lastSprint: 'sprint-446' });
  });

  it('a NO_GO verdict increments uses and qualitySum but NOT successes', () => {
    const root = makeSandbox();

    recordOutcome(root, baseInput({ verdict: 'NO_GO', quality: 10 }));

    const snapshot = readCellsSnapshot(root);
    const cell = snapshot.cells[buildCellKey('build', 'core/runtime', 'implementer')];
    expect(cell).toEqual({ uses: 1, successes: 0, qualitySum: 10, lastSprint: 'sprint-446' });
  });

  it('two DISTINCT work-type/domain/agent shapes each get their OWN independent cell (K4 pin — no cross-task DNA sharing)', () => {
    const root = makeSandbox();

    recordOutcome(
      root,
      baseInput({ taskId: 'task-A', workType: 'build', domain: 'core/runtime', agentId: 'implementer', quality: 90 }),
    );
    recordOutcome(
      root,
      baseInput({ taskId: 'task-B', workType: 'document', domain: 'docs', agentId: 'doc-writer', quality: 40 }),
    );

    const snapshot = readCellsSnapshot(root);
    const cellA = snapshot.cells[buildCellKey('build', 'core/runtime', 'implementer')];
    const cellB = snapshot.cells[buildCellKey('document', 'docs', 'doc-writer')];

    expect(cellA).toEqual({ uses: 1, successes: 1, qualitySum: 90, lastSprint: 'sprint-446' });
    expect(cellB).toEqual({ uses: 1, successes: 1, qualitySum: 40, lastSprint: 'sprint-446' });
    // Neither cell's stats leaked into the other's identity.
    expect(Object.keys(snapshot.cells).sort()).toEqual(
      [buildCellKey('build', 'core/runtime', 'implementer'), buildCellKey('document', 'docs', 'doc-writer')].sort(),
    );
  });

  it('throws InvalidWorkTypeError for a work-type outside the 8 closed-core types, without writing anything', () => {
    const root = makeSandbox();

    expect(() =>
      recordOutcome(root, baseInput({ workType: 'not-a-real-work-type' as unknown as RecordOutcomeInput['workType'] })),
    ).toThrow(InvalidWorkTypeError);

    expect(() => readdirSync(join(root, '.deckent', 'stats'))).toThrow();
  });
});

describe('recordOutcome — idempotency per (taskId, sprintId)', () => {
  it('a second call with the SAME (taskId, sprintId) is a no-op: recorded=false, no double count', () => {
    const root = makeSandbox();

    const first = recordOutcome(root, baseInput({ taskId: 'task-1', sprintId: 'sprint-446' }));
    const retry = recordOutcome(root, baseInput({ taskId: 'task-1', sprintId: 'sprint-446', quality: 999 }));

    expect(first.recorded).toBe(true);
    expect(retry.recorded).toBe(false);
    expect(retry.cellKey).toBe(first.cellKey);

    const snapshot = readCellsSnapshot(root);
    const cell = snapshot.cells[first.cellKey];
    // qualitySum did NOT pick up the retry's 999 — proves the retry never touched the cell.
    expect(cell).toEqual({ uses: 1, successes: 1, qualitySum: 80, lastSprint: 'sprint-446' });
  });

  it('the SAME taskId in a DIFFERENT sprint is treated as a distinct (taskId, sprintId) pair and records again', () => {
    const root = makeSandbox();

    recordOutcome(root, baseInput({ taskId: 'task-1', sprintId: 'sprint-446' }));
    const again = recordOutcome(root, baseInput({ taskId: 'task-1', sprintId: 'sprint-447' }));

    expect(again.recorded).toBe(true);
    const snapshot = readCellsSnapshot(root);
    const cell = snapshot.cells[buildCellKey('build', 'core/runtime', 'implementer')];
    expect(cell?.uses).toBe(2);
    expect(cell?.lastSprint).toBe('sprint-447');
  });

  it('the bounded recentKeys ring never grows past RECENT_KEYS_RING_CAP', () => {
    const root = makeSandbox();

    const total = RECENT_KEYS_RING_CAP + 25;
    for (let i = 0; i < total; i++) {
      recordOutcome(root, baseInput({ taskId: `task-${i}`, sprintId: 'sprint-446' }));
    }

    const snapshot = readCellsSnapshot(root);
    expect(snapshot.recentKeys.length).toBe(RECENT_KEYS_RING_CAP);
    // The oldest keys were evicted; the most recent one is still present.
    expect(snapshot.recentKeys).toContain(`task-${total - 1}|sprint-446`);
    expect(snapshot.recentKeys).not.toContain('task-0|sprint-446');
  });
});

describe('recordOutcome — atomicity', () => {
  it('leaves no leftover *.tmp file behind in .deckent/stats/ after a successful write', () => {
    const root = makeSandbox();

    recordOutcome(root, baseInput());

    const entries = readdirSync(join(root, '.deckent', 'stats'));
    expect(entries.some((f) => f.endsWith('.tmp'))).toBe(false);
    expect(entries).toEqual(['routing-cells.json']);
  });
});
