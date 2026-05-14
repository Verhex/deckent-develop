/**
 * Worker Verification — Build & Test Loops
 *
 * Extracted from worker.ts (Sprint 144 God Object Split).
 * Handles tsc compilation checks, vitest test execution, retry loops,
 * doc-only scope detection, and the enforceVerifyLoop async gate.
 */
import { execSync } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { AgentStatus } from '../core/types.js';
import type { TaskScope, VerifyTestsResult } from '../core/types.js';
import { TASKS_DIR } from '../core/constants.js';
import { detectFullStack, STACK_COMMANDS } from '../core/stack-detector.js';
import { createHeartbeat, writeHeartbeat } from './worker.js';

// ─── Internal Helpers ───────────────────────────────────────────────

function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

// ─── Stack-Aware Verify Commands ────────────────────────────────────

/**
 * Get build and test commands for the current project stack.
 * Falls back to TypeScript commands if stack is unknown.
 */
export function getVerifyCommands(projectRoot: string): { build: string; test: string } {
  const stack = detectFullStack(projectRoot);
  const key = stack.language === 'java'
    ? `java_${stack.buildTool}`
    : stack.language === 'c' || stack.language === 'cpp'
    ? `c_${stack.buildTool}`
    : stack.language;
  const commands = STACK_COMMANDS[key];
  if (commands) {
    return { build: commands.build, test: commands.test };
  }
  return { build: stack.commands.build || '', test: stack.commands.test || '' };
}

// ─── Doc-Only Task Detection ─────────────────────────────────────────

/** Source code directory prefixes — mirrors isDocTask() logic in result-evaluator.ts */
const DOC_SKIP_SOURCE_PREFIXES = ['src/', 'src\\', 'tests/', 'tests\\', 'lib/', 'lib\\'];
const DOC_SKIP_SOURCE_EXACT = ['src', 'tests', 'lib'];

/**
 * Returns true if the scope contains only non-source-code directories.
 * When true, tsc and vitest verification should be skipped.
 * Scope with only docs/, *.md, or other non-source paths qualifies.
 * Empty directories array returns false (no scope = no skip).
 */
export function isDocOnlyScope(scope?: TaskScope): boolean {
  const dirs = scope?.directories ?? [];
  if (dirs.length === 0) return false;
  return dirs.every(d => {
    if (DOC_SKIP_SOURCE_EXACT.includes(d)) return false;
    return !DOC_SKIP_SOURCE_PREFIXES.some(p => d.startsWith(p));
  });
}

// ─── Test Verify Loop ───────────────────────────────────────────────

/** Max retry attempts for the test verify loop */
export const MAX_TEST_RETRIES = 3;

/**
 * Parse vitest output to extract failing test names and summary.
 * Handles both verbose and default vitest output formats.
 */
export function parseVitestOutput(output: string): { failedTests: string[]; summary: string } {
  const failedTests: string[] = [];

  const failLineRegex = /^\s*(?:FAIL|×|✕)\s+(.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = failLineRegex.exec(output)) !== null) {
    const testName = (match[1] ?? '').trim();
    if (testName && !failedTests.includes(testName)) {
      failedTests.push(testName);
    }
  }

  const failFileRegex = /^\s*FAIL\s+([\w/.\\-]+\.test\.\w+)/gm;
  while ((match = failFileRegex.exec(output)) !== null) {
    const fileName = (match[1] ?? '').trim();
    if (fileName && !failedTests.includes(fileName)) {
      failedTests.push(fileName);
    }
  }

  const summaryMatch = output.match(/Tests?\s+.*(?:failed|passed).*$/m);
  const summary = summaryMatch ? summaryMatch[0].trim() : '';

  return { failedTests, summary };
}

/**
 * Run test verification with optional scope filtering and return structured results.
 * Uses stack-detected test command. If test command is empty, skips verification.
 */
export function verifyTests(
  projectRoot: string,
  scope?: string[],
  taskScope?: TaskScope,
): VerifyTestsResult {
  if (isDocOnlyScope(taskScope)) {
    return { success: true, failedTests: [], output: '' };
  }

  const { test: testCmd } = getVerifyCommands(projectRoot);

  if (!testCmd) {
    return { success: true, failedTests: [], output: '' };
  }

  const scopeArgs = scope && scope.length > 0 ? ` ${scope.join(' ')}` : '';
  const command = testCmd.includes('vitest')
    ? `${testCmd} --reporter=verbose${scopeArgs}`
    : `${testCmd}${scopeArgs}`;

  try {
    const stdout = execSync(command, {
      cwd: projectRoot,
      encoding: 'utf-8',
      timeout: 120_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return {
      success: true,
      failedTests: [],
      output: stdout,
    };
  } catch (err: unknown) {
    const output =
      err instanceof Error && 'stdout' in err
        ? String((err as { stdout: unknown }).stdout)
        : err instanceof Error && 'stderr' in err
          ? String((err as { stderr: unknown }).stderr)
          : err instanceof Error
            ? err.message
            : String(err);

    const { failedTests } = parseVitestOutput(output);

    return {
      success: false,
      failedTests,
      output,
    };
  }
}

/**
 * Run the full test verify loop: execute vitest, retry on failure up to MAX_TEST_RETRIES.
 * Returns the final result and the number of attempts made.
 */
export function runTestVerifyLoop(
  projectRoot: string,
  scope?: string[],
  runFix?: (failedTests: string[], output: string) => void,
  taskScope?: TaskScope,
): { result: VerifyTestsResult; attempts: number; failuresFixed: number } {
  if (isDocOnlyScope(taskScope)) {
    return { result: { success: true, failedTests: [], output: '' }, attempts: 0, failuresFixed: 0 };
  }

  let attempts = 0;
  let failuresFixed = 0;
  let lastResult: VerifyTestsResult = { success: false, failedTests: [], output: '' };

  for (let i = 0; i < MAX_TEST_RETRIES; i++) {
    attempts++;
    lastResult = verifyTests(projectRoot, scope, taskScope);

    if (lastResult.success) {
      return { result: lastResult, attempts, failuresFixed };
    }

    if (i < MAX_TEST_RETRIES - 1 && runFix) {
      const prevFailCount = lastResult.failedTests.length;
      runFix(lastResult.failedTests, lastResult.output);
      failuresFixed += prevFailCount;
    }
  }

  return { result: lastResult, attempts, failuresFixed };
}

// ─── Compilation Verify Loop ─────────────────────────────────────────

/** Max retry attempts for the compilation verify loop */
export const MAX_COMPILATION_RETRIES = 3;

export interface CompilationResult {
  success: boolean;
  errors: string[];
}

export interface CompilationLoopResult {
  success: boolean;
  attempts: number;
  errors: string[];
}

/**
 * Parse tsc error output into individual error strings.
 * Extracts lines matching TypeScript error patterns.
 * Falls back to first 20 non-empty lines if no TS error patterns found.
 */
export function parseCompilationErrors(err: unknown): string[] {
  let output = '';
  if (err && typeof err === 'object') {
    const execErr = err as { stdout?: string; stderr?: string; message?: string };
    output = execErr.stdout || execErr.stderr || execErr.message || '';
  } else if (typeof err === 'string') {
    output = err;
  }
  if (!output) return ['Unknown compilation error'];

  const lines = output.split('\n').filter((line) => line.trim().length > 0);
  if (lines.length === 0) return ['Unknown compilation error'];

  const errorLines = lines.filter((line) =>
    /\(\d+,\d+\):\s*error\s+TS\d+/.test(line) || /error\s+TS\d+/.test(line),
  );

  return errorLines.length > 0 ? errorLines : lines.slice(0, 20);
}

/**
 * Run build verification in the given project root and return success/errors.
 * Uses stack-detected build command. If build command is empty, skips verification.
 */
export function verifyCompilation(projectRoot: string, taskScope?: TaskScope): CompilationResult {
  if (isDocOnlyScope(taskScope)) {
    return { success: true, errors: [] };
  }

  const { build } = getVerifyCommands(projectRoot);

  if (!build) {
    return { success: true, errors: [] };
  }

  const command = build === 'npx tsc' ? 'npx tsc --noEmit' : build;

  try {
    execSync(command, {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 120_000,
    });
    return { success: true, errors: [] };
  } catch (err: unknown) {
    const errors = parseCompilationErrors(err);
    return { success: false, errors };
  }
}

/**
 * Run compilation verification with retry loop.
 * Updates heartbeat on each attempt with VERIFYING status.
 */
export function runCompilationLoop(
  projectRoot: string,
  workerId: string,
  taskId: string,
  maxRetries: number = MAX_COMPILATION_RETRIES,
  onAttempt?: (attempt: number, maxRetries: number, errors: string[]) => void,
  taskScope?: TaskScope,
): CompilationLoopResult {
  if (isDocOnlyScope(taskScope)) {
    return { success: true, attempts: 0, errors: [] };
  }

  let lastErrors: string[] = [];

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const hb = createHeartbeat(
      workerId,
      taskId,
      AgentStatus.VERIFYING,
      `Type checking (attempt ${attempt}/${maxRetries})`,
      undefined,
      undefined,
      undefined,
    );
    writeHeartbeat(projectRoot, hb);

    const result = verifyCompilation(projectRoot);

    if (result.success) {
      return { success: true, attempts: attempt, errors: [] };
    }

    lastErrors = result.errors;

    if (onAttempt) {
      onAttempt(attempt, maxRetries, result.errors);
    }
  }

  return { success: false, attempts: maxRetries, errors: lastErrors };
}

// ─── Enforce Verify Loop (Async Gate) ──────────────────────────────

/** Verify loop gate timeout per command (ms) */
const VERIFY_LOOP_TIMEOUT_MS = 300_000;

/** Max retry attempts for enforceVerifyLoop */
const VERIFY_LOOP_MAX_ATTEMPTS = 3;

/** Result of the enforce verify loop gate */
export interface VerifyLoopResult {
  ok: boolean;
  reason?: string;
  attempts: number;
}

/**
 * Enforce a mandatory verify loop gate before writing a task result.
 *
 * Runs `tsc --noEmit` and `npx vitest run <scope>` up to 3 times.
 * If both pass on any attempt, writes a `.verify-ran` marker file and returns ok=true.
 * If all 3 attempts fail, returns ok=false with the last failure reason.
 */
export async function enforceVerifyLoop(
  projectRoot: string,
  taskId: string,
  scope: string | string[],
): Promise<VerifyLoopResult> {
  const { exec: execFn } = await import('node:child_process');
  const execAsync = promisify(execFn);
  const scopeArg = Array.isArray(scope) ? scope.join(' ') : scope;
  let lastReason = '';

  for (let attempt = 1; attempt <= VERIFY_LOOP_MAX_ATTEMPTS; attempt++) {
    try {
      await execAsync('npx tsc --noEmit', {
        cwd: projectRoot,
        timeout: VERIFY_LOOP_TIMEOUT_MS,
      });
    } catch (err: unknown) {
      const isTimeout = err instanceof Error && 'killed' in err && (err as { killed: boolean }).killed;
      if (isTimeout) {
        return { ok: false, reason: 'tsc --noEmit timeout (infrastructure failure)', attempts: attempt };
      }
      const stderr = err instanceof Error && 'stderr' in err ? String((err as { stderr: unknown }).stderr) : '';
      const stdout = err instanceof Error && 'stdout' in err ? String((err as { stdout: unknown }).stdout) : '';
      lastReason = `tsc --noEmit failed (attempt ${attempt}/${VERIFY_LOOP_MAX_ATTEMPTS}): ${(stderr || stdout).slice(0, 500)}`;
      continue;
    }

    const vitestCmd = scopeArg ? `npx vitest run ${scopeArg}` : 'npx vitest run';
    try {
      await execAsync(vitestCmd, {
        cwd: projectRoot,
        timeout: VERIFY_LOOP_TIMEOUT_MS,
      });
    } catch (err: unknown) {
      const isTimeout = err instanceof Error && 'killed' in err && (err as { killed: boolean }).killed;
      if (isTimeout) {
        return { ok: false, reason: `vitest run timeout (infrastructure failure)`, attempts: attempt };
      }
      const stderr = err instanceof Error && 'stderr' in err ? String((err as { stderr: unknown }).stderr) : '';
      const stdout = err instanceof Error && 'stdout' in err ? String((err as { stdout: unknown }).stdout) : '';
      lastReason = `vitest run failed (attempt ${attempt}/${VERIFY_LOOP_MAX_ATTEMPTS}): ${(stderr || stdout).slice(0, 500)}`;
      continue;
    }

    const markerPath = join(projectRoot, TASKS_DIR, `task-${taskId}.verify-ran`);
    const tmpPath = `${markerPath}.tmp`;
    ensureDir(join(projectRoot, TASKS_DIR));
    writeFileSync(tmpPath, JSON.stringify({
      taskId,
      timestamp: new Date().toISOString(),
      attempts: attempt,
      tsc: 'PASS',
      vitest: 'PASS',
    }, null, 2), 'utf-8');
    renameSync(tmpPath, markerPath);

    return { ok: true, attempts: attempt };
  }

  return { ok: false, reason: lastReason, attempts: VERIFY_LOOP_MAX_ATTEMPTS };
}
