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

// MASTER 3356 P5 — a hold must still say what the process did.
//
// A self-audit that timed out or produced no usable evidence used to return a
// reason and a sentence, leaving nothing to compare against the next attempt.
// The run itself is the diagnostic, so it is now described — byte counts and a
// framed digest — without reproducing output that routinely carries paths and
// can carry credentials.
describe('self-audit hold process evidence', () => {
  const request = {
    ecosystem: 'node', projectRoot: '/tmp/p',
    scope: { kind: 'scoped' as const, testFiles: ['a.test.ts'] },
    timeoutMs: 1000,
  };

  function registryWith(decision: 'evidence' | 'hold') {
    const registry = new SelfAuditAdapterRegistry();
    registry.register({
      id: 'probe',
      supports: () => true,
      isAvailable: () => true,
      prepare: () => ({
        kind: 'ready',
        invocation: { executable: 'node', argv: ['x'], cwd: '/tmp/p', timeoutMs: 1000 },
      }),
      collectEvidence: () => decision === 'evidence'
        ? { kind: 'evidence', executedUnits: [], outputDigest: 'sha256:x' }
        : { kind: 'hold', reason: 'execution-failed', detail: 'parser gave up' },
    });
    return registry;
  }

  it('describes a timed-out run instead of dropping it', async () => {
    const result = await registryWith('evidence').run(request, async () => ({
      exitCode: null, stdout: 'partial', stderr: '', timedOut: true,
    }));
    expect(result.kind).toBe('hold');
    if (result.kind !== 'hold') return;
    expect(result.reason).toBe('execution-timeout');
    expect(result.processEvidence).toMatchObject({
      timedOut: true, exitCode: null, stdoutBytes: 7, stderrBytes: 0,
    });
    expect(result.processEvidence?.outputDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('describes the run behind an adapter-reported hold', async () => {
    const result = await registryWith('hold').run(request, async () => ({
      exitCode: 1, stdout: '', stderr: 'boom', timedOut: false,
    }));
    expect(result.kind).toBe('hold');
    if (result.kind !== 'hold') return;
    expect(result.processEvidence).toMatchObject({ exitCode: 1, stderrBytes: 4 });
  });

  // The whole point of describing rather than quoting: nothing in the hold may
  // reproduce what the process printed.
  it('never carries the output itself', async () => {
    const secret = 'ghp_exampletokenvalue';
    const result = await registryWith('hold').run(request, async () => ({
      exitCode: 1, stdout: secret, stderr: secret, timedOut: false,
    }));
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it('distinguishes two runs whose streams differ only by boundary', async () => {
    const left = await registryWith('hold').run(request, async () => ({
      exitCode: 1, stdout: 'a', stderr: 'b\nc', timedOut: false,
    }));
    const right = await registryWith('hold').run(request, async () => ({
      exitCode: 1, stdout: 'a\nb', stderr: 'c', timedOut: false,
    }));
    const digest = (r: typeof left) => r.kind === 'hold' ? r.processEvidence?.outputDigest : undefined;
    expect(digest(left)).not.toBe(digest(right));
  });
});
