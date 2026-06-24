/**
 * Task 4 — approval-resolve integration tests.
 *
 * Verifies that:
 *  1. After approve: the resolver calls connector.editMessage with the approved
 *     outcome (`✅ Approved — <result>`) when parked.approvalMessageId is set
 *     and the connector exposes editMessage (feature-detected).
 *  2. After reject: the resolver calls connector.editMessage with the rejected
 *     outcome (`❌ Rejected`) when parked.approvalMessageId is set.
 *  3. When approvalMessageId is absent → editMessage is NOT called (regression guard).
 *  4. When editMessage is absent → no crash (best-effort, catch absorbed).
 *
 * Approach: drive the composite resolver in bootstrapConnectorCommands directly
 * by passing a fake connector with controlled editMessage and a pre-parked action
 * (real bot-action-store tmpdir so consume-once is exercised). Hermetic — tmpdir.
 */

import { describe, it, expect, vi } from 'vitest';
import { mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { bootstrapConnectorCommands } from '../../src/connectors/connector-bootstrap.js';
import type { IMessageConnector, IncomingMessage, MessageHandler, OutgoingMessage } from '../../src/connectors/types.js';
import type { IncomingCallback } from '../../src/connectors/types.js';

// ─── helpers ────────────────────────────────────────────────────────────────

function makeTmpRoot(): string {
  const base = mkdtempSync(join(tmpdir(), 'bot-resolve-'));
  mkdirSync(join(base, '.deckent', 'bot-actions'), { recursive: true });
  return base;
}

/** Write a pre-parked action JSON directly (bypasses parkBotAction random id). */
function parkRaw(root: string, action: object, id: string): void {
  writeFileSync(
    join(root, '.deckent', 'bot-actions', `${id}.json`),
    JSON.stringify(action, null, 2) + '\n',
    'utf-8',
  );
}

function fakeConnector(
  id: 'telegram' | 'discord',
  extra: Record<string, unknown> = {},
) {
  let handler: MessageHandler | undefined;
  let cbHandler: ((cb: IncomingCallback) => void) | undefined;
  return {
    id,
    name: id,
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    sendMessage: vi.fn(async (_m: OutgoingMessage) => {}),
    onMessage: vi.fn((h: MessageHandler) => { handler = h; }),
    onCallback: vi.fn((h: (cb: IncomingCallback) => void) => { cbHandler = h; }),
    isHealthy: () => true,
    _emit: (m: IncomingMessage) => handler?.(m),
    _emitCallback: (cb: IncomingCallback) => cbHandler?.(cb),
    ...extra,
  };
}

function incoming(text: string, channelId: string): IncomingMessage {
  return {
    id: 'm',
    connector: 'telegram',
    fromUser: 'u',
    channelId,
    text,
    timestamp: new Date().toISOString(),
  };
}

const cfg = { telegram: { enabled: true, token: 'bot:tok', chat_id: '555' } };

// ─── tests ───────────────────────────────────────────────────────────────────

describe('approval-resolve: editMessage on resolve (Task 4)', () => {
  it('approve: calls editMessage with approved outcome when approvalMessageId is set', async () => {
    const root = makeTmpRoot();
    const actionId = 'act-t4-approve';
    const msgId = 'tg-msg-111';
    // Park an action that carries an approvalMessageId
    parkRaw(root, {
      id: actionId,
      tool: 'deckent_status',
      args: {},
      channelId: '555',
      parkedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      approvalMessageId: msgId,
    }, actionId);

    const editMessage = vi.fn(async () => {});
    const fake = fakeConnector('telegram', { editMessage });

    const handle = await bootstrapConnectorCommands(root, cfg, {
      makeConnector: () => fake,
      actionDispatcher: { dispatch: vi.fn(async () => 'status-result') },
    });

    // Trigger approve via incoming text
    fake._emit(incoming(`approve ${actionId}`, '555'));

    await vi.waitFor(() => expect(fake.sendMessage).toHaveBeenCalled(), { timeout: 3000 });
    await vi.waitFor(() => expect(editMessage).toHaveBeenCalledTimes(1), { timeout: 3000 });

    const [chanArg, midArg, textArg, modeArg] = editMessage.mock.calls[0]!;
    expect(chanArg).toBe('555');
    expect(midArg).toBe(msgId);
    // outcome text must contain approval indicator
    expect(textArg).toMatch(/✅|Onaylandı|Approved/i);
    expect(modeArg).toBe('HTML');

    await handle.dispose();
  });

  it('reject: calls editMessage with rejected outcome when approvalMessageId is set', async () => {
    const root = makeTmpRoot();
    const actionId = 'act-t4-reject';
    const msgId = 'tg-msg-222';
    parkRaw(root, {
      id: actionId,
      tool: 'deckent_status',
      args: {},
      channelId: '555',
      parkedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      approvalMessageId: msgId,
    }, actionId);

    const editMessage = vi.fn(async () => {});
    const fake = fakeConnector('telegram', { editMessage });

    const handle = await bootstrapConnectorCommands(root, cfg, {
      makeConnector: () => fake,
      actionDispatcher: { dispatch: vi.fn(async () => 'r') },
    });

    fake._emit(incoming(`reject ${actionId}`, '555'));

    await vi.waitFor(() => expect(fake.sendMessage).toHaveBeenCalled(), { timeout: 3000 });
    await vi.waitFor(() => expect(editMessage).toHaveBeenCalledTimes(1), { timeout: 3000 });

    const [chanArg, midArg, textArg, modeArg] = editMessage.mock.calls[0]!;
    expect(chanArg).toBe('555');
    expect(midArg).toBe(msgId);
    // outcome text must contain rejection indicator
    expect(textArg).toMatch(/❌|Reddedildi|Rejected/i);
    expect(modeArg).toBe('HTML');

    await handle.dispose();
  });

  it('no editMessage call when approvalMessageId is absent', async () => {
    const root = makeTmpRoot();
    const actionId = 'act-t4-noid';
    // Park WITHOUT approvalMessageId
    parkRaw(root, {
      id: actionId,
      tool: 'deckent_status',
      args: {},
      channelId: '555',
      parkedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      // no approvalMessageId
    }, actionId);

    const editMessage = vi.fn(async () => {});
    const fake = fakeConnector('telegram', { editMessage });

    const handle = await bootstrapConnectorCommands(root, cfg, {
      makeConnector: () => fake,
      actionDispatcher: { dispatch: vi.fn(async () => 'r') },
    });

    fake._emit(incoming(`approve ${actionId}`, '555'));

    await vi.waitFor(() => expect(fake.sendMessage).toHaveBeenCalled(), { timeout: 3000 });
    // editMessage must NOT have been called
    expect(editMessage).not.toHaveBeenCalled();

    await handle.dispose();
  });

  it('best-effort: editMessage throwing does not crash the resolve path', async () => {
    const root = makeTmpRoot();
    const actionId = 'act-t4-throw';
    const msgId = 'tg-msg-333';
    parkRaw(root, {
      id: actionId,
      tool: 'deckent_status',
      args: {},
      channelId: '555',
      parkedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      approvalMessageId: msgId,
    }, actionId);

    const editMessage = vi.fn(async () => { throw new Error('Telegram error'); });
    const fake = fakeConnector('telegram', { editMessage });

    const handle = await bootstrapConnectorCommands(root, cfg, {
      makeConnector: () => fake,
      actionDispatcher: { dispatch: vi.fn(async () => 'r') },
    });

    // Must NOT reject — best-effort catch absorbs editMessage error
    fake._emit(incoming(`approve ${actionId}`, '555'));
    await vi.waitFor(() => expect(fake.sendMessage).toHaveBeenCalled(), { timeout: 3000 });
    expect(editMessage).toHaveBeenCalledTimes(1);

    await handle.dispose();
  });
});
