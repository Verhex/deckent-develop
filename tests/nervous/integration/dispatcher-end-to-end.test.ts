// tests/nervous/integration/dispatcher-end-to-end.test.ts
//
// Integration: Full pipeline — Detector → Decision → Proposer → Executor → Dispatcher
// Sprint 147 Task 19

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DetectorResult, NervousSystemConfigV1, NervousNotification } from '../../../src/core/nervous-types.js';
import { DecisionEngine } from '../../../src/nervous/decision-engine.js';
import { Proposer } from '../../../src/nervous/proposer.js';
import { NervousDispatcher, type ChannelAdapter } from '../../../src/nervous/dispatcher.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<NervousSystemConfigV1> = {}): NervousSystemConfigV1 {
  return {
    mode: 'balanced',
    enabled: true,
    ...overrides,
  };
}

function makeFullConfig(): NervousSystemConfigV1 {
  return {
    mode: 'balanced',
    enabled: true,
    notifications: {
      channels: { mcp: true, cli: true, file: true },
      throttle_ms: 300000,
      severity_min: 'info',
    },
  } as unknown as NervousSystemConfigV1;
}

function makeMockAdapter(success = true): ChannelAdapter {
  return { push: vi.fn().mockResolvedValue(success) };
}

describe('Dispatcher End-to-End Integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should dispatch critical notification to all enabled channels', async () => {
    const config = makeFullConfig();
    const engine = new DecisionEngine(config);
    const proposer = new Proposer(config);

    const mcpAdapter = makeMockAdapter();
    const cliAdapter = makeMockAdapter();
    const fileAdapter = makeMockAdapter();

    const dispatcher = new NervousDispatcher(config, '/tmp/project', {
      mcpAdapter,
      cliAdapter,
      fileAdapter,
      isMcpActive: () => true,
      isTtyAvailable: () => true,
    });

    // Simulate emergency detector result (DIRECTIVES.md corruption)
    const detectorResult: DetectorResult = {
      risk: 'high',
      shouldNotify: true,
      severity: 'emergency',
      // bug-2: title/message are now required on DetectorResult.
      title: 'EMERGENCY: DIRECTIVES.md corrupted',
      message: 'Template reversion detected',
      groupKey: 'directives-protection:sprint-147',
      suggestedActions: [{
        id: 'DIRECTIVES_WRITE',
        label: 'Restore DIRECTIVES.md',
        risk: 'high',
        payload: { autoRestore: true },
      }],
      metadata: { type: 'directives-protection' },
    };

    const decisions = engine.decide(detectorResult);
    const notification = proposer.propose(detectorResult, decisions, {
      detectorId: 'directives-protection',
      title: 'EMERGENCY: DIRECTIVES.md corrupted',
      message: 'Template reversion detected',
      now: new Date('2026-04-20T12:00:00Z'),
    });

    const result = await dispatcher.dispatch(notification!);

    // Emergency → all channels
    expect(result.channels).toContain('file');
    expect(result.channels).toContain('mcp');
    expect(result.channels).toContain('cli');
    expect(result.success).toBe(true);
    expect(fileAdapter.push).toHaveBeenCalledTimes(1);
    expect(mcpAdapter.push).toHaveBeenCalledTimes(1);
    expect(cliAdapter.push).toHaveBeenCalledTimes(1);
  });

  it('should dispatch info notification only to file and context-detected channel', async () => {
    const config = makeFullConfig();
    const engine = new DecisionEngine(config);
    const proposer = new Proposer(config);

    const mcpAdapter = makeMockAdapter();
    const cliAdapter = makeMockAdapter();
    const fileAdapter = makeMockAdapter();

    const dispatcher = new NervousDispatcher(config, '/tmp/project', {
      mcpAdapter,
      cliAdapter,
      fileAdapter,
      isMcpActive: () => false,
      isTtyAvailable: () => true, // CLI context
    });

    const detectorResult: DetectorResult = {
      risk: 'low',
      shouldNotify: true,
      severity: 'info',
      // bug-2: title/message are now required on DetectorResult.
      title: 'Log rotation needed',
      message: 'Rotate sprint logs',
      suggestedActions: [{
        id: 'LOG_ROTATION',
        label: 'Rotate logs',
        risk: 'low',
        payload: {},
      }],
      metadata: { type: 'log-rotation' },
    };

    const decisions = engine.decide(detectorResult);
    const notification = proposer.propose(detectorResult, decisions, {
      detectorId: 'log-monitor',
      title: 'Log rotation needed',
      message: 'Rotate sprint logs',
      now: new Date('2026-04-20T12:00:00Z'),
    });

    const result = await dispatcher.dispatch(notification!);
    expect(result.channels).toContain('file');
    expect(result.channels).toContain('cli');
    expect(result.channels).not.toContain('mcp');
    expect(mcpAdapter.push).not.toHaveBeenCalled();
  });

  it('should deduplicate same notification ID dispatched twice', async () => {
    const config = makeFullConfig();
    const fileAdapter = makeMockAdapter();

    const dispatcher = new NervousDispatcher(config, '/tmp/project', {
      fileAdapter,
      isMcpActive: () => false,
      isTtyAvailable: () => false,
    });

    const notification: NervousNotification = {
      id: 'dedup-test-001',
      type: 'test',
      title: 'Test',
      message: 'Test message',
      severity: 'info',
      createdAt: new Date().toISOString(),
      detectorId: 'test',
      actions: [],
      timeoutMs: null,
    };

    const result1 = await dispatcher.dispatch(notification);
    expect(result1.channels).toContain('file');

    const result2 = await dispatcher.dispatch(notification);
    expect(result2.channels).toHaveLength(0); // Deduped
    expect(fileAdapter.push).toHaveBeenCalledTimes(1);
  });

  it('should fallback to CLI when MCP adapter fails', async () => {
    const config = makeFullConfig();
    const mcpAdapter = makeMockAdapter(false); // MCP fails
    const cliAdapter = makeMockAdapter(true);
    const fileAdapter = makeMockAdapter(true);

    const dispatcher = new NervousDispatcher(config, '/tmp/project', {
      mcpAdapter,
      cliAdapter,
      fileAdapter,
      isMcpActive: () => true, // MCP context but adapter fails
      isTtyAvailable: () => true,
    });

    const notification: NervousNotification = {
      id: 'fallback-test-001',
      type: 'test',
      title: 'Test notification',
      message: 'Test',
      severity: 'info',
      createdAt: new Date().toISOString(),
      detectorId: 'test-detector',
      actions: [],
      timeoutMs: null,
    };

    const result = await dispatcher.dispatch(notification);
    // MCP failed, should fallback to CLI
    expect(result.channels).toContain('file');
    expect(result.channels).toContain('cli'); // fallback
    expect(cliAdapter.push).toHaveBeenCalled();
  });

  it('should dispatch to MCP when DECKENT_MCP_ACTIVE context detected', async () => {
    const config = makeFullConfig();
    const mcpAdapter = makeMockAdapter();
    const cliAdapter = makeMockAdapter();
    const fileAdapter = makeMockAdapter();

    const dispatcher = new NervousDispatcher(config, '/tmp/project', {
      mcpAdapter,
      cliAdapter,
      fileAdapter,
      isMcpActive: () => true,
      isTtyAvailable: () => false,
    });

    const notification: NervousNotification = {
      id: 'mcp-context-test',
      type: 'test',
      title: 'MCP Test',
      message: 'Test',
      severity: 'warning',
      createdAt: new Date().toISOString(),
      detectorId: 'test',
      actions: [],
      timeoutMs: null,
    };

    const result = await dispatcher.dispatch(notification);
    expect(result.channels).toContain('mcp');
    expect(result.channels).not.toContain('cli');
    expect(mcpAdapter.push).toHaveBeenCalled();
    expect(cliAdapter.push).not.toHaveBeenCalled();
  });

  it('should always include file channel even when all other adapters fail', async () => {
    const config = makeFullConfig();
    const mcpAdapter = makeMockAdapter(false);
    const cliAdapter = makeMockAdapter(false);
    const fileAdapter = makeMockAdapter(true);

    const dispatcher = new NervousDispatcher(config, '/tmp/project', {
      mcpAdapter,
      cliAdapter,
      fileAdapter,
      isMcpActive: () => false,
      isTtyAvailable: () => false,
    });

    const notification: NervousNotification = {
      id: 'file-always-test',
      type: 'test',
      title: 'Test',
      message: 'Only file should work',
      severity: 'info',
      createdAt: new Date().toISOString(),
      detectorId: 'test',
      actions: [],
      timeoutMs: null,
    };

    const result = await dispatcher.dispatch(notification);
    expect(result.channels).toContain('file');
    expect(result.channels).toHaveLength(1);
    expect(fileAdapter.push).toHaveBeenCalled();
  });
});
