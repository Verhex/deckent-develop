import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockRunSelfAuditGate = vi.fn();
const mockCleanOrphanIpcDirs = vi.fn();
const mockClearStaleLocks = vi.fn();
const mockPostFinalizeCleanup = vi.fn();

vi.mock('../../../src/orchestra/sprint-finalizer.js', () => ({
  runSelfAuditGate: (...args: unknown[]) => mockRunSelfAuditGate(...args),
}));

vi.mock('../../../src/core/orphan-cleaner.js', () => ({
  cleanOrphanIpcDirs: (...args: unknown[]) => mockCleanOrphanIpcDirs(...args),
  postFinalizeCleanup: (...args: unknown[]) => mockPostFinalizeCleanup(...args),
}));

vi.mock('../../../src/core/file-lock.js', () => ({
  clearStaleLocks: (...args: unknown[]) => mockClearStaleLocks(...args),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readdirSync: vi.fn().mockReturnValue([]),
  statSync: vi.fn().mockReturnValue({ mtimeMs: 0 }),
}));

vi.mock('../../../src/core/constants.js', async () => {
  const actual = await vi.importActual('../../../src/core/constants.js') as Record<string, unknown>;
  return {
    ...actual,
    TASKS_DIR: '.tasks',
    LOCKS_DIR: '.locks',
  };
});

vi.mock('../../../src/mcp/helpers/enrich.js', () => ({
  enrichResponse: (_tool: string, data: Record<string, unknown>) => ({
    ...data,
    _meta: { summary: 'test', hints: [], timestamp: '2026-04-21T00:00:00.000Z' },
  }),
}));

// ─── Mock Server ─────────────────────────────────────────────────────────────

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

interface MockServer {
  tools: Map<string, { config: Record<string, unknown>; handler: ToolHandler }>;
  registerTool: (name: string, config: Record<string, unknown>, handler: ToolHandler) => void;
}

function createMockServer(): MockServer {
  const tools = new Map<string, { config: Record<string, unknown>; handler: ToolHandler }>();
  return {
    tools,
    registerTool(name, config, handler) {
      tools.set(name, { config, handler });
    },
  };
}

function parseResult(result: { content: Array<{ type: string; text: string }> }) {
  return JSON.parse(result.content[0].text);
}

import { registerRecoverTool } from '../../../src/mcp/tools/recover.js';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('deckent_recover MCP tool', () => {
  let server: MockServer;

  beforeEach(() => {
    vi.clearAllMocks();
    server = createMockServer();
    registerRecoverTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

    mockRunSelfAuditGate.mockResolvedValue({
      overallGate: 'PASS',
      tsc: { status: 'PASS', errors: [] },
      vitest: { status: 'PASS', delta: { files: 0, pass: 0, fail: 0, skipped: 0 } },
      honesty: { violations: 0, flaggedTasks: [] },
      observability: { metricsJsonlExists: true, lineCount: 10 },
    });
    mockCleanOrphanIpcDirs.mockReturnValue(['sprint-149-ipc']);
    mockClearStaleLocks.mockReturnValue(3);
    mockPostFinalizeCleanup.mockReturnValue({
      archivedFiles: ['task-150-001.json'],
      preservedFiles: [],
      staleLocksCleaned: 0,
    });
  });

  it('should register deckent_recover tool', () => {
    expect(server.tools.has('deckent_recover')).toBe(true);
  });

  it('should have destructive annotation', () => {
    const tool = server.tools.get('deckent_recover')!;
    expect((tool.config as Record<string, unknown>).annotations).toEqual(
      expect.objectContaining({ readOnlyHint: false, destructiveHint: true }),
    );
  });

  it('should run full recovery pipeline', async () => {
    const handler = server.tools.get('deckent_recover')!.handler;
    const result = await handler({ sprintId: 'sprint-150', dryRun: false, skipAudit: false });
    const parsed = parseResult(result);

    expect(parsed.success).toBe(true);
    expect(parsed.auditGate).toBe('PASS');
    expect(parsed.orphanIpcDirsRemoved).toBe(1);
    expect(parsed.staleLocksCleaned).toBe(3);
    expect(parsed.taskFilesArchived).toBe(1);
    expect(mockCleanOrphanIpcDirs).toHaveBeenCalled();
    expect(mockClearStaleLocks).toHaveBeenCalled();
    expect(mockPostFinalizeCleanup).toHaveBeenCalled();
  });

  it('should run dry-run without modifications', async () => {
    const handler = server.tools.get('deckent_recover')!.handler;
    const result = await handler({ sprintId: 'sprint-150', dryRun: true, skipAudit: false });
    const parsed = parseResult(result);

    expect(parsed.dryRun).toBe(true);
    expect(mockCleanOrphanIpcDirs).not.toHaveBeenCalled();
    expect(mockClearStaleLocks).not.toHaveBeenCalled();
    expect(mockPostFinalizeCleanup).not.toHaveBeenCalled();
  });

  it('should skip audit when requested', async () => {
    const handler = server.tools.get('deckent_recover')!.handler;
    const result = await handler({ sprintId: 'sprint-150', dryRun: false, skipAudit: true });
    const parsed = parseResult(result);

    expect(mockRunSelfAuditGate).not.toHaveBeenCalled();
    expect(parsed.auditGate).toBe('SKIPPED');
  });

  it('should handle errors gracefully', async () => {
    mockCleanOrphanIpcDirs.mockImplementation(() => { throw new Error('permission denied'); });

    const handler = server.tools.get('deckent_recover')!.handler;
    const result = await handler({ sprintId: 'sprint-150', dryRun: false, skipAudit: false });
    const parsed = parseResult(result);

    // Should still succeed — individual steps are best-effort
    expect(parsed.success).toBe(true);
    expect(parsed.orphanIpcDirsRemoved).toBe(0);
  });
});
