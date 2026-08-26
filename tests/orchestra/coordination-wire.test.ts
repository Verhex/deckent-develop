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
import type { ModelType } from "../../src/core/types.js";
import { buildWorkerPrompt } from "../../src/orchestra/task-builder.js";
import { writeToolInventory } from "../../src/orchestra/sprint-phases.js";

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

// WIRE-031: physically merged from tests/orchestra/ctx-population-wire.test.ts.
{
function makeTask(id: string, overrides: Partial<Task> = {}): Task {
    return {
        id,
        title: `Task ${id}`,
        description: `Description for ${id}`,
        model: 'sonnet' as ModelType,
        effort: 'normal',
        priority: 'NORMAL',
        reason: 'test',
        scope: { directories: ['src/'], filesRead: [], filesWrite: [`src/${id}.ts`] },
        dependencies: [],
        goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
        status: TaskStatus.PENDING,
        sprintId: 'sprint-428',
        assignedAgent: 'generic',
        assignedSkills: [],
        provider: 'claude',
        ...overrides,
    } as Task;
}

describe('ctx-population-wire (born-674 / 428-001)', () => {
    let root = '';
    afterEach(() => {
        if (root)
            rmSync(root, { recursive: true, force: true });
        root = '';
    });
    describe('toolInventory (readToolInventory wire)', () => {
        it('flows a persisted per-sprint inventory into the rendered env-probe block', () => {
            root = mkdtempSync(join(tmpdir(), 'ctx-pop-inv-'));
            writeToolInventory(root, 'sprint-428', 'python3=yes docker=no rg=yes');
            const task = makeTask('428-101', { sprintId: 'sprint-428' });
            const prompt = buildWorkerPrompt(task, undefined, undefined, root);
            expect(prompt).toContain('## Environment Tool Inventory');
            expect(prompt).toContain('python3=yes docker=no rg=yes');
        });
        it('renders byte-identical legacy output (no env-probe block) when no inventory was ever persisted', () => {
            root = mkdtempSync(join(tmpdir(), 'ctx-pop-noinv-'));
            const task = makeTask('428-102', { sprintId: 'sprint-never-probed' });
            const prompt = buildWorkerPrompt(task, undefined, undefined, root);
            expect(prompt).not.toContain('## Environment Tool Inventory');
        });
        it('stays undefined (no env-probe block, no throw) when the task carries no sprintId', () => {
            root = mkdtempSync(join(tmpdir(), 'ctx-pop-nosprint-'));
            writeToolInventory(root, 'sprint-428', 'python3=yes docker=no rg=yes');
            const task = makeTask('428-103', { sprintId: undefined });
            const prompt = buildWorkerPrompt(task, undefined, undefined, root);
            expect(prompt).not.toContain('## Environment Tool Inventory');
        });
    });
    describe('verifyCommands (resolveVerifyCommands wire)', () => {
        it('keeps wave-level stack commands out when a task-local Test command exists', () => {
            root = mkdtempSync(join(tmpdir(), 'ctx-pop-scoped-verify-'));
            writeFileSync(join(root, 'tsconfig.json'), '{}', 'utf-8');
            const task = makeTask('428-106', {
                description: '- Test: npx vitest run tests/orchestra/ctx-population-wire.test.ts',
            });
            const prompt = buildWorkerPrompt(task, undefined, undefined, root);
            expect(prompt).toContain('`npx vitest run tests/orchestra/ctx-population-wire.test.ts`');
            expect(prompt).not.toContain('Run: `npx tsc --noEmit`');
            expect(prompt).not.toContain('<path-to-the-test-file(s)-you-changed>');
        });
        it('fails closed when no task-local verification command was compiled', () => {
            root = mkdtempSync(join(tmpdir(), 'ctx-pop-verify-'));
            // A bare tsconfig.json is sufficient for stack-detector.ts detectFresh to
            // classify language=typescript (Layer 4 fallback: hasTS=true, <3 source
            // files) — deterministic without depending on the real repo's own stack,
            // resolving STACK_COMMANDS.typescript { typecheck: 'npx tsc --noEmit', test: 'npx vitest run' }.
            writeFileSync(join(root, 'tsconfig.json'), '{}', 'utf-8');
            const task = makeTask('428-104', { sprintId: 'sprint-428' });
            const prompt = buildWorkerPrompt(task, undefined, undefined, root);
            expect(prompt).toContain("Run: `npx tsc --noEmit` — this project's compiled type-check command.");
            expect(prompt).toContain('SCOPED_PROOF_HOLD: no exact task-local targeted test command was compiled');
        });
        it('uses the same fail-closed proof hold when the stack resolves no commands', () => {
            root = mkdtempSync(join(tmpdir(), 'ctx-pop-noverify-'));
            // No stack markers at all → detectFresh yields language 'unknown' →
            // resolveCommandKey returns a key absent from STACK_COMMANDS → both
            // check/test resolve to '' → legacy generic-examples text, unchanged.
            const task = makeTask('428-105', { sprintId: 'sprint-428' });
            const prompt = buildWorkerPrompt(task, undefined, undefined, root);
            expect(prompt).toContain('SCOPED_PROOF_HOLD: no task-local type-check command was compiled.');
            expect(prompt).toContain('SCOPED_PROOF_HOLD: no exact task-local targeted test command was compiled');
        });
    });
});
}
