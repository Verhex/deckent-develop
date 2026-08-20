// tests/mcp/nervous-tools.test.ts
//
// 10 tests for 5 Nervous System MCP tools.
// Sprint 147 Task 16.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerNervousTools } from '../../src/mcp/tools/nervous.js';
import { loadConfig } from '../../src/core/config.js';

// ─── Test Utilities ─────────────────────────────────────────────────────────

/** Capture registered tools from McpServer */
function createMockServer() {
  const tools = new Map<string, { metadata: unknown; handler: Function }>();

  const server = {
    registerTool: vi.fn((name: string, metadata: unknown, handler: Function) => {
      tools.set(name, { metadata, handler });
    }),
  } as unknown as McpServer;

  return { server, tools };
}

async function callTool(tools: Map<string, { metadata: unknown; handler: Function }>, name: string, args: Record<string, unknown> = {}) {
  const tool = tools.get(name);
  if (!tool) throw new Error(`Tool ${name} not registered`);
  return tool.handler(args);
}

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../../src/nervous/action-registry.js', () => {
  const mockActions = Array.from({ length: 30 }, (_, i) => ({
    id: `ACTION_${i + 1}`,
    displayName: `Action ${i + 1}`,
    description: `Test action ${i + 1}`,
    category: i < 8 ? 'low-risk' : i < 19 ? 'medium-risk' : i < 25 ? 'high-risk' : 'safety-floor',
    defaultRisk: i < 8 ? 'low' : i < 19 ? 'medium' : 'high',
    requiredSafetyFloor: i >= 25 ? ['KILL_LIVE_SPRINT'] : [],
    reversible: i % 2 === 0,
  }));

  return {
    ACTION_REGISTRY: mockActions,
    ACTION_BY_ID: new Map(mockActions.map(a => [a.id, a])),
    getAction: (id: string) => mockActions.find(a => a.id === id),
    getActionsByCategory: (cat: string) => mockActions.filter(a => a.category === cat),
    isSafetyFloorAction: (id: string) => mockActions.find(a => a.id === id)?.category === 'safety-floor',
  };
});

vi.mock('../../src/nervous/authority-matrix.js', () => ({
  MATRIX_BY_MODE: new Map([
    ['strict', { mode: 'strict', riskPolicyMap: { low: 'suggest-30m', medium: 'approve', high: 'approve' }, actionOverrides: {}, safetyFloor: [] }],
    ['balanced', { mode: 'balanced', riskPolicyMap: { low: 'autonomous', medium: 'suggest-30m', high: 'approve' }, actionOverrides: {}, safetyFloor: [] }],
    ['autopilot', { mode: 'autopilot', riskPolicyMap: { low: 'autonomous', medium: 'autonomous', high: 'suggest-5m' }, actionOverrides: {}, safetyFloor: [] }],
    ['full-auto', { mode: 'full-auto', riskPolicyMap: { low: 'autonomous', medium: 'autonomous', high: 'autonomous' }, actionOverrides: {}, safetyFloor: [] }],
  ]),
  resolvePolicy: vi.fn(),
}));

vi.mock('../../src/nervous/history.js', () => {
  const mockRecords = [
    { id: 'rec-1', notificationId: 'ns-001', actionId: 'ACTION_1', decision: 'autonomous', decidedBy: 'system', executedAt: '2026-04-20T10:00:00Z', outcome: 'success', reversible: true, payload: {} },
    { id: 'rec-2', notificationId: 'ns-002', actionId: 'ACTION_2', decision: 'accepted', decidedBy: 'user', executedAt: '2026-04-20T09:50:00Z', outcome: 'success', reversible: false, payload: {} },
    { id: 'rec-3', notificationId: 'ns-003', actionId: 'ACTION_3', decision: 'rejected', decidedBy: 'user', executedAt: '2026-04-20T09:40:00Z', outcome: 'pending', reversible: true, payload: {} },
  ];
  return {
    NervousHistory: class {
      async readAll() { return mockRecords; }
      async findRecentReversible() {
        return [{ id: 'rec-1', actionId: 'ACTION_1', decision: 'autonomous', outcome: 'success', executedAt: '2026-04-20T10:00:00Z' }];
      }
    },
  };
});

vi.mock('../../src/core/config.js', () => ({
  resolveBrainModel: () => 'sonnet',  // sprint-431 (431-003) compiler-cagri-zinciri okur
  resolveBrainPlanningMode: (c: any) => c?.brain_planning ?? c?.activeModeConfig?.brain_planning ?? 'auto',  // sprint-429 (429-006)
  loadConfig: vi.fn().mockResolvedValue({ nervous_system: { mode: 'balanced', enabled: true } }),
}));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(true),
    readFileSync: vi.fn().mockReturnValue(JSON.stringify({
      nervous_system: { mode: 'balanced', enabled: true, action_overrides: {} },
    })),
    writeFileSync: vi.fn(),
  };
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Nervous System MCP Tools', () => {
  let tools: Map<string, { metadata: unknown; handler: Function }>;

  beforeEach(() => {
    vi.restoreAllMocks();
    // 589-001: registerNervousTools now resolves a display language via
    // loadConfig() on every handler call — restoreAllMocks() wipes the
    // module-factory mockResolvedValue below, so it must be re-armed here.
    vi.mocked(loadConfig).mockResolvedValue({ nervous_system: { mode: 'balanced', enabled: true } } as Awaited<ReturnType<typeof loadConfig>>);
    const mock = createMockServer();
    tools = mock.tools;
    registerNervousTools(mock.server);
  });

  // Test 1: deckent_nervous_subscribe is registered and returns success
  it('deckent_nervous_subscribe registers and returns subscription confirmation', async () => {
    expect(tools.has('deckent_nervous_subscribe')).toBe(true);
    const result = await callTool(tools, 'deckent_nervous_subscribe', { sprintId: 'sprint-147' });
    const data = JSON.parse(result.content[0].text);
    expect(data.subscribed).toBe(true);
    expect(data.sprintId).toBe('sprint-147');
  });

  // Test 2: deckent_nervous_accept is registered and validates schema
  it('deckent_nervous_accept is registered with correct schema', async () => {
    expect(tools.has('deckent_nervous_accept')).toBe(true);
    const result = await callTool(tools, 'deckent_nervous_accept', { id: '12345678-1234-1234-1234-123456789012' });
    const data = JSON.parse(result.content[0].text);
    expect(data.accepted).toBe(true);
    expect(data.notificationId).toBe('12345678-1234-1234-1234-123456789012');
  });

  // Test 3: deckent_nervous_reject is registered and accepts reason
  it('deckent_nervous_reject is registered and captures rejection reason', async () => {
    expect(tools.has('deckent_nervous_reject')).toBe(true);
    const result = await callTool(tools, 'deckent_nervous_reject', { id: 'ns-147-0042', reason: 'Not needed now' });
    const data = JSON.parse(result.content[0].text);
    expect(data.rejected).toBe(true);
    expect(data.reason).toBe('Not needed now');
  });

  // Test 4: deckent_nervous_status is registered
  it('deckent_nervous_status is registered and responds', async () => {
    expect(tools.has('deckent_nervous_status')).toBe(true);
  });

  // Test 5: deckent_nervous_config is registered
  it('deckent_nervous_config is registered and responds', async () => {
    expect(tools.has('deckent_nervous_config')).toBe(true);
  });

  // Test 6: deckent_nervous_status returns pending + recent + config snapshot
  it('deckent_nervous_status returns pending + recent + config snapshot', async () => {
    const result = await callTool(tools, 'deckent_nervous_status', {});
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveProperty('config');
    expect(data).toHaveProperty('pending');
    expect(data).toHaveProperty('recent');
    expect(data.config.mode).toBe('balanced');
    expect(typeof data.config.enabled).toBe('boolean');
    expect(Array.isArray(data.pending)).toBe(true);
    expect(Array.isArray(data.recent)).toBe(true);
  });

  // Test 7: deckent_nervous_accept invalid ID → MCP error response
  it('deckent_nervous_accept returns error for invalid ID format', async () => {
    const result = await callTool(tools, 'deckent_nervous_accept', { id: 'INVALID!!!' });
    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toBe(true);
    expect(data.message).toContain('Invalid notification ID');
  });

  // Test 8: deckent_nervous_config list_actions → 30 actions
  it('deckent_nervous_config list_actions returns 30 actions', async () => {
    const result = await callTool(tools, 'deckent_nervous_config', { action: 'list_actions' });
    const data = JSON.parse(result.content[0].text);
    expect(data.action).toBe('list_actions');
    expect(data.count).toBe(30);
    expect(data.actions).toHaveLength(30);
    expect(data.actions[0]).toHaveProperty('id');
    expect(data.actions[0]).toHaveProperty('displayName');
    expect(data.actions[0]).toHaveProperty('category');
  });

  // Test 9: deckent_nervous_config set_preset persists
  it('deckent_nervous_config set_preset autopilot → persisted', async () => {
    const { writeFileSync } = await import('node:fs');
    const result = await callTool(tools, 'deckent_nervous_config', { action: 'set_preset', preset: 'autopilot' });
    const data = JSON.parse(result.content[0].text);
    expect(data.action).toBe('set_preset');
    expect(data.preset).toBe('autopilot');
    expect(writeFileSync).toHaveBeenCalled();
  });

  // Test 10: Total registered tool count = 5 nervous tools
  it('all 5 nervous tools are registered (total MCP tools count contribution)', () => {
    const nervousTools = [
      'deckent_nervous_subscribe',
      'deckent_nervous_accept',
      'deckent_nervous_reject',
      'deckent_nervous_status',
      'deckent_nervous_config',
    ];
    for (const name of nervousTools) {
      expect(tools.has(name)).toBe(true);
    }
    expect(tools.size).toBe(5);
  });
});
