import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { HeartbeatDaemon } from '../../src/orchestra/heartbeat-daemon.js';
import { HandoffProtocol } from '../../src/orchestra/handoff-protocol.js';
import {
  wireHandoffsForCompletedTasks,
  createAndStartHeartbeatDaemon,
} from '../../src/orchestra/sprint-controller.js';
import type { Sprint, Task, TaskResult } from '../../src/core/types.js';
import { TaskStatus, SprintPhase, SprintStatus } from '../../src/core/types.js';
import type { HeartbeatRunResult } from '../../src/orchestra/heartbeat-daemon.js';

// ─── Fixtures ──────────────────────────────────────────────────────

const EMPTY_HB_RESULT: HeartbeatRunResult = {
  total: 0, executed: 0, passed: 0, failed: 0, details: [],
};

function buildTask(id: string, deps: string[] = []): Task {
  return {
    id,
    title: `Task ${id}`,
    description: 'test task',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: deps,
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: TaskStatus.DONE,
    sprintId: 'sprint-230',
    createdAt: new Date().toISOString(),
  };
}

function buildSprint(tasks: { id: string; deps?: string[] }[]): Sprint {
  return {
    id: 'sprint-230',
    number: 230,
    phase: SprintPhase.EXECUTE,
    status: SprintStatus.ACTIVE,
    tasks: tasks.map(({ id, deps = [] }) => buildTask(id, deps)),
    workers: [],
    startedAt: new Date().toISOString(),
  };
}

function buildResult(
  taskId: string,
  selfAssessment: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO',
  filesChanged: string[] = [],
): TaskResult {
  return {
    taskId,
    filesChanged,
    linesAdded: filesChanged.length * 5,
    linesRemoved: 0,
    testsPassed: selfAssessment !== 'NO_GO',
    coverage: 80,
    selfAssessment,
  };
}

// ─── HandoffProtocol wire tests ─────────────────────────────────────

describe('wireHandoffsForCompletedTasks', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'coord-handoff-'));
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('creates handoff with ready status when artifact files exist', () => {
    // Create artifact file so executeHandoff marks it ready
    mkdirSync(join(tmpRoot, 'src'), { recursive: true });
    writeFileSync(join(tmpRoot, 'src', 'foo.ts'), '// artifact');

    const sprint = buildSprint([
      { id: '001', deps: [] },
      { id: '002', deps: ['001'] },
    ]);
    const results = [buildResult('001', 'DONE', ['src/foo.ts'])];

    wireHandoffsForCompletedTasks(tmpRoot, sprint, results);

    const protocol = new HandoffProtocol(tmpRoot);
    const handoffs = protocol.listHandoffs();
    expect(handoffs).toHaveLength(1);
    expect(handoffs[0].fromTaskId).toBe('001');
    expect(handoffs[0].toTaskId).toBe('002');
    expect(handoffs[0].artifacts).toContain('src/foo.ts');
    expect(handoffs[0].status).toBe('ready');
  });

  it('skips handoff for NO_GO results', () => {
    const sprint = buildSprint([
      { id: '001', deps: [] },
      { id: '002', deps: ['001'] },
    ]);
    const results = [buildResult('001', 'NO_GO', ['src/bar.ts'])];

    wireHandoffsForCompletedTasks(tmpRoot, sprint, results);

    const protocol = new HandoffProtocol(tmpRoot);
    expect(protocol.listHandoffs()).toHaveLength(0);
  });

  it('skips handoff when filesChanged is empty', () => {
    const sprint = buildSprint([
      { id: '001', deps: [] },
      { id: '002', deps: ['001'] },
    ]);
    const results = [buildResult('001', 'DONE', [])];

    wireHandoffsForCompletedTasks(tmpRoot, sprint, results);

    const protocol = new HandoffProtocol(tmpRoot);
    expect(protocol.listHandoffs()).toHaveLength(0);
  });
});

// ─── HeartbeatDaemon lifecycle tests ───────────────────────────────

describe('createAndStartHeartbeatDaemon', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'coord-hb-'));
    vi.restoreAllMocks();
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('starts daemon when enabled=true (SPAWN-phase wire)', () => {
    const startSpy = vi.spyOn(HeartbeatDaemon.prototype, 'start')
      .mockReturnValue(EMPTY_HB_RESULT);

    const daemon = createAndStartHeartbeatDaemon(tmpRoot, true);

    expect(daemon).not.toBeNull();
    expect(startSpy).toHaveBeenCalledTimes(1);
  });

  it('stop() is called on daemon (CLEANUP-phase wire)', () => {
    vi.spyOn(HeartbeatDaemon.prototype, 'start').mockReturnValue(EMPTY_HB_RESULT);
    const stopSpy = vi.spyOn(HeartbeatDaemon.prototype, 'stop')
      .mockImplementation(() => { /* no-op */ });

    const daemon = createAndStartHeartbeatDaemon(tmpRoot, true);
    expect(daemon).not.toBeNull();

    daemon!.stop();

    expect(stopSpy).toHaveBeenCalledTimes(1);
  });

  it('opt-out: returns null and does not start when enabled=false', () => {
    const startSpy = vi.spyOn(HeartbeatDaemon.prototype, 'start')
      .mockReturnValue(EMPTY_HB_RESULT);

    const daemon = createAndStartHeartbeatDaemon(tmpRoot, false);

    expect(daemon).toBeNull();
    expect(startSpy).not.toHaveBeenCalled();
  });
});
