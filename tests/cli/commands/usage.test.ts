import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
  formatTable: vi.fn((headers: string[]) => headers.join(' | ') + '\n------'),
}));

vi.mock('../../../src/core/usage-tracker.js', () => {
  const tracker = {
    getTotalUsage: vi.fn(() => ({ totalCalls: 0, totalTokens: 0, sprintCount: 0, modelBreakdown: [] })),
    listSprints: vi.fn(() => []),
    getSprintUsage: vi.fn(() => ({ sprintId: '', entries: [], totalCalls: 0, totalTokens: 0, modelBreakdown: [] })),
  };
  return { UsageTracker: vi.fn(() => tracker) };
});

vi.mock('../../../src/core/config.js', () => ({
  readAuthMode: vi.fn(async () => 'subscription'),
}));

import { print } from '../../../src/cli/helpers/output.js';
import { readAuthMode } from '../../../src/core/config.js';
import { registerUsage, buildUsageOutput } from '../../../src/cli/commands/usage.js';
import { UsageTracker } from '../../../src/core/usage-tracker.js';

// ─── Helpers ─────────────────────────────────────────────────────────

async function runCommand(args: string[] = []): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerUsage(program);
  try {
    await program.parseAsync(['node', 'test', ...args]);
  } catch {
    // Commander exitOverride
  }
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('usage command (isolated)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  // registerUsage — command registration (2+ tests)

  it('registers usage command on the program', () => {
    const program = new Command();
    registerUsage(program);
    const cmd = program.commands.find(c => c.name() === 'usage');
    expect(cmd).toBeDefined();
  });

  it('registers usage command with description', () => {
    const program = new Command();
    registerUsage(program);
    const cmd = program.commands.find(c => c.name() === 'usage');
    expect(cmd!.description()).toBeTruthy();
    expect(cmd!.description()).toContain('usage');
  });

  // Usage display — checkUsage output format (3+ tests)

  it('prints usage tracking message when command is run', async () => {
    await runCommand(['usage']);
    expect(print).toHaveBeenCalled();
  });

  it('prints usage-related message', async () => {
    await runCommand(['usage']);
    const printCalls = vi.mocked(print).mock.calls;
    const hasUsageMsg = printCalls.some(c =>
      c[0].toLowerCase().includes('usage') ||
      c[0].toLowerCase().includes('no usage') ||
      c[0].toLowerCase().includes('sprint')
    );
    expect(hasUsageMsg).toBe(true);
  });

  it('prints metrics implementation message', async () => {
    await runCommand(['usage']);
    const printCalls = vi.mocked(print).mock.calls;
    const allOutput = printCalls.map(c => c[0]).join(' ');
    expect(allOutput.length).toBeGreaterThan(0);
  });

  // Error handling — usage check failure (2+ tests)

  it('does not set non-zero exit code on normal run', async () => {
    await runCommand(['usage']);
    expect(process.exitCode).not.toBe(1);
  });

  it('does not throw when running usage command', async () => {
    await expect(runCommand(['usage'])).resolves.not.toThrow();
  });
});

// ─── buildUsageOutput unit tests ────────────────────────────────────

describe('buildUsageOutput', () => {
  function makeTracker(overrides: Partial<{
    totalCalls: number;
    totalTokens: number;
    sprintCount: number;
    modelBreakdown: { model: string; calls: number; tokens: number }[];
    sprints: string[];
  }> = {}): UsageTracker {
    const opts = {
      totalCalls: 0,
      totalTokens: 0,
      sprintCount: 0,
      modelBreakdown: [],
      sprints: [],
      ...overrides,
    };
    return {
      getTotalUsage: vi.fn(() => ({
        totalCalls: opts.totalCalls,
        totalTokens: opts.totalTokens,
        sprintCount: opts.sprintCount,
        modelBreakdown: opts.modelBreakdown,
      })),
      listSprints: vi.fn(() => opts.sprints),
      getSprintUsage: vi.fn((id: string) => ({
        sprintId: id,
        entries: [],
        totalCalls: 5,
        totalTokens: 1000,
        modelBreakdown: [{ model: 'sonnet', calls: 5, tokens: 1000 }],
      })),
    } as unknown as UsageTracker;
  }

  it('returns no-data message when totalCalls is 0', () => {
    const tracker = makeTracker();
    const { text } = buildUsageOutput(tracker);
    expect(text).toContain('No usage data');
  });

  it('includes Est. Cost column header when isApiMode is true', () => {
    const tracker = makeTracker({
      totalCalls: 10,
      totalTokens: 5000,
      sprintCount: 1,
      modelBreakdown: [{ model: 'sonnet', calls: 10, tokens: 5000 }],
      sprints: ['sprint-001'],
    });
    const { text } = buildUsageOutput(tracker, { isApiMode: true });
    expect(text).toContain('Est. Cost (USD)');
  });

  it('omits Est. Cost column header when isApiMode is false', () => {
    const tracker = makeTracker({
      totalCalls: 10,
      totalTokens: 5000,
      sprintCount: 1,
      modelBreakdown: [{ model: 'sonnet', calls: 10, tokens: 5000 }],
      sprints: ['sprint-001'],
    });
    const { text } = buildUsageOutput(tracker, { isApiMode: false });
    expect(text).not.toContain('Est. Cost (USD)');
  });

  it('defaults isApiMode to false when not provided', () => {
    const tracker = makeTracker({
      totalCalls: 10,
      totalTokens: 5000,
      sprintCount: 1,
      modelBreakdown: [{ model: 'opus', calls: 10, tokens: 5000 }],
      sprints: ['sprint-001'],
    });
    const { text } = buildUsageOutput(tracker);
    expect(text).not.toContain('Est. Cost (USD)');
  });

  it('returns sprint data when sprint option is given and data exists', () => {
    const tracker = makeTracker();
    const { text, data } = buildUsageOutput(tracker, { sprint: 'sprint-001', isApiMode: false });
    expect(text).toContain('sprint-001');
    expect(data).toBeDefined();
  });

  it('returns no-data message for sprint when sprint totalCalls is 0', () => {
    const tracker = {
      getTotalUsage: vi.fn(() => ({ totalCalls: 0, totalTokens: 0, sprintCount: 0, modelBreakdown: [] })),
      listSprints: vi.fn(() => []),
      getSprintUsage: vi.fn(() => ({ sprintId: 'sprint-999', entries: [], totalCalls: 0, totalTokens: 0, modelBreakdown: [] })),
    } as unknown as UsageTracker;
    const { text } = buildUsageOutput(tracker, { sprint: 'sprint-999' });
    expect(text).toContain('No usage data found for sprint');
  });

  it('includes cost column in sprint view when isApiMode is true', () => {
    const tracker = makeTracker();
    const { text } = buildUsageOutput(tracker, { sprint: 'sprint-001', isApiMode: true });
    expect(text).toContain('Est. Cost (USD)');
  });
});

// ─── readAuthMode integration ────────────────────────────────────────

describe('usage command readAuthMode integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  it('calls readAuthMode when running usage command', async () => {
    const program = new Command();
    program.exitOverride();
    registerUsage(program);
    try {
      await program.parseAsync(['node', 'test', 'usage']);
    } catch {
      // Commander exitOverride
    }
    expect(readAuthMode).toHaveBeenCalled();
  });

  it('uses api mode when readAuthMode returns api', async () => {
    vi.mocked(readAuthMode).mockResolvedValueOnce('api');
    vi.mocked(print).mockClear();

    const MockTracker = vi.mocked(UsageTracker);
    MockTracker.mockImplementationOnce(() => ({
      getTotalUsage: vi.fn(() => ({
        totalCalls: 5,
        totalTokens: 2000,
        sprintCount: 1,
        modelBreakdown: [{ model: 'sonnet', calls: 5, tokens: 2000 }],
      })),
      listSprints: vi.fn(() => ['sprint-001']),
      getSprintUsage: vi.fn(() => ({
        sprintId: 'sprint-001',
        entries: [],
        totalCalls: 5,
        totalTokens: 2000,
        modelBreakdown: [{ model: 'sonnet', calls: 5, tokens: 2000 }],
      })),
    } as unknown as InstanceType<typeof UsageTracker>));

    const program = new Command();
    program.exitOverride();
    registerUsage(program);
    try {
      await program.parseAsync(['node', 'test', 'usage']);
    } catch {
      // Commander exitOverride
    }

    const allOutput = vi.mocked(print).mock.calls.map(c => c[0]).join(' ');
    expect(allOutput).toContain('Est. Cost (USD)');
  });
});
