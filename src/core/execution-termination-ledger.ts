import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, join, posix, win32 } from 'node:path';

import Database from 'better-sqlite3';

import {
  createProviderIntegrityAuthority,
  ProviderAuthorityKeyringError,
  type ProviderAuthorityMac,
  type ProviderIntegrityAuthority,
} from './provider-authority-keyring.js';
import {
  assertProviderLimitReservation,
  type ProviderLimitReservation,
  type ProviderLimitReservationEvent,
} from './provider-limit-truth.js';
import {
  resolveGlobalScopePaths,
  type GlobalScopeEnv,
  type GlobalScopePlatform,
} from './global-scope-resolver.js';
import {
  readTaskResultSettlement,
  readTaskResultSettlementClosure,
  readTaskResultSettlementDispatch,
  readTaskResultSettlementLandedRetirement,
  readTaskResultSettlementPrepared,
  type TaskResultSettlementRefV1,
} from './task-result-settlement.js';

export const EXECUTION_TERMINATION_LEDGER_SCHEMA_VERSION = 1 as const;
/**
 * Non-reservable subscription bindings carry payload schema version 2. Reserved
 * bindings keep version 1 so their canonical serialization + digests stay
 * byte-identical to every binding written before this arm existed — existing
 * rows are NEVER re-serialized. The two are a discriminated union on
 * `admissionMode`; the version is a projection of the arm, not a global bump.
 */
export const EXECUTION_TERMINATION_LEDGER_NON_RESERVABLE_SCHEMA_VERSION = 2 as const;
/**
 * DB `user_version`. Bumped to 2 for the admission_mode column + nullable
 * reservation_id + partial-unique index migration. Distinct from the per-binding
 * payload schema version above.
 */
const EXECUTION_TERMINATION_LEDGER_DB_VERSION = 2 as const;
const ROW_INTEGRITY_VERSION = 1;
const AUTHORITY_SENTINEL = 'deckent-execution-termination-ledger:v1';
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const EVIDENCE_REF_PREFIX = 'execution-termination:';
const AUTHORITY_REF_PREFIX = 'execution-termination-authority:';

export type ExecutionTerminationBackend =
  | 'host-subprocess'
  | 'docker'
  | 'tmux'
  | 'api'
  | 'in-process';

export type ExecutionTerminationCapacityDisposition = 'consumed' | 'released';

export interface ExecutionTerminationRuntimeIdentity {
  readonly executionBackend: ExecutionTerminationBackend;
  readonly evidenceRef: string;
  readonly evidenceDigest: string;
}

export interface ExecutionTerminationBindingInput {
  readonly bindingId: string;
  readonly reservation: ProviderLimitReservation;
  readonly reservationEvidenceRef: string;
  readonly runtime: ExecutionTerminationRuntimeIdentity;
  readonly createdAt: string;
}

/**
 * Non-reservable subscription binding input — carries the exact identity fields
 * directly (from the execution grant), and NO reservation. There is no
 * `reservationEvidenceRef` and no fabricated reservation identity.
 */
export interface NonReservableExecutionTerminationBindingInput {
  readonly admissionMode: 'non_reservable_subscription';
  readonly bindingId: string;
  readonly identity: {
    readonly tenantId: string;
    readonly projectId: string;
    readonly runId: string;
    readonly taskId: string;
    readonly callId: string;
    readonly attemptId: string;
    readonly invocationReceiptRef: string;
    readonly fenceTokenHash: string;
    readonly provider: string;
    readonly model: string;
    readonly accountRefHash: string | null;
    readonly quotaScopeRefHash: string;
    readonly authMode: ProviderLimitReservation['authMode'];
    readonly transport: ProviderLimitReservation['backend']['transport'];
    readonly endpointRefHash: string | null;
  };
  readonly runtime: ExecutionTerminationRuntimeIdentity;
  readonly createdAt: string;
}

interface ExecutionTerminationBindingCommon {
  readonly bindingId: string;
  readonly tenantId: string;
  readonly projectId: string;
  readonly runId: string;
  readonly taskId: string;
  readonly callId: string;
  readonly attemptId: string;
  readonly invocationReceiptRef: string;
  readonly fenceTokenHash: string;
  readonly provider: string;
  readonly model: string;
  readonly accountRefHash: string | null;
  readonly quotaScopeRefHash: string;
  readonly authMode: ProviderLimitReservation['authMode'];
  readonly transport: ProviderLimitReservation['backend']['transport'];
  readonly executionBackend: ExecutionTerminationBackend;
  readonly endpointRefHash: string | null;
  readonly runtimeEvidenceRef: string;
  readonly runtimeEvidenceDigest: string;
  readonly createdAt: string;
  readonly authorityRevision: number;
}

/**
 * Reserved arm — structurally identical to the original binding, so its canonical
 * serialization + digests stay byte-identical. Discriminated by `admissionMode`,
 * which is projected OUT of the v1 payload at serialization time.
 */
export interface ReservedExecutionTerminationBinding extends ExecutionTerminationBindingCommon {
  readonly schemaVersion: typeof EXECUTION_TERMINATION_LEDGER_SCHEMA_VERSION;
  readonly admissionMode: 'reserved';
  readonly providerLimitReservationId: string;
  readonly providerLimitReservationRef: string;
  readonly providerLimitReservationDigest: string;
}

/** Non-reservable arm — NO reservation identity fields exist; payload version 2. */
export interface NonReservableExecutionTerminationBinding extends ExecutionTerminationBindingCommon {
  readonly schemaVersion: typeof EXECUTION_TERMINATION_LEDGER_NON_RESERVABLE_SCHEMA_VERSION;
  readonly admissionMode: 'non_reservable_subscription';
}

export type ExecutionTerminationBinding =
  | ReservedExecutionTerminationBinding
  | NonReservableExecutionTerminationBinding;

export interface ExecutionTerminationTerminal {
  readonly schemaVersion: typeof EXECUTION_TERMINATION_LEDGER_SCHEMA_VERSION;
  readonly terminalId: string;
  readonly bindingId: string;
  readonly bindingDigest: string;
  readonly capacityDisposition: ExecutionTerminationCapacityDisposition;
  readonly terminalOutcome: 'closed' | 'landed';
  readonly backendEvidenceRef: string;
  readonly backendEvidenceDigest: string;
  readonly contained: true;
  readonly occurredAt: string;
  readonly recordedAt: string;
  readonly authorityRevision: number;
}

export interface ExecutionTerminationWrite<T> {
  readonly value: T;
  readonly evidenceRef: string;
  readonly authorityRef: string;
  readonly created: boolean;
}

export type ExecutionTerminationAdapterCapability =
  | {
      readonly decision: 'ready';
      readonly executionBackend: 'docker';
      readonly evidenceContract: 'task-result-settlement-v1';
    }
  | {
      readonly decision: 'hold';
      readonly executionBackend: Exclude<ExecutionTerminationBackend, 'docker'>;
      readonly reasonCode: 'termination_adapter_unsupported';
      readonly evidenceContract: null;
    };

export interface ExecutionTerminationLedgerOptions {
  readonly dbPath?: string;
  readonly now?: () => Date;
  readonly integrityAuthority?: ProviderIntegrityAuthority;
  readonly integrityKey?: string | Buffer;
}

interface AuthorityRow {
  readonly integrity_check: string;
  readonly active_key_id: string;
  readonly integrity_version: number;
  readonly authority_revision: number;
}

interface BindingRow {
  readonly binding_id: string;
  readonly tenant_id: string;
  readonly project_id: string;
  readonly admission_mode: string;
  readonly reservation_id: string | null;
  readonly run_id: string;
  readonly call_id: string;
  readonly attempt_id: string;
  readonly task_id: string;
  readonly receipt_ref: string;
  readonly execution_backend: string;
  readonly created_at: string;
  readonly payload_json: string;
  readonly payload_hash: string;
  readonly integrity_key_id: string;
  readonly integrity_version: number;
}

interface TerminalRow {
  readonly terminal_id: string;
  readonly binding_id: string;
  readonly capacity_disposition: string;
  readonly occurred_at: string;
  readonly recorded_at: string;
  readonly payload_json: string;
  readonly payload_sha256: string;
  readonly payload_hash: string;
  readonly integrity_key_id: string;
  readonly integrity_version: number;
}

export class ExecutionTerminationLedgerError extends Error {
  constructor(
    readonly code:
      | 'INVALID_INPUT'
      | 'IDEMPOTENCY_CONFLICT'
      | 'INTEGRITY_FAILURE'
      | 'INTEGRITY_KEY_UNAVAILABLE'
      | 'BINDING_NOT_FOUND'
      | 'TERMINAL_EXISTS'
      | 'EVIDENCE_UNAVAILABLE'
      | 'EVIDENCE_MISMATCH'
      | 'EVIDENCE_TOO_LATE',
    message: string,
  ) {
    super(message);
    this.name = 'ExecutionTerminationLedgerError';
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function assertIdentity(name: string, value: string): void {
  if (!ID_PATTERN.test(value)) {
    throw new ExecutionTerminationLedgerError('INVALID_INPUT', `${name} is not a canonical identifier`);
  }
}

function assertExternalIdentity(name: string, value: string): void {
  if (!value || value !== value.trim() || value.length > 512 || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new ExecutionTerminationLedgerError('INVALID_INPUT', `${name} is not a canonical external identity`);
  }
}

function assertOpaqueRef(name: string, value: string): void {
  if (!value || value !== value.trim() || value.length > 2048) {
    throw new ExecutionTerminationLedgerError('INVALID_INPUT', `${name} is not a canonical evidence reference`);
  }
}

function assertHash(name: string, value: string): void {
  if (!HASH_PATTERN.test(value)) {
    throw new ExecutionTerminationLedgerError('INVALID_INPUT', `${name} is not a SHA-256 digest`);
  }
}

function timestamp(name: string, value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new ExecutionTerminationLedgerError('INVALID_INPUT', `${name} is not a canonical timestamp`);
  }
  return parsed;
}

/**
 * The canonical persisted payload — the in-memory-only `admissionMode`
 * discriminant is stripped so the serialization matches `payload_json` exactly
 * and reserved bindings keep byte-identical digests (and thus evidence refs) to
 * every binding written before this arm existed.
 */
function canonicalBindingPayload(binding: ExecutionTerminationBinding): Record<string, unknown> {
  const { admissionMode: _admissionMode, ...payload } = binding;
  return payload;
}

function bindingDigest(binding: ExecutionTerminationBinding): string {
  return sha256(canonicalJson(canonicalBindingPayload(binding)));
}

function bindingEvidenceRef(binding: ExecutionTerminationBinding): string {
  return `execution-termination-binding:${bindingDigest(binding)}`;
}

function terminalEvidenceRef(terminal: ExecutionTerminationTerminal): string {
  return `${EVIDENCE_REF_PREFIX}${sha256(canonicalJson(terminal))}`;
}

function authorityEvidenceRef(keyId: string, revision: number): string {
  return `${AUTHORITY_REF_PREFIX}${sha256(canonicalJson({ keyId, revision }))}`;
}

function parseTerminalEvidenceRef(value: string): { payloadHash: string } | null {
  if (!value.startsWith(EVIDENCE_REF_PREFIX)) return null;
  const suffix = value.slice(EVIDENCE_REF_PREFIX.length);
  return HASH_PATTERN.test(suffix) ? { payloadHash: suffix } : null;
}

function dockerPreparedEvidenceRef(ref: TaskResultSettlementRefV1): string {
  return [
    'task-result-settlement-prepared:v1',
    ref.projectRootSha256,
    sha256(ref.taskId),
    ref.attemptId,
  ].join(':');
}

function dockerTerminalEvidenceRef(
  ref: TaskResultSettlementRefV1,
  kind: 'closure' | 'landed-retirement',
): string {
  return [
    `task-result-settlement-${kind}:v1`,
    ref.projectRootSha256,
    sha256(ref.taskId),
    ref.attemptId,
  ].join(':');
}

function assertBindingShape(binding: ExecutionTerminationBinding): void {
  const expectedVersion = binding.admissionMode === 'reserved'
    ? EXECUTION_TERMINATION_LEDGER_SCHEMA_VERSION
    : EXECUTION_TERMINATION_LEDGER_NON_RESERVABLE_SCHEMA_VERSION;
  if (binding.schemaVersion !== expectedVersion) {
    throw new ExecutionTerminationLedgerError('INTEGRITY_FAILURE', 'Unsupported termination binding version');
  }
  assertIdentity('bindingId', binding.bindingId);
  for (const [name, value] of [
    ['tenantId', binding.tenantId],
    ['projectId', binding.projectId],
    ['runId', binding.runId],
    ['taskId', binding.taskId],
    ['callId', binding.callId],
    ['attemptId', binding.attemptId],
  ] as const) assertExternalIdentity(name, value);
  for (const [name, value] of [
    ['invocationReceiptRef', binding.invocationReceiptRef],
    ['runtimeEvidenceRef', binding.runtimeEvidenceRef],
  ] as const) assertOpaqueRef(name, value);
  for (const [name, value] of [
    ['fenceTokenHash', binding.fenceTokenHash],
    ['quotaScopeRefHash', binding.quotaScopeRefHash],
    ['runtimeEvidenceDigest', binding.runtimeEvidenceDigest],
  ] as const) assertHash(name, value);
  // Reserved bindings carry the numeric reservation identity (byte-identical
  // checks to before this arm existed). Non-reservable bindings carry none.
  if (binding.admissionMode === 'reserved') {
    assertExternalIdentity('providerLimitReservationId', binding.providerLimitReservationId);
    assertOpaqueRef('providerLimitReservationRef', binding.providerLimitReservationRef);
    assertHash('providerLimitReservationDigest', binding.providerLimitReservationDigest);
  }
  if (binding.accountRefHash !== null) assertHash('accountRefHash', binding.accountRefHash);
  if (binding.endpointRefHash !== null) assertHash('endpointRefHash', binding.endpointRefHash);
  if (!binding.provider.trim() || !binding.model.trim() || binding.authorityRevision < 1) {
    throw new ExecutionTerminationLedgerError('INTEGRITY_FAILURE', 'Termination binding identity is incomplete');
  }
  timestamp('binding createdAt', binding.createdAt);
}

function assertTerminalShape(terminal: ExecutionTerminationTerminal): void {
  if (terminal.schemaVersion !== EXECUTION_TERMINATION_LEDGER_SCHEMA_VERSION) {
    throw new ExecutionTerminationLedgerError('INTEGRITY_FAILURE', 'Unsupported termination terminal version');
  }
  assertIdentity('terminalId', terminal.terminalId);
  assertIdentity('bindingId', terminal.bindingId);
  assertHash('bindingDigest', terminal.bindingDigest);
  assertOpaqueRef('backendEvidenceRef', terminal.backendEvidenceRef);
  assertHash('backendEvidenceDigest', terminal.backendEvidenceDigest);
  if (terminal.contained !== true || terminal.authorityRevision < 1) {
    throw new ExecutionTerminationLedgerError('INTEGRITY_FAILURE', 'Termination terminal is not contained');
  }
  timestamp('terminal occurredAt', terminal.occurredAt);
  timestamp('terminal recordedAt', terminal.recordedAt);
}

function sameReservation(
  binding: ExecutionTerminationBinding,
  reservation: ProviderLimitReservation,
): boolean {
  // A non-reservable subscription binding carries no reservation identity and can
  // never match a numeric reservation.
  if (binding.admissionMode !== 'reserved') return false;
  return binding.tenantId === reservation.tenantId
    && binding.projectId === reservation.projectId
    && binding.runId === reservation.runId
    && binding.taskId === reservation.taskId
    && binding.callId === reservation.callId
    && binding.attemptId === reservation.attemptId
    && binding.invocationReceiptRef === reservation.receiptRef
    && binding.providerLimitReservationId === reservation.reservationId
    && binding.providerLimitReservationDigest === sha256(canonicalJson(reservation))
    && binding.fenceTokenHash === reservation.fenceTokenHash
    && binding.provider === reservation.provider
    && binding.model === reservation.model
    && binding.accountRefHash === reservation.accountRefHash
    && binding.quotaScopeRefHash === reservation.quotaScopeRefHash
    && binding.authMode === reservation.authMode
    && binding.transport === reservation.backend.transport
    && binding.executionBackend === reservation.backend.executionBackend
    && binding.endpointRefHash === reservation.backend.endpointRefHash;
}

export function resolveExecutionTerminationLedgerPath(
  platform: GlobalScopePlatform,
  env: GlobalScopeEnv,
): string {
  const scope = resolveGlobalScopePaths(platform, env);
  const pathApi = platform === 'win32' ? win32 : posix;
  return pathApi.join(scope.stateDir, 'execution-terminations.db');
}

export function resolveExecutionTerminationAdapter(
  executionBackend: ExecutionTerminationBackend,
): ExecutionTerminationAdapterCapability {
  return executionBackend === 'docker'
    ? {
        decision: 'ready',
        executionBackend,
        evidenceContract: 'task-result-settlement-v1',
      }
    : {
        decision: 'hold',
        executionBackend,
        reasonCode: 'termination_adapter_unsupported',
        evidenceContract: null,
      };
}

/**
 * Reads immutable Docker prepared metadata before provider/backend dispatch and
 * creates the only input shape accepted by the termination binding ledger.
 */
export function createDockerExecutionTerminationBindingInput(input: {
  readonly bindingId: string;
  readonly reservation: ProviderLimitReservation;
  readonly reservationEvidenceRef: string;
  readonly settlementRef: TaskResultSettlementRefV1;
  readonly createdAt: string;
}): ExecutionTerminationBindingInput {
  const { reservation, settlementRef } = input;
  assertProviderLimitReservation(reservation);
  if (reservation.decision !== 'allow'
    || reservation.taskId === null
    || reservation.backend.executionBackend !== 'docker'
    || settlementRef.backend !== 'docker'
    || settlementRef.taskId !== reservation.taskId
    || settlementRef.attemptId !== reservation.attemptId) {
    throw new ExecutionTerminationLedgerError(
      'EVIDENCE_MISMATCH',
      'Docker termination binding does not match the admitted provider reservation',
    );
  }
  const prepared = readTaskResultSettlementPrepared(settlementRef);
  if (!prepared || readTaskResultSettlementDispatch(settlementRef)) {
    throw new ExecutionTerminationLedgerError(
      'EVIDENCE_UNAVAILABLE',
      'Docker termination binding requires prepared metadata before durable dispatch',
    );
  }
  if (prepared.model !== reservation.model) {
    throw new ExecutionTerminationLedgerError(
      'EVIDENCE_MISMATCH',
      'Docker prepared model does not match the admitted provider model',
    );
  }
  return {
    bindingId: input.bindingId,
    reservation,
    reservationEvidenceRef: input.reservationEvidenceRef,
    runtime: {
      executionBackend: 'docker',
      evidenceRef: dockerPreparedEvidenceRef(settlementRef),
      evidenceDigest: sha256(canonicalJson(prepared)),
    },
    createdAt: input.createdAt,
  };
}

/**
 * Non-reservable subscription Docker binding input — the identity comes straight
 * from the execution grant (there is no reservation), and the same prepared-
 * metadata + model checks apply as the reserved path. No reservation identity or
 * `reservationEvidenceRef` is fabricated.
 */
export function createNonReservableDockerExecutionTerminationBindingInput(input: {
  readonly bindingId: string;
  readonly identity: NonReservableExecutionTerminationBindingInput['identity'];
  readonly model: string;
  readonly settlementRef: TaskResultSettlementRefV1;
  readonly createdAt: string;
}): NonReservableExecutionTerminationBindingInput {
  const { identity, settlementRef } = input;
  if (identity.taskId === '' || identity.transport !== 'cli'
    || settlementRef.backend !== 'docker'
    || settlementRef.taskId !== identity.taskId
    || settlementRef.attemptId !== identity.attemptId) {
    throw new ExecutionTerminationLedgerError(
      'EVIDENCE_MISMATCH',
      'Docker non-reservable termination binding does not match its execution grant',
    );
  }
  const prepared = readTaskResultSettlementPrepared(settlementRef);
  if (!prepared || readTaskResultSettlementDispatch(settlementRef)) {
    throw new ExecutionTerminationLedgerError(
      'EVIDENCE_UNAVAILABLE',
      'Docker termination binding requires prepared metadata before durable dispatch',
    );
  }
  if (prepared.model !== input.model || identity.model !== input.model) {
    throw new ExecutionTerminationLedgerError(
      'EVIDENCE_MISMATCH',
      'Docker prepared model does not match the non-reservable execution grant model',
    );
  }
  return {
    admissionMode: 'non_reservable_subscription',
    bindingId: input.bindingId,
    identity,
    runtime: {
      executionBackend: 'docker',
      evidenceRef: dockerPreparedEvidenceRef(settlementRef),
      evidenceDigest: sha256(canonicalJson(prepared)),
    },
    createdAt: input.createdAt,
  };
}

export class ExecutionTerminationLedger {
  private readonly db: Database.Database;
  private readonly now: () => Date;
  private readonly integrityAuthority: ProviderIntegrityAuthority;

  constructor(globalStateDir: string, options: ExecutionTerminationLedgerOptions) {
    if (!options
      || (!options.integrityAuthority
        && typeof options.integrityKey !== 'string' && !Buffer.isBuffer(options.integrityKey))
      || (options.integrityAuthority !== undefined && options.integrityKey !== undefined)) {
      throw new ExecutionTerminationLedgerError(
        'INVALID_INPUT',
        'Execution termination ledger requires exactly one host integrity authority',
      );
    }
    const dbPath = options.dbPath ?? join(globalStateDir, 'execution-terminations.db');
    mkdirSync(dirname(dbPath), { recursive: true });
    this.now = options.now ?? (() => new Date());
    this.integrityAuthority = options.integrityAuthority
      ?? createProviderIntegrityAuthority(options.integrityKey!);
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');
    this.db.pragma('synchronous = FULL');
    try {
      const version = this.db.pragma('user_version', { simple: true }) as number;
      if (version > EXECUTION_TERMINATION_LEDGER_DB_VERSION) {
        throw new ExecutionTerminationLedgerError(
          'INTEGRITY_FAILURE',
          'Execution termination schema is newer than this runtime',
        );
      }
      const existing = this.db.prepare(`
        SELECT 1 AS present FROM sqlite_master
        WHERE type = 'table' AND name LIKE 'execution_termination_%' LIMIT 1
      `).get() as { present: number } | undefined;
      if (!existing) {
        this.initSchema();
        this.db.pragma(`user_version = ${EXECUTION_TERMINATION_LEDGER_DB_VERSION}`);
      } else if (version === 1) {
        // Atomic v1 → v2 migration: admission_mode discriminant column + nullable
        // reservation_id + CHECK constraint + partial-unique index. Legacy rows
        // become `reserved`; their payload_json/payload_hash/MAC/receipts are
        // copied verbatim and NEVER re-signed.
        this.migrateBindingsV1ToV2();
        this.db.pragma(`user_version = ${EXECUTION_TERMINATION_LEDGER_DB_VERSION}`);
      } else if (version !== EXECUTION_TERMINATION_LEDGER_DB_VERSION) {
        throw new ExecutionTerminationLedgerError(
          'INTEGRITY_FAILURE',
          'Execution termination schema requires an explicit migration',
        );
      }
      this.assertSchema();
      this.assertAuthority();
    } catch (error) {
      this.db.close();
      throw error;
    }
  }

  putBinding(input: ExecutionTerminationBindingInput): ExecutionTerminationWrite<ExecutionTerminationBinding> {
    assertIdentity('bindingId', input.bindingId);
    assertOpaqueRef('reservationEvidenceRef', input.reservationEvidenceRef);
    assertProviderLimitReservation(input.reservation);
    if (input.reservation.decision !== 'allow' || input.reservation.taskId === null) {
      throw new ExecutionTerminationLedgerError(
        'INVALID_INPUT',
        'Only an allowed task-scoped provider reservation may be bound',
      );
    }
    if (input.runtime.executionBackend !== input.reservation.backend.executionBackend
      || !['host-subprocess', 'docker', 'tmux', 'api', 'in-process'].includes(input.runtime.executionBackend)) {
      throw new ExecutionTerminationLedgerError(
        'EVIDENCE_MISMATCH',
        'Execution runtime does not match the provider reservation backend',
      );
    }
    assertOpaqueRef('runtime evidenceRef', input.runtime.evidenceRef);
    assertHash('runtime evidenceDigest', input.runtime.evidenceDigest);
    const createdAt = timestamp('binding createdAt', input.createdAt);
    if (createdAt < Date.parse(input.reservation.requestedAt)
      || createdAt >= Date.parse(input.reservation.leaseExpiresAt)
      || createdAt > this.now().getTime()) {
      throw new ExecutionTerminationLedgerError(
        'EVIDENCE_TOO_LATE',
        'Execution termination binding is outside the reservation pre-dispatch lease',
      );
    }

    const transaction = this.db.transaction(() => {
      this.syncAuthorityForWrite();
      const signed = this.buildSignedRecord('binding', authorityRevision => ({
        schemaVersion: EXECUTION_TERMINATION_LEDGER_SCHEMA_VERSION,
        bindingId: input.bindingId,
        tenantId: input.reservation.tenantId,
        projectId: input.reservation.projectId,
        runId: input.reservation.runId,
        taskId: input.reservation.taskId!,
        callId: input.reservation.callId,
        attemptId: input.reservation.attemptId,
        invocationReceiptRef: input.reservation.receiptRef,
        providerLimitReservationId: input.reservation.reservationId,
        providerLimitReservationRef: input.reservationEvidenceRef,
        providerLimitReservationDigest: sha256(canonicalJson(input.reservation)),
        fenceTokenHash: input.reservation.fenceTokenHash,
        provider: input.reservation.provider,
        model: input.reservation.model,
        accountRefHash: input.reservation.accountRefHash,
        quotaScopeRefHash: input.reservation.quotaScopeRefHash,
        authMode: input.reservation.authMode,
        transport: input.reservation.backend.transport,
        executionBackend: input.runtime.executionBackend,
        endpointRefHash: input.reservation.backend.endpointRefHash,
        runtimeEvidenceRef: input.runtime.evidenceRef,
        runtimeEvidenceDigest: input.runtime.evidenceDigest,
        createdAt: input.createdAt,
        authorityRevision,
      } satisfies Omit<ReservedExecutionTerminationBinding, 'admissionMode'>));
      // `admissionMode` is an in-memory discriminant only — it is NEVER part of
      // the canonical payload, so the reserved payload + digest + MAC stay
      // byte-identical to every binding written before this arm existed. The
      // persisted arm discriminant is the `admission_mode` column + schemaVersion.
      const binding: ReservedExecutionTerminationBinding = {
        ...signed.value,
        admissionMode: 'reserved',
      };
      assertBindingShape(binding);
      const existingById = this.selectBinding(binding.bindingId);
      if (existingById) {
        const existing = this.verifyBindingRow(existingById);
        if (existingById.payload_json !== signed.payloadJson) {
          throw new ExecutionTerminationLedgerError(
            'IDEMPOTENCY_CONFLICT',
            'Execution termination binding idempotency conflict',
          );
        }
        return {
          value: existing,
          evidenceRef: bindingEvidenceRef(existing),
          authorityRef: authorityEvidenceRef(
            existingById.integrity_key_id,
            existing.authorityRevision,
          ),
          created: false,
        };
      }
      const existingReservation = this.db.prepare(`
        SELECT * FROM execution_termination_bindings WHERE reservation_id = ?
      `).get(binding.providerLimitReservationId) as BindingRow | undefined;
      if (existingReservation) {
        this.verifyBindingRow(existingReservation);
        throw new ExecutionTerminationLedgerError(
          'IDEMPOTENCY_CONFLICT',
          'Provider reservation already has a different execution termination binding',
        );
      }
      this.db.prepare(`
        INSERT INTO execution_termination_bindings (
          binding_id, tenant_id, project_id, admission_mode, reservation_id, run_id, call_id,
          attempt_id, task_id, receipt_ref, execution_backend, created_at,
          payload_json, payload_hash, integrity_key_id, integrity_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        binding.bindingId,
        binding.tenantId,
        binding.projectId,
        binding.admissionMode,
        binding.providerLimitReservationId,
        binding.runId,
        binding.callId,
        binding.attemptId,
        binding.taskId,
        binding.invocationReceiptRef,
        binding.executionBackend,
        binding.createdAt,
        signed.payloadJson,
        signed.mac.mac,
        signed.mac.keyId,
        ROW_INTEGRITY_VERSION,
      );
      return {
        value: binding,
        evidenceRef: bindingEvidenceRef(binding),
        authorityRef: authorityEvidenceRef(signed.mac.keyId, binding.authorityRevision),
        created: true,
      };
    });
    return transaction.immediate();
  }

  putNonReservableBinding(
    input: NonReservableExecutionTerminationBindingInput,
  ): ExecutionTerminationWrite<ExecutionTerminationBinding> {
    assertIdentity('bindingId', input.bindingId);
    if (!['host-subprocess', 'docker', 'tmux', 'api', 'in-process'].includes(input.runtime.executionBackend)) {
      throw new ExecutionTerminationLedgerError(
        'EVIDENCE_MISMATCH',
        'Execution runtime backend is not supported for a non-reservable binding',
      );
    }
    assertOpaqueRef('runtime evidenceRef', input.runtime.evidenceRef);
    assertHash('runtime evidenceDigest', input.runtime.evidenceDigest);
    const createdAt = timestamp('binding createdAt', input.createdAt);
    if (createdAt > this.now().getTime()) {
      throw new ExecutionTerminationLedgerError(
        'EVIDENCE_TOO_LATE',
        'Execution termination binding cannot be created in the future',
      );
    }

    const transaction = this.db.transaction(() => {
      this.syncAuthorityForWrite();
      const signed = this.buildSignedRecord('binding', authorityRevision => ({
        schemaVersion: EXECUTION_TERMINATION_LEDGER_NON_RESERVABLE_SCHEMA_VERSION,
        bindingId: input.bindingId,
        tenantId: input.identity.tenantId,
        projectId: input.identity.projectId,
        runId: input.identity.runId,
        taskId: input.identity.taskId,
        callId: input.identity.callId,
        attemptId: input.identity.attemptId,
        invocationReceiptRef: input.identity.invocationReceiptRef,
        fenceTokenHash: input.identity.fenceTokenHash,
        provider: input.identity.provider,
        model: input.identity.model,
        accountRefHash: input.identity.accountRefHash,
        quotaScopeRefHash: input.identity.quotaScopeRefHash,
        authMode: input.identity.authMode,
        transport: input.identity.transport,
        executionBackend: input.runtime.executionBackend,
        endpointRefHash: input.identity.endpointRefHash,
        runtimeEvidenceRef: input.runtime.evidenceRef,
        runtimeEvidenceDigest: input.runtime.evidenceDigest,
        createdAt: input.createdAt,
        authorityRevision,
      } satisfies Omit<NonReservableExecutionTerminationBinding, 'admissionMode'>));
      const binding: NonReservableExecutionTerminationBinding = {
        ...signed.value,
        admissionMode: 'non_reservable_subscription',
      };
      assertBindingShape(binding);
      const existingById = this.selectBinding(binding.bindingId);
      if (existingById) {
        const existing = this.verifyBindingRow(existingById);
        if (existingById.payload_json !== signed.payloadJson) {
          throw new ExecutionTerminationLedgerError(
            'IDEMPOTENCY_CONFLICT',
            'Execution termination binding idempotency conflict',
          );
        }
        return {
          value: existing,
          evidenceRef: bindingEvidenceRef(existing),
          authorityRef: authorityEvidenceRef(
            existingById.integrity_key_id,
            existing.authorityRevision,
          ),
          created: false,
        };
      }
      this.db.prepare(`
        INSERT INTO execution_termination_bindings (
          binding_id, tenant_id, project_id, admission_mode, reservation_id, run_id, call_id,
          attempt_id, task_id, receipt_ref, execution_backend, created_at,
          payload_json, payload_hash, integrity_key_id, integrity_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        binding.bindingId,
        binding.tenantId,
        binding.projectId,
        binding.admissionMode,
        null,
        binding.runId,
        binding.callId,
        binding.attemptId,
        binding.taskId,
        binding.invocationReceiptRef,
        binding.executionBackend,
        binding.createdAt,
        signed.payloadJson,
        signed.mac.mac,
        signed.mac.keyId,
        ROW_INTEGRITY_VERSION,
      );
      return {
        value: binding,
        evidenceRef: bindingEvidenceRef(binding),
        authorityRef: authorityEvidenceRef(signed.mac.keyId, binding.authorityRevision),
        created: true,
      };
    });
    return transaction.immediate();
  }

  getBinding(bindingId: string): ExecutionTerminationBinding | null {
    assertIdentity('bindingId', bindingId);
    const row = this.selectBinding(bindingId);
    return row ? this.verifyBindingRow(row) : null;
  }

  recordDockerTerminal(input: {
    readonly terminalId: string;
    readonly bindingId: string;
    readonly settlementRef: TaskResultSettlementRefV1;
    readonly capacityDisposition: ExecutionTerminationCapacityDisposition;
  }): ExecutionTerminationWrite<ExecutionTerminationTerminal> {
    assertIdentity('terminalId', input.terminalId);
    const bindingRow = this.selectBinding(input.bindingId);
    if (!bindingRow) {
      throw new ExecutionTerminationLedgerError('BINDING_NOT_FOUND', 'Termination binding was not found');
    }
    const binding = this.verifyBindingRow(bindingRow);
    const ref = input.settlementRef;
    if (binding.executionBackend !== 'docker'
      || ref.backend !== 'docker'
      || ref.taskId !== binding.taskId
      || ref.attemptId !== binding.attemptId) {
      throw new ExecutionTerminationLedgerError(
        'EVIDENCE_MISMATCH',
        'Docker settlement identity does not match the termination binding',
      );
    }
    const prepared = readTaskResultSettlementPrepared(ref);
    if (!prepared
      || binding.runtimeEvidenceRef !== dockerPreparedEvidenceRef(ref)
      || binding.runtimeEvidenceDigest !== sha256(canonicalJson(prepared))
      || prepared.model !== binding.model) {
      throw new ExecutionTerminationLedgerError(
        'EVIDENCE_MISMATCH',
        'Docker prepared evidence no longer matches the pre-dispatch binding',
      );
    }
    const dispatch = readTaskResultSettlementDispatch(ref);
    if (dispatch && Date.parse(binding.createdAt) > Date.parse(dispatch.dispatchedAt)) {
      throw new ExecutionTerminationLedgerError(
        'EVIDENCE_TOO_LATE',
        'Execution termination binding was created after Docker dispatch',
      );
    }
    const closure = readTaskResultSettlementClosure(ref);
    const retirement = readTaskResultSettlementLandedRetirement(ref);
    if ((closure === null) === (retirement === null)) {
      throw new ExecutionTerminationLedgerError(
        'EVIDENCE_UNAVAILABLE',
        'Docker termination requires exactly one closure or LANDED retirement authority',
      );
    }

    let terminalOutcome: ExecutionTerminationTerminal['terminalOutcome'];
    let backendEvidenceRef: string;
    let backendEvidenceDigest: string;
    let occurredAt: string;
    if (closure) {
      const settlement = readTaskResultSettlement(ref);
      if (!settlement) {
        throw new ExecutionTerminationLedgerError(
          'EVIDENCE_UNAVAILABLE',
          'Docker closure has no exact host settlement receipt',
        );
      }
      if (input.capacityDisposition === 'released') {
        if (dispatch || closure.containerDisposition !== 'not-dispatched') {
          throw new ExecutionTerminationLedgerError(
            'EVIDENCE_MISMATCH',
            'Released provider capacity requires a non-dispatched Docker closure',
          );
        }
      } else if (!dispatch || closure.containerDisposition === 'not-dispatched') {
        throw new ExecutionTerminationLedgerError(
          'EVIDENCE_MISMATCH',
          'Consumed provider capacity requires durable Docker dispatch evidence',
        );
      }
      terminalOutcome = 'closed';
      backendEvidenceRef = dockerTerminalEvidenceRef(ref, 'closure');
      backendEvidenceDigest = sha256(canonicalJson({
        prepared,
        dispatch,
        settlement,
        closure,
      }));
      occurredAt = closure.closedAt;
    } else {
      if (input.capacityDisposition !== 'consumed' || !dispatch) {
        throw new ExecutionTerminationLedgerError(
          'EVIDENCE_MISMATCH',
          'LANDED retirement can only settle durably dispatched provider capacity as consumed',
        );
      }
      terminalOutcome = 'landed';
      backendEvidenceRef = dockerTerminalEvidenceRef(ref, 'landed-retirement');
      backendEvidenceDigest = sha256(canonicalJson({ prepared, dispatch, retirement }));
      occurredAt = retirement!.retiredAt;
    }

    return this.putVerifiedTerminal({
      terminalId: input.terminalId,
      binding,
      bindingRow,
      capacityDisposition: input.capacityDisposition,
      terminalOutcome,
      backendEvidenceRef,
      backendEvidenceDigest,
      occurredAt,
    });
  }

  getTerminalByEvidenceRef(
    evidenceRef: string,
  ): ExecutionTerminationWrite<ExecutionTerminationTerminal> | null {
    const parsed = parseTerminalEvidenceRef(evidenceRef);
    if (!parsed) return null;
    const row = this.db.prepare(`
      SELECT * FROM execution_termination_terminals WHERE payload_sha256 = ?
    `).get(parsed.payloadHash) as TerminalRow | undefined;
    if (!row) return null;
    const terminal = this.verifyTerminalRow(row);
    if (sha256(canonicalJson(terminal)) !== parsed.payloadHash
      || row.payload_sha256 !== parsed.payloadHash) {
      throw new ExecutionTerminationLedgerError(
        'INTEGRITY_FAILURE',
        'Termination evidence reference digest mismatch',
      );
    }
    return {
      value: terminal,
      evidenceRef: terminalEvidenceRef(terminal),
      authorityRef: authorityEvidenceRef(row.integrity_key_id, terminal.authorityRevision),
      created: false,
    };
  }

  verifyProviderLimitRelease(input: {
    readonly evidenceRef: string;
    readonly authorityRef: string;
    readonly reservation: ProviderLimitReservation;
    readonly event: ProviderLimitReservationEvent;
  }): boolean {
    try {
      assertProviderLimitReservation(input.reservation);
      if (input.event.type !== 'released'
        || input.event.actual !== undefined
        || input.event.fenceTokenHash !== input.reservation.fenceTokenHash
        || input.event.terminationEvidenceRef !== input.evidenceRef
        || input.event.terminationAuthorityRef !== input.authorityRef) return false;
      const terminalWrite = this.getTerminalByEvidenceRef(input.evidenceRef);
      if (!terminalWrite
        || terminalWrite.authorityRef !== input.authorityRef
        || terminalWrite.value.capacityDisposition !== 'released') return false;
      const terminal = terminalWrite.value;
      const binding = this.getBinding(terminal.bindingId);
      if (!binding
        || terminal.bindingDigest !== bindingDigest(binding)
        || !sameReservation(binding, input.reservation)) return false;
      const releaseAt = timestamp('provider release occurredAt', input.event.occurredAt);
      return timestamp('terminal occurredAt', terminal.occurredAt) <= releaseAt
        && timestamp('terminal recordedAt', terminal.recordedAt) <= releaseAt;
    } catch {
      return false;
    }
  }

  close(): void {
    this.db.close();
  }

  /**
   * Atomic v1 → v2 binding-table rebuild. SQLite cannot relax `reservation_id`
   * from NOT NULL UNIQUE to nullable + partial index in place, so the table is
   * rebuilt inside one transaction: legacy rows are copied verbatim (payload,
   * hash, MAC and receipt refs untouched) with `admission_mode = 'reserved'`, and
   * the logical/reservation indexes + immutability/authority triggers are
   * recreated. Foreign-key enforcement is disabled only for the structural
   * drop/rename and re-verified before it is restored; any failure rolls the
   * whole migration back.
   */
  private migrateBindingsV1ToV2(): void {
    const rebuild = this.db.transaction(() => {
      this.db.exec(`
        CREATE TABLE execution_termination_bindings_v2 (
          inserted_seq INTEGER PRIMARY KEY AUTOINCREMENT,
          binding_id TEXT NOT NULL UNIQUE,
          tenant_id TEXT NOT NULL,
          project_id TEXT NOT NULL,
          admission_mode TEXT NOT NULL DEFAULT 'reserved',
          reservation_id TEXT,
          run_id TEXT NOT NULL,
          call_id TEXT NOT NULL,
          attempt_id TEXT NOT NULL,
          task_id TEXT NOT NULL,
          receipt_ref TEXT NOT NULL,
          execution_backend TEXT NOT NULL,
          created_at TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          payload_hash TEXT NOT NULL,
          integrity_key_id TEXT NOT NULL,
          integrity_version INTEGER NOT NULL,
          CHECK (
            (admission_mode = 'reserved' AND reservation_id IS NOT NULL)
            OR (admission_mode = 'non_reservable_subscription' AND reservation_id IS NULL)
          )
        );

        INSERT INTO execution_termination_bindings_v2 (
          inserted_seq, binding_id, tenant_id, project_id, admission_mode, reservation_id,
          run_id, call_id, attempt_id, task_id, receipt_ref, execution_backend,
          created_at, payload_json, payload_hash, integrity_key_id, integrity_version
        )
        SELECT
          inserted_seq, binding_id, tenant_id, project_id, 'reserved', reservation_id,
          run_id, call_id, attempt_id, task_id, receipt_ref, execution_backend,
          created_at, payload_json, payload_hash, integrity_key_id, integrity_version
        FROM execution_termination_bindings;

        DROP TABLE execution_termination_bindings;
        ALTER TABLE execution_termination_bindings_v2 RENAME TO execution_termination_bindings;

        CREATE UNIQUE INDEX execution_termination_logical_binding
          ON execution_termination_bindings (
            tenant_id, project_id, run_id, call_id, attempt_id
          );
        CREATE UNIQUE INDEX execution_termination_reservation_unique
          ON execution_termination_bindings (reservation_id)
          WHERE reservation_id IS NOT NULL;

        CREATE TRIGGER execution_termination_bindings_no_update
          BEFORE UPDATE ON execution_termination_bindings BEGIN
            SELECT RAISE(ABORT, 'execution termination bindings are immutable');
          END;
        CREATE TRIGGER execution_termination_bindings_no_delete
          BEFORE DELETE ON execution_termination_bindings BEGIN
            SELECT RAISE(ABORT, 'execution termination bindings are immutable');
          END;
        CREATE TRIGGER execution_termination_bindings_active_key_insert
          BEFORE INSERT ON execution_termination_bindings
          WHEN NEW.integrity_version != 1 OR NEW.integrity_key_id != (
            SELECT active_key_id FROM execution_termination_authority WHERE singleton_id = 1
          ) BEGIN
            SELECT RAISE(ABORT, 'execution termination active authority mismatch');
          END;
      `);
      const violations = this.db.pragma('foreign_key_check') as unknown[];
      if (violations.length > 0) {
        throw new ExecutionTerminationLedgerError(
          'INTEGRITY_FAILURE',
          'Execution termination migration violated foreign-key integrity',
        );
      }
    });
    // SQLite forbids toggling foreign_keys inside a transaction, so the guard is
    // set around the atomic rebuild and always restored.
    this.db.pragma('foreign_keys = OFF');
    try {
      rebuild.immediate();
    } finally {
      this.db.pragma('foreign_keys = ON');
    }
  }

  private initSchema(): void {
    const sentinel = this.signValue('authority', AUTHORITY_SENTINEL);
    this.db.exec(`
      CREATE TABLE execution_termination_authority (
        singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
        integrity_check TEXT NOT NULL,
        active_key_id TEXT NOT NULL,
        integrity_version INTEGER NOT NULL,
        authority_revision INTEGER NOT NULL
      );

      CREATE TABLE execution_termination_bindings (
        inserted_seq INTEGER PRIMARY KEY AUTOINCREMENT,
        binding_id TEXT NOT NULL UNIQUE,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        admission_mode TEXT NOT NULL DEFAULT 'reserved',
        reservation_id TEXT,
        run_id TEXT NOT NULL,
        call_id TEXT NOT NULL,
        attempt_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        receipt_ref TEXT NOT NULL,
        execution_backend TEXT NOT NULL,
        created_at TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        integrity_key_id TEXT NOT NULL,
        integrity_version INTEGER NOT NULL,
        CHECK (
          (admission_mode = 'reserved' AND reservation_id IS NOT NULL)
          OR (admission_mode = 'non_reservable_subscription' AND reservation_id IS NULL)
        )
      );

      CREATE TABLE execution_termination_terminals (
        inserted_seq INTEGER PRIMARY KEY AUTOINCREMENT,
        terminal_id TEXT NOT NULL UNIQUE,
        binding_id TEXT NOT NULL UNIQUE,
        capacity_disposition TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        payload_sha256 TEXT NOT NULL UNIQUE,
        payload_hash TEXT NOT NULL,
        integrity_key_id TEXT NOT NULL,
        integrity_version INTEGER NOT NULL,
        FOREIGN KEY (binding_id) REFERENCES execution_termination_bindings (binding_id)
      );

      CREATE UNIQUE INDEX execution_termination_logical_binding
        ON execution_termination_bindings (
          tenant_id, project_id, run_id, call_id, attempt_id
        );

      CREATE UNIQUE INDEX execution_termination_reservation_unique
        ON execution_termination_bindings (reservation_id)
        WHERE reservation_id IS NOT NULL;

      CREATE TRIGGER execution_termination_bindings_no_update
        BEFORE UPDATE ON execution_termination_bindings BEGIN
          SELECT RAISE(ABORT, 'execution termination bindings are immutable');
        END;
      CREATE TRIGGER execution_termination_bindings_no_delete
        BEFORE DELETE ON execution_termination_bindings BEGIN
          SELECT RAISE(ABORT, 'execution termination bindings are immutable');
        END;
      CREATE TRIGGER execution_termination_terminals_no_update
        BEFORE UPDATE ON execution_termination_terminals BEGIN
          SELECT RAISE(ABORT, 'execution termination terminals are immutable');
        END;
      CREATE TRIGGER execution_termination_terminals_no_delete
        BEFORE DELETE ON execution_termination_terminals BEGIN
          SELECT RAISE(ABORT, 'execution termination terminals are immutable');
        END;
      CREATE TRIGGER execution_termination_bindings_active_key_insert
        BEFORE INSERT ON execution_termination_bindings
        WHEN NEW.integrity_version != 1 OR NEW.integrity_key_id != (
          SELECT active_key_id FROM execution_termination_authority WHERE singleton_id = 1
        ) BEGIN
          SELECT RAISE(ABORT, 'execution termination active authority mismatch');
        END;
      CREATE TRIGGER execution_termination_terminals_active_key_insert
        BEFORE INSERT ON execution_termination_terminals
        WHEN NEW.integrity_version != 1 OR NEW.integrity_key_id != (
          SELECT active_key_id FROM execution_termination_authority WHERE singleton_id = 1
        ) BEGIN
          SELECT RAISE(ABORT, 'execution termination active authority mismatch');
        END;
    `);
    this.db.prepare(`
      INSERT INTO execution_termination_authority (
        singleton_id, integrity_check, active_key_id, integrity_version, authority_revision
      ) VALUES (1, ?, ?, ?, ?)
    `).run(sentinel.mac, sentinel.keyId, ROW_INTEGRITY_VERSION, sentinel.authorityRevision);
  }

  private assertSchema(): void {
    const required: Readonly<Record<string, readonly string[]>> = {
      execution_termination_authority: [
        'singleton_id', 'integrity_check', 'active_key_id', 'integrity_version', 'authority_revision',
      ],
      execution_termination_bindings: [
        'binding_id', 'tenant_id', 'project_id', 'admission_mode', 'reservation_id', 'run_id',
        'call_id', 'attempt_id', 'task_id', 'receipt_ref', 'execution_backend',
        'created_at', 'payload_json', 'payload_hash', 'integrity_key_id', 'integrity_version',
      ],
      execution_termination_terminals: [
        'terminal_id', 'binding_id', 'capacity_disposition', 'occurred_at',
        'recorded_at', 'payload_json', 'payload_sha256', 'payload_hash',
        'integrity_key_id', 'integrity_version',
      ],
    };
    for (const [table, columns] of Object.entries(required)) {
      const rows = this.db.pragma(`table_info(${table})`) as Array<{ name: string }>;
      const names = new Set(rows.map(row => row.name));
      if (columns.some(column => !names.has(column))) {
        throw new ExecutionTerminationLedgerError(
          'INTEGRITY_FAILURE',
          'Execution termination schema is incomplete',
        );
      }
    }
  }

  private assertAuthority(): void {
    const authority = this.readAuthority();
    if (!authority || authority.integrity_version !== ROW_INTEGRITY_VERSION
      || !this.verifyValue(
        'authority',
        authority.active_key_id,
        AUTHORITY_SENTINEL,
        authority.integrity_check,
        authority.integrity_version,
      )) {
      throw new ExecutionTerminationLedgerError(
        'INTEGRITY_FAILURE',
        'Execution termination authority sentinel mismatch',
      );
    }
  }

  private readAuthority(): AuthorityRow | undefined {
    return this.db.prepare(`
      SELECT integrity_check, active_key_id, integrity_version, authority_revision
      FROM execution_termination_authority WHERE singleton_id = 1
    `).get() as AuthorityRow | undefined;
  }

  private syncAuthorityForWrite(): void {
    this.assertAuthority();
    const authority = this.readAuthority()!;
    const current = this.signValue('authority', AUTHORITY_SENTINEL);
    if (current.authorityRevision < authority.authority_revision
      || (current.authorityRevision === authority.authority_revision
        && current.keyId !== authority.active_key_id)) {
      throw new ExecutionTerminationLedgerError(
        'INTEGRITY_FAILURE',
        'Execution termination authority revision is stale',
      );
    }
    if (current.keyId !== authority.active_key_id
      || current.authorityRevision !== authority.authority_revision) {
      this.db.prepare(`
        UPDATE execution_termination_authority
        SET integrity_check = ?, active_key_id = ?, authority_revision = ?
        WHERE singleton_id = 1
      `).run(current.mac, current.keyId, current.authorityRevision);
    }
  }

  private signValue(kind: string, value: string): ProviderAuthorityMac {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const selected = this.integrityAuthority.sign('limit', value);
      const envelope = canonicalJson({
        domain: 'execution-termination-ledger',
        integrityVersion: ROW_INTEGRITY_VERSION,
        keyId: selected.keyId,
        kind,
        value,
      });
      const signed = this.integrityAuthority.sign('limit', envelope);
      if (signed.keyId === selected.keyId
        && signed.authorityRevision === selected.authorityRevision) return signed;
    }
    throw new ExecutionTerminationLedgerError(
      'INTEGRITY_FAILURE',
      'Execution termination authority rotated during signing',
    );
  }

  private buildSignedRecord<T>(
    kind: string,
    build: (authorityRevision: number) => T,
  ): { value: T; payloadJson: string; mac: ProviderAuthorityMac } {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const selected = this.integrityAuthority.sign('limit', `${kind}:select`);
      const value = build(selected.authorityRevision);
      const payloadJson = canonicalJson(value);
      const mac = this.signValue(kind, payloadJson);
      if (mac.keyId === selected.keyId
        && mac.authorityRevision === selected.authorityRevision) {
        return { value, payloadJson, mac };
      }
    }
    throw new ExecutionTerminationLedgerError(
      'INTEGRITY_FAILURE',
      'Execution termination authority rotated while building a record',
    );
  }

  private verifyValue(
    kind: string,
    keyId: string,
    value: string,
    mac: string,
    version: number,
  ): boolean {
    if (version !== ROW_INTEGRITY_VERSION) return false;
    const envelope = canonicalJson({
      domain: 'execution-termination-ledger',
      integrityVersion: ROW_INTEGRITY_VERSION,
      keyId,
      kind,
      value,
    });
    try {
      return this.integrityAuthority.verify('limit', keyId, envelope, mac);
    } catch (error) {
      if (error instanceof ProviderAuthorityKeyringError
        && error.code === 'KEYRING_UNKNOWN_KEY_ID') {
        throw new ExecutionTerminationLedgerError(
          'INTEGRITY_KEY_UNAVAILABLE',
          'Execution termination authority key is unavailable',
        );
      }
      throw error;
    }
  }

  private selectBinding(bindingId: string): BindingRow | undefined {
    return this.db.prepare(`
      SELECT * FROM execution_termination_bindings WHERE binding_id = ?
    `).get(bindingId) as BindingRow | undefined;
  }

  private verifyBindingRow(row: BindingRow): ExecutionTerminationBinding {
    if (!this.verifyValue(
      'binding',
      row.integrity_key_id,
      row.payload_json,
      row.payload_hash,
      row.integrity_version,
    )) {
      throw new ExecutionTerminationLedgerError(
        'INTEGRITY_FAILURE',
        'Execution termination binding integrity mismatch',
      );
    }
    // `admissionMode` is reconstructed from the persisted column (never from the
    // payload, which omits it so reserved digests stay byte-identical).
    // assertBindingShape then proves the payload schemaVersion agrees with the
    // reconstructed arm, so a tampered admission_mode column cannot smuggle a
    // reservation-shaped payload into the non-reservable arm or vice versa.
    const admissionMode = row.admission_mode === 'non_reservable_subscription'
      ? 'non_reservable_subscription' as const
      : 'reserved' as const;
    const binding = {
      ...(JSON.parse(row.payload_json) as Record<string, unknown>),
      admissionMode,
    } as ExecutionTerminationBinding;
    assertBindingShape(binding);
    const reservationEnvelopeMatches = binding.admissionMode === 'reserved'
      ? binding.providerLimitReservationId === row.reservation_id
      : row.reservation_id === null;
    if (binding.bindingId !== row.binding_id
      || binding.tenantId !== row.tenant_id
      || binding.projectId !== row.project_id
      || !reservationEnvelopeMatches
      || binding.runId !== row.run_id
      || binding.callId !== row.call_id
      || binding.attemptId !== row.attempt_id
      || binding.taskId !== row.task_id
      || binding.invocationReceiptRef !== row.receipt_ref
      || binding.executionBackend !== row.execution_backend
      || binding.createdAt !== row.created_at) {
      throw new ExecutionTerminationLedgerError(
        'INTEGRITY_FAILURE',
        'Execution termination binding envelope mismatch',
      );
    }
    return binding;
  }

  private verifyTerminalRow(row: TerminalRow): ExecutionTerminationTerminal {
    if (!this.verifyValue(
      'terminal',
      row.integrity_key_id,
      row.payload_json,
      row.payload_hash,
      row.integrity_version,
    )) {
      throw new ExecutionTerminationLedgerError(
        'INTEGRITY_FAILURE',
        'Execution termination terminal integrity mismatch',
      );
    }
    const terminal = JSON.parse(row.payload_json) as ExecutionTerminationTerminal;
    assertTerminalShape(terminal);
    const binding = this.getBinding(terminal.bindingId);
    if (!binding
      || row.payload_sha256 !== sha256(canonicalJson(terminal))
      || terminal.bindingDigest !== bindingDigest(binding)
      || terminal.terminalId !== row.terminal_id
      || terminal.bindingId !== row.binding_id
      || terminal.capacityDisposition !== row.capacity_disposition
      || terminal.occurredAt !== row.occurred_at
      || terminal.recordedAt !== row.recorded_at) {
      throw new ExecutionTerminationLedgerError(
        'INTEGRITY_FAILURE',
        'Execution termination terminal envelope mismatch',
      );
    }
    return terminal;
  }

  private putVerifiedTerminal(input: {
    readonly terminalId: string;
    readonly binding: ExecutionTerminationBinding;
    readonly bindingRow: BindingRow;
    readonly capacityDisposition: ExecutionTerminationCapacityDisposition;
    readonly terminalOutcome: ExecutionTerminationTerminal['terminalOutcome'];
    readonly backendEvidenceRef: string;
    readonly backendEvidenceDigest: string;
    readonly occurredAt: string;
  }): ExecutionTerminationWrite<ExecutionTerminationTerminal> {
    assertOpaqueRef('backendEvidenceRef', input.backendEvidenceRef);
    assertHash('backendEvidenceDigest', input.backendEvidenceDigest);
    const occurredAt = timestamp('terminal occurredAt', input.occurredAt);
    const recordedAt = this.now().toISOString();
    if (occurredAt < Date.parse(input.binding.createdAt)
      || occurredAt > Date.parse(recordedAt)) {
      throw new ExecutionTerminationLedgerError(
        'EVIDENCE_TOO_LATE',
        'Termination evidence is outside the bound execution timeline',
      );
    }
    const transaction = this.db.transaction(() => {
      const existingById = this.db.prepare(`
        SELECT * FROM execution_termination_terminals WHERE terminal_id = ?
      `).get(input.terminalId) as TerminalRow | undefined;
      if (existingById) {
        const existing = this.verifyTerminalRow(existingById);
        if (existing.bindingId !== input.binding.bindingId
          || existing.bindingDigest !== bindingDigest(input.binding)
          || existing.capacityDisposition !== input.capacityDisposition
          || existing.terminalOutcome !== input.terminalOutcome
          || existing.backendEvidenceRef !== input.backendEvidenceRef
          || existing.backendEvidenceDigest !== input.backendEvidenceDigest
          || existing.occurredAt !== input.occurredAt) {
          throw new ExecutionTerminationLedgerError(
            'IDEMPOTENCY_CONFLICT',
            'Execution termination terminal idempotency conflict',
          );
        }
        return {
          value: existing,
          evidenceRef: terminalEvidenceRef(existing),
          authorityRef: authorityEvidenceRef(
            existingById.integrity_key_id,
            existing.authorityRevision,
          ),
          created: false,
        };
      }
      const existingForBinding = this.db.prepare(`
        SELECT * FROM execution_termination_terminals WHERE binding_id = ?
      `).get(input.binding.bindingId) as TerminalRow | undefined;
      if (existingForBinding) {
        this.verifyTerminalRow(existingForBinding);
        throw new ExecutionTerminationLedgerError(
          'TERMINAL_EXISTS',
          'Execution termination binding already has a terminal outcome',
        );
      }

      this.syncAuthorityForWrite();
      const signed = this.buildSignedRecord('terminal', authorityRevision => ({
        schemaVersion: EXECUTION_TERMINATION_LEDGER_SCHEMA_VERSION,
        terminalId: input.terminalId,
        bindingId: input.binding.bindingId,
        bindingDigest: bindingDigest(input.binding),
        capacityDisposition: input.capacityDisposition,
        terminalOutcome: input.terminalOutcome,
        backendEvidenceRef: input.backendEvidenceRef,
        backendEvidenceDigest: input.backendEvidenceDigest,
        contained: true,
        occurredAt: input.occurredAt,
        recordedAt,
        authorityRevision,
      } satisfies ExecutionTerminationTerminal));
      const terminal = signed.value;
      assertTerminalShape(terminal);
      const currentBinding = this.selectBinding(input.binding.bindingId);
      if (!currentBinding
        || currentBinding.payload_json !== input.bindingRow.payload_json
        || currentBinding.payload_hash !== input.bindingRow.payload_hash) {
        throw new ExecutionTerminationLedgerError(
          'INTEGRITY_FAILURE',
          'Execution termination binding changed before terminal publication',
        );
      }
      this.db.prepare(`
        INSERT INTO execution_termination_terminals (
          terminal_id, binding_id, capacity_disposition, occurred_at, recorded_at,
          payload_json, payload_sha256, payload_hash, integrity_key_id, integrity_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        terminal.terminalId,
        terminal.bindingId,
        terminal.capacityDisposition,
        terminal.occurredAt,
        terminal.recordedAt,
        signed.payloadJson,
        sha256(signed.payloadJson),
        signed.mac.mac,
        signed.mac.keyId,
        ROW_INTEGRITY_VERSION,
      );
      return {
        value: terminal,
        evidenceRef: terminalEvidenceRef(terminal),
        authorityRef: authorityEvidenceRef(signed.mac.keyId, terminal.authorityRevision),
        created: true,
      };
    });
    return transaction.immediate();
  }
}

export function createProviderLimitTerminationEvidenceVerifier(
  ledger: ExecutionTerminationLedger,
): (input: {
  readonly evidenceRef: string;
  readonly authorityRef: string;
  readonly reservation: ProviderLimitReservation;
  readonly event: ProviderLimitReservationEvent;
}) => boolean {
  return input => ledger.verifyProviderLimitRelease(input);
}
