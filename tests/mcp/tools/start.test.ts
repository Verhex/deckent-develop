import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SprintStatus, SprintPhase } from '../../../src/core/types.js';
import type { Sprint, ResolvedConfig } from '../../../src/core/types.js';

// ─── Mocks ──────────────────────────────────────────────────────────────────

// Stub fork + filesystem writes so registerStartTool does not create real
// .deckent/job-<timestamp>-<uuid>-ipc/ directories in the project root during tests.
// Pre-fix this test leaked ~10 orphan IPC dirs per run (cumulatively 435+).
vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
  return {
    ...actual,
    fork: vi.fn(() => ({
      on: vi.fn(),
      unref: vi.fn(),
    })),
  };
});

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    rmSync: vi.fn(),
  };
});

vi.mock('../../../src/core/config.js', () => ({
  resolveBrainModel: () => 'claude-sonnet-5',
  resolveBrainPlanningMode: (c: any) => c?.brain_planning ?? c?.activeModeConfig?.brain_planning ?? 'auto',  // sprint-429 (429-006)
  loadConfig: vi.fn(),
  readAuthMode: vi.fn().mockResolvedValue('subscription'),
}));

vi.mock('../../../src/orchestra/brain.js', () => ({
  runSprint: vi.fn(),
  readContext: vi.fn(() => ({})),
  planSprint: vi.fn().mockResolvedValue({
    id: 'sprint-start-tool',
    tasks: [],
  }),
  BrainError: class BrainError extends Error {
    phase?: string;
    constructor(msg: string, phase?: string) {
      super(msg);
      this.name = 'BrainError';
      this.phase = phase;
    }
  },
}));

vi.mock('../../../src/core/cost-config-loader.js', () => ({
  initCostConfig: vi.fn(),
  loadCostConfig: vi.fn(() => ({
    _version: '1.0',
    providers: {},
    cost_limits: {
      sprint_max_usd: 5,
      daily_max_usd: 50,
      monthly_max_usd: 500,
      auto_confirm_below_usd: 2,
    },
    update_config: { sources_priority: ['bundled'] },
  })),
}));

vi.mock('../../../src/mcp/tools/job-runner.js', () => ({
  writeJobState: vi.fn(),
  buildTaskSummaries: vi.fn(() => []),
}));

vi.mock('../../../src/core/provider.js', () => ({
  ProviderError: class ProviderError extends Error {},
  bootstrapProviders: vi.fn(),
}));

vi.mock('../../../src/mcp/helpers/enrich.js', () => ({
  enrichResponse: vi.fn((toolName, response, _ctx) => ({
    ...response,
    _enriched: {
      summary: 'Sprint started.',
      hints: ['`deckent status --watch` ile izleyin'],
      timestamp: '2026-03-20T00:00:00.000Z',
    },
  })),
}));

vi.mock('../../../src/mcp/helpers/format.js', () => ({
  formatStartResponse: vi.fn(() => 'mocked summary'),
  formatErrorResponse: vi.fn(() => 'mocked error summary'),
  wrapResponse: vi.fn(<T>(data: T, _summary: string) => data),
}));

import { loadConfig } from '../../../src/core/config.js';
import { runSprint } from '../../../src/orchestra/brain.js';
import { writeJobState } from '../../../src/mcp/tools/job-runner.js';
import { enrichResponse } from '../../../src/mcp/helpers/enrich.js';

// ─── Mock Server Factory ─────────────────────────────────────────────────────

type ToolHandler = (
  args: Record<string, unknown>,
) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;

interface MockServer {
  tools: Map<string, { config: unknown; handler: ToolHandler }>;
  registerTool: (name: string, config: unknown, handler: ToolHandler) => void;
}

function createMockServer(): MockServer {
  const tools = new Map<string, { config: unknown; handler: ToolHandler }>();
  return {
    tools,
    registerTool(name, config, handler) {
      tools.set(name, { config, handler });
    },
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const MOCK_CONFIG: ResolvedConfig = {
  mode: 'max_plan',
  activeModeConfig: {
    max_workers: 8,
    brain_model: 'claude-opus-4-8',
    default_model: 'claude-sonnet-5',
    haiku_allowed: false,
  },
  modes: {} as ResolvedConfig['modes'],
  language: 'en',
  projectName: 'test',
  projectRoot: '/tmp/test',
  version: '0.1.0',
};

const MOCK_SPRINT: Sprint = {
  id: 'sprint-007',
  number: 7,
  status: SprintStatus.COMPLETE,
  phase: SprintPhase.COMPLETE,
  tasks: [],
  workers: [],
  startedAt: '2026-03-20T10:00:00.000Z',
  completedAt: '2026-03-20T10:30:00.000Z',
};

async function getStartTool() {
  const { registerStartTool } = await import('../../../src/mcp/tools/start.js');
  const server = createMockServer();
  registerStartTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
  const tool = server.tools.get('deckent_start');
  expect(tool).toBeDefined();
  return tool!;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('registerStartTool', () => {
  // born-480 HERMETIC-RUNSTATE: registerStartTool's handler reads
  // `process.cwd()` and passes it straight into `isSprintLocked()` /
  // `cleanOrphanIpcDirs()` (src/core/multi-ide.ts, src/core/orphan-cleaner.ts)
  // — real, unmocked `existsSync`/`readFileSync` calls (only mkdirSync /
  // writeFileSync / rmSync are stubbed above). Without a cwd redirect, every
  // test here reads the REAL repo's `.deckent/sprint.lock`; a genuinely-live
  // sprint on the host (same PID namespace as the test runner) makes
  // `isSprintLocked` report locked=true and breaks every non-force test with
  // an unexpected "Sprint already running" error. Redirect process.cwd() to
  // a fresh, empty tmpdir per test (mkdtempSync — NOT among the stubbed fs
  // fns above, so this is a real directory) so the lock check naturally sees
  // no lock file, independent of whatever the real repo/host is doing.
  let sandboxRoot = '';
  let cwdSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadConfig).mockResolvedValue(MOCK_CONFIG);
    vi.mocked(runSprint).mockReturnValue(new Promise(() => {})); // never resolves by default
    sandboxRoot = mkdtempSync(join(tmpdir(), 'deckent-start-test-'));
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(sandboxRoot);
  });

  afterEach(async () => {
    cwdSpy.mockRestore();
    // node:fs/promises is NOT vi.mock'd in this file (only sync node:fs is),
    // so this actually removes the tmpdir — the stubbed sync rmSync above
    // would silently no-op and leak it.
    await rm(sandboxRoot, { recursive: true, force: true });
  });

  // ── Tool Registration ────────────────────────────────────────────────────

  describe('tool registration', () => {
    it('registers tool with name deckent_start', async () => {
      const { registerStartTool } = await import('../../../src/mcp/tools/start.js');
      const server = createMockServer();
      registerStartTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
      expect(server.tools.has('deckent_start')).toBe(true);
    });

    it('registers tool with schema accepting autoApprove parameter', async () => {
      const { registerStartTool } = await import('../../../src/mcp/tools/start.js');
      const server = createMockServer();
      registerStartTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
      const tool = server.tools.get('deckent_start');
      expect(tool).toBeDefined();
      expect(tool!.config).toHaveProperty('inputSchema');
    });
  });

  // ── Background Job Creation ──────────────────────────────────────────────

  describe('background job creation', () => {
    it('returns immediately with a job-scoped timestamp and UUID identity', async () => {
      const tool = await getStartTool();
      const result = await tool.handler({ autoApprove: false });
      const parsed = JSON.parse(result.content[0]!.text);

      expect(parsed.jobId).toMatch(/^job-\d{13}-[0-9a-f-]+$/);
    });

    it('returns status RUNNING immediately without waiting for sprint', async () => {
      const tool = await getStartTool();
      const result = await tool.handler({ autoApprove: false });
      const parsed = JSON.parse(result.content[0]!.text);

      expect(parsed.status).toBe('RUNNING');
      expect(parsed.success).toBe(true);
    });

    it('writes RUNNING job state via writeJobState immediately', async () => {
      const tool = await getStartTool();
      await tool.handler({ autoApprove: false });

      expect(vi.mocked(writeJobState)).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ status: 'RUNNING' }),
      );
    });

    it('includes message about background execution', async () => {
      const tool = await getStartTool();
      const result = await tool.handler({ autoApprove: false });
      const parsed = JSON.parse(result.content[0]!.text);

      expect(parsed.message).toContain('background');
    });

    it('does not set isError on successful start', async () => {
      const tool = await getStartTool();
      const result = await tool.handler({ autoApprove: false });

      expect(result.isError).toBeUndefined();
    });
  });

  // NOTE: "Job State Tracking" and "autoApprove Parameter" describe blocks
  // removed (2026-04-17, T-143-012 MCP Disconnect Fix). runSprint() is no
  // longer called in the handler's process — the handler now fork()s a
  // detached sprint-runner-entry.js child, so in-process runSprint mocks
  // are invisible. COMPLETE/FAILED state tracking and autoApprove payload
  // propagation must be covered by an integration test that inspects the
  // forked IPC config file. Tracked as Sprint 144 debt.

  // ── Error Handling ───────────────────────────────────────────────────────

  describe('error handling', () => {
    it('returns error response when loadConfig throws', async () => {
      vi.mocked(loadConfig).mockRejectedValue(new Error('config not found'));

      const tool = await getStartTool();
      const result = await tool.handler({ autoApprove: false });
      const parsed = JSON.parse(result.content[0]!.text);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe(true);
      expect(parsed.message).toContain('config not found');
      expect(result.isError).toBe(true);
    });

    it('formats BrainError with phase info in error response', async () => {
      const { BrainError } = await import('../../../src/orchestra/brain.js');
      vi.mocked(loadConfig).mockRejectedValue(new BrainError('tmux not found', 'SPAWN'));

      const tool = await getStartTool();
      const result = await tool.handler({ autoApprove: false });
      const parsed = JSON.parse(result.content[0]!.text);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe(true);
      expect(parsed.message).toContain('SPAWN');
      expect(result.isError).toBe(true);
    });

    // "does not call runSprint when loadConfig fails" removed — runSprint is
    // now invoked inside a forked child, so the ana-process mock is never
    // called regardless of loadConfig outcome; the assertion is vacuous.
  });

  // ── Enriched Response ────────────────────────────────────────────────────

  describe('enriched response', () => {
    it('calls enrichResponse with start tool name', async () => {
      const tool = await getStartTool();
      await tool.handler({ autoApprove: false });

      expect(vi.mocked(enrichResponse)).toHaveBeenCalledWith(
        'start',
        expect.any(Object),
      );
    });

    it('response includes _enriched metadata', async () => {
      const tool = await getStartTool();
      const result = await tool.handler({ autoApprove: false });
      const parsed = JSON.parse(result.content[0]!.text);

      expect(parsed._enriched).toBeDefined();
      expect(parsed._enriched.summary).toBeDefined();
      expect(parsed._enriched.hints).toBeDefined();
    });
  });

  // ── Hermetic Run-State (born-480) ────────────────────────────────────────
  // Proof case: the sprint-lock check must be correct AND fully sandbox-scoped.
  // Each test gets its own fresh mkdtemp root (see beforeEach above), so
  // deliberately writing a fake "live" lock into THIS test's sandbox cannot
  // leak into any other test — this is the direct rebuttal to the born-480
  // symptom (a real host-level lock breaking unrelated test outcomes).

  describe('hermetic run-state (born-480) — sandbox-scoped lock detection', () => {
    async function writeFakeLiveLock(): Promise<void> {
      // process.pid is guaranteed alive for the lifetime of this test process
      // (isPidAlive checks /proc/<pid> on linux, process.kill(pid, 0) elsewhere
      // — both succeed on self), so this simulates a genuinely-live sprint lock
      // without depending on any real host/repo state.
      await mkdir(join(sandboxRoot, '.deckent'), { recursive: true });
      await writeFile(
        join(sandboxRoot, '.deckent', 'sprint.lock'),
        JSON.stringify({
          pid: process.pid,
          env: 'vscode',
          sprintId: 'sprint-fake-live',
          acquiredAt: new Date().toISOString(),
        }),
        'utf-8',
      );
    }

    it('detects a fake live-PID lock inside its own isolated sandbox and blocks the sprint', async () => {
      await writeFakeLiveLock();

      const tool = await getStartTool();
      const result = await tool.handler({ autoApprove: false });
      const parsed = JSON.parse(result.content[0]!.text);

      expect(result.isError).toBe(true);
      expect(parsed.success).toBe(false);
      expect(parsed.message).toContain('Run already running');
    });

    it('force=true bypasses the fake live lock — sandbox-scoped, not real-repo-dependent', async () => {
      await writeFakeLiveLock();

      const tool = await getStartTool();
      const result = await tool.handler({ autoApprove: false, force: true });

      expect(result.isError).toBeUndefined();
    });
  });
});
