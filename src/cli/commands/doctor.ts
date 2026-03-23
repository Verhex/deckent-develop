import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { platform } from 'node:os';
import { spawnSync } from 'node:child_process';
import type { Command } from 'commander';
import type { DoctorResult, SystemProfile } from '../../core/types.js';
import type { DetectedProvider } from '../../core/provider.js';
import {
  DECKENT_DIR, BRAIN_DIR, MEMORY_FILE, DEBT_FILE, DECISIONS_FILE,
  DIRECTIVES_FILE, LOCKS_DIR, LOCK_STALE_THRESHOLD_MS, DEBT_TABLE_HEADER,
  PROJECT_CONFIG_PATH, BRAIN_TOTAL_LINE_BUDGET,
} from '../../core/constants.js';
import { countBrainLines } from '../../core/utils.js';
import { getSystemProfile } from '../../core/system-profile.js';
import { detectSubscription } from '../../core/subscription.js';
import { print, formatDoctorResult } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getMessage } from '../helpers/messages.js';
import { ErrorRegistry } from '../../core/errors.js';
import { detectAvailableProviders, formatDetectedProviders } from '../../core/provider.js';

interface DoctorCheck {
  name: string;
  passed: boolean;
  message: string;
  required: boolean;
}

function readLanguage(root: string): string {
  try {
    const configPath = join(root, PROJECT_CONFIG_PATH);
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, 'utf-8')) as { language?: string };
      return config.language ?? 'en';
    }
  } catch {
    // fallback
  }
  return 'en';
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
      message: 'Native Windows is UNSUPPORTED — deckent requires tmux and POSIX paths. Install WSL2 (Ubuntu) and run from inside WSL2.',
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

function checkTmux(): DoctorCheck {
  const result = spawnSync('tmux', ['-V'], { encoding: 'utf-8' });
  if (result.status !== 0) {
    const entry = ErrorRegistry.get('DECKENT_E001');
    return { name: 'tmux', passed: false, message: `not found — ${entry?.suggestion ?? 'Install tmux'}`, required: true };
  }
  return {
    name: 'tmux',
    passed: true,
    message: result.stdout.trim(),
    required: true,
  };
}

function checkClaude(): DoctorCheck {
  const result = spawnSync('claude', ['--version'], { encoding: 'utf-8' });
  if (result.status !== 0) {
    const entry = ErrorRegistry.get('DECKENT_E002');
    return { name: 'Claude CLI', passed: false, message: `not found — ${entry?.suggestion ?? 'Install Claude CLI'}`, required: true };
  }
  return {
    name: 'Claude CLI',
    passed: true,
    message: `v${result.stdout.trim()}`,
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

function checkBrainBudget(root: string): DoctorCheck {
  const lines = countBrainLines(root);
  const passed = lines <= BRAIN_TOTAL_LINE_BUDGET;
  return {
    name: 'Brain Budget',
    passed,
    message: `${lines}/${BRAIN_TOTAL_LINE_BUDGET} lines${passed ? '' : ' — OVER BUDGET, run cleanup --decay'}`,
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

function checkStaleLocks(root: string): DoctorCheck {
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
        if (lock.acquiredAt && (Date.now() - new Date(lock.acquiredAt).getTime()) > LOCK_STALE_THRESHOLD_MS) {
          staleCount++;
        }
      } catch { /* skip malformed */ }
    }
    if (staleCount > 0) {
      return { name: 'Locks', passed: false, message: `${staleCount} stale lock(s)`, required: false };
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

export interface HumanDoctorInput {
  result: DoctorResult;
  providers: DetectedProvider[];
  brainLines: number;
  brainBudget: number;
  lastSprintId: string | null;
  debtItems: { total: number; critical: number };
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

  // ─── Your System ──────────────────────────────────
  lines.push('Your System:');

  const systemCheckNames = ['Platform', 'Node.js', 'git', 'tmux', 'Claude CLI'];
  for (const check of result.checks) {
    if (systemCheckNames.includes(check.name)) {
      const icon = check.passed ? 'OK' : 'FAIL';
      lines.push(`  ${icon} ${check.name} — ${check.message}`);
    }
  }

  // Provider status
  for (const p of providers) {
    const version = p.version ? ` v${p.version}` : '';
    if (p.available) {
      const auth = p.authMethod === 'session' ? 'session auth' : p.authMethod === 'api_key' ? 'API key set' : '';
      const authLabel = auth ? ` (${auth})` : '';
      lines.push(`  OK ${capitalize(p.name)} CLI${version} — Ready${authLabel}`);
    } else {
      const hint = getProviderHint(p.name);
      lines.push(`  FAIL ${capitalize(p.name)} — Not configured${hint}`);
    }
  }

  lines.push('');

  // ─── Your Project ─────────────────────────────────
  lines.push('Your Project:');

  const projectCheckNames = ['Workspace', 'Brain Dir', 'Directives'];
  for (const check of result.checks) {
    if (projectCheckNames.includes(check.name)) {
      const icon = check.passed ? 'OK' : 'FAIL';
      lines.push(`  ${icon} ${check.name} — ${check.message}`);
    }
  }

  // Memory budget
  const memPct = Math.round((brainLines / brainBudget) * 100);
  const memHealth = brainLines <= brainBudget ? 'healthy' : 'OVER BUDGET';
  const memIcon = brainLines <= brainBudget ? 'OK' : 'FAIL';
  lines.push(`  ${memIcon} Memory: ${brainLines}/${brainBudget} lines (${memPct}% — ${memHealth})`);

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

  // ─── Recommendation ───────────────────────────────
  lines.push('Recommendation:');

  const failedRequired = result.checks.filter(c => c.required && !c.passed);
  if (failedRequired.length > 0) {
    lines.push(`  Fix ${failedRequired.length} required issue${failedRequired.length > 1 ? 's' : ''} before starting a sprint.`);
    for (const c of failedRequired) {
      lines.push(`  → ${c.name}: ${c.message}`);
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
    default: return '';
  }
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
      }
    }
  }
  return tips;
}

export function formatSystemProfile(profile: SystemProfile, subscription?: string): string {
  const totalGB = (profile.totalMemMB / 1024).toFixed(1);
  const freeGB = (profile.freeMemMB / 1024).toFixed(1);
  const inner = 54;
  const top = `\u2554${'═'.repeat(inner)}\u2557`;
  const bot = `\u255A${'═'.repeat(inner)}\u255D`;
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

export function runDoctorChecks(root: string): DoctorResult {
  const checks: DoctorCheck[] = [
    checkPlatform(),
    checkNode(), checkGit(), checkTmux(), checkClaude(),
    checkWorkspace(root), checkBrainDir(root), checkDirectives(root),
    checkBrainBudget(root), checkDebt(root), checkStaleLocks(root),
  ];
  return {
    ok: checks.filter(c => c.required).every(c => c.passed),
    checks,
  };
}

export function registerDoctor(program: Command): void {
  program
    .command('doctor')
    .description('Check system dependencies and health')
    .option('--profile', 'Show system profile information')
    .option('--legacy', 'Use legacy output format')
    .action(async (opts: { profile?: boolean; legacy?: boolean }) => {
      let root: string;
      try {
        root = resolveProjectRoot();
      } catch {
        root = process.cwd();
      }
      const lang = readLanguage(root);
      const result = runDoctorChecks(root);
      const providers = await detectAvailableProviders();

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
        // Human-friendly format
        const brainLines = countBrainLines(root);
        const lastSprintId = getLastSprintId(root);
        const debtItems = countDebtItems(root);

        print(formatHumanDoctor({
          result,
          providers,
          brainLines,
          brainBudget: BRAIN_TOTAL_LINE_BUDGET,
          lastSprintId,
          debtItems,
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
