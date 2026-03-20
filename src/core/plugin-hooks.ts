// ─── Plugin Hook System ───────────────────────────────────────────────────────
// Allows plugins to register callbacks that run at specific sprint/task lifecycle points.

import type { Task, TaskResult, Sprint, ResolvedConfig } from './types.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PluginHook = 'beforeSprint' | 'afterSprint' | 'beforeTask' | 'afterTask';

export interface BeforeSprintContext {
  hook: 'beforeSprint';
  sprintId: string;
  tasks: Task[];
  config: ResolvedConfig;
  projectRoot: string;
}

export interface AfterSprintContext {
  hook: 'afterSprint';
  sprint: Sprint;
  projectRoot: string;
}

export interface BeforeTaskContext {
  hook: 'beforeTask';
  task: Task;
  projectRoot: string;
}

export interface AfterTaskContext {
  hook: 'afterTask';
  task: Task;
  result: TaskResult;
  projectRoot: string;
}

export type HookContext =
  | BeforeSprintContext
  | AfterSprintContext
  | BeforeTaskContext
  | AfterTaskContext;

export type HookCallback = (context: HookContext) => Promise<void> | void;

// ─── Registry ─────────────────────────────────────────────────────────────────

const hookRegistry = new Map<PluginHook, HookCallback[]>();

/**
 * Register a callback for a specific hook.
 * Multiple callbacks can be registered for the same hook — they run in registration order.
 */
export function registerHook(hook: PluginHook, callback: HookCallback): void {
  if (!hookRegistry.has(hook)) {
    hookRegistry.set(hook, []);
  }
  hookRegistry.get(hook)!.push(callback);
}

/**
 * Run all registered callbacks for a given hook.
 * Callbacks are awaited sequentially. Errors in individual callbacks are caught and logged
 * to stderr so a failing hook never aborts the sprint.
 */
export async function runHooks(hook: PluginHook, context: HookContext): Promise<void> {
  const callbacks = hookRegistry.get(hook);
  if (!callbacks || callbacks.length === 0) {
    return;
  }
  for (const callback of callbacks) {
    try {
      await callback(context);
    } catch (err) {
      // Hook errors are non-fatal — log to stderr and continue
      process.stderr.write(
        `[plugin-hooks] Hook "${hook}" callback threw: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  }
}

/**
 * Clear all registered hooks. Useful for testing or resetting state between sprints.
 */
export function clearHooks(): void {
  hookRegistry.clear();
}

/**
 * Get the number of registered callbacks for a given hook.
 * Useful for testing and diagnostics.
 */
export function getHookCount(hook: PluginHook): number {
  return hookRegistry.get(hook)?.length ?? 0;
}

/**
 * Clear callbacks for a specific hook only.
 */
export function clearHook(hook: PluginHook): void {
  hookRegistry.delete(hook);
}
