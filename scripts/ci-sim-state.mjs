import { open, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { atomicJson, syncCreatedFile } from './ci-sim-durable-json.mjs';

const MANIFEST_VERSION = 2;
function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error?.code === 'EPERM'; }
}

export async function readCiManifest(path) {
  let value;
  try { value = JSON.parse(await readFile(path, 'utf8')); } catch {
    throw new Error(`E_CI_SIM_STALE_HOLD:MALFORMED_MANIFEST:${path}`);
  }
  if (value?.schemaVersion !== MANIFEST_VERSION || typeof value.runNonce !== 'string'
    || typeof value.rootDir !== 'string' || typeof value.workspaceDir !== 'string'
    || !Number.isInteger(value.ownerPid) || value.ownerPid <= 0
    || (value.childPid !== undefined && (!Number.isInteger(value.childPid) || value.childPid <= 0))
    || typeof value.state !== 'string') {
    throw new Error(`E_CI_SIM_STALE_HOLD:INVALID_MANIFEST:${path}`);
  }
  return value;
}

export async function createCiManifest(workspace) {
  await atomicJson(workspace.manifestPath, {
    schemaVersion: MANIFEST_VERSION,
    runNonce: workspace.runNonce,
    rootDir: workspace.rootDir,
    workspaceDir: workspace.workspaceDir,
    ownerPid: process.pid,
    state: 'creating',
    createdAt: new Date().toISOString(),
  });
}

export async function updateCiManifest(workspace, mutate) {
  const current = await readCiManifest(workspace.manifestPath);
  if (current.runNonce !== workspace.runNonce
    || resolve(current.rootDir) !== workspace.rootDir
    || resolve(current.workspaceDir) !== workspace.workspaceDir) {
    throw new Error('E_CI_SIM_MANIFEST_SCOPE_MISMATCH');
  }
  const next = mutate(current);
  await atomicJson(workspace.manifestPath, next);
  return next;
}

export async function claimCiChild(workspace, childPid) {
  if (!Number.isInteger(childPid) || childPid <= 0) {
    throw new Error('E_CI_SIM_MANIFEST_CHILD_PID_INVALID');
  }
  const claimPath = `${workspace.manifestPath}.child-claim`;
  try {
    const handle = await open(claimPath, 'wx', 0o600);
    try {
      await handle.writeFile(`${JSON.stringify({ runNonce: workspace.runNonce, childPid })}\n`);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await syncCreatedFile(claimPath);
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    let claim;
    try { claim = JSON.parse(await readFile(claimPath, 'utf8')); } catch {
      throw new Error('E_CI_SIM_MANIFEST_CHILD_CLAIM_HOLD');
    }
    if (claim.runNonce !== workspace.runNonce || claim.childPid !== childPid) {
      throw new Error('E_CI_SIM_MANIFEST_CHILD_CONFLICT');
    }
  }
}

export async function readCiChildClaim(manifestPath) {
  const claimPath = `${manifestPath}.child-claim`;
  let raw;
  try { raw = await readFile(claimPath, 'utf8'); } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
  let claim;
  try { claim = JSON.parse(raw); } catch { throw new Error('E_CI_SIM_MANIFEST_CHILD_CLAIM_HOLD'); }
  if (typeof claim.runNonce !== 'string' || !Number.isInteger(claim.childPid)
    || claim.childPid <= 0) {
    throw new Error('E_CI_SIM_MANIFEST_CHILD_CLAIM_HOLD');
  }
  return claim;
}

export function manifestPidAlive(pid) {
  return pidAlive(pid);
}

export { acquireCiCapacity, releaseCiCapacity } from './ci-sim-capacity.mjs';

export function manifestProcessGroupAlive(pid) {
  if (process.platform === 'win32' || !Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(-pid, 0); return true; } catch (error) { return error?.code === 'EPERM'; }
}
