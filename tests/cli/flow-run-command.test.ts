import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
  formatTable: vi.fn(),
}));

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/root'),
}));

vi.mock('../../src/core/scheduled-flow.js', () => ({
  parseCronExpr: vi.fn(),
}));

const mockTick = vi.fn();
const mockStart = vi.fn();
const mockStop = vi.fn();

vi.mock('../../src/core/flow-registry.js', () => ({
  FlowRegistry: vi.fn().mockImplementation(() => ({
    addFlow: vi.fn(),
    listFlows: vi.fn().mockReturnValue([]),
  })),
}));

vi.mock('../../src/core/flow-runtime.js', () => ({
  FlowRuntime: vi.fn().mockImplementation(() => ({
    tick: mockTick,
    start: mockStart,
    stop: mockStop,
    running: false,
  })),
}));

import { print } from '../../src/cli/helpers/output.js';
import { registerFlow } from '../../src/cli/commands/flow.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function buildProgram(): Command {
  const program = new Command().exitOverride();
  registerFlow(program);
  return program;
}

async function run(...args: string[]): Promise<void> {
  const program = buildProgram();
  await program.parseAsync(['node', 'deckent', ...args]);
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('deckent flow run', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTick.mockImplementation((cb: (d: unknown[]) => void) => cb([]));
    mockStart.mockImplementation(() => {});
    mockStop.mockImplementation(() => {});
  });

  it('calls tick once when --once flag is provided', async () => {
    await run('flow', 'run', '--once');
    expect(mockTick).toHaveBeenCalledOnce();
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('starts daemon when --once is not set', async () => {
    await run('flow', 'run');
    expect(mockStart).toHaveBeenCalledOnce();
    expect(print).toHaveBeenCalledWith(expect.stringContaining('daemon'));
  });

  it('prints no-flows message when registry is empty (--once)', async () => {
    mockTick.mockImplementation((cb: (d: unknown[]) => void) => cb([]));
    await run('flow', 'run', '--once');
    expect(print).toHaveBeenCalledWith('No flows due.');
  });

  it('prints dispatch count when flows are due (--once)', async () => {
    mockTick.mockImplementation((cb: (d: unknown[]) => void) => cb([{}, {}]));
    await run('flow', 'run', '--once');
    expect(print).toHaveBeenCalledWith(expect.stringContaining('2 flow(s) dispatched'));
  });
});
