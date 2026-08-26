// ─── Plugin Hook System ───────────────────────────────────────────────────────
// Allows plugins to register callbacks that run at specific sprint/task lifecycle points.
// loadPluginHooks() scans .deckent/plugins/, loads enabled plugins, and registers their hooks.

import { join, dirname, basename, extname } from 'node:path';
import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import type { Task, TaskResult, Sprint, ResolvedConfig } from './types.js';
import type { DeckentConfig, PluginSecurityEnforcement } from './config-types.js';
import { scanPlugins } from './plugin.js';
import { PluginSecurityError } from './plugin.js';
import type { Plugin } from './plugin.js';
import { validatePluginSecurity, resolvePluginSecurityConfig } from './plugin-loader.js';
import type { PluginSecurityConfig, PluginsRawConfig } from './plugin-loader.js';
import { detectFullStack } from './stack-detector.js';
import { debugLog } from './utils.js';

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

// ─── Plugin Security Stance (row 7031) ───────────────────────────────────────

/**
 * Advisory→enforce stance for the 4-step plugin security pipeline
 * (allowed-path containment · SkillSandbox AST scan · SHA-256 integrity ·
 * Ed25519 publisher identity — see validatePluginSecurity()).
 *
 * - `advisory` (DEFAULT): the pipeline runs and every finding is reported loudly to
 *   stderr, but the plugin still loads. This keeps the default byte-identical in what
 *   loads: before row 7031 the production path passed no security config at all, so
 *   every plugin loaded unchecked. Advisory only adds the warnings.
 * - `enforce`: a rejected plugin fails closed — the typed PluginSecurityError
 *   propagates out of loadPluginHooks() instead of being downgraded to a stderr line.
 *
 * Flipping the default to 'enforce' is an owner decision, not a code default.
 */
export type { PluginSecurityEnforcement } from './config-types.js';

/** Default stance — advisory. Do not flip without an explicit owner decision. */
export const DEFAULT_PLUGIN_SECURITY_ENFORCEMENT: PluginSecurityEnforcement = 'advisory';

/** Options accepted by loadPluginHooks(). Superset of the previous inline
 *  `{ plugin_require_signature }` shape, so existing callers keep compiling. */
export interface LoadPluginHooksOptions {
  /** Legacy top-level config field (`DeckentConfig.plugin_require_signature`).
   *  When defined it wins over `plugins.require_signature`. */
  plugin_require_signature?: boolean;
  /** The effective config's `plugins` block (require_signature, trusted publisher
   *  keys, allowed paths) — the real security config for the pipeline. */
  plugins?: PluginsRawConfig;
  /** Advisory (default) or enforce. See PluginSecurityEnforcement. */
  security_enforcement?: PluginSecurityEnforcement;
}

/**
 * Read the advisory→enforce stance off the effective config's `plugins` block.
 *
 * `ResolvedConfig.plugins` is the runtime passthrough of this typed operator config.
 * Anything unrecognized at a runtime boundary resolves to the advisory default; a
 * present-but-unrecognized value additionally emits a typed warning rather than
 * silently degrading a security stance.
 */
export function resolvePluginSecurityEnforcement(
  plugins: DeckentConfig['plugins'] | null | undefined,
): PluginSecurityEnforcement {
  const raw = plugins?.security_enforcement;
  if (raw === undefined || raw === null) return DEFAULT_PLUGIN_SECURITY_ENFORCEMENT;
  if (raw === 'enforce') return 'enforce';
  if (raw === 'advisory') return 'advisory';
  process.stderr.write(
    `[plugin-hooks] PLUGIN_SECURITY_ENFORCEMENT_INVALID: unrecognized plugins.security_enforcement ${JSON.stringify(raw)} — falling back to "${DEFAULT_PLUGIN_SECURITY_ENFORCEMENT}"\n`,
  );
  return DEFAULT_PLUGIN_SECURITY_ENFORCEMENT;
}

/**
 * Build the PluginSecurityConfig for a load. Always returns a config — an absent
 * `plugins` block means advisory defaults plus a typed PLUGIN_SECURITY_CONFIG_ABSENT
 * warning, never an undefined-skip of the pipeline (that undefined-skip was the row-7031
 * production gap).
 *
 * `allowed_paths` defaults to `<projectRoot>/.deckent/plugins` — the only directory
 * scanPlugins() reads — so step 1 (containment) is live rather than dormant while
 * remaining a provable no-op for every plugin the scanner can return.
 */
export function resolveLoadPluginSecurityConfig(
  projectRoot: string,
  options?: LoadPluginHooksOptions,
): PluginSecurityConfig {
  const configured = options?.plugins;
  const hasConfig = configured !== undefined || options?.plugin_require_signature !== undefined;
  if (!hasConfig) {
    process.stderr.write(
      '[plugin-hooks] PLUGIN_SECURITY_CONFIG_ABSENT: no plugin security config resolved — running the security pipeline with advisory defaults (require_signature=false, no publisher trust root)\n',
    );
  }
  const plugins: PluginsRawConfig = {
    require_signature: options?.plugin_require_signature ?? configured?.require_signature ?? false,
    trusted_publisher_keys: configured?.trusted_publisher_keys,
    allowed_paths: configured?.allowed_paths ?? [join(projectRoot, '.deckent', 'plugins')],
  };
  return resolvePluginSecurityConfig(projectRoot, { plugins });
}

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
 * When securityConfig is provided, runs sandbox scan + signature verification before loading.
 * Non-fatal — loading failures are logged and skipped.
 * @internal
 */
export async function registerPluginHooks(
  plugin: Plugin,
  securityConfig?: PluginSecurityConfig,
  enforcement: PluginSecurityEnforcement = 'enforce',
): Promise<number> {
  const hooks = plugin.manifest.hooks;
  if (!hooks) return 0;

  // Security validation gate — if config provided, validate before loading any hooks
  if (securityConfig) {
    const secResult = validatePluginSecurity(plugin, securityConfig);

    // Emit warnings to stderr (non-fatal)
    for (const warning of secResult.warnings) {
      process.stderr.write(`[plugin-hooks] ${warning}\n`);
    }

    // If not allowed: fail closed under `enforce`, report-only under `advisory`.
    // Advisory still loads the plugin — before row 7031 the production path ran no
    // pipeline at all, so blocking here by default would stop plugins that load today.
    if (!secResult.allowed) {
      const errorMsg = secResult.errors.join('; ');
      if (enforcement === 'enforce') {
        throw new PluginSecurityError(
          `Plugin "${plugin.manifest.name}" rejected: ${errorMsg}`
        );
      }
      process.stderr.write(
        `[plugin-hooks] PLUGIN_SECURITY_ADVISORY: Plugin "${plugin.manifest.name}" would be rejected under enforce: ${errorMsg} — loading anyway (plugins.security_enforcement=advisory)\n`,
      );
    }
  }

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
 * The 4-step security pipeline (allowed-path containment · SkillSandbox AST scan ·
 * SHA-256 integrity · Ed25519 publisher identity) ALWAYS runs — an absent config means
 * advisory defaults plus a typed warning, never a silent skip (row 7031).
 *
 * When `options.plugin_require_signature` (or `options.plugins.require_signature`) is
 * true, plugins without a valid signature are rejected by the pipeline. Whether that
 * rejection blocks the load is governed by `options.security_enforcement`:
 * `advisory` (default) warns and loads anyway; `enforce` fails closed and the typed
 * PluginSecurityError propagates out of this function.
 *
 * Non-security plugin/hook loading failures stay non-fatal: logged to stderr, load continues.
 * Returns the total number of hooks registered.
 */
export async function loadPluginHooks(
  projectRoot: string,
  options?: LoadPluginHooksOptions,
): Promise<number> {
  clearHooks();
  const plugins = scanPlugins(projectRoot);
  if (plugins.length === 0) return 0;

  const securityConfig = resolveLoadPluginSecurityConfig(projectRoot, options);
  const enforcement = options?.security_enforcement ?? DEFAULT_PLUGIN_SECURITY_ENFORCEMENT;

  let totalRegistered = 0;
  for (const plugin of plugins) {
    try {
      const count = await registerPluginHooks(plugin, securityConfig, enforcement);
      totalRegistered += count;
    } catch (err) {
      // Fail closed under enforce: a security rejection blocks the plugin load instead of
      // being downgraded to a stderr line. Every other failure stays non-fatal as before.
      if (enforcement === 'enforce' && err instanceof PluginSecurityError) {
        throw err;
      }
      process.stderr.write(
        `[plugin-hooks] Failed to register hooks for plugin "${plugin.manifest.name}": ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  }
  return totalRegistered;
}

// ─── tsc Error File Parser ──────────────────────────────────────────────────

/**
 * Parse tsc --noEmit output to extract file paths that have errors.
 * TypeScript compiler outputs errors in the format:
 *   src/core/config.ts(12,5): error TS2345: Argument of type...
 *
 * Returns a deduplicated array of file paths (e.g. ['src/core/config.ts']).
 * Used by runEvaluatePhase to determine which tasks are responsible for tsc failures.
 */
export function parseTscErrorFiles(tscOutput: string): string[] {
  if (!tscOutput) return [];
  const files = new Set<string>();
  // Match lines like: path/to/file.ts(line,col): error TSXXXX: ...
  const regex = /^(.+?)\(\d+,\d+\):\s*error\s+TS\d+/gm;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(tscOutput)) !== null) {
    const filePath = match[1]?.trim();
    if (filePath) files.add(filePath);
  }
  return [...files];
}

// ─── CI Regression Check (afterTask built-in hook) ──────────────────────────

/** CI guardian configuration — controls pre/post sprint and task checks */
export interface CiGuardianConfig {
  enabled: boolean;
  pre_sprint_check: boolean;
  block_on_tsc_fail: boolean;
  block_on_test_fail: boolean;
  track_coverage: boolean;
  track_test_count: boolean;
}

/** Default CI guardian config */
export const DEFAULT_CI_GUARDIAN_CONFIG: CiGuardianConfig = {
  enabled: true,
  pre_sprint_check: true,
  block_on_tsc_fail: true,
  block_on_test_fail: false,
  track_coverage: true,
  track_test_count: true,
};

/** Baseline snapshot taken at sprint start */
export interface CiBaseline {
  sprintId: string;
  baseline: {
    tscPassed: boolean;
    testCount: number;
    testPassed: number;
    testFailed: number;
    coverage: number;
    timestamp: string;
  };
}

/** Result of a CI regression check after a task */
export interface CiRegressionCheckResult {
  tscPassed: boolean;
  tscOutput: string;
  targetedTestsPassed: boolean;
  targetedTestOutput: string;
  targetedTestFiles: string[];
  regressionDetected: boolean;
  testCountDelta: number;
  alerts: string[];
}

/**
 * Map source files to their corresponding test files.
 * Pattern: `src/{path}/{name}.ts` → `tests/{path}/{name}*.test.ts`
 * Only returns test files that actually exist on disk.
 */
export function findTargetedTestFiles(filesChanged: string[], projectRoot: string): string[] {
  const testFiles = new Set<string>();

  for (const file of filesChanged) {
    // Only map src/ files to tests/
    if (!file.startsWith('src/')) continue;
    // Skip test files themselves
    if (file.includes('.test.')) continue;

    // src/cli/commands/config.ts → tests/cli/commands/config
    const withoutSrc = file.replace(/^src\//, '');
    const ext = extname(withoutSrc);
    const withoutExt = withoutSrc.slice(0, -ext.length);
    const testDir = join(projectRoot, 'tests', dirname(withoutSrc));

    if (!existsSync(testDir)) continue;

    const baseName = basename(withoutExt);
    try {
      const entries = readdirSync(testDir);
      for (const entry of entries) {
        if (entry.startsWith(baseName) && entry.endsWith('.test.ts')) {
          testFiles.add(join('tests', dirname(withoutSrc), entry));
        }
      }
    } catch (e) {
      debugLog('findRelatedTestFiles:readdirSync', e);
    }
  }

  return [...testFiles];
}

/**
 * Run build check (tsc --noEmit for TypeScript, stack-detected command for others).
 * Skips if no build command detected for the project stack.
 * @internal Exported for testing
 */
export function runTscCheck(projectRoot: string): { passed: boolean; output: string } {
  // Use stack-detected commands instead of hardcoded tsc. Prefer the dedicated
  // typecheck command: this is a verification gate, and a script-resolved build
  // (e.g. `npm run build` with a clean step) mutates dist and can deadlock on
  // the active-execution clean guard while a run-flow is starting.
  const stack = detectFullStack(projectRoot);
  const rawBuild = stack.commands.build;
  const rawTypecheck = stack.commands.typecheck;

  // No typecheck and no build command → interpreted language (Python, Ruby, PHP) → skip
  if (!rawTypecheck && !rawBuild) {
    return { passed: true, output: `No build step for ${stack.language} — skipped` };
  }

  // TypeScript legacy shape: add --noEmit to avoid generating output files
  const buildCmd = rawTypecheck || (rawBuild === 'npx tsc' ? 'npx tsc --noEmit' : rawBuild);

  const isWindows = process.platform === 'win32';
  const [cmd, ...args] = buildCmd.split(' ');
  const result = spawnSync(cmd ?? 'echo', args, {
    cwd: projectRoot,
    timeout: 120_000,
    encoding: 'utf-8',
    shell: isWindows,
  });
  const output = ((result.stdout ?? '') + (result.stderr ?? '')).trim();
  return { passed: result.status === 0, output };
}

/**
 * Run targeted vitest on specific test files.
 * Returns pass/fail, output, and parsed test count.
 * @internal Exported for testing
 */
export function runTargetedTests(
  projectRoot: string,
  testFiles: string[],
): { passed: boolean; output: string; testCount: number } {
  if (testFiles.length === 0) {
    return { passed: true, output: 'No targeted test files found', testCount: 0 };
  }

  const result = spawnSync('npx', ['vitest', 'run', ...testFiles], {
    cwd: projectRoot,
    timeout: 180_000,
    encoding: 'utf-8',
    shell: process.platform === 'win32',
  });
  const output = ((result.stdout ?? '') + (result.stderr ?? '')).trim();

  // Parse test count from vitest output (e.g., "Tests  42 passed")
  let testCount = 0;
  const testCountMatch = output.match(/Tests\s+(\d+)\s+passed/);
  if (testCountMatch?.[1]) {
    testCount = parseInt(testCountMatch[1], 10);
  }

  return { passed: result.status === 0, output, testCount };
}

/**
 * Read CI baseline from disk.
 */
export function readCiBaseline(projectRoot: string): CiBaseline | null {
  const baselinePath = join(projectRoot, '.deckent', 'ci-baseline.json');
  if (!existsSync(baselinePath)) return null;
  try {
    return JSON.parse(readFileSync(baselinePath, 'utf-8')) as CiBaseline;
  } catch (e) {
    debugLog('readCiBaseline:readFile', e);
    return null;
  }
}

/**
 * Write CI baseline to disk.
 */
export function writeCiBaseline(projectRoot: string, baseline: CiBaseline): void {
  const dir = join(projectRoot, '.deckent');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'ci-baseline.json'), JSON.stringify(baseline, null, 2));
}

/**
 * Read CI guardian config from project config or return defaults.
 */
export function resolveCiGuardianConfig(projectRoot: string): CiGuardianConfig {
  const configPath = join(projectRoot, '.deckent', 'config.json');
  if (!existsSync(configPath)) return { ...DEFAULT_CI_GUARDIAN_CONFIG };
  try {
    const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
    const ciConfig = raw?.ci_guardian;
    if (!ciConfig) return { ...DEFAULT_CI_GUARDIAN_CONFIG };
    return {
      enabled: ciConfig.enabled ?? DEFAULT_CI_GUARDIAN_CONFIG.enabled,
      pre_sprint_check: ciConfig.pre_sprint_check ?? DEFAULT_CI_GUARDIAN_CONFIG.pre_sprint_check,
      block_on_tsc_fail: ciConfig.block_on_tsc_fail ?? DEFAULT_CI_GUARDIAN_CONFIG.block_on_tsc_fail,
      block_on_test_fail: ciConfig.block_on_test_fail ?? DEFAULT_CI_GUARDIAN_CONFIG.block_on_test_fail,
      track_coverage: ciConfig.track_coverage ?? DEFAULT_CI_GUARDIAN_CONFIG.track_coverage,
      track_test_count: ciConfig.track_test_count ?? DEFAULT_CI_GUARDIAN_CONFIG.track_test_count,
    };
  } catch (e) {
    debugLog('resolveCiGuardianConfig:parseConfig', e);
    return { ...DEFAULT_CI_GUARDIAN_CONFIG };
  }
}

/**
 * Run CI regression check after a task completes.
 * This is the core function that the afterTask hook calls.
 *
 * 1. Run tsc --noEmit — fail marks regression
 * 2. Find and run targeted tests for changed files
 * 3. Compare with baseline test count
 *
 * Returns a CiRegressionCheckResult with all findings.
 */
export function runCiRegressionCheck(
  projectRoot: string,
  result: TaskResult,
  config: CiGuardianConfig,
): CiRegressionCheckResult {
  const alerts: string[] = [];
  let regressionDetected = false;
  let testCountDelta = 0;

  // Step 1: tsc --noEmit
  const tsc = config.block_on_tsc_fail
    ? runTscCheck(projectRoot)
    : { passed: true, output: 'tsc check skipped (config)' };

  if (!tsc.passed) {
    regressionDetected = true;
    alerts.push(`tsc --noEmit failed after task ${result.taskId}`);
  }

  // Step 2: Targeted tests
  const targetedFiles = findTargetedTestFiles(result.filesChanged, projectRoot);
  const targeted = targetedFiles.length > 0
    ? runTargetedTests(projectRoot, targetedFiles)
    : { passed: true, output: 'No targeted test files', testCount: 0 };

  if (!targeted.passed) {
    regressionDetected = true;
    alerts.push(`Targeted tests failed after task ${result.taskId}: ${targetedFiles.join(', ')}`);
  }

  // Step 3: Baseline comparison
  if (config.track_test_count) {
    const baseline = readCiBaseline(projectRoot);
    if (baseline && baseline.baseline.testCount > 0) {
      // We only compare if baseline exists; a positive delta means tests were added
      // A negative delta means tests were lost — that's a regression signal
      testCountDelta = targeted.testCount - baseline.baseline.testCount;
      if (testCountDelta < 0) {
        alerts.push(
          `Test count decreased: baseline ${baseline.baseline.testCount}, current ${targeted.testCount} (delta: ${testCountDelta})`,
        );
      }
    }
  }

  return {
    tscPassed: tsc.passed,
    tscOutput: tsc.output,
    targetedTestsPassed: targeted.passed,
    targetedTestOutput: targeted.output,
    targetedTestFiles: targetedFiles,
    regressionDetected,
    testCountDelta,
    alerts,
  };
}

// ─── Pre-Sprint CI Validation ────────────────────────────────────────────────

/** Result of pre-sprint CI validation */
export interface CiValidationResult {
  passed: boolean;
  tscPassed: boolean;
  testsPassed: boolean;
  testCount: number;
  testPassed: number;
  testFailed: number;
  coverage: number;
  blockedReason?: string;
  baselineSaved: boolean;
}

/**
 * Parse vitest console output to extract test counts.
 * Handles formats like:
 *   "Tests  11315 passed (11315)"
 *   "Tests  3 failed | 11312 passed (11315)"
 * @internal Exported for testing
 */
export function parseVitestCounts(output: string): {
  testCount: number;
  testPassed: number;
  testFailed: number;
} {
  // Match "Tests" line specifically (not "Test Files")
  const testsLine = output.match(/^\s*Tests\s+.+$/m)?.[0] ?? '';
  const failedMatch = testsLine.match(/(\d+)\s+failed/);
  const passedMatch = testsLine.match(/(\d+)\s+passed\s+\((\d+)\)/);

  const testFailed = failedMatch?.[1] ? parseInt(failedMatch[1], 10) : 0;
  const testPassed = passedMatch?.[1] ? parseInt(passedMatch[1], 10) : 0;
  const testCount = passedMatch?.[2] ? parseInt(passedMatch[2], 10) : testPassed + testFailed;

  return { testCount, testPassed, testFailed };
}

/**
 * Run full vitest suite and return results.
 * @internal Exported for testing
 */
export function runFullVitest(projectRoot: string): {
  passed: boolean;
  output: string;
  testCount: number;
  testPassed: number;
  testFailed: number;
} {
  const result = spawnSync('npx', ['vitest', 'run'], {
    cwd: projectRoot,
    timeout: 300_000,
    encoding: 'utf-8',
    shell: process.platform === 'win32',
  });
  const output = ((result.stdout ?? '') + (result.stderr ?? '')).trim();
  const parsed = parseVitestCounts(output);

  return {
    passed: result.status === 0,
    output,
    ...parsed,
  };
}

/**
 * Read the line-coverage percentage from vitest's json-summary report
 * (coverage/coverage-summary.json — emitted by the json-summary reporter, see
 * vitest.config.ts). Returns the project's latest measured line coverage, or 0
 * when no report exists / it is unparseable. This is real coverage data (from
 * the most recent `test:coverage` run), not a hardcoded 0 — it gives
 * `track_coverage` an actual behavioral effect without forcing a slow
 * `--coverage` re-run inside the per-task / pre-sprint gate.
 */
export function parseCoverageSummary(projectRoot: string): number {
  try {
    const summaryPath = join(projectRoot, 'coverage', 'coverage-summary.json');
    if (!existsSync(summaryPath)) return 0;
    const data = JSON.parse(readFileSync(summaryPath, 'utf-8')) as {
      total?: { lines?: { pct?: number } };
    };
    const pct = data.total?.lines?.pct;
    return typeof pct === 'number' && isFinite(pct) ? pct : 0;
  } catch {
    return 0;
  }
}

/**
 * Run pre-sprint CI validation.
 *
 * 1. Reads CI guardian config (or uses overrides)
 * 2. Runs tsc --noEmit — blocks sprint if configured
 * 3. Runs full vitest suite — blocks or warns based on config
 * 4. Saves baseline metrics to .deckent/ci-baseline.json
 *
 * Returns CiValidationResult indicating whether the sprint should proceed.
 */
export function runPreSprintValidation(
  projectRoot: string,
  sprintId: string,
  configOverride?: Partial<CiGuardianConfig>,
): CiValidationResult {
  const config = { ...resolveCiGuardianConfig(projectRoot), ...configOverride };

  // Skip if disabled
  if (!config.enabled || !config.pre_sprint_check) {
    return {
      passed: true,
      tscPassed: true,
      testsPassed: true,
      testCount: 0,
      testPassed: 0,
      testFailed: 0,
      coverage: 0,
      baselineSaved: false,
    };
  }

  // Step 1: tsc --noEmit
  const tsc = runTscCheck(projectRoot);

  if (!tsc.passed && config.block_on_tsc_fail) {
    return {
      passed: false,
      tscPassed: false,
      testsPassed: false,
      testCount: 0,
      testPassed: 0,
      testFailed: 0,
      coverage: 0,
      blockedReason: `tsc --noEmit failed — sprint blocked\n${tsc.output}`,
      baselineSaved: false,
    };
  }

  // Step 2: vitest run (full suite)
  let vitestResult = { passed: true, testCount: 0, testPassed: 0, testFailed: 0 };
  if (config.track_test_count) {
    const fullVitest = runFullVitest(projectRoot);
    vitestResult = {
      passed: fullVitest.passed,
      testCount: fullVitest.testCount,
      testPassed: fullVitest.testPassed,
      testFailed: fullVitest.testFailed,
    };
  }

  if (!vitestResult.passed && config.block_on_test_fail) {
    return {
      passed: false,
      tscPassed: tsc.passed,
      testsPassed: false,
      testCount: vitestResult.testCount,
      testPassed: vitestResult.testPassed,
      testFailed: vitestResult.testFailed,
      coverage: 0,
      blockedReason: `vitest failed — ${vitestResult.testFailed} test(s) failed — sprint blocked`,
      baselineSaved: false,
    };
  }

  // track_coverage: read the real line-coverage % from vitest's json-summary
  // report (the project's latest measured coverage) instead of hardcoding 0, so
  // both the saved baseline and the returned result carry real data and the
  // coverage-regression check (readCiBaseline().coverage) is no longer 0-vs-0.
  // 0 when track_coverage is disabled.
  const measuredCoverage = config.track_coverage ? parseCoverageSummary(projectRoot) : 0;

  // Step 3: Save baseline
  const baseline: CiBaseline = {
    sprintId,
    baseline: {
      tscPassed: tsc.passed,
      testCount: vitestResult.testCount,
      testPassed: vitestResult.testPassed,
      testFailed: vitestResult.testFailed,
      coverage: measuredCoverage,
      timestamp: new Date().toISOString(),
    },
  };

  let baselineSaved = false;
  try {
    writeCiBaseline(projectRoot, baseline);
    baselineSaved = true;
  } catch (e) {
    debugLog('runPreSprintCiCheck:writeCiBaseline', e);
    process.stderr.write('[ci-guardian] Failed to save CI baseline\n');
  }

  if (!vitestResult.passed) {
    process.stderr.write(
      `[ci-guardian] Warning: vitest had ${vitestResult.testFailed} failure(s) but sprint not blocked (block_on_test_fail=false)\n`,
    );
  }

  if (!tsc.passed) {
    process.stderr.write(
      '[ci-guardian] Warning: tsc --noEmit failed but sprint not blocked (block_on_tsc_fail=false)\n',
    );
  }

  return {
    passed: true,
    tscPassed: tsc.passed,
    testsPassed: vitestResult.passed,
    testCount: vitestResult.testCount,
    testPassed: vitestResult.testPassed,
    testFailed: vitestResult.testFailed,
    coverage: measuredCoverage,
    baselineSaved,
  };
}

// ─── AfterSprint CI Report ────────────────────────────────────────────────────

/** CI report written to .brain/ci-report-{sprintId}.json after sprint completes */
export interface CiReport {
  sprintId: string;
  baseline: {
    testCount: number;
    coverage: number;
  };
  result: {
    testCount: number;
    testPassed: number;
    testFailed: number;
    coverage: number;
  };
  delta: {
    newTests: number;
    regressions: number;
    coverageDelta: number;
  };
  tscPassed: boolean;
  buildPassed: boolean;
  timestamp: string;
}

/**
 * Write a CI report to .brain/ci-report-{sprintId}.json.
 */
export function writeCiReport(projectRoot: string, report: CiReport): void {
  const brainDir = join(projectRoot, '.brain');
  if (!existsSync(brainDir)) mkdirSync(brainDir, { recursive: true });
  writeFileSync(
    join(brainDir, `ci-report-${report.sprintId}.json`),
    JSON.stringify(report, null, 2),
    'utf-8',
  );
}

/**
 * Read a CI report from .brain/ci-report-{sprintId}.json.
 * Returns null if not found or malformed.
 */
export function readCiReport(projectRoot: string, sprintId: string): CiReport | null {
  const reportPath = join(projectRoot, '.brain', `ci-report-${sprintId}.json`);
  if (!existsSync(reportPath)) return null;
  try {
    return JSON.parse(readFileSync(reportPath, 'utf-8')) as CiReport;
  } catch (e) {
    debugLog('readCiReport:readFile', e);
    return null;
  }
}

/**
 * Run the afterSprint CI report.
 *
 * 1. Reads CI guardian config (or uses configOverride)
 * 2. Runs tsc --noEmit
 * 3. Runs full vitest suite and compares with baseline
 * 4. Writes report to .brain/ci-report-{sprintId}.json
 *
 * Non-blocking — always returns a report even if CI checks fail.
 */
export function runAfterSprintCiReport(
  projectRoot: string,
  sprintId: string,
  configOverride?: Partial<CiGuardianConfig>,
): CiReport {
  const config = { ...resolveCiGuardianConfig(projectRoot), ...configOverride };
  const baseline = readCiBaseline(projectRoot);
  const baselineTestCount = baseline?.baseline.testCount ?? 0;
  const baselineCoverage = baseline?.baseline.coverage ?? 0;

  // Run tsc --noEmit
  const tsc = runTscCheck(projectRoot);

  // Run full test suite
  let testResult = { passed: true, testCount: 0, testPassed: 0, testFailed: 0 };
  if (config.track_test_count) {
    const full = runFullVitest(projectRoot);
    testResult = {
      passed: full.passed,
      testCount: full.testCount,
      testPassed: full.testPassed,
      testFailed: full.testFailed,
    };
  }

  const newTests = Math.max(0, testResult.testCount - baselineTestCount);

  const report: CiReport = {
    sprintId,
    baseline: {
      testCount: baselineTestCount,
      coverage: baselineCoverage,
    },
    result: {
      testCount: testResult.testCount,
      testPassed: testResult.testPassed,
      testFailed: testResult.testFailed,
      coverage: baselineCoverage,
    },
    delta: {
      newTests,
      regressions: testResult.testFailed,
      coverageDelta: 0,
    },
    tscPassed: tsc.passed,
    buildPassed: tsc.passed,
    timestamp: new Date().toISOString(),
  };

  try {
    writeCiReport(projectRoot, report);
  } catch (e) {
    debugLog('runCiRegressionCheck:writeCiReport', e);
    process.stderr.write('[ci-guardian] Failed to write CI report\n');
  }

  return report;
}
