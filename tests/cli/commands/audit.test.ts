import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockRunSelfAuditGate = vi.fn();

vi.mock('../../../src/orchestra/sprint-finalizer.js', () => ({
  runSelfAuditGate: (...args: unknown[]) => mockRunSelfAuditGate(...args),
}));

vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(true),
}));

vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: () => '/fake/project',
}));

const mockPrint = vi.fn();
const mockPrintError = vi.fn();
vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: (...args: unknown[]) => mockPrint(...args),
  printError: (...args: unknown[]) => mockPrintError(...args),
}));

import { Command } from 'commander';
import { registerAudit } from '../../../src/cli/commands/audit.js';
import { writeFileSync } from 'node:fs';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildPassResult() {
  return {
    tsc: { status: 'PASS' as const, errors: [] },
    vitest: { status: 'PASS' as const, delta: { files: 2, pass: 10, fail: 0, skipped: 1 } },
    honesty: { violations: 0, flaggedTasks: [] },
    observability: { metricsJsonlExists: true, lineCount: 42 },
    overallGate: 'PASS' as const,
  };
}

function buildFailResult() {
  return {
    tsc: { status: 'FAIL' as const, errors: ['error TS2345: ...'] },
    vitest: { status: 'FAIL' as const, delta: { files: 0, pass: 0, fail: 3, skipped: 0 } },
    honesty: { violations: 1, flaggedTasks: ['task-150-001'] },
    observability: { metricsJsonlExists: false, lineCount: 0 },
    overallGate: 'GATE_FAILURE' as const,
  };
}

async function runCommand(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerAudit(program);
  await program.parseAsync(['node', 'test', 'audit', ...args]);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('deckent audit CLI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it('should output PASS gate and exit code 0', async () => {
    mockRunSelfAuditGate.mockResolvedValue(buildPassResult());

    await runCommand(['sprint-150']);

    expect(mockRunSelfAuditGate).toHaveBeenCalledWith('sprint-150', '/fake/project');
    expect(process.exitCode).toBe(0);
    expect(writeFileSync).toHaveBeenCalled();
    // Human-readable output includes gate result
    expect(mockPrint).toHaveBeenCalledWith(expect.stringContaining('PASS'));
  });

  it('should output GATE_FAILURE and exit code 1', async () => {
    mockRunSelfAuditGate.mockResolvedValue(buildFailResult());

    await runCommand(['sprint-150']);

    expect(process.exitCode).toBe(1);
    expect(mockPrint).toHaveBeenCalledWith(expect.stringContaining('GATE_FAILURE'));
  });

  it('should output raw JSON with --json flag', async () => {
    mockRunSelfAuditGate.mockResolvedValue(buildPassResult());

    await runCommand(['sprint-150', '--json']);

    // JSON output should include full result
    const jsonCalls = mockPrint.mock.calls.map(c => c[0]).filter((s: string) => s.includes('"overallGate"'));
    expect(jsonCalls.length).toBeGreaterThan(0);
    const parsed = JSON.parse(jsonCalls[0]);
    expect(parsed.overallGate).toBe('PASS');
    expect(parsed.tsc.status).toBe('PASS');
  });

  it('should write gate.json to .deckent/ directory', async () => {
    mockRunSelfAuditGate.mockResolvedValue(buildPassResult());

    await runCommand(['sprint-150']);

    expect(writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('sprint-150-gate.json'),
      expect.any(String),
      'utf-8',
    );
  });

  it('should display tsc errors count on failure', async () => {
    mockRunSelfAuditGate.mockResolvedValue(buildFailResult());

    await runCommand(['sprint-150']);

    expect(mockPrint).toHaveBeenCalledWith(expect.stringContaining('1 errors'));
  });

  it('should display honesty violations', async () => {
    mockRunSelfAuditGate.mockResolvedValue(buildFailResult());

    await runCommand(['sprint-150']);

    expect(mockPrint).toHaveBeenCalledWith(expect.stringContaining('1 violation'));
    expect(mockPrint).toHaveBeenCalledWith(expect.stringContaining('task-150-001'));
  });

  it('should display observability warning when metrics missing', async () => {
    const result = buildPassResult();
    result.observability = { metricsJsonlExists: false, lineCount: 0 };
    mockRunSelfAuditGate.mockResolvedValue(result);

    await runCommand(['sprint-150']);

    expect(mockPrint).toHaveBeenCalledWith(expect.stringContaining('WARNING'));
  });

  it('should handle runSelfAuditGate error gracefully', async () => {
    mockRunSelfAuditGate.mockRejectedValue(new Error('DB connection failed'));

    await runCommand(['sprint-150']);

    expect(process.exitCode).toBe(2);
    expect(mockPrintError).toHaveBeenCalled();
  });
});
