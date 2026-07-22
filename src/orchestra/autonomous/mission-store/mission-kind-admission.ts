import { createHash } from 'node:crypto';

import type { NewWorkItem, WorkItemKind } from './mission-types.js';

export const CANONICAL_WORK_ITEM_KINDS = [
  'task',
  'sprint',
  'capability',
  'process',
] as const satisfies readonly WorkItemKind[];

const CANONICAL_KIND_SET: ReadonlySet<string> = new Set(CANONICAL_WORK_ITEM_KINDS);

export interface MissionRuntimeAdmission {
  taskRunner: boolean;
  sprintSnapshotRunner: boolean;
  capabilityBroker: boolean;
  processRunner: boolean;
}

/** Production Goal-v2 truth today: only task dispatch has a faithful live runner. */
export const PRODUCTION_V2_ADMISSION: Readonly<MissionRuntimeAdmission> = Object.freeze({
  taskRunner: true,
  sprintSnapshotRunner: false,
  capabilityBroker: false,
  processRunner: false,
});

export function listRuntimeAdmittedKinds(admission: MissionRuntimeAdmission): WorkItemKind[] {
  return CANONICAL_WORK_ITEM_KINDS.filter((kind) => (
    (kind === 'task' && admission.taskRunner)
    || (kind === 'sprint' && admission.sprintSnapshotRunner)
    || (kind === 'capability' && admission.capabilityBroker)
    || (kind === 'process' && admission.processRunner)
  ));
}

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

export function computeSprintSnapshotDigest(snapshot: SnapshotPayload): string {
  return createHash('sha256').update(canonicalJson(snapshot)).digest('hex');
}

function computeRawSnapshotDigest(snapshot: Record<string, unknown>): string {
  const payload = Object.fromEntries(Object.entries(snapshot).filter(([key]) => key !== 'digest'));
  return createHash('sha256').update(canonicalJson(payload)).digest('hex');
}

export function assertCanonicalWorkItemKind(kind: unknown, itemId: string): asserts kind is WorkItemKind {
  if (typeof kind !== 'string' || !CANONICAL_KIND_SET.has(kind)) {
    throw new MissionAdmissionError('UNKNOWN_KIND', itemId, String(kind));
  }
}

function assertTask(item: Pick<NewWorkItem, 'id' | 'kind' | 'spec'>, admission: MissionRuntimeAdmission): void {
  if (!nonEmptyString(item.spec?.['description'])) {
    throw new MissionAdmissionError('TASK_DESCRIPTION_REQUIRED', item.id, item.kind);
  }
  if (!admission.taskRunner) {
    throw new MissionAdmissionError('TASK_RUNNER_UNWIRED', item.id, item.kind);
  }
}

function assertSprint(item: Pick<NewWorkItem, 'id' | 'kind' | 'spec'>, admission: MissionRuntimeAdmission): void {
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
  if (!admission.sprintSnapshotRunner) {
    throw new MissionAdmissionError('SPRINT_SNAPSHOT_RUNNER_UNWIRED', item.id, item.kind);
  }
}

function assertCapability(item: Pick<NewWorkItem, 'id' | 'kind' | 'spec'>, admission: MissionRuntimeAdmission): void {
  const target = item.spec?.['capabilityTarget'];
  if (!isRecord(target) || !nonEmptyString(target['capability'])) {
    throw new MissionAdmissionError('CAPABILITY_TARGET_REQUIRED', item.id, item.kind);
  }
  if (!admission.capabilityBroker) {
    throw new MissionAdmissionError('CAPABILITY_BROKER_UNWIRED', item.id, item.kind);
  }
}

function assertProcess(item: Pick<NewWorkItem, 'id' | 'kind' | 'spec'>, admission: MissionRuntimeAdmission): void {
  const definition = item.spec?.['processDefinition'];
  if (!isRecord(definition) || !nonEmptyString(definition['revision']) || !Array.isArray(definition['steps']) || definition['steps'].length === 0) {
    throw new MissionAdmissionError('PROCESS_DEFINITION_REQUIRED', item.id, item.kind);
  }
  if (!admission.processRunner) {
    throw new MissionAdmissionError('PROCESS_RUNNER_UNWIRED', item.id, item.kind);
  }
}

/** Validate a complete executable batch before any MissionStore mutation. */
export function assertWorkItemBatchAdmitted(
  items: readonly Pick<NewWorkItem, 'id' | 'kind' | 'spec'>[],
  admission: MissionRuntimeAdmission,
): void {
  for (const item of items) {
    assertCanonicalWorkItemKind(item.kind, item.id);
    if (item.kind === 'task') assertTask(item, admission);
    else if (item.kind === 'sprint') assertSprint(item, admission);
    else if (item.kind === 'capability') assertCapability(item, admission);
    else assertProcess(item, admission);
  }
}
