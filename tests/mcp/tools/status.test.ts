/**
 * tests/mcp/tools/status.test.ts
 *
 * Tests for deckent_status MCP tool's dependencyGraph field (Task 139-031).
 * Verifies that `verbose: true` includes `dependencyGraph` when depgraph files exist.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock('../../../src/mcp/tools/job-runner.js', () => ({
  readLatestJobState: vi.fn(),
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

const { mockReadCanonicalRunStatus } = vi.hoisted(() => ({
  mockReadCanonicalRunStatus: vi.fn(),
}));
vi.mock('../../../src/core/run-status-authority.js', () => ({
  readCanonicalRunStatus: mockReadCanonicalRunStatus,
}));

const { mockReadRunStatusModel, mockReadProviderConcurrency } = vi.hoisted(() => ({
  mockReadRunStatusModel: vi.fn(),
  mockReadProviderConcurrency: vi.fn(() => []),
}));
vi.mock('../../../src/core/run-status-read-model.js', () => ({
  readCanonicalRunStatusReadModel: mockReadRunStatusModel,
  runStatusReadModelMatchesAuthority: vi.fn(() => true),
}));
vi.mock('../../../src/core/provider-concurrency-runtime-reader.js', () => ({
  readProviderConcurrencyRuntime: mockReadProviderConcurrency,
}));

import { readLatestJobState } from '../../../src/mcp/tools/job-runner.js';
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
  usage: { tokens: 5000 },
};

const sampleMmd = `graph TD
  t_139_001["139-001 (W0)"]
  t_139_002["139-002 (W1)"]
  t_139_001 --> t_139_002`;

const sampleDepGraphJson = {
  sprintId: 'sprint-139',
  dependencies: { 't_139_002': ['t_139_001'] },
  dependents: { 't_139_001': ['t_139_002'] },
  waveAssignment: { 't_139_001': 0, 't_139_002': 1 },
  waves: [{ waveIndex: 0, taskIds: ['t_139_001'] }, { waveIndex: 1, taskIds: ['t_139_002'] }],
  hasCycle: false,
  cycleTaskIds: [],
  persistedAt: '2026-04-15T00:00:00.000Z',
};

// ─── Helper ───────────────────────────────────────────────────────────────────

async function getStatusTool() {
  const { registerStatusTool } = await import('../../../src/mcp/tools/status.js');
  const server = createMockServer();
  registerStatusTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
  const tool = server.tools.get('deckent_status');
  expect(tool).toBeDefined();
  return tool!;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('deckent_status — dependencyGraph field (Task 139-031)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadRunStatusModel.mockReturnValue({
      schemaVersion: 1,
      revision: 1,
      runGeneration: 'lease:test-139',
      modelDigest: 'b'.repeat(64),
      holds: [],
      logicalProgress: {
        done: 5, active: 1, blocked: 4, total: 10, attemptCount: 10, lineages: [],
      },
      providerConcurrency: [],
      terminalPublication: { version: 1, state: 'open', receipt: null },
    });
    mockReadProviderConcurrency.mockReturnValue([]);
    vi.mocked(readLatestJobState).mockReturnValue(null);
    vi.mocked(getCurrentSprintId).mockReturnValue('sprint-139');
    mockReadCanonicalRunStatus.mockImplementation(() => {
      const sprintId = vi.mocked(getCurrentSprintId)();
      return {
        schemaVersion: 1,
        lifecycle: sprintId ? 'ACTIVE' : 'IDLE',
        active: sprintId !== null,
        resumable: false,
        sprintId,
        phase: sprintId ? 'EXECUTE' : null,
        status: sprintId ? 'ACTIVE' : null,
        reason: null,
        recoveryCommand: null,
        finalizeCommand: null,
        coordinator: sprintId ? 'alive' : 'absent',
        conflicts: [],
      };
    });

    // Default: valid dashboard
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([] as unknown as ReturnType<typeof readdirSync>);
    vi.mocked(readDashboardSafe).mockReturnValue({
      valid: true,
      state: sampleDashboard,
      repaired: false,
    });
    // Default readFileSync returns dashboard JSON
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(sampleDashboard));
  });

  // ── MCP verbose=false ─────────────────────────────────────────────────────

  describe('verbose=false (default)', () => {
    it('projects the persisted read-model revision and provider concurrency', async () => {
      mockReadRunStatusModel.mockReturnValue({
        schemaVersion: 1,
        revision: 7,
        runGeneration: 'lease:139',
        modelDigest: 'a'.repeat(64),
        holds: [],
        logicalProgress: {
          done: 5, active: 1, blocked: 4, total: 10, attemptCount: 10, lineages: [],
        },
        providerConcurrency: [{
          providerPrincipalDigest: 'principal-139',
          admission: 'HOLD',
          admittedCeiling: 'unknown',
          currentAttained: 1,
          peakAttained: 1,
          unresolvedOpenIntervals: 0,
          observationScope: 'exact-task-set',
          evidenceRefs: [],
        }],
        terminalPublication: { version: 1, state: 'open', receipt: null },
      });
      const tool = await getStatusTool();
      const result = await tool.handler({ json: true, verbose: false });
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.statusReadModel).toMatchObject({ state: 'persisted', revision: 7 });
      expect(parsed.providerConcurrency[0]).toMatchObject({ currentAttained: 1 });
      expect(mockReadProviderConcurrency).not.toHaveBeenCalled();
    });

    it('does NOT include dependencyGraph when verbose=false', async () => {
      const tool = await getStatusTool();
      const result = await tool.handler({ verbose: false });
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.dependencyGraph).toBeUndefined();
    });

    it('does NOT include dependencyGraph when verbose is omitted', async () => {
      const tool = await getStatusTool();
      const result = await tool.handler({});
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.dependencyGraph).toBeUndefined();
    });
  });

  // ── MCP verbose=true — no depgraph file ───────────────────────────────────

  describe('verbose=true — no depgraph file', () => {
    it('returns undefined dependencyGraph when no depgraph files exist', async () => {
      // existsSync: dashboard true, depgraph files false
      vi.mocked(existsSync).mockImplementation((p: unknown) => {
        const path = String(p);
        if (path.includes('depgraph')) return false;
        return true;
      });

      const tool = await getStatusTool();
      const result = await tool.handler({ verbose: true });
      const parsed = JSON.parse(result.content[0]!.text);
      // dependencyGraph should be absent (null check omitted from verboseFields)
      expect(parsed.dependencyGraph).toBeUndefined();
    });
  });

  // ── MCP verbose=true — with depgraph files ───────────────────────────────

  describe('verbose=true — with depgraph files', () => {
    beforeEach(() => {
      // existsSync: dashboard=true, mmd=true, json=true
      vi.mocked(existsSync).mockReturnValue(true);
      // readFileSync: return appropriate content based on path
      vi.mocked(readFileSync).mockImplementation((p: unknown) => {
        const path = String(p);
        if (path.endsWith('.mmd')) return sampleMmd;
        if (path.endsWith('depgraph.json')) return JSON.stringify(sampleDepGraphJson);
        return JSON.stringify(sampleDashboard);
      });
    });

    it('includes dependencyGraph field when verbose=true and depgraph exists', async () => {
      const tool = await getStatusTool();
      const result = await tool.handler({ verbose: true });
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.dependencyGraph).toBeDefined();
    });

    it('dependencyGraph has format=mermaid', async () => {
      const tool = await getStatusTool();
      const result = await tool.handler({ verbose: true });
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.dependencyGraph?.format).toBe('mermaid');
    });

    it('dependencyGraph.content contains Mermaid graph TD syntax', async () => {
      const tool = await getStatusTool();
      const result = await tool.handler({ verbose: true });
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.dependencyGraph?.content).toContain('graph TD');
    });

    it('dependencyGraph.content contains task node definitions', async () => {
      const tool = await getStatusTool();
      const result = await tool.handler({ verbose: true });
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.dependencyGraph?.content).toContain('139-001');
    });

    it('dependencyGraph.json contains wave and dependency data', async () => {
      const tool = await getStatusTool();
      const result = await tool.handler({ verbose: true });
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.dependencyGraph?.json).toBeDefined();
      expect((parsed.dependencyGraph?.json as typeof sampleDepGraphJson).hasCycle).toBe(false);
    });

    it('dependencyGraph.json contains sprintId', async () => {
      const tool = await getStatusTool();
      const result = await tool.handler({ verbose: true });
      const parsed = JSON.parse(result.content[0]!.text);
      const depJson = parsed.dependencyGraph?.json as typeof sampleDepGraphJson;
      expect(depJson.sprintId).toBe('sprint-139');
    });
  });

  // ── MCP verbose=true — only mmd exists ───────────────────────────────────

  describe('verbose=true — only mmd exists (no json)', () => {
    it('returns dependencyGraph with content when only mmd exists', async () => {
      vi.mocked(existsSync).mockImplementation((p: unknown) => {
        const path = String(p);
        if (path.endsWith('.mmd')) return true;
        if (path.endsWith('depgraph.json')) return false;
        return true; // dashboard
      });
      vi.mocked(readFileSync).mockImplementation((p: unknown) => {
        const path = String(p);
        if (path.endsWith('.mmd')) return sampleMmd;
        return JSON.stringify(sampleDashboard);
      });

      const tool = await getStatusTool();
      const result = await tool.handler({ verbose: true });
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.dependencyGraph?.format).toBe('mermaid');
      expect(parsed.dependencyGraph?.content).toContain('graph TD');
    });
  });

  // ── MCP verbose=true — no sprint ID anywhere ─────────────────────────────

  describe('verbose=true — no sprint ID', () => {
    it('does NOT include dependencyGraph when both canonical and dashboard sprintId are null', async () => {
      // Dashboard with no sprint.id and canonical returning null
      vi.mocked(getCurrentSprintId).mockReturnValue(null);
      const dashboardNoId = { ...sampleDashboard, sprint: { startedAt: undefined } };
      vi.mocked(readDashboardSafe).mockReturnValue({
        valid: true,
        state: dashboardNoId,
        repaired: false,
      });
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(dashboardNoId));

      const tool = await getStatusTool();
      const result = await tool.handler({ verbose: true });
      const parsed = JSON.parse(result.content[0]!.text);
      // With no sprint ID, loadDepGraphFiles is not called → no dependencyGraph
      expect(parsed.dependencyGraph).toBeUndefined();
    });
  });

  // ── Tool schema ───────────────────────────────────────────────────────────

  describe('tool schema', () => {
    it('tool has verbose parameter in inputSchema', async () => {
      const { registerStatusTool } = await import('../../../src/mcp/tools/status.js');
      const server = createMockServer();
      registerStatusTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
      const tool = server.tools.get('deckent_status')!;
      expect(tool).toBeDefined();
      // Verify tool is registered with inputSchema containing verbose
      const config = tool.config as { inputSchema?: unknown };
      expect(config.inputSchema).toBeDefined();
    });
  });
});

// ─── Metric Snapshot Tests (T-150-038) ───────────────────────────────────────

describe('deckent_status — metricSnapshot (T-150-038)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readLatestJobState).mockReturnValue(null);
    vi.mocked(getCurrentSprintId).mockReturnValue('sprint-150');
    vi.mocked(readdirSync).mockReturnValue([] as unknown as ReturnType<typeof readdirSync>);
    vi.mocked(readDashboardSafe).mockReturnValue({
      valid: true,
      state: { ...sampleDashboard, sprint: { id: 'sprint-150', startedAt: new Date(Date.now() - 300_000).toISOString() } },
      repaired: false,
    });
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(sampleDashboard));
  });

  // ── Per-sprint file takes priority ───────────────────────────────────────

  it('reads metricSnapshot from per-sprint file when it exists', async () => {
    const perSprintMetrics = [
      JSON.stringify({ type: 'metric', name: 'task.done', value: 5, tags: { sprintId: 'sprint-150' }, timestamp: '2026-04-21T10:00:00.000Z' }),
      JSON.stringify({ type: 'metric', name: 'worker.active', value: 3, tags: { sprintId: 'sprint-150' }, timestamp: '2026-04-21T10:00:01.000Z' }),
    ].join('\n');

    vi.mocked(existsSync).mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.includes('sprint-150-metrics.jsonl')) return true;
      if (path.includes('.dashboard')) return true;
      return true;
    });

    vi.mocked(readFileSync).mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.includes('sprint-150-metrics.jsonl')) return perSprintMetrics;
      return JSON.stringify(sampleDashboard);
    });

    const tool = await getStatusTool();
    const result = await tool.handler({ json: true });
    const parsed = JSON.parse(result.content[0]!.text) as { metricSnapshot?: Record<string, unknown> };

    expect(parsed.metricSnapshot).toBeDefined();
    expect(parsed.metricSnapshot?.['task.done']).toBe(5);
    expect(parsed.metricSnapshot?.['worker.active']).toBe(3);
  });

  // ── Flat file fallback with sprintId tag filter ───────────────────────────

  it('falls back to flat metrics.jsonl when per-sprint file does not exist, filtering by sprintId', async () => {
    const flatMetrics = [
      // sprint-149 entry — should be excluded
      JSON.stringify({ type: 'metric', name: 'old.metric', value: 99, tags: { sprintId: 'sprint-149' }, timestamp: '2026-04-20T00:00:00.000Z' }),
      // sprint-150 entry — should be included
      JSON.stringify({ type: 'metric', name: 'task.done', value: 8, tags: { sprintId: 'sprint-150' }, timestamp: '2026-04-21T10:00:00.000Z' }),
      // untagged entry — retro-compat: included
      JSON.stringify({ type: 'metric', name: 'untagged.metric', value: 1, tags: {}, timestamp: '2026-04-21T10:00:02.000Z' }),
    ].join('\n');

    vi.mocked(existsSync).mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.includes('sprint-150-metrics.jsonl')) return false;
      if (path.includes('metrics.jsonl')) return true;
      return true;
    });

    vi.mocked(readFileSync).mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.endsWith('metrics.jsonl') && !path.includes('sprint-150-metrics')) return flatMetrics;
      return JSON.stringify(sampleDashboard);
    });

    const tool = await getStatusTool();
    const result = await tool.handler({ json: true });
    const parsed = JSON.parse(result.content[0]!.text) as { metricSnapshot?: Record<string, unknown> };

    expect(parsed.metricSnapshot).toBeDefined();
    // sprint-150 entry included
    expect(parsed.metricSnapshot?.['task.done']).toBe(8);
    // sprint-149 entry excluded
    expect(parsed.metricSnapshot?.['old.metric']).toBeUndefined();
    // untagged entry included (retro-compat)
    expect(parsed.metricSnapshot?.['untagged.metric']).toBe(1);
  });

  // ── No metrics file → empty snapshot ─────────────────────────────────────

  it('returns empty metricSnapshot when neither per-sprint nor flat metrics file exists', async () => {
    vi.mocked(existsSync).mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.includes('metrics.jsonl')) return false;
      return true;
    });

    const tool = await getStatusTool();
    const result = await tool.handler({ json: true });
    const parsed = JSON.parse(result.content[0]!.text) as { metricSnapshot?: Record<string, unknown> };

    expect(parsed.metricSnapshot).toBeDefined();
    expect(Object.keys(parsed.metricSnapshot ?? {})).toHaveLength(0);
  });

  // ── Per-sprint file is present in rawData output ──────────────────────────

  it('includes metricSnapshot in standard (non-json) response', async () => {
    const perSprintMetrics = JSON.stringify({
      type: 'metric',
      name: 'hb.stale',
      value: 0,
      tags: { sprintId: 'sprint-150' },
      timestamp: '2026-04-21T10:00:00.000Z',
    });

    vi.mocked(existsSync).mockReturnValue(true);

    vi.mocked(readFileSync).mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.includes('sprint-150-metrics.jsonl')) return perSprintMetrics;
      return JSON.stringify(sampleDashboard);
    });

    const tool = await getStatusTool();
    // Standard (non-json) response
    const result = await tool.handler({ json: false });
    const parsed = JSON.parse(result.content[0]!.text) as { metricSnapshot?: Record<string, unknown> };

    expect(parsed.metricSnapshot).toBeDefined();
    expect(parsed.metricSnapshot?.['hb.stale']).toBe(0);
  });

  // ── Integration: sprint-scoped chain (T-150-030 + T-150-038) ─────────────

  it('chain: per-sprint metrics file written by observability, read by status tool', async () => {
    // Simulates the T-150-030 + T-150-038 chain:
    // observability.ts (perSprintFile=true) writes sprint-150-metrics.jsonl
    // status.ts readMetricSnapshot() reads it
    const chainedMetrics = [
      JSON.stringify({ type: 'metric', name: 'collect.batch', value: 12, tags: { sprintId: 'sprint-150' }, timestamp: '2026-04-21T10:00:00.000Z' }),
      JSON.stringify({ type: 'metric', name: 'result.collected', value: 7, tags: { sprintId: 'sprint-150' }, timestamp: '2026-04-21T10:00:01.000Z' }),
      JSON.stringify({ type: 'trace', operation: 'sprint.plan', durationMs: 250, success: true, timestamp: '2026-04-21T10:00:02.000Z' }),
    ].join('\n');

    vi.mocked(existsSync).mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.includes('sprint-150-metrics.jsonl')) return true;
      return true;
    });

    vi.mocked(readFileSync).mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.includes('sprint-150-metrics.jsonl')) return chainedMetrics;
      return JSON.stringify(sampleDashboard);
    });

    const tool = await getStatusTool();
    const result = await tool.handler({ json: true });
    const parsed = JSON.parse(result.content[0]!.text) as { metricSnapshot?: Record<string, unknown> };

    // Metric entries present (trace entry has no 'name' so won't appear in snapshot)
    expect(parsed.metricSnapshot?.['collect.batch']).toBe(12);
    expect(parsed.metricSnapshot?.['result.collected']).toBe(7);
  });
});

// ─── failedTasks (R5-FAILEDTASKS) ────────────────────────────────────────────

describe('deckent_status — failedTasks real NO_GO count (R5-FAILEDTASKS)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readLatestJobState).mockReturnValue(null);
    vi.mocked(getCurrentSprintId).mockReturnValue('sprint-316');
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([] as unknown as ReturnType<typeof readdirSync>);
    vi.mocked(readDashboardSafe).mockReturnValue({
      valid: true,
      state: sampleDashboard,
      repaired: false,
    });
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(sampleDashboard));
  });

  // 3 task files: 2 NO_GO + 1 DONE — failedTasks must equal 2 (not 0)
  it('failedTasks reflects real NO_GO count (≥1 NO_GO → failedTasks > 0)', async () => {
    vi.mocked(readdirSync).mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.includes('.tasks')) {
        return ['task-001.json', 'task-002.json', 'task-003.json'] as unknown as ReturnType<typeof readdirSync>;
      }
      return [] as unknown as ReturnType<typeof readdirSync>;
    });
    vi.mocked(readFileSync).mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.endsWith('task-001.json')) return JSON.stringify({ id: '001', status: 'NO_GO', provider: 'claude' });
      if (path.endsWith('task-002.json')) return JSON.stringify({ id: '002', status: 'NO_GO', provider: 'claude' });
      if (path.endsWith('task-003.json')) return JSON.stringify({ id: '003', status: 'DONE', provider: 'claude' });
      return JSON.stringify(sampleDashboard);
    });

    const tool = await getStatusTool();
    // rich-format path: outputMode=explainatory → resolvedMode !== 'standart' → uses noGoCount
    const result = await tool.handler({ outputMode: 'explainatory' });
    const parsed = JSON.parse(result.content[0]!.text) as { failedTasks?: number };

    // Pre-fix (failedTasks: 0 hardcoded): this assertion FAILS (failedTasks is 0, expected 2)
    // Post-fix (failedTasks: noGoCount): this assertion PASSES (failedTasks is 2)
    expect(parsed.failedTasks).toBe(2);
  });

  // Verify via json path as well (rawData is returned directly)
  it('failedTasks in json response reflects NO_GO count from task files', async () => {
    vi.mocked(readdirSync).mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.includes('.tasks')) {
        return ['task-A.json', 'task-B.json'] as unknown as ReturnType<typeof readdirSync>;
      }
      return [] as unknown as ReturnType<typeof readdirSync>;
    });
    vi.mocked(readFileSync).mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.endsWith('task-A.json')) return JSON.stringify({ id: 'A', status: 'NO_GO', provider: 'claude' });
      if (path.endsWith('task-B.json')) return JSON.stringify({ id: 'B', status: 'DONE', provider: 'claude' });
      return JSON.stringify(sampleDashboard);
    });

    const tool = await getStatusTool();
    const result = await tool.handler({ json: true });
    const parsed = JSON.parse(result.content[0]!.text) as { failedTasks?: number };

    // Pre-fix: failedTasks is absent from rawData → undefined; Post-fix: 1
    expect(parsed.failedTasks).toBe(1);
  });

  // Hardcode regression: failedTasks must NOT always be 0
  it('failedTasks is 0 when no NO_GO tasks exist (DONE-only)', async () => {
    vi.mocked(readdirSync).mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.includes('.tasks')) {
        return ['task-X.json'] as unknown as ReturnType<typeof readdirSync>;
      }
      return [] as unknown as ReturnType<typeof readdirSync>;
    });
    vi.mocked(readFileSync).mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.endsWith('task-X.json')) return JSON.stringify({ id: 'X', status: 'DONE', provider: 'claude' });
      return JSON.stringify(sampleDashboard);
    });

    const tool = await getStatusTool();
    const result = await tool.handler({ json: true });
    const parsed = JSON.parse(result.content[0]!.text) as { failedTasks?: number };

    expect(parsed.failedTasks).toBe(0);
  });
});
