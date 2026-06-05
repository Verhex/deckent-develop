/**
 * BOT-002 — `deckent bot listen` host command tests (§4G).
 *
 * The long-lived host that owns the inbound poller. Parks outlive a sprint, so
 * inbound approval needs a host that outlives it; the resolver writes durable
 * artifacts so the poller only needs to be alive at reply time. Tested
 * hermetically via injected bootstrap + wait seams (no real connector, no HOME).
 */

import { describe, it, expect, vi } from 'vitest';
import { handleBotListen } from '../../src/cli/commands/bot.js';
import type { ConnectorCommandsHandle } from '../../src/connectors/connector-bootstrap.js';

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
    await handleBotListen({ root: '/r', lang: 'en', bootstrap, print, waitForever: async () => {} });
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
      root: '/r',
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
});
