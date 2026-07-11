// ═══ ROUTING-TEK-OTORİTE (Sprint 409 Task 409-003, born-641 kalanı) ═══════
//
// `routeSprintTasks` (sprint-spawner.ts) runs exactly once per sprint, at
// `runSprint`'s Phase 1.5 (PLAN→SPAWN boundary) — AFTER plan-time routing
// (sprint-planner.ts's routeTaskV2 → selectBestAgent) has already resolved
// `task.assignedAgent` with full multi-signal context. Before this fix it
// unconditionally re-applied `routeTask`'s own agent verdict whenever it
// was non-'generic' — and `routeTask`'s `applyUserSurfaceBonus` re-derives
// the SAME user-surface signal plan-time already folded into its score
// (routing-engine.ts's `getUserSurfaceBonus` feeds `selectBestAgent`
// directly), so the two could silently disagree. This suite proves the
// collision exists at the `routeTask` layer (RED evidence, using the same
// fixture shape as the passing tests/orchestra/router-surface-wire.test.ts),
// then proves `routeSprintTasks` now pins the plan-time value instead of
// re-deciding it, while still filling in an agent via the same fallback
// when plan-time left nothing meaningful (undefined/empty/'generic') — and
// journals that fallback decision, tagged, fail-soft.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TaskStatus, type Task, type ResolvedConfig, type ProviderName } from '../../src/core/types.js';
import { routeTask } from '../../src/orchestra/task-router.js';
import { routeSprintTasks } from '../../src/orchestra/sprint-spawner.js';
import { routingDecisionJournalPath } from '../../src/core/routing-engine.js';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '409-003-t',
    title: 'Surface routing test',
    description: 'Wire surface-bonus into plan-time router',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: 'minor' },
    status: TaskStatus.PENDING,
    ...overrides,
  };
}

const allProviders: ProviderName[] = ['claude', 'codex', 'gemini'];
const config = {} as unknown as ResolvedConfig;

// Same scope shape as router-surface-wire.test.ts's proven surface-bonus
// fixture: a cli/commands/ task routes to 'api-builder' via applyUserSurfaceBonus.
const cliCommandsScope = {
  directories: ['src/cli/commands/'],
  filesRead: [],
  filesWrite: ['src/cli/commands/chat-native.ts'],
};

describe('ROUTING-TEK-OTORİTE — RED evidence (routeTask disagrees with plan-time)', () => {
  it('routeTask returns a DIFFERENT agent than a meaningful plan-time assignment', () => {
    // This is the exact collision: plan-time (V2/selectBestAgent) chose
    // 'refactorer' for this task; routeTask's own surface-bonus re-derivation
    // disagrees and would pick 'api-builder' instead.
    const task = makeTask({ scope: cliCommandsScope, assignedAgent: 'refactorer' });
    const routing = routeTask(task, config, allProviders);
    expect(routing.agent).toBe('api-builder');
    expect(routing.agent).not.toBe(task.assignedAgent);
  });
});

describe('ROUTING-TEK-OTORİTE — single-authority pin', () => {
  it('preserves a meaningful plan-time assignedAgent — spawn-time does NOT overwrite it', () => {
    const tasks = [makeTask({ scope: cliCommandsScope, assignedAgent: 'refactorer' })];
    routeSprintTasks(tasks, config, allProviders);
    // Pre-fix this would have become 'api-builder' (see RED evidence above).
    expect(tasks[0]!.assignedAgent).toBe('refactorer');
  });

  it('preserves a forceAgent-pinned plan-time assignment on a surface scope', () => {
    const tasks = [makeTask({
      scope: cliCommandsScope,
      forceAgent: 'custom-agent',
      assignedAgent: 'custom-agent',
    })];
    routeSprintTasks(tasks, config, allProviders);
    expect(tasks[0]!.assignedAgent).toBe('custom-agent');
  });

  it('falls back to routeTask agent when plan-time left assignedAgent undefined', () => {
    const tasks = [makeTask({ scope: cliCommandsScope })];
    expect(tasks[0]!.assignedAgent).toBeUndefined();
    routeSprintTasks(tasks, config, allProviders);
    expect(tasks[0]!.assignedAgent).toBe('api-builder');
  });

  it("falls back to routeTask agent when plan-time left assignedAgent literally 'generic'", () => {
    // sprint-planner.ts:730 writes `decision.agentId ?? 'generic'` — a genuine
    // V2 'generic' verdict is not a meaningful pin either.
    const tasks = [makeTask({ scope: cliCommandsScope, assignedAgent: 'generic' })];
    routeSprintTasks(tasks, config, allProviders);
    expect(tasks[0]!.assignedAgent).toBe('api-builder');
  });

  it("falls back to routeTask agent when plan-time left assignedAgent as ''", () => {
    const tasks = [makeTask({ scope: cliCommandsScope, assignedAgent: '' })];
    routeSprintTasks(tasks, config, allProviders);
    expect(tasks[0]!.assignedAgent).toBe('api-builder');
  });

  it('stays generic when neither plan-time nor routeTask has a real signal (NO_GO guard)', () => {
    // Non-surface scope: routeTask has nothing to offer either — the
    // fallback must not be removed outright, it just has nothing to fill.
    const tasks = [makeTask({
      scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/util.ts'] },
    })];
    routeSprintTasks(tasks, config, allProviders);
    expect(tasks[0]!.assignedAgent).toBeUndefined();
  });

  it('provider and skills assignment are unaffected by the agent pin', () => {
    const tasks = [makeTask({ scope: cliCommandsScope, assignedAgent: 'refactorer' })];
    routeSprintTasks(tasks, config, allProviders);
    expect(tasks[0]!.provider).toBeDefined();
  });
});

describe('ROUTING-TEK-OTORİTE — spawn-fallback decision journal (tagged, fail-soft)', () => {
  let projectRoot: string;

  afterEach(() => {
    if (projectRoot) rmSync(projectRoot, { recursive: true, force: true });
  });

  it('journals the spawn-fallback decision (source-tagged) when the fallback actually fires', () => {
    projectRoot = mkdtempSync(join(tmpdir(), 'deckent-409-003-'));
    const sprintId = 'sprint-409';
    const tasks = [makeTask({ scope: cliCommandsScope })]; // no plan-time pin → fallback fires
    routeSprintTasks(tasks, config, allProviders, { projectRoot, sprintId });

    const filePath = routingDecisionJournalPath(projectRoot, sprintId);
    expect(existsSync(filePath)).toBe(true);
    const lines = readFileSync(filePath, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(1);
    const record = JSON.parse(lines[0]!);
    expect(record).toMatchObject({
      taskId: tasks[0]!.id,
      sprintId,
      winner: 'api-builder',
      source: 'spawn-fallback',
      cached: false,
    });
    expect(typeof record.ts).toBe('string');
  });

  it('does NOT journal anything when plan-time already pinned the agent', () => {
    projectRoot = mkdtempSync(join(tmpdir(), 'deckent-409-003-'));
    const sprintId = 'sprint-409';
    const tasks = [makeTask({ scope: cliCommandsScope, assignedAgent: 'refactorer' })];
    routeSprintTasks(tasks, config, allProviders, { projectRoot, sprintId });

    const filePath = routingDecisionJournalPath(projectRoot, sprintId);
    expect(existsSync(filePath)).toBe(false);
  });

  it('is fail-soft/no-op when journalContext is omitted (current production call site)', () => {
    const tasks = [makeTask({ scope: cliCommandsScope })];
    expect(() => routeSprintTasks(tasks, config, allProviders)).not.toThrow();
    expect(tasks[0]!.assignedAgent).toBe('api-builder');
  });
});
