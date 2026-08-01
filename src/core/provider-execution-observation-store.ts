import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import Database from 'better-sqlite3';
import { z } from 'zod';

import {
  createInitialProviderExecutionObservationState,
  foldProviderExecutionObservation,
  type ProviderExecutionObservationHold,
  type ProviderExecutionObservationInput,
} from './provider-execution-observation.js';

export const PROVIDER_EXECUTION_OBSERVATION_STORE_SCHEMA_VERSION = 1 as const;

const positiveInteger = z.number().int().positive();
const storeInputSchema = z.object({
  source: z.literal('provider-runtime'),
  observation: z.unknown(),
}).strict();

export interface ProviderExecutionObservationRetention {
  readonly maxOpenIntervals: number;
  readonly maxClosedIntervals: number;
  readonly maxContradictions: number;
}

export interface ProviderExecutionObservationStoreOptions {
  readonly dbPath?: string;
  readonly retention?: Partial<ProviderExecutionObservationRetention>;
  /** Read-only consumers must never create or migrate project authority. */
  readonly readOnly?: boolean;
}

export interface ProviderExecutionObservationStoreInput {
  /** Must be emitted from provider execution evidence, never container/worker lifecycle. */
  readonly source: 'provider-runtime';
  readonly observation: ProviderExecutionObservationInput;
}

export interface StoredProviderExecutionInterval {
  readonly executionId: string;
  readonly taskId: string;
  readonly attemptId: string;
  readonly providerPrincipalDigest: string;
  readonly fence: string;
  readonly start: ProviderExecutionObservationInput;
  readonly end: ProviderExecutionObservationInput | null;
}

export interface ProviderExecutionObservationWriteResult {
  readonly accepted: boolean;
  readonly duplicate: boolean;
  readonly contradiction: ProviderExecutionObservationHold | null;
}

export class ProviderExecutionObservationStoreError extends Error {
  constructor(
    readonly code: 'INVALID_SOURCE' | 'OPEN_RETENTION_EXCEEDED' | 'SCHEMA_MISMATCH',
    message: string,
  ) {
    super(message);
    this.name = 'ProviderExecutionObservationStoreError';
  }
}

const DEFAULT_RETENTION: ProviderExecutionObservationRetention = {
  maxOpenIntervals: 1_000,
  maxClosedIntervals: 10_000,
  maxContradictions: 10_000,
};

interface ExecutionRow {
  readonly execution_id: string;
  readonly task_id: string;
  readonly attempt_id: string;
  readonly principal_digest: string;
  readonly fence: string;
  readonly start_json: string;
  readonly end_json: string | null;
}

interface ContradictionRow {
  readonly payload_json: string;
}

function resolveRetention(
  input: Partial<ProviderExecutionObservationRetention> | undefined,
): ProviderExecutionObservationRetention {
  const retention = { ...DEFAULT_RETENTION, ...input };
  return z.object({
    maxOpenIntervals: positiveInteger,
    maxClosedIntervals: positiveInteger,
    maxContradictions: positiveInteger,
  }).parse(retention);
}

export class ProviderExecutionObservationStore {
  private readonly db: Database.Database;
  private readonly retention: ProviderExecutionObservationRetention;

  constructor(projectRoot: string, options: ProviderExecutionObservationStoreOptions = {}) {
    this.retention = resolveRetention(options.retention);
    const dbPath = options.dbPath ?? join(projectRoot, '.deckent', 'provider-execution-observations.db');
    if (!options.readOnly) mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath, options.readOnly
      ? { readonly: true, fileMustExist: true }
      : undefined);
    if (!options.readOnly) {
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = FULL');
    }
    const version = this.db.pragma('user_version', { simple: true }) as number;
    if (version !== 0 && version !== PROVIDER_EXECUTION_OBSERVATION_STORE_SCHEMA_VERSION) {
      this.db.close();
      throw new ProviderExecutionObservationStoreError(
        'SCHEMA_MISMATCH',
        `Unsupported provider execution observation store schema: ${version}`,
      );
    }
    if (options.readOnly) return;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS provider_execution_intervals (
        execution_id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        attempt_id TEXT NOT NULL,
        principal_digest TEXT NOT NULL,
        fence TEXT NOT NULL,
        start_json TEXT NOT NULL,
        end_json TEXT,
        start_sequence INTEGER NOT NULL,
        end_sequence INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_provider_execution_exact_principal
        ON provider_execution_intervals (principal_digest, start_sequence, execution_id);
      CREATE TABLE IF NOT EXISTS provider_execution_contradictions (
        contradiction_id INTEGER PRIMARY KEY AUTOINCREMENT,
        principal_digest TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );
    `);
    this.db.pragma(`user_version = ${PROVIDER_EXECUTION_OBSERVATION_STORE_SCHEMA_VERSION}`);
  }

  put(input: ProviderExecutionObservationStoreInput | unknown): ProviderExecutionObservationWriteResult {
    const envelope = storeInputSchema.safeParse(input);
    if (!envelope.success) {
      throw new ProviderExecutionObservationStoreError(
        'INVALID_SOURCE',
        'Only direct provider-runtime execution observations may be persisted',
      );
    }
    return this.db.transaction(() => this.putTransactional(envelope.data.observation))();
  }

  putObservation(input: ProviderExecutionObservationStoreInput | unknown): ProviderExecutionObservationWriteResult {
    return this.put(input);
  }

  listIntervals(providerPrincipalDigest: string): StoredProviderExecutionInterval[] {
    const rows = this.db.prepare(`
      SELECT execution_id, task_id, attempt_id, principal_digest, fence, start_json, end_json
      FROM provider_execution_intervals
      WHERE principal_digest = ?
      ORDER BY start_sequence, execution_id
    `).all(providerPrincipalDigest) as ExecutionRow[];
    return rows.map(row => ({
      executionId: row.execution_id,
      taskId: row.task_id,
      attemptId: row.attempt_id,
      providerPrincipalDigest: row.principal_digest,
      fence: row.fence,
      start: JSON.parse(row.start_json) as ProviderExecutionObservationInput,
      end: row.end_json === null ? null : JSON.parse(row.end_json) as ProviderExecutionObservationInput,
    }));
  }

  /** Enumerate only durable opaque principal digests, with an explicit bound. */
  listProviderPrincipalDigests(limit = 1_000): string[] {
    if (!Number.isSafeInteger(limit) || limit < 1) {
      throw new TypeError('principal digest limit must be a positive safe integer');
    }
    const rows = this.db.prepare(`
      SELECT DISTINCT principal_digest
      FROM provider_execution_intervals
      ORDER BY principal_digest
      LIMIT ?
    `).all(limit) as Array<{ principal_digest: string }>;
    return rows.map(row => row.principal_digest);
  }

  listContradictions(providerPrincipalDigest: string): ProviderExecutionObservationHold[] {
    const rows = this.db.prepare(`
      SELECT payload_json FROM provider_execution_contradictions
      WHERE principal_digest = ? ORDER BY contradiction_id
    `).all(providerPrincipalDigest) as ContradictionRow[];
    return rows.map(row => JSON.parse(row.payload_json) as ProviderExecutionObservationHold);
  }

  close(): void {
    this.db.close();
  }

  private putTransactional(raw: unknown): ProviderExecutionObservationWriteResult {
    const existing = this.db.prepare(`
      SELECT execution_id, task_id, attempt_id, principal_digest, fence, start_json, end_json
      FROM provider_execution_intervals WHERE execution_id = ?
    `).get((raw as { executionId?: unknown }).executionId) as ExecutionRow | undefined;
    let state = createInitialProviderExecutionObservationState();
    if (existing) {
      state = foldProviderExecutionObservation(state, JSON.parse(existing.start_json));
      if (existing.end_json !== null) {
        state = foldProviderExecutionObservation(state, JSON.parse(existing.end_json));
      }
    }
    const next = foldProviderExecutionObservation(state, raw);
    const hold = next.holds.at(-1) ?? null;
    if (hold !== null) {
      const principal = typeof (raw as { providerPrincipalDigest?: unknown }).providerPrincipalDigest === 'string'
        ? (raw as { providerPrincipalDigest: string }).providerPrincipalDigest
        : '';
      this.persistContradiction(principal, hold);
      return { accepted: false, duplicate: false, contradiction: hold };
    }
    if (next === state) return { accepted: true, duplicate: true, contradiction: null };

    const observation = raw as ProviderExecutionObservationInput;
    if (observation.type === 'start') {
      const openCount = this.db.prepare(
        'SELECT COUNT(*) AS count FROM provider_execution_intervals WHERE end_json IS NULL',
      ).get() as { count: number };
      if (openCount.count >= this.retention.maxOpenIntervals) {
        throw new ProviderExecutionObservationStoreError(
          'OPEN_RETENTION_EXCEEDED',
          'Open provider execution interval retention bound reached',
        );
      }
      this.db.prepare(`
        INSERT INTO provider_execution_intervals (
          execution_id, task_id, attempt_id, principal_digest, fence, start_json, start_sequence
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        observation.executionId,
        observation.taskId,
        observation.attemptId,
        observation.providerPrincipalDigest,
        observation.fence,
        JSON.stringify(observation),
        observation.sequence,
      );
    } else {
      this.db.prepare(`
        UPDATE provider_execution_intervals SET end_json = ?, end_sequence = ? WHERE execution_id = ?
      `).run(JSON.stringify(observation), observation.sequence, observation.executionId);
      this.pruneClosed();
    }
    return { accepted: true, duplicate: false, contradiction: null };
  }

  private persistContradiction(
    providerPrincipalDigest: string,
    hold: ProviderExecutionObservationHold,
  ): void {
    this.db.prepare(`
      INSERT INTO provider_execution_contradictions (principal_digest, payload_json) VALUES (?, ?)
    `).run(providerPrincipalDigest, JSON.stringify(hold));
    this.db.prepare(`
      DELETE FROM provider_execution_contradictions WHERE contradiction_id IN (
        SELECT contradiction_id FROM provider_execution_contradictions
        ORDER BY contradiction_id DESC LIMIT -1 OFFSET ?
      )
    `).run(this.retention.maxContradictions);
  }

  private pruneClosed(): void {
    this.db.prepare(`
      DELETE FROM provider_execution_intervals WHERE execution_id IN (
        SELECT execution_id FROM provider_execution_intervals
        WHERE end_json IS NOT NULL
        ORDER BY end_sequence DESC, execution_id DESC LIMIT -1 OFFSET ?
      )
    `).run(this.retention.maxClosedIntervals);
  }
}
