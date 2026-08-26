import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DECKENT_DIR } from '../../../core/constants.js';
import { createExecutionAuthorityError } from '../../../core/errors.js';
import type {
  MissionStore, Mission, NewMission, MissionStatus, Progress, ResultLike,
  WorkItem, NewWorkItem, NewMissionWorkItem, WorkItemStatus,
  WorkItemApprovalBinding, WorkItemApprovalState, ApprovalDecisionTransition,
  MissionClaimFence, MissionDispatchClaim, MissionEngineLease,
  MissionRecoveredDispatchAttemptV1, MissionDispatchRecoveryAcknowledgementV1,
  MissionDependencyAuthorityV1, MissionDependencyActivationV1,
  DependencyReconciliationOptions,
} from './mission-types.js';
import type {
  MissionAcceptanceDecisionRecord,
  MissionAcceptanceDecisionV1,
} from './mission-acceptance.js';
import {
  CANONICAL_WORK_ITEM_KINDS,
  assertCanonicalWorkItemKind,
  computeWorkItemDefinitionDigest,
  isCanonicalWorkItemKind,
  listRuntimeAdmittedKinds,
  resolveMissionSprintExecutionSource,
  validateWorkItemAdmission,
  type MissionRunnerRegistryV1,
  type WorkItemAdmissionFenceV1,
} from './mission-kind-admission.js';
import {
  assertStoredMissionAcceptanceRecord,
  readGoalAcceptanceContract,
  validateMissionAcceptanceDecision,
} from './mission-acceptance.js';
import {
  validateStoredApprovalDecision,
  validateStoredApprovalRequest,
  type ApprovalDecision,
  type ApprovalRequest,
} from '../../../core/approval-contract.js';
import { DeckentError } from '../../../core/errors.js';

const WORK_ITEM_STATUSES: ReadonlySet<WorkItemStatus> = new Set([
  'pending', 'running', 'done', 'failed', 'blocked', 'parked',
]);
const CANONICAL_KIND_POSITIONAL = CANONICAL_WORK_ITEM_KINDS.map(() => '?').join(',');
const CANONICAL_KIND_NAMED = CANONICAL_WORK_ITEM_KINDS.map((_, index) => `@canonicalKind${index}`).join(',');
const CANONICAL_KIND_BINDINGS = Object.fromEntries(
  CANONICAL_WORK_ITEM_KINDS.map((kind, index) => [`canonicalKind${index}`, kind]),
);
const WORK_ITEM_WITH_FENCE_COLUMNS = `wi.*,
  fence.schema_version AS admission_schema_version,
  fence.registry_revision AS admission_registry_revision,
  fence.registry_digest AS admission_registry_digest,
  fence.item_kind AS admission_item_kind,
  fence.runner_revision AS admission_runner_revision,
  fence.item_definition_digest AS admission_item_definition_digest`;
const DEFAULT_DEPENDENCY_RECONCILE_MAX_EDGES = 256;
const DEFAULT_DEPENDENCY_RECONCILE_MAX_EDGES_PER_JOB = 64;

export interface SqliteMissionStoreOptions {
  /**
   * Default-off cutover. Production composition must not select normalized-v1
   * until the separately-gated owner default decision.
   */
  dependencyAuthorityMode?: 'legacy-json' | 'normalized-v1';
  /** Durable composition decision reference required by normalized-v1 mode. */
  dependencyAuthorityRef?: string;
}

interface NormalizedDependencyEdge {
  missionId: string;
  workItemId: string;
  dependencyItemId: string;
}

function dependencySatisfiedPredicate(itemAlias: string): string {
  return `(
    (
      NOT EXISTS (
        SELECT 1 FROM mission_graph_authorities graph
        WHERE graph.mission_id=${itemAlias}.mission_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM json_each(COALESCE(${itemAlias}.depends_on, '[]')) dep
        LEFT JOIN work_items upstream
          ON upstream.id=dep.value AND upstream.mission_id=${itemAlias}.mission_id
        WHERE upstream.id IS NULL OR upstream.status<>'done'
      )
    )
    OR (
      EXISTS (
        SELECT 1 FROM mission_graph_authorities graph
        WHERE graph.mission_id=${itemAlias}.mission_id AND graph.authority_state='active'
      )
      AND NOT EXISTS (
        SELECT 1 FROM work_item_dependencies dependency
        LEFT JOIN work_items upstream
          ON upstream.id=dependency.dependency_item_id
          AND upstream.mission_id=dependency.mission_id
        WHERE dependency.mission_id=${itemAlias}.mission_id
          AND dependency.work_item_id=${itemAlias}.id
          AND (upstream.id IS NULL OR upstream.status<>'done')
      )
    )
  )`;
}

function dependencyReadinessPredicate(itemAlias: string): string {
  return `(
    NOT EXISTS (
      SELECT 1 FROM mission_graph_authorities graph
      WHERE graph.mission_id=${itemAlias}.mission_id
    )
    OR (
      EXISTS (
        SELECT 1 FROM mission_graph_authorities graph
        WHERE graph.mission_id=${itemAlias}.mission_id AND graph.authority_state='active'
      )
      AND EXISTS (
        SELECT 1 FROM work_item_dependency_readiness readiness
        WHERE readiness.mission_id=${itemAlias}.mission_id
          AND readiness.work_item_id=${itemAlias}.id
          AND readiness.remaining_count=0
          AND readiness.failed_count=0
      )
    )
  )`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

type PersistedTriggerDisposition =
  | { kind: 'one-off'; triggerType: 'one-off' }
  | { kind: 'occurrence-authority-required'; triggerType: 'recurring' | 'reactive' }
  | { kind: 'invalid'; triggerType: string | null };

function isExactLegacyUnknownKindQuarantine(
  mission: NewMission,
  item: NewMissionWorkItem,
): boolean {
  const legacyImport = mission.spec?.['legacyImport'];
  const admission = item.initialResult?.['missionAdmission'];
  return mission.id === 'legacy'
    && mission.kind === 'list'
    && isRecord(legacyImport)
    && legacyImport['schemaVersion'] === 1
    && legacyImport['source'] === 'backlog.json'
    && typeof legacyImport['sourceDigest'] === 'string'
    && /^[a-f0-9]{64}$/u.test(legacyImport['sourceDigest'])
    && item.initialStatus === 'failed'
    && item.admissionFence === undefined
    && item.initialResult?.ok === false
    && typeof item.initialResult.reason === 'string'
    && item.initialResult.reason.startsWith('MISSION_MIGRATION_QUARANTINED:')
    && isRecord(admission)
    && admission['code'] === 'UNKNOWN_KIND'
    && admission['itemId'] === item.id
    && admission['persistedKind'] === String(item.kind)
    && admission['decision'] === 'failed-closed'
    && admission['source'] === 'legacy-backlog-import'
    && typeof admission['authorityRevision'] === 'string'
    && admission['authorityRevision'].length > 0
    && typeof admission['authorityDigest'] === 'string'
    && /^[a-f0-9]{64}$/u.test(admission['authorityDigest']);
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS missions (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, status TEXT NOT NULL,
  tenant TEXT NOT NULL, title TEXT NOT NULL, spec TEXT,
  created_by TEXT, deliver_to TEXT, render_as TEXT NOT NULL, progress TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT, last_result TEXT );
CREATE TABLE IF NOT EXISTS work_items (
  id TEXT PRIMARY KEY, mission_id TEXT NOT NULL REFERENCES missions(id), kind TEXT NOT NULL,
  status TEXT NOT NULL, spec TEXT, policy TEXT NOT NULL DEFAULT 'auto', render_as TEXT NOT NULL,
  progress TEXT, depends_on TEXT, trigger TEXT, claimed_at TEXT, claimed_by TEXT,
  revision INTEGER NOT NULL DEFAULT 0,
  claim_registry_revision TEXT, claim_registry_digest TEXT,
  claim_attempt_id TEXT, claim_fence_token_hash TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_result TEXT );
CREATE INDEX IF NOT EXISTS idx_wi_mission_status ON work_items(mission_id, status);
CREATE INDEX IF NOT EXISTS idx_wi_status ON work_items(status);
CREATE INDEX IF NOT EXISTS idx_m_status_tenant ON missions(status, tenant);
CREATE UNIQUE INDEX IF NOT EXISTS uq_wi_mission_id_id ON work_items(mission_id, id);
CREATE TABLE IF NOT EXISTS mission_graph_authorities (
  mission_id TEXT PRIMARY KEY REFERENCES missions(id) ON DELETE CASCADE,
  schema_version INTEGER NOT NULL CHECK(schema_version=1),
  authority_state TEXT NOT NULL
    CHECK(authority_state IN ('migration-pending','active','quarantined')),
  graph_revision INTEGER NOT NULL CHECK(graph_revision>=1),
  graph_digest TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK(source_kind IN ('new-v1','legacy-json-v1')),
  activation_json TEXT,
  activation_digest TEXT,
  activated_at TEXT,
  quarantine_reason TEXT,
  updated_at TEXT NOT NULL );
CREATE INDEX IF NOT EXISTS idx_mga_state ON mission_graph_authorities(authority_state, updated_at);
CREATE TABLE IF NOT EXISTS work_item_dependencies (
  mission_id TEXT NOT NULL,
  work_item_id TEXT NOT NULL,
  dependency_item_id TEXT NOT NULL,
  admitted_revision INTEGER NOT NULL CHECK(admitted_revision>=1),
  created_at TEXT NOT NULL,
  PRIMARY KEY(mission_id, work_item_id, dependency_item_id),
  CHECK(work_item_id<>dependency_item_id),
  FOREIGN KEY(mission_id, work_item_id)
    REFERENCES work_items(mission_id, id) ON DELETE CASCADE,
  FOREIGN KEY(mission_id, dependency_item_id)
    REFERENCES work_items(mission_id, id) ON DELETE RESTRICT );
CREATE INDEX IF NOT EXISTS idx_wid_upstreams
  ON work_item_dependencies(mission_id, work_item_id, dependency_item_id);
CREATE INDEX IF NOT EXISTS idx_wid_dependants
  ON work_item_dependencies(mission_id, dependency_item_id, work_item_id);
CREATE TABLE IF NOT EXISTS work_item_dependency_readiness (
  mission_id TEXT NOT NULL,
  work_item_id TEXT NOT NULL,
  graph_revision INTEGER NOT NULL CHECK(graph_revision>=1),
  remaining_count INTEGER NOT NULL CHECK(remaining_count>=0),
  failed_count INTEGER NOT NULL CHECK(failed_count>=0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY(mission_id, work_item_id),
  FOREIGN KEY(mission_id, work_item_id)
    REFERENCES work_items(mission_id, id) ON DELETE CASCADE );
CREATE INDEX IF NOT EXISTS idx_widr_ready
  ON work_item_dependency_readiness(mission_id, failed_count, remaining_count, work_item_id);
CREATE TABLE IF NOT EXISTS mission_dependency_reconcile_queue (
  mission_id TEXT NOT NULL,
  upstream_item_id TEXT NOT NULL,
  upstream_revision INTEGER NOT NULL CHECK(upstream_revision>=0),
  outcome TEXT NOT NULL CHECK(outcome IN ('done','failed','blocked')),
  cursor_work_item_id TEXT NOT NULL DEFAULT '',
  turn_seq INTEGER NOT NULL DEFAULT 0 CHECK(turn_seq>=0),
  state TEXT NOT NULL CHECK(state IN ('pending','done')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(mission_id, upstream_item_id, upstream_revision, outcome),
  FOREIGN KEY(mission_id, upstream_item_id)
    REFERENCES work_items(mission_id, id) ON DELETE CASCADE );
CREATE INDEX IF NOT EXISTS idx_mdrq_pending
  ON mission_dependency_reconcile_queue(state, updated_at, mission_id, upstream_item_id);
CREATE TABLE IF NOT EXISTS mission_graph_migration_evidence (
  mission_id TEXT PRIMARY KEY REFERENCES missions(id) ON DELETE CASCADE,
  source_digest TEXT NOT NULL,
  graph_digest TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  evidence_digest TEXT NOT NULL,
  created_at TEXT NOT NULL );
CREATE TRIGGER IF NOT EXISTS mission_graph_migration_evidence_no_update
  BEFORE UPDATE ON mission_graph_migration_evidence BEGIN
    SELECT RAISE(ABORT, 'mission graph migration evidence is immutable');
  END;
CREATE TRIGGER IF NOT EXISTS mission_graph_migration_evidence_no_delete
  BEFORE DELETE ON mission_graph_migration_evidence BEGIN
    SELECT RAISE(ABORT, 'mission graph migration evidence is immutable');
  END;
CREATE TRIGGER IF NOT EXISTS normalized_dependency_no_update
  BEFORE UPDATE ON work_item_dependencies BEGIN
    SELECT RAISE(ABORT, 'normalized dependency edges are immutable');
  END;
CREATE TRIGGER IF NOT EXISTS normalized_dependency_no_delete
  BEFORE DELETE ON work_item_dependencies BEGIN
    SELECT RAISE(ABORT, 'normalized dependency edges are immutable');
  END;
CREATE TRIGGER IF NOT EXISTS normalized_dependency_terminal_update
  AFTER UPDATE OF status ON work_items
  WHEN NEW.status IN ('done','failed','blocked')
    AND OLD.status<>NEW.status
    AND EXISTS (
      SELECT 1 FROM mission_graph_authorities graph
      WHERE graph.mission_id=NEW.mission_id AND graph.authority_state='active'
    )
  BEGIN
    INSERT OR IGNORE INTO mission_dependency_reconcile_queue(
      mission_id,upstream_item_id,upstream_revision,outcome,
      cursor_work_item_id,state,created_at,updated_at
    ) VALUES(
      NEW.mission_id,NEW.id,NEW.revision,NEW.status,'','pending',NEW.updated_at,NEW.updated_at
    );
  END;
CREATE TABLE IF NOT EXISTS work_item_admission_fences (
  work_item_id TEXT PRIMARY KEY REFERENCES work_items(id) ON DELETE CASCADE,
  schema_version INTEGER NOT NULL,
  registry_revision TEXT NOT NULL,
  registry_digest TEXT NOT NULL,
  item_kind TEXT NOT NULL,
  runner_revision TEXT NOT NULL,
  item_definition_digest TEXT NOT NULL,
  created_at TEXT NOT NULL );
CREATE INDEX IF NOT EXISTS idx_wiaf_registry ON work_item_admission_fences(registry_revision, registry_digest);
CREATE TABLE IF NOT EXISTS work_item_approvals (
  work_item_id TEXT PRIMARY KEY REFERENCES work_items(id),
  request_id TEXT NOT NULL UNIQUE,
  request_json TEXT NOT NULL,
  publish_state TEXT NOT NULL CHECK(publish_state IN ('outbox','published')),
  decision_state TEXT NOT NULL CHECK(decision_state IN ('pending','allowed','denied','expired','deferred','escalated')),
  decision_json TEXT,
  created_at TEXT NOT NULL,
  published_at TEXT,
  decided_at TEXT,
  updated_at TEXT NOT NULL );
CREATE INDEX IF NOT EXISTS idx_wia_publish ON work_item_approvals(publish_state, created_at);
CREATE INDEX IF NOT EXISTS idx_wia_decision ON work_item_approvals(decision_state, created_at);
CREATE TABLE IF NOT EXISTS mission_acceptance_decisions (
  mission_id TEXT NOT NULL REFERENCES missions(id),
  round INTEGER NOT NULL CHECK(round >= 0),
  contract_digest TEXT NOT NULL,
  decision_digest TEXT NOT NULL,
  record_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(mission_id, round),
  UNIQUE(mission_id, decision_digest) );
CREATE INDEX IF NOT EXISTS idx_mad_mission_created ON mission_acceptance_decisions(mission_id, created_at);
CREATE TABLE IF NOT EXISTS mission_engine_lease (
  singleton_id INTEGER PRIMARY KEY CHECK(singleton_id=1),
  owner_id TEXT NOT NULL,
  epoch INTEGER NOT NULL CHECK(epoch >= 1),
  lease_token_hash TEXT NOT NULL,
  acquired_at TEXT NOT NULL,
  renewed_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  expires_at_ms INTEGER NOT NULL );
CREATE TABLE IF NOT EXISTS mission_dispatch_recoveries (
  recovery_id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL UNIQUE,
  payload_json TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  captured_at TEXT NOT NULL );
CREATE TABLE IF NOT EXISTS mission_dispatch_recovery_acknowledgements (
  recovery_id TEXT PRIMARY KEY REFERENCES mission_dispatch_recoveries(recovery_id),
  payload_json TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  acknowledged_at TEXT NOT NULL );
CREATE TRIGGER IF NOT EXISTS mission_dispatch_recoveries_no_update
  BEFORE UPDATE ON mission_dispatch_recoveries BEGIN
    SELECT RAISE(ABORT, 'mission dispatch recoveries are immutable');
  END;
CREATE TRIGGER IF NOT EXISTS mission_dispatch_recoveries_no_delete
  BEFORE DELETE ON mission_dispatch_recoveries BEGIN
    SELECT RAISE(ABORT, 'mission dispatch recoveries are immutable');
  END;
CREATE TRIGGER IF NOT EXISTS mission_dispatch_recovery_acks_no_update
  BEFORE UPDATE ON mission_dispatch_recovery_acknowledgements BEGIN
    SELECT RAISE(ABORT, 'mission dispatch recovery acknowledgements are immutable');
  END;
CREATE TRIGGER IF NOT EXISTS mission_dispatch_recovery_acks_no_delete
  BEFORE DELETE ON mission_dispatch_recovery_acknowledgements BEGIN
    SELECT RAISE(ABORT, 'mission dispatch recovery acknowledgements are immutable');
  END;
`;

/** Durable mission store (SQLite WAL) — the autonomous-v2 single source of truth. */
export class SqliteMissionStore implements MissionStore {
  protected db: DatabaseType;
  private readonly dependencyAuthorityMode: 'legacy-json' | 'normalized-v1';
  private readonly dependencyAuthorityRef: string | null;

  constructor(projectRoot: string, opts: SqliteMissionStoreOptions = {}) {
    this.dependencyAuthorityMode = opts.dependencyAuthorityMode ?? 'legacy-json';
    this.dependencyAuthorityRef = opts.dependencyAuthorityRef?.trim() || null;
    if (this.dependencyAuthorityMode === 'normalized-v1' && this.dependencyAuthorityRef === null) {
      throw new TypeError('MISSION_DEPENDENCY_AUTHORITY_REF_REQUIRED');
    }
    const dir = join(projectRoot, DECKENT_DIR, 'autonomous');
    mkdirSync(dir, { recursive: true });
    this.db = new Database(join(dir, 'autonomous.db'));
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('journal_mode = WAL');
  }
  migrate(): void {
    this.db.exec(SCHEMA);
    const columns = new Set((this.db.prepare('PRAGMA table_info(work_items)').all() as Array<{ name: string }>).map((row) => row.name));
    if (!columns.has('revision')) this.db.exec('ALTER TABLE work_items ADD COLUMN revision INTEGER NOT NULL DEFAULT 0');
    if (!columns.has('claim_registry_revision')) this.db.exec('ALTER TABLE work_items ADD COLUMN claim_registry_revision TEXT');
    if (!columns.has('claim_registry_digest')) this.db.exec('ALTER TABLE work_items ADD COLUMN claim_registry_digest TEXT');
    if (!columns.has('claim_attempt_id')) this.db.exec('ALTER TABLE work_items ADD COLUMN claim_attempt_id TEXT');
    if (!columns.has('claim_fence_token_hash')) this.db.exec('ALTER TABLE work_items ADD COLUMN claim_fence_token_hash TEXT');
  }
  recover(engineLease: MissionEngineLease): readonly MissionRecoveredDispatchAttemptV1[] {
    const transaction = this.db.transaction((): readonly MissionRecoveredDispatchAttemptV1[] => {
      if (!this.isEngineLeaseActive(engineLease)) {
        throw createExecutionAuthorityError(`MISSION_ENGINE_LEASE_LOST: recovery authority ${engineLease.ownerId}`);
      }
      // Capture every complete running claim before ANY recovery mutation can
      // revoke its exact identity. Kind/trigger classification still owns the
      // final parked/failed reason, but cannot strand an already-started receipt.
      const running = this.db.prepare(`SELECT
          wi.id,wi.mission_id,wi.claimed_by,wi.claimed_at,wi.revision,
          wi.claim_attempt_id,wi.claim_fence_token_hash,
          wi.claim_registry_revision,wi.claim_registry_digest,m.tenant
        FROM work_items wi JOIN missions m ON m.id=wi.mission_id
        WHERE wi.status='running'
        ORDER BY wi.id`).all() as Array<{
          id: string;
          mission_id: string;
          claimed_by: string | null;
          claimed_at: string | null;
          revision: number;
          claim_attempt_id: string | null;
          claim_fence_token_hash: string | null;
          claim_registry_revision: string | null;
          claim_registry_digest: string | null;
          tenant: string;
        }>;
      const insertRecovery = this.db.prepare(`INSERT INTO mission_dispatch_recoveries(
          recovery_id,attempt_id,payload_json,payload_hash,captured_at
        ) VALUES(@recoveryId,@attemptId,@payloadJson,@payloadHash,@capturedAt)
        ON CONFLICT(recovery_id) DO NOTHING`);
      for (const row of running) {
        if (!row.tenant || !row.mission_id || !row.id
          || !row.claimed_by || !row.claimed_at
          || !Number.isFinite(Date.parse(row.claimed_at))
          || !row.claim_attempt_id
          || !row.claim_fence_token_hash
          || !/^[a-f0-9]{64}$/u.test(row.claim_fence_token_hash)
          || !Number.isSafeInteger(row.revision) || row.revision < 1) continue;
        const recoveryId = `mission-dispatch-recovery-${this.claimTokenHash([
          row.tenant, row.mission_id, row.id, row.claim_attempt_id, row.claim_fence_token_hash,
        ].join('\0'))}`;
        const recovery: MissionRecoveredDispatchAttemptV1 = Object.freeze({
          schemaVersion: 1,
          recoveryId,
          tenantId: row.tenant,
          missionId: row.mission_id,
          workItemId: row.id,
          claimedBy: row.claimed_by,
          claimedAt: row.claimed_at,
          itemRevision: row.revision,
          attemptId: row.claim_attempt_id,
          fenceTokenHash: row.claim_fence_token_hash,
          claimRegistryRevision: row.claim_registry_revision,
          claimRegistryDigest: row.claim_registry_digest,
          observedByEngineOwnerId: engineLease.ownerId,
          observedByEngineEpoch: engineLease.epoch,
          observedAt: engineLease.acquiredAt,
        });
        const payloadJson = this.canonical(recovery);
        const payloadHash = this.claimTokenHash(payloadJson);
        const info = insertRecovery.run({
          recoveryId,
          attemptId: recovery.attemptId,
          payloadJson,
          payloadHash,
          capturedAt: recovery.observedAt,
        });
        if (info.changes === 0) {
          const existing = this.db.prepare(`SELECT payload_json,payload_hash
            FROM mission_dispatch_recoveries WHERE recovery_id=?`).get(recoveryId) as {
              payload_json: string;
              payload_hash: string;
            } | undefined;
          if (!existing || existing.payload_json !== payloadJson || existing.payload_hash !== payloadHash) {
            throw createExecutionAuthorityError(`MISSION_DISPATCH_RECOVERY_CONFLICT: ${recoveryId}`);
          }
        }
      }
      // Classify unsupported/trigger-invalid rows only after their exact claim
      // identity is durably journaled. These routines may clear claim columns.
      this.reconcileUnsupportedKinds();
      this.reconcileNonExecutableTriggers();
      const result = JSON.stringify({
        ok: false,
        reason: 'RECOVERY_RECONCILIATION_REQUIRED: prior running attempt has no terminal dispatch evidence; automatic redrive refused',
      });
      this.db.prepare(`UPDATE work_items SET status='parked', last_result=@result, revision=revision+1,
        claimed_at=NULL, claimed_by=NULL, claim_attempt_id=NULL, claim_fence_token_hash=NULL,
        updated_at=@ts WHERE status='running'`)
        .run({ result, ts: this.now() });
      return this.listPendingDispatchRecoveries();
    });
    return transaction.immediate();
  }
  listPendingDispatchRecoveries(): readonly MissionRecoveredDispatchAttemptV1[] {
    const rows = this.db.prepare(`SELECT
        recovery.recovery_id,recovery.payload_json,recovery.payload_hash,
        ack.payload_json AS ack_payload_json,ack.payload_hash AS ack_payload_hash
      FROM mission_dispatch_recoveries recovery
      LEFT JOIN mission_dispatch_recovery_acknowledgements ack
        ON ack.recovery_id=recovery.recovery_id
      ORDER BY recovery.captured_at,recovery.recovery_id`).all() as Array<{
        recovery_id: string;
        payload_json: string;
        payload_hash: string;
        ack_payload_json: string | null;
        ack_payload_hash: string | null;
      }>;
    const pending: MissionRecoveredDispatchAttemptV1[] = [];
    for (const row of rows) {
      const recovery = this.readDispatchRecovery(row.payload_json, row.payload_hash);
      if (recovery.recoveryId !== row.recovery_id) {
        throw createExecutionAuthorityError('MISSION_DISPATCH_RECOVERY_INTEGRITY_FAILURE');
      }
      if (row.ack_payload_json !== null || row.ack_payload_hash !== null) {
        if (row.ack_payload_json === null || row.ack_payload_hash === null) {
          throw createExecutionAuthorityError('MISSION_DISPATCH_RECOVERY_ACK_INTEGRITY_FAILURE');
        }
        const acknowledgement = this.readDispatchRecoveryAcknowledgement(
          row.ack_payload_json,
          row.ack_payload_hash,
        );
        if (acknowledgement.recoveryId !== recovery.recoveryId) {
          throw createExecutionAuthorityError('MISSION_DISPATCH_RECOVERY_ACK_INTEGRITY_FAILURE');
        }
        continue;
      }
      pending.push(recovery);
    }
    return pending;
  }
  acknowledgeDispatchRecovery(
    acknowledgement: MissionDispatchRecoveryAcknowledgementV1,
    engineLease: MissionEngineLease,
  ): boolean {
    const transaction = this.db.transaction((): boolean => {
      if (!this.isEngineLeaseActive(engineLease)) {
        throw createExecutionAuthorityError(`MISSION_ENGINE_LEASE_LOST: recovery acknowledgement ${engineLease.ownerId}`);
      }
      this.assertDispatchRecoveryAcknowledgement(acknowledgement);
      const recovery = this.db.prepare(`SELECT 1 AS present FROM mission_dispatch_recoveries
        WHERE recovery_id=?`).get(acknowledgement.recoveryId);
      if (!recovery) throw createExecutionAuthorityError(`MISSION_DISPATCH_RECOVERY_NOT_FOUND: ${acknowledgement.recoveryId}`);
      const payloadJson = this.canonical(acknowledgement);
      const payloadHash = this.claimTokenHash(payloadJson);
      const info = this.db.prepare(`INSERT INTO mission_dispatch_recovery_acknowledgements(
          recovery_id,payload_json,payload_hash,acknowledged_at
        ) VALUES(@recoveryId,@payloadJson,@payloadHash,@acknowledgedAt)
        ON CONFLICT(recovery_id) DO NOTHING`).run({
          recoveryId: acknowledgement.recoveryId,
          payloadJson,
          payloadHash,
          acknowledgedAt: acknowledgement.acknowledgedAt,
        });
      if (info.changes === 1) return true;
      const existing = this.db.prepare(`SELECT payload_json,payload_hash
        FROM mission_dispatch_recovery_acknowledgements WHERE recovery_id=?`)
        .get(acknowledgement.recoveryId) as { payload_json: string; payload_hash: string } | undefined;
      if (!existing || existing.payload_json !== payloadJson || existing.payload_hash !== payloadHash) {
        throw createExecutionAuthorityError(`MISSION_DISPATCH_RECOVERY_ACK_CONFLICT: ${acknowledgement.recoveryId}`);
      }
      return false;
    });
    return transaction.immediate();
  }
  close(): void { this.db.close(); }

  private now(): string { return new Date().toISOString(); }
  private claimTokenHash(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }
  private validEngineLeaseShape(lease: MissionEngineLease): boolean {
    return lease.schemaVersion === 1
      && lease.ownerId.length > 0
      && lease.ownerId === lease.ownerId.trim()
      && Number.isSafeInteger(lease.epoch)
      && lease.epoch >= 1
      && lease.leaseToken.length > 0
      && lease.leaseTokenHash === this.claimTokenHash(lease.leaseToken);
  }
  private assertLeaseTtl(ttlMs: number): void {
    if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
      throw new TypeError('MISSION_ENGINE_LEASE_INVALID: ttlMs');
    }
  }
  private engineLeasePredicate(engineLease: MissionEngineLease | undefined, nowMs: number): {
    sql: string;
    bindings: Record<string, unknown>;
  } | null {
    if (!engineLease) return { sql: '', bindings: {} };
    if (!this.validEngineLeaseShape(engineLease)) return null;
    return {
      sql: ` AND EXISTS (
        SELECT 1 FROM mission_engine_lease engine
        WHERE engine.singleton_id=1
          AND engine.owner_id=@engineOwnerId
          AND engine.epoch=@engineEpoch
          AND engine.lease_token_hash=@engineTokenHash
          AND engine.expires_at_ms>@engineNowMs
      )`,
      bindings: {
        engineOwnerId: engineLease.ownerId,
        engineEpoch: engineLease.epoch,
        engineTokenHash: engineLease.leaseTokenHash,
        engineNowMs: nowMs,
      },
    };
  }
  private j(v: unknown): string | null { return v === undefined || v === null ? null : JSON.stringify(v); }
  private p<T>(s: unknown): T | null { return typeof s === 'string' && s.length ? JSON.parse(s) as T : null; }
  private canonical(v: unknown): string {
    const normalize = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(normalize);
      if (value !== null && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value as Record<string, unknown>)
          .filter(([, nested]) => nested !== undefined)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, nested]) => [key, normalize(nested)]));
      }
      return value ?? null;
    };
    return JSON.stringify(normalize(v));
  }
  private digest(v: unknown): string {
    return this.claimTokenHash(typeof v === 'string' ? v : this.canonical(v));
  }
  private graphDigest(edges: readonly NormalizedDependencyEdge[]): string {
    return this.digest(edges
      .map((edge) => ({
        missionId: edge.missionId,
        workItemId: edge.workItemId,
        dependencyItemId: edge.dependencyItemId,
      }))
      .sort((a, b) => a.workItemId.localeCompare(b.workItemId)
        || a.dependencyItemId.localeCompare(b.dependencyItemId)));
  }
  private normalizedDependencies(missionId: string, workItemId: string): string[] {
    return (this.db.prepare(`SELECT dependency_item_id FROM work_item_dependencies
      WHERE mission_id=? AND work_item_id=? ORDER BY dependency_item_id`)
      .all(missionId, workItemId) as Array<{ dependency_item_id: string }>)
      .map((row) => row.dependency_item_id);
  }
  private dependencyAuthorityRow(missionId: string): any | undefined {
    return this.db.prepare('SELECT * FROM mission_graph_authorities WHERE mission_id=?').get(missionId);
  }
  private validateGraph(
    missionId: string,
    definitions: readonly { id: string; dependsOn: readonly string[] }[],
  ): NormalizedDependencyEdge[] {
    const ids = new Set<string>();
    for (const item of definitions) {
      if (!item.id || item.id !== item.id.trim() || ids.has(item.id)) {
        throw createExecutionAuthorityError(
          `MISSION_DEPENDENCY_GRAPH_INVALID: duplicate or non-canonical item ${item.id}`,
        );
      }
      ids.add(item.id);
    }
    const edges: NormalizedDependencyEdge[] = [];
    const indegree = new Map<string, number>();
    const dependants = new Map<string, string[]>();
    for (const item of definitions) {
      const unique = new Set<string>();
      for (const dependencyId of item.dependsOn) {
        if (!dependencyId || dependencyId !== dependencyId.trim()) {
          throw createExecutionAuthorityError(
            `MISSION_DEPENDENCY_GRAPH_INVALID: non-canonical dependency for ${item.id}`,
          );
        }
        if (dependencyId === item.id) {
          throw createExecutionAuthorityError(
            `MISSION_DEPENDENCY_GRAPH_INVALID: self dependency ${item.id}`,
          );
        }
        if (unique.has(dependencyId)) {
          throw createExecutionAuthorityError(
            `MISSION_DEPENDENCY_GRAPH_INVALID: duplicate dependency ${item.id}->${dependencyId}`,
          );
        }
        if (!ids.has(dependencyId)) {
          throw createExecutionAuthorityError(
            `MISSION_DEPENDENCY_GRAPH_INVALID: missing or foreign dependency ${item.id}->${dependencyId}`,
          );
        }
        unique.add(dependencyId);
        edges.push({ missionId, workItemId: item.id, dependencyItemId: dependencyId });
        const downstream = dependants.get(dependencyId) ?? [];
        downstream.push(item.id);
        dependants.set(dependencyId, downstream);
      }
      indegree.set(item.id, unique.size);
    }
    for (const downstream of dependants.values()) downstream.sort();
    const ready = [...ids].filter((id) => indegree.get(id) === 0).sort();
    let cursor = 0;
    let visited = 0;
    while (cursor < ready.length) {
      const id = ready[cursor++]!;
      visited++;
      for (const dependant of dependants.get(id) ?? []) {
        const next = (indegree.get(dependant) ?? 0) - 1;
        indegree.set(dependant, next);
        if (next === 0) ready.push(dependant);
      }
    }
    if (visited !== definitions.length) {
      const cyclic = [...indegree.entries()]
        .filter(([, degree]) => degree > 0)
        .map(([id]) => id)
        .sort();
      throw createExecutionAuthorityError(
        `MISSION_DEPENDENCY_GRAPH_INVALID: cycle ${cyclic.join(', ')}`,
      );
    }
    return edges.sort((a, b) => a.workItemId.localeCompare(b.workItemId)
      || a.dependencyItemId.localeCompare(b.dependencyItemId));
  }
  private readLegacyGraph(missionId: string): {
    definitions: Array<{ id: string; dependsOn: string[] }>;
    edges: NormalizedDependencyEdge[];
    sourceDigest: string;
    graphDigest: string;
  } {
    const rows = this.db.prepare(`SELECT id,depends_on FROM work_items
      WHERE mission_id=? ORDER BY id`).all(missionId) as Array<{ id: string; depends_on: string | null }>;
    const definitions = rows.map((row) => {
      let parsed: unknown;
      try {
        parsed = row.depends_on === null || row.depends_on === '' ? [] : JSON.parse(row.depends_on);
      } catch {
        throw createExecutionAuthorityError(
          `MISSION_DEPENDENCY_GRAPH_INVALID: malformed JSON for ${row.id}`,
        );
      }
      if (!Array.isArray(parsed) || parsed.some((value) => typeof value !== 'string')) {
        throw createExecutionAuthorityError(
          `MISSION_DEPENDENCY_GRAPH_INVALID: non-string dependency list for ${row.id}`,
        );
      }
      return { id: row.id, dependsOn: parsed as string[] };
    });
    const edges = this.validateGraph(missionId, definitions);
    return {
      definitions,
      edges,
      sourceDigest: this.digest(rows),
      graphDigest: this.graphDigest(edges),
    };
  }
  private refreshReadiness(
    missionId: string,
    graphRevision: number,
    ts: string,
    itemIds?: readonly string[],
  ): void {
    const items = itemIds
      ? itemIds.map((id) => ({ id }))
      : this.db.prepare(`SELECT id FROM work_items WHERE mission_id=? ORDER BY id`)
        .all(missionId) as Array<{ id: string }>;
    const upsert = this.db.prepare(`INSERT INTO work_item_dependency_readiness(
        mission_id,work_item_id,graph_revision,remaining_count,failed_count,updated_at
      ) VALUES(@missionId,@workItemId,@graphRevision,@remaining,@failed,@ts)
      ON CONFLICT(mission_id,work_item_id) DO UPDATE SET
        graph_revision=excluded.graph_revision,
        remaining_count=excluded.remaining_count,
        failed_count=excluded.failed_count,
        updated_at=excluded.updated_at`);
    for (const item of items) {
      const counts = this.db.prepare(`SELECT
          SUM(CASE WHEN upstream.status<>'done' THEN 1 ELSE 0 END) AS remaining,
          SUM(CASE WHEN upstream.status IN ('failed','blocked') THEN 1 ELSE 0 END) AS failed
        FROM work_item_dependencies dependency
        JOIN work_items upstream
          ON upstream.mission_id=dependency.mission_id
          AND upstream.id=dependency.dependency_item_id
        WHERE dependency.mission_id=? AND dependency.work_item_id=?`)
        .get(missionId, item.id) as { remaining: number | null; failed: number | null };
      upsert.run({
        missionId,
        workItemId: item.id,
        graphRevision,
        remaining: counts.remaining ?? 0,
        failed: counts.failed ?? 0,
        ts,
      });
    }
  }
  private seedTerminalDependencyJobs(missionId: string, ts: string): void {
    this.db.prepare(`INSERT OR IGNORE INTO mission_dependency_reconcile_queue(
        mission_id,upstream_item_id,upstream_revision,outcome,
        cursor_work_item_id,state,created_at,updated_at
      )
      SELECT mission_id,id,revision,status,'','pending',@ts,@ts
      FROM work_items
      WHERE mission_id=@missionId AND status IN ('done','failed','blocked')`)
      .run({ missionId, ts });
  }
  private insertNormalizedEdges(
    missionId: string,
    edges: readonly NormalizedDependencyEdge[],
    graphRevision: number,
    ts: string,
    readinessItemIds?: readonly string[],
  ): void {
    const insert = this.db.prepare(`INSERT INTO work_item_dependencies(
      mission_id,work_item_id,dependency_item_id,admitted_revision,created_at
    ) VALUES(@missionId,@workItemId,@dependencyItemId,@graphRevision,@ts)`);
    for (const edge of edges) insert.run({ ...edge, graphRevision, ts });
    this.refreshReadiness(missionId, graphRevision, ts, readinessItemIds);
  }
  private validateNormalizedAppend(
    missionId: string,
    items: readonly NewWorkItem[],
  ): { edges: NormalizedDependencyEdge[]; graphRevision: number } {
    const authority = this.getDependencyAuthority(missionId);
    if (!authority) {
      throw createExecutionAuthorityError(
        `MISSION_DEPENDENCY_AUTHORITY_NOT_FOUND: ${missionId}`,
      );
    }
    if (authority.state !== 'active') {
      throw createExecutionAuthorityError(
        `MISSION_DEPENDENCY_AUTHORITY_HOLD: ${missionId}:${authority.state}`,
      );
    }
    const existingRows = this.db.prepare(`SELECT id FROM work_items
      WHERE mission_id=? ORDER BY id`).all(missionId) as Array<{ id: string }>;
    const existingDefinitions = existingRows.map((row) => ({
      id: row.id,
      dependsOn: this.normalizedDependencies(missionId, row.id),
    }));
    const all = [
      ...existingDefinitions,
      ...items.map((item) => ({ id: item.id, dependsOn: item.dependsOn ?? [] })),
    ];
    const newIds = new Set(items.map((item) => item.id));
    const allEdges = this.validateGraph(missionId, all);
    return {
      edges: allEdges.filter((edge) => newIds.has(edge.workItemId)),
      graphRevision: authority.graphRevision + 1,
    };
  }
  private updateNormalizedGraphDigest(missionId: string, graphRevision: number, ts: string): string {
    const rows = this.db.prepare(`SELECT mission_id,work_item_id,dependency_item_id
      FROM work_item_dependencies WHERE mission_id=?
      ORDER BY work_item_id,dependency_item_id`).all(missionId) as Array<{
        mission_id: string;
        work_item_id: string;
        dependency_item_id: string;
      }>;
    const graphDigest = this.graphDigest(rows.map((row) => ({
      missionId: row.mission_id,
      workItemId: row.work_item_id,
      dependencyItemId: row.dependency_item_id,
    })));
    const info = this.db.prepare(`UPDATE mission_graph_authorities
      SET graph_revision=@graphRevision,graph_digest=@graphDigest,updated_at=@ts
      WHERE mission_id=@missionId AND authority_state='active'`).run({
      missionId,
      graphRevision,
      graphDigest,
      ts,
    });
    if (info.changes !== 1) {
      throw createExecutionAuthorityError(
        `MISSION_DEPENDENCY_AUTHORITY_HOLD: ${missionId}`,
      );
    }
    return graphDigest;
  }
  private readDispatchRecovery(
    payloadJson: string,
    payloadHash: string,
  ): MissionRecoveredDispatchAttemptV1 {
    if (this.claimTokenHash(payloadJson) !== payloadHash) {
      throw createExecutionAuthorityError('MISSION_DISPATCH_RECOVERY_INTEGRITY_FAILURE');
    }
    const value = JSON.parse(payloadJson) as MissionRecoveredDispatchAttemptV1;
    if (value.schemaVersion !== 1
      || !value.recoveryId || !value.tenantId || !value.missionId || !value.workItemId
      || !value.claimedBy || !value.claimedAt || !value.attemptId
      || !Number.isSafeInteger(value.itemRevision) || value.itemRevision < 1
      || !/^[a-f0-9]{64}$/u.test(value.fenceTokenHash)
      || !value.observedByEngineOwnerId
      || !Number.isSafeInteger(value.observedByEngineEpoch)
      || value.observedByEngineEpoch < 1
      || !Number.isFinite(Date.parse(value.observedAt))) {
      throw createExecutionAuthorityError('MISSION_DISPATCH_RECOVERY_INTEGRITY_FAILURE');
    }
    return Object.freeze(value);
  }
  private assertDispatchRecoveryAcknowledgement(
    value: MissionDispatchRecoveryAcknowledgementV1,
  ): void {
    if (value.schemaVersion !== 1
      || !value.recoveryId || !value.invocationId || !value.receiptEventId
      || !/^[a-f0-9]{64}$/u.test(value.receiptEventHash)
      || !Number.isFinite(Date.parse(value.acknowledgedAt))
      || (value.outcome !== 'receipt-reconciled' && value.outcome !== 'receipt-already-terminal')) {
      throw createExecutionAuthorityError('MISSION_DISPATCH_RECOVERY_ACK_INVALID');
    }
  }
  private readDispatchRecoveryAcknowledgement(
    payloadJson: string,
    payloadHash: string,
  ): MissionDispatchRecoveryAcknowledgementV1 {
    if (this.claimTokenHash(payloadJson) !== payloadHash) {
      throw createExecutionAuthorityError('MISSION_DISPATCH_RECOVERY_ACK_INTEGRITY_FAILURE');
    }
    const value = JSON.parse(payloadJson) as MissionDispatchRecoveryAcknowledgementV1;
    this.assertDispatchRecoveryAcknowledgement(value);
    return Object.freeze(value);
  }

  private classifyPersistedTrigger(rawTrigger: unknown): PersistedTriggerDisposition {
    if (rawTrigger === null || rawTrigger === undefined) {
      return { kind: 'one-off', triggerType: 'one-off' };
    }
    let trigger: unknown;
    try {
      trigger = typeof rawTrigger === 'string' ? JSON.parse(rawTrigger) : rawTrigger;
    } catch {
      return { kind: 'invalid', triggerType: null };
    }
    const triggerType = isRecord(trigger) && typeof trigger['type'] === 'string'
      ? trigger['type']
      : null;
    if (triggerType === 'one-off') return { kind: 'one-off', triggerType };
    if (triggerType === 'recurring' || triggerType === 'reactive') {
      return { kind: 'occurrence-authority-required', triggerType };
    }
    return { kind: 'invalid', triggerType };
  }

  private assertPersistableTrigger(item: NewWorkItem): void {
    const classification = this.classifyPersistedTrigger(item.trigger);
    if (classification.kind === 'invalid') {
      throw createExecutionAuthorityError(`MISSION_TRIGGER_INVALID: ${item.id}`);
    }
  }

  /**
   * A recurring/reactive row is a trigger definition, not an executable
   * occurrence. Until an occurrence-specific WorkItem has been materialized,
   * every direct execution surface must fail closed. Invalid persisted trigger
   * shapes are quarantined as terminal failures without persisting raw payloads.
   */
  private reconcileNonExecutableTriggers(itemId?: string): string[] {
    const rows = this.db.prepare(`SELECT id,mission_id,status,revision,trigger,
        claimed_at,claimed_by,last_result FROM work_items
      WHERE status IN ('pending','running','parked') AND trigger IS NOT NULL
        ${itemId === undefined ? '' : 'AND id=?'}`)
      .all(...(itemId === undefined ? [] : [itemId])) as Array<{
        id: string;
        mission_id: string;
        status: WorkItemStatus;
        revision: number;
        trigger: unknown;
        claimed_at: string | null;
        claimed_by: string | null;
        last_result: string | null;
      }>;
    const changedMissions = new Set<string>();
    const update = this.db.prepare(`UPDATE work_items SET status=@status,
      last_result=@result, revision=revision+1,
      claimed_at=NULL, claimed_by=NULL, claim_attempt_id=NULL, claim_fence_token_hash=NULL,
      updated_at=@ts WHERE id=@id AND revision=@revision
        AND status IN ('pending','running','parked')`);

    for (const row of rows) {
      const classification = this.classifyPersistedTrigger(row.trigger);
      if (classification.kind === 'one-off') continue;
      const status: WorkItemStatus = classification.kind === 'occurrence-authority-required'
        ? 'parked'
        : 'failed';
      const code = classification.kind === 'occurrence-authority-required'
        ? 'TRIGGER_OCCURRENCE_AUTHORITY_REQUIRED'
        : 'TRIGGER_INVALID';
      const priorResult = this.p<ResultLike>(row.last_result);
      const priorAdmission = priorResult?.['triggerAdmission'];
      const triggerDigest = createHash('sha256')
        .update(typeof row.trigger === 'string' ? row.trigger : this.canonical(row.trigger), 'utf8')
        .digest('hex');
      const result: ResultLike = {
        ok: false,
        reason: code,
        ...(priorResult && !isRecord(priorAdmission) ? { priorResult } : {}),
        triggerAdmission: {
          schemaVersion: 1,
          code,
          itemId: row.id,
          triggerType: classification.triggerType,
          triggerDigest,
          decision: status === 'parked' ? 'parked-hold' : 'failed-closed',
        },
      };
      if (row.status === status
        && row.claimed_at === null
        && row.claimed_by === null
        && this.canonical(priorResult) === this.canonical(result)) continue;
      const info = update.run({
        id: row.id,
        revision: row.revision,
        status,
        result: JSON.stringify(result),
        ts: this.now(),
      });
      if (info.changes === 1) changedMissions.add(row.mission_id);
    }
    return [...changedMissions];
  }

  acquireEngineLease(ownerId: string, ttlMs: number): MissionEngineLease | null {
    if (!ownerId || ownerId !== ownerId.trim()) {
      throw new TypeError('MISSION_ENGINE_LEASE_INVALID: ownerId');
    }
    this.assertLeaseTtl(ttlMs);
    const transaction = this.db.transaction((): MissionEngineLease | null => {
      const nowMs = Date.now();
      const row = this.db.prepare(`SELECT owner_id,epoch,lease_token_hash,expires_at_ms
        FROM mission_engine_lease WHERE singleton_id=1`).get() as {
        owner_id: string;
        epoch: number;
        lease_token_hash: string;
        expires_at_ms: number;
      } | undefined;
      if (row && row.expires_at_ms > nowMs) return null;

      const epoch = (row?.epoch ?? 0) + 1;
      const leaseToken = randomUUID();
      const leaseTokenHash = this.claimTokenHash(leaseToken);
      const acquiredAt = new Date(nowMs).toISOString();
      const expiresAtMs = nowMs + ttlMs;
      const expiresAt = new Date(expiresAtMs).toISOString();
      this.db.prepare(`INSERT INTO mission_engine_lease(
        singleton_id,owner_id,epoch,lease_token_hash,acquired_at,renewed_at,expires_at,expires_at_ms
      ) VALUES(1,@ownerId,@epoch,@leaseTokenHash,@acquiredAt,@acquiredAt,@expiresAt,@expiresAtMs)
      ON CONFLICT(singleton_id) DO UPDATE SET
        owner_id=excluded.owner_id,
        epoch=excluded.epoch,
        lease_token_hash=excluded.lease_token_hash,
        acquired_at=excluded.acquired_at,
        renewed_at=excluded.renewed_at,
        expires_at=excluded.expires_at,
        expires_at_ms=excluded.expires_at_ms`).run({
        ownerId,
        epoch,
        leaseTokenHash,
        acquiredAt,
        expiresAt,
        expiresAtMs,
      });
      return Object.freeze({
        schemaVersion: 1 as const,
        ownerId,
        epoch,
        acquiredAt,
        renewedAt: acquiredAt,
        expiresAt,
        leaseToken,
        leaseTokenHash,
      });
    });
    return transaction.immediate();
  }

  renewEngineLease(lease: MissionEngineLease, ttlMs: number): MissionEngineLease | null {
    this.assertLeaseTtl(ttlMs);
    if (!this.validEngineLeaseShape(lease)) return null;
    const nowMs = Date.now();
    const renewedAt = new Date(nowMs).toISOString();
    const expiresAtMs = nowMs + ttlMs;
    const expiresAt = new Date(expiresAtMs).toISOString();
    const info = this.db.prepare(`UPDATE mission_engine_lease SET
      renewed_at=@renewedAt, expires_at=@expiresAt, expires_at_ms=@expiresAtMs
      WHERE singleton_id=1 AND owner_id=@ownerId AND epoch=@epoch
        AND lease_token_hash=@leaseTokenHash AND expires_at_ms>@nowMs`).run({
      ownerId: lease.ownerId,
      epoch: lease.epoch,
      leaseTokenHash: lease.leaseTokenHash,
      nowMs,
      renewedAt,
      expiresAt,
      expiresAtMs,
    });
    return info.changes === 1
      ? Object.freeze({ ...lease, renewedAt, expiresAt })
      : null;
  }

  releaseEngineLease(lease: MissionEngineLease): boolean {
    if (!this.validEngineLeaseShape(lease)) return false;
    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    const info = this.db.prepare(`UPDATE mission_engine_lease SET
      renewed_at=@now, expires_at=@now, expires_at_ms=0
      WHERE singleton_id=1 AND owner_id=@ownerId AND epoch=@epoch
        AND lease_token_hash=@leaseTokenHash`).run({
      ownerId: lease.ownerId,
      epoch: lease.epoch,
      leaseTokenHash: lease.leaseTokenHash,
      now,
    });
    return info.changes === 1;
  }

  isEngineLeaseActive(lease: MissionEngineLease): boolean {
    if (!this.validEngineLeaseShape(lease)) return false;
    const row = this.db.prepare(`SELECT 1 AS active FROM mission_engine_lease
      WHERE singleton_id=1 AND owner_id=? AND epoch=? AND lease_token_hash=?
        AND expires_at_ms>?`).get(
      lease.ownerId,
      lease.epoch,
      lease.leaseTokenHash,
      Date.now(),
    );
    return row !== undefined;
  }

  /**
   * Preserve unsupported persisted rows for forensics while making every
   * non-terminal form durably non-executable. Intake cannot create these rows;
   * this is the legacy/tamper/recovery boundary.
   */
  private reconcileUnsupportedKinds(itemId?: string): string[] {
    const rows = this.db.prepare(`SELECT id, mission_id, kind FROM work_items
      WHERE status IN ('pending','running','parked')${itemId === undefined ? '' : ' AND id=?'}`)
      .all(...(itemId === undefined ? [] : [itemId])) as Array<{
        id: string;
        mission_id: string;
        kind: unknown;
      }>;
    const changedMissions = new Set<string>();
    const update = this.db.prepare(`UPDATE work_items SET status='failed', last_result=@result, revision=revision+1,
      claimed_at=NULL, claimed_by=NULL, claim_attempt_id=NULL, claim_fence_token_hash=NULL,
      updated_at=@ts
      WHERE id=@id AND status IN ('pending','running','parked') AND kind=@kind`);

    for (const row of rows) {
      if (isCanonicalWorkItemKind(row.kind)) continue;
      const persistedKind = String(row.kind);
      const result = JSON.stringify({
        ok: false,
        reason: `UNKNOWN_KIND: unsupported persisted work-item kind ${JSON.stringify(persistedKind)}`,
        missionAdmission: {
          code: 'UNKNOWN_KIND',
          itemId: row.id,
          persistedKind,
          decision: 'failed-closed',
        },
      });
      const info = update.run({
        id: row.id,
        kind: row.kind,
        result,
        ts: this.now(),
      });
      if (info.changes === 1) changedMissions.add(row.mission_id);
    }
    return [...changedMissions];
  }

  // --- Missions CRUD ---
  private rowToMission = (r: any): Mission => ({
    id: r.id, kind: r.kind, status: r.status, tenant: r.tenant, title: r.title,
    spec: this.p(r.spec), createdBy: r.created_by, deliverTo: r.deliver_to, renderAs: r.render_as,
    progress: this.p<Progress>(r.progress), createdAt: r.created_at, updatedAt: r.updated_at,
    completedAt: r.completed_at, lastResult: this.p<ResultLike>(r.last_result),
  });

  createMission(m: NewMission): Mission {
    const transaction = this.db.transaction((): Mission => {
      const ts = this.now();
      this.db.prepare(`INSERT INTO missions(id,kind,status,tenant,title,spec,created_by,deliver_to,render_as,progress,created_at,updated_at)
        VALUES(@id,@kind,'pending',@tenant,@title,@spec,@createdBy,@deliverTo,@renderAs,@progress,@ts,@ts)`).run({
        id: m.id, kind: m.kind, tenant: m.tenant ?? 'local', title: m.title, spec: this.j(m.spec),
        createdBy: m.createdBy ?? null, deliverTo: m.deliverTo ?? null,
        renderAs: m.renderAs ?? (m.kind === 'list' ? 'checklist' : 'goal'),
        progress: this.j(m.progress), ts,
      });
      if (this.dependencyAuthorityMode === 'normalized-v1') {
        const graphDigest = this.graphDigest([]);
        const activation = {
          schemaVersion: 1,
          source: 'normalized-store-composition',
          approvalRef: this.dependencyAuthorityRef,
          activatedAt: ts,
        };
        this.db.prepare(`INSERT INTO mission_graph_authorities(
          mission_id,schema_version,authority_state,graph_revision,graph_digest,source_kind,
          activation_json,activation_digest,activated_at,updated_at
        ) VALUES(@missionId,1,'active',1,@graphDigest,'new-v1',
          @activationJson,@activationDigest,@ts,@ts)`).run({
          missionId: m.id,
          graphDigest,
          activationJson: this.canonical(activation),
          activationDigest: this.digest(activation),
          ts,
        });
      }
      return this.getMission(m.id)!;
    });
    return transaction.immediate();
  }
  createMissionWithItems(m: NewMission, items: readonly NewMissionWorkItem[]): Mission {
    return this.createMissionWithItemsInternal(m, items, false);
  }
  importLegacyMissionWithItems(m: NewMission, items: readonly NewMissionWorkItem[]): Mission {
    return this.createMissionWithItemsInternal(m, items, true);
  }
  getDependencyAuthority(missionId: string): MissionDependencyAuthorityV1 | null {
    const row = this.dependencyAuthorityRow(missionId);
    if (!row) return null;
    const activation = this.p<Record<string, unknown>>(row.activation_json);
    return {
      schemaVersion: 1,
      missionId: row.mission_id,
      state: row.authority_state,
      graphRevision: row.graph_revision,
      graphDigest: row.graph_digest,
      sourceKind: row.source_kind,
      activationRef: typeof activation?.['approvalRef'] === 'string'
        ? activation['approvalRef']
        : null,
      activatedAt: row.activated_at,
      quarantineReason: row.quarantine_reason,
      updatedAt: row.updated_at,
    };
  }
  prepareNormalizedDependencyMigration(missionId: string): MissionDependencyAuthorityV1 {
    const transaction = this.db.transaction((): MissionDependencyAuthorityV1 => {
      if (!this.getMission(missionId)) {
        throw createExecutionAuthorityError(
          `MISSION_DEPENDENCY_MIGRATION_NOT_FOUND: ${missionId}`,
        );
      }
      const existing = this.getDependencyAuthority(missionId);
      if (existing) return existing;

      let graph: ReturnType<SqliteMissionStore['readLegacyGraph']> | null = null;
      let validationFailure: string | null = null;
      try {
        graph = this.readLegacyGraph(missionId);
      } catch (error) {
        validationFailure = error instanceof Error ? error.message : String(error);
      }
      if (validationFailure !== null) {
        const ts = this.now();
        const sourceRows = this.db.prepare(`SELECT id,depends_on FROM work_items
          WHERE mission_id=? ORDER BY id`).all(missionId);
        const sourceDigest = this.digest(sourceRows);
        this.db.prepare(`INSERT INTO mission_graph_authorities(
          mission_id,schema_version,authority_state,graph_revision,graph_digest,source_kind,
          quarantine_reason,updated_at
        ) VALUES(@missionId,1,'quarantined',1,@graphDigest,'legacy-json-v1',@reason,@ts)`)
          .run({ missionId, graphDigest: sourceDigest, reason: validationFailure, ts });
        const evidence = {
          schemaVersion: 1,
          missionId,
          outcome: 'quarantined',
          sourceDigest,
          reason: validationFailure,
          observedAt: ts,
        };
        this.db.prepare(`INSERT INTO mission_graph_migration_evidence(
          mission_id,source_digest,graph_digest,evidence_json,evidence_digest,created_at
        ) VALUES(@missionId,@sourceDigest,@graphDigest,@evidenceJson,@evidenceDigest,@ts)`).run({
          missionId,
          sourceDigest,
          graphDigest: sourceDigest,
          evidenceJson: this.canonical(evidence),
          evidenceDigest: this.digest(evidence),
          ts,
        });
        return this.getDependencyAuthority(missionId)!;
      }
      if (graph === null) {
        throw createExecutionAuthorityError(
          `MISSION_DEPENDENCY_MIGRATION_VALIDATION_MISSING: ${missionId}`,
        );
      }

      const ts = this.now();
      this.db.prepare(`INSERT INTO mission_graph_authorities(
        mission_id,schema_version,authority_state,graph_revision,graph_digest,source_kind,updated_at
      ) VALUES(@missionId,1,'migration-pending',1,@graphDigest,'legacy-json-v1',@ts)`).run({
        missionId,
        graphDigest: graph.graphDigest,
        ts,
      });
      this.insertNormalizedEdges(missionId, graph.edges, 1, ts);
      const evidence = {
        schemaVersion: 1,
        missionId,
        outcome: 'migration-pending',
        sourceDigest: graph.sourceDigest,
        graphDigest: graph.graphDigest,
        itemCount: graph.definitions.length,
        edgeCount: graph.edges.length,
        observedAt: ts,
      };
      this.db.prepare(`INSERT INTO mission_graph_migration_evidence(
        mission_id,source_digest,graph_digest,evidence_json,evidence_digest,created_at
      ) VALUES(@missionId,@sourceDigest,@graphDigest,@evidenceJson,@evidenceDigest,@ts)`).run({
        missionId,
        sourceDigest: graph.sourceDigest,
        graphDigest: graph.graphDigest,
        evidenceJson: this.canonical(evidence),
        evidenceDigest: this.digest(evidence),
        ts,
      });
      return this.getDependencyAuthority(missionId)!;
    });
    return transaction.immediate();
  }
  activateNormalizedDependencyAuthority(
    activation: MissionDependencyActivationV1,
  ): MissionDependencyAuthorityV1 {
    if (activation.schemaVersion !== 1
      || !activation.missionId.trim()
      || !/^[a-f0-9]{64}$/u.test(activation.expectedGraphDigest)
      || !activation.approvedBy.trim()
      || !activation.approvalRef.trim()
      || !Number.isFinite(Date.parse(activation.approvedAt))
      || new Date(activation.approvedAt).toISOString() !== activation.approvedAt) {
      throw new TypeError('MISSION_DEPENDENCY_ACTIVATION_INVALID');
    }
    const transaction = this.db.transaction(() => {
      const authority = this.getDependencyAuthority(activation.missionId);
      if (!authority) {
        throw createExecutionAuthorityError(
          `MISSION_DEPENDENCY_ACTIVATION_NOT_PREPARED: ${activation.missionId}`,
        );
      }
      if (authority.state === 'quarantined') {
        throw createExecutionAuthorityError(
          `MISSION_DEPENDENCY_ACTIVATION_QUARANTINED: ${activation.missionId}`,
        );
      }
      const activationJson = this.canonical(activation);
      if (authority.state === 'active') {
        const row = this.dependencyAuthorityRow(activation.missionId);
        if (row.activation_json === activationJson
          && row.activation_digest === this.digest(activationJson)) return;
        throw createExecutionAuthorityError(
          `MISSION_DEPENDENCY_ACTIVATION_CONFLICT: ${activation.missionId}`,
        );
      }
      if (authority.graphDigest !== activation.expectedGraphDigest) {
        throw createExecutionAuthorityError(
          `MISSION_DEPENDENCY_ACTIVATION_DIGEST_MISMATCH: ${activation.missionId}`,
        );
      }
      const current = this.readLegacyGraph(activation.missionId);
      if (current.graphDigest !== authority.graphDigest) {
        throw createExecutionAuthorityError(
          `MISSION_DEPENDENCY_ACTIVATION_SOURCE_CHANGED: ${activation.missionId}`,
        );
      }
      const persistedEdges = this.db.prepare(`SELECT mission_id,work_item_id,dependency_item_id
        FROM work_item_dependencies WHERE mission_id=?
        ORDER BY work_item_id,dependency_item_id`).all(activation.missionId) as Array<{
          mission_id: string;
          work_item_id: string;
          dependency_item_id: string;
        }>;
      const persistedDigest = this.graphDigest(persistedEdges.map((edge) => ({
        missionId: edge.mission_id,
        workItemId: edge.work_item_id,
        dependencyItemId: edge.dependency_item_id,
      })));
      if (persistedDigest !== authority.graphDigest) {
        throw createExecutionAuthorityError(
          `MISSION_DEPENDENCY_ACTIVATION_EDGE_MISMATCH: ${activation.missionId}`,
        );
      }
      const ts = this.now();
      const info = this.db.prepare(`UPDATE mission_graph_authorities
        SET authority_state='active',activation_json=@activationJson,
          activation_digest=@activationDigest,activated_at=@activatedAt,updated_at=@ts
        WHERE mission_id=@missionId AND authority_state='migration-pending'
          AND graph_digest=@expectedGraphDigest`).run({
        missionId: activation.missionId,
        expectedGraphDigest: activation.expectedGraphDigest,
        activationJson,
        activationDigest: this.digest(activationJson),
        activatedAt: activation.approvedAt,
        ts,
      });
      if (info.changes !== 1) {
        throw createExecutionAuthorityError(
          `MISSION_DEPENDENCY_ACTIVATION_CONFLICT: ${activation.missionId}`,
        );
      }
      this.seedTerminalDependencyJobs(activation.missionId, ts);
    });
    transaction.immediate();
    return this.getDependencyAuthority(activation.missionId)!;
  }
  private createMissionWithItemsInternal(
    m: NewMission,
    items: readonly NewMissionWorkItem[],
    allowLegacyUnknownKindQuarantine: boolean,
  ): Mission {
    if (!m.id || m.id !== m.id.trim()) {
      throw createExecutionAuthorityError('MISSION_BATCH_INVALID: mission id must be a non-empty canonical string');
    }
    const normalizedItems = items.map((item): NewMissionWorkItem => {
      if (!item.id || item.id !== item.id.trim()) {
        throw createExecutionAuthorityError('MISSION_BATCH_INVALID: work-item id must be a non-empty canonical string');
      }
      if (item.missionId !== m.id) {
        throw createExecutionAuthorityError(`MISSION_BATCH_INVALID: item ${item.id} belongs to foreign mission ${item.missionId}`);
      }
      if (!isCanonicalWorkItemKind(item.kind)) {
        if (!allowLegacyUnknownKindQuarantine || !isExactLegacyUnknownKindQuarantine(m, item)) {
          assertCanonicalWorkItemKind(item.kind, item.id);
        }
      }
      if (!allowLegacyUnknownKindQuarantine) this.assertPersistableTrigger(item);
      this.assertPersistableFence(item);
      const dependencies = item.dependsOn ?? [];
      if (dependencies.some((id) => !id || id !== id.trim())) {
        throw createExecutionAuthorityError(`MISSION_BATCH_INVALID: item ${item.id} has a non-canonical dependency id`);
      }
      if (new Set(dependencies).size !== dependencies.length) {
        throw createExecutionAuthorityError(`MISSION_BATCH_INVALID: item ${item.id} has duplicate dependencies`);
      }
      if (item.initialStatus !== undefined && !WORK_ITEM_STATUSES.has(item.initialStatus)) {
        throw createExecutionAuthorityError(`MISSION_BATCH_INVALID: item ${item.id} has invalid initial status`);
      }
      if (item.initialResult !== undefined && (
        item.initialStatus === undefined
        || item.initialResult === null
        || typeof item.initialResult !== 'object'
        || typeof item.initialResult.ok !== 'boolean'
      )) {
        throw createExecutionAuthorityError(`MISSION_BATCH_INVALID: item ${item.id} has invalid initial result`);
      }
      return { ...item, dependsOn: [...dependencies].sort() };
    });
    const ids = new Set<string>();
    for (const item of normalizedItems) {
      if (ids.has(item.id)) throw createExecutionAuthorityError(`MISSION_BATCH_INVALID: duplicate work-item id ${item.id}`);
      ids.add(item.id);
    }
    for (const item of normalizedItems) {
      if (item.dependsOn?.includes(item.id)) {
        throw createExecutionAuthorityError(`MISSION_BATCH_INVALID: self dependency ${item.id}`);
      }
      const missing = item.dependsOn?.filter((id) => !ids.has(id)) ?? [];
      if (missing.length > 0) {
        throw createExecutionAuthorityError(`MISSION_BATCH_INVALID: item ${item.id} depends on missing or foreign item ${missing.join(', ')}`);
      }
    }

    try {
      this.validateGraph(m.id, normalizedItems.map((item) => ({
        id: item.id,
        dependsOn: item.dependsOn ?? [],
      })));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const reason = message.startsWith('MISSION_DEPENDENCY_GRAPH_INVALID: cycle ')
        ? `dependency cycle ${message.slice('MISSION_DEPENDENCY_GRAPH_INVALID: cycle '.length)}`
        : message.replace(/^MISSION_DEPENDENCY_GRAPH_INVALID:\s*/, '');
      throw createExecutionAuthorityError(`MISSION_BATCH_INVALID: ${reason}`);
    }

    const transaction = this.db.transaction((): Mission => {
      const existing = this.getMission(m.id);
      if (existing) {
        if (normalizedItems.some((item) => item.initialStatus !== undefined || item.initialResult !== undefined)) {
          throw createExecutionAuthorityError(`MISSION_BATCH_CONFLICT: mission ${m.id} import/recovery state requires external replay provenance`);
        }
        const expectedMission = {
          id: m.id,
          kind: m.kind,
          tenant: m.tenant ?? 'local',
          title: m.title,
          spec: m.spec ?? null,
          createdBy: m.createdBy ?? null,
          deliverTo: m.deliverTo ?? null,
          renderAs: m.renderAs ?? (m.kind === 'list' ? 'checklist' : 'goal'),
          progress: m.progress ?? null,
        };
        const actualMission = {
          id: existing.id,
          kind: existing.kind,
          tenant: existing.tenant,
          title: existing.title,
          spec: existing.spec,
          createdBy: existing.createdBy,
          deliverTo: existing.deliverTo,
          renderAs: existing.renderAs,
          progress: existing.progress,
        };
        const actualItems = this.listItems(m.id).map((item) => ({
          id: item.id,
          missionId: item.missionId,
          kind: item.kind,
          spec: item.spec,
          policy: item.policy,
          renderAs: item.renderAs,
          dependsOn: [...item.dependsOn].sort(),
          trigger: item.trigger,
        })).sort((a, b) => a.id.localeCompare(b.id));
        const expectedItems = normalizedItems.map((item) => ({
          id: item.id,
          missionId: item.missionId,
          kind: item.kind,
          spec: item.spec ?? null,
          policy: item.policy ?? 'auto',
          renderAs: item.renderAs ?? this.defaultRenderAs(item.kind),
          dependsOn: item.dependsOn ?? [],
          trigger: item.trigger ?? null,
        })).sort((a, b) => a.id.localeCompare(b.id));
        if (
          this.canonical(actualMission) === this.canonical(expectedMission)
          && this.canonical(actualItems) === this.canonical(expectedItems)
        ) return existing;
        throw createExecutionAuthorityError(`MISSION_BATCH_CONFLICT: mission ${m.id} already exists with different creation data`);
      }

      const mission = this.createMission(m);
      const insert = this.db.prepare(`INSERT INTO work_items(id,mission_id,kind,status,spec,policy,render_as,depends_on,trigger,created_at,updated_at,last_result)
        VALUES(@id,@missionId,@kind,@status,@spec,@policy,@renderAs,@dependsOn,@trigger,@ts,@ts,@lastResult)`);
      for (const item of normalizedItems) {
        const ts = this.now();
        insert.run({
          id: item.id,
          missionId: item.missionId,
          kind: item.kind,
          status: item.initialStatus ?? 'pending',
          spec: this.j(item.spec),
          policy: item.policy ?? 'auto',
          renderAs: item.renderAs ?? this.defaultRenderAs(item.kind),
          dependsOn: this.dependencyAuthorityMode === 'normalized-v1'
            ? null
            : this.j(item.dependsOn ?? []),
          trigger: this.j(item.trigger ?? null),
          lastResult: this.j(item.initialResult),
          ts,
        });
        this.insertAdmissionFence(item, ts);
      }
      if (this.dependencyAuthorityMode === 'normalized-v1') {
        const edges = this.validateGraph(m.id, normalizedItems.map((item) => ({
          id: item.id,
          dependsOn: item.dependsOn ?? [],
        })));
        const ts = this.now();
        const graphDigest = this.graphDigest(edges);
        this.db.prepare(`UPDATE mission_graph_authorities
          SET graph_digest=@graphDigest,updated_at=@ts
          WHERE mission_id=@missionId AND authority_state='active'`).run({
          missionId: m.id,
          graphDigest,
          ts,
        });
        this.insertNormalizedEdges(m.id, edges, 1, ts);
        this.seedTerminalDependencyJobs(m.id, ts);
      }
      return mission;
    });
    try {
      return transaction.immediate();
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('MISSION_BATCH_')) throw error;
      throw createExecutionAuthorityError(`MISSION_BATCH_CONFLICT: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  getMission(id: string): Mission | null {
    const r = this.db.prepare('SELECT * FROM missions WHERE id=?').get(id);
    return r ? this.rowToMission(r) : null;
  }
  listMissions(f?: { status?: MissionStatus[]; tenant?: string }): Mission[] {
    const where: string[] = []; const args: unknown[] = [];
    if (f?.status?.length) { where.push(`status IN (${f.status.map(() => '?').join(',')})`); args.push(...f.status); }
    if (f?.tenant) { where.push('tenant=?'); args.push(f.tenant); }
    const sql = `SELECT * FROM missions ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at`;
    return (this.db.prepare(sql).all(...args) as any[]).map(this.rowToMission);
  }
  updateMissionStatus(id: string, status: MissionStatus, result?: ResultLike): void {
    const ts = this.now();
    const completedAt = status === 'completed' || status === 'failed' || status === 'cancelled' ? ts : null;
    this.db.prepare(`UPDATE missions SET status=@status, updated_at=@ts,
      completed_at=@completedAt, last_result=COALESCE(@result, last_result) WHERE id=@id`)
      .run({ id, status, ts, completedAt, result: result ? JSON.stringify(result) : null });
  }
  setMissionProgress(id: string, progress: Progress): void {
    this.db.prepare('UPDATE missions SET progress=?, updated_at=? WHERE id=?').run(JSON.stringify(progress), this.now(), id);
  }

  recordAcceptanceDecision(decision: MissionAcceptanceDecisionV1): MissionAcceptanceDecisionRecord {
    const transaction = this.db.transaction((): MissionAcceptanceDecisionRecord => {
      const mission = this.getMission(decision.missionId);
      if (!mission) throw createExecutionAuthorityError(`MISSION_ACCEPTANCE_INVALID: mission not found ${decision.missionId}`);
      if (mission.kind !== 'goal') throw createExecutionAuthorityError(`MISSION_ACCEPTANCE_INVALID: mission ${decision.missionId} is not a goal`);
      const contract = readGoalAcceptanceContract(mission);
      if (!contract) throw createExecutionAuthorityError(`MISSION_ACCEPTANCE_INVALID: mission ${decision.missionId} has no v1 contract`);

      const existing = this.db.prepare(
        'SELECT * FROM mission_acceptance_decisions WHERE mission_id=? AND round=?',
      ).get(decision.missionId, decision.round) as Record<string, unknown> | undefined;
      if (existing) {
        const record = assertStoredMissionAcceptanceRecord(this.p(existing['record_json']));
        if (existing['contract_digest'] !== contract.digest
          || existing['decision_digest'] !== decision.decisionDigest
          || this.canonical(record.decision) !== this.canonical(decision)) {
          throw createExecutionAuthorityError(`MISSION_ACCEPTANCE_CONFLICT: mission ${decision.missionId} round ${decision.round}`);
        }
        return record;
      }

      const items = this.listItems(decision.missionId);
      const validationErrors = validateMissionAcceptanceDecision(
        decision,
        decision.missionId,
        contract,
        decision.round,
        items,
      );
      const effectiveOutcome = validationErrors.length === 0 ? decision.outcome : 'unknown';
      const record: MissionAcceptanceDecisionRecord = {
        decision,
        validationErrors,
        effectiveOutcome,
        createdAt: decision.decidedAt,
      };
      this.db.prepare(`INSERT INTO mission_acceptance_decisions(
        mission_id,round,contract_digest,decision_digest,record_json,created_at
      ) VALUES(@missionId,@round,@contractDigest,@decisionDigest,@recordJson,@createdAt)`).run({
        missionId: decision.missionId,
        round: decision.round,
        contractDigest: contract.digest,
        decisionDigest: decision.decisionDigest,
        recordJson: JSON.stringify(record),
        createdAt: record.createdAt,
      });

      const accepted = effectiveOutcome === 'accepted';
      const reason = accepted
        ? 'goal acceptance criteria met'
        : validationErrors.length > 0
          ? `GOAL_ACCEPTANCE_EVIDENCE_INVALID: ${validationErrors.join('; ')}`
          : 'goal not reached, acceptance criteria rejected';
      const result: ResultLike = {
        ok: accepted,
        reason,
        acceptanceDecision: decision,
        acceptanceValidationErrors: validationErrors,
      };
      const ts = this.now();
      this.db.prepare(`UPDATE missions SET status=@status, updated_at=@ts,
        completed_at=COALESCE(completed_at,@ts), last_result=@result WHERE id=@id`).run({
        id: decision.missionId,
        status: accepted ? 'completed' : 'failed',
        ts,
        result: JSON.stringify(result),
      });
      return record;
    });
    try {
      return transaction.immediate();
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('MISSION_ACCEPTANCE_')) throw error;
      throw createExecutionAuthorityError(`MISSION_ACCEPTANCE_CONFLICT: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  listAcceptanceDecisions(missionId: string): MissionAcceptanceDecisionRecord[] {
    const mission = this.getMission(missionId);
    if (!mission) throw createExecutionAuthorityError(`MISSION_ACCEPTANCE_INVALID: mission not found ${missionId}`);
    const contract = readGoalAcceptanceContract(mission);
    if (!contract) throw createExecutionAuthorityError(`MISSION_ACCEPTANCE_INVALID: mission ${missionId} has no v1 contract`);
    const items = this.listItems(missionId);
    const rows = this.db.prepare(
      'SELECT * FROM mission_acceptance_decisions WHERE mission_id=? ORDER BY round',
    ).all(missionId) as Array<Record<string, unknown>>;
    return rows.map((row) => {
      const record = assertStoredMissionAcceptanceRecord(this.p(row['record_json']));
      if (row['contract_digest'] !== record.decision.contractDigest
        || row['decision_digest'] !== record.decision.decisionDigest) {
        throw createExecutionAuthorityError(`MISSION_ACCEPTANCE_CORRUPT: row mismatch ${missionId}`);
      }
      const validationErrors = validateMissionAcceptanceDecision(
        record.decision,
        missionId,
        contract,
        record.decision.round,
        items,
      );
      const effectiveOutcome = validationErrors.length === 0 ? record.decision.outcome : 'unknown';
      if (this.canonical(validationErrors) !== this.canonical(record.validationErrors)
        || effectiveOutcome !== record.effectiveOutcome) {
        throw createExecutionAuthorityError(`MISSION_ACCEPTANCE_CORRUPT: validation mismatch ${missionId}`);
      }
      return record;
    });
  }

  // --- Work-items + atomic claim ---
  private rowToItem = (r: any): WorkItem => {
    const dependencyAuthority = this.dependencyAuthorityRow(r.mission_id);
    const dependsOn = dependencyAuthority
      ? this.normalizedDependencies(r.mission_id, r.id)
      : this.p<string[]>(r.depends_on) ?? [];
    const admissionFence: WorkItemAdmissionFenceV1 | null = r.admission_schema_version === undefined
      || r.admission_schema_version === null
      ? null
      : {
        schemaVersion: r.admission_schema_version,
        registryRevision: r.admission_registry_revision,
        registryDigest: r.admission_registry_digest,
        kind: r.admission_item_kind,
        runnerRevision: r.admission_runner_revision,
        itemDefinitionDigest: r.admission_item_definition_digest,
      };
    return {
      id: r.id, missionId: r.mission_id, kind: r.kind, status: r.status, spec: this.p(r.spec),
      policy: r.policy, renderAs: r.render_as, progress: this.p<Progress>(r.progress),
      dependsOn, trigger: this.p(r.trigger),
      claimedAt: r.claimed_at, claimedBy: r.claimed_by,
      revision: Number.isInteger(r.revision) ? r.revision : 0,
      admissionFence,
      claimRegistryRevision: r.claim_registry_revision ?? null,
      claimRegistryDigest: r.claim_registry_digest ?? null,
      createdAt: r.created_at, updatedAt: r.updated_at,
      lastResult: this.p<ResultLike>(r.last_result),
    };
  };

  private selectItem(id: string): WorkItem | null {
    const row = this.db.prepare(`SELECT ${WORK_ITEM_WITH_FENCE_COLUMNS}
      FROM work_items wi LEFT JOIN work_item_admission_fences fence ON fence.work_item_id=wi.id
      WHERE wi.id=?`).get(id);
    return row ? this.rowToItem(row) : null;
  }

  private assertPersistableFence(item: NewWorkItem): void {
    const fence = item.admissionFence;
    if (!fence) return;
    if (fence.schemaVersion !== 1
      || fence.kind !== item.kind
      || fence.itemDefinitionDigest !== computeWorkItemDefinitionDigest(item)
      || !fence.registryRevision.trim()
      || !fence.registryDigest.trim()
      || !fence.runnerRevision.trim()) {
      throw createExecutionAuthorityError(`MISSION_ADMISSION_FENCE_INVALID: ${item.id}`);
    }
  }

  private insertAdmissionFence(item: NewWorkItem, ts: string): void {
    const fence = item.admissionFence;
    if (!fence) return;
    this.db.prepare(`INSERT INTO work_item_admission_fences(
      work_item_id,schema_version,registry_revision,registry_digest,item_kind,
      runner_revision,item_definition_digest,created_at
    ) VALUES(@workItemId,@schemaVersion,@registryRevision,@registryDigest,@itemKind,
      @runnerRevision,@itemDefinitionDigest,@ts)`).run({
      workItemId: item.id,
      schemaVersion: fence.schemaVersion,
      registryRevision: fence.registryRevision,
      registryDigest: fence.registryDigest,
      itemKind: fence.kind,
      runnerRevision: fence.runnerRevision,
      itemDefinitionDigest: fence.itemDefinitionDigest,
      ts,
    });
  }
  private rowToApprovalBinding = (r: any): WorkItemApprovalBinding => {
    const request = validateStoredApprovalRequest(this.p<unknown>(r.request_json));
    if (!request.ok || request.value.id !== r.request_id) {
      throw createExecutionAuthorityError(`MISSION_APPROVAL_CORRUPT: invalid request binding ${String(r.request_id)}`);
    }
    const rawDecision = this.p<unknown>(r.decision_json);
    const decision = rawDecision === null ? null : validateStoredApprovalDecision(rawDecision);
    if (decision !== null && (!decision.ok || decision.value.requestId !== r.request_id)) {
      throw createExecutionAuthorityError(`MISSION_APPROVAL_CORRUPT: invalid decision binding ${String(r.request_id)}`);
    }
    return {
      workItemId: r.work_item_id,
      missionId: r.mission_id,
      requestId: r.request_id,
      request: request.value,
      publishState: r.publish_state,
      decisionState: r.decision_state,
      decision: decision?.value ?? null,
      createdAt: r.created_at,
      publishedAt: r.published_at,
      decidedAt: r.decided_at,
      updatedAt: r.updated_at,
    };
  };
  private defaultRenderAs(kind: NewWorkItem['kind']): WorkItem['renderAs'] {
    return kind === 'sprint' ? 'sprint' : kind === 'process' ? 'workflow' : kind === 'capability' ? 'action' : 'task';
  }

  enqueueItem(item: NewWorkItem): WorkItem {
    assertCanonicalWorkItemKind(item.kind, item.id);
    this.assertPersistableTrigger(item);
    this.assertPersistableFence(item);
    const transaction = this.db.transaction((): WorkItem => {
      const ts = this.now();
      const authority = this.getDependencyAuthority(item.missionId);
      const normalized = authority
        ? this.validateNormalizedAppend(item.missionId, [item])
        : null;
      const inserted = this.db.prepare(`INSERT INTO work_items(id,mission_id,kind,status,spec,policy,render_as,depends_on,trigger,created_at,updated_at)
        VALUES(@id,@missionId,@kind,'pending',@spec,@policy,@renderAs,@dependsOn,@trigger,@ts,@ts)
        ON CONFLICT(id) DO NOTHING`).run({
        id: item.id, missionId: item.missionId, kind: item.kind, spec: this.j(item.spec),
        policy: item.policy ?? 'auto', renderAs: item.renderAs ?? this.defaultRenderAs(item.kind),
        dependsOn: normalized ? null : this.j(item.dependsOn ?? []),
        trigger: this.j(item.trigger ?? null),
        ts,
      });
      if (inserted.changes === 1) {
        this.insertAdmissionFence(item, ts);
        if (normalized) {
          this.insertNormalizedEdges(
            item.missionId,
            normalized.edges,
            normalized.graphRevision,
            ts,
            [item.id],
          );
          this.updateNormalizedGraphDigest(item.missionId, normalized.graphRevision, ts);
        }
      } else if (normalized) {
        throw createExecutionAuthorityError(
          `MISSION_BATCH_CONFLICT: work-item ${item.id} already exists`,
        );
      }
      return this.selectItem(item.id)!;
    });
    return transaction.immediate();
  }

  enqueueItems(items: readonly NewWorkItem[]): WorkItem[] {
    if (items.length === 0) return [];
    const ids = new Set<string>();
    for (const item of items) {
      if (!item.id || item.id !== item.id.trim() || ids.has(item.id)) {
        throw createExecutionAuthorityError(`MISSION_BATCH_INVALID: duplicate or non-canonical work-item id ${item.id}`);
      }
      ids.add(item.id);
      assertCanonicalWorkItemKind(item.kind, item.id);
      this.assertPersistableTrigger(item);
      this.assertPersistableFence(item);
      if (!this.getMission(item.missionId)) {
        throw createExecutionAuthorityError(`MISSION_BATCH_INVALID: mission not found ${item.missionId}`);
      }
    }
    const transaction = this.db.transaction((): WorkItem[] => {
      const missionIds = new Set(items.map((item) => item.missionId));
      const normalizedByMission = new Map<string, {
        edges: NormalizedDependencyEdge[];
        graphRevision: number;
      }>();
      for (const missionId of missionIds) {
        const authority = this.getDependencyAuthority(missionId);
        if (authority) {
          const missionItems = items.filter((item) => item.missionId === missionId);
          normalizedByMission.set(missionId, this.validateNormalizedAppend(missionId, missionItems));
        }
      }
      const insert = this.db.prepare(`INSERT INTO work_items(
        id,mission_id,kind,status,spec,policy,render_as,depends_on,trigger,created_at,updated_at
      ) VALUES(@id,@missionId,@kind,'pending',@spec,@policy,@renderAs,@dependsOn,@trigger,@ts,@ts)`);
      for (const item of items) {
        const ts = this.now();
        insert.run({
          id: item.id,
          missionId: item.missionId,
          kind: item.kind,
          spec: this.j(item.spec),
          policy: item.policy ?? 'auto',
          renderAs: item.renderAs ?? this.defaultRenderAs(item.kind),
          dependsOn: normalizedByMission.has(item.missionId) ? null : this.j(item.dependsOn ?? []),
          trigger: this.j(item.trigger ?? null),
          ts,
        });
        this.insertAdmissionFence(item, ts);
      }
      for (const [missionId, normalized] of normalizedByMission) {
        const ts = this.now();
        const missionItemIds = items
          .filter((item) => item.missionId === missionId)
          .map((item) => item.id);
        this.insertNormalizedEdges(
          missionId,
          normalized.edges,
          normalized.graphRevision,
          ts,
          missionItemIds,
        );
        this.updateNormalizedGraphDigest(missionId, normalized.graphRevision, ts);
      }
      return items.map((item) => this.selectItem(item.id)!);
    });
    try {
      return transaction.immediate();
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('MISSION_BATCH_')) throw error;
      throw createExecutionAuthorityError(`MISSION_BATCH_CONFLICT: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  reconcileRuntimeAdmission(registry: MissionRunnerRegistryV1, itemId?: string): string[] {
    this.reconcileUnsupportedKinds(itemId);
    const rows = this.db.prepare(`SELECT ${WORK_ITEM_WITH_FENCE_COLUMNS}
      FROM work_items wi LEFT JOIN work_item_admission_fences fence ON fence.work_item_id=wi.id
      WHERE wi.status IN ('pending','running','parked')${itemId === undefined ? '' : ' AND wi.id=?'}`)
      .all(...(itemId === undefined ? [] : [itemId])) as any[];
    const changedMissions = new Set<string>();
    const update = this.db.prepare(`UPDATE work_items SET status=@status, last_result=@result,
      claimed_at=NULL, claimed_by=NULL, claim_attempt_id=NULL, claim_fence_token_hash=NULL,
      revision=revision+1, updated_at=@ts
      WHERE id=@id AND revision=@revision AND status IN ('pending','running','parked')`);

    for (const row of rows) {
      // Trigger definitions are not executable WorkItems. Their single
      // authority is the trigger reconciler below; runtime admission applies
      // only after an occurrence-specific one-off WorkItem exists.
      if (this.classifyPersistedTrigger(row.trigger).kind !== 'one-off') continue;
      const item = this.rowToItem(row);
      const validation = validateWorkItemAdmission(item, item.admissionFence, registry);
      if (validation.ok) continue;
      const status: WorkItemStatus = validation.disposition;
      const existingAdmission = item.lastResult?.['missionAdmission'];
      const preservesCurrentLegacyQuarantine = item.status === 'parked'
        && status === 'parked'
        && item.admissionFence === null
        && item.claimedAt === null
        && item.claimedBy === null
        && existingAdmission !== null
        && typeof existingAdmission === 'object'
        && (existingAdmission as Record<string, unknown>)['source'] === 'legacy-backlog-import'
        && (existingAdmission as Record<string, unknown>)['decision'] === 'parked-hold'
        && typeof (existingAdmission as Record<string, unknown>)['code'] === 'string'
        && ((existingAdmission as Record<string, unknown>)['code'] as string).endsWith('_UNWIRED')
        && (existingAdmission as Record<string, unknown>)['itemId'] === item.id
        && (existingAdmission as Record<string, unknown>)['persistedKind'] === item.kind
        && (existingAdmission as Record<string, unknown>)['authorityRevision'] === registry.registryRevision
        && (existingAdmission as Record<string, unknown>)['authorityDigest'] === registry.registryDigest;
      if (preservesCurrentLegacyQuarantine) continue;
      if (item.status === status
        && item.claimedAt === null
        && item.claimedBy === null
        && existingAdmission !== null
        && typeof existingAdmission === 'object'
        && (existingAdmission as Record<string, unknown>)['code'] === validation.code
        && (existingAdmission as Record<string, unknown>)['authorityRevision'] === registry.registryRevision
        && (existingAdmission as Record<string, unknown>)['authorityDigest'] === registry.registryDigest) continue;
      const priorRecoveryReason = item.status === 'parked'
        && typeof item.lastResult?.reason === 'string'
        && item.lastResult.reason.startsWith('RECOVERY_RECONCILIATION_REQUIRED')
        ? item.lastResult.reason
        : null;
      const result: ResultLike = {
        ok: false,
        reason: priorRecoveryReason ?? `${validation.code}: ${validation.reason}`,
        ...(priorRecoveryReason ? { priorRecoveryResult: item.lastResult } : {}),
        missionAdmission: {
          schemaVersion: 1,
          code: validation.code,
          itemId: item.id,
          persistedKind: String(item.kind),
          authorityRevision: registry.registryRevision,
          authorityDigest: registry.registryDigest,
          persistedFence: item.admissionFence,
          decision: status === 'parked' ? 'parked-hold' : 'failed-closed',
        },
      };
      if (item.status === status
        && item.claimedAt === null
        && item.claimedBy === null
        && this.canonical(item.lastResult) === this.canonical(result)) continue;
      const info = update.run({
        id: item.id,
        revision: item.revision,
        status,
        result: JSON.stringify(result),
        ts: this.now(),
      });
      if (info.changes === 1) changedMissions.add(item.missionId);
    }
    for (const missionId of this.reconcileNonExecutableTriggers(itemId)) {
      changedMissions.add(missionId);
    }
    return [...changedMissions];
  }

  listApprovalCandidates(): WorkItem[] {
    this.reconcileUnsupportedKinds();
    this.reconcileNonExecutableTriggers();
    const sql = `SELECT wi.* FROM work_items wi JOIN missions m ON m.id=wi.mission_id
      LEFT JOIN work_item_approvals approval ON approval.work_item_id=wi.id
      WHERE wi.status='pending'
        AND wi.kind IN (${CANONICAL_KIND_POSITIONAL})
        AND wi.policy IN ('approval-required','risk-tagged')
        AND m.status IN ('pending','active')
        AND approval.work_item_id IS NULL
        AND ${dependencyReadinessPredicate('wi')}
        AND ${dependencySatisfiedPredicate('wi')}
      ORDER BY wi.created_at`;
    return (this.db.prepare(sql).all(...CANONICAL_WORK_ITEM_KINDS) as any[]).map(this.rowToItem);
  }
  parkInvalidApprovalCandidate(itemId: string, reason: string): boolean {
    this.reconcileUnsupportedKinds(itemId);
    this.reconcileNonExecutableTriggers(itemId);
    const result = JSON.stringify({ ok: false, reason: `APPROVAL_REQUEST_INVALID: ${reason}` });
    const info = this.db.prepare(`UPDATE work_items AS target SET status='parked', last_result=@result,
      revision=revision+1,
      claimed_at=NULL, claimed_by=NULL, claim_attempt_id=NULL, claim_fence_token_hash=NULL,
      updated_at=@ts
      WHERE id=@id AND status='pending' AND policy IN ('approval-required','risk-tagged')
        AND EXISTS (
          SELECT 1 FROM missions mission
          WHERE mission.id=target.mission_id AND mission.status IN ('pending','active')
        )
        AND ${dependencySatisfiedPredicate('target')}`)
      .run({ id: itemId, result, ts: this.now() });
    return info.changes === 1;
  }
  parkItemForApproval(itemId: string, request: ApprovalRequest): WorkItemApprovalBinding | null {
    this.reconcileUnsupportedKinds(itemId);
    this.reconcileNonExecutableTriggers(itemId);
    const transaction = this.db.transaction((): WorkItemApprovalBinding | null => {
      const existing = this.db.prepare(`SELECT approval.*, wi.mission_id FROM work_item_approvals approval
        JOIN work_items wi ON wi.id=approval.work_item_id WHERE approval.work_item_id=?`).get(itemId);
      if (existing) {
        const binding = this.rowToApprovalBinding(existing);
        if (binding.requestId !== request.id) {
          throw createExecutionAuthorityError(`MISSION_APPROVAL_CONFLICT: item ${itemId} already bound to ${binding.requestId}`);
        }
        return binding;
      }

      const ts = this.now();
      const parked = this.db.prepare(`UPDATE work_items AS target
        SET status='parked', claimed_at=NULL, claimed_by=NULL,
          claim_attempt_id=NULL, claim_fence_token_hash=NULL, revision=revision+1, updated_at=@ts
        WHERE id=@id AND status='pending'
          AND policy IN ('approval-required','risk-tagged')
          AND EXISTS (
            SELECT 1 FROM missions mission
            WHERE mission.id=target.mission_id AND mission.status IN ('pending','active')
          )
          AND ${dependencySatisfiedPredicate('target')}`).run({ id: itemId, ts });
      if (parked.changes !== 1) return null;

      this.db.prepare(`INSERT INTO work_item_approvals(
        work_item_id,request_id,request_json,publish_state,decision_state,created_at,updated_at
      ) VALUES(@workItemId,@requestId,@requestJson,'outbox','pending',@ts,@ts)`).run({
        workItemId: itemId,
        requestId: request.id,
        requestJson: JSON.stringify(request),
        ts,
      });
      const row = this.db.prepare(`SELECT approval.*, wi.mission_id FROM work_item_approvals approval
        JOIN work_items wi ON wi.id=approval.work_item_id WHERE approval.work_item_id=?`).get(itemId);
      return this.rowToApprovalBinding(row);
    });
    try {
      return transaction.immediate();
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('MISSION_APPROVAL_')) throw error;
      throw createExecutionAuthorityError(`MISSION_APPROVAL_CONFLICT: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  listApprovalBindings(): WorkItemApprovalBinding[] {
    const rows = this.db.prepare(`SELECT approval.*, wi.mission_id FROM work_item_approvals approval
      JOIN work_items wi ON wi.id=approval.work_item_id ORDER BY approval.created_at`).all() as any[];
    return rows.map(this.rowToApprovalBinding);
  }
  markApprovalPublished(requestId: string): void {
    this.db.prepare(`UPDATE work_item_approvals SET publish_state='published',
      published_at=COALESCE(published_at,@ts), updated_at=@ts WHERE request_id=@requestId`)
      .run({ requestId, ts: this.now() });
  }
  applyApprovalDecision(
    requestId: string,
    state: Exclude<WorkItemApprovalState, 'pending'>,
    decision: ApprovalDecision,
  ): ApprovalDecisionTransition | null {
    const semanticallyValid = decision.requestId === requestId && (
      (state === 'allowed' && decision.decision === 'allow' && decision.channel !== 'ttl-expire')
      || (state === 'denied' && decision.decision === 'deny' && decision.channel !== 'ttl-expire')
      || (state === 'expired' && decision.channel === 'ttl-expire')
      || (state === 'deferred' && decision.decision === 'defer' && decision.channel !== 'ttl-expire')
      || (state === 'escalated' && decision.decision === 'escalate' && decision.channel !== 'ttl-expire')
    );
    if (!semanticallyValid) {
      throw createExecutionAuthorityError(`MISSION_APPROVAL_DECISION_INVALID: ${requestId} cannot transition to ${state}`);
    }
    const transaction = this.db.transaction((): ApprovalDecisionTransition | null => {
      const row = this.db.prepare(`SELECT approval.*, wi.mission_id FROM work_item_approvals approval
        JOIN work_items wi ON wi.id=approval.work_item_id WHERE approval.request_id=?`).get(requestId);
      if (!row) return null;
      const binding = this.rowToApprovalBinding(row);
      if (binding.decisionState !== 'pending') {
        if (binding.decisionState !== state || this.canonical(binding.decision) !== this.canonical(decision)) {
          throw createExecutionAuthorityError(`MISSION_APPROVAL_DECISION_CONFLICT: request ${requestId} already settled as ${binding.decisionState}`);
        }
        return { missionId: binding.missionId, workItemId: binding.workItemId, changed: false };
      }

      const ts = this.now();
      const blocked = state === 'denied' || state === 'expired';
      const targetStatus = state === 'allowed' ? 'pending' : blocked ? 'blocked' : 'parked';
      const result = blocked
        ? JSON.stringify({ ok: false, reason: `APPROVAL_${state.toUpperCase()}: ${requestId}`, approvalDecision: decision })
        : null;
      this.db.prepare(`UPDATE work_items SET status=@status, revision=revision+1,
        last_result=COALESCE(@result,last_result), claimed_at=NULL, claimed_by=NULL,
        claim_attempt_id=NULL, claim_fence_token_hash=NULL, updated_at=@ts
        WHERE id=@workItemId AND status IN ('parked','pending')`).run({
        status: targetStatus,
        result,
        ts,
        workItemId: binding.workItemId,
      });
      this.db.prepare(`UPDATE work_item_approvals SET decision_state=@state,
        decision_json=@decision, decided_at=@decidedAt, updated_at=@ts WHERE request_id=@requestId`).run({
        state,
        decision: JSON.stringify(decision),
        decidedAt: decision.decidedAt,
        ts,
        requestId,
      });
      return { missionId: binding.missionId, workItemId: binding.workItemId, changed: true };
    });
    return transaction.immediate();
  }
  reconcilePendingDependencies(opts: DependencyReconciliationOptions = {}): string[] {
    const maxEdges = opts.maxEdges ?? DEFAULT_DEPENDENCY_RECONCILE_MAX_EDGES;
    const maxEdgesPerJob = opts.maxEdgesPerJob ?? DEFAULT_DEPENDENCY_RECONCILE_MAX_EDGES_PER_JOB;
    if (!Number.isSafeInteger(maxEdges) || maxEdges <= 0
      || !Number.isSafeInteger(maxEdgesPerJob) || maxEdgesPerJob <= 0
      || maxEdgesPerJob > maxEdges) {
      throw new TypeError('MISSION_DEPENDENCY_RECONCILE_BOUNDS_INVALID');
    }
    this.reconcileUnsupportedKinds();
    this.reconcileNonExecutableTriggers();
    const transaction = this.db.transaction((): string[] => {
      const changedMissions = new Set<string>();
      const missionRows = this.db.prepare(
        `SELECT DISTINCT wi.mission_id FROM work_items wi
          LEFT JOIN mission_graph_authorities graph ON graph.mission_id=wi.mission_id
          WHERE wi.status='pending' AND graph.mission_id IS NULL
          ORDER BY wi.mission_id`,
      ).all() as Array<{ mission_id: string }>;

      for (const { mission_id: missionId } of missionRows) {
        const items = (this.db.prepare('SELECT * FROM work_items WHERE mission_id=? ORDER BY created_at')
          .all(missionId) as any[]).map(this.rowToItem);
        const byId = new Map(items.map((item) => [item.id, item]));
        const pendingIds = new Set(items.filter((item) => item.status === 'pending').map((item) => item.id));
        const failures = new Map<string, { status: 'failed' | 'blocked'; reason: string }>();

        for (const id of pendingIds) {
          const item = byId.get(id)!;
          const missing = item.dependsOn.filter((dependencyId) => !byId.has(dependencyId));
          if (missing.length > 0) {
            failures.set(id, { status: 'failed', reason: `DEPENDENCY_NOT_FOUND: ${missing.sort().join(', ')}` });
          }
        }

        // Detect every cycle among still-pending nodes. Forward references are
        // valid once present; only a back-edge in the mission-local graph fails.
        const visitState = new Map<string, 'visiting' | 'visited'>();
        const stack: string[] = [];
        const cycleIds = new Set<string>();
        const visit = (id: string): void => {
          const state = visitState.get(id);
          if (state === 'visited') return;
          if (state === 'visiting') {
            const start = stack.lastIndexOf(id);
            for (const cycleId of stack.slice(start)) cycleIds.add(cycleId);
            return;
          }
          visitState.set(id, 'visiting');
          stack.push(id);
          for (const dependencyId of byId.get(id)?.dependsOn ?? []) {
            if (pendingIds.has(dependencyId)) visit(dependencyId);
          }
          stack.pop();
          visitState.set(id, 'visited');
        };
        for (const id of pendingIds) visit(id);
        if (cycleIds.size > 0) {
          const cycle = [...cycleIds].sort().join(', ');
          for (const id of cycleIds) failures.set(id, { status: 'failed', reason: `DEPENDENCY_CYCLE: ${cycle}` });
        }

        // Propagate direct and transitive upstream failure in-memory before one
        // durable write pass, so A→B→C fails fully in the same reconciliation.
        let added = true;
        while (added) {
          added = false;
          for (const id of pendingIds) {
            if (failures.has(id)) continue;
            const failedDependency = byId.get(id)!.dependsOn.find((dependencyId) => {
              const dependency = byId.get(dependencyId);
              return dependency?.status === 'failed' || dependency?.status === 'blocked' || failures.has(dependencyId);
            });
            if (failedDependency) {
              failures.set(id, { status: 'blocked', reason: `DEPENDENCY_FAILED: ${failedDependency}` });
              added = true;
            }
          }
        }

        for (const [id, failure] of failures) {
          const { status, reason } = failure;
          const result = JSON.stringify({ ok: false, reason });
          const info = this.db.prepare(`UPDATE work_items SET status=@status, last_result=@result,
            revision=revision+1,
            claimed_at=NULL, claimed_by=NULL, claim_attempt_id=NULL, claim_fence_token_hash=NULL,
            updated_at=@ts WHERE id=@id AND status='pending'`)
            .run({ id, status, result, ts: this.now() });
          if (info.changes === 1) changedMissions.add(missionId);
        }
      }

      let remainingBudget = maxEdges;
      while (remainingBudget > 0) {
        const job = this.db.prepare(`SELECT
            mission_id,upstream_item_id,upstream_revision,outcome,cursor_work_item_id,turn_seq
          FROM mission_dependency_reconcile_queue
          WHERE state='pending'
          ORDER BY turn_seq,updated_at,mission_id,upstream_item_id,upstream_revision,outcome
          LIMIT 1`).get() as {
            mission_id: string;
            upstream_item_id: string;
            upstream_revision: number;
            outcome: 'done' | 'failed' | 'blocked';
            cursor_work_item_id: string;
            turn_seq: number;
          } | undefined;
        if (!job) break;
        const chunkSize = Math.min(maxEdgesPerJob, remainingBudget);
        const dependants = this.db.prepare(`SELECT work_item_id
          FROM work_item_dependencies
          WHERE mission_id=? AND dependency_item_id=? AND work_item_id>?
          ORDER BY work_item_id
          LIMIT ?`).all(
          job.mission_id,
          job.upstream_item_id,
          job.cursor_work_item_id,
          chunkSize,
        ) as Array<{ work_item_id: string }>;
        if (dependants.length === 0) {
          this.db.prepare(`UPDATE mission_dependency_reconcile_queue
            SET state='done',updated_at=@ts
            WHERE mission_id=@missionId AND upstream_item_id=@upstreamItemId
              AND upstream_revision=@upstreamRevision AND outcome=@outcome
              AND state='pending'`).run({
            ...job,
            missionId: job.mission_id,
            upstreamItemId: job.upstream_item_id,
            upstreamRevision: job.upstream_revision,
            ts: this.now(),
          });
          continue;
        }

        const terminalFailure = job.outcome === 'failed' || job.outcome === 'blocked';
        for (const dependant of dependants) {
          this.db.prepare(`UPDATE work_item_dependency_readiness
            SET remaining_count=CASE WHEN remaining_count>0 THEN remaining_count-1 ELSE 0 END,
              failed_count=failed_count+@failedDelta,updated_at=@ts
            WHERE mission_id=@missionId AND work_item_id=@workItemId`).run({
            missionId: job.mission_id,
            workItemId: dependant.work_item_id,
            failedDelta: terminalFailure ? 1 : 0,
            ts: this.now(),
          });
          if (terminalFailure) {
            const reason = `DEPENDENCY_FAILED: ${job.upstream_item_id}`;
            const result = JSON.stringify({ ok: false, reason });
            const info = this.db.prepare(`UPDATE work_items SET
                status='blocked',last_result=@result,revision=revision+1,
                claimed_at=NULL,claimed_by=NULL,claim_attempt_id=NULL,
                claim_fence_token_hash=NULL,updated_at=@ts
              WHERE mission_id=@missionId AND id=@workItemId AND status='pending'`).run({
              missionId: job.mission_id,
              workItemId: dependant.work_item_id,
              result,
              ts: this.now(),
            });
            if (info.changes === 1) changedMissions.add(job.mission_id);
          }
        }
        const cursor = dependants.at(-1)!.work_item_id;
        this.db.prepare(`UPDATE mission_dependency_reconcile_queue
          SET cursor_work_item_id=@cursor,turn_seq=turn_seq+1,updated_at=@ts
          WHERE mission_id=@missionId AND upstream_item_id=@upstreamItemId
            AND upstream_revision=@upstreamRevision AND outcome=@outcome
            AND state='pending' AND cursor_work_item_id=@priorCursor`).run({
          missionId: job.mission_id,
          upstreamItemId: job.upstream_item_id,
          upstreamRevision: job.upstream_revision,
          outcome: job.outcome,
          cursor,
          priorCursor: job.cursor_work_item_id,
          ts: this.now(),
        });
        remainingBudget -= dependants.length;
      }
      return [...changedMissions];
    });
    return transaction.immediate();
  }
  hasPendingDependencyReconciliation(): boolean {
    return this.db.prepare(`SELECT 1 AS pending FROM mission_dependency_reconcile_queue
      WHERE state='pending' LIMIT 1`).get() !== undefined;
  }
  queryDue(opts?: { tenant?: string; limit?: number; registry?: MissionRunnerRegistryV1 }): WorkItem[] {
    if (opts?.registry) this.reconcileRuntimeAdmission(opts.registry);
    else {
      this.reconcileUnsupportedKinds();
      this.reconcileNonExecutableTriggers();
    }
    // Only mission-local dependency-success items are eligible. Missing,
    // failed, running, parked or pending dependencies keep the item out.
    const admittedKinds = opts?.registry
      ? listRuntimeAdmittedKinds(opts.registry)
      : [...CANONICAL_WORK_ITEM_KINDS];
    if (admittedKinds.length === 0) return [];
    const args: unknown[] = [...admittedKinds];
    let sql = `SELECT ${WORK_ITEM_WITH_FENCE_COLUMNS}
      FROM work_items wi
      LEFT JOIN work_item_admission_fences fence ON fence.work_item_id=wi.id
      JOIN missions m ON m.id = wi.mission_id
      WHERE wi.status='pending' AND m.status IN ('pending','active')
      AND wi.kind IN (${admittedKinds.map(() => '?').join(',')})
      AND (
        wi.policy='auto' OR (
          wi.policy IN ('approval-required','risk-tagged') AND EXISTS (
            SELECT 1 FROM work_item_approvals approval
            WHERE approval.work_item_id=wi.id AND approval.decision_state='allowed'
          )
        )
      )
      AND ${dependencyReadinessPredicate('wi')}
      AND ${dependencySatisfiedPredicate('wi')}`;
    if (opts?.registry) {
      sql += ' AND fence.registry_revision=? AND fence.registry_digest=?';
      args.push(opts.registry.registryRevision, opts.registry.registryDigest);
    }
    if (opts?.tenant) { sql += ' AND m.tenant=?'; args.push(opts.tenant); }
    sql += ' ORDER BY wi.created_at';
    if (opts?.limit && opts.limit > 0) { sql += ' LIMIT ?'; args.push(opts.limit); }
    const items = (this.db.prepare(sql).all(...args) as any[]).map(this.rowToItem);
    if (!opts?.registry) return items;
    return items.filter((item) => {
      const validation = validateWorkItemAdmission(item, item.admissionFence, opts.registry!);
      if (validation.ok) return true;
      this.reconcileRuntimeAdmission(opts.registry!, item.id);
      return false;
    });
  }
  claimItemWithAuthority(
    id: string,
    by: string,
    fence?: MissionClaimFence,
    engineLease?: MissionEngineLease,
  ): MissionDispatchClaim | null {
    if (by.length === 0 || by !== by.trim()) {
      throw new TypeError('MISSION_DISPATCH_CLAIM_INVALID: claimedBy');
    }
    const transaction = this.db.transaction((): MissionDispatchClaim | null => {
      const claimedAt = this.now();
      const engineAuthority = this.engineLeasePredicate(engineLease, Date.now());
      if (!engineAuthority) return null;
      const attemptId = randomUUID();
      const fenceToken = randomUUID();
      const fenceTokenHash = this.claimTokenHash(fenceToken);
      if (fence) {
        this.reconcileRuntimeAdmission(fence.registry, id);
        const current = this.selectItem(id);
        if (!current
          || current.revision !== fence.itemRevision
          || current.admissionFence === null
          || this.canonical(current.admissionFence) !== this.canonical(fence.admissionFence)
          || !validateWorkItemAdmission(current, current.admissionFence, fence.registry).ok) return null;
        const runtimeKinds = listRuntimeAdmittedKinds(fence.registry);
        if (runtimeKinds.length === 0) return null;
        const runtimeBindings = Object.fromEntries(runtimeKinds.map((kind, index) => [`runtimeKind${index}`, kind]));
        const runtimeNamed = runtimeKinds.map((_, index) => `@runtimeKind${index}`).join(',');
        const info = this.db.prepare(`UPDATE work_items AS target
          SET status='running', claimed_at=@ts, claimed_by=@by,
            claim_registry_revision=@registryRevision, claim_registry_digest=@registryDigest,
            claim_attempt_id=@attemptId, claim_fence_token_hash=@fenceTokenHash,
            revision=revision+1, updated_at=@ts
          WHERE id=@id AND status='pending' AND revision=@itemRevision
          AND target.kind IN (${runtimeNamed}) AND EXISTS (
            SELECT 1 FROM work_item_admission_fences fence
            WHERE fence.work_item_id=target.id
              AND fence.registry_revision=@registryRevision
              AND fence.registry_digest=@registryDigest
              AND fence.item_kind=target.kind
              AND fence.runner_revision=@runnerRevision
              AND fence.item_definition_digest=@itemDefinitionDigest
          ) AND EXISTS (
            SELECT 1 FROM missions mission
            WHERE mission.id=target.mission_id AND mission.status IN ('pending','active')
          ) AND (
            target.policy='auto' OR (
              target.policy IN ('approval-required','risk-tagged') AND EXISTS (
                SELECT 1 FROM work_item_approvals approval
                WHERE approval.work_item_id=target.id AND approval.decision_state='allowed'
              )
            )
          )
          AND ${dependencySatisfiedPredicate('target')}${engineAuthority.sql}`).run({
          ...runtimeBindings,
          ...engineAuthority.bindings,
          id,
          by,
          ts: claimedAt,
          attemptId,
          fenceTokenHash,
          itemRevision: fence.itemRevision,
          registryRevision: fence.admissionFence.registryRevision,
          registryDigest: fence.admissionFence.registryDigest,
          runnerRevision: fence.admissionFence.runnerRevision,
          itemDefinitionDigest: fence.admissionFence.itemDefinitionDigest,
        });
        if (info.changes !== 1) return null;
        return Object.freeze({
          schemaVersion: 1,
          workItemId: current.id,
          missionId: current.missionId,
          claimedBy: by,
          claimedAt,
          itemRevision: current.revision + 1,
          attemptId,
          fenceToken,
          fenceTokenHash,
          claimRegistryRevision: fence.admissionFence.registryRevision,
          claimRegistryDigest: fence.admissionFence.registryDigest,
        });
      }

      this.reconcileUnsupportedKinds(id);
      this.reconcileNonExecutableTriggers(id);
      const current = this.selectItem(id);
      if (!current) return null;
      const info = this.db.prepare(`UPDATE work_items AS target
        SET status='running', claimed_at=@ts, claimed_by=@by,
          claim_attempt_id=@attemptId, claim_fence_token_hash=@fenceTokenHash,
          revision=revision+1, updated_at=@ts
        WHERE id=@id AND status='pending' AND revision=@itemRevision
        AND target.kind IN (${CANONICAL_KIND_NAMED}) AND EXISTS (
          SELECT 1 FROM missions mission
          WHERE mission.id=target.mission_id AND mission.status IN ('pending','active')
        ) AND (
          target.policy='auto' OR (
            target.policy IN ('approval-required','risk-tagged') AND EXISTS (
              SELECT 1 FROM work_item_approvals approval
              WHERE approval.work_item_id=target.id AND approval.decision_state='allowed'
            )
          )
        )
        AND ${dependencySatisfiedPredicate('target')}${engineAuthority.sql}`).run({
        ...CANONICAL_KIND_BINDINGS,
        ...engineAuthority.bindings,
        id,
        by,
        ts: claimedAt,
        itemRevision: current.revision,
        attemptId,
        fenceTokenHash,
      });
      if (info.changes !== 1) return null;
      return Object.freeze({
        schemaVersion: 1,
        workItemId: current.id,
        missionId: current.missionId,
        claimedBy: by,
        claimedAt,
        itemRevision: current.revision + 1,
        attemptId,
        fenceToken,
        fenceTokenHash,
        claimRegistryRevision: null,
        claimRegistryDigest: null,
      });
    });
    return transaction.immediate();
  }

  settleClaimedItem(
    claim: MissionDispatchClaim,
    status: Extract<WorkItemStatus, 'done' | 'failed' | 'parked'>,
    result?: ResultLike,
    engineLease?: MissionEngineLease,
  ): boolean {
    if (claim.schemaVersion !== 1
      || claim.workItemId.length === 0
      || claim.missionId.length === 0
      || claim.claimedBy.length === 0
      || claim.attemptId.length === 0
      || claim.fenceToken.length === 0
      || claim.fenceTokenHash !== this.claimTokenHash(claim.fenceToken)) return false;
    const transaction = this.db.transaction((): boolean => {
      const engineAuthority = this.engineLeasePredicate(engineLease, Date.now());
      if (!engineAuthority) return false;

      let adoptedSpec: Record<string, unknown> | null = null;
      let priorFence: WorkItemAdmissionFenceV1 | null = null;
      let adoptedDefinitionDigest: string | null = null;
      const exactPlanRef = result?.exactPlanRef;
      if (exactPlanRef !== undefined) {
        const current = this.selectItem(claim.workItemId);
        if (!current
          || current.kind !== 'sprint'
          || current.missionId !== claim.missionId
          || current.status !== 'running'
          || current.revision !== claim.itemRevision
          || current.admissionFence === null) return false;
        let currentSource;
        let returnedSource;
        try {
          currentSource = resolveMissionSprintExecutionSource(current);
          returnedSource = resolveMissionSprintExecutionSource({
            id: current.id,
            kind: 'sprint',
            spec: { exactPlanRef },
          });
        } catch {
          return false;
        }
        if (returnedSource.kind !== 'exact-ref') return false;
        if (
          currentSource.kind === 'exact-ref'
          && (
            currentSource.ref.flowId !== returnedSource.ref.flowId
            || currentSource.ref.revision !== returnedSource.ref.revision
            || currentSource.ref.planDigest !== returnedSource.ref.planDigest
          )
        ) return false;
        adoptedSpec = { ...(current.spec ?? {}), exactPlanRef: returnedSource.ref };
        delete adoptedSpec['directivesRef'];
        delete adoptedSpec['intent'];
        priorFence = current.admissionFence;
        adoptedDefinitionDigest = computeWorkItemDefinitionDigest({
          ...current,
          spec: adoptedSpec,
        });
      }

      const info = this.db.prepare(`UPDATE work_items SET status=@status,
        spec=COALESCE(@spec,spec),
        last_result=COALESCE(@result,last_result), revision=revision+1,
        claim_attempt_id=NULL, claim_fence_token_hash=NULL, updated_at=@ts
        WHERE id=@id AND mission_id=@missionId AND status='running'
          AND claimed_by=@claimedBy AND claimed_at=@claimedAt AND revision=@itemRevision
          AND claim_attempt_id=@attemptId AND claim_fence_token_hash=@fenceTokenHash
          ${engineAuthority.sql}`)
        .run({
          ...engineAuthority.bindings,
          id: claim.workItemId,
          missionId: claim.missionId,
          claimedBy: claim.claimedBy,
          claimedAt: claim.claimedAt,
          itemRevision: claim.itemRevision,
          attemptId: claim.attemptId,
          fenceTokenHash: claim.fenceTokenHash,
          status,
          spec: adoptedSpec === null ? null : JSON.stringify(adoptedSpec),
          result: result ? JSON.stringify(result) : null,
          ts: this.now(),
        });
      if (info.changes !== 1) return false;
      if (priorFence && adoptedDefinitionDigest) {
        const fenceUpdate = this.db.prepare(`UPDATE work_item_admission_fences
          SET item_definition_digest=@adoptedDefinitionDigest
          WHERE work_item_id=@id
            AND schema_version=@schemaVersion
            AND registry_revision=@registryRevision
            AND registry_digest=@registryDigest
            AND item_kind=@kind
            AND runner_revision=@runnerRevision
            AND item_definition_digest=@priorDefinitionDigest`).run({
          id: claim.workItemId,
          schemaVersion: priorFence.schemaVersion,
          registryRevision: priorFence.registryRevision,
          registryDigest: priorFence.registryDigest,
          kind: priorFence.kind,
          runnerRevision: priorFence.runnerRevision,
          priorDefinitionDigest: priorFence.itemDefinitionDigest,
          adoptedDefinitionDigest,
        });
        if (fenceUpdate.changes !== 1) {
          throw new DeckentError('E_MISSION_EXACT_PLAN_FENCE_CAS_CONFLICT', `MISSION_EXACT_PLAN_FENCE_CAS_CONFLICT: ${claim.workItemId}`);
        }
      }
      return true;
    });
    return transaction.immediate();
  }

  backfillLegacyTerminalResult(
    id: string,
    expectedRevision: number,
    status: Extract<WorkItemStatus, 'done' | 'failed'>,
    result: ResultLike,
  ): boolean {
    if (!id || id !== id.trim()
      || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0
      || (status !== 'done' && status !== 'failed')) return false;
    const info = this.db.prepare(`UPDATE work_items SET
      last_result=@result,revision=revision+1,updated_at=@ts
      WHERE id=@id AND revision=@expectedRevision AND status=@status
        AND last_result IS NULL
        AND claimed_at IS NULL AND claimed_by IS NULL
        AND claim_attempt_id IS NULL AND claim_fence_token_hash IS NULL`).run({
      id,
      expectedRevision,
      status,
      result: JSON.stringify(result),
      ts: this.now(),
    });
    return info.changes === 1;
  }

  isDispatchClaimActive(claim: MissionDispatchClaim, engineLease?: MissionEngineLease): boolean {
    if (claim.schemaVersion !== 1
      || claim.workItemId.length === 0
      || claim.missionId.length === 0
      || claim.claimedBy.length === 0
      || claim.attemptId.length === 0
      || claim.fenceToken.length === 0
      || claim.fenceTokenHash !== this.claimTokenHash(claim.fenceToken)) return false;
    if (engineLease && !this.isEngineLeaseActive(engineLease)) return false;
    const row = this.db.prepare(`SELECT mission_id,status,claimed_by,claimed_at,revision,
      claim_attempt_id,claim_fence_token_hash,claim_registry_revision,claim_registry_digest
      FROM work_items WHERE id=?`).get(claim.workItemId) as {
        mission_id: string;
        status: string;
        claimed_by: string | null;
        claimed_at: string | null;
        revision: number;
        claim_attempt_id: string | null;
        claim_fence_token_hash: string | null;
        claim_registry_revision: string | null;
        claim_registry_digest: string | null;
      } | undefined;
    return row !== undefined
      && row.mission_id === claim.missionId
      && row.status === 'running'
      && row.claimed_by === claim.claimedBy
      && row.claimed_at === claim.claimedAt
      && row.revision === claim.itemRevision
      && row.claim_attempt_id === claim.attemptId
      && row.claim_fence_token_hash === claim.fenceTokenHash
      && row.claim_registry_revision === claim.claimRegistryRevision
      && row.claim_registry_digest === claim.claimRegistryDigest;
  }

  claimItem(id: string, by: string, fence?: MissionClaimFence): boolean {
    return this.claimItemWithAuthority(id, by, fence) !== null;
  }
  listItems(missionId: string): WorkItem[] {
    return (this.db.prepare(`SELECT ${WORK_ITEM_WITH_FENCE_COLUMNS}
      FROM work_items wi LEFT JOIN work_item_admission_fences fence ON fence.work_item_id=wi.id
      WHERE wi.mission_id=? ORDER BY wi.created_at,wi.rowid`).all(missionId) as any[]).map(this.rowToItem);
  }

  // Test-only raw helpers (prefixed __ — not part of the public MissionStore surface).
  __rawTableNames(): string[] {
    return (this.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map(r => r.name);
  }
  __rawExec(sql: string): void { this.db.exec(sql); }
  __rawGet(sql: string): any { return this.db.prepare(sql).get(); }
}
