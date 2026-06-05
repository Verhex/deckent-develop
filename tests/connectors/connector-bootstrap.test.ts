// BOT-001 (MASTER-PLAN §4G) — connector-bootstrap: config → started connectors.
//
// Reads config.notify_connectors, lazily brings up each enabled connector in
// OUTBOUND mode, and returns targets for the ConnectorNotificationAdapter.
// Fail-safe (advisor): an unresolved $DECK: token, a missing dependency, or a
// connector that fails to start is logged + skipped — never crashes startup.

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

describe('buildConnectorTargets (BOT-001)', () => {
  it('starts (outbound) an enabled connector and returns its target + chat_id', async () => {
    const fake = fakeConnector('telegram');
    const targets = await buildConnectorTargets(
      { telegram: { enabled: true, token: 'real-token', chat_id: '7374744018' } },
      { makeConnector: () => fake },
    );
    expect(targets).toHaveLength(1);
    expect(targets[0]?.chatId).toBe('7374744018');
    expect(fake.started).toBe(true);
  });

  it('skips a disabled connector', async () => {
    const targets = await buildConnectorTargets(
      { telegram: { enabled: false, token: 't', chat_id: 'c' } },
      { makeConnector: () => fakeConnector('telegram') },
    );
    expect(targets).toHaveLength(0);
  });

  it('skips an unresolved $DECK: token (no real send attempted) — fail-safe', async () => {
    const make = vi.fn(() => fakeConnector('telegram'));
    const targets = await buildConnectorTargets(
      { telegram: { enabled: true, token: '$DECK:TELEGRAM_TOKEN', chat_id: 'c' } },
      { makeConnector: make },
    );
    expect(targets).toHaveLength(0);
    expect(make).not.toHaveBeenCalled(); // never even constructs the connector
  });

  it('skips a connector whose startOutbound throws — fail-safe, no crash', async () => {
    const targets = await buildConnectorTargets(
      { telegram: { enabled: true, token: 't', chat_id: 'c' } },
      { makeConnector: () => fakeConnector('telegram', { throwOnStart: true }) },
    );
    expect(targets).toHaveLength(0);
  });

  it('returns empty for undefined config', async () => {
    expect(await buildConnectorTargets(undefined, {})).toHaveLength(0);
  });
});
