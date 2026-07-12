import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// born-588: `deckent start` must return a non-zero exit code when a gate-blok
// (e.g. the pre-spawn scope-gate) throws a BrainError — a printed error message
// alone is dishonest for scripts/CI. See task-395-003.plan for the investigation.

vi.mock('../../src/core/config.js', () => ({
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

vi.mock('../../src/core/provider.js', () => ({
  bootstrapProviders: vi.fn().mockResolvedValue({ registered: [], skipped: [], defaultProvider: null }),
}));

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

import { loadConfig } from '../../src/core/config.js';
import { runSprint, readContext, planSprint, BrainError } from '../../src/orchestra/brain.js';
import { printError } from '../../src/cli/helpers/output.js';
import { registerStart } from '../../src/cli/commands/start.js';

function makeConfig() {
  return {
    activeModeConfig: { brain_model: 'opus', max_workers: 3 },
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

async function runStart(): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerStart(program);
  try {
    await program.parseAsync(['node', 'test', 'start']);
  } catch {
    // Commander exitOverride throws instead of process.exit — expected in tests.
  }
}

describe('deckent start — gate-blok exit-code honesty (born-588)', () => {
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

  it('sets exit code 1 when the pre-spawn scope gate blocks the sprint (BrainError from runSprint)', async () => {
    const BrainErrorClass = BrainError as unknown as new (message: string, phase?: string) => Error;
    const gateBlokMessage = 'Scope gate blocked sprint: task 395-003 filesWrite path '
      + '"src/orchestra/worker.ts" does not match any tracked file (looks like a typo).';
    vi.mocked(runSprint).mockRejectedValue(new BrainErrorClass(gateBlokMessage, 'PLAN'));

    await runStart();

    expect(process.exitCode).toBe(1);
    expect(printError).toHaveBeenCalledWith(
      expect.objectContaining({ message: `Sprint failed at phase PLAN: ${gateBlokMessage}` }),
    );
  });

  it('sets exit code 1 for a gate-blok BrainError with no explicit phase (falls back to "unknown")', async () => {
    const BrainErrorClass = BrainError as unknown as new (message: string, phase?: string) => Error;
    vi.mocked(runSprint).mockRejectedValue(new BrainErrorClass('DIRECTIVES.md path scope violation'));

    await runStart();

    expect(process.exitCode).toBe(1);
    expect(printError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Sprint failed at phase unknown: DIRECTIVES.md path scope violation' }),
    );
  });

  it('preserves exit code 0 (unset) on normal sprint completion — no over-firing', async () => {
    vi.mocked(runSprint).mockResolvedValue(makeSprint() as any);

    await runStart();

    expect(process.exitCode).not.toBe(1);
    expect(process.exitCode).toBeUndefined();
  });
});
