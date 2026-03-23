import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

vi.mock('../../src/core/utils.js', () => ({
  countBrainLines: vi.fn().mockReturnValue(100),
  ensureDeckentImport: vi.fn(),
}));

vi.mock('../../src/core/system-profile.js', () => ({
  getSystemProfile: vi.fn().mockReturnValue({
    cpuCores: 8,
    totalMemMB: 16384,
    freeMemMB: 8192,
    recommendedMaxWorkers: 4,
  }),
}));

vi.mock('../../src/core/subscription.js', () => ({
  detectSubscription: vi.fn().mockReturnValue({
    detected: 'max',
    opusAvailable: true,
    testedAt: '2026-03-18T00:00:00.000Z',
    method: 'opus_probe',
  }),
  checkModeCompatibility: vi.fn(),
  saveSubscriptionToConfig: vi.fn(),
}));

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/tmp/test-project'),
}));

// ─── Static Imports ─────────────────────────────────────────────────

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { getSystemProfile } from '../../src/core/system-profile.js';
import { detectSubscription } from '../../src/core/subscription.js';
import { registerDoctor, formatSystemProfile, runDoctorChecks } from '../../src/cli/commands/doctor.js';

// ─── Helpers ────────────────────────────────────────────────────────

let stdoutData: string[];
let stdoutSpy: ReturnType<typeof vi.spyOn>;

function captureOutput(): void {
  stdoutData = [];
  stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((data) => {
    stdoutData.push(String(data));
    return true;
  });
}

function restoreOutput(): void {
  stdoutSpy?.mockRestore();
}

function stdout(): string {
  return stdoutData.join('');
}

function setupPassingSpawnSync(): void {
  vi.mocked(spawnSync).mockImplementation((cmd: string) => {
    const outputs: Record<string, string> = {
      node: 'v22.0.0',
      git: 'git version 2.44.0',
      tmux: 'tmux 3.4',
      claude: '1.0.0',
    };
    return {
      status: 0,
      stdout: outputs[cmd] ?? '1.0.0',
      stderr: '',
      pid: 1,
      output: [],
      signal: null,
    } as ReturnType<typeof spawnSync>;
  });
}

async function runCommand(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerDoctor(program);
  try {
    await program.parseAsync(['node', 'test', ...args]);
  } catch (err) {
    if (err instanceof Error && err.message.includes('commander.')) {
      // expected
    }
  }
}

// ─── formatSystemProfile ─────────────────────────────────────────────

describe('formatSystemProfile', () => {
  it('contains CPU, RAM, and Workers info', () => {
    const profile = { cpuCores: 8, totalMemMB: 16384, freeMemMB: 8192, recommendedMaxWorkers: 4 };
    const output = formatSystemProfile(profile);
    expect(output).toContain('CPU: 8 cores');
    expect(output).toContain('RAM: 16.0 GB');
    expect(output).toContain('8.0 GB free');
    expect(output).toContain('Workers: 4');
  });

  it('includes subscription when provided', () => {
    const profile = { cpuCores: 4, totalMemMB: 8192, freeMemMB: 4096, recommendedMaxWorkers: 2 };
    const output = formatSystemProfile(profile, 'max');
    expect(output).toContain('Subscription: max');
  });

  it('omits subscription line when not provided', () => {
    const profile = { cpuCores: 4, totalMemMB: 8192, freeMemMB: 4096, recommendedMaxWorkers: 2 };
    const output = formatSystemProfile(profile);
    expect(output).not.toContain('Subscription:');
  });

  it('uses box-drawing characters', () => {
    const profile = { cpuCores: 2, totalMemMB: 4096, freeMemMB: 2048, recommendedMaxWorkers: 1 };
    const output = formatSystemProfile(profile);
    expect(output).toContain('╔');
    expect(output).toContain('╗');
    expect(output).toContain('║');
    expect(output).toContain('╚');
    expect(output).toContain('╝');
  });

  it('shows System Profile title', () => {
    const profile = { cpuCores: 4, totalMemMB: 8192, freeMemMB: 4096, recommendedMaxWorkers: 2 };
    const output = formatSystemProfile(profile);
    expect(output).toContain('System Profile');
  });

  it('correctly converts MB to GB', () => {
    const profile = { cpuCores: 4, totalMemMB: 32768, freeMemMB: 16384, recommendedMaxWorkers: 3 };
    const output = formatSystemProfile(profile, 'pro');
    expect(output).toContain('RAM: 32.0 GB');
    expect(output).toContain('16.0 GB free');
  });
});

// ─── doctor --profile flag ───────────────────────────────────────────

describe('doctor --profile flag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captureOutput();
    process.exitCode = undefined;
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('# Content\nSome data');
    vi.mocked(readdirSync).mockReturnValue([] as unknown as ReturnType<typeof readdirSync>);
    setupPassingSpawnSync();
  });

  afterEach(() => {
    restoreOutput();
    process.exitCode = undefined;
  });

  it('--profile flag is registered in commander', async () => {
    const program = new Command();
    program.exitOverride();
    registerDoctor(program);
    const doctorCmd = program.commands.find(c => c.name() === 'doctor');
    expect(doctorCmd).toBeDefined();
    const profileOpt = doctorCmd!.options.find(o => o.long === '--profile');
    expect(profileOpt).toBeDefined();
    expect(profileOpt!.description).toContain('system profile');
  });

  it('without --profile: system profile not shown', async () => {
    await runCommand(['doctor']);
    expect(getSystemProfile).not.toHaveBeenCalled();
    expect(detectSubscription).not.toHaveBeenCalled();
    expect(stdout()).not.toContain('System Profile');
  });

  it('with --profile: system profile is shown', async () => {
    await runCommand(['doctor', '--profile']);
    expect(getSystemProfile).toHaveBeenCalled();
    expect(stdout()).toContain('System Profile');
    expect(stdout()).toContain('CPU: 8 cores');
  });

  it('with --profile: subscription info is shown', async () => {
    await runCommand(['doctor', '--profile']);
    expect(detectSubscription).toHaveBeenCalled();
    expect(stdout()).toContain('Subscription: max');
  });

  it('with --profile: normal doctor checks still appear', async () => {
    await runCommand(['doctor', '--profile']);
    const out = stdout();
    // Human-friendly format contains section headers
    expect(out).toContain('Deckent Health Check');
  });

  it('without --profile: normal doctor output is unchanged', async () => {
    await runCommand(['doctor']);
    const out = stdout();
    expect(out).toContain('Deckent Health Check');
    expect(out).not.toContain('╔');
  });
});

// ─── MCP doctor tool includeProfile ──────────────────────────────────

describe('MCP deckent_doctor includeProfile', () => {
  type ToolHandler = (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }> }>;

  interface MockServer {
    tools: Map<string, { config: unknown; handler: ToolHandler }>;
    registerTool: (name: string, config: unknown, handler: ToolHandler) => void;
  }

  function createMockServer(): MockServer {
    const tools = new Map<string, { config: unknown; handler: ToolHandler }>();
    return {
      tools,
      registerTool(name: string, config: unknown, handler: ToolHandler) {
        tools.set(name, { config, handler });
      },
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('# Content\n');
    vi.mocked(readdirSync).mockReturnValue([]);
    vi.mocked(spawnSync).mockReturnValue({
      status: 0, stdout: 'v22.0.0', stderr: '', pid: 1, output: [], signal: null,
    } as ReturnType<typeof spawnSync>);
  });

  it('includeProfile=true → systemProfile field present', async () => {
    const { registerDoctorTool } = await import('../../src/mcp/tools/doctor.js');
    const mock = createMockServer();
    registerDoctorTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

    const result = await mock.tools.get('deckent_doctor')!.handler({ includeProfile: true });
    const parsed = JSON.parse(result.content[0]!.text);

    expect(parsed).toHaveProperty('systemProfile');
    expect(parsed.systemProfile).toHaveProperty('cpuCores');
    expect(parsed.systemProfile).toHaveProperty('totalMemMB');
    expect(parsed.systemProfile).toHaveProperty('freeMemMB');
    expect(parsed.systemProfile).toHaveProperty('recommendedMaxWorkers');
    expect(parsed.systemProfile).toHaveProperty('subscription');
  });

  it('includeProfile=false → no systemProfile field', async () => {
    const { registerDoctorTool } = await import('../../src/mcp/tools/doctor.js');
    const mock = createMockServer();
    registerDoctorTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

    const result = await mock.tools.get('deckent_doctor')!.handler({ includeProfile: false });
    const parsed = JSON.parse(result.content[0]!.text);

    expect(parsed).not.toHaveProperty('systemProfile');
  });

  it('includeProfile omitted → no systemProfile field (defaults to false)', async () => {
    const { registerDoctorTool } = await import('../../src/mcp/tools/doctor.js');
    const mock = createMockServer();
    registerDoctorTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

    const result = await mock.tools.get('deckent_doctor')!.handler({});
    const parsed = JSON.parse(result.content[0]!.text);

    expect(parsed).not.toHaveProperty('systemProfile');
  });

  it('includeProfile=true → systemProfile.subscription matches detected value', async () => {
    const { registerDoctorTool } = await import('../../src/mcp/tools/doctor.js');
    const mock = createMockServer();
    registerDoctorTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

    const result = await mock.tools.get('deckent_doctor')!.handler({ includeProfile: true });
    const parsed = JSON.parse(result.content[0]!.text);

    expect(parsed.systemProfile.subscription).toBe('max');
    expect(parsed.systemProfile.subscriptionMethod).toBe('opus_probe');
  });

  it('existing fields (ok, checks) are preserved with includeProfile=true', async () => {
    const { registerDoctorTool } = await import('../../src/mcp/tools/doctor.js');
    const mock = createMockServer();
    registerDoctorTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

    const result = await mock.tools.get('deckent_doctor')!.handler({ includeProfile: true });
    const parsed = JSON.parse(result.content[0]!.text);

    expect(parsed).toHaveProperty('ok');
    expect(parsed).toHaveProperty('checks');
    expect(Array.isArray(parsed.checks)).toBe(true);
  });

  it('existing fields (ok, checks) are preserved with includeProfile=false', async () => {
    const { registerDoctorTool } = await import('../../src/mcp/tools/doctor.js');
    const mock = createMockServer();
    registerDoctorTool(mock as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);

    const result = await mock.tools.get('deckent_doctor')!.handler({ includeProfile: false });
    const parsed = JSON.parse(result.content[0]!.text);

    expect(parsed).toHaveProperty('ok');
    expect(parsed).toHaveProperty('checks');
  });
});
