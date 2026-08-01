/**
 * tests/mcp/status-terminal-receipt.test.ts
 *
 * 487-005: deckent_status must consume the SAME canonical lifecycle/receipt
 * authority CLI's projectTerminalPublicationStatus already uses
 * (readCanonicalRunStatus, core/sprint-terminal-publication.ts version) —
 * never re-inferring completion via an MCP-local lifecycle enum, a broad
 * `.tasks/` prefix scan, or a fabricated (silently non-null) receipt.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { SPRINT_TERMINAL_PUBLICATION_VERSION } from '../../src/core/sprint-terminal-publication.js';
import type { CanonicalRunStatus, CanonicalRunLifecycle } from '../../src/core/run-status-authority.js';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock('../../src/mcp/tools/job-runner.js', () => ({
  readLatestJobState: vi.fn(() => null),
}));

vi.mock('../../src/mcp/helpers/format.js', () => ({
  formatStatusResponse: vi.fn(() => 'mocked summary'),
  wrapResponse: vi.fn(<T>(data: T, _summary: string) => data),
}));

vi.mock('../../src/mcp/helpers/enrich.js', () => ({
  enrichResponse: vi.fn((_toolName: string, response: Record<string, unknown>) => response),
}));

vi.mock('../../src/monitor/sprint-state.js', () => ({
  getCurrentSprintId: vi.fn(() => 'sprint-333'),
}));

vi.mock('../../src/monitor/dashboard-manager.js', () => ({
  readDashboardSafe: vi.fn(),
}));

vi.mock('../../src/core/output-formatter.js', () => ({
  formatStatus: vi.fn(() => 'mocked formatted'),
  resolveOutputMode: vi.fn(() => 'standart'),
}));

vi.mock('../../src/core/pending-approvals.js', () => ({
  readPendingApprovals: vi.fn(() => []),
}));

vi.mock('../../src/core/run-status-authority.js', () => ({
  readCanonicalRunStatus: vi.fn(),
}));

import { readDashboardSafe } from '../../src/monitor/dashboard-manager.js';
import { readCanonicalRunStatus } from '../../src/core/run-status-authority.js';

// ─── Mock Server ─────────────────────────────────────────────────────────────

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
  const { registerStatusTool } = await import('../../src/mcp/tools/status.js');
  const server = createMockServer();
  registerStatusTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
  const tool = server.tools.get('deckent_status');
  expect(tool).toBeDefined();
  return tool!;
}

function makeAuthority(overrides: Partial<CanonicalRunStatus>): CanonicalRunStatus {
  return {
    schemaVersion: 1,
    lifecycle: 'IDLE',
    active: false,
    resumable: false,
    sprintId: null,
    phase: null,
    status: null,
    reason: null,
    recoveryCommand: null,
    finalizeCommand: null,
    coordinator: 'absent',
    conflicts: [],
    ...overrides,
  };
}

const sampleDashboard = {
  sprint: { id: 'sprint-333', startedAt: new Date(Date.now() - 300_000).toISOString() },
  progress: { done: 5, total: 8 },
  agents: [{ id: 'w-001', status: 'DONE' }],
  alerts: [],
};

// ─── Unit tests: projectTerminalPublicationStatus ────────────────────────────

describe('projectTerminalPublicationStatus — pure projection off canonical lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(existsSync).mockReturnValue(false);
  });
  const lifecycles: Array<[CanonicalRunLifecycle, 'open' | 'terminal-authority-observed']> = [
    ['COMPLETE', 'terminal-authority-observed'],
    ['ABORTED', 'terminal-authority-observed'],
    ['ACTIVE', 'open'],
    ['PAUSED', 'open'],
    ['ORPHANED', 'open'],
    ['IDLE', 'open'],
  ];

  it.each(lifecycles)('lifecycle=%s -> state=%s, receipt stays null, version matches', async (lifecycle, expectedState) => {
    const { projectTerminalPublicationStatus } = await import('../../src/mcp/tools/status.js');
    const projected = projectTerminalPublicationStatus('/project', makeAuthority({ lifecycle }));

    expect(projected.state).toBe(expectedState);
    expect(projected.receipt).toBeNull();
    expect(projected.version).toBe(SPRINT_TERMINAL_PUBLICATION_VERSION);
  });

  it('surfaces the exact persisted receipt through the shared CLI/MCP projection', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
      receipt: {
        version: 1,
        sprintId: 'sprint-333',
        runId: 'run-333',
        coordinatorGeneration: 1,
        logicalSettlementDigest: 'a'.repeat(64),
        priorAuthorityVersion: 0,
        authorityVersion: 1,
      },
    }));
    const { projectTerminalPublicationStatus } = await import('../../src/mcp/tools/status.js');

    expect(projectTerminalPublicationStatus('/project', makeAuthority({
      lifecycle: 'COMPLETE', sprintId: 'sprint-333',
    }))).toMatchObject({
      state: 'receipt-observed',
      receipt: { sprintId: 'sprint-333', logicalSettlementDigest: 'a'.repeat(64) },
    });
  });
});

// ─── Integration tests: wired into deckent_status responses ──────────────────

describe('deckent_status — terminalPublication reflects canonical authority (487-005)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readdirSync).mockReturnValue([] as unknown as ReturnType<typeof readdirSync>);
    vi.mocked(readFileSync).mockReturnValue('{}');
  });

  it('surfaces terminal-authority-observed with a null receipt when the run is COMPLETE (no live dashboard)', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readCanonicalRunStatus).mockReturnValue(makeAuthority({
      lifecycle: 'COMPLETE',
      active: false,
      resumable: false,
      sprintId: 'sprint-333',
      status: 'COMPLETE',
    }));

    const tool = await getStatusTool();
    const result = await tool.handler({ json: true });
    const parsed = JSON.parse(result.content[0]!.text) as {
      terminalPublication?: { version: number; state: string; receipt: unknown };
      lifecycle?: string;
    };

    expect(parsed.lifecycle).toBe('COMPLETE');
    expect(parsed.terminalPublication).toEqual({
      version: SPRINT_TERMINAL_PUBLICATION_VERSION,
      state: 'terminal-authority-observed',
      receipt: null,
    });
  });

  it('surfaces terminal-authority-observed for an ABORTED run without fabricating a receipt', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readCanonicalRunStatus).mockReturnValue(makeAuthority({
      lifecycle: 'ABORTED',
      active: false,
      resumable: false,
      sprintId: 'sprint-333',
      status: 'ABORTED',
    }));

    const tool = await getStatusTool();
    const result = await tool.handler({ json: true });
    const parsed = JSON.parse(result.content[0]!.text) as {
      terminalPublication?: { version: number; state: string; receipt: unknown };
    };

    expect(parsed.terminalPublication?.state).toBe('terminal-authority-observed');
    expect(parsed.terminalPublication?.receipt).toBeNull();
  });

  it('surfaces state=open for an ACTIVE run with a live dashboard projection', async () => {
    vi.mocked(existsSync).mockImplementation(
      path => !String(path).endsWith('-terminal-receipt.json'),
    );
    vi.mocked(readDashboardSafe).mockReturnValue({
      valid: true,
      state: sampleDashboard,
      repaired: false,
    });
    vi.mocked(readCanonicalRunStatus).mockReturnValue(makeAuthority({
      lifecycle: 'ACTIVE',
      active: true,
      resumable: false,
      sprintId: 'sprint-333',
      status: 'ACTIVE',
    }));

    const tool = await getStatusTool();
    const result = await tool.handler({ json: true });
    const parsed = JSON.parse(result.content[0]!.text) as {
      terminalPublication?: { version: number; state: string; receipt: unknown };
    };

    expect(parsed.terminalPublication).toEqual({
      version: SPRINT_TERMINAL_PUBLICATION_VERSION,
      state: 'open',
      receipt: null,
    });
  });

  it('surfaces state=open for an IDLE run (no active or terminal sprint)', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readCanonicalRunStatus).mockReturnValue(makeAuthority({ lifecycle: 'IDLE' }));

    const tool = await getStatusTool();
    const result = await tool.handler({ json: true });
    const parsed = JSON.parse(result.content[0]!.text) as {
      terminalPublication?: { version: number; state: string; receipt: unknown };
    };

    expect(parsed.terminalPublication).toEqual({
      version: SPRINT_TERMINAL_PUBLICATION_VERSION,
      state: 'open',
      receipt: null,
    });
  });
});
