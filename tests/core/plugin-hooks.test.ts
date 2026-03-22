import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  registerHook,
  runHooks,
  clearHooks,
  clearHook,
  getHookCount,
  loadPluginHooks,
  registerPluginHooks,
  loadHookModule,
  type PluginHook,
  type HookCallback,
  type HookContext,
  type BeforeSprintContext,
  type AfterSprintContext,
  type BeforeTaskContext,
  type AfterTaskContext,
} from '../../src/core/plugin-hooks.js';
import type { Plugin } from '../../src/core/plugin.js';
import type { Task, Sprint, TaskResult, ResolvedConfig } from '../../src/core/types.js';
import { TaskStatus, SprintPhase, SprintStatus } from '../../src/core/types.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-001',
    title: 'Test Task',
    description: 'A test task',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'testing',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'tests pass', noGoCriteria: 'tests fail', techDebtAcceptable: 'minor' },
    status: TaskStatus.PENDING,
    ...overrides,
  };
}

function makeSprint(overrides: Partial<Sprint> = {}): Sprint {
  return {
    id: 'sprint-001',
    number: 1,
    status: SprintStatus.COMPLETE,
    phase: SprintPhase.COMPLETE,
    tasks: [makeTask()],
    workers: ['w-001'],
    ...overrides,
  };
}

function makeResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: 'task-001',
    workerId: 'w-001',
    filesChanged: ['src/foo.ts'],
    linesAdded: 10,
    linesRemoved: 2,
    testsPassed: true,
    coverage: 85,
    selfAssessment: 'DONE',
    notes: 'All good',
    ...overrides,
  };
}

function makeConfig(): ResolvedConfig {
  return {
    mode: 'pro_plan',
    activeModeConfig: {
      max_workers: 2,
      brain_model: 'sonnet',
      default_model: 'sonnet',
      haiku_allowed: false,
      usage_thresholds: { '5hr': 80, weekly: 80 },
    },
    modes: {} as ResolvedConfig['modes'],
    language: 'en',
    projectName: 'test-project',
    projectRoot: '/tmp/test',
    version: '1.0.0',
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('plugin-hooks', () => {
  beforeEach(() => {
    clearHooks();
  });

  afterEach(() => {
    clearHooks();
  });

  // ─── registerHook ────────────────────────────────────────────────

  describe('registerHook', () => {
    it('registers a callback for a hook', () => {
      const cb = vi.fn();
      registerHook('beforeSprint', cb);
      expect(getHookCount('beforeSprint')).toBe(1);
    });

    it('registers multiple callbacks for the same hook', () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      registerHook('beforeSprint', cb1);
      registerHook('beforeSprint', cb2);
      expect(getHookCount('beforeSprint')).toBe(2);
    });

    it('registers callbacks for different hooks independently', () => {
      registerHook('beforeSprint', vi.fn());
      registerHook('afterSprint', vi.fn());
      registerHook('beforeTask', vi.fn());
      registerHook('afterTask', vi.fn());
      expect(getHookCount('beforeSprint')).toBe(1);
      expect(getHookCount('afterSprint')).toBe(1);
      expect(getHookCount('beforeTask')).toBe(1);
      expect(getHookCount('afterTask')).toBe(1);
    });

    it('allows registering the same callback function multiple times', () => {
      const cb = vi.fn();
      registerHook('beforeSprint', cb);
      registerHook('beforeSprint', cb);
      expect(getHookCount('beforeSprint')).toBe(2);
    });
  });

  // ─── runHooks ─────────────────────────────────────────────────────

  describe('runHooks — beforeSprint', () => {
    it('calls registered callback with correct context', async () => {
      const cb = vi.fn();
      registerHook('beforeSprint', cb);
      const ctx: BeforeSprintContext = {
        hook: 'beforeSprint',
        sprintId: 'sprint-001',
        tasks: [makeTask()],
        config: makeConfig(),
        projectRoot: '/tmp/test',
      };
      await runHooks('beforeSprint', ctx);
      expect(cb).toHaveBeenCalledOnce();
      expect(cb).toHaveBeenCalledWith(ctx);
    });

    it('calls all registered callbacks in order', async () => {
      const order: number[] = [];
      registerHook('beforeSprint', () => { order.push(1); });
      registerHook('beforeSprint', () => { order.push(2); });
      registerHook('beforeSprint', () => { order.push(3); });
      const ctx: BeforeSprintContext = {
        hook: 'beforeSprint',
        sprintId: 'sprint-001',
        tasks: [],
        config: makeConfig(),
        projectRoot: '/tmp',
      };
      await runHooks('beforeSprint', ctx);
      expect(order).toEqual([1, 2, 3]);
    });

    it('does nothing when no callbacks registered', async () => {
      const ctx: BeforeSprintContext = {
        hook: 'beforeSprint',
        sprintId: 'sprint-001',
        tasks: [],
        config: makeConfig(),
        projectRoot: '/tmp',
      };
      await expect(runHooks('beforeSprint', ctx)).resolves.toBeUndefined();
    });
  });

  describe('runHooks — afterSprint', () => {
    it('calls callback with sprint context', async () => {
      const cb = vi.fn();
      registerHook('afterSprint', cb);
      const ctx: AfterSprintContext = {
        hook: 'afterSprint',
        sprint: makeSprint(),
        projectRoot: '/tmp',
      };
      await runHooks('afterSprint', ctx);
      expect(cb).toHaveBeenCalledWith(ctx);
    });

    it('awaits async callbacks', async () => {
      const log: string[] = [];
      registerHook('afterSprint', async () => {
        await new Promise(r => setTimeout(r, 5));
        log.push('done');
      });
      const ctx: AfterSprintContext = {
        hook: 'afterSprint',
        sprint: makeSprint(),
        projectRoot: '/tmp',
      };
      await runHooks('afterSprint', ctx);
      expect(log).toEqual(['done']);
    });
  });

  describe('runHooks — beforeTask', () => {
    it('calls callback with task context', async () => {
      const cb = vi.fn();
      registerHook('beforeTask', cb);
      const ctx: BeforeTaskContext = {
        hook: 'beforeTask',
        task: makeTask(),
        projectRoot: '/tmp',
      };
      await runHooks('beforeTask', ctx);
      expect(cb).toHaveBeenCalledWith(ctx);
    });
  });

  describe('runHooks — afterTask', () => {
    it('calls callback with task and result context', async () => {
      const cb = vi.fn();
      registerHook('afterTask', cb);
      const ctx: AfterTaskContext = {
        hook: 'afterTask',
        task: makeTask(),
        result: makeResult(),
        projectRoot: '/tmp',
      };
      await runHooks('afterTask', ctx);
      expect(cb).toHaveBeenCalledWith(ctx);
    });
  });

  // ─── Error handling ────────────────────────────────────────────────

  describe('runHooks — error handling', () => {
    it('continues calling subsequent callbacks when one throws', async () => {
      const log: string[] = [];
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

      registerHook('beforeSprint', () => { throw new Error('hook error'); });
      registerHook('beforeSprint', () => { log.push('second'); });

      const ctx: BeforeSprintContext = {
        hook: 'beforeSprint',
        sprintId: 'sprint-001',
        tasks: [],
        config: makeConfig(),
        projectRoot: '/tmp',
      };
      await runHooks('beforeSprint', ctx);
      expect(log).toEqual(['second']);
      stderrSpy.mockRestore();
    });

    it('logs error to stderr when callback throws', async () => {
      const stderrOutput: string[] = [];
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((data) => {
        stderrOutput.push(String(data));
        return true;
      });

      registerHook('afterSprint', () => { throw new Error('boom'); });
      const ctx: AfterSprintContext = {
        hook: 'afterSprint',
        sprint: makeSprint(),
        projectRoot: '/tmp',
      };
      await runHooks('afterSprint', ctx);
      expect(stderrOutput.some(s => s.includes('boom'))).toBe(true);
      stderrSpy.mockRestore();
    });

    it('handles async callback rejection without throwing', async () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      registerHook('beforeTask', async () => { throw new Error('async error'); });
      const ctx: BeforeTaskContext = {
        hook: 'beforeTask',
        task: makeTask(),
        projectRoot: '/tmp',
      };
      await expect(runHooks('beforeTask', ctx)).resolves.toBeUndefined();
      stderrSpy.mockRestore();
    });

    it('includes hook name in stderr log message', async () => {
      const stderrOutput: string[] = [];
      vi.spyOn(process.stderr, 'write').mockImplementation((data) => {
        stderrOutput.push(String(data));
        return true;
      });
      registerHook('afterTask', () => { throw new Error('bad'); });
      const ctx: AfterTaskContext = {
        hook: 'afterTask',
        task: makeTask(),
        result: makeResult(),
        projectRoot: '/tmp',
      };
      await runHooks('afterTask', ctx);
      expect(stderrOutput.some(s => s.includes('"afterTask"'))).toBe(true);
      vi.restoreAllMocks();
    });
  });

  // ─── clearHooks ──────────────────────────────────────────────────────

  describe('clearHooks', () => {
    it('removes all registered hooks', () => {
      registerHook('beforeSprint', vi.fn());
      registerHook('afterSprint', vi.fn());
      clearHooks();
      expect(getHookCount('beforeSprint')).toBe(0);
      expect(getHookCount('afterSprint')).toBe(0);
    });

    it('after clear, runHooks does nothing', async () => {
      const cb = vi.fn();
      registerHook('beforeSprint', cb);
      clearHooks();
      const ctx: BeforeSprintContext = {
        hook: 'beforeSprint',
        sprintId: 'sprint-001',
        tasks: [],
        config: makeConfig(),
        projectRoot: '/tmp',
      };
      await runHooks('beforeSprint', ctx);
      expect(cb).not.toHaveBeenCalled();
    });
  });

  // ─── clearHook ────────────────────────────────────────────────────

  describe('clearHook', () => {
    it('clears only the specified hook', () => {
      registerHook('beforeSprint', vi.fn());
      registerHook('afterSprint', vi.fn());
      clearHook('beforeSprint');
      expect(getHookCount('beforeSprint')).toBe(0);
      expect(getHookCount('afterSprint')).toBe(1);
    });

    it('no-op when hook has no registered callbacks', () => {
      expect(() => clearHook('beforeSprint')).not.toThrow();
      expect(getHookCount('beforeSprint')).toBe(0);
    });
  });

  // ─── getHookCount ─────────────────────────────────────────────────

  describe('getHookCount', () => {
    it('returns 0 when no callbacks registered', () => {
      expect(getHookCount('beforeSprint')).toBe(0);
    });

    it('returns correct count after multiple registrations', () => {
      registerHook('beforeTask', vi.fn());
      registerHook('beforeTask', vi.fn());
      registerHook('beforeTask', vi.fn());
      expect(getHookCount('beforeTask')).toBe(3);
    });

    it('returns correct count for each hook independently', () => {
      registerHook('beforeSprint', vi.fn());
      registerHook('beforeSprint', vi.fn());
      registerHook('afterSprint', vi.fn());
      expect(getHookCount('beforeSprint')).toBe(2);
      expect(getHookCount('afterSprint')).toBe(1);
      expect(getHookCount('beforeTask')).toBe(0);
      expect(getHookCount('afterTask')).toBe(0);
    });
  });

  // ─── Context type discrimination ──────────────────────────────────

  describe('HookContext type discrimination', () => {
    it('callback receives context with correct hook field', async () => {
      let receivedHook: string | undefined;
      registerHook('beforeSprint', (ctx) => {
        receivedHook = ctx.hook;
      });
      const ctx: BeforeSprintContext = {
        hook: 'beforeSprint',
        sprintId: 'sprint-001',
        tasks: [],
        config: makeConfig(),
        projectRoot: '/tmp',
      };
      await runHooks('beforeSprint', ctx);
      expect(receivedHook).toBe('beforeSprint');
    });

    it('afterSprint context contains sprint object', async () => {
      let receivedSprint: Sprint | undefined;
      registerHook('afterSprint', (ctx) => {
        if (ctx.hook === 'afterSprint') {
          receivedSprint = ctx.sprint;
        }
      });
      const sprint = makeSprint();
      await runHooks('afterSprint', { hook: 'afterSprint', sprint, projectRoot: '/tmp' });
      expect(receivedSprint?.id).toBe('sprint-001');
    });

    it('afterTask context contains both task and result', async () => {
      let capturedCtx: AfterTaskContext | undefined;
      registerHook('afterTask', (ctx) => {
        if (ctx.hook === 'afterTask') capturedCtx = ctx;
      });
      const task = makeTask();
      const result = makeResult();
      await runHooks('afterTask', { hook: 'afterTask', task, result, projectRoot: '/tmp' });
      expect(capturedCtx?.task.id).toBe('task-001');
      expect(capturedCtx?.result.selfAssessment).toBe('DONE');
    });
  });

  // ─── loadHookModule ────────────────────────────────────────────────

  describe('loadHookModule', () => {
    it('returns null when hook file does not exist', async () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      const result = await loadHookModule('/nonexistent/plugin', 'hooks/before.js');
      expect(result).toBeNull();
      expect(stderrSpy).toHaveBeenCalled();
      stderrSpy.mockRestore();
    });

    it('logs error for nonexistent hook file', async () => {
      const stderrOutput: string[] = [];
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((data) => {
        stderrOutput.push(String(data));
        return true;
      });
      await loadHookModule('/nonexistent/dir', 'hook.js');
      expect(stderrOutput.some(s => s.includes('Hook file not found'))).toBe(true);
      stderrSpy.mockRestore();
    });
  });

  // ─── registerPluginHooks ──────────────────────────────────────────

  describe('registerPluginHooks', () => {
    it('returns 0 when plugin has no hooks', async () => {
      const plugin: Plugin = {
        manifest: {
          name: 'test-plugin',
          version: '1.0.0',
          description: 'Test',
          entrypoint: 'SKILL.md',
          enabled: true,
        },
        dir: '/tmp/plugins/test-plugin',
      };
      const count = await registerPluginHooks(plugin);
      expect(count).toBe(0);
    });

    it('returns 0 when hooks object is empty', async () => {
      const plugin: Plugin = {
        manifest: {
          name: 'test-plugin',
          version: '1.0.0',
          description: 'Test',
          entrypoint: 'SKILL.md',
          enabled: true,
          hooks: {},
        },
        dir: '/tmp/plugins/test-plugin',
      };
      const count = await registerPluginHooks(plugin);
      expect(count).toBe(0);
    });

    it('logs error and returns 0 for nonexistent hook files', async () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      const plugin: Plugin = {
        manifest: {
          name: 'test-plugin',
          version: '1.0.0',
          description: 'Test',
          entrypoint: 'SKILL.md',
          enabled: true,
          hooks: { beforeSprint: 'nonexistent.js' },
        },
        dir: '/tmp/nonexistent-plugin-dir',
      };
      const count = await registerPluginHooks(plugin);
      expect(count).toBe(0);
      stderrSpy.mockRestore();
    });
  });

  // ─── loadPluginHooks ──────────────────────────────────────────────

  describe('loadPluginHooks', () => {
    it('returns 0 when plugins directory does not exist', async () => {
      const tmpDir = path.join('/tmp', `plugin-hooks-test-${Date.now()}`);
      const count = await loadPluginHooks(tmpDir);
      expect(count).toBe(0);
    });

    it('returns 0 when plugins directory is empty', async () => {
      const tmpDir = path.join('/tmp', `plugin-hooks-test-${Date.now()}`);
      const pluginsDir = path.join(tmpDir, '.deckent', 'plugins');
      fs.mkdirSync(pluginsDir, { recursive: true });
      try {
        const count = await loadPluginHooks(tmpDir);
        expect(count).toBe(0);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('clears previously registered hooks before scanning', async () => {
      registerHook('beforeSprint', vi.fn());
      expect(getHookCount('beforeSprint')).toBe(1);

      const tmpDir = path.join('/tmp', `plugin-hooks-test-${Date.now()}`);
      await loadPluginHooks(tmpDir);
      expect(getHookCount('beforeSprint')).toBe(0);
    });

    it('skips disabled plugins', async () => {
      const tmpDir = path.join('/tmp', `plugin-hooks-test-${Date.now()}`);
      const pluginDir = path.join(tmpDir, '.deckent', 'plugins', 'disabled-plugin');
      fs.mkdirSync(pluginDir, { recursive: true });
      fs.writeFileSync(
        path.join(pluginDir, 'manifest.json'),
        JSON.stringify({
          name: 'disabled-plugin',
          version: '1.0.0',
          description: 'Disabled',
          entrypoint: 'SKILL.md',
          enabled: false,
          hooks: { beforeSprint: 'hook.js' },
        }),
      );
      try {
        const count = await loadPluginHooks(tmpDir);
        expect(count).toBe(0);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('loads hooks from enabled plugin with valid hook module', async () => {
      const tmpDir = path.join('/tmp', `plugin-hooks-test-${Date.now()}`);
      const pluginDir = path.join(tmpDir, '.deckent', 'plugins', 'test-plugin');
      fs.mkdirSync(pluginDir, { recursive: true });
      fs.writeFileSync(
        path.join(pluginDir, 'manifest.json'),
        JSON.stringify({
          name: 'test-plugin',
          version: '1.0.0',
          description: 'Test',
          entrypoint: 'SKILL.md',
          enabled: true,
          hooks: { beforeSprint: 'before-sprint.mjs' },
        }),
      );
      // Write a valid hook module
      fs.writeFileSync(
        path.join(pluginDir, 'before-sprint.mjs'),
        'export default function(ctx) { /* noop */ }\n',
      );
      try {
        const count = await loadPluginHooks(tmpDir);
        expect(count).toBe(1);
        expect(getHookCount('beforeSprint')).toBe(1);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('loads multiple hooks from a single plugin', async () => {
      const tmpDir = path.join('/tmp', `plugin-hooks-test-${Date.now()}`);
      const pluginDir = path.join(tmpDir, '.deckent', 'plugins', 'multi-hook-plugin');
      fs.mkdirSync(pluginDir, { recursive: true });
      fs.writeFileSync(
        path.join(pluginDir, 'manifest.json'),
        JSON.stringify({
          name: 'multi-hook-plugin',
          version: '1.0.0',
          description: 'Multi hook',
          entrypoint: 'SKILL.md',
          enabled: true,
          hooks: {
            beforeSprint: 'before-sprint.mjs',
            afterSprint: 'after-sprint.mjs',
          },
        }),
      );
      fs.writeFileSync(
        path.join(pluginDir, 'before-sprint.mjs'),
        'export default function(ctx) {}\n',
      );
      fs.writeFileSync(
        path.join(pluginDir, 'after-sprint.mjs'),
        'export default function(ctx) {}\n',
      );
      try {
        const count = await loadPluginHooks(tmpDir);
        expect(count).toBe(2);
        expect(getHookCount('beforeSprint')).toBe(1);
        expect(getHookCount('afterSprint')).toBe(1);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('loads hooks from multiple plugins in registration order', async () => {
      const tmpDir = path.join('/tmp', `plugin-hooks-test-${Date.now()}`);
      const pluginsDir = path.join(tmpDir, '.deckent', 'plugins');

      // Plugin A
      const pluginADir = path.join(pluginsDir, 'aaa-plugin');
      fs.mkdirSync(pluginADir, { recursive: true });
      fs.writeFileSync(
        path.join(pluginADir, 'manifest.json'),
        JSON.stringify({
          name: 'aaa-plugin',
          version: '1.0.0',
          description: 'A',
          entrypoint: 'SKILL.md',
          enabled: true,
          hooks: { beforeSprint: 'hook.mjs' },
        }),
      );
      fs.writeFileSync(
        path.join(pluginADir, 'hook.mjs'),
        'export default function(ctx) {}\n',
      );

      // Plugin B
      const pluginBDir = path.join(pluginsDir, 'bbb-plugin');
      fs.mkdirSync(pluginBDir, { recursive: true });
      fs.writeFileSync(
        path.join(pluginBDir, 'manifest.json'),
        JSON.stringify({
          name: 'bbb-plugin',
          version: '1.0.0',
          description: 'B',
          entrypoint: 'SKILL.md',
          enabled: true,
          hooks: { beforeSprint: 'hook.mjs' },
        }),
      );
      fs.writeFileSync(
        path.join(pluginBDir, 'hook.mjs'),
        'export default function(ctx) {}\n',
      );

      try {
        const count = await loadPluginHooks(tmpDir);
        expect(count).toBe(2);
        expect(getHookCount('beforeSprint')).toBe(2);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('handles invalid hook module gracefully', async () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      const tmpDir = path.join('/tmp', `plugin-hooks-test-${Date.now()}`);
      const pluginDir = path.join(tmpDir, '.deckent', 'plugins', 'bad-plugin');
      fs.mkdirSync(pluginDir, { recursive: true });
      fs.writeFileSync(
        path.join(pluginDir, 'manifest.json'),
        JSON.stringify({
          name: 'bad-plugin',
          version: '1.0.0',
          description: 'Bad',
          entrypoint: 'SKILL.md',
          enabled: true,
          hooks: { beforeSprint: 'bad-hook.mjs' },
        }),
      );
      // Write a module that doesn't export a function
      fs.writeFileSync(
        path.join(pluginDir, 'bad-hook.mjs'),
        'export default "not-a-function";\n',
      );
      try {
        const count = await loadPluginHooks(tmpDir);
        expect(count).toBe(0);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        stderrSpy.mockRestore();
      }
    });

    it('hook callback receives correct context when executed', async () => {
      const tmpDir = path.join('/tmp', `plugin-hooks-test-${Date.now()}`);
      const pluginDir = path.join(tmpDir, '.deckent', 'plugins', 'ctx-plugin');
      fs.mkdirSync(pluginDir, { recursive: true });
      fs.writeFileSync(
        path.join(pluginDir, 'manifest.json'),
        JSON.stringify({
          name: 'ctx-plugin',
          version: '1.0.0',
          description: 'Context test',
          entrypoint: 'SKILL.md',
          enabled: true,
          hooks: { afterSprint: 'after.mjs' },
        }),
      );
      // Hook that writes to a global for verification
      fs.writeFileSync(
        path.join(pluginDir, 'after.mjs'),
        `export default function(ctx) {
          if (!globalThis.__hookTestCalls) globalThis.__hookTestCalls = [];
          globalThis.__hookTestCalls.push(ctx.hook);
        }\n`,
      );
      try {
        await loadPluginHooks(tmpDir);
        expect(getHookCount('afterSprint')).toBe(1);
        const sprint = makeSprint();
        await runHooks('afterSprint', { hook: 'afterSprint', sprint, projectRoot: tmpDir });
        // Verify the hook was called
        const calls = (globalThis as Record<string, unknown>).__hookTestCalls as string[] | undefined;
        expect(calls).toContain('afterSprint');
      } finally {
        delete (globalThis as Record<string, unknown>).__hookTestCalls;
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });
});
