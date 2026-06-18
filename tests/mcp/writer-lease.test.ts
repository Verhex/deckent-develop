import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  acquireOrCheckWriterLease,
  releaseWriterLease,
  readWriterLease,
  isProcessAlive,
  DEFAULT_WRITER_LEASE_TTL_MS,
} from '../../src/mcp/writer-lease.js';

const dirs: string[] = [];
function sandbox(): string {
  const d = mkdtempSync(join(tmpdir(), 'wlease-'));
  dirs.push(d);
  mkdirSync(join(d, '.deckent'), { recursive: true });
  return d;
}
function leasePath(root: string): string {
  return join(root, '.deckent', 'mcp-writer.lease');
}
function seed(root: string, info: Record<string, unknown>): void {
  writeFileSync(leasePath(root), JSON.stringify(info), 'utf-8');
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('writer-lease', () => {
  it('acquires when no lease exists and writes this pid', () => {
    const root = sandbox();
    const r = acquireOrCheckWriterLease(root);
    expect(r).toEqual({ ok: true, ownerPid: process.pid, stolen: false });
    expect(readWriterLease(root)?.pid).toBe(process.pid);
  });

  it('refreshes heartbeat when already owned by self', () => {
    const root = sandbox();
    seed(root, { pid: process.pid, acquiredAt: '2020-01-01T00:00:00.000Z', heartbeatAt: '2020-01-01T00:00:00.000Z', ttlMs: DEFAULT_WRITER_LEASE_TTL_MS });
    const r = acquireOrCheckWriterLease(root, { now: () => 1_700_000_000_000 });
    expect(r.ok).toBe(true);
    expect(readWriterLease(root)?.heartbeatAt).toBe(new Date(1_700_000_000_000).toISOString());
  });

  it('denies when owned by another live + fresh pid', () => {
    const root = sandbox();
    const now = 1_700_000_000_000;
    seed(root, { pid: 999_001, acquiredAt: new Date(now).toISOString(), heartbeatAt: new Date(now).toISOString(), ttlMs: 120_000 });
    const r = acquireOrCheckWriterLease(root, { isAlive: () => true, now: () => now + 1_000 });
    expect(r).toEqual({ ok: false, ownerPid: 999_001 });
  });

  it('steals when owner pid is dead', () => {
    const root = sandbox();
    const now = 1_700_000_000_000;
    seed(root, { pid: 999_002, acquiredAt: new Date(now).toISOString(), heartbeatAt: new Date(now).toISOString(), ttlMs: 120_000 });
    const r = acquireOrCheckWriterLease(root, { isAlive: () => false, now: () => now + 1_000 });
    expect(r).toEqual({ ok: true, ownerPid: process.pid, stolen: true });
    expect(readWriterLease(root)?.pid).toBe(process.pid);
  });

  it('steals when owner is alive but heartbeat is stale (> ttl)', () => {
    const root = sandbox();
    const now = 1_700_000_000_000;
    seed(root, { pid: 999_003, acquiredAt: new Date(now).toISOString(), heartbeatAt: new Date(now).toISOString(), ttlMs: 120_000 });
    const r = acquireOrCheckWriterLease(root, { isAlive: () => true, now: () => now + 200_000 });
    expect(r.ok).toBe(true);
    expect(r.stolen).toBe(true);
  });

  it('treats a corrupt lease file as free and acquires', () => {
    const root = sandbox();
    writeFileSync(leasePath(root), '{ this is not json', 'utf-8');
    const r = acquireOrCheckWriterLease(root);
    expect(r.ok).toBe(true);
    expect(readWriterLease(root)?.pid).toBe(process.pid);
  });

  it('release removes the lease only when owned by self', () => {
    const root = sandbox();
    acquireOrCheckWriterLease(root);
    releaseWriterLease(root);
    expect(readWriterLease(root)).toBeNull();
  });

  it('release is a no-op when the lease is owned by another pid', () => {
    const root = sandbox();
    seed(root, { pid: 999_004, acquiredAt: '2020-01-01T00:00:00.000Z', heartbeatAt: '2020-01-01T00:00:00.000Z', ttlMs: 120_000 });
    releaseWriterLease(root);
    expect(readWriterLease(root)?.pid).toBe(999_004);
  });

  it('isProcessAlive returns true for the current process and false for an impossible pid', () => {
    expect(isProcessAlive(process.pid)).toBe(true);
    expect(isProcessAlive(2_147_483_646)).toBe(false);
  });
});
