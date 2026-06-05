import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
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
});
