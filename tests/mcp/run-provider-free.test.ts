import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writeFileSync } from 'node:fs';

// ─── Mocks ──────────────────────────────────────────────────────────

const { mockSpawnOneShot } = vi.hoisted(() => ({
  mockSpawnOneShot: vi.fn(),
}));

vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('../../src/core/constants.js', () => ({
  RUNTIME_DIR: '.deckent/runtime',  // sprint-429 (429-011) tool-inventory yolu modül-yüklemede okur
  SETTINGS_DIR: '.deckent/settings',  // born-630 allowscope-zinciri modül-yüklemede okur
  TASKS_DIR: '.tasks',
}));

vi.mock('../../src/mcp/tools/job-runner.js', () => ({
  writeJobState: vi.fn(),
}));

vi.mock('../../src/mcp/helpers/enrich.js', () => ({
  enrichResponse: vi.fn((_t: string, data: unknown) => data),
}));

vi.mock('../../src/orchestra/brain.js', () => ({
  buildWorkerPrompt: vi.fn().mockReturnValue('worker-prompt'),
}));

vi.mock('../../src/orchestra/sprint-controller.js', () => ({
  resolveAgentPrompt: vi.fn().mockResolvedValue(undefined),
  resolveSkillPrompts: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../src/orchestra/routing-plan-adapter.js', () => ({
  routeSingleTaskV3: vi.fn().mockResolvedValue({ agentId: 'generic', skillIds: [] }),
}));

vi.mock('../../src/core/config.js', () => ({
  resolveDefaultModel: () => 'claude-sonnet-5',
  resolveBrainModel: () => 'claude-sonnet-5',  // sprint-431 (431-003) compiler-cagri-zinciri okur
  resolveBrainPlanningMode: (c: any) => c?.brain_planning ?? c?.activeModeConfig?.brain_planning ?? 'auto',  // sprint-429 (429-006)
  loadConfig: vi.fn(),
}));

vi.mock('../../src/cli/commands/spawn.js', () => ({
  spawnWorkerMultiProvider: mockSpawnOneShot,
}));

import { loadConfig } from '../../src/core/config.js';

// ─── Mock server ────────────────────────────────────────────────────

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

describe('deckent_run — provider-free (Fix A)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSpawnOneShot.mockResolvedValue({ backend: 'subprocess', provider: 'claude' });
  });

  it('derives Codex ownership from the exact model ID', async () => {
    vi.mocked(loadConfig).mockResolvedValue({
      worker_provider: 'codex',
      brain_provider: 'claude',
      spawn_backend: 'subprocess',
      routing_engine: 'v2',
      execution_budget: {
        roles: { worker: { default: { maxTurns: 4 } } },
        landing: { reserve_ratio: 0.25 },
      },
    } as never);

    const { registerRunTool } = await import('../../src/mcp/tools/run.ts');
    const server = createMockServer() as never;
    registerRunTool(server);

    const handler = server.tools.get('deckent_run')!.handler;
    await handler({ description: 'fix a bug', model: 'gpt-5.6-sol', autoApprove: true });

    const writtenCall = vi.mocked(writeFileSync).mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).endsWith('.json'),
    );
    expect(writtenCall).toBeDefined();
    const task = JSON.parse(writtenCall![1] as string);
    expect(task.provider).toBe('codex');
    expect(task.model).toBe('gpt-5.6-sol');
    expect(mockSpawnOneShot).toHaveBeenCalledWith(
      expect.any(String),
      'gpt-5.6-sol',
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ provider: 'codex' }),
    );
  });

  it('derives Gemini ownership from the exact model ID', async () => {
    vi.mocked(loadConfig).mockResolvedValue({
      worker_provider: undefined,
      brain_provider: 'gemini',
      spawn_backend: 'subprocess',
      routing_engine: 'v2',
      execution_budget: {
        roles: { worker: { default: { maxTurns: 4 } } },
        landing: { reserve_ratio: 0.25 },
      },
    } as never);

    const { registerRunTool } = await import('../../src/mcp/tools/run.ts');
    const server = createMockServer() as never;
    registerRunTool(server);

    const handler = server.tools.get('deckent_run')!.handler;
    await handler({ description: 'write tests', model: 'gemini-2.5-flash', autoApprove: false });

    const writtenCall = vi.mocked(writeFileSync).mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).endsWith('.json'),
    );
    const task = JSON.parse(writtenCall![1] as string);
    expect(task.provider).toBe('gemini');
    expect(task.model).toBe('gemini-2.5-flash');
  });

  it('infers Claude ownership when config has no provider configured', async () => {
    vi.mocked(loadConfig).mockResolvedValue({
      worker_provider: undefined,
      brain_provider: undefined,
      spawn_backend: 'subprocess',
      routing_engine: 'v2',
      execution_budget: {
        roles: { worker: { default: { maxTurns: 4 } } },
        landing: { reserve_ratio: 0.25 },
      },
    } as never);

    const { registerRunTool } = await import('../../src/mcp/tools/run.ts');
    const server = createMockServer() as never;
    registerRunTool(server);

    const handler = server.tools.get('deckent_run')!.handler;
    await handler({ description: 'do work', model: 'claude-sonnet-5', autoApprove: true });

    const writtenCall = vi.mocked(writeFileSync).mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).endsWith('.json'),
    );
    const task = JSON.parse(writtenCall![1] as string);
    expect(task.provider).toBe('claude');
    expect(task.model).toBe('claude-sonnet-5');
  });

  it('rejects a provider/model mismatch before writing a task', async () => {
    vi.mocked(loadConfig).mockResolvedValue({
      worker_provider: undefined,
      brain_provider: undefined,
      spawn_backend: 'subprocess',
      routing_engine: 'v2',
    } as never);

    const { registerRunTool } = await import('../../src/mcp/tools/run.ts');
    const server = createMockServer() as never;
    registerRunTool(server);

    const handler = server.tools.get('deckent_run')!.handler;
    const result = await handler({
      description: 'do work',
      model: 'claude-sonnet-5',
      provider: 'codex',
      autoApprove: true,
    });

    expect(result.isError).toBe(true);
    expect(writeFileSync).not.toHaveBeenCalled();
    expect(mockSpawnOneShot).not.toHaveBeenCalled();
  });
});
