/**
 * worker-ipc.ts — Process-based Worker IPC via process.send/message
 *
 * WorkerChannel enables bidirectional communication between Brain and Worker
 * processes when workers are spawned via child_process.fork().
 * Falls back to file-based heartbeat for tmux-based workers.
 */

import type { ChildProcess } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { TASKS_DIR } from '../core/constants.js';
import type { WorkerQuestion, BrainAnswer, QuestionAction } from '../core/task-types.js';

// ─── Message Types ───────────────────────────────────────────────────────────

export type IPCMessageType =
  | 'HEARTBEAT'
  | 'STATUS_REQUEST'
  | 'STATUS_RESPONSE'
  | 'PAUSE'
  | 'RESUME'
  | 'KILL'
  | 'QUESTION'
  | 'ANSWER';

export interface IPCMessage {
  type: IPCMessageType;
  taskId: string;
  payload?: unknown;
  timestamp: string;
}

export interface HeartbeatPayload {
  status: string;
  currentAction?: string;
  filesChangedCount?: number;
  sequence?: number;
}

export interface StatusResponsePayload {
  status: string;
  pid?: number;
  uptime?: number;
  memoryUsage?: NodeJS.MemoryUsage;
}

// ─── Handler Type ─────────────────────────────────────────────────────────────

export type IPCMessageHandler = (message: IPCMessage) => void;

// ─── WorkerChannel ────────────────────────────────────────────────────────────

/**
 * WorkerChannel — wraps a child_process (fork) handle or process itself
 * to provide typed IPC communication.
 *
 * Usage (in Brain, parent side):
 *   const channel = new WorkerChannel(childProcess, taskId);
 *   channel.onMessage('HEARTBEAT', handler);
 *   channel.send('PAUSE', {});
 *
 * Usage (in Worker, child side):
 *   const channel = new WorkerChannel(process as unknown as ChildProcess, taskId);
 *   channel.send('HEARTBEAT', { status: 'EXECUTING' });
 *   channel.onMessage('PAUSE', handler);
 */
export class WorkerChannel {
  private readonly proc: ChildProcess;
  private readonly taskId: string;
  private readonly handlers = new Map<IPCMessageType, IPCMessageHandler[]>();
  private readonly boundListener: (msg: IPCMessage) => void;
  private closed = false;

  constructor(proc: ChildProcess, taskId: string) {
    this.proc = proc;
    this.taskId = taskId;
    this.boundListener = (msg: IPCMessage) => this._dispatch(msg);

    if (typeof this.proc.on === 'function') {
      this.proc.on('message', this.boundListener);
    }
  }

  /**
   * Register a handler for a specific message type.
   */
  onMessage(type: IPCMessageType, handler: IPCMessageHandler): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    const handlers = this.handlers.get(type);
    if (handlers) handlers.push(handler); // narrowed: set() called above
  }

  /**
   * Send a message to the other side of the channel.
   * Returns true if the message was sent, false if the channel is closed
   * or the process does not support IPC.
   */
  send(type: IPCMessageType, payload?: unknown): boolean {
    if (this.closed) return false;

    const message: IPCMessage = {
      type,
      taskId: this.taskId,
      payload,
      timestamp: new Date().toISOString(),
    };

    // If proc has a send function (child_process.fork IPC channel)
    if (typeof this.proc.send === 'function') {
      try {
        return this.proc.send(message);
      } catch {
        return false;
      }
    }

    return false;
  }

  /**
   * Send a HEARTBEAT message with the given payload.
   */
  sendHeartbeat(payload: HeartbeatPayload): boolean {
    return this.send('HEARTBEAT', payload);
  }

  /**
   * Send a STATUS_REQUEST to ask the worker for its current status.
   */
  requestStatus(): boolean {
    return this.send('STATUS_REQUEST');
  }

  /**
   * Send a PAUSE message to pause the worker.
   */
  pause(): boolean {
    return this.send('PAUSE');
  }

  /**
   * Send a RESUME message to resume a paused worker.
   */
  resume(): boolean {
    return this.send('RESUME');
  }

  /**
   * Send a KILL message to request graceful shutdown.
   */
  kill(): boolean {
    return this.send('KILL');
  }

  /**
   * Close the channel and remove all listeners.
   */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.handlers.clear();

    if (typeof this.proc.off === 'function') {
      this.proc.off('message', this.boundListener);
    } else if (typeof this.proc.removeListener === 'function') {
      this.proc.removeListener('message', this.boundListener);
    }
  }

  /**
   * Returns true if the channel has been closed.
   */
  isClosed(): boolean {
    return this.closed;
  }

  /**
   * Returns true if the underlying process supports IPC (has a send function).
   */
  supportsIPC(): boolean {
    return typeof this.proc.send === 'function';
  }

  private _dispatch(msg: unknown): void {
    if (!isIPCMessage(msg)) return;
    if (msg.taskId !== this.taskId) return;

    const handlers = this.handlers.get(msg.type);
    if (!handlers) return;

    for (const handler of handlers) {
      try {
        handler(msg);
      } catch {
        // Swallow handler errors to keep channel stable
      }
    }
  }
}

// ─── Type Guard ───────────────────────────────────────────────────────────────

export function isIPCMessage(value: unknown): value is IPCMessage {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj['type'] === 'string' &&
    typeof obj['taskId'] === 'string' &&
    typeof obj['timestamp'] === 'string'
  );
}

// ─── WorkerSideChannel ────────────────────────────────────────────────────────

/**
 * WorkerSideChannel — used inside the worker process to communicate back
 * to the parent (Brain). Wraps process.send for sending and process.on('message')
 * for receiving.
 *
 * This is only valid when the worker was spawned via child_process.fork().
 */
export class WorkerSideChannel {
  private readonly taskId: string;
  private readonly handlers = new Map<IPCMessageType, IPCMessageHandler[]>();
  private closed = false;
  private readonly boundListener: (msg: unknown) => void;
  /** Injectable event emitter — defaults to process, overridable for tests */
  private readonly emitter: NodeJS.EventEmitter;

  constructor(taskId: string, emitter?: NodeJS.EventEmitter) {
    this.taskId = taskId;
    this.emitter = emitter ?? (process as unknown as NodeJS.EventEmitter);
    this.boundListener = (msg: unknown) => {
      if (isIPCMessage(msg) && msg.taskId === this.taskId) {
        const handlers = this.handlers.get(msg.type);
        if (handlers) {
          for (const handler of handlers) {
            try {
              handler(msg);
            } catch {
              // swallow
            }
          }
        }
      }
    };

    if (typeof this.emitter.on === 'function') {
      this.emitter.on('message', this.boundListener);
    }
  }

  /**
   * Send a message to the parent process (Brain).
   */
  send(type: IPCMessageType, payload?: unknown): boolean {
    if (this.closed) return false;
    if (typeof process.send !== 'function') return false;

    const message: IPCMessage = {
      type,
      taskId: this.taskId,
      payload,
      timestamp: new Date().toISOString(),
    };

    try {
      return process.send(message);
    } catch {
      return false;
    }
  }

  /**
   * Register a handler for incoming messages from Brain.
   */
  onMessage(type: IPCMessageType, handler: IPCMessageHandler): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    const handlers = this.handlers.get(type);
    if (handlers) handlers.push(handler); // narrowed: set() called above
  }

  /**
   * Close the channel.
   */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.handlers.clear();
    if (typeof this.emitter.off === 'function') {
      this.emitter.off('message', this.boundListener);
    } else if (typeof this.emitter.removeListener === 'function') {
      this.emitter.removeListener('message', this.boundListener);
    }
  }

  /**
   * Returns true if the process supports IPC (was forked).
   */
  supportsIPC(): boolean {
    return typeof process.send === 'function';
  }

  isClosed(): boolean {
    return this.closed;
  }
}

// ─── Channel Registry ─────────────────────────────────────────────────────────

/**
 * ChannelRegistry — manages multiple WorkerChannels keyed by taskId.
 * Used by Brain to track all active IPC connections.
 */
export class ChannelRegistry {
  private readonly channels = new Map<string, WorkerChannel>();

  register(taskId: string, channel: WorkerChannel): void {
    this.channels.set(taskId, channel);
  }

  get(taskId: string): WorkerChannel | undefined {
    return this.channels.get(taskId);
  }

  has(taskId: string): boolean {
    return this.channels.has(taskId);
  }

  remove(taskId: string): boolean {
    const ch = this.channels.get(taskId);
    if (ch) {
      ch.close();
      this.channels.delete(taskId);
      return true;
    }
    return false;
  }

  closeAll(): void {
    for (const [, channel] of this.channels) {
      channel.close();
    }
    this.channels.clear();
  }

  listTaskIds(): string[] {
    return Array.from(this.channels.keys());
  }

  size(): number {
    return this.channels.size;
  }
}

// ─── File-based Question/Answer IPC ──────────────────────────────────────────
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
