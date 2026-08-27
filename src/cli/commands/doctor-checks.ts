/** doctor-checks.ts — Health check functions for `deckent doctor`. Sprint 144 split. */
import { readFileSync, existsSync, readdirSync, accessSync, constants as fsConstants, statSync } from 'node:fs';
import { join } from 'node:path';
import { platform } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { DebtPriority } from '../../core/types.js';
import type { DoctorResult } from '../../core/types.js';
import type { ProviderAvailabilityDetail, ProviderAdapter } from '../../core/provider.js';
import { runProviderDiagnostics as runProviderDiagnosticsImpl } from '../../core/provider.js';
import {
  DECKENT_DIR, BRAIN_DIR, DECISIONS_FILE,
  DIRECTIVES_FILE, LOCKS_DIR, MEMORY_DB_FILE,
  PROJECT_CONFIG_PATH,
} from '../../core/constants.js';
import { getDebtItems } from '../../core/debt-store.js';
import { getDefaultConfig } from '../../core/config.js';
import { readSprintJournal } from '../../core/routing/journal.js';

// Row 450 (508-001): the Node.js runtime floor comes from the manifest's own
// `engines.node`, not a source literal. Read via `createRequire` (Node's own
// CJS loader, resolved once at module init) rather than the mockable
// `node:fs` readFileSync — several existing doctor tests mock `node:fs`
// wholesale with path-independent return values, and routing this specific
// read through it would make checkNode() pick up unrelated mock content and
// break those pre-existing, passing tests.
const requireFromHere = createRequire(import.meta.url);
const pkgManifest = requireFromHere('../../../package.json') as { engines: { node: string } };

// Memory V2 (Sprint 179 W3-6): exports/decisions.md is the auto-generated
// source. doctor must accept EITHER this OR legacy .brain/DECISIONS.md.
const DECISIONS_EXPORT_RELATIVE = 'exports/decisions.md';
import { MemoryStore } from '../../core/memory-store.js';
import { ErrorRegistry } from '../../core/errors.js';
import { isDeckFileCommitted, loadDeckSecrets } from '../../core/deck-file.js';
import {
  detectStaleDaemons,
  listDeckentProcesses,
  type StaleDaemon,
  type ProcessListResult,
} from '../../core/daemon-hygiene.js';
import type { CIBaseline, CIReport } from '../helpers/output.js';
import { getMessage } from '../helpers/messages.js';

export interface DoctorCheck {
  name: string;
  passed: boolean;
  message: string;
  required: boolean;
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

export function isRunningInWSL(): boolean {
  if (process.env['WSL_DISTRO_NAME'] !== undefined || process.env['WSL_INTEROP'] !== undefined) {
    return true;
  }
  try {
    const procVersion = readFileSync('/proc/version', 'utf-8');
    return procVersion.toLowerCase().includes('microsoft');
  } catch {
    return false;
  }
}

export function checkPlatform(spawnBackend?: string): DoctorCheck {
  const currentPlatform = platform();
  if (currentPlatform === 'win32') {
    // tmux genuinely doesn't run natively on Windows, but docker (Docker
    // Desktop) and subprocess backends work fine there — reporting
    // "UNSUPPORTED" regardless of the configured backend would be a
    // misdiagnosis when the user has explicitly opted into docker/subprocess.
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

/**
 * Derive the Node.js runtime floor from the package manifest's `engines.node`
 * field — the same field `npm install` itself enforces — instead of a
 * duplicated source literal. Only the first integer run in the range string
 * (e.g. "24" out of ">=24.0.0") is needed to gate against the running major
 * version, mirroring how the installed version is already parsed below.
 */
function resolveNodeEngineFloor(): { range: string; major: number } {
  const range = pkgManifest.engines.node;
  const match = range.match(/(\d+)/);
  const major = parseInt(match?.[1] ?? '', 10);
  if (!Number.isFinite(major)) {
    throw ErrorRegistry.createError('DECKENT_E080', {
      message: `doctor: cannot parse a major version from package.json engines.node: "${range}"`,
    });
  }
  return { range, major };
}

export function checkNode(): DoctorCheck {
  const { range: requiredRange, major: requiredMajor } = resolveNodeEngineFloor();
  const result = spawnSync('node', ['--version'], { encoding: 'utf-8' });
  if (result.status !== 0) {
    const entry = ErrorRegistry.get('DECKENT_E010');
    return { name: 'Node.js', passed: false, message: `not found — ${entry?.suggestion ?? `Install Node.js ${requiredRange}`}`, required: true };
  }
  const version = result.stdout.trim();
  const major = parseInt(version.replace('v', '').split('.')[0] ?? '0', 10);
  if (major < requiredMajor) {
    const entry = ErrorRegistry.get('DECKENT_E010');
    return {
      name: 'Node.js',
      passed: false,
      message: `${version} found but ${requiredRange} required — ${entry?.suggestion ?? 'Upgrade Node.js'}`,
      required: true,
    };
  }
  return {
    name: 'Node.js',
    passed: true,
    message: `${version} (${requiredRange} required)`,
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

export function checkTmux(providerNames?: string[], spawnBackend?: string, lang: string = 'en'): DoctorCheck {
  if (platform() === 'win32' || spawnBackend === 'subprocess' || spawnBackend === 'docker') {
    // Honest-label the reason: an explicit spawn_backend override is a
    // CONFIG-PREFERENCE reason; win32 with no override (or one that is
    // neither 'docker' nor 'subprocess') is a PLATFORM-INCOMPATIBILITY reason
    // — tmux genuinely does not run natively on Windows.
    const reasonKey = spawnBackend === 'docker'
      ? 'doctor.tmux_not_required_docker'
      : spawnBackend === 'subprocess'
        ? 'doctor.tmux_not_required_subprocess'
        : 'doctor.tmux_not_required_win32';
    return { name: 'tmux', passed: true, message: getMessage(reasonKey, lang), required: false };
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

export function checkDocker(spawnBackend?: string): DoctorCheck {
  const wantsDocker = spawnBackend === 'docker' || spawnBackend === 'auto';
  const isRequired = spawnBackend === 'docker';
  const spawnOpts = { encoding: 'utf-8' as const, timeout: 5_000, stdio: ['pipe', 'pipe', 'pipe'] as ['pipe', 'pipe', 'pipe'] };
  const result = spawnSync('docker', ['info'], spawnOpts);
  if (result.status !== 0) {
    const msg = wantsDocker
      ? 'Docker not available — install Docker or switch spawn_backend to tmux/subprocess'
      : 'not installed (optional — enables isolated worker containers)';
    return { name: 'Docker', passed: !wantsDocker, message: msg, required: isRequired };
  }
  const imgResult = spawnSync('docker', ['images', '-q', 'deckent-worker:latest'], spawnOpts);
  const hasImage = (imgResult.stdout?.trim().length ?? 0) > 0;
  if (!hasImage && wantsDocker) {
    return { name: 'Docker', passed: false, message: 'Docker available but deckent-worker image missing — run: docker build -f Dockerfile.worker -t deckent-worker:latest .', required: isRequired };
  }
  let memWarning = '';
  if (wantsDocker) {
    try {
      const memResult = spawnSync('docker', ['info', '--format', '{{.MemTotal}}'], spawnOpts);
      const memBytes = parseInt(memResult.stdout?.trim() ?? '0', 10);
      if (memBytes > 0 && memBytes < 4 * 1024 * 1024 * 1024) {
        memWarning = ` (warning: Docker memory ${(memBytes / (1024 * 1024 * 1024)).toFixed(1)}GB < 4GB — workers may OOM)`;
      }
    } catch { /* non-fatal */ }
  }
  const msg = hasImage
    ? `Docker available + deckent-worker image ready${memWarning}`
    : `Docker available (deckent-worker image not built yet)${memWarning}`;
  return { name: 'Docker', passed: true, message: msg, required: isRequired };
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
  // Memory V2: memory.db is the single source of truth. Legacy .brain/ root
  // .md files (MEMORY/RETRO/PATTERNS/DEBT) are no longer expected — only the
  // DB (or a pre-V2 legacy DECISIONS.md) needs to be present.
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

export function getMemoryEntryCount(projectRoot: string): number {
  const dbPath = join(projectRoot, BRAIN_DIR, MEMORY_DB_FILE);
  if (!existsSync(dbPath)) return 0;
  try {
    const store = new MemoryStore(dbPath);
    try { return store.totalCount(); }
    finally { store.close(); }
  } catch { return 0; }
}

// Budget authority is config `memory_budget` (3-layer merge default 5000), never a
// source literal — the old `= 900` default silently shadowed the owner's configured
// value (owner finding 2026-08-27). This check runs in sync callers (CLI/MCP/API),
// so the project layer is read directly (same pattern as readLastSprintId below)
// with the canonical config default as fallback.
function resolveMemoryBudget(root: string): number | undefined {
  try {
    const configPath = join(root, PROJECT_CONFIG_PATH);
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, 'utf-8')) as { memory_budget?: number };
      if (typeof config.memory_budget === 'number') return config.memory_budget;
    }
  } catch { /* unreadable project config — fall through to the canonical default */ }
  return getDefaultConfig().memory_budget;
}

function checkBrainBudget(root: string, memoryBudget?: number): DoctorCheck {
  const budget = memoryBudget ?? resolveMemoryBudget(root);
  if (budget === undefined) {
    return {
      name: 'Brain Budget',
      passed: true,
      message: 'memory_budget not configured — budget check skipped',
      required: false,
    };
  }
  const lines = getMemoryEntryCount(root);
  const passed = lines <= budget;
  return {
    name: 'Brain Budget',
    passed,
    message: `${lines}/${budget} lines${passed ? '' : ' — OVER BUDGET, run cleanup --decay'}`,
    required: false,
  };
}

function checkDebt(root: string): DoctorCheck {
  // DB-first — debt lives in memory.db, not .brain/DEBT.md (removed, Task #4d).
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

export function checkGitignore(root: string): DoctorCheck {
  const criticalFiles = ['.brain/memory.db', '.brain/memory.db-shm', '.brain/memory.db-wal'];
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

/**
 * SEC-02 (ADR-G-005 subprocess-visibility honesty-slice, Task 411-002).
 *
 * The docker spawn backend shadows `.deck` with an empty read-only overlay
 * (DECK-WORKER-ISOLATION, done) — a docker worker cannot read it. The
 * subprocess backend has no such mount trick: it runs the worker as a host
 * process inside the project root, where `.deck` stays disk-readable. A full
 * fix (host-side credential broker) is tracked separately; this check is the
 * honest middle ground — WARN rather than silently pass when the risk is real.
 *
 * Silent PASS (no alarming text) for every case where the risk does not
 * apply: a non-subprocess backend, a missing `.deck`, or a `.deck` that has
 * no non-empty secret value (template-only — nothing to expose). The WARN
 * message is a fixed, generic string — it never echoes a key name or value.
 */
export function checkDeckSubprocessVisibility(root: string, spawnBackend?: string, lang: string = 'en'): DoctorCheck {
  const name = '.deck Subprocess Visibility';
  const okMessage = getMessage('doctor.deck_subprocess_visibility_ok', lang);
  if (spawnBackend !== 'subprocess') {
    return { name, passed: true, message: okMessage, required: false };
  }
  const deckPath = join(root, '.deck');
  if (!existsSync(deckPath)) {
    return { name, passed: true, message: okMessage, required: false };
  }
  const secrets = loadDeckSecrets(root);
  const hasNonEmptySecret = Object.values(secrets).some((value) => value.trim().length > 0);
  if (!hasNonEmptySecret) {
    return { name, passed: true, message: okMessage, required: false };
  }
  return { name, passed: false, message: getMessage('doctor.deck_subprocess_visibility_warn', lang), required: false };
}

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

// DB-first debt counting — re-exported from helpers/debt-counter.ts (Sprint 145 T-009)
export { countDebtItems, countOpenDebtItems } from '../helpers/debt-counter.js';

export function readCIBaseline(root: string): CIBaseline | null {
  const baselinePath = join(root, '.deckent', 'ci-baseline.json');
  if (!existsSync(baselinePath)) return null;
  try {
    return JSON.parse(readFileSync(baselinePath, 'utf-8')) as CIBaseline;
  } catch {
    return null;
  }
}

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

/**
 * 673-005: routing decision-journal health. Surfaces (a) the dead legacy
 * `decisions-v3/` rename leftover, (b) unreadable/corrupted journal lines and
 * (c) config-hash drift against the newest sprint journal — the silent-death
 * class that let a stale journal look healthy. Full determinism REPLAY runs in
 * the routing test harness (it needs a live derive); doctor stays read-cheap.
 */
export function checkRoutingJournal(root: string): DoctorCheck {
  const name = 'Routing journal';
  try {
    const legacyDir = join(root, '.deckent', 'routing', 'decisions-v3');
    const journalDir = join(root, '.deckent', 'routing', 'decisions');
    const legacyNote = existsSync(legacyDir)
      ? 'legacy decisions-v3/ dir present (rename leftover — safe to delete); '
      : '';
    if (!existsSync(journalDir)) {
      return { name, passed: legacyNote === '', message: `${legacyNote}no journal yet`, required: false };
    }
    // Newest by mtime, not name: lexical sort let a corrupt double-prefixed
    // relic (`sprint-sprint-404.jsonl`, found live on first run) outrank the
    // real current sprint.
    const files = readdirSync(journalDir).filter(f => f.endsWith('.jsonl'))
      .sort((a, b) => statSync(join(journalDir, a)).mtimeMs - statSync(join(journalDir, b)).mtimeMs);
    if (files.length === 0) {
      return { name, passed: legacyNote === '', message: `${legacyNote}no journal files`, required: false };
    }
    const newest = files[files.length - 1]!;
    const read = readSprintJournal(root, newest.replace(/\.jsonl$/u, ''));
    if (read.corruptedLines.length > 0) {
      return { name, passed: false, required: false,
        message: `${legacyNote}${newest}: ${read.corruptedLines.length} corrupted line(s) of ${read.entries.length + read.corruptedLines.length}` };
    }
    if (legacyNote) {
      return { name, passed: false, required: false,
        message: `${legacyNote}${newest}: ${read.entries.length} entrie(s) readable` };
    }
    return { name, passed: true, required: false,
      message: `${newest}: ${read.entries.length} entrie(s), 0 corrupted`, };
  } catch (error) {
    return { name, passed: false, required: false,
      message: `journal health unreadable: ${error instanceof Error ? error.message : String(error)}` };
  }
}

export function runDoctorChecks(root: string, providerNames?: string[], spawnBackend?: string, lang: string = 'en'): DoctorResult {
  const checks: DoctorCheck[] = [
    checkPlatform(spawnBackend),
    checkNode(), checkGit(), checkTmux(providerNames, spawnBackend, lang), checkDocker(spawnBackend), checkClaude(),
    checkWorkspace(root), checkBrainDir(root), checkDirectives(root),
    checkBrainBudget(root), checkDebt(root), checkStaleLocks(root),
    checkDeckSecurity(root), checkWritePermissions(root), checkGitignore(root),
    checkDeckSubprocessVisibility(root, spawnBackend, lang),
    checkRoutingJournal(root),
  ];
  return {
    ok: checks.filter(c => c.required).every(c => c.passed),
    checks,
  };
}

/**
 * Build the 3 default provider adapters (Claude / Codex / Gemini) and run rich
 * diagnostics on each. Used by `deckent doctor --providers` and the MCP
 * `deckent_doctor` tool when `providers: true` is requested.
 */
export async function runProviderDiagnostics(root: string): Promise<ProviderAvailabilityDetail[]> {
  // Lazy import to avoid pulling provider modules into hot doctor paths.
  const { createClaudeAdapter } = await import('../../providers/claude.js');
  const { createCodexAdapter } = await import('../../providers/codex.js');
  const { createGeminiAdapter } = await import('../../providers/gemini.js');
  const adapters: ProviderAdapter[] = [
    createClaudeAdapter(root),
    createCodexAdapter(root),
    createGeminiAdapter(root),
  ];
  return runProviderDiagnosticsImpl(adapters);
}

// ─── Stale-Daemon Hygiene Advisory (B-ZOMBIE, Sprint 331, Task 331-007) ───────
//
// Surfaces the core `detectStaleDaemons` result as advisory doctor lines: a list
// of long-lived deckent daemons (a stale `dist/mcp/server.js`, old bot/serve/
// watch from a prior build) plus a copy-paste kill hint, OR a single PASS line.
// ADVISORY ONLY — this NEVER kills a process, NEVER throws, and NEVER fails the
// doctor run (an unsupported platform or a listing failure both degrade to a
// benign PASS note).

/** Human-readable elapsed age (e.g. `2h 5m`, `45m`, `30s`, `1d 3h`). Pure. */
function formatDaemonAge(totalSec: number): string {
  if (totalSec < 60) return `${totalSec}s`;
  const days = Math.floor(totalSec / 86_400);
  const hours = Math.floor((totalSec % 86_400) / 3_600);
  const mins = Math.floor((totalSec % 3_600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (mins > 0) parts.push(`${mins}m`);
  return parts.length > 0 ? parts.join(' ') : `${totalSec}s`;
}

/**
 * Pure formatter: stale-daemon list → advisory lines. A clean result yields a
 * single `[PASS]` line; otherwise a `[WARN]` count, one line per daemon, and a
 * cross-platform copy-paste kill hint. i18n en/tr. Never throws.
 */
export function formatDaemonHygieneLines(staleDaemons: StaleDaemon[], lang: string = 'en'): string[] {
  const lines: string[] = [getMessage('doctor.daemon_header', lang)];
  if (staleDaemons.length === 0) {
    lines.push(`  [PASS] ${getMessage('doctor.daemon_clean', lang)}`);
    return lines;
  }
  lines.push(`  [WARN] ${getMessage('doctor.daemon_found', lang, { count: String(staleDaemons.length) })}`);
  for (const daemon of staleDaemons) {
    lines.push(`         ${getMessage('doctor.daemon_entry', lang, {
      pid: String(daemon.pid),
      kind: daemon.kind,
      age: formatDaemonAge(daemon.elapsedSec),
    })}`);
  }
  const pids = staleDaemons.map((d) => d.pid);
  const killCmd = `kill ${pids.join(' ')}`;
  const winKillCmd = pids.map((p) => `taskkill /F /PID ${p}`).join(' & ');
  lines.push(`         ${getMessage('doctor.daemon_kill_hint', lang, { killCmd, winKillCmd })}`);
  return lines;
}

/** Result of {@link checkDaemonHygiene} — the flagged daemons + rendered lines. */
export interface DaemonHygieneResult {
  staleDaemons: StaleDaemon[];
  /** Rendered, i18n'd advisory/PASS lines ready to print under the doctor output. */
  lines: string[];
}

/**
 * ADVISORY daemon-hygiene check. Lists host processes via the injectable seam
 * (defaults to the real cross-platform lister), flags stale deckent daemons, and
 * renders the advisory lines. It NEVER kills a process, NEVER throws, and NEVER
 * fails the doctor run — an unsupported platform or any listing error degrades to
 * a benign PASS note. `lister` is injectable so callers/tests stay hermetic.
 */
export async function checkDaemonHygiene(opts: {
  lang?: string;
  lister?: () => Promise<ProcessListResult>;
  minAgeSec?: number;
} = {}): Promise<DaemonHygieneResult> {
  const lang = opts.lang ?? 'en';
  try {
    const lister = opts.lister ?? (() => listDeckentProcesses());
    const result = await lister();
    if (!result.supported) {
      return {
        staleDaemons: [],
        lines: [
          getMessage('doctor.daemon_header', lang),
          `  [PASS] ${getMessage('doctor.daemon_unsupported', lang, { platform: result.platform })}`,
        ],
      };
    }
    const staleDaemons = detectStaleDaemons(
      result.processes,
      opts.minAgeSec != null ? { minAgeSec: opts.minAgeSec } : {},
    );
    return { staleDaemons, lines: formatDaemonHygieneLines(staleDaemons, lang) };
  } catch {
    return {
      staleDaemons: [],
      lines: [
        getMessage('doctor.daemon_header', lang),
        `  [PASS] ${getMessage('doctor.daemon_check_failed', lang)}`,
      ],
    };
  }
}

export function runPreFlightHealthCheck(root: string): PreFlightResult {
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
  const doctorResult = runDoctorChecks(root);
  return {
    passed: doctorResult.ok,
    abortSprint: !doctorResult.ok,
    checks: doctorResult.checks.map(c => ({ name: c.name, passed: c.passed, required: c.required, message: c.message })),
  };
}
