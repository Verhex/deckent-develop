import { spawnSync } from 'node:child_process';
import type { Command } from 'commander';
import { print, printError } from '../helpers/output.js';
import { DECKENT_VERSION } from '../../core/constants.js';

// ─── Types ───────────────────────────────────────────────────────────

export type InstallStrategy = 'global' | 'local' | 'npx' | 'unknown';

export type ReleaseChannel = 'latest' | 'beta' | 'canary';

// ─── Version Comparison ─────────────────────────────────────────────

/**
 * Parse semver string into numeric parts and pre-release tag.
 * Handles: 1.0.0, v1.0.0, 1.0.0-beta.1, 1.0.0-canary.20260101
 */
export function parseSemver(version: string): { major: number; minor: number; patch: number; pre: string } {
  const clean = version.replace(/^v/, '');
  const [mainPart, ...preParts] = clean.split('-');
  const pre = preParts.join('-');
  const segments = (mainPart ?? '').split('.').map(s => parseInt(s, 10) || 0);
  return {
    major: segments[0] ?? 0,
    minor: segments[1] ?? 0,
    patch: segments[2] ?? 0,
    pre,
  };
}

/**
 * Compare two semver strings with pre-release support.
 * Returns -1 if a < b, 0 if equal, 1 if a > b.
 * Pre-release versions are considered lower than their release counterparts
 * (1.0.0-beta.1 < 1.0.0).
 */
export function compareVersions(current: string, latest: string): number {
  const a = parseSemver(current);
  const b = parseSemver(latest);

  if (a.major !== b.major) return a.major < b.major ? -1 : 1;
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;

  // Same numeric version — compare pre-release
  // No pre-release > has pre-release (1.0.0 > 1.0.0-beta.1)
  if (a.pre === b.pre) return 0;
  if (!a.pre && b.pre) return 1;   // a is release, b is pre-release → a > b
  if (a.pre && !b.pre) return -1;  // a is pre-release, b is release → a < b

  // Both have pre-release — compare lexicographically
  return a.pre < b.pre ? -1 : 1;
}

// ─── Install Strategy Detection ─────────────────────────────────────

/**
 * Detect how deckent was installed: global npm, local npm, or npx.
 */
export function detectInstallStrategy(): InstallStrategy {
  // Check if running via npx (npm_execpath contains npx or _npx)
  const execPath = process.env['npm_execpath'] ?? '';
  if (execPath.includes('npx') || execPath.includes('_npx')) {
    return 'npx';
  }

  // Check if deckent is globally installed
  const globalCheck = spawnSync('npm', ['list', '-g', '--depth=0', 'deckent'], {
    encoding: 'utf-8',
    timeout: 10_000,
  });
  if (globalCheck.status === 0 && globalCheck.stdout.includes('deckent')) {
    return 'global';
  }

  // Check if locally installed
  const localCheck = spawnSync('npm', ['list', '--depth=0', 'deckent'], {
    encoding: 'utf-8',
    timeout: 10_000,
  });
  if (localCheck.status === 0 && localCheck.stdout.includes('deckent')) {
    return 'local';
  }

  return 'unknown';
}

// ─── Check Latest Version ───────────────────────────────────────────

/**
 * Check latest version from npm registry for a given channel.
 */
export function checkLatestVersion(channel: ReleaseChannel = 'latest'): string | null {
  try {
    const tag = channel === 'latest' ? 'latest' : channel;
    const result = spawnSync('npm', ['view', `deckent@${tag}`, 'version'], {
      encoding: 'utf-8',
      timeout: 15_000,
    });
    if (result.status === 0 && result.stdout.trim()) {
      return result.stdout.trim();
    }
  } catch {
    // ignore
  }
  return null;
}

// ─── Rollback Support ───────────────────────────────────────────────

/**
 * Save current version for rollback purposes.
 */
export function saveVersionForRollback(version: string): boolean {
  try {
    const result = spawnSync('npm', ['config', 'set', 'deckent-prev-version', version], {
      encoding: 'utf-8',
      timeout: 5_000,
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Get saved rollback version.
 */
export function getRollbackVersion(): string | null {
  try {
    const result = spawnSync('npm', ['config', 'get', 'deckent-prev-version'], {
      encoding: 'utf-8',
      timeout: 5_000,
    });
    if (result.status === 0 && result.stdout.trim() && result.stdout.trim() !== 'undefined') {
      return result.stdout.trim();
    }
  } catch {
    // ignore
  }
  return null;
}

// ─── Run Upgrade ────────────────────────────────────────────────────

/**
 * Build the npm install command based on install strategy and channel.
 */
export function buildInstallCommand(strategy: InstallStrategy, channel: ReleaseChannel): string[] {
  const tag = channel === 'latest' ? 'latest' : channel;
  const pkg = `deckent@${tag}`;

  switch (strategy) {
    case 'global':
      return ['npm', 'install', '-g', pkg];
    case 'local':
      return ['npm', 'install', pkg];
    case 'npx':
    case 'unknown':
    default:
      return ['npm', 'install', '-g', pkg];
  }
}

export function runUpgradeInstall(strategy: InstallStrategy = 'global', channel: ReleaseChannel = 'latest'): boolean {
  try {
    const [cmd, ...args] = buildInstallCommand(strategy, channel);
    const result = spawnSync(cmd ?? 'npm', args, {
      encoding: 'utf-8',
      timeout: 60_000,
      stdio: 'inherit',
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Rollback to a previous version.
 */
export function rollbackUpgrade(prevVersion: string, strategy: InstallStrategy): boolean {
  try {
    const pkg = `deckent@${prevVersion}`;
    const args = strategy === 'local'
      ? ['npm', 'install', pkg]
      : ['npm', 'install', '-g', pkg];
    const [cmd, ...rest] = args;
    const result = spawnSync(cmd ?? 'npm', rest, {
      encoding: 'utf-8',
      timeout: 60_000,
      stdio: 'inherit',
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

// ─── Main Logic ─────────────────────────────────────────────────────

export function executeUpgrade(opts: { check?: boolean; canary?: boolean; beta?: boolean; rollback?: boolean }): void {
  const current = DECKENT_VERSION;
  print(`Current version: ${current}`);

  // Handle rollback
  if (opts.rollback) {
    const prevVersion = getRollbackVersion();
    if (!prevVersion) {
      print('No rollback version saved. Cannot rollback.');
      process.exitCode = 1;
      return;
    }
    print(`Rolling back to ${prevVersion}...`);
    const strategy = detectInstallStrategy();
    const success = rollbackUpgrade(prevVersion, strategy);
    if (success) {
      print(`Successfully rolled back to ${prevVersion}`);
    } else {
      printError(new Error(`Rollback failed. Try manually: npm install -g deckent@${prevVersion}`));
      process.exitCode = 1;
    }
    return;
  }

  const channel: ReleaseChannel = opts.canary ? 'canary' : opts.beta ? 'beta' : 'latest';
  if (channel !== 'latest') {
    print(`Channel: ${channel}`);
  }

  const latest = checkLatestVersion(channel);
  if (latest === null) {
    print('Could not check latest version. Check your network or try: npm view deckent version');
    return;
  }

  print(`Latest version:  ${latest}`);

  const cmp = compareVersions(current, latest);
  if (cmp >= 0) {
    print('Already up to date.');
    return;
  }

  print(`Update available: ${current} -> ${latest}`);

  if (opts.check) {
    print('Run `deckent upgrade` (without --check) to install the update.');
    return;
  }

  // Detect install strategy
  const strategy = detectInstallStrategy();
  if (strategy !== 'unknown') {
    print(`Install strategy: ${strategy}`);
  }

  // Save current version for rollback
  saveVersionForRollback(current);

  print('Installing update...');
  const success = runUpgradeInstall(strategy, channel);
  if (success) {
    print(`Successfully upgraded to ${latest}`);
    print('Run `deckent upgrade --rollback` to revert if needed.');
  } else {
    printError(new Error('Upgrade failed. Try manually: npm install -g deckent@latest'));
    print(`Tip: run \`deckent upgrade --rollback\` to restore version ${current}`);
    process.exitCode = 1;
  }
}

// ─── Command Registration ───────────────────────────────────────────

export function registerUpgrade(program: Command): void {
  program
    .command('upgrade')
    .description('Self-update deckent')
    .option('--check', 'Only check for updates, do not install')
    .option('--canary', 'Install from canary channel (pre-release)')
    .option('--beta', 'Install from beta channel (pre-release)')
    .option('--rollback', 'Roll back to the previous version')
    .action((opts: { check?: boolean; canary?: boolean; beta?: boolean; rollback?: boolean }) => {
      executeUpgrade(opts);
    });
}
