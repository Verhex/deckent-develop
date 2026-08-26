import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  runTscSettlementGate,
  type TscSettlementRunner,
} from '../../src/orchestra/sprint-finalizer.js';

describe('tsc settlement gate', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'tsc-settlement-'));
    writeFileSync(join(root, 'tsconfig.json'), '{}\n');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  it('returns a bounded dirty residual for compiler errors', async () => {
    const errors = Array.from({ length: 30 }, (_, index) => `file.ts(${index + 1},1): error TS1`);
    const runner: TscSettlementRunner = vi.fn(async () => ({
      exitCode: 2,
      stdout: errors.join('\n'),
      stderr: '',
    }));

    const result = await runTscSettlementGate(root, true, runner);

    expect(result).toMatchObject({ kind: 'residual', code: 'TSC_DIRTY_RESIDUAL' });
    expect(result.kind === 'residual' ? result.errors : []).toHaveLength(20);
  });

  it('preserves clean completion truth', async () => {
    const runner: TscSettlementRunner = vi.fn(async () => ({ exitCode: 0, stdout: '', stderr: '' }));

    await expect(runTscSettlementGate(root, true, runner)).resolves.toEqual({ kind: 'pass' });
  });

  it('does not invoke the runner when disabled', async () => {
    const runner: TscSettlementRunner = vi.fn();

    await expect(runTscSettlementGate(root, false, runner)).resolves.toEqual({
      kind: 'skip', reason: 'disabled',
    });
    expect(runner).not.toHaveBeenCalled();
  });

  it('records runner faults as an honest residual', async () => {
    const runner: TscSettlementRunner = vi.fn(async () => { throw new Error('spawn denied'); });

    await expect(runTscSettlementGate(root, true, runner)).resolves.toEqual({
      kind: 'residual', code: 'TSC_GATE_FAULT', errors: ['spawn denied'],
    });
  });
});
