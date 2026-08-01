import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';

const mockFinalizeSprint = vi.fn();
const mockRunSprintRecoveryOperation = vi.fn();
const mockPrint = vi.fn();
const mockPrintError = vi.fn();

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  readdirSync: vi.fn().mockReturnValue(['task-482-002.json', 'task-482-002.result']),
  readFileSync: vi.fn().mockReturnValue(JSON.stringify({
    id: '482-002',
    sprintId: 'sprint-482',
    status: 'DONE',
  })),
}));
vi.mock('../../../src/orchestra/brain.js', () => ({
  finalizeSprint: (...args: unknown[]) => mockFinalizeSprint(...args),
}));
vi.mock('../../../src/orchestra/sprint-controller.js', () => ({
  evaluateResultSync: vi.fn(),
}));
vi.mock('../../../src/core/config.js', () => ({ loadConfig: vi.fn().mockResolvedValue({}) }));
vi.mock('../../../src/core/utils.js', () => ({
  debugLog: vi.fn(),
  readJsonSafe: (path: string) => path.endsWith('.result')
    ? { taskId: '482-002', selfAssessment: 'DONE' }
    : { id: '482-002', sprintId: 'sprint-482', status: 'DONE' },
}));
vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: (...args: unknown[]) => mockPrint(...args),
  printError: (...args: unknown[]) => mockPrintError(...args),
}));
vi.mock('../../../src/cli/commands/kill.js', () => ({ killSingle: vi.fn() }));
vi.mock('../../../src/cli/helpers/process.js', () => ({ resolveProjectRoot: () => '/fake/project' }));
vi.mock('../../../src/cli/helpers/config-reader.js', () => ({ getLangFromConfig: () => 'en' }));
vi.mock('../../../src/cli/commands/review.js', () => ({ loadReviewState: vi.fn().mockReturnValue(null) }));
vi.mock('../../../src/core/task-result-schema.js', () => ({ normalizeTaskResultShape: (result: unknown) => result }));
vi.mock('../../../src/orchestra/sprint-recovery-operation.js', () => ({
  readSprintRecoverySettlementIdentity: vi.fn().mockReturnValue({ generation: 1, fenceToken: 'fence' }),
  runSprintRecoveryOperation: (...args: unknown[]) => mockRunSprintRecoveryOperation(...args),
}));

import { registerFinalize } from '../../../src/cli/commands/finalize.js';

describe('deckent finalize recovery adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunSprintRecoveryOperation.mockRejectedValue(new Error('typed HOLD'));
  });

  it('does not finalize or print terminal completion when shared recovery holds', async () => {
    const program = new Command();
    program.exitOverride();
    registerFinalize(program);

    await program.parseAsync(['node', 'test', 'finalize', '--force', '--sprint', 'sprint-482']);

    expect(mockRunSprintRecoveryOperation).toHaveBeenCalledWith(
      '/fake/project',
      'sprint-482',
      expect.objectContaining({
        skipAudit: true,
        intent: 'FINALIZE_CONTAINMENT',
      }),
    );
    expect(mockFinalizeSprint).not.toHaveBeenCalled();
    expect(mockPrint).not.toHaveBeenCalledWith(expect.stringContaining('finalized:'));
    expect(mockPrintError).toHaveBeenCalled();
  });
});
