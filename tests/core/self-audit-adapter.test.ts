import { describe, expect, it, vi } from 'vitest';
import {
  SelfAuditAdapterRegistry,
  type SelfAuditAdapter,
  type SelfAuditProcessResult,
  type SelfAuditRequest,
} from '../../src/core/self-audit-adapter.js';

function request(overrides: Partial<SelfAuditRequest> = {}): SelfAuditRequest {
  return {
    ecosystem: 'example-runner',
    projectRoot: '/project',
    scope: { kind: 'scoped', testFiles: ['tests/unit.example'] },
    timeoutMs: 5_000,
    ...overrides,
  };
}

function adapter(overrides: Partial<SelfAuditAdapter> = {}): SelfAuditAdapter {
  return {
    id: 'example-adapter',
    supports: (ecosystem) => ecosystem === 'example-runner',
    isAvailable: () => true,
    prepare: (input) => ({
      kind: 'ready',
      invocation: {
        executable: 'example-test',
        argv: input.scope.kind === 'scoped' ? [...input.scope.testFiles] : ['--all'],
        cwd: input.projectRoot,
        timeoutMs: input.timeoutMs,
      },
    }),
    collectEvidence: (_input, result) => ({
      kind: 'evidence',
      executedUnits: [{ kind: 'test', count: result.exitCode === null ? 0 : 3 }],
      outputDigest: 'sha256:observed-output',
    }),
    ...overrides,
  };
}

function processResult(overrides: Partial<SelfAuditProcessResult> = {}): SelfAuditProcessResult {
  return {
    exitCode: 0,
    stdout: '3 tests passed',
    stderr: '',
    timedOut: false,
    ...overrides,
  };
}

describe('SelfAuditAdapterRegistry', () => {
  it('executes a scoped adapter with argv and shell disabled, then returns executed evidence', async () => {
    const registry = new SelfAuditAdapterRegistry();
    registry.register(adapter());
    const execute = vi.fn().mockResolvedValue(processResult());

    const result = await registry.run(request(), execute);

    expect(execute).toHaveBeenCalledWith({
      executable: 'example-test',
      argv: ['tests/unit.example'],
      cwd: '/project',
      timeoutMs: 5_000,
      shell: false,
    });
    expect(result).toMatchObject({
      kind: 'completed',
      outcome: 'passed',
      evidence: {
        adapterId: 'example-adapter',
        exitCode: 0,
        executedUnits: [{ kind: 'test', count: 3 }],
      },
    });
  });

  it('returns typed unsupported without invoking a process when no ecosystem adapter exists', async () => {
    const execute = vi.fn();
    const result = await new SelfAuditAdapterRegistry().run(request({ ecosystem: 'unknown' }), execute);

    expect(result).toEqual({
      kind: 'unsupported',
      reason: 'unsupported-ecosystem',
      ecosystem: 'unknown',
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('fails closed as HOLD on timeout even when adapter evidence would claim execution', async () => {
    const registry = new SelfAuditAdapterRegistry();
    const collectEvidence = vi.fn(adapter().collectEvidence);
    registry.register(adapter({ collectEvidence }));

    const result = await registry.run(request(), vi.fn().mockResolvedValue(processResult({ timedOut: true })));

    expect(result).toMatchObject({ kind: 'hold', reason: 'execution-timeout' });
    expect(collectEvidence).not.toHaveBeenCalled();
  });

  it('rejects fake parity when an adapter reports no positive executed unit', async () => {
    const registry = new SelfAuditAdapterRegistry();
    registry.register(adapter({
      collectEvidence: () => ({
        kind: 'evidence',
        executedUnits: [{ kind: 'test', count: 0 }],
        outputDigest: 'sha256:empty-run',
      }),
    }));

    const result = await registry.run(request(), vi.fn().mockResolvedValue(processResult()));

    expect(result).toMatchObject({ kind: 'hold', reason: 'missing-executed-evidence' });
  });

  it('requires explicit separate authority before preparing or executing a full suite', async () => {
    const registry = new SelfAuditAdapterRegistry();
    const prepare = vi.fn(adapter().prepare);
    registry.register(adapter({ prepare }));
    const execute = vi.fn().mockResolvedValue(processResult());

    const denied = await registry.run(request({
      scope: { kind: 'full-suite', authority: { state: 'absent' } },
    }), execute);
    const granted = await registry.run(request({
      scope: {
        kind: 'full-suite',
        authority: { state: 'granted', authorityId: 'operator-approval:42' },
      },
    }), execute);

    expect(denied).toMatchObject({ kind: 'hold', reason: 'full-suite-authority-required' });
    expect(granted).toMatchObject({ kind: 'completed', outcome: 'passed' });
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('returns failed executed evidence for a non-zero exit instead of treating it as unsupported', async () => {
    const registry = new SelfAuditAdapterRegistry();
    registry.register(adapter());

    const result = await registry.run(
      request(),
      vi.fn().mockResolvedValue(processResult({ exitCode: 2, stderr: 'assertion failed' })),
    );

    expect(result).toMatchObject({
      kind: 'completed',
      outcome: 'failed',
      evidence: { exitCode: 2 },
    });
  });

  it('resolves the highest-priority matching capability adapter deterministically', async () => {
    const registry = new SelfAuditAdapterRegistry();
    registry.register(adapter({ id: 'fallback' }), 0);
    registry.register(adapter({ id: 'preferred' }), 10);

    const result = await registry.run(request(), vi.fn().mockResolvedValue(processResult()));

    expect(result).toMatchObject({ kind: 'completed', evidence: { adapterId: 'preferred' } });
    expect(registry.list().map(({ id }) => id)).toEqual(['preferred', 'fallback']);
  });
});
