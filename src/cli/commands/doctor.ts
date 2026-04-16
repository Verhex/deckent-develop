import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { platform } from 'node:os';
import { spawnSync } from 'node:child_process';
import type { Command } from 'commander';
import type { DoctorResult, SystemProfile } from '../../core/types.js';
import type { DetectedProvider } from '../../core/provider.js';
import type { HealthCheckResult } from '../../orchestra/connector.js';
import {
  DECKENT_DIR, BRAIN_DIR, MEMORY_FILE, DEBT_FILE, DECISIONS_FILE,
  DIRECTIVES_FILE, LOCKS_DIR, DEBT_TABLE_HEADER, MEMORY_DB_FILE,
  PROJECT_CONFIG_PATH,
} from '../../core/constants.js';
import { MemoryStore } from '../../core/memory-store.js';
import { getSystemProfile } from '../../core/system-profile.js';
import { detectSubscription } from '../../core/subscription.js';
import { print, formatDoctorResult, formatCIHealthSection } from '../helpers/output.js';
import type { CIBaseline, CIReport } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getMessage } from '../helpers/messages.js';
import { ErrorRegistry } from '../../core/errors.js';
import { detectAvailableProviders, formatDetectedProviders } from '../../core/provider.js';
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

export function checkPlatform(): DoctorCheck {
  const currentPlatform = platform();
  if (currentPlatform === 'win32') {
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
  const requiredFiles = [MEMORY_FILE, DEBT_FILE, DECISIONS_FILE];
  const missing = requiredFiles.filter(f => !existsSync(join(brainPath, f)));
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
  const debtPath = join(root, BRAIN_DIR, DEBT_FILE);
  if (!existsSync(debtPath)) {
    return { name: 'Debt', passed: true, message: 'No debt file', required: false };
  }
  try {
    const content = readFileSync(debtPath, 'utf-8');
    const lines = content.split('\n').filter(l => l.startsWith('|') && !l.startsWith(DEBT_TABLE_HEADER.slice(0, 5)) && !l.startsWith('|-'));
    const criticalCount = lines.filter(l => l.includes('CRITICAL')).length;
    if (criticalCount > 0) {
      return { name: 'Debt', passed: false, message: `${criticalCount} CRITICAL debt item(s)`, required: false };
    }
    return { name: 'Debt', passed: true, message: `${lines.length} debt items, no critical`, required: false };
  } catch {
    return { name: 'Debt', passed: false, message: 'Cannot parse DEBT.md', required: false };
  }
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

/**
 * Count open debt items from DEBT.md.
 * Returns total count and critical count.
 */
export function countDebtItems(root: string): { total: number; critical: number } {
  const debtPath = join(root, BRAIN_DIR, DEBT_FILE);
  if (!existsSync(debtPath)) return { total: 0, critical: 0 };
  try {
    const content = readFileSync(debtPath, 'utf-8');
    const lines = content.split('\n').filter(l => l.startsWith('|') && !l.startsWith(DEBT_TABLE_HEADER.slice(0, 5)) && !l.startsWith('|-'));
    const critical = lines.filter(l => l.includes('CRITICAL')).length;
    return { total: lines.length, critical };
  } catch {
    return { total: 0, critical: 0 };
  }
}

/**
 * Count open (unresolved) debt items from DEBT.md.
 * Looks for table rows where the "Resolved" column is not "true".
 */
export function countOpenDebtItems(root: string): number {
  const debtPath = join(root, BRAIN_DIR, DEBT_FILE);
  if (!existsSync(debtPath)) return 0;
  try {
    const content = readFileSync(debtPath, 'utf-8');
    const dataLines = content.split('\n').filter(
      l => l.startsWith('|') && !l.startsWith(DEBT_TABLE_HEADER.slice(0, 5)) && !l.startsWith('|-')
    );
    // Each row: | ID | Desc | Task | Sprint | Priority | Open | Resolved | Fixed In | Created |
    // Column index 6 (0-based after split) is "Resolved"
    return dataLines.filter(l => {
      const cols = l.split('|').map(c => c.trim());
      // cols[0] is empty (before first |), cols[7] is Resolved
      const resolved = cols[7] ?? '';
      return resolved !== 'true';
    }).length;
  } catch {
    return 0;
  }
}

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
 * Get CLI install hint for a missing provider.
 * Returns an install command suggestion string, or empty string if unknown.
 */
export function getProviderInstallHint(name: string): string {
  switch (name) {
    case 'claude': return 'install: npm i -g @anthropic-ai/claude-code';
    case 'codex': return 'install: npm i -g @openai/codex';
    case 'gemini': return 'install: npm i -g @google/gemini-cli';
    default: return '';
  }
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

/**
 * Format Connector health check results in [PASS]/[WARN]/[FAIL] style.
 * Includes provider CLI status, .deck file summary, and detected environment.
 */
export function formatConnectorHealthLines(
  results: HealthCheckResult[],
  root: string,
): string[] {
  const lines: string[] = ['Provider Health:'];

  for (const r of results) {
    const versionStr = r.cliVersion ? ` ${r.cliVersion}` : '';
    if (r.available && r.authStatus === 'ok') {
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
      const healthLines = formatConnectorHealthLines(input.connectorHealthResults, input.projectRoot);
      lines.push(...healthLines);
    } else {
      // Fall back to legacy format
      const providerHealthLines = formatProviderHealthSection(providers, input.projectRoot);
      lines.push(...providerHealthLines);
    }
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
    checkPlatform(),
    checkNode(), checkGit(), checkTmux(providerNames, spawnBackend), checkDocker(spawnBackend), checkClaude(),
    checkWorkspace(root), checkBrainDir(root), checkDirectives(root),
    checkBrainBudget(root), checkDebt(root), checkStaleLocks(root),
    checkDeckSecurity(root), checkWritePermissions(root),
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

export function registerDoctor(program: Command): void {
  program
    .command('doctor')
    .description('Check system dependencies and health')
    .option('--profile', 'Show system profile information')
    .option('--legacy', 'Use legacy output format')
    .option('--json', 'Output results as JSON')
    .option('--pre-flight', 'Run pre-flight health check before sprint spawn (stricter gates)')
    .action(async (opts: { profile?: boolean; legacy?: boolean; json?: boolean; preFlight?: boolean }) => {
      let root: string;
      try {
        root = resolveProjectRoot();
      } catch {
        root = process.cwd();
      }
      const lang = getLangFromConfig(root);
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

        const ciBaseline = readCIBaseline(root);
        const ciReports = readAllCIReports(root, 5);

        // Read memory_budget from config (sync) — default 900
        let brainBudget = 900;
        try {
          const configPath = join(root, PROJECT_CONFIG_PATH);
          if (existsSync(configPath)) {
            const rawCfg = JSON.parse(readFileSync(configPath, 'utf-8')) as { memory_budget?: number };
            if (typeof rawCfg.memory_budget === 'number') brainBudget = rawCfg.memory_budget;
          }
        } catch { /* use default */ }

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
        }));
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
