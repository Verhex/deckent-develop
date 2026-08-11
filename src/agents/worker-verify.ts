/**
 * Worker Verification — Build & Test Loops
 *
 * Extracted from worker.ts (Sprint 144 God Object Split).
 * Handles tsc compilation checks, vitest test execution, retry loops,
 * doc-only scope detection, and the enforceVerifyLoop async gate.
 */
import { execSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { AgentStatus } from '../core/types.js';
import type { TaskScope, VerifyTestsResult } from '../core/types.js';
import { TASKS_DIR } from '../core/constants.js';
import { detectFullStack, STACK_COMMANDS } from '../core/stack-detector.js';
import { createHeartbeat, writeHeartbeat } from './worker.js';
import {
  executeAdmittedTypeScriptVerification,
} from '../orchestra/worker-verify-tool.js';
import {
  TypeScriptScopedVerificationAdapter,
  type TypeScriptScopedVerificationExecutor,
  type TypeScriptScopedVerificationRequest,
  type TypeScriptForeignErrorDiagnostics,
} from '../core/verification-typescript-adapter.js';

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
export function parseVitestFailedTests(output: string): { failedTests: string[]; summary: string } {
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

    const { failedTests } = parseVitestFailedTests(output);

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
  /** Diagnostics located inside the task's own write authority — these decide the verdict. */
  errors: string[];
  /**
   * Diagnostics located outside the task's write authority (row 3277: a parallel writer's
   * partial source). Reported for evidence, never a failure and never a FIX retry.
   */
  foreignErrors: string[];
}

export interface CompilationLoopResult {
  success: boolean;
  attempts: number;
  errors: string[];
  /** Foreign diagnostics observed on the final attempt — diagnostic only, never a failure. */
  foreignErrors: string[];
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

// ─── Scoped Compilation Judgment (row 3277) ─────────────────────────
// Measured defect: workers ran a repository-wide `tsc --noEmit` while parallel
// writers were mid-change, so another task's partial source produced a false
// NO_GO and burned FIX retries. The compile itself stays whole-program — that
// is what makes it sound, because the analysis set remains a superset of the
// task scope and no in-scope error can be hidden. Only the *judgment* is
// restricted: a diagnostic decides this task's verdict when, and only when, it
// is located in a file the task is authorised to write.

/** Normalise a repository path for scope comparison: `\` → `/`, no `./`, no trailing `/`. */
function normalizeScopePath(rawPath: string, projectRoot?: string): string {
  let value = rawPath.trim().replace(/\\/g, '/');
  if (projectRoot) {
    const root = projectRoot.replace(/\\/g, '/').replace(/\/+$/, '');
    if (root && value.startsWith(`${root}/`)) {
      value = value.slice(root.length + 1);
    }
  }
  value = value.replace(/^\.\//, '').replace(/\/+$/, '');
  return value;
}

/**
 * The set of repository paths a task may legitimately break: its declared write
 * files plus its declared directories. A concurrent unrelated writer is outside
 * this set by file-collision admission, which is what makes the partition sound.
 */
export function scopeAuthorityPaths(scope?: TaskScope): string[] {
  const raw = [...(scope?.filesWrite ?? []), ...(scope?.directories ?? [])];
  const paths = raw
    .map(entry => normalizeScopePath(entry))
    .filter(entry => entry.length > 0);
  return [...new Set(paths)];
}

/**
 * Extract the source file a tsc diagnostic is reported against.
 * Accepts the piped (`path(line,col): error TS…`) and pretty
 * (`path:line:col - error TS…`) formats. Returns null for lines that carry no
 * file location (summary lines, `error TS5083`, raw stderr).
 */
export function compilationErrorFilePath(errorLine: string): string | null {
  const parenthesised = errorLine.match(/^\s*(\S.*?)\((\d+),(\d+)\):\s*error\s+TS\d+/);
  if (parenthesised?.[1]) return normalizeScopePath(parenthesised[1]);

  const pretty = errorLine.match(/^\s*(\S.*?):(\d+):(\d+)\s*-\s*error\s+TS\d+/);
  if (pretty?.[1]) return normalizeScopePath(pretty[1]);

  return null;
}

/**
 * Split compilation diagnostics into the ones this task owns and the ones that
 * belong to files outside its write authority.
 *
 * Without scope authority (no filesWrite and no directories) every diagnostic is
 * in-scope — behaviour is then identical to the ambient repository-wide verdict.
 * A diagnostic that carries no file location is always treated as in-scope: it
 * cannot be attributed to a foreign writer, so the conservative reading keeps it.
 */
export function partitionCompilationErrors(
  errors: string[],
  scope?: TaskScope,
  projectRoot?: string,
): { inScope: string[]; foreign: string[] } {
  const authority = scopeAuthorityPaths(scope);
  if (authority.length === 0) {
    return { inScope: [...errors], foreign: [] };
  }

  const inScope: string[] = [];
  const foreign: string[] = [];
  for (const error of errors) {
    const filePath = compilationErrorFilePath(error);
    if (filePath === null) {
      inScope.push(error);
      continue;
    }
    const relativePath = normalizeScopePath(filePath, projectRoot);
    const owned = authority.some(
      entry => relativePath === entry || relativePath.startsWith(`${entry}/`),
    );
    (owned ? inScope : foreign).push(error);
  }
  return { inScope, foreign };
}

/**
 * Run build verification in the given project root and return success/errors.
 * Uses stack-detected build command. If build command is empty, skips verification.
 *
 * The compile stays whole-program; when `taskScope` declares write authority the
 * verdict is restricted to diagnostics located inside that authority, so a
 * concurrent unrelated partial write cannot fail this task (row 3277).
 */
export function verifyCompilation(projectRoot: string, taskScope?: TaskScope): CompilationResult {
  if (isDocOnlyScope(taskScope)) {
    return { success: true, errors: [], foreignErrors: [] };
  }

  const { build } = getVerifyCommands(projectRoot);

  if (!build) {
    return { success: true, errors: [], foreignErrors: [] };
  }

  const command = build === 'npx tsc' ? 'npx tsc --noEmit' : build;

  try {
    execSync(command, {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 120_000,
    });
    return { success: true, errors: [], foreignErrors: [] };
  } catch (err: unknown) {
    const { inScope, foreign } = partitionCompilationErrors(
      parseCompilationErrors(err),
      taskScope,
      projectRoot,
    );
    return { success: inScope.length === 0, errors: inScope, foreignErrors: foreign };
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
    return { success: true, attempts: 0, errors: [], foreignErrors: [] };
  }

  let lastErrors: string[] = [];
  let lastForeignErrors: string[] = [];

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

    // Row 3277 wiring fix: the scope was previously dropped here, so the loop
    // spent every retry on diagnostics the task had no authority to fix.
    const result = verifyCompilation(projectRoot, taskScope);

    if (result.success) {
      return { success: true, attempts: attempt, errors: [], foreignErrors: result.foreignErrors };
    }

    lastErrors = result.errors;
    lastForeignErrors = result.foreignErrors;

    if (onAttempt) {
      onAttempt(attempt, maxRetries, result.errors);
    }
  }

  return { success: false, attempts: maxRetries, errors: lastErrors, foreignErrors: lastForeignErrors };
}

// ─── Coverage Parse & Verify ────────────────────────────────────────
// Sprint 180 W4-1: Worker `.result.coverage` must reflect real measurement.
// Sprint 179 root cause: 9 tasks shipped with coverage=0 → Quality Scorer
// dropped overall 100→75 → TECH_DEBT verdict. Below utilities parse vitest
// `coverage-summary.json` so the worker writes a real number (or null when
// the task type cannot produce coverage — see quality-assessor escape hatch).

/** Default location of vitest's json-summary coverage report. */
const COVERAGE_SUMMARY_RELATIVE = 'coverage/coverage-summary.json';

/**
 * Parse vitest `coverage-summary.json` and return the total line coverage
 * percentage. Returns `null` when the file is missing, malformed, or does not
 * contain `total.lines.pct` — callers treat null as "unmeasured" and decide
 * whether to retry (code task) or accept (doc/audit escape hatch).
 */
export function parseCoverageSummary(projectRoot: string): number | null {
  const summaryPath = join(projectRoot, COVERAGE_SUMMARY_RELATIVE);
  if (!existsSync(summaryPath)) return null;

  let raw: string;
  try {
    raw = readFileSync(summaryPath, 'utf-8');
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') return null;
  const total = (parsed as { total?: unknown }).total;
  if (!total || typeof total !== 'object') return null;
  const lines = (total as { lines?: unknown }).lines;
  if (!lines || typeof lines !== 'object') return null;
  const pct = (lines as { pct?: unknown }).pct;
  if (typeof pct !== 'number' || !Number.isFinite(pct)) return null;
  return pct;
}

/**
 * Returns true when a parsed coverage value reflects a real measurement.
 * `null` and `0` are treated as "unmeasured" — for code-development tasks the
 * caller should retry vitest, for escape-hatch tasks (doc/audit) the quality
 * assessor records partial credit instead of penalising correctness.
 */
export function validateCoverageNumber(coverage: number | null | undefined): boolean {
  return typeof coverage === 'number' && Number.isFinite(coverage) && coverage > 0;
}

export interface CoverageVerifyResult {
  /** Parsed total.lines.pct, or null when unmeasured (doc scope, parse failure). */
  coverage: number | null;
  /** True when vitest finished without error AND a coverage number was parsed. */
  success: boolean;
  /** Stdout/stderr captured from the vitest run (empty for skipped doc scope). */
  output: string;
  /** True when the task scope is doc-only and coverage was deliberately skipped. */
  skipped: boolean;
}

/**
 * Run `npx vitest run --coverage --reporter=json-summary` and parse the
 * resulting `coverage-summary.json`. Doc-only scopes short-circuit with
 * `{ coverage: null, skipped: true, success: true }` so the quality assessor
 * can apply the escape hatch instead of treating coverage as a hard failure.
 */
export function runCoverageVerify(
  projectRoot: string,
  scope?: string[],
  taskScope?: TaskScope,
): CoverageVerifyResult {
  if (isDocOnlyScope(taskScope)) {
    return { coverage: null, success: true, output: '', skipped: true };
  }

  const { test: testCmd } = getVerifyCommands(projectRoot);
  if (!testCmd || !testCmd.includes('vitest')) {
    return { coverage: null, success: true, output: '', skipped: true };
  }

  const scopeArgs = scope && scope.length > 0 ? ` ${scope.join(' ')}` : '';
  const command = `${testCmd} --coverage --reporter=json-summary${scopeArgs}`;

  let output = '';
  let testsOk = true;
  try {
    output = execSync(command, {
      cwd: projectRoot,
      encoding: 'utf-8',
      timeout: 180_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err: unknown) {
    testsOk = false;
    output =
      err instanceof Error && 'stdout' in err
        ? String((err as { stdout: unknown }).stdout)
        : err instanceof Error && 'stderr' in err
          ? String((err as { stderr: unknown }).stderr)
          : err instanceof Error
            ? err.message
            : String(err);
  }

  const coverage = parseCoverageSummary(projectRoot);
  const measured = validateCoverageNumber(coverage);
  return {
    coverage,
    success: testsOk && measured,
    output,
    skipped: false,
  };
}

// ─── Enforce Verify Loop (Async Gate) ──────────────────────────────

/** Result of the enforce verify loop gate */
export interface VerifyLoopResult {
  ok: boolean;
  reason?: string;
  attempts: number;
}

export interface WorkerAdmittedTypeScriptVerification {
  readonly request: TypeScriptScopedVerificationRequest;
}

export type WorkerAdmittedVerificationResult =
  | {
      readonly kind: 'passed';
      readonly foreignErrorDiagnostics: TypeScriptForeignErrorDiagnostics;
    }
  | {
      readonly kind: 'failed';
      readonly reason: string;
      readonly foreignErrorDiagnostics: TypeScriptForeignErrorDiagnostics;
    }
  | {
      readonly kind: 'hold';
      readonly reason: string;
      readonly foreignErrorDiagnostics: TypeScriptForeignErrorDiagnostics;
    };

/**
 * Consume the adapter's admitted result at the worker boundary. Foreign
 * concurrent observations are deliberately a diagnostic HOLD, never a task
 * failure and never a signal to consume a FIX retry.
 */
export async function runAdmittedWorkerTypeScriptVerification(
  verification: WorkerAdmittedTypeScriptVerification,
  execute: TypeScriptScopedVerificationExecutor = executeAdmittedTypeScriptVerification,
): Promise<WorkerAdmittedVerificationResult> {
  const result = await new TypeScriptScopedVerificationAdapter().run(verification.request, execute);
  if (result.kind === 'hold') {
    return {
      kind: 'hold',
      reason: result.detail,
      foreignErrorDiagnostics: result.foreignErrorDiagnostics,
    };
  }
  if (result.foreignErrorDiagnostics.observations.length > 0) {
    return {
      kind: 'hold',
      reason: `Foreign verification diagnostics: ${result.foreignErrorDiagnostics.reasonCodes.join(', ')}`,
      foreignErrorDiagnostics: result.foreignErrorDiagnostics,
    };
  }
  if (result.outcome === 'failed') {
    return {
      kind: 'failed',
      reason: `Admitted TypeScript verification failed with exit code ${result.evidence.exitCode}`,
      foreignErrorDiagnostics: result.foreignErrorDiagnostics,
    };
  }
  return { kind: 'passed', foreignErrorDiagnostics: result.foreignErrorDiagnostics };
}

/**
 * Enforce a mandatory verify loop gate before writing a task result.
 *
 * Consumes one admitted TypeScript verification result. The former ambient
 * global `npx tsc --noEmit` retry loop is intentionally removed: without an
 * admission the gate holds, and a foreign concurrent error cannot spend a FIX
 * retry or become this task's NO_GO verdict.
 */
export async function enforceVerifyLoop(
  projectRoot: string,
  taskId: string,
  _scope: string | string[],
  verification?: WorkerAdmittedTypeScriptVerification,
): Promise<VerifyLoopResult> {
  if (!verification) {
    return { ok: false, reason: 'Verification isolation admission is required', attempts: 0 };
  }
  const result = await runAdmittedWorkerTypeScriptVerification(verification);
  if (result.kind !== 'passed') {
    return { ok: false, reason: result.reason, attempts: 1 };
  }

  const markerPath = join(projectRoot, TASKS_DIR, `task-${taskId}.verify-ran`);
  const tmpPath = `${markerPath}.tmp`;
  ensureDir(join(projectRoot, TASKS_DIR));
  writeFileSync(tmpPath, JSON.stringify({
    taskId,
    timestamp: new Date().toISOString(),
    attempts: 1,
    typeScript: 'ADMITTED_PASS',
  }, null, 2), 'utf-8');
  renameSync(tmpPath, markerPath);

  return { ok: true, attempts: 1 };
}
