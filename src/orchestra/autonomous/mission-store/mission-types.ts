// Autonomous v2 — durable mission/work-item model + store/view contracts.
import type { ApprovalDecision, ApprovalRequest } from '../../../core/approval-contract.js';
import type {
  MissionAcceptanceDecisionRecord,
  MissionAcceptanceDecisionV1,
} from './mission-acceptance.js';
import type {
  MissionRunnerRegistryV1,
  WorkItemAdmissionFenceV1,
} from './mission-kind-admission.js';
export type MissionKind = 'list' | 'goal';
export type MissionStatus = 'pending' | 'active' | 'completed' | 'failed' | 'cancelled';
export type MissionRenderAs = 'checklist' | 'goal';

export type WorkItemKind = 'task' | 'sprint' | 'capability' | 'process';
export type WorkItemStatus = 'pending' | 'running' | 'done' | 'failed' | 'blocked' | 'parked';
export type WorkItemRenderAs = 'task' | 'sprint' | 'workflow' | 'action';
export type WorkItemPolicy = 'auto' | 'approval-required' | 'risk-tagged';
export type ApprovalPublishState = 'outbox' | 'published';
export type WorkItemApprovalState = 'pending' | 'allowed' | 'denied' | 'expired' | 'deferred' | 'escalated';

export interface Progress { done: number; total: number; phase?: string; step?: string; }
/**
 * Three-way settle outcome for a dispatched work item, layered on top of the binary
 * `ok` used for scheduling: 'done' = clean success, 'debt' = succeeded but the worker
 * honestly self-assessed GO_WITH_TECH_DEBT (still `ok: true` — DEBT is not a failure),
 * 'failed' = NO_GO / thrown / timed-out. Optional: absent on any ResultLike falls back
 * to `ok ? 'done' : 'failed'` (see mission-engine-wire.ts#deriveSettleDetail) — no store
 * migration needed, it round-trips through the existing JSON `last_result` column.
 */
export type SettleDetail = 'done' | 'debt' | 'failed';
export interface ResultLike {
  ok: boolean;
  reason?: string;
  settleDetail?: SettleDetail;
  /** Host HOLD=no provider grant; reconciliation-required=grant/effect may exist. Both park the item. */
  dispatchDisposition?: 'parked' | 'reconciliation-required';
  [k: string]: unknown;
}

export interface Mission {
  id: string; kind: MissionKind; status: MissionStatus; tenant: string;
  title: string; spec: Record<string, unknown> | null;
  createdBy: string | null; deliverTo: string | null; renderAs: MissionRenderAs;
  progress: Progress | null;
  createdAt: string; updatedAt: string; completedAt: string | null;
  lastResult: ResultLike | null;
}
export interface NewMission {
  id: string; kind: MissionKind; tenant?: string; title: string;
  spec?: Record<string, unknown>; createdBy?: string; deliverTo?: string;
  renderAs?: MissionRenderAs; progress?: Progress;
}
export interface WorkItem {
  id: string; missionId: string; kind: WorkItemKind; status: WorkItemStatus;
  spec: Record<string, unknown> | null; policy: WorkItemPolicy; renderAs: WorkItemRenderAs;
  progress: Progress | null; dependsOn: string[]; trigger: Record<string, unknown> | null;
  claimedAt: string | null; claimedBy: string | null;
  revision: number; admissionFence: WorkItemAdmissionFenceV1 | null;
  claimRegistryRevision: string | null; claimRegistryDigest: string | null;
  createdAt: string; updatedAt: string; lastResult: ResultLike | null;
}
export interface NewWorkItem {
  id: string; missionId: string; kind: WorkItemKind; spec?: Record<string, unknown>;
  policy?: WorkItemPolicy; renderAs?: WorkItemRenderAs; dependsOn?: string[];
  trigger?: Record<string, unknown>;
  /** Host-issued runtime proof. User/planner values are replaced during admission. */
  admissionFence?: WorkItemAdmissionFenceV1;
}
/** Atomic mission-batch item. Initial state exists for durable import/recovery;
 * normal `enqueueItem` remains pending-only and cannot bypass the claim lifecycle. */
export interface NewMissionWorkItem extends NewWorkItem {
  initialStatus?: WorkItemStatus;
  initialResult?: ResultLike;
}
export interface WorkItemApprovalBinding {
  workItemId: string;
  missionId: string;
  requestId: string;
  request: ApprovalRequest;
  publishState: ApprovalPublishState;
  decisionState: WorkItemApprovalState;
  decision: ApprovalDecision | null;
  createdAt: string;
  publishedAt: string | null;
  decidedAt: string | null;
  updatedAt: string;
}
export interface ApprovalDecisionTransition {
  missionId: string;
  workItemId: string;
  changed: boolean;
}
export interface MissionClaimFence {
  itemRevision: number;
  admissionFence: WorkItemAdmissionFenceV1;
  registry: MissionRunnerRegistryV1;
}
/** Host-private authority for one exact running attempt. The raw token is never persisted. */
export interface MissionDispatchClaim {
  schemaVersion: 1;
  workItemId: string;
  missionId: string;
  claimedBy: string;
  claimedAt: string;
  itemRevision: number;
  attemptId: string;
  fenceToken: string;
  fenceTokenHash: string;
  claimRegistryRevision: string | null;
  claimRegistryDigest: string | null;
}
/** Host-private singleton authority for one Goal-v2 engine process on one MissionStore. */
export interface MissionEngineLease {
  schemaVersion: 1;
  ownerId: string;
  epoch: number;
  acquiredAt: string;
  renewedAt: string;
  expiresAt: string;
  leaseToken: string;
  leaseTokenHash: string;
}
export interface MissionEvent { ts: string; workItemId?: string; type: string; data?: unknown; }

export interface MissionStore {
  migrate(): void;
  /** Recovery is a singleton-engine mutation and requires current exact lease authority. */
  recover(engineLease: MissionEngineLease): void;
  close(): void;
  acquireEngineLease(ownerId: string, ttlMs: number): MissionEngineLease | null;
  renewEngineLease(lease: MissionEngineLease, ttlMs: number): MissionEngineLease | null;
  releaseEngineLease(lease: MissionEngineLease): boolean;
  isEngineLeaseActive(lease: MissionEngineLease): boolean;
  createMission(m: NewMission): Mission;
  /** Validate and persist a new mission plus its complete work-item DAG atomically. */
  createMissionWithItems(m: NewMission, items: readonly NewMissionWorkItem[]): Mission;
  /** Recovery-only import: preserves an exact terminal UNKNOWN_KIND quarantine without weakening fresh intake. */
  importLegacyMissionWithItems(m: NewMission, items: readonly NewMissionWorkItem[]): Mission;
  getMission(id: string): Mission | null;
  listMissions(f?: { status?: MissionStatus[]; tenant?: string }): Mission[];
  updateMissionStatus(id: string, status: MissionStatus, result?: ResultLike): void;
  setMissionProgress(id: string, progress: Progress): void;
  /** Atomically persist one acceptance round and settle the mission from the validated decision. */
  recordAcceptanceDecision(decision: MissionAcceptanceDecisionV1): MissionAcceptanceDecisionRecord;
  listAcceptanceDecisions(missionId: string): MissionAcceptanceDecisionRecord[];
  enqueueItem(item: NewWorkItem): WorkItem;
  /** Atomically enqueue a complete already-admitted goal round. */
  enqueueItems(items: readonly NewWorkItem[]): WorkItem[];
  /** Dependency-ready pending items whose policy requires an approval binding. */
  listApprovalCandidates(): WorkItem[];
  /** Atomically park one candidate and persist its canonical approval outbox. */
  parkItemForApproval(itemId: string, request: ApprovalRequest): WorkItemApprovalBinding | null;
  /** Durable fail-closed HOLD when no valid ApprovalRequest can be authored. */
  parkInvalidApprovalCandidate(itemId: string, reason: string): boolean;
  listApprovalBindings(): WorkItemApprovalBinding[];
  markApprovalPublished(requestId: string): void;
  /** Apply a durable broker decision to its parked item idempotently. */
  applyApprovalDecision(
    requestId: string,
    state: Exclude<WorkItemApprovalState, 'pending'>,
    decision: ApprovalDecision,
  ): ApprovalDecisionTransition | null;
  /** Fail invalid/cyclic/failed-upstream pending dependency chains durably.
   * Returns mission ids whose item status changed during reconciliation. */
  reconcilePendingDependencies(): string[];
  /** Quarantine non-terminal rows that cannot execute under the current registry. */
  reconcileRuntimeAdmission(registry: MissionRunnerRegistryV1, itemId?: string): string[];
  queryDue(opts?: { tenant?: string; limit?: number; registry?: MissionRunnerRegistryV1 }): WorkItem[];
  /** Atomically claim and return the only authority allowed to settle this running attempt. */
  claimItemWithAuthority(
    id: string,
    by: string,
    fence?: MissionClaimFence,
    engineLease?: MissionEngineLease,
  ): MissionDispatchClaim | null;
  /** Read-only persisted provenance check. This is not an atomic provider execution grant. */
  isDispatchClaimActive(claim: MissionDispatchClaim, engineLease?: MissionEngineLease): boolean;
  /** First-writer-wins settlement for one exact claim; stale/wrong/replayed authority is a no-op. */
  settleClaimedItem(
    claim: MissionDispatchClaim,
    status: Extract<WorkItemStatus, 'done' | 'failed' | 'parked'>,
    result?: ResultLike,
    engineLease?: MissionEngineLease,
  ): boolean;
  /** Compatibility/admin claim surface. Runtime schedulers must use claimItemWithAuthority. */
  claimItem(id: string, by: string, fence?: MissionClaimFence): boolean;
  /** Compatibility/admin transition. Runtime schedulers must use settleClaimedItem. */
  updateItemStatus(id: string, status: WorkItemStatus, result?: ResultLike): void;
  listItems(missionId: string): WorkItem[];
}
