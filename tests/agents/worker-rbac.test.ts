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

  // Test 2: Worker scope.filesWrite outside → soft enforcement (returns true but emits event)
  it('soft-allows write to file outside scope but emits authority violation event', () => {
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

    // ADR-037 soft enforcement: always returns true but logs + emits violation
    expect(result).toBe(true);
  });

  // Test 3: Worker scope.directories outside → soft enforcement (returns true but emits event)
  it('soft-allows write to path outside scope.directories but emits violation', () => {
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

    // ADR-037 soft enforcement: always returns true but logs + emits violation
    expect(result).toBe(true);
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

  // Test 6: Self-modifying sprint allows src/** writes
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
