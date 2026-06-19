import { describe, it, expect } from 'vitest';
import { startGatewayListen } from '../../src/connectors/gateway/gateway-daemon.js';
import { BaseConnector } from '../../src/connectors/base-connector.js';
import type { OutgoingMessage, ConnectorConfig, IncomingMessage } from '../../src/connectors/types.js';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** A fake connector that records sends and lets the test inject an inbound message. */
class FakeConnector extends BaseConnector {
  readonly id = 'telegram' as const;
  readonly name = 'Fake';
  sent: OutgoingMessage[] = [];
  private handler?: (m: IncomingMessage) => void;
  async start(_c: ConnectorConfig): Promise<void> { this.started = true; }
  async sendMessage(m: OutgoingMessage): Promise<void> { this.sent.push(m); }
  isHealthy(): boolean { return true; }
  onMessage(h: (m: IncomingMessage) => void): void { this.handler = h; }
  inject(text: string): void {
    this.handler?.({ id: '1', connector: 'telegram', fromUser: 'u1', channelId: '42', text, timestamp: '2026-06-20T00:00:00Z' });
  }
}

describe('gateway daemon listen', () => {
  it('routes an unbound chat to /use guidance through the connector', async () => {
    process.env['DECKENT_GATEWAY_HOME'] = await mkdtemp(join(tmpdir(), 'gw-home-'));
    const fake = new FakeConnector();
    const handle = await startGatewayListen({
      lang: 'en',
      gatewayToken: 'tkn',
      deps: {
        makeConnector: () => fake,
        // supervisor unused on the unbound path; provide a stub
        supervisor: { getOrSpawn: () => ({ projectPath: '/x', send: async () => ({ id: '1', kind: 'final', parts: ['x'] }) }), dispose: async () => {} },
        waitForever: () => new Promise(() => {}), // never resolves; we dispose manually
        print: () => {},
      },
    });
    expect(handle.active).toContain('telegram');
    fake.inject('hello');
    await new Promise((r) => setTimeout(r, 0));
    expect(fake.sent.some((m) => m.text.includes('/use'))).toBe(true);
    await handle.dispose();
    delete process.env['DECKENT_GATEWAY_HOME'];
  });
});
