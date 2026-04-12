/**
 * tests/orchestra/ipc-registry.test.ts
 *
 * Tests for the centralized IPC registry module.
 * Sprint 135 T-004: Extended with askBrain, file-based IPC helpers,
 * handleWorkerQuestion, checkWorkerQuestions, and backward compat shim tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ─── Channel Registry Tests (mocked) ──────────────────────────────

vi.mock('../../src/agents/worker-ipc.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/agents/worker-ipc.js')>();
  return actual;
});

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
} from '../../src/orchestra/ipc-registry.js';

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
