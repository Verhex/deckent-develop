import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const {
  bootstrapProviders,
  planSprint,
  readContext,
  cleanOrphanIpcDirs,
  isSprintLocked,
  loadApprovedSnapshot,
  loadRunHandle,
  spawnDetachedDeckent,
  fork,
} = vi.hoisted(() => ({
  bootstrapProviders: vi.fn(),
  planSprint: vi.fn(),
  readContext: vi.fn(() => ({})),
  cleanOrphanIpcDirs: vi.fn(() => []),
  isSprintLocked: vi.fn(() => ({ locked: false })),
  loadApprovedSnapshot: vi.fn(),
  loadRunHandle: vi.fn(),
  spawnDetachedDeckent: vi.fn(),
  fork: vi.fn(),
}));

vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  fork,
}));

vi.mock('../../src/core/config.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/core/config.js')>()),
  loadConfig: vi.fn().mockResolvedValue({
    deckent_style: 'sprint',
    brain_provider: 'claude',
    worker_provider: 'claude',
    spawn_backend: 'docker',
    activeModeConfig: {
      brain_model: 'claude-fable-5',
      default_model: 'claude-sonnet-5',
      max_workers: 4,
    },
    provider_fallback: {
      brain: ['codex', 'gemini'],
      unattended: false,
    },
  }),
  resolveBrainModel: vi.fn(() => 'claude-fable-5'),
  readAuthMode: vi.fn().mockResolvedValue('subscription'),
}));

vi.mock('../../src/core/provider.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/core/provider.js')>()),
  bootstrapProviders,
}));

vi.mock('../../src/orchestra/brain.js', () => ({
  readContext,
  planSprint,
  BrainError: class BrainError extends Error {
    phase?: string;
  },
}));

vi.mock('../../src/core/orphan-cleaner.js', () => ({
  cleanOrphanIpcDirs,
}));

vi.mock('../../src/core/multi-ide.js', () => ({
  isSprintLocked,
}));

vi.mock('../../src/core/run-flow-store.js', () => ({
  loadApprovedSnapshot,
  loadRunHandle,
}));

vi.mock('../../src/cli/helpers/detached-start.js', () => ({
  spawnDetachedDeckent,
}));

vi.mock('../../src/mcp/helpers/enrich.js', () => ({
  enrichResponse: vi.fn((_tool: string, data: unknown) => data),
}));

vi.mock('../../src/mcp/helpers/format.js', () => ({
  formatStartResponse: vi.fn(() => 'start'),
  formatErrorResponse: vi.fn((data: { code?: string; message?: string }) =>
    `${data.code ?? ''}:${data.message ?? ''}`,
  ),
  wrapResponse: vi.fn((data: unknown) => data),
}));

import { registerTools } from '../../src/mcp/tools/index.js';
import type { ProviderAuthorityRuntimeServiceOpenResult } from '../../src/core/provider-authority-composition.js';

type ToolHandler = (
  args: Record<string, unknown>,
) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;

function captureStartHandler(
  providerAuthority?: ProviderAuthorityRuntimeServiceOpenResult,
): ToolHandler {
  const handlers = new Map<string, ToolHandler>();
  const server = {
    registerTool(name: string, _config: unknown, handler: ToolHandler) {
      handlers.set(name, handler);
    },
  } as unknown as McpServer;
  registerTools(server, providerAuthority ? { providerAuthority } : {});
  const handler = handlers.get('deckent_start');
  if (!handler) throw new Error('deckent_start not registered');
  return handler;
}

describe('MCP start provider-authority front door', () => {
  let root: string;
  let cwdSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    root = mkdtempSync(join(tmpdir(), 'mcp-start-provider-authority-'));
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(root);
    planSprint.mockResolvedValue({
      id: 'dry-run-sprint',
      tasks: [],
      workers: [],
    });
  });

  afterEach(() => {
    cwdSpy.mockRestore();
    rmSync(root, { recursive: true, force: true });
  });

  it.each([
    ['ordinary', {}],
    ['dry-run+force', { dryRun: true, force: true }],
    ['approved-flow flags', { flowId: 'flow-1', revision: 1, planDigest: 'digest-1' }],
  ])('HOLDs %s before every mutation/planning/spawn branch', async (_label, args) => {
    const authorityEvidenceRef = `provider-authority:${'d'.repeat(64)}`;
    const handler = captureStartHandler({
      state: 'hold',
      reasonCode: 'keyring_unavailable',
      authorityEvidenceRef,
      retryable: false,
      close: vi.fn(),
    });

    const result = await handler(args);
    const parsed = JSON.parse(result.content[0]!.text) as {
      code: string;
      providerAuthorityHold: {
        role: string;
        purpose: string;
        reasonCode: string;
        authorityEvidenceRefs: string[];
      };
    };

    expect(result.isError).toBe(true);
    expect(parsed).toMatchObject({
      code: 'PROVIDER_EXECUTION_AUTHORITY_HOLD',
      providerAuthorityHold: {
        role: 'brain',
        purpose: 'sprint-planning',
        reasonCode: 'keyring_unavailable',
        authorityEvidenceRefs: expect.arrayContaining([authorityEvidenceRef]),
      },
    });
    expect(cleanOrphanIpcDirs).not.toHaveBeenCalled();
    expect(isSprintLocked).not.toHaveBeenCalled();
    expect(loadApprovedSnapshot).not.toHaveBeenCalled();
    expect(loadRunHandle).not.toHaveBeenCalled();
    expect(bootstrapProviders).not.toHaveBeenCalled();
    expect(readContext).not.toHaveBeenCalled();
    expect(planSprint).not.toHaveBeenCalled();
    expect(spawnDetachedDeckent).not.toHaveBeenCalled();
    expect(fork).not.toHaveBeenCalled();
    expect(existsSync(join(root, '.tasks'))).toBe(false);

    const eventsDir = join(root, '.deckent', 'recently-works');
    const eventFiles = existsSync(eventsDir)
      ? readdirSync(eventsDir).filter(name => name.endsWith('-events.jsonl'))
      : [];
    expect(eventFiles).toHaveLength(1);
    const [event] = readFileSync(join(eventsDir, eventFiles[0]!), 'utf8')
      .trim()
      .split('\n')
      .map(line => JSON.parse(line) as {
        channel: string;
        payload: Record<string, unknown>;
      });
    expect(event).toMatchObject({
      channel: 'BRAIN→AUDITOR:PROVIDER_AUTHORITY_HOLD',
      payload: {
        role: 'brain',
        purpose: 'sprint-planning',
        provider: 'claude',
        model: 'claude-fable-5',
        configuredBackend: 'unresolved-before-provider-bootstrap',
        fallbackProviders: ['codex', 'gemini'],
        unattended: true,
      },
    });
  });

  it('preserves provider-free dry-run behavior when no authority is configured', async () => {
    const handler = captureStartHandler();
    const result = await handler({ dryRun: true });
    const parsed = JSON.parse(result.content[0]!.text) as {
      success: boolean;
      dryRun: boolean;
    };

    expect(result.isError).toBeUndefined();
    expect(parsed).toMatchObject({ success: true, dryRun: true });
    expect(bootstrapProviders).toHaveBeenCalledOnce();
    expect(planSprint).toHaveBeenCalledOnce();
  });
});
