// ═══ run-flow-coordinator-harness — TERM-FLOW-UNIFY Sprint-4 dilim
// (439-003) ═══════════════════════════════════════════════════════════════
//
// Shared hermetic test-support infra for the upcoming RunFlow *coordinator*
// test family. This is NOT a vitest spec (no describe/it here) and has ZERO
// dependency on the coordinator implementation (a parallel task) — only on
// the already-shipped `core/run-flow-store.ts` + `core/run-flow-contract.ts`
// exports, so it runs fully in parallel with that implementation task.
//
// Four building blocks:
//  1. Per-test isolated tmpdir lifecycle — ASYNC `node:fs/promises`
//     mkdtemp/rm (no spawnSync anywhere in this file — CUSTOM Test
//     Hermeticity rule).
//  2. Legacy-fixture builders — produce REAL on-disk legacy records by
//     calling the store's own `saveApprovedSnapshot`/`saveRunHandle`, never
//     by hand-serializing the JSONL shape (that would drift the moment the
//     store's on-disk format changes — see run-flow-store.ts's own doc
//     comment on `StoredApprovedSnapshot`/`StoredRunHandleRecord`). "Legacy"
//     here means the pre-existing snapshot/handle stores, as distinct from
//     the newer unified per-flow `events.jsonl` log below.
//  3. Event-log fixture builder — a generic single-event builder (mirrors
//     tests/orchestra/run-flow-reducer.test.ts's `ev()` helper) plus a
//     parametric proposal→preview→approval→start→completion chain, appended
//     one event at a time through `appendFlowEvent` so sequence numbers
//     always come from the store, never hand-assigned.
//  4. flowId/commandId generators for two-flow scenarios.
//
// Consumers: `import { ... } from './run-flow-coordinator-harness.js'`.

import { mkdtemp, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  saveApprovedSnapshot,
  saveRunHandle,
  appendFlowEvent,
  type StoredApprovedSnapshot,
  type StoredRunHandleRecord,
} from '../../src/core/run-flow-store.js';
import {
  RUN_FLOW_EVENT_SCHEMA_VERSION,
  type RunFlowEvent,
  type RunProposal,
  type PlanPreview,
  type RunHandle,
  type RunFlowTaskSummary,
  type RunFlowPolicyDecision,
  type RunFlowGateResult,
} from '../../src/core/run-flow-contract.js';
import type { Sprint } from '../../src/core/types.js';
import { SprintPhase, SprintStatus } from '../../src/core/sprint-types.js';
import type { ActorContext, RequestOrigin } from '../../src/core/work-model.js';

// ─── 1. Per-test isolated tmpdir lifecycle ─────────────────────────────────

/**
 * Creates a fresh, isolated project root under `os.tmpdir()` for ONE test.
 * ASYNC (`node:fs/promises` mkdtemp) — pair with {@link cleanupHarnessRoot}
 * in `afterEach`. Two calls never share a directory (each gets its own
 * random suffix), so parallel tests/files never collide.
 */
export async function createHarnessRoot(prefix = 'run-flow-coordinator-test-'): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

/**
 * Recursively removes a root created by {@link createHarnessRoot}. Safe to
 * call even if the directory was already removed (`force: true`) — a test
 * that errors mid-run must still leave zero artifacts behind.
 */
export async function cleanupHarnessRoot(root: string): Promise<void> {
  await rm(root, { recursive: true, force: true });
}

// ─── Fixture defaults ───────────────────────────────────────────────────
//
// RunProposal metadata pinned by the task spec — the canonical default
// identity every fixture in this harness falls back to when a caller does
// not override it.

export const DEFAULT_FLOW_ID = 'f3aa7858-9e26-4783-b6c9-7a1181fc39d7';
export const DEFAULT_REVISION = 1;
export const DEFAULT_TENANT = 'local';
export const DEFAULT_PROJECT = 'deckent-dev';
export const DEFAULT_ACTOR: ActorContext = { id: 'native-agent' };
export const DEFAULT_ORIGIN: RequestOrigin = 'cli';
export const DEFAULT_PLAN_DIGEST = 'digest-harness';

function makeSprint(id = 'sprint-harness'): Sprint {
  return {
    id,
    number: 1,
    status: SprintStatus.PLANNING,
    phase: SprintPhase.PLAN,
    tasks: [],
    workers: [],
  };
}

// ─── 2. Legacy-fixture builders (real on-disk records via the store) ──────

/** Options for {@link createLegacyApprovedSnapshotFixture} — every field
 *  optional, defaulting to the harness-wide fixture identity. */
export interface LegacyApprovedSnapshotFixtureOptions {
  readonly root: string;
  readonly flowId?: string;
  readonly revision?: number;
  readonly planDigest?: string;
  readonly approvedBy?: ActorContext;
  readonly approvedAt?: string;
  readonly sprint?: Sprint;
}

/**
 * Builds a `StoredApprovedSnapshot` and persists it via the REAL
 * `saveApprovedSnapshot` store function (never hand-serialized) — returns
 * the exact record now on disk under `opts.root`.
 */
export function createLegacyApprovedSnapshotFixture(
  opts: LegacyApprovedSnapshotFixtureOptions,
): StoredApprovedSnapshot {
  const snapshot: StoredApprovedSnapshot = {
    flowId: opts.flowId ?? DEFAULT_FLOW_ID,
    revision: opts.revision ?? DEFAULT_REVISION,
    planDigest: opts.planDigest ?? DEFAULT_PLAN_DIGEST,
    approvedBy: opts.approvedBy ?? DEFAULT_ACTOR,
    approvedAt: opts.approvedAt ?? '2026-07-12T00:00:00.000Z',
    sprint: opts.sprint ?? makeSprint(),
  };
  saveApprovedSnapshot(opts.root, snapshot);
  return snapshot;
}

/** Options for {@link createLegacyRunHandleFixture} — every field optional,
 *  defaulting to the harness-wide fixture identity. */
export interface LegacyRunHandleFixtureOptions {
  readonly root: string;
  readonly flowId?: string;
  readonly revision?: number;
  readonly planDigest?: string;
  readonly handle?: RunHandle;
  readonly startedAt?: string;
}

/**
 * Builds a `StoredRunHandleRecord` and persists it via the REAL
 * `saveRunHandle` store function (never hand-serialized) — returns the
 * exact record now on disk under `opts.root`.
 */
export function createLegacyRunHandleFixture(opts: LegacyRunHandleFixtureOptions): StoredRunHandleRecord {
  const flowId = opts.flowId ?? DEFAULT_FLOW_ID;
  const record: StoredRunHandleRecord = {
    flowId,
    revision: opts.revision ?? DEFAULT_REVISION,
    planDigest: opts.planDigest ?? DEFAULT_PLAN_DIGEST,
    handle: opts.handle ?? { flowId, jobId: 'job-harness', logRef: 'log-harness' },
    startedAt: opts.startedAt ?? '2026-07-12T00:01:00.000Z',
  };
  saveRunHandle(opts.root, record);
  return record;
}

// ─── 3. Event-log fixture builder ──────────────────────────────────────────

/** Plain `Omit` collapses `RunFlowEvent`'s discriminated union to its
 *  common-key intersection (losing each variant's own payload field) — this
 *  distributes per-member instead. Mirrors run-flow-reducer.test.ts's own
 *  `DistributiveOmit`. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/**
 * Generic single-event builder — fills in `schemaVersion`/`flowId`/
 * `timestamp`/`commandId`, leaving the event-specific payload to `partial`.
 * Does NOT assign `sequence` — that is the store's job (`appendFlowEvent`).
 */
export function buildFlowEvent(
  flowId: string,
  timestamp: string,
  commandId: string | undefined,
  partial: DistributiveOmit<RunFlowEvent, 'schemaVersion' | 'flowId' | 'timestamp' | 'commandId'>,
): RunFlowEvent {
  return {
    schemaVersion: RUN_FLOW_EVENT_SCHEMA_VERSION,
    flowId,
    timestamp,
    ...(commandId !== undefined ? { commandId } : {}),
    ...partial,
  } as RunFlowEvent;
}

/** Options for {@link makeRunProposal} — every field optional, defaulting to
 *  the harness-wide fixture identity (task-pinned metadata). */
export interface RunProposalFixtureOptions {
  readonly flowId?: string;
  readonly revision?: number;
  readonly tenant?: string;
  readonly project?: string;
  readonly actor?: ActorContext;
  readonly origin?: RequestOrigin;
  readonly intentSummary?: string;
}

export function makeRunProposal(opts: RunProposalFixtureOptions = {}): RunProposal {
  return {
    flowId: opts.flowId ?? DEFAULT_FLOW_ID,
    tenant: opts.tenant ?? DEFAULT_TENANT,
    project: opts.project ?? DEFAULT_PROJECT,
    actor: opts.actor ?? DEFAULT_ACTOR,
    origin: opts.origin ?? DEFAULT_ORIGIN,
    revision: opts.revision ?? DEFAULT_REVISION,
    intentSummary: opts.intentSummary ?? 'Harness fixture proposal.',
  };
}

/** Options for {@link makePlanPreview} — every field optional, defaulting to
 *  the harness-wide fixture identity. */
export interface PlanPreviewFixtureOptions {
  readonly flowId?: string;
  readonly revision?: number;
  readonly planDigest?: string;
  readonly taskSummaries?: readonly RunFlowTaskSummary[];
  readonly policyDecision?: RunFlowPolicyDecision;
  readonly gateResult?: RunFlowGateResult;
  readonly estimatedCostUsd?: number;
  readonly gateFindings?: readonly string[];
}

export function makePlanPreview(opts: PlanPreviewFixtureOptions = {}): PlanPreview {
  return {
    flowId: opts.flowId ?? DEFAULT_FLOW_ID,
    revision: opts.revision ?? DEFAULT_REVISION,
    planDigest: opts.planDigest ?? DEFAULT_PLAN_DIGEST,
    taskSummaries: opts.taskSummaries ?? [{ title: 'Harness Task', summary: 'Fixture task summary.' }],
    policyDecision: opts.policyDecision ?? 'allow',
    gateResult: opts.gateResult ?? 'pass',
    ...(opts.estimatedCostUsd !== undefined ? { estimatedCostUsd: opts.estimatedCostUsd } : {}),
    ...(opts.gateFindings !== undefined ? { gateFindings: opts.gateFindings } : {}),
  };
}

/** The linear happy-path stages {@link appendProposalToCompletionChain}
 *  can append, in order. Deliberately narrower than the full
 *  `RunFlowEventType` union — branch events (`APPROVAL_REJECTED`,
 *  `RUN_FAILED`, `FLOW_ABORTED`) are not part of a straight-line chain;
 *  build those ad-hoc with {@link buildFlowEvent} + `appendFlowEvent`. */
export type RunFlowChainStage =
  | 'PROPOSAL_SUBMITTED'
  | 'PREVIEW_STARTED'
  | 'PREVIEW_READY'
  | 'APPROVAL_GRANTED'
  | 'START_REQUESTED'
  | 'RUN_STARTED'
  | 'RUN_COMPLETED';

const CHAIN_STAGE_ORDER: readonly RunFlowChainStage[] = [
  'PROPOSAL_SUBMITTED',
  'PREVIEW_STARTED',
  'PREVIEW_READY',
  'APPROVAL_GRANTED',
  'START_REQUESTED',
  'RUN_STARTED',
  'RUN_COMPLETED',
];

/** Options for {@link appendProposalToCompletionChain}. */
export interface FlowEventChainOptions {
  readonly root: string;
  readonly flowId?: string;
  readonly revision?: number;
  readonly planDigest?: string;
  readonly proposal?: RunProposalFixtureOptions;
  readonly preview?: PlanPreviewFixtureOptions;
  readonly approvedBy?: ActorContext;
  readonly handle?: RunHandle;
  readonly completionSummary?: string;
  /** Last stage to append (inclusive) — defaults to the full chain through
   *  `RUN_COMPLETED`. Use to build a partial flow (e.g. stop right after
   *  `APPROVAL_GRANTED` for an "awaiting start" scenario). */
  readonly through?: RunFlowChainStage;
  /** ISO-8601 timestamp for the first appended event; each subsequent stage
   *  advances by one second so events sort deterministically. */
  readonly startTimestamp?: string;
  /** When set, every appended event gets `commandId: "<prefix>-<stage>"` —
   *  useful for command-dedup/replay-cursor scenarios. */
  readonly commandIdPrefix?: string;
}

/** One appended event paired with its store-assigned sequence number. */
export interface AppendedFlowEvent {
  readonly event: RunFlowEvent;
  readonly sequence: number;
}

/** Result of {@link appendProposalToCompletionChain} — the fixture objects
 *  used to build each stage, plus every event actually appended (in order,
 *  each carrying its store-assigned sequence). */
export interface FlowEventChainResult {
  readonly flowId: string;
  readonly proposal: RunProposal;
  readonly preview: PlanPreview;
  readonly approvedBy: ActorContext;
  readonly handle: RunHandle;
  readonly appended: readonly AppendedFlowEvent[];
}

/**
 * Appends a parametric proposal→preview→approval→start→completion event
 * chain for one flow, one stage at a time, through the REAL `appendFlowEvent`
 * store function — sequence numbers always come from the store, never
 * hand-assigned. Stop early with `opts.through` for a partial-flow scenario.
 */
export function appendProposalToCompletionChain(opts: FlowEventChainOptions): FlowEventChainResult {
  const flowId = opts.flowId ?? DEFAULT_FLOW_ID;
  const revision = opts.revision ?? DEFAULT_REVISION;
  const planDigest = opts.planDigest ?? DEFAULT_PLAN_DIGEST;
  const proposal = makeRunProposal({ flowId, revision, ...opts.proposal });
  const preview = makePlanPreview({ flowId, revision, planDigest, ...opts.preview });
  const approvedBy = opts.approvedBy ?? { id: 'approver-harness' };
  const handle: RunHandle = opts.handle ?? { flowId, jobId: 'job-harness', logRef: 'log-harness' };
  const through = opts.through ?? 'RUN_COMPLETED';

  const baseTs = Date.parse(opts.startTimestamp ?? '2026-07-12T00:00:00.000Z');
  let tick = 0;
  const nextTimestamp = (): string => new Date(baseTs + tick++ * 1000).toISOString();
  const commandIdFor = (stage: RunFlowChainStage): string | undefined =>
    opts.commandIdPrefix === undefined ? undefined : `${opts.commandIdPrefix}-${stage}`;

  const stageEventBuilders: Record<RunFlowChainStage, () => RunFlowEvent> = {
    PROPOSAL_SUBMITTED: () =>
      buildFlowEvent(flowId, nextTimestamp(), commandIdFor('PROPOSAL_SUBMITTED'), {
        type: 'PROPOSAL_SUBMITTED',
        proposal,
      }),
    PREVIEW_STARTED: () =>
      buildFlowEvent(flowId, nextTimestamp(), commandIdFor('PREVIEW_STARTED'), {
        type: 'PREVIEW_STARTED',
        revision,
      }),
    PREVIEW_READY: () =>
      buildFlowEvent(flowId, nextTimestamp(), commandIdFor('PREVIEW_READY'), {
        type: 'PREVIEW_READY',
        preview,
      }),
    APPROVAL_GRANTED: () =>
      buildFlowEvent(flowId, nextTimestamp(), commandIdFor('APPROVAL_GRANTED'), {
        type: 'APPROVAL_GRANTED',
        revision,
        planDigest,
        approvedBy,
      }),
    START_REQUESTED: () =>
      buildFlowEvent(flowId, nextTimestamp(), commandIdFor('START_REQUESTED'), {
        type: 'START_REQUESTED',
        revision,
        planDigest,
      }),
    RUN_STARTED: () =>
      buildFlowEvent(flowId, nextTimestamp(), commandIdFor('RUN_STARTED'), {
        type: 'RUN_STARTED',
        handle,
      }),
    RUN_COMPLETED: () =>
      buildFlowEvent(flowId, nextTimestamp(), commandIdFor('RUN_COMPLETED'), {
        type: 'RUN_COMPLETED',
        ...(opts.completionSummary !== undefined ? { summary: opts.completionSummary } : {}),
      }),
  };

  const throughIndex = CHAIN_STAGE_ORDER.indexOf(through);
  const appended: AppendedFlowEvent[] = [];
  for (const stage of CHAIN_STAGE_ORDER.slice(0, throughIndex + 1)) {
    const event = stageEventBuilders[stage]();
    const sequence = appendFlowEvent(opts.root, flowId, event);
    appended.push({ event, sequence });
  }

  return { flowId, proposal, preview, approvedBy, handle, appended };
}

// ─── 4. flowId/commandId generators for two-flow scenarios ────────────────

/** Generates a readable, guaranteed-unique flowId (`<label>-<uuid>`). */
export function generateFlowId(label = 'flow'): string {
  return `${label}-${randomUUID()}`;
}

/** Generates a readable, guaranteed-unique commandId (`<label>-<uuid>`). */
export function generateCommandId(label = 'cmd'): string {
  return `${label}-${randomUUID()}`;
}

/**
 * Generates a pair of guaranteed-distinct flowIds for a two-flow coordinator
 * scenario (e.g. verifying per-flow isolation / independent sequence
 * counters) — labeled `flow-a`/`flow-b` by default for readable assertions.
 */
export function generateTwoFlowIds(labelA = 'flow-a', labelB = 'flow-b'): readonly [string, string] {
  return [generateFlowId(labelA), generateFlowId(labelB)];
}
