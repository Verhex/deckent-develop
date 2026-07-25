/**
 * task-403-002 GATE-FLAG-THREAD (born-628 follow-up to task-402-001).
 *
 * `sprint-controller.ts`'s `RunSprintOptions.acknowledgePromptGate` +
 * `decidePromptGateBlock` (pinned by tests/orchestra/prompt-gate-start-path.test.ts)
 * already existed, but neither start-surface passed the flag through:
 *   - CLI `deckent start` had no `--force-prompt-gate` option (only `deckent plan`
 *     did, via src/cli/commands/plan.ts).
 *   - MCP `deckent_start`'s input schema had no `acknowledgePromptGate` field.
 *
 * This file pins two things:
 *   1. CLI: `--force-prompt-gate` threads `acknowledgePromptGate: opts.forcePromptGate
 *      === true` into the direct `runSprint()` call in src/cli/commands/start.ts —
 *      functional test (mirrors tests/cli/start-gate-exit.test.ts's mock harness)
 *      + a source-assert composition pin (mirrors the calltool-exec-wire.test.ts /
 *      prompt-gate-start-path.test.ts precedent).
 *   2. MCP: `acknowledgePromptGate` is a schema field on `deckent_start` and is
 *      threaded into the IPC `config.json` written for the forked sprint runner
 *      (src/orchestra/sprint-runner-entry.ts) — functional test (mirrors
 *      tests/mcp/tools/start.test.ts's hermetic sandboxRoot + writeFileSync-mock
 *      harness) + a source-assert composition pin.
 *
 * KNOWN GAP (documented, not fixed here — src/orchestra/sprint-runner-entry.ts is
 * out of this task's write scope): the forked child does not yet destructure
 * `acknowledgePromptGate` from its parsed IPC config and forward it to its own
 * `runSprint()` call. So today an MCP-supplied `acknowledgePromptGate: true` is
 * durably persisted into config.json (proven below) but the forked process will
 * not yet act on it — a follow-up task must extend `SprintRunnerConfig` +
 * the runner's destructure/`runSprint()` call. The CLI path has no such gap.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// ═══ Mocks shared by the CLI section (mirrors tests/cli/start-gate-exit.test.ts) ═══

vi.mock('../../src/core/config.js', () => ({
  resolveBrainModel: () => 'sonnet',  // sprint-431 (431-003) compiler-cagri-zinciri okur
  resolveBrainPlanningMode: (c: any) => c?.brain_planning ?? c?.activeModeConfig?.brain_planning ?? 'auto',  // sprint-429 (429-006)
  loadConfig: vi.fn(),
}));

vi.mock('../../src/orchestra/brain.js', () => ({
  runSprint: vi.fn(),
  readContext: vi.fn(),
  planSprint: vi.fn(),
  BrainError: class BrainError extends Error {
    phase?: string;
    constructor(message: string, phase?: string) {
      super(message);
      this.name = 'BrainError';
      this.phase = phase;
    }
  },
}));

vi.mock('../../src/orchestra/tmux.js', () => ({
  isSessionActive: vi.fn().mockReturnValue(false),
  setupWatchWindow: vi.fn(),
}));

vi.mock('../../src/core/constants.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/constants.js')>();
  return { ...actual, TMUX_SESSION_NAME: 'deckent' };
});

vi.mock('../../src/core/provider.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/provider.js')>();
  return {
    ...actual,
    bootstrapProviders: vi.fn().mockResolvedValue({ registered: [], skipped: [], defaultProvider: null }),
  };
});

vi.mock('../../src/cli/commands/doctor.js', () => ({
  runDoctorChecks: vi.fn().mockReturnValue({ checks: [] }),
}));

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
  formatSprintSummary: vi.fn().mockReturnValue('Sprint summary'),
  formatTable: vi.fn().mockReturnValue('Task table'),
}));

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/root'),
}));

vi.mock('../../src/cli/commands/quick-start.js', () => ({
  prepareZeroConfig: vi.fn(),
  cleanupZeroConfig: vi.fn(),
}));

// ═══ Mocks shared by the MCP section (mirrors tests/mcp/tools/start.test.ts) ═══
// Only mkdirSync/writeFileSync/rmSync are stubbed — existsSync/readdirSync/
// readFileSync stay real so the hermetic sandboxRoot (per-test mkdtempSync)
// behaves like a genuinely empty project directory, per the born-480 note in
// tests/mcp/tools/start.test.ts (real repo `.deckent/` state must never leak in).
vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
  return {
    ...actual,
    fork: vi.fn(() => ({ on: vi.fn(), unref: vi.fn() })),
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

vi.mock('../../src/mcp/tools/job-runner.js', () => ({
  writeJobState: vi.fn(),
  buildTaskSummaries: vi.fn(() => []),
}));

vi.mock('../../src/mcp/helpers/enrich.js', () => ({
  enrichResponse: vi.fn((_toolName: string, response: Record<string, unknown>) => ({
    ...response,
    _enriched: { summary: 'Sprint started.', hints: [], timestamp: '2026-01-01T00:00:00.000Z' },
  })),
}));

vi.mock('../../src/mcp/helpers/format.js', () => ({
  formatStartResponse: vi.fn(() => 'mocked summary'),
  formatErrorResponse: vi.fn(() => 'mocked error summary'),
  wrapResponse: vi.fn(<T>(data: T) => data),
}));

import { loadConfig } from '../../src/core/config.js';
import { runSprint, readContext, planSprint } from '../../src/orchestra/brain.js';
import { registerStart } from '../../src/cli/commands/start.js';

// ─────────────────────────────────────────────────────────────────────────
// 1. CLI — `deckent start --force-prompt-gate`
// ─────────────────────────────────────────────────────────────────────────

function makeConfig() {
  return {
    activeModeConfig: { brain_model: 'claude-opus-4-8', max_workers: 3 },
    brain_planning: 'auto',
    language: 'en',
  };
}

function makeSprint() {
  return {
    id: 'sprint-001',
    number: 1,
    tasks: [{ id: '001-001', title: 'Task One', model: 'sonnet', priority: 'NORMAL' }],
    reasoning: 'Test reasoning',
    planningMode: 'structured',
  };
}

async function runStart(extraArgs: string[] = []): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerStart(program);
  try {
    await program.parseAsync(['node', 'test', 'start', ...extraArgs]);
  } catch {
    // Commander exitOverride throws instead of process.exit — expected in tests.
  }
}

describe('deckent start CLI — --force-prompt-gate (task-403-002, born-628)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;

    vi.mocked(loadConfig).mockResolvedValue(makeConfig() as any);
    vi.mocked(readContext).mockReturnValue({ memory: '', retro: '', debt: '', patterns: [] } as any);
    vi.mocked(planSprint).mockReturnValue(makeSprint() as any);
    vi.mocked(runSprint).mockResolvedValue(makeSprint() as any);
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it('registers a --force-prompt-gate option on the start command', () => {
    const program = new Command();
    registerStart(program);
    const startCmd = program.commands.find((c) => c.name() === 'start');
    expect(startCmd).toBeDefined();
    const opt = startCmd!.options.find((o) => o.long === '--force-prompt-gate');
    expect(opt).toBeDefined();
  });

  it('omitting --force-prompt-gate threads acknowledgePromptGate: false into runSprint()', async () => {
    await runStart();

    expect(runSprint).toHaveBeenCalledWith(
      expect.any(String),
      expect.anything(),
      expect.objectContaining({ acknowledgePromptGate: false }),
    );
  });

  it('--force-prompt-gate threads acknowledgePromptGate: true into runSprint()', async () => {
    await runStart(['--force-prompt-gate']);

    expect(runSprint).toHaveBeenCalledWith(
      expect.any(String),
      expect.anything(),
      expect.objectContaining({ acknowledgePromptGate: true }),
    );
  });

  it('--force-prompt-gate is independent of --force-scope — both can be set together', async () => {
    await runStart(['--force-prompt-gate', '--force-scope']);

    expect(runSprint).toHaveBeenCalledWith(
      expect.any(String),
      expect.anything(),
      expect.objectContaining({ acknowledgePromptGate: true, acknowledgeScopePaths: true }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. MCP — `deckent_start` acknowledgePromptGate → IPC config.json
// ─────────────────────────────────────────────────────────────────────────

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

const MCP_MOCK_CONFIG = {
  mode: 'max_plan',
  activeModeConfig: { max_workers: 4, brain_model: 'claude-opus-4-8', default_model: 'claude-sonnet-5', haiku_allowed: false },
  modes: {},
  language: 'en',
  projectName: 'test-403-002',
  projectRoot: '/tmp/test',
  version: '0.1.0',
};

async function getStartTool() {
  const { registerStartTool } = await import('../../src/mcp/tools/start.js');
  const server = createMockServer();
  registerStartTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
  const tool = server.tools.get('deckent_start');
  expect(tool).toBeDefined();
  return tool!;
}

/** Find the IPC config.json write among all mocked writeFileSync calls and parse it. */
function readWrittenIpcConfig(): Record<string, unknown> | undefined {
  const calls = vi.mocked(writeFileSync).mock.calls;
  const call = calls.find(([path]) => typeof path === 'string' && path.endsWith('config.json'));
  if (!call) return undefined;
  return JSON.parse(call[1] as string) as Record<string, unknown>;
}

describe('deckent_start MCP — acknowledgePromptGate → IPC config.json (task-403-002, born-628)', () => {
  // born-480 hermetic run-state pattern (see tests/mcp/tools/start.test.ts):
  // redirect process.cwd() to a fresh, empty tmpdir per test so isSprintLocked()
  // / cleanOrphanIpcDirs() never touch this repo's real .deckent/ state.
  let sandboxRoot = '';
  let cwdSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadConfig).mockResolvedValue(MCP_MOCK_CONFIG as any);
    sandboxRoot = mkdtempSync(join(tmpdir(), 'deckent-prompt-gate-flag-test-'));
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(sandboxRoot);
  });

  afterEach(async () => {
    cwdSpy.mockRestore();
    await rm(sandboxRoot, { recursive: true, force: true });
  });

  it('registers deckent_start with an inputSchema (acknowledgePromptGate included)', async () => {
    const tool = await getStartTool();
    expect(tool.config).toHaveProperty('inputSchema');
  });

  it('omitting acknowledgePromptGate writes acknowledgePromptGate: false into the IPC config.json', async () => {
    const tool = await getStartTool();
    await tool.handler({ force: true });

    const cfg = readWrittenIpcConfig();
    expect(cfg).toBeDefined();
    expect(cfg!.acknowledgePromptGate).toBe(false);
  });

  it('acknowledgePromptGate: true is threaded into the IPC config.json for the forked runner', async () => {
    const tool = await getStartTool();
    await tool.handler({ force: true, acknowledgePromptGate: true });

    const cfg = readWrittenIpcConfig();
    expect(cfg).toBeDefined();
    expect(cfg!.acknowledgePromptGate).toBe(true);
  });

  it('acknowledgeScopePaths and acknowledgePromptGate are threaded independently', async () => {
    const tool = await getStartTool();
    await tool.handler({ force: true, acknowledgeScopePaths: true, acknowledgePromptGate: false });

    const cfg = readWrittenIpcConfig();
    expect(cfg).toBeDefined();
    expect(cfg!.acknowledgeScopePaths).toBe(true);
    expect(cfg!.acknowledgePromptGate).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. Composition pins — source-assert the real call sites exist
// ─────────────────────────────────────────────────────────────────────────

describe('composition pin — CLI start.ts wires --force-prompt-gate into RunSprintOptions', () => {
  const src = readFileSync(join(REPO, 'src', 'cli', 'commands', 'start.ts'), 'utf-8');

  it('declares --force-prompt-gate as a commander option (mirrors --force-scope)', () => {
    expect(src).toContain("'--force-prompt-gate'");
  });

  it('StartCommandOpts declares forcePromptGate?: boolean', () => {
    const optsBlock = src.slice(src.indexOf('interface StartCommandOpts'), src.indexOf('interface StartCommandOpts') + 500);
    expect(optsBlock).toContain('forcePromptGate?: boolean');
  });

  it('runSprint() call includes acknowledgePromptGate: opts.forcePromptGate === true — call-site pin', () => {
    expect(src).toContain('acknowledgePromptGate: opts.forcePromptGate === true');
  });

  it('the acknowledgePromptGate line sits in the same runSprint() options object as acknowledgeScopePaths', () => {
    const scopeIdx = src.indexOf('acknowledgeScopePaths: opts.forceScope === true');
    const gateIdx = src.indexOf('acknowledgePromptGate: opts.forcePromptGate === true');
    expect(scopeIdx).toBeGreaterThan(-1);
    expect(gateIdx).toBeGreaterThan(scopeIdx);
    expect(gateIdx - scopeIdx).toBeLessThan(400);
  });
});

describe('composition pin — MCP start.ts declares + threads acknowledgePromptGate', () => {
  const src = readFileSync(join(REPO, 'src', 'mcp', 'tools', 'start.ts'), 'utf-8');

  it('inputSchema declares acknowledgePromptGate as an optional boolean (default false)', () => {
    expect(src).toContain('acknowledgePromptGate: z.boolean().optional().default(false)');
  });

  it('the acknowledgePromptGate schema field sits next to acknowledgeScopePaths', () => {
    const scopeIdx = src.indexOf('acknowledgeScopePaths: z.boolean()');
    const gateIdx = src.indexOf('acknowledgePromptGate: z.boolean()');
    expect(scopeIdx).toBeGreaterThan(-1);
    expect(gateIdx).toBeGreaterThan(scopeIdx);
    expect(gateIdx - scopeIdx).toBeLessThan(500);
  });

  it('the handler destructures acknowledgePromptGate from its input', () => {
    expect(src).toContain('acknowledgeScopePaths, acknowledgePromptGate, dryRun');
  });

  it('acknowledgePromptGate is threaded into runnerConfig (IPC config boundary)', () => {
    expect(src).toContain('acknowledgePromptGate: acknowledgePromptGate === true');
  });
});
