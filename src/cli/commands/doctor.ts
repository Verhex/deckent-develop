import { readFileSync, existsSync, readdirSync, statSync, mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { platform, totalmem } from 'node:os';
import { spawnSync, spawn as nodeSpawn } from 'node:child_process';
import type { Command } from 'commander';
import { planInstall } from '../../core/provisioner.js';
import type { DoctorResult, SystemProfile } from '../../core/types.js';
import type { DetectedProvider, ProviderAvailabilityDetail } from '../../core/provider.js';
import type { HealthCheckResult } from '../../orchestra/connector.js';
import {
  DECKENT_DIR, BRAIN_DIR, DECISIONS_FILE,
  DIRECTIVES_FILE, LOCKS_DIR, MEMORY_DB_FILE,
  PROJECT_CONFIG_PATH, TASKS_DIR,
} from '../../core/constants.js';
import { DebtPriority } from '../../core/types.js';
import { getDebtItems } from '../../core/debt-store.js';
import { migrateConfig } from '../../core/config-migration.js';

// Memory V2 (Sprint 179 W3-6): exports/decisions.md is the auto-generated
// source. doctor must accept EITHER this OR legacy .brain/DECISIONS.md.
const DECISIONS_EXPORT_RELATIVE = 'exports/decisions.md';
import { MemoryStore } from '../../core/memory-store.js';
import { getSystemProfile } from '../../core/system-profile.js';
import { detectHostMemory } from '../../core/host-detector.js';
import { resolveAutoMaxWorkers } from '../../orchestra/spawn-coordinator.js';
import { detectSubscription } from '../../core/subscription.js';
import { print, formatDoctorResult, formatCIHealthSection } from '../helpers/output.js';
import type { CIBaseline, CIReport } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getMessage } from '../helpers/messages.js';
import { ErrorRegistry } from '../../core/errors.js';
import { detectAvailableProviders, formatDetectedProviders } from '../../core/provider.js';
import { probeProviderAuth, type AuthProbeResult } from '../../core/provider-auth-probe.js';
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
import { runProviderDiagnostics, checkDaemonHygiene } from './doctor-checks.js';
import { detectEnvironment } from '../../core/environment.js';
import { loadDeckSecrets, validateDeckFile, KNOWN_DECK_KEYS, isDeckFileCommitted } from '../../core/deck-file.js';
import { getLangFromConfig } from '../helpers/config-reader.js';
import { accessSync, constants as fsConstants } from 'node:fs';

interface DoctorCheck {
  name: string;
  passed: boolean;
  message: string;
  required: boolean;
}

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

export function checkPlatform(spawnBackend?: string): DoctorCheck {
  const currentPlatform = platform();
  if (currentPlatform === 'win32') {
    // Backend-aware (DOCTOR-1, row 210): tmux genuinely doesn't run natively on
    // Windows, but docker (Docker Desktop) and subprocess backends work fine there.
    // Reporting "UNSUPPORTED" regardless of the configured backend is a misdiagnosis
    // when the user has explicitly opted into docker or subprocess.
    if (spawnBackend === 'docker') {
      return {
        name: 'Platform',
        passed: true,
        message: 'Windows (docker backend — fully supported via Docker Desktop; tmux not required)',
        required: false,
      };
    }
    if (spawnBackend === 'subprocess') {
      return {
        name: 'Platform',
        passed: true,
        message: 'Windows (subprocess backend — fully supported; tmux not required)',
        required: false,
      };
    }
    return {
      name: 'Platform',
      passed: false,
      message: 'Windows UNSUPPORTED for tmux backend — use WSL2 for full features. Subprocess mode only.',
      required: false,
    };
  }
  if (currentPlatform === 'linux') {
    const inWSL = isRunningInWSL();
    return {
      name: 'Platform',
      passed: true,
      message: inWSL ? 'WSL2/Linux (fully supported)' : 'Linux (fully supported)',
      required: false,
    };
  }
  if (currentPlatform === 'darwin') {
    return {
      name: 'Platform',
      passed: true,
      message: 'macOS (fully supported)',
      required: false,
    };
  }
  return {
    name: 'Platform',
    passed: true,
    message: `${currentPlatform} (untested — may work)`,
    required: false,
  };
}

function checkNode(): DoctorCheck {
  const result = spawnSync('node', ['--version'], { encoding: 'utf-8' });
  if (result.status !== 0) {
    const entry = ErrorRegistry.get('DECKENT_E010');
    return { name: 'Node.js', passed: false, message: `not found — ${entry?.suggestion ?? 'Install Node.js >=18'}`, required: true };
  }
  const version = result.stdout.trim();
  const major = parseInt(version.replace('v', '').split('.')[0] ?? '0', 10);
  if (major < 18) {
    const entry = ErrorRegistry.get('DECKENT_E010');
    return {
      name: 'Node.js',
      passed: false,
      message: `${version} found but >=18 required — ${entry?.suggestion ?? 'Upgrade Node.js'}`,
      required: true,
    };
  }
  return {
    name: 'Node.js',
    passed: true,
    message: `${version} (>=18 required)`,
    required: true,
  };
}

function checkGit(): DoctorCheck {
  const result = spawnSync('git', ['--version'], { encoding: 'utf-8' });
  if (result.status !== 0) {
    const entry = ErrorRegistry.get('DECKENT_E009');
    return { name: 'git', passed: false, message: `not found — ${entry?.suggestion ?? 'Install git'}. Needed for: rollback, safety points, branch management`, required: true };
  }
  const match = result.stdout.trim().match(/(\d+\.\d+\.\d+)/);
  return {
    name: 'git',
    passed: true,
    message: match ? `v${match[1]}` : result.stdout.trim(),
    required: true,
  };
}

export function checkTmux(providerNames?: string[], spawnBackend?: string): DoctorCheck {
  // tmux is NOT required on Windows, subprocess, or Docker backend
  if (platform() === 'win32' || spawnBackend === 'subprocess' || spawnBackend === 'docker') {
    const reason = spawnBackend === 'docker' ? 'docker backend' : 'subprocess backend';
    return { name: 'tmux', passed: true, message: `not required (${reason})`, required: false };
  }
  const needsTmux = !providerNames || providerNames.includes('claude') || providerNames.length === 0;
  const required = needsTmux;
  const result = spawnSync('tmux', ['-V'], { encoding: 'utf-8' });
  if (result.status !== 0) {
    const entry = ErrorRegistry.get('DECKENT_E001');
    if (!required) {
      return { name: 'tmux', passed: false, message: 'not found — not required when using Codex/Gemini providers', required: false };
    }
    return { name: 'tmux', passed: false, message: `not found — ${entry?.suggestion ?? 'Install tmux'}`, required: true };
  }
  return {
    name: 'tmux',
    passed: true,
    message: result.stdout.trim(),
    required,
  };
}

export function checkClaude(checkAuth = false): DoctorCheck {
  const shellOpt = process.platform === 'win32';
  const result = spawnSync('claude', ['--version'], { encoding: 'utf-8', shell: shellOpt });
  if (result.status !== 0) {
    const entry = ErrorRegistry.get('DECKENT_E002');
    return { name: 'Claude CLI', passed: false, message: `not found — ${entry?.suggestion ?? 'Install Claude CLI'}`, required: true };
  }
  const version = result.stdout.trim();
  if (checkAuth) {
    // Attempt auth check: `claude config get` returns non-zero if not logged in
    const authResult = spawnSync('claude', ['config', 'get', 'account'], { encoding: 'utf-8', shell: shellOpt });
    if (authResult.status !== 0 || (!authResult.stdout?.trim() && !authResult.stderr?.trim())) {
      return {
        name: 'Claude CLI',
        passed: false,
        message: `v${version} — not authenticated. Run: claude login`,
        required: true,
      };
    }
  }
  return {
    name: 'Claude CLI',
    passed: true,
    message: `v${version}`,
    required: true,
  };
}

function checkWorkspace(root: string): DoctorCheck {
  const exists = existsSync(join(root, DECKENT_DIR));
  return {
    name: 'Workspace',
    passed: exists,
    message: exists ? '.deckent/ found' : '.deckent/ missing — run `deckent init`',
    required: false,
  };
}

function checkBrainDir(root: string): DoctorCheck {
  const brainPath = join(root, BRAIN_DIR);
  if (!existsSync(brainPath)) {
    return { name: 'Brain Dir', passed: false, message: '.brain/ missing', required: false };
  }
  // Memory V2 accept-either (Sprint 179 W3-6): decisions can live in EITHER
  // legacy .brain/DECISIONS.md OR Memory V2 (.brain/memory.db + .brain/exports/decisions.md).
  // A fresh V2 install no longer ships DECISIONS.md, so requiring it would
  // produce a false-positive on every clean install.
  const hasV2Decisions =
    existsSync(join(brainPath, MEMORY_DB_FILE))
    || existsSync(join(brainPath, DECISIONS_EXPORT_RELATIVE));
  const hasLegacyDecisions = existsSync(join(brainPath, DECISIONS_FILE));

  const missing: string[] = [];
  // Memory V2: memory.db is the single source of truth — legacy .brain/ root
  // .md files (MEMORY/RETRO/PATTERNS/DEBT) are no longer expected.
  if (!hasV2Decisions && !hasLegacyDecisions) {
    missing.push(`${MEMORY_DB_FILE} or ${DECISIONS_FILE}`);
  }
  if (missing.length > 0) {
    return { name: 'Brain Dir', passed: false, message: `Missing: ${missing.join(', ')}`, required: false };
  }
  return { name: 'Brain Dir', passed: true, message: 'All brain files present', required: false };
}

function checkDirectives(root: string): DoctorCheck {
  const path = join(root, DIRECTIVES_FILE);
  if (!existsSync(path)) {
    const entry = ErrorRegistry.get('DECKENT_E003');
    return { name: 'Directives', passed: false, message: `DIRECTIVES.md missing — ${entry?.suggestion ?? 'Create DIRECTIVES.md or run deckent init'}`, required: false };
  }
  try {
    const content = readFileSync(path, 'utf-8').trim();
    if (content.length === 0) {
      return { name: 'Directives', passed: false, message: 'DIRECTIVES.md is empty — add sprint goals with ## Task sections', required: false };
    }
  } catch {
    return { name: 'Directives', passed: false, message: 'Cannot read DIRECTIVES.md — check file permissions', required: false };
  }
  return { name: 'Directives', passed: true, message: 'DIRECTIVES.md found', required: false };
}

/** DB-first memory entry count — replaces legacy countBrainLines. */
function getMemoryEntryCount(projectRoot: string): number {
  const dbPath = join(projectRoot, BRAIN_DIR, MEMORY_DB_FILE);
  if (!existsSync(dbPath)) return 0;
  try {
    const store = new MemoryStore(dbPath);
    try { return store.totalCount(); }
    finally { store.close(); }
  } catch { return 0; }
}

function checkBrainBudget(root: string, memoryBudget = 900): DoctorCheck {
  const lines = getMemoryEntryCount(root);
  const passed = lines <= memoryBudget;
  return {
    name: 'Brain Budget',
    passed,
    message: `${lines}/${memoryBudget} lines${passed ? '' : ' — OVER BUDGET, run cleanup --decay'}`,
    required: false,
  };
}

function checkDebt(root: string): DoctorCheck {
  // Task #4d: DB-first — debt lives in memory.db, not .brain/DEBT.md.
  const items = getDebtItems(root, { activeOnly: true });
  const criticalCount = items.filter(d => d.priority === DebtPriority.CRITICAL).length;
  if (criticalCount > 0) {
    return { name: 'Debt', passed: false, message: `${criticalCount} CRITICAL debt item(s)`, required: false };
  }
  return { name: 'Debt', passed: true, message: `${items.length} open debt items, no critical`, required: false };
}

function checkStaleLocks(root: string, lockStaleThresholdMs = 300_000): DoctorCheck {
  const locksPath = join(root, LOCKS_DIR);
  if (!existsSync(locksPath)) {
    return { name: 'Locks', passed: true, message: 'No lock files', required: false };
  }
  try {
    const lockFiles = readdirSync(locksPath).filter(f => f.endsWith('.lock'));
    if (lockFiles.length === 0) {
      return { name: 'Locks', passed: true, message: 'No lock files', required: false };
    }
    let staleCount = 0;
    for (const file of lockFiles) {
      try {
        const lock = JSON.parse(readFileSync(join(locksPath, file), 'utf-8'));
        if (lock.acquiredAt && (Date.now() - new Date(lock.acquiredAt).getTime()) > lockStaleThresholdMs) {
          staleCount++;
        }
      } catch { /* skip malformed */ }
    }
    if (staleCount > 0) {
      return { name: 'Locks', passed: false, message: `${staleCount} stale lock(s) — run \`deckent cleanup\` to remove stale locks`, required: false };
    }
    return { name: 'Locks', passed: true, message: `${lockFiles.length} active lock(s)`, required: false };
  } catch {
    return { name: 'Locks', passed: true, message: 'Cannot read locks', required: false };
  }
}

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
 * Format provider diagnostics with ✓ / ⚠ / ✗ symbols and actionable messages.
 *
 * Output shape (per task 190-002 spec):
 *   `✓ Claude (ready) — Claude CLI 1.0.45`
 *   `⚠ Codex (binary OK, auth missing — set OPENAI_API_KEY)`
 *   `✗ Gemini (binary not found)`
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
    const symbol = d.available ? '✓' : d.partial ? '⚠' : '✗';
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
    lines.push(`  [PASS] ${getMessage('doctor.image_ready', lang)}`);
    return lines;
  }
  lines.push(`  [WARN] ${getMessage('doctor.image_not_ready', lang, { state: report.state })}`);
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
      lines.push(`  [WARN] ${capitalize(r.provider)} CLI${versionStr} — ${authProbeLoggedOutLine(r.provider, lang)}`);
    } else if (r.available && r.authStatus === 'ok') {
      const authLabel = r.provider === 'claude' ? 'session auth active' : 'API key configured';
      lines.push(`  [PASS] ${capitalize(r.provider)} CLI${versionStr} — ${authLabel}`);
    } else if (!r.available) {
      const hint = getProviderInstallHint(r.provider);
      const msg = hint ? `not installed — ${hint}` : 'not available';
      lines.push(`  [WARN] ${capitalize(r.provider)} CLI — ${msg}`);
    } else {
      // available but auth missing or expired
      lines.push(`  [WARN] ${capitalize(r.provider)} CLI${versionStr} — auth missing`);
    }
  }

  // .deck status
  const deckStatus = getDeckFileStatus(root);
  const deckIcon = deckStatus.includes('not found') ? '[WARN]' : '[PASS]';
  lines.push(`  ${deckIcon} .deck file — ${deckStatus}`);

  // Environment detection
  const env = detectEnvironment();
  lines.push(`  [PASS] Environment — ${env} detected`);

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

/**
 * Check that .brain/memory.db (and WAL/SHM) are gitignored and not tracked.
 */
export function checkGitignore(root: string): DoctorCheck {
  const criticalFiles = ['.brain/memory.db', '.brain/memory.db-shm', '.brain/memory.db-wal'];

  // Check .gitignore entries exist
  const gitignorePath = join(root, '.gitignore');
  if (!existsSync(gitignorePath)) {
    return { name: 'Gitignore', passed: false, message: '.gitignore not found', required: false };
  }
  const gitignoreContent = readFileSync(gitignorePath, 'utf-8');
  const gitignoreLines = gitignoreContent.split('\n').map(l => l.trim());
  const missingEntries = criticalFiles.filter(f => !gitignoreLines.includes(f));
  if (missingEntries.length > 0) {
    return { name: 'Gitignore', passed: false, message: `Missing from .gitignore: ${missingEntries.join(', ')}`, required: false };
  }

  // Check none are tracked by git
  const result = spawnSync('git', ['ls-files', ...criticalFiles], {
    cwd: root,
    encoding: 'utf-8',
    timeout: 5_000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const tracked = (result.stdout ?? '').trim();
  if (tracked.length > 0) {
    const trackedFiles = tracked.split('\n').join(', ');
    return { name: 'Gitignore', passed: false, message: `Tracked by git: ${trackedFiles} — run: git rm --cached <file>`, required: false };
  }

  return { name: 'Gitignore', passed: true, message: 'memory.db files properly gitignored', required: false };
}

/**
 * Check write permissions for critical directories (.tasks/, .brain/).
 */
export function checkWritePermissions(root: string): DoctorCheck {
  const dirsToCheck = ['.tasks', '.brain'];
  const failures: string[] = [];
  for (const dir of dirsToCheck) {
    const dirPath = join(root, dir);
    if (!existsSync(dirPath)) continue;
    try {
      accessSync(dirPath, fsConstants.W_OK);
    } catch {
      failures.push(dir);
    }
  }
  if (failures.length > 0) {
    return { name: 'Write Permissions', passed: false, message: `No write access to: ${failures.join(', ')}`, required: true };
  }
  return { name: 'Write Permissions', passed: true, message: 'Write access OK (.tasks/, .brain/)', required: true };
}

/**
 * Check if .deck file is committed to git (security risk).
 */
export function checkDeckSecurity(root: string): DoctorCheck {
  const deckPath = join(root, '.deck');
  if (!existsSync(deckPath)) {
    return { name: '.deck Security', passed: true, message: '.deck file not found', required: false };
  }
  const isCommitted = isDeckFileCommitted(root);
  if (isCommitted) {
    return { name: '.deck Security', passed: false, message: '.deck file is tracked by git — secrets may be exposed! Add .deck to .gitignore', required: false };
  }
  return { name: '.deck Security', passed: true, message: '.deck file exists and is NOT tracked by git (safe)', required: false };
}

export function checkDocker(spawnBackend?: string): DoctorCheck {
  const wantsDocker = spawnBackend === 'docker' || spawnBackend === 'auto';
  const isRequired = spawnBackend === 'docker'; // Required only when explicitly set
  const result = spawnSync('docker', ['info'], {
    encoding: 'utf-8',
    timeout: 5_000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    return {
      name: 'Docker',
      passed: !wantsDocker,
      message: wantsDocker
        ? 'Docker not available — install Docker or switch spawn_backend to tmux/subprocess'
        : 'not installed (optional — enables isolated worker containers)',
      required: isRequired,
    };
  }
  // Check if deckent-worker image exists
  const imgResult = spawnSync('docker', ['images', '-q', 'deckent-worker:latest'], {
    encoding: 'utf-8',
    timeout: 5_000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const hasImage = (imgResult.stdout?.trim().length ?? 0) > 0;
  if (!hasImage && wantsDocker) {
    return {
      name: 'Docker',
      passed: false,
      message: 'Docker available but deckent-worker image missing — run: docker build -f Dockerfile.worker -t deckent-worker:latest .',
      required: isRequired,
    };
  }
  // Memory warning for Docker backend
  let memWarning = '';
  if (wantsDocker) {
    try {
      const memResult = spawnSync('docker', ['info', '--format', '{{.MemTotal}}'], {
        encoding: 'utf-8', timeout: 5_000, stdio: ['pipe', 'pipe', 'pipe'],
      });
      const memBytes = parseInt(memResult.stdout?.trim() ?? '0', 10);
      if (memBytes > 0 && memBytes < 4 * 1024 * 1024 * 1024) {
        const memGB = (memBytes / (1024 * 1024 * 1024)).toFixed(1);
        memWarning = ` (warning: Docker memory ${memGB}GB < 4GB — workers may OOM)`;
      }
    } catch { /* non-fatal */ }
  }
  return {
    name: 'Docker',
    passed: true,
    message: hasImage
      ? `Docker available + deckent-worker image ready${memWarning}`
      : `Docker available (deckent-worker image not built yet)${memWarning}`,
    required: isRequired,
  };
}

export function runDoctorChecks(root: string, providerNames?: string[], spawnBackend?: string): DoctorResult {
  const checks: DoctorCheck[] = [
    checkPlatform(spawnBackend),
    checkNode(), checkGit(), checkTmux(providerNames, spawnBackend), checkDocker(spawnBackend), checkClaude(),
    checkWorkspace(root), checkBrainDir(root), checkDirectives(root),
    checkBrainBudget(root), checkDebt(root), checkStaleLocks(root),
    checkDeckSecurity(root), checkWritePermissions(root), checkGitignore(root),
  ];
  return {
    ok: checks.filter(c => c.required).every(c => c.passed),
    checks,
  };
}

export interface PreFlightCheckResult {
  name: string;
  passed: boolean;
  required: boolean;
  message: string;
  durationMs?: number;
}

export interface PreFlightResult {
  passed: boolean;
  abortSprint: boolean;
  checks: PreFlightCheckResult[];
}

/**
 * Run pre-flight health check by invoking the pre-flight script as a child process.
 * Returns structured result suitable for --json output or spawn-gate decisions.
 */
export function runPreFlightHealthCheck(root: string): PreFlightResult {
  // Resolve script path relative to project root (works at both dev and dist time)
  const scriptPath = join(root, 'scripts', 'pre-flight-health-check.mjs');

  const result = spawnSync('node', [scriptPath, '--json', '--root', root, '--skip-tests'], {
    encoding: 'utf-8',
    cwd: root,
    timeout: 120_000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const output = result.stdout?.trim() ?? '';
  if (output) {
    try {
      return JSON.parse(output) as PreFlightResult;
    } catch { /* fall through to fallback */ }
  }
  // Fallback: parse basic doctor checks
  const doctorResult = runDoctorChecks(root);
  return {
    passed: doctorResult.ok,
    abortSprint: !doctorResult.ok,
    checks: doctorResult.checks.map(c => ({ name: c.name, passed: c.passed, required: c.required, message: c.message })),
  };
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

// ─── DOCTOR-FIX (Sprint 356, Task 356-006, row 203 ONB-2) ─────────────────────
//
// `deckent doctor --fix` — a CLOSED whitelist of safe, non-destructive repairs.
// Nothing risky (delete / docker / login) is ever eligible: planDoctorFixes()
// only ever emits the three kinds below, and applyDoctorFixes() only ever
// executes those same three kinds. Default is dry-run (list only); `--yes` is
// required to actually apply. Every repair is additive or a permission reset —
// never a deletion.

/** Closed whitelist — the ONLY fix kinds `doctor --fix` may ever plan or apply. */
export const DOCTOR_FIX_ACTION_KINDS = ['mkdir', 'chmod', 'config-migrate'] as const;
export type DoctorFixActionKind = typeof DOCTOR_FIX_ACTION_KINDS[number];

export interface DoctorFixAction {
  kind: DoctorFixActionKind;
  /** Absolute path the action operates on. */
  target: string;
  /** Human-readable "what this will do" line, shown in the dry-run list. */
  description: string;
}

export interface DoctorFixApplyResult {
  action: DoctorFixAction;
  applied: boolean;
  error?: string;
}

/** Owner-only read/write — matches ensureDeckShadowFile's mode in spawn-backend-docker.ts. */
const DECK_SHADOW_SAFE_MODE = 0o600;

/**
 * Detect safe repairs WITHOUT mutating anything (read-only: existsSync/statSync/
 * migrateConfig dry-run). Call applyDoctorFixes() on the returned list to apply.
 */
export function planDoctorFixes(root: string): DoctorFixAction[] {
  const actions: DoctorFixAction[] = [];

  const deckentPath = join(root, DECKENT_DIR);
  if (!existsSync(deckentPath)) {
    actions.push({
      kind: 'mkdir',
      target: deckentPath,
      description: `Create missing directory: ${DECKENT_DIR}/`,
    });
  }

  const tasksPath = join(root, TASKS_DIR);
  if (!existsSync(tasksPath)) {
    actions.push({
      kind: 'mkdir',
      target: tasksPath,
      description: `Create missing directory: ${TASKS_DIR}/`,
    });
  }

  // Stale .deck-shadow permission drift (e.g. a docker mount that changed the
  // host file's mode). chmod-only — never unlinked, deletion is out of scope.
  const shadowPath = join(tasksPath, '.deck-shadow');
  if (existsSync(shadowPath)) {
    try {
      const mode = statSync(shadowPath).mode & 0o777;
      if (mode !== DECK_SHADOW_SAFE_MODE) {
        actions.push({
          kind: 'chmod',
          target: shadowPath,
          description: `Reset permissions on stale ${TASKS_DIR}/.deck-shadow: `
            + `${mode.toString(8)} → ${DECK_SHADOW_SAFE_MODE.toString(8)}`,
        });
      }
    } catch { /* unreadable stat — not a safe-repair case, skip */ }
  }

  // Missing config defaults — delegates to the existing, already-vetted
  // migrateConfig() utility (it writes its own timestamped backup before
  // touching the file). Only proposed when there are ADDED fields to apply.
  const configPath = join(root, PROJECT_CONFIG_PATH);
  if (existsSync(configPath)) {
    const probe = migrateConfig(configPath, { dryRun: true });
    if (probe.addedFields.length > 0) {
      actions.push({
        kind: 'config-migrate',
        target: configPath,
        description: `Add ${probe.addedFields.length} missing config default(s): `
          + probe.addedFields.join(', '),
      });
    }
  }

  return actions;
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
      }
      results.push({ action, applied: true });
    } catch (err) {
      results.push({ action, applied: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return results;
}

/**
 * Render the dry-run / applied fix list for CLI output.
 * TODO(docImpact, Task 15): these strings are plain EN, not routed through
 * getMessage() — messages.ts is outside this task's write scope. Follow-up
 * should add `doctor.fix_*` en/tr keys and switch this over.
 */
export function formatDoctorFixLines(actions: DoctorFixAction[], results?: DoctorFixApplyResult[]): string[] {
  const lines: string[] = [];
  if (actions.length === 0) {
    lines.push('doctor --fix: nothing to repair — all safe-fix checks passed.');
    return lines;
  }
  if (!results) {
    lines.push(`doctor --fix (dry-run) — ${actions.length} safe repair(s) available:`);
    for (const a of actions) lines.push(`  [would fix] ${a.description}`);
    lines.push('Run `deckent doctor --fix --yes` to apply.');
    return lines;
  }
  const failed = results.filter(r => !r.applied).length;
  lines.push(`doctor --fix --yes — ${results.length} repair(s) attempted`
    + `${failed > 0 ? ` (${failed} FAILED)` : ''}:`);
  for (const r of results) {
    lines.push(r.applied ? `  [fixed] ${r.action.description}` : `  [FAILED] ${r.action.description} — ${r.error}`);
  }
  return lines;
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
    .option('--fix', 'Preview safe repairs (missing .deckent/.tasks dirs, stale .deck-shadow permissions, missing config defaults) — a closed whitelist, no delete/docker/login. Dry-run by default; combine with --yes to apply.')
    .option('-y, --yes', 'Apply the repairs listed by --fix (no effect without --fix)')
    .action(async (opts: { profile?: boolean; legacy?: boolean; json?: boolean; preFlight?: boolean; providers?: boolean; memory?: boolean; ramExperiment?: boolean; fixImage?: boolean; fix?: boolean; yes?: boolean }) => {
      let root: string;
      try {
        root = resolveProjectRoot();
      } catch {
        root = process.cwd();
      }
      const lang = getLangFromConfig(root);

      // --fix: closed-whitelist safe repairs. Dedicated early-return branch
      // (mirrors --providers/--memory/--ram-experiment below) — never runs the
      // full health check, never touches providers/network.
      if (opts.fix) {
        const actions = planDoctorFixes(root);
        const results = opts.yes ? applyDoctorFixes(actions) : undefined;
        if (opts.json) {
          print(JSON.stringify({
            dryRun: !opts.yes,
            actions,
            results: results ?? null,
          }, null, 2));
        } else {
          print(formatDoctorFixLines(actions, results).join('\n'));
        }
        const failed = results?.some(r => !r.applied) ?? false;
        if (failed || (!results && actions.length > 0)) {
          process.exitCode = 1;
        }
        return;
      }
      const providers = await detectAvailableProviders();
      const activeProviderNames = providers.filter(p => p.available).map(p => p.name);
      // Read spawn_backend from config for Docker/tmux check context
      let spawnBackend: string | undefined;
      try {
        const cfgPath = join(root, PROJECT_CONFIG_PATH);
        if (existsSync(cfgPath)) {
          const raw = JSON.parse(readFileSync(cfgPath, 'utf-8')) as Record<string, unknown>;
          spawnBackend = (raw.spawn_backend ?? raw.claude_backend) as string | undefined;
        }
      } catch { /* use default */ }
      const result = runDoctorChecks(root, activeProviderNames, spawnBackend);

      // --providers: detailed binary/version/auth diagnostics for Claude/Codex/Gemini + Ollama
      if (opts.providers) {
        const diagnostics = await runProviderDiagnosticsWithOllama(root);
        if (opts.json) {
          print(JSON.stringify({ providers: diagnostics }, null, 2));
          const anyMissing = diagnostics.some(d => !d.available && !d.partial);
          if (anyMissing) process.exitCode = 1;
          return;
        }
        // Sprint 190 Task 190-002: ✓/⚠/✗ actionable format with per-provider hints.
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
        const preFlightResult = runPreFlightHealthCheck(root);
        if (opts.json) {
          print(JSON.stringify(preFlightResult, null, 2));
          process.exitCode = preFlightResult.abortSprint ? 1 : 0;
          return;
        }
        // Human-readable pre-flight output
        print('\nPre-flight Health Check');
        print('─'.repeat(50));
        for (const check of preFlightResult.checks) {
          const icon = check.passed ? '[PASS]' : (check.required ? '[FAIL]' : '[WARN]');
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
