import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockReturnValue(''),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  rmSync: vi.fn(),
}));

vi.mock('../../../src/mcp/helpers/enrich.js', () => ({
  enrichResponse: (_tool: string, data: Record<string, unknown>) => ({ ...data }),
}));

vi.mock('../../../src/cli/commands/autonomous.js', () => ({
  backlogAdd: vi.fn(),
  backlogList: vi.fn().mockReturnValue([]),
  backlogRemove: vi.fn(),
}));

vi.mock('../../../src/orchestra/autonomous/approval-adapter.js', () => ({
  makeApprovalGate: vi.fn().mockReturnValue({
    pending: vi.fn().mockReturnValue([]),
    accept: vi.fn(),
    reject: vi.fn(),
  }),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { backlogAdd, backlogList, backlogRemove } from '../../../src/cli/commands/autonomous.js';
import { makeApprovalGate } from '../../../src/orchestra/autonomous/approval-adapter.js';

// ─── Mock Server helper ───────────────────────────────────────────────────────

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

interface MockServer {
  tools: Map<string, { config: Record<string, unknown>; handler: ToolHandler }>;
  registerTool(name: string, config: Record<string, unknown>, handler: ToolHandler): void;
}

function createMockServer(): MockServer {
  const tools = new Map<string, { config: Record<string, unknown>; handler: ToolHandler }>();
  return {
    tools,
    registerTool(name, config, handler) { tools.set(name, { config, handler }); },
  };
}

function parseResult(result: { content: Array<{ type: string; text: string }> }): Record<string, unknown> {
  return JSON.parse(result.content[0].text);
}

import { registerAutonomousTool } from '../../../src/mcp/tools/autonomous.js';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('deckent_autonomous MCP tool — registration', () => {
  let server: MockServer;

  beforeEach(() => {
    vi.clearAllMocks();
    server = createMockServer();
    registerAutonomousTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
  });

  it('registers deckent_autonomous tool', () => {
    expect(server.tools.has('deckent_autonomous')).toBe(true);
  });

  it('has correct annotations', () => {
    const tool = server.tools.get('deckent_autonomous')!;
    expect((tool.config as Record<string, unknown>).annotations).toEqual(
      expect.objectContaining({ readOnlyHint: false, destructiveHint: false }),
    );
  });
});

describe('deckent_autonomous — status action', () => {
  let server: MockServer;

  beforeEach(() => {
    vi.clearAllMocks();
    server = createMockServer();
    registerAutonomousTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
  });

  it('returns empty status when no state files exist', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(backlogList).mockReturnValue([]);

    const handler = server.tools.get('deckent_autonomous')!.handler;
    const result = await handler({ action: 'status', root: '/tmp/test-project' });
    const parsed = parseResult(result);

    expect(parsed.action).toBe('status');
    expect(parsed.pendingApprovals).toBe(0);
    expect(parsed.stopMarkerPresent).toBe(false);
    expect(parsed.backlogTotal).toBe(0);
    expect(result.isError).toBeUndefined();
  });

  it('counts pending approvals from pending.json', async () => {
    vi.mocked(existsSync).mockImplementation((p) => {
      const path = typeof p === 'string' ? p : '';
      return path.endsWith('pending.json');
    });
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify([{ triggerId: 'a' }, { triggerId: 'b' }]));
    vi.mocked(backlogList).mockReturnValue([]);

    const handler = server.tools.get('deckent_autonomous')!.handler;
    const result = await handler({ action: 'status', root: '/tmp/test-project' });
    const parsed = parseResult(result);

    expect(parsed.pendingApprovals).toBe(2);
  });

  it('reports stop marker present when file exists', async () => {
    vi.mocked(existsSync).mockImplementation((p) => {
      const path = typeof p === 'string' ? p : '';
      return path.endsWith('/stop');
    });
    vi.mocked(backlogList).mockReturnValue([]);

    const handler = server.tools.get('deckent_autonomous')!.handler;
    const result = await handler({ action: 'status', root: '/tmp/test-project' });
    const parsed = parseResult(result);

    expect(parsed.stopMarkerPresent).toBe(true);
  });

  it('summarizes backlog counts', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(backlogList).mockReturnValue([
      { status: 'pending', id: '1', title: 't1', kind: 'task', spec: {}, policy: 'auto', trigger: { type: 'one-off' }, lastRun: null, lastResult: null },
      { status: 'done', id: '2', title: 't2', kind: 'task', spec: {}, policy: 'auto', trigger: { type: 'one-off' }, lastRun: null, lastResult: null },
      { status: 'failed', id: '3', title: 't3', kind: 'task', spec: {}, policy: 'auto', trigger: { type: 'one-off' }, lastRun: null, lastResult: null },
    ] as never);

    const handler = server.tools.get('deckent_autonomous')!.handler;
    const result = await handler({ action: 'status', root: '/tmp/test-project' });
    const parsed = parseResult(result);

    expect(parsed.backlogTotal).toBe(3);
    const counts = parsed.backlogCounts as Record<string, number>;
    expect(counts.pending).toBe(1);
    expect(counts.done).toBe(1);
    expect(counts.failed).toBe(1);
  });
});

describe('deckent_autonomous — start action', () => {
  let server: MockServer;

  beforeEach(() => {
    vi.clearAllMocks();
    server = createMockServer();
    registerAutonomousTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
  });

  it('clears stop marker when present and returns guidance', async () => {
    vi.mocked(existsSync).mockImplementation((p) => {
      const path = typeof p === 'string' ? p : '';
      return path.endsWith('/stop');
    });

    const handler = server.tools.get('deckent_autonomous')!.handler;
    const result = await handler({ action: 'start', root: '/tmp/test-project' });
    const parsed = parseResult(result);

    expect(parsed.action).toBe('start');
    expect(parsed.stopMarkerCleared).toBe(true);
    expect(vi.mocked(rmSync)).toHaveBeenCalledOnce();
    expect(typeof parsed.message).toBe('string');
    expect(result.isError).toBeUndefined();
  });

  it('does not call rmSync when no stop marker present', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const handler = server.tools.get('deckent_autonomous')!.handler;
    const result = await handler({ action: 'start', root: '/tmp/test-project' });
    const parsed = parseResult(result);

    expect(parsed.stopMarkerCleared).toBe(false);
    expect(vi.mocked(rmSync)).not.toHaveBeenCalled();
  });
});

describe('deckent_autonomous — stop action', () => {
  let server: MockServer;

  beforeEach(() => {
    vi.clearAllMocks();
    server = createMockServer();
    registerAutonomousTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
  });

  it('writes stop marker and returns stopped=true', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const handler = server.tools.get('deckent_autonomous')!.handler;
    const result = await handler({ action: 'stop', root: '/tmp/test-project' });
    const parsed = parseResult(result);

    expect(parsed.action).toBe('stop');
    expect(parsed.stopped).toBe(true);
    expect(vi.mocked(writeFileSync)).toHaveBeenCalledWith(
      expect.stringContaining('stop'),
      expect.any(String),
      'utf-8',
    );
    expect(result.isError).toBeUndefined();
  });
});

describe('deckent_autonomous — backlog_add action', () => {
  let server: MockServer;

  beforeEach(() => {
    vi.clearAllMocks();
    server = createMockServer();
    registerAutonomousTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
  });

  it('calls backlogAdd with correct params and returns added=true', async () => {
    const handler = server.tools.get('deckent_autonomous')!.handler;
    const result = await handler({
      action: 'backlog_add',
      root: '/tmp/test-project',
      id: 'entry-001',
      title: 'Fix the bug',
      kind: 'task',
      description: 'Describe the fix',
      policy: 'auto',
    });
    const parsed = parseResult(result);

    expect(parsed.action).toBe('backlog_add');
    expect(parsed.id).toBe('entry-001');
    expect(parsed.added).toBe(true);
    expect(vi.mocked(backlogAdd)).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'entry-001', title: 'Fix the bug', kind: 'task', policy: 'auto' }),
    );
    expect(result.isError).toBeUndefined();
  });

  it('returns error when id is missing', async () => {
    const handler = server.tools.get('deckent_autonomous')!.handler;
    const result = await handler({ action: 'backlog_add', title: 'No id' });
    const parsed = parseResult(result);

    expect(result.isError).toBe(true);
    expect(parsed.message).toContain('id is required');
  });

  it('returns error when title is missing', async () => {
    const handler = server.tools.get('deckent_autonomous')!.handler;
    const result = await handler({ action: 'backlog_add', id: 'entry-001' });
    const parsed = parseResult(result);

    expect(result.isError).toBe(true);
    expect(parsed.message).toContain('title is required');
  });

  it('returns error when backlogAdd throws (e.g. duplicate)', async () => {
    vi.mocked(backlogAdd).mockImplementationOnce(() => { throw new Error('Duplicate id: entry-001'); });

    const handler = server.tools.get('deckent_autonomous')!.handler;
    const result = await handler({
      action: 'backlog_add',
      id: 'entry-001',
      title: 'Dup',
    });
    const parsed = parseResult(result);

    expect(result.isError).toBe(true);
    expect(parsed.message).toContain('Duplicate');
  });
});

describe('deckent_autonomous — backlog_list action', () => {
  let server: MockServer;

  beforeEach(() => {
    vi.clearAllMocks();
    server = createMockServer();
    registerAutonomousTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
  });

  it('returns empty list when no entries', async () => {
    vi.mocked(backlogList).mockReturnValue([]);

    const handler = server.tools.get('deckent_autonomous')!.handler;
    const result = await handler({ action: 'backlog_list', root: '/tmp/test-project' });
    const parsed = parseResult(result);

    expect(parsed.action).toBe('backlog_list');
    expect(parsed.count).toBe(0);
    expect(Array.isArray(parsed.entries)).toBe(true);
    expect(result.isError).toBeUndefined();
  });

  it('returns entries from backlogList', async () => {
    const entries = [
      { id: 'e-1', title: 'First', status: 'pending' },
      { id: 'e-2', title: 'Second', status: 'done' },
    ];
    vi.mocked(backlogList).mockReturnValue(entries as never);

    const handler = server.tools.get('deckent_autonomous')!.handler;
    const result = await handler({ action: 'backlog_list', root: '/tmp/test-project' });
    const parsed = parseResult(result);

    expect(parsed.count).toBe(2);
    expect(parsed.entries).toEqual(entries);
  });
});

describe('deckent_autonomous — backlog_remove action', () => {
  let server: MockServer;

  beforeEach(() => {
    vi.clearAllMocks();
    server = createMockServer();
    registerAutonomousTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
  });

  it('calls backlogRemove and returns removed=true', async () => {
    const handler = server.tools.get('deckent_autonomous')!.handler;
    const result = await handler({ action: 'backlog_remove', root: '/tmp/test-project', id: 'e-1' });
    const parsed = parseResult(result);

    expect(parsed.action).toBe('backlog_remove');
    expect(parsed.id).toBe('e-1');
    expect(parsed.removed).toBe(true);
    expect(vi.mocked(backlogRemove)).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'e-1' }),
    );
    expect(result.isError).toBeUndefined();
  });

  it('returns error when id is missing', async () => {
    const handler = server.tools.get('deckent_autonomous')!.handler;
    const result = await handler({ action: 'backlog_remove' });
    const parsed = parseResult(result);

    expect(result.isError).toBe(true);
    expect(parsed.message).toContain('id is required');
  });

  it('returns error when backlogRemove throws (not found)', async () => {
    vi.mocked(backlogRemove).mockImplementationOnce(() => { throw new Error('Entry not found: e-999'); });

    const handler = server.tools.get('deckent_autonomous')!.handler;
    const result = await handler({ action: 'backlog_remove', id: 'e-999' });
    const parsed = parseResult(result);

    expect(result.isError).toBe(true);
    expect(parsed.message).toContain('not found');
  });
});

describe('deckent_autonomous — pending action', () => {
  let server: MockServer;

  beforeEach(() => {
    vi.clearAllMocks();
    server = createMockServer();
    registerAutonomousTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
  });

  it('returns empty list when no pending approvals', async () => {
    vi.mocked(makeApprovalGate).mockReturnValue({
      pending: vi.fn().mockReturnValue([]),
      accept: vi.fn(),
      reject: vi.fn(),
    } as never);

    const handler = server.tools.get('deckent_autonomous')!.handler;
    const result = await handler({ action: 'pending', root: '/tmp/test-project' });
    const parsed = parseResult(result);

    expect(parsed.action).toBe('pending');
    expect(parsed.count).toBe(0);
    expect(Array.isArray(parsed.items)).toBe(true);
    expect(result.isError).toBeUndefined();
  });

  it('returns pending items from approval gate', async () => {
    const items = [
      { triggerId: 't-1', action: 'sprint-start', requestedBy: 'system', enqueuedAt: '2026-06-09T00:00:00Z' },
    ];
    vi.mocked(makeApprovalGate).mockReturnValue({
      pending: vi.fn().mockReturnValue(items),
      accept: vi.fn(),
      reject: vi.fn(),
    } as never);

    const handler = server.tools.get('deckent_autonomous')!.handler;
    const result = await handler({ action: 'pending', root: '/tmp/test-project' });
    const parsed = parseResult(result);

    expect(parsed.count).toBe(1);
    expect(parsed.items).toEqual(items);
  });
});

describe('deckent_autonomous — approve action', () => {
  let server: MockServer;
  const mockAccept = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    server = createMockServer();
    vi.mocked(makeApprovalGate).mockReturnValue({
      pending: vi.fn().mockReturnValue([]),
      accept: mockAccept,
      reject: vi.fn(),
    } as never);
    registerAutonomousTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
  });

  it('calls gate.accept with triggerId and returns approved=true', async () => {
    const handler = server.tools.get('deckent_autonomous')!.handler;
    const result = await handler({
      action: 'approve',
      root: '/tmp/test-project',
      triggerId: 't-001',
      reason: 'looks good',
    });
    const parsed = parseResult(result);

    expect(parsed.action).toBe('approve');
    expect(parsed.triggerId).toBe('t-001');
    expect(parsed.approved).toBe(true);
    expect(mockAccept).toHaveBeenCalledWith('t-001', 'looks good');
    expect(result.isError).toBeUndefined();
  });

  it('falls back to id field when triggerId is absent', async () => {
    const handler = server.tools.get('deckent_autonomous')!.handler;
    const result = await handler({ action: 'approve', id: 't-002' });
    const parsed = parseResult(result);

    expect(parsed.triggerId).toBe('t-002');
    expect(mockAccept).toHaveBeenCalledWith('t-002', undefined);
  });

  it('returns error when neither triggerId nor id is provided', async () => {
    const handler = server.tools.get('deckent_autonomous')!.handler;
    const result = await handler({ action: 'approve' });
    const parsed = parseResult(result);

    expect(result.isError).toBe(true);
    expect(parsed.message).toContain('triggerId');
  });
});

describe('deckent_autonomous — reject action', () => {
  let server: MockServer;
  const mockReject = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    server = createMockServer();
    vi.mocked(makeApprovalGate).mockReturnValue({
      pending: vi.fn().mockReturnValue([]),
      accept: vi.fn(),
      reject: mockReject,
    } as never);
    registerAutonomousTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
  });

  it('calls gate.reject with triggerId and returns rejected=true', async () => {
    const handler = server.tools.get('deckent_autonomous')!.handler;
    const result = await handler({
      action: 'reject',
      root: '/tmp/test-project',
      triggerId: 't-003',
      reason: 'too risky',
    });
    const parsed = parseResult(result);

    expect(parsed.action).toBe('reject');
    expect(parsed.triggerId).toBe('t-003');
    expect(parsed.rejected).toBe(true);
    expect(mockReject).toHaveBeenCalledWith('t-003', 'too risky');
    expect(result.isError).toBeUndefined();
  });

  it('returns error when neither triggerId nor id is provided', async () => {
    const handler = server.tools.get('deckent_autonomous')!.handler;
    const result = await handler({ action: 'reject' });
    const parsed = parseResult(result);

    expect(result.isError).toBe(true);
    expect(parsed.message).toContain('triggerId');
  });
});
