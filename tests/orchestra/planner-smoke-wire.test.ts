import { describe, it, expect } from 'vitest';
import {
  parseStructuredDirectives,
  createTask,
  plannerTaskToParams,
  type CreateTaskParams,
} from '../../src/orchestra/task-builder.js';
import type { PlannerTask } from '../../src/core/types.js';

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const DIRECTIVE_WITH_SMOKE = `
## Task 1: 219-001 — native REPL entry
- Model: claude-sonnet-5
- Effort: normal
- Files: src/cli/entry.ts, tests/cli/default-repl.test.ts
- Scope: src/cli/, tests/cli/

### Description
Wire default entry to open REPL.

**Smoke:** echo "hi" | env -u ANTHROPIC_API_KEY node dist/cli/entry.js 2>&1 | head -5 → REPL starts
`;

const DIRECTIVE_NO_SMOKE = `
## Task 1: refactor types
- Model: claude-haiku-4-5-20251001
- Effort: low
- Files: src/core/types.ts
- Scope: src/core/

### Description
Rename some types.
`;

function baseParams(overrides: Partial<CreateTaskParams> = {}): CreateTaskParams {
  return {
    title: 'test task',
    description: 'test description',
    model: 'claude-sonnet-5',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/cli/'], filesRead: [], filesWrite: ['src/cli/entry.ts'] },
    dependencies: [],
    goNogo: { goCriteria: 'passes', noGoCriteria: 'fails', techDebtAcceptable: 'no' },
    sprintId: 'sprint-219',
    ...overrides,
  };
}

function basePlannerTask(overrides: Partial<PlannerTask> = {}): PlannerTask {
  return {
    title: 'ai planner task',
    description: 'ai description',
    model: 'claude-sonnet-5',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'ai reason',
    scope: { directories: ['src/api/'], filesRead: [], filesWrite: ['src/api/server.ts'] },
    dependencies: [],
    goNogo: { goCriteria: 'wire done', noGoCriteria: 'not wired', techDebtAcceptable: 'no' },
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('planner-smoke-wire: parsed.smoke → CreateTaskParams → task.smoke', () => {
  it('smoke from parseStructuredDirectives flows through createTask to task.smoke', () => {
    const parsed = parseStructuredDirectives(DIRECTIVE_WITH_SMOKE);
    expect(parsed).toHaveLength(1);
    const pt = parsed[0]!;
    expect(pt.smoke).toBeDefined();
    expect(pt.smoke!.command).toContain('node dist/cli/entry.js');
    expect(pt.smoke!.expect).toContain('REPL');

    const params = baseParams({ smoke: pt.smoke, title: pt.title, scope: pt.scope });
    const task = createTask(params, 1);

    expect(task.smoke).toBeDefined();
    expect(task.smoke!.command).toBe(pt.smoke!.command);
    expect(task.smoke!.expect).toBe(pt.smoke!.expect);
  });

  it('task.smoke is undefined when CreateTaskParams carries no smoke', () => {
    const task = createTask(baseParams(), 2);
    expect(task.smoke).toBeUndefined();
  });

  it('task.smoke is undefined for parsed directive with no Smoke: line', () => {
    const parsed = parseStructuredDirectives(DIRECTIVE_NO_SMOKE);
    expect(parsed).toHaveLength(1);
    const pt = parsed[0]!;
    expect(pt.smoke).toBeUndefined();

    const params = baseParams({ smoke: pt.smoke, title: pt.title });
    const task = createTask(params, 3);
    expect(task.smoke).toBeUndefined();
  });

  it('plannerTaskToParams propagates smoke from planner task to CreateTaskParams', () => {
    const smoke = { command: 'node dist/cli/entry.js --help', expect: 'usage' };
    const pt = { ...basePlannerTask(), smoke };
    const params = plannerTaskToParams(pt, 'sprint-219', 'claude-sonnet-5');
    expect(params.smoke).toEqual(smoke);
  });

  it('plannerTaskToParams returns smoke=undefined when PlannerTask has no smoke', () => {
    const pt = basePlannerTask();
    const params = plannerTaskToParams(pt, 'sprint-219', 'claude-sonnet-5');
    expect(params.smoke).toBeUndefined();
  });

  it('createTask round-trip: smoke command and expect survive JSON serialisation shape', () => {
    const smoke = { command: 'env -u ANTHROPIC_API_KEY node dist/entry.js serve → 200', expect: '200' };
    const task = createTask(baseParams({ smoke }), 4);
    const asJson = JSON.parse(JSON.stringify(task)) as { smoke?: { command: string; expect: string } };
    expect(asJson.smoke).toBeDefined();
    expect(asJson.smoke!.command).toBe(smoke.command);
    expect(asJson.smoke!.expect).toBe(smoke.expect);
  });
});
