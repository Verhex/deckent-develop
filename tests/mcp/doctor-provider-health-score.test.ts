import { describe, expect, it, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const mocks = vi.hoisted(() => ({
  runDoctorChecks: vi.fn(() => ({
    ok: true,
    checks: [{ name: 'Required base check', passed: true, message: 'ready', required: true }],
  })),
  runProviderDiagnosticsWithOllama: vi.fn(async () => [
    { name: 'claude', available: false },
    { name: 'codex', available: true },
    { name: 'gemini', available: false },
    { name: 'ollama', available: true },
  ]),
  buildProviderDiagnosticAuthChecks: vi.fn(() => [
    {
      name: 'Claude authentication',
      passed: false,
      message: 'CLI present but NOT logged in',
      required: false,
    },
    {
      name: 'Gemini authentication',
      passed: false,
      message: 'CLI present but NOT logged in',
      required: false,
    },
  ]),
}));

vi.mock('../../src/cli/commands/doctor.js', () => mocks);
vi.mock('../../src/core/config.js', () => ({
  loadConfig: vi.fn(async () => ({ spawn_backend: 'docker' })),
}));

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>;
}>;

function registerHandler(registerDoctorTool: (server: McpServer) => void): ToolHandler {
  let handler: ToolHandler | undefined;
  registerDoctorTool({
    registerTool(_name: string, _config: unknown, toolHandler: ToolHandler) {
      handler = toolHandler;
    },
  } as unknown as McpServer);
  if (!handler) throw new Error('deckent_doctor handler was not registered');
  return handler;
}

describe('MCP doctor provider health-score composition', () => {
  it('includes reconciled auth warnings without flipping base ok', async () => {
    const { registerDoctorTool } = await import('../../src/mcp/tools/doctor.js');
    const handler = registerHandler(registerDoctorTool);

    const result = await handler({
      includeProfile: false,
      profile: false,
      providers: true,
      json: true,
    });
    const response = JSON.parse(result.content[0]!.text);

    expect(response.ok).toBe(true);
    expect(response.checks).toHaveLength(3);
    expect(response.healthScore).toBe(33);
    expect(response.recommendations).toEqual([
      'Fix: Claude authentication — CLI present but NOT logged in',
      'Fix: Gemini authentication — CLI present but NOT logged in',
    ]);
    expect(response.providerSummary).toEqual({
      ready: 2,
      total: 4,
      authWarningCount: 2,
    });
  });

  it('preserves the provider-free response when providers is false', async () => {
    mocks.runProviderDiagnosticsWithOllama.mockClear();
    const { registerDoctorTool } = await import('../../src/mcp/tools/doctor.js');
    const handler = registerHandler(registerDoctorTool);

    const result = await handler({
      includeProfile: false,
      profile: false,
      providers: false,
      json: true,
    });
    const response = JSON.parse(result.content[0]!.text);

    expect(response.ok).toBe(true);
    expect(response.checks).toHaveLength(1);
    expect(response.healthScore).toBe(100);
    expect(response.providerSummary).toBeUndefined();
    expect(mocks.runProviderDiagnosticsWithOllama).not.toHaveBeenCalled();
  });
});
