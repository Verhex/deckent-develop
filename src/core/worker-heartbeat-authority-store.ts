// ─── Worker Heartbeat Authority Store — exact-attempt durable authority ─────

import {
  closeSync,
  fsyncSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';

import {
  createInitialWorkerHeartbeatAuthorityState,
  foldWorkerHeartbeatAuthority,
  type WorkerHeartbeatAuthorityIdentity,
  type WorkerHeartbeatAuthorityObservationInput,
  type WorkerHeartbeatAuthorityState,
} from './worker-heartbeat-authority.js';
import { DeckentError } from './errors.js';

const STORE_SCHEMA_VERSION = 1 as const;
const REVISION_FILE = /^([0-9]{16})\.json$/;
const CONFLICT_FILE = /^conflict-[0-9a-f-]+\.json$/;
const DEFAULT_MAX_WORKER_CLOCK_SKEW_MS = 5 * 60 * 1_000;

export interface WorkerHeartbeatAuthorityWrite {
  readonly identity: WorkerHeartbeatAuthorityIdentity;
  readonly expectedHostSequence: number;
  readonly hostProcessOutcome: WorkerHeartbeatAuthorityObservationInput['hostProcessOutcome'];
  readonly workerTaskVerdict: WorkerHeartbeatAuthorityObservationInput['workerTaskVerdict'];
  readonly liveness: WorkerHeartbeatAuthorityObservationInput['liveness'];
  /** Diagnostic worker clock only. It never becomes the authority timestamp. */
  readonly workerObservedAt?: string;
}

export type WorkerHeartbeatAuthorityStoreHoldReason =
  | 'attempt-not-initialized'
  | 'foreign-attempt'
  | 'foreign-writer'
  | 'stale-writer'
  | 'wall-time-skew'
  | 'write-in-progress'
  | 'invalid-observation';

export interface WorkerHeartbeatAuthorityStoreHold {
  readonly state: 'HOLD';
  readonly reasonCode: WorkerHeartbeatAuthorityStoreHoldReason;
  readonly attemptId: string;
  readonly currentHostSequence: number | null;
  readonly detail: string;
  readonly evidence: WorkerHeartbeatAuthorityConflictEvidence | null;
}

export interface WorkerHeartbeatAuthorityConflictEvidence {
  readonly schemaVersion: typeof STORE_SCHEMA_VERSION;
  readonly state: 'HOLD';
  readonly reasonCode: WorkerHeartbeatAuthorityStoreHoldReason;
  readonly contradictions: readonly WorkerHeartbeatAuthorityStoreHoldReason[];
  readonly identity: WorkerHeartbeatAuthorityIdentity;
  readonly expectedHostSequence: number;
  readonly currentHostSequence: number | null;
  readonly workerObservedAt: string | null;
  readonly hostObservedAt: string;
  readonly hostProcessOutcome: WorkerHeartbeatAuthorityObservationInput['hostProcessOutcome'];
  readonly liveness: WorkerHeartbeatAuthorityObservationInput['liveness'];
  readonly detail: string;
}

export interface WorkerHeartbeatAuthorityStoreAccepted {
  readonly state: 'ACCEPTED';
  readonly authority: WorkerHeartbeatAuthorityState;
}

export interface WorkerHeartbeatAuthorityStoreReady {
  readonly state: 'READY';
  readonly authority: WorkerHeartbeatAuthorityState;
}

export type WorkerHeartbeatAuthorityStoreWriteResult =
  | WorkerHeartbeatAuthorityStoreAccepted
  | WorkerHeartbeatAuthorityStoreHold;

export type WorkerHeartbeatAuthorityStoreInitializeResult =
  | WorkerHeartbeatAuthorityStoreReady
  | WorkerHeartbeatAuthorityStoreHold;

interface StoredIdentity {
  readonly storeSchemaVersion: typeof STORE_SCHEMA_VERSION;
  readonly identity: WorkerHeartbeatAuthorityIdentity;
}

export interface WorkerHeartbeatAuthorityStoreOptions {
  /** Host clock injection seam. Worker observations never supply timestamps. */
  readonly hostNow?: () => Date;
  /** Maximum tolerated difference for an optional, non-authoritative worker clock. */
  readonly maxWorkerClockSkewMs?: number;
}

function sameIdentity(
  left: WorkerHeartbeatAuthorityIdentity,
  right: WorkerHeartbeatAuthorityIdentity,
): boolean {
  return left.runId === right.runId
    && left.taskId === right.taskId
    && left.attemptId === right.attemptId
    && left.workerId === right.workerId
    && left.fence === right.fence;
}

function attemptKey(identity: WorkerHeartbeatAuthorityIdentity): string {
  return createHash('sha256')
    .update([identity.runId, identity.taskId, identity.attemptId].join('\u0000'))
    .digest('hex');
}

function sequenceFile(sequence: number): string {
  return `${String(sequence).padStart(16, '0')}.json`;
}

function hold(
  reasonCode: WorkerHeartbeatAuthorityStoreHoldReason,
  attemptId: string,
  currentHostSequence: number | null,
  detail: string,
  evidence: WorkerHeartbeatAuthorityConflictEvidence | null = null,
): WorkerHeartbeatAuthorityStoreHold {
  return { state: 'HOLD', reasonCode, attemptId, currentHostSequence, detail, evidence };
}

/**
 * Publishes immutable content without replacing an existing authority record.
 * The temporary file is fully flushed before an exclusive hard-link makes it
 * visible at its final name, so a competing writer can never win by rename.
 */
function publishExclusive(path: string, value: unknown): boolean {
  const temporary = `${path}.tmp-${randomUUID()}`;
  let descriptor: number | undefined;
  try {
    descriptor = openSync(temporary, 'wx', 0o600);
    writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    try {
      linkSync(temporary, path);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
      throw error;
    }
    const directoryDescriptor = openSync(dirname(path), 'r');
    try {
      fsyncSync(directoryDescriptor);
    } finally {
      closeSync(directoryDescriptor);
    }
    return true;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    try {
      unlinkSync(temporary);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}

/**
 * Filesystem-backed authority scoped to an explicit store root. There is no
 * process-global singleton: callers choose the tenant/project/run root.
 */
export class WorkerHeartbeatAuthorityStore {
  readonly #root: string;
  readonly #hostNow: () => Date;
  readonly #maxWorkerClockSkewMs: number;

  constructor(root: string, options: WorkerHeartbeatAuthorityStoreOptions = {}) {
    this.#root = resolve(root);
    this.#hostNow = options.hostNow ?? (() => new Date());
    this.#maxWorkerClockSkewMs = options.maxWorkerClockSkewMs
      ?? DEFAULT_MAX_WORKER_CLOCK_SKEW_MS;
    if (!Number.isFinite(this.#maxWorkerClockSkewMs) || this.#maxWorkerClockSkewMs < 0) {
      throw new TypeError('maxWorkerClockSkewMs must be a finite non-negative number');
    }
    mkdirSync(this.#root, { recursive: true, mode: 0o700 });
  }

  initialize(identity: WorkerHeartbeatAuthorityIdentity): WorkerHeartbeatAuthorityStoreInitializeResult {
    const directory = this.#attemptDirectory(identity);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const identityPath = join(directory, 'identity.json');
    const record: StoredIdentity = { storeSchemaVersion: STORE_SCHEMA_VERSION, identity };

    if (!publishExclusive(identityPath, record)) {
      const existing = this.#readIdentity(identityPath);
      if (!sameIdentity(existing, identity)) {
        return hold('foreign-attempt', identity.attemptId, null, 'attempt authority is fenced to another writer');
      }
    }

    return { state: 'READY', authority: this.#readState(directory, identity) };
  }

  observe(input: WorkerHeartbeatAuthorityWrite): WorkerHeartbeatAuthorityStoreWriteResult {
    const directory = this.#attemptDirectory(input.identity);
    const identityPath = join(directory, 'identity.json');
    let storedIdentity: WorkerHeartbeatAuthorityIdentity;
    try {
      storedIdentity = this.#readIdentity(identityPath);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return hold('attempt-not-initialized', input.identity.attemptId, null, 'attempt authority is not initialized');
      }
      throw error;
    }
    if (!sameIdentity(storedIdentity, input.identity)) {
      const sameAttempt = storedIdentity.runId === input.identity.runId
        && storedIdentity.taskId === input.identity.taskId
        && storedIdentity.attemptId === input.identity.attemptId;
      return this.#recordHold(
        directory,
        input,
        sameAttempt ? 'foreign-writer' : 'foreign-attempt',
        null,
        sameAttempt
          ? 'worker identity or host-issued writer fence does not own authority'
          : 'writer does not own the exact fenced attempt',
      );
    }

    const lockPath = join(directory, 'write.lock');
    try {
      mkdirSync(lockPath, { mode: 0o700 });
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        return hold('write-in-progress', input.identity.attemptId, null, 'another host writer is updating this attempt');
      }
      throw error;
    }

    try {
      const authority = this.#readState(directory, storedIdentity);
      const currentSequence = authority.latest?.hostSequence ?? 0;
      if (input.expectedHostSequence !== currentSequence) {
        const hostObservedAt = this.#hostTimestamp();
        const contradictions: WorkerHeartbeatAuthorityStoreHoldReason[] = ['stale-writer'];
        if (this.#workerClockViolatesFence(input.workerObservedAt, hostObservedAt)) {
          contradictions.push('wall-time-skew');
        }
        return this.#recordHold(
          directory,
          input,
          'stale-writer',
          currentSequence,
          'expected host sequence does not match authority',
          hostObservedAt,
          contradictions,
        );
      }

      const hostSequence = currentSequence + 1;
      const hostObservedAt = this.#nextTimestamp(authority);
      if (input.workerObservedAt !== undefined) {
        if (this.#workerClockViolatesFence(input.workerObservedAt, hostObservedAt)) {
          return this.#recordHold(
            directory,
            input,
            'wall-time-skew',
            currentSequence,
            'worker wall-time is malformed or outside the host-clock skew fence',
            hostObservedAt,
          );
        }
      }
      const observation: WorkerHeartbeatAuthorityObservationInput = {
        ...storedIdentity,
        hostSequence,
        hostObservedAt,
        hostProcessOutcome: input.hostProcessOutcome,
        workerTaskVerdict: input.workerTaskVerdict,
        liveness: input.liveness,
      };
      const next = foldWorkerHeartbeatAuthority(authority, observation);
      if (
        next.holds.length !== authority.holds.length
        || next.latest?.hostSequence !== hostSequence
      ) {
        const rejected = next.holds.at(-1);
        return hold(
          'invalid-observation',
          input.identity.attemptId,
          currentSequence,
          rejected?.detail ?? 'heartbeat reducer rejected the observation',
        );
      }
      if (!publishExclusive(join(directory, sequenceFile(hostSequence)), observation)) {
        return hold('stale-writer', input.identity.attemptId, currentSequence, 'host sequence was already published');
      }
      return { state: 'ACCEPTED', authority: next };
    } finally {
      rmdirSync(lockPath);
    }
  }

  read(identity: WorkerHeartbeatAuthorityIdentity): WorkerHeartbeatAuthorityState | null {
    const directory = this.#attemptDirectory(identity);
    const identityPath = join(directory, 'identity.json');
    let storedIdentity: WorkerHeartbeatAuthorityIdentity;
    try {
      storedIdentity = this.#readIdentity(identityPath);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
    if (!sameIdentity(storedIdentity, identity)) return null;
    return this.#readState(directory, storedIdentity);
  }

  /** Durable typed evidence for rejected writers; never replaces live authority. */
  readConflicts(identity: WorkerHeartbeatAuthorityIdentity): readonly WorkerHeartbeatAuthorityConflictEvidence[] {
    const directory = this.#attemptDirectory(identity);
    const identityPath = join(directory, 'identity.json');
    try {
      if (!sameIdentity(this.#readIdentity(identityPath), identity)) return [];
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    return readdirSync(directory)
      .filter(name => CONFLICT_FILE.test(name))
      .map(name => JSON.parse(readFileSync(join(directory, name), 'utf8')) as WorkerHeartbeatAuthorityConflictEvidence)
      .sort((left, right) => Date.parse(left.hostObservedAt) - Date.parse(right.hostObservedAt));
  }

  #attemptDirectory(identity: WorkerHeartbeatAuthorityIdentity): string {
    return join(this.#root, attemptKey(identity));
  }

  #readIdentity(path: string): WorkerHeartbeatAuthorityIdentity {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as StoredIdentity;
    if (parsed.storeSchemaVersion !== STORE_SCHEMA_VERSION || parsed.identity === undefined) {
      throw new DeckentError('E_UNSUPPORTED_WORKER_HEARTBEAT_AUTHORITY_IDENTITY', `Unsupported worker heartbeat authority identity: ${path}`);
    }
    return parsed.identity;
  }

  #readState(directory: string, identity: WorkerHeartbeatAuthorityIdentity): WorkerHeartbeatAuthorityState {
    let state = createInitialWorkerHeartbeatAuthorityState(identity);
    const revisions = readdirSync(directory)
      .filter(name => REVISION_FILE.test(name))
      .sort();
    for (const revision of revisions) {
      const observation = JSON.parse(readFileSync(join(directory, revision), 'utf8')) as unknown;
      const expectedSequence = (state.latest?.hostSequence ?? 0) + 1;
      if (revision !== sequenceFile(expectedSequence)) {
        throw new DeckentError('E_INVALID_WORKER_HEARTBEAT_AUTHORITY_REVISION_SEQUENCE', `Invalid worker heartbeat authority revision sequence: ${join(directory, revision)}`);
      }
      const next = foldWorkerHeartbeatAuthority(state, observation);
      if (
        next.latest === state.latest
        || next.latest?.hostSequence !== expectedSequence
        || next.holds.length !== state.holds.length
      ) {
        throw new DeckentError('E_INVALID_WORKER_HEARTBEAT_AUTHORITY_REVISION', `Invalid worker heartbeat authority revision: ${join(directory, revision)}`);
      }
      state = next;
    }
    return state;
  }

  #nextTimestamp(authority: WorkerHeartbeatAuthorityState): string {
    const observed = this.#hostNow();
    const observedMillis = observed.getTime();
    if (!Number.isFinite(observedMillis)) throw new DeckentError('E_HOST_CLOCK_RETURNED_AN_INVALID_DATE', 'Host clock returned an invalid date');
    const previousMillis = authority.latest === null ? -1 : Date.parse(authority.latest.hostObservedAt);
    return new Date(Math.max(observedMillis, previousMillis + 1)).toISOString();
  }

  #recordHold(
    directory: string,
    input: WorkerHeartbeatAuthorityWrite,
    reasonCode: WorkerHeartbeatAuthorityStoreHoldReason,
    currentHostSequence: number | null,
    detail: string,
    hostObservedAt = this.#hostTimestamp(),
    contradictions: readonly WorkerHeartbeatAuthorityStoreHoldReason[] = [reasonCode],
  ): WorkerHeartbeatAuthorityStoreHold {
    const evidence: WorkerHeartbeatAuthorityConflictEvidence = {
      schemaVersion: STORE_SCHEMA_VERSION,
      state: 'HOLD',
      reasonCode,
      contradictions,
      identity: input.identity,
      expectedHostSequence: input.expectedHostSequence,
      currentHostSequence,
      workerObservedAt: input.workerObservedAt ?? null,
      hostObservedAt,
      hostProcessOutcome: input.hostProcessOutcome,
      liveness: input.liveness,
      detail,
    };
    publishExclusive(join(directory, `conflict-${randomUUID()}.json`), evidence);
    return hold(reasonCode, input.identity.attemptId, currentHostSequence, detail, evidence);
  }

  #hostTimestamp(): string {
    const observed = this.#hostNow();
    if (!Number.isFinite(observed.getTime())) {
      throw new DeckentError('E_HOST_CLOCK_RETURNED_AN_INVALID_DATE', 'Host clock returned an invalid date');
    }
    return observed.toISOString();
  }

  #workerClockViolatesFence(workerObservedAt: string | undefined, hostObservedAt: string): boolean {
    if (workerObservedAt === undefined) return false;
    const workerMillis = Date.parse(workerObservedAt);
    return !Number.isFinite(workerMillis)
      || Math.abs(workerMillis - Date.parse(hostObservedAt)) > this.#maxWorkerClockSkewMs;
  }
}
