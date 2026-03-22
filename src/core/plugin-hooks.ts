// ─── Plugin Hook System ───────────────────────────────────────────────────────
// Allows plugins to register callbacks that run at specific sprint/task lifecycle points.
// loadPluginHooks() scans .deckent/plugins/, loads enabled plugins, and registers their hooks.

import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import type { Task, TaskResult, Sprint, ResolvedConfig } from './types.js';
import { scanPlugins } from './plugin.js';
import type { Plugin } from './plugin.js';

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
  const callbacks = hookRegistry.get(hook);
  if (callbacks) callbacks.push(callback); // narrowed: set() called above
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

// ─── Plugin Loading ──────────────────────────────────────────────────────────

/** Valid hook names that can appear in a plugin manifest */
const VALID_HOOK_NAMES: readonly PluginHook[] = ['beforeSprint', 'afterSprint', 'beforeTask', 'afterTask'];

/**
 * Try to load a hook module from a plugin directory.
 * The hook path (from manifest.hooks) is resolved relative to the plugin dir.
 * The module must export a default function.
 * Returns the callback, or null if loading fails.
 * @internal
 */
export async function loadHookModule(
  pluginDir: string,
  hookPath: string,
): Promise<HookCallback | null> {
  const fullPath = join(pluginDir, hookPath);
  if (!existsSync(fullPath)) {
    process.stderr.write(
      `[plugin-hooks] Hook file not found: ${fullPath}\n`,
    );
    return null;
  }
  try {
    const fileUrl = pathToFileURL(fullPath).href;
    const mod = await import(fileUrl);
    const fn = mod.default ?? mod;
    if (typeof fn !== 'function') {
      process.stderr.write(
        `[plugin-hooks] Hook module does not export a function: ${fullPath}\n`,
      );
      return null;
    }
    return fn as HookCallback;
  } catch (err) {
    process.stderr.write(
      `[plugin-hooks] Failed to load hook module ${fullPath}: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return null;
  }
}

/**
 * Register hooks from a single plugin's manifest.
 * For each hook declared in manifest.hooks, loads the module and registers the callback.
 * Non-fatal — loading failures are logged and skipped.
 * @internal
 */
export async function registerPluginHooks(plugin: Plugin): Promise<number> {
  const hooks = plugin.manifest.hooks;
  if (!hooks) return 0;

  let registered = 0;
  for (const hookName of VALID_HOOK_NAMES) {
    const hookPath = hooks[hookName as keyof typeof hooks];
    if (!hookPath) continue;

    const callback = await loadHookModule(plugin.dir, hookPath);
    if (callback) {
      registerHook(hookName, callback);
      registered++;
    }
  }
  return registered;
}

/**
 * Scan .deckent/plugins/ for enabled plugins, load their hook modules, and register
 * all declared hooks. Clears any previously registered hooks first.
 *
 * Non-fatal: individual plugin/hook loading failures are logged to stderr.
 * Returns the total number of hooks registered.
 */
export async function loadPluginHooks(projectRoot: string): Promise<number> {
  clearHooks();
  const plugins = scanPlugins(projectRoot);
  if (plugins.length === 0) return 0;

  let totalRegistered = 0;
  for (const plugin of plugins) {
    try {
      const count = await registerPluginHooks(plugin);
      totalRegistered += count;
    } catch (err) {
      // Non-fatal — log and continue with next plugin
      process.stderr.write(
        `[plugin-hooks] Failed to register hooks for plugin "${plugin.manifest.name}": ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  }
  return totalRegistered;
}
