// BOT-001 (MASTER-PLAN §4G) — connector-bootstrap: config → started connectors.
//
// Reads config.notify_connectors, lazily brings up each enabled connector in
// OUTBOUND mode, and returns targets for the ConnectorNotificationAdapter.
// Fail-safe (advisor): an unresolved $DECK: token, a missing dependency, or a
// connector that fails to start is logged + skipped — never crashes startup.

import { describe, it, expect, vi } from 'vitest';
import { bootstrapConnectorCommands, buildConnectorTargets } from '../../src/connectors/connector-bootstrap.js';
import { getMessage, getMessageLanguages } from '../../src/cli/helpers/messages.js';
import type { ConnectorId, IMessageConnector, IncomingCallback, OutgoingMessage } from '../../src/connectors/types.js';

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

describe('bootstrapConnectorCommands callback routing', () => {
  function callbackConnector() {
    let callbackHandler: ((cb: IncomingCallback) => void) | undefined;
    const connector = {
      ...fakeConnector('telegram'),
      start: vi.fn(async () => {}),
      sendMessage: vi.fn(async () => {}),
      onCallback: vi.fn((handler: (cb: IncomingCallback) => void) => { callbackHandler = handler; }),
      emitCallback(data: string): void {
        callbackHandler?.({ connector: 'telegram', channelId: '555', fromUser: 'operator', data });
      },
    };
    return connector;
  }

  const inboundCfg = { telegram: { enabled: true, token: 'bot:token', chat_id: '555' } };

  it('routes a versioned bot callback as the correct synthetic command', async () => {
    const connector = callbackConnector();
    const resolve = vi.fn(async () => 'resolved' as const);
    await bootstrapConnectorCommands('/root', inboundCfg, { makeConnector: () => connector, resolve });
    connector.emitCallback('dk1:bot:approve:7HJKM:0123abcd');
    await vi.waitFor(() => expect(resolve).toHaveBeenCalledWith('7HJKM', 'approve'));
  });

  it('stubs a broker callback with an i18n reply and never reaches the gate resolver', async () => {
    const connector = callbackConnector();
    const resolve = vi.fn(async () => 'resolved' as const);
    await bootstrapConnectorCommands('/root', inboundCfg, { makeConnector: () => connector, resolve, lang: 'tr' });
    connector.emitCallback('dk1:brk:reject:7HJKM:0123abcd');
    await vi.waitFor(() => expect(connector.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      channelId: '555',
      text: getMessage('approval.broker_authority_pending', 'tr', { code: '7HJKM' }),
    })));
    expect(resolve).not.toHaveBeenCalled();
    expect(getMessageLanguages('approval.broker_authority_pending')).toEqual(expect.arrayContaining(['en', 'tr']));
  });

  it('injects a broker decider and sends its typed reply through the existing transport', async () => {
    const connector = callbackConnector();
    const brkDecider = vi.fn(async () => 'approval decided');
    await bootstrapConnectorCommands('/root', inboundCfg, {
      makeConnector: () => connector,
      brkDecider,
    });

    connector.emitCallback('dk1:brk:approve:7HJKM:0123abcd');

    await vi.waitFor(() => expect(brkDecider).toHaveBeenCalledOnce());
    expect(brkDecider.mock.calls[0]?.[0]).toMatchObject({
      ns: 'brk', action: 'approve', shortCode: '7HJKM', nonce: '0123abcd',
    });
    await vi.waitFor(() => expect(connector.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      channelId: '555', text: 'approval decided',
    })));
  });

  it('keeps routing a legacy callback with its original id', async () => {
    const connector = callbackConnector();
    const resolve = vi.fn(async () => 'resolved' as const);
    await bootstrapConnectorCommands('/root', inboundCfg, { makeConnector: () => connector, resolve });
    connector.emitCallback('reject:legacy-trigger-9');
    await vi.waitFor(() => expect(resolve).toHaveBeenCalledWith('legacy-trigger-9', 'reject'));
  });

  it('silently ignores an invalid callback and emits only a debug log', async () => {
    const connector = callbackConnector();
    const resolve = vi.fn(async () => 'resolved' as const);
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    await bootstrapConnectorCommands('/root', inboundCfg, { makeConnector: () => connector, resolve });
    connector.emitCallback('dk1:brk:approve:not-a-code:not-a-nonce');
    expect(resolve).not.toHaveBeenCalled();
    expect(connector.sendMessage).not.toHaveBeenCalled();
    expect(debug).toHaveBeenCalledWith(expect.stringContaining('ignored invalid approval callback'));
    debug.mockRestore();
  });
});
