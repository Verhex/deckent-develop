/**
 * BOT-002 — inbound command transport bootstrap tests (§4G).
 *
 * bootstrapConnectorCommands brings up each enabled connector in INBOUND mode
 * (full start → non-blocking poll), registers the command router on it, and
 * returns a NotificationAdapter over the SAME instances (one instance, both
 * directions — no second poller, no 409). Hermetic via an injected fake connector.
 */

import { describe, it, expect, vi } from 'vitest';
import { bootstrapConnectorCommands } from '../../src/connectors/connector-bootstrap.js';
import type { IMessageConnector, IncomingMessage, MessageHandler } from '../../src/connectors/types.js';

function fakeConnector(id: 'telegram' | 'discord') {
  let handler: MessageHandler | undefined;
  return {
    id,
    name: id,
    start: vi.fn(async () => {}),
    startOutbound: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    sendMessage: vi.fn(async () => {}),
    onMessage: vi.fn((h: MessageHandler) => { handler = h; }),
    isHealthy: () => true,
    _emit: (m: IncomingMessage) => handler?.(m),
  };
}

function incoming(text: string, channelId: string): IncomingMessage {
  // Fresh timestamp so the backlog-replay guard (acceptFrom = bootstrap time) treats
  // it as a live message, not buffered backlog.
  return { id: 'm', connector: 'telegram', fromUser: 'u', channelId, text, timestamp: new Date().toISOString() };
}

const cfg = { telegram: { enabled: true, token: 'bot:tok', chat_id: '555' } };

describe('bootstrapConnectorCommands', () => {
  it('starts the connector INBOUND (full start) and registers a command handler', async () => {
    const fake = fakeConnector('telegram');
    await bootstrapConnectorCommands('/root', cfg, { makeConnector: () => fake, resolve: vi.fn(async () => 'resolved') });
    expect(fake.start).toHaveBeenCalledTimes(1);     // full start = inbound poll
    expect(fake.startOutbound).not.toHaveBeenCalled();
    expect(fake.onMessage).toHaveBeenCalledTimes(1);
  });

  it('authorized "approve <id>" → resolve called + ack replied via the same connector', async () => {
    const fake = fakeConnector('telegram');
    const resolve = vi.fn(async () => 'resolved' as const);
    await bootstrapConnectorCommands('/root', cfg, { makeConnector: () => fake, resolve });

    fake._emit(incoming('approve trig-9', '555'));
    await vi.waitFor(() => expect(resolve).toHaveBeenCalledWith('trig-9', 'approve'));
    await vi.waitFor(() => expect(fake.sendMessage).toHaveBeenCalledTimes(1));
    const sent = fake.sendMessage.mock.calls[0]![0] as { channelId: string; text: string };
    expect(sent.channelId).toBe('555');
    expect(sent.text).toContain('trig-9');
  });

  it('unauthorized sender → resolve NOT called, no reply', async () => {
    const fake = fakeConnector('telegram');
    const resolve = vi.fn(async () => 'resolved' as const);
    await bootstrapConnectorCommands('/root', cfg, { makeConnector: () => fake, resolve });

    fake._emit(incoming('approve trig-9', '999-stranger'));
    await new Promise((r) => setTimeout(r, 20));
    expect(resolve).not.toHaveBeenCalled();
    expect(fake.sendMessage).not.toHaveBeenCalled();
  });

  it('returns a NotificationAdapter over the SAME instance (one instance, both directions)', async () => {
    const fake = fakeConnector('telegram');
    const { adapter } = await bootstrapConnectorCommands('/root', cfg, {
      makeConnector: () => fake,
      resolve: vi.fn(async () => 'resolved'),
    });
    expect(adapter).not.toBeNull();
    await adapter!.send({ priority: 'info', event: 'task-done', sprintId: 's1', title: 'T', summary: 'done', timestamp: '2026-06-05T00:00:00Z' });
    expect(fake.sendMessage).toHaveBeenCalledTimes(1); // outbound via the inbound instance
  });

  it('dispose() stops every started connector', async () => {
    const fake = fakeConnector('telegram');
    const { dispose } = await bootstrapConnectorCommands('/root', cfg, {
      makeConnector: () => fake,
      resolve: vi.fn(async () => 'resolved'),
    });
    await dispose();
    expect(fake.stop).toHaveBeenCalledTimes(1);
  });

  it('authorized non-command → chat responder called + reply chunks sent (full conversation)', async () => {
    const fake = fakeConnector('telegram');
    const chat = vi.fn(async () => 'Sprint 232 tamamlandı, 0 tech debt.');
    await bootstrapConnectorCommands('/root', cfg, {
      makeConnector: () => fake,
      resolve: vi.fn(async () => 'resolved'),
      chat,
    });
    fake._emit(incoming('durum ne alemde?', '555'));
    // Slice 1.1: chat is now called with an optional 3rd arg (per-turn mediaConnector).
    // Task 3 (WS1): 4th arg is detectedLang — undefined for text-origin turns.
    // ADR-092 (identity-wiring): 5th arg is the per-message principal — undefined when identity is disabled.
    await vi.waitFor(() => expect(chat).toHaveBeenCalledWith('555', 'durum ne alemde?', expect.objectContaining({ id: 'telegram' }), undefined, undefined));
    // a thinking ack + the reply land on the same chat
    await vi.waitFor(() => expect(fake.sendMessage.mock.calls.length).toBeGreaterThanOrEqual(2));
    const texts = fake.sendMessage.mock.calls.map((c) => (c[0] as { text: string }).text);
    expect(texts.some((t) => t.includes('Sprint 232'))).toBe(true);
  });

  it('/help → curated bot help, chat responder NOT called (no CLI leak)', async () => {
    const fake = fakeConnector('telegram');
    const chat = vi.fn(async () => 'should not reach chat');
    await bootstrapConnectorCommands('/root', cfg, {
      makeConnector: () => fake,
      resolve: vi.fn(async () => 'resolved'),
      chat,
      actionDispatcher: { dispatch: vi.fn(async () => 'x') },
    });
    fake._emit(incoming('/help', '555'));
    await vi.waitFor(() => expect(fake.sendMessage).toHaveBeenCalled());
    const texts = fake.sendMessage.mock.calls.map((c) => (c[0] as { text: string }).text).join('\n');
    expect(texts).toContain('/status');         // bot surface
    expect(texts).not.toContain('/kill');        // NOT the CLI dump
    expect(chat).not.toHaveBeenCalled();         // never fell through to the engine
  });

  it('/status slash → read-only dispatcher, NOT the chat engine', async () => {
    const fake = fakeConnector('telegram');
    const chat = vi.fn(async () => 'nope');
    const actionDispatcher = { dispatch: vi.fn(async () => 'STATUS: sprint-232') };
    await bootstrapConnectorCommands('/root', cfg, {
      makeConnector: () => fake, resolve: vi.fn(async () => 'resolved'), chat, actionDispatcher,
    });
    fake._emit(incoming('/status', '555'));
    await vi.waitFor(() => expect(actionDispatcher.dispatch).toHaveBeenCalledWith('deckent_status', {}));
    expect(chat).not.toHaveBeenCalled();
  });

  it('unauthorized non-command → chat responder NOT called (RCE chokepoint)', async () => {
    const fake = fakeConnector('telegram');
    const chat = vi.fn(async () => 'should not run');
    await bootstrapConnectorCommands('/root', cfg, {
      makeConnector: () => fake,
      resolve: vi.fn(async () => 'resolved'),
      chat,
    });
    fake._emit(incoming('run anything', '999-stranger'));
    await new Promise((r) => setTimeout(r, 20));
    expect(chat).not.toHaveBeenCalled();
  });

  it('approve <id> of a parked bot-action → executes it + replies the result (slice 2b)', async () => {
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { parkBotAction, listBotActions } = await import('../../src/connectors/bot-action-store.js');
    const root = mkdtempSync(join(tmpdir(), 'bot2b-'));
    try {
      const fake = fakeConnector('telegram');
      const id = parkBotAction(root, { tool: 'deckent_plan', args: { directive: 'S300' }, channelId: '555' });
      const actionDispatcher = { dispatch: vi.fn(async () => 'PLAN CREATED: 3 tasks') };
      await bootstrapConnectorCommands(root, cfg, { makeConnector: () => fake, actionDispatcher });

      fake._emit(incoming(`approve ${id}`, '555'));
      await vi.waitFor(() => expect(actionDispatcher.dispatch).toHaveBeenCalledWith('deckent_plan', { directive: 'S300' }));
      await vi.waitFor(() => {
        const texts = fake.sendMessage.mock.calls.map((c) => (c[0] as { text: string }).text);
        expect(texts.some((t) => t.includes('PLAN CREATED'))).toBe(true);
      });
      expect(listBotActions(root)).toHaveLength(0); // consumed
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('approve a parked bot-action TWICE → executes once (idempotent, consume-once)', async () => {
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { parkBotAction } = await import('../../src/connectors/bot-action-store.js');
    const root = mkdtempSync(join(tmpdir(), 'bot2b-'));
    try {
      const fake = fakeConnector('telegram');
      const id = parkBotAction(root, { tool: 'deckent_kill', args: {}, channelId: '555' });
      const actionDispatcher = { dispatch: vi.fn(async () => 'killed') };
      await bootstrapConnectorCommands(root, cfg, { makeConnector: () => fake, actionDispatcher });

      fake._emit(incoming(`approve ${id}`, '555'));
      await vi.waitFor(() => expect(actionDispatcher.dispatch).toHaveBeenCalledTimes(1));
      fake._emit(incoming(`approve ${id}`, '555'));
      await new Promise((r) => setTimeout(r, 30));
      expect(actionDispatcher.dispatch).toHaveBeenCalledTimes(1); // never twice
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reject <id> of a parked bot-action → NOT executed, discarded', async () => {
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { parkBotAction, listBotActions } = await import('../../src/connectors/bot-action-store.js');
    const root = mkdtempSync(join(tmpdir(), 'bot2b-'));
    try {
      const fake = fakeConnector('telegram');
      const id = parkBotAction(root, { tool: 'deckent_cleanup', args: {}, channelId: '555' });
      const actionDispatcher = { dispatch: vi.fn(async () => 'ran') };
      await bootstrapConnectorCommands(root, cfg, { makeConnector: () => fake, actionDispatcher });

      fake._emit(incoming(`reject ${id}`, '555'));
      await vi.waitFor(() => expect(listBotActions(root)).toHaveLength(0)); // discarded
      expect(actionDispatcher.dispatch).not.toHaveBeenCalled();            // never ran
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('🔴 approve a kill BOUND to a sprint that is no longer active → REFUSED, kill not run', async () => {
    const { mkdtempSync, rmSync, mkdirSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { parkBotAction } = await import('../../src/connectors/bot-action-store.js');
    const root = mkdtempSync(join(tmpdir(), 'bind-'));
    try {
      // a NEW sprint is active now…
      mkdirSync(join(root, '.deckent'), { recursive: true });
      writeFileSync(join(root, '.deckent', 'sprint-state.json'), JSON.stringify({ sprintId: 'sprint-NEW' }));
      // …but the parked kill was bound to the OLD sprint
      const id = parkBotAction(root, { tool: 'deckent_kill', args: {}, channelId: '555', boundSprintId: 'sprint-OLD' });
      const fake = fakeConnector('telegram');
      const actionDispatcher = { dispatch: vi.fn(async () => 'SHOULD NOT RUN') };
      await bootstrapConnectorCommands(root, cfg, { makeConnector: () => fake, actionDispatcher });

      fake._emit(incoming(`approve ${id}`, '555'));
      await vi.waitFor(() => {
        const texts = fake.sendMessage.mock.calls.map((c) => (c[0] as { text: string }).text).join('\n');
        expect(texts.toLowerCase()).toMatch(/not executed|çalıştırılmadı|sprint-old/i);
      });
      expect(actionDispatcher.dispatch).not.toHaveBeenCalled(); // never executed
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('approve a kill bound to the ACTIVE sprint → routes to killSprintById (not the generic dispatcher)', async () => {
    const { mkdtempSync, rmSync, mkdirSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { parkBotAction } = await import('../../src/connectors/bot-action-store.js');
    const root = mkdtempSync(join(tmpdir(), 'bind-'));
    try {
      mkdirSync(join(root, '.deckent'), { recursive: true });
      writeFileSync(join(root, '.deckent', 'sprint-state.json'), JSON.stringify({ sprintId: 'sprint-LIVE' }));
      const id = parkBotAction(root, { tool: 'deckent_kill', args: {}, channelId: '555', boundSprintId: 'sprint-LIVE' });
      const fake = fakeConnector('telegram');
      const actionDispatcher = { dispatch: vi.fn(async () => 'GENERIC KILL') };
      await bootstrapConnectorCommands(root, cfg, { makeConnector: () => fake, actionDispatcher });

      fake._emit(incoming(`approve ${id}`, '555'));
      // no pid file for sprint-LIVE → killSprintById returns already-stopped (proves routing)
      await vi.waitFor(() => {
        const texts = fake.sendMessage.mock.calls.map((c) => (c[0] as { text: string }).text).join('\n');
        expect(texts.toLowerCase()).toMatch(/already stopped|zaten durmuş|sprint-live/i);
      });
      expect(actionDispatcher.dispatch).not.toHaveBeenCalled(); // routed to killSprintById, not generic
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('🔴 approve an EXPIRED parked action → REFUSED, not executed', async () => {
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { parkBotAction } = await import('../../src/connectors/bot-action-store.js');
    const root = mkdtempSync(join(tmpdir(), 'ttl-'));
    try {
      const id = parkBotAction(root, { tool: 'deckent_plan', args: {}, channelId: '555', ttlMs: -100000 }); // already expired
      const fake = fakeConnector('telegram');
      const actionDispatcher = { dispatch: vi.fn(async () => 'SHOULD NOT RUN') };
      await bootstrapConnectorCommands(root, cfg, { makeConnector: () => fake, actionDispatcher });

      fake._emit(incoming(`approve ${id}`, '555'));
      await vi.waitFor(() => {
        const texts = fake.sendMessage.mock.calls.map((c) => (c[0] as { text: string }).text).join('\n');
        expect(texts.toLowerCase()).toMatch(/expired|süresi doldu/i);
      });
      expect(actionDispatcher.dispatch).not.toHaveBeenCalled();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('chat reply with Markdown → sent as Telegram HTML (parseMode HTML, bold rendered)', async () => {
    const fake = fakeConnector('telegram');
    const chat = vi.fn(async () => 'Use **deckent_recover** now');
    await bootstrapConnectorCommands('/root', cfg, {
      makeConnector: () => fake,
      resolve: vi.fn(async () => 'resolved'),
      chat,
    });
    fake._emit(incoming('help me', '555'));
    // Wait for the chat reply to land (thinking + rich reply)
    await vi.waitFor(() => {
      const htmlCalls = fake.sendMessage.mock.calls.filter(
        (c) => (c[0] as { parseMode?: string }).parseMode === 'HTML'
      );
      expect(htmlCalls.length).toBeGreaterThan(0);
    });
    const htmlCalls = fake.sendMessage.mock.calls.filter(
      (c) => (c[0] as { parseMode?: string }).parseMode === 'HTML'
    );
    const texts = htmlCalls.map((c) => (c[0] as { text: string }).text).join('\n');
    expect(texts).toContain('<b>deckent_recover</b>');
    expect(texts).not.toContain('**deckent_recover**');
  });

  it('chat reply HTML send throws → plain fallback fires (no crash, no lost reply)', async () => {
    let callCount = 0;
    let handler: MessageHandler | undefined;
    const sendMessage = vi.fn(async (msg: { parseMode?: string; text: string }) => {
      callCount++;
      if (msg.parseMode === 'HTML') throw new Error('ETELEGRAM: 400 Bad Request: can\'t parse entities');
    });
    const fallbackFake = {
      id: 'telegram' as const,
      name: 'telegram',
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      sendMessage,
      onMessage: vi.fn((h: MessageHandler) => { handler = h; }),
      isHealthy: () => true,
      _emit: (m: IncomingMessage) => handler?.(m),
    };
    const chat = vi.fn(async () => 'Use **deckent_recover** now');
    await bootstrapConnectorCommands('/root', cfg, {
      makeConnector: () => fallbackFake,
      resolve: vi.fn(async () => 'resolved'),
      chat,
    });
    (fallbackFake._emit as (m: IncomingMessage) => void)(incoming('help me', '555'));
    // Wait for plain fallback: a sendMessage call WITHOUT parseMode=HTML containing raw text
    await vi.waitFor(() => {
      const plainCalls = sendMessage.mock.calls.filter(
        (c) => (c[0] as { parseMode?: string }).parseMode !== 'HTML'
      );
      // the plain fallback must contain the raw markdown text
      const plainTexts = plainCalls.map((c) => (c[0] as { text: string }).text).join('\n');
      expect(plainTexts).toContain('deckent_recover');
    });
    // Crucially, no unhandled error — test itself completes without throw
  });

  it('unresolved $DECK token → skipped, nothing started, adapter null', async () => {
    const make = vi.fn();
    const { adapter } = await bootstrapConnectorCommands('/root',
      { telegram: { enabled: true, token: '$DECK:TELEGRAM_TOKEN', chat_id: '555' } },
      { makeConnector: make as never, resolve: vi.fn(async () => 'resolved') });
    expect(make).not.toHaveBeenCalled();
    expect(adapter).toBeNull();
  });

  it('streaming path: connector with 3 caps + onChatStreaming → editMessage called, sendMessage NOT called for reply', async () => {
    // Build a fake connector that exposes all 3 optional streaming capabilities.
    let handler: MessageHandler | undefined;
    const editMessage = vi.fn(async () => {});
    const sendChatAction = vi.fn(async () => {});
    const sendMessageReturningId = vi.fn(async () => 'msg-123');
    const sendMessage = vi.fn(async () => {});
    const streamCapFake = {
      id: 'telegram' as const,
      name: 'telegram',
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      sendMessage,
      onMessage: vi.fn((h: MessageHandler) => { handler = h; }),
      isHealthy: () => true,
      // 3 optional streaming caps:
      sendChatAction,
      sendMessageReturningId,
      editMessage,
      _emit: (m: IncomingMessage) => handler?.(m),
    };

    const onChatStreaming = vi.fn(async (_channelId: string, _text: string, _onPartial: (t: string) => void) => {
      _onPartial('partial text');
      return 'full reply from streaming';
    });

    await bootstrapConnectorCommands('/root', cfg, {
      makeConnector: () => streamCapFake,
      resolve: vi.fn(async () => 'resolved'),
      chat: vi.fn(async () => 'should not be called'),
      onChatStreaming,
    });

    streamCapFake._emit(incoming('hello streaming', '555'));

    // onChatStreaming must be called (not the plain chat responder).
    // Slice 1.1: 4th arg is the per-turn mediaConnector (the live connector object).
    // Task 3 (WS1): 5th arg is detectedLang — undefined for text-origin turns.
    // ADR-092 (identity-wiring): 6th arg is the per-message principal — undefined when identity is disabled.
    await vi.waitFor(() => expect(onChatStreaming).toHaveBeenCalledWith('555', 'hello streaming', expect.any(Function), expect.objectContaining({ id: 'telegram' }), undefined, undefined));
    // editMessage must be called for the final reply (edit-in-place); may also
    // be called earlier for throttled partials — check the LAST call for final body.
    await vi.waitFor(() => expect(editMessage).toHaveBeenCalled());
    const lastEditArgs = editMessage.mock.calls[editMessage.mock.calls.length - 1] as [string, string, string];
    expect(lastEditArgs[0]).toBe('555');     // channelId
    expect(lastEditArgs[1]).toBe('msg-123'); // msgId from sendMessageReturningId
    expect(lastEditArgs[2]).toContain('full reply');
    // sendMessage should NOT be called for the reply body (streaming path edits in place)
    // (it may be called for sendMessage via sendMessageReturningId's placeholder but NOT for reply text)
    const replyMsgCalls = sendMessage.mock.calls.filter(
      (c) => (c[0] as { text: string }).text?.includes('full reply')
    );
    expect(replyMsgCalls).toHaveLength(0);
  });
});
