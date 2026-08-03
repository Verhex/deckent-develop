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

export interface WorkerHeartbeatAuthorityWrite {
  readonly identity: WorkerHeartbeatAuthorityIdentity;
  readonly expectedHostSequence: number;
  readonly hostProcessOutcome: WorkerHeartbeatAuthorityObservationInput['hostProcessOutcome'];
  readonly workerTaskVerdict: WorkerHeartbeatAuthorityObservationInput['workerTaskVerdict'];
  readonly liveness: WorkerHeartbeatAuthorityObservationInput['liveness'];
}

export type WorkerHeartbeatAuthorityStoreHoldReason =
  | 'attempt-not-initialized'
  | 'foreign-attempt'
  | 'stale-writer'
  | 'write-in-progress'
  | 'invalid-observation';

export interface WorkerHeartbeatAuthorityStoreHold {
  readonly state: 'HOLD';
  readonly reasonCode: WorkerHeartbeatAuthorityStoreHoldReason;
  readonly attemptId: string;
  readonly currentHostSequence: number | null;
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
): WorkerHeartbeatAuthorityStoreHold {
  return { state: 'HOLD', reasonCode, attemptId, currentHostSequence, detail };
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

  constructor(root: string, options: WorkerHeartbeatAuthorityStoreOptions = {}) {
    this.#root = resolve(root);
    this.#hostNow = options.hostNow ?? (() => new Date());
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
      return hold('foreign-attempt', input.identity.attemptId, null, 'writer does not own the exact fenced attempt');
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
        return hold('stale-writer', input.identity.attemptId, currentSequence, 'expected host sequence does not match authority');
      }

      const hostSequence = currentSequence + 1;
      const hostObservedAt = this.#nextTimestamp(authority);
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
}
