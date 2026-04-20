/**
 * tests/mcp/tools/watch.test.ts
 *
 * Tests for deckent_watch MCP tool (Task 145-014).
 * Verifies backfill, subscription, channel filtering, and error handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DeckentEvent } from '../../../src/orchestra/event-stream.js';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockTail = vi.fn<[string, string, number], Promise<DeckentEvent[]>>();
const mockSubscribe = vi.fn<[string, unknown, (event: DeckentEvent) => void | Promise<void>], () => void>();

vi.mock('../../../src/orchestra/event-bus.js', () => ({
  eventBus: {
    tail: (...args: [string, string, number]) => mockTail(...args),
    subscribe: (...args: [string, unknown, (event: DeckentEvent) => void | Promise<void>]) => mockSubscribe(...args),
  },
}));

vi.mock('../../../src/monitor/sprint-state.js', () => ({
  getCurrentSprintId: vi.fn().mockReturnValue('sprint-145'),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeEvent(channel: string, seq = 1): DeckentEvent {
  return {
    timestamp: '2026-04-20T10:00:00.000Z',
    sequence: seq,
    protocol_version: '1.0',
    source: 'brain',
    target: '*',
    channel,
    payload: { test: true },
  };
}

interface RegisterToolArgs {
  name: string;
  meta: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }> }>;
}

function createMockServer(): {
  server: Record<string, unknown>;
  getRegistered: () => RegisterToolArgs | undefined;
} {
  let registered: RegisterToolArgs | undefined;
  const mockSendLoggingMessage = vi.fn().mockResolvedValue(undefined);

  const server = {
    registerTool: vi.fn(
      (name: string, meta: Record<string, unknown>, handler: RegisterToolArgs['handler']) => {
        registered = { name, meta, handler };
      },
    ),
    sendLoggingMessage: mockSendLoggingMessage,
  };

  return {
    server,
    getRegistered: () => registered,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('deckent_watch MCP tool', () => {
  let mockServer: ReturnType<typeof createMockServer>;
  const mockUnsubscribe = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockServer = createMockServer();
    mockTail.mockResolvedValue([]);
    mockSubscribe.mockReturnValue(mockUnsubscribe);
  });

  async function registerAndGetHandler() {
    const { registerWatch } = await import('../../../src/mcp/tools/watch.js');
    registerWatch(mockServer.server as never);
    const reg = mockServer.getRegistered();
    expect(reg).toBeDefined();
    return reg!;
  }

  it('should register deckent_watch tool', async () => {
    const reg = await registerAndGetHandler();
    expect(reg.name).toBe('deckent_watch');
    expect(mockServer.server.registerTool).toHaveBeenCalledOnce();
  });

  it('should backfill events via sendLoggingMessage', async () => {
    const events = [
      makeEvent('BRAIN→*:SPRINT_PHASE_CHANGE', 1),
      makeEvent('WORKER→BRAIN:RESULT', 2),
      makeEvent('BRAIN→WORKER:TASK_ASSIGN', 3),
    ];
    mockTail.mockResolvedValue(events);

    const reg = await registerAndGetHandler();
    const result = await reg.handler({});

    // sendLoggingMessage should be called 3 times (one per event)
    expect((mockServer.server.sendLoggingMessage as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(3);

    // First call should be info level (PHASE, not ALERT)
    const firstCall = (mockServer.server.sendLoggingMessage as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(firstCall.level).toBe('info');
    expect(firstCall.logger).toBe('deckent.sprint.sprint-145');
    expect(firstCall.data).toEqual(events[0]);

    // Result text should mention backfill count
    expect(result.content[0]!.text).toContain('Backfilled 3');
  });

  it('should subscribe to eventBus and forward new events', async () => {
    mockTail.mockResolvedValue([]);

    const reg = await registerAndGetHandler();
    await reg.handler({});

    // subscribe should have been called
    expect(mockSubscribe).toHaveBeenCalledOnce();

    // Get the subscriber callback
    const subscriberFn = mockSubscribe.mock.calls[0]![2]!;
    expect(typeof subscriberFn).toBe('function');

    // Simulate a new event arriving
    const newEvent = makeEvent('WORKER→BRAIN:HEARTBEAT', 10);
    await subscriberFn(newEvent);

    // sendLoggingMessage should be called for the new event
    const sendCalls = (mockServer.server.sendLoggingMessage as ReturnType<typeof vi.fn>).mock.calls;
    const lastCall = sendCalls[sendCalls.length - 1]![0];
    expect(lastCall.level).toBe('info');
    expect(lastCall.data).toEqual(newEvent);
  });

  it('should filter events by channel keywords', async () => {
    const events = [
      makeEvent('DECKENT→USER:NOTIFY', 1),
      makeEvent('BRAIN→*:SPRINT_PHASE_CHANGE', 2),
      makeEvent('DECKENT→USER:NOTIFY', 3),
    ];
    mockTail.mockResolvedValue(events);

    const reg = await registerAndGetHandler();
    const result = await reg.handler({ channels: ['NOTIFY'] });

    // Only 2 NOTIFY events should be sent, PHASE event should be filtered out
    expect((mockServer.server.sendLoggingMessage as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(2);
    expect(result.content[0]!.text).toContain('Backfilled 2');
    expect(result.content[0]!.text).toContain('Channels: NOTIFY');
  });

  it('should unsubscribe when sendLoggingMessage throws', async () => {
    mockTail.mockResolvedValue([]);

    const reg = await registerAndGetHandler();
    await reg.handler({});

    // Get subscriber callback
    const subscriberFn = mockSubscribe.mock.calls[0]![2]!;

    // Make sendLoggingMessage throw (simulating client disconnect)
    (mockServer.server.sendLoggingMessage as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('Client disconnected'),
    );

    await subscriberFn(makeEvent('WORKER→BRAIN:RESULT', 5));

    // unsubscribe should have been called
    expect(mockUnsubscribe).toHaveBeenCalledOnce();
  });

  it('should use ALERT level for ALERT channel events', async () => {
    const alertEvent = makeEvent('AUDITOR→BRAIN:ALERT_STALE_WORKER', 1);
    mockTail.mockResolvedValue([alertEvent]);

    const reg = await registerAndGetHandler();
    await reg.handler({});

    const call = (mockServer.server.sendLoggingMessage as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.level).toBe('warning');
  });

  it('should use provided sprintId instead of current', async () => {
    mockTail.mockResolvedValue([]);

    const reg = await registerAndGetHandler();
    const result = await reg.handler({ sprintId: 'sprint-999' });

    // tail should be called with the provided sprintId
    expect(mockTail).toHaveBeenCalledWith(expect.any(String), 'sprint-999', 20);
    expect(result.content[0]!.text).toContain('sprint-999');
  });

  it('should respect custom tail count', async () => {
    mockTail.mockResolvedValue([]);

    const reg = await registerAndGetHandler();
    await reg.handler({ tail: 5 });

    expect(mockTail).toHaveBeenCalledWith(expect.any(String), 'sprint-145', 5);
  });

  it('should also filter live subscription events by channel', async () => {
    mockTail.mockResolvedValue([]);

    const reg = await registerAndGetHandler();
    await reg.handler({ channels: ['RESULT'] });

    const subscriberFn = mockSubscribe.mock.calls[0]![2]!;

    // Send a PHASE event — should be filtered
    await subscriberFn(makeEvent('BRAIN→*:SPRINT_PHASE_CHANGE', 10));
    expect((mockServer.server.sendLoggingMessage as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();

    // Send a RESULT event — should pass through
    await subscriberFn(makeEvent('WORKER→BRAIN:RESULT', 11));
    expect((mockServer.server.sendLoggingMessage as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce();
  });
});
