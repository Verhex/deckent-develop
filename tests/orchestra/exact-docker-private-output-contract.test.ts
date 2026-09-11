import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  readFileSync,
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  TaskAttemptCustodyHold,
  TaskAttemptCustodyStore,
  taskAttemptCustodyRelativePath,
} from '../../src/core/task-attempt-custody-store.js';
import { createTaskAttemptCustodyPosixAdapter } from
  '../../src/core/task-attempt-custody-posix-adapter.js';
import {
  LANDING_PROPOSAL_MALFORMED,
  parseExactExecutionLandingProposalJsonV3,
} from '../../src/core/execution-landing-proposal.js';
import {
  createExactDockerCaptureFailureCodeV1,
  createExactDockerCaptureFailureV1,
  createExactDockerCustodyPolicy,
  EXACT_DOCKER_PRIVATE_OUTPUT_SEAL_FAILURE_SOURCE_V1,
  EXACT_DOCKER_PRIVATE_OUTPUT_NAMESPACE,
  EXACT_DOCKER_PRIVATE_OUTPUT_SEALER_SOURCE_V1,
  parseExactDockerPrivateOutputSealFailure,
} from
  '../../src/orchestra/spawn-backend-docker.js';

const roots: string[] = [];

function runNodeSource(source: string, env: NodeJS.ProcessEnv): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', source], {
      env,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderrBytes = 0;
    child.stderr.on('data', chunk => { stderrBytes += Buffer.byteLength(chunk); });
    child.once('error', reject);
    child.once('close', code => {
      if (stderrBytes !== 0) reject(new Error('private-output child emitted stderr'));
      else resolve(code);
    });
  });
}

describe('exact Docker private output creation contract', () => {
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  it('keeps a provider permissive override rejected by the production POSIX reader', async () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-private-output-reject-'));
    roots.push(root);
    const projectRoot = join(root, 'project');
    const custodyRoot = join(root, 'custody');
    mkdirSync(projectRoot, { mode: 0o700 });
    const adapter = createTaskAttemptCustodyPosixAdapter();
    const rootProof = adapter.openRoot({
      absoluteRoot: custodyRoot,
      canonicalProjectRoot: projectRoot,
      projectId: 'a'.repeat(64),
      create: true,
    });

    const permissiveWriter = `
      import { writeFileSync } from 'node:fs';
      import { join } from 'node:path';
      process.umask(0o000);
      writeFileSync(join(process.env.OUTPUT_ROOT, 'task-001.result'), '{}\\n', 'utf8');
    `;
    await expect(runNodeSource(permissiveWriter, {
      ...process.env,
      OUTPUT_ROOT: custodyRoot,
    })).resolves.toBe(0);
    expect(statSync(join(custodyRoot, 'task-001.result')).mode & 0o777).toBe(0o666);

    let observed: unknown;
    try {
      adapter.issuePathCapability({
        root: rootProof,
        relativePath: taskAttemptCustodyRelativePath('task-001.result'),
        access: 'capture-read-file',
        scopeDigest: `sha256:${'b'.repeat(64)}`,
      });
    } catch (error) {
      observed = error;
    }
    expect(observed).toBeInstanceOf(TaskAttemptCustodyHold);
    expect(observed).toMatchObject({ code: 'PRIVACY_UNVERIFIED', operation: 'probe' });
  });

  it('seals raw result and landing bytes as owner-private without changing project modes', async () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-private-output-seal-'));
    roots.push(root);
    const outputRoot = join(root, 'output');
    const projectRoot = join(root, 'project');
    mkdirSync(outputRoot, { mode: 0o700 });
    mkdirSync(projectRoot, { mode: 0o700 });
    const dispatchRequestId = 'dreq-' + '7'.repeat(64);
    const draftPath = join(outputRoot, 'task-001.result');
    const landingDraftPath = join(outputRoot, 'task-001.landing-proposal.json');
    const executablePath = join(projectRoot, 'tool.sh');
    const raw = '{"taskId":"001","selfAssessment":"GO"}\n';
    const landingRaw = `${JSON.stringify({
      version: 3,
      taskId: '001',
      dispatchRequestId,
      sequence: 2,
      summary: 'complete',
      completedWork: ['changed the admitted file'],
      remainingWork: [],
      nextAction: 'settle',
      unresolvedRisks: [],
      updatedAt: '2026-09-05T10:00:00.000Z',
    })}\n`;
    const source = `
      import { createHash } from 'node:crypto';
      import {
        closeSync, constants as fsConstants, fstatSync, fsyncSync, mkdirSync,
        openSync, readSync, unlinkSync, writeFileSync, writeSync,
      } from 'node:fs';
      ${EXACT_DOCKER_PRIVATE_OUTPUT_SEALER_SOURCE_V1}
      process.umask(0o000);
      writeFileSync(process.env.DRAFT_PATH, ${JSON.stringify(raw)}, { mode: 0o666, flag: 'wx' });
      writeFileSync(process.env.LANDING_DRAFT_PATH, ${JSON.stringify(landingRaw)}, {
        mode: 0o644, flag: 'wx',
      });
      writeFileSync(process.env.EXECUTABLE_PATH, '#!/bin/sh\\nexit 0\\n', {
        mode: 0o755, flag: 'wx',
      });
      const sealed = sealExactDockerPrivateOutputV1({
        dispatchRequestId: process.env.DISPATCH_REQUEST_ID,
        outputRoot: process.env.OUTPUT_ROOT,
        sourcePath: process.env.DRAFT_PATH,
        sealedRelativePath: 'result.bin',
        sealReceiptRelativePath: null,
        sourceEpoch: 0,
        rejectSourceFileIdentityDigest: null,
        maxBytes: 16 * 1024 * 1024,
      });
      if (sealed.byteLength !== Buffer.byteLength(${JSON.stringify(raw)})) process.exit(81);
      const landing = sealExactDockerPrivateOutputV1({
        dispatchRequestId: process.env.DISPATCH_REQUEST_ID,
        outputRoot: process.env.OUTPUT_ROOT,
        sourcePath: process.env.LANDING_DRAFT_PATH,
        sealedRelativePath: 'landing.bin',
        sealReceiptRelativePath: null,
        sourceEpoch: 0,
        rejectSourceFileIdentityDigest: null,
        maxBytes: 4 * 1024 * 1024,
      });
      if (landing.byteLength !== Buffer.byteLength(${JSON.stringify(landingRaw)})) process.exit(82);
    `;
    await expect(runNodeSource(source, {
      ...process.env,
      OUTPUT_ROOT: outputRoot,
      DRAFT_PATH: draftPath,
      LANDING_DRAFT_PATH: landingDraftPath,
      EXECUTABLE_PATH: executablePath,
      DISPATCH_REQUEST_ID: dispatchRequestId,
    })).resolves.toBe(0);

    const sealedPath = join(
      outputRoot,
      EXACT_DOCKER_PRIVATE_OUTPUT_NAMESPACE,
      dispatchRequestId,
      'result.bin',
    );
    expect(readFileSync(sealedPath, 'utf8')).toBe(raw);
    const sealedLandingPath = join(
      outputRoot,
      EXACT_DOCKER_PRIVATE_OUTPUT_NAMESPACE,
      dispatchRequestId,
      'landing.bin',
    );
    expect(readFileSync(sealedLandingPath, 'utf8')).toBe(landingRaw);
    expect(statSync(sealedPath).mode & 0o777).toBe(0o600);
    expect(statSync(sealedLandingPath).mode & 0o777).toBe(0o600);
    expect(statSync(draftPath).mode & 0o777).toBe(0o666);
    expect(statSync(landingDraftPath).mode & 0o777).toBe(0o644);
    expect(statSync(executablePath).mode & 0o777).toBe(0o755);
  });

  it('refuses a pre-existing sealed leaf without overwriting it', async () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-private-output-exclusive-'));
    roots.push(root);
    const outputRoot = join(root, 'output');
    mkdirSync(outputRoot, { mode: 0o700 });
    const dispatchRequestId = 'dreq-' + '8'.repeat(64);
    const dispatchRoot = join(outputRoot, EXACT_DOCKER_PRIVATE_OUTPUT_NAMESPACE, dispatchRequestId);
    mkdirSync(join(outputRoot, EXACT_DOCKER_PRIVATE_OUTPUT_NAMESPACE), { mode: 0o700 });
    mkdirSync(dispatchRoot, { mode: 0o700 });
    const preexisting = join(dispatchRoot, 'result.bin');
    writeFileSync(preexisting, 'do-not-overwrite\n', { mode: 0o600, flag: 'wx' });
    const source = `
      import { createHash } from 'node:crypto';
      import {
        closeSync, constants as fsConstants, fstatSync, fsyncSync, mkdirSync,
        openSync, readSync, unlinkSync, writeFileSync, writeSync,
      } from 'node:fs';
      ${EXACT_DOCKER_PRIVATE_OUTPUT_SEALER_SOURCE_V1}
      writeFileSync(process.env.DRAFT_PATH, '{}\\n', { mode: 0o600, flag: 'wx' });
      try {
        sealExactDockerPrivateOutputV1({
          dispatchRequestId: process.env.DISPATCH_REQUEST_ID,
          outputRoot: process.env.OUTPUT_ROOT,
          sourcePath: process.env.DRAFT_PATH,
          sealedRelativePath: 'result.bin',
          sealReceiptRelativePath: null,
          sourceEpoch: 0,
          rejectSourceFileIdentityDigest: null,
          maxBytes: 16 * 1024 * 1024,
        });
        process.exit(82);
      } catch { process.exit(0); }
    `;
    await expect(runNodeSource(source, {
      ...process.env,
      OUTPUT_ROOT: outputRoot,
      DRAFT_PATH: join(outputRoot, 'task-001.result'),
      DISPATCH_REQUEST_ID: dispatchRequestId,
    })).resolves.toBe(0);
    expect(readFileSync(preexisting, 'utf8')).toBe('do-not-overwrite\n');
  });

  it('preserves the sealed result and emits a safe marker when landing draft is absent', async () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-private-landing-absent-'));
    roots.push(root);
    const outputRoot = join(root, 'output');
    mkdirSync(outputRoot, { mode: 0o700 });
    const dispatchRequestId = 'dreq-' + 'b'.repeat(64);
    const resultDraftPath = join(outputRoot, 'task-001.result');
    const markerPath = join(outputRoot, 'task-001.seal-failure.json');
    const source = `
      import { createHash } from 'node:crypto';
      import {
        closeSync, constants as fsConstants, fstatSync, fsyncSync, mkdirSync,
        openSync, readSync, writeFileSync, writeSync,
      } from 'node:fs';
      const sealFailurePath = process.env.SEAL_FAILURE_PATH;
      ${EXACT_DOCKER_PRIVATE_OUTPUT_SEALER_SOURCE_V1}
      ${EXACT_DOCKER_PRIVATE_OUTPUT_SEAL_FAILURE_SOURCE_V1}
      writeFileSync(process.env.RESULT_DRAFT_PATH, '{"taskId":"001"}\\n', {
        mode: 0o600, flag: 'wx',
      });
      sealExactDockerPrivateOutputV1({
        dispatchRequestId: process.env.DISPATCH_REQUEST_ID,
        outputRoot: process.env.OUTPUT_ROOT,
        sourcePath: process.env.RESULT_DRAFT_PATH,
        sealedRelativePath: 'result.bin',
        sealReceiptRelativePath: null,
        sourceEpoch: 0,
        rejectSourceFileIdentityDigest: null,
        maxBytes: 16 * 1024 * 1024,
      });
      try {
        sealExactDockerPrivateOutputV1({
          dispatchRequestId: process.env.DISPATCH_REQUEST_ID,
          outputRoot: process.env.OUTPUT_ROOT,
          sourcePath: process.env.LANDING_DRAFT_PATH,
          sealedRelativePath: 'landing.bin',
          sealReceiptRelativePath: null,
          sourceEpoch: 0,
          rejectSourceFileIdentityDigest: null,
          maxBytes: 4 * 1024 * 1024,
        });
        process.exit(83);
      } catch (error) {
        publishSealFailure('WORKER_LANDING_PROPOSAL', error);
      }
    `;
    await expect(runNodeSource(source, {
      ...process.env,
      OUTPUT_ROOT: outputRoot,
      RESULT_DRAFT_PATH: resultDraftPath,
      LANDING_DRAFT_PATH: join(outputRoot, 'task-001.landing-proposal.json'),
      SEAL_FAILURE_PATH: markerPath,
      DISPATCH_REQUEST_ID: dispatchRequestId,
    })).resolves.toBe(0);
    expect(readFileSync(join(
      outputRoot,
      EXACT_DOCKER_PRIVATE_OUTPUT_NAMESPACE,
      dispatchRequestId,
      'result.bin',
    ), 'utf8')).toBe('{"taskId":"001"}\n');
    expect(statSync(markerPath).mode & 0o777).toBe(0o600);
    expect(parseExactDockerPrivateOutputSealFailure(
      JSON.parse(readFileSync(markerPath, 'utf8')),
    )).toEqual({
      stage: 'WORKER_LANDING_PROPOSAL',
      code: 'PROPOSAL_MISSING',
      operation: 'capture',
    });
  });

  it('seals a sequence-unique question and its source receipt as private files', async () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-private-question-seal-'));
    roots.push(root);
    const outputRoot = join(root, 'output');
    mkdirSync(outputRoot, { mode: 0o700 });
    const dispatchRequestId = 'dreq-' + '9'.repeat(64);
    const draftPath = join(outputRoot, 'task-001.question');
    const raw = '{"taskId":"001","workerId":"w","question":"Continue?",'
      + '"timestamp":"2026-09-05T10:00:00.000Z"}\n';
    const source = `
      import { createHash } from 'node:crypto';
      import {
        closeSync, constants as fsConstants, fstatSync, fsyncSync, mkdirSync,
        openSync, readSync, writeFileSync, writeSync,
      } from 'node:fs';
      ${EXACT_DOCKER_PRIVATE_OUTPUT_SEALER_SOURCE_V1}
      process.umask(0o000);
      writeFileSync(process.env.DRAFT_PATH, ${JSON.stringify(raw)}, { mode: 0o666, flag: 'wx' });
      sealExactDockerPrivateOutputV1({
        dispatchRequestId: process.env.DISPATCH_REQUEST_ID,
        outputRoot: process.env.OUTPUT_ROOT,
        sourcePath: process.env.DRAFT_PATH,
        sealedRelativePath: 'ipc/question-000001.bin',
        sealReceiptRelativePath: 'ipc/question-000001.seal.json',
        sourceEpoch: 1,
        rejectSourceFileIdentityDigest: null,
        maxBytes: 2 * 1024 * 1024,
      });
    `;
    await expect(runNodeSource(source, {
      ...process.env,
      OUTPUT_ROOT: outputRoot,
      DRAFT_PATH: draftPath,
      DISPATCH_REQUEST_ID: dispatchRequestId,
    })).resolves.toBe(0);
    const ipcRoot = join(
      outputRoot,
      EXACT_DOCKER_PRIVATE_OUTPUT_NAMESPACE,
      dispatchRequestId,
      'ipc',
    );
    const sealedPath = join(ipcRoot, 'question-000001.bin');
    const receiptPath = join(ipcRoot, 'question-000001.seal.json');
    expect(readFileSync(sealedPath, 'utf8')).toBe(raw);
    expect(statSync(sealedPath).mode & 0o777).toBe(0o600);
    expect(statSync(receiptPath).mode & 0o777).toBe(0o600);
    expect(JSON.parse(readFileSync(receiptPath, 'utf8'))).toMatchObject({
      schemaVersion: 1,
      kind: 'exact-docker-private-output-seal',
      dispatchRequestId,
      sequence: 1,
      sourceEpoch: 1,
      sealedChildRelativePath:
        `${EXACT_DOCKER_PRIVATE_OUTPUT_NAMESPACE}/${dispatchRequestId}/ipc/question-000001.bin`,
      byteLength: Buffer.byteLength(raw),
    });
  });

  it('rejects a symlinked sealed namespace ancestor', async () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-private-output-symlink-'));
    roots.push(root);
    const outputRoot = join(root, 'output');
    const redirect = join(root, 'redirect');
    mkdirSync(outputRoot, { mode: 0o700 });
    mkdirSync(redirect, { mode: 0o700 });
    symlinkSync(redirect, join(outputRoot, EXACT_DOCKER_PRIVATE_OUTPUT_NAMESPACE), 'dir');
    const source = `
      import { createHash } from 'node:crypto';
      import {
        closeSync, constants as fsConstants, fstatSync, fsyncSync, mkdirSync,
        openSync, readSync, writeFileSync, writeSync,
      } from 'node:fs';
      ${EXACT_DOCKER_PRIVATE_OUTPUT_SEALER_SOURCE_V1}
      writeFileSync(process.env.DRAFT_PATH, '{}\\n', { mode: 0o600, flag: 'wx' });
      try {
        sealExactDockerPrivateOutputV1({
          dispatchRequestId: process.env.DISPATCH_REQUEST_ID,
          outputRoot: process.env.OUTPUT_ROOT,
          sourcePath: process.env.DRAFT_PATH,
          sealedRelativePath: 'result.bin',
          sealReceiptRelativePath: null,
          sourceEpoch: 0,
          rejectSourceFileIdentityDigest: null,
          maxBytes: 16 * 1024 * 1024,
        });
        process.exit(82);
      } catch { process.exit(0); }
    `;
    await expect(runNodeSource(source, {
      ...process.env,
      OUTPUT_ROOT: outputRoot,
      DRAFT_PATH: join(outputRoot, 'task-001.result'),
      DISPATCH_REQUEST_ID: 'dreq-' + 'a'.repeat(64),
    })).resolves.toBe(0);
    expect(statSync(redirect).isDirectory()).toBe(true);
  });

  it('retains only typed safe capture cause fields', () => {
    expect(createExactDockerCaptureFailureV1(
      'WORKER_RESULT',
      new TaskAttemptCustodyHold('PRIVACY_UNVERIFIED', 'probe'),
    )).toEqual({
      stage: 'WORKER_RESULT',
      code: 'PRIVACY_UNVERIFIED',
      operation: 'probe',
    });
    const unexpected = createExactDockerCaptureFailureV1(
      'WORKER_IPC_QUESTION',
      new Error('secret=/private/path'),
    );
    expect(unexpected).toEqual({
      stage: 'WORKER_IPC_QUESTION',
      code: 'UNEXPECTED_EXCEPTION',
      operation: 'capture',
    });
    expect(JSON.stringify(unexpected)).not.toContain('secret');
    expect(JSON.stringify(unexpected)).not.toContain('/private/path');
  });

  it('rejects a permissive sealed landing postimage with a typed privacy cause', () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-private-landing-privacy-'));
    roots.push(root);
    const projectRoot = join(root, 'project');
    const custodyRoot = join(root, 'custody');
    mkdirSync(projectRoot, { mode: 0o700 });
    const policy = createExactDockerCustodyPolicy();
    const store = TaskAttemptCustodyStore.open({
      adapter: createTaskAttemptCustodyPosixAdapter(),
      absoluteRoot: custodyRoot,
      canonicalProjectRoot: projectRoot,
      projectId: 'project-privacy',
      create: true,
    });
    const identity = Object.freeze({
      schemaVersion: 2 as const,
      backend: 'docker' as const,
      projectRootSha256: createHash('sha256').update(projectRoot).digest('hex'),
      projectId: 'project-privacy',
      taskId: '001',
      attemptId: '223e4567-e89b-42d3-a456-426614174000',
      generation: 1,
    });
    const admission = store.createAdmission({
      identity,
      policy,
      admittedAt: '2026-09-05T10:00:00.000Z',
      predecessorDigest: null,
      predecessorIdentity: null,
      taskSnapshot: { taskId: identity.taskId },
    });
    const dispatchRequestId = 'dreq-' + 'c'.repeat(64);
    const outputRoot = join(custodyRoot, admission.workerOutputDirectory.relativePath);
    const dispatchRoot = join(
      outputRoot,
      EXACT_DOCKER_PRIVATE_OUTPUT_NAMESPACE,
      dispatchRequestId,
    );
    mkdirSync(dispatchRoot, { recursive: true, mode: 0o700 });
    const landingPath = join(dispatchRoot, 'landing.bin');
    writeFileSync(landingPath, '{}\n', { flag: 'wx', mode: 0o600 });
    chmodSync(landingPath, 0o644);
    const access = store.openAttemptAccess({
      identity,
      policy,
      admissionReceiptDigest: admission.receiptDigest,
    });
    expect(access).not.toBeNull();
    let observed: unknown;
    try {
      store.issueAttemptOutputCaptureSource({
        access: access!,
        childRelativePath:
          `${EXACT_DOCKER_PRIVATE_OUTPUT_NAMESPACE}/${dispatchRequestId}/landing.bin`,
        artifactClass: 'worker-landing-proposal',
        artifactKey: `landing-${identity.attemptId}`,
      });
    } catch (error) {
      observed = error;
    }
    expect(observed).toBeInstanceOf(TaskAttemptCustodyHold);
    expect(observed).toMatchObject({ code: 'PRIVACY_UNVERIFIED', operation: 'probe' });
    expect(createExactDockerCaptureFailureV1(
      'WORKER_LANDING_PROPOSAL',
      observed,
    )).toEqual({
      stage: 'WORKER_LANDING_PROPOSAL',
      code: 'PRIVACY_UNVERIFIED',
      operation: 'probe',
    });
  });

  it.each([
    ['malformed schema', JSON.stringify({ version: 3 })],
    ['truncated JSON', '{"version":3'],
  ])('seals %s landing bytes but maps them to a bounded parse diagnostic', async (_label, raw) => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-private-landing-malformed-'));
    roots.push(root);
    const outputRoot = join(root, 'output');
    mkdirSync(outputRoot, { mode: 0o700 });
    const dispatchRequestId = 'dreq-' + 'd'.repeat(64);
    const draftPath = join(outputRoot, 'task-001.landing-proposal.json');
    const source = `
      import { createHash } from 'node:crypto';
      import {
        closeSync, constants as fsConstants, fstatSync, fsyncSync, mkdirSync,
        openSync, readSync, writeFileSync, writeSync,
      } from 'node:fs';
      ${EXACT_DOCKER_PRIVATE_OUTPUT_SEALER_SOURCE_V1}
      writeFileSync(process.env.DRAFT_PATH, ${JSON.stringify(raw)}, {
        mode: 0o644, flag: 'wx',
      });
      sealExactDockerPrivateOutputV1({
        dispatchRequestId: process.env.DISPATCH_REQUEST_ID,
        outputRoot: process.env.OUTPUT_ROOT,
        sourcePath: process.env.DRAFT_PATH,
        sealedRelativePath: 'landing.bin',
        sealReceiptRelativePath: null,
        sourceEpoch: 0,
        rejectSourceFileIdentityDigest: null,
        maxBytes: 4 * 1024 * 1024,
      });
    `;
    await expect(runNodeSource(source, {
      ...process.env,
      OUTPUT_ROOT: outputRoot,
      DRAFT_PATH: draftPath,
      DISPATCH_REQUEST_ID: dispatchRequestId,
    })).resolves.toBe(0);
    const sealedPath = join(
      outputRoot,
      EXACT_DOCKER_PRIVATE_OUTPUT_NAMESPACE,
      dispatchRequestId,
      'landing.bin',
    );
    expect(readFileSync(sealedPath, 'utf8')).toBe(raw);
    expect(statSync(sealedPath).mode & 0o777).toBe(0o600);
    expect(() => parseExactExecutionLandingProposalJsonV3(raw, {
      taskId: '001',
      dispatchRequestId,
    })).toThrow();
    expect(createExactDockerCaptureFailureCodeV1(
      'WORKER_LANDING_PROPOSAL',
      LANDING_PROPOSAL_MALFORMED,
      'parse',
    )).toEqual({
      stage: 'WORKER_LANDING_PROPOSAL',
      code: 'LANDING_PROPOSAL_MALFORMED',
      operation: 'parse',
    });
  });

  it('durably captures and decodes only the runner seal failure allowlist', async () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-private-seal-failure-'));
    roots.push(root);
    const projectRoot = join(root, 'project');
    const custodyRoot = join(root, 'custody');
    mkdirSync(projectRoot, { mode: 0o700 });
    const policy = createExactDockerCustodyPolicy();
    const adapter = createTaskAttemptCustodyPosixAdapter();
    const store = TaskAttemptCustodyStore.open({
      adapter,
      absoluteRoot: custodyRoot,
      canonicalProjectRoot: projectRoot,
      projectId: 'project-1',
      create: true,
    });
    const identity = Object.freeze({
      schemaVersion: 2 as const,
      backend: 'docker' as const,
      projectRootSha256: createHash('sha256').update(projectRoot).digest('hex'),
      projectId: 'project-1',
      taskId: '001',
      attemptId: '123e4567-e89b-42d3-a456-426614174000',
      generation: 1,
    });
    const admission = store.createAdmission({
      identity,
      policy,
      admittedAt: '2026-09-05T10:00:00.000Z',
      predecessorDigest: null,
      predecessorIdentity: null,
      taskSnapshot: { taskId: identity.taskId },
    });
    const outputRoot = join(custodyRoot, admission.workerOutputDirectory.relativePath);
    const markerPath = join(outputRoot, `task-${identity.taskId}.seal-failure.json`);
    const markerWriter = `
      import {
        closeSync, constants as fsConstants, fsyncSync, openSync, writeSync,
      } from 'node:fs';
      const sealFailurePath = process.env.SEAL_FAILURE_PATH;
      ${EXACT_DOCKER_PRIVATE_OUTPUT_SEAL_FAILURE_SOURCE_V1}
      publishSealFailure('WORKER_RESULT', new Error('PRIVATE_OUTPUT_SEAL_SOURCE_CHANGED'));
    `;
    await expect(runNodeSource(markerWriter, {
      ...process.env,
      SEAL_FAILURE_PATH: markerPath,
    })).resolves.toBe(0);
    expect(statSync(markerPath).mode & 0o777).toBe(0o600);

    const access = store.openAttemptAccess({
      identity,
      policy,
      admissionReceiptDigest: admission.receiptDigest,
    });
    expect(access).not.toBeNull();
    const source = store.issueAttemptOutputCaptureSource({
      access: access!,
      childRelativePath: `task-${identity.taskId}.seal-failure.json`,
      artifactClass: 'worker-provider-observation',
      artifactKey: `seal-failure-${identity.attemptId}`,
    });
    const receipt = store.captureAttemptOutputArtifact({
      identity,
      policy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactClass: 'worker-provider-observation',
      artifactKey: `seal-failure-${identity.attemptId}`,
      capturedAt: '2026-09-05T10:01:00.000Z',
      source,
    });
    const verified = store.readVerifiedArtifact({
      identity,
      policy,
      artifactClass: 'worker-provider-observation',
      artifactKey: receipt.artifactKey,
      receiptDigest: receipt.receiptDigest,
    });
    expect(verified).not.toBeNull();
    const diagnostic = parseExactDockerPrivateOutputSealFailure(
      JSON.parse(Buffer.from(verified!.bytes).toString('utf8')),
    );
    expect(diagnostic).toEqual({
      stage: 'WORKER_RESULT',
      code: 'PRIVATE_OUTPUT_SEAL_SOURCE_CHANGED',
      operation: 'seal',
    });
    expect(JSON.stringify(diagnostic)).not.toContain(markerPath);
  });
});
