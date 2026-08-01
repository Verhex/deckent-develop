import { describe, expect, it } from 'vitest';

import {
  enforceVerifyLoop,
  runAdmittedWorkerTypeScriptVerification,
} from '../../src/agents/worker-verify.js';
import type { VerificationIsolationDecision } from '../../src/core/verification-isolation-authority.js';
import type { TypeScriptScopedVerificationRequest } from '../../src/core/verification-typescript-adapter.js';

function request(observations: TypeScriptScopedVerificationRequest['observations'] = []): TypeScriptScopedVerificationRequest {
  const grant: VerificationIsolationDecision = {
    decision: 'immutable-snapshot',
    binding: {
      taskId: '488-010', attemptId: 'attempt-a', generationId: 'generation-a',
      contentDigest: 'digest-a', consumer: 'worker-verify',
    },
    impactedUnitIds: ['root'],
    verificationPaths: ['src/task.ts', 'tsconfig.json'],
    allowedConsumers: ['worker-verify'],
    authorityEvidenceRef: 'verification-isolation:test',
  };
  return {
    grant,
    projectRoot: '/admitted-snapshot',
    config: {
      configId: 'tsconfig', configPath: 'tsconfig.json', contentDigest: 'config-digest',
      filePaths: ['src/task.ts', 'tsconfig.json'],
    },
    timeoutMs: 1_000,
    observations,
  };
}

describe('worker admitted TypeScript verification wire', () => {
  it('accepts a passing adapter result exactly once', async () => {
    let executions = 0;

    const result = await runAdmittedWorkerTypeScriptVerification(
      { request: request() },
      async () => {
        executions++;
        return { exitCode: 0, stdout: '', stderr: '', timedOut: false };
      },
    );

    expect(result.kind).toBe('passed');
    expect(executions).toBe(1);
  });

  it('returns HOLD for a foreign concurrent error without consuming a retry', async () => {
    let executions = 0;
    const result = await runAdmittedWorkerTypeScriptVerification(
      {
        request: request([{
          source: 'concurrent-worker', errorCode: 'TS9999', attemptId: 'attempt-b',
          generationId: 'generation-a', paths: ['src/task.ts'],
        }]),
      },
      async () => {
        executions++;
        return { exitCode: 1, stdout: '', stderr: 'foreign error', timedOut: false };
      },
    );

    expect(result).toMatchObject({ kind: 'hold', foreignErrorDiagnostics: { reasonCodes: ['foreign_attempt'] } });
    expect(executions).toBe(1);
  });

  it('reports an attributed compiler failure as failed, not a false pass', async () => {
    const result = await runAdmittedWorkerTypeScriptVerification(
      { request: request() },
      async () => ({ exitCode: 2, stdout: '', stderr: 'TS2322', timedOut: false }),
    );

    expect(result).toMatchObject({ kind: 'failed', reason: 'Admitted TypeScript verification failed with exit code 2' });
  });

  it('fails closed when the legacy worker gate receives no admission', async () => {
    await expect(enforceVerifyLoop('/project', '488-010', 'tests/agents')).resolves.toEqual({
      ok: false,
      reason: 'Verification isolation admission is required',
      attempts: 0,
    });
  });
});
