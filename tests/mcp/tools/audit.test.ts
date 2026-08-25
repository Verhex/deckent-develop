import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockRunSelfAuditGate = vi.fn();

vi.mock('../../../src/orchestra/sprint-finalizer.js', () => ({
  runSelfAuditGate: (...args: unknown[]) => mockRunSelfAuditGate(...args),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  renameSync: vi.fn(),
}));

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

import { registerAuditTool } from '../../../src/mcp/tools/audit.js';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('deckent_audit MCP tool', () => {
  let server: MockServer;

  beforeEach(() => {
    vi.clearAllMocks();
    server = createMockServer();
    registerAuditTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
  });

  it('should register deckent_audit tool', () => {
    expect(server.tools.has('deckent_audit')).toBe(true);
  });

  it('declares its widest side effects — gate writes gate.json, retention apply prunes (row 490)', () => {
    const tool = server.tools.get('deckent_audit')!;
    // MCP clients skip approval prompts on readOnlyHint, so understating the
    // side-effect contract is a security defect, not a cosmetic choice.
    expect((tool.config as Record<string, unknown>).annotations).toEqual(
      expect.objectContaining({ readOnlyHint: false, destructiveHint: true }),
    );
  });

  it('should return PASS gate result', async () => {
    mockRunSelfAuditGate.mockResolvedValue({
      tsc: { status: 'PASS', errors: [] },
      vitest: { status: 'PASS', delta: { files: 0, pass: 5, fail: 0, skipped: 0 } },
      honesty: { violations: 0, flaggedTasks: [] },
      observability: { metricsJsonlExists: true, lineCount: 20 },
      overallGate: 'PASS',
    });

    const handler = server.tools.get('deckent_audit')!.handler;
    const result = await handler({ sprintId: 'sprint-150' });
    const parsed = parseResult(result);

    expect(parsed.overallGate).toBe('PASS');
    expect(parsed.tsc).toBe('PASS');
    expect(result.isError).toBeUndefined();
  });

  it('should return GATE_FAILURE result', async () => {
    mockRunSelfAuditGate.mockResolvedValue({
      tsc: { status: 'FAIL', errors: ['error TS2345'] },
      vitest: { status: 'PASS', delta: { files: 0, pass: 0, fail: 0, skipped: 0 } },
      honesty: { violations: 0, flaggedTasks: [] },
      observability: { metricsJsonlExists: true, lineCount: 10 },
      overallGate: 'GATE_FAILURE',
    });

    const handler = server.tools.get('deckent_audit')!.handler;
    const result = await handler({ sprintId: 'sprint-150' });
    const parsed = parseResult(result);

    expect(parsed.overallGate).toBe('GATE_FAILURE');
    expect(parsed.tscErrors).toBe(1);
  });

  it('should handle errors gracefully', async () => {
    mockRunSelfAuditGate.mockRejectedValue(new Error('DB corrupted'));

    const handler = server.tools.get('deckent_audit')!.handler;
    const result = await handler({ sprintId: 'sprint-150' });
    const parsed = parseResult(result);

    expect(result.isError).toBe(true);
    expect(parsed.error).toBe(true);
    expect(parsed.message).toContain('DB corrupted');
  });
});
