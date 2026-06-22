// ═══ Baseline Tracker — Sprint test baseline snapshot & honesty verification ═══
// Created Sprint 134 Task 5.
// Writes pre-sprint vitest baseline, reads it back, compares post-task state.
// Used by Brain to detect worker "pre-existing failures" dishonesty.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { debugLog } from '../core/utils.js';

// ─── Types ──────────────────────────────────────────────────────────

/** Snapshot of vitest run results at a point in time */
export interface TestBaseline {
  files: number;
  pass: number;
  fail: number;
  skipped: number;
  timestamp: string;
}

/** Result of comparing two baselines */
export interface BaselineComparison {
  /** New failures introduced (current.fail - baseline.fail) */
  newFailures: number;
  /** Whether worker claim of "pre-existing" is valid */
  claimValid: boolean;
  baseline: TestBaseline;
  current: TestBaseline;
}

/** Honesty check result for a single task */
export interface HonestyCheckResult {
  taskId: string;
  triggered: boolean;
  violation: boolean;
  comparison?: BaselineComparison;
  reason: string;
}

// ─── Honesty Regex ──────────────────────────────────────────────────

/**
 * Patterns that trigger honesty verification in worker notes.
 * Only matches when the phrase appears as a standalone claim, not as part of
 * unrelated technical discussion.
 */
export const HONESTY_TRIGGER_PATTERNS = [
  /pre-existing\s+(failure|error|issue|bug)/i,
  /unrelated\s+to\s+(this|my)\s+task/i,
  /already\s+failing/i,
  /failing\s+before\s+(this|my)/i,
  /not\s+caused\s+by\s+(this|my)/i,
];

/**
 * Check if worker notes contain honesty-trigger phrases.
 * Returns true only if the notes field specifically contains excuses about
 * pre-existing failures.
 */
export function containsHonestyTrigger(notes: string): boolean {
  if (!notes || notes.length === 0) return false;
  return HONESTY_TRIGGER_PATTERNS.some(pattern => pattern.test(notes));
}

// ─── Baseline I/O ───────────────────────────────────────────────────

/** Resolve the baseline file path for a given sprint */
export function baselinePath(projectRoot: string, sprintId: string): string {
  return join(projectRoot, '.deckent', `${sprintId}-baseline.json`);
}

/**
 * Run `npx vitest run` and parse the summary output into a TestBaseline.
 * Returns null if vitest cannot be executed or output cannot be parsed.
 *
 * @param projectRoot - Project root directory
 * @param timeoutMs - Maximum execution time (default: 180s)
 */
export type VitestRunner = (
  projectRoot: string,
  timeoutMs: number,
) => Promise<{ stdout: string; stderr: string }>;

/**
 * Default runner: async `spawn` (not `spawnSync`). R8/ADR-087 — the vitest suite
 * can run for minutes, and spawnSync FROZE the event loop for that entire window
 * (no heartbeats, no dashboard SSE, no other async work) every time the honesty
 * gate or pre-sprint baseline fired. Collect stdout/stderr off the streams and
 * enforce the timeout with a SIGKILL timer; errors resolve to whatever was
 * captured (parse degrades to null), preserving the old fail-safe contract.
 */
const defaultVitestRunner: VitestRunner = (projectRoot, timeoutMs) =>
  new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn('npx', ['vitest', 'run', '--reporter=verbose'], {
        cwd: projectRoot,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: process.platform === 'win32',
      });
    } catch (e) {
      debugLog('captureVitestBaseline:spawn', e);
      resolve({ stdout, stderr });
      return;
    }
    const timer = setTimeout(() => { child.kill('SIGKILL'); }, timeoutMs);
    child.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    child.on('error', (e) => { clearTimeout(timer); debugLog('captureVitestBaseline:spawn', e); resolve({ stdout, stderr }); });
    child.on('close', () => { clearTimeout(timer); resolve({ stdout, stderr }); });
  });

export async function captureVitestBaseline(
  projectRoot: string,
  timeoutMs = 180_000,
  runner: VitestRunner = defaultVitestRunner,
): Promise<TestBaseline | null> {
  try {
    const { stdout, stderr } = await runner(projectRoot, timeoutMs);
    return parseVitestOutput((stdout ?? '') + (stderr ?? ''));
  } catch (e) {
    debugLog('captureVitestBaseline:spawn', e);
    return null;
  }
}

/**
 * Parse vitest output summary into a TestBaseline.
 * Handles formats like:
 *   "Tests  500 passed | 3 failed | 10 skipped (513)"
 *   "Test Files  120 passed | 2 failed (122)"
 */
export function parseVitestOutput(output: string): TestBaseline | null {
  // Match "Tests  NNN passed" pattern
  const passMatch = output.match(/Tests\s+(\d+)\s+passed/i);
  const failMatch = output.match(/(\d+)\s+failed/i);
  const skipMatch = output.match(/(\d+)\s+skipped/i);
  const fileMatch = output.match(/Test Files\s+(\d+)\s+passed/i);
  const fileFailMatch = output.match(/Test Files\s+\d+\s+passed\s*\|\s*(\d+)\s+failed/i);
  const fileTotalMatch = output.match(/Test Files\s+[^(]*\((\d+)\)/i);

  const pass = passMatch ? parseInt(passMatch[1]!, 10) : 0;
  const fail = failMatch ? parseInt(failMatch[1]!, 10) : 0;
  const skipped = skipMatch ? parseInt(skipMatch[1]!, 10) : 0;

  // File count: prefer total from parens, else add passed + failed
  let files = 0;
  if (fileTotalMatch) {
    files = parseInt(fileTotalMatch[1]!, 10);
  } else if (fileMatch) {
    const filePassed = parseInt(fileMatch[1]!, 10);
    const fileFailed = fileFailMatch ? parseInt(fileFailMatch[1]!, 10) : 0;
    files = filePassed + fileFailed;
  }

  // If we couldn't parse anything meaningful, return null
  if (pass === 0 && fail === 0 && skipped === 0) return null;

  return {
    files,
    pass,
    fail,
    skipped,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Write a test baseline snapshot to disk.
 * Creates `.deckent/` directory if it doesn't exist.
 */
export function writeBaseline(
  projectRoot: string,
  sprintId: string,
  baseline: TestBaseline,
): void {
  const filePath = baselinePath(projectRoot, sprintId);
  const dir = join(projectRoot, '.deckent');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(filePath, JSON.stringify(baseline, null, 2), 'utf-8');
  debugLog('writeBaseline', `Wrote baseline to ${filePath}: pass=${baseline.pass} fail=${baseline.fail}`);
}

/**
 * Read a previously written test baseline from disk.
 * Returns null if the file doesn't exist or can't be parsed.
 */
export function readBaseline(
  projectRoot: string,
  sprintId: string,
): TestBaseline | null {
  const filePath = baselinePath(projectRoot, sprintId);
  if (!existsSync(filePath)) return null;
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as TestBaseline;
    // Validate required fields
    if (
      typeof parsed.files !== 'number' ||
      typeof parsed.pass !== 'number' ||
      typeof parsed.fail !== 'number' ||
      typeof parsed.skipped !== 'number'
    ) {
      return null;
    }
    return parsed;
  } catch (e) {
    debugLog('readBaseline:parse', e);
    return null;
  }
}

/**
 * Compare a current test run against the sprint baseline.
 * `newFailures > 0` means the worker introduced new test failures.
 * `newFailures <= 0` means the claim of "pre-existing failures" is valid.
 */
export function compareBaseline(
  baseline: TestBaseline,
  current: TestBaseline,
): BaselineComparison {
  const newFailures = current.fail - baseline.fail;
  return {
    newFailures,
    claimValid: newFailures <= 0,
    baseline,
    current,
  };
}

/**
 * Run a full honesty check for a worker's task result.
 *
 * 1. Check if worker notes contain honesty-trigger patterns
 * 2. If triggered, capture current vitest state and compare to baseline
 * 3. Return HONESTY_VIOLATION if delta > 0
 *
 * @param projectRoot - Project root directory
 * @param sprintId - Current sprint ID
 * @param taskId - Task being evaluated
 * @param workerNotes - Worker's self-reported notes
 * @param captureCurrentFn - Optional override for capturing current test state (for testing)
 */
export async function checkWorkerHonesty(
  projectRoot: string,
  sprintId: string,
  taskId: string,
  workerNotes: string,
  captureCurrentFn?: () => TestBaseline | null | Promise<TestBaseline | null>,
): Promise<HonestyCheckResult> {
  // Step 1: Check trigger
  if (!containsHonestyTrigger(workerNotes)) {
    return {
      taskId,
      triggered: false,
      violation: false,
      reason: 'No honesty trigger patterns found in worker notes',
    };
  }

  // Step 2: Read baseline
  const baseline = readBaseline(projectRoot, sprintId);
  if (!baseline) {
    return {
      taskId,
      triggered: true,
      violation: false,
      reason: 'Honesty trigger detected but no baseline available for comparison',
    };
  }

  // Step 3: Capture current state
  const captureFn = captureCurrentFn ?? (() => captureVitestBaseline(projectRoot));
  const current = await captureFn();
  if (!current) {
    return {
      taskId,
      triggered: true,
      violation: false,
      reason: 'Honesty trigger detected but unable to capture current test state',
    };
  }

  // Step 4: Compare
  const comparison = compareBaseline(baseline, current);

  if (comparison.newFailures > 0) {
    return {
      taskId,
      triggered: true,
      violation: true,
      comparison,
      reason: `HONESTY_VIOLATION: Worker claimed pre-existing failures but introduced ${comparison.newFailures} new failure(s) (baseline: ${baseline.fail} → current: ${current.fail})`,
    };
  }

  return {
    taskId,
    triggered: true,
    violation: false,
    comparison,
    reason: `Honesty claim verified: no new failures introduced (baseline: ${baseline.fail}, current: ${current.fail})`,
  };
}
