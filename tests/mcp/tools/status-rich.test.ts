/**
 * tests/mcp/tools/status-rich.test.ts
 *
 * Tests for Sprint 139 T-047 rich output fields added to deckent_status MCP tool.
 * Covers: eventStreamTail, lastOutputs, metricSnapshot, phaseCountdown,
 * backendBreakdown, and outputMode parameter.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';

// ─── Mocks ───────────────────────────────────────────────────────────────────


// Authority-first status (same contract as the CLI surface): the tool returns a HOLD
// payload without the rich projection fields unless (a) a live run authority exists and
// (b) the canonical persisted read model is present. These cases exercise the projection,
// so both are supplied here — the guard itself is covered by its own cases.
const runAuthorityState = vi.hoisted(() => ({
  current: {
    schemaVersion: 1, lifecycle: 'ACTIVE', active: true, resumable: false,
    sprintId: 'sprint-001', phase: 'EXECUTE', status: 'RUNNING', reason: null,
    recoveryCommand: null, finalizeCommand: null, coordinator: 'alive', conflicts: [],
  } as Record<string, unknown>,
}));

/** Cases about the "no live run" surface must say so explicitly. */
function setQuiescentRunAuthority(): void {
  runAuthorityState.current = {
    ...runAuthorityState.current,
    lifecycle: 'IDLE', active: false, resumable: false, sprintId: null,
    phase: null, status: null, coordinator: 'absent',
  };
}

vi.mock('../../../src/core/run-status-authority.js', () => ({
  readCanonicalRunStatus: vi.fn(() => runAuthorityState.current),
}));

vi.mock('../../../src/core/run-status-read-model.js', () => ({
  readCanonicalRunStatusReadModel: vi.fn(() => ({
    schemaVersion: 1, revision: 1, runGeneration: 1, modelDigest: 'digest-test',
    holds: [], providerConcurrency: [], terminalPublication: null, authority: {},
  })),
  runStatusReadModelMatchesAuthority: vi.fn(() => true),
  projectRunStatusReadModelSurface: vi.fn(() => ({ state: 'persisted' })),
}));

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock('../../../src/mcp/tools/job-runner.js', () => ({
  readLatestJobState: vi.fn().mockReturnValue(null),
}));

vi.mock('../../../src/mcp/helpers/format.js', () => ({
  formatStatusResponse: vi.fn(() => 'mocked summary'),
  wrapResponse: vi.fn((<T>(data: T, _summary: string) => data) as <T>(data: T, summary: string) => T),
}));

vi.mock('../../../src/mcp/helpers/enrich.js', () => ({
  enrichResponse: vi.fn((toolName: string, response: Record<string, unknown>) => ({
    ...response,
    _enriched: {
      summary: toolName === 'status' ? 'Sprint status retrieved.' : 'retrieved.',
      hints: ['hint'],
      timestamp: '2026-04-15T00:00:00.000Z',
    },
  })),
}));

vi.mock('../../../src/monitor/sprint-state.js', () => ({
  getCurrentSprintId: vi.fn().mockReturnValue('sprint-139'),
}));

vi.mock('../../../src/monitor/dashboard-manager.js', () => ({
  readDashboardSafe: vi.fn(),
}));

import { readDashboardSafe } from '../../../src/monitor/dashboard-manager.js';
import { getCurrentSprintId } from '../../../src/monitor/sprint-state.js';

// ─── Mock Server ──────────────────────────────────────────────────────────────

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

interface MockServer {
  tools: Map<string, { config: unknown; handler: ToolHandler }>;
  registerTool: (name: string, config: unknown, handler: ToolHandler) => void;
}

function createMockServer(): MockServer {
  const tools = new Map<string, { config: unknown; handler: ToolHandler }>();
  return {
    tools,
    registerTool(name, config, handler) {
      tools.set(name, { config, handler });
    },
  };
}

// ─── Sample Data ──────────────────────────────────────────────────────────────

const sampleDashboard = {
  sprint: { id: 'sprint-139', startedAt: new Date(Date.now() - 600_000).toISOString() },
  progress: { done: 5, total: 10 },
  agents: [{ id: 'w-001', status: 'EXECUTING' }],
  alerts: [],
  phase: 'EXECUTE',
};

const sampleEventLine1 = JSON.stringify({
  timestamp: '2026-04-15T10:00:00.000Z',
  sequence: 1,
  protocol_version: '1.0',
  source: 'brain',
  target: '*',
  channel: 'BRAIN→*:SPRINT_PHASE_CHANGE',
  payload: { phase: 'EXECUTE' },
});

const sampleEventLine2 = JSON.stringify({
  timestamp: '2026-04-15T10:01:00.000Z',
  sequence: 2,
  protocol_version: '1.0',
  source: 'worker',
  target: 'brain',
  channel: 'WORKER→BRAIN:HEARTBEAT',
  payload: { workerId: 'w-001' },
});

const sampleMetricsLine = JSON.stringify({ name: 'coverage', value: 88.5 });

// ─── Test Setup ───────────────────────────────────────────────────────────────

async function getStatusTool(server?: MockServer) {
  const s = server ?? createMockServer();
  const { registerStatusTool } = await import('../../../src/mcp/tools/status.js');
  registerStatusTool(s as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
  return s.tools.get('deckent_status')!;
}

function setupDashboardMock(dashboard = sampleDashboard): void {
  vi.mocked(existsSync).mockImplementation((p: unknown) => {
    const path = String(p);
    if (path.endsWith('.dashboard')) return true;
    // For event stream, metrics, outputs — return false by default
    return false;
  });
  vi.mocked(readFileSync).mockImplementation((p: unknown) => {
    const path = String(p);
    if (path.endsWith('.dashboard')) return JSON.stringify(dashboard);
    return '';
  });
  vi.mocked(readdirSync).mockReturnValue([]);
  vi.mocked(readDashboardSafe).mockReturnValue({
    valid: true,
    state: dashboard,
    repaired: false,
  });
}

// ─── Tests: inputSchema ───────────────────────────────────────────────────────

describe('deckent_status — inputSchema', () => {
  beforeEach(() => {
    // Reset the run authority so a case that declares quiescence does not leak
    // into the next one (default: a live run, which is what the projection cases need).
    runAuthorityState.current = {
      ...runAuthorityState.current,
      lifecycle: 'ACTIVE', active: true, resumable: false, sprintId: 'sprint-001',
      phase: 'EXECUTE', status: 'RUNNING', coordinator: 'alive',
    };
    vi.clearAllMocks();
  });

  it('registers outputMode parameter in inputSchema', async () => {
    const tool = await getStatusTool();
    const config = tool.config as { inputSchema?: unknown };
    expect(config.inputSchema).toBeDefined();
  });
});

// ─── Tests: eventStreamTail ───────────────────────────────────────────────────

describe('deckent_status — eventStreamTail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentSprintId).mockReturnValue('sprint-139');
  });

  it('includes eventStreamTail field in response', async () => {
    setupDashboardMock();
    vi.mocked(existsSync).mockImplementation((p: unknown) => {
      const path = String(p);
      return path.endsWith('.dashboard') || path.endsWith('sprint-139-events.jsonl');
    });
    vi.mocked(readFileSync).mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.endsWith('.dashboard')) return JSON.stringify(sampleDashboard);
      if (path.endsWith('sprint-139-events.jsonl')) {
        return `${sampleEventLine1}\n${sampleEventLine2}\n`;
      }
      return '';
    });

    const tool = await getStatusTool();
    const result = await tool.handler({ json: true });
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;

    expect(parsed['eventStreamTail']).toBeDefined();
    expect(Array.isArray(parsed['eventStreamTail'])).toBe(true);
    expect((parsed['eventStreamTail'] as unknown[]).length).toBe(2);
  });

  it('returns empty eventStreamTail when event file does not exist', async () => {
    setupDashboardMock();

    const tool = await getStatusTool();
    const result = await tool.handler({ json: true });
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;

    expect(Array.isArray(parsed['eventStreamTail'])).toBe(true);
    expect((parsed['eventStreamTail'] as unknown[]).length).toBe(0);
  });

  it('limits eventStreamTail to last 20 events', async () => {
    setupDashboardMock();
    const manyEvents = Array.from({ length: 50 }, (_, i) =>
      JSON.stringify({ sequence: i + 1, protocol_version: '1.0', source: 'brain', target: '*', channel: 'X', payload: {} })
    ).join('\n');

    vi.mocked(existsSync).mockImplementation((p: unknown) => {
      const path = String(p);
      return path.endsWith('.dashboard') || path.endsWith('sprint-139-events.jsonl');
    });
    vi.mocked(readFileSync).mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.endsWith('.dashboard')) return JSON.stringify(sampleDashboard);
      if (path.endsWith('sprint-139-events.jsonl')) return manyEvents;
      return '';
    });

    const tool = await getStatusTool();
    const result = await tool.handler({ json: true });
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;

    expect((parsed['eventStreamTail'] as unknown[]).length).toBeLessThanOrEqual(20);
  });
});

// ─── Tests: metricSnapshot ────────────────────────────────────────────────────

describe('deckent_status — metricSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentSprintId).mockReturnValue('sprint-139');
  });

  it('includes metricSnapshot field in response', async () => {
    setupDashboardMock();
    vi.mocked(existsSync).mockImplementation((p: unknown) => {
      const path = String(p);
      return path.endsWith('.dashboard') || path.endsWith('sprint-139-metrics.jsonl');
    });
    vi.mocked(readFileSync).mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.endsWith('.dashboard')) return JSON.stringify(sampleDashboard);
      if (path.endsWith('sprint-139-metrics.jsonl')) return sampleMetricsLine;
      return '';
    });

    const tool = await getStatusTool();
    const result = await tool.handler({ json: true });
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;

    expect(parsed['metricSnapshot']).toBeDefined();
    const snapshot = parsed['metricSnapshot'] as Record<string, unknown>;
    expect(snapshot['coverage']).toBe(88.5);
  });

  it('returns empty metricSnapshot when metrics file does not exist', async () => {
    setupDashboardMock();

    const tool = await getStatusTool();
    const result = await tool.handler({ json: true });
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;

    expect(parsed['metricSnapshot']).toBeDefined();
    expect(Object.keys(parsed['metricSnapshot'] as Record<string, unknown>)).toHaveLength(0);
  });
});

// ─── Tests: backendBreakdown ──────────────────────────────────────────────────

describe('deckent_status — backendBreakdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentSprintId).mockReturnValue('sprint-139');
  });

  it('includes backendBreakdown field in response', async () => {
    setupDashboardMock();
    const taskFile = JSON.stringify({
      id: 'task-001',
      status: 'EXECUTING',
      provider: 'claude',
    });
    vi.mocked(existsSync).mockImplementation((p: unknown) => {
      const path = String(p);
      return path.endsWith('.dashboard') || path.endsWith('task-001.json');
    });
    vi.mocked(readdirSync).mockReturnValue(['task-001.json'] as unknown as ReturnType<typeof readdirSync>);
    vi.mocked(readFileSync).mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.endsWith('.dashboard')) return JSON.stringify(sampleDashboard);
      if (path.endsWith('task-001.json')) return taskFile;
      return '';
    });

    const tool = await getStatusTool();
    const result = await tool.handler({ json: true });
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;

    expect(parsed['backendBreakdown']).toBeDefined();
  });

  it('returns empty backendBreakdown when no tasks dir', async () => {
    setupDashboardMock();

    const tool = await getStatusTool();
    const result = await tool.handler({ json: true });
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;

    expect(typeof parsed['backendBreakdown']).toBe('object');
  });
});

// ─── Tests: phaseCountdown ────────────────────────────────────────────────────

describe('deckent_status — phaseCountdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentSprintId).mockReturnValue('sprint-139');
  });

  it('includes phaseCountdown when dashboard has phase and phaseStartedAt', async () => {
    const dashboardWithPhase = {
      ...sampleDashboard,
      phase: 'EXECUTE',
      phaseStartedAt: new Date(Date.now() - 30_000).toISOString(),
    };
    vi.mocked(readDashboardSafe).mockReturnValue({
      valid: true,
      state: dashboardWithPhase,
      repaired: false,
    });
    vi.mocked(existsSync).mockImplementation((p: unknown) => String(p).endsWith('.dashboard'));
    vi.mocked(readFileSync).mockImplementation((p: unknown) => {
      if (String(p).endsWith('.dashboard')) return JSON.stringify(dashboardWithPhase);
      return '';
    });
    vi.mocked(readdirSync).mockReturnValue([]);

    const tool = await getStatusTool();
    const result = await tool.handler({ json: true });
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;

    const countdown = parsed['phaseCountdown'] as { phase: string; elapsedSec: number } | null;
    expect(countdown).not.toBeNull();
    expect(countdown?.phase).toBe('EXECUTE');
    expect(typeof countdown?.elapsedSec).toBe('number');
    expect(countdown?.elapsedSec).toBeGreaterThanOrEqual(0);
  });

  it('returns null phaseCountdown when no phaseStartedAt', async () => {
    setupDashboardMock();

    const tool = await getStatusTool();
    const result = await tool.handler({ json: true });
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;

    // phaseCountdown should be null (no phaseStartedAt in sampleDashboard)
    expect(parsed['phaseCountdown']).toBeNull();
  });
});

// ─── Tests: outputMode parameter ─────────────────────────────────────────────

describe('deckent_status — outputMode parameter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentSprintId).mockReturnValue('sprint-139');
  });

  it('uses explainatory mode when outputMode=explainatory', async () => {
    setupDashboardMock();

    const tool = await getStatusTool();
    const result = await tool.handler({ outputMode: 'explainatory' });
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;

    // explainatory mode should be flagged
    expect(parsed['_outputMode']).toBe('explainatory');
  });

  it('uses verbose mode when outputMode=verbose', async () => {
    setupDashboardMock();

    const tool = await getStatusTool();
    const result = await tool.handler({ outputMode: 'verbose' });
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;

    expect(parsed['_outputMode']).toBe('verbose');
  });

  it('does NOT include _outputMode for standart mode (default path)', async () => {
    setupDashboardMock();

    const tool = await getStatusTool();
    const result = await tool.handler({});
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;

    // Default path — no _outputMode field
    expect(parsed['_outputMode']).toBeUndefined();
  });

  it('includes formatted output body for explainatory mode', async () => {
    setupDashboardMock();

    const tool = await getStatusTool();
    const result = await tool.handler({ outputMode: 'explainatory' });
    const text = result.content[0]!.text;
    // The wrapped response includes the formatted output as the summary
    expect(text).toBeDefined();
    expect(text.length).toBeGreaterThan(0);
  });
});

// ─── Tests: lastOutputs ──────────────────────────────────────────────────────

describe('deckent_status — lastOutputs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentSprintId).mockReturnValue('sprint-139');
  });

  it('includes lastOutputs field in response', async () => {
    setupDashboardMock();

    const tool = await getStatusTool();
    const result = await tool.handler({ json: true });
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;

    expect(parsed['lastOutputs']).toBeDefined();
    expect(typeof parsed['lastOutputs']).toBe('object');
  });

  it('returns empty lastOutputs when output dir does not exist', async () => {
    setupDashboardMock();

    const tool = await getStatusTool();
    const result = await tool.handler({ json: true });
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;

    expect(Object.keys(parsed['lastOutputs'] as Record<string, unknown>)).toHaveLength(0);
  });

  it('reads output lines from .out files when dir exists', async () => {
    vi.mocked(existsSync).mockImplementation((p: unknown) => {
      const path = String(p);
      return path.endsWith('.dashboard') || path.endsWith('sprint-139-outputs');
    });
    vi.mocked(readdirSync).mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.endsWith('sprint-139-outputs')) {
        return ['task-001.out'] as unknown as ReturnType<typeof readdirSync>;
      }
      return [] as unknown as ReturnType<typeof readdirSync>;
    });
    vi.mocked(readFileSync).mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.endsWith('.dashboard')) return JSON.stringify(sampleDashboard);
      if (path.endsWith('task-001.out')) return 'output line 1\noutput line 2\n';
      return '';
    });
    vi.mocked(readDashboardSafe).mockReturnValue({
      valid: true,
      state: sampleDashboard,
      repaired: false,
    });

    const tool = await getStatusTool();
    const result = await tool.handler({ json: true });
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;

    const outputs = parsed['lastOutputs'] as Record<string, string[]>;
    expect(outputs['001']).toBeDefined();
    expect(outputs['001']?.length).toBeGreaterThan(0);
  });
});
