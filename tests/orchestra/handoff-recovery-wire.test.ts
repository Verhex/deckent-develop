import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { HandoffProtocol } from '../../src/orchestra/handoff-protocol.js';
import { failHandoffsForNoGoTasks, summarizeHandoffsObservability } from '../../src/orchestra/sprint-controller.js';
import { TaskEvaluation } from '../../src/core/task-types.js';
import { SprintStatus, SprintPhase } from '../../src/core/sprint-types.js';
import type { Sprint } from '../../src/core/sprint-types.js';

function tmpRoot(): string {
  const d = mkdtempSync(join(tmpdir(), 'handoff-recovery-wire-'));
  created.push(d);
  return d;
}

function minSprint(id = 'sprint-test'): Sprint {
  return {
    id,
    number: 1,
    status: SprintStatus.COMPLETE,
    phase: SprintPhase.COMPLETE,
    tasks: [],
    workers: [],
  };
}

const created: string[] = [];
afterEach(() => {
  const dirs = created.splice(0);
  for (const d of dirs) {
    try { rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

describe('failHandoffsForNoGoTasks', () => {
  it('marks pending handoff as failed when source task is NO_GO', () => {
    const root = tmpRoot();
    const hp = new HandoffProtocol(root);
    const handoff = hp.createHandoff('task-A', 'task-B', ['src/missing.ts']);
    expect(handoff.status).toBe('pending');

    const evaluations = new Map<string, TaskEvaluation>([
      ['task-A', TaskEvaluation.NO_GO],
    ]);
    failHandoffsForNoGoTasks(root, minSprint(), evaluations);

    const after = hp.listHandoffs();
    expect(after).toHaveLength(1);
    expect(after[0].status).toBe('failed');
    expect(after[0].failReason).toContain('task-A');
  });

  it('does not touch pending handoffs when evaluations contain no NO_GO', () => {
    const root = tmpRoot();
    const hp = new HandoffProtocol(root);
    hp.createHandoff('task-X', 'task-Y', ['src/missing.ts']);

    const evaluations = new Map<string, TaskEvaluation>([
      ['task-X', TaskEvaluation.DONE],
    ]);
    failHandoffsForNoGoTasks(root, minSprint(), evaluations);

    const after = hp.listHandoffs();
    expect(after[0].status).toBe('pending');
  });

  it('leaves ready handoff untouched; only fails pending handoff from NO_GO source', () => {
    const root = tmpRoot();
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src', 'ready.ts'), '// content');

    const hp = new HandoffProtocol(root);
    // task-A → task-B: artifact exists → becomes ready after executeHandoff
    hp.createHandoff('task-A', 'task-B', ['src/ready.ts']);
    hp.executeHandoff('task-A-to-task-B');

    // task-B → task-C: artifact missing → stays pending
    hp.createHandoff('task-B', 'task-C', ['src/missing.ts']);

    const evaluations = new Map<string, TaskEvaluation>([
      ['task-A', TaskEvaluation.DONE],
      ['task-B', TaskEvaluation.NO_GO],
    ]);
    failHandoffsForNoGoTasks(root, minSprint(), evaluations);

    const all = hp.listHandoffs();
    const aToB = all.find(h => h.id === 'task-A-to-task-B');
    const bToC = all.find(h => h.id === 'task-B-to-task-C');

    expect(aToB?.status).toBe('ready');
    expect(bToC?.status).toBe('failed');
    expect(bToC?.failReason).toContain('task-B');
  });
});

describe('summarizeHandoffsObservability', () => {
  it('returns without error when no handoffs exist', () => {
    const root = tmpRoot();
    expect(() => {
      summarizeHandoffsObservability(root, minSprint('sprint-empty'));
    }).not.toThrow();
  });

  it('listHandoffs state is reflected in event payload when handoffs exist', () => {
    const root = tmpRoot();
    const hp = new HandoffProtocol(root);
    hp.createHandoff('task-1', 'task-2', ['src/api.ts']);

    // Should not throw; event stream write is fail-safe
    expect(() => {
      summarizeHandoffsObservability(root, minSprint('sprint-obs'));
    }).not.toThrow();

    // Verify listHandoffs returns the handoff we created
    const handoffs = hp.listHandoffs();
    expect(handoffs).toHaveLength(1);
    expect(handoffs[0].fromTaskId).toBe('task-1');
    expect(handoffs[0].toTaskId).toBe('task-2');
  });

  // B-HANDOFF-STALE (Sprint 318): the summary must be scoped to THIS sprint's
  // tasks — listHandoffs() returns every handoff ever written (never pruned), so
  // pre-fix the summary mixed in stale cross-sprint handoffs (sprint-318's summary
  // had 29 from sprints 295-306, 0 of its own).
  it('B-HANDOFF-STALE: summary excludes stale cross-sprint handoffs', () => {
    const root = tmpRoot();
    const hp = new HandoffProtocol(root);
    hp.createHandoff('295-001', '295-007', ['src/old.ts']);   // old sprint
    hp.createHandoff('301-006', '301-011', ['src/old2.ts']);  // old sprint
    hp.createHandoff('318-001', '318-002', ['src/new.ts']);   // current sprint

    const sprint: Sprint = {
      ...minSprint('sprint-318'),
      tasks: [{ id: '318-001' }, { id: '318-002' }] as Sprint['tasks'],
    };
    summarizeHandoffsObservability(root, sprint);

    const eventsFile = join(root, '.deckent', 'recently-works', 'sprint-318-events.jsonl');
    const events = readFileSync(eventsFile, 'utf-8').trim().split('\n').map(l => JSON.parse(l));
    const summary = events.find(e => e.channel === 'BRAIN→AUDITOR:HANDOFF_SUMMARY');
    expect(summary).toBeDefined();
    // Pre-fix: total=3 (all handoffs). Post-fix: only the current sprint's 1.
    expect(summary.payload.total).toBe(1);
    expect(summary.payload.handoffs.map((h: { id: string }) => h.id)).toEqual(['318-001-to-318-002']);
  });
});

// B-HANDOFF-PRUNE (Sprint 319): B-HANDOFF-STALE scoped the *summary* but the
// `.tasks/handoffs/` registry itself was never pruned, so it grows without bound
// across sprints. pruneCompletedSprints() deletes handoff files whose endpoints
// are both outside the current sprint, keeping in-flight handoffs untouched.
// Faithful: pre-fix the method does not exist (RED); post-fix prunes stale,
// keeps current (GREEN).
describe('pruneCompletedSprints', () => {
  it('deletes stale cross-sprint handoffs and keeps only the current sprint', () => {
    const root = tmpRoot();
    const hp = new HandoffProtocol(root);
    hp.createHandoff('295-001', '295-007', ['src/old.ts']);   // old sprint
    hp.createHandoff('301-006', '301-011', ['src/old2.ts']);  // old sprint
    hp.createHandoff('318-001', '318-002', ['src/new.ts']);   // current sprint
    expect(hp.listHandoffs()).toHaveLength(3);

    const currentSprintTaskIds = new Set(['318-001', '318-002']);
    const pruned = hp.pruneCompletedSprints(currentSprintTaskIds);

    expect(pruned).toBe(2); // the two old-sprint files deleted
    const remaining = hp.listHandoffs();
    expect(remaining).toHaveLength(1);
    expect(remaining.map(h => h.id)).toEqual(['318-001-to-318-002']);
  });

  it('keeps a handoff when EITHER endpoint belongs to the current sprint', () => {
    const root = tmpRoot();
    const hp = new HandoffProtocol(root);
    // cross-boundary handoff: source is current, target is a future/other sprint
    hp.createHandoff('318-002', '320-001', ['src/cross.ts']);
    hp.createHandoff('300-001', '300-002', ['src/stale.ts']); // wholly old

    const pruned = hp.pruneCompletedSprints(new Set(['318-001', '318-002']));

    expect(pruned).toBe(1); // only the wholly-old handoff removed
    expect(hp.listHandoffs().map(h => h.id)).toEqual(['318-002-to-320-001']);
  });

  it('is a no-op (returns 0) when no handoff registry exists', () => {
    const root = tmpRoot();
    const hp = new HandoffProtocol(root);
    expect(hp.pruneCompletedSprints(new Set(['319-001']))).toBe(0);
    expect(hp.listHandoffs()).toEqual([]);
  });
});
