/**
 * bot-daemon — always-on bot process management (§4G).
 *
 * `deckent bot start` runs the listener detached so it survives terminal close;
 * stop/status manage it by pidfile. Hermetic: pidfile lifecycle + a disposable
 * `sleep` child for stop; spawn is injected so no real listener is launched.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  clearBotPid,
  inspectBotPid,
  readBotPid,
  startBotDaemon,
  stopBot,
  writeBotPid,
} from '../../src/connectors/bot-daemon.js';
import { isPidAlive } from '../../src/core/pid-liveness.js';

const children: ChildProcess[] = [];
afterEach(() => {
  for (const c of children) { try { c.kill('SIGKILL'); } catch { /* dead */ } }
  children.length = 0;
});

function tmp(): string { return mkdtempSync(join(tmpdir(), 'botd-')); }

describe('bot pidfile lifecycle', () => {
  it('write → read returns the live pid; clear removes it', () => {
    const root = tmp();
    try {
      expect(writeBotPid(root, process.pid)).toBe(true);
      expect(readBotPid(root)).toBe(process.pid);
      const raw = readFileSync(join(root, '.deckent', 'bot.pid'), 'utf8');
      expect(JSON.parse(raw)).toEqual(expect.objectContaining({
        schemaVersion: 1,
        pid: process.pid,
        startToken: expect.stringMatching(/^s\d+$/),
        projectRootDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
      }));
      expect(raw).not.toContain(root);
      clearBotPid(root);
      expect(readBotPid(root)).toBeNull();
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('a stale pidfile (dead pid) reads as null and is cleaned', async () => {
    const root = tmp();
    try {
      const child = spawn('sleep', ['30'], { stdio: 'ignore' });
      const pid = child.pid!;
      // Kill AND reap (await 'exit') so the /proc entry disappears — a zombie
      // child still has /proc/<pid> and would read as alive.
      await new Promise<void>((res) => { child.on('exit', () => res()); child.kill('SIGKILL'); });
      mkdirSync(join(root, '.deckent'), { recursive: true });
      writeFileSync(join(root, '.deckent', 'bot.pid'), String(pid));
      expect(readBotPid(root)).toBeNull();
      expect(existsSync(join(root, '.deckent', 'bot.pid'))).toBe(false); // cleaned
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('does not let an older process generation clear a newer record', () => {
    const root = tmp();
    try {
      expect(writeBotPid(root, 101, {
        isAlive: () => false,
        startToken: () => 's10',
      })).toBe(true);
      expect(clearBotPid(root, 101, { startToken: () => 's11' })).toBe(false);
      expect(existsSync(join(root, '.deckent', 'bot.pid'))).toBe(true);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('retires a provably foreign live legacy pid without treating it as a bot', () => {
    const root = tmp();
    try {
      mkdirSync(join(root, '.deckent'), { recursive: true });
      writeFileSync(join(root, '.deckent', 'bot.pid'), '2');
      const inspection = inspectBotPid(root, {
        platform: 'linux',
        isAlive: () => true,
        legacyIdentity: () => 'foreign',
      });
      expect(inspection).toEqual({
        status: 'not-running',
        reason: 'foreign-legacy',
      });
      expect(existsSync(join(root, '.deckent', 'bot.pid'))).toBe(false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

describe('stopBot', () => {
  it('no pidfile → not-running', () => {
    const root = tmp();
    try {
      expect(stopBot(root)).toEqual({ status: 'not-running' });
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('running → SIGTERMs the process and reports stopped', async () => {
    const root = tmp();
    try {
      const child = spawn('sleep', ['30'], { stdio: 'ignore' });
      children.push(child);
      writeBotPid(root, child.pid!);
      const res = stopBot(root);
      expect(res).toEqual({ status: 'stopped', pid: child.pid });
      // child receives SIGTERM and exits
      const start = Date.now();
      while (isPidAlive(child.pid!) && Date.now() - start < 4000) {
        await new Promise((r) => setTimeout(r, 50));
      }
      expect(isPidAlive(child.pid!)).toBe(false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('never signals a live pid whose kernel start token was reused', () => {
    const root = tmp();
    const kill = vi.fn();
    try {
      expect(writeBotPid(root, 4242, {
        isAlive: () => false,
        startToken: () => 's100',
      })).toBe(true);
      expect(stopBot(root, {
        isAlive: () => true,
        startToken: () => 's101',
        kill,
      })).toEqual({ status: 'not-running' });
      expect(kill).not.toHaveBeenCalled();
      expect(existsSync(join(root, '.deckent', 'bot.pid'))).toBe(false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('fails closed and never signals when ownership evidence is unavailable', () => {
    const root = tmp();
    const kill = vi.fn();
    try {
      expect(writeBotPid(root, 4242, {
        isAlive: () => false,
        startToken: () => 's100',
      })).toBe(true);
      expect(stopBot(root, {
        isAlive: () => true,
        startToken: () => null,
        kill,
      })).toEqual({
        status: 'ownership-unknown',
        pid: 4242,
        reason: 'start-token-unavailable',
      });
      expect(kill).not.toHaveBeenCalled();
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

describe('startBotDaemon', () => {
  it('already running → returns already-running, does NOT spawn', () => {
    const root = tmp();
    try {
      writeBotPid(root, process.pid); // pretend a live daemon exists
      let spawned = false;
      const res = startBotDaemon(root, { spawnFn: () => { spawned = true; return 4242; } });
      expect(res).toEqual({ status: 'already-running', pid: process.pid });
      expect(spawned).toBe(false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('not running → spawns detached and reports started', () => {
    const root = tmp();
    try {
      const res = startBotDaemon(root, {
        spawnFn: () => 9988,
        readinessInspect: () => ({ status: 'running', pid: 9988 }),
      });
      expect(res).toEqual({ status: 'started', pid: 9988 });
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('reports started only after the listener publishes its ownership record', () => {
    const root = tmp();
    const readinessWait = vi.fn();
    const inspections = [
      { status: 'not-running' as const, reason: 'absent' as const },
      { status: 'not-running' as const, reason: 'absent' as const },
      { status: 'running' as const, pid: 9988 },
    ];
    try {
      const res = startBotDaemon(root, {
        spawnFn: () => 9988,
        isAlive: () => true,
        readinessInspect: () => inspections.shift()!,
        readinessWait,
        readinessMaxAttempts: 3,
      });
      expect(res).toEqual({ status: 'started', pid: 9988 });
      expect(readinessWait).toHaveBeenCalledTimes(2);
      expect(readinessWait).toHaveBeenNthCalledWith(1, 25);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('never reports started when the spawned listener dies before readiness', () => {
    const root = tmp();
    try {
      expect(startBotDaemon(root, {
        spawnFn: () => 9988,
        isAlive: () => false,
        readinessInspect: () => ({ status: 'not-running', reason: 'absent' }),
      })).toEqual({ status: 'spawn-failed' });
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('spawn failure → spawn-failed', () => {
    const root = tmp();
    try {
      const res = startBotDaemon(root, { spawnFn: () => null });
      expect(res.status).toBe('spawn-failed');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('does not spawn when existing ownership is ambiguous', () => {
    const root = tmp();
    try {
      expect(writeBotPid(root, 4242, {
        isAlive: () => false,
        startToken: () => 's100',
      })).toBe(true);
      const spawnFn = vi.fn(() => 9988);
      expect(startBotDaemon(root, {
        isAlive: () => true,
        startToken: () => null,
        spawnFn,
      })).toEqual({
        status: 'ownership-unknown',
        pid: 4242,
        reason: 'start-token-unavailable',
      });
      expect(spawnFn).not.toHaveBeenCalled();
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('refuses listener admission when the platform lacks a start-token adapter', () => {
    const root = tmp();
    try {
      expect(writeBotPid(root, 4242, {
        isAlive: () => false,
        startToken: () => null,
      })).toBe(false);
      expect(existsSync(join(root, '.deckent', 'bot.pid'))).toBe(false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
