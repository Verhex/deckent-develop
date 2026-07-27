import { randomUUID } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import {
  basename, dirname, isAbsolute, join, relative, resolve, sep,
} from 'node:path';
import {
  runProcess,
  sanitizedCiEnvironment,
  spawnGatedRunner,
  terminateOwnedChild,
} from './ci-sim-process.mjs';
import { cloneDependencies } from './ci-sim-dependencies.mjs';
import {
  applySourceSnapshot, captureSourceSnapshot,
  digest,
  validateSnapshotTree,
  verifyStableSnapshot,
} from './ci-sim-snapshot.mjs';
import { snapshotReference } from './ci-sim-receipt.mjs';
import {
  acquireCiCapacity, claimCiChild, createCiManifest, manifestPidAlive,
  beginCiWorkspaceCleanupAttempt,
  claimCiPrebirthWorkspaceCleanup,
  claimCiWorkspaceCleanup,
  ciManifestCleanupDisposition,
  commitCiWorkspaceCleanupAttempt,
  markCiWorkspaceReady,
  manifestProcessGroupAlive,
  recordCiLegacyChild,
  readCiChildClaim, readCiContainmentResourceClaim, readCiManifest,
  releaseCiWorkspaceCleanupAttempt,
  releaseCiCapacity, retainCiWorkspace,
  verifyCiWorkspaceCleanupAttempt,
} from './ci-sim-state.mjs';
export { runProcess, terminateOwnedChild } from './ci-sim-process.mjs';
export { acquireCiCapacity, releaseCiCapacity } from './ci-sim-state.mjs';
export {
  authorizeCiCandidateBirth,
  claimCiContainmentResource,
  recordCiContainmentCompletion,
  recordCiContainmentFinality,
  recordCiContainmentPrepareIntent,
  recordCiContainmentRunning,
} from './ci-sim-state.mjs';
function inside(root, candidate) {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}
export function ciWorkspacePrefix(root) {
  return `deckent-ci-sim-${digest(resolve(root)).slice(0, 32)}-`;
}
function ciWorkspacePrefixes(root) {
  const rootDigest = digest(resolve(root));
  return [
    `deckent-ci-sim-${rootDigest.slice(0, 32)}-`,
    `deckent-ci-sim-${rootDigest.slice(0, 12)}-`,
  ];
}
function exactWorkspaceAuthority(workspace, manifest = null) {
  const manifestPath = resolve(workspace?.manifestPath ?? '');
  const baseDir = dirname(manifestPath);
  const rootDir = resolve(manifest?.rootDir ?? workspace?.rootDir ?? '');
  const workspaceDir = resolve(manifest?.workspaceDir ?? workspace?.workspaceDir ?? '');
  const runNonce = manifest?.runNonce ?? workspace?.runNonce;
  if (!manifestPath
    || manifestPath !== join(baseDir, 'manifest.json')
    || dirname(baseDir) !== resolve(tmpdir())
    || !ciWorkspacePrefixes(rootDir).some(prefix => (
      basename(baseDir).startsWith(prefix)
    ))
    || workspaceDir !== join(baseDir, 'worktree')
    || !inside(baseDir, workspaceDir)
    || typeof runNonce !== 'string'
    || runNonce.length === 0) {
    throw new Error('E_CI_SIM_CLEANUP_HOLD:WORKSPACE_AUTHORITY_INVALID');
  }
  if (workspace?.runNonce !== undefined && workspace.runNonce !== runNonce) {
    throw new Error('E_CI_SIM_CLEANUP_HOLD:RUN_NONCE_MISMATCH');
  }
  if (manifest && (resolve(manifest.rootDir) !== rootDir
    || resolve(manifest.workspaceDir) !== workspaceDir)) {
    throw new Error('E_CI_SIM_CLEANUP_HOLD:MANIFEST_SCOPE_MISMATCH');
  }
  return {
    rootDir,
    baseDir,
    workspaceDir,
    homeDir: join(baseDir, 'home'),
    manifestPath,
    runNonce,
  };
}
function samePhysicalIdentity(before, after) {
  return before.dev === after.dev
    && before.ino === after.ino
    && before.mode === after.mode
    && before.isDirectory() === after.isDirectory()
    && before.isFile() === after.isFile()
    && before.isSymbolicLink() === after.isSymbolicLink();
}
async function removeExactWorkspace(workspace, options = {}) {
  let authority;
  let initialManifest;
  let initialBaseStat;
  let initialManifestStat;
  try {
    initialManifest = await readCiManifest(resolve(workspace?.manifestPath ?? ''));
    authority = exactWorkspaceAuthority(workspace, initialManifest);
    if (initialManifest.schemaVersion === 3
      && typeof options.verifyCleanup !== 'function') {
      return 'E_CI_SIM_CLEANUP_HOLD:CLEANUP_LEASE_REQUIRED';
    }
    if (options.verifyCleanup
      && !await options.verifyCleanup(initialManifest)) {
      return 'E_CI_SIM_CLEANUP_HOLD:CLEANUP_LEASE_INVALID';
    }
    const [baseStat, manifestStat, workspaceStat] = await Promise.all([
      lstat(authority.baseDir),
      lstat(authority.manifestPath),
      lstat(authority.workspaceDir).catch(error => (
        error?.code === 'ENOENT' ? null : Promise.reject(error)
      )),
    ]);
    if (!baseStat.isDirectory() || baseStat.isSymbolicLink()
      || !manifestStat.isFile() || manifestStat.isSymbolicLink()
      || (workspaceStat && (!workspaceStat.isDirectory() || workspaceStat.isSymbolicLink()))) {
      return 'E_CI_SIM_CLEANUP_HOLD:WORKSPACE_PHYSICAL_IDENTITY_INVALID';
    }
    initialBaseStat = baseStat;
    initialManifestStat = manifestStat;
  } catch (error) {
    return error instanceof Error
      ? error.message
      : 'E_CI_SIM_CLEANUP_HOLD:WORKSPACE_AUTHORITY_INVALID';
  }
  const cleanupHome = authority.homeDir;
  const gitEnv = sanitizedCiEnvironment({
    homeDir: cleanupHome,
  }, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(cleanupHome, '.gitconfig-empty') });
  const hooksDir = join(cleanupHome, 'empty-hooks');
  const gitArgsPrefix = ['-c', `core.hooksPath=${hooksDir}`, '-c', 'core.fsmonitor=false'];
  const result = await runProcess('git', [...gitArgsPrefix,
    'worktree', 'remove', '--force', authority.workspaceDir,
  ], { cwd: authority.rootDir, env: gitEnv });
  if (result.code !== 0) {
    const workspaceStillExists = await lstat(authority.workspaceDir)
      .then(() => true)
      .catch(() => false);
    const alreadyRemoved = !workspaceStillExists && result.stderr.includes('is not a working tree');
    if (!alreadyRemoved) return `E_CI_SIM_CLEANUP:${result.stderr.trim()}`;
  }
  let rebound;
  let reboundManifest;
  try {
    reboundManifest = await readCiManifest(authority.manifestPath);
    rebound = exactWorkspaceAuthority(authority, reboundManifest);
    if (options.verifyCleanup
      && !await options.verifyCleanup(reboundManifest)) {
      return 'E_CI_SIM_CLEANUP_HOLD:CLEANUP_LEASE_REBIND_INVALID';
    }
    const [reboundBaseStat, reboundManifestStat] = await Promise.all([
      lstat(rebound.baseDir),
      lstat(rebound.manifestPath),
    ]);
    if (!samePhysicalIdentity(initialBaseStat, reboundBaseStat)
      || !samePhysicalIdentity(initialManifestStat, reboundManifestStat)
      || !reboundBaseStat.isDirectory()
      || reboundBaseStat.isSymbolicLink()
      || !reboundManifestStat.isFile()
      || reboundManifestStat.isSymbolicLink()) {
      return 'E_CI_SIM_CLEANUP_HOLD:WORKSPACE_PHYSICAL_REBIND_CONFLICT';
    }
  } catch (error) {
    return error instanceof Error
      ? error.message
      : 'E_CI_SIM_CLEANUP_HOLD:MANIFEST_REBIND_FAILED';
  }
  if (rebound.baseDir !== authority.baseDir
    || rebound.rootDir !== authority.rootDir
    || rebound.workspaceDir !== authority.workspaceDir
    || rebound.runNonce !== authority.runNonce) {
    return 'E_CI_SIM_CLEANUP_HOLD:MANIFEST_REBIND_CONFLICT';
  }
  await rm(authority.baseDir, { recursive: true, force: true });
  return null;
}
async function removeWorkspaceWithCleanupLease(workspace, cleanupLease) {
  const verifyCleanup = async candidateManifest => {
    const candidateResourceClaim = await readCiContainmentResourceClaim(
      workspace.manifestPath,
    );
    return verifyCiWorkspaceCleanupAttempt(
      cleanupLease,
      candidateManifest,
      candidateResourceClaim,
    );
  };
  let cleanupError;
  try {
    cleanupError = await removeExactWorkspace(workspace, { verifyCleanup });
  } catch (error) {
    cleanupError = error instanceof Error
      ? error.message
      : 'E_CI_SIM_CLEANUP_HOLD:CLEANUP_EXECUTION_FAILED';
  }
  if (cleanupError) {
    releaseCiWorkspaceCleanupAttempt(cleanupLease);
    return cleanupError;
  }
  return commitCiWorkspaceCleanupAttempt(cleanupLease)
    ? null
    : 'E_CI_SIM_CLEANUP_HOLD:CLEANUP_COMMIT_FAILED';
}
async function exactWorktreeRegistered(workspace) {
  const result = await runProcess('git', [...(workspace.gitArgsPrefix ?? []),
    'worktree', 'list', '--porcelain', '-z'], {
    cwd: workspace.rootDir, env: workspace.gitEnv,
  });
  if (result.code !== 0) throw new Error(`E_CI_SIM_GIT:worktree list:${result.stderr.trim()}`);
  return result.stdout.split('\0').includes(`worktree ${workspace.workspaceDir}`);
}
export async function reapStaleCiWorkspaces(root) {
  const rootDir = resolve(root);
  const prefixes = ciWorkspacePrefixes(rootDir);
  const entries = await readdir(tmpdir(), { withFileTypes: true });
  const reaped = [];
  const holds = [];
  for (const entry of entries) {
    if (!entry.isDirectory()
      || !prefixes.some(prefix => entry.name.startsWith(prefix))) continue;
    const baseDir = join(tmpdir(), entry.name);
    const manifestPath = join(baseDir, 'manifest.json');
    try {
      const manifest = await readCiManifest(manifestPath);
      if (manifest.retained === true) continue;
      const claim = await readCiChildClaim(manifestPath);
      const resourceClaim = await readCiContainmentResourceClaim(manifestPath);
      const workspaceDir = resolve(manifest.workspaceDir);
      if (resolve(manifest.rootDir) !== rootDir || !inside(baseDir, workspaceDir)) {
        throw new Error(`E_CI_SIM_STALE_HOLD:SCOPE_MISMATCH:${baseDir}`);
      }
      const cleanupDisposition = ciManifestCleanupDisposition(manifest, resourceClaim);
      if (cleanupDisposition.decision === 'RETAIN') continue;
      if (cleanupDisposition.decision === 'HOLD') {
        throw new Error(`${cleanupDisposition.code}:${baseDir}`);
      }
      if (claim && (claim.runNonce !== manifest.runNonce
        || (manifest.childPid !== undefined && claim.childPid !== manifest.childPid))) {
        throw new Error(`E_CI_SIM_STALE_HOLD:CHILD_CLAIM_CONFLICT:${baseDir}`);
      }
      const childPid = Number(manifest.childPid ?? claim?.childPid);
      if (manifestPidAlive(manifest.ownerPid) || manifestPidAlive(childPid)
        || manifestProcessGroupAlive(childPid)) {
        throw new Error(`E_CI_SIM_STALE_HOLD:PROCESS_ID_UNVERIFIED:${baseDir}`);
      }
      const staleWorkspace = {
        rootDir,
        baseDir,
        workspaceDir,
        homeDir: join(baseDir, 'home'),
        manifestPath,
        runNonce: manifest.runNonce,
      };
      let cleanupError;
      if (cleanupDisposition.code
        === 'E_CI_SIM_CONTAINMENT_PRE_BIRTH_DISPOSABLE') {
        const claimed = await claimCiPrebirthWorkspaceCleanup(staleWorkspace);
        cleanupError = await removeWorkspaceWithCleanupLease(
          staleWorkspace,
          claimed.cleanupLease,
        );
      } else {
        cleanupError = await removeExactWorkspace(staleWorkspace);
      }
      if (cleanupError) throw new Error(cleanupError);
      reaped.push(baseDir);
    } catch (error) {
      holds.push(error instanceof Error
        ? error
        : new Error(`E_CI_SIM_STALE_HOLD:UNKNOWN:${baseDir}`));
    }
  }
  if (holds.length > 0) {
    const summary = holds.map(error => error.message).join(';');
    const aggregate = new AggregateError(holds, summary);
    aggregate.code = 'E_CI_SIM_STALE_SCAN_HOLD';
    aggregate.reaped = Object.freeze([...reaped]);
    aggregate.holds = Object.freeze(holds.map(error => error.message));
    throw aggregate;
  }
  return reaped;
}
export async function materializeCiWorkspace(root, options = {}) {
  const rootDir = resolve(root);
  const baseDir = await mkdtemp(join(tmpdir(), ciWorkspacePrefix(rootDir)));
  const workspaceDir = join(baseDir, 'worktree');
  const homeDir = join(baseDir, 'home');
  const manifestPath = join(baseDir, 'manifest.json');
  const runNonce = randomUUID();
  const containmentMode = options.containmentMode === 'enforce'
    ? 'enforce'
    : 'audit-unenforced';
  await mkdir(join(homeDir, 'tmp'), { recursive: true });
  const hooksDir = join(homeDir, 'empty-hooks');
  await mkdir(hooksDir, { recursive: true });
  const gitEnv = sanitizedCiEnvironment({ homeDir }, {
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(homeDir, '.gitconfig-empty'),
    GIT_ATTR_NOSYSTEM: '1', GIT_EXTERNAL_DIFF: '',
  });
  const gitArgsPrefix = ['-c', `core.hooksPath=${hooksDir}`, '-c', 'core.fsmonitor=false'];
  const workspace = {
    rootDir, baseDir, workspaceDir, homeDir, manifestPath, runNonce, gitEnv, gitArgsPrefix,
    containmentMode,
  };
  let registration = 'absent';
  try {
    await createCiManifest(workspace);
    const unsafeConfig = await runProcess('git', [...gitArgsPrefix, 'config', '--local',
      '--get-regexp', '^(filter\\..*\\.(clean|smudge|process|required)|diff\\..*\\.textconv)$'], {
      cwd: rootDir, env: gitEnv,
    });
    if (unsafeConfig.code === 0) {
      throw new Error(`E_CI_SIM_GIT_EXECUTABLE_CONFIG:${unsafeConfig.stdout.trim()}`);
    }
    if (unsafeConfig.code !== 1) {
      throw new Error(`E_CI_SIM_GIT:config audit:${unsafeConfig.stderr.trim()}`);
    }
    const snapshotOptions = { ...options, gitEnv, gitArgsPrefix };
    const before = await captureSourceSnapshot(rootDir, snapshotOptions);
    const added = await runProcess('git', [...gitArgsPrefix,
      'worktree', 'add', '--detach', workspaceDir, before.head,
    ], { cwd: rootDir, env: gitEnv });
    if (added.code !== 0) {
      try {
        registration = await exactWorktreeRegistered(workspace) ? 'present' : 'absent';
      } catch (registrationError) {
        registration = 'unknown';
        throw new AggregateError([
          new Error(`E_CI_SIM_GIT:worktree add:${added.stderr.trim()}`), registrationError,
        ], 'E_CI_SIM_WORKTREE_REGISTRATION_HOLD');
      }
      throw new Error(`E_CI_SIM_GIT:worktree add:${added.stderr.trim()}`);
    }
    registration = 'present';
    await applySourceSnapshot(rootDir, workspaceDir, before);
    const materializedTreeRef = await validateSnapshotTree(workspaceDir, before);
    await verifyStableSnapshot(rootDir, before, snapshotOptions);
    const dependencyRef = options.dryRun
      ? 'not-materialized:dry-run'
      : await cloneDependencies(rootDir, workspaceDir);
    const provenance = snapshotReference(
      before, dependencyRef, materializedTreeRef, options.vitestArgs ?? [],
    );
    Object.assign(workspace, provenance);
    await markCiWorkspaceReady(workspace, provenance);
    return workspace;
  } catch (error) {
    if (registration === 'present') {
      let cleanupError;
      if (workspace.containmentMode === 'enforce') {
        try {
          const claimed = await claimCiPrebirthWorkspaceCleanup(workspace);
          cleanupError = await removeWorkspaceWithCleanupLease(
            workspace,
            claimed.cleanupLease,
          );
        } catch (cleanupClaimError) {
          cleanupError = cleanupClaimError instanceof Error
            ? cleanupClaimError.message
            : 'E_CI_SIM_CREATE_CLEANUP_HOLD';
        }
      } else {
        cleanupError = await removeExactWorkspace(workspace);
      }
      if (cleanupError) throw new AggregateError([error, new Error(cleanupError)], 'E_CI_SIM_CREATE_CLEANUP_HOLD');
    } else if (registration === 'absent') {
      await rm(baseDir, { recursive: true, force: true });
    }
    throw error;
  }
}
export async function disposeCiWorkspace(workspace, cleanupAuthority = null) {
  const manifest = await readCiManifest(workspace.manifestPath);
  let authority;
  try {
    authority = exactWorkspaceAuthority(workspace, manifest);
  } catch (error) {
    return [error instanceof Error
      ? error.message
      : 'E_CI_SIM_CLEANUP_HOLD:WORKSPACE_AUTHORITY_INVALID'];
  }
  const resourceClaim = await readCiContainmentResourceClaim(workspace.manifestPath);
  const cleanupDisposition = ciManifestCleanupDisposition(
    manifest,
    resourceClaim,
    cleanupAuthority,
  );
  if (cleanupDisposition.decision !== 'DISPOSE') return [cleanupDisposition.code];
  if (cleanupDisposition.code
    === 'E_CI_SIM_CONTAINMENT_PRE_BIRTH_DISPOSABLE') {
    try {
      const claimed = await claimCiPrebirthWorkspaceCleanup(authority);
      const cleanupError = await removeWorkspaceWithCleanupLease(
        authority,
        claimed.cleanupLease,
      );
      return cleanupError ? [cleanupError] : [];
    } catch (error) {
      return [error instanceof Error
        ? error.message
        : 'E_CI_SIM_CLEANUP_HOLD:PREBIRTH_CLEANUP_CLAIM_FAILED'];
    }
  }
  if (cleanupDisposition.code !== 'E_CI_SIM_CONTAINMENT_FINALITY_PROVEN') {
    const error = await removeExactWorkspace(authority);
    return error ? [error] : [];
  }
  let cleanupManifest;
  try {
    cleanupManifest = await claimCiWorkspaceCleanup(
      authority,
      resourceClaim,
      cleanupAuthority,
    );
  } catch (error) {
    return [error instanceof Error
      ? error.message
      : 'E_CI_SIM_CLEANUP_HOLD:CLEANUP_CLAIM_FAILED'];
  }
  const cleanupLease = beginCiWorkspaceCleanupAttempt(
    cleanupManifest,
    resourceClaim,
    cleanupAuthority,
  );
  if (!cleanupLease) {
    return ['E_CI_SIM_CLEANUP_HOLD:CLEANUP_LEASE_CONFLICT'];
  }
  const cleanupError = await removeWorkspaceWithCleanupLease(
    authority,
    cleanupLease,
  );
  return cleanupError ? [cleanupError] : [];
}
export async function pinCiWorkspace(workspace) {
  await retainCiWorkspace(workspace);
}
async function recordWorkspaceChild(workspace, childPid) {
  const manifest = await readCiManifest(workspace.manifestPath);
  if (manifest.schemaVersion !== 2) {
    throw new Error('E_CI_SIM_CONTAINMENT_LEGACY_CHILD_CLAIM_FORBIDDEN');
  }
  await claimCiChild(workspace, childPid);
  await recordCiLegacyChild(workspace, childPid);
}
export async function spawnCiVitest(workspace, extraArgs = [], options = {}) {
  const manifest = await readCiManifest(workspace.manifestPath);
  if (manifest.schemaVersion !== 2 || manifest.containment !== undefined
    || workspace.containmentMode === 'enforce') {
    throw new Error('E_CI_SIM_CONTAINMENT_LEGACY_RUNNER_FORBIDDEN');
  }
  validateCiVitestArgs(extraArgs);
  const modeArgs = [join(workspace.workspaceDir, 'node_modules', 'vitest', 'vitest.mjs'),
    ...extraArgs, '--pool=forks', '--maxWorkers=2', '--minWorkers=1'];
  const env = sanitizedCiEnvironment(workspace);
  const runner = join(workspace.workspaceDir, 'scripts', 'ci-sim-runner.mjs');
  return spawnGatedRunner(process.execPath, [runner, workspace.runNonce, ...modeArgs], {
    cwd: workspace.workspaceDir,
    env,
    stdio: options.stdio ?? 'inherit',
    runNonce: workspace.runNonce,
    recordChild: pid => recordWorkspaceChild(workspace, pid),
    onChild: options.onChild,
  });
}
export function validateCiVitestArgs(extraArgs = []) {
  const forbidden = /^(?:-c$|--config(?:=|$)|--pool(?:=|$)|--maxWorkers(?:=|$)|--minWorkers(?:=|$)|--poolOptions(?:\.|=|$))/u;
  const unsafeArg = extraArgs.find(arg => arg === '--' || forbidden.test(arg));
  if (unsafeArg) throw new Error(`E_CI_SIM_RESOURCE_OVERRIDE:${unsafeArg}`);
}
