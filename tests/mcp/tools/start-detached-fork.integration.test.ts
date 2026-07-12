/**
 * Integration tests for MCP deckent_start detached fork + IPC pattern.
 * Sprint 143 T-143-012 introduced fork()-based sprint execution that communicates
 * via IPC files in `.deckent/<jobId>-ipc/`. These tests verify the IPC contract,
 * fork options, and concurrent start isolation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, readdirSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ResolvedConfig } from '../../../src/core/types.js';
import type { SprintRunnerConfig } from '../../../src/orchestra/sprint-runner-entry.js';

// ─── Mock child_process.fork to capture fork arguments ──────────────
const mockFork = vi.fn();

interface MockChild {
  unref: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  once: ReturnType<typeof vi.fn>;
  emit: ReturnType<typeof vi.fn>;
  removeListener: ReturnType<typeof vi.fn>;
  removeAllListeners: ReturnType<typeof vi.fn>;
  pid: number;
  connected: boolean;
  killed: boolean;
  exitCode: null;
  signalCode: null;
  stdio: unknown[];
  stdin: null;
  stdout: null;
  stderr: null;
  channel: undefined;
}

function createMockChild(): MockChild {
  const self: Partial<MockChild> = {};
  self.unref = vi.fn();
  self.on = vi.fn().mockReturnValue(self);
  self.off = vi.fn().mockReturnValue(self);
  self.once = vi.fn().mockReturnValue(self);
  self.emit = vi.fn().mockReturnValue(true);
  self.removeListener = vi.fn().mockReturnValue(self);
  self.removeAllListeners = vi.fn().mockReturnValue(self);
  self.pid = 12345 + Math.floor(Math.random() * 1000);
  self.connected = false;
  self.killed = false;
  self.exitCode = null;
  self.signalCode = null;
  self.stdio = [];
  self.stdin = null;
  self.stdout = null;
  self.stderr = null;
  self.channel = undefined;
  return self as MockChild;
}


vi.mock('node:child_process', () => ({
  fork: mockFork,
}));

vi.mock('../../../src/core/config.js', () => ({
  resolveBrainPlanningMode: (c: any) => c?.brain_planning ?? c?.activeModeConfig?.brain_planning ?? 'auto',  // sprint-429 (429-006)
  loadConfig: vi.fn(),
}));

vi.mock('../../../src/orchestra/brain.js', () => ({
  readContext: vi.fn(() => ({})),
  planSprint: vi.fn(),
  BrainError: class BrainError extends Error {
    phase?: string;
    constructor(msg: string, phase?: string) {
      super(msg);
      this.name = 'BrainError';
      this.phase = phase;
    }
  },
}));

vi.mock('../../../src/mcp/tools/job-runner.js', () => ({
  writeJobState: vi.fn(),
  buildTaskSummaries: vi.fn(() => []),
}));

vi.mock('../../../src/core/multi-ide.js', () => ({
  isSprintLocked: vi.fn(() => ({ locked: false })),
}));

vi.mock('../../../src/mcp/helpers/enrich.js', () => ({
  enrichResponse: vi.fn((_name: string, data: unknown) => data),
}));

vi.mock('../../../src/mcp/helpers/format.js', () => ({
  formatStartResponse: vi.fn(() => 'summary'),
  formatErrorResponse: vi.fn(() => 'error summary'),
  wrapResponse: vi.fn(<T>(data: T) => data),
}));

import { loadConfig } from '../../../src/core/config.js';

// ─── Mock Server Factory ────────────────────────────────────────────

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

// ─── Test Config ────────────────────────────────────────────────────

const MOCK_CONFIG: ResolvedConfig = {
  mode: 'max_plan',
  activeModeConfig: {
    max_workers: 4,
    brain_model: 'opus',
    default_model: 'sonnet',
    haiku_allowed: false,
  },
  modes: {} as ResolvedConfig['modes'],
  language: 'en',
  projectName: 'test-fork',
  projectRoot: '/tmp/test',
  version: '0.1.0',
};

// ─── Helpers ────────────────────────────────────────────────────────

let testRoot: string;
let originalCwd: string;

async function getStartTool(): Promise<{ config: unknown; handler: ToolHandler }> {
  const { registerStartTool } = await import('../../../src/mcp/tools/start.js');
  const server = createMockServer();
  registerStartTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
  const tool = server.tools.get('deckent_start');
  expect(tool).toBeDefined();
  return tool!;
}

/**
 * Find IPC directories created under .deckent/ during a handler call.
 * IPC dirs follow the pattern: `sprint-<timestamp>-ipc`
 */
function findIpcDirs(root: string): string[] {
  const deckentDir = join(root, '.deckent');
  if (!existsSync(deckentDir)) return [];
  return readdirSync(deckentDir)
    .filter(name => name.endsWith('-ipc'))
    .map(name => join(deckentDir, name));
}

// ─── Setup / Teardown ───────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadConfig).mockResolvedValue(MOCK_CONFIG);
  mockFork.mockImplementation(() => createMockChild());

  // Create a real temp directory so the handler can write IPC files
  testRoot = join(tmpdir(), `deckent-fork-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(join(testRoot, '.deckent'), { recursive: true });

  originalCwd = process.cwd();
  process.chdir(testRoot);
});

afterEach(() => {
  process.chdir(originalCwd);
  try { rmSync(testRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
});

// ─── Tests ──────────────────────────────────────────────────────────

describe('MCP deckent_start — detached fork + IPC integration', () => {

  // ── IPC Directory Creation ──────────────────────────────────────

  it('creates IPC directory under .deckent/<jobId>-ipc/', async () => {
    const tool = await getStartTool();
    await tool.handler({});

    const ipcDirs = findIpcDirs(testRoot);
    expect(ipcDirs.length).toBe(1);
    expect(ipcDirs[0]).toMatch(/sprint-\d+-ipc$/);
  });

  // ── IPC Config Schema ──────────────────────────────────────────

  it('writes config.json with valid SprintRunnerConfig schema', async () => {
    const tool = await getStartTool();
    await tool.handler({});

    const ipcDirs = findIpcDirs(testRoot);
    const configPath = join(ipcDirs[0]!, 'config.json');
    expect(existsSync(configPath)).toBe(true);

    const config = JSON.parse(readFileSync(configPath, 'utf-8')) as SprintRunnerConfig;
    expect(config).toHaveProperty('projectRoot');
    expect(config).toHaveProperty('jobId');
    expect(config).toHaveProperty('autoApprove');
    expect(typeof config.projectRoot).toBe('string');
    expect(typeof config.jobId).toBe('string');
    expect(typeof config.autoApprove).toBe('boolean');
  });

  it('config.json autoApprove defaults to false (Sprint 189 T-009 — CLI parity)', async () => {
    const tool = await getStartTool();
    await tool.handler({});

    const ipcDirs = findIpcDirs(testRoot);
    const config = JSON.parse(
      readFileSync(join(ipcDirs[0]!, 'config.json'), 'utf-8'),
    ) as SprintRunnerConfig;

    // Sprint 189 T-009: autoApprove was previously hardcoded true. Now the
    // caller-supplied value flows through (default false for CLI parity).
    expect(config.autoApprove).toBe(false);
  });

  it('config.json honors explicit autoApprove=true (opt-in old behavior)', async () => {
    const tool = await getStartTool();
    await tool.handler({ autoApprove: true });

    const ipcDirs = findIpcDirs(testRoot);
    const config = JSON.parse(
      readFileSync(join(ipcDirs[0]!, 'config.json'), 'utf-8'),
    ) as SprintRunnerConfig;

    expect(config.autoApprove).toBe(true);
  });

  it('config.json forwards sandbox and timeout parameters', async () => {
    const tool = await getStartTool();
    await tool.handler({ sandbox: true, timeout: 60000 });

    const ipcDirs = findIpcDirs(testRoot);
    const config = JSON.parse(
      readFileSync(join(ipcDirs[0]!, 'config.json'), 'utf-8'),
    ) as SprintRunnerConfig;

    expect(config.sandboxMode).toBe(true);
    expect(config.timeoutMs).toBe(60000);
  });

  it('config.json projectRoot matches process.cwd()', async () => {
    const tool = await getStartTool();
    await tool.handler({});

    const ipcDirs = findIpcDirs(testRoot);
    const config = JSON.parse(
      readFileSync(join(ipcDirs[0]!, 'config.json'), 'utf-8'),
    ) as SprintRunnerConfig;

    expect(config.projectRoot).toBe(testRoot);
  });

  // ── Fork Options ──────────────────────────────────────────────

  it('fork() is called with detached:true and stdio:ignore', async () => {
    const tool = await getStartTool();
    await tool.handler({});

    expect(mockFork).toHaveBeenCalledTimes(1);
    const [_runnerPath, _args, options] = mockFork.mock.calls[0]! as [string, string[], Record<string, unknown>];

    expect(options.detached).toBe(true);
    expect(options.stdio).toBe('ignore');
  });

  it('child.unref() is called to detach from parent event loop', async () => {
    const child = createMockChild();
    mockFork.mockReturnValueOnce(child);

    const tool = await getStartTool();
    await tool.handler({});

    expect(child.unref).toHaveBeenCalledTimes(1);
  });

  it('fork() receives IPC directory as first argument', async () => {
    const tool = await getStartTool();
    await tool.handler({});

    const [_runnerPath, args] = mockFork.mock.calls[0]! as [string, string[]];
    // The IPC dir is passed as the first (and only) positional arg
    expect(args).toHaveLength(1);
    expect(args[0]).toMatch(/sprint-\d+-ipc$/);
  });

  it('fork() runner path points to sprint-runner-entry.js', async () => {
    const tool = await getStartTool();
    await tool.handler({});

    const [runnerPath] = mockFork.mock.calls[0]! as [string];
    expect(runnerPath).toContain('sprint-runner-entry.js');
  });

  // ── Concurrent Start Isolation ────────────────────────────────

  it('concurrent starts produce unique IPC directories', async () => {
    const tool = await getStartTool();

    // Introduce small delay to ensure different Date.now() timestamps
    const result1 = await tool.handler({});
    // Force a distinct timestamp
    await new Promise(resolve => setTimeout(resolve, 5));
    const result2 = await tool.handler({});

    const parsed1 = JSON.parse(result1.content[0]!.text) as { jobId: string };
    const parsed2 = JSON.parse(result2.content[0]!.text) as { jobId: string };

    // Job IDs must be unique
    expect(parsed1.jobId).not.toBe(parsed2.jobId);

    // Two distinct IPC directories should exist
    const ipcDirs = findIpcDirs(testRoot);
    expect(ipcDirs.length).toBe(2);

    // Each IPC dir has its own config.json
    for (const dir of ipcDirs) {
      expect(existsSync(join(dir, 'config.json'))).toBe(true);
    }
  });

  // ── IPC Directory Path Contract ───────────────────────────────

  it('IPC directory path matches getIpcDir() contract', async () => {
    const { getIpcDir } = await import('../../../src/orchestra/sprint-runner-entry.js');
    const tool = await getStartTool();
    const result = await tool.handler({});

    const parsed = JSON.parse(result.content[0]!.text) as { jobId: string };
    const expectedDir = getIpcDir(testRoot, parsed.jobId);

    expect(existsSync(expectedDir)).toBe(true);
    expect(existsSync(join(expectedDir, 'config.json'))).toBe(true);
  });

  // ── Response Shape ────────────────────────────────────────────

  it('handler returns immediately with success and jobId', async () => {
    const tool = await getStartTool();
    const result = await tool.handler({});
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;

    expect(parsed.success).toBe(true);
    expect(parsed.status).toBe('RUNNING');
    expect(parsed.jobId).toMatch(/^sprint-\d+$/);
    expect(result.isError).toBeUndefined();
  });
});
