// ═══ Task 334-004 (A20) — handleWorkerQuestion honors worker suggestedAction ═══
// Flag-gated (default-off) honoring of WorkerQuestion.suggestedAction.
// Pre-fix RED: handleWorkerQuestion ALWAYS wrote action:'continue', dropping the
// worker's suggestedAction. These tests lock in: flag-on + suggestedAction → honored;
// flag-off (default) or no suggestedAction → byte-for-byte 'continue'.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  handleWorkerQuestion,
  checkWorkerQuestions,
  writeQuestionFile,
  getAnswerPath,
} from '../../src/orchestra/ipc-registry.js';
import type { BrainAnswer } from '../../src/core/task-types.js';

function readAnswer(root: string, taskId: string): BrainAnswer {
  return JSON.parse(readFileSync(getAnswerPath(root, taskId), 'utf-8')) as BrainAnswer;
}

describe('handleWorkerQuestion — suggestedAction honoring (A20, flag-gated)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'deckent-a20-'));
    mkdirSync(join(tmpDir, '.tasks'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('flag ON + suggestedAction:"abort" → honors abort (pre-fix RED was always continue)', () => {
    writeQuestionFile(tmpDir, {
      taskId: 'a20-abort',
      workerId: 'w-a20-abort',
      question: 'Scope is impossible — abort?',
      suggestedAction: 'abort',
      timestamp: new Date().toISOString(),
    });

    const answer = handleWorkerQuestion(tmpDir, 'a20-abort', { honorWorkerQuestionAction: true });

    expect(answer).toBeDefined();
    expect(answer!.action).toBe('abort');
    // The written answer file must reflect the honored action, not 'continue'.
    expect(readAnswer(tmpDir, 'a20-abort').action).toBe('abort');
    expect(answer!.message).toContain('abort');
  });

  it('flag ON + suggestedAction:"retry" → honors retry', () => {
    writeQuestionFile(tmpDir, {
      taskId: 'a20-retry',
      workerId: 'w-a20-retry',
      question: 'Transient failure — retry?',
      suggestedAction: 'retry',
      timestamp: new Date().toISOString(),
    });

    const answer = handleWorkerQuestion(tmpDir, 'a20-retry', { honorWorkerQuestionAction: true });

    expect(answer!.action).toBe('retry');
    expect(readAnswer(tmpDir, 'a20-retry').action).toBe('retry');
  });

  it('flag ON + NO suggestedAction → falls back to continue', () => {
    writeQuestionFile(tmpDir, {
      taskId: 'a20-noaction',
      workerId: 'w-a20-noaction',
      question: 'Just checking in.',
      timestamp: new Date().toISOString(),
    });

    const answer = handleWorkerQuestion(tmpDir, 'a20-noaction', { honorWorkerQuestionAction: true });

    expect(answer!.action).toBe('continue');
    expect(answer!.message).toBe('Auto-continue: Brain acknowledged question');
  });

  it('flag ON + suggestedAction:"continue" → continue (historical message preserved)', () => {
    writeQuestionFile(tmpDir, {
      taskId: 'a20-cont',
      workerId: 'w-a20-cont',
      question: 'Proceed?',
      suggestedAction: 'continue',
      timestamp: new Date().toISOString(),
    });

    const answer = handleWorkerQuestion(tmpDir, 'a20-cont', { honorWorkerQuestionAction: true });

    expect(answer!.action).toBe('continue');
    expect(answer!.message).toBe('Auto-continue: Brain acknowledged question');
  });

  it('flag OFF (default 2-arg call) + suggestedAction:"retry" → continue, byte-for-byte today', () => {
    writeQuestionFile(tmpDir, {
      taskId: 'a20-off',
      workerId: 'w-a20-off',
      question: 'Transient failure — retry?',
      suggestedAction: 'retry',
      timestamp: new Date().toISOString(),
    });

    const answer = handleWorkerQuestion(tmpDir, 'a20-off');

    expect(answer!.action).toBe('continue');
    expect(answer!.message).toBe('Auto-continue: Brain acknowledged question');
    expect(readAnswer(tmpDir, 'a20-off').action).toBe('continue');
  });

  it('flag explicitly false + suggestedAction:"skip" → continue', () => {
    writeQuestionFile(tmpDir, {
      taskId: 'a20-false',
      workerId: 'w-a20-false',
      question: 'Skip this one?',
      suggestedAction: 'skip',
      timestamp: new Date().toISOString(),
    });

    const answer = handleWorkerQuestion(tmpDir, 'a20-false', { honorWorkerQuestionAction: false });

    expect(answer!.action).toBe('continue');
  });

  it('returns undefined when no question file exists (unchanged)', () => {
    expect(handleWorkerQuestion(tmpDir, 'a20-missing', { honorWorkerQuestionAction: true })).toBeUndefined();
  });
});

describe('checkWorkerQuestions — forwards the honor flag', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'deckent-a20-cwq-'));
    mkdirSync(join(tmpDir, '.tasks'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('flag ON → honored action written for the pending question', () => {
    writeQuestionFile(tmpDir, {
      taskId: 'cwq-abort',
      workerId: 'w-cwq-abort',
      question: 'abort?',
      suggestedAction: 'abort',
      timestamp: new Date().toISOString(),
    });

    const answered = checkWorkerQuestions(
      tmpDir,
      new Set(['cwq-abort']),
      new Set<string>(),
      { honorWorkerQuestionAction: true },
    );

    expect(answered).toContain('cwq-abort');
    expect(readAnswer(tmpDir, 'cwq-abort').action).toBe('abort');
  });

  it('flag OFF (default 3-arg call) → continue, byte-for-byte today', () => {
    writeQuestionFile(tmpDir, {
      taskId: 'cwq-off',
      workerId: 'w-cwq-off',
      question: 'abort?',
      suggestedAction: 'abort',
      timestamp: new Date().toISOString(),
    });

    const answered = checkWorkerQuestions(tmpDir, new Set(['cwq-off']), new Set<string>());

    expect(answered).toContain('cwq-off');
    expect(readAnswer(tmpDir, 'cwq-off').action).toBe('continue');
  });
});
