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
import type { ApprovalBrokerLike } from '../core/approval-worker-gate.js';
// Type-only — question-approval-bridge.ts imports NPM_ADVISORY_MARKER (a VALUE)
// from THIS file, so a value-import back here would be a real runtime import
// cycle. `import type` is erased at compile time (ADR-D-001 nodenext), so the
// shapes below cost nothing at runtime; the actual `bridgeQuestionToApproval`
// function is injected by the caller via HandleWorkerQuestionOptions.bridge —
// see CKPT-QUESTION-BRIDGE-WIRE (358-007) below.
import type { QuestionBridgeOptions, QuestionBridgeResult } from './question-approval-bridge.js';

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

  // ─── CKPT-QUESTION-BRIDGE-WIRE (358-007) seam ──────────────────────────
  // Sprint-357 built `bridgeQuestionToApproval` (question-approval-bridge.ts)
  // as a pure, deliberately-unwired module. This seam threads it into the live
  // question loop: when `questionBridgeEnabled` reads true AND both `bridge`
  // and `broker` are supplied, a non-NPM-ADVISORY question is delegated to the
  // runtime-wide ApprovalBroker instead of the hardcoded/suggestedAction
  // auto-answer below. Omit any of the three and behavior is byte-for-byte the
  // historical auto-answer — the seam is fully caller-opt-in.

  /**
   * Injected `bridgeQuestionToApproval`-shaped function. Typed structurally
   * (not imported as a value — see the `import type` note above) so a real
   * caller can pass the function straight through with no wrapper.
   */
  bridge?: (
    question: WorkerQuestion,
    broker: ApprovalBrokerLike,
    opts?: QuestionBridgeOptions,
  ) => Promise<QuestionBridgeResult>;
  /** The ApprovalBrokerLike instance the bridged question submits to. Required
   *  alongside `bridge` for the seam to activate. */
  broker?: ApprovalBrokerLike;
  /**
   * Pre-computed `approval.question_bridge` config flag (caller derives this
   * via `isQuestionBridgeEnabled(config)` from question-approval-bridge.ts —
   * kept out of this module to avoid importing that reader as a value).
   * Default-off: omitted/false means the bridge seam never activates even when
   * `bridge` + `broker` are both supplied.
   */
  questionBridgeEnabled?: boolean;
}

// ─── CKPT-QUESTION-BRIDGE-WIRE in-flight guard ─────────────────────────────
// A poll loop calls checkWorkerQuestions every tick against the SAME
// still-unconsumed .question file (the worker only deletes it after reading
// its .answer). Without this guard, every tick while a broker round-trip is
// pending would submit a fresh duplicate ApprovalRequest. Keyed by taskId —
// cleared once the in-flight bridge call settles (success or error).
const inFlightBridgeTaskIds = new Set<string>();

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

  // CKPT-QUESTION-BRIDGE-WIRE (358-007): flag-on + seam-supplied → delegate to
  // the runtime-wide ApprovalBroker instead of the hardcoded/suggestedAction
  // auto-answer below. NPM-ADVISORY questions never reach here (returned above,
  // unconditionally, regardless of this flag). Flag-off, or bridge/broker
  // omitted, falls straight through to the byte-identical historical path.
  if (options?.questionBridgeEnabled === true && options.bridge !== undefined && options.broker !== undefined) {
    // A prior tick's bridge call already settled this question — surface that
    // answer directly. Never re-submit a question that already has an answer.
    const settled = readAnswerFile(projectRoot, taskId);
    if (settled) return settled;

    if (!inFlightBridgeTaskIds.has(taskId)) {
      inFlightBridgeTaskIds.add(taskId);
      const bridge = options.bridge;
      const broker = options.broker;
      bridge(question, broker)
        .then((result) => {
          if (result.kind === 'bridged') {
            writeAnswerFile(projectRoot, result.answer);
            debugLog(
              'handleWorkerQuestion',
              `Bridged question for task ${taskId} → '${result.answer.action}' via ${result.decision.channel}`,
            );
          } else {
            // Structurally unreachable: the NPM-ADVISORY branch above already
            // returns before this seam is ever reached for such a question.
            debugLog('handleWorkerQuestion', `Unexpected bridge rejection for task ${taskId}: ${result.note}`);
          }
        })
        .catch((err: unknown) => {
          debugLog(
            'handleWorkerQuestion',
            `Bridge error for task ${taskId}: ${err instanceof Error ? err.message : String(err)}`,
          );
        })
        .finally(() => {
          inFlightBridgeTaskIds.delete(taskId);
        });
    }

    // Fire-and-forget: checkWorkerQuestions' poll loop must not block on the
    // broker round-trip. The .answer file is written whenever the bridge
    // settles (above); this call itself returns undefined until it does.
    return undefined;
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
