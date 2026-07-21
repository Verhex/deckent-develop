import { randomUUID } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
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
  manifestProcessGroupAlive,
  readCiChildClaim, readCiManifest,
  releaseCiCapacity, updateCiManifest,
} from './ci-sim-state.mjs';
export { runProcess, terminateOwnedChild } from './ci-sim-process.mjs';
export { acquireCiCapacity, releaseCiCapacity } from './ci-sim-state.mjs';
function inside(root, candidate) {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}
export function ciWorkspacePrefix(root) {
  return `deckent-ci-sim-${digest(resolve(root)).slice(0, 12)}-`;
}
async function removeExactWorkspace(workspace) {
  const cleanupHome = workspace.homeDir ?? join(workspace.baseDir, 'home');
  const gitEnv = workspace.gitEnv ?? sanitizedCiEnvironment({
    homeDir: cleanupHome,
  }, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(cleanupHome, '.gitconfig-empty') });
  const result = await runProcess('git', [...(workspace.gitArgsPrefix ?? []),
    'worktree', 'remove', '--force', workspace.workspaceDir,
  ], { cwd: workspace.rootDir, env: gitEnv });
  if (result.code !== 0) {
    const workspaceStillExists = await lstat(workspace.workspaceDir).then(() => true).catch(() => false);
    const alreadyRemoved = !workspaceStillExists && result.stderr.includes('is not a working tree');
    if (!alreadyRemoved) return `E_CI_SIM_CLEANUP:${result.stderr.trim()}`;
  }
  await rm(workspace.baseDir, { recursive: true, force: true });
  return null;
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
  const prefix = ciWorkspacePrefix(rootDir);
  const entries = await readdir(tmpdir(), { withFileTypes: true });
  const reaped = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith(prefix)) continue;
    const baseDir = join(tmpdir(), entry.name);
    const manifestPath = join(baseDir, 'manifest.json');
    const manifest = await readCiManifest(manifestPath);
    const claim = await readCiChildClaim(manifestPath);
    const workspaceDir = resolve(manifest.workspaceDir);
    if (resolve(manifest.rootDir) !== rootDir || !inside(baseDir, workspaceDir)) {
      throw new Error(`E_CI_SIM_STALE_HOLD:SCOPE_MISMATCH:${baseDir}`);
    }
    if (manifest.retained === true) continue;
    if (claim && (claim.runNonce !== manifest.runNonce
      || (manifest.childPid !== undefined && claim.childPid !== manifest.childPid))) {
      throw new Error(`E_CI_SIM_STALE_HOLD:CHILD_CLAIM_CONFLICT:${baseDir}`);
    }
    const childPid = Number(manifest.childPid ?? claim?.childPid);
    if (manifestPidAlive(manifest.ownerPid) || manifestPidAlive(childPid)
      || manifestProcessGroupAlive(childPid)) {
      throw new Error(`E_CI_SIM_STALE_HOLD:PROCESS_ID_UNVERIFIED:${baseDir}`);
    }
    const cleanupError = await removeExactWorkspace({ rootDir, baseDir, workspaceDir });
    if (cleanupError) throw new Error(cleanupError);
    reaped.push(baseDir);
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
    await updateCiManifest(workspace, current => ({
      ...current, state: 'ready', snapshotRef: provenance.snapshotRef,
      receipt: provenance.receipt, preview: provenance.preview,
    }));
    return workspace;
  } catch (error) {
    if (registration === 'present') {
      const cleanupError = await removeExactWorkspace(workspace);
      if (cleanupError) throw new AggregateError([error, new Error(cleanupError)], 'E_CI_SIM_CREATE_CLEANUP_HOLD');
    } else if (registration === 'absent') {
      await rm(baseDir, { recursive: true, force: true });
    }
    throw error;
  }
}
export async function disposeCiWorkspace(workspace) {
  const error = await removeExactWorkspace(workspace);
  return error ? [error] : [];
}
export async function pinCiWorkspace(workspace) {
  await updateCiManifest(workspace, current => ({ ...current, retained: true, state: 'retained' }));
}
async function recordWorkspaceChild(workspace, childPid) {
  await claimCiChild(workspace, childPid);
  await updateCiManifest(workspace, current => {
    if (current.childPid !== undefined && current.childPid !== childPid) {
      throw new Error('E_CI_SIM_MANIFEST_CHILD_CONFLICT');
    }
    if (!['ready', 'child-recorded'].includes(current.state)) {
      throw new Error(`E_CI_SIM_MANIFEST_STATE:${current.state}`);
    }
    return { ...current, childPid, state: 'child-recorded' };
  });
}
export async function spawnCiVitest(workspace, extraArgs = [], options = {}) {
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
