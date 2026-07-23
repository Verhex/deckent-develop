import { createHash } from 'node:crypto';

import type { ApprovalRequestInput } from '../../../core/approval-broker.js';
import {
  validateApprovalRequest,
  type ApprovalRequest,
} from '../../../core/approval-contract.js';
import type { ApprovalStoreSnapshot } from '../../../core/approval-store.js';
import type { ApprovalDecisionAuthority } from '../../../core/approval-decision-ingress.js';
import type {
  Mission,
  MissionStore,
  WorkItem,
  WorkItemApprovalBinding,
  WorkItemApprovalState,
} from './mission-types.js';

export type MissionApprovalRequestDraft = Omit<ApprovalRequestInput, 'id'>;

export interface MissionApprovalRequestFactory {
  (item: WorkItem, mission: Mission): MissionApprovalRequestDraft;
}

export interface MissionApprovalPublisher {
  submit(request: ApprovalRequestInput): ApprovalRequest;
}

export interface MissionApprovalDecisionSource {
  sweepExpired(now?: Date): string[];
  index(now?: Date): ApprovalStoreSnapshot;
}

export interface MissionApprovalCoordinatorOptions {
  store: MissionStore;
  publisher: MissionApprovalPublisher;
  decisions: MissionApprovalDecisionSource;
  requestFactory: MissionApprovalRequestFactory;
  /** Host-only live-session + integrity authority. Absent means human allow stays HOLD. */
  decisionAuthority?: ApprovalDecisionAuthority;
  now?: () => Date;
}

export interface MissionApprovalTickSummary {
  parked: number;
  published: number;
  decided: number;
  invalid: number;
  changedMissionIds: string[];
}

export interface MissionApprovalCoordinatorLike {
  tick(): MissionApprovalTickSummary | Promise<MissionApprovalTickSummary>;
  /** Revalidate the durable allow immediately before a guarded item is claimed. */
  authorizeClaim?(item: WorkItem): boolean;
}

function canonical(value: unknown): string {
  const normalize = (nested: unknown): unknown => {
    if (Array.isArray(nested)) return nested.map(normalize);
    if (nested !== null && typeof nested === 'object') {
      return Object.fromEntries(Object.entries(nested as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, normalize(child)]));
    }
    return nested ?? null;
  };
  return JSON.stringify(normalize(value));
}

export function approvalRequestIdForWorkItem(mission: Mission, item: WorkItem): string {
  const digest = createHash('sha256')
    .update(`${mission.tenant}\0${mission.id}\0${item.id}`)
    .digest('hex')
    .slice(0, 40);
  return `mission-${digest}`;
}

function entries(snapshot: ApprovalStoreSnapshot) {
  return [
    ...snapshot.pending,
    ...snapshot.approved,
    ...snapshot.denied,
    ...snapshot.expired,
  ];
}

function requestMap(snapshot: ApprovalStoreSnapshot) {
  return new Map(entries(snapshot).map((entry) => [entry.request.id, entry]));
}

function decisionState(
  snapshot: ApprovalStoreSnapshot,
  requestId: string,
): { state: Exclude<WorkItemApprovalState, 'pending'>; decision: NonNullable<WorkItemApprovalBinding['decision']> } | null {
  const approved = snapshot.approved.find((entry) => entry.request.id === requestId);
  if (approved?.decision) return { state: 'allowed', decision: approved.decision };

  const expired = snapshot.expired.find((entry) => entry.request.id === requestId);
  if (expired?.decision) return { state: 'expired', decision: expired.decision };

  const denied = snapshot.denied.find((entry) => entry.request.id === requestId);
  if (!denied?.decision) return null;
  if (denied.decision.decision === 'defer') return { state: 'deferred', decision: denied.decision };
  if (denied.decision.decision === 'escalate') return { state: 'escalated', decision: denied.decision };
  return { state: 'denied', decision: denied.decision };
}

/** Non-blocking bridge from durable MissionStore outbox to the runtime-wide ApprovalBroker/Store. */
export class MissionApprovalCoordinator implements MissionApprovalCoordinatorLike {
  private readonly store: MissionStore;
  private readonly publisher: MissionApprovalPublisher;
  private readonly decisions: MissionApprovalDecisionSource;
  private readonly requestFactory: MissionApprovalRequestFactory;
  private readonly decisionAuthority?: ApprovalDecisionAuthority;
  private readonly now: () => Date;

  constructor(opts: MissionApprovalCoordinatorOptions) {
    this.store = opts.store;
    this.publisher = opts.publisher;
    this.decisions = opts.decisions;
    this.requestFactory = opts.requestFactory;
    this.decisionAuthority = opts.decisionAuthority;
    this.now = opts.now ?? (() => new Date());
  }

  authorizeClaim(item: WorkItem): boolean {
    if (item.policy === 'auto') return true;
    const binding = this.store.listApprovalBindings()
      .find((candidate) => candidate.workItemId === item.id);
    if (!binding || binding.decisionState !== 'allowed' || !binding.decision || !this.decisionAuthority) {
      return false;
    }
    return this.decisionAuthority.validate(binding.request, binding.decision, this.now()).ok;
  }

  tick(): MissionApprovalTickSummary {
    const now = this.now();
    this.decisions.sweepExpired(now);
    let snapshot = this.decisions.index(now);
    let indexedRequests = requestMap(snapshot);
    const changedMissionIds = new Set<string>();
    let decided = 0;
    let invalid = 0;

    // Restart hydration happens before new admission. A durable decision always
    // wins over generating another request for the same parked work item.
    for (const binding of this.store.listApprovalBindings()) {
      if (binding.decisionState !== 'pending') continue;
      const indexedRequest = indexedRequests.get(binding.requestId)?.request;
      if (indexedRequest && canonical(indexedRequest) !== canonical(binding.request)) {
        throw new Error(`MISSION_APPROVAL_REQUEST_CONFLICT: ${binding.requestId}`);
      }
      const settled = decisionState(snapshot, binding.requestId);
      if (!settled) continue;
      if (settled.state === 'allowed'
        && (!this.decisionAuthority
          || !this.decisionAuthority.validate(binding.request, settled.decision, now).ok)) {
        invalid++;
        continue;
      }
      const transition = this.store.applyApprovalDecision(binding.requestId, settled.state, settled.decision);
      if (transition?.changed) {
        decided++;
        changedMissionIds.add(transition.missionId);
      }
    }

    let parked = 0;
    for (const item of this.store.listApprovalCandidates()) {
      const mission = this.store.getMission(item.missionId);
      if (!mission) throw new Error(`MISSION_APPROVAL_INVALID: mission not found for item ${item.id}`);
      const id = approvalRequestIdForWorkItem(mission, item);
      let request: ApprovalRequest | null = null;
      let invalidReason = '';
      try {
        const draft = this.requestFactory(item, mission);
        const parsed = validateApprovalRequest({ ...draft, id });
        if (!parsed.ok) invalidReason = parsed.errors.join('; ');
        else if (parsed.value.policy !== 'require-approval') invalidReason = 'request policy must be require-approval';
        else if (parsed.value.defaultAction === 'allow') invalidReason = 'defaultAction allow is not fail-closed';
        else request = parsed.value;
      } catch (error) {
        invalidReason = error instanceof Error ? error.message : String(error);
      }
      if (!request) {
        if (this.store.parkInvalidApprovalCandidate(item.id, invalidReason || 'request factory returned no authority')) {
          invalid++;
        }
        continue;
      }
      const binding = this.store.parkItemForApproval(item.id, request);
      if (binding) parked++;
    }

    let published = 0;
    for (const binding of this.store.listApprovalBindings()) {
      if (binding.publishState !== 'outbox') continue;
      let durable = requestMap(snapshot).get(binding.requestId)?.request;
      if (durable && canonical(durable) !== canonical(binding.request)) {
        throw new Error(`MISSION_APPROVAL_REQUEST_CONFLICT: ${binding.requestId}`);
      }
      if (!durable) {
        try {
          durable = this.publisher.submit(binding.request);
        } catch (error) {
          snapshot = this.decisions.index(now);
          durable = requestMap(snapshot).get(binding.requestId)?.request;
          if (!durable || canonical(durable) !== canonical(binding.request)) throw error;
        }
      }
      if (canonical(durable) !== canonical(binding.request)) {
        throw new Error(`MISSION_APPROVAL_REQUEST_CONFLICT: ${binding.requestId}`);
      }
      this.store.markApprovalPublished(binding.requestId);
      published++;
      snapshot = this.decisions.index(now);
      indexedRequests = requestMap(snapshot);
    }

    return { parked, published, decided, invalid, changedMissionIds: [...changedMissionIds] };
  }
}
