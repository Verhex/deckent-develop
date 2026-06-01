import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerRbac, clearUserRoles, userRoles } from '../../src/cli/commands/rbac.js';

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

describe('deckent rbac grant/revoke', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearUserRoles();
    process.exitCode = undefined;
  });

  afterEach(() => {
    clearUserRoles();
    process.exitCode = undefined;
  });

  it('grant: assigns a valid role to a user → GRANTED + exit 0', async () => {
    await runRbac(['grant', 'alice', 'admin']);

    const printed = mockPrint.mock.calls.map((c: unknown[]) => c[0] as string).join('\n');
    expect(printed).toContain('GRANTED');
    expect(printed).toContain('alice');
    expect(printed).toContain('admin');
    expect(userRoles.get('alice')).toBe('admin');
    expect(process.exitCode).toBe(0);
  });

  it('revoke: removes an existing role assignment → REVOKED + exit 0', async () => {
    await runRbac(['grant', 'bob', 'operator']);
    expect(userRoles.get('bob')).toBe('operator');

    vi.clearAllMocks();
    await runRbac(['revoke', 'bob']);

    const printed = mockPrint.mock.calls.map((c: unknown[]) => c[0] as string).join('\n');
    expect(printed).toContain('REVOKED');
    expect(printed).toContain('bob');
    expect(userRoles.has('bob')).toBe(false);
    expect(process.exitCode).toBe(0);
  });

  it('grant: invalid role → error message + exit 1', async () => {
    await runRbac(['grant', 'charlie', 'superuser']);

    expect(mockPrintError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Unknown role') }),
    );
    expect(userRoles.has('charlie')).toBe(false);
    expect(process.exitCode).toBe(1);
  });

  it('revoke: no role assigned → WARN message + exit 0', async () => {
    await runRbac(['revoke', 'unknown-user']);

    const printed = mockPrint.mock.calls.map((c: unknown[]) => c[0] as string).join('\n');
    expect(printed).toContain('WARN');
    expect(printed).toContain('unknown-user');
    expect(process.exitCode).toBe(0);
  });
});
