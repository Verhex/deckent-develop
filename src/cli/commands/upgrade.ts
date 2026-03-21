import { spawnSync } from 'node:child_process';
import type { Command } from 'commander';
import { print, printError } from '../helpers/output.js';
import { DECKENT_VERSION } from '../../core/constants.js';

// ─── Version Comparison ─────────────────────────────────────────────

export function compareVersions(current: string, latest: string): number {
  const a = current.replace(/^v/, '').split('.').map(Number);
  const b = latest.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av < bv) return -1;
    if (av > bv) return 1;
  }
  return 0;
}

// ─── Check Latest Version ───────────────────────────────────────────

export function checkLatestVersion(): string | null {
  try {
    const result = spawnSync('npm', ['view', 'deckent', 'version'], {
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

// ─── Run Upgrade ────────────────────────────────────────────────────

export function runUpgradeInstall(): boolean {
  try {
    const result = spawnSync('npm', ['install', '-g', 'deckent@latest'], {
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

export function executeUpgrade(opts: { check?: boolean }): void {
  const current = DECKENT_VERSION;
  print(`Current version: ${current}`);

  const latest = checkLatestVersion();
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

  print('Installing update...');
  const success = runUpgradeInstall();
  if (success) {
    print(`Successfully upgraded to ${latest}`);
  } else {
    printError(new Error('Upgrade failed. Try manually: npm install -g deckent@latest'));
    process.exitCode = 1;
  }
}

// ─── Command Registration ───────────────────────────────────────────

export function registerUpgrade(program: Command): void {
  program
    .command('upgrade')
    .description('Self-update deckent')
    .option('--check', 'Only check for updates, do not install')
    .action((opts: { check?: boolean }) => {
      executeUpgrade(opts);
    });
}
