/**
 * killSprintById — sprint-targeted, ownership-validated kill (§4G / B fix).
 *
 * The bot uses this instead of `kill --all` so a stale/approved kill can never
 * hit a DIFFERENT sprint, and a pid the OS recycled is never signalled. Fully
 * hermetic: a disposable `sleep` child in a tmpdir stands in for a coordinator —
 * NEVER touches a real sprint (the other terminal is live in this shared repo).
 */

import { describe, it, expect, afterEach } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { killSprintById } from '../../src/cli/commands/kill.js';
import { processStartToken } from '../../src/core/pid-ownership.js';
import { isPidAlive } from '../../src/core/pid-liveness.js';

const children: ChildProcess[] = [];
afterEach(() => {
  for (const c of children) { try { c.kill('SIGKILL'); } catch { /* already dead */ } }
  children.length = 0;
});

function spawnSleeper(): ChildProcess {
  const child = spawn('sleep', ['30'], { stdio: 'ignore' });
  children.push(child);
  return child;
}

function writePidFile(root: string, sprintId: string, rec: Record<string, unknown>): void {
  const dir = join(root, '.deckent', 'pids');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${sprintId}.pid`), JSON.stringify(rec, null, 2), 'utf-8');
}

async function waitDead(pid: number, ms = 4000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (!isPidAlive(pid)) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return !isPidAlive(pid);
}

describe('killSprintById (hermetic, disposable children only)', () => {
  it('🔴 reused pid (stored token ≠ live token) → REFUSES, does NOT kill the foreign process', async () => {
    const root = mkdtempSync(join(tmpdir(), 'killsp-'));
    const child = spawnSleeper();
    const pid = child.pid!;
    // pid is alive, but the stored token is wrong → it looks like a recycled pid
    // now owned by an unrelated process. The guard must refuse to signal it.
    writePidFile(root, 'sprint-OLD', { pid, sprintId: 'sprint-OLD', startToken: 's-WRONG-99999' });
    try {
      const res = await killSprintById(root, 'sprint-OLD', { graceMs: 100 });
      expect(res.status).toBe('reused');
      expect(isPidAlive(pid)).toBe(true);           // the "foreign" process SURVIVED
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('owned pid (token matches live process) → SIGTERM/SIGKILL, process dies', async () => {
    const root = mkdtempSync(join(tmpdir(), 'killsp-'));
    const child = spawnSleeper();
    const pid = child.pid!;
    const token = processStartToken(pid); // real live token → 'owned'
    writePidFile(root, 'sprint-LIVE', { pid, sprintId: 'sprint-LIVE', startToken: token });
    try {
      const res = await killSprintById(root, 'sprint-LIVE', { graceMs: 200 });
      expect(res.status).toBe('killed');
      expect(await waitDead(pid)).toBe(true);
      expect(existsSync(join(root, '.deckent', 'pids', 'sprint-LIVE.pid'))).toBe(false); // cleaned
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('dead pid → already-stopped, stale pid file cleaned, nothing signalled', async () => {
    const root = mkdtempSync(join(tmpdir(), 'killsp-'));
    const child = spawnSleeper();
    const pid = child.pid!;
    child.kill('SIGKILL');
    await waitDead(pid);
    writePidFile(root, 'sprint-GONE', { pid, sprintId: 'sprint-GONE', startToken: 's-1' });
    try {
      const res = await killSprintById(root, 'sprint-GONE', { graceMs: 100 });
      expect(res.status).toBe('already-stopped');
      expect(existsSync(join(root, '.deckent', 'pids', 'sprint-GONE.pid'))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('no pid file → already-stopped (idempotent — a second kill is harmless)', async () => {
    const root = mkdtempSync(join(tmpdir(), 'killsp-'));
    try {
      const res = await killSprintById(root, 'sprint-NONE', { graceMs: 50 });
      expect(res.status).toBe('already-stopped');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
