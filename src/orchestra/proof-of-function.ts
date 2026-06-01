// ═══ Proof-of-Function Gate (Sprint 216 Task 216-002) ═════════════════
// Tier-1 user-surface tasks (CLI commands, dashboard, HTTP API) require a
// real-binary smoke run before "DONE" can stand. A mocked unit test alone
// is GO_WITH_TECH_DEBT — it certifies wiring, not user-working UX.
//
// This module exposes:
//   1. verifyProofOfFunction(task, projectRoot, result, opts?) — async
//      spawns the task's `Smoke:` command host-side and asserts the
//      expected pattern. Returns { status, passed, evidence, command }.
//   2. applyProofOfFunctionGate(evaluation, gate, opts?) — when the smoke
//      failed but the rubric decision was DONE, downgrade to
//      GO_WITH_TECH_DEBT and emit a PROOF_OF_FUNCTION_MISMATCH audit
//      event (channel shape mirrors DISK_VS_CLAIM_MISMATCH_CHANNEL).
//
// Design notes:
//   - Worker does NOT boot servers — Brain does (post-sprint-smoke path).
//   - Smoke runner uses async `spawn` (ADR-006 array-form, no shell,
//     bounded timeout) — never spawnSync (CI-hermeticity custom rule).
//   - `task.smoke` is duck-typed (216-004 will add the field on Task);
//     until then we read it defensively so this module compiles + runs
//     forward-compatibly without depending on undelivered work.
//   - Tier-1 detection delegates to {@link isUserSurfaceTask} from
//     rubric-registry (216-001 output) — single source of truth.
//
// See: karpathy-discipline.md CUSTOM Proof-of-Function DoD,
//      ADR-079 (proposed Sprint 216), post-sprint-smoke.ts.
// @security: same override prohibition as RUBRIC_REGISTRY — gate logic
//            cannot be relaxed at runtime to upgrade GO_WITH_TECH_DEBT
//            back to DONE without an ADR amendment.

import { spawn } from 'node:child_process';
import type { Task, EvaluationResult, TaskResult } from '../core/types.js';
import { debugLog } from '../core/utils.js';
import { isUserSurfaceTask } from './rubric-registry.js';

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Audit channel emitted when a Tier-1 task's claimed DONE was downgraded
 * to GO_WITH_TECH_DEBT because its Smoke command did not pass.
 *
 * Shape mirrors {@link DISK_VS_CLAIM_MISMATCH_CHANNEL} from disk-verify
 * (BRAIN→AUDITOR string with a colon-delimited verb), so existing event
 * stream consumers can route both with a single substring match.
 */
export const PROOF_OF_FUNCTION_MISMATCH_CHANNEL =
  'BRAIN→AUDITOR:PROOF_OF_FUNCTION_MISMATCH';

/**
 * Smoke spec parsed from a DIRECTIVES `- Smoke:` / `**Smoke:**` line
 * (Task 216-004 will populate this on Task; until then we duck-type).
 *
 * `command` is parsed as a shell-style string for readability in
 * DIRECTIVES.md, but the runner splits it via shellSplit() and runs it
 * via array-form spawn so there is no shell interpretation at execution.
 *
 * `expect` is a substring that MUST appear in the combined stdout +
 * stderr output. Future revisions may accept a regex source, but a
 * literal substring is enough for serve→`__DECKENT_API_TOKEN__` and
 * chat→non-empty-cevap cases listed in DIRECTIVES.
 */
export interface SmokeSpec {
  command: string;
  expect: string;
}

/** Status emitted by {@link verifyProofOfFunction}. */
export type ProofStatus = 'no-op' | 'passed' | 'failed';

/** Outcome of running a Tier-1 task's Smoke command host-side. */
export interface ProofResult {
  status: ProofStatus;
  /** True iff status === 'passed'. */
  passed: boolean;
  /** Human-readable evidence (stdout/stderr excerpt or skip reason). */
  evidence: string;
  /** The actual command line invoked (or `null` when no-op). */
  command: string | null;
  /** Audit-channel payload to forward when status === 'failed'. */
  reason?: string;
}

/** Result of running the smoke command — capturing exit + output. */
export interface SmokeRunOutcome {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

/** Injectable smoke runner — tests pass a stub; production uses spawn. */
export type SmokeRunnerFn = (
  command: string,
  projectRoot: string,
  timeoutMs: number,
) => Promise<SmokeRunOutcome>;

/** Options for {@link verifyProofOfFunction}. */
export interface VerifyProofOfFunctionOptions {
  /** Override the async spawn runner — primarily for tests. */
  smokeRunner?: SmokeRunnerFn;
  /** Per-run timeout (ms). Defaults to 60_000. */
  timeoutMs?: number;
}

/** Audit event sink — tests inject a vi.fn() spy. */
export type ProofAuditSink = (event: {
  channel: typeof PROOF_OF_FUNCTION_MISMATCH_CHANNEL;
  taskId: string;
  command: string | null;
  evidence: string;
  reason: string;
}) => void;

/** Options for {@link applyProofOfFunctionGate}. */
export interface ApplyProofGateOptions {
  /** Where to send the audit event when downgrade occurs. */
  audit?: ProofAuditSink;
  /** Original task ID — used in the audit event payload. */
  taskId?: string;
}

// ─── Smoke spec extraction (duck-typed for 216-004 forward compat) ────

/**
 * Read a {@link SmokeSpec} from `task.smoke` if present.
 *
 * Task 216-004 will officially add the `smoke?: SmokeSpec` field on the
 * Task interface. Until that lands, we duck-type the lookup so this gate
 * compiles + runs forward-compatibly. Returns null when:
 *   - the field is missing (Tier-0 tasks never set it)
 *   - the field is malformed (defensive — we never throw on bad input)
 */
export function readSmokeSpec(task: Task): SmokeSpec | null {
  const candidate = (task as { smoke?: unknown }).smoke;
  if (!candidate || typeof candidate !== 'object') return null;
  const c = candidate as { command?: unknown; expect?: unknown };
  if (typeof c.command !== 'string' || c.command.trim().length === 0) return null;
  if (typeof c.expect !== 'string' || c.expect.length === 0) return null;
  return { command: c.command.trim(), expect: c.expect };
}

// ─── Default smoke runner (production) ────────────────────────────────

/**
 * Naive shell-style splitter for the Smoke command line. Splits on
 * unquoted whitespace, respects single/double quote groups. Adequate
 * for DIRECTIVES-authored commands like
 *   `node dist/cli/entry.js serve --port 3211 --no-terminal`
 * and `curl -s -H "Authorization: Bearer $TOKEN" localhost:3211/`.
 *
 * Not a full POSIX shell parser — pipes / redirections / env-var
 * substitution must be avoided in DIRECTIVES `Smoke:` lines (the gate
 * runs without a shell on purpose, per ADR-006).
 */
export function shellSplit(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) { quote = null; continue; }
      cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === ' ' || ch === '\t' || ch === '\n') {
      if (cur.length > 0) { out.push(cur); cur = ''; }
      continue;
    }
    cur += ch;
  }
  if (cur.length > 0) out.push(cur);
  return out;
}

/**
 * Production smoke runner — async `spawn` (NEVER spawnSync), no shell,
 * array-form args per ADR-006. Captures stdout + stderr; resolves on
 * child close or timeout. Never throws — failures surface as
 * `{ exitCode: null, ..., timedOut: true }` or `exitCode != 0`.
 */
export const defaultSmokeRunner: SmokeRunnerFn = (command, projectRoot, timeoutMs) => {
  return new Promise<SmokeRunOutcome>((resolve) => {
    const parts = shellSplit(command);
    if (parts.length === 0) {
      resolve({ exitCode: null, stdout: '', stderr: 'empty smoke command', timedOut: false });
      return;
    }
    const [binary, ...args] = parts;
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timer: NodeJS.Timeout | null = null;

    const finish = (outcome: SmokeRunOutcome) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(outcome);
    };

    try {
      const child = spawn(binary as string, args, {
        cwd: projectRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
      });
      child.stdout?.setEncoding('utf-8');
      child.stderr?.setEncoding('utf-8');
      child.stdout?.on('data', (chunk: string) => { stdout += chunk; });
      child.stderr?.on('data', (chunk: string) => { stderr += chunk; });
      child.on('error', (err) => {
        finish({ exitCode: null, stdout, stderr: stderr + `\nspawn error: ${err.message}`, timedOut: false });
      });
      child.on('close', (code) => {
        finish({ exitCode: code, stdout, stderr, timedOut: false });
      });
      timer = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch { /* fail-safe */ }
        finish({ exitCode: null, stdout, stderr, timedOut: true });
      }, timeoutMs);
    } catch (err) {
      finish({
        exitCode: null,
        stdout: '',
        stderr: `spawn threw: ${(err as Error)?.message ?? String(err)}`,
        timedOut: false,
      });
    }
  });
};

// ─── Main API: verifyProofOfFunction ──────────────────────────────────

/**
 * Run the Tier-1 task's Smoke command host-side and assert the expected
 * pattern.
 *
 * Returns `{ status: 'no-op' }` (passed=true, no evidence) when the gate
 * should not fire:
 *   - task is NOT user-surface (Tier-0 — disk-verify is sufficient)
 *   - task.smoke is absent / malformed (216-004 not delivered for this
 *     task or DIRECTIVES author omitted the Smoke: line)
 *   - rubric decision was NOT 'DONE' (we never need to downgrade a
 *     NO_GO / GO_WITH_TECH_DEBT decision — they're already accurate).
 *
 * Returns `{ status: 'passed' }` when stdout+stderr contains the
 * `expect` substring AND exit code === 0 (or a positive code paired
 * with the expected token, which covers servers that exit non-zero on
 * SIGKILL after a successful curl assertion — see DIRECTIVES Task 6
 * "kill in try/finally" pattern).
 *
 * Returns `{ status: 'failed' }` otherwise. The caller is expected to
 * pass this through {@link applyProofOfFunctionGate} to perform the
 * downgrade + audit emit in one step.
 */
export async function verifyProofOfFunction(
  task: Task,
  projectRoot: string,
  result: TaskResult,
  evaluation: EvaluationResult,
  opts: VerifyProofOfFunctionOptions = {},
): Promise<ProofResult> {
  // Gate inert when nothing to verify: Tier-0, no smoke spec, or the
  // rubric already returned NO_GO / GO_WITH_TECH_DEBT (no need to
  // downgrade something that isn't claiming DONE).
  if (!isUserSurfaceTask(task)) {
    return {
      status: 'no-op',
      passed: true,
      evidence: 'task is not user-surface (Tier-0) — proof-of-function gate inert',
      command: null,
    };
  }
  const spec = readSmokeSpec(task);
  if (!spec) {
    return {
      status: 'no-op',
      passed: true,
      evidence: 'task.smoke missing — Tier-1 task did not declare a Smoke command (DIRECTIVES author / 216-004 parser gap)',
      command: null,
    };
  }
  if (evaluation.decision !== 'DONE') {
    return {
      status: 'no-op',
      passed: true,
      evidence: `rubric decision is ${evaluation.decision} — no DONE to downgrade`,
      command: spec.command,
    };
  }

  // result is currently unused in the assertion logic — the worker's
  // result file is consulted upstream via evaluation; we accept it here
  // so future Smoke specs can reference filesChanged in their expect
  // pattern (Karpathy D2: keep the signature stable while reserving the
  // hook). Mark explicitly used for the linter.
  void result;

  const runner = opts.smokeRunner ?? defaultSmokeRunner;
  const timeoutMs = opts.timeoutMs ?? 60_000;

  let outcome: SmokeRunOutcome;
  try {
    outcome = await runner(spec.command, projectRoot, timeoutMs);
  } catch (err) {
    const reason = `smoke runner threw: ${(err as Error)?.message ?? String(err)}`;
    debugLog('proof-of-function:runner-threw', reason);
    return {
      status: 'failed',
      passed: false,
      evidence: reason,
      command: spec.command,
      reason,
    };
  }

  const combined = `${outcome.stdout}\n${outcome.stderr}`;
  const matched = combined.includes(spec.expect);
  const exitOk = outcome.exitCode === 0;

  if (matched && exitOk && !outcome.timedOut) {
    return {
      status: 'passed',
      passed: true,
      evidence: `expect '${spec.expect}' found in output (exit=0)`,
      command: spec.command,
    };
  }

  // Failure path — build a single-line evidence excerpt so the audit
  // event payload stays bounded.
  const reasonParts: string[] = [];
  if (outcome.timedOut) reasonParts.push(`timed out after ${timeoutMs}ms`);
  if (!matched) reasonParts.push(`expect '${spec.expect}' NOT found in output`);
  if (!exitOk && !outcome.timedOut) reasonParts.push(`exit code ${outcome.exitCode}`);
  const reason = reasonParts.join('; ') || 'smoke command failed';
  const evidence = `${reason} | stdout=${truncate(outcome.stdout)} stderr=${truncate(outcome.stderr)}`;

  return {
    status: 'failed',
    passed: false,
    evidence,
    command: spec.command,
    reason,
  };
}

function truncate(s: string): string {
  const trimmed = s.replace(/\s+/g, ' ').trim();
  return trimmed.length > 240 ? trimmed.slice(0, 240) + '…' : trimmed;
}

// ─── Gate: downgrade DONE → GO_WITH_TECH_DEBT + audit emit ────────────

/**
 * Apply the Proof-of-Function gate to a rubric evaluation.
 *
 * Behaviour:
 *   - When `gate.status === 'failed'` AND `evaluation.decision === 'DONE'`:
 *     downgrade decision to `GO_WITH_TECH_DEBT` AND emit a
 *     `PROOF_OF_FUNCTION_MISMATCH` audit-channel event through the
 *     injected sink. The returned evaluation is a new object — the
 *     input is not mutated (Karpathy D3: surgical, no hidden side
 *     effects on caller's state).
 *   - Otherwise: return the input evaluation unchanged (no-op).
 *
 * Why a separate "apply" step (instead of folding the downgrade into
 * verifyProofOfFunction): keeping the verification pure and the gate
 * side-effecting lets the post-sprint-smoke runner consult the verify
 * result for retro/dashboard output without forcing a state mutation
 * just to read what happened.
 */
export function applyProofOfFunctionGate(
  evaluation: EvaluationResult,
  gate: ProofResult,
  opts: ApplyProofGateOptions = {},
): EvaluationResult {
  if (gate.status !== 'failed') return evaluation;
  if (evaluation.decision !== 'DONE') return evaluation;

  // Emit audit event — fail-safe (sink may be undefined in unit tests
  // that only check the downgrade arithmetic).
  if (opts.audit) {
    try {
      opts.audit({
        channel: PROOF_OF_FUNCTION_MISMATCH_CHANNEL,
        taskId: opts.taskId ?? 'unknown',
        command: gate.command,
        evidence: gate.evidence,
        reason: gate.reason ?? gate.evidence,
      });
    } catch (err) {
      debugLog('proof-of-function:audit-sink-threw', err);
    }
  }

  return {
    ...evaluation,
    decision: 'GO_WITH_TECH_DEBT',
  };
}
