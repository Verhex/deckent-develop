#!/usr/bin/env node
// Clean-state CI reproducer. It never hides or renames live project state: the
// current tracked + selected-untracked source snapshot runs in a disposable Git worktree.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  acquireCiCapacity,
  disposeCiWorkspace,
  materializeCiWorkspace,
  pinCiWorkspace,
  reapStaleCiWorkspaces,
  releaseCiCapacity,
  spawnCiVitest,
  terminateOwnedChild,
} from './ci-sim-workspace.mjs';

const REPO_ROOT = process.env.CI_SIM_ROOT
  ? resolve(process.env.CI_SIM_ROOT)
  : resolve(fileURLToPath(import.meta.url), '..', '..');

/**
 * Materialize a stable dirty-source snapshot, execute Vitest there, then remove
 * only the disposable worktree. Injectable seams keep process tests hermetic.
 */
export async function runCiSim(options = {}) {
  const rootDir = options.rootDir ?? REPO_ROOT;
  const createWorkspace = options.createWorkspace ?? materializeCiWorkspace;
  const disposeWorkspace = options.disposeWorkspace ?? disposeCiWorkspace;
  const runner = options.runner ?? spawnCiVitest;
  const acquireCapacity = options.acquireCapacity ?? acquireCiCapacity;
  const releaseCapacity = options.releaseCapacity ?? releaseCiCapacity;
  const reapWorkspaces = options.reapWorkspaces ?? reapStaleCiWorkspaces;
  const pinWorkspace = options.pinWorkspace ?? pinCiWorkspace;
  let workspace;
  let lease;
  let outcome = { code: 2, signal: null, error: null };
  try {
    lease = await acquireCapacity();
    await reapWorkspaces(rootDir);
    workspace = await createWorkspace(rootDir, {
      includeUntracked: options.includeUntracked ?? [],
      protectedPaths: options.protectedPaths ?? [],
      vitestArgs: options.vitestArgs ?? [],
      dryRun: options.dryRun ?? false,
    });
    workspace.capacityPath = lease?.path;
    options.onWorkspace?.(workspace);
    if (options.dryRun) {
      outcome = { code: 0, signal: null, skipped: true };
    } else {
      const execution = await runner(workspace, options.vitestArgs ?? [], {
        stdio: options.stdio ?? 'inherit',
        onChild: options.onChild,
      });
      outcome = await (execution?.outcome ?? execution);
    }
  } catch (error) {
    outcome = {
      code: 2,
      signal: null,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (workspace && !options.keepWorkspace) {
      try {
        const cleanupErrors = await disposeWorkspace(workspace);
        outcome.cleanupErrors = cleanupErrors;
        if (cleanupErrors.length > 0) outcome.code = 2;
      } catch (error) {
        outcome.cleanupErrors = [error instanceof Error ? error.message : String(error)];
        outcome.code = 2;
      }
    } else if (workspace) {
      try { await pinWorkspace(workspace); } catch (error) {
        outcome.cleanupErrors = [error instanceof Error ? error.message : String(error)];
        outcome.code = 2;
      }
      outcome.workspaceDir = workspace.workspaceDir;
    }
    try { await releaseCapacity(lease); } catch (error) {
      outcome.cleanupErrors = [
        ...(outcome.cleanupErrors ?? []),
        error instanceof Error ? error.message : String(error),
      ];
      outcome.code = 2;
    }
  }
  if (workspace) {
    outcome.snapshotRef = workspace.snapshotRef;
    outcome.receipt = workspace.receipt;
  }
  return outcome;
}

export function parseArgs(argv) {
  const parsed = { dryRun: false, keepWorkspace: false, includeUntracked: [], vitestArgs: [] };
  const args = argv.slice(2);
  const separator = args.indexOf('--');
  const flags = separator >= 0 ? args.slice(0, separator) : args;
  parsed.vitestArgs = separator >= 0 ? args.slice(separator + 1) : [];
  for (let index = 0; index < flags.length; index += 1) {
    const flag = flags[index];
    if (flag === '--dry-run') parsed.dryRun = true;
    else if (flag === '--keep-workspace' || flag === '--keep-stash') parsed.keepWorkspace = true;
    else if (flag === '--include-untracked') {
      const path = flags[index + 1];
      if (!path) throw new Error('E_CI_SIM_INCLUDE_UNTRACKED_VALUE');
      parsed.includeUntracked.push(path);
      index += 1;
    } else if (flag.startsWith('--include-untracked=')) {
      parsed.includeUntracked.push(flag.slice('--include-untracked='.length));
    } else throw new Error(`E_CI_SIM_UNKNOWN_FLAG:${flag}`);
  }
  return parsed;
}

const invokedDirectly = process.argv[1]
  && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (invokedDirectly) {
  const args = parseArgs(process.argv);
  let activeChild;
  let interruptedBy = null;
  let termination = Promise.resolve();
  const signalHandler = (signal) => {
    if (interruptedBy) return;
    interruptedBy = signal;
    process.stderr.write(`[ci-sim] received ${signal}; stopping isolated test process...\n`);
    termination = terminateOwnedChild(activeChild);
  };
  const signals = process.platform === 'win32'
    ? ['SIGINT', 'SIGBREAK']
    : ['SIGINT', 'SIGTERM', 'SIGHUP'];
  for (const signal of signals) process.on(signal, signalHandler);

  process.stderr.write('[ci-sim] materializing isolated dirty-source snapshot...\n');
  const result = await runCiSim({
    ...args,
    onWorkspace: workspace => {
      process.stderr.write(`[ci-sim] workspace-ready snapshot=${workspace.snapshotRef}`
        + ` tracked=${workspace.preview?.trackedCount ?? 0}`
        + ` untracked=${workspace.preview?.untrackedCount ?? 0}\n`);
      const skipped = workspace.preview?.skippedTracked ?? [];
      const omitted = workspace.preview?.omittedUntracked ?? [];
      if (skipped.length > 0) {
        process.stderr.write(`[ci-sim] protected tracked paths skipped=${JSON.stringify(skipped)}\n`);
      }
      if (omitted.length > 0) {
        process.stderr.write(`[ci-sim] WARNING untracked paths omitted=${JSON.stringify(omitted)}`
          + ' (use --include-untracked <path> to include)\n');
      }
    },
    onChild: child => {
      activeChild = child;
      if (interruptedBy) termination = terminateOwnedChild(activeChild);
    },
  });
  await termination;
  for (const signal of signals) process.off(signal, signalHandler);

  if (result.snapshotRef) process.stderr.write(`[ci-sim] snapshot=${result.snapshotRef}\n`);
  if (result.receipt) process.stderr.write(`[ci-sim] receipt=${JSON.stringify(result.receipt)}\n`);
  if (result.workspaceDir) process.stderr.write(`[ci-sim] kept workspace=${result.workspaceDir}\n`);
  if (result.error) process.stderr.write(`[ci-sim] ERROR ${result.error}\n`);
  if (result.cleanupErrors?.length) {
    process.stderr.write(`[ci-sim] cleanup errors=${JSON.stringify(result.cleanupErrors)}\n`);
  }
  const exitCode = interruptedBy ? 2 : result.code;
  process.stderr.write(`[ci-sim] vitest exit code=${exitCode}\n`);
  process.exitCode = exitCode;
}
