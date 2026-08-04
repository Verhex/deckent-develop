import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';

// ─── Mocks ───────────────────────────────────────────────────────────


// Authority-first status: the tool holds unless a live run authority AND the canonical
// persisted read model exist. Projection cases supply both. (Same note as status-history.)
// The "no active sprint" case flips the authority to IDLE explicitly.
const runAuthorityState = vi.hoisted(() => ({
  current: {
    schemaVersion: 1, lifecycle: 'ACTIVE', active: true, resumable: false,
    sprintId: 'sprint-030', phase: 'EXECUTE', status: 'RUNNING', reason: null,
    recoveryCommand: null, finalizeCommand: null, coordinator: 'alive', conflicts: [],
  } as Record<string, unknown>,
}));

vi.mock('../../../src/core/run-status-authority.js', () => ({
  readCanonicalRunStatus: vi.fn(() => runAuthorityState.current),
}));

vi.mock('../../../src/core/run-status-read-model.js', () => ({
  readCanonicalRunStatusReadModel: vi.fn(() => ({
    schemaVersion: 1, revision: 1, runGeneration: 'lease:test', modelDigest: 'digest-test',
    holds: [], providerConcurrency: [], terminalPublication: null, authority: {},
  })),
  runStatusReadModelMatchesAuthority: vi.fn(() => true),
}));

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

vi.mock('../../../src/mcp/helpers/enrich.js', () => ({
  enrichResponse: vi.fn((_toolName: string, response: Record<string, unknown>) => ({
    ...response,
    _enriched: {
      summary: 'Sprint status retrieved.',
      hints: [],
      timestamp: '2026-03-22T00:00:00.000Z',
    },
  })),
}));

vi.mock('../../../src/mcp/helpers/format.js', () => ({
  formatStatusResponse: vi.fn(() => 'mocked summary'),
  wrapResponse: vi.fn(<T>(data: T, _summary: string) => data),
}));

import { readLatestJobState } from '../../../src/mcp/tools/job-runner.js';

// ─── Mock Server ─────────────────────────────────────────────────────

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

async function getStatusTool() {
  const { registerStatusTool } = await import('../../../src/mcp/tools/status.js');
  const server = createMockServer();
  registerStatusTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
  const tool = server.tools.get('deckent_status');
  expect(tool).toBeDefined();
  return tool!;
}

// ─── Sample Data ─────────────────────────────────────────────────────

const sampleDashboard = {
  sprint: { id: 'sprint-030', startedAt: new Date(Date.now() - 600_000).toISOString() },
  progress: { done: 3, total: 10 },
  agents: [{ id: 'w-001', status: 'EXECUTING' }],
  alerts: [],
  usage: { tokens: 5000 },
};

const sampleTask = {
  id: '001',
  assignedAgent: 'security-auditor',
  assignedSkills: ['vuln-scan', 'sast'],
};

const sampleTask2 = {
  id: '002',
  assignedAgent: 'test-writer',
  assignedSkills: ['testing'],
};

// ─── Tests ───────────────────────────────────────────────────────────

describe('MCP status tool agent/skill enrichment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readLatestJobState).mockReturnValue(null);
    // Default: a live run so the projection cases pass the authority-first guard.
    runAuthorityState.current = {
      ...runAuthorityState.current,
      lifecycle: 'ACTIVE', active: true, resumable: false, sprintId: 'sprint-030',
      phase: 'EXECUTE', status: 'RUNNING', coordinator: 'alive',
    };
  });

  it('includes agentAssignments in response', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockImplementation((p: any) => {
      if (String(p).includes('.dashboard')) return JSON.stringify(sampleDashboard);
      return JSON.stringify(sampleTask);
    });
    vi.mocked(readdirSync).mockReturnValue(['task-001.json'] as any);
    const tool = await getStatusTool();
    const result = await tool.handler({});
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.agentAssignments).toBeDefined();
    expect(parsed.agentAssignments['security-auditor']).toContain('001');
  });

  it('includes skillAssignments in response', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockImplementation((p: any) => {
      if (String(p).includes('.dashboard')) return JSON.stringify(sampleDashboard);
      return JSON.stringify(sampleTask);
    });
    vi.mocked(readdirSync).mockReturnValue(['task-001.json'] as any);
    const tool = await getStatusTool();
    const result = await tool.handler({});
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.skillAssignments).toBeDefined();
    expect(parsed.skillAssignments['vuln-scan']).toContain('001');
    expect(parsed.skillAssignments['sast']).toContain('001');
  });

  it('groups multiple tasks under same agent', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockImplementation((p: any) => {
      if (String(p).includes('.dashboard')) return JSON.stringify(sampleDashboard);
      if (String(p).includes('task-001')) return JSON.stringify({ ...sampleTask, assignedAgent: 'security-auditor' });
      return JSON.stringify({ ...sampleTask2, assignedAgent: 'security-auditor' });
    });
    vi.mocked(readdirSync).mockReturnValue(['task-001.json', 'task-002.json'] as any);
    const tool = await getStatusTool();
    const result = await tool.handler({});
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.agentAssignments['security-auditor']).toHaveLength(2);
  });

  it('returns empty assignments when no tasks dir', async () => {
    vi.mocked(existsSync).mockImplementation((p: any) => {
      if (String(p).includes('.dashboard')) return true;
      if (String(p).includes('.tasks')) return false;
      return false;
    });
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(sampleDashboard));
    vi.mocked(readdirSync).mockReturnValue([] as any);
    const tool = await getStatusTool();
    const result = await tool.handler({});
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.agentAssignments).toEqual({});
    expect(parsed.skillAssignments).toEqual({});
  });

  it('backward compatible: no agentAssignments in no-dashboard response', async () => {
    // No run: the canonical authority honestly reports IDLE (no live coordinator).
    runAuthorityState.current = {
      ...runAuthorityState.current,
      lifecycle: 'IDLE', active: false, resumable: false, sprintId: null,
      phase: null, status: null, coordinator: 'absent',
    };
    vi.mocked(existsSync).mockReturnValue(false);
    const tool = await getStatusTool();
    const result = await tool.handler({});
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.active).toBe(false);
    // Should NOT have agentAssignments when no active sprint
    expect(parsed.agentAssignments).toBeUndefined();
  });

  it('handles tasks without assignedAgent', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockImplementation((p: any) => {
      if (String(p).includes('.dashboard')) return JSON.stringify(sampleDashboard);
      return JSON.stringify({ id: '003' }); // no assignedAgent
    });
    vi.mocked(readdirSync).mockReturnValue(['task-003.json'] as any);
    const tool = await getStatusTool();
    const result = await tool.handler({});
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.agentAssignments).toEqual({});
  });

  it('handles tasks without assignedSkills', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockImplementation((p: any) => {
      if (String(p).includes('.dashboard')) return JSON.stringify(sampleDashboard);
      return JSON.stringify({ id: '003', assignedAgent: 'dev' }); // no skills
    });
    vi.mocked(readdirSync).mockReturnValue(['task-003.json'] as any);
    const tool = await getStatusTool();
    const result = await tool.handler({});
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.skillAssignments).toEqual({});
  });

  it('skips malformed task files gracefully', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockImplementation((p: any) => {
      if (String(p).includes('.dashboard')) return JSON.stringify(sampleDashboard);
      return 'INVALID JSON';
    });
    vi.mocked(readdirSync).mockReturnValue(['task-bad.json'] as any);
    const tool = await getStatusTool();
    const result = await tool.handler({});
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.agentAssignments).toEqual({});
  });

  it('preserves all original fields in response', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockImplementation((p: any) => {
      if (String(p).includes('.dashboard')) return JSON.stringify(sampleDashboard);
      return JSON.stringify(sampleTask);
    });
    vi.mocked(readdirSync).mockReturnValue(['task-001.json'] as any);
    const tool = await getStatusTool();
    const result = await tool.handler({});
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.sprint).toBeDefined();
    expect(parsed.progressBar).toBeDefined();
    expect(parsed.eta).toBeDefined();
    expect(parsed.workerSummary).toBeDefined();
    expect(parsed.alertSummary).toBeDefined();
  });
});
