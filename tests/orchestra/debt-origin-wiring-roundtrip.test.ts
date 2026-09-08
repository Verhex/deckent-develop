import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { createTask } from '../../src/orchestra/task-builder.js';
import { handleEvaluation } from '../../src/orchestra/debt-manager.js';
import { injectCriticalDebtTasks, readContext } from '../../src/orchestra/sprint-planner.js';
import { MemoryStore } from '../../src/core/memory-store.js';
import { canonicalJson } from '../../src/core/audit-writer.js';
import { DebtPriority, TaskEvaluation, TaskStatus } from '../../src/core/types.js';
import type { DebtItem, Task, TaskResult } from '../../src/core/types.js';
import { productionWiringPlanFixture } from '../helpers/production-wiring-plan-fixture.js';

const roots: string[] = [];
const MODEL = 'claude-sonnet-5';

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-debt-origin-'));
  roots.push(root);
  mkdirSync(join(root, '.brain'), { recursive: true });
  mkdirSync(join(root, '.tasks'), { recursive: true });
  writeFileSync(join(root, 'DIRECTIVES.md'), 'repair residual debt origin wiring', 'utf8');
  new MemoryStore(join(root, '.brain', 'memory.db')).close();
  return root;
}

function originalTask(): Task {
  return createTask({
    title: 'Repair origin wiring',
    description: 'A concrete residual remains in the origin task.',
    model: MODEL,
    effort: 'high',
    priority: 'CRITICAL',
    reason: 'roundtrip fixture',
    // This is already the canonical producer scope: createTask must not add a
    // second test mirror when the later debt injector reconstructs it.
    scope: {
      directories: ['src/orchestra', 'tests/orchestra'],
      filesRead: [],
      filesWrite: ['src/orchestra/debt-manager.ts', 'tests/orchestra/debt-origin-wiring-roundtrip.test.ts'],
    },
    dependencies: [],
    goNogo: { goCriteria: 'residual repaired', noGoCriteria: 'residual remains', techDebtAcceptable: '' },
    sprintId: 'sprint-920',
    initialStatus: TaskStatus.PENDING,
    productionWiring: productionWiringPlanFixture(),
  }, 1);
}

function debtResult(task: Task): TaskResult {
  return {
    taskId: task.id,
    workerId: `w-${task.id}`,
    filesChanged: [], linesAdded: 0, linesRemoved: 0,
    testsPassed: false, coverage: 0,
    selfAssessment: 'GO_WITH_TECH_DEBT',
    notes: 'Residual debt origin wiring remains unresolved.',
    residualDebt: 'Residual debt origin wiring remains unresolved.',
  };
}

function binding(taskId: string, originScope: { directories: string[]; filesWrite: string[] }, authority = productionWiringPlanFixture()): string {
  return createHash('sha256').update(canonicalJson({
    originTaskId: taskId,
    originScope,
    contractDigest: authority.contractDigest,
    hostProofProgramDigest: authority.hostProofProgramDigest,
  })).digest('hex');
}

function validDebt(id: string): DebtItem {
  const authority = productionWiringPlanFixture();
  const originScope = {
    directories: ['src/orchestra', 'tests/orchestra'],
    filesWrite: ['src/orchestra/debt-manager.ts', 'tests/orchestra/debt-origin-wiring-roundtrip.test.ts'],
  };
  return {
    id, description: 'A real residual gap remains.', originTaskId: '920-001', originSprintId: 'sprint-920',
    priority: DebtPriority.CRITICAL, sprintsOpen: 1, resolved: false, createdAt: '2026-09-08T00:00:00.000Z',
    originScope, originProductionWiring: authority,
    originProductionWiringBinding: binding('920-001', originScope, authority),
    originWiringState: 'valid-v2',
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('critical debt V2 origin wiring', () => {
  it('round-trips canonical producer authority through private MemoryStore/readContext into an idempotent fix task', () => {
    const root = makeRoot();
    const task = originalTask();
    writeFileSync(join(root, '.tasks', `task-${task.id}.json`), JSON.stringify(task), 'utf8');

    handleEvaluation(root, task, TaskEvaluation.GO_WITH_TECH_DEBT, debtResult(task));

    const context = readContext(root);
    const debt = context.debt.find(item => item.id === `debt-${task.id}`);
    expect(debt).toMatchObject({
      originTaskId: task.id,
      originWiringState: 'valid-v2',
      originScope: { directories: task.scope.directories, filesWrite: task.scope.filesWrite },
    });
    // Escalation to CRITICAL is the ordinary debt lifecycle concern; the
    // authority itself is preserved unchanged from producer to injector.
    const injected = injectCriticalDebtTasks([{ ...debt!, priority: DebtPriority.CRITICAL }], 'sprint-921', MODEL, 1, TaskStatus.PENDING);
    expect(injected.held).toEqual([]);
    expect(injected.tasks).toHaveLength(1);
    expect(injected.tasks[0]?.scope.directories).toEqual(task.scope.directories);
    expect(injected.tasks[0]?.scope.filesWrite).toEqual(task.scope.filesWrite);
  });

  it('marks malformed persisted origins invalid through readContext without aborting the plan context', () => {
    const authority = productionWiringPlanFixture();
    const base = {
      type: 'debt', source: 'brain' as const, status: 'active', priority: 'critical',
      sprint_id: 'sprint-920', sprint_num: 920, tags: ['debt'],
      title: 'Origin residual', content: 'repair residual debt origin wiring',
    };
    const scope = { directories: ['src/orchestra'], filesWrite: ['src/orchestra/debt-manager.ts'] };
    const metadata = (overrides: Record<string, unknown>) => ({
      originTaskId: '920-001', originSprintId: 'sprint-920', sprintsOpen: 1,
      originScope: scope, originProductionWiring: authority,
      originProductionWiringBinding: binding('920-001', scope, authority), originWiringState: 'valid-v2',
      ...overrides,
    });
    const malformed = [
      ['debt-missing-task', { originTaskId: '' }],
      ['debt-missing-scope', { originScope: { directories: [], filesWrite: [] } }],
      ['debt-tampered-digest', { originProductionWiring: { ...authority, contractDigest: `sha256:${'0'.repeat(64)}` } }],
      ['debt-sibling-binding', { originProductionWiringBinding: binding('920-002', scope, authority) }],
    ] as const;
    // The planner's bounded critical-context gate deliberately limits selected
    // critical records. Exercise each corruption through its own private DB so
    // this proves mapper behavior rather than overflowing that independent gate.
    for (const [id, overrides] of malformed) {
      const root = makeRoot();
      const store = new MemoryStore(join(root, '.brain', 'memory.db'));
      store.insert({ ...base, id, metadata: metadata(overrides) });
      store.close();

      const context = readContext(root);
      expect(context.debt).toHaveLength(1);
      expect(context.debt[0]?.originWiringState).toBe('invalid-origin');
      const injected = injectCriticalDebtTasks(context.debt, 'sprint-921', MODEL, 1, TaskStatus.PENDING);
      expect(injected.tasks).toEqual([]);
      expect(injected.held).toEqual([{ debtId: id, reason: 'invalid-origin' }]);
    }
  });

  it('revalidates direct injection and keeps mixed valid, legacy, and tampered debts separately observable', () => {
    const valid = validDebt('debt-valid');
    const tampered: DebtItem = {
      ...valid,
      id: 'debt-tampered-direct',
      originProductionWiringBinding: binding('920-002', valid.originScope!, valid.originProductionWiring),
      // A forged state is diagnostic only and cannot turn the sibling binding valid.
      originWiringState: 'valid-v2',
    };
    const legacy: DebtItem = {
      ...valid, id: 'debt-legacy', originProductionWiring: undefined,
      originProductionWiringBinding: undefined, originWiringState: 'legacy-unavailable',
    };

    const injected = injectCriticalDebtTasks([valid, tampered, legacy], 'sprint-921', MODEL, 4, TaskStatus.PENDING);
    expect(injected.tasks).toHaveLength(1);
    expect(injected.tasks[0]?.fixForTaskId).toBe('920-001');
    expect(injected.held).toEqual([
      { debtId: 'debt-tampered-direct', reason: 'invalid-origin' },
      { debtId: 'debt-legacy', reason: 'legacy-unavailable' },
    ]);
    expect(injected.skipped).toEqual([]);
  });

  it('keeps a structurally malformed debt metadata record as an invalid held debt, not a global PLAN hold', () => {
    const root = makeRoot();
    const store = new MemoryStore(join(root, '.brain', 'memory.db'));
    store.insert({
      id: 'debt-malformed-metadata', type: 'debt', source: 'brain', status: 'active', priority: 'critical',
      sprint_id: 'sprint-920', sprint_num: 920, tags: ['debt'], title: 'Malformed origin',
      content: 'repair residual debt origin wiring',
      // MemoryStore permits generic JSON metadata; a non-record value is
      // malformed specifically for this debt projection.
      metadata: [] as unknown as Record<string, unknown>,
    });
    store.close();

    const context = readContext(root);
    expect(context.debt[0]).toMatchObject({ id: 'debt-malformed-metadata', originWiringState: 'invalid-origin' });
    expect(injectCriticalDebtTasks(context.debt, 'sprint-921', MODEL, 1, TaskStatus.PENDING).held)
      .toEqual([{ debtId: 'debt-malformed-metadata', reason: 'invalid-origin' }]);
  });
});
