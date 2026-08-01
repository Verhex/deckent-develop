import { describe, expect, it, vi } from 'vitest';

import {
  TypeScriptScopedVerificationAdapter,
  type TypeScriptScopedVerificationProcessResult,
  type TypeScriptScopedVerificationRequest,
} from '../../src/core/verification-typescript-adapter.js';
import { decideVerificationIsolation, type VerificationIsolationRequest } from '../../src/core/verification-isolation-authority.js';

const TASK_ID = 'task-488-009';
const ATTEMPT_ID = 'attempt-40fbf7e1';
const GENERATION_ID = 'generation-1';

function request(overrides: Partial<TypeScriptScopedVerificationRequest> = {}): TypeScriptScopedVerificationRequest {
  return {
    grant: grant(),
    projectRoot: '/admitted-snapshot',
    config: {
      configId: 'tsconfig:core',
      configPath: 'configs/tsconfig.core.json',
      contentDigest: `sha256:${'c'.repeat(64)}`,
      filePaths: ['src/core/adapter.ts'],
    },
    timeoutMs: 5_000,
    ...overrides,
  };
}

function grant() {
  return decideVerificationIsolation({
    taskId: TASK_ID,
    attemptId: ATTEMPT_ID,
    generationId: GENERATION_ID,
    consumer: 'worker-verify',
    allowedConsumers: ['worker-verify'],
    changedPaths: ['src/core/adapter.ts'],
    generation: {
      generationId: GENERATION_ID,
      contentDigest: `sha256:${'a'.repeat(64)}`,
      immutable: true,
      materialization: 'immutable-snapshot',
    },
    projectGraph: {
      units: [{ unitId: 'core', ecosystem: 'typescript', rootPath: 'src/core', ownedPaths: [], dependsOn: [] }],
    },
    leases: [],
  } satisfies VerificationIsolationRequest);
}

function processResult(overrides: Partial<TypeScriptScopedVerificationProcessResult> = {}): TypeScriptScopedVerificationProcessResult {
  return { exitCode: 0, stdout: 'TypeScript check complete', stderr: '', timedOut: false, ...overrides };
}

describe('TypeScriptScopedVerificationAdapter', () => {
  it('runs a granted, pre-materialized scoped config through shell-free tsc argv', async () => {
    const execute = vi.fn().mockResolvedValue(processResult());

    const result = await new TypeScriptScopedVerificationAdapter().run(request(), execute);

    expect(execute).toHaveBeenCalledWith({
      executable: 'tsc',
      argv: ['--noEmit', '--pretty', 'false', '--project', 'configs/tsconfig.core.json'],
      cwd: '/admitted-snapshot',
      timeoutMs: 5_000,
      shell: false,
    });
    expect(result).toMatchObject({
      kind: 'completed', outcome: 'passed',
      evidence: {
        executedFiles: ['src/core/adapter.ts'],
        config: { configId: 'tsconfig:core', contentDigest: `sha256:${'c'.repeat(64)}` },
      },
    });
    if (result.kind !== 'completed') throw new Error('expected completed result');
    expect(result.evidence.outputDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('keeps non-zero compiler exit evidence as a failed result', async () => {
    const result = await new TypeScriptScopedVerificationAdapter().run(
      request(),
      vi.fn().mockResolvedValue(processResult({ exitCode: 2, stderr: 'TS2322' })),
    );

    expect(result).toMatchObject({ kind: 'completed', outcome: 'failed', evidence: { exitCode: 2 } });
  });

  it('rejects config files outside the grant rather than widening to an ambient project check', async () => {
    const execute = vi.fn();
    const result = await new TypeScriptScopedVerificationAdapter().run(request({
      config: { ...request().config, filePaths: ['src/foreign.ts'] },
    }), execute);

    expect(result).toMatchObject({ kind: 'hold', reason: 'config-not-admitted' });
    expect(execute).not.toHaveBeenCalled();
  });

  it('reports concurrent foreign errors separately from this attempt result', async () => {
    const result = await new TypeScriptScopedVerificationAdapter().run(request({
      observations: [{
        source: 'host', errorCode: 'TS9999', attemptId: 'attempt-concurrent', generationId: GENERATION_ID,
        paths: ['src/core/adapter.ts'],
      }],
    }), vi.fn().mockResolvedValue(processResult()));

    expect(result).toMatchObject({
      kind: 'completed', outcome: 'passed',
      foreignErrorDiagnostics: { reasonCodes: ['foreign_attempt'] },
    });
  });

  it('fails closed when the authority is held or execution has no exit evidence', async () => {
    const heldGrant = {
      decision: 'hold' as const,
      reasonCode: 'binding_incomplete' as const,
      authorityEvidenceRefs: ['verification-isolation:held'],
    };
    const execute = vi.fn();
    const held = await new TypeScriptScopedVerificationAdapter().run(request({ grant: heldGrant }), execute);
    expect(held).toMatchObject({ kind: 'hold', reason: 'isolation-not-granted' });
    expect(execute).not.toHaveBeenCalled();

    const noExit = await new TypeScriptScopedVerificationAdapter().run(
      request(), vi.fn().mockResolvedValue(processResult({ exitCode: null })),
    );
    expect(noExit).toMatchObject({ kind: 'hold', reason: 'execution-failed' });
  });
});
