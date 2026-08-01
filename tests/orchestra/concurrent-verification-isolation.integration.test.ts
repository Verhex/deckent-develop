import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { runAdmittedWorkerTypeScriptVerification } from '../../src/agents/worker-verify.js';
import { executeAdmittedTypeScriptVerification } from '../../src/orchestra/worker-verify-tool.js';
import { TypeScriptScopedVerificationAdapter } from '../../src/core/verification-typescript-adapter.js';
import type { TypeScriptScopedVerificationRequest } from '../../src/core/verification-typescript-adapter.js';
import type { VerificationIsolationDecision, VerificationObservation } from '../../src/core/verification-isolation-authority.js';

interface Snapshot {
  readonly root: string;
  readonly request: TypeScriptScopedVerificationRequest;
}

async function createSnapshot(taskId: string, source: string): Promise<Snapshot> {
  const root = await mkdtemp(join(tmpdir(), `deckent-488-012-${taskId}-`));
  await Promise.all([
    writeFile(join(root, 'tsconfig.json'), JSON.stringify({
      compilerOptions: { strict: true, noEmit: true, target: 'ES2022' },
      files: ['src/task.ts'],
    }), 'utf8'),
    (async () => {
      const sourceRoot = join(root, 'src');
      await mkdir(sourceRoot, { recursive: true });
      await writeFile(join(sourceRoot, 'task.ts'), source, 'utf8');
    })(),
  ]);

  const grant: VerificationIsolationDecision = {
    decision: 'immutable-snapshot',
    binding: {
      taskId,
      attemptId: `attempt-${taskId}`,
      generationId: `generation-${taskId}`,
      contentDigest: `digest-${taskId}`,
      consumer: 'worker-verify',
    },
    impactedUnitIds: ['root'],
    verificationPaths: ['src/task.ts', 'tsconfig.json'],
    allowedConsumers: ['worker-verify'],
    authorityEvidenceRef: `verification-isolation:${taskId}`,
  };

  return {
    root,
    request: {
      grant,
      projectRoot: root,
      config: {
        configId: 'tsconfig',
        configPath: 'tsconfig.json',
        contentDigest: `config-${taskId}`,
        filePaths: ['src/task.ts', 'tsconfig.json'],
      },
      timeoutMs: 15_000,
    },
  };
}

describe('concurrent verification isolation canary', () => {
  it('keeps two snapshot compiler verdicts attributed and foreign evidence retry-neutral', async () => {
    const [passing, failing] = await Promise.all([
      createSnapshot('passing', 'export const answer: number = 42;\n'),
      createSnapshot('failing', "export const answer: number = 'not a number';\n"),
    ]);

    try {
      const adapter = new TypeScriptScopedVerificationAdapter();
      const [passingResult, failingResult] = await Promise.all([
        adapter.run(passing.request, executeAdmittedTypeScriptVerification),
        adapter.run(failing.request, executeAdmittedTypeScriptVerification),
      ]);

      expect(passingResult).toMatchObject({
        kind: 'completed', outcome: 'passed',
        evidence: { grant: { binding: { taskId: 'passing', attemptId: 'attempt-passing' } } },
      });
      expect(failingResult).toMatchObject({
        kind: 'completed', outcome: 'failed',
        evidence: { grant: { binding: { taskId: 'failing', attemptId: 'attempt-failing' } } },
      });

      const foreignFailure: VerificationObservation = {
        source: 'concurrent-worker',
        errorCode: 'TS2322',
        attemptId: 'attempt-failing',
        generationId: 'generation-failing',
        paths: ['src/task.ts'],
      };
      let executions = 0;
      const foreignEvidenceResult = await runAdmittedWorkerTypeScriptVerification(
        { request: { ...passing.request, observations: [foreignFailure] } },
        async invocation => {
          executions += 1;
          return executeAdmittedTypeScriptVerification(invocation);
        },
      );

      expect(foreignEvidenceResult).toMatchObject({
        kind: 'hold',
        foreignErrorDiagnostics: { reasonCodes: ['foreign_attempt'] },
      });
      expect(executions).toBe(1);
    } finally {
      await Promise.all([rm(passing.root, { recursive: true, force: true }), rm(failing.root, { recursive: true, force: true })]);
    }
  });
});
