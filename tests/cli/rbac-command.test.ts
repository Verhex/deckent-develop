import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerRbac } from '../../src/cli/commands/rbac.js';

// ─── Mocks ─────────────────────────────────────────────────────────────────────

const mockPrint = vi.fn();
const mockPrintError = vi.fn();

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: (...args: unknown[]) => mockPrint(...args),
  printError: (...args: unknown[]) => mockPrintError(...args),
}));

// ─── Helpers ───────────────────────────────────────────────────────────────────

async function runRbac(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerRbac(program);
  await program.parseAsync(['node', 'test', 'rbac', ...args]);
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('deckent rbac CLI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it('check: admin has admin permission → ALLOWED + exit 0', async () => {
    await runRbac(['check', 'admin', 'admin']);

    const printed = mockPrint.mock.calls.map((c: unknown[]) => c[0] as string).join('\n');
    expect(printed).toContain('ALLOWED');
    expect(printed).toContain('admin');
    expect(process.exitCode).toBe(0);
  });

  it('check: viewer does not have write permission → DENIED + exit 1', async () => {
    await runRbac(['check', 'viewer', 'write']);

    const printed = mockPrint.mock.calls.map((c: unknown[]) => c[0] as string).join('\n');
    expect(printed).toContain('DENIED');
    expect(process.exitCode).toBe(1);
  });

  it('roles: lists admin, operator, viewer', async () => {
    await runRbac(['roles']);

    const printed = mockPrint.mock.calls.map((c: unknown[]) => c[0] as string).join('\n');
    expect(printed).toContain('admin');
    expect(printed).toContain('operator');
    expect(printed).toContain('viewer');
  });

  it('check: invalid role → error message + exit 1', async () => {
    await runRbac(['check', 'superuser', 'read']);

    expect(mockPrintError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Unknown role') }),
    );
    expect(process.exitCode).toBe(1);
  });

  it('check: operator has sprint:read permission → ALLOWED', async () => {
    await runRbac(['check', 'operator', 'sprint:read']);

    const printed = mockPrint.mock.calls.map((c: unknown[]) => c[0] as string).join('\n');
    expect(printed).toContain('ALLOWED');
  });

  it('roles: shows permissions in output', async () => {
    await runRbac(['roles']);

    const printed = mockPrint.mock.calls.map((c: unknown[]) => c[0] as string).join('\n');
    expect(printed).toContain('read');
    expect(printed).toContain('Permissions');
  });
});
