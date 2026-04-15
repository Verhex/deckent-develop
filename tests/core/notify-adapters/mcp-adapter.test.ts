import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpNotificationAdapter, type McpServerLike } from '../../../src/core/notify-adapters/mcp-adapter.js';
import type { Notification } from '../../../src/core/notification-dispatcher.js';

// ─── Test Helpers ────────────────────────────────────────────────

function makeMockServer(): McpServerLike & { sentMessages: Array<{ level: string; logger?: string; data: unknown }> } {
  const sentMessages: Array<{ level: string; logger?: string; data: unknown }> = [];
  return {
    sentMessages,
    sendLoggingMessage: async (params) => {
      sentMessages.push(params);
    },
  };
}

function makeNotification(overrides?: Partial<Notification>): Notification {
  return {
    priority: 'info',
    event: 'task-done',
    title: 'Task Complete',
    summary: 'All tests pass',
    sprintId: 'sprint-139',
    timestamp: '2026-04-15T10:00:00.000Z',
    ...overrides,
  };
}

describe('McpNotificationAdapter', () => {
  let adapter: McpNotificationAdapter;
  let server: ReturnType<typeof makeMockServer>;

  beforeEach(() => {
    server = makeMockServer();
    adapter = new McpNotificationAdapter(server);
  });

  it('has correct adapter name', () => {
    expect(adapter.name).toBe('mcp-logging');
  });

  it('isAvailable returns true when server is set', () => {
    expect(adapter.isAvailable()).toBe(true);
  });

  it('isAvailable returns false when no server', () => {
    const noServer = new McpNotificationAdapter(null);
    expect(noServer.isAvailable()).toBe(false);
  });

  it('isAvailable returns false when constructed without args', () => {
    const noArgs = new McpNotificationAdapter();
    expect(noArgs.isAvailable()).toBe(false);
  });

  it('sends info notification with correct MCP level', async () => {
    await adapter.send(makeNotification({ priority: 'info' }));

    expect(server.sentMessages).toHaveLength(1);
    expect(server.sentMessages[0]!.level).toBe('info');
    expect(server.sentMessages[0]!.logger).toBe('deckent');
  });

  it('sends warning notification with correct MCP level', async () => {
    await adapter.send(makeNotification({ priority: 'warning' }));

    expect(server.sentMessages).toHaveLength(1);
    expect(server.sentMessages[0]!.level).toBe('warning');
  });

  it('sends critical notification with correct MCP level', async () => {
    await adapter.send(makeNotification({ priority: 'critical' }));

    expect(server.sentMessages).toHaveLength(1);
    expect(server.sentMessages[0]!.level).toBe('critical');
  });

  it('includes full notification data in MCP message', async () => {
    await adapter.send(makeNotification({
      event: 'sprint-started',
      title: 'Sprint Started',
      summary: 'Sprint 139 begins',
      details: 'All 50 tasks planned',
    }));

    const data = server.sentMessages[0]!.data as Record<string, unknown>;
    expect(data['event']).toBe('sprint-started');
    expect(data['title']).toBe('Sprint Started');
    expect(data['summary']).toBe('Sprint 139 begins');
    expect(data['details']).toBe('All 50 tasks planned');
    expect(data['sprintId']).toBe('sprint-139');
    expect(data['timestamp']).toBe('2026-04-15T10:00:00.000Z');
  });

  it('setServer allows lazy binding', async () => {
    const lazy = new McpNotificationAdapter();
    expect(lazy.isAvailable()).toBe(false);

    const newServer = makeMockServer();
    lazy.setServer(newServer);

    expect(lazy.isAvailable()).toBe(true);
    await lazy.send(makeNotification());
    expect(newServer.sentMessages).toHaveLength(1);
  });

  it('send does nothing when no server (no throw)', async () => {
    const noServer = new McpNotificationAdapter(null);
    // Should not throw
    await expect(noServer.send(makeNotification())).resolves.toBeUndefined();
  });

  it('handles server.sendLoggingMessage failure gracefully', async () => {
    const failServer: McpServerLike = {
      sendLoggingMessage: async () => { throw new Error('Connection lost'); },
    };
    const failAdapter = new McpNotificationAdapter(failServer);

    // Should propagate error (dispatcher handles fail-safe)
    await expect(failAdapter.send(makeNotification())).rejects.toThrow('Connection lost');
  });
});
