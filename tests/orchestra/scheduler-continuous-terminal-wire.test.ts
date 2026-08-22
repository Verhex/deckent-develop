import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let failResultReceipt = false;
const persistedPaths: string[] = [];

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    writeFileSync: (path: unknown, data: unknown, encoding?: unknown) => {
      const rendered = String(path);
      persistedPaths.push(rendered);
      if (failResultReceipt && rendered.endsWith('.result.tmp')) {
        throw new Error('simulated receipt persistence failure');
      }
      return (actual.writeFileSync as (...args: unknown[]) => void)(path, data, encoding);
    },
  };
});

vi.mock('../../src/orchestra/task-builder.js', () => ({
  buildWorkerPrompt: vi.fn(() => 'unused'),
}));

vi.mock('../../src/orchestra/tmux.js', () => ({
  spawnWorker: vi.fn(),
  killWorker: vi.fn(),
}));

import { SprintPhase, SprintStatus, TaskStatus } from '../../src/core/types.js';
import type { ResolvedConfig, Sprint, Task } from '../../src/core/types.js';
import { createSchedulerDriver } from '../../src/orchestra/scheduler-driver.js';
import type { SchedulerDriverDeps } from '../../src/orchestra/scheduler-driver.js';

function makeRoot(): string {
  const root = join(tmpdir(), `scheduler-terminal-wire-${randomBytes(4).toString('hex')}`);
  mkdirSync(join(root, '.tasks'), { recursive: true });
  return root;
}

function makeTask(id: string, status: TaskStatus, dependencies: string[] = []): Task {
  return {
    id,
    title: id,
    description: id,
    model: 'claude-sonnet-5',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'terminal-wire-test',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies,
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
    status,
    sprintId: 'sprint-terminal-wire',
    assignedAgent: 'generic',
    assignedSkills: [],
  } as Task;
}

function makeDeps(root: string, paused: Task, checkpoint: (reason: string) => void): SchedulerDriverDeps {
  const failed = makeTask('failed-root', TaskStatus.NO_GO);
  const sprint = {
    id: 'sprint-terminal-wire',
    number: 621,
    status: SprintStatus.ACTIVE,
    phase: SprintPhase.EXECUTE,
    tasks: [failed, paused],
    workers: [],
    planningMode: 'structured',
  } as Sprint;
  const config = {
    dependency_pipeline_enabled: true,
    fix_phase_enabled: false,
    max_fix_retries: 0,
  } as ResolvedConfig;
  return {
    sprint,
    config,
    remainingQueue: [],
    assignedTaskIds: new Set(),
    collectedIds: new Set(),
    getSlotBudget: () => 1,
    getCostStop: () => false,
    spawnDeps: {
      projectRoot: root,
      sprintFallbackId: sprint.id,
      config,
      resolveAgentPrompt: async () => undefined,
      resolveSkillPrompts: async () => [],
      buildWriteTargets: () => [],
    },
    killWorker: vi.fn(),
    writeCheckpoint: checkpoint,
  };
}

describe('production driver continuous-idle terminal closure', () => {
  let root: string;

  beforeEach(() => {
    root = makeRoot();
    failResultReceipt = false;
    persistedPaths.length = 0;
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('persists the receipt, transitions the PAUSED task, then checkpoints once; a duplicate tick is a no-op', async () => {
    const paused = makeTask('paused-child', TaskStatus.PAUSED, ['failed-root']);
    const observedAtCheckpoint: Array<{ reason: string; status: TaskStatus; receipt: boolean; task: boolean }> = [];
    const deps = makeDeps(root, paused, reason => {
      observedAtCheckpoint.push({
        reason,
        status: paused.status,
        receipt: existsSync(join(root, '.tasks/task-paused-child.result')),
        task: existsSync(join(root, '.tasks/task-paused-child.json')),
      });
    });
    const driver = createSchedulerDriver('reducer', deps);

    await driver({ trigger: 'watcher', completedTaskIds: [], runLegacyTick: vi.fn() });

    expect(paused.status).toBe(TaskStatus.NO_GO);
    expect(observedAtCheckpoint).toEqual([{
      reason: 'tick-progressed', status: TaskStatus.NO_GO, receipt: true, task: true,
    }]);
    const receipt = JSON.parse(readFileSync(join(root, '.tasks/task-paused-child.result'), 'utf-8')) as { cascadeSkipped?: boolean };
    expect(receipt.cascadeSkipped).toBe(true);
    expect(persistedPaths.findIndex(path => path.endsWith('.result.tmp')))
      .toBeLessThan(persistedPaths.findIndex(path => path.endsWith('task-paused-child.json')));

    await driver({ trigger: 'watcher', completedTaskIds: [], runLegacyTick: vi.fn() });
    expect(observedAtCheckpoint).toHaveLength(1);
    expect(persistedPaths.filter(path => path.endsWith('.result.tmp'))).toHaveLength(1);
  });

  it('does not terminalize or checkpoint when receipt persistence fails', async () => {
    const paused = makeTask('paused-child', TaskStatus.PAUSED, ['failed-root']);
    const checkpoint = vi.fn();
    const driver = createSchedulerDriver('reducer', makeDeps(root, paused, checkpoint));
    failResultReceipt = true;

    await driver({ trigger: 'watcher', completedTaskIds: [], runLegacyTick: vi.fn() });

    expect(paused.status).toBe(TaskStatus.PAUSED);
    expect(existsSync(join(root, '.tasks/task-paused-child.result'))).toBe(false);
    expect(existsSync(join(root, '.tasks/task-paused-child.json'))).toBe(false);
    // The reducer emitted a checkpoint effect, but it cannot describe durable
    // progress when the prerequisite terminal receipt failed.
    expect(checkpoint).not.toHaveBeenCalled();
  });
});
