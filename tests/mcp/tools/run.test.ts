import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writeFileSync } from 'node:fs';

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('../../../src/core/constants.js', () => ({
  TASKS_DIR: '.tasks',
}));

vi.mock('../../../src/mcp/tools/job-runner.js', () => ({
  writeJobState: vi.fn(),
}));

vi.mock('../../../src/mcp/helpers/enrich.js', () => ({
  enrichResponse: vi.fn((_t: string, data: unknown) => data),
}));

vi.mock('../../../src/orchestra/brain.js', () => ({
  buildWorkerPrompt: vi.fn().mockReturnValue('worker-prompt'),
}));

vi.mock('../../../src/orchestra/sprint-controller.js', () => ({
  resolveAgentPrompt: vi.fn().mockResolvedValue(undefined),
  resolveSkillPrompts: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../../src/core/config.js', () => ({
  loadConfig: vi.fn(),
}));

vi.mock('../../../src/cli/commands/spawn.js', () => ({
  spawnWorkerMultiProvider: vi.fn().mockResolvedValue({ backend: 'subprocess' }),
}));

// WM-1b routing mocks
vi.mock('../../../src/core/agent-pool.js', () => ({
  AgentPoolManager: vi.fn().mockImplementation(() => ({
    loadAgents: vi.fn().mockReturnValue([]),
  })),
}));

vi.mock('../../../src/core/skill-pool.js', () => ({
  SkillPoolManager: vi.fn().mockImplementation(() => ({
    loadSkills: vi.fn().mockReturnValue([]),
  })),
}));

vi.mock('../../../src/core/stack-detector.js', () => ({
  detectProjectStack: vi.fn().mockReturnValue({ primaryLanguage: 'typescript' }),
}));

vi.mock('../../../src/core/routing-engine.js', () => ({
  routeTaskV2: vi.fn().mockReturnValue({ agentId: 'bug-fixer', skillIds: ['typescript-expert'] }),
}));

vi.mock('../../../src/core/utils.js', () => ({
  debugLog: vi.fn(),
}));

import { loadConfig } from '../../../src/core/config.js';
import { routeTaskV2 } from '../../../src/core/routing-engine.js';

// ─── Mock Server ────────────────────────────────────────────────────

type ToolHandler = (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;

interface MockServer {
  tools: Map<string, { config: unknown; handler: ToolHandler }>;
  registerTool(name: string, config: unknown, handler: ToolHandler): void;
}

function createMockServer(): MockServer {
  const tools = new Map<string, { config: unknown; handler: ToolHandler }>();
  return {
    tools,
    registerTool(name, config, handler) { tools.set(name, { config, handler }); },
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('deckent_run MCP — WM-1b routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(routeTaskV2).mockReturnValue({ agentId: 'bug-fixer', skillIds: ['typescript-expert'] } as never);
  });

  it('sets assignedAgent and assignedSkills from routeTaskV2 decision', async () => {
    vi.mocked(loadConfig).mockResolvedValue({
      routing_engine: 'v2',
      spawn_backend: 'subprocess',
    } as never);

    const { registerRunTool } = await import('../../../src/mcp/tools/run.ts');
    const server = createMockServer() as never;
    registerRunTool(server);

    const handler = server.tools.get('deckent_run')!.handler;
    await handler({ description: 'fix a bug', model: 'sonnet', autoApprove: true });

    const writtenCall = vi.mocked(writeFileSync).mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).endsWith('.json'),
    );
    expect(writtenCall).toBeDefined();
    const task = JSON.parse(writtenCall![1] as string);
    expect(task.assignedAgent).toBe('bug-fixer');
    expect(task.assignedSkills).toEqual(['typescript-expert']);
    expect(vi.mocked(routeTaskV2)).toHaveBeenCalledOnce();
  });

  it('calls routeTaskV2 with overrides array and projectRoot context', async () => {
    vi.mocked(loadConfig).mockResolvedValue({
      routing_engine: 'v2',
      spawn_backend: 'subprocess',
    } as never);

    const { registerRunTool } = await import('../../../src/mcp/tools/run.ts');
    const server = createMockServer() as never;
    registerRunTool(server);

    const handler = server.tools.get('deckent_run')!.handler;
    await handler({ description: 'fix a bug', model: 'sonnet', autoApprove: true });

    expect(vi.mocked(routeTaskV2)).toHaveBeenCalledOnce();
    const callArgs = vi.mocked(routeTaskV2).mock.calls[0];
    // 4th arg is the routing context
    const ctx = callArgs[3] as { overrides: unknown[]; projectRoot: string; sprintId: string };
    expect(Array.isArray(ctx.overrides)).toBe(true);
    expect(typeof ctx.projectRoot).toBe('string');
    expect(ctx.sprintId).toBe('');
  });

  it('falls back to generic when routeTaskV2 throws (fail-safe)', async () => {
    vi.mocked(loadConfig).mockResolvedValue({
      routing_engine: 'v2',
      spawn_backend: 'subprocess',
    } as never);
    vi.mocked(routeTaskV2).mockImplementationOnce(() => { throw new Error('routing failure'); });

    const { registerRunTool } = await import('../../../src/mcp/tools/run.ts');
    const server = createMockServer() as never;
    registerRunTool(server);

    const handler = server.tools.get('deckent_run')!.handler;
    // Should NOT propagate routing error — fail-safe catch swallows it
    const result = await handler({ description: 'do work', model: 'sonnet', autoApprove: true });
    expect(result.isError).not.toBe(true);

    // Task should still be written (with generic fallback from resolveToTask)
    const writtenCall = vi.mocked(writeFileSync).mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).endsWith('.json'),
    );
    expect(writtenCall).toBeDefined();
  });

  it('skips routing when routing_engine is v1', async () => {
    vi.mocked(loadConfig).mockResolvedValue({
      routing_engine: 'v1',
      spawn_backend: 'subprocess',
    } as never);

    const { registerRunTool } = await import('../../../src/mcp/tools/run.ts');
    const server = createMockServer() as never;
    registerRunTool(server);

    const handler = server.tools.get('deckent_run')!.handler;
    await handler({ description: 'do work', model: 'sonnet', autoApprove: true });

    expect(vi.mocked(routeTaskV2)).not.toHaveBeenCalled();
  });
});
