// ─── Limit Preflight — Subscription-Window Probe (LIMIT-PREFLIGHT) ──────────
//
// Probes `claude -p "/usage"` before a sprint/spawn to read the live
// subscription-window state. Canlı-doğrulanmış output shape (plain text,
// not JSON — the CLI has no stable machine-readable /usage contract):
//   "Current session: 81% used · resets Jul 2, 8:30pm (Europe/Istanbul)"
//   "Current week (all models): 31% used · resets ... (...)"
//   "Current week (Fable): 26% used · resets ... (...)"
//
// Fail-honest by design: the CLI's plain-text format is not a stable
// contract, so any missing/unparseable required line resolves to
// `{ unavailable: true, reason }` — never throws. evaluateLimitGate mirrors
// that: an unavailable probe fails OPEN ('ok') rather than blocking a sprint
// on a CLI text-format drift.
//
// `reason` fields below are English diagnostic/log strings, not rendered UI
// labels — this is a core/ mechanism module, not a CLI/TUI presentation
// layer, so no i18n binding applies here (same exemption documented in
// model-tier-guard.ts).
//
// Sprint-360 Task 360-002.

import { spawn as nodeSpawn } from 'node:child_process';
import type { SpawnOptionsWithoutStdio } from 'node:child_process';

// ─── Types ───────────────────────────────────────────────────────────────

/**
 * Best-effort reset-time reading from a "resets <text> (<tz>)" clause.
 * Never normalized to a Date/ISO timestamp: the CLI text has no year and the
 * parenthesized value is an IANA zone name (not a UTC offset) — fabricating
 * a full timestamp from that would be inventing precision the source doesn't
 * have. `timezone` is null when the clause has no trailing "(...)" segment.
 */
export interface ResetTime {
  readonly text: string;
  readonly timezone: string | null;
}

export interface SubscriptionLimitProbe {
  readonly unavailable: false;
  readonly sessionPct: number;
  readonly sessionResetAt: ResetTime | null;
  readonly weekAllPct: number;
  readonly weekAllResetAt: ResetTime | null;
  readonly weekFablePct?: number;
  /** Raw stdout of `claude -p "/usage"`, for diagnostics. */
  readonly raw: string;
}

export interface SubscriptionLimitUnavailable {
  readonly unavailable: true;
  readonly reason: string;
  readonly raw: string;
}

export type SubscriptionLimitResult = SubscriptionLimitProbe | SubscriptionLimitUnavailable;

export type LimitGateVerdict = 'ok' | 'warn' | 'block';

export interface LimitGateResult {
  readonly verdict: LimitGateVerdict;
  readonly reason: string;
}

/** Percentage thresholds `evaluateLimitGate` applies to the worst usage window. */
export interface LimitGateThresholds {
  readonly warnPct: number;
  readonly blockPct: number;
}

export const DEFAULT_LIMIT_GATE_THRESHOLDS: LimitGateThresholds = {
  warnPct: 70,
  blockPct: 90,
};

// ─── Spawn seam ──────────────────────────────────────────────────────────

/** Minimal child shape used by {@link probeSubscriptionLimits} — mockable in tests. */
export interface SpawnedProcessLike {
  stdout: NodeJS.ReadableStream | null;
  stderr: NodeJS.ReadableStream | null;
  on(event: 'close', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  kill(signal?: NodeJS.Signals): boolean;
}

/** Injectable async spawn (defaults to node:child_process spawn). */
export type SpawnImpl = (
  command: string,
  args: string[],
  options: SpawnOptionsWithoutStdio,
) => SpawnedProcessLike;

export interface ProbeSubscriptionLimitsOptions {
  /** Injectable spawn for hermetic tests — the real `claude` binary is never invoked. */
  spawnImpl?: SpawnImpl;
  /** Max time to wait for `claude -p "/usage"` before treating it as unavailable. */
  timeoutMs?: number;
  /** Override the `claude` binary name/path (default 'claude'). */
  claudeBin?: string;
}

const DEFAULT_TIMEOUT_MS = 15_000;

function collectStream(stream: NodeJS.ReadableStream | null): Promise<string> {
  if (stream === null) return Promise.resolve('');
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk: string | Buffer) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

interface UsageRunResult {
  code: number;
  stdout: string;
}

/**
 * Run `claude -p "/usage"` and collect stdout. Resolves `null` when the
 * spawn itself fails OR the timeout elapses (child is killed on timeout).
 * Never throws or rejects.
 */
function runClaudeUsage(
  spawnImpl: SpawnImpl,
  claudeBin: string,
  timeoutMs: number,
): Promise<UsageRunResult | null> {
  return new Promise((resolve) => {
    let child: SpawnedProcessLike;
    try {
      child = spawnImpl(claudeBin, ['-p', '/usage'], { shell: false });
    } catch {
      resolve(null);
      return;
    }

    const stdoutP = collectStream(child.stdout);
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill('SIGTERM');
      } catch {
        // best-effort — process may have already exited
      }
      resolve(null);
    }, timeoutMs);

    child.on('error', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(null);
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void stdoutP.then((stdout) => resolve({ code: code ?? -1, stdout }));
    });
  });
}

// ─── Parsing ─────────────────────────────────────────────────────────────

// Matches "<N>% used" with an optional trailing "· resets <clause>" segment.
// Anchor-free — the same regex applies whether the line is prefixed with
// "Current session:" or "Current week (...):"; only the digits + optional
// reset clause are consumed.
const PCT_LINE_RE = /(\d{1,3})%\s*used(?:\s*(?:·|-)\s*resets\s+(.+))?/i;

function parseResetClause(clause: string): ResetTime {
  const trimmed = clause.trim();
  const m = trimmed.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
  if (m) return { text: m[1]!.trim(), timezone: m[2]!.trim() };
  return { text: trimmed, timezone: null };
}

function parseLimitLine(line: string): { pct: number; reset: ResetTime | null } | null {
  const m = line.match(PCT_LINE_RE);
  if (!m) return null;
  const pct = Number(m[1]);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return null;
  const resetClause = m[2];
  return { pct, reset: resetClause ? parseResetClause(resetClause) : null };
}

/**
 * Parse the plain-text output of `claude -p "/usage"` into a structured
 * probe. Fail-honest: a missing "Current session" / "Current week (all
 * models)" line, or an unparseable percentage on either, resolves to
 * `{ unavailable: true, reason }` — the CLI's plain-text format is not a
 * stable contract and may change without notice. The optional "Current week
 * (Fable)" line is best-effort: if present but unparseable it is simply
 * omitted from the result rather than failing the whole probe.
 */
export function parseSubscriptionLimitOutput(raw: string): SubscriptionLimitResult {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const sessionLine = lines.find((l) => /^current session:/i.test(l));
  const weekAllLine = lines.find((l) => /^current week\s*\(all models\):/i.test(l));
  const weekFableLine = lines.find((l) => /^current week\s*\(fable\):/i.test(l));

  if (!sessionLine || !weekAllLine) {
    return {
      unavailable: true,
      reason: 'usage output missing required "Current session" or "Current week (all models)" line',
      raw,
    };
  }

  const session = parseLimitLine(sessionLine);
  const weekAll = parseLimitLine(weekAllLine);

  if (!session || !weekAll) {
    return {
      unavailable: true,
      reason: 'could not parse a usage percentage from the session or week (all models) line',
      raw,
    };
  }

  const probe: SubscriptionLimitProbe = {
    unavailable: false,
    sessionPct: session.pct,
    sessionResetAt: session.reset,
    weekAllPct: weekAll.pct,
    weekAllResetAt: weekAll.reset,
    raw,
  };

  if (weekFableLine) {
    const weekFable = parseLimitLine(weekFableLine);
    if (weekFable) {
      return { ...probe, weekFablePct: weekFable.pct };
    }
  }

  return probe;
}

// ─── Probe (spawn + parse) ───────────────────────────────────────────────

/**
 * Probe the live subscription-window state via `claude -p "/usage"`.
 * Injectable `spawnImpl` keeps this hermetic in tests — the real `claude`
 * binary is invoked only when no override is supplied. Never throws: spawn
 * failure, timeout, non-zero exit, or unparseable output all resolve to
 * `{ unavailable: true, reason }`.
 */
export async function probeSubscriptionLimits(
  opts: ProbeSubscriptionLimitsOptions = {},
): Promise<SubscriptionLimitResult> {
  const spawnImpl: SpawnImpl =
    opts.spawnImpl ?? ((command, args, options) => nodeSpawn(command, args, options));
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const claudeBin = opts.claudeBin ?? 'claude';

  const run = await runClaudeUsage(spawnImpl, claudeBin, timeoutMs);
  if (run === null) {
    return {
      unavailable: true,
      reason: `claude -p "/usage" spawn failed or exceeded ${timeoutMs}ms timeout`,
      raw: '',
    };
  }
  if (run.code !== 0) {
    return {
      unavailable: true,
      reason: `claude -p "/usage" exited with non-zero code ${run.code}`,
      raw: run.stdout,
    };
  }
  return parseSubscriptionLimitOutput(run.stdout);
}

// ─── Gate evaluation ─────────────────────────────────────────────────────

/**
 * Evaluate a probe result against warn/block percentage thresholds.
 *
 * Pct-only by design (a reset-clause parse failure never affects this
 * decision — resetAt is carried on the probe for display, not for gating).
 * The gate looks at the highest known percentage across the session /
 * week (all models) / week (Fable, if present) windows — whichever window is
 * closest to its cap is the binding constraint.
 *
 * An unavailable probe fails OPEN ('ok'): this is a preflight advisory, not
 * a hard authority gate, so a CLI text-format drift must not block a sprint.
 */
export function evaluateLimitGate(
  probe: SubscriptionLimitResult,
  thresholds: LimitGateThresholds = DEFAULT_LIMIT_GATE_THRESHOLDS,
): LimitGateResult {
  if (probe.unavailable) {
    return {
      verdict: 'ok',
      reason: `limit probe unavailable (${probe.reason}) — proceeding without a limit signal`,
    };
  }

  const windows: Array<{ name: string; pct: number }> = [
    { name: 'session', pct: probe.sessionPct },
    { name: 'week (all models)', pct: probe.weekAllPct },
  ];
  if (probe.weekFablePct !== undefined) {
    windows.push({ name: 'week (Fable)', pct: probe.weekFablePct });
  }

  let worst = windows[0]!;
  for (const w of windows) {
    if (w.pct > worst.pct) worst = w;
  }

  if (worst.pct >= thresholds.blockPct) {
    return {
      verdict: 'block',
      reason: `${worst.name} usage at ${worst.pct}% >= block threshold ${thresholds.blockPct}%`,
    };
  }
  if (worst.pct >= thresholds.warnPct) {
    return {
      verdict: 'warn',
      reason: `${worst.name} usage at ${worst.pct}% >= warn threshold ${thresholds.warnPct}%`,
    };
  }
  return {
    verdict: 'ok',
    reason: `all usage windows below warn threshold ${thresholds.warnPct}% (highest: ${worst.name} at ${worst.pct}%)`,
  };
}

// ─── Per-window threshold resolution (LIMITS-WARN-FIELDS, 361-002 debt) ─────
//
// 361-002 shipped a per-window (session vs weekly) verdict evaluator, but it
// lives in cli/commands/limits.ts and its warn floor is hardcoded to
// `min(DEFAULT_LIMIT_GATE_THRESHOLDS.warnPct, block)` — there is no way to
// configure an independent warn threshold per window. That gap is the debt
// this closes. Per ADR-D-004 C3 ("surfaces MUST NOT host reusable business
// logic"), the resolution + evaluation primitives belong here in core/, not
// in cli/ — a follow-up task wires cli/commands/limits.ts's `limit_gate`
// config (session_warn_pct / weekly_warn_pct fields) to the functions below.

/**
 * Per-window thresholds: one pair for the session window, one shared pair
 * for both weekly windows (week (all models) + week (Fable)) — mirrors the
 * session/weekly grouping already used by cli/commands/limits.ts.
 */
export interface WindowedLimitGateThresholds {
  readonly session: LimitGateThresholds;
  readonly weekly: LimitGateThresholds;
}

/**
 * Optional block/warn overrides for resolving per-window thresholds.
 * Config-format-agnostic by design: this core module does not know about any
 * particular config file's key names (e.g. `session_max_pct`) — the caller
 * reads its own config and passes the parsed numbers in.
 */
export interface WindowedLimitGateOverrides {
  readonly sessionBlockPct?: number;
  readonly sessionWarnPct?: number;
  readonly weeklyBlockPct?: number;
  readonly weeklyWarnPct?: number;
}

/**
 * Resolve independent session/weekly threshold pairs from optional
 * overrides. Byte-identical default when no `*WarnPct` override is supplied:
 * block defaults to `DEFAULT_LIMIT_GATE_THRESHOLDS.blockPct`, warn defaults
 * to `min(DEFAULT_LIMIT_GATE_THRESHOLDS.warnPct, block)` — the exact
 * pre-362-004 `min(70, block)` formula (the 361-002 debt). An explicit warn
 * override is still clamped to never exceed its window's block ceiling, so a
 * configured warn threshold can never fire after block already would.
 */
export function resolveWindowedLimitGateThresholds(
  overrides: WindowedLimitGateOverrides = {},
): WindowedLimitGateThresholds {
  const sessionBlock = overrides.sessionBlockPct ?? DEFAULT_LIMIT_GATE_THRESHOLDS.blockPct;
  const weeklyBlock = overrides.weeklyBlockPct ?? DEFAULT_LIMIT_GATE_THRESHOLDS.blockPct;
  const sessionWarn =
    overrides.sessionWarnPct ?? Math.min(DEFAULT_LIMIT_GATE_THRESHOLDS.warnPct, sessionBlock);
  const weeklyWarn =
    overrides.weeklyWarnPct ?? Math.min(DEFAULT_LIMIT_GATE_THRESHOLDS.warnPct, weeklyBlock);
  return {
    session: { warnPct: Math.min(sessionWarn, sessionBlock), blockPct: sessionBlock },
    weekly: { warnPct: Math.min(weeklyWarn, weeklyBlock), blockPct: weeklyBlock },
  };
}

const WINDOWED_VERDICT_RANK: Readonly<Record<LimitGateVerdict, number>> = { ok: 0, warn: 1, block: 2 };

function verdictForWindow(pct: number, thresholds: LimitGateThresholds): LimitGateVerdict {
  if (pct >= thresholds.blockPct) return 'block';
  if (pct >= thresholds.warnPct) return 'warn';
  return 'ok';
}

/**
 * Evaluate a probe against independent per-window thresholds. Unlike
 * {@link evaluateLimitGate} (one shared warn/block pair checked only against
 * whichever window has the highest raw percentage), each window here is
 * checked against its OWN thresholds first; the worst VERDICT — not the
 * worst raw percentage — wins. That distinction matters: a session at 75%
 * with a lenient session warn floor can stay 'ok' while a weekly window at
 * 72% trips its own tighter warn floor, a case the single-shared-threshold
 * evaluator cannot express.
 *
 * Fails open ('ok') when the probe is unavailable, mirroring
 * `evaluateLimitGate`. Defaults to `resolveWindowedLimitGateThresholds()`
 * (no overrides) — i.e. the pre-362-004 `min(70, block)` behavior — when no
 * thresholds are passed.
 */
export function evaluateLimitGateByWindow(
  probe: SubscriptionLimitResult,
  thresholds: WindowedLimitGateThresholds = resolveWindowedLimitGateThresholds(),
): LimitGateResult {
  if (probe.unavailable) {
    return {
      verdict: 'ok',
      reason: `limit probe unavailable (${probe.reason}) — proceeding without a limit signal`,
    };
  }

  const windows: Array<{ name: string; pct: number; thresholds: LimitGateThresholds }> = [
    { name: 'session', pct: probe.sessionPct, thresholds: thresholds.session },
    { name: 'week (all models)', pct: probe.weekAllPct, thresholds: thresholds.weekly },
  ];
  if (probe.weekFablePct !== undefined) {
    windows.push({ name: 'week (Fable)', pct: probe.weekFablePct, thresholds: thresholds.weekly });
  }

  let worstName = windows[0]!.name;
  let worstPct = windows[0]!.pct;
  let worstThresholds = windows[0]!.thresholds;
  let worstVerdict = verdictForWindow(worstPct, worstThresholds);

  for (const w of windows) {
    const verdict = verdictForWindow(w.pct, w.thresholds);
    if (WINDOWED_VERDICT_RANK[verdict] > WINDOWED_VERDICT_RANK[worstVerdict]) {
      worstName = w.name;
      worstPct = w.pct;
      worstThresholds = w.thresholds;
      worstVerdict = verdict;
    }
  }

  if (worstVerdict === 'block') {
    return {
      verdict: 'block',
      reason: `${worstName} usage at ${worstPct}% >= block threshold ${worstThresholds.blockPct}%`,
    };
  }
  if (worstVerdict === 'warn') {
    return {
      verdict: 'warn',
      reason: `${worstName} usage at ${worstPct}% >= warn threshold ${worstThresholds.warnPct}%`,
    };
  }
  return {
    verdict: 'ok',
    reason: `all usage windows below their warn threshold (highest: ${worstName} at ${worstPct}%)`,
  };
}
