import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, rmdir, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { atomicJson } from './ci-sim-durable-json.mjs';

const CAPACITY_MARKER = 'deckent-ci-sim-capacity-v2';
const CAPACITY_DIR = resolve(tmpdir(), CAPACITY_MARKER);

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error?.code === 'EPERM'; }
}

function ownedCapacityPath(value) {
  const path = resolve(value ?? CAPACITY_DIR);
  const rel = relative(resolve(tmpdir()), path);
  if (!rel || isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)
    || !/^deckent-ci-sim-capacity-[a-z0-9._-]+$/iu.test(rel.replaceAll('\\', '/'))) {
    throw new Error(`E_CI_SIM_CAPACITY_HOLD:UNSAFE_PATH:${path}`);
  }
  return path;
}

function validRecord(value, kind) {
  return value?.marker === CAPACITY_MARKER && value.kind === kind
    && typeof value.runNonce === 'string' && Number.isInteger(value.ownerPid)
    && value.ownerPid > 0;
}

async function readRecord(path, kind, missing = false) {
  let raw;
  try { raw = await readFile(path, 'utf8'); } catch (error) {
    if (missing && error?.code === 'ENOENT') return null;
    throw new Error(`E_CI_SIM_CAPACITY_HOLD:MALFORMED_${kind.toUpperCase()}`);
  }
  let value;
  try { value = JSON.parse(raw); } catch { /* validated below */ }
  if (!validRecord(value, kind)) {
    throw new Error(`E_CI_SIM_CAPACITY_HOLD:MALFORMED_${kind.toUpperCase()}`);
  }
  return value;
}

async function removeOwnedDirectory(path, filename, expected, kind) {
  const current = await readRecord(join(path, filename), kind);
  if (current.runNonce !== expected.runNonce || current.ownerPid !== expected.ownerPid) {
    throw new Error(`E_CI_SIM_CAPACITY_HOLD:${kind.toUpperCase()}_CONFLICT`);
  }
  const retired = `${path}.retired-${current.runNonce}-${randomUUID()}`;
  await rename(path, retired);
  const moved = await readRecord(join(retired, filename), kind);
  if (moved.runNonce !== current.runNonce || moved.ownerPid !== current.ownerPid) {
    throw new Error(`E_CI_SIM_CAPACITY_HOLD:${kind.toUpperCase()}_RETIRE_CONFLICT`);
  }
  const entries = await readdir(retired);
  if (entries.length !== 1 || entries[0] !== filename) {
    throw new Error(`E_CI_SIM_CAPACITY_HOLD:${kind.toUpperCase()}_CONTENTS`);
  }
  await unlink(join(retired, filename));
  try { await rmdir(retired); } catch {
    throw new Error(`E_CI_SIM_CAPACITY_HOLD:${kind.toUpperCase()}_CONTENTS`);
  }
}

async function acquireMutex(capacityDir, options) {
  const mutexDir = `${capacityDir}.mutex`;
  const owner = {
    marker: CAPACITY_MARKER, kind: 'mutex', runNonce: randomUUID(),
    ownerPid: options.ownerPid, createdAt: new Date().toISOString(),
  };
  const candidate = `${mutexDir}.candidate-${process.pid}-${randomUUID()}`;
  await mkdir(candidate);
  await atomicJson(join(candidate, 'owner.json'), owner);
  try {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        await rename(candidate, mutexDir);
        return { ...owner, path: mutexDir };
      } catch (error) {
        if (!['EEXIST', 'ENOTEMPTY'].includes(error?.code)) throw error;
      }
      const existing = await readRecord(join(mutexDir, 'owner.json'), 'mutex');
      if (options.pidAlive(existing.ownerPid)) {
        if (attempt < 19 && options.waitForLiveMutex) { await delay(10); continue; }
        throw new Error('E_CI_SIM_CAPACITY_HOLD:MUTEX');
      }
      const tombstone = `${mutexDir}.stale-${existing.runNonce}-${randomUUID()}`;
      try { await rename(mutexDir, tombstone); } catch (error) {
        if (error?.code === 'ENOENT') continue;
        throw error;
      }
      const moved = await readRecord(join(tombstone, 'owner.json'), 'mutex');
      if (moved.runNonce !== existing.runNonce || moved.ownerPid !== existing.ownerPid) {
        await rename(tombstone, mutexDir).catch(() => undefined);
        throw new Error('E_CI_SIM_CAPACITY_HOLD:MUTEX_RECLAIM_CONFLICT');
      }
      await removeOwnedDirectory(tombstone, 'owner.json', moved, 'mutex');
    }
    throw new Error('E_CI_SIM_CAPACITY_HOLD:MUTEX_RETRY');
  } finally {
    await rm(candidate, { recursive: true, force: true });
  }
}

async function releaseMutex(mutex) {
  await removeOwnedDirectory(mutex.path, 'owner.json', mutex, 'mutex');
}

export async function acquireCiCapacity(options = {}) {
  const capacityDir = ownedCapacityPath(options.path);
  const ownerPid = options.ownerPid ?? process.pid;
  const alive = options.pidAlive ?? pidAlive;
  if (!Number.isInteger(ownerPid) || ownerPid <= 0) {
    throw new Error('E_CI_SIM_CAPACITY_HOLD:INVALID_OWNER');
  }
  const mutex = await acquireMutex(capacityDir, {
    ownerPid: process.pid, pidAlive: alive, waitForLiveMutex: false,
  });
  const lease = {
    marker: CAPACITY_MARKER, kind: 'lease', runNonce: randomUUID(), ownerPid,
    createdAt: new Date().toISOString(), path: capacityDir,
  };
  const candidate = `${capacityDir}.candidate-${process.pid}-${randomUUID()}`;
  try {
    const existing = await readRecord(join(capacityDir, 'lease.json'), 'lease', true);
    if (existing && alive(existing.ownerPid)) throw new Error('E_CI_SIM_CAPACITY_HOLD:ACTIVE');
    if (existing) await removeOwnedDirectory(capacityDir, 'lease.json', existing, 'lease');
    await mkdir(candidate);
    await atomicJson(join(candidate, 'lease.json'), lease);
    await rename(candidate, capacityDir);
    return lease;
  } finally {
    await rm(candidate, { recursive: true, force: true });
    await releaseMutex(mutex);
  }
}

export async function releaseCiCapacity(lease) {
  if (!lease) return;
  const capacityDir = ownedCapacityPath(lease.path);
  const mutex = await acquireMutex(capacityDir, {
    ownerPid: process.pid, pidAlive, waitForLiveMutex: true,
  });
  try {
    const current = await readRecord(join(capacityDir, 'lease.json'), 'lease', true);
    if (!current) return;
    if (current.runNonce !== lease.runNonce || current.ownerPid !== lease.ownerPid) {
      throw new Error('E_CI_SIM_CAPACITY_HOLD:LEASE_CONFLICT');
    }
    await removeOwnedDirectory(capacityDir, 'lease.json', current, 'lease');
  } finally {
    await releaseMutex(mutex);
  }
}
