/**
 * bot-daemon — always-on bot process management (§4G).
 *
 * `deckent bot start` runs the listener detached so it survives terminal close;
 * stop/status manage it by pidfile. Hermetic: pidfile lifecycle + a disposable
 * `sleep` child for stop; spawn is injected so no real listener is launched.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  writeBotPid, readBotPid, clearBotPid, stopBot, startBotDaemon,
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
      writeBotPid(root, process.pid);
      expect(readBotPid(root)).toBe(process.pid);
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
      const res = startBotDaemon(root, { spawnFn: () => 9988 });
      expect(res).toEqual({ status: 'started', pid: 9988 });
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('spawn failure → spawn-failed', () => {
    const root = tmp();
    try {
      const res = startBotDaemon(root, { spawnFn: () => null });
      expect(res.status).toBe('spawn-failed');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
