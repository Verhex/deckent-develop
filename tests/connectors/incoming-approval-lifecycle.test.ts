import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ResolvedApprovalLifecycleConfig } from '../../src/core/config-types.js';
import { makeCommandResolver } from '../../src/connectors/incoming-command-resolver.js';
import { bootstrapConnectorCommands } from '../../src/connectors/connector-bootstrap.js';
import type { IMessageConnector, IncomingMessage } from '../../src/connectors/types.js';

const LIFECYCLE: ResolvedApprovalLifecycleConfig = {
  enabled: true,
  profiles: {
    confirmation: { ttlMs: 8_000, slaMs: [1_000, 2_000, 4_000], riskTier: 'elevated', timeoutDisposition: 'park-undecidable', blocking: 'run' },
    'autonomous-trigger': { ttlMs: 1_000, slaMs: [100, 200, 500], riskTier: 'elevated', timeoutDisposition: 'park-alert', blocking: 'trigger' },
    'gateway-pairing': { ttlMs: 1_000, slaMs: [100, 200, 500], riskTier: 'critical', timeoutDisposition: 'deny-expire', blocking: 'security' },
    'broker-native': { ttlMs: 1_000, slaMs: [100, 200, 500], riskTier: 'routine', timeoutDisposition: 'request-default', blocking: 'request' },
  },
};

let root = '';
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = '';
});

describe('incoming autonomous decision lifecycle guard', () => {
  it('returns not-found for a closed row and persists only system timeout authority', async () => {
    root = mkdtempSync(join(tmpdir(), 'incoming-autonomous-lifecycle-'));
    const dir = join(root, '.deckent', 'autonomous');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'pending.json'), JSON.stringify([{
      triggerId: 'late-chat',
      action: 'autonomous.execute',
      requestedBy: 'legacy',
      enqueuedAt: '2026-08-21T10:00:00.000Z',
    }]));

    const resolve = makeCommandResolver(root, {
      lifecycle: LIFECYCLE,
      now: () => new Date('2026-08-21T10:00:01.500Z'),
      readNervousPending: () => [],
    });
    expect(await resolve('late-chat', 'approve')).toBe('not-found');
    expect(JSON.parse(readFileSync(join(dir, 'decisions.json'), 'utf8'))['late-chat']).toMatchObject({
      kind: 'timeout',
      outcome: 'rejected',
      replayAllowed: false,
    });
  });

  it('threads lifecycle and clock through the connector bootstrap default resolver', async () => {
    root = mkdtempSync(join(tmpdir(), 'incoming-autonomous-bootstrap-lifecycle-'));
    const dir = join(root, '.deckent', 'autonomous');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'pending.json'), JSON.stringify([{
      triggerId: 'late-bootstrap-chat',
      action: 'autonomous.execute',
      requestedBy: 'legacy',
      enqueuedAt: '2026-08-21T10:00:00.000Z',
    }]));

    let onMessage: ((message: IncomingMessage) => void) | undefined;
    const replies: string[] = [];
    const connector: IMessageConnector = {
      id: 'telegram',
      async start() {},
      async stop() {},
      onMessage(handler) { onMessage = handler; },
      async sendMessage(message) { replies.push(message.text); },
    };
    const handle = await bootstrapConnectorCommands(root, {
      telegram: { enabled: true, token: 'test-token', chat_id: 'ops' },
    }, {
      makeConnector: () => connector,
      approvalLifecycle: LIFECYCLE,
      approvalNow: () => new Date('2026-08-21T10:00:01.500Z'),
    });

    onMessage?.({
      id: 'message-1',
      connector: 'telegram',
      channelId: 'ops',
      fromUser: 'operator',
      text: 'approve late-bootstrap-chat',
      timestamp: new Date().toISOString(),
    });
    await vi.waitFor(() => {
      expect(JSON.parse(readFileSync(join(dir, 'decisions.json'), 'utf8'))['late-bootstrap-chat'])
        .toMatchObject({ kind: 'timeout', replayAllowed: false });
    });
    expect(replies).toHaveLength(1);
    await handle.dispose();
  });
});
