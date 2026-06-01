import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// ─── Mocks ─────────────────────────────────────────────────────────────────────

const mockQueryAudit = vi.fn();

vi.mock('../../src/core/audit-query.js', () => ({
  queryAudit: (...args: unknown[]) => mockQueryAudit(...args),
}));

vi.mock('../../src/orchestra/sprint-finalizer.js', () => ({
  runSelfAuditGate: vi.fn(),
}));

vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(true),
}));

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: () => '/fake/root',
}));

const mockPrint = vi.fn();
const mockPrintError = vi.fn();

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: (...args: unknown[]) => mockPrint(...args),
  printError: (...args: unknown[]) => mockPrintError(...args),
}));

import { registerAudit } from '../../src/cli/commands/audit.js';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function buildQueryResult(matched = 2) {
  return {
    sprintId: 'sprint-210',
    totalScanned: 10,
    matched: Array.from({ length: matched }, (_, i) => ({
      timestamp: `2026-05-31T0${i}:00:00.000Z`,
      sequence: i + 1,
      source: 'brain',
      target: 'worker',
      channel: 'DECKENT→AUDIT:EVENT_WRITTEN',
      tenantId: 'tenant1',
      payload: { action: 'task-start', tenantId: 'tenant1' },
    })),
  };
}

async function runAudit(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerAudit(program);
  await program.parseAsync(['node', 'test', 'audit', ...args]);
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('deckent audit query CLI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it('query: returns results and shows matched count', async () => {
    mockQueryAudit.mockReturnValue(buildQueryResult(3));

    await runAudit(['query', '--sprint', 'sprint-210']);

    expect(mockQueryAudit).toHaveBeenCalledWith(
      '/fake/root',
      'sprint-210',
      expect.objectContaining({}),
      undefined,
    );
    const printed = mockPrint.mock.calls.map((c: unknown[]) => c[0] as string).join('\n');
    expect(printed).toContain('Matched: 3');
    expect(printed).toContain('sprint-210');
    expect(process.exitCode).toBe(0);
  });

  it('query: tenant filter passes tenantId to queryAudit', async () => {
    mockQueryAudit.mockReturnValue(buildQueryResult(1));

    await runAudit(['query', '--sprint', 'sprint-210', '--tenant', 'acme-corp']);

    expect(mockQueryAudit).toHaveBeenCalledWith(
      '/fake/root',
      'sprint-210',
      expect.objectContaining({ tenantId: 'acme-corp' }),
      undefined,
    );
  });

  it('query: action filter passes channel to queryAudit', async () => {
    mockQueryAudit.mockReturnValue(buildQueryResult(1));

    await runAudit(['query', '--sprint', 'sprint-210', '--action', 'DECKENT→AUDIT:EVENT_WRITTEN']);

    expect(mockQueryAudit).toHaveBeenCalledWith(
      '/fake/root',
      'sprint-210',
      expect.objectContaining({ channel: 'DECKENT→AUDIT:EVENT_WRITTEN' }),
      undefined,
    );
  });

  it('query: since filter passes from timestamp to queryAudit', async () => {
    mockQueryAudit.mockReturnValue(buildQueryResult(0));

    await runAudit(['query', '--sprint', 'sprint-210', '--since', '2026-05-31T00:00:00.000Z']);

    expect(mockQueryAudit).toHaveBeenCalledWith(
      '/fake/root',
      'sprint-210',
      expect.objectContaining({ from: '2026-05-31T00:00:00.000Z' }),
      undefined,
    );
  });

  it('query: RBAC gate — role passed to queryAudit; invalid role returns 0 matched', async () => {
    // queryAudit returns empty when RBAC fails (fail-closed ADR-037)
    mockQueryAudit.mockReturnValue({
      sprintId: 'sprint-210',
      totalScanned: 5,
      matched: [],
    });

    await runAudit(['query', '--sprint', 'sprint-210', '--role', 'invalid-role', '--tenant', 'tenant1']);

    expect(mockQueryAudit).toHaveBeenCalledWith(
      '/fake/root',
      'sprint-210',
      expect.objectContaining({ tenantId: 'tenant1' }),
      'invalid-role',
    );
    const printed = mockPrint.mock.calls.map((c: unknown[]) => c[0] as string).join('\n');
    expect(printed).toContain('Matched: 0');
    expect(process.exitCode).toBe(0);
  });

  it('query: --json outputs raw JSON result', async () => {
    const result = buildQueryResult(2);
    mockQueryAudit.mockReturnValue(result);

    await runAudit(['query', '--sprint', 'sprint-210', '--json']);

    const jsonCalls = mockPrint.mock.calls.map((c: unknown[]) => c[0] as string).filter(s => s.includes('"sprintId"'));
    expect(jsonCalls.length).toBeGreaterThan(0);
    const parsed = JSON.parse(jsonCalls[0]);
    expect(parsed.sprintId).toBe('sprint-210');
    expect(parsed.matched).toHaveLength(2);
  });

  it('query: queryAudit error → printError called + exit 1', async () => {
    mockQueryAudit.mockImplementation(() => { throw new Error('DB read failure'); });

    await runAudit(['query', '--sprint', 'sprint-210']);

    expect(mockPrintError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'DB read failure' }),
    );
    expect(process.exitCode).toBe(1);
  });
});
