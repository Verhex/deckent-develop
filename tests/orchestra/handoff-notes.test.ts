import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { HandoffProtocol } from '../../src/orchestra/handoff-protocol.js';
import { wireHandoffsForCompletedTasks } from '../../src/orchestra/sprint-controller.js';
import type { Sprint, Task, TaskResult } from '../../src/core/types.js';
import { TaskStatus, SprintPhase, SprintStatus } from '../../src/core/types.js';

// ─── Fixtures ─────────────────────────────────────────────────────────

function buildTask(id: string, deps: string[] = []): Task {
  return {
    id,
    title: `Task ${id}`,
    description: 'test',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: deps,
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: TaskStatus.DONE,
    sprintId: 'sprint-278',
    createdAt: new Date().toISOString(),
  };
}

function buildSprint(tasks: { id: string; deps?: string[] }[]): Sprint {
  return {
    id: 'sprint-278',
    number: 278,
    phase: SprintPhase.EXECUTE,
    status: SprintStatus.ACTIVE,
    tasks: tasks.map(({ id, deps = [] }) => buildTask(id, deps)),
    workers: [],
    startedAt: new Date().toISOString(),
  };
}

function buildResult(
  taskId: string,
  filesChanged: string[],
  handoffNotes?: string,
): TaskResult {
  const result: TaskResult = {
    taskId,
    filesChanged,
    linesAdded: filesChanged.length * 5,
    linesRemoved: 0,
    testsPassed: true,
    coverage: 90,
    selfAssessment: 'DONE',
  };
  if (handoffNotes !== undefined) {
    result.handoffNotes = handoffNotes;
  }
  return result;
}

// ─── HandoffProtocol — notes field ────────────────────────────────────

describe('HandoffProtocol.createHandoff — notes', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'handoff-notes-'));
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('stores notes when provided', () => {
    const hp = new HandoffProtocol(tmpRoot);
    const handoff = hp.createHandoff('t1', 't2', ['src/a.ts'], 'use updated schema from t1');
    expect(handoff.notes).toBe('use updated schema from t1');
  });

  it('omits notes field when not provided (backward compat)', () => {
    const hp = new HandoffProtocol(tmpRoot);
    const handoff = hp.createHandoff('t1', 't2', ['src/a.ts']);
    expect(handoff.notes).toBeUndefined();
    // notes key should not be in the persisted JSON
    expect('notes' in handoff).toBe(false);
  });

  it('persists notes to disk and listHandoffs returns them', () => {
    const hp = new HandoffProtocol(tmpRoot);
    hp.createHandoff('t1', 't2', ['src/a.ts'], 'downstream hint');
    const list = hp.listHandoffs();
    expect(list).toHaveLength(1);
    expect(list[0].notes).toBe('downstream hint');
  });

  it('listHandoffs returns handoff without notes when none was set', () => {
    const hp = new HandoffProtocol(tmpRoot);
    hp.createHandoff('t1', 't2', ['src/a.ts']);
    const list = hp.listHandoffs();
    expect(list).toHaveLength(1);
    expect(list[0].notes).toBeUndefined();
  });
});

// ─── wireHandoffsForCompletedTasks — handoffNotes propagation ─────────

describe('wireHandoffsForCompletedTasks — handoffNotes propagation', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'wire-handoff-notes-'));
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('passes handoffNotes from result to handoff.notes', () => {
    mkdirSync(join(tmpRoot, 'src'), { recursive: true });
    writeFileSync(join(tmpRoot, 'src', 'output.ts'), '// output');

    const sprint = buildSprint([
      { id: '278-001', deps: [] },
      { id: '278-002', deps: ['278-001'] },
    ]);
    const result = buildResult('278-001', ['src/output.ts'], 'schema ready, use v2 interface');
    wireHandoffsForCompletedTasks(tmpRoot, sprint, [result]);

    const hp = new HandoffProtocol(tmpRoot);
    const handoffs = hp.listHandoffs();
    expect(handoffs).toHaveLength(1);
    expect(handoffs[0].notes).toBe('schema ready, use v2 interface');
  });

  it('creates handoff without notes when result has no handoffNotes', () => {
    mkdirSync(join(tmpRoot, 'src'), { recursive: true });
    writeFileSync(join(tmpRoot, 'src', 'output.ts'), '// output');

    const sprint = buildSprint([
      { id: '278-001', deps: [] },
      { id: '278-002', deps: ['278-001'] },
    ]);
    const result = buildResult('278-001', ['src/output.ts']);
    wireHandoffsForCompletedTasks(tmpRoot, sprint, [result]);

    const hp = new HandoffProtocol(tmpRoot);
    const handoffs = hp.listHandoffs();
    expect(handoffs).toHaveLength(1);
    expect(handoffs[0].notes).toBeUndefined();
  });

  it('propagates same handoffNotes to multiple downstream tasks', () => {
    mkdirSync(join(tmpRoot, 'src'), { recursive: true });
    writeFileSync(join(tmpRoot, 'src', 'output.ts'), '// output');

    const sprint = buildSprint([
      { id: 'A', deps: [] },
      { id: 'B', deps: ['A'] },
      { id: 'C', deps: ['A'] },
    ]);
    const result = buildResult('A', ['src/output.ts'], 'shared note for B and C');
    wireHandoffsForCompletedTasks(tmpRoot, sprint, [result]);

    const hp = new HandoffProtocol(tmpRoot);
    const handoffs = hp.listHandoffs();
    expect(handoffs).toHaveLength(2);
    for (const h of handoffs) {
      expect(h.notes).toBe('shared note for B and C');
    }
  });
});
