/**
 * Debt pre-flight revalidation — Dogfood-449 B5.
 *
 * Problem (live, sprint-449): CRITICAL debt rows whose notes were HONEST
 * completion reports (the worker verified the work already on disk) kept being
 * re-dispatched as fix tasks every sprint — three sonnet-high workers per run,
 * each re-writing the same "debt already resolved" verification. Together with
 * the B6 evaluator coverage-trap this was ~40% of sprint-449's task volume;
 * debt-433-001-fix alone had been re-dispatched for 15 sprints.
 *
 * Fix: BEFORE injectCriticalDebtTasks() turns a CRITICAL debt into a fix task,
 * re-run the debt note's own evidence commands host-side. Closure is
 * CONJUNCTIVE on purpose (the born-603 lesson: a text pattern alone is a
 * guess, never grounds for permanent closure):
 *   1. the note asserts completion ({@link COMPLETION_CLAIM_RE}), AND
 *   2. the note carries ≥1 extractable allowlisted verification command, AND
 *   3. every extracted command exits 0 within budget.
 * Only then may the caller auto-resolve the debt. Every other outcome —
 * no claim, no evidence, red evidence, timeout, budget exhaustion — keeps the
 * debt DISPATCHED (fail-open) with the pre-flight outcome surfaced as a
 * one-line annotation for the fix-task description, so the worker starts from
 * fresh signal instead of a stale multi-KB note dump.
 *
 * Command extraction is ALLOWLIST-ONLY. The note is model-authored text and is
 * never handed to a shell: only `npx tsc --noEmit`, `npm run lint`, and
 * `npx vitest run <safe-paths>` shapes are recognized, path tokens are
 * character-validated (no `..`, no leading dash), and execution uses
 * `spawn(..., { shell: false })`.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { DebtPriority } from '../core/types.js';
import type { DebtItem } from '../core/types.js';

// ─── Tunables ────────────────────────────────────────────────────────

/** Per-command wall-clock ceiling. A targeted vitest file or tsc --noEmit fits well under this. */
export const PREFLIGHT_CMD_TIMEOUT_MS = 180_000;
/** Whole-preflight wall-clock ceiling — PLAN must not stall behind evidence re-runs. */
export const PREFLIGHT_TOTAL_BUDGET_MS = 480_000;
/** Ceiling on distinct commands re-run per debt note. */
const MAX_COMMANDS_PER_DEBT = 4;
/** Ceiling on path arguments accepted for one `npx vitest run` extraction. */
const MAX_VITEST_PATHS = 6;

// ─── Extraction (pure) ───────────────────────────────────────────────

/**
 * A debt note counts as a completion CLAIM only when it asserts the work is
 * already done/verified. Patterns are pinned to the live sprint-433/445/449
 * debt-note shapes; deliberately narrow — a miss just means the debt stays
 * dispatched, which is the safe direction.
 */
export const COMPLETION_CLAIM_RE =
  /\bre-?verified\b|\balready\s+(?:carries|present|applied|resolved|on\s+disk|left|in\s+place)\b|\bno\s+new\s+edits?\b|\bno\s+file\s+changes?\s+(?:needed|required)\b|\bstill\s+present\b|\bauthored\s+and\s+verified\b|\bno\s+(?:code|source)\s+changes?\s+(?:needed|required|made|found)\b/i;

/** Path token allowlist: repo-relative, no shell metacharacters. */
const SAFE_PATH_RE = /^[A-Za-z0-9_.\/@-]+$/;

export interface ExtractedCommand {
  bin: string;
  args: string[];
  /** Canonical `bin arg arg…` form — dedup key and log/annotation label. */
  display: string;
}

/**
 * Extracts allowlisted, read-only verification commands from a debt note.
 * Pure. Unknown/unsafe shapes are silently ignored — extraction failure can
 * only keep a debt dispatched, never close it.
 */
export function extractVerifyCommands(note: string): ExtractedCommand[] {
  const out: ExtractedCommand[] = [];
  const seen = new Set<string>();
  const push = (bin: string, args: string[]): void => {
    const display = [bin, ...args].join(' ');
    if (!seen.has(display)) {
      seen.add(display);
      out.push({ bin, args, display });
    }
  };

  if (/\bnpx\s+tsc\s+--noEmit\b/.test(note)) push('npx', ['tsc', '--noEmit']);
  // Plain `npm run lint` only — no lint:* variants, no other scripts.
  if (/\bnpm\s+run\s+lint\b(?![:\w-])/.test(note)) push('npm', ['run', 'lint']);

  // `npx vitest run <paths…>` — accept consecutive path-looking tokens, stop at
  // the first token that is not a plausible test path (prose, flags, quotes).
  const vitestRe = /\bnpx\s+vitest\s+run\s+([^\n`'"]+)/g;
  for (const m of note.matchAll(vitestRe)) {
    const paths: string[] = [];
    for (const raw of (m[1] ?? '').trim().split(/\s+/)) {
      const tok = raw.replace(/[.,:;)\]]+$/, ''); // notes carry trailing prose punctuation
      if (tok.length === 0 || tok.startsWith('-') || tok.includes('..') || !SAFE_PATH_RE.test(tok)) break;
      // Require a path or test-file marker so "npx vitest run and then…" never captures prose.
      if (!(tok.includes('/') || /\.(test|spec)\./.test(tok))) break;
      paths.push(tok);
      if (paths.length >= MAX_VITEST_PATHS) break;
    }
    if (paths.length > 0) push('npx', ['vitest', 'run', ...paths]);
  }

  return out.slice(0, MAX_COMMANDS_PER_DEBT);
}

// ─── Execution ───────────────────────────────────────────────────────

export interface CommandRun {
  display: string;
  ok: boolean;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
}

/** Injectable for hermetic tests — the default spawns the real command. */
export type CommandRunner = (cmd: ExtractedCommand, cwd: string, timeoutMs: number) => Promise<CommandRun>;

/**
 * Runs one extracted command with async spawn (never spawnSync — Brain event
 * loop stays live), shell:false, output discarded (only the exit code is
 * evidence). VITEST_MAX_FORKS=2 caps memory for vitest re-runs.
 */
export const defaultCommandRunner: CommandRunner = (cmd, cwd, timeoutMs) => {
  return new Promise<CommandRun>((resolve) => {
    const startedAt = Date.now();
    let settled = false;
    const settle = (run: Omit<CommandRun, 'display' | 'durationMs'>): void => {
      if (settled) return;
      settled = true;
      resolve({ display: cmd.display, durationMs: Date.now() - startedAt, ...run });
    };

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(cmd.bin, cmd.args, {
        cwd,
        shell: false,
        stdio: ['ignore', 'ignore', 'ignore'],
        env: { ...process.env, VITEST_MAX_FORKS: '2' },
      });
    } catch {
      settle({ ok: false, exitCode: null, timedOut: false });
      return;
    }

    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
      settle({ ok: false, exitCode: null, timedOut: true });
    }, timeoutMs);

    child.on('error', () => {
      clearTimeout(timer);
      settle({ ok: false, exitCode: null, timedOut: false });
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      settle({ ok: code === 0, exitCode: code, timedOut: false });
    });
  });
};

// ─── Pre-flight ──────────────────────────────────────────────────────

export type DebtPreflightVerdict =
  /** Claim + evidence commands all green → caller may auto-resolve. */
  | 'verified-resolved'
  /** ≥1 evidence command failed → the debt is confirmed real. */
  | 'evidence-red'
  /**
   * ≥1 evidence path no longer exists on disk (live case: debt-445-013/017
   * notes cite `tests/core/routing3/`, since reorganized away). The vanished
   * path can neither confirm nor refute — never auto-close, dispatch with a
   * re-point-the-evidence annotation instead of a misleading "debt is REAL".
   */
  | 'stale-evidence'
  /** Note asserts completion but carries no extractable command. */
  | 'no-evidence'
  /** Note does not assert completion — never touched, dispatched as-is. */
  | 'no-claim'
  /** Time budget ran out before all evidence commands finished. */
  | 'budget-exhausted';

export interface DebtPreflightItem {
  debtId: string;
  verdict: DebtPreflightVerdict;
  runs: CommandRun[];
}

export interface DebtPreflightResult {
  /** One entry per CRITICAL unresolved debt examined, in input order. */
  items: DebtPreflightItem[];
  /** Debt ids whose evidence is fully green — safe to auto-resolve. */
  verifiedIds: Set<string>;
  /**
   * Per-debt one-line annotation for the injected fix-task description
   * (evidence-red / budget-exhausted only). English on purpose: task
   * descriptions are model-facing text (PCOMP-8 U3 language unification).
   */
  annotations: Map<string, string>;
}

/**
 * Re-validates CRITICAL unresolved debts host-side before dispatch.
 * Never throws for a single bad note/command — the failure direction is
 * always "keep the debt dispatched".
 */
export async function preflightCriticalDebt(
  projectRoot: string,
  debt: DebtItem[],
  opts?: { runner?: CommandRunner; totalBudgetMs?: number; cmdTimeoutMs?: number },
): Promise<DebtPreflightResult> {
  const runner = opts?.runner ?? defaultCommandRunner;
  const totalBudgetMs = opts?.totalBudgetMs ?? PREFLIGHT_TOTAL_BUDGET_MS;
  const cmdTimeoutMs = opts?.cmdTimeoutMs ?? PREFLIGHT_CMD_TIMEOUT_MS;

  const items: DebtPreflightItem[] = [];
  const verifiedIds = new Set<string>();
  const annotations = new Map<string, string>();
  const startedAt = Date.now();
  const budgetLeft = (): number => totalBudgetMs - (Date.now() - startedAt);
  // Same command across several debt notes (live case: `npx tsc --noEmit` in all
  // three open criticals) runs ONCE per preflight — results are deterministic
  // within one plan, and tsc×3 would eat most of the time budget for nothing.
  const memo = new Map<string, CommandRun>();
  const runOnce = async (cmd: ExtractedCommand, timeoutMs: number): Promise<CommandRun> => {
    const cached = memo.get(cmd.display);
    if (cached) return cached;
    const run = await runner(cmd, projectRoot, timeoutMs);
    memo.set(cmd.display, run);
    return run;
  };

  for (const item of debt) {
    if (item.priority !== DebtPriority.CRITICAL || item.resolved) continue;

    if (!COMPLETION_CLAIM_RE.test(item.description)) {
      items.push({ debtId: item.id, verdict: 'no-claim', runs: [] });
      continue;
    }
    const commands = extractVerifyCommands(item.description);
    if (commands.length === 0) {
      items.push({ debtId: item.id, verdict: 'no-evidence', runs: [] });
      continue;
    }

    // A vitest evidence path that no longer exists can neither confirm nor
    // refute — separate it out so it never counts as a red run NOR silently
    // upgrades the remaining evidence to a full confirmation.
    const stalePaths: string[] = [];
    const runnable = commands.filter((cmd) => {
      if (cmd.args[0] !== 'vitest') return true;
      const missing = cmd.args.slice(2).filter((p) => !existsSync(join(projectRoot, p)));
      stalePaths.push(...missing);
      return missing.length === 0;
    });

    const runs: CommandRun[] = [];
    let red: CommandRun | undefined;
    let outOfBudget = false;
    for (const cmd of runnable) {
      const remaining = budgetLeft();
      if (remaining <= 0) {
        outOfBudget = true;
        break;
      }
      const run = await runOnce(cmd, Math.min(cmdTimeoutMs, remaining));
      runs.push(run);
      if (!run.ok) {
        red = run;
        break; // first red settles it — the debt is real
      }
    }

    if (red) {
      items.push({ debtId: item.id, verdict: 'evidence-red', runs });
      annotations.set(
        item.id,
        `Pre-flight (host-side, this plan): \`${red.display}\` FAILED (${red.timedOut ? 'timeout' : `exit ${red.exitCode}`}) — the debt is REAL; start from this failing command, not from the prior notes.`,
      );
    } else if (outOfBudget || runs.length < runnable.length) {
      items.push({ debtId: item.id, verdict: 'budget-exhausted', runs });
      annotations.set(
        item.id,
        'Pre-flight: time budget exhausted before all evidence commands ran — treat the prior notes as UNVERIFIED and re-check before coding.',
      );
    } else if (stalePaths.length > 0) {
      items.push({ debtId: item.id, verdict: 'stale-evidence', runs });
      const greens = runs.map((r) => `\`${r.display}\``).join(', ');
      annotations.set(
        item.id,
        `Pre-flight: evidence path(s) in the notes no longer exist on disk: ${stalePaths.map((p) => `\`${p}\``).join(', ')}.` +
          (runs.length > 0 ? ` Remaining runnable evidence is green (${greens}).` : '') +
          ' RE-POINT the vanished evidence to its current location and re-verify — do not treat the prior notes as done, and do not redo work the tree may already carry.',
      );
    } else {
      verifiedIds.add(item.id);
      items.push({ debtId: item.id, verdict: 'verified-resolved', runs });
    }
  }

  return { items, verifiedIds, annotations };
}
