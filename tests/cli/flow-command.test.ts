import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
  formatTable: vi.fn((headers: string[], rows: string[][]) => `table:${headers.join(',')}:${rows.length}`),
}));

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/root'),
}));

const mockAddFlow = vi.fn();
const mockListFlows = vi.fn();

vi.mock('../../src/core/flow-registry.js', () => ({
  FlowRegistry: vi.fn().mockImplementation(() => ({
    addFlow: mockAddFlow,
    listFlows: mockListFlows,
  })),
}));

vi.mock('../../src/core/scheduled-flow.js', () => ({
  parseCronExpr: vi.fn((expr: string) => {
    if (expr === 'bad-cron') throw new Error('Invalid cron expression');
    const fields = expr.split(' ');
    return { minute: fields[0], hour: fields[1], dayOfMonth: fields[2], month: fields[3], dayOfWeek: fields[4] };
  }),
}));

import { print, printError } from '../../src/cli/helpers/output.js';
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

describe('deckent flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListFlows.mockReturnValue([]);
    mockAddFlow.mockReturnValue(undefined);
  });

  describe('list', () => {
    it('prints empty message when no flows found', async () => {
      mockListFlows.mockReturnValue([]);
      await run('flow', 'list');
      expect(print).toHaveBeenCalledWith(expect.stringContaining('No scheduled flows'));
    });

    it('prints table when flows exist', async () => {
      mockListFlows.mockReturnValue([
        { id: 'flow-1', cronExpr: '* * * * *', action: 'do-something', tenantId: 'default', enabled: true },
      ]);
      await run('flow', 'list');
      expect(print).toHaveBeenCalledWith(expect.stringContaining('table:'));
    });

    it('filters by tenant when --tenant option is provided', async () => {
      mockListFlows.mockReturnValue([]);
      await run('flow', 'list', '--tenant', 'acme');
      expect(mockListFlows).toHaveBeenCalledWith('acme');
    });

    it('outputs JSON when --json flag is set', async () => {
      mockListFlows.mockReturnValue([
        { id: 'flow-1', cronExpr: '0 * * * *', action: 'run-task', tenantId: 'default', enabled: true },
      ]);
      await run('flow', 'list', '--json');
      expect(print).toHaveBeenCalledWith(expect.stringContaining('"id"'));
    });
  });

  describe('add', () => {
    it('adds a flow with valid cron and action', async () => {
      await run('flow', 'add', '* * * * *', 'run-task');
      expect(mockAddFlow).toHaveBeenCalledWith(
        expect.objectContaining({
          cronExpr: '* * * * *',
          action: 'run-task',
          tenantId: 'default',
          enabled: true,
        }),
      );
      expect(print).toHaveBeenCalledWith(expect.stringContaining('added'));
    });

    it('uses custom tenant when --tenant option is provided', async () => {
      await run('flow', 'add', '0 * * * *', 'hourly-job', '--tenant', 'acme');
      expect(mockAddFlow).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'acme' }),
      );
    });

    it('reports error for invalid cron expression', async () => {
      await run('flow', 'add', 'bad-cron', 'some-action');
      expect(printError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Invalid cron') }));
    });
  });
});
