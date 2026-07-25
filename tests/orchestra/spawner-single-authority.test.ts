// ═══ ROUTING-TEK-OTORİTE (Sprint 409 Task 409-003, born-641 kalanı) ═══════
//
// `routeSprintTasks` (sprint-spawner.ts) runs exactly once per sprint, at
// `runSprint`'s Phase 1.5 (PLAN→SPAWN boundary) — AFTER plan-time routing
// (sprint-planner.ts's routeTasksV3ForPlan → selectBestAgent) has already resolved
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
import {
  PROVIDER_FALLBACK_SELECTED_CHANNEL,
  routeSprintTasks,
} from '../../src/orchestra/sprint-spawner.js';
import { readEvents } from '../../src/orchestra/event-stream.js';
// S3: the V2 engine is gone — mirror sprint-spawner's local journal-path convention.
import { join as joinJournalPath } from 'node:path';
function routingDecisionJournalPath(projectRoot: string, sprintId: string): string {
  return joinJournalPath(projectRoot, '.deckent', 'routing', 'decisions', `${sprintId}.jsonl`);
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '409-003-t',
    title: 'Surface routing test',
    description: 'Wire surface-bonus into plan-time router',
    model: 'claude-sonnet-5',
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

describe('ROUTING-TEK-OTORİTE — S3: the override lane itself is retired', () => {
  it('routeTask NEVER re-derives an agent — the plan-time V3 decision is verbatim-authoritative', () => {
    // Pre-S3, routeTask's surface-bonus re-derivation could disagree with the
    // plan-time assignment (the double-authority class). The lane is deleted:
    // whatever the V3 planner assigned is exactly what spawn-time sees.
    const task = makeTask({ scope: cliCommandsScope, assignedAgent: 'refactorer' });
    const routing = routeTask(task, config, allProviders);
    expect(routing.agent).toBe('refactorer');
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

  it('an unassigned task stays honestly generic — no spawn-time re-derivation exists (S3)', () => {
    const tasks = [makeTask({ scope: cliCommandsScope })];
    expect(tasks[0]!.assignedAgent).toBeUndefined();
    routeSprintTasks(tasks, config, allProviders);
    // Spawn-time cannot invent an agent: an unrouted task surfaces as-is
    // (the V3 plan gate blocks unassigned tasks long before spawn).
    expect(tasks[0]!.assignedAgent).toBeUndefined();
  });

  it("a literal 'generic' assignment passes through unchanged (S3: no re-derivation)", () => {
    const tasks = [makeTask({ scope: cliCommandsScope, assignedAgent: 'generic' })];
    routeSprintTasks(tasks, config, allProviders);
    expect(tasks[0]!.assignedAgent).toBe('generic');
  });

  it("an '' assignment resolves to the spawn floor 'generic' only (S3: no re-derivation)", () => {
    const tasks = [makeTask({ scope: cliCommandsScope, assignedAgent: '' })];
    routeSprintTasks(tasks, config, allProviders);
    expect(['', 'generic']).toContain(tasks[0]!.assignedAgent ?? '');
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

  it('S3: the spawn-fallback lane is retired — an unpinned task journals NOTHING', () => {
    projectRoot = mkdtempSync(join(tmpdir(), 'deckent-409-003-'));
    const sprintId = 'sprint-409';
    const tasks = [makeTask({ scope: cliCommandsScope })]; // no plan-time pin
    routeSprintTasks(tasks, config, allProviders, { projectRoot, sprintId });

    // No override → no spawn-fallback record. The V3 plan-time journal
    // (.deckent/routing/decisions) is the sole routing record.
    const filePath = routingDecisionJournalPath(projectRoot, sprintId);
    expect(existsSync(filePath)).toBe(false);
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
    expect(tasks[0]!.assignedAgent).toBeUndefined(); // S3: no spawn-time re-derivation
  });
});

describe('provider fallback — durable pre-spawn provenance', () => {
  let projectRoot: string;

  afterEach(() => {
    if (projectRoot) rmSync(projectRoot, { recursive: true, force: true });
  });

  const fallbackConfig = {
    worker_provider: 'claude',
    provider_fallback: { worker: ['gemini', 'codex'] },
  } as unknown as ResolvedConfig;

  it('persists structured fallback evidence before mutating the task provider', () => {
    projectRoot = mkdtempSync(join(tmpdir(), 'deckent-provider-fallback-'));
    const sprintId = 'sprint-provider-fallback';
    const tasks = [makeTask({ provider: 'ollama' })];

    routeSprintTasks(tasks, fallbackConfig, ['codex', 'gemini'], { projectRoot, sprintId });

    expect(tasks[0]!.provider).toBe('gemini');
    const events = readEvents(projectRoot, sprintId, {
      channel: PROVIDER_FALLBACK_SELECTED_CHANNEL,
    });
    expect(events).toHaveLength(1);
    expect(events[0]!.payload).toEqual({
      taskId: tasks[0]!.id,
      requestedProvider: 'ollama',
      selectedProvider: 'gemini',
      configuredOrder: ['claude', 'gemini', 'codex'],
      reasonCode: 'preferred_unavailable',
    });
  });

  it('rejects a fallback without durable sprint context before task mutation', () => {
    const tasks = [makeTask({ provider: 'ollama' })];
    try {
      routeSprintTasks(tasks, fallbackConfig, ['codex', 'gemini']);
      throw new Error('expected provider fallback provenance failure');
    } catch (error) {
      expect(error).toMatchObject({
        name: 'ProviderRoutingError',
        code: 'E_PROVIDER_FALLBACK_PROVENANCE_REQUIRED',
      });
    }
    expect(tasks[0]!.provider).toBe('ollama');
  });

  it('does not emit fallback evidence when the preferred provider is available', () => {
    projectRoot = mkdtempSync(join(tmpdir(), 'deckent-provider-primary-'));
    const sprintId = 'sprint-provider-primary';
    const tasks = [makeTask({ provider: 'claude' })];

    routeSprintTasks(tasks, fallbackConfig, ['claude', 'gemini'], { projectRoot, sprintId });

    expect(tasks[0]!.provider).toBe('claude');
    expect(readEvents(projectRoot, sprintId, {
      channel: PROVIDER_FALLBACK_SELECTED_CHANNEL,
    })).toHaveLength(0);
  });
});
