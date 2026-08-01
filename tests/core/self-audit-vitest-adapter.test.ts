import { describe, expect, it, vi } from 'vitest';

import {
  SelfAuditAdapterRegistry,
  type SelfAuditProcessResult,
  type SelfAuditRequest,
} from '../../src/core/self-audit-adapter.js';
import { VitestSelfAuditAdapter } from '../../src/core/self-audit-vitest-adapter.js';

function request(overrides: Partial<SelfAuditRequest> = {}): SelfAuditRequest {
  return {
    ecosystem: 'vitest',
    projectRoot: '/project',
    scope: { kind: 'scoped', testFiles: ['tests/core/example.test.ts'] },
    timeoutMs: 5_000,
    ...overrides,
  };
}

function processResult(overrides: Partial<SelfAuditProcessResult> = {}): SelfAuditProcessResult {
  return {
    exitCode: 0,
    stdout: ' Test Files  1 passed (1)\n      Tests  3 passed (3)',
    stderr: '',
    timedOut: false,
    ...overrides,
  };
}

function registry(): SelfAuditAdapterRegistry {
  const value = new SelfAuditAdapterRegistry();
  value.register(new VitestSelfAuditAdapter(() => true));
  return value;
}

describe('VitestSelfAuditAdapter', () => {
  it('executes only explicitly scoped files through shell-free Vitest argv', async () => {
    const execute = vi.fn().mockResolvedValue(processResult());

    const result = await registry().run(request(), execute);

    expect(execute).toHaveBeenCalledWith({
      executable: 'npx',
      argv: ['vitest', 'run', 'tests/core/example.test.ts'],
      cwd: '/project',
      timeoutMs: 5_000,
      shell: false,
    });
    expect(result).toMatchObject({ kind: 'completed', outcome: 'passed' });
    if (result.kind !== 'completed') throw new Error('expected completed result');
    expect(result.evidence.executedUnits).toEqual(expect.arrayContaining([
      { kind: 'file', count: 1 },
      { kind: 'assertion', count: 3 },
    ]));
  });

  it('requires non-zero executed files and assertions even when Vitest exits zero', async () => {
    const result = await registry().run(
      request(),
      vi.fn().mockResolvedValue(processResult({
        stdout: ' Test Files  1 skipped (1)\n      Tests  3 skipped (3)',
      })),
    );

    expect(result).toMatchObject({ kind: 'hold', reason: 'missing-executed-evidence' });
  });

  it('preserves failed and skipped Vitest evidence without baseline comparisons', async () => {
    const result = await registry().run(
      request(),
      vi.fn().mockResolvedValue(processResult({
        exitCode: 1,
        stdout: ' Test Files  1 failed | 2 passed | 1 skipped (4)\n      Tests  2 failed | 5 passed | 3 skipped (10)',
      })),
    );

    expect(result).toMatchObject({
      kind: 'completed',
      outcome: 'failed',
      evidence: {
        exitCode: 1,
        executedUnits: [
          { kind: 'file', count: 3 },
          { kind: 'assertion', count: 7 },
          { kind: 'failed-file', count: 1 },
          { kind: 'failed-assertion', count: 2 },
          { kind: 'skipped-file', count: 1 },
          { kind: 'skipped-assertion', count: 3 },
        ],
      },
    });
    if (result.kind !== 'completed') throw new Error('expected completed result');
    expect(result.evidence.outputDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('preserves timeout as a fail-closed hold without accepting output evidence', async () => {
    const result = await registry().run(
      request(),
      vi.fn().mockResolvedValue(processResult({ timedOut: true })),
    );

    expect(result).toMatchObject({ kind: 'hold', reason: 'execution-timeout' });
  });

  it('rejects a full-suite request even when separate authority was granted', () => {
    const adapter = new VitestSelfAuditAdapter(() => true);

    expect(adapter.prepare(request({
      scope: { kind: 'full-suite', authority: { state: 'granted', authorityId: 'operator-approval:42' } },
    }))).toMatchObject({ kind: 'hold', reason: 'invalid-request' });
  });

  it('reports unavailable when capability detection fails', async () => {
    const unavailable = new SelfAuditAdapterRegistry();
    unavailable.register(new VitestSelfAuditAdapter(() => false));
    const execute = vi.fn();

    const result = await unavailable.run(request(), execute);

    expect(result).toMatchObject({ kind: 'hold', reason: 'adapter-unavailable' });
    expect(execute).not.toHaveBeenCalled();
  });
});
