/**
 * MCP writer-lease (MCP-W1). Project-scoped single-writer lease so that, while
 * every IDE window boots its own MCP server (reads everywhere), mutating tools
 * are serialized to one window. The lease auto-transfers when the owner exits
 * (dead pid) or goes stale (no heartbeat past ttl). Mirrors the O_EXCL +
 * pid-liveness pattern of file-lock.ts / the retired server-singleton-lock.ts.
 */
import {
  mkdirSync, readFileSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { DECKENT_DIR } from '../core/constants.js';

export const DEFAULT_WRITER_LEASE_TTL_MS = 120_000;
const LEASE_FILE = 'mcp-writer.lease';

export interface WriterLeaseInfo {
  pid: number;
  acquiredAt: string;
  heartbeatAt: string;
  ttlMs: number;
}

export type LeaseResult =
  | { ok: true; ownerPid: number; stolen: boolean }
  | { ok: false; ownerPid: number };

export interface LeaseOpts {
  ttlMs?: number;
  isAlive?: (pid: number) => boolean;
  now?: () => number;
}

export function isProcessAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function leasePathFor(projectRoot: string): string {
  return join(projectRoot, DECKENT_DIR, LEASE_FILE);
}

export function readWriterLease(projectRoot: string): WriterLeaseInfo | null {
  try {
    const raw = readFileSync(leasePathFor(projectRoot), 'utf-8');
    const parsed = JSON.parse(raw) as Partial<WriterLeaseInfo>;
    if (typeof parsed.pid !== 'number' || !Number.isFinite(parsed.pid)) return null;
    return {
      pid: parsed.pid,
      acquiredAt: String(parsed.acquiredAt ?? ''),
      heartbeatAt: String(parsed.heartbeatAt ?? parsed.acquiredAt ?? ''),
      ttlMs: typeof parsed.ttlMs === 'number' ? parsed.ttlMs : DEFAULT_WRITER_LEASE_TTL_MS,
    };
  } catch {
    return null;
  }
}

function writeLease(projectRoot: string, ttlMs: number, nowMs: number): void {
  const path = leasePathFor(projectRoot);
  mkdirSync(dirname(path), { recursive: true });
  const iso = new Date(nowMs).toISOString();
  const info: WriterLeaseInfo = { pid: process.pid, acquiredAt: iso, heartbeatAt: iso, ttlMs };
  writeFileSync(path, JSON.stringify(info), 'utf-8');
}

export function acquireOrCheckWriterLease(projectRoot: string, opts: LeaseOpts = {}): LeaseResult {
  const ttlMs = opts.ttlMs ?? DEFAULT_WRITER_LEASE_TTL_MS;
  const isAlive = opts.isAlive ?? isProcessAlive;
  const nowMs = (opts.now ?? Date.now)();
  const existing = readWriterLease(projectRoot);

  // No (or corrupt) lease — acquire.
  if (existing === null) {
    writeLease(projectRoot, ttlMs, nowMs);
    return { ok: true, ownerPid: process.pid, stolen: false };
  }

  // Owned by self — refresh heartbeat.
  if (existing.pid === process.pid) {
    writeLease(projectRoot, ttlMs, nowMs);
    return { ok: true, ownerPid: process.pid, stolen: false };
  }

  // Owned by another, alive AND fresh — deny.
  const heartbeatMs = new Date(existing.heartbeatAt).getTime();
  const fresh = Number.isFinite(heartbeatMs) && nowMs - heartbeatMs <= (existing.ttlMs || ttlMs);
  if (isAlive(existing.pid) && fresh) {
    return { ok: false, ownerPid: existing.pid };
  }

  // Owner dead or stale — steal.
  writeLease(projectRoot, ttlMs, nowMs);
  return { ok: true, ownerPid: process.pid, stolen: true };
}

export function releaseWriterLease(projectRoot: string): void {
  const existing = readWriterLease(projectRoot);
  if (existing === null || existing.pid !== process.pid) return;
  try {
    unlinkSync(leasePathFor(projectRoot));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      // best-effort: never throw from release
    }
  }
}

let releaseHooksInstalled = false;

export function installWriterLeaseReleaseHooks(projectRoot: string): void {
  if (releaseHooksInstalled) return;
  releaseHooksInstalled = true;
  const release = (): void => {
    try { releaseWriterLease(projectRoot); } catch { /* best-effort */ }
  };
  process.on('exit', release);
  process.on('SIGTERM', () => { release(); process.exit(0); });
  process.on('SIGINT', () => { release(); process.exit(0); });
}
