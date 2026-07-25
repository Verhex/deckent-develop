import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writeFileSync } from 'node:fs';

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('../../../src/core/constants.js', () => ({
  RUNTIME_DIR: '.deckent/runtime',  // sprint-429 (429-011) tool-inventory yolu modül-yüklemede okur
  SETTINGS_DIR: '.deckent/settings',  // born-630 allowscope-zinciri modül-yüklemede okur
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
  resolveBrainModel: () => 'sonnet',  // sprint-431 (431-003) compiler-cagri-zinciri okur
  resolveBrainPlanningMode: (c: any) => c?.brain_planning ?? c?.activeModeConfig?.brain_planning ?? 'auto',  // sprint-429 (429-006)
  resolveDefaultModel: () => 'claude-opus-4-8',  // 453-001: canonical default-model resolver (omitted model)
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

vi.mock('../../../src/orchestra/routing-plan-adapter.js', () => ({
  routeSingleTaskV3: vi.fn().mockResolvedValue({ agentId: 'bug-fixer', skillIds: ['typescript-expert'], confidence: 0.8, workType: 'build', escalation: null, storySummary: '' }),
}));

vi.mock('../../../src/core/utils.js', () => ({
  debugLog: vi.fn(),
}));

import { loadConfig } from '../../../src/core/config.js';
import { routeSingleTaskV3 } from '../../../src/orchestra/routing-plan-adapter.js';

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
    vi.mocked(routeSingleTaskV3).mockResolvedValue({ agentId: 'bug-fixer', skillIds: ['typescript-expert'], confidence: 0.8, workType: 'build', escalation: null, storySummary: '' });
  });

  it('sets assignedAgent and assignedSkills from routeSingleTaskV3 decision', async () => {
    vi.mocked(loadConfig).mockResolvedValue({
      routing_engine: 'v2',
      spawn_backend: 'subprocess',
      execution_budget: { roles: { worker: { default: { maxTurns: 4 } } } },
    } as never);

    const { registerRunTool } = await import('../../../src/mcp/tools/run.ts');
    const server = createMockServer() as never;
    registerRunTool(server);

    const handler = server.tools.get('deckent_run')!.handler;
    await handler({ description: 'fix a bug', model: 'claude-sonnet-5', autoApprove: true });

    const writtenCall = vi.mocked(writeFileSync).mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).endsWith('.json'),
    );
    expect(writtenCall).toBeDefined();
    const task = JSON.parse(writtenCall![1] as string);
    expect(task.assignedAgent).toBe('bug-fixer');
    expect(task.assignedSkills).toEqual(['typescript-expert']);
    expect(vi.mocked(routeSingleTaskV3)).toHaveBeenCalledOnce();
  });

  it('calls routeSingleTaskV3 with the task and projectRoot (V3 signature)', async () => {
    vi.mocked(loadConfig).mockResolvedValue({
      routing_engine: 'v2',
      spawn_backend: 'subprocess',
      execution_budget: { roles: { worker: { default: { maxTurns: 4 } } } },
    } as never);

    const { registerRunTool } = await import('../../../src/mcp/tools/run.ts');
    const server = createMockServer() as never;
    registerRunTool(server);

    const handler = server.tools.get('deckent_run')!.handler;
    await handler({ description: 'fix a bug', model: 'claude-sonnet-5', autoApprove: true });

    expect(vi.mocked(routeSingleTaskV3)).toHaveBeenCalledOnce();
    const callArgs = vi.mocked(routeSingleTaskV3).mock.calls[0]!;
    // V3 signature: (task, projectRoot) — overrides ride the task's own
    // force/exclude fields, verified inside the pipeline.
    expect(callArgs[0]).toMatchObject({ title: expect.any(String) });
    expect(typeof callArgs[1]).toBe('string');
  });

  it('falls back to generic when routeSingleTaskV3 throws (fail-safe)', async () => {
    vi.mocked(loadConfig).mockResolvedValue({
      routing_engine: 'v2',
      spawn_backend: 'subprocess',
      execution_budget: { roles: { worker: { default: { maxTurns: 4 } } } },
    } as never);
    vi.mocked(routeSingleTaskV3).mockImplementationOnce(() => { throw new Error('routing failure'); });

    const { registerRunTool } = await import('../../../src/mcp/tools/run.ts');
    const server = createMockServer() as never;
    registerRunTool(server);

    const handler = server.tools.get('deckent_run')!.handler;
    // Should NOT propagate routing error — fail-safe catch swallows it
    const result = await handler({ description: 'do work', model: 'claude-sonnet-5', autoApprove: true });
    expect(result.isError).not.toBe(true);

    // Task should still be written (with generic fallback from resolveToTask)
    const writtenCall = vi.mocked(writeFileSync).mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).endsWith('.json'),
    );
    expect(writtenCall).toBeDefined();
  });

  it('always routes via routeSingleTaskV3 (V1 purged — ROUTE-V1-PURGE / ADR-G-006)', async () => {
    // Previously this asserted routing_engine=v1 SKIPPED routeSingleTaskV3. V1 is gone,
    // so routing now always flows through routeSingleTaskV3 regardless of config.
    vi.mocked(loadConfig).mockResolvedValue({
      routing_engine: 'v2',
      spawn_backend: 'subprocess',
      execution_budget: { roles: { worker: { default: { maxTurns: 4 } } } },
    } as never);

    const { registerRunTool } = await import('../../../src/mcp/tools/run.ts');
    const server = createMockServer() as never;
    registerRunTool(server);

    const handler = server.tools.get('deckent_run')!.handler;
    await handler({ description: 'do work', model: 'claude-sonnet-5', autoApprove: true });

    expect(vi.mocked(routeSingleTaskV3)).toHaveBeenCalled();
  });
});
