import { createHash } from 'node:crypto';

import type {
  MissionDispatchClaim,
  NewWorkItem,
  ResultLike,
  WorkItem,
  WorkItemKind,
} from './mission-types.js';

export const CANONICAL_WORK_ITEM_KINDS = [
  'task',
  'sprint',
  'capability',
  'process',
] as const satisfies readonly WorkItemKind[];

const CANONICAL_KIND_SET: ReadonlySet<string> = new Set(CANONICAL_WORK_ITEM_KINDS);

export const MISSION_RUNNER_REGISTRY_SCHEMA_VERSION = 1 as const;

export interface MissionRunnerRegistryEntryV1 {
  kind: WorkItemKind;
  runnerContract: string;
  runnerRevision: string;
}

/** Immutable descriptor shared by intake, persistence, claim and dispatch. */
export interface MissionRunnerRegistryV1 {
  schemaVersion: typeof MISSION_RUNNER_REGISTRY_SCHEMA_VERSION;
  registryRevision: string;
  registryDigest: string;
  runners: readonly MissionRunnerRegistryEntryV1[];
}

/** Compatibility name retained for callers while the boolean authority is retired. */
export type MissionRuntimeAdmission = MissionRunnerRegistryV1;

export interface WorkItemAdmissionFenceV1 {
  schemaVersion: 1;
  registryRevision: string;
  registryDigest: string;
  kind: WorkItemKind;
  runnerRevision: string;
  itemDefinitionDigest: string;
}

export type MissionRuntimeRunner = (item: WorkItem, claim: MissionDispatchClaim) => Promise<ResultLike>;
export type MissionDispatchClaimVerifier = (claim: MissionDispatchClaim) => boolean;

export interface BoundMissionRunnerRegistryV1 {
  descriptor: MissionRunnerRegistryV1;
  dispatch: MissionRuntimeRunner;
}

type AdmissionItem = {
  id: string;
  kind: WorkItemKind;
  spec?: Record<string, unknown> | null;
};

type DefinitionItem = AdmissionItem & {
  missionId: string;
  policy?: NewWorkItem['policy'];
  renderAs?: NewWorkItem['renderAs'];
  dependsOn?: readonly string[];
  trigger?: Record<string, unknown> | null;
};

export type MissionAdmissionCode =
  | 'UNKNOWN_KIND'
  | 'TASK_DESCRIPTION_REQUIRED'
  | 'TASK_RUNNER_UNWIRED'
  | 'SPRINT_SNAPSHOT_REQUIRED'
  | 'SPRINT_SNAPSHOT_INVALID'
  | 'SPRINT_SNAPSHOT_DIGEST_MISMATCH'
  | 'SPRINT_SNAPSHOT_RUNNER_UNWIRED'
  | 'CAPABILITY_TARGET_REQUIRED'
  | 'CAPABILITY_BROKER_UNWIRED'
  | 'PROCESS_DEFINITION_REQUIRED'
  | 'PROCESS_RUNNER_UNWIRED';

export class MissionAdmissionError extends Error {
  readonly code: MissionAdmissionCode;
  readonly itemId: string;
  readonly kind: string;

  constructor(code: MissionAdmissionCode, itemId: string, kind: string) {
    super(`MISSION_ADMISSION_REJECTED: ${itemId} (${kind}) ${code}`);
    this.name = 'MissionAdmissionError';
    this.code = code;
    this.itemId = itemId;
    this.kind = kind;
  }
}

export interface SprintExecutionSnapshot {
  version: 1;
  revision: string;
  approvalEvidenceRef: string;
  directives: string;
  executionPlan: Record<string, unknown>;
  digest: string;
}

type SnapshotPayload = Omit<SprintExecutionSnapshot, 'digest'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function canonicalJson(value: unknown): string {
  const normalize = (nested: unknown): unknown => {
    if (Array.isArray(nested)) return nested.map(normalize);
    if (isRecord(nested)) {
      return Object.fromEntries(Object.entries(nested)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, normalize(child)]));
    }
    return nested ?? null;
  };
  return JSON.stringify(normalize(value));
}

function nonEmptyCanonicalString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value === value.trim();
}

function registryPayload(registry: Omit<MissionRunnerRegistryV1, 'registryDigest'>): unknown {
  return {
    schemaVersion: registry.schemaVersion,
    registryRevision: registry.registryRevision,
    runners: registry.runners,
  };
}

function computeRegistryDigest(registry: Omit<MissionRunnerRegistryV1, 'registryDigest'>): string {
  return createHash('sha256').update(canonicalJson(registryPayload(registry))).digest('hex');
}

export function createMissionRunnerRegistry(input: {
  registryRevision: string;
  runners: readonly MissionRunnerRegistryEntryV1[];
}): MissionRunnerRegistryV1 {
  if (!nonEmptyCanonicalString(input.registryRevision)) {
    throw new TypeError('MISSION_RUNNER_REGISTRY_INVALID: registryRevision');
  }
  const seen = new Set<WorkItemKind>();
  const runners = input.runners.map((entry) => {
    if (!isCanonicalWorkItemKind(entry.kind)
      || !nonEmptyCanonicalString(entry.runnerContract)
      || !nonEmptyCanonicalString(entry.runnerRevision)
      || seen.has(entry.kind)) {
      throw new TypeError(`MISSION_RUNNER_REGISTRY_INVALID: runner ${String(entry.kind)}`);
    }
    seen.add(entry.kind);
    return Object.freeze({ ...entry });
  }).sort((left, right) => (
    CANONICAL_WORK_ITEM_KINDS.indexOf(left.kind) - CANONICAL_WORK_ITEM_KINDS.indexOf(right.kind)
  ));
  const payload = {
    schemaVersion: MISSION_RUNNER_REGISTRY_SCHEMA_VERSION,
    registryRevision: input.registryRevision,
    runners,
  } as const;
  return Object.freeze({
    ...payload,
    runners: Object.freeze(runners),
    registryDigest: computeRegistryDigest(payload),
  });
}

export function assertMissionRunnerRegistry(registry: MissionRunnerRegistryV1): void {
  if (registry.schemaVersion !== MISSION_RUNNER_REGISTRY_SCHEMA_VERSION
    || !nonEmptyCanonicalString(registry.registryRevision)
    || registry.registryDigest !== computeRegistryDigest(registry)) {
    throw new TypeError('MISSION_RUNNER_REGISTRY_INVALID: descriptor integrity');
  }
  const canonical = createMissionRunnerRegistry({
    registryRevision: registry.registryRevision,
    runners: registry.runners,
  });
  if (canonical.registryDigest !== registry.registryDigest
    || canonicalJson(canonical.runners) !== canonicalJson(registry.runners)) {
    throw new TypeError('MISSION_RUNNER_REGISTRY_INVALID: non-canonical descriptor');
  }
}

/** Production Goal-v2 truth today: only task dispatch has a faithful live runner. */
export const PRODUCTION_V2_RUNNER_REGISTRY = createMissionRunnerRegistry({
  registryRevision: 'goal-v2-production-v2',
  runners: [{
    kind: 'task',
    runnerContract: 'mission-task-host-authority-v2',
    runnerRevision: 'task-mode-runner-v2',
  }],
});

/** @deprecated Use PRODUCTION_V2_RUNNER_REGISTRY; this is the same immutable object. */
export const PRODUCTION_V2_ADMISSION = PRODUCTION_V2_RUNNER_REGISTRY;

export function listRuntimeAdmittedKinds(registry: MissionRunnerRegistryV1): WorkItemKind[] {
  assertMissionRunnerRegistry(registry);
  return registry.runners.map((entry) => entry.kind);
}

function runnerForKind(
  registry: MissionRunnerRegistryV1,
  kind: WorkItemKind,
): MissionRunnerRegistryEntryV1 | undefined {
  return registry.runners.find((entry) => entry.kind === kind);
}

export function computeSprintSnapshotDigest(snapshot: SnapshotPayload): string {
  return createHash('sha256').update(canonicalJson(snapshot)).digest('hex');
}

function computeRawSnapshotDigest(snapshot: Record<string, unknown>): string {
  const payload = Object.fromEntries(Object.entries(snapshot).filter(([key]) => key !== 'digest'));
  return createHash('sha256').update(canonicalJson(payload)).digest('hex');
}

export function assertCanonicalWorkItemKind(kind: unknown, itemId: string): asserts kind is WorkItemKind {
  if (!isCanonicalWorkItemKind(kind)) {
    throw new MissionAdmissionError('UNKNOWN_KIND', itemId, String(kind));
  }
}

/** Runtime predicate shared by intake and persisted-row recovery/claim gates. */
export function isCanonicalWorkItemKind(kind: unknown): kind is WorkItemKind {
  return typeof kind === 'string' && CANONICAL_KIND_SET.has(kind);
}

function assertTask(item: AdmissionItem, admission: MissionRuntimeAdmission): void {
  if (!nonEmptyString(item.spec?.['description'])) {
    throw new MissionAdmissionError('TASK_DESCRIPTION_REQUIRED', item.id, item.kind);
  }
  if (!runnerForKind(admission, 'task')) {
    throw new MissionAdmissionError('TASK_RUNNER_UNWIRED', item.id, item.kind);
  }
}

function assertSprint(item: AdmissionItem, admission: MissionRuntimeAdmission): void {
  const raw = item.spec?.['sprintSnapshot'];
  if (!isRecord(raw)) {
    throw new MissionAdmissionError('SPRINT_SNAPSHOT_REQUIRED', item.id, item.kind);
  }
  if (
    raw['version'] !== 1
    || !nonEmptyString(raw['revision'])
    || !nonEmptyString(raw['approvalEvidenceRef'])
    || !nonEmptyString(raw['directives'])
    || !isRecord(raw['executionPlan'])
    || !nonEmptyString(raw['digest'])
  ) {
    throw new MissionAdmissionError('SPRINT_SNAPSHOT_INVALID', item.id, item.kind);
  }
  if (raw['digest'] !== computeRawSnapshotDigest(raw)) {
    throw new MissionAdmissionError('SPRINT_SNAPSHOT_DIGEST_MISMATCH', item.id, item.kind);
  }
  if (!runnerForKind(admission, 'sprint')) {
    throw new MissionAdmissionError('SPRINT_SNAPSHOT_RUNNER_UNWIRED', item.id, item.kind);
  }
}

function assertCapability(item: AdmissionItem, admission: MissionRuntimeAdmission): void {
  const target = item.spec?.['capabilityTarget'];
  if (!isRecord(target) || !nonEmptyString(target['capability'])) {
    throw new MissionAdmissionError('CAPABILITY_TARGET_REQUIRED', item.id, item.kind);
  }
  if (!runnerForKind(admission, 'capability')) {
    throw new MissionAdmissionError('CAPABILITY_BROKER_UNWIRED', item.id, item.kind);
  }
}

function assertProcess(item: AdmissionItem, admission: MissionRuntimeAdmission): void {
  const definition = item.spec?.['processDefinition'];
  if (!isRecord(definition) || !nonEmptyString(definition['revision']) || !Array.isArray(definition['steps']) || definition['steps'].length === 0) {
    throw new MissionAdmissionError('PROCESS_DEFINITION_REQUIRED', item.id, item.kind);
  }
  if (!runnerForKind(admission, 'process')) {
    throw new MissionAdmissionError('PROCESS_RUNNER_UNWIRED', item.id, item.kind);
  }
}

/** Validate a complete executable batch before any MissionStore mutation. */
export function assertWorkItemBatchAdmitted(
  items: readonly AdmissionItem[],
  admission: MissionRuntimeAdmission,
): void {
  assertMissionRunnerRegistry(admission);
  for (const item of items) {
    assertCanonicalWorkItemKind(item.kind, item.id);
    if (item.kind === 'task') assertTask(item, admission);
    else if (item.kind === 'sprint') assertSprint(item, admission);
    else if (item.kind === 'capability') assertCapability(item, admission);
    else assertProcess(item, admission);
  }
}

function defaultRenderAs(kind: WorkItemKind): WorkItem['renderAs'] {
  return kind === 'sprint' ? 'sprint' : kind === 'process' ? 'workflow' : kind === 'capability' ? 'action' : 'task';
}

export function computeWorkItemDefinitionDigest(
  item: DefinitionItem,
): string {
  return createHash('sha256').update(canonicalJson({
    id: item.id,
    missionId: item.missionId,
    kind: item.kind,
    spec: item.spec ?? null,
    policy: item.policy ?? 'auto',
    renderAs: item.renderAs ?? defaultRenderAs(item.kind),
    dependsOn: [...(item.dependsOn ?? [])].sort(),
    trigger: item.trigger ?? null,
  })).digest('hex');
}

export function buildWorkItemAdmissionFence(
  item: DefinitionItem,
  registry: MissionRunnerRegistryV1,
): WorkItemAdmissionFenceV1 {
  assertWorkItemBatchAdmitted([item], registry);
  const runner = runnerForKind(registry, item.kind)!;
  return Object.freeze({
    schemaVersion: 1,
    registryRevision: registry.registryRevision,
    registryDigest: registry.registryDigest,
    kind: item.kind,
    runnerRevision: runner.runnerRevision,
    itemDefinitionDigest: computeWorkItemDefinitionDigest(item),
  });
}

export function admitWorkItemBatch<T extends NewWorkItem>(
  items: readonly T[],
  registry: MissionRunnerRegistryV1,
): Array<T & { admissionFence: WorkItemAdmissionFenceV1 }> {
  assertWorkItemBatchAdmitted(items, registry);
  return items.map((item) => ({
    ...item,
    admissionFence: buildWorkItemAdmissionFence(item, registry),
  }));
}

export type WorkItemAdmissionFailureCode =
  | 'ADMISSION_FENCE_MISSING'
  | 'ADMISSION_FENCE_INVALID'
  | 'RUNTIME_REGISTRY_MISMATCH'
  | 'RUNTIME_RUNNER_UNAVAILABLE'
  | 'WORK_ITEM_DEFINITION_MISMATCH'
  | MissionAdmissionCode;

export type WorkItemAdmissionValidation =
  | { ok: true }
  | {
    ok: false;
    code: WorkItemAdmissionFailureCode;
    disposition: 'failed' | 'parked';
    reason: string;
  };

function isFence(value: unknown): value is WorkItemAdmissionFenceV1 {
  if (!isRecord(value)) return false;
  return value['schemaVersion'] === 1
    && nonEmptyCanonicalString(value['registryRevision'])
    && nonEmptyCanonicalString(value['registryDigest'])
    && isCanonicalWorkItemKind(value['kind'])
    && nonEmptyCanonicalString(value['runnerRevision'])
    && nonEmptyCanonicalString(value['itemDefinitionDigest']);
}

export function validateWorkItemAdmission(
  item: Pick<WorkItem, 'id' | 'missionId' | 'kind' | 'spec' | 'policy' | 'renderAs' | 'dependsOn' | 'trigger'>,
  fence: WorkItemAdmissionFenceV1 | null,
  registry: MissionRunnerRegistryV1,
): WorkItemAdmissionValidation {
  assertMissionRunnerRegistry(registry);
  if (!fence) {
    return { ok: false, code: 'ADMISSION_FENCE_MISSING', disposition: 'parked', reason: 'work item has no durable admission fence' };
  }
  if (!isFence(fence)) {
    return { ok: false, code: 'ADMISSION_FENCE_INVALID', disposition: 'failed', reason: 'durable admission fence is malformed' };
  }
  const runner = isCanonicalWorkItemKind(item.kind) ? runnerForKind(registry, item.kind) : undefined;
  if (!runner) {
    return { ok: false, code: 'RUNTIME_RUNNER_UNAVAILABLE', disposition: 'parked', reason: `no runner is admitted for ${String(item.kind)}` };
  }
  if (fence.registryRevision !== registry.registryRevision || fence.registryDigest !== registry.registryDigest) {
    return { ok: false, code: 'RUNTIME_REGISTRY_MISMATCH', disposition: 'parked', reason: 'admission fence belongs to a different runtime registry' };
  }
  if (fence.kind !== item.kind || fence.runnerRevision !== runner.runnerRevision) {
    return { ok: false, code: 'ADMISSION_FENCE_INVALID', disposition: 'failed', reason: 'admission fence runner identity does not match the work item' };
  }
  if (fence.itemDefinitionDigest !== computeWorkItemDefinitionDigest(item)) {
    return { ok: false, code: 'WORK_ITEM_DEFINITION_MISMATCH', disposition: 'failed', reason: 'work item definition changed after admission' };
  }
  try {
    assertWorkItemBatchAdmitted([item], registry);
  } catch (error) {
    if (error instanceof MissionAdmissionError) {
      const parked = error.code.endsWith('_UNWIRED');
      return { ok: false, code: error.code, disposition: parked ? 'parked' : 'failed', reason: error.message };
    }
    throw error;
  }
  return { ok: true };
}

function isCanonicalIsoTimestamp(value: string): boolean {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function validateDispatchClaim(
  item: WorkItem,
  claim: MissionDispatchClaim,
  descriptor: MissionRunnerRegistryV1,
): string | null {
  if (!Object.isFrozen(claim)) return 'AUTHORITY_MUTABLE';
  if (claim.schemaVersion !== 1) return 'SCHEMA_VERSION_MISMATCH';
  if (claim.workItemId !== item.id || claim.missionId !== item.missionId) return 'ITEM_IDENTITY_MISMATCH';
  if (item.status !== 'pending') return 'PRE_CLAIM_STATE_MISMATCH';
  if (claim.itemRevision !== item.revision + 1) return 'ITEM_REVISION_MISMATCH';
  if (!nonEmptyCanonicalString(claim.claimedBy)) return 'CLAIMED_BY_INVALID';
  if (!isCanonicalIsoTimestamp(claim.claimedAt)) return 'CLAIMED_AT_INVALID';
  if (!nonEmptyCanonicalString(claim.attemptId)) return 'ATTEMPT_ID_INVALID';
  if (!nonEmptyCanonicalString(claim.fenceToken)) return 'FENCE_TOKEN_INVALID';
  if (!/^[a-f0-9]{64}$/.test(claim.fenceTokenHash)
    || createHash('sha256').update(claim.fenceToken).digest('hex') !== claim.fenceTokenHash) {
    return 'FENCE_TOKEN_HASH_MISMATCH';
  }
  if (claim.claimRegistryRevision !== descriptor.registryRevision
    || claim.claimRegistryDigest !== descriptor.registryDigest) {
    return 'CLAIM_REGISTRY_MISMATCH';
  }
  const admission = validateWorkItemAdmission(item, item.admissionFence, descriptor);
  if (!admission.ok) return `ADMISSION_${admission.code}`;
  return null;
}

export function bindMissionRunnerRegistry(
  descriptor: MissionRunnerRegistryV1,
  handlers: Partial<Record<WorkItemKind, MissionRuntimeRunner>>,
  verifyClaim: MissionDispatchClaimVerifier,
): BoundMissionRunnerRegistryV1 {
  assertMissionRunnerRegistry(descriptor);
  const expected = listRuntimeAdmittedKinds(descriptor);
  const supplied = Object.keys(handlers);
  if (supplied.some((kind) => !isCanonicalWorkItemKind(kind))
    || supplied.length !== expected.length
    || expected.some((kind) => typeof handlers[kind] !== 'function')) {
    throw new TypeError('MISSION_RUNNER_BINDING_MISMATCH');
  }
  return Object.freeze({
    descriptor,
    dispatch: async (item: WorkItem, claim: MissionDispatchClaim): Promise<ResultLike> => {
      const claimFailure = validateDispatchClaim(item, claim, descriptor);
      if (claimFailure) {
        return {
          ok: false,
          dispatchDisposition: 'parked',
          reason: `MISSION_DISPATCH_CLAIM_INVALID: ${claimFailure}`,
        };
      }
      if (!verifyClaim(claim)) {
        return {
          ok: false,
          dispatchDisposition: 'parked',
          reason: 'MISSION_DISPATCH_CLAIM_INVALID: PERSISTED_AUTHORITY_MISMATCH',
        };
      }
      const handler = handlers[item.kind];
      if (!handler) return { ok: false, reason: `MISSION_RUNNER_BINDING_MISSING: ${item.kind}` };
      return await handler(item, claim);
    },
  });
}
