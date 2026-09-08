import { type Readable } from 'node:stream';
import {
  createProcessGroupAnchor,
  type CreateProcessGroupAnchorResult,
  type ProcessGroupAnchor,
} from '../core/process-group-anchor.js';

const CONTAINER_ID = /^[a-f0-9]{64}$/u;

export type TaskOutputLiveStream = 'stdout' | 'stderr';

export interface TaskOutputLiveTransportLimits {
  /** Bounded interval from observer SIGTERM to the owned-group SIGKILL reap. */
  readonly termGraceMs: number;
  /** Bound for the anchor's exit/group-emptiness observation. */
  readonly reapObservationMs: number;
  /** Bound for pipes to finish draining after observer closure or local destruction. */
  readonly streamCloseMs: number;
}

export interface TaskOutputLiveTransportInput {
  /** Syntax only; the caller must already have exact custody authorization. */
  readonly containerId: string;
  readonly tail: number;
  readonly follow: boolean;
  /** Caller-provided custody work directory. This transport never uses process.cwd(). */
  readonly cwd: string;
  readonly signal: AbortSignal;
  readonly limits: TaskOutputLiveTransportLimits;
  readonly onChunk: (bytes: Uint8Array, stream: TaskOutputLiveStream) => void | Promise<void>;
}

export interface TaskOutputLiveTransportCleanup {
  readonly attempted: boolean;
  readonly termSent: boolean;
  readonly killSent: boolean;
  readonly anchorExited: boolean | null;
  readonly groupEmpty: boolean | null;
}

export interface TaskOutputLiveTransportResources {
  readonly readerCount: 2;
  readonly readersSettled: boolean;
  readonly abortListenerRemoved: boolean;
  readonly escalationTimerActive: false;
}

export type TaskOutputLiveTransportResult =
  | {
      readonly kind: 'closed';
      /** This is only the docker-logs observer outcome, never task/provider success. */
      readonly observer: { readonly code: 0; readonly signal: null };
      readonly cleanup: TaskOutputLiveTransportCleanup;
      readonly resources: TaskOutputLiveTransportResources;
    }
  | {
      readonly kind: 'aborted';
      readonly phase: 'before-spawn' | 'running';
      readonly observer: { readonly code: number | null; readonly signal: NodeJS.Signals | null } | null;
      readonly cleanup: TaskOutputLiveTransportCleanup;
      readonly resources: TaskOutputLiveTransportResources;
    }
  | {
      readonly kind: 'unavailable';
      readonly reason:
        | 'invalid-request'
        | 'unsupported-platform'
        | 'anchor-unavailable'
        | 'observer-spawn-failed'
        | 'observer-exit'
        | 'observer-anchor-lost'
        | 'sink-failed'
        | 'stream-close-timeout'
        | 'cleanup-unproven';
      readonly observer: { readonly code: number | null; readonly signal: NodeJS.Signals | null } | null;
      readonly cleanup: TaskOutputLiveTransportCleanup;
      readonly resources: TaskOutputLiveTransportResources;
    };

export interface TaskOutputLiveTransportHooks {
  readonly createAnchor?: (cwd: string) => Promise<CreateProcessGroupAnchorResult>;
}

type ObserverExit = { readonly code: number | null; readonly signal: NodeJS.Signals | null };
type AnchorRace = { readonly type: 'observer'; readonly exit: ObserverExit } | { readonly type: 'anchor-lost' };

function validLimits(limits: TaskOutputLiveTransportLimits): boolean {
  return [limits.termGraceMs, limits.reapObservationMs, limits.streamCloseMs]
    .every((value) => Number.isSafeInteger(value) && value > 0);
}

async function settleWithin<T>(
  operation: Promise<T>,
  timeoutMs: number,
): Promise<{ readonly timedOut: false; readonly value: T } | { readonly timedOut: true }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation.then((value) => ({ timedOut: false as const, value })),
      new Promise<{ readonly timedOut: true }>((resolve) => {
        timer = setTimeout(() => resolve({ timedOut: true }), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function cleanupProof(
  attempted: boolean,
  termSent: boolean,
  terminated: Awaited<ReturnType<ProcessGroupAnchor['terminateGroup']>> | undefined,
): TaskOutputLiveTransportCleanup {
  return {
    attempted,
    termSent,
    killSent: terminated?.signalled ?? false,
    anchorExited: terminated?.anchorExited ?? null,
    groupEmpty: terminated?.groupEmpty ?? null,
  };
}

function resources(readersSettled: boolean): TaskOutputLiveTransportResources {
  return {
    readerCount: 2,
    readersSettled,
    abortListenerRemoved: true,
    escalationTimerActive: false,
  };
}

function hasProvenCleanup(cleanup: TaskOutputLiveTransportCleanup): boolean {
  return cleanup.attempted && cleanup.anchorExited === true && cleanup.groupEmpty === true;
}

async function drain(
  stream: Readable,
  source: TaskOutputLiveStream,
  onChunk: TaskOutputLiveTransportInput['onChunk'],
): Promise<void> {
  for await (const chunk of stream) {
    if (!(chunk instanceof Uint8Array)) {
      throw new TypeError('observer stream yielded a non-byte chunk');
    }
    await onChunk(chunk, source);
  }
}

function destroyReaders(anchor: ProcessGroupAnchor): void {
  anchor.stdout.destroy();
  anchor.stderr.destroy();
}

/**
 * Read-only `docker logs` transport. The exact container id is only an input
 * shape check: authorization, tenant binding, release labels, and daemon
 * custody belong to the caller. This module never invokes docker kill/stop/exec.
 *
 * POSIX uses the owned process-group anchor so TERM→KILL and group emptiness
 * are attributable. win32 is deliberately unavailable until a native Job
 * Object ownership adapter exists; there is no guessed POSIX/tree fallback.
 */
export async function streamTaskOutputLive(
  input: TaskOutputLiveTransportInput,
  hooks: TaskOutputLiveTransportHooks = {},
): Promise<TaskOutputLiveTransportResult> {
  const noCleanup = cleanupProof(false, false, undefined);
  if (
    !CONTAINER_ID.test(input.containerId) ||
    !Number.isSafeInteger(input.tail) ||
    input.tail < 0 ||
    !validLimits(input.limits) ||
    typeof input.cwd !== 'string' ||
    input.cwd.length === 0
  ) {
    return { kind: 'unavailable', reason: 'invalid-request', observer: null, cleanup: noCleanup, resources: resources(true) };
  }
  if (input.signal.aborted) {
    return { kind: 'aborted', phase: 'before-spawn', observer: null, cleanup: noCleanup, resources: resources(true) };
  }

  const createAnchor = hooks.createAnchor ?? createProcessGroupAnchor;
  let created: CreateProcessGroupAnchorResult;
  try {
    created = await createAnchor(input.cwd);
  } catch {
    return { kind: 'unavailable', reason: 'anchor-unavailable', observer: null, cleanup: noCleanup, resources: resources(true) };
  }
  if (!created.ok) {
    return {
      kind: 'unavailable',
      reason: created.reason === 'unsupported-platform' ? 'unsupported-platform' : 'anchor-unavailable',
      observer: null,
      cleanup: noCleanup,
      resources: resources(true),
    };
  }

  const anchor = created.anchor;
  let cleanupAttempted = false;
  let termSent = false;
  let terminated: Awaited<ReturnType<ProcessGroupAnchor['terminateGroup']>> | undefined;
  let cleanupStarted: Promise<void> | undefined;
  const cleanup = (): Promise<void> => {
    cleanupStarted ??= (async () => {
      cleanupAttempted = true;
      try {
        terminated = await anchor.terminateGroup(input.limits.reapObservationMs);
      } catch {
        terminated = undefined;
      }
    })();
    return cleanupStarted;
  };
  const currentCleanup = (): TaskOutputLiveTransportCleanup =>
    cleanupProof(cleanupAttempted, termSent, terminated);

  let abort!: () => void;
  const aborted = new Promise<void>((resolve) => { abort = resolve; });
  const onAbort = (): void => abort();
  input.signal.addEventListener('abort', onAbort, { once: true });
  if (input.signal.aborted) abort();

  const args = ['logs', '--tail', String(input.tail), ...(input.follow ? ['--follow'] : []), input.containerId];
  const spawnOutcome = Promise.resolve()
    .then(() => anchor.spawnTarget({ command: 'docker', args, cwd: input.cwd }))
    .then((spawned) => ({ type: 'spawned' as const, spawned }))
    .catch(() => ({ type: 'spawn-threw' as const }));
  const start = await Promise.race([
    spawnOutcome,
    aborted.then(() => ({ type: 'aborted' as const })),
  ]);
  if (start.type === 'aborted') {
    await cleanup();
    const evidence = currentCleanup();
    input.signal.removeEventListener('abort', onAbort);
    return hasProvenCleanup(evidence)
      ? { kind: 'aborted', phase: 'before-spawn', observer: null, cleanup: evidence, resources: resources(true) }
      : { kind: 'unavailable', reason: 'cleanup-unproven', observer: null, cleanup: evidence, resources: resources(true) };
  }
  if (start.type === 'spawn-threw' || !start.spawned.ok) {
    await cleanup();
    const evidence = currentCleanup();
    input.signal.removeEventListener('abort', onAbort);
    return hasProvenCleanup(evidence)
      ? { kind: 'unavailable', reason: 'observer-spawn-failed', observer: null, cleanup: evidence, resources: resources(true) }
      : { kind: 'unavailable', reason: 'cleanup-unproven', observer: null, cleanup: evidence, resources: resources(true) };
  }

  let reportReaderFailure!: () => void;
  const readerFailure = new Promise<{ readonly type: 'sink-failed' }>((resolve) => {
    reportReaderFailure = () => resolve({ type: 'sink-failed' });
  });
  const guardedDrain = (stream: Readable, source: TaskOutputLiveStream): Promise<void> =>
    drain(stream, source, input.onChunk).catch((error: unknown) => {
      reportReaderFailure();
      throw error;
    });
  const readerResult = Promise.allSettled([
    guardedDrain(anchor.stdout, 'stdout'),
    guardedDrain(anchor.stderr, 'stderr'),
  ]);
  const observerRace: Promise<AnchorRace> = Promise.race([
    anchor.targetExit.then((exit) => ({ type: 'observer' as const, exit })),
    anchor.anchorExit.then(() => ({ type: 'anchor-lost' as const })),
  ]);

  const awaitReaders = async (): Promise<{ readonly settled: boolean; readonly forced: boolean; readonly failed: boolean }> => {
    const first = await settleWithin(readerResult, input.limits.streamCloseMs);
    if (first.timedOut) {
      destroyReaders(anchor);
      return { settled: false, forced: true, failed: false };
    }
    return { settled: true, forced: false, failed: first.value.some((result) => result.status === 'rejected') };
  };

  try {
    const event = await Promise.race([
      observerRace,
      aborted.then(() => ({ type: 'aborted' as const })),
      readerFailure,
    ]);
    input.signal.removeEventListener('abort', onAbort);

    if (event.type === 'aborted') {
      termSent = anchor.signalGroup('SIGTERM');
      await settleWithin(observerRace, input.limits.termGraceMs);
      await cleanup();
      const readerOutcome = await awaitReaders();
      const evidence = currentCleanup();
      if (!hasProvenCleanup(evidence) || !readerOutcome.settled) {
        return { kind: 'unavailable', reason: !readerOutcome.settled ? 'stream-close-timeout' : 'cleanup-unproven', observer: null, cleanup: evidence, resources: resources(readerOutcome.settled) };
      }
      return { kind: 'aborted', phase: 'running', observer: null, cleanup: evidence, resources: resources(readerOutcome.settled) };
    }

    if (event.type === 'sink-failed') {
      termSent = anchor.signalGroup('SIGTERM');
      await cleanup();
      const readerOutcome = await awaitReaders();
      const evidence = currentCleanup();
      return !hasProvenCleanup(evidence) || !readerOutcome.settled
        ? { kind: 'unavailable', reason: !readerOutcome.settled ? 'stream-close-timeout' : 'cleanup-unproven', observer: null, cleanup: evidence, resources: resources(readerOutcome.settled) }
        : { kind: 'unavailable', reason: 'sink-failed', observer: null, cleanup: evidence, resources: resources(readerOutcome.settled) };
    }

    if (event.type === 'anchor-lost') {
      const readerOutcome = await awaitReaders();
      return { kind: 'unavailable', reason: readerOutcome.forced ? 'stream-close-timeout' : 'observer-anchor-lost', observer: null, cleanup: currentCleanup(), resources: resources(readerOutcome.settled) };
    }

    await cleanup();
    const readerOutcome = await awaitReaders();
    const evidence = currentCleanup();
    if (!readerOutcome.settled) {
      return { kind: 'unavailable', reason: 'stream-close-timeout', observer: event.exit, cleanup: evidence, resources: resources(false) };
    }
    if (!hasProvenCleanup(evidence)) {
      return { kind: 'unavailable', reason: 'cleanup-unproven', observer: event.exit, cleanup: evidence, resources: resources(true) };
    }
    // Exit IPC may win the race while the final sink write is still pending.
    // A settled reader is not necessarily a successful reader.
    if (readerOutcome.failed) {
      return { kind: 'unavailable', reason: 'sink-failed', observer: event.exit, cleanup: evidence, resources: resources(true) };
    }
    if (event.exit.code !== 0 || event.exit.signal !== null) {
      return { kind: 'unavailable', reason: 'observer-exit', observer: event.exit, cleanup: evidence, resources: resources(true) };
    }
    return { kind: 'closed', observer: { code: 0, signal: null }, cleanup: evidence, resources: resources(true) };
  } finally {
    input.signal.removeEventListener('abort', onAbort);
  }
}
