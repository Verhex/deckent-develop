/**
 * tests/cli/commands/output.test.ts
 *
 * Tests for `npx deckent output <taskId>` command.
 * Covers: resolveOutputPath, readTailLines, formatLines, and CLI action.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockOutputMemStore = vi.hoisted(() => ({
  totalCount: vi.fn().mockReturnValue(0),
  close: vi.fn(),
}));

vi.mock('../../src/core/memory-store.js', () => ({
  MemoryStore: vi.fn().mockImplementation(() => mockOutputMemStore),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    readFileSync: vi.fn(),
    existsSync: vi.fn(),
    statSync: vi.fn(() => ({ isFile: () => true, isDirectory: () => false, size: 2, mtimeMs: 0 })),
    readdirSync: vi.fn(),
    renameSync: vi.fn(),
  };
});

vi.mock('../../src/cli/helpers/output.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/cli/helpers/output.js')>();
  return {
    ...actual,
    print: vi.fn(actual.print),
    printError: vi.fn(actual.printError),
  };
});

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/root'),
}));

vi.mock('../../src/monitor/sprint-state.js', () => ({
  getCurrentSprintId: vi.fn().mockReturnValue('sprint-139'),
}));

import { readFileSync, existsSync, statSync } from 'node:fs';
import { print } from '../../src/cli/helpers/output.js';
import {
  resolveOutputPath,
  readTailLines,
  formatLines,
  registerOutput,
} from '../../src/cli/commands/output.js';
import { getCurrentSprintId } from '../../src/monitor/sprint-state.js';
import { BRAIN_TOTAL_LINE_BUDGET } from '../../src/core/constants.js';
import { print as print__tsm_009, printError, formatProgressBar, formatTable, formatDashboard, formatDoctorResult, formatSprintSummary, formatAgentLabel, formatHumanStatus, isNoColor } from "../../src/cli/helpers/output.js";
import type { HumanStatusInput } from "../../src/cli/helpers/output.js";
import { AgentStatus, AlertLevel, SprintPhase, SprintStatus } from "../../src/core/types.js";
import type { DashboardState, DoctorResult, Sprint, AgentRole, Task } from "../../src/core/types.js";
import { ProviderConfigAliasConflictError } from "../../src/core/provider-config-canonicalizer.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function runCommand(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerOutput(program);
  try {
    await program.parseAsync(['node', 'test', ...args]);
  } catch {
    // Commander exitOverride
  }
}

// ─── resolveOutputPath ────────────────────────────────────────────────────────

describe('resolveOutputPath', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns file path when output file exists', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(getCurrentSprintId).mockReturnValue('sprint-139');

    const result = resolveOutputPath('/root', 'task-001');
    expect(result).toBe('/root/.deckent/sprint-139-outputs/task-task-001.out');
  });

  it('returns null when output file does not exist', () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const result = resolveOutputPath('/root', 'task-001');
    expect(result).toBeNull();
  });

  it('uses provided sprintId when given', () => {
    vi.mocked(existsSync).mockReturnValue(true);

    const result = resolveOutputPath('/root', 'task-001', 'sprint-100');
    expect(result).toContain('sprint-100-outputs');
    expect(result).toContain('task-task-001.out');
  });

  it('uses getCurrentSprintId when sprintId not given', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(getCurrentSprintId).mockReturnValue('sprint-999');

    const result = resolveOutputPath('/root', 'my-task');
    expect(result).toContain('sprint-999-outputs');
  });

  it('falls back to sprint-unknown when getCurrentSprintId returns null', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(getCurrentSprintId).mockReturnValue(null);

    const result = resolveOutputPath('/root', 'task-001');
    expect(result).toContain('sprint-unknown-outputs');
  });
});

// ─── readTailLines ────────────────────────────────────────────────────────────

describe('readTailLines', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns last N lines when file has more lines than N', () => {
    const content = Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n');
    vi.mocked(readFileSync).mockReturnValue(content);

    const result = readTailLines('/some/file.out', 10);
    expect(result).toHaveLength(10);
    expect(result[0]).toBe('line 90');
    expect(result[9]).toBe('line 99');
  });

  it('returns all lines when N > total lines', () => {
    vi.mocked(readFileSync).mockReturnValue('line 1\nline 2\nline 3');

    const result = readTailLines('/some/file.out', 50);
    expect(result).toHaveLength(3);
  });

  it('returns all lines when n <= 0', () => {
    vi.mocked(readFileSync).mockReturnValue('a\nb\nc\nd\ne');

    const result = readTailLines('/some/file.out', 0);
    expect(result).toHaveLength(5);
  });

  it('returns empty array when readFileSync throws', () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error('file not found');
    });

    const result = readTailLines('/nonexistent.out', 10);
    expect(result).toEqual([]);
  });
});

// ─── formatLines ─────────────────────────────────────────────────────────────

describe('formatLines', () => {
  it('joins lines with newline in plain mode', () => {
    const result = formatLines(['line1', 'line2', 'line3'], false);
    expect(result).toBe('line1\nline2\nline3');
  });

  it('wraps lines in JSON object when json=true', () => {
    const result = formatLines(['line1', 'line2'], true);
    const parsed = JSON.parse(result) as { lines: string[] };
    expect(parsed.lines).toEqual(['line1', 'line2']);
  });

  it('handles empty lines array', () => {
    expect(formatLines([], false)).toBe('');
    const json = formatLines([], true);
    expect(JSON.parse(json)).toEqual({ lines: [] });
  });
});

// ─── CLI action — no output file ─────────────────────────────────────────────

describe('output command — no file', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });
  afterEach(() => {
    process.exitCode = undefined;
  });

  it('prints "No output found" message when file does not exist', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(getCurrentSprintId).mockReturnValue('sprint-139');

    await runCommand(['output', 'task-001']);

    expect(vi.mocked(print)).toHaveBeenCalledWith(
      expect.stringContaining('No output found for task task-001'),
    );
    expect(process.exitCode).toBe(1);
  });
});

// ─── CLI action — file exists ─────────────────────────────────────────────────

describe('output command — file exists', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });
  afterEach(() => {
    process.exitCode = undefined;
  });

  it('reads and prints last 50 lines by default', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    const lines = Array.from({ length: 100 }, (_, i) => `[ts] [mixed] line ${i}`).join('\n');
    vi.mocked(readFileSync).mockReturnValue(lines);

    await runCommand(['output', 'task-001']);

    expect(vi.mocked(print)).toHaveBeenCalled();
    const callArg = vi.mocked(print).mock.calls[0]?.[0] ?? '';
    // Should contain last lines
    expect(callArg).toContain('line 99');
  });

  it('--tail N reads last N lines', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    const lines = Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n');
    vi.mocked(readFileSync).mockReturnValue(lines);

    await runCommand(['output', 'task-001', '--tail', '5']);

    const callArg = vi.mocked(print).mock.calls[0]?.[0] ?? '';
    expect(callArg).toContain('line 19');
    expect(callArg).not.toContain('line 0');
  });

  it('--json outputs JSON object with lines array', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('alpha\nbeta\ngamma');

    await runCommand(['output', 'task-001', '--json', '--tail', '10']);

    const callArg = vi.mocked(print).mock.calls[0]?.[0] ?? '';
    const parsed = JSON.parse(callArg) as { lines: string[] };
    expect(parsed.lines).toBeDefined();
    expect(Array.isArray(parsed.lines)).toBe(true);
  });

  it('--json includes read-only raw/effective receipt evidence and closes the projection', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockImplementation((path: any) =>
      String(path).endsWith('.json')
        ? JSON.stringify({ id: 'task-001', status: 'PENDING' })
        : 'alpha\nbeta');
    const close = vi.fn();
    const program = new Command();
    program.exitOverride();
    registerOutput(program, {
      resolveProjectRootFn: () => '/mock/root',
      openTaskSettlementProjection: () => ({
        projectId: 'project-test',
        diagnostic: 'ready',
        projectTaskExecutionState: (_taskId, rawStatus) => ({
          rawStatus,
          effectiveStatus: 'NO_GO',
          evidenceRefs: ['task-result:sha256:evidence'],
          receiptRef: {
            schemaVersion: 1,
            tenantId: 'local',
            projectId: 'project-test',
            invocationId: 'invocation-1',
          },
          reasonCode: 'projected',
        }),
        close,
      }),
    });

    await program.parseAsync([
      'node', 'test', 'output', 'task-001', '--json', '--tail', '10',
    ]);

    const parsed = JSON.parse(vi.mocked(print).mock.calls.at(-1)?.[0] ?? '{}');
    expect(parsed.lines).toEqual(['alpha', 'beta']);
    expect(parsed.settlement).toMatchObject({
      taskId: 'task-001',
      rawStatus: 'PENDING',
      effectiveStatus: 'NO_GO',
      receiptRef: { invocationId: 'invocation-1' },
      evidenceRefs: ['task-result:sha256:evidence'],
    });
    expect(close).toHaveBeenCalledOnce();
  });
});

// ─── registerOutput ───────────────────────────────────────────────────────────

describe('registerOutput', () => {
  it('registers output command with taskId argument', () => {
    const program = new Command();
    registerOutput(program);
    const cmd = program.commands.find(c => c.name() === 'output');
    expect(cmd).toBeDefined();
  });

  it('registers --tail option', () => {
    const program = new Command();
    registerOutput(program);
    const cmd = program.commands.find(c => c.name() === 'output');
    expect(cmd?.options.some(o => o.long === '--tail')).toBe(true);
  });

  it('registers --follow option', () => {
    const program = new Command();
    registerOutput(program);
    const cmd = program.commands.find(c => c.name() === 'output');
    expect(cmd?.options.some(o => o.long === '--follow')).toBe(true);
  });

  it('registers --json option', () => {
    const program = new Command();
    registerOutput(program);
    const cmd = program.commands.find(c => c.name() === 'output');
    expect(cmd?.options.some(o => o.long === '--json')).toBe(true);
  });
});

// TSM-009: physically merged from tests/cli/helpers/output.test.ts.
{
// countBrainLines removed — output.ts now uses MemoryStore
vi.mock("../../src/core/utils.js", () => ({}));

// ─── Helpers ─────────────────────────────────────────────────────────
function makeDashboard(overrides: Partial<DashboardState> = {}): DashboardState {
    return {
        sprint: {
            id: 'sprint-001',
            number: 1,
            phase: SprintPhase.EXECUTE,
            status: SprintStatus.ACTIVE,
        },
        agents: [],
        progress: { done: 2, active: 1, blocked: 0, total: 5 },
        alerts: [],
        updatedAt: '2026-03-20T10:00:00.000Z',
        ...overrides,
    };
}

function makeDoctorResult(overrides: Partial<DoctorResult> = {}): DoctorResult {
    return {
        ok: true,
        checks: [
            { name: 'tmux', passed: true, message: 'tmux 3.3a found', required: true },
            { name: 'git', passed: true, message: 'git 2.39 found', required: true },
        ],
        ...overrides,
    };
}

function makeSprint(overrides: Partial<Sprint> = {}): Sprint {
    return {
        id: 'sprint-001',
        number: 1,
        status: SprintStatus.COMPLETE,
        phase: SprintPhase.COMPLETE,
        tasks: [],
        workers: [],
        ...overrides,
    };
}

// ─── print ───────────────────────────────────────────────────────────
describe('print', () => {
    let writeSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
        writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    });
    afterEach(() => {
        writeSpy.mockRestore();
    });
    it('writes message + newline to stdout', () => {
        print__tsm_009('hello world');
        expect(writeSpy).toHaveBeenCalledWith('hello world\n');
    });
    it('writes empty string with newline', () => {
        print__tsm_009('');
        expect(writeSpy).toHaveBeenCalledWith('\n');
    });
    it('writes special characters correctly', () => {
        print__tsm_009('line1\ttabbed');
        expect(writeSpy).toHaveBeenCalledWith('line1\ttabbed\n');
    });
});

// ─── printError ──────────────────────────────────────────────────────
describe('printError', () => {
    let writeSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
        writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    });
    afterEach(() => {
        writeSpy.mockRestore();
    });
    it('writes Error instance message to stderr with prefix', () => {
        printError(new Error('something broke'));
        expect(writeSpy).toHaveBeenCalledWith('Error: something broke\n');
    });
    it('writes string error to stderr', () => {
        printError('plain string error');
        expect(writeSpy).toHaveBeenCalledWith('Error: plain string error\n');
    });
    it('writes non-Error object as string', () => {
        printError({ code: 404 });
        expect(writeSpy).toHaveBeenCalledWith('Error: [object Object]\n');
    });
    it('writes number error correctly', () => {
        printError(42);
        expect(writeSpy).toHaveBeenCalledWith('Error: 42\n');
    });
    it('renders provider alias conflicts through the localized CLI message map', () => {
        const previousLang = process.env['LANG'];
        process.env['LANG'] = 'tr_TR.UTF-8';
        try {
            printError(new ProviderConfigAliasConflictError({
                layer: 'project',
                slot: 'fallback',
                flatKey: 'fallback_provider',
                groupedKey: 'providers.fallback',
                flatValue: 'codex',
                groupedValue: 'claude',
            }));
            expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('çakışan provider ayarları'));
            expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('fallback_provider="codex"'));
        }
        finally {
            if (previousLang === undefined)
                delete process.env['LANG'];
            else
                process.env['LANG'] = previousLang;
        }
    });
});

// ─── formatProgressBar ───────────────────────────────────────────────
describe('formatProgressBar', () => {
    it('returns all dots for 0%', () => {
        expect(formatProgressBar(0, 8)).toBe('........');
    });
    it('returns all hashes for 100%', () => {
        expect(formatProgressBar(100, 8)).toBe('########');
    });
    it('returns half filled for 50%', () => {
        expect(formatProgressBar(50, 8)).toBe('####....');
    });
    it('uses default width of 8', () => {
        const bar = formatProgressBar(0);
        expect(bar).toHaveLength(8);
    });
    it('respects custom width', () => {
        const bar = formatProgressBar(50, 20);
        expect(bar).toHaveLength(20);
        expect(bar).toBe('##########..........');
    });
    it('clamps values below 0 to 0', () => {
        expect(formatProgressBar(-10, 8)).toBe('........');
    });
    it('clamps values above 100 to 100', () => {
        expect(formatProgressBar(150, 8)).toBe('########');
    });
    it('handles width of 1', () => {
        expect(formatProgressBar(0, 1)).toBe('.');
        expect(formatProgressBar(100, 1)).toBe('#');
    });
});

// ─── formatTable ─────────────────────────────────────────────────────
describe('formatTable', () => {
    it('renders headers and a single row', () => {
        const result = formatTable(['Name', 'Status'], [['alice', 'active']]);
        expect(result).toContain('Name');
        expect(result).toContain('Status');
        expect(result).toContain('alice');
        expect(result).toContain('active');
    });
    it('includes separator line', () => {
        const result = formatTable(['A', 'B'], [['x', 'y']]);
        expect(result).toContain('-');
    });
    it('aligns columns by widest cell', () => {
        const result = formatTable(['ID', 'Description'], [
            ['1', 'Short'],
            ['2', 'A very long description'],
        ]);
        const lines = result.split('\n');
        // Each line should have same length (padded)
        expect(lines[0]!.length).toBe(lines[2]!.length);
    });
    it('handles empty rows', () => {
        const result = formatTable(['Col1', 'Col2'], []);
        expect(result).toContain('Col1');
        expect(result).toContain('Col2');
        expect(result.split('\n')).toHaveLength(2); // header + separator
    });
    it('handles single column', () => {
        const result = formatTable(['Item'], [['apple'], ['banana']]);
        expect(result).toContain('apple');
        expect(result).toContain('banana');
    });
    it('handles missing cells gracefully', () => {
        const result = formatTable(['A', 'B', 'C'], [['only-a']]);
        expect(result).toContain('only-a');
    });
});

// ─── formatDashboard ─────────────────────────────────────────────────
describe('formatDashboard', () => {
    it('renders sprint number', () => {
        const state = makeDashboard({ sprint: { id: 'sprint-007', number: 7, phase: SprintPhase.EXECUTE, status: SprintStatus.ACTIVE } });
        const result = formatDashboard(state);
        expect(result).toContain('Sprint 7');
    });
    it('renders progress info', () => {
        const result = formatDashboard(makeDashboard());
        expect(result).toContain('2/5 done');
        expect(result).toContain('1 active');
    });
    it('renders alert count', () => {
        const state = makeDashboard({ alerts: [
                { level: AlertLevel.WARNING, message: 'test alert', timestamp: new Date().toISOString() }
            ] });
        const result = formatDashboard(state);
        expect(result).toContain('Alerts: 1');
    });
    it('includes unicode box-drawing characters', () => {
        const result = formatDashboard(makeDashboard());
        expect(result).toContain('╔');
        expect(result).toContain('╗');
        expect(result).toContain('╚');
        expect(result).toContain('╝');
    });
    it('renders agent info when agents present', () => {
        const state = makeDashboard({
            agents: [{
                    id: 'worker-1',
                    role: 'worker' as AgentRole,
                    status: AgentStatus.CODING,
                    model: 'sonnet',
                    tmuxWindow: 'w1',
                    currentAction: 'writing code',
                }],
        });
        const result = formatDashboard(state);
        expect(result).toContain('WORKER-1');
        expect(result).toContain('CODE');
    });
    it('shows DONE agent with full progress bar', () => {
        const state = makeDashboard({
            agents: [{
                    id: 'w2',
                    role: 'worker' as AgentRole,
                    status: AgentStatus.DONE,
                    model: 'sonnet',
                    tmuxWindow: 'w2',
                }],
        });
        const result = formatDashboard(state);
        expect(result).toContain('########');
    });
    it('shows IDLE agent with empty progress bar', () => {
        const state = makeDashboard({
            agents: [{
                    id: 'w3',
                    role: 'worker' as AgentRole,
                    status: AgentStatus.IDLE,
                    model: 'sonnet',
                    tmuxWindow: 'w3',
                }],
        });
        const result = formatDashboard(state);
        expect(result).toContain('........');
    });
    it('uses --:-- when updatedAt is missing', () => {
        const state = makeDashboard({ updatedAt: '' });
        const result = formatDashboard(state);
        expect(result).toContain('--:--');
    });
});

// ─── formatDoctorResult ──────────────────────────────────────────────
describe('formatDoctorResult', () => {
    it('shows checkmark for passed checks', () => {
        const result = formatDoctorResult(makeDoctorResult());
        expect(result).toContain('[PASS]');
    });
    it('shows cross for failed checks', () => {
        const result = formatDoctorResult(makeDoctorResult({
            ok: false,
            checks: [
                { name: 'tmux', passed: false, message: 'not found', required: true },
            ],
        }));
        expect(result).toContain('[FAIL]');
    });
    it('shows pass count in summary', () => {
        const result = formatDoctorResult(makeDoctorResult());
        expect(result).toContain('2/2 checks passed');
    });
    it('shows failure count when checks fail', () => {
        const result = formatDoctorResult(makeDoctorResult({
            ok: false,
            checks: [
                { name: 'tmux', passed: true, message: 'ok', required: true },
                { name: 'claude', passed: false, message: 'not found', required: true },
            ],
        }));
        expect(result).toContain('1 failed');
        expect(result).toContain('1/2 checks passed');
    });
    it('includes check name and message', () => {
        const result = formatDoctorResult(makeDoctorResult());
        expect(result).toContain('tmux');
        expect(result).toContain('tmux 3.3a found');
    });
    it('handles empty checks array', () => {
        const result = formatDoctorResult({ ok: true, checks: [] });
        expect(result).toContain('0/0 checks passed');
    });
});

// ─── formatSprintSummary ─────────────────────────────────────────────
describe('formatSprintSummary', () => {
    it('includes sprint number in title', () => {
        const result = formatSprintSummary(makeSprint());
        expect(result).toContain('Sprint 001 Complete!');
    });
    it('shows results summary with metrics', () => {
        const sprint = makeSprint({
            metrics: {
                totalTasks: 5,
                completedTasks: 4,
                techDebtTasks: 1,
                noGoTasks: 1,
                durationMs: 120000,
                coveragePercent: 87.5,
                noGoRate: 20,
                newDebtCount: 1,
                resolvedDebtCount: 0,
                totalOpenDebt: 2,
                boundaryViolations: 0,
                crossAssignments: 0,
                contextLinesUsed: 100,
            },
        });
        const result = formatSprintSummary(sprint);
        expect(result).toContain('4/5 tasks succeeded');
        expect(result).toContain('1 needs attention');
    });
    it('shows time duration', () => {
        const sprint = makeSprint({
            metrics: {
                totalTasks: 1,
                completedTasks: 1,
                techDebtTasks: 0,
                noGoTasks: 0,
                durationMs: 120000,
                coveragePercent: 90,
                noGoRate: 0,
                newDebtCount: 0,
                resolvedDebtCount: 0,
                totalOpenDebt: 0,
                boundaryViolations: 0,
                crossAssignments: 0,
                contextLinesUsed: 0,
            },
        });
        const result = formatSprintSummary(sprint);
        expect(result).toContain('2 minutes total');
    });
    it('includes next steps', () => {
        const result = formatSprintSummary(makeSprint());
        expect(result).toContain('Next steps:');
        expect(result).toContain('deckent retro');
    });
    it('shows what went well section when no boundary violations', () => {
        const sprint = makeSprint({
            metrics: {
                totalTasks: 1,
                completedTasks: 1,
                techDebtTasks: 0,
                noGoTasks: 0,
                durationMs: 60000,
                coveragePercent: 90,
                noGoRate: 0,
                newDebtCount: 0,
                resolvedDebtCount: 0,
                totalOpenDebt: 0,
                boundaryViolations: 0,
                crossAssignments: 0,
                contextLinesUsed: 0,
            },
        });
        const result = formatSprintSummary(sprint);
        expect(result).toContain('What went well:');
        expect(result).toContain('No boundary violations');
    });
    it('shows task count when no metrics', () => {
        const sprint = makeSprint({ tasks: [{} as unknown as Task, {} as unknown as Task], metrics: undefined });
        const result = formatSprintSummary(sprint);
        expect(result).toContain('2 tasks');
    });
});

// ─── formatAgentLabel ───────────────────────────────────────────────
describe('formatAgentLabel', () => {
    // R6-COLOR-HERMETIC: these assertions check literal ANSI codes emitted by
    // color(), which is gated by isNoColor() (NO_COLOR env / --no-color argv).
    // Own + restore both triggers explicitly — do not depend on the invoking
    // shell's NO_COLOR state (same pattern as the `isNoColor` describe below).
    const originalEnv = process.env.NO_COLOR;
    const originalArgv = [...process.argv];
    beforeEach(() => {
        delete process.env.NO_COLOR;
        process.argv = process.argv.filter((a) => a !== '--no-color');
    });
    afterEach(() => {
        if (originalEnv === undefined)
            delete process.env.NO_COLOR;
        else
            process.env.NO_COLOR = originalEnv;
        process.argv = [...originalArgv];
    });
    it('returns dim "generic" for undefined agent', () => {
        const label = formatAgentLabel(undefined);
        expect(label).toContain('generic');
        expect(label).toContain('\x1b[2m'); // dim ANSI code
    });
    it('returns dim "generic" for explicit generic value', () => {
        const label = formatAgentLabel('generic');
        expect(label).toContain('generic');
        expect(label).toContain('\x1b[2m');
    });
    it('returns cyan-highlighted label for specialized agent', () => {
        const label = formatAgentLabel('security-auditor');
        expect(label).toContain('security-auditor');
        expect(label).toContain('\x1b[36m'); // cyan ANSI code
    });
    it('returns cyan-highlighted label for test-writer agent', () => {
        const label = formatAgentLabel('test-writer');
        expect(label).toContain('test-writer');
        expect(label).toContain('\x1b[36m');
    });
    it('includes ANSI reset code', () => {
        const label = formatAgentLabel('any-agent');
        expect(label).toContain('\x1b[0m');
    });
});

// ─── formatDashboard agent column ───────────────────────────────────
describe('formatDashboard agent column', () => {
    // R6-COLOR-HERMETIC: see formatAgentLabel above — own + restore NO_COLOR/argv
    // rather than depending on the invoking shell for the two ANSI-code assertions.
    const originalEnv = process.env.NO_COLOR;
    const originalArgv = [...process.argv];
    beforeEach(() => {
        delete process.env.NO_COLOR;
        process.argv = process.argv.filter((a) => a !== '--no-color');
    });
    afterEach(() => {
        if (originalEnv === undefined)
            delete process.env.NO_COLOR;
        else
            process.env.NO_COLOR = originalEnv;
        process.argv = [...originalArgv];
    });
    it('shows agent label for worker with assignedAgent', () => {
        const state = makeDashboard({
            agents: [{
                    id: 'w1',
                    role: 'worker' as AgentRole,
                    status: AgentStatus.CODING,
                    model: 'sonnet',
                    tmuxWindow: 'w1',
                    assignedAgent: 'security-auditor',
                    currentAction: 'scanning',
                }],
        });
        const result = formatDashboard(state);
        expect(result).toContain('security-auditor');
    });
    it('shows generic label for worker without assignedAgent', () => {
        const state = makeDashboard({
            agents: [{
                    id: 'w2',
                    role: 'worker' as AgentRole,
                    status: AgentStatus.CODING,
                    model: 'sonnet',
                    tmuxWindow: 'w2',
                    currentAction: 'writing code',
                }],
        });
        const result = formatDashboard(state);
        expect(result).toContain('generic');
    });
    it('shows generic label for worker with explicit generic agent', () => {
        const state = makeDashboard({
            agents: [{
                    id: 'w3',
                    role: 'worker' as AgentRole,
                    status: AgentStatus.IDLE,
                    model: 'haiku',
                    tmuxWindow: 'w3',
                    assignedAgent: 'generic',
                }],
        });
        const result = formatDashboard(state);
        expect(result).toContain('generic');
    });
    it('uses cyan ANSI for specialized agent', () => {
        const state = makeDashboard({
            agents: [{
                    id: 'w4',
                    role: 'worker' as AgentRole,
                    status: AgentStatus.TESTING,
                    model: 'opus',
                    tmuxWindow: 'w4',
                    assignedAgent: 'test-writer',
                    currentAction: 'running tests',
                }],
        });
        const result = formatDashboard(state);
        expect(result).toContain('\x1b[36m'); // cyan
    });
    it('uses dim ANSI for generic agent', () => {
        const state = makeDashboard({
            agents: [{
                    id: 'w5',
                    role: 'worker' as AgentRole,
                    status: AgentStatus.IDLE,
                    model: 'sonnet',
                    tmuxWindow: 'w5',
                    assignedAgent: 'generic',
                }],
        });
        const result = formatDashboard(state);
        expect(result).toContain('\x1b[2m'); // dim
    });
});

// ─── formatHumanStatus helpers ───────────────────────────────────────
function makeTask(overrides: Partial<Task> = {}): Task {
    return {
        id: '001',
        title: 'Test task',
        description: '',
        model: 'sonnet',
        effort: 'normal',
        priority: 'NORMAL',
        reason: '',
        scope: { directories: [], filesRead: [], filesWrite: [] },
        dependencies: [],
        goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
        status: 'DONE',
        ...overrides,
    } as unknown as Task;
}

function makeHumanStatusInput(overrides: Partial<HumanStatusInput> = {}): HumanStatusInput {
    const now = Date.now();
    return {
        dashboard: makeDashboard({ updatedAt: new Date(now - 5000).toISOString() }),
        tasks: [],
        nowMs: now,
        ...overrides,
    };
}

// ─── formatHumanStatus — stale dashboard warning (B) ─────────────────
describe('formatHumanStatus — stale dashboard warning', () => {
    it('shows stale warning when dashboard data is older than 60 seconds', () => {
        const now = Date.now();
        const updatedAt = new Date(now - 90000).toISOString(); // 90 sec ago
        const input = makeHumanStatusInput({
            dashboard: makeDashboard({ updatedAt }),
            nowMs: now,
        });
        const result = formatHumanStatus(input);
        expect(result).toContain('Warning: Dashboard data is');
        expect(result).toContain('stale');
    });
    it('does not show stale warning when dashboard data is fresh', () => {
        const now = Date.now();
        const updatedAt = new Date(now - 10000).toISOString(); // 10 sec ago
        const input = makeHumanStatusInput({
            dashboard: makeDashboard({ updatedAt }),
            nowMs: now,
        });
        const result = formatHumanStatus(input);
        expect(result).not.toContain('stale');
    });
});

// ─── formatHumanStatus — budget check via countBrainLines (C) ────────
describe('formatHumanStatus — budget check via MemoryStore', () => {
    beforeEach(() => {
        vi.mocked(existsSync).mockImplementation((path) => String(path).includes('memory.db'));
        mockOutputMemStore.totalCount.mockReset();
    });
    it('shows Budget OK when entries are below warning zone', () => {
        mockOutputMemStore.totalCount.mockReturnValue(300);
        const input = makeHumanStatusInput({ projectRoot: '/fake/root', memoryBudget: 600 });
        const result = formatHumanStatus(input);
        expect(result).toContain('Budget: 300/600 lines (OK)');
    });
    it('resolves the budget from the canonical constants budget when input.memoryBudget is absent (owner finding 2026-08-27: no 600 literal)', () => {
        mockOutputMemStore.totalCount.mockReturnValue(300);
        const input = makeHumanStatusInput({ projectRoot: '/fake/root' });
        const result = formatHumanStatus(input);
        expect(result).toContain(`Budget: 300/${BRAIN_TOTAL_LINE_BUDGET} lines (OK)`);
        expect(result).not.toContain('/600');
    });
    it('shows Budget warning percentage when entries exceed 80% of max', () => {
        mockOutputMemStore.totalCount.mockReturnValue(500); // 500 > 480 (600 * 0.8)
        const input = makeHumanStatusInput({ projectRoot: '/fake/root', memoryBudget: 600 });
        const result = formatHumanStatus(input);
        expect(result).toContain('500/600 lines');
        expect(result).toMatch(/\d+%/);
    });
    it('shows Budget OVER with cleanup hint when entries exceed max', () => {
        mockOutputMemStore.totalCount.mockReturnValue(650); // 650 > 600
        const input = makeHumanStatusInput({ projectRoot: '/fake/root', memoryBudget: 600 });
        const result = formatHumanStatus(input);
        expect(result).toContain('OVER');
        expect(result).toContain('650/600 lines');
        expect(result).toContain('deckent cleanup --decay');
    });
    it('shows no Budget line when projectRoot is not set', () => {
        const input = makeHumanStatusInput({ projectRoot: undefined });
        const result = formatHumanStatus(input);
        expect(result).not.toContain('Budget:');
    });
    it('shows Budget unreadable (not a false OK) when the DB exists but cannot be read (R6)', () => {
        // A present-but-corrupt/locked DB used to be collapsed into 0 entries and
        // rendered "0/600 lines (OK)" — a false healthy signal over a broken store.
        mockOutputMemStore.totalCount.mockImplementation(() => {
            throw new Error('SQLITE_NOTADB: file is not a database');
        });
        const input = makeHumanStatusInput({ projectRoot: '/fake/root' });
        const result = formatHumanStatus(input);
        expect(result).toContain('unreadable');
        expect(result).not.toContain('(OK)');
    });
});

// ─── formatHumanStatus — alert detail (D) ────────────────────────────
describe('formatHumanStatus — alert detail', () => {
    it('shows CRITICAL alert with [!!] prefix and message text', () => {
        const input = makeHumanStatusInput({
            dashboard: makeDashboard({
                alerts: [{ level: AlertLevel.CRITICAL, message: 'critical issue detected', timestamp: new Date().toISOString() }],
            }),
        });
        const result = formatHumanStatus(input);
        expect(result).toContain('[!!]');
        expect(result).toContain('critical issue detected');
    });
    it('shows WARNING alert with [!] prefix and message text', () => {
        const input = makeHumanStatusInput({
            dashboard: makeDashboard({
                alerts: [{ level: AlertLevel.WARNING, message: 'stale heartbeat warning', timestamp: new Date().toISOString() }],
            }),
        });
        const result = formatHumanStatus(input);
        expect(result).toContain('[!]');
        expect(result).toContain('stale heartbeat warning');
    });
    it('shows INFO alert with [i] prefix and message text', () => {
        const input = makeHumanStatusInput({
            dashboard: makeDashboard({
                alerts: [{ level: AlertLevel.INFO, message: 'sprint phase changed', timestamp: new Date().toISOString() }],
            }),
        });
        const result = formatHumanStatus(input);
        expect(result).toContain('[i]');
        expect(result).toContain('sprint phase changed');
    });
    it('truncates alert list at 10 with overflow count message', () => {
        const alerts = Array.from({ length: 12 }, (_, i) => ({
            level: AlertLevel.WARNING,
            message: `alert-message-${i}`,
            timestamp: new Date().toISOString(),
        }));
        const input = makeHumanStatusInput({
            dashboard: makeDashboard({ alerts }),
        });
        const result = formatHumanStatus(input);
        expect(result).toContain('... and 2 more');
    });
    it('shows all alert messages when 10 or fewer alerts', () => {
        const alerts = Array.from({ length: 3 }, (_, i) => ({
            level: AlertLevel.WARNING,
            message: `msg-${i}`,
            timestamp: new Date().toISOString(),
        }));
        const input = makeHumanStatusInput({
            dashboard: makeDashboard({ alerts }),
        });
        const result = formatHumanStatus(input);
        expect(result).toContain('msg-0');
        expect(result).toContain('msg-1');
        expect(result).toContain('msg-2');
        expect(result).not.toContain('more');
    });
});

// ─── isNoColor — canonical superset SSOT (R4-ISNOCOLOR) ──────────────
// output.ts is the single source of truth; sprint-summary-rich.ts and
// dashboard.ts now import this. The signature is a SUPERSET of the three
// former divergent copies: it returns true for ANY of the three triggers.
describe('isNoColor — canonical superset', () => {
    const originalEnv = process.env.NO_COLOR;
    const originalArgv = [...process.argv];
    afterEach(() => {
        if (originalEnv === undefined)
            delete process.env.NO_COLOR;
        else
            process.env.NO_COLOR = originalEnv;
        process.argv = [...originalArgv];
    });
    it('returns false when no trigger is active', () => {
        delete process.env.NO_COLOR;
        process.argv = ['node', 'test'];
        expect(isNoColor()).toBe(false);
        expect(isNoColor(false)).toBe(false);
    });
    it('trigger 1 — returns true when flagValue is explicitly true', () => {
        delete process.env.NO_COLOR;
        process.argv = ['node', 'test'];
        expect(isNoColor(true)).toBe(true);
    });
    it('trigger 2 — returns true when NO_COLOR env is set', () => {
        process.env.NO_COLOR = '1';
        process.argv = ['node', 'test'];
        expect(isNoColor()).toBe(true);
    });
    it('trigger 3 — returns true when --no-color is in argv', () => {
        delete process.env.NO_COLOR;
        process.argv = ['node', 'test', '--no-color'];
        expect(isNoColor()).toBe(true);
    });
});
}
