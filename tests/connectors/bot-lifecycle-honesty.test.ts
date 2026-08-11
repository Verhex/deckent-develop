/**
 * Bot daemon lifecycle honesty (task 509-002, row 3320).
 *
 * Hermetic, tmpdir-based — no real daemon process is spawned. Two things are
 * under test:
 *  1. The SIGTERM graceful-shutdown path removes the pid file this listener
 *     process itself owns, even when connector/nervous disposal fails along
 *     the way (the root cause of "SIGTERM leaves the pid file behind").
 *  2. `stopBot`/`startBotDaemon` stay fail-closed on ambiguous ownership —
 *     a regression guard proving this task did not weaken the identity
 *     guard while making the SIGTERM path more resilient.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleBotListen } from '../../src/cli/commands/bot.js';
import {
  readBotPid,
  startBotDaemon,
  stopBot,
  writeBotPid,
} from '../../src/connectors/bot-daemon.js';
import type { ConnectorCommandsHandle } from '../../src/connectors/connector-bootstrap.js';

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'bot-lifecycle-'));
}

const roots: string[] = [];
afterEach(() => {
  for (const root of roots) { try { rmSync(root, { recursive: true, force: true }); } catch { /* gone */ } }
  roots.length = 0;
});

function fakeHandle(dispose: () => Promise<void>): ConnectorCommandsHandle {
  return {
    active: ['test-connector'],
    dispose,
  } as unknown as ConnectorCommandsHandle;
}

describe('SIGTERM graceful-shutdown pid hygiene', () => {
  it('removes this listener\'s pid file even when connector disposal rejects', async () => {
    const root = tmp();
    roots.push(root);
    const dispose = vi.fn(() => Promise.reject(new Error('connector dispose failed')));
    await handleBotListen({
      root,
      print: () => { /* silence */ },
      bootstrap: async () => fakeHandle(dispose),
      // Simulates a signal already having been received: resolves immediately
      // so the shutdown `finally` block runs right away, with disposal wired
      // to fail — exercising the exact failure mode the incident describes.
      waitForever: () => Promise.resolve(),
    });
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(existsSync(join(root, '.deckent', 'bot.pid'))).toBe(false);
    expect(readBotPid(root)).toBeNull();
  });

  it('removes the pid file on a real SIGTERM delivered to the process', async () => {
    const root = tmp();
    roots.push(root);
    const dispose = vi.fn(() => Promise.resolve());
    // process.emit('SIGTERM') fires EVERY listener already registered on the
    // shared process object, not just the one waitForSignal() is about to add
    // — in this host process that includes the worker harness's own shutdown
    // hook (src/agents/worker-lifecycle.ts), which calls process.exit(0) and
    // would kill the whole test run before `await listening` below observes
    // anything. Snapshot and suspend any pre-existing listeners for the
    // duration of this test, restore them unconditionally after, so only
    // handleBotListen's own real process.on('SIGTERM'|'SIGINT', ...)
    // registration reacts to the emitted signal.
    const priorSigterm = process.listeners('SIGTERM');
    const priorSigint = process.listeners('SIGINT');
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');
    try {
      // No waitForever override — exercises the real waitForSignal() path,
      // registering actual process.on('SIGINT'|'SIGTERM', ...) handlers.
      const listening = handleBotListen({
        root,
        print: () => { /* silence */ },
        bootstrap: async () => fakeHandle(dispose),
      });
      // Give handleBotListen's async setup (config load, bootstrap, pid write,
      // signal-handler registration) time to complete before firing the signal.
      const setupDeadline = Date.now() + 4000;
      while (!existsSync(join(root, '.deckent', 'bot.pid')) && Date.now() < setupDeadline) {
        await new Promise((resolve) => { setTimeout(resolve, 10); });
      }
      expect(existsSync(join(root, '.deckent', 'bot.pid'))).toBe(true);
      process.emit('SIGTERM');
      await listening;
      expect(dispose).toHaveBeenCalledTimes(1);
      expect(existsSync(join(root, '.deckent', 'bot.pid'))).toBe(false);
      expect(readBotPid(root)).toBeNull();
    } finally {
      process.removeAllListeners('SIGTERM');
      process.removeAllListeners('SIGINT');
      for (const listener of priorSigterm) {
        process.on('SIGTERM', listener as NodeJS.SignalsListener);
      }
      for (const listener of priorSigint) {
        process.on('SIGINT', listener as NodeJS.SignalsListener);
      }
    }
  });

  it('still writes and clears the pid file when disposal succeeds cleanly', async () => {
    const root = tmp();
    roots.push(root);
    await handleBotListen({
      root,
      print: () => { /* silence */ },
      bootstrap: async () => fakeHandle(() => Promise.resolve()),
      waitForever: () => Promise.resolve(),
    });
    expect(existsSync(join(root, '.deckent', 'bot.pid'))).toBe(false);
  });
});

describe('regression guard — ownership verification is not weakened', () => {
  it('stopBot stays fail-closed and signals nothing when ownership is ambiguous', () => {
    const root = tmp();
    roots.push(root);
    const kill = vi.fn();
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
    // A hard-fail-closed inspection never retires the ambiguous record either
    // — that stays reserved for a proven dead/reused/foreign pid.
    expect(existsSync(join(root, '.deckent', 'bot.pid'))).toBe(true);
  });

  it('startBotDaemon stays fail-closed and never spawns when ownership is ambiguous', () => {
    const root = tmp();
    roots.push(root);
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
  });
});
