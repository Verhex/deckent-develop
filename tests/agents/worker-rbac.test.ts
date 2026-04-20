/**
 * ADR-037 RBAC Runtime Wire — checkWorkerAuthority Tests
 *
 * Sprint 145 Task 004: Verify that checkWorkerAuthority correctly enforces
 * worker scope boundaries and emits AUTHORITY_VIOLATION events.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  checkWorkerAuthority,
  guardedFileWrite,
  ScopeViolationError,
} from '../../src/agents/worker.js';
import type { TaskScope, Task } from '../../src/core/types.js';
import { readEvents, CHANNELS } from '../../src/orchestra/event-stream.js';

const TEST_ROOT = join(process.cwd(), '.test-rbac-' + process.pid);
const DECKENT_DIR = join(TEST_ROOT, '.deckent');
const TASKS_DIR = join(TEST_ROOT, '.tasks');

function setupTestEnv(sprintId: string): void {
  mkdirSync(DECKENT_DIR, { recursive: true });
  mkdirSync(TASKS_DIR, { recursive: true });
  mkdirSync(join(TEST_ROOT, 'src', 'core'), { recursive: true });
  mkdirSync(join(TEST_ROOT, 'src', 'orchestra'), { recursive: true });
  mkdirSync(join(TEST_ROOT, 'docs'), { recursive: true });

  // Sprint state for event stream
  writeFileSync(
    join(DECKENT_DIR, 'sprint-state.json'),
    JSON.stringify({ sprintId }),
    'utf-8',
  );
}

function createTask(overrides?: Partial<Task>): Task {
  return {
    id: '145-004',
    title: 'Test task',
    description: 'Test task for RBAC',
    model: 'opus',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: {
      directories: ['src/agents/', 'src/orchestra/', 'tests/agents/'],
      filesRead: [],
      filesWrite: [
        'src/agents/worker.ts',
        'src/orchestra/authority-enforcer.ts',
        'tests/agents/worker-rbac.test.ts',
      ],
    },
    status: 'EXECUTING',
    sprintId: 'sprint-145',
    createdAt: new Date().toISOString(),
    ...overrides,
  } as Task;
}

describe('ADR-037 RBAC — checkWorkerAuthority', () => {
  const sprintId = 'sprint-145';

  beforeEach(() => {
    setupTestEnv(sprintId);
  });

  afterEach(() => {
    try {
      rmSync(TEST_ROOT, { recursive: true, force: true });
    } catch {
      // cleanup best-effort
    }
  });

  // Test 1: Worker scope.filesWrite within scope → PASS
  it('allows write to file within scope.filesWrite', () => {
    const scope: TaskScope = {
      directories: ['src/agents/'],
      filesRead: [],
      filesWrite: ['src/agents/worker.ts', 'src/orchestra/authority-enforcer.ts'],
    };

    const result = checkWorkerAuthority(
      'src/agents/worker.ts',
      scope,
      TEST_ROOT,
      '145-004',
      sprintId,
    );

    expect(result).toBe(true);
  });

  // Test 2: Worker scope.filesWrite outside → returns false
  it('denies write to file outside scope.filesWrite and scope.directories', () => {
    const scope: TaskScope = {
      directories: ['src/agents/'],
      filesRead: [],
      filesWrite: ['src/agents/worker.ts'],
    };

    const result = checkWorkerAuthority(
      'src/cli/entry.ts',  // outside scope
      scope,
      TEST_ROOT,
      '145-004',
      sprintId,
    );

    expect(result).toBe(false);
  });

  // Test 3: Worker scope.directories outside → returns false
  it('denies write to path outside scope.directories', () => {
    const scope: TaskScope = {
      directories: ['src/agents/'],
      filesRead: [],
      filesWrite: [],
    };

    const result = checkWorkerAuthority(
      'src/mcp/server.ts',  // outside scope.directories
      scope,
      TEST_ROOT,
      '145-004',
      sprintId,
    );

    expect(result).toBe(false);
  });

  // Test 4: AUTHORITY_VIOLATION event emitted to event stream
  it('emits AUTHORITY_VIOLATION event on scope violation', () => {
    const scope: TaskScope = {
      directories: ['src/agents/'],
      filesRead: [],
      filesWrite: [],
    };

    checkWorkerAuthority(
      'src/cli/entry.ts',
      scope,
      TEST_ROOT,
      '145-004',
      sprintId,
    );

    const events = readEvents(TEST_ROOT, sprintId, {
      channel: CHANNELS.AUTHORITY_VIOLATION,
    });

    expect(events.length).toBeGreaterThanOrEqual(1);
    const event = events[events.length - 1]!;
    expect(event.channel).toBe(CHANNELS.AUTHORITY_VIOLATION);
    const payload = event.payload as Record<string, unknown>;
    expect(payload.role).toBe('worker');
    expect(payload.action).toBe('write');
    expect(payload.target).toBe('src/cli/entry.ts');
    expect(payload.taskId).toBe('145-004');
    expect(payload.allowed).toBe(false);
  });

  // Test 5: Write within scope.directories (new file) → PASS
  it('allows write to new file within scope.directories', () => {
    const scope: TaskScope = {
      directories: ['src/agents/', 'tests/agents/'],
      filesRead: [],
      filesWrite: [],
    };

    const result = checkWorkerAuthority(
      'src/agents/new-module.ts',
      scope,
      TEST_ROOT,
      '145-004',
      sprintId,
    );

    expect(result).toBe(true);
  });

  // Test 6: guardedFileWrite throws ScopeViolationError on violation
  it('guardedFileWrite throws ScopeViolationError for out-of-scope write', () => {
    const task = createTask({
      scope: {
        directories: ['src/agents/'],
        filesRead: [],
        filesWrite: ['src/agents/worker.ts'],
      },
    });

    expect(() => {
      guardedFileWrite(
        TEST_ROOT,
        'docs/README.md',
        'test content',
        task,
        sprintId,
      );
    }).toThrow(ScopeViolationError);
  });

  // Test 7: guardedFileWrite writes NO_GO result on violation
  it('guardedFileWrite writes NO_GO result file on scope violation', () => {
    const task = createTask({
      scope: {
        directories: ['src/agents/'],
        filesRead: [],
        filesWrite: ['src/agents/worker.ts'],
      },
    });

    try {
      guardedFileWrite(TEST_ROOT, 'docs/secret.ts', 'bad', task, sprintId);
    } catch {
      // expected
    }

    const resultPath = join(TASKS_DIR, 'task-145-004.result');
    expect(existsSync(resultPath)).toBe(true);
    const resultContent = JSON.parse(readFileSync(resultPath, 'utf-8'));
    expect(resultContent.selfAssessment).toBe('NO_GO');
    expect(resultContent.notes).toContain('RBAC violation');
    expect(resultContent.notes).toContain('docs/secret.ts');
  });

  // Test 8: guardedFileWrite succeeds for in-scope file
  it('guardedFileWrite writes file successfully within scope', () => {
    const task = createTask({
      scope: {
        directories: ['src/agents/'],
        filesRead: [],
        filesWrite: ['src/agents/worker.ts'],
      },
    });

    const targetPath = 'src/agents/worker.ts';
    const content = '// test content';

    // Ensure directory exists and create file
    mkdirSync(join(TEST_ROOT, 'src', 'agents'), { recursive: true });
    writeFileSync(join(TEST_ROOT, targetPath), '', 'utf-8');

    guardedFileWrite(TEST_ROOT, targetPath, content, task, sprintId);

    const written = readFileSync(join(TEST_ROOT, targetPath), 'utf-8');
    expect(written).toBe(content);
  });

  // Test 9: Self-modifying sprint allows src/** writes
  it('allows src/** writes in self-modifying sprint mode', () => {
    const scope: TaskScope = {
      directories: [],
      filesRead: [],
      filesWrite: [],
    };

    const result = checkWorkerAuthority(
      'src/orchestra/brain.ts',
      scope,
      TEST_ROOT,
      '145-004',
      sprintId,
      true,  // isSelfModifyingSprint
    );

    expect(result).toBe(true);
  });
});
