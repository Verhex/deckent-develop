import { readFileSync, existsSync, readdirSync, statSync, mkdirSync, chmodSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { platform, totalmem } from 'node:os';
import { spawn as nodeSpawn } from 'node:child_process';
import type { Command } from 'commander';
import { planInstall } from '../../core/provisioner.js';
import type { DoctorResult, SystemProfile } from '../../core/types.js';
import type { DetectedProvider, ProviderAvailabilityDetail } from '../../core/provider.js';
import type { HealthCheckResult } from '../../orchestra/connector.js';
import {
  DECKENT_DIR, BRAIN_DIR,
  LOCKS_DIR,
  PROJECT_CONFIG_PATH, TASKS_DIR,
} from '../../core/constants.js';
import { migrateConfig } from '../../core/config-migration.js';
import { createDefaultConfig } from '../../core/config.js';
import { getSystemProfile } from '../../core/system-profile.js';
import { detectHostMemory } from '../../core/host-detector.js';
import { resolveAutoMaxWorkers } from '../../orchestra/spawn-coordinator.js';
import { detectSubscription } from '../../core/subscription.js';
import { print, formatDoctorResult, formatCIHealthSection } from '../helpers/output.js';
import type { CIBaseline, CIReport } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getMessage } from '../helpers/messages.js';
import { detectAvailableProviders, formatDetectedProviders } from '../../core/provider.js';
import { probeProviderAuth, type AuthProbeResult, type AuthProbeState } from '../../core/provider-auth-probe.js';
import {
  checkWorkerImage,
  type WorkerImageReport,
  type SpawnImpl,
} from '../../core/worker-image-check.js';
import {
  DEFAULT_WORKER_MEMORY_LIMIT,
  DEFAULT_WORKER_MEMORY_SWAP,
  parseMemoryString,
} from '../../orchestra/spawn-backend-docker.js';
import { promptConfirm } from '../helpers/prompt.js';
import {
  runProviderDiagnostics,
  checkDaemonHygiene,
  runPreFlightHealthCheck,
  checkPlatform,
  checkTmux,
  checkClaude,
  checkGitignore,
  checkWritePermissions,
  checkDeckSecurity,
  checkDocker,
  runDoctorChecks,
  getMemoryEntryCount,
  type PreFlightResult,
  type PreFlightCheckResult,
  type DoctorCheck,
} from './doctor-checks.js';
import { detectEnvironment } from '../../core/environment.js';
import { loadDeckSecrets, validateDeckFile, KNOWN_DECK_KEYS } from '../../core/deck-file.js';
import { getLangFromConfig } from '../helpers/config-reader.js';
import { runVocabularyDoctor, type VocabularyDoctorReport } from '../../core/routing3/vocabulary-doctor.js';

export function isRunningInWSL(): boolean {
  // Check WSL environment variable (set by WSL2 interop)
  if (process.env['WSL_DISTRO_NAME'] !== undefined || process.env['WSL_INTEROP'] !== undefined) {
    return true;
  }
  // Check /proc/version for "microsoft" signature (WSL1 and WSL2)
  try {
    const procVersion = readFileSync('/proc/version', 'utf-8');
    return procVersion.toLowerCase().includes('microsoft');
  } catch {
    // /proc/version not readable — not Linux/WSL
    return false;
  }
}

// checkPlatform: canonical definition lives in doctor-checks.ts (born-651,
// task 412-003 — was a live twin with its own body; see the runDoctorChecks
// re-export block below for the dedup rationale). Imported above, re-exported
// there to preserve this module's existing public surface.

// ─── Platform Profile Report (ONB-2-DILIM-3, Sprint 368 — 368-002) ───────────
//
// `checkPlatform` above answers a single pass/fail question. This section adds
// a richer, HONEST profile: process.platform + WSL detection, plus — for
// win32 — an explicit list of checks whose behavior is ADAPTED on this
// platform (Law #2: never silently skip a check without saying so). Grounded
// in real code, not speculative: `checkTmux` already treats win32 as
// "not required" unconditionally; Windows ACLs are not POSIX mode bits (a
// chmod-based restriction elsewhere in this file is not enforced equivalently);
// and backslash path separators can make literal path-string comparisons
// (e.g. .gitignore matching) behave differently even though node:path
// normalizes most internal usage.

export interface PlatformAdaptedCheck {
  name: string;
  note: string;
}

export interface PlatformProfileReport {
  platform: NodeJS.Platform;
  isWSL: boolean;
  label: string;
  adaptedChecks: PlatformAdaptedCheck[];
}

function buildWin32AdaptedChecks(lang: string): PlatformAdaptedCheck[] {
  return [
    { name: 'tmux', note: getMessage('doctor.platform_adapt_tmux', lang) },
    { name: 'Write Permissions', note: getMessage('doctor.platform_adapt_permissions', lang) },
    { name: 'Path Separators', note: getMessage('doctor.platform_adapt_paths', lang) },
  ];
}

/**
 * Build an honest platform profile: WSL/linux/win32 detection, localized label,
 * and — for win32 — the explicit adapted-check disclosure above. Pure aside
 * from `platform()`/`isRunningInWSL()` (both already used by `checkPlatform`).
 */
export function buildPlatformProfileReport(lang: string = 'en'): PlatformProfileReport {
  const currentPlatform = platform();
  if (currentPlatform === 'win32') {
    return {
      platform: currentPlatform,
      isWSL: false,
      label: getMessage('doctor.platform_label_win32_native', lang),
      adaptedChecks: buildWin32AdaptedChecks(lang),
    };
  }
  if (currentPlatform === 'linux') {
    const inWSL = isRunningInWSL();
    return {
      platform: currentPlatform,
      isWSL: inWSL,
      label: inWSL ? getMessage('doctor.platform_label_wsl', lang) : getMessage('doctor.platform_label_linux', lang),
      adaptedChecks: [],
    };
  }
  if (currentPlatform === 'darwin') {
    return {
      platform: currentPlatform,
      isWSL: false,
      label: getMessage('doctor.platform_label_darwin', lang),
      adaptedChecks: [],
    };
  }
  return {
    platform: currentPlatform,
    isWSL: false,
    label: getMessage('doctor.platform_label_untested', lang, { platform: currentPlatform }),
    adaptedChecks: [],
  };
}

/** Render the platform profile: header + platform/label line + (win32-only) adapted-check disclosure. */
export function formatPlatformProfileLines(report: PlatformProfileReport, lang: string = 'en'): string[] {
  const lines: string[] = [getMessage('doctor.platform_profile_header', lang)];
  lines.push(`  ${getMessage('doctor.platform_profile_line', lang, { platform: report.platform, label: report.label })}`);
  if (report.adaptedChecks.length > 0) {
    lines.push(`  ${getMessage('doctor.platform_profile_adapted_header', lang)}`);
    for (const c of report.adaptedChecks) {
      lines.push(`    - ${c.name}: ${c.note}`);
    }
  }
  return lines;
}

// checkNode / checkGit: canonical bodies live in doctor-checks.ts only (not
// exported by this module before the dedup either, so no re-export needed).
// checkTmux / checkClaude: canonical bodies live in doctor-checks.ts
// (born-651, task 412-003); imported above, re-exported below.

// checkWorkspace / checkBrainDir / checkDirectives / checkBrainBudget /
// checkDebt / checkStaleLocks: canonical bodies live in doctor-checks.ts only
// (none were exported by this module before the dedup, so no re-export is
// needed — see the runDoctorChecks re-export block below for the rationale).
// getMemoryEntryCount is imported from doctor-checks.ts above (used below by
// the human-summary formatter).

/**
 * Read the last sprint ID from .deckent/config.json.
 * Returns e.g. "sprint-039" or null if not found.
 */
export function getLastSprintId(root: string): string | null {
  try {
    const configPath = join(root, PROJECT_CONFIG_PATH);
    if (!existsSync(configPath)) return null;
    const config = JSON.parse(readFileSync(configPath, 'utf-8')) as { last_sprint_id?: string };
    return config.last_sprint_id ?? null;
  } catch {
    return null;
  }
}

// DB-first debt counting — imported from helpers/debt-counter.ts (Sprint 145 T-009)
import { countDebtItems, countOpenDebtItems } from '../helpers/debt-counter.js';
export { countDebtItems, countOpenDebtItems };

/**
 * Read CI baseline from .deckent/ci-baseline.json.
 */
export function readCIBaseline(root: string): CIBaseline | null {
  const baselinePath = join(root, '.deckent', 'ci-baseline.json');
  if (!existsSync(baselinePath)) return null;
  try {
    return JSON.parse(readFileSync(baselinePath, 'utf-8')) as CIBaseline;
  } catch {
    return null;
  }
}

/**
 * Read latest CI report from .brain/ci-report-sprint-{id}.json.
 * If sprintId is provided, reads that specific report first.
 */
export function readLatestCIReport(root: string, sprintId?: string): CIReport | null {
  if (sprintId) {
    const reportPath = join(root, BRAIN_DIR, `ci-report-${sprintId}.json`);
    if (existsSync(reportPath)) {
      try {
        return JSON.parse(readFileSync(reportPath, 'utf-8')) as CIReport;
      } catch { /* fall through */ }
    }
  }
  const reports = readAllCIReports(root, 1);
  return reports[0] ?? null;
}

/**
 * Read last N CI reports from .brain/ci-report-*.json, sorted newest first.
 */
export function readAllCIReports(root: string, count = 5): CIReport[] {
  const brainPath = join(root, BRAIN_DIR);
  if (!existsSync(brainPath)) return [];
  try {
    const files = readdirSync(brainPath)
      .filter(f => f.startsWith('ci-report-') && f.endsWith('.json'))
      .sort()
      .reverse()
      .slice(0, count);
    const reports: CIReport[] = [];
    for (const f of files) {
      try {
        const report = JSON.parse(readFileSync(join(brainPath, f), 'utf-8')) as CIReport;
        reports.push(report);
      } catch { /* skip malformed */ }
    }
    return reports;
  } catch {
    return [];
  }
}

export interface HumanDoctorInput {
  result: DoctorResult;
  providers: DetectedProvider[];
  brainLines: number;
  brainBudget: number;
  lastSprintId: string | null;
  debtItems: { total: number; critical: number };
  projectRoot?: string;
  /** Optional: health check results from Connector. When provided, replaces formatProviderHealthSection. */
  connectorHealthResults?: HealthCheckResult[];
  /** Optional: CI baseline from .deckent/ci-baseline.json */
  ciBaseline?: CIBaseline;
  /** Optional: CI reports from .brain/ci-report-*.json (newest first) */
  ciReports?: CIReport[];
  /** Optional (PSL-6, Task 270-006): provider-name → real auth-probe result. */
  authProbes?: Record<string, AuthProbeResult>;
  /** Optional (F1-IMG, Task 270-008): worker docker image readiness report. */
  workerImage?: WorkerImageReport;
  /** Optional (Sprint 271, Task 271-006): worker resource limits + ceiling info. */
  workerResources?: WorkerResourcesInfo;
  /** Optional UI language for probe diagnostics (en|tr). Defaults to 'en'. */
  lang?: string;
  /**
   * Optional (B-ZOMBIE, Task 332-006): pre-rendered, i18n'd advisory daemon-hygiene
   * lines (a stale-daemon list + kill hint, or a clean PASS) produced by
   * {@link checkDaemonHygiene}. Rendered verbatim. Absent → the section is omitted
   * (no regression for existing callers).
   */
  daemonHygieneLines?: string[];
  /** Optional (ONB-2-DILIM-3, Task 368-002): honest WSL/win32-native platform profile. */
  platformProfile?: PlatformProfileReport;
  /** Optional (ONB-2-DILIM-3, Task 368-002): config-based (env + .deck) auth state, no network. */
  authStateReport?: AuthStateResult[];
  /** Optional (Sprint 445, Task 445-021): routing3 vocabulary health report (layer shadowing, dead pathPatterns, duplicate aliases, missing descriptions). */
  vocabularyReport?: VocabularyDoctorReport;
}

/**
 * Compute a tiered memory health label based on usage percentage.
 */
export function getMemoryHealthLabel(pct: number): string {
  if (pct > 100) return 'OVER BUDGET';
  if (pct >= 80) return 'high';
  if (pct >= 50) return 'moderate';
  return 'healthy';
}

/**
 * Compute a provider summary: "N/M providers ready"
 */
export function getProviderSummary(providers: DetectedProvider[]): string {
  const ready = providers.filter(p => p.available).length;
  const total = providers.length;
  return `${ready}/${total} providers ready`;
}

/**
 * Compute overall readiness assessment.
 */
export function getReadinessLabel(result: DoctorResult, brainLines: number, brainBudget: number): string {
  const failedRequired = result.checks.filter(c => c.required && !c.passed);
  if (failedRequired.length > 0) return 'NOT READY';
  if (brainLines > brainBudget) return 'READY (with warnings)';
  const failedOptional = result.checks.filter(c => !c.required && !c.passed);
  if (failedOptional.length > 0) return 'READY (with warnings)';
  return 'READY';
}

/**
 * Provider-specific actionable hint shown when binary is present but auth is missing.
 * Used by the `deckent doctor --providers` 3-state output.
 */
/**
 * Sprint 192 Task 192-007: Run provider diagnostics for Claude/Codex/Gemini AND
 * Ollama. The base `runProviderDiagnostics` in `doctor-checks.ts` only covers
 * the 3 cloud CLI providers; this wrapper additionally probes the local Ollama
 * server so `deckent doctor --providers` reports all four providers in one shot.
 *
 * Ollama probe is cheap (HTTP ping with 3s timeout) and never throws.
 */
export async function runProviderDiagnosticsWithOllama(root: string): Promise<ProviderAvailabilityDetail[]> {
  const base = await runProviderDiagnostics(root);
  try {
    const { createOllamaAdapter } = await import('../../providers/ollama.js');
    const ollama = createOllamaAdapter(root);
    const ollamaDiag = await ollama.diagnoseAvailability();
    return [...base, ollamaDiag];
  } catch {
    // Lazy import / probe failure should never break the doctor output.
    return base;
  }
}

export function getProviderPartialHint(name: string): string {
  switch (name) {
    case 'codex': return 'set OPENAI_API_KEY';
    case 'gemini': return 'set GOOGLE_API_KEY';
    case 'claude': return 'run `claude login`';
    case 'ollama': return 'pull a model: `ollama pull qwen2.5-coder:7b`';
    default: return 'configure authentication';
  }
}

/**
 * Doctor's canonical tri-state status marker — single source of truth for the
 * `[PASS]`/`[WARN]`/`[FAIL]` ASCII vocabulary (born-557, DOCTOR-ICON-CONSOLIDATE).
 * Every doctor.ts section that renders a pass/warn/fail marker should call this
 * instead of hand-rolling its own ternary, so the visual vocabulary can never
 * drift again across sections rendered in the same `deckent doctor` invocation.
 */
export function doctorStatusIcon(state: 'pass' | 'warn' | 'fail'): string {
  switch (state) {
    case 'pass': return '[PASS]';
    case 'warn': return '[WARN]';
    case 'fail': return '[FAIL]';
  }
}

/**
 * Format provider diagnostics with [PASS] / [WARN] / [FAIL] markers and
 * actionable messages (born-557: migrated off the ✓/⚠/✗ Unicode symbols onto
 * the canonical {@link doctorStatusIcon} ASCII vocabulary shared with
 * formatConnectorHealthLines/formatWorkerImageLines/the --pre-flight output).
 *
 * Output shape:
 *   `[PASS] Claude (ready) — Claude CLI 1.0.45`
 *   `[WARN] Codex (binary OK, auth missing — set OPENAI_API_KEY)`
 *   `[FAIL] Gemini (binary not found)`
 *
 * Complements (does NOT replace) `formatProviderDiagnostics()` in core/provider.ts
 * which keeps the legacy `[OK]/[PARTIAL]/[MISSING]` bracket markers for callers
 * that depend on the older format.
 */
export function formatProviderDiagnosticsActionable(
  details: ProviderAvailabilityDetail[],
): string {
  const lines: string[] = ['Provider Diagnostics:'];
  for (const d of details) {
    const symbol = doctorStatusIcon(d.available ? 'pass' : d.partial ? 'warn' : 'fail');
    const label = capitalize(d.name);
    let stateLabel: string;
    if (d.available) {
      // Ollama is an HTTP server, not a CLI — label its version line accordingly.
      const versionRole = d.name === 'ollama' ? 'server' : 'CLI';
      const versionSuffix = d.version ? ` — ${label} ${versionRole} ${d.version}` : '';
      stateLabel = `(ready)${versionSuffix}`;
    } else if (d.partial) {
      const hint = getProviderPartialHint(d.name);
      // Sprint 192 Task 192-007: Ollama partial = server reachable, no models pulled.
      // Other providers: binary OK, auth missing. Tailor the label so it reads correctly.
      const partialReason = d.name === 'ollama' ? 'server reachable, no models' : 'binary OK, auth missing';
      stateLabel = `(${partialReason} — ${hint})`;
    } else {
      // Ollama has no CLI binary — `false` ready state means the local server is unreachable.
      stateLabel = d.name === 'ollama' ? '(server not reachable)' : '(binary not found)';
    }
    lines.push(`  ${symbol} ${label} ${stateLabel}`);
    if (d.binaryPath && d.available) {
      lines.push(`        path: ${d.binaryPath}`);
    }
    for (const hint of d.hints) {
      lines.push(`        hint: ${hint}`);
    }
  }
  return lines.join('\n');
}

/**
 * Get CLI install hint for a missing provider.
 * Returns an install command suggestion string, or empty string if unknown.
 */
export function getProviderInstallHint(name: string): string {
  // Single source of truth: package mapping lives in provisioner.planInstall.
  if (name !== 'claude' && name !== 'codex' && name !== 'gemini') return '';
  const pkg = planInstall(name).args[2];
  return `install: npm i -g ${pkg}`;
}

/**
 * Build HealthCheckResult entries from DetectedProvider list.
 * Converts provider detection output to the Connector health format for display.
 */
export function buildConnectorHealthResults(providers: DetectedProvider[]): HealthCheckResult[] {
  return providers.map(p => ({
    provider: p.name,
    available: p.available,
    authStatus: (p.authMethod !== 'none' ? 'ok' : 'missing') as HealthCheckResult['authStatus'],
    cliVersion: p.version ?? null,
    error: null,
  }));
}

// ─── PSL-6 Auth Probe Wiring (Sprint 270, Task 270-006) ──────────────────────
//
// "CLI installed ≠ logged in." The detect* functions report `authMethod:'session'`
// for any provider whose `<cli> --version` works (GAP-4). probeProviderAuth (Task
// 270-005) checks the REAL session state; this wiring surfaces it in the doctor
// Provider Health section.

/** Providers probeProviderAuth understands — anything else is left unprobed. */
const AUTH_PROBE_PROVIDERS = new Set(['claude', 'codex', 'gemini']);
/** Short per-probe timeout so `deckent doctor` never stalls on a hung CLI. */
const DOCTOR_AUTH_PROBE_TIMEOUT_MS = 2_000;

/**
 * Run the auth probe for every AVAILABLE provider the probe understands, in
 * PARALLEL with a short timeout. Never throws — a failing probe degrades to
 * 'unknown' (which maps to existing behavior, no regression). `probeFn` is
 * injectable so the wiring can be tested hermetically (no real fs/spawn).
 *
 * @returns provider-name → {@link AuthProbeResult} (only for probed providers).
 */
export async function runAuthProbes(
  providers: DetectedProvider[],
  probeFn: typeof probeProviderAuth = probeProviderAuth,
  timeoutMs: number = DOCTOR_AUTH_PROBE_TIMEOUT_MS,
): Promise<Record<string, AuthProbeResult>> {
  const targets = providers.filter(p => p.available && AUTH_PROBE_PROVIDERS.has(p.name));
  const entries = await Promise.all(
    targets.map(async (p): Promise<readonly [string, AuthProbeResult]> => {
      try {
        return [p.name, await probeFn(p.name, { timeoutMs })] as const;
      } catch {
        return [p.name, { state: 'unknown', detail: 'auth probe failed' }] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}

/** The single command that starts an interactive login for a provider. */
function getProviderLoginCmd(name: string): string {
  switch (name) {
    case 'claude': return 'claude login';
    case 'codex': return 'codex login';
    case 'gemini': return 'gemini';
    default: return `${name} login`;
  }
}

/**
 * Localized "CLI present but NOT logged in" diagnostic (EN default, TR provided).
 * Local i18n: messages.ts is outside this task's write-scope (Task 270-008/014);
 * these two strings live here and can be centralized later.
 */
function authProbeLoggedOutLine(name: string, lang: string): string {
  const cmd = getProviderLoginCmd(name);
  return lang === 'tr'
    ? `CLI mevcut ama oturum AÇILMAMIŞ — çalıştırın: ${cmd}`
    : `CLI present but NOT logged in — run: ${cmd}`;
}

// ─── Config-Based Auth State Probe (ONB-2-DILIM-3, Sprint 368 — 368-002) ─────
//
// Distinct from `probeProviderAuth`/PSL-6 above (a REAL session probe: reads
// provider credential files and, for codex, spawns a local CLI subprocess).
// This probe answers a narrower, cheaper question — "did the user configure a
// credential via deckent's OWN config channels (env var or the local `.deck`
// file, via the existing `loadDeckSecrets`)" — no provider credentials file,
// no CLI subprocess, no network, no /login flow.

export type AuthStateVerdict = 'connected' | 'missing' | 'unknown';

/**
 * born-203 (ONB-2) — which config channel produced `state`. 'none' when
 * state is 'missing'/'unknown' (no channel supplied a credential).
 */
export type AuthStateSource = 'env' | 'deck' | 'none';

export interface AuthStateResult {
  provider: string;
  state: AuthStateVerdict;
  /** born-203 (ONB-2): which channel produced `state` — deepens the bare verdict with its origin. Optional so pre-existing bare `{provider,state}` fixtures (connect.ts and its tests) keep compiling. */
  source?: AuthStateSource;
  /**
   * born-203 (ONB-2): the REAL session probe (PSL-6 `probeProviderAuth`) state for
   * this provider, when the caller supplies `authProbes` to buildAuthStateReport.
   * Absent when no probe data was passed — existing callers (e.g. `deckent connect`)
   * that never pass probes keep getting the original bare 3-state shape.
   */
  sessionState?: AuthProbeState;
  /**
   * born-203 (ONB-2): true when the cheap config-based verdict and the REAL session
   * probe disagree in a way worth flagging (e.g. an env/.deck key is set but the
   * real session is logged-out, or vice versa) — surfaces silent auth drift instead
   * of hiding it. Undefined when no probe was supplied, or when the probe itself
   * could not tell ('unknown' — never guessed, Law #2).
   */
  conflict?: boolean;
}

/** Providers this probe understands — matches AUTH_PROBE_PROVIDERS above. */
const AUTH_STATE_PROVIDERS: readonly string[] = ['claude', 'codex', 'gemini'];

/** Env var names checked per provider, in priority order (native SDK key first, deckent alias second). */
const AUTH_STATE_ENV_KEYS: Readonly<Record<string, readonly string[]>> = {
  claude: ['ANTHROPIC_API_KEY', 'DECKENT_CLAUDE_API_KEY'],
  codex: ['OPENAI_API_KEY', 'DECKENT_OPENAI_API_KEY'],
  gemini: ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'DECKENT_GOOGLE_API_KEY'],
};

/** The .deck key (one of KNOWN_DECK_KEYS) that maps to each provider. */
const AUTH_STATE_DECK_KEYS: Readonly<Record<string, string>> = {
  claude: 'DECKENT_CLAUDE_API_KEY',
  codex: 'DECKENT_OPENAI_API_KEY',
  gemini: 'DECKENT_GOOGLE_API_KEY',
};

/**
 * born-203 (ONB-2) — cross-reference the cheap config-based verdict against the
 * REAL session probe (PSL-6), when one was supplied. Returns `undefined` (no
 * verdict) rather than guessing whenever the real probe itself could not tell
 * ('unknown' or absent) — Law #2, never invent confidence.
 */
function computeAuthStateConflict(
  state: AuthStateVerdict,
  sessionState: AuthProbeState | undefined,
): boolean | undefined {
  if (sessionState === undefined || sessionState === 'unknown') return undefined;
  if (state === 'connected' && sessionState === 'logged-out') return true;
  if (state === 'missing' && sessionState === 'logged-in') return true;
  return false;
}

/**
 * Honest, network-free, subprocess-free auth-STATE probe (config + env only).
 * `providerNames` defaults to the 3 providers this probe understands;
 * 'unknown' for any name outside that set — never guessed (same convention as
 * `probeProviderAuth`'s unsupported-provider default above).
 *
 * `authProbes` (born-203, ONB-2) is an optional cross-reference against the REAL
 * PSL-6 session probe (`runAuthProbes`/`probeProviderAuth`) — when supplied, it
 * deepens the bare verdict with `source`/`sessionState`/`conflict` (see
 * {@link AuthStateResult}). Callers that omit it (e.g. `deckent connect`) get the
 * exact original 3-state shape — no behavior change.
 */
export function buildAuthStateReport(
  root: string,
  env: NodeJS.ProcessEnv = process.env,
  providerNames: readonly string[] = AUTH_STATE_PROVIDERS,
  authProbes?: Record<string, AuthProbeResult>,
): AuthStateResult[] {
  const deckSecrets = loadDeckSecrets(root);

  return providerNames.map((name): AuthStateResult => {
    let state: AuthStateVerdict;
    let source: AuthStateSource;

    const envKeys = AUTH_STATE_ENV_KEYS[name];
    const envConnected = (envKeys ?? []).some((key) => {
      const value = env[key];
      return typeof value === 'string' && value.trim().length > 0;
    });
    if (envConnected) {
      state = 'connected'; source = 'env';
    } else {
      const deckKey = AUTH_STATE_DECK_KEYS[name];
      if (!deckKey) {
        state = 'unknown'; source = 'none';
      } else {
        const deckValue = deckSecrets[deckKey];
        if (typeof deckValue === 'string' && deckValue.trim().length > 0) {
          state = 'connected'; source = 'deck';
        } else {
          state = 'missing'; source = 'none';
        }
      }
    }

    const sessionState = authProbes?.[name]?.state;
    return {
      provider: name,
      state,
      source,
      sessionState,
      conflict: computeAuthStateConflict(state, sessionState),
    };
  });
}

/**
 * Render the config-based auth-state report as one localized line per provider.
 * born-203 (ONB-2): when `source`/`conflict` are present (deepened report), a
 * provenance suffix and a conflict note are appended — bare fixtures (no
 * optional fields) render byte-identically to the original 3-state output.
 *
 * docImpact: the conflict note is plain English, not a getMessage() key —
 * src/cli/helpers/messages.ts is outside this task's write scope (same
 * precedent already set by connect.ts's own auth-state section). Flagged as
 * tech debt for a follow-up i18n task.
 */
export function formatAuthStateLines(results: AuthStateResult[], lang: string = 'en'): string[] {
  const lines: string[] = [getMessage('doctor.auth_state_header', lang)];
  for (const r of results) {
    const key = r.state === 'connected'
      ? 'doctor.auth_state_connected'
      : r.state === 'missing'
        ? 'doctor.auth_state_missing'
        : 'doctor.auth_state_unknown';
    const sourceSuffix = r.source && r.source !== 'none' ? ` (${r.source})` : '';
    lines.push(`  ${getMessage(key, lang, { provider: capitalize(r.provider) })}${sourceSuffix}`);
    if (r.conflict) {
      lines.push(`    ! ${capitalize(r.provider)}: config says "${r.state}" but the real session probe says "${r.sessionState}" — auth may be misconfigured.`);
    }
  }
  return lines;
}

// ─── F1-IMG Worker Image Readiness Wiring (Sprint 270, Task 270-008) ──────────
//
// Surfaces Task 270-007's checkWorkerImage report in the doctor output and, ONLY
// with the explicit `--fix-image` flag AND an interactive confirmation (ADR-063
// consent-based provisioning + ADR-011 readline), runs the suggested rebuild.
// Without the flag (or on decline) the build is NEVER run — default behavior is
// unchanged.

/**
 * Render the worker-image readiness report as `[PASS]`/`[WARN]` doctor lines.
 * `ready` → a single OK line; `missing`/`stale` → a WARN line plus the missing
 * CLIs / ca-certs and the real `docker build` command (suggestedBuildCmd). Pure,
 * i18n via getMessage (en+tr).
 */
export function formatWorkerImageLines(report: WorkerImageReport, lang: string = 'en'): string[] {
  const lines: string[] = ['Worker Image:'];
  if (report.state === 'ready') {
    lines.push(`  ${doctorStatusIcon('pass')} ${getMessage('doctor.image_ready', lang)}`);
    return lines;
  }
  lines.push(`  ${doctorStatusIcon('warn')} ${getMessage('doctor.image_not_ready', lang, { state: report.state })}`);
  if (report.missingClis.length > 0) {
    lines.push(`         ${getMessage('doctor.image_missing_clis', lang, { clis: report.missingClis.join(', ') })}`);
  }
  if (report.missingCaCerts) {
    lines.push(`         ${getMessage('doctor.image_missing_cacerts', lang)}`);
  }
  lines.push(`         ${getMessage('doctor.image_build_hint', lang, { cmd: report.suggestedBuildCmd })}`);
  lines.push(`         ${getMessage('doctor.image_fix_hint', lang)}`);
  return lines;
}

// ─── Worker Resources Section (Sprint 271, Task 271-006) ─────────────────────

/** Default max_workers when not set in config (matches --ram-experiment default). */
const DEFAULT_MAX_WORKERS = 6;

/** Structured info for the Worker Resources doctor section. */
export interface WorkerResourcesInfo {
  memoryLimit: string;
  memorySwap: string;
  maxWorkers: number;
  /** Total host RAM in bytes (injectable for tests, defaults to os.totalmem()). */
  hostTotalBytes: number;
  /** Optional resource_monitor block from config. */
  resourceMonitor?: { enabled: boolean; interval_ms?: number };
}

/** Format bytes as human-readable string (e.g. 8.0GB, 512MB). */
function formatBytesHuman(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)}GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)}MB`;
  return `${bytes}B`;
}

/**
 * Format the Worker Resources section for `deckent doctor` output.
 * Pure function — injectable for tests (hostTotalBytes in WorkerResourcesInfo).
 */
export function formatWorkerResourcesLines(info: WorkerResourcesInfo, lang: string = 'en'): string[] {
  const lines: string[] = [getMessage('doctor.resources_header', lang)];

  const limitBytes = parseMemoryString(info.memoryLimit) ?? parseMemoryString(DEFAULT_WORKER_MEMORY_LIMIT) ?? 0;
  const ramCeilingBytes = info.maxWorkers * limitBytes;
  const hostBytes = info.hostTotalBytes;
  const pct = hostBytes > 0 ? Math.round((ramCeilingBytes / hostBytes) * 100) : 0;

  lines.push(`  ${getMessage('doctor.resources_limits', lang, {
    limit: info.memoryLimit,
    swap: info.memorySwap,
    workers: String(info.maxWorkers),
  })}`);

  lines.push(`  ${getMessage('doctor.resources_ceiling', lang, {
    ceiling: formatBytesHuman(ramCeilingBytes),
    workers: String(info.maxWorkers),
    limit: info.memoryLimit,
    host: formatBytesHuman(hostBytes),
    pct: String(pct),
  })}`);

  if (hostBytes > 0 && pct > 60) {
    lines.push(`  ${getMessage('doctor.resources_warn_ceiling', lang, {
      ceiling: formatBytesHuman(ramCeilingBytes),
      pct: String(pct),
    })}`);
  }

  if (info.resourceMonitor) {
    if (info.resourceMonitor.enabled) {
      const interval = info.resourceMonitor.interval_ms ?? 5000;
      lines.push(`  ${getMessage('doctor.resources_monitor_on', lang, { interval: String(interval) })}`);
    } else {
      lines.push(`  ${getMessage('doctor.resources_monitor_off', lang)}`);
    }
  }

  return lines;
}

// ─── Vocabulary Doctor Section (Sprint 445, Task 445-021) ────────────────────
//
// Surfaces routing3/vocabulary-doctor.ts's read-only health report (layer
// shadowing, dead pathPatterns, duplicate aliases, domains missing a
// description) in `deckent doctor` output.
//
// docImpact: src/cli/helpers/messages.ts is outside this task's write scope
// (same constraint already documented at formatAuthStateLines above, born-203/
// Task 270-006/368-002 precedent). VOCABULARY_MESSAGES is a LOCAL en/tr table
// with the exact getMessage(key, lang, vars) contract (key -> {en,tr}, {var}
// interpolation) so promoting it into messages.ts's MESSAGES map later is a
// pure copy/paste, not a rewrite. Follow-up task should do that migration.

const VOCABULARY_MESSAGES: Readonly<Record<string, Readonly<{ en: string; tr: string }>>> = {
  'doctor.vocabulary_header': { en: 'Vocabulary:', tr: 'Sözlük (Vocabulary):' },
  'doctor.vocabulary_layer_counts': {
    en: '{count} domain(s) loaded (builtin {builtin}, org-overlay {org}, project {project})',
    tr: '{count} domain yüklendi (builtin {builtin}, org-overlay {org}, project {project})',
  },
  'doctor.vocabulary_clean': {
    en: 'No shadowing, dead patterns, duplicate aliases, or missing descriptions.',
    tr: "Shadowing, ölü pattern, yinelenen alias veya eksik açıklama yok.",
  },
  'doctor.vocabulary_shadowed_header': {
    en: '{count} shadowed domain(s):',
    tr: "{count} shadow'lanmış domain:",
  },
  'doctor.vocabulary_shadowed_line': {
    en: '{domainId}: {shadowedLayer} definition overridden by {shadowingLayer}',
    tr: '{domainId}: {shadowedLayer} tanımı {shadowingLayer} tarafından geçersiz kılındı',
  },
  'doctor.vocabulary_dead_pattern_header': {
    en: '{count} dead pathPattern(s) (match nothing under this project):',
    tr: '{count} ölü pathPattern (bu projede hiçbir şeyle eşleşmiyor):',
  },
  'doctor.vocabulary_dead_pattern_line': {
    en: '{domainId}: "{pattern}"',
    tr: '{domainId}: "{pattern}"',
  },
  'doctor.vocabulary_dup_alias_header': {
    en: '{count} duplicate alias(es) across domains:',
    tr: '{count} domain arası yinelenen alias:',
  },
  'doctor.vocabulary_dup_alias_line': {
    en: '"{alias}" used by: {domainIds}',
    tr: '"{alias}" şu domainlerce kullanılıyor: {domainIds}',
  },
  'doctor.vocabulary_no_description_header': {
    en: '{count} domain(s) with no description:',
    tr: '{count} açıklaması olmayan domain:',
  },
  'doctor.vocabulary_no_description_line': {
    en: '{domainId}',
    tr: '{domainId}',
  },
};

/**
 * Local getMessage-shaped lookup for the Vocabulary section (see docImpact
 * note above) — same key -> {en,tr} + {var} interpolation contract as
 * getMessage in src/cli/helpers/messages.ts, so it stays a drop-in once that
 * file is back in scope.
 */
function vocabMessage(key: string, lang: string, vars?: Record<string, string>): string {
  const entry = VOCABULARY_MESSAGES[key];
  if (!entry) return key;
  const normalizedLang = lang === 'tr' ? 'tr' : 'en';
  const template = entry[normalizedLang];
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, varName: string) => vars[varName] ?? `{${varName}}`);
}

/**
 * Render the Vocabulary doctor report: a PASS layer-count summary line, then
 * one WARN block per non-empty issue category (shadowed / dead pathPattern /
 * duplicate alias / missing description), or a single clean PASS line when
 * all four categories are empty.
 */
export function formatVocabularyDoctorLines(report: VocabularyDoctorReport, lang: string = 'en'): string[] {
  const lines: string[] = [vocabMessage('doctor.vocabulary_header', lang)];
  lines.push(`  ${doctorStatusIcon('pass')} ${vocabMessage('doctor.vocabulary_layer_counts', lang, {
    count: String(report.domainCount),
    builtin: String(report.layerCounts.builtin),
    org: String(report.layerCounts.orgOverlay),
    project: String(report.layerCounts.project),
  })}`);

  const hasIssues = report.shadowed.length > 0
    || report.deadPathPatterns.length > 0
    || report.duplicateAliases.length > 0
    || report.domainsMissingDescription.length > 0;

  if (!hasIssues) {
    lines.push(`  ${doctorStatusIcon('pass')} ${vocabMessage('doctor.vocabulary_clean', lang)}`);
    return lines;
  }

  if (report.shadowed.length > 0) {
    lines.push(`  ${doctorStatusIcon('warn')} ${vocabMessage('doctor.vocabulary_shadowed_header', lang, {
      count: String(report.shadowed.length),
    })}`);
    for (const s of report.shadowed) {
      lines.push(`    - ${vocabMessage('doctor.vocabulary_shadowed_line', lang, {
        domainId: s.domainId,
        shadowedLayer: s.shadowedLayer,
        shadowingLayer: s.shadowingLayer,
      })}`);
    }
  }

  if (report.deadPathPatterns.length > 0) {
    lines.push(`  ${doctorStatusIcon('warn')} ${vocabMessage('doctor.vocabulary_dead_pattern_header', lang, {
      count: String(report.deadPathPatterns.length),
    })}`);
    for (const d of report.deadPathPatterns) {
      lines.push(`    - ${vocabMessage('doctor.vocabulary_dead_pattern_line', lang, {
        domainId: d.domainId,
        pattern: d.pattern,
      })}`);
    }
  }

  if (report.duplicateAliases.length > 0) {
    lines.push(`  ${doctorStatusIcon('warn')} ${vocabMessage('doctor.vocabulary_dup_alias_header', lang, {
      count: String(report.duplicateAliases.length),
    })}`);
    for (const a of report.duplicateAliases) {
      lines.push(`    - ${vocabMessage('doctor.vocabulary_dup_alias_line', lang, {
        alias: a.alias,
        domainIds: a.domainIds.join(', '),
      })}`);
    }
  }

  if (report.domainsMissingDescription.length > 0) {
    lines.push(`  ${doctorStatusIcon('warn')} ${vocabMessage('doctor.vocabulary_no_description_header', lang, {
      count: String(report.domainsMissingDescription.length),
    })}`);
    for (const id of report.domainsMissingDescription) {
      lines.push(`    - ${vocabMessage('doctor.vocabulary_no_description_line', lang, { domainId: id })}`);
    }
  }

  return lines;
}

/** Outcome of {@link maybeFixWorkerImage} — used by callers/tests, never thrown. */
export type FixImageOutcome = 'disabled' | 'already-ready' | 'declined' | 'built' | 'build-failed';

export interface FixWorkerImageOptions {
  /** Was `--fix-image` passed? When false, NEVER prompts and NEVER builds. */
  enabled: boolean;
  /** Injectable confirm (defaults to interactive y/N via readline, default NO). */
  confirmFn?: (question: string) => Promise<boolean>;
  /** Injectable async spawn for the build (defaults to node:child_process spawn). */
  spawnImpl?: SpawnImpl;
  /** UI language for prompts/messages (en|tr). Defaults to 'en'. */
  lang?: string;
}

/**
 * Run the suggested `docker build` command, streaming its output to the terminal.
 * Async spawn (never spawnSync). Resolves with the process exit code (-1 on a
 * spawn error). The build string is built by us from known argv (no spaced args),
 * so whitespace-splitting into command + args is safe.
 */
function runImageBuild(buildCmd: string, spawnImpl?: SpawnImpl): Promise<number> {
  const parts = buildCmd.split(/\s+/).filter(Boolean);
  const command = parts[0] ?? 'docker';
  const args = parts.slice(1);
  const spawn: SpawnImpl = spawnImpl ?? ((c, a, o) => nodeSpawn(c, a, o));
  return new Promise((resolve) => {
    let settled = false;
    const finish = (code: number): void => {
      if (settled) return;
      settled = true;
      resolve(code);
    };
    const child = spawn(command, args, { shell: false });
    child.stdout?.on('data', (chunk: string | Buffer) => process.stdout.write(chunk));
    child.stderr?.on('data', (chunk: string | Buffer) => process.stderr.write(chunk));
    child.on('error', () => finish(-1));
    child.on('close', (code) => finish(code ?? -1));
  });
}

/**
 * Consent-based worker-image rebuild (ADR-063). Returns WITHOUT building unless
 * (a) `--fix-image` was passed (`enabled`), (b) the image is actually not ready,
 * AND (c) the user confirms interactively. On confirm, runs suggestedBuildCmd via
 * async spawn and streams its output. Default behavior (no flag) is a no-op.
 */
export async function maybeFixWorkerImage(
  report: WorkerImageReport,
  opts: FixWorkerImageOptions,
): Promise<FixImageOutcome> {
  const lang = opts.lang ?? 'en';
  if (!opts.enabled) return 'disabled';
  if (report.state === 'ready') return 'already-ready';

  const confirmFn = opts.confirmFn ?? ((q: string) => promptConfirm(q, false));
  const approved = await confirmFn(getMessage('doctor.image_fix_confirm', lang, { cmd: report.suggestedBuildCmd }));
  if (!approved) {
    print(getMessage('doctor.image_fix_declined', lang));
    return 'declined';
  }

  print(getMessage('doctor.image_fix_running', lang, { cmd: report.suggestedBuildCmd }));
  const code = await runImageBuild(report.suggestedBuildCmd, opts.spawnImpl);
  if (code === 0) {
    print(getMessage('doctor.image_fix_done', lang));
    return 'built';
  }
  print(getMessage('doctor.image_fix_failed', lang, { code: String(code) }));
  return 'build-failed';
}

/**
 * Format Connector health check results in [PASS]/[WARN]/[FAIL] style.
 * Includes provider CLI status, .deck file summary, and detected environment.
 *
 * When `authProbes` is supplied (PSL-6, Task 270-006), a provider whose CLI is
 * present but whose probe proves there is NO usable session is downgraded from
 * the legacy "session auth active" PASS line to an actionable [WARN]. A
 * 'logged-in'/'unknown'/absent probe leaves existing behavior unchanged.
 */
export function formatConnectorHealthLines(
  results: HealthCheckResult[],
  root: string,
  authProbes?: Record<string, AuthProbeResult>,
  lang: string = 'en',
): string[] {
  const lines: string[] = ['Provider Health:'];

  for (const r of results) {
    const versionStr = r.cliVersion ? ` ${r.cliVersion}` : '';
    const probe = authProbes?.[r.provider];
    if (r.available && probe?.state === 'logged-out') {
      // PSL-6: CLI installed but the probe proves no session — louder + actionable.
      lines.push(`  ${doctorStatusIcon('warn')} ${capitalize(r.provider)} CLI${versionStr} — ${authProbeLoggedOutLine(r.provider, lang)}`);
    } else if (r.available && r.authStatus === 'ok') {
      const authLabel = r.provider === 'claude' ? 'session auth active' : 'API key configured';
      lines.push(`  ${doctorStatusIcon('pass')} ${capitalize(r.provider)} CLI${versionStr} — ${authLabel}`);
    } else if (!r.available) {
      const hint = getProviderInstallHint(r.provider);
      const msg = hint ? `not installed — ${hint}` : 'not available';
      lines.push(`  ${doctorStatusIcon('warn')} ${capitalize(r.provider)} CLI — ${msg}`);
    } else {
      // available but auth missing or expired
      lines.push(`  ${doctorStatusIcon('warn')} ${capitalize(r.provider)} CLI${versionStr} — auth missing`);
    }
  }

  // .deck status
  const deckStatus = getDeckFileStatus(root);
  const deckIcon = doctorStatusIcon(deckStatus.includes('not found') ? 'warn' : 'pass');
  lines.push(`  ${deckIcon} .deck file — ${deckStatus}`);

  // Environment detection
  const env = detectEnvironment();
  lines.push(`  ${doctorStatusIcon('pass')} Environment — ${env} detected`);

  return lines;
}

// ─── ONB-HONEST: doctor honest ready/missing/one-command-fix summary
// (Sprint 357, Task 357-014, MASTER-PLAN row 204) ──────────────────────────
//
// Presentation-only layer: maps the EXISTING DoctorCheck results (unchanged
// check logic) into a non-technical three-state summary — ready | missing |
// one-command-fix — plus a closing count line and a plain-language one-liner
// per not-ready check. All user-facing text is i18n'd via getMessage (en+tr).

export type DoctorHonestState = 'ready' | 'missing' | 'one-command-fix';

export interface DoctorHonestCheckSummary {
  name: string;
  state: DoctorHonestState;
  /** Plain-language one-line explanation. Empty for 'ready' checks. */
  explanation: string;
}

export interface DoctorHonestSummary {
  readyCount: number;
  /** Total NOT-ready checks (missing + one-command-fix combined). */
  missingCount: number;
  /** Subset of missingCount resolvable by `deckent doctor --fix`. */
  fixableCount: number;
  checks: DoctorHonestCheckSummary[];
  summaryLine: string;
}

/**
 * DoctorCheck names that `deckent doctor --fix` (planDoctorFixes' closed
 * mkdir/chmod/config-migrate/config-recreate/unlock whitelist,
 * DOCTOR_FIX_ACTION_KINDS) can actually resolve today. 'Workspace' (missing
 * .deckent/ dir -> mkdir action) and 'Locks' (stale lock files -> unlock
 * action, Task 367-006) map 1:1 onto an existing check — no other check
 * corresponds to a --fix action (chmod/config-migrate/config-recreate targets
 * have no dedicated named DoctorCheck), so this stays a narrow, explicit
 * allowlist rather than a guess from message text. Keeping it honest is the
 * entire point of this feature.
 */
const DOCTOR_FIX_CHECK_NAMES: ReadonlySet<string> = new Set(['Workspace', 'Locks']);

function classifyDoctorCheckState(check: DoctorCheck): DoctorHonestState {
  if (check.passed) return 'ready';
  return DOCTOR_FIX_CHECK_NAMES.has(check.name) ? 'one-command-fix' : 'missing';
}

/** Check name -> i18n key for a plain-language one-line explanation. */
const DOCTOR_HONEST_EXPLANATION_KEYS: Readonly<Record<string, string>> = {
  'Platform': 'doctor.honest_explain_platform',
  'Node.js': 'doctor.honest_explain_node',
  'git': 'doctor.honest_explain_git',
  'tmux': 'doctor.honest_explain_tmux',
  'Docker': 'doctor.honest_explain_docker',
  'Claude CLI': 'doctor.honest_explain_claude_cli',
  'Workspace': 'doctor.honest_explain_workspace',
  'Brain Dir': 'doctor.honest_explain_brain_dir',
  'Directives': 'doctor.honest_explain_directives',
  'Brain Budget': 'doctor.honest_explain_brain_budget',
  'Debt': 'doctor.honest_explain_debt',
  'Locks': 'doctor.honest_explain_locks',
  '.deck Security': 'doctor.honest_explain_deck_security',
  'Write Permissions': 'doctor.honest_explain_write_permissions',
  'Gitignore': 'doctor.honest_explain_gitignore',
};

/**
 * Plain-language one-liner for a not-ready check. Falls back to a generic,
 * still-i18n'd template for any check name not in the map above — new checks
 * added later never silently break this feature (EVERY ENVIRONMENT law).
 */
function getHonestExplanation(check: DoctorCheck, state: DoctorHonestState, lang: string): string {
  const key = DOCTOR_HONEST_EXPLANATION_KEYS[check.name];
  const base = key
    ? getMessage(key, lang)
    : getMessage('doctor.honest_explain_generic', lang, { name: check.name, message: check.message });
  return state === 'one-command-fix' ? base + getMessage('doctor.honest_fixable_suffix', lang) : base;
}

/**
 * Build the honest ready/missing/one-command-fix summary from doctor check
 * results. Pure function — does not read the filesystem or run checks.
 */
export function buildDoctorHonestSummary(checks: DoctorCheck[], lang: string = 'en'): DoctorHonestSummary {
  const perCheck: DoctorHonestCheckSummary[] = checks.map((check) => {
    const state = classifyDoctorCheckState(check);
    return {
      name: check.name,
      state,
      explanation: state === 'ready' ? '' : getHonestExplanation(check, state, lang),
    };
  });

  const readyCount = perCheck.filter(c => c.state === 'ready').length;
  const fixableCount = perCheck.filter(c => c.state === 'one-command-fix').length;
  const missingCount = perCheck.length - readyCount;

  let summaryLine: string;
  if (missingCount === 0) {
    summaryLine = getMessage('doctor.honest_all_ready', lang, { ready: String(readyCount) });
  } else if (fixableCount > 0) {
    summaryLine = getMessage('doctor.honest_summary_with_fix', lang, {
      ready: String(readyCount),
      missing: String(missingCount),
      fixable: String(fixableCount),
    });
  } else {
    summaryLine = getMessage('doctor.honest_summary_no_fix', lang, {
      ready: String(readyCount),
      missing: String(missingCount),
    });
  }

  return { readyCount, missingCount, fixableCount, checks: perCheck, summaryLine };
}

/** Render the honest summary block: header + closing count line + one line per not-ready check. */
export function formatDoctorHonestSummary(summary: DoctorHonestSummary, lang: string = 'en'): string[] {
  const lines: string[] = [getMessage('doctor.honest_header', lang), summary.summaryLine];
  for (const c of summary.checks) {
    if (c.state === 'ready') continue;
    lines.push(getMessage('doctor.honest_missing_line', lang, { name: c.name, explanation: c.explanation }));
  }
  return lines;
}

/**
 * Format a human-friendly doctor output.
 * Groups checks into System and Project sections, adds recommendations.
 */
export function formatHumanDoctor(input: HumanDoctorInput): string {
  const { result, providers, brainLines, brainBudget, lastSprintId, debtItems } = input;
  const lines: string[] = [];

  lines.push('Deckent Health Check');
  lines.push('');

  // --- Your System ---
  lines.push('Your System:');

  const systemCheckNames = ['Platform', 'Node.js', 'git', 'tmux', 'Claude CLI'];
  for (const check of result.checks) {
    if (systemCheckNames.includes(check.name)) {
      const icon = check.passed ? 'OK' : 'FAIL';
      lines.push(`  ${icon} ${check.name} \u2014 ${check.message}`);
    }
  }

  // Provider status
  for (const p of providers) {
    const version = p.version ? ` v${p.version}` : '';
    if (p.available) {
      const auth = p.authMethod === 'session' ? 'session auth' : p.authMethod === 'api_key' ? 'API key set' : '';
      const authLabel = auth ? ` (${auth})` : '';
      lines.push(`  OK ${capitalize(p.name)} CLI${version} \u2014 Ready${authLabel}`);
    } else {
      const hint = getProviderHint(p.name);
      // Use SKIP instead of FAIL for optional providers — avoids "FAIL + OK" confusion
      lines.push(`  SKIP ${capitalize(p.name)} \u2014 Not configured${hint}`);
    }
  }

  // Provider summary line
  lines.push(`  ${getProviderSummary(providers)}`);

  lines.push('');

  // --- Platform Profile (ONB-2-DILIM-3, Task 368-002) ---
  if (input.platformProfile) {
    lines.push(...formatPlatformProfileLines(input.platformProfile, input.lang ?? 'en'));
    lines.push('');
  }

  // --- Your Project ---
  lines.push('Your Project:');

  const projectCheckNames = ['Workspace', 'Brain Dir', 'Directives'];
  for (const check of result.checks) {
    if (projectCheckNames.includes(check.name)) {
      const icon = check.passed ? 'OK' : 'FAIL';
      lines.push(`  ${icon} ${check.name} \u2014 ${check.message}`);
    }
  }

  // Memory budget with tiered health
  const memPct = Math.round((brainLines / brainBudget) * 100);
  const memHealth = getMemoryHealthLabel(memPct);
  const memIcon = brainLines <= brainBudget ? 'OK' : 'FAIL';
  lines.push(`  ${memIcon} Memory: ${brainLines}/${brainBudget} lines (${memPct}% \u2014 ${memHealth})`);

  // Last sprint
  if (lastSprintId) {
    lines.push(`  OK Last sprint: ${lastSprintId} (completed)`);
  }

  // Debt
  if (debtItems.total > 0) {
    if (debtItems.critical > 0) {
      lines.push(`  Warning ${debtItems.critical} critical + ${debtItems.total - debtItems.critical} open debt items (run \`deckent status --debt\`)`);
    } else {
      lines.push(`  Warning ${debtItems.total} open debt items (run \`deckent status --debt\`)`);
    }
  }

  // Stale locks
  const lockCheck = result.checks.find(c => c.name === 'Locks');
  if (lockCheck && !lockCheck.passed) {
    lines.push(`  Warning ${lockCheck.message}`);
  }

  lines.push('');

  // --- System Health ---
  lines.push('System Health:');

  // Open debt count (use already-computed debtItems to avoid double-read)
  const openDebtCount = debtItems.total;
  if (openDebtCount > 0) {
    lines.push(`  Debt: ${openDebtCount} open item(s)${debtItems.critical > 0 ? ` (${debtItems.critical} critical)` : ''}`);
  } else {
    lines.push('  Debt: 0 open items');
  }

  // Sprint count from config
  if (lastSprintId) {
    const sprintNum = lastSprintId.replace('sprint-', '');
    lines.push(`  Sprints: ${sprintNum} completed (last: ${lastSprintId})`);
  } else {
    lines.push('  Sprints: none yet');
  }

  lines.push('');

  // --- CI Health ---
  const hasValidCIReports = input.ciReports && input.ciReports.length > 0 && input.ciReports.some(r => r.delta);
  const hasValidCIBaseline = input.ciBaseline?.baseline !== undefined;
  if (hasValidCIReports || hasValidCIBaseline) {
    const ciLines = formatCIHealthSection(input.ciReports ?? [], input.ciBaseline);
    lines.push(...ciLines);
    lines.push('');
  }

  // --- Provider Health ---
  if (input.projectRoot) {
    if (input.connectorHealthResults) {
      // Use Connector health format with [PASS]/[WARN]/[FAIL]
      const healthLines = formatConnectorHealthLines(
        input.connectorHealthResults,
        input.projectRoot,
        input.authProbes,
        input.lang ?? 'en',
      );
      lines.push(...healthLines);
    } else {
      // Fall back to legacy format
      const providerHealthLines = formatProviderHealthSection(providers, input.projectRoot);
      lines.push(...providerHealthLines);
    }
    lines.push('');
  }

  // --- Auth State (ONB-2-DILIM-3, Task 368-002) ---
  // Config-based (env + .deck), network-free — complements the Provider Health
  // section above (which surfaces the real-session PSL-6 probe).
  if (input.authStateReport) {
    lines.push(...formatAuthStateLines(input.authStateReport, input.lang ?? 'en'));
    lines.push('');
  }

  // --- Worker Image (F1-IMG, Task 270-008) ---
  // Only present when the docker backend is configured (the action gates it).
  if (input.workerImage) {
    lines.push(...formatWorkerImageLines(input.workerImage, input.lang ?? 'en'));
    lines.push('');
  }

  // --- Worker Resources (Sprint 271, Task 271-006) ---
  if (input.workerResources) {
    lines.push(...formatWorkerResourcesLines(input.workerResources, input.lang ?? 'en'));
    lines.push('');
  }

  // --- Vocabulary (Sprint 445, Task 445-021) ---
  if (input.vocabularyReport) {
    lines.push(...formatVocabularyDoctorLines(input.vocabularyReport, input.lang ?? 'en'));
    lines.push('');
  }

  // --- Daemon Hygiene (B-ZOMBIE, Task 332-006) ---
  // Advisory only: surfaces long-lived stale deckent daemons (+ a copy-paste kill
  // hint) or a clean PASS. Pre-rendered / i18n'd by checkDaemonHygiene; it NEVER
  // auto-kills, NEVER throws, and NEVER affects the readiness/exit-code computation.
  if (input.daemonHygieneLines && input.daemonHygieneLines.length > 0) {
    lines.push(...input.daemonHygieneLines);
    lines.push('');
  }

  // --- Readiness ---
  const readiness = getReadinessLabel(result, brainLines, brainBudget);
  lines.push(`Status: ${readiness}`);
  lines.push('');

  // --- Recommendation ---
  lines.push('Recommendation:');

  const failedRequired = result.checks.filter(c => c.required && !c.passed);
  if (failedRequired.length > 0) {
    lines.push(`  Fix ${failedRequired.length} required issue${failedRequired.length > 1 ? 's' : ''} before starting a sprint.`);
    for (const c of failedRequired) {
      lines.push(`  \u2192 ${c.name}: ${c.message}`);
    }
  } else {
    lines.push('  Everything looks good! You can start a new sprint with `deckent start`.');
  }

  // Tips based on missing providers
  const tips = getProviderTips(providers);
  for (const tip of tips) {
    lines.push(`  Tip: ${tip}`);
  }

  if (brainLines > brainBudget) {
    lines.push('  Tip: Run `deckent cleanup --decay` to reduce memory usage.');
  }

  // --- Honest Summary (ONB-HONEST, Task 357-014) ---
  lines.push('');
  const honestSummary = buildDoctorHonestSummary(result.checks, input.lang ?? 'en');
  lines.push(...formatDoctorHonestSummary(honestSummary, input.lang ?? 'en'));

  return lines.join('\n');
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function getProviderHint(name: string): string {
  switch (name) {
    case 'gemini': return ' (set GOOGLE_API_KEY to enable)';
    case 'codex': return ' (set OPENAI_API_KEY to enable)';
    case 'claude': return ' (install Claude CLI: npm i -g @anthropic-ai/claude-code)';
    default: return '';
  }
}

/**
 * Get .deck file status summary for doctor output.
 * Returns a human-readable string like: ".deck file found, 3/9 keys configured"
 */
export function getDeckFileStatus(root: string): string {
  const secrets = loadDeckSecrets(root);
  const totalKeys = KNOWN_DECK_KEYS.length;

  if (Object.keys(secrets).length === 0) {
    return '.deck file not found or empty';
  }

  const configuredCount = KNOWN_DECK_KEYS.filter(
    key => secrets[key] !== undefined && secrets[key] !== ''
  ).length;

  const validation = validateDeckFile(secrets);
  const validLabel = validation.valid ? '' : ' (has errors)';

  return `.deck file found, ${configuredCount}/${totalKeys} keys configured${validLabel}`;
}

/**
 * Format provider health section for human-friendly doctor output.
 */
export function formatProviderHealthSection(
  providers: DetectedProvider[],
  root: string,
): string[] {
  const lines: string[] = [];

  lines.push('Provider Health:');

  for (const p of providers) {
    const version = p.version ? ` v${p.version}` : '';
    if (p.available) {
      const authLabel = p.authMethod === 'session'
        ? 'session auth active'
        : p.authMethod === 'api_key'
          ? 'API key configured'
          : '';
      const authSuffix = authLabel ? ` — ${authLabel}` : '';
      lines.push(`  OK ${capitalize(p.name)} CLI${version}${authSuffix}`);
    } else {
      const hint = getProviderHint(p.name);
      lines.push(`  FAIL ${capitalize(p.name)} — not available${hint}`);
    }
  }

  // .deck status
  const deckStatus = getDeckFileStatus(root);
  const deckIcon = deckStatus.includes('not found') ? 'WARN' : 'OK';
  lines.push(`  ${deckIcon} ${deckStatus}`);

  // Environment detection
  const env = detectEnvironment();
  lines.push(`  OK Environment: ${env} detected`);

  return lines;
}

export function getProviderTips(providers: DetectedProvider[]): string[] {
  const tips: string[] = [];
  for (const p of providers) {
    if (!p.available) {
      switch (p.name) {
        case 'gemini':
          tips.push('Set GOOGLE_API_KEY to enable Gemini as a worker provider.');
          break;
        case 'codex':
          tips.push('Set OPENAI_API_KEY to enable Codex as a worker provider.');
          break;
        case 'claude':
          tips.push('Install Claude CLI (npm i -g @anthropic-ai/claude-code) to enable Claude as a provider.');
          break;
      }
    }
  }
  return tips;
}

export function formatSystemProfile(profile: SystemProfile, subscription?: string): string {
  const totalGB = (profile.totalMemMB / 1024).toFixed(1);
  const freeGB = (profile.freeMemMB / 1024).toFixed(1);
  const inner = 54;
  const top = `\u2554${'\u2550'.repeat(inner)}\u2557`;
  const bot = `\u255A${'\u2550'.repeat(inner)}\u255D`;
  const row = (content: string): string => {
    const padded = content.length >= inner - 2
      ? content.slice(0, inner - 2)
      : content + ' '.repeat(inner - 2 - content.length);
    return `\u2551 ${padded} \u2551`;
  };

  const lines = [
    top,
    row('System Profile'),
    row(`CPU: ${profile.cpuCores} cores  RAM: ${totalGB} GB (${freeGB} GB free)  Workers: ${profile.recommendedMaxWorkers}`),
  ];

  if (subscription !== undefined) {
    lines.push(row(`Subscription: ${subscription}`));
  }

  lines.push(bot);
  return lines.join('\n');
}

// DoctorCheck / checkPlatform / checkTmux / checkClaude / checkGitignore /
// checkWritePermissions / checkDeckSecurity / checkDocker / runDoctorChecks:
// canonical definitions live in doctor-checks.ts (born-651, task 412-003 —
// this module's runDoctorChecks used to build its own check-list from local
// function bodies that had drifted from doctor-checks.ts's sibling
// functions — e.g. checkDebt here was DB-first while doctor-checks.ts's was
// still parsing the removed .brain/DEBT.md; a check added only to
// doctor-checks.ts's runDoctorChecks never appeared in the real `deckent
// doctor` output, born-651/411-002). All divergent bodies were reconciled
// into doctor-checks.ts (keeping this module's live behavior unchanged) and
// this module now re-exports them to preserve its existing public surface
// for any external importer.
export type { DoctorCheck };
export {
  checkPlatform,
  checkTmux,
  checkClaude,
  checkGitignore,
  checkWritePermissions,
  checkDeckSecurity,
  checkDocker,
  runDoctorChecks,
};

// PreFlightCheckResult / PreFlightResult / runPreFlightHealthCheck: canonical
// definition lives in doctor-checks.ts (born-505, task 380-013 — was
// duplicated verbatim in both modules). Re-exported here to preserve this
// module's existing public surface for any external importer.
export type { PreFlightResult, PreFlightCheckResult };
export { runPreFlightHealthCheck };

// born-579 (task 390-004): scripts/ is not in package.json `files`, so an
// npm-installed consumer never has scripts/pre-flight-health-check.mjs on
// disk. runPreFlightHealthCheck() used to spawn it anyway, get an empty
// stdout on failure, and silently fall back to generic runDoctorChecks()
// results mislabeled as the extended pre-flight check. Report the missing
// capability honestly instead of substituting an unrelated check set. Dev
// checkouts (where the script exists) are unaffected — same delegation as
// before.
export function resolvePreFlightResult(root: string): PreFlightResult {
  const scriptPath = join(root, 'scripts', 'pre-flight-health-check.mjs');
  if (!existsSync(scriptPath)) {
    return {
      passed: true,
      abortSprint: false,
      checks: [{
        name: 'pre-flight-script',
        passed: false,
        required: false,
        message: 'Unavailable in this install mode: scripts/pre-flight-health-check.mjs is not published to the npm package. Run `deckent doctor --pre-flight` from a deckent development checkout for full coverage.',
      }],
    };
  }
  return runPreFlightHealthCheck(root);
}

export interface RamExperimentReport {
  hostGB: number;
  source: string;
  maxWorkers: number;
  workerMemGB: number;
  peakWorkerGB: number;
  hostOverheadGB: number;
  totalRequiredGB: number;
  verdict: 'Safe' | 'Risky' | 'Cannot determine';
  recommendation: string;
}

/** Parse worker_memory_limit config value ("2g", "512m", "1024k") to GB. Returns 2 for unknown. */
export function parseWorkerMemoryGB(limit: string | undefined): number {
  if (!limit) return 2;
  const m = limit.trim().match(/^(\d+(?:\.\d+)?)(g|gb|m|mb|k|kb)?$/i);
  if (!m) return 2;
  const val = parseFloat(m[1] ?? '2');
  const unit = (m[2] ?? 'g').toLowerCase();
  if (unit.startsWith('m')) return val / 1024;
  if (unit.startsWith('k')) return val / (1024 * 1024);
  return val;
}

/** Compute peak-RAM requirement and verdict for a given worker config. */
export function computeRamExperiment(
  hostGB: number,
  source: string,
  maxWorkers: number,
  workerMemGB: number,
): RamExperimentReport {
  const hostOverheadGB = 2;
  const peakWorkerGB = maxWorkers * workerMemGB;
  const totalRequiredGB = peakWorkerGB + hostOverheadGB;

  let verdict: RamExperimentReport['verdict'];
  let recommendation: string;

  if (hostGB <= 0) {
    verdict = 'Cannot determine';
    recommendation = 'Cannot determine host RAM — verify manually before running multi-worker sprint.';
  } else if (hostGB >= totalRequiredGB) {
    verdict = 'Safe';
    recommendation = `Host RAM (${hostGB} GB) ≥ required (${totalRequiredGB} GB). Config is safe.`;
  } else {
    verdict = 'Risky';
    const needed = Math.ceil(totalRequiredGB + 1);
    recommendation = `Host RAM (${hostGB} GB) < required (${totalRequiredGB} GB) — OOM risk. Recommend: set ~/.wslconfig memory=${needed}GB, restart WSL2.`;
  }

  return { hostGB, source, maxWorkers, workerMemGB, peakWorkerGB, hostOverheadGB, totalRequiredGB, verdict, recommendation };
}

/** Format a RamExperimentReport for human-readable CLI output. */
export function formatRamExperiment(report: RamExperimentReport): string {
  const symbol = report.verdict === 'Safe' ? '✓' : report.verdict === 'Risky' ? '⚠' : '?';
  const lines = [
    'RAM Experiment Report',
    `Host RAM: ${report.hostGB} GB (source=${report.source})`,
    `Current config: max_workers=${report.maxWorkers}, worker_memory_limit=${report.workerMemGB}g`,
    `Peak RAM need: ${report.peakWorkerGB} GB (workers) + ${report.hostOverheadGB} GB (host overhead) = ${report.totalRequiredGB} GB`,
    `Recommendation: ${symbol} ${report.verdict}`,
  ];
  if (report.verdict !== 'Safe') {
    lines.push(`  ${report.recommendation}`);
  }
  return lines.join('\n');
}

// ─── DOCTOR-FIX (Sprint 356 Task 356-006; enriched Sprint 367 Task 367-006) ──
//
// `deckent doctor --fix` — a CLOSED whitelist of safe, non-destructive repairs.
// Nothing risky (delete-of-live-data / docker / login) is ever eligible:
// planDoctorFixes() only ever emits the kinds below, and applyDoctorFixes()
// only ever executes those same kinds. Default is dry-run (list only);
// `--yes` (or the absence of `--dry-run`... `--dry-run` forces preview even
// if `--yes` is also passed) is required to actually apply. `unlock` is the
// one kind that deletes a file outright — but only a file already proven
// stale (idle past the same threshold `deckent doctor`'s own "Locks" check
// warns about), never a live/active lock.
//
// Every fix action carries an OPTIONAL `previousValue` — a concise summary of
// the pre-fix state, so the plan/apply report stays "reversible" (a human can
// see what existed before and restore it by hand). Optional (not required) so
// hand-built DoctorFixAction fixtures that predate this field keep compiling —
// see tests/cli/messages-round9-keys.test.ts, which pins formatDoctorFixLines'
// EN output byte-for-byte against bare fixtures with no previousValue and no
// extra call args.

/** Closed whitelist — the ONLY fix kinds `doctor --fix` may ever plan or apply. */
export const DOCTOR_FIX_ACTION_KINDS = ['mkdir', 'chmod', 'config-migrate', 'config-recreate', 'unlock'] as const;
export type DoctorFixActionKind = typeof DOCTOR_FIX_ACTION_KINDS[number];

export interface DoctorFixAction {
  kind: DoctorFixActionKind;
  /** Absolute path the action operates on. */
  target: string;
  /** Human-readable "what this will do" line, shown in the dry-run list. */
  description: string;
  /** Concise summary of the pre-fix state (reversible-report "before" value). */
  previousValue?: string;
}

export interface DoctorFixApplyResult {
  action: DoctorFixAction;
  applied: boolean;
  error?: string;
}

/** A failing doctor check that is NOT covered by any --fix action — honestly labeled "manual". */
export interface DoctorFixManualItem {
  name: string;
  message: string;
}

/** Owner-only read/write — matches ensureDeckShadowFile's mode in spawn-backend-docker.ts. */
const DECK_SHADOW_SAFE_MODE = 0o600;

/**
 * Same staleness window `checkStaleLocks()` already warns about (its own
 * default parameter). Kept in sync explicitly so the fix-plan and the
 * "Locks" doctor check agree on what counts as stale.
 */
const STALE_LOCK_THRESHOLD_MS = 300_000;

/**
 * Detect safe repairs WITHOUT mutating anything (read-only: existsSync/statSync/
 * migrateConfig dry-run). Call applyDoctorFixes() on the returned list to apply.
 *
 * `platformOverride` (born-203, ONB-2) is injectable for hermetic win32 simulation
 * in tests; production call sites omit it and get the real `platform()`.
 */
export function planDoctorFixes(root: string, platformOverride?: NodeJS.Platform): DoctorFixAction[] {
  const actions: DoctorFixAction[] = [];
  const currentPlatform = platformOverride ?? platform();

  const deckentPath = join(root, DECKENT_DIR);
  if (!existsSync(deckentPath)) {
    actions.push({
      kind: 'mkdir',
      target: deckentPath,
      description: `Create missing directory: ${DECKENT_DIR}/`,
      previousValue: 'not present',
    });
  }

  const tasksPath = join(root, TASKS_DIR);
  if (!existsSync(tasksPath)) {
    actions.push({
      kind: 'mkdir',
      target: tasksPath,
      description: `Create missing directory: ${TASKS_DIR}/`,
      previousValue: 'not present',
    });
  }

  // Stale .deck-shadow permission drift (e.g. a docker mount that changed the
  // host file's mode). chmod-only — never unlinked, deletion is out of scope.
  //
  // win32 (born-203, ONB-2): SKIPPED here on purpose. Windows has no POSIX
  // permission bits — Node synthesizes `stat().mode` from the read-only
  // attribute only, and `chmodSync` cannot express real owner-only (0600)
  // semantics on NTFS. Comparing that synthesized mode against
  // DECK_SHADOW_SAFE_MODE would either never converge (false positive on
  // every run) or "succeed" without actually restricting access — a silent,
  // dishonest fix (Law #2). getWindowsFixCaveats() surfaces this as an
  // honest manual item instead of a fake auto-fix.
  const shadowPath = join(tasksPath, '.deck-shadow');
  if (currentPlatform !== 'win32' && existsSync(shadowPath)) {
    try {
      const mode = statSync(shadowPath).mode & 0o777;
      if (mode !== DECK_SHADOW_SAFE_MODE) {
        actions.push({
          kind: 'chmod',
          target: shadowPath,
          description: `Reset permissions on stale ${TASKS_DIR}/.deck-shadow: `
            + `${mode.toString(8)} → ${DECK_SHADOW_SAFE_MODE.toString(8)}`,
          previousValue: `mode ${mode.toString(8)}`,
        });
      }
    } catch { /* unreadable stat — not a safe-repair case, skip */ }
  }

  // Config defaults / corruption — a single parse decides which of the two
  // mutually-exclusive repairs applies. Missing defaults delegate to the
  // existing, already-vetted migrateConfig() utility (it writes its own
  // timestamped backup before touching the file). Unparseable JSON is a
  // DIFFERENT failure mode migrateConfig() silently declines to touch today
  // (it returns addedFields:[] + an error) — config-recreate closes that gap
  // by backing up the broken file and rewriting full, valid defaults.
  const configPath = join(root, PROJECT_CONFIG_PATH);
  if (existsSync(configPath)) {
    const raw = readFileSync(configPath, 'utf-8');
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch { /* corrupt — handled below */ }

    if (parsed === null) {
      actions.push({
        kind: 'config-recreate',
        target: configPath,
        description: `Config JSON is corrupted — back up the broken file and recreate `
          + `${PROJECT_CONFIG_PATH} with defaults`,
        previousValue: raw.length > 500 ? `${raw.slice(0, 500)}… (${raw.length} bytes total)` : raw,
      });
    } else {
      const probe = migrateConfig(configPath, { dryRun: true });
      if (probe.addedFields.length > 0) {
        actions.push({
          kind: 'config-migrate',
          target: configPath,
          description: `Add ${probe.addedFields.length} missing config default(s): `
            + probe.addedFields.join(', '),
          previousValue: `${Object.keys(parsed).length} top-level key(s) before migration`,
        });
      }
    }
  }

  // Stale worker locks — same 300s threshold checkStaleLocks() already warns
  // about, but here every stale `.lock` becomes an individually-removable fix
  // action (independent per-action apply, matching mkdir/chmod/config-*
  // above) instead of just a warning count. A lock idle past this threshold
  // belongs to a dead/crashed worker; a genuinely active lock is refreshed
  // well inside the window. `.spawnlock` files are a distinct namespace
  // (see core/file-lock.ts) and are intentionally excluded by the `.lock`
  // suffix filter below.
  const locksPath = join(root, LOCKS_DIR);
  if (existsSync(locksPath)) {
    try {
      const lockFiles = readdirSync(locksPath).filter(f => f.endsWith('.lock'));
      for (const file of lockFiles) {
        const lockPath = join(locksPath, file);
        try {
          const lockRaw = readFileSync(lockPath, 'utf-8');
          const lock = JSON.parse(lockRaw) as { filePath?: string; ownerWorkerId?: string; acquiredAt?: string };
          if (!lock.acquiredAt) continue;
          const ageMs = Date.now() - new Date(lock.acquiredAt).getTime();
          if (Number.isNaN(ageMs) || ageMs <= STALE_LOCK_THRESHOLD_MS) continue;
          const ageMin = Math.round(ageMs / 60_000);
          actions.push({
            kind: 'unlock',
            target: lockPath,
            description: `Remove stale lock (${ageMin}m old, worker ${lock.ownerWorkerId ?? 'unknown'}): `
              + `${lock.filePath ?? file}`,
            previousValue: lockRaw,
          });
        } catch { /* malformed lock file — not a safe-repair case, skip */ }
      }
    } catch { /* unreadable .locks dir — skip */ }
  }

  return actions;
}

/**
 * Windows-native honesty caveat for `--fix` (born-203, ONB-2 — "tam Windows-native
 * profil kapsaması"). planDoctorFixes() above SKIPS the `.deck-shadow` chmod action
 * entirely on win32 because NTFS has no POSIX permission bits; rather than silently
 * doing nothing, this surfaces an honest manual item using the SAME disclosure text
 * the general Platform Profile section already shows for this exact limitation
 * (`doctor.platform_adapt_permissions` — reused, no new i18n key needed). Empty on
 * every other platform, and empty on win32 when `.deck-shadow` does not even exist
 * (nothing to caveat).
 */
export function getWindowsFixCaveats(
  root: string,
  lang: string = 'en',
  platformOverride?: NodeJS.Platform,
): DoctorFixManualItem[] {
  const currentPlatform = platformOverride ?? platform();
  if (currentPlatform !== 'win32') return [];
  const shadowPath = join(root, TASKS_DIR, '.deck-shadow');
  if (!existsSync(shadowPath)) return [];
  return [{
    name: `${TASKS_DIR}/.deck-shadow permissions (Windows)`,
    message: getMessage('doctor.platform_adapt_permissions', lang),
  }];
}

/**
 * Apply a previously-planned action list. Each action runs independently and
 * failures are captured per-action — one failing repair never aborts the rest.
 */
export function applyDoctorFixes(actions: DoctorFixAction[]): DoctorFixApplyResult[] {
  const results: DoctorFixApplyResult[] = [];
  for (const action of actions) {
    try {
      switch (action.kind) {
        case 'mkdir':
          mkdirSync(action.target, { recursive: true });
          break;
        case 'chmod':
          chmodSync(action.target, DECK_SHADOW_SAFE_MODE);
          break;
        case 'config-migrate':
          migrateConfig(action.target, { dryRun: false });
          break;
        case 'config-recreate': {
          const corruptRaw = readFileSync(action.target, 'utf-8');
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          writeFileSync(`${action.target}.corrupt.${timestamp}`, corruptRaw);
          writeFileSync(action.target, JSON.stringify(createDefaultConfig(), null, 2) + '\n');
          break;
        }
        case 'unlock':
          unlinkSync(action.target);
          break;
      }
      results.push({ action, applied: true });
    } catch (err) {
      results.push({ action, applied: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return results;
}

/**
 * Render the dry-run / applied fix list for CLI output. i18n via getMessage
 * (en+tr) — closes the standing TODO(docImpact, Task 15) from Task 356-006.
 *
 * `manual` and `lang` are additive, optional params (Task 367-006): every
 * call site that predates them (bare actions/results, no previousValue on the
 * action fixtures) renders IDENTICALLY to before — see
 * tests/cli/messages-round9-keys.test.ts, which pins the EN output
 * byte-for-byte against exactly that call shape.
 */
export function formatDoctorFixLines(
  actions: DoctorFixAction[],
  results?: DoctorFixApplyResult[],
  manual: DoctorFixManualItem[] = [],
  lang: string = 'en',
): string[] {
  const lines: string[] = [];
  const previousValueLine = (a: DoctorFixAction): string | null =>
    a.previousValue ? getMessage('doctor.fix_previous_value_line', lang, { previousValue: a.previousValue }) : null;

  if (actions.length === 0) {
    lines.push(manual.length > 0
      ? getMessage('doctor.fix_no_auto_fixable_but_manual', lang, { count: String(manual.length) })
      : getMessage('doctor.fix_nothing_to_repair', lang));
  } else if (!results) {
    lines.push(getMessage('doctor.fix_dry_run_header', lang, { count: String(actions.length) }));
    for (const a of actions) {
      lines.push(getMessage('doctor.fix_would_fix_line', lang, { description: a.description }));
      const prev = previousValueLine(a);
      if (prev) lines.push(prev);
    }
    lines.push(getMessage('doctor.fix_apply_hint', lang));
  } else {
    const failed = results.filter(r => !r.applied).length;
    lines.push(failed > 0
      ? getMessage('doctor.fix_apply_header_failed', lang, { count: String(results.length), failed: String(failed) })
      : getMessage('doctor.fix_apply_header_ok', lang, { count: String(results.length) }));
    for (const r of results) {
      if (r.applied) {
        lines.push(getMessage('doctor.fix_line_fixed', lang, { description: r.action.description }));
        const prev = previousValueLine(r.action);
        if (prev) lines.push(prev);
      } else {
        lines.push(getMessage('doctor.fix_line_failed', lang, { description: r.action.description, error: r.error ?? '' }));
      }
    }
  }

  if (manual.length > 0) {
    lines.push(getMessage('doctor.fix_manual_header', lang, { count: String(manual.length) }));
    for (const m of manual) {
      lines.push(getMessage('doctor.fix_manual_line', lang, { name: m.name, message: m.message }));
    }
  }

  return lines;
}

/**
 * Read `spawn_backend` (falling back to the legacy `claude_backend` key) from
 * `.deckent/config.json`, if present. Pure config-file read — no provider
 * detection, no network. Shared by the `--fix` branch's manual-check pass and
 * the main human/JSON doctor path so the logic lives in exactly one place.
 */
function resolveSpawnBackendForDoctor(root: string): string | undefined {
  try {
    const cfgPath = join(root, PROJECT_CONFIG_PATH);
    if (existsSync(cfgPath)) {
      const raw = JSON.parse(readFileSync(cfgPath, 'utf-8')) as Record<string, unknown>;
      return (raw.spawn_backend ?? raw.claude_backend) as string | undefined;
    }
  } catch { /* use default */ }
  return undefined;
}

export function registerDoctor(program: Command): void {
  program
    .command('doctor')
    .description('Check system dependencies and health')
    .option('--profile', 'Show system profile information')
    .option('--legacy', 'Use legacy output format')
    .option('--json', 'Output results as JSON')
    .option('--pre-flight', 'Run pre-flight health check before sprint spawn (stricter gates)')
    .option('--providers', 'Show detailed provider diagnostics (binary, version, auth) for Claude/Codex/Gemini')
    .option('--memory', 'Show host RAM detection (/proc/meminfo first, os.totalmem fallback) and suggested max_workers')
    .option('--ram-experiment', 'Show 6-worker × 2g RAM scenario verdict (Safe/Risky) based on current config and host RAM')
    .option('--fix-image', 'Rebuild the worker docker image after an interactive confirmation (ADR-063 consent) when it is missing/stale')
    .option('--fix', 'Preview safe repairs (missing .deckent/.tasks dirs, stale .deck-shadow permissions, missing/corrupt config, stale worker locks) — a closed whitelist, no delete-of-live-data/docker/login. Dry-run by default; combine with --yes to apply.')
    .option('-y, --yes', 'Apply the repairs listed by --fix (no effect without --fix)')
    .option('--dry-run', 'Explicit alias for the default --fix preview (no writes) — wins over --yes if both are passed')
    .action(async (opts: { profile?: boolean; legacy?: boolean; json?: boolean; preFlight?: boolean; providers?: boolean; memory?: boolean; ramExperiment?: boolean; fixImage?: boolean; fix?: boolean; yes?: boolean; dryRun?: boolean }) => {
      let root: string;
      try {
        root = resolveProjectRoot();
      } catch {
        root = process.cwd();
      }
      const lang = getLangFromConfig(root);

      // --fix: closed-whitelist safe repairs. Dedicated early-return branch
      // (mirrors --providers/--memory/--ram-experiment below) — never awaits
      // provider detection, never touches the network. `--dry-run` forces a
      // preview even if `--yes` was also passed (defensive: an explicit
      // dry-run request always wins).
      if (opts.fix) {
        const applying = opts.yes === true && opts.dryRun !== true;
        const actions = planDoctorFixes(root);
        const results = applying ? applyDoctorFixes(actions) : undefined;

        // Manual/unfixable — reuse the same LOCAL system checks `deckent doctor`
        // runs (no provider detection, so still no network) purely to surface an
        // honest "these need you, not --fix" list. Never affects action planning.
        const fixSpawnBackend = resolveSpawnBackendForDoctor(root);
        const fixDoctorResult = runDoctorChecks(root, undefined, fixSpawnBackend, lang);
        const manual: DoctorFixManualItem[] = fixDoctorResult.checks
          .filter(c => !c.passed && !DOCTOR_FIX_CHECK_NAMES.has(c.name))
          .map(c => ({ name: c.name, message: c.message }));
        // born-203 (ONB-2): honest win32 caveat for the chmod action planDoctorFixes()
        // deliberately skipped above — a no-op on every other platform.
        manual.push(...getWindowsFixCaveats(root, lang));

        // born-203 (ONB-2): full Windows-native profile coverage for `--fix` — the
        // general Platform Profile disclosure used to be shown ONLY on the plain
        // `doctor` human path, never here. Empty adaptedChecks on non-win32 keeps
        // POSIX output byte-identical (nogo criteria: never change existing
        // POSIX doctor behavior).
        const fixPlatformProfile = buildPlatformProfileReport(lang);

        if (opts.json) {
          print(JSON.stringify({
            dryRun: !applying,
            actions,
            results: results ?? null,
            manual,
            platformProfile: fixPlatformProfile,
          }, null, 2));
        } else {
          if (fixPlatformProfile.adaptedChecks.length > 0) {
            print(formatPlatformProfileLines(fixPlatformProfile, lang).join('\n'));
            print('');
          }
          print(formatDoctorFixLines(actions, results, manual, lang).join('\n'));
        }
        const failed = results?.some(r => !r.applied) ?? false;
        if (failed || (!results && actions.length > 0)) {
          process.exitCode = 1;
        }
        return;
      }
      const providers = await detectAvailableProviders();
      const activeProviderNames = providers.filter(p => p.available).map(p => p.name);
      const spawnBackend = resolveSpawnBackendForDoctor(root);
      const result = runDoctorChecks(root, activeProviderNames, spawnBackend, lang);

      // --providers: detailed binary/version/auth diagnostics for Claude/Codex/Gemini + Ollama
      if (opts.providers) {
        const diagnostics = await runProviderDiagnosticsWithOllama(root);
        if (opts.json) {
          print(JSON.stringify({ providers: diagnostics }, null, 2));
          const anyMissing = diagnostics.some(d => !d.available && !d.partial);
          if (anyMissing) process.exitCode = 1;
          return;
        }
        // Sprint 190 Task 190-002: [PASS]/[WARN]/[FAIL] actionable format with
        // per-provider hints (born-557: migrated off ✓/⚠/✗ onto doctorStatusIcon).
        // Legacy formatProviderDiagnostics still exported for callers needing
        // the [OK]/[PARTIAL]/[MISSING] bracket markers.
        print(formatProviderDiagnosticsActionable(diagnostics));
        return;
      }

      // --memory: host RAM detection + suggested max_workers (Sprint 194 Task 194-005)
      if (opts.memory) {
        const detection = detectHostMemory();
        const suggested = resolveAutoMaxWorkers('auto');
        if (opts.json) {
          print(JSON.stringify({
            totalGB: detection.totalGB,
            source: detection.source,
            suggestedMaxWorkers: suggested,
          }, null, 2));
          return;
        }
        print(`Host: ${detection.totalGB} GB (source=${detection.source}), suggested max_workers: ${suggested}`);
        return;
      }

      // --ram-experiment: 6-worker × 2g scenario verdict (Sprint 198 Task 198-005)
      if (opts.ramExperiment) {
        const detection = detectHostMemory();
        let maxWorkers = 6;
        let workerMemoryLimit = '2g';
        try {
          const cfgPath = join(root, PROJECT_CONFIG_PATH);
          if (existsSync(cfgPath)) {
            const raw = JSON.parse(readFileSync(cfgPath, 'utf-8')) as Record<string, unknown>;
            if (typeof raw['max_workers'] === 'number') maxWorkers = raw['max_workers'] as number;
            if (typeof raw['worker_memory_limit'] === 'string') workerMemoryLimit = raw['worker_memory_limit'] as string;
          }
        } catch { /* use defaults */ }
        const workerMemGB = parseWorkerMemoryGB(workerMemoryLimit);
        const report = computeRamExperiment(detection.totalGB, detection.source, maxWorkers, workerMemGB);
        if (opts.json) {
          print(JSON.stringify(report, null, 2));
          if (report.verdict === 'Risky') process.exitCode = 1;
          return;
        }
        print(formatRamExperiment(report));
        if (report.verdict === 'Risky') process.exitCode = 1;
        return;
      }

      // --pre-flight: run extended pre-flight check and exit with abort signal
      if (opts.preFlight) {
        const preFlightResult = resolvePreFlightResult(root);
        if (opts.json) {
          print(JSON.stringify(preFlightResult, null, 2));
          process.exitCode = preFlightResult.abortSprint ? 1 : 0;
          return;
        }
        // Human-readable pre-flight output
        print('\nPre-flight Health Check');
        print('─'.repeat(50));
        for (const check of preFlightResult.checks) {
          const icon = doctorStatusIcon(check.passed ? 'pass' : (check.required ? 'fail' : 'warn'));
          const dur = check.durationMs != null ? ` (${check.durationMs}ms)` : '';
          print(`${icon} ${check.name}: ${check.message}${dur}`);
        }
        print('─'.repeat(50));
        if (preFlightResult.abortSprint) {
          const failedCount = preFlightResult.checks.filter(c => c.required && !c.passed).length;
          print(`\nPre-flight FAILED — ${failedCount} required check(s) failed. Sprint aborted.`);
          process.exitCode = 1;
        } else {
          const warnCount = preFlightResult.checks.filter(c => !c.passed).length;
          const warnNote = warnCount > 0 ? ` (${warnCount} warning(s))` : '';
          print(`\nPre-flight PASSED${warnNote} — sprint can proceed.`);
        }
        return;
      }

      if (opts.json) {
        const jsonOutput: Record<string, unknown> = {
          ok: result.ok,
          checks: result.checks,
          providers,
          honestSummary: buildDoctorHonestSummary(result.checks, lang),
        };
        if (opts.profile) {
          const profile = getSystemProfile();
          const sub = detectSubscription();
          jsonOutput.profile = profile;
          jsonOutput.subscription = sub.detected === 'unknown' ? 'unknown' : sub.detected;
        }
        print(JSON.stringify(jsonOutput, null, 2));
        if (!result.ok) {
          process.exitCode = 1;
        }
        return;
      }

      if (opts.legacy) {
        // Legacy format
        print(formatDoctorResult(result));
        const passed = result.checks.filter(c => c.passed).length;
        const total = result.checks.length;
        print(getMessage('doctor.checks_passed', lang, {
          passed: String(passed),
          total: String(total),
        }));
        print('');
        print(formatDetectedProviders(providers));
      } else {
        // Human-friendly format — build Connector health results from detected providers
        const brainLines = getMemoryEntryCount(root);
        const lastSprintId = getLastSprintId(root);
        const debtItems = countDebtItems(root);
        const connectorHealthResults = buildConnectorHealthResults(providers);
        // PSL-6 (Task 270-006): probe real login state in parallel (short timeout)
        // so "CLI present but NOT logged in" is surfaced, not assumed-OK.
        const authProbes = await runAuthProbes(providers);

        // ONB-2-DILIM-3 (Task 368-002): honest platform profile (WSL/win32-native
        // adaptations) + config-based auth state (env + .deck, no network/subprocess).
        // born-203 (ONB-2): pass the already-computed PSL-6 authProbes so the
        // config-based verdict is cross-referenced with the REAL session state
        // (deepens the report beyond a bare 3-state — no extra subprocess/timeout
        // cost, authProbes was already computed above for the Provider Health section).
        const platformProfile = buildPlatformProfileReport(lang);
        const authStateReport = buildAuthStateReport(root, process.env, AUTH_STATE_PROVIDERS, authProbes);

        // F1-IMG (Task 270-008): for the docker backend, report worker-image
        // readiness. Detection-only; wrapped so a docker hiccup never breaks doctor.
        let workerImage: WorkerImageReport | undefined;
        if (spawnBackend === 'docker') {
          try {
            const requiredProviders = activeProviderNames.length > 0 ? activeProviderNames : ['claude'];
            workerImage = await checkWorkerImage({ requiredProviders });
          } catch {
            workerImage = undefined;
          }
        }

        const ciBaseline = readCIBaseline(root);
        const ciReports = readAllCIReports(root, 5);

        // Read memory_budget from config (sync) — default 900
        let brainBudget = 900;
        let workerResources: WorkerResourcesInfo | undefined;
        try {
          const configPath = join(root, PROJECT_CONFIG_PATH);
          if (existsSync(configPath)) {
            const rawCfg = JSON.parse(readFileSync(configPath, 'utf-8')) as {
              memory_budget?: number;
              worker_memory_limit?: string;
              worker_memory_swap?: string;
              max_workers?: number | 'auto';
              resource_monitor?: { enabled?: boolean; interval_ms?: number };
            };
            if (typeof rawCfg.memory_budget === 'number') brainBudget = rawCfg.memory_budget;
            // Worker Resources (Sprint 271 Task 271-006)
            const memLimit = rawCfg.worker_memory_limit ?? DEFAULT_WORKER_MEMORY_LIMIT;
            const memSwap = rawCfg.worker_memory_swap ?? DEFAULT_WORKER_MEMORY_SWAP;
            const maxW = (typeof rawCfg.max_workers === 'number' ? rawCfg.max_workers : null) ?? DEFAULT_MAX_WORKERS;
            workerResources = {
              memoryLimit: memLimit,
              memorySwap: memSwap,
              maxWorkers: maxW,
              hostTotalBytes: totalmem(),
              resourceMonitor: rawCfg.resource_monitor && typeof rawCfg.resource_monitor.enabled === 'boolean'
                ? { enabled: rawCfg.resource_monitor.enabled, interval_ms: rawCfg.resource_monitor.interval_ms }
                : undefined,
            };
          } else {
            // No config file: use all defaults
            workerResources = {
              memoryLimit: DEFAULT_WORKER_MEMORY_LIMIT,
              memorySwap: DEFAULT_WORKER_MEMORY_SWAP,
              maxWorkers: DEFAULT_MAX_WORKERS,
              hostTotalBytes: totalmem(),
            };
          }
        } catch { /* use default */ }

        // B-ZOMBIE (Task 332-006): advisory stale-daemon hygiene. Surfaces long-lived
        // deckent daemons (a stale dist/mcp/server.js, or bot/serve/watch left from a
        // prior build) + a copy-paste kill hint, or a clean PASS. checkDaemonHygiene
        // NEVER kills a process, NEVER throws (it swallows every error internally), and
        // is purely advisory — it does NOT touch result.ok / process.exitCode.
        const daemonHygiene = await checkDaemonHygiene({ lang });

        // Vocabulary (Sprint 445, Task 445-021): read-only routing3 vocabulary health
        // report (layer shadowing, dead pathPatterns, duplicate aliases, missing
        // descriptions). Wrapped defensively so a filesystem hiccup never breaks doctor —
        // same precedent as the workerImage try/catch above.
        let vocabularyReport: VocabularyDoctorReport | undefined;
        try {
          vocabularyReport = await runVocabularyDoctor(root);
        } catch {
          vocabularyReport = undefined;
        }

        print(formatHumanDoctor({
          result,
          providers,
          brainLines,
          brainBudget,
          lastSprintId,
          debtItems,
          projectRoot: root,
          connectorHealthResults,
          ciBaseline: ciBaseline ?? undefined,
          ciReports,
          authProbes,
          workerImage,
          workerResources,
          lang,
          daemonHygieneLines: daemonHygiene.lines,
          platformProfile,
          authStateReport,
          vocabularyReport,
        }));

        // F1-IMG consent (ADR-063): only the explicit --fix-image flag, plus an
        // interactive y/N confirm inside maybeFixWorkerImage, can run the rebuild.
        if (workerImage && opts.fixImage) {
          await maybeFixWorkerImage(workerImage, { enabled: true, lang });
        }
      }

      if (opts.profile) {
        const profile = getSystemProfile();
        const sub = detectSubscription();
        const subLabel = sub.detected === 'unknown' ? 'unknown' : sub.detected;
        print('');
        print(formatSystemProfile(profile, subLabel));
      }

      if (!result.ok) {
        process.exitCode = 1;
      }
    });
}
