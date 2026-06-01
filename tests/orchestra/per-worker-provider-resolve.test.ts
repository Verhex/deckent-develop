import { describe, it, expect } from 'vitest';
import {
  routeTask,
  resolveWorkerAuth,
  type TaskRouterConfig,
} from '../../src/orchestra/task-router.js';
import { TaskStatus, type Task, type ProviderName } from '../../src/core/types.js';

// ─── Helpers ────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '215-007-test',
    title: 'Per-worker auth test',
    description: 'Tests per-worker provider+authMode resolution',
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

// ─── resolveWorkerAuth ───────────────────────────────────────────────

describe('resolveWorkerAuth', () => {
  it('DIRECTIVES override: task.authMode="api" takes highest priority', () => {
    const task = makeTask({ authMode: 'api' });
    const config: TaskRouterConfig = { auth_mode: 'subscription' };
    expect(resolveWorkerAuth(task, config)).toBe('api');
  });

  it('DIRECTIVES override: task.authMode="subscription" overrides config api', () => {
    const task = makeTask({ authMode: 'subscription' });
    const config: TaskRouterConfig = { auth_mode: 'api' };
    expect(resolveWorkerAuth(task, config)).toBe('subscription');
  });

  it('config fallback: no task.authMode, config.auth_mode="api"', () => {
    const task = makeTask(); // no authMode
    const config: TaskRouterConfig = { auth_mode: 'api' };
    expect(resolveWorkerAuth(task, config)).toBe('api');
  });

  it('default fallback: no task.authMode, no config → "subscription"', () => {
    const task = makeTask();
    const config: TaskRouterConfig = {};
    expect(resolveWorkerAuth(task, config)).toBe('subscription');
  });

  it('config.auth_mode="subscription" explicit → "subscription"', () => {
    const task = makeTask();
    const config: TaskRouterConfig = { auth_mode: 'subscription' };
    expect(resolveWorkerAuth(task, config)).toBe('subscription');
  });
});

// ─── routeTask — authMode first-class in result ──────────────────────

describe('routeTask authMode resolution', () => {
  it('includes authMode in routing result — DIRECTIVES api override', () => {
    const task = makeTask({ authMode: 'api' });
    const result = routeTask(task, {}, allProviders);
    expect(result.authMode).toBe('api');
  });

  it('includes authMode in routing result — config fallback subscription', () => {
    const task = makeTask();
    const config: TaskRouterConfig = { auth_mode: 'subscription' };
    const result = routeTask(task, config, allProviders);
    expect(result.authMode).toBe('subscription');
  });

  it('includes authMode in routing result — no-provider fallback path', () => {
    const task = makeTask({ authMode: 'api' });
    const result = routeTask(task, {}, []); // no providers → fallback path
    expect(result.authMode).toBe('api');
    expect(result.provider).toBeDefined();
  });

  it('authMode does not affect provider selection — provider resolved independently', () => {
    const taskApi = makeTask({ authMode: 'api', provider: 'gemini' });
    const taskSub = makeTask({ authMode: 'subscription', provider: 'gemini' });
    const resultApi = routeTask(taskApi, {}, allProviders);
    const resultSub = routeTask(taskSub, {}, allProviders);
    expect(resultApi.provider).toBe('gemini');
    expect(resultSub.provider).toBe('gemini');
    expect(resultApi.authMode).toBe('api');
    expect(resultSub.authMode).toBe('subscription');
  });

  it('3-mode uniform: authMode resolved identically for Sprint/Task/Process context', () => {
    const task = makeTask({ authMode: 'api' });
    // Sprint mode config
    const sprintConfig: TaskRouterConfig = { worker_provider: 'claude' };
    // Task mode config (deckent_style=task — same config shape)
    const taskModeConfig: TaskRouterConfig = { worker_provider: 'codex' };
    // Process mode config (F3 — same config shape)
    const processConfig: TaskRouterConfig = { worker_provider: 'gemini' };

    const rSprint = routeTask(task, sprintConfig, allProviders);
    const rTask = routeTask(task, taskModeConfig, allProviders);
    const rProcess = routeTask(task, processConfig, allProviders);

    // authMode is identical across all modes — task.authMode='api' wins in all cases
    expect(rSprint.authMode).toBe('api');
    expect(rTask.authMode).toBe('api');
    expect(rProcess.authMode).toBe('api');
  });

  it('graceful: unknown/invalid provider still gets authMode resolved', () => {
    const task = makeTask({ provider: 'unknown-provider' as ProviderName });
    // 'unknown-provider' is not a valid ProviderName → falls through to config default
    const config: TaskRouterConfig = { auth_mode: 'api', worker_provider: 'claude' };
    const result = routeTask(task, config, allProviders);
    expect(result.authMode).toBe('api');
    expect(result.provider).toBeDefined(); // graceful fallback, not a crash
  });
});
