// Tests that connector-bootstrap wires whatsapp via the SUPPORTED list + loadConnector path.
// Mirrors connector-bootstrap.test.ts but exercises the 'whatsapp' slot specifically.

import { describe, it, expect, vi } from 'vitest';
import { buildConnectorTargets } from '../../src/connectors/connector-bootstrap.js';
import type { ConnectorId, IMessageConnector, OutgoingMessage } from '../../src/connectors/types.js';

function fakeConnector(
  id: ConnectorId,
  o: { throwOnStart?: boolean } = {},
): IMessageConnector & { started: boolean; sent: OutgoingMessage[] } {
  const c = {
    id,
    name: id,
    started: false,
    sent: [] as OutgoingMessage[],
    start: async () => {},
    startOutbound: async () => {
      if (o.throwOnStart) throw new Error('start failed');
      c.started = true;
    },
    stop: async () => {},
    sendMessage: async (m: OutgoingMessage) => { c.sent.push(m); },
    onMessage: () => {},
    isHealthy: () => c.started,
  };
  return c;
}

describe('buildConnectorTargets — whatsapp wiring', () => {
  it('selects whatsapp connector when enabled in config', async () => {
    const fake = fakeConnector('whatsapp');
    const targets = await buildConnectorTargets(
      // cast: config-types still lists only telegram|discord; whatsapp accepted at runtime
      { whatsapp: { enabled: true, token: 'real-whatsapp-token', chat_id: '+15551234567' } } as Parameters<typeof buildConnectorTargets>[0],
      { makeConnector: () => fake },
    );
    expect(targets).toHaveLength(1);
    expect(targets[0]?.chatId).toBe('+15551234567');
    expect(fake.started).toBe(true);
  });

  it('skips whatsapp when disabled', async () => {
    const make = vi.fn(() => fakeConnector('whatsapp'));
    const targets = await buildConnectorTargets(
      { whatsapp: { enabled: false, token: 'tok', chat_id: 'c' } } as Parameters<typeof buildConnectorTargets>[0],
      { makeConnector: make },
    );
    expect(targets).toHaveLength(0);
    expect(make).not.toHaveBeenCalled();
  });

  it('skips whatsapp with unresolved $DECK: token — fail-safe', async () => {
    const make = vi.fn(() => fakeConnector('whatsapp'));
    const targets = await buildConnectorTargets(
      { whatsapp: { enabled: true, token: '$DECK:WHATSAPP_TOKEN', chat_id: 'c' } } as Parameters<typeof buildConnectorTargets>[0],
      { makeConnector: make },
    );
    expect(targets).toHaveLength(0);
    expect(make).not.toHaveBeenCalled();
  });

  it('skips whatsapp whose startOutbound throws — fail-safe, no crash', async () => {
    const targets = await buildConnectorTargets(
      { whatsapp: { enabled: true, token: 'tok', chat_id: 'c' } } as Parameters<typeof buildConnectorTargets>[0],
      { makeConnector: () => fakeConnector('whatsapp', { throwOnStart: true }) },
    );
    expect(targets).toHaveLength(0);
  });

  it('whatsapp and telegram can run simultaneously', async () => {
    const fakeWa = fakeConnector('whatsapp');
    const fakeTg = fakeConnector('telegram');
    const targets = await buildConnectorTargets(
      {
        telegram: { enabled: true, token: 'tg-tok', chat_id: '111' },
        whatsapp: { enabled: true, token: 'wa-tok', chat_id: '+555' },
      } as Parameters<typeof buildConnectorTargets>[0],
      {
        makeConnector: (id) => (id === 'telegram' ? fakeTg : id === 'whatsapp' ? fakeWa : null),
      },
    );
    expect(targets).toHaveLength(2);
    expect(targets.map((t) => t.chatId).sort()).toEqual(['+555', '111'].sort());
    expect(fakeWa.started).toBe(true);
    expect(fakeTg.started).toBe(true);
  });
});
