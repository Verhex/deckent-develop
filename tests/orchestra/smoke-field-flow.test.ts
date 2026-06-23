import { describe, it, expect } from 'vitest';
import {
  parseStructuredDirectives,
  parseBulletOrNumberedTasks,
  createTask,
  plannerTaskToParams,
  type CreateTaskParams,
} from '../../src/orchestra/task-builder.js';
import type { PlannerTask } from '../../src/core/types.js';

/**
 * Task 221-014 — Smoke-219-016 hotfix end-to-end flow proof.
 *
 * Verifies that a `Smoke:` directive in DIRECTIVES.md flows uninterrupted from
 * `parseStructuredDirectives` / `parseBulletOrNumberedTasks` → CreateTaskParams →
 * `createTask` → `task.smoke`, in the exact `{ command, expect }` shape that
 * `proof-of-function.readSmokeSpec` (the proof-of-function gate input) accepts.
 *
 * Adjacent hops are covered by `planner-smoke-wire.test.ts` and
 * `smoke-directive-parse.test.ts`; this file is the dedicated END-TO-END proof
 * for the task-builder boundary. Hermetic: no file I/O, no gitignored state.
 */

const baseScope = {
  directories: ['src/cli/'],
  filesRead: [],
  filesWrite: ['src/cli/entry.ts'],
};

function baseParams(overrides: Partial<CreateTaskParams> = {}): CreateTaskParams {
  return {
    title: 'flow task',
    description: 'flow description',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'flow test',
    scope: baseScope,
    dependencies: [],
    goNogo: { goCriteria: 'ok', noGoCriteria: 'fail', techDebtAcceptable: 'no' },
    sprintId: 'sprint-221',
    ...overrides,
  };
}

function basePlannerTask(overrides: Partial<PlannerTask> = {}): PlannerTask {
  return {
    title: 'planner task',
    description: 'planner description',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'ai',
    scope: baseScope,
    dependencies: [],
    goNogo: { goCriteria: 'ok', noGoCriteria: 'fail', techDebtAcceptable: 'no' },
    ...overrides,
  };
}

/**
 * Re-implementation of `proof-of-function.readSmokeSpec` semantics for the
 * gate-input contract: a Task with `smoke = { command:string, expect:string }`
 * (both non-empty) is acceptable. We assert against this contract directly so
 * the test does not depend on `proof-of-function.ts` (keeps the scope to
 * task-builder + the new test file only).
 */
function gateAccepts(task: { smoke?: unknown }): boolean {
  const c = task.smoke as { command?: unknown; expect?: unknown } | undefined;
  if (!c || typeof c !== 'object') return false;
  if (typeof c.command !== 'string' || c.command.trim().length === 0) return false;
  if (typeof c.expect !== 'string' || c.expect.length === 0) return false;
  return true;
}

describe('smoke-field-flow: end-to-end Smoke: → task.smoke → gate-acceptable', () => {
  it('structured-parse: Smoke line in DIRECTIVES → task.smoke populated and gate-acceptable', () => {
    const directive = `
## Task 1: 221-001 — serve token fix
- Model: sonnet
- Effort: normal
- Files: src/api/server.ts
- Scope: src/api/

### Description
Wire up serve token injection.

**Smoke:** env -u ANTHROPIC_API_KEY node dist/cli/entry.js serve --port 3211 → http_code=200
`;
    const parsed = parseStructuredDirectives(directive);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.smoke).toEqual({
      command: 'env -u ANTHROPIC_API_KEY node dist/cli/entry.js serve --port 3211',
      expect: 'http_code=200',
    });

    const task = createTask(
      baseParams({ smoke: parsed[0]!.smoke, title: parsed[0]!.title, scope: parsed[0]!.scope }),
      1,
    );

    expect(task.smoke).toEqual(parsed[0]!.smoke);
    expect(gateAccepts(task)).toBe(true);
  });

  it('bullet-parse: `- Smoke:` line in bullet/numbered task → task.smoke populated and gate-acceptable', () => {
    const directive = `
- Task: serve token fix
  - Model: sonnet
  - Smoke: node dist/cli/entry.js serve → http_code=200
  - Files: src/api/server.ts
`;
    const parsed = parseBulletOrNumberedTasks(directive);
    expect(parsed.length).toBeGreaterThan(0);
    const pt = parsed[0]!;
    expect(pt.smoke).toBeDefined();
    expect(pt.smoke!.command).toContain('node dist/cli/entry.js');
    expect(pt.smoke!.expect).toBe('http_code=200');

    const task = createTask(
      baseParams({ smoke: pt.smoke, title: pt.title, scope: pt.scope }),
      2,
    );

    expect(task.smoke).toEqual(pt.smoke);
    expect(gateAccepts(task)).toBe(true);
  });

  it('AI planner path: plannerTaskToParams → createTask → task.smoke populated and gate-acceptable', () => {
    const smoke = { command: 'node dist/cli/entry.js --help', expect: 'usage' };
    const pt = { ...basePlannerTask(), smoke };

    const params = plannerTaskToParams(pt, 'sprint-221', 'sonnet');
    expect(params.smoke).toEqual(smoke);

    const task = createTask(params, 3);
    expect(task.smoke).toEqual(smoke);
    expect(gateAccepts(task)).toBe(true);
  });

  it('no Smoke: line → task.smoke is undefined and gate is inert (Tier-0 path)', () => {
    const directive = `
## Task 1: 221-X — internal refactor
- Model: haiku
- Effort: low
- Files: src/core/types.ts
- Scope: src/core/

### Description
Rename a few internal types.
`;
    const parsed = parseStructuredDirectives(directive);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.smoke).toBeUndefined();

    const task = createTask(
      baseParams({ smoke: parsed[0]!.smoke, title: parsed[0]!.title, scope: parsed[0]!.scope }),
      4,
    );
    expect(task.smoke).toBeUndefined();
    expect(gateAccepts(task)).toBe(false);
  });

  it('JSON round-trip: task.smoke survives serialisation in `.tasks/task-NNN.json` shape', () => {
    const directive = `
## Task 1: 221-002 — REPL agentic wire
- Model: opus
- Effort: normal
- Files: src/cli/commands/chat-native.ts
- Scope: src/cli/

### Description
Wire agentic dispatch.

**Smoke:** echo "durum ne" | env -u ANTHROPIC_API_KEY node dist/cli/entry.js 2>&1 | head → status output
`;
    const parsed = parseStructuredDirectives(directive);
    const task = createTask(
      baseParams({ smoke: parsed[0]!.smoke, title: parsed[0]!.title, scope: parsed[0]!.scope }),
      5,
    );

    const roundTripped = JSON.parse(JSON.stringify(task)) as { smoke?: { command: string; expect: string } };
    expect(roundTripped.smoke).toEqual(parsed[0]!.smoke);
    expect(gateAccepts(roundTripped)).toBe(true);
  });
});
