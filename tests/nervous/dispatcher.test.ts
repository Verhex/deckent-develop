// tests/nervous/dispatcher.test.ts
//
// NervousDispatcher unit tests — Sprint 147 Task 18
// 8+ tests covering: file always, MCP env, TTY detection, critical broadcast,
// cross-channel dedup, all disabled, MCP fallback, adapter integration

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NervousDispatcher } from '../../src/nervous/dispatcher.js';
import type { ChannelAdapter, Channel } from '../../src/nervous/dispatcher.js';
import type {
  NervousNotification,
  NervousSystemConfig,
  Severity,
} from '../../src/core/nervous-types.js';

// ─── Test Helpers ────────────────────────────────────────────────────────────

function makeConfig(overrides: Record<string, unknown> = {}): NervousSystemConfig {
  return {
    mode: 'balanced',
    enabled: true,
    ...overrides,
  } as NervousSystemConfig;
}

function makeConfigWithChannels(
  channels: { mcp?: boolean; cli?: boolean; file?: boolean } = {},
): NervousSystemConfig {
  return {
    mode: 'balanced',
    enabled: true,
    notifications: {
      channels: { mcp: true, cli: true, file: true, ...channels },
    },
  } as unknown as NervousSystemConfig;
}

function makeNotification(overrides: Partial<NervousNotification> = {}): NervousNotification {
  return {
    id: `ns-test-${Math.random().toString(36).slice(2, 8)}`,
    type: 'stale-worker',
    title: 'Test Notification',
    message: 'Test message for dispatcher',
    severity: 'warning' as Severity,
    createdAt: '2026-04-20T10:00:00.000Z',
    detectorId: 'stale-worker',
    actions: [],
    timeoutMs: null,
    sprintId: 'sprint-147',
    ...overrides,
  };
}

function makeAdapter(success = true): ChannelAdapter & { calls: NervousNotification[] } {
  const calls: NervousNotification[] = [];
  return {
    calls,
    push: vi.fn(async (n: NervousNotification) => {
      calls.push(n);
      return success;
    }),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('NervousDispatcher', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // Test 1: Dispatch to file always
  describe('file channel', () => {
    it('should always dispatch to file channel', async () => {
      const fileAdapter = makeAdapter();
      const dispatcher = new NervousDispatcher(
        makeConfigWithChannels({ mcp: false, cli: false, file: true }),
        '/tmp/test-project',
        {
          fileAdapter,
          isMcpActive: () => false,
          isTtyAvailable: () => false,
        },
      );

      const notification = makeNotification();
      const result = await dispatcher.dispatch(notification);

      expect(result.channels).toContain('file');
      expect(result.success).toBe(true);
      expect(fileAdapter.calls).toHaveLength(1);
      expect(fileAdapter.calls[0].id).toBe(notification.id);
    });
  });

  // Test 2: MCP env var set → channels include 'mcp'
  describe('MCP context detection', () => {
    it('should include mcp channel when DECKENT_MCP_ACTIVE is detected', async () => {
      const mcpAdapter = makeAdapter();
      const fileAdapter = makeAdapter();
      const dispatcher = new NervousDispatcher(
        makeConfigWithChannels({ mcp: true, cli: true, file: true }),
        '/tmp/test-project',
        {
          mcpAdapter,
          fileAdapter,
          isMcpActive: () => true,
          isTtyAvailable: () => false,
        },
      );

      const notification = makeNotification({ severity: 'warning' });
      const result = await dispatcher.dispatch(notification);

      expect(result.channels).toContain('mcp');
      expect(result.channels).toContain('file');
      // CLI should NOT be included when MCP is active (non-critical)
      expect(result.channels).not.toContain('cli');
      expect(mcpAdapter.calls).toHaveLength(1);
    });
  });

  // Test 3: TTY present + MCP off → channels include 'cli'
  describe('CLI context detection', () => {
    it('should include cli channel when TTY is available and MCP is off', async () => {
      const cliAdapter = makeAdapter();
      const fileAdapter = makeAdapter();
      const dispatcher = new NervousDispatcher(
        makeConfigWithChannels({ mcp: true, cli: true, file: true }),
        '/tmp/test-project',
        {
          cliAdapter,
          fileAdapter,
          isMcpActive: () => false,
          isTtyAvailable: () => true,
        },
      );

      const notification = makeNotification({ severity: 'info' });
      const result = await dispatcher.dispatch(notification);

      expect(result.channels).toContain('cli');
      expect(result.channels).toContain('file');
      expect(result.channels).not.toContain('mcp');
      expect(cliAdapter.calls).toHaveLength(1);
    });
  });

  // Test 4: Critical severity → broadcasts to all enabled
  describe('critical severity broadcast', () => {
    it('should broadcast to all enabled channels on critical severity', async () => {
      const mcpAdapter = makeAdapter();
      const cliAdapter = makeAdapter();
      const fileAdapter = makeAdapter();
      const dispatcher = new NervousDispatcher(
        makeConfigWithChannels({ mcp: true, cli: true, file: true }),
        '/tmp/test-project',
        {
          mcpAdapter,
          cliAdapter,
          fileAdapter,
          isMcpActive: () => false,
          isTtyAvailable: () => false,
        },
      );

      const notification = makeNotification({ severity: 'critical' });
      const result = await dispatcher.dispatch(notification);

      expect(result.channels).toContain('file');
      expect(result.channels).toContain('mcp');
      expect(result.channels).toContain('cli');
      expect(result.channels).toHaveLength(3);
    });

    it('should broadcast to all enabled channels on emergency severity', async () => {
      const mcpAdapter = makeAdapter();
      const cliAdapter = makeAdapter();
      const fileAdapter = makeAdapter();
      const dispatcher = new NervousDispatcher(
        makeConfigWithChannels({ mcp: true, cli: true, file: true }),
        '/tmp/test-project',
        {
          mcpAdapter,
          cliAdapter,
          fileAdapter,
          isMcpActive: () => false,
          isTtyAvailable: () => false,
        },
      );

      const notification = makeNotification({ severity: 'emergency' });
      const result = await dispatcher.dispatch(notification);

      expect(result.channels).toContain('file');
      expect(result.channels).toContain('mcp');
      expect(result.channels).toContain('cli');
    });
  });

  // Test 5: Duplicate notification ID → no re-dispatch
  describe('cross-channel dedup', () => {
    it('should not re-dispatch a notification with the same ID', async () => {
      const fileAdapter = makeAdapter();
      const dispatcher = new NervousDispatcher(
        makeConfigWithChannels({ mcp: false, cli: false, file: true }),
        '/tmp/test-project',
        {
          fileAdapter,
          isMcpActive: () => false,
          isTtyAvailable: () => false,
        },
      );

      const notification = makeNotification({ id: 'dedup-test-001' });

      const result1 = await dispatcher.dispatch(notification);
      expect(result1.channels).toContain('file');
      expect(fileAdapter.calls).toHaveLength(1);

      const result2 = await dispatcher.dispatch(notification);
      expect(result2.channels).toHaveLength(0);
      expect(result2.success).toBe(true);
      expect(fileAdapter.calls).toHaveLength(1); // still 1, not 2
    });
  });

  // Test 6: All channels disabled → only 'file' (file is always on by default)
  describe('all channels disabled', () => {
    it('should dispatch to file only when mcp and cli are disabled', async () => {
      const fileAdapter = makeAdapter();
      const dispatcher = new NervousDispatcher(
        makeConfigWithChannels({ mcp: false, cli: false, file: true }),
        '/tmp/test-project',
        {
          fileAdapter,
          isMcpActive: () => true, // even if MCP is "active", config disables it
          isTtyAvailable: () => true,
        },
      );

      const notification = makeNotification({ severity: 'warning' });
      const result = await dispatcher.dispatch(notification);

      expect(result.channels).toEqual(['file']);
      expect(result.success).toBe(true);
    });
  });

  // Test 7: MCP dispatch failure → 'cli' fallback triggered
  describe('MCP fallback to CLI', () => {
    it('should fall back to CLI when MCP dispatch fails', async () => {
      const mcpAdapter = makeAdapter(false); // MCP fails
      const cliAdapter = makeAdapter(true);  // CLI succeeds
      const fileAdapter = makeAdapter(true);
      const dispatcher = new NervousDispatcher(
        makeConfigWithChannels({ mcp: true, cli: true, file: true }),
        '/tmp/test-project',
        {
          mcpAdapter,
          cliAdapter,
          fileAdapter,
          isMcpActive: () => true,
          isTtyAvailable: () => false,
        },
      );

      // Non-critical with MCP active → selects [file, mcp]
      // MCP fails → fallback to cli
      const notification = makeNotification({ severity: 'warning' });
      const result = await dispatcher.dispatch(notification);

      expect(result.channels).toContain('file');
      expect(result.channels).toContain('cli'); // fallback
      expect(mcpAdapter.push).toHaveBeenCalledOnce();
      expect(cliAdapter.push).toHaveBeenCalledOnce();
    });

    it('should not fallback to CLI if CLI is already in channels (critical)', async () => {
      const mcpAdapter = makeAdapter(false); // MCP fails
      const cliAdapter = makeAdapter(true);
      const fileAdapter = makeAdapter(true);
      const dispatcher = new NervousDispatcher(
        makeConfigWithChannels({ mcp: true, cli: true, file: true }),
        '/tmp/test-project',
        {
          mcpAdapter,
          cliAdapter,
          fileAdapter,
          isMcpActive: () => false,
          isTtyAvailable: () => false,
        },
      );

      // Critical → broadcasts to all (file, mcp, cli)
      // MCP fails, but CLI is already in channels — no double push
      const notification = makeNotification({ severity: 'critical' });
      const result = await dispatcher.dispatch(notification);

      // CLI adapter should be called exactly once (from broadcast, not fallback)
      expect(cliAdapter.push).toHaveBeenCalledOnce();
    });
  });

  // Test 8: Integration — adapter push receives correct notification data
  describe('adapter integration', () => {
    it('should pass full notification object to adapters', async () => {
      const mcpAdapter = makeAdapter();
      const fileAdapter = makeAdapter();
      const dispatcher = new NervousDispatcher(
        makeConfigWithChannels({ mcp: true, cli: false, file: true }),
        '/tmp/test-project',
        {
          mcpAdapter,
          fileAdapter,
          isMcpActive: () => true,
          isTtyAvailable: () => false,
        },
      );

      const notification = makeNotification({
        id: 'integration-test-001',
        type: 'agent-routing',
        title: 'Agent Routing Health',
        severity: 'warning',
        detectorId: 'agent-routing',
        sprintId: 'sprint-147',
        taskId: 'task-147-012',
      });

      await dispatcher.dispatch(notification);

      // Verify file adapter received the notification
      expect(fileAdapter.calls[0].id).toBe('integration-test-001');
      expect(fileAdapter.calls[0].type).toBe('agent-routing');
      expect(fileAdapter.calls[0].detectorId).toBe('agent-routing');

      // Verify MCP adapter received the same notification
      expect(mcpAdapter.calls[0].id).toBe('integration-test-001');
      expect(mcpAdapter.calls[0].sprintId).toBe('sprint-147');
      expect(mcpAdapter.calls[0].taskId).toBe('task-147-012');
    });
  });

  // Test 9: selectChannels exposed for direct testing
  describe('selectChannels', () => {
    it('should return only file when no context matches and channels are enabled', () => {
      const dispatcher = new NervousDispatcher(
        makeConfigWithChannels({ mcp: true, cli: true, file: true }),
        '/tmp/test-project',
        {
          isMcpActive: () => false,
          isTtyAvailable: () => false,
        },
      );

      const notification = makeNotification({ severity: 'info' });
      const channels = dispatcher.selectChannels(notification);
      expect(channels).toEqual(['file']);
    });
  });

  // Test 10: dispatchedCount and clearDedup
  describe('diagnostics', () => {
    it('should track dispatched count and support clearing dedup', async () => {
      const fileAdapter = makeAdapter();
      const dispatcher = new NervousDispatcher(
        makeConfigWithChannels({ mcp: false, cli: false, file: true }),
        '/tmp/test-project',
        {
          fileAdapter,
          isMcpActive: () => false,
          isTtyAvailable: () => false,
        },
      );

      expect(dispatcher.dispatchedCount).toBe(0);

      const n1 = makeNotification({ id: 'count-test-1' });
      const n2 = makeNotification({ id: 'count-test-2' });
      await dispatcher.dispatch(n1);
      await dispatcher.dispatch(n2);

      expect(dispatcher.dispatchedCount).toBe(2);

      dispatcher.clearDedup();
      expect(dispatcher.dispatchedCount).toBe(0);

      // Can re-dispatch after clear
      const result = await dispatcher.dispatch(n1);
      expect(result.channels).toContain('file');
      expect(fileAdapter.calls).toHaveLength(3); // 2 original + 1 re-dispatch
    });
  });

  // Test 11: adapter throw → fail-safe (no crash)
  describe('fail-safe', () => {
    it('should not crash when an adapter throws', async () => {
      const throwingAdapter: ChannelAdapter = {
        push: vi.fn(async () => { throw new Error('Adapter crash'); }),
      };
      const fileAdapter = makeAdapter();
      const dispatcher = new NervousDispatcher(
        makeConfigWithChannels({ mcp: false, cli: true, file: true }),
        '/tmp/test-project',
        {
          cliAdapter: throwingAdapter,
          fileAdapter,
          isMcpActive: () => false,
          isTtyAvailable: () => true,
        },
      );

      const notification = makeNotification({ severity: 'info' });
      const result = await dispatcher.dispatch(notification);

      // File should still succeed despite CLI crash
      expect(result.channels).toContain('file');
      expect(result.success).toBe(false); // CLI failed
    });
  });
});
