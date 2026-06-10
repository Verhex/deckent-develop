// ─── Sprint 278 COMM-1 — Worker-to-Worker Comms E2E Smoke ───────────────────
// Hermetic e2e: real tmpdir, mock spawn, no real workers.
//
// Covers the full pipeline from Worker A's .result sharedNotes/handoffNotes all
// the way to Worker B's prompt containing the shared-context and upstream-handoff
// blocks inserted by task-builder (T3+T4).
//
// Pipeline under test:
//   A .result → T2 (result-collector → SharedMemory)
//             + T5 (sprint-controller → HandoffProtocol)
//             → T3+T4 (buildWorkerPrompt reads both → B prompt blocks)

import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

// ─── Module mocks for result-collector side-effects ─────────────────────────
// Mock tmux so spawnWorker/killWorker don't try to connect to a tmux session.
// Mock result-watcher so createResultWatcher doesn't create real fs.watch handles.
// NOTE: task-builder is NOT mocked — buildWorkerPrompt must run for real (T3+T4).

vi.mock('../../src/orchestra/tmux.js', () => ({
  spawnWorker: vi.fn(),
  killWorker: vi.fn(),
}));

vi.mock('../../src/orchestra/result-watcher.js', () => ({
  createResultWatcher: vi.fn(() => ({
    // waitForChange never resolves — but waitForResults returns early (all tasks
    // collected) before entering the watcher loop, so this is never awaited.
    waitForChange: vi.fn(() => new Promise<void>(() => {})),
    close: vi.fn(),
  })),
}));

// ─── Production imports ───────────────────────────────────────────────────────

import type { Task, Sprint, TaskResult, ResolvedConfig } from '../../src/core/types.js';
import { TaskStatus, SprintPhase, SprintStatus } from '../../src/core/types.js';
import { waitForResults, getSharedMemory } from '../../src/orchestra/result-collector.js';
import { wireHandoffsForCompletedTasks } from '../../src/orchestra/sprint-controller.js';
import { buildWorkerPrompt } from '../../src/orchestra/task-builder.js';
import { HandoffProtocol } from '../../src/orchestra/handoff-protocol.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  const dir = join(
    tmpdir(),
    `deckent-e2e-comms-${randomBytes(4).toString('hex')}`,
  );
  mkdirSync(join(dir, '.tasks'), { recursive: true });
  mkdirSync(join(dir, '.deckent'), { recursive: true });
  return dir;
}

/** Write `.deckent/config.json` with worker_comms block for buildWorkerPrompt to read. */
function writeCommsConfig(dir: string, enabled: boolean): void {
  writeFileSync(
    join(dir, '.deckent', 'config.json'),
    JSON.stringify({
      worker_comms: {
        enabled,
        shared_memory_ttl_ms: 3_600_000,
        inject_handoffs: true,
        inject_shared: true,
      },
    }),
    'utf-8',
  );
}

function makeTask(id: string, deps: string[] = []): Task {
  return {
    id,
    title: `Task ${id}`,
    description: 'worker comms e2e task',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'e2e comms test',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: deps,
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: 'none' },
    status: TaskStatus.EXECUTING,
    sprintId: 'sprint-comms',
    createdAt: new Date().toISOString(),
    assignedAgent: 'generic',
    assignedSkills: [],
  } as Task;
}

function makeSprint(tasks: Task[]): Sprint {
  return {
    id: 'sprint-comms',
    number: 1,
    tasks,
    workers: tasks.map(t => `w-${t.id}`),
    phase: SprintPhase.EXECUTE,
    status: SprintStatus.ACTIVE,
    startedAt: new Date().toISOString(),
  } as Sprint;
}

/** Build the ResolvedConfig passed to waitForResults (not read from disk). */
function makeCollectConfig(enabled: boolean): ResolvedConfig {
  return {
    worker_comms: {
      enabled,
      shared_memory_ttl_ms: 3_600_000,
      inject_handoffs: true,
      inject_shared: true,
    },
  } as unknown as ResolvedConfig;
}

function writeResult(dir: string, taskId: string, result: TaskResult): void {
  writeFileSync(
    join(dir, '.tasks', `task-${taskId}.result`),
    JSON.stringify(result),
    'utf-8',
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('worker-comms-flow e2e', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs) {
      try { rmSync(d, { recursive: true, force: true }); } catch { /* best-effort */ }
    }
    dirs.length = 0;
  });

  function tmp(): string {
    const d = makeTmpDir();
    dirs.push(d);
    return d;
  }

  it('T2 bridge: collectResults writes worker sharedNotes into SharedMemory', async () => {
    const dir = tmp();
    writeCommsConfig(dir, true);

    const taskA = makeTask('t2-a');
    const sprint = makeSprint([taskA]);
    const config = makeCollectConfig(true);

    const resultA: TaskResult = {
      taskId: 't2-a',
      workerId: 'w-t2-a',
      filesChanged: [],
      linesAdded: 10,
      linesRemoved: 0,
      testsPassed: true,
      coverage: 90,
      selfAssessment: 'DONE',
      notes: 'done',
      sharedNotes: [
        { key: 'api-schema', value: 'use WorkerCommsConfig interface' },
        { key: 'task-output', value: 'config-types updated' },
      ],
    };
    writeResult(dir, 't2-a', resultA);

    // waitForResults collects result and writes sharedNotes → SharedMemory (T2)
    const results = await waitForResults(dir, sprint, 100, [], undefined, undefined, config);
    expect(results).toHaveLength(1);
    expect(results[0].taskId).toBe('t2-a');

    const sm = getSharedMemory(dir);
    expect(sm.read('api-schema')?.value).toBe('use WorkerCommsConfig interface');
    expect(sm.read('task-output')?.value).toBe('config-types updated');
    expect(sm.listKeys().sort()).toEqual(['api-schema', 'task-output']);
  });

  it('T5 bridge: wireHandoffsForCompletedTasks persists handoffNotes into HandoffProtocol', () => {
    const dir = tmp();

    // Artifact must exist on disk so HandoffProtocol.executeHandoff flips status to 'ready'
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'output.ts'), '// artifact');

    const taskA = { ...makeTask('t5-a'), status: TaskStatus.DONE };
    const taskB = { ...makeTask('t5-b', ['t5-a']), status: TaskStatus.PENDING };
    const sprint = makeSprint([taskA, taskB]);

    const resultA: TaskResult = {
      taskId: 't5-a',
      workerId: 'w-t5-a',
      filesChanged: ['src/output.ts'],
      linesAdded: 5,
      linesRemoved: 0,
      testsPassed: true,
      coverage: 90,
      selfAssessment: 'DONE',
      notes: 'done',
      handoffNotes: 'downstream: schema is ready in output.ts',
    };

    wireHandoffsForCompletedTasks(dir, sprint, [resultA]);

    const hp = new HandoffProtocol(dir);
    const handoffs = hp.listHandoffs();
    expect(handoffs).toHaveLength(1);
    expect(handoffs[0].status).toBe('ready');
    expect(handoffs[0].fromTaskId).toBe('t5-a');
    expect(handoffs[0].toTaskId).toBe('t5-b');
    expect(handoffs[0].notes).toBe('downstream: schema is ready in output.ts');
  });

  it('full roundtrip: Worker A shared notes and handoff message both appear in Worker B prompt', async () => {
    const dir = tmp();
    writeCommsConfig(dir, true);

    // Artifact needed for executeHandoff to flip handoff status → 'ready'
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'e2e-artifact.ts'), '// e2e artifact');

    const taskA = makeTask('e2e-a');
    const taskB = makeTask('e2e-b', ['e2e-a']);
    const config = makeCollectConfig(true);

    const resultA: TaskResult = {
      taskId: 'e2e-a',
      workerId: 'w-e2e-a',
      filesChanged: ['src/e2e-artifact.ts'],
      linesAdded: 12,
      linesRemoved: 0,
      testsPassed: true,
      coverage: 90,
      selfAssessment: 'DONE',
      notes: 'done',
      sharedNotes: [{ key: 'schema-version', value: 'v2.0-final' }],
      handoffNotes: 'schema is at v2.0-final, see src/e2e-artifact.ts',
    };
    writeResult(dir, 'e2e-a', resultA);

    // T2: result-collector processes A's result → writes sharedNotes → SharedMemory
    const sprintA = makeSprint([taskA]);
    await waitForResults(dir, sprintA, 100, [], undefined, undefined, config);

    // T5: sprint-controller creates + executes handoff A → B
    const sprintAB = makeSprint([
      { ...taskA, status: TaskStatus.DONE },
      { ...taskB, status: TaskStatus.PENDING },
    ]);
    wireHandoffsForCompletedTasks(dir, sprintAB, [resultA]);

    // T3+T4: buildWorkerPrompt reads SharedMemory + HandoffProtocol → injects blocks into B
    const taskBForPrompt = { ...taskB, status: TaskStatus.PENDING };
    const prompt = buildWorkerPrompt(taskBForPrompt, undefined, undefined, dir);

    // Worker A's sharedNotes must appear as shared-context in B's prompt
    expect(prompt).toContain('=== Shared Context (other workers) ===');
    expect(prompt).toContain('schema-version');
    expect(prompt).toContain('v2.0-final');

    // Worker A's handoffNotes must appear as upstream-handoff in B's prompt
    expect(prompt).toContain('=== Upstream Handoffs ===');
    expect(prompt).toContain('from e2e-a');
    expect(prompt).toContain('schema is at v2.0-final');
  });

  it('control: disabled worker_comms — no shared-context or handoff blocks in Worker B prompt', async () => {
    const dir = tmp();
    writeCommsConfig(dir, false);  // disabled

    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'ctrl-artifact.ts'), '// ctrl artifact');

    const taskA = makeTask('ctrl-a');
    const taskB = makeTask('ctrl-b', ['ctrl-a']);
    const config = makeCollectConfig(false);  // disabled — no SharedMemory writes

    const resultA: TaskResult = {
      taskId: 'ctrl-a',
      workerId: 'w-ctrl-a',
      filesChanged: ['src/ctrl-artifact.ts'],
      linesAdded: 5,
      linesRemoved: 0,
      testsPassed: true,
      coverage: 90,
      selfAssessment: 'DONE',
      notes: 'done',
      sharedNotes: [{ key: 'hidden-key', value: 'should-not-appear' }],
      handoffNotes: 'this note must not reach B when comms is disabled',
    };
    writeResult(dir, 'ctrl-a', resultA);

    // T2 path with disabled config: SharedMemory write is suppressed
    const sprintA = makeSprint([taskA]);
    await waitForResults(dir, sprintA, 100, [], undefined, undefined, config);

    // wireHandoffsForCompletedTasks wires regardless of comms config — sprint-controller
    // always creates handoffs when deps complete; the gating is in buildWorkerPrompt
    const sprintAB = makeSprint([
      { ...taskA, status: TaskStatus.DONE },
      { ...taskB, status: TaskStatus.PENDING },
    ]);
    wireHandoffsForCompletedTasks(dir, sprintAB, [resultA]);

    // Build B's prompt — comms disabled, so neither block must appear
    const taskBForPrompt = { ...taskB, status: TaskStatus.PENDING };
    const prompt = buildWorkerPrompt(taskBForPrompt, undefined, undefined, dir);

    expect(prompt).not.toContain('=== Shared Context (other workers) ===');
    expect(prompt).not.toContain('hidden-key');
    expect(prompt).not.toContain('=== Upstream Handoffs ===');
    expect(prompt).not.toContain('this note must not reach B');
  });
});
