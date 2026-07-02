// ═══ IPC Channel Registry + File-Based IPC ═════════════════════════
// Centralized IPC module: manages WorkerChannel registry for subprocess
// workers AND file-based question/answer IPC for tmux/docker workers.
//
// Sprint 135 T-004: askBrain(), file-based helpers, and question handlers
// moved here from worker-ipc.ts and result-collector.ts.
// worker-ipc.ts re-exports for backward compatibility.

import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ChannelRegistry } from '../agents/worker-ipc.js';
import type { WorkerChannel } from '../agents/worker-ipc.js';
import type { WorkerSideChannel } from '../agents/worker-ipc.js';
import { TASKS_DIR } from '../core/constants.js';
import type { WorkerQuestion, BrainAnswer, QuestionAction } from '../core/task-types.js';
import { debugLog } from '../core/utils.js';
import { notifyAsync } from '../core/notify.js';

// ─── Channel Registry (Sprint 134) ─────────────────────────────────

/**
 * Module-level registry that maps taskId -> WorkerChannel.
 * Populated when workers are spawned via child_process.fork (subprocess backend).
 * tmux-based workers do not populate this registry -- they use file-based heartbeats.
 *
 * Lazy-initialized to avoid circular dependency issues with worker-ipc.ts
 * (ipc-registry ↔ worker-ipc re-export cycle).
 */
let _channelRegistry: ChannelRegistry | null = null;

function ensureRegistry(): ChannelRegistry {
  if (!_channelRegistry) {
    _channelRegistry = new ChannelRegistry();
  }
  return _channelRegistry;
}

/**
 * Returns the module-level ChannelRegistry (used by Brain and tests).
 * @internal Used only within orchestra/ — not part of the public API surface.
 */
export function getChannelRegistry(): ChannelRegistry {
  return ensureRegistry();
}

/**
 * Register a WorkerChannel for a given taskId.
 * @internal Used only within orchestra/ — not part of the public API surface.
 */
export function registerWorkerChannel(taskId: string, channel: WorkerChannel): void {
  ensureRegistry().register(taskId, channel);
}

/**
 * Unregister and close the WorkerChannel for a given taskId.
 * @internal Used only within orchestra/ — not part of the public API surface.
 */
export function unregisterWorkerChannel(taskId: string): void {
  ensureRegistry().remove(taskId);
}

// ─── File-based Question/Answer IPC ────────────────────────────────
// Used when workers run in tmux/docker backends without process.send support.
// Worker writes .question file, Brain reads it and writes .answer file.

/** Get the path for a worker's question file */
export function getQuestionPath(projectRoot: string, taskId: string): string {
  return join(projectRoot, TASKS_DIR, `task-${taskId}.question`);
}

/** Get the path for a brain's answer file */
export function getAnswerPath(projectRoot: string, taskId: string): string {
  return join(projectRoot, TASKS_DIR, `task-${taskId}.answer`);
}

/** Write a question file from the worker side */
export function writeQuestionFile(projectRoot: string, question: WorkerQuestion): void {
  const path = getQuestionPath(projectRoot, question.taskId);
  writeFileSync(path, JSON.stringify(question, null, 2), 'utf-8');
}

/** Read a question file (returns undefined if not found or invalid) */
export function readQuestionFile(projectRoot: string, taskId: string): WorkerQuestion | undefined {
  const path = getQuestionPath(projectRoot, taskId);
  try {
    const raw = readFileSync(path, 'utf-8');
    return JSON.parse(raw) as WorkerQuestion;
  } catch {
    return undefined;
  }
}

/** Write an answer file from the Brain side */
export function writeAnswerFile(projectRoot: string, answer: BrainAnswer): void {
  const path = getAnswerPath(projectRoot, answer.taskId);
  writeFileSync(path, JSON.stringify(answer, null, 2), 'utf-8');
}

/** Read an answer file (returns undefined if not found or invalid) */
export function readAnswerFile(projectRoot: string, taskId: string): BrainAnswer | undefined {
  const path = getAnswerPath(projectRoot, taskId);
  try {
    const raw = readFileSync(path, 'utf-8');
    return JSON.parse(raw) as BrainAnswer;
  } catch {
    return undefined;
  }
}

/** Clean up both question and answer files for a task */
export function cleanupQuestionFiles(projectRoot: string, taskId: string): void {
  const qPath = getQuestionPath(projectRoot, taskId);
  const aPath = getAnswerPath(projectRoot, taskId);
  try { if (existsSync(qPath)) unlinkSync(qPath); } catch { /* noop */ }
  try { if (existsSync(aPath)) unlinkSync(aPath); } catch { /* noop */ }
}

// ─── askBrain — File-based Question Mechanism ──────────────────────

/**
 * askBrain — File-based question mechanism for workers.
 *
 * 1. Writes a .question file with the worker's question
 * 2. Polls for a .answer file at the given interval
 * 3. Returns the answer action, or the default 'continue' on timeout
 * 4. Cleans up question/answer files after resolution
 *
 * @param projectRoot - Project root directory
 * @param taskId - The task ID
 * @param workerId - The worker ID
 * @param question - The question text
 * @param options - Polling and timeout options
 * @returns The action from Brain's answer
 */
export async function askBrain(
  projectRoot: string,
  taskId: string,
  workerId: string,
  question: string,
  options?: {
    context?: string;
    suggestedAction?: QuestionAction;
    timeoutMs?: number;
    pollIntervalMs?: number;
    channel?: WorkerSideChannel;
  },
): Promise<BrainAnswer> {
  const timeoutMs = options?.timeoutMs ?? 60_000;
  const pollIntervalMs = options?.pollIntervalMs ?? 1_000;

  const questionData: WorkerQuestion = {
    taskId,
    workerId,
    question,
    context: options?.context,
    suggestedAction: options?.suggestedAction,
    timestamp: new Date().toISOString(),
  };

  const channel = options?.channel;

  // If IPC channel is available and supports IPC, send question via IPC
  if (channel && channel.supportsIPC() && !channel.isClosed()) {
    return new Promise<BrainAnswer>((resolve) => {
      const timer = setTimeout(() => {
        const defaultAnswer: BrainAnswer = {
          taskId,
          action: 'continue',
          message: 'Auto-continue: IPC question timed out waiting for Brain response',
          timestamp: new Date().toISOString(),
        };
        resolve(defaultAnswer);
      }, timeoutMs);

      channel.onMessage('ANSWER', (msg) => {
        clearTimeout(timer);
        const answer = msg.payload as BrainAnswer;
        resolve(answer ?? {
          taskId,
          action: 'continue',
          message: 'Auto-continue: Brain answered via IPC',
          timestamp: new Date().toISOString(),
        });
      });

      channel.send('QUESTION', questionData);
      // Also write file for compatibility
      writeQuestionFile(projectRoot, questionData);
    });
  }

  // File-based fallback for tmux/docker backends
  writeQuestionFile(projectRoot, questionData);

  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const answer = readAnswerFile(projectRoot, taskId);
    if (answer) {
      cleanupQuestionFiles(projectRoot, taskId);
      return answer;
    }
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }

  // Timeout — return default 'continue' answer
  const defaultAnswer: BrainAnswer = {
    taskId,
    action: 'continue',
    message: 'Auto-continue: question timed out waiting for Brain response',
    timestamp: new Date().toISOString(),
  };

  cleanupQuestionFiles(projectRoot, taskId);
  return defaultAnswer;
}

// ─── Brain-Side Question Handlers ──────────────────────────────────
// Moved from result-collector.ts — Brain auto-answers worker questions.

/** Options for {@link handleWorkerQuestion} / {@link checkWorkerQuestions}. */
export interface HandleWorkerQuestionOptions {
  /**
   * Flag-gated, default-off (mirrors config `honor_worker_question_action`).
   * When `true` AND the worker's question carries a `suggestedAction`, Brain
   * writes that action into the answer instead of the hardcoded `'continue'`.
   * When omitted/false, or when no `suggestedAction` is present, behaviour is
   * byte-for-byte the historical `'continue'` auto-answer.
   *
   * NPM-ADVISORY questions are exempt: their answer is a deterministic policy
   * (fail-closed `'continue'` + explicit not-approved message) regardless of
   * this flag — a worker cannot self-approve a dependency mutation.
   */
  honorWorkerQuestionAction?: boolean;
  /** Sprint id for human-facing notifications (NPM-ADVISORY surfacing). When
   *  absent the advisory is still answered + debug-logged, just not notified. */
  sprintId?: string;
}

// ─── NPM-ADVISORY (born-454) ────────────────────────────────────────
// Worker-side marker for dependency-mutation escalation. The god-prompt
// (prompt-god-template.ts NPM_ADVISORY_BLOCK) instructs workers to prefix
// their question with this token instead of ever running npm/yarn/pnpm
// install in the mounted workspace (sprint-356 live incident: native-binding
// destruction via host-vs-container ABI + `.npmrc ignore-scripts=true`).

/** Question-text marker for a dependency-mutation advisory. */
export const NPM_ADVISORY_MARKER = '[NPM-ADVISORY]';

/** Deterministic fail-closed answer body for NPM-ADVISORY questions. */
export const NPM_ADVISORY_ANSWER_MESSAGE =
  'NPM-ADVISORY acknowledged — dependency mutation is NOT approved inside the workspace. '
  + 'Do NOT run npm/yarn/pnpm install|ci|rebuild|update. Continue the task without the '
  + 'dependency change, record the need in your .result notes on an `npmAdvisory:` line, '
  + 'and self-assess honestly. Dependency changes are performed host-side by the operator.';

function isNpmAdvisoryQuestion(question: WorkerQuestion): boolean {
  return question.question.trimStart().startsWith(NPM_ADVISORY_MARKER);
}

/**
 * Handle a single worker question by writing an auto-answer.
 *
 * By default (flag off) Brain auto-responds with `'continue'` — the historical
 * "Future: Human Checkpoint" stub behaviour. When
 * `options.honorWorkerQuestionAction` is `true` (config `honor_worker_question_action`)
 * AND the worker supplied a `suggestedAction` (`'skip' | 'abort' | 'retry' | 'continue'`),
 * Brain honors that requested action instead of the hardcoded continue.
 *
 * @returns The answer that was written, or undefined if no question was found
 */
export function handleWorkerQuestion(
  projectRoot: string,
  taskId: string,
  options?: HandleWorkerQuestionOptions,
): BrainAnswer | undefined {
  const question = readQuestionFile(projectRoot, taskId);
  if (!question) return undefined;

  // NPM-ADVISORY (born-454): deterministic policy branch — fail-closed
  // 'continue' + explicit not-approved message, suggestedAction NEVER honored
  // (a worker cannot self-approve a dependency mutation). Notified to the
  // human exactly once: re-answer cycles (the poll loop re-visits an
  // unconsumed question file every tick) skip the notify when an answer for
  // this task already exists on disk.
  if (isNpmAdvisoryQuestion(question)) {
    const firstAnswer = !existsSync(getAnswerPath(projectRoot, taskId));
    const answer: BrainAnswer = {
      taskId,
      action: 'continue',
      message: NPM_ADVISORY_ANSWER_MESSAGE,
      timestamp: new Date().toISOString(),
    };
    writeAnswerFile(projectRoot, answer);
    debugLog('handleWorkerQuestion', `NPM-ADVISORY from task ${taskId}: "${question.question}" → fail-closed continue`);
    if (firstAnswer && options?.sprintId) {
      notifyAsync(
        'human-checkpoint-required',
        options.sprintId,
        `NPM advisory — task ${taskId}`,
        question.question,
        question.context,
      );
    }
    return answer;
  }

  // Flag-gated (default-off): honor the worker's requested action only when the
  // flag is ON and a suggestedAction was actually supplied. Otherwise fall back
  // to the historical 'continue' auto-answer, byte-for-byte.
  const honored: QuestionAction =
    options?.honorWorkerQuestionAction === true && question.suggestedAction !== undefined
      ? question.suggestedAction
      : 'continue';

  const answer: BrainAnswer =
    honored === 'continue'
      ? {
          taskId,
          action: 'continue',
          message: 'Auto-continue: Brain acknowledged question',
          timestamp: new Date().toISOString(),
        }
      : {
          taskId,
          action: honored,
          message: `Auto-${honored}: Brain honored worker's suggested action`,
          timestamp: new Date().toISOString(),
        };

  writeAnswerFile(projectRoot, answer);
  debugLog('handleWorkerQuestion', `Auto-answered question for task ${taskId} with '${honored}': "${question.question}"`);
  return answer;
}

/**
 * Check all active (uncollected) tasks for pending .question files.
 * Called on each poll cycle in the waitForResults loop.
 *
 * @param projectRoot - Project root directory
 * @param taskIds - All task IDs in the sprint
 * @param collectedIds - Already collected (finished) task IDs
 * @param options - Forwarded to {@link handleWorkerQuestion} (flag-gated suggestedAction honoring)
 * @returns Array of task IDs that had questions answered
 */
export function checkWorkerQuestions(
  projectRoot: string,
  taskIds: Set<string>,
  collectedIds: Set<string>,
  options?: HandleWorkerQuestionOptions,
): string[] {
  const answered: string[] = [];
  for (const taskId of taskIds) {
    if (collectedIds.has(taskId)) continue;
    const questionPath = getQuestionPath(projectRoot, taskId);
    if (existsSync(questionPath)) {
      const result = handleWorkerQuestion(projectRoot, taskId, options);
      if (result) answered.push(taskId);
    }
  }
  return answered;
}
