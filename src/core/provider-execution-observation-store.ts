import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import Database from 'better-sqlite3';
import { z } from 'zod';

import {
  createInitialProviderExecutionObservationState,
  foldProviderExecutionObservation,
  type ProviderExecutionObservationHold,
  type ProviderExecutionObservationInput,
} from './provider-execution-observation.js';

export const PROVIDER_EXECUTION_OBSERVATION_STORE_SCHEMA_VERSION = 2 as const;
/** Canonical project-relative path for durable provider execution observations. */
export const PROVIDER_EXECUTION_OBSERVATION_DATABASE_PATH = join(
  '.deckent',
  'provider-execution-observations.db',
);

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
  /** Null is retained legacy evidence predating exact run ownership. */
  readonly runId: string | null;
  readonly ownership: 'run-owned' | 'legacy-unowned';
  readonly taskId: string;
  readonly attemptId: string;
  readonly providerPrincipalDigest: string;
  readonly fence: string;
  readonly retired: boolean;
  readonly start: ProviderExecutionObservationInput | LegacyProviderExecutionObservationInput;
  readonly end: ProviderExecutionObservationInput | LegacyProviderExecutionObservationInput | null;
}

/** Persisted schema-v1 evidence is readable, but can never be treated as run-owned. */
export type LegacyProviderExecutionObservationInput = Omit<ProviderExecutionObservationInput, 'runId'>;

export interface ProviderExecutionObservationScope {
  readonly runId: string;
  readonly attemptId: string;
  readonly providerPrincipalDigest: string;
  readonly fence: string;
}

/**
 * Why a settling generation closed its own open interval. Retirement is a typed
 * settlement act by the owner, never an inference from cost, silence or age.
 */
export type ProviderExecutionIntervalRetirementReason = 'run-generation-settled';

/** One exact execution attempt the settling generation owns. */
export interface ProviderExecutionOwnedAttempt {
  readonly taskId: string;
  readonly attemptId: string;
}

export interface ProviderExecutionGenerationScope {
  /** Host-owned tenant/run identity; another tenant's intervals are never reconciled. */
  readonly runId: string;
  /** The exact attempt identities being settled — ownership is listed, never derived. */
  readonly attempts: readonly ProviderExecutionOwnedAttempt[];
  /** Optional provider fence: when present only these principals are reconciled. */
  readonly providerPrincipalDigests?: readonly string[];
  readonly reason: ProviderExecutionIntervalRetirementReason;
}

export interface ProviderExecutionRetiredInterval {
  readonly executionId: string;
  readonly taskId: string;
  readonly attemptId: string;
  readonly providerPrincipalDigest: string;
  readonly fence: string;
  readonly reason: ProviderExecutionIntervalRetirementReason;
}

export interface ProviderExecutionGenerationReconciliation {
  readonly runId: string;
  readonly reason: ProviderExecutionIntervalRetirementReason;
  readonly retired: readonly ProviderExecutionRetiredInterval[];
  /** Open intervals left untouched because this generation does not own them. */
  readonly foreignOpenIntervals: number;
}

export interface ProviderExecutionObservationWriteResult {
  readonly accepted: boolean;
  readonly duplicate: boolean;
  readonly contradiction: ProviderExecutionObservationHold | null;
}

export interface ProviderExecutionExactOpenInterval {
  readonly executionId: string;
  readonly runId: string;
  readonly taskId: string;
  readonly attemptId: string;
  readonly providerPrincipalDigest: string;
  readonly fence: string;
}

export class ProviderExecutionObservationStoreError extends Error {
  constructor(
    readonly code: 'INVALID_SOURCE' | 'OPEN_RETENTION_EXCEEDED' | 'SCHEMA_MISMATCH' | 'MIGRATION_REQUIRED',
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
  readonly run_id: string | null;
  readonly retired: number;
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
  private readonly legacyReadSchema: boolean;

  constructor(projectRoot: string, options: ProviderExecutionObservationStoreOptions = {}) {
    this.retention = resolveRetention(options.retention);
    const dbPath = options.dbPath ?? join(projectRoot, PROVIDER_EXECUTION_OBSERVATION_DATABASE_PATH);
    if (!options.readOnly && existsSync(dbPath)) {
      const probe = new Database(dbPath, { readonly: true, fileMustExist: true });
      try {
        const version = probe.pragma('user_version', { simple: true }) as number;
        if (version === 1) {
          throw new ProviderExecutionObservationStoreError(
            'MIGRATION_REQUIRED',
            'Provider execution observation schema requires an explicit validated migration',
          );
        }
      } finally {
        probe.close();
      }
    }
    if (!options.readOnly) mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath, options.readOnly
      ? { readonly: true, fileMustExist: true }
      : undefined);
    const version = this.db.pragma('user_version', { simple: true }) as number;
    if (version !== 0 && version !== 1 && version !== PROVIDER_EXECUTION_OBSERVATION_STORE_SCHEMA_VERSION) {
      this.db.close();
      throw new ProviderExecutionObservationStoreError(
        'SCHEMA_MISMATCH',
        `Unsupported provider execution observation store schema: ${version}`,
      );
    }
    this.legacyReadSchema = options.readOnly === true && version === 1;
    if (options.readOnly) return;
    if (version === 1) {
      this.db.close();
      throw new ProviderExecutionObservationStoreError(
        'MIGRATION_REQUIRED',
        'Provider execution observation schema requires an explicit validated migration',
      );
    }
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = FULL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS provider_execution_intervals (
        execution_id TEXT PRIMARY KEY,
        run_id TEXT,
        task_id TEXT NOT NULL,
        attempt_id TEXT NOT NULL,
        principal_digest TEXT NOT NULL,
        fence TEXT NOT NULL,
        start_json TEXT NOT NULL,
        end_json TEXT,
        start_sequence INTEGER NOT NULL,
        end_sequence INTEGER
        ,retired INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_provider_execution_exact_principal
        ON provider_execution_intervals (principal_digest, start_sequence, execution_id);
      CREATE TABLE IF NOT EXISTS provider_execution_contradictions (
        contradiction_id INTEGER PRIMARY KEY AUTOINCREMENT,
        principal_digest TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );
    `);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_provider_execution_run_scope
      ON provider_execution_intervals (run_id, attempt_id, principal_digest, fence, retired, start_sequence, execution_id);`);
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
      SELECT execution_id, task_id, attempt_id, principal_digest, fence,
        ${this.legacyReadSchema ? 'NULL' : 'run_id'} AS run_id,
        ${this.legacyReadSchema ? '0' : 'retired'} AS retired, start_json, end_json
      FROM provider_execution_intervals
      WHERE principal_digest = ?
      ORDER BY start_sequence, execution_id
    `).all(providerPrincipalDigest) as ExecutionRow[];
    return rows.map(row => ({
      executionId: row.execution_id,
      runId: row.run_id,
      ownership: row.run_id === null ? 'legacy-unowned' : 'run-owned',
      taskId: row.task_id,
      attemptId: row.attempt_id,
      providerPrincipalDigest: row.principal_digest,
      fence: row.fence,
      retired: row.retired === 1,
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

  /** Enumerate active intervals globally with a hard discovery bound. */
  listActiveOpenIntervals(limit = 1_000): StoredProviderExecutionInterval[] {
    assertLimit(limit);
    if (this.legacyReadSchema) return [];
    const rows = this.db.prepare(`
      SELECT execution_id, task_id, attempt_id, principal_digest, fence, run_id, retired, start_json, end_json
      FROM provider_execution_intervals
      WHERE end_json IS NULL AND retired = 0
      ORDER BY start_sequence, execution_id LIMIT ?
    `).all(limit + 1) as ExecutionRow[];
    if (rows.length > limit) throw new ProviderExecutionObservationStoreError(
      'OPEN_RETENTION_EXCEEDED', 'Active provider execution discovery bound exceeded',
    );
    return rows.map(row => toStoredInterval(row));
  }

  /** Retire a prevalidated exact set atomically; no wider scope is inferred. */
  retireExactOpenIntervals(intervals: readonly ProviderExecutionExactOpenInterval[]): number {
    if (this.legacyReadSchema || intervals.length === 0) return 0;
    for (const interval of intervals) assertExactOpenInterval(interval);
    return this.db.transaction(() => {
      const verify = this.db.prepare(`
        SELECT 1 FROM provider_execution_intervals
        WHERE execution_id = ? AND run_id = ? AND task_id = ? AND attempt_id = ?
          AND principal_digest = ? AND fence = ? AND end_json IS NULL AND retired = 0
      `);
      for (const interval of intervals) {
        if (!verify.get(interval.executionId, interval.runId, interval.taskId, interval.attemptId,
          interval.providerPrincipalDigest, interval.fence)) {
          throw new ProviderExecutionObservationStoreError('SCHEMA_MISMATCH', 'Exact open interval preimage no longer matches');
        }
      }
      const retire = this.db.prepare(`
        UPDATE provider_execution_intervals SET retired = 1
        WHERE execution_id = ? AND run_id = ? AND task_id = ? AND attempt_id = ?
          AND principal_digest = ? AND fence = ? AND end_json IS NULL AND retired = 0
      `);
      return intervals.reduce((count, interval) => count + retire.run(
        interval.executionId, interval.runId, interval.taskId, interval.attemptId,
        interval.providerPrincipalDigest, interval.fence,
      ).changes, 0);
    })();
  }

  /** Returns only active intervals owned by one exact run/attempt/principal/fence tuple. */
  listOpenIntervalsForScope(
    scope: ProviderExecutionObservationScope,
    limit = 1_000,
  ): StoredProviderExecutionInterval[] {
    assertScope(scope);
    assertLimit(limit);
    if (this.legacyReadSchema) return [];
    const rows = this.db.prepare(`
      SELECT execution_id, task_id, attempt_id, principal_digest, fence, run_id, retired, start_json, end_json
      FROM provider_execution_intervals
      WHERE run_id = ? AND attempt_id = ? AND principal_digest = ? AND fence = ?
        AND end_json IS NULL AND retired = 0
      ORDER BY start_sequence, execution_id LIMIT ?
    `).all(scope.runId, scope.attemptId, scope.providerPrincipalDigest, scope.fence, limit) as ExecutionRow[];
    return rows.map(row => toStoredInterval(row));
  }

  /** Marks only matching open run-owned rows retired; it never deletes forensic evidence. */
  retireOpenIntervalsForScope(scope: ProviderExecutionObservationScope): number {
    assertScope(scope);
    if (this.legacyReadSchema) return 0;
    const result = this.db.prepare(`
      UPDATE provider_execution_intervals SET retired = 1
      WHERE run_id = ? AND attempt_id = ? AND principal_digest = ? AND fence = ?
        AND end_json IS NULL AND retired = 0
    `).run(scope.runId, scope.attemptId, scope.providerPrincipalDigest, scope.fence);
    return result.changes;
  }

  /**
   * Reconcile one settling run/attempt generation: every open interval that
   * generation owns is retired with a typed reason, and nothing else is
   * touched. Ownership is the listed `(runId, taskId, attemptId)` tuple set —
   * never inferred from age, silence or cost — so foreign runs, superseded
   * attempts and legacy rows with no run ownership stay open and forensic
   * instead of holding an unrelated run. No row is deleted and the schema
   * version does not move. Re-running the same generation retires nothing
   * further, which makes COMPLETE followed by cleanup a no-op.
   */
  reconcileGenerationRetirement(
    scope: ProviderExecutionGenerationScope,
  ): ProviderExecutionGenerationReconciliation {
    assertGenerationScope(scope);
    const settled = { runId: scope.runId, reason: scope.reason };
    if (this.legacyReadSchema) {
      return { ...settled, retired: [], foreignOpenIntervals: 0 };
    }
    const owned = new Set(scope.attempts.map(attempt => ownershipKey(attempt.taskId, attempt.attemptId)));
    const principalFence = scope.providerPrincipalDigests === undefined
      ? null
      : new Set(scope.providerPrincipalDigests);
    return this.db.transaction(() => {
      const rows = this.db.prepare(`
        SELECT execution_id, task_id, attempt_id, principal_digest, fence, run_id, retired,
          start_json, end_json
        FROM provider_execution_intervals
        WHERE end_json IS NULL AND retired = 0
        ORDER BY start_sequence, execution_id
      `).all() as ExecutionRow[];
      const retire = this.db.prepare(`
        UPDATE provider_execution_intervals SET retired = 1
        WHERE execution_id = ? AND end_json IS NULL AND retired = 0
      `);
      const retired: ProviderExecutionRetiredInterval[] = [];
      let foreignOpenIntervals = 0;
      for (const row of rows) {
        const ownedByGeneration = row.run_id === scope.runId
          && owned.has(ownershipKey(row.task_id, row.attempt_id))
          && (principalFence === null || principalFence.has(row.principal_digest));
        if (!ownedByGeneration) {
          foreignOpenIntervals += 1;
          continue;
        }
        retire.run(row.execution_id);
        retired.push({
          executionId: row.execution_id,
          taskId: row.task_id,
          attemptId: row.attempt_id,
          providerPrincipalDigest: row.principal_digest,
          fence: row.fence,
          reason: scope.reason,
        });
      }
      return { ...settled, retired, foreignOpenIntervals };
    })();
  }

  close(): void {
    this.db.close();
  }

  private putTransactional(raw: unknown): ProviderExecutionObservationWriteResult {
    const existing = this.db.prepare(`
      SELECT execution_id, task_id, attempt_id, principal_digest, fence, run_id, retired, start_json, end_json
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
          execution_id, run_id, task_id, attempt_id, principal_digest, fence, start_json, start_sequence
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        observation.executionId,
        observation.runId,
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

function assertScope(scope: ProviderExecutionObservationScope): void {
  for (const [name, value] of Object.entries(scope)) {
    if (value.trim() === '') throw new TypeError(`${name} must be non-empty`);
  }
}

function assertExactOpenInterval(interval: ProviderExecutionExactOpenInterval): void {
  for (const [name, value] of Object.entries(interval)) {
    if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${name} must be non-empty`);
  }
}

function ownershipKey(taskId: string, attemptId: string): string {
  return `${taskId}\0${attemptId}`;
}

function assertGenerationScope(scope: ProviderExecutionGenerationScope): void {
  if (scope.runId.trim() === '') throw new TypeError('runId must be non-empty');
  if (scope.reason !== 'run-generation-settled') {
    throw new TypeError('retirement reason must be a typed settlement reason');
  }
  if (scope.attempts.length === 0) {
    throw new TypeError('a settling generation must list at least one owned attempt');
  }
  for (const attempt of scope.attempts) {
    if (attempt.taskId.trim() === '' || attempt.attemptId.trim() === '') {
      throw new TypeError('owned attempt identity must be non-empty');
    }
  }
  for (const digest of scope.providerPrincipalDigests ?? []) {
    if (digest.trim() === '') throw new TypeError('provider principal digest must be non-empty');
  }
}

function assertLimit(limit: number): void {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new TypeError('interval limit must be a positive safe integer');
  }
}

function toStoredInterval(row: ExecutionRow): StoredProviderExecutionInterval {
  return {
    executionId: row.execution_id,
    runId: row.run_id,
    ownership: row.run_id === null ? 'legacy-unowned' : 'run-owned',
    taskId: row.task_id,
    attemptId: row.attempt_id,
    providerPrincipalDigest: row.principal_digest,
    fence: row.fence,
    retired: row.retired === 1,
    start: JSON.parse(row.start_json) as ProviderExecutionObservationInput | LegacyProviderExecutionObservationInput,
    end: row.end_json === null ? null : JSON.parse(row.end_json) as ProviderExecutionObservationInput | LegacyProviderExecutionObservationInput,
  };
}
