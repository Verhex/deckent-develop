#!/usr/bin/env node

import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  disposeCiWorkspace,
  materializeCiWorkspace,
  pinCiWorkspace,
  validateCiVitestArgs,
} from './ci-sim-workspace.mjs';
import { sanitizedCiEnvironment } from './ci-sim-process.mjs';
import { runCiSim } from './test-ci-sim.mjs';
import {
  probeContainmentControlPlane,
  runContainmentControlPlane,
} from './hermeticity/containment-control-plane.mjs';

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');

function hold(code, details = {}) {
  return {
    code: 2,
    signal: null,
    state: 'HOLD',
    executed: false,
    containment: {
      state: 'HOLD',
      code,
      proofEligible: false,
      receiptAuthenticated: false,
      retain: details.retain !== false,
      ...details,
    },
  };
}

export function buildContainedCiCandidate(workspace, vitestArgs) {
  validateCiVitestArgs(vitestArgs);
  const bootstrapPath = join(
    workspace.workspaceDir,
    'scripts',
    'hermeticity',
    'process-bootstrap.mjs',
  );
  const vitestPath = join(
    workspace.workspaceDir,
    'node_modules',
    'vitest',
    'vitest.mjs',
  );
  const descriptorPath = process.platform === 'linux'
    ? '/proc/self/fd'
    : process.platform === 'darwin'
      ? '/dev/fd'
      : null;
  return {
    command: process.execPath,
    args: [
      '--permission',
      `--allow-fs-read=${workspace.workspaceDir}`,
      `--allow-fs-write=${workspace.homeDir}`,
      ...(descriptorPath ? [`--allow-fs-read=${descriptorPath}`] : []),
      bootstrapPath,
      '--entry',
      vitestPath,
      '--',
      'run',
      '--no-cache',
      ...vitestArgs,
      '--pool=forks',
      '--maxWorkers=2',
      '--minWorkers=1',
    ],
    cwd: workspace.workspaceDir,
    env: sanitizedCiEnvironment(workspace),
  };
}

export function parseContainedCiArgs(argv) {
  const parsed = {
    mode: 'probe',
    includeUntracked: [],
    vitestArgs: [],
  };
  const args = argv.slice(2);
  const separator = args.indexOf('--');
  const flags = separator >= 0 ? args.slice(0, separator) : args;
  parsed.vitestArgs = separator >= 0 ? args.slice(separator + 1) : [];
  for (let index = 0; index < flags.length; index += 1) {
    const flag = flags[index];
    if (flag === '--probe') parsed.mode = 'probe';
    else if (flag === '--live') parsed.mode = 'enforce';
    else if (flag === '--include-untracked') {
      const path = flags[index + 1];
      if (!path) throw new Error('E_CONTAINMENT_INCLUDE_UNTRACKED_VALUE');
      parsed.includeUntracked.push(path);
      index += 1;
    } else if (flag.startsWith('--include-untracked=')) {
      parsed.includeUntracked.push(flag.slice('--include-untracked='.length));
    } else {
      throw new Error(`E_CONTAINMENT_UNKNOWN_FLAG:${flag}`);
    }
  }
  return parsed;
}

/**
 * Contained compatibility wrapper for the existing CI snapshot orchestrator.
 * Probe mode never materializes a workspace or creates a candidate process.
 */
export async function runContainedCiSim(options = {}) {
  const mode = options.mode ?? 'probe';
  const liveAuthorized = options.liveAuthorized === true;
  if (mode !== 'enforce' || !liveAuthorized) {
    const containment = await probeContainmentControlPlane({
      ...options,
      mode: 'probe',
    });
    return {
      code: 2,
      signal: null,
      state: 'HOLD',
      executed: false,
      containment,
    };
  }
  const liveEvidenceGate = await runContainmentControlPlane({
    ...options,
    mode: 'enforce',
    liveAuthorized: true,
  });
  if (liveEvidenceGate.code
    === 'E_CONTAINMENT_HOLD_LIVE_EVIDENCE_AUTHORITY_REQUIRED') {
    return {
      code: 2,
      signal: null,
      state: 'HOLD',
      executed: false,
      containment: liveEvidenceGate,
    };
  }

  const rootDir = options.rootDir ?? REPO_ROOT;
  const runLegacy = options.runLegacy ?? runCiSim;
  const createWorkspace = options.createWorkspace
    ?? ((root, workspaceOptions) => materializeCiWorkspace(root, {
      ...workspaceOptions,
      containmentMode: 'enforce',
    }));
  const disposeWorkspace = options.disposeWorkspace ?? disposeCiWorkspace;
  const retainWorkspace = options.pinWorkspace ?? pinCiWorkspace;
  const buildCandidate = options.buildCandidate ?? buildContainedCiCandidate;
  let workspace;
  let containment;
  let cleanupAuthority;

  const legacyResult = await runLegacy({
    rootDir,
    includeUntracked: options.includeUntracked ?? [],
    protectedPaths: options.protectedPaths ?? [],
    vitestArgs: options.vitestArgs ?? [],
    stdio: 'pipe',
    keepWorkspace: true,
    createWorkspace,
    acquireCapacity: options.acquireCapacity,
    releaseCapacity: options.releaseCapacity,
    reapWorkspaces: options.reapWorkspaces,
    pinWorkspace: created => containment?.state === 'GO'
      ? Promise.resolve()
      : retainWorkspace(created),
    onWorkspace: created => {
      workspace = created;
      options.onWorkspace?.(created);
    },
    runner: async (created, vitestArgs) => {
      workspace = created;
      let candidate;
      try {
        candidate = await buildCandidate(created, vitestArgs);
      } catch {
        containment = {
          state: 'HOLD',
          code: 'E_CONTAINMENT_HOLD_CANDIDATE_BUILD',
          retain: true,
        };
        return {
          outcome: Promise.resolve({ code: 2, signal: null }),
        };
      }
      containment = await runContainmentControlPlane({
        ...options,
        mode: 'enforce',
        liveAuthorized: true,
        workspace: created,
        runNonce: created.runNonce,
        resourceId: options.resourceId ?? created.runNonce,
        candidate,
        acceptCleanupAuthority: authority => {
          cleanupAuthority = authority;
        },
      });
      return {
        outcome: Promise.resolve({
          code: containment.state === 'GO'
            ? containment.execution?.outcome?.code ?? 2
            : 2,
          signal: containment.state === 'GO'
            ? containment.execution?.outcome?.signal ?? null
            : null,
        }),
      };
    },
  });

  if (!containment) {
    return hold('E_CONTAINMENT_HOLD_LEGACY_ORCHESTRATION', {
      retain: Boolean(workspace),
      legacy: {
        code: legacyResult.code,
        signal: legacyResult.signal,
        error: legacyResult.error ?? null,
      },
    });
  }
  if (containment.state !== 'GO') {
    return {
      code: 2,
      signal: null,
      state: 'HOLD',
      executed: containment.liveExecution === true,
      workspaceDir: legacyResult.workspaceDir,
      containment,
    };
  }
  if (!workspace) {
    return hold('E_CONTAINMENT_HOLD_WORKSPACE_IDENTITY_MISSING');
  }

  let cleanupErrors;
  try {
    cleanupErrors = await disposeWorkspace(workspace, cleanupAuthority);
  } catch {
    cleanupErrors = ['E_CONTAINMENT_CLEANUP_UNKNOWN'];
  }
  if (!Array.isArray(cleanupErrors) || cleanupErrors.length > 0) {
    return {
      code: 2,
      signal: null,
      state: 'HOLD',
      executed: true,
      workspaceDir: workspace.workspaceDir,
      containment: {
        ...containment,
        state: 'HOLD',
        code: 'E_CONTAINMENT_HOLD_CLEANUP_UNVERIFIED',
        retain: true,
      },
      cleanupErrors: Array.isArray(cleanupErrors)
        ? cleanupErrors
        : ['E_CONTAINMENT_CLEANUP_RESULT_INVALID'],
    };
  }

  return {
    code: legacyResult.code,
    signal: legacyResult.signal,
    state: 'SETTLED',
    executed: true,
    containment,
    snapshotRef: legacyResult.snapshotRef,
    sourceReceipt: legacyResult.receipt,
  };
}

if (import.meta.main) {
  let result;
  try {
    const parsed = parseContainedCiArgs(process.argv);
    result = await runContainedCiSim({
      ...parsed,
      liveAuthorized: parsed.mode === 'enforce'
        && process.env.DECKENT_LIVE_CONTAINMENT === '1',
    });
  } catch (error) {
    result = hold(
      error instanceof Error && /^E_[A-Z0-9_:.-]+$/u.test(error.message)
        ? error.message
        : 'E_CONTAINMENT_WRAPPER_FAILURE',
    );
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.code;
}
