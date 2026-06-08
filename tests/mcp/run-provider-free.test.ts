import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writeFileSync } from 'node:fs';

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('../../src/core/constants.js', () => ({
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

vi.mock('../../src/core/config.js', () => ({
  loadConfig: vi.fn(),
}));

vi.mock('../../src/orchestra/spawn-backend.js', () => ({
  SpawnBackendFactory: {
    create: vi.fn().mockReturnValue({ spawn: vi.fn(), name: 'subprocess' }),
  },
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
  });

  it('uses config worker_provider when set — no literal "claude" hardcode', async () => {
    vi.mocked(loadConfig).mockResolvedValue({
      worker_provider: 'codex',
      brain_provider: 'claude',
      spawn_backend: 'auto',
    } as never);

    const { registerRunTool } = await import('../../src/mcp/tools/run.ts');
    const server = createMockServer() as never;
    registerRunTool(server);

    const handler = server.tools.get('deckent_run')!.handler;
    await handler({ description: 'fix a bug', model: 'sonnet', autoApprove: true });

    const writtenCall = vi.mocked(writeFileSync).mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).endsWith('.json'),
    );
    expect(writtenCall).toBeDefined();
    const task = JSON.parse(writtenCall![1] as string);
    expect(task.provider).toBe('codex');
    expect(task.provider).not.toBe('claude');
  });

  it('falls back to brain_provider when worker_provider is undefined', async () => {
    vi.mocked(loadConfig).mockResolvedValue({
      worker_provider: undefined,
      brain_provider: 'gemini',
      spawn_backend: 'subprocess',
    } as never);

    const { registerRunTool } = await import('../../src/mcp/tools/run.ts');
    const server = createMockServer() as never;
    registerRunTool(server);

    const handler = server.tools.get('deckent_run')!.handler;
    await handler({ description: 'write tests', model: 'haiku', autoApprove: false });

    const writtenCall = vi.mocked(writeFileSync).mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).endsWith('.json'),
    );
    const task = JSON.parse(writtenCall![1] as string);
    expect(task.provider).toBe('gemini');
    expect(task.provider).not.toBe('claude');
  });

  it('provider is undefined (not "claude") when config has no provider configured', async () => {
    vi.mocked(loadConfig).mockResolvedValue({
      worker_provider: undefined,
      brain_provider: undefined,
      spawn_backend: 'auto',
    } as never);

    const { registerRunTool } = await import('../../src/mcp/tools/run.ts');
    const server = createMockServer() as never;
    registerRunTool(server);

    const handler = server.tools.get('deckent_run')!.handler;
    await handler({ description: 'do work', model: 'sonnet', autoApprove: true });

    const writtenCall = vi.mocked(writeFileSync).mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).endsWith('.json'),
    );
    const task = JSON.parse(writtenCall![1] as string);
    // undefined serializes as missing key — no literal 'claude' forced
    expect(task.provider).toBeUndefined();
  });
});
