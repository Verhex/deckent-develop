// ─── `deckent limits` — Subscription-Window Usage + Start-Gate (LIMIT-GATE-WIRE) ─
//
// (a) `deckent limits [--json]` — runs the LIMIT-PREFLIGHT probe
// (core/limit-preflight.ts, Sprint 360 Task 360-002) and renders it as a
// human-readable table or `--json`.
//
// (b) Start-gate logic (`checkStartLimitGate`) — evaluates the same probe
// against config-driven `limit_gate.{enabled,session_max_pct,weekly_max_pct}`
// thresholds and returns a block/warn/ok/unknown verdict with a caller-owned
// bypass path. Wired into the CLI `deckent start` preflight; MCP, do,
// autonomous, and every-dispatch parity remain separate work.
// `readLimitGateConfig` reads `.deckent/config.json` directly (same established pattern as
// cli/helpers/config-reader.ts#getLangFromConfig and doctor.ts's raw
// spawn_backend/max_workers reads) so disabled remains a zero-probe no-op.
//
// Sprint 361 Task 361-002 (carryover of 360-003, born-475).

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import { GLOBAL_CONFIG_PATH, PROJECT_CONFIG_PATH } from '../../core/constants.js';
import {
  probeSubscriptionLimits,
  DEFAULT_LIMIT_GATE_THRESHOLDS,
  type ProbeSubscriptionLimitsOptions,
  type SubscriptionLimitResult,
  type ResetTime,
  type LimitGateVerdict,
  type LimitGateThresholds,
} from '../../core/limit-preflight.js';
import { print } from '../helpers/output.js';
import { formatTable } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getLangFromConfig } from '../helpers/config-reader.js';
import { getMessage, getLanguage } from '../helpers/messages.js';
import { loadConfig } from '../../core/config.js';
import { probeProviderAuth, type AuthProbeResult } from '../../core/provider-auth-probe.js';
import type { ResolvedConfig } from '../../core/types.js';
import { LIMITS_PROVIDER_FILTERS } from '../surface-contract.js';

// ─── Config (raw-read, config.ts/config-types.ts out of scope — see header) ──

export interface LimitGateConfig {
  readonly enabled?: boolean;
  readonly session_max_pct?: number;
  readonly weekly_max_pct?: number;
}

function isValidPct(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
}

function readRawLimitGateBlock(path: string): LimitGateConfig | undefined {
  try {
    if (!existsSync(path)) return undefined;
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as { limit_gate?: unknown };
    const block = raw.limit_gate;
    if (!block || typeof block !== 'object') return undefined;
    const b = block as Record<string, unknown>;
    const result: { enabled?: boolean; session_max_pct?: number; weekly_max_pct?: number } = {};
    if (typeof b['enabled'] === 'boolean') result.enabled = b['enabled'];
    if (isValidPct(b['session_max_pct'])) result.session_max_pct = b['session_max_pct'];
    if (isValidPct(b['weekly_max_pct'])) result.weekly_max_pct = b['weekly_max_pct'];
    return result;
  } catch {
    return undefined;
  }
}

/**
 * Reads `limit_gate` from global (`~/.deckent/config.json`) + project
 * (`<root>/.deckent/config.json`) config, project overriding global
 * field-by-field. Default-off: an absent block, or `enabled` absent/false,
 * means the caller must treat the gate as disabled. Never throws.
 */
export function readLimitGateConfig(root: string): LimitGateConfig {
  const globalGate = readRawLimitGateBlock(GLOBAL_CONFIG_PATH);
  const projectGate = readRawLimitGateBlock(join(root, PROJECT_CONFIG_PATH));
  return { ...globalGate, ...projectGate };
}

// ─── Windowed gate evaluation ────────────────────────────────────────────

export interface WindowedLimitGateResult {
  readonly verdict: LimitGateVerdict;
  /** Canonical window name ('session' | 'week (all models)' | 'week (Fable)'); null when verdict is 'ok'. */
  readonly window: string | null;
  readonly pct: number | null;
  readonly resetAt: ResetTime | null;
  /** English diagnostic string — not a rendered UI label (mirrors limit-preflight.ts's own reason fields). */
  readonly reason: string;
}

const VERDICT_RANK: Readonly<Record<LimitGateVerdict, number>> = {
  unknown: -1,
  ok: 0,
  warn: 1,
  block: 2,
};

function verdictForPct(pct: number, thresholds: LimitGateThresholds): LimitGateVerdict {
  if (pct >= thresholds.blockPct) return 'block';
  if (pct >= thresholds.warnPct) return 'warn';
  return 'ok';
}

/**
 * Resolves independent per-window thresholds: `session_max_pct` is the block
 * ceiling for the session window, `weekly_max_pct` for week(all models) +
 * week(Fable). Absent config field -> DEFAULT_LIMIT_GATE_THRESHOLDS.blockPct
 * (90). The warn floor is DEFAULT_LIMIT_GATE_THRESHOLDS.warnPct (70), capped
 * to never exceed the resolved block ceiling.
 */
export function resolveLimitGateThresholds(
  gate: LimitGateConfig,
): { session: LimitGateThresholds; weekly: LimitGateThresholds } {
  const sessionBlock = gate.session_max_pct ?? DEFAULT_LIMIT_GATE_THRESHOLDS.blockPct;
  const weeklyBlock = gate.weekly_max_pct ?? DEFAULT_LIMIT_GATE_THRESHOLDS.blockPct;
  return {
    session: { warnPct: Math.min(DEFAULT_LIMIT_GATE_THRESHOLDS.warnPct, sessionBlock), blockPct: sessionBlock },
    weekly: { warnPct: Math.min(DEFAULT_LIMIT_GATE_THRESHOLDS.warnPct, weeklyBlock), blockPct: weeklyBlock },
  };
}

/**
 * Evaluate a probe against per-window (session vs weekly) config thresholds.
 * Returns 'unknown' when the probe is unavailable, mirroring
 * core/limit-preflight.ts#evaluateLimitGate. Enforcement remains a caller
 * policy decision, but missing evidence is never represented as 'ok'. The
 * worst verdict across session/week(all models)/week(Fable, if present) wins.
 */
export function evaluateWindowedLimitGate(
  probe: SubscriptionLimitResult,
  gate: LimitGateConfig = {},
): WindowedLimitGateResult {
  if (probe.unavailable) {
    return {
      verdict: 'unknown',
      window: null,
      pct: null,
      resetAt: null,
      reason: `limit probe unavailable (${probe.reason}) — limit state is unknown`,
    };
  }

  const { session, weekly } = resolveLimitGateThresholds(gate);
  const windows: Array<{ name: string; pct: number; resetAt: ResetTime | null; thresholds: LimitGateThresholds }> = [
    { name: 'session', pct: probe.sessionPct, resetAt: probe.sessionResetAt, thresholds: session },
    { name: 'week (all models)', pct: probe.weekAllPct, resetAt: probe.weekAllResetAt, thresholds: weekly },
  ];
  if (probe.weekFablePct !== undefined) {
    windows.push({ name: 'week (Fable)', pct: probe.weekFablePct, resetAt: probe.weekAllResetAt, thresholds: weekly });
  }

  let worstName = windows[0]!.name;
  let worstPct = windows[0]!.pct;
  let worstResetAt = windows[0]!.resetAt;
  let worstVerdict = verdictForPct(windows[0]!.pct, windows[0]!.thresholds);

  for (const w of windows) {
    const verdict = verdictForPct(w.pct, w.thresholds);
    if (VERDICT_RANK[verdict] > VERDICT_RANK[worstVerdict]) {
      worstName = w.name;
      worstPct = w.pct;
      worstResetAt = w.resetAt;
      worstVerdict = verdict;
    }
  }

  if (worstVerdict === 'ok') {
    return {
      verdict: 'ok',
      window: null,
      pct: null,
      resetAt: null,
      reason: `all usage windows below warn threshold (highest: ${worstName} at ${worstPct}%)`,
    };
  }
  return {
    verdict: worstVerdict,
    window: worstName,
    pct: worstPct,
    resetAt: worstResetAt,
    reason: `${worstName} usage at ${worstPct}% >= ${worstVerdict} threshold`,
  };
}

// ─── Rendering helpers ───────────────────────────────────────────────────

function formatResetAt(resetAt: ResetTime | null, lang: string): string {
  if (!resetAt) return getMessage('limits.no_reset', lang);
  return resetAt.timezone ? `${resetAt.text} (${resetAt.timezone})` : resetAt.text;
}

function windowLabel(name: string, lang: string): string {
  switch (name) {
    case 'session': return getMessage('limits.window_session', lang);
    case 'week (all models)': return getMessage('limits.window_week_all', lang);
    case 'week (Fable)': return getMessage('limits.window_week_fable', lang);
    default: return name;
  }
}

// ─── Part (b): start-gate check (wired by CLI start; see header) ──────────

export interface StartLimitGateOptions {
  /** Bypass a 'block' verdict (mirrors `deckent start --force`'s cost-gate override). */
  forceLimits?: boolean;
}

export interface StartLimitGateResult {
  /** True when the caller should abort the sprint start. */
  blocked: boolean;
  /** True when a 'block' verdict was overridden via forceLimits. */
  bypassed: boolean;
  verdict: LimitGateVerdict;
  /** Localized, print()-ready message. Null when the gate is disabled or fully ok (silent). */
  message: string | null;
}

/**
 * Pre-start subscription-limit gate. Disabled by default
 * (`limit_gate.enabled` absent/false) — in that case this makes ZERO probe
 * calls and returns immediately, so a disabled gate is a byte-identical
 * no-op versus the pre-361-002 start flow.
 */
export async function checkStartLimitGate(
  root: string,
  lang: string,
  opts: StartLimitGateOptions = {},
  probeOpts: ProbeSubscriptionLimitsOptions = {},
): Promise<StartLimitGateResult> {
  const gateConfig = readLimitGateConfig(root);
  if (!gateConfig.enabled) {
    return { blocked: false, bypassed: false, verdict: 'ok', message: null };
  }

  const probe = await probeSubscriptionLimits(probeOpts);
  const result = evaluateWindowedLimitGate(probe, gateConfig);

  if (result.verdict === 'block') {
    if (opts.forceLimits) {
      return { blocked: false, bypassed: true, verdict: 'block', message: getMessage('limits.force_bypass', lang) };
    }
    const message = getMessage('limits.start_gate_blocked', lang, {
      window: windowLabel(result.window ?? '', lang),
      pct: String(result.pct ?? ''),
      reset: formatResetAt(result.resetAt, lang),
    });
    return { blocked: true, bypassed: false, verdict: 'block', message };
  }

  if (result.verdict === 'warn') {
    const message = getMessage('limits.start_gate_warn', lang, {
      window: windowLabel(result.window ?? '', lang),
      pct: String(result.pct ?? ''),
    });
    return { blocked: false, bypassed: false, verdict: 'warn', message };
  }

  if (result.verdict === 'unknown') {
    return {
      blocked: false,
      bypassed: false,
      verdict: 'unknown',
      message: getMessage('limits.start_gate_unknown', lang),
    };
  }

  return { blocked: false, bypassed: false, verdict: 'ok', message: null };
}

// ─── Part (a): `deckent limits [--json]` ─────────────────────────────────

export interface LimitsCommandOpts {
  json?: boolean;
  readonly [providerFilter: string]: boolean | undefined;
}

type ProviderUsageProbe = () => Promise<SubscriptionLimitResult>;

export interface LimitsCommandDependencies {
  readonly loadEffectiveConfig?: (root: string) => Promise<ResolvedConfig>;
  readonly probeAuth?: (provider: string) => Promise<AuthProbeResult>;
  readonly usageProbes?: ReadonlyMap<string, ProviderUsageProbe>;
}

/** Provider identities are derived exclusively from the resolved config. */
export function configuredProviders(config: ResolvedConfig): string[] {
  const values: unknown[] = [
    config.brain_provider,
    config.worker_provider,
    config.fallback_provider,
    ...Object.values(config.provider_overrides ?? {}),
    ...Object.values(config.providers?.overrides ?? {}),
    config.providers?.brain,
    config.providers?.worker,
    config.providers?.fallback,
    ...(config.providers?.registry ?? []).map((definition) => definition.name),
  ];
  return [...new Set(values.filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0,
  ))];
}

function requestedProviderFilters(opts: LimitsCommandOpts): Set<string> {
  return new Set(LIMITS_PROVIDER_FILTERS
    .map(({ option }) => option.slice(2))
    .filter((provider) => opts[provider as keyof LimitsCommandOpts] === true));
}

export async function resolveConfiguredAuthenticatedProviders(
  config: ResolvedConfig,
  opts: LimitsCommandOpts,
  authProbe: (provider: string) => Promise<AuthProbeResult>,
): Promise<string[]> {
  const requested = requestedProviderFilters(opts);
  const configured = configuredProviders(config)
    .filter((provider) => requested.size === 0 || requested.has(provider));
  const states = await Promise.all(configured.map(async (provider) => ({
    provider,
    auth: await authProbe(provider),
  })));
  return states
    .filter(({ auth }) => auth.authenticated === true || auth.state === 'logged-in')
    .map(({ provider }) => provider);
}

interface ProviderLimitReport {
  readonly provider: string;
  readonly result: SubscriptionLimitResult | null;
}

function providerRows(report: ProviderLimitReport, lang: string): string[][] {
  if (report.result === null || report.result.unavailable) {
    return [[report.provider, getMessage('cli.batch.limits.unavailable', lang), getMessage('limits.no_reset', lang)]];
  }
  const result = report.result;
  const rows = [
    [report.provider, `${windowLabel('session', lang)}: ${result.sessionPct}%`, formatResetAt(result.sessionResetAt, lang)],
    [report.provider, `${windowLabel('week (all models)', lang)}: ${result.weekAllPct}%`, formatResetAt(result.weekAllResetAt, lang)],
  ];
  if (result.weekFablePct !== undefined) {
    rows.push([report.provider, `${windowLabel('week (Fable)', lang)}: ${result.weekFablePct}%`, formatResetAt(result.weekAllResetAt, lang)]);
  }
  return rows;
}

export async function runLimitsCommand(
  opts: LimitsCommandOpts,
  probeOpts: ProbeSubscriptionLimitsOptions = {},
  dependencies: LimitsCommandDependencies = {},
): Promise<void> {
  const root = resolveProjectRoot();
  const lang = getLangFromConfig(root);
  const gateConfig = readLimitGateConfig(root);
  const loadEffectiveConfig = dependencies.loadEffectiveConfig ?? ((projectRoot) => loadConfig(projectRoot));
  const authProbe = dependencies.probeAuth ?? ((provider) => probeProviderAuth(provider));
  const effectiveConfig = await loadEffectiveConfig(root);
  const providers = await resolveConfiguredAuthenticatedProviders(effectiveConfig, opts, authProbe);
  const defaultUsageProvider = LIMITS_PROVIDER_FILTERS[0]?.option.slice(2);
  const usageProbes = dependencies.usageProbes ?? new Map<string, ProviderUsageProbe>(
    defaultUsageProvider === undefined
      ? []
      : [[defaultUsageProvider, () => probeSubscriptionLimits(probeOpts)]],
  );
  const reports = await Promise.all(providers.map(async (provider): Promise<ProviderLimitReport> => {
    const usageProbe = usageProbes.get(provider);
    return { provider, result: usageProbe === undefined ? null : await usageProbe() };
  }));
  const primaryReport = reports.find((report) => report.result !== null);
  const probe = primaryReport?.result ?? { unavailable: true, reason: 'usage authority unavailable', raw: '' };
  const gateResult = evaluateWindowedLimitGate(probe, gateConfig);

  if (opts.json) {
    const jsonOut: Record<string, unknown> = probe.unavailable
      ? { unavailable: true, reason: probe.reason, sessionPct: null }
      : {
        unavailable: false,
        sessionPct: probe.sessionPct,
        sessionResetAt: probe.sessionResetAt,
        weekAllPct: probe.weekAllPct,
        weekAllResetAt: probe.weekAllResetAt,
        ...(probe.weekFablePct !== undefined ? { weekFablePct: probe.weekFablePct } : {}),
      };
    jsonOut['providers'] = reports.map((report) => ({
      provider: report.provider,
      ...(report.result === null
        ? { unavailable: true, status: getMessage('cli.batch.limits.unavailable', lang) }
        : report.result),
    }));
    jsonOut['verdict'] = gateResult.verdict;
    jsonOut['gate'] = {
      enabled: gateConfig.enabled ?? false,
      session_max_pct: gateConfig.session_max_pct ?? null,
      weekly_max_pct: gateConfig.weekly_max_pct ?? null,
    };
    print(JSON.stringify(jsonOut, null, 2));
    if (gateResult.verdict === 'block') process.exitCode = 1;
    return;
  }

  print(getMessage('limits.header', lang));

  if (reports.length > 0) {
    const headers = [
      'Provider',
      getMessage('limits.col_usage', lang),
      getMessage('limits.col_resets', lang),
    ];
    print(formatTable(headers, reports.flatMap((report) => providerRows(report, lang))));
  }

  if (probe.unavailable) {
    print(getMessage('limits.unavailable', lang, { reason: probe.reason }));
    print(getMessage('limits.verdict_unknown', lang));
    print(gateConfig.enabled ? getMessage('limits.gate_enabled', lang) : getMessage('limits.gate_disabled', lang));
    return;
  }

  const headers = [
    getMessage('limits.col_window', lang),
    getMessage('limits.col_usage', lang),
    getMessage('limits.col_resets', lang),
  ];
  const rows: string[][] = [
    [windowLabel('session', lang), `${probe.sessionPct}%`, formatResetAt(probe.sessionResetAt, lang)],
    [windowLabel('week (all models)', lang), `${probe.weekAllPct}%`, formatResetAt(probe.weekAllResetAt, lang)],
  ];
  if (probe.weekFablePct !== undefined) {
    rows.push([windowLabel('week (Fable)', lang), `${probe.weekFablePct}%`, formatResetAt(probe.weekAllResetAt, lang)]);
  }
  print(formatTable(headers, rows));

  if (gateResult.verdict === 'block') {
    print(getMessage('limits.verdict_block', lang, {
      window: windowLabel(gateResult.window ?? '', lang),
      pct: String(gateResult.pct ?? ''),
      reset: formatResetAt(gateResult.resetAt, lang),
    }));
    process.exitCode = 1;
  } else if (gateResult.verdict === 'warn') {
    print(getMessage('limits.verdict_warn', lang, {
      window: windowLabel(gateResult.window ?? '', lang),
      pct: String(gateResult.pct ?? ''),
    }));
  } else {
    print(getMessage('limits.verdict_ok', lang));
  }

  print(gateConfig.enabled ? getMessage('limits.gate_enabled', lang) : getMessage('limits.gate_disabled', lang));
}

export function registerLimits(program: Command): void {
  const command = program
    .command('limits')
    .description(getMessage('cli.limits.desc', getLanguage(undefined)))
    .option('--json', getMessage('cli.governance.opt.json', getLanguage(undefined)));
  for (const filter of LIMITS_PROVIDER_FILTERS) {
    command.option(filter.option, getMessage(filter.helpKey, getLanguage(undefined)));
  }
  command
    .action(async (opts: LimitsCommandOpts) => {
      await runLimitsCommand(opts);
    });
}
