/**
 * tests/orchestra/ipc-registry.test.ts
 *
 * Tests for the centralized IPC registry module.
 * Sprint 135 T-004: Extended with askBrain, file-based IPC helpers,
 * handleWorkerQuestion, checkWorkerQuestions, and backward compat shim tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  existsSync,
  writeFileSync,
  readFileSync,
  linkSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ─── Channel Registry Tests (mocked) ──────────────────────────────

vi.mock('../../src/agents/worker-ipc.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/agents/worker-ipc.js')>();
  return actual;
});

// NPM-ADVISORY (born-454): notifications must never hit real channels in tests.
vi.mock('../../src/core/notify.js', () => ({
  notifyAsync: vi.fn(),
}));

import { notifyAsync } from '../../src/core/notify.js';

import {
  getChannelRegistry,
  registerWorkerChannel,
  unregisterWorkerChannel,
  getQuestionPath,
  getAnswerPath,
  writeQuestionFile,
  readQuestionFile,
  writeAnswerFile,
  readAnswerFile,
  cleanupQuestionFiles,
  askBrain,
  handleWorkerQuestion,
  checkWorkerQuestions,
  NPM_ADVISORY_ANSWER_MESSAGE,
  createExactAttemptIpcQuestionAuthority,
  checkExactAttemptWorkerQuestions as checkExactAttemptWorkerQuestionsRaw,
  createExactAttemptIpcTransientRegistry,
  publishExactAttemptIpcCompatibilityProjection,
  exactAttemptIpcPrivateAnswerReceiptDigest,
  ExactAttemptIpcHold,
  type ExactAttemptIpcPrivateAnswerPublisher,
} from '../../src/orchestra/ipc-registry.js';
import type {
  Sha256Digest,
  TaskAttemptCustodyArtifactReceiptV2,
  TaskAttemptCustodyIdentityV2,
} from '../../src/core/task-attempt-custody-store.js';

// Backward compat: these should also be importable from worker-ipc.ts
import {
  askBrain as askBrainShim,
  getQuestionPath as getQuestionPathShim,
  getAnswerPath as getAnswerPathShim,
  writeQuestionFile as writeQuestionFileShim,
  readQuestionFile as readQuestionFileShim,
  writeAnswerFile as writeAnswerFileShim,
  readAnswerFile as readAnswerFileShim,
  cleanupQuestionFiles as cleanupQuestionFilesShim,
} from '../../src/agents/worker-ipc.js';

// Backward compat: handleWorkerQuestion + checkWorkerQuestions from result-collector
import {
  handleWorkerQuestion as handleWorkerQuestionRC,
  checkWorkerQuestions as checkWorkerQuestionsRC,
} from '../../src/orchestra/result-collector.js';

describe('ipc-registry', () => {
  describe('getChannelRegistry', () => {
    it('should return a ChannelRegistry instance', () => {
      const registry = getChannelRegistry();
      expect(registry).toBeDefined();
      expect(typeof registry.register).toBe('function');
      expect(typeof registry.remove).toBe('function');
      expect(typeof registry.get).toBe('function');
    });

    it('should return the same instance on multiple calls (singleton)', () => {
      const r1 = getChannelRegistry();
      const r2 = getChannelRegistry();
      expect(r1).toBe(r2);
    });
  });

  describe('registerWorkerChannel + unregisterWorkerChannel', () => {
    it('should register and unregister channels', async () => {
      const registry = getChannelRegistry();
      const mockProc = {
        on: vi.fn(),
        off: vi.fn(),
        send: vi.fn(),
      };
      const { WorkerChannel } = await import('../../src/agents/worker-ipc.js');
      const channel = new WorkerChannel(mockProc as unknown as import('node:child_process').ChildProcess, 'test-reg-001');
      registerWorkerChannel('test-reg-001', channel);
      expect(registry.has('test-reg-001')).toBe(true);
      unregisterWorkerChannel('test-reg-001');
      expect(registry.has('test-reg-001')).toBe(false);
    });
  });
});

// ─── File-based IPC Tests ──────────────────────────────────────────

describe('ipc-registry file-based IPC', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ipc-reg-test-'));
    mkdirSync(join(tmpDir, '.tasks'), { recursive: true });
  });

  describe('getQuestionPath / getAnswerPath', () => {
    it('returns correct question file path', () => {
      const path = getQuestionPath(tmpDir, '135-001');
      expect(path).toBe(join(tmpDir, '.tasks', 'task-135-001.question'));
    });

    it('returns correct answer file path', () => {
      const path = getAnswerPath(tmpDir, '135-001');
      expect(path).toBe(join(tmpDir, '.tasks', 'task-135-001.answer'));
    });
  });

  describe('writeQuestionFile / readQuestionFile', () => {
    it('round-trips a question file', () => {
      const question = {
        taskId: 'q-001',
        workerId: 'w-q-001',
        question: 'Should I refactor?',
        timestamp: new Date().toISOString(),
      };
      writeQuestionFile(tmpDir, question);
      const read = readQuestionFile(tmpDir, 'q-001');
      expect(read).toBeDefined();
      expect(read!.taskId).toBe('q-001');
      expect(read!.question).toBe('Should I refactor?');
    });

    it('returns undefined for missing file', () => {
      expect(readQuestionFile(tmpDir, 'nonexistent')).toBeUndefined();
    });
  });

  describe('writeAnswerFile / readAnswerFile', () => {
    it('round-trips an answer file', () => {
      const answer = {
        taskId: 'a-001',
        action: 'continue' as const,
        message: 'Go ahead',
        timestamp: new Date().toISOString(),
      };
      writeAnswerFile(tmpDir, answer);
      const read = readAnswerFile(tmpDir, 'a-001');
      expect(read).toBeDefined();
      expect(read!.action).toBe('continue');
    });

    it('returns undefined for missing file', () => {
      expect(readAnswerFile(tmpDir, 'nonexistent')).toBeUndefined();
    });
  });

  describe('cleanupQuestionFiles', () => {
    it('removes both question and answer files', () => {
      const question = {
        taskId: 'c-001',
        workerId: 'w-c-001',
        question: 'test',
        timestamp: new Date().toISOString(),
      };
      const answer = {
        taskId: 'c-001',
        action: 'continue' as const,
        message: 'ok',
        timestamp: new Date().toISOString(),
      };
      writeQuestionFile(tmpDir, question);
      writeAnswerFile(tmpDir, answer);
      expect(existsSync(getQuestionPath(tmpDir, 'c-001'))).toBe(true);
      expect(existsSync(getAnswerPath(tmpDir, 'c-001'))).toBe(true);

      cleanupQuestionFiles(tmpDir, 'c-001');
      expect(existsSync(getQuestionPath(tmpDir, 'c-001'))).toBe(false);
      expect(existsSync(getAnswerPath(tmpDir, 'c-001'))).toBe(false);
    });

    it('does not throw for missing files', () => {
      expect(() => cleanupQuestionFiles(tmpDir, 'no-such')).not.toThrow();
    });
  });

  describe('askBrain', () => {
    it('file-based happy path — returns answer when Brain writes answer file', async () => {
      // Simulate Brain answering after a short delay
      const answer = {
        taskId: 'ask-001',
        action: 'continue' as const,
        message: 'Brain says OK',
        timestamp: new Date().toISOString(),
      };
      setTimeout(() => {
        writeAnswerFile(tmpDir, answer);
      }, 50);

      const result = await askBrain(tmpDir, 'ask-001', 'w-ask-001', 'Can I proceed?', {
        timeoutMs: 5000,
        pollIntervalMs: 30,
      });
      expect(result.action).toBe('continue');
      expect(result.taskId).toBe('ask-001');
      // Cleanup should have happened
      expect(existsSync(getQuestionPath(tmpDir, 'ask-001'))).toBe(false);
      expect(existsSync(getAnswerPath(tmpDir, 'ask-001'))).toBe(false);
    });

    it('timeout fallback returns default continue answer', async () => {
      const result = await askBrain(tmpDir, 'ask-timeout', 'w-timeout', 'Will this timeout?', {
        timeoutMs: 100,
        pollIntervalMs: 30,
      });
      expect(result.action).toBe('continue');
      expect(result.message).toContain('timed out');
    });

    it('writes question file before polling', async () => {
      let questionWritten = false;
      setTimeout(() => {
        questionWritten = existsSync(getQuestionPath(tmpDir, 'ask-check'));
        // Write answer to stop polling
        writeAnswerFile(tmpDir, {
          taskId: 'ask-check',
          action: 'continue',
          message: 'ok',
          timestamp: new Date().toISOString(),
        });
      }, 50);

      await askBrain(tmpDir, 'ask-check', 'w-check', 'question?', {
        timeoutMs: 5000,
        pollIntervalMs: 30,
      });
      expect(questionWritten).toBe(true);
    });
  });

  describe('handleWorkerQuestion', () => {
    it('returns undefined when no question file exists', () => {
      const result = handleWorkerQuestion(tmpDir, 'no-q');
      expect(result).toBeUndefined();
    });

    it('auto-answers with continue when question file exists', () => {
      writeQuestionFile(tmpDir, {
        taskId: 'hq-001',
        workerId: 'w-hq-001',
        question: 'Can I skip this test?',
        timestamp: new Date().toISOString(),
      });
      const answer = handleWorkerQuestion(tmpDir, 'hq-001');
      expect(answer).toBeDefined();
      expect(answer!.action).toBe('continue');
      expect(answer!.taskId).toBe('hq-001');
      // Answer file should be written
      expect(existsSync(getAnswerPath(tmpDir, 'hq-001'))).toBe(true);
    });
  });

  // ─── NPM-ADVISORY (born-454) — dependency-mutation escalation channel ────
  describe('handleWorkerQuestion — NPM-ADVISORY', () => {
    beforeEach(() => {
      vi.mocked(notifyAsync).mockClear();
    });

    const npmQuestion = (taskId: string, suggestedAction?: 'continue' | 'skip' | 'abort' | 'retry') => ({
      taskId,
      workerId: `w-${taskId}`,
      question: '[NPM-ADVISORY] needs left-pad@1.3.0 for string alignment',
      context: 'goCriteria requires padded table output',
      suggestedAction,
      timestamp: new Date().toISOString(),
    });

    it('answers fail-closed continue with the explicit not-approved message', () => {
      writeQuestionFile(tmpDir, npmQuestion('npm-001'));
      const answer = handleWorkerQuestion(tmpDir, 'npm-001');
      expect(answer!.action).toBe('continue');
      expect(answer!.message).toBe(NPM_ADVISORY_ANSWER_MESSAGE);
      expect(answer!.message).toContain('NOT approved');
      expect(existsSync(getAnswerPath(tmpDir, 'npm-001'))).toBe(true);
    });

    it('never honors suggestedAction even when honorWorkerQuestionAction is on (no self-approval)', () => {
      writeQuestionFile(tmpDir, npmQuestion('npm-002', 'abort'));
      const answer = handleWorkerQuestion(tmpDir, 'npm-002', { honorWorkerQuestionAction: true });
      expect(answer!.action).toBe('continue');
      expect(answer!.message).toBe(NPM_ADVISORY_ANSWER_MESSAGE);
    });

    it('notifies the human exactly once — re-answer cycles with an existing answer file skip notify', () => {
      writeQuestionFile(tmpDir, npmQuestion('npm-003'));
      handleWorkerQuestion(tmpDir, 'npm-003', { sprintId: 'sprint-999' });
      expect(notifyAsync).toHaveBeenCalledTimes(1);
      expect(vi.mocked(notifyAsync).mock.calls[0][0]).toBe('human-checkpoint-required');
      expect(vi.mocked(notifyAsync).mock.calls[0][1]).toBe('sprint-999');
      // Poll loop revisits the still-unconsumed question file → answered again, NOT re-notified.
      handleWorkerQuestion(tmpDir, 'npm-003', { sprintId: 'sprint-999' });
      expect(notifyAsync).toHaveBeenCalledTimes(1);
    });

    it('without a sprintId the advisory is still answered but never notified', () => {
      writeQuestionFile(tmpDir, npmQuestion('npm-004'));
      const answer = handleWorkerQuestion(tmpDir, 'npm-004');
      expect(answer!.action).toBe('continue');
      expect(notifyAsync).not.toHaveBeenCalled();
    });

    it('leading whitespace before the marker still classifies as NPM-ADVISORY', () => {
      writeQuestionFile(tmpDir, {
        ...npmQuestion('npm-005'),
        question: '  [NPM-ADVISORY] needs esbuild bump',
      });
      const answer = handleWorkerQuestion(tmpDir, 'npm-005');
      expect(answer!.message).toBe(NPM_ADVISORY_ANSWER_MESSAGE);
    });
  });

  describe('checkWorkerQuestions', () => {
    it('answers pending questions for uncollected tasks', () => {
      writeQuestionFile(tmpDir, {
        taskId: 'cq-001',
        workerId: 'w-cq-001',
        question: 'Help?',
        timestamp: new Date().toISOString(),
      });
      const taskIds = new Set(['cq-001', 'cq-002']);
      const collected = new Set<string>();
      const answered = checkWorkerQuestions(tmpDir, taskIds, collected);
      expect(answered).toContain('cq-001');
      expect(answered).not.toContain('cq-002');
    });

    it('skips already collected tasks', () => {
      writeQuestionFile(tmpDir, {
        taskId: 'cq-003',
        workerId: 'w-cq-003',
        question: 'Help?',
        timestamp: new Date().toISOString(),
      });
      const taskIds = new Set(['cq-003']);
      const collected = new Set(['cq-003']);
      const answered = checkWorkerQuestions(tmpDir, taskIds, collected);
      expect(answered).toHaveLength(0);
    });
  });
});

// ─── Backward Compatibility Shim Tests ─────────────────────────────

describe('worker-ipc.ts re-export shim backward compat', () => {
  it('askBrain re-exported from worker-ipc is the same function', () => {
    expect(askBrainShim).toBe(askBrain);
  });

  it('getQuestionPath re-exported from worker-ipc is the same function', () => {
    expect(getQuestionPathShim).toBe(getQuestionPath);
  });

  it('getAnswerPath re-exported from worker-ipc is the same function', () => {
    expect(getAnswerPathShim).toBe(getAnswerPath);
  });

  it('writeQuestionFile re-exported from worker-ipc is the same function', () => {
    expect(writeQuestionFileShim).toBe(writeQuestionFile);
  });

  it('readQuestionFile re-exported from worker-ipc is the same function', () => {
    expect(readQuestionFileShim).toBe(readQuestionFile);
  });

  it('writeAnswerFile re-exported from worker-ipc is the same function', () => {
    expect(writeAnswerFileShim).toBe(writeAnswerFile);
  });

  it('readAnswerFile re-exported from worker-ipc is the same function', () => {
    expect(readAnswerFileShim).toBe(readAnswerFile);
  });

  it('cleanupQuestionFiles re-exported from worker-ipc is the same function', () => {
    expect(cleanupQuestionFilesShim).toBe(cleanupQuestionFiles);
  });
});

describe('result-collector.ts re-export shim backward compat', () => {
  it('handleWorkerQuestion re-exported from result-collector is the same function', () => {
    expect(handleWorkerQuestionRC).toBe(handleWorkerQuestion);
  });

  it('checkWorkerQuestions re-exported from result-collector is the same function', () => {
    expect(checkWorkerQuestionsRC).toBe(checkWorkerQuestions);
  });
});

// ─── Normal Docker exact-attempt IPC ────────────────────────────────────────

const digest = (char: string): Sha256Digest => `sha256:${char.repeat(64)}` as Sha256Digest;

function exactIdentity(overrides: Partial<TaskAttemptCustodyIdentityV2> = {}): TaskAttemptCustodyIdentityV2 {
  return {
    schemaVersion: 2,
    backend: 'docker',
    projectRootSha256: 'a'.repeat(64),
    projectId: 'project-a',
    taskId: 'ipc-exact-001',
    attemptId: 'attempt-a',
    generation: 3,
    ...overrides,
  };
}

function questionReceipt(
  identity: TaskAttemptCustodyIdentityV2,
  privateQuestionBytes: Uint8Array,
  sequence = 1,
): TaskAttemptCustodyArtifactReceiptV2 {
  return {
    schemaVersion: 2,
    kind: 'task-attempt-custody-artifact',
    identity,
    admissionReceiptDigest: digest('b'),
    artifactClass: 'worker-ipc-question',
    captureMode: 'attempt-output-capture',
    artifactKey: `ipc-question-${sequence}`,
    capturedAt: '2026-09-01T08:00:00.000Z',
    policyDigest: digest('c'),
    artifact: {
      relativePath: `projects/project-a/tasks/${identity.taskId}/attempts/${identity.attemptId}/worker-output/task-${identity.taskId}.question` as never,
      sha256: `sha256:${createHash('sha256').update(privateQuestionBytes).digest('hex')}`,
      byteLength: privateQuestionBytes.byteLength,
      volumeId: 'volume-a',
      fileId: `question-${sequence}`,
      linkCount: 1,
      privacyEvidenceDigest: digest('e'),
      durabilityEvidenceDigest: digest('f'),
    },
    receiptDigest: digest('1'),
  };
}

function exactQuestionAuthority(
  identity = exactIdentity(),
  sequence = 1,
  bindings: {
    admissionReceiptDigest?: Sha256Digest;
    fenceDigest?: Sha256Digest;
    question?: string;
  } = {},
) {
  const admissionReceiptDigest = bindings.admissionReceiptDigest ?? digest('b');
  const privateQuestionBytes = Buffer.from(JSON.stringify({
    taskId: identity.taskId,
    workerId: `w-${identity.taskId}`,
    question: bindings.question ?? 'May I continue with the exact attempt?',
    suggestedAction: 'continue',
    timestamp: '2026-09-01T08:00:00.000Z',
  }), 'utf8');
  const receipt = {
    ...questionReceipt(identity, privateQuestionBytes, sequence),
    admissionReceiptDigest,
  };
  return createExactAttemptIpcQuestionAuthority({
    expectedIdentity: identity,
    admissionReceiptDigest,
    fenceDigest: bindings.fenceDigest ?? digest('2'),
    sequence,
    privateQuestionBytes,
    privateQuestionReceipt: receipt,
  });
}

function answerPublisher(): ExactAttemptIpcPrivateAnswerPublisher {
  return {
    publishAnswerFirstWriter: vi.fn((input) => {
      const receiptBody = {
        schemaVersion: 2 as const,
        kind: 'task-attempt-ipc-private-answer-receipt' as const,
        identity: input.identity,
        admissionReceiptDigest: input.admissionReceiptDigest,
        fenceDigest: input.fenceDigest,
        sequence: input.sequence,
        questionReceiptDigest: input.questionReceiptDigest,
        questionEnvelopeDigest: input.questionEnvelopeDigest,
        answerEnvelopeDigest: input.answerEnvelope.envelopeDigest,
        answerArtifactSha256: `sha256:${createHash('sha256').update(input.privateAnswerBytes).digest('hex')}`,
        artifactKey: input.artifactKey,
        destinationChildRelativePath: input.destinationChildRelativePath,
        destinationProofDigest: digest('3'),
        deliveredAt: '2026-09-01T08:00:01.000Z',
      };
      return {
        state: 'published' as const,
        receipt: {
          ...receiptBody,
          receiptDigest: exactAttemptIpcPrivateAnswerReceiptDigest(receiptBody),
        },
      };
    }),
  };
}

describe('normal Docker exact-attempt IPC authority', () => {
  let tmpDir: string;
  let transientRegistry: ReturnType<typeof createExactAttemptIpcTransientRegistry>;

  const checkExactAttemptWorkerQuestions = (
    projectRoot: Parameters<typeof checkExactAttemptWorkerQuestionsRaw>[0],
    taskIds: Parameters<typeof checkExactAttemptWorkerQuestionsRaw>[1],
    collectedIds: Parameters<typeof checkExactAttemptWorkerQuestionsRaw>[2],
    options: Omit<Parameters<typeof checkExactAttemptWorkerQuestionsRaw>[3], 'transientRegistry'>,
  ) => checkExactAttemptWorkerQuestionsRaw(projectRoot, taskIds, collectedIds, {
    ...options,
    transientRegistry,
  });

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ipc-exact-reg-test-'));
    mkdirSync(join(tmpDir, '.tasks'), { recursive: true });
    transientRegistry = createExactAttemptIpcTransientRegistry(tmpDir);
  });

  it('binds the untrusted payload to the exact private question receipt', () => {
    const authority = exactQuestionAuthority();

    expect(authority.identity).toEqual(exactIdentity());
    expect(authority.questionReceiptDigest).toBe(digest('1'));
    expect(authority.question.taskId).toBe('ipc-exact-001');
    expect(authority.envelopeDigest).toMatch(/^sha256:[a-f0-9]{64}$/u);
  });

  it('rejects sibling-attempt and task-spoof receipts instead of inferring identity from payload', () => {
    const expected = exactIdentity();
    const sibling = exactIdentity({ attemptId: 'attempt-sibling' });
    const expectedBytes = Buffer.from(JSON.stringify({
      taskId: expected.taskId,
      workerId: 'worker-self-report',
      question: 'spoof?',
      timestamp: '2026-09-01T08:00:00.000Z',
    }), 'utf8');

    expect(() => createExactAttemptIpcQuestionAuthority({
      expectedIdentity: expected,
      admissionReceiptDigest: digest('b'),
      fenceDigest: digest('2'),
      sequence: 1,
      privateQuestionBytes: expectedBytes,
      privateQuestionReceipt: questionReceipt(sibling, expectedBytes),
    })).toThrowError(ExactAttemptIpcHold);

    const spoofedTaskBytes = Buffer.from(JSON.stringify({
      taskId: 'different-task',
      workerId: 'worker-self-report',
      question: 'spoof?',
      timestamp: '2026-09-01T08:00:00.000Z',
    }), 'utf8');

    expect(() => createExactAttemptIpcQuestionAuthority({
      expectedIdentity: expected,
      admissionReceiptDigest: digest('b'),
      fenceDigest: digest('2'),
      sequence: 1,
      privateQuestionBytes: spoofedTaskBytes,
      privateQuestionReceipt: questionReceipt(expected, spoofedTaskBytes),
    })).toThrowError(ExactAttemptIpcHold);
  });

  it('rejects swapped question bytes even when the caller reuses a valid private receipt', () => {
    const expected = exactIdentity();
    const originalBytes = Buffer.from(JSON.stringify({
      taskId: expected.taskId,
      workerId: 'w-original',
      question: 'Original private question',
      timestamp: '2026-09-01T08:00:00.000Z',
    }), 'utf8');
    const swappedBytes = Buffer.from(JSON.stringify({
      taskId: expected.taskId,
      workerId: 'w-spoof',
      question: 'Swapped public content',
      timestamp: '2026-09-01T08:00:00.000Z',
    }), 'utf8');

    expect(() => createExactAttemptIpcQuestionAuthority({
      expectedIdentity: expected,
      admissionReceiptDigest: digest('b'),
      fenceDigest: digest('2'),
      sequence: 1,
      privateQuestionBytes: swappedBytes,
      privateQuestionReceipt: questionReceipt(expected, originalBytes),
    })).toThrowError(ExactAttemptIpcHold);
  });

  it('rejects oversized identity, question, and context strings before linear normalization', () => {
    const identity = exactIdentity({ attemptId: 'attempt-oversized-context' });
    const privateQuestionBytes = Buffer.from(JSON.stringify({
      taskId: identity.taskId,
      workerId: 'worker-oversized-context',
      question: 'Context bound?',
      context: 'x'.repeat(128 * 1024 + 1),
      timestamp: '2026-09-01T08:00:00.000Z',
    }), 'utf8');

    expect(() => createExactAttemptIpcQuestionAuthority({
      expectedIdentity: identity,
      admissionReceiptDigest: digest('b'),
      fenceDigest: digest('2'),
      sequence: 1,
      privateQuestionBytes,
      privateQuestionReceipt: questionReceipt(identity, privateQuestionBytes),
    })).toThrowError(ExactAttemptIpcHold);

    const oversizedQuestionBytes = Buffer.from(JSON.stringify({
      taskId: identity.taskId,
      workerId: 'worker-oversized-question',
      question: 'x'.repeat(128 * 1024 + 1),
      timestamp: '2026-09-01T08:00:00.000Z',
    }), 'utf8');
    expect(() => createExactAttemptIpcQuestionAuthority({
      expectedIdentity: identity,
      admissionReceiptDigest: digest('b'),
      fenceDigest: digest('2'),
      sequence: 1,
      privateQuestionBytes: oversizedQuestionBytes,
      privateQuestionReceipt: questionReceipt(identity, oversizedQuestionBytes),
    })).toThrowError(ExactAttemptIpcHold);

    const oversizedIdentity = exactIdentity({ projectId: 'x'.repeat(129) });
    expect(() => exactQuestionAuthority(oversizedIdentity)).toThrowError(ExactAttemptIpcHold);
  });

  it('bounds canonical receipt hashing against cycles, depth, flat nodes, and bytes', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic['self'] = cyclic;
    expect(() => exactAttemptIpcPrivateAnswerReceiptDigest(cyclic as never))
      .toThrowError(ExactAttemptIpcHold);

    let deep: Record<string, unknown> = { leaf: true };
    for (let index = 0; index < 40; index += 1) deep = { nested: deep };
    expect(() => exactAttemptIpcPrivateAnswerReceiptDigest(deep as never))
      .toThrowError(ExactAttemptIpcHold);

    const flat = Object.fromEntries(
      Array.from({ length: 10_001 }, (_, index) => [`node-${index}`, index]),
    );
    expect(() => exactAttemptIpcPrivateAnswerReceiptDigest(flat as never))
      .toThrowError(ExactAttemptIpcHold);

    const sparse: unknown[] = [];
    sparse.length = 100_000;
    expect(() => exactAttemptIpcPrivateAnswerReceiptDigest(sparse as never))
      .toThrowError(ExactAttemptIpcHold);

    expect(() => exactAttemptIpcPrivateAnswerReceiptDigest({
      oversized: 'x'.repeat(1024 * 1024 + 1),
    } as never)).toThrowError(ExactAttemptIpcHold);
  });

  it('answers only through the private first-writer publisher, then emits compatibility projections', async () => {
    const authority = exactQuestionAuthority();
    const publisher = answerPublisher();
    const resolveAuthority = vi.fn(() => ({
      state: 'question-ready' as const,
      authority,
      answerPublisher: publisher,
    }));

    const report = await checkExactAttemptWorkerQuestions(
      tmpDir,
      new Set([authority.identity.taskId]),
      new Set<string>(),
      { resolveAuthority },
    );

    expect(report.answered).toEqual([authority.identity.taskId]);
    expect(report.holds).toEqual([]);
    expect(resolveAuthority).toHaveBeenCalledTimes(7); // initial + both projection fences + private pre/post
    expect(publisher.publishAnswerFirstWriter).toHaveBeenCalledTimes(1);
    const privatePublication = vi.mocked(publisher.publishAnswerFirstWriter).mock.calls[0]?.[0];
    expect(privatePublication?.artifactKey).toBe('ipc-answer-1');
    expect(privatePublication?.destinationChildRelativePath)
      .toBe(`task-${authority.identity.taskId}.answer`);
    const workerMount = mkdtempSync(join(tmpdir(), 'ipc-exact-worker-mount-'));
    mkdirSync(join(workerMount, '.tasks'), { recursive: true });
    writeFileSync(
      getAnswerPath(workerMount, authority.identity.taskId),
      privatePublication?.privateAnswerBytes ?? Buffer.alloc(0),
    );
    expect(readAnswerFile(workerMount, authority.identity.taskId)).toMatchObject({
      taskId: authority.identity.taskId,
      action: 'continue',
    });
    expect(readAnswerFile(workerMount, authority.identity.taskId)).not.toHaveProperty('answer');
    expect(JSON.parse(readFileSync(getQuestionPath(tmpDir, authority.identity.taskId), 'utf8'))).toMatchObject({
      kind: 'task-attempt-ipc-compatibility-projection',
      authority: 'private-receipt-only',
      generation: 3,
      attemptId: 'attempt-a',
      question: 'May I continue with the exact attempt?',
    });
    expect(JSON.parse(readFileSync(getAnswerPath(tmpDir, authority.identity.taskId), 'utf8'))).toMatchObject({
      kind: 'task-attempt-ipc-compatibility-projection',
      authority: 'private-receipt-only',
      generation: 3,
      attemptId: 'attempt-a',
      action: 'continue',
    });
    expect(readQuestionFile(tmpDir, authority.identity.taskId)?.question)
      .toBe('May I continue with the exact attempt?');
    expect(readAnswerFile(tmpDir, authority.identity.taskId)?.action).toBe('continue');
  });

  it('keeps no-dispatch at zero attempts and never reads or writes public IPC files', async () => {
    const resolveAuthority = vi.fn(() => ({
      state: 'not-dispatched' as const,
      taskId: 'ipc-exact-001',
      attemptCount: 0 as const,
    }));

    const report = await checkExactAttemptWorkerQuestions(
      tmpDir,
      new Set(['ipc-exact-001']),
      new Set<string>(),
      { resolveAuthority },
    );

    expect(report.answered).toEqual([]);
    expect(report.notDispatched).toEqual(['ipc-exact-001']);
    expect(existsSync(getQuestionPath(tmpDir, 'ipc-exact-001'))).toBe(false);
    expect(existsSync(getAnswerPath(tmpDir, 'ipc-exact-001'))).toBe(false);
  });

  it('rejects forged resolver state records without invoking proxy/getter side effects', async () => {
    const authority = exactQuestionAuthority(exactIdentity({ attemptId: 'attempt-state-guard' }));
    const valid = {
      state: 'question-ready' as const,
      authority,
      answerPublisher: answerPublisher(),
    };
    let sideEffects = 0;
    const getterState: Record<string, unknown> = {};
    Object.defineProperty(getterState, 'state', {
      enumerable: true,
      get: () => {
        sideEffects += 1;
        return 'question-ready';
      },
    });
    const nonEnumerableExtra = { ...valid } as Record<PropertyKey, unknown>;
    Object.defineProperty(nonEnumerableExtra, 'hidden', { value: true, enumerable: false });
    const symbolExtra = { ...valid } as Record<PropertyKey, unknown>;
    symbolExtra[Symbol('forged')] = true;
    const variants: unknown[] = [
      new Proxy(valid, {
        get: () => {
          sideEffects += 1;
          throw new Error('proxy trap must not run');
        },
      }),
      getterState,
      { ...valid, extra: true },
      nonEnumerableExtra,
      symbolExtra,
      { state: 'not-dispatched', taskId: authority.identity.taskId, attemptCount: 1 },
      { state: 'not-dispatched', taskId: authority.identity.taskId, attemptCount: 0, extra: true },
    ];

    for (const variant of variants) {
      const report = await checkExactAttemptWorkerQuestions(
        tmpDir,
        new Set([authority.identity.taskId]),
        new Set<string>(),
        { resolveAuthority: () => variant as never },
      );
      expect(report.holds).toEqual([{
        taskId: authority.identity.taskId,
        reasonCode: 'PRIVATE_IPC_AUTHORITY_UNAVAILABLE',
      }]);
    }
    expect(sideEffects).toBe(0);
  });

  it('rejects nested authority, identity, question, and publisher descriptor forgery', async () => {
    const authority = exactQuestionAuthority(exactIdentity({ attemptId: 'attempt-nested-guard' }));
    const publisher = answerPublisher();
    let sideEffects = 0;
    const withDescriptorForgery = (
      source: object,
      key: string,
      kind: 'getter' | 'non-enumerable',
    ): Record<PropertyKey, unknown> => {
      const forged = { ...source } as Record<PropertyKey, unknown>;
      Object.defineProperty(forged, key, kind === 'getter'
        ? {
            enumerable: true,
            get: () => {
              sideEffects += 1;
              throw new Error('getter must not run');
            },
          }
        : { value: true, enumerable: false });
      return forged;
    };
    const extraSymbol = (source: object): Record<PropertyKey, unknown> => {
      const forged = { ...source } as Record<PropertyKey, unknown>;
      forged[Symbol('forged')] = true;
      return forged;
    };
    const stateWith = (nestedAuthority: unknown, nestedPublisher: unknown = publisher) => ({
      state: 'question-ready',
      authority: nestedAuthority,
      answerPublisher: nestedPublisher,
    });
    const authorityWith = (field: 'identity' | 'question', nested: unknown) => ({
      ...authority,
      [field]: nested,
    });
    const hugeContextGetter = { ...authority.question } as Record<PropertyKey, unknown>;
    Object.defineProperty(hugeContextGetter, 'context', {
      enumerable: true,
      get: () => {
        sideEffects += 1;
        return 'x'.repeat(128 * 1024 + 1);
      },
    });
    const variants: unknown[] = [
      stateWith(new Proxy(authority, {})),
      stateWith({ ...authority, extra: true }),
      stateWith(extraSymbol(authority)),
      stateWith(withDescriptorForgery(authority, 'hidden', 'non-enumerable')),
      stateWith(withDescriptorForgery(authority, 'envelopeDigest', 'getter')),
      stateWith(authorityWith('identity', new Proxy(authority.identity, {}))),
      stateWith(authorityWith('identity', { ...authority.identity, extra: true })),
      stateWith(authorityWith('identity', extraSymbol(authority.identity))),
      stateWith(authorityWith('identity', withDescriptorForgery(
        authority.identity,
        'hidden',
        'non-enumerable',
      ))),
      stateWith(authorityWith('identity', withDescriptorForgery(
        authority.identity,
        'taskId',
        'getter',
      ))),
      stateWith(authorityWith('question', new Proxy(authority.question, {}))),
      stateWith(authorityWith('question', { ...authority.question, extra: true })),
      stateWith(authorityWith('question', extraSymbol(authority.question))),
      stateWith(authorityWith('question', withDescriptorForgery(
        authority.question,
        'hidden',
        'non-enumerable',
      ))),
      stateWith(authorityWith('question', withDescriptorForgery(
        authority.question,
        'question',
        'getter',
      ))),
      stateWith(authorityWith('question', hugeContextGetter)),
      stateWith(authority, new Proxy(publisher, {})),
      stateWith(authority, { ...publisher, extra: true }),
      stateWith(authority, extraSymbol(publisher)),
      stateWith(authority, withDescriptorForgery(publisher, 'hidden', 'non-enumerable')),
      stateWith(authority, withDescriptorForgery(publisher, 'publishAnswerFirstWriter', 'getter')),
    ];

    for (const variant of variants) {
      const report = await checkExactAttemptWorkerQuestions(
        tmpDir,
        new Set([authority.identity.taskId]),
        new Set<string>(),
        { resolveAuthority: () => variant as never },
      );
      expect(report.holds).toHaveLength(1);
      expect(report.answered).toEqual([]);
    }
    expect(sideEffects).toBe(0);
    expect(publisher.publishAnswerFirstWriter).not.toHaveBeenCalled();
  });

  it('revalidates through the same descriptor-safe resolver snapshot', async () => {
    const authority = exactQuestionAuthority(exactIdentity({ attemptId: 'attempt-revalidation-guard' }));
    const publisher = answerPublisher();
    let calls = 0;
    let getterSideEffects = 0;
    const forgedRevalidation: Record<string, unknown> = {};
    Object.defineProperty(forgedRevalidation, 'state', {
      enumerable: true,
      get: () => {
        getterSideEffects += 1;
        return 'question-ready';
      },
    });

    const report = await checkExactAttemptWorkerQuestions(
      tmpDir,
      new Set([authority.identity.taskId]),
      new Set<string>(),
      {
        resolveAuthority: () => {
          calls += 1;
          return (calls === 1
            ? { state: 'question-ready', authority, answerPublisher: publisher }
            : forgedRevalidation) as never;
        },
      },
    );

    expect(report.holds).toEqual([{
      taskId: authority.identity.taskId,
      reasonCode: 'EXACT_QUESTION_AUTHORITY_CHANGED',
    }]);
    expect(getterSideEffects).toBe(0);
    expect(publisher.publishAnswerFirstWriter).not.toHaveBeenCalled();
  });

  it('fails closed when private answer delivery is unavailable', async () => {
    const authority = exactQuestionAuthority(exactIdentity({ attemptId: 'attempt-no-answer-api' }));
    const report = await checkExactAttemptWorkerQuestions(
      tmpDir,
      new Set([authority.identity.taskId]),
      new Set<string>(),
      {
        resolveAuthority: () => ({
          state: 'question-ready',
          authority,
          answerPublisher: {
            publishAnswerFirstWriter: () => ({
              state: 'hold',
              reasonCode: 'PRIVATE_ANSWER_DELIVERY_UNAVAILABLE',
            }),
          },
        }),
      },
    );

    expect(report.answered).toEqual([]);
    expect(report.holds).toEqual([{
      taskId: authority.identity.taskId,
      reasonCode: 'PRIVATE_ANSWER_DELIVERY_UNAVAILABLE',
    }]);
    expect(existsSync(getAnswerPath(tmpDir, authority.identity.taskId))).toBe(false);
  });

  it('keeps hostile public projections as reconciliation debt without blocking private delivery', async () => {
    const authority = exactQuestionAuthority(exactIdentity({ attemptId: 'attempt-public-debt' }));
    const publisher = answerPublisher();
    writeFileSync(getQuestionPath(tmpDir, authority.identity.taskId), '{not-json', 'utf8');
    writeFileSync(getAnswerPath(tmpDir, authority.identity.taskId), '{not-json', 'utf8');

    const report = await checkExactAttemptWorkerQuestions(
      tmpDir,
      new Set([authority.identity.taskId]),
      new Set<string>(),
      {
        resolveAuthority: () => ({
          state: 'question-ready',
          authority,
          answerPublisher: publisher,
        }),
      },
    );

    expect(report.answered).toEqual([authority.identity.taskId]);
    expect(report.holds).toEqual([]);
    expect(report.projectionHolds).toEqual([
      {
        taskId: authority.identity.taskId,
        direction: 'question',
        reasonCode: 'PUBLIC_PROJECTION_CORRUPT',
      },
      {
        taskId: authority.identity.taskId,
        direction: 'answer',
        reasonCode: 'PUBLIC_PROJECTION_CORRUPT',
      },
    ]);
    expect(publisher.publishAnswerFirstWriter).toHaveBeenCalledTimes(1);
  });

  it('fails public reads closed when O_NOFOLLOW is unavailable while private delivery continues', async () => {
    const authority = exactQuestionAuthority(exactIdentity({ attemptId: 'attempt-no-nofollow' }));
    const publisher = answerPublisher();

    const report = await checkExactAttemptWorkerQuestions(
      tmpDir,
      new Set([authority.identity.taskId]),
      new Set<string>(),
      {
        resolveAuthority: () => ({
          state: 'question-ready',
          authority,
          answerPublisher: publisher,
        }),
        projectionReadCapability: { noFollowFlag: undefined },
      },
    );

    expect(report.answered).toEqual([authority.identity.taskId]);
    expect(report.holds).toEqual([]);
    expect(report.projectionHolds).toEqual([
      {
        taskId: authority.identity.taskId,
        direction: 'question',
        reasonCode: 'PUBLIC_PROJECTION_RECONCILIATION_REQUIRED',
      },
      {
        taskId: authority.identity.taskId,
        direction: 'answer',
        reasonCode: 'PUBLIC_PROJECTION_RECONCILIATION_REQUIRED',
      },
    ]);
    expect(publisher.publishAnswerFirstWriter).toHaveBeenCalledTimes(1);
    expect(existsSync(getQuestionPath(tmpDir, authority.identity.taskId))).toBe(false);
    expect(existsSync(getAnswerPath(tmpDir, authority.identity.taskId))).toBe(false);
  });

  it('rejects a private answer receipt whose recomputable digest was forged', async () => {
    const authority = exactQuestionAuthority(exactIdentity({ attemptId: 'attempt-forged-answer' }));
    const goodPublisher = answerPublisher();
    const report = await checkExactAttemptWorkerQuestions(
      tmpDir,
      new Set([authority.identity.taskId]),
      new Set<string>(),
      {
        resolveAuthority: () => ({
          state: 'question-ready',
          authority,
          answerPublisher: {
            publishAnswerFirstWriter: (input) => {
              const publication = goodPublisher.publishAnswerFirstWriter(input);
              if (publication.state === 'hold') return publication;
              return {
                state: 'published',
                receipt: { ...publication.receipt, receiptDigest: digest('9') },
              };
            },
          },
        }),
      },
    );

    expect(report.holds).toEqual([{
      taskId: authority.identity.taskId,
      reasonCode: 'PRIVATE_ANSWER_RECEIPT_INVALID',
    }]);
    expect(existsSync(getAnswerPath(tmpDir, authority.identity.taskId))).toBe(false);
  });

  it('accepts durable answered state without replaying private publication', async () => {
    const identity = exactIdentity({ attemptId: 'attempt-durable-answered' });
    const authority = exactQuestionAuthority(identity);
    const publisher = answerPublisher();
    expect((await checkExactAttemptWorkerQuestions(
      tmpDir,
      new Set([identity.taskId]),
      new Set<string>(),
      {
        resolveAuthority: () => ({
          state: 'question-ready',
          authority,
          answerPublisher: publisher,
        }),
      },
    )).answered).toEqual([identity.taskId]);
    const publicationInput = publisher.publishAnswerFirstWriter.mock.calls[0]![0];
    const publication = publisher.publishAnswerFirstWriter.mock.results[0]!.value;
    expect(publication.state).toBe('published');
    if (publication.state !== 'published') throw new Error('expected private answer publication');

    const report = await checkExactAttemptWorkerQuestions(
      tmpDir,
      new Set([identity.taskId]),
      new Set<string>(),
      {
        resolveAuthority: () => ({
          state: 'answered',
          authority,
          privateAnswerUtf8: Buffer.from(publicationInput.privateAnswerBytes).toString('utf8'),
          answerReceipt: publication.receipt,
        }),
      },
    );

    expect(report.answered).toEqual([identity.taskId]);
    expect(report.pending).toEqual([]);
    expect(report.holds).toEqual([]);
    expect(publisher.publishAnswerFirstWriter).toHaveBeenCalledTimes(1);
  });

  it('rejects foreign durable answered proof across fence, admission, envelope, and receipt changes', async () => {
    const identity = exactIdentity({ taskId: 'ipc-foreign-answered', attemptId: 'attempt-foreign' });
    const authority = exactQuestionAuthority(identity);
    const publisher = answerPublisher();
    expect((await checkExactAttemptWorkerQuestions(
      tmpDir,
      new Set([identity.taskId]),
      new Set<string>(),
      {
        resolveAuthority: () => ({ state: 'question-ready', authority, answerPublisher: publisher }),
      },
    )).answered).toEqual([identity.taskId]);
    const publicationInput = publisher.publishAnswerFirstWriter.mock.calls[0]![0];
    const publication = publisher.publishAnswerFirstWriter.mock.results[0]!.value;
    if (publication.state !== 'published') throw new Error('expected private answer publication');
    const privateAnswerUtf8 = Buffer.from(publicationInput.privateAnswerBytes).toString('utf8');
    const variants = [
      {
        authority: exactQuestionAuthority(identity, 1, { fenceDigest: digest('7') }),
        answerReceipt: publication.receipt,
      },
      {
        authority: exactQuestionAuthority(identity, 1, { admissionReceiptDigest: digest('8') }),
        answerReceipt: publication.receipt,
      },
      {
        authority: exactQuestionAuthority(identity, 1, { question: 'Foreign envelope' }),
        answerReceipt: publication.receipt,
      },
      {
        authority,
        answerReceipt: { ...publication.receipt, receiptDigest: digest('9') },
      },
    ];

    for (const variant of variants) {
      const report = await checkExactAttemptWorkerQuestions(
        tmpDir,
        new Set([identity.taskId]),
        new Set<string>(),
        {
          resolveAuthority: () => ({
            state: 'answered',
            authority: variant.authority,
            privateAnswerUtf8,
            answerReceipt: variant.answerReceipt,
          }),
        },
      );
      expect(report.answered).toEqual([]);
      expect(report.holds).toEqual([{
        taskId: identity.taskId,
        reasonCode: 'PRIVATE_ANSWER_RECEIPT_INVALID',
      }]);
    }
  });

  it('surfaces an asynchronous authority HOLD exactly once instead of silently restarting approval', async () => {
    const authority = exactQuestionAuthority(exactIdentity({ attemptId: 'attempt-async-hold' }));
    let currentAuthority = authority;
    const bridge = vi.fn(async () => ({
      kind: 'authority-hold' as const,
      reasonCode: 'EXACT_QUESTION_AUTHORITY_CHANGED' as const,
    }));
    const options = {
      resolveAuthority: () => ({
        state: 'question-ready' as const,
        authority: currentAuthority,
        answerPublisher: answerPublisher(),
      }),
      questionBridgeEnabled: true,
      bridge,
      broker: {} as never,
    };

    const first = await checkExactAttemptWorkerQuestions(
      tmpDir,
      new Set([authority.identity.taskId]),
      new Set<string>(),
      options,
    );
    expect(first.pending).toEqual([authority.identity.taskId]);

    for (let tick = 0; tick < 10 && bridge.mock.calls.length === 0; tick += 1) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    await new Promise(resolve => setTimeout(resolve, 0));

    const second = await checkExactAttemptWorkerQuestions(
      tmpDir,
      new Set([authority.identity.taskId]),
      new Set<string>(),
      options,
    );
    expect(second.pending).toEqual([]);
    expect(second.holds).toEqual([{
      taskId: authority.identity.taskId,
      reasonCode: 'EXACT_QUESTION_AUTHORITY_CHANGED',
    }]);
    expect(bridge).toHaveBeenCalledTimes(1);

    for (let poll = 0; poll < 3; poll += 1) {
      const repeated = await checkExactAttemptWorkerQuestions(
        tmpDir,
        new Set([authority.identity.taskId]),
        new Set<string>(),
        options,
      );
      expect(repeated.holds).toEqual([{
        taskId: authority.identity.taskId,
        reasonCode: 'EXACT_QUESTION_AUTHORITY_CHANGED',
      }]);
    }
    expect(bridge).toHaveBeenCalledTimes(1);

    currentAuthority = exactQuestionAuthority(authority.identity, 1, { fenceDigest: digest('6') });
    expect((await checkExactAttemptWorkerQuestions(
      tmpDir,
      new Set([authority.identity.taskId]),
      new Set<string>(),
      options,
    )).pending).toEqual([authority.identity.taskId]);
    for (let tick = 0; tick < 10 && bridge.mock.calls.length < 2; tick += 1) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    expect(bridge).toHaveBeenCalledTimes(2);
  });

  it('isolates registry capacity per run so a full project cannot starve another project', async () => {
    const rootA = mkdtempSync(join(tmpdir(), 'ipc-registry-run-a-'));
    const rootB = mkdtempSync(join(tmpdir(), 'ipc-registry-run-b-'));
    mkdirSync(join(rootA, '.tasks'), { recursive: true });
    mkdirSync(join(rootB, '.tasks'), { recursive: true });
    const registryA = createExactAttemptIpcTransientRegistry(rootA, { maxEntries: 1 });
    const registryB = createExactAttemptIpcTransientRegistry(rootB, { maxEntries: 1 });
    const authorityA1 = exactQuestionAuthority(exactIdentity({
      taskId: 'ipc-quota-a1', attemptId: 'attempt-a1',
    }));
    const authorityA2 = exactQuestionAuthority(exactIdentity({
      taskId: 'ipc-quota-a2', attemptId: 'attempt-a2',
    }));
    const authorityB = exactQuestionAuthority(exactIdentity({
      taskId: 'ipc-quota-b', attemptId: 'attempt-b',
    }));
    const never = new Promise<never>(() => undefined);
    const bridge = vi.fn(() => never);
    const authorities = new Map([
      [authorityA1.identity.taskId, authorityA1],
      [authorityA2.identity.taskId, authorityA2],
      [authorityB.identity.taskId, authorityB],
    ]);
    const resolver = (taskId: string) => ({
      state: 'question-ready' as const,
      authority: authorities.get(taskId)!,
      answerPublisher: answerPublisher(),
    });

    const runA = await checkExactAttemptWorkerQuestionsRaw(
      rootA,
      new Set([authorityA1.identity.taskId, authorityA2.identity.taskId]),
      new Set<string>(),
      {
        transientRegistry: registryA,
        resolveAuthority: resolver,
        questionBridgeEnabled: true,
        bridge: bridge as never,
        broker: {} as never,
      },
    );
    expect(runA.pending).toEqual([authorityA1.identity.taskId]);
    expect(runA.holds).toEqual([{
      taskId: authorityA2.identity.taskId,
      reasonCode: 'PRIVATE_IPC_AUTHORITY_UNAVAILABLE',
    }]);

    const runB = await checkExactAttemptWorkerQuestionsRaw(
      rootB,
      new Set([authorityB.identity.taskId]),
      new Set<string>(),
      {
        transientRegistry: registryB,
        resolveAuthority: resolver,
        questionBridgeEnabled: true,
        bridge: bridge as never,
        broker: {} as never,
      },
    );
    expect(runB.pending).toEqual([authorityB.identity.taskId]);
    expect(runB.holds).toEqual([]);
  });

  it('cleans collected latches and supersedes old attempt/generation for the same logical task', async () => {
    const taskId = 'ipc-lifecycle-cleanup';
    const oldAuthority = exactQuestionAuthority(exactIdentity({
      taskId, attemptId: 'attempt-old', generation: 3,
    }));
    let currentAuthority = oldAuthority;
    const bridge = vi.fn(async () => ({
      kind: 'authority-hold' as const,
      reasonCode: 'EXACT_QUESTION_AUTHORITY_CHANGED' as const,
    }));
    const options = {
      resolveAuthority: () => ({
        state: 'question-ready' as const,
        authority: currentAuthority,
        answerPublisher: answerPublisher(),
      }),
      questionBridgeEnabled: true,
      bridge,
      broker: {} as never,
    };
    const waitForBridgeCalls = async (count: number): Promise<void> => {
      for (let tick = 0; tick < 20 && bridge.mock.calls.length < count; tick += 1) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      expect(bridge).toHaveBeenCalledTimes(count);
      await new Promise(resolve => setTimeout(resolve, 0));
    };

    expect((await checkExactAttemptWorkerQuestions(
      tmpDir, new Set([taskId]), new Set<string>(), options,
    )).pending).toEqual([taskId]);
    await waitForBridgeCalls(1);
    expect((await checkExactAttemptWorkerQuestions(
      tmpDir, new Set([taskId]), new Set<string>(), options,
    )).holds).toHaveLength(1);

    await checkExactAttemptWorkerQuestions(tmpDir, new Set([taskId]), new Set([taskId]), options);
    expect((await checkExactAttemptWorkerQuestions(
      tmpDir, new Set([taskId]), new Set<string>(), options,
    )).pending).toEqual([taskId]);
    await waitForBridgeCalls(2);

    currentAuthority = exactQuestionAuthority(exactIdentity({
      taskId, attemptId: 'attempt-new', generation: 4,
    }));
    expect((await checkExactAttemptWorkerQuestions(
      tmpDir, new Set([taskId]), new Set<string>(), options,
    )).pending).toEqual([taskId]);
    await waitForBridgeCalls(3);
  });

  it('never reuses a settled async decision across fence, admission, or envelope authority changes', async () => {
    const mutations = [
      { name: 'fence', bindings: { fenceDigest: digest('7') } },
      { name: 'admission', bindings: { admissionReceiptDigest: digest('8') } },
      { name: 'envelope', bindings: { question: 'A newly captured exact question' } },
    ] as const;
    const waitUntil = async (predicate: () => boolean): Promise<void> => {
      for (let tick = 0; tick < 50 && !predicate(); tick += 1) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      expect(predicate()).toBe(true);
    };

    for (const mutation of mutations) {
      const taskId = `ipc-settled-${mutation.name}`;
      const identity = exactIdentity({ taskId, attemptId: `attempt-${mutation.name}` });
      const oldAuthority = exactQuestionAuthority(identity);
      const newAuthority = exactQuestionAuthority(identity, 1, mutation.bindings);
      const oldPublisher = answerPublisher();
      const newPublisher = answerPublisher();
      let currentAuthority = oldAuthority;
      let currentPublisher = oldPublisher;
      const bridge = vi.fn(async (question: { taskId: string }) => ({
        kind: 'bridged',
        answer: {
          taskId: question.taskId,
          action: 'continue',
          timestamp: '2026-09-01T08:00:02.000Z',
        },
      } as never));
      const options = {
        resolveAuthority: () => ({
          state: 'question-ready' as const,
          authority: currentAuthority,
          answerPublisher: currentPublisher,
        }),
        questionBridgeEnabled: true,
        bridge: bridge as never,
        broker: {} as never,
      };

      expect((await checkExactAttemptWorkerQuestions(
        tmpDir,
        new Set([taskId]),
        new Set<string>(),
        options,
      )).pending).toEqual([taskId]);
      await waitUntil(() => oldPublisher.publishAnswerFirstWriter.mock.calls.length === 1);
      for (let tick = 0; tick < 5; tick += 1) await new Promise(resolve => setTimeout(resolve, 0));

      currentAuthority = newAuthority;
      currentPublisher = newPublisher;
      const beforeNewPublication = await checkExactAttemptWorkerQuestions(
        tmpDir,
        new Set([taskId]),
        new Set<string>(),
        options,
      );
      expect(beforeNewPublication.answered).toEqual([]);
      expect(beforeNewPublication.pending).toEqual([taskId]);
      expect(newPublisher.publishAnswerFirstWriter).not.toHaveBeenCalled();

      await waitUntil(() => newPublisher.publishAnswerFirstWriter.mock.calls.length === 1);
      for (let tick = 0; tick < 5; tick += 1) await new Promise(resolve => setTimeout(resolve, 0));
      const afterNewPublication = await checkExactAttemptWorkerQuestions(
        tmpDir,
        new Set([taskId]),
        new Set<string>(),
        options,
      );
      expect(afterNewPublication.answered).toEqual([taskId]);
      expect(bridge).toHaveBeenCalledTimes(2);
      expect((await checkExactAttemptWorkerQuestions(
        tmpDir,
        new Set([taskId]),
        new Set<string>(),
        options,
      )).answered).toEqual([taskId]);
      expect(newPublisher.publishAnswerFirstWriter).toHaveBeenCalledTimes(1);
      expect(bridge).toHaveBeenCalledTimes(2);
    }
  });

  it('does not transfer an in-flight async decision across fence, admission, or envelope changes', async () => {
    const mutations = [
      { name: 'fence', bindings: { fenceDigest: digest('4') } },
      { name: 'admission', bindings: { admissionReceiptDigest: digest('5') } },
      { name: 'envelope', bindings: { question: 'Replacement in-flight question' } },
    ] as const;
    const waitUntil = async (predicate: () => boolean): Promise<void> => {
      for (let tick = 0; tick < 50 && !predicate(); tick += 1) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      expect(predicate()).toBe(true);
    };

    for (const mutation of mutations) {
      const taskId = `ipc-inflight-${mutation.name}`;
      const identity = exactIdentity({ taskId, attemptId: `attempt-${mutation.name}` });
      const oldAuthority = exactQuestionAuthority(identity);
      const newAuthority = exactQuestionAuthority(identity, 1, mutation.bindings);
      const oldPublisher = answerPublisher();
      const newPublisher = answerPublisher();
      let currentAuthority = oldAuthority;
      let currentPublisher = oldPublisher;
      let releaseOld: ((value: unknown) => void) | undefined;
      const oldDecision = new Promise<unknown>(resolve => { releaseOld = resolve; });
      let bridgeCalls = 0;
      const bridged = (questionTaskId: string) => ({
        kind: 'bridged',
        answer: {
          taskId: questionTaskId,
          action: 'continue',
          timestamp: '2026-09-01T08:00:02.000Z',
        },
      } as never);
      const bridge = vi.fn((question: { taskId: string }) => {
        bridgeCalls += 1;
        return bridgeCalls === 1
          ? oldDecision
          : Promise.resolve(bridged(question.taskId));
      });
      const options = {
        resolveAuthority: () => ({
          state: 'question-ready' as const,
          authority: currentAuthority,
          answerPublisher: currentPublisher,
        }),
        questionBridgeEnabled: true,
        bridge: bridge as never,
        broker: {} as never,
      };

      expect((await checkExactAttemptWorkerQuestions(
        tmpDir,
        new Set([taskId]),
        new Set<string>(),
        options,
      )).pending).toEqual([taskId]);
      await waitUntil(() => bridge.mock.calls.length === 1);

      currentAuthority = newAuthority;
      currentPublisher = newPublisher;
      const changed = await checkExactAttemptWorkerQuestions(
        tmpDir,
        new Set([taskId]),
        new Set<string>(),
        options,
      );
      expect(changed.answered).toEqual([]);
      expect(changed.pending).toEqual([taskId]);
      expect(newPublisher.publishAnswerFirstWriter).not.toHaveBeenCalled();

      await waitUntil(() => newPublisher.publishAnswerFirstWriter.mock.calls.length === 1);
      for (let tick = 0; tick < 5; tick += 1) await new Promise(resolve => setTimeout(resolve, 0));
      expect((await checkExactAttemptWorkerQuestions(
        tmpDir,
        new Set([taskId]),
        new Set<string>(),
        options,
      )).answered).toEqual([taskId]);

      releaseOld?.(bridged(taskId));
      for (let tick = 0; tick < 5; tick += 1) await new Promise(resolve => setTimeout(resolve, 0));
      expect(oldPublisher.publishAnswerFirstWriter).not.toHaveBeenCalled();
    }
  });

  it('keeps first-writer projection bytes unchanged for stale, newer, and sibling publications', async () => {
    const current = exactQuestionAuthority(exactIdentity({ generation: 4, attemptId: 'attempt-current' }));
    const stale = exactQuestionAuthority(exactIdentity({ generation: 3, attemptId: 'attempt-stale' }));
    const sibling = exactQuestionAuthority(exactIdentity({ generation: 4, attemptId: 'attempt-sibling' }));
    const path = getQuestionPath(tmpDir, current.identity.taskId);

    expect((await publishExactAttemptIpcCompatibilityProjection(tmpDir, 'question', current, {
      revalidate: () => true,
    })).state).toBe('published');
    const firstWriterBytes = readFileSync(path);
    expect(await publishExactAttemptIpcCompatibilityProjection(tmpDir, 'question', current, {
      revalidate: () => true,
    })).toEqual({ state: 'existing-identical' });
    expect(await publishExactAttemptIpcCompatibilityProjection(tmpDir, 'question', stale, {
      revalidate: () => true,
    })).toMatchObject({
      state: 'hold', reasonCode: 'PUBLIC_PROJECTION_STALE',
    });
    expect(readFileSync(path)).toEqual(firstWriterBytes);
    expect(await publishExactAttemptIpcCompatibilityProjection(tmpDir, 'question', sibling, {
      revalidate: () => true,
    })).toMatchObject({
      state: 'hold', reasonCode: 'PUBLIC_PROJECTION_SIBLING',
    });
    expect(readFileSync(path)).toEqual(firstWriterBytes);

    const forwardTaskId = 'ipc-exact-forward-projection';
    const older = exactQuestionAuthority(exactIdentity({
      taskId: forwardTaskId,
      generation: 3,
      attemptId: 'attempt-older',
    }));
    const newer = exactQuestionAuthority(exactIdentity({
      taskId: forwardTaskId,
      generation: 4,
      attemptId: 'attempt-newer',
    }));
    expect((await publishExactAttemptIpcCompatibilityProjection(tmpDir, 'question', older, {
      revalidate: () => true,
    })).state).toBe('published');
    const olderPath = getQuestionPath(tmpDir, forwardTaskId);
    const olderFirstWriterBytes = readFileSync(olderPath);
    expect(await publishExactAttemptIpcCompatibilityProjection(tmpDir, 'question', newer, {
      revalidate: () => true,
    })).toEqual({ state: 'hold', reasonCode: 'PUBLIC_PROJECTION_STALE' });
    expect(readFileSync(olderPath)).toEqual(olderFirstWriterBytes);
  });

  it('rejects a copied envelope digest when legacy-visible projection content was changed', async () => {
    const authority = exactQuestionAuthority(exactIdentity({ attemptId: 'attempt-projection-spoof' }));
    expect((await publishExactAttemptIpcCompatibilityProjection(tmpDir, 'question', authority, {
      revalidate: () => true,
    })).state).toBe('published');

    const path = getQuestionPath(tmpDir, authority.identity.taskId);
    const spoofed = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    spoofed['question'] = 'public attacker changed legacy-visible content';
    writeFileSync(path, JSON.stringify(spoofed), 'utf8');

    expect(await publishExactAttemptIpcCompatibilityProjection(tmpDir, 'question', authority, {
      revalidate: () => true,
    })).toEqual({ state: 'hold', reasonCode: 'PUBLIC_PROJECTION_SPOOF' });
  });

  it('rejects a hard-linked compatibility projection through fd-bound link-count validation', async () => {
    const authority = exactQuestionAuthority(exactIdentity({ attemptId: 'attempt-projection-link' }));
    expect((await publishExactAttemptIpcCompatibilityProjection(tmpDir, 'question', authority, {
      revalidate: () => true,
    })).state).toBe('published');

    linkSync(
      getQuestionPath(tmpDir, authority.identity.taskId),
      join(tmpDir, 'projection-hardlink.json'),
    );
    expect(await publishExactAttemptIpcCompatibilityProjection(tmpDir, 'question', authority, {
      revalidate: () => true,
    })).toEqual({ state: 'hold', reasonCode: 'PUBLIC_PROJECTION_SPOOF' });
  });
});
