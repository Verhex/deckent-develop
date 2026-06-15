import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const { mockSubmit } = vi.hoisted(() => ({ mockSubmit: vi.fn() }));

vi.mock('../../../src/cli/helpers/process-runtime.js', () => ({
  buildProcessController: vi.fn().mockResolvedValue({ submit: mockSubmit, status: vi.fn() }),
}));

vi.mock('../../../src/orchestra/autonomous/backlog.js', () => ({
  loadBacklog: vi.fn().mockReturnValue({
    _version: '1.0',
    entries: [{ id: 'proc-9', title: 'sync', kind: 'capability', status: 'pending', lastResult: null }],
  }),
}));

vi.mock('../../../src/mcp/helpers/enrich.js', () => ({
  enrichResponse: (_tool: string, data: Record<string, unknown>) => ({ ...data }),
}));

// ─── Mock Server ───────────────────────────────────────────────────────────────

type ToolHandler = (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }> }>;
interface MockServer {
  tools: Map<string, { handler: ToolHandler }>;
  registerTool(name: string, config: unknown, handler: ToolHandler): void;
}
function createMockServer(): MockServer {
  const tools = new Map<string, { handler: ToolHandler }>();
  return { tools, registerTool(name, _config, handler) { tools.set(name, { handler }); } };
}
function parse(r: { content: Array<{ type: string; text: string }> }): Record<string, unknown> {
  return JSON.parse(r.content[0]!.text);
}

import { registerProcessTool } from '../../../src/mcp/tools/process.js';
import { buildProcessController } from '../../../src/cli/helpers/process-runtime.js';

describe('deckent_process MCP tool', () => {
  let server: MockServer;
  beforeEach(() => {
    vi.clearAllMocks();
    mockSubmit.mockResolvedValue({ executionId: 'proc-1', status: 'pending-approval' });
    server = createMockServer();
    registerProcessTool(server as never);
  });

  function call(args: Record<string, unknown>) {
    return server.tools.get('deckent_process')!.handler(args);
  }

  it('registers the deckent_process tool', () => {
    expect(server.tools.has('deckent_process')).toBe(true);
  });

  it('action=submit builds a controller and returns the submit result', async () => {
    const out = parse(await call({ action: 'submit', root: '/r', description: 'read orders', kind: 'capability', capability: 'erp.read', connector: 'odoo' }));
    expect(buildProcessController).toHaveBeenCalledWith('/r');
    expect(mockSubmit).toHaveBeenCalledOnce();
    const ctx = mockSubmit.mock.calls[0]![0] as Record<string, unknown>;
    expect(ctx.origin).toBe('mcp');
    expect((ctx.capabilityTarget as { capability: string }).capability).toBe('erp.read');
    expect(out).toMatchObject({ action: 'submit', executionId: 'proc-1', status: 'pending-approval' });
  });

  it('action=submit without description → error', async () => {
    const out = parse(await call({ action: 'submit', root: '/r' }));
    expect(out.error).toMatch(/description is required/);
  });

  it('action=submit parses capabilityArgs JSON into the target', async () => {
    await call({ action: 'submit', root: '/r', description: 'q', kind: 'capability', capability: 'db.query', capabilityArgs: '{"sql":"select 1"}' });
    const ctx = mockSubmit.mock.calls[0]![0] as { capabilityTarget: { args: Record<string, unknown> } };
    expect(ctx.capabilityTarget.args).toEqual({ sql: 'select 1' });
  });

  it('action=status reads the durable backlog entry by id', async () => {
    const out = parse(await call({ action: 'status', root: '/r', executionId: 'proc-9' }));
    expect(out).toMatchObject({ action: 'status', id: 'proc-9', status: 'pending', kind: 'capability' });
  });

  it('action=status for an unknown id → found:false', async () => {
    const out = parse(await call({ action: 'status', root: '/r', executionId: 'nope' }));
    expect(out).toMatchObject({ action: 'status', executionId: 'nope', found: false });
  });

  it('action=status without executionId → error', async () => {
    const out = parse(await call({ action: 'status', root: '/r' }));
    expect(out.error).toMatch(/executionId is required/);
  });
});
