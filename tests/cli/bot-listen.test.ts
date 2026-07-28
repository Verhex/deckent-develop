/**
 * BOT-002 — `deckent bot listen` host command tests (§4G).
 *
 * The long-lived host that owns the inbound poller. Parks outlive a sprint, so
 * inbound approval needs a host that outlives it; the resolver writes durable
 * artifacts so the poller only needs to be alive at reply time. Tested
 * hermetically via injected bootstrap + wait seams (no real connector, no HOME).
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  handleBotListen,
  handleBotStart,
  handleBotStatus,
  handleBotStop,
} from '../../src/cli/commands/bot.js';
import type { ConnectorCommandsHandle } from '../../src/connectors/connector-bootstrap.js';

const roots: string[] = [];

function root(): string {
  const value = mkdtempSync(join(tmpdir(), 'deckent-bot-cli-'));
  roots.push(value);
  return value;
}

afterEach(() => {
  process.exitCode = undefined;
  for (const value of roots.splice(0)) {
    rmSync(value, { recursive: true, force: true });
  }
});

function handle(active: ('telegram' | 'discord')[]): ConnectorCommandsHandle {
  return {
    adapter: active.length ? ({ name: 'connector-broadcast', isAvailable: () => true, send: async () => {} }) : null,
    active,
    dispose: vi.fn(async () => {}),
  };
}

describe('handleBotListen', () => {
  it('no connectors configured → prints nothing-to-listen + disposes + returns (bounded)', async () => {
    const h = handle([]);
    const bootstrap = vi.fn(async () => h);
    const print = vi.fn();
    await handleBotListen({ root: root(), lang: 'en', bootstrap, print, waitForever: async () => {} });
    expect(bootstrap).toHaveBeenCalledTimes(1);
    expect(h.dispose).toHaveBeenCalledTimes(1);
    expect(print.mock.calls.flat().join(' ')).toMatch(/no .*connector|nothing/i);
  });

  it('active connectors → prints active banner listing them, then waits, then stops', async () => {
    const h = handle(['telegram']);
    const order: string[] = [];
    const bootstrap = vi.fn(async () => h);
    const print = vi.fn((s: string) => { order.push(s); });
    await handleBotListen({
      root: root(),
      lang: 'en',
      bootstrap,
      print,
      waitForever: async () => { order.push('__waited__'); },
    });
    const banner = order[0]!;
    expect(banner.toLowerCase()).toContain('telegram');
    expect(order).toContain('__waited__');
    expect(h.dispose).toHaveBeenCalledTimes(1); // disposed after wait returns
    // active banner printed BEFORE waiting (operator sees it immediately)
    expect(order.indexOf(banner)).toBeLessThan(order.indexOf('__waited__'));
  });

  it('stops safely when the process ownership record cannot be claimed', async () => {
    const h = handle(['telegram']);
    const print = vi.fn();
    await handleBotListen({
      root: '/definitely-not-a-real-deckent-root',
      lang: 'en',
      bootstrap: async () => h,
      print,
      waitForever: vi.fn(async () => {}),
    });
    expect(h.dispose).toHaveBeenCalledTimes(1);
    expect(print.mock.calls.flat().join(' ')).toMatch(/ownership record/i);
    expect(process.exitCode).toBe(1);
  });
});

describe('bot daemon ownership CLI', () => {
  const unknown = {
    status: 'ownership-unknown' as const,
    pid: 42,
    reason: 'start-token-unavailable',
  };

  it('status reports ambiguous ownership as an error', () => {
    const print = vi.fn();
    handleBotStatus({ root: root(), lang: 'en', print, inspect: () => unknown });
    expect(print.mock.calls.flat().join(' ')).toMatch(/cannot be proven/i);
    expect(process.exitCode).toBe(1);
  });

  it('start and stop preserve fail-closed ownership results', () => {
    const startPrint = vi.fn();
    const stopPrint = vi.fn();
    handleBotStart({ root: root(), lang: 'en', print: startPrint, start: () => unknown });
    expect(process.exitCode).toBe(1);
    process.exitCode = undefined;
    handleBotStop({ root: root(), lang: 'en', print: stopPrint, stop: () => unknown });
    expect(startPrint.mock.calls.flat().join(' ')).toMatch(/no signal or new daemon/i);
    expect(stopPrint.mock.calls.flat().join(' ')).toMatch(/no signal or new daemon/i);
    expect(process.exitCode).toBe(1);
  });
});
