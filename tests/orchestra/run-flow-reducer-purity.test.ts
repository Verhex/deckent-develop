import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { reduceRunFlow } from '../../src/orchestra/run-flow-reducer.js';
import {
  createInitialRunFlowContext,
  RunFlowTransitionError,
  RUN_FLOW_EVENT_SCHEMA_VERSION,
  type RunFlowContext,
  type RunFlowEvent,
  type RunProposal,
  type PlanPreview,
  type RunHandle,
} from '../../src/core/run-flow-contract.js';
import type { ActorContext } from '../../src/core/work-model.js';

// 438-003 (dep: 438-001 added optional `commandId?: string` / `sequence?: number`
// to RunFlowEventBase, src/core/run-flow-contract.ts). This file is the
// regression-guard for the reducer's PURITY CONTRACT (see file header of
// run-flow-reducer.ts) against those two new fields specifically:
//   (a) commandId/sequence are inert pass-through data on every ORDINARY
//       (non-mismatch) transition — an event carrying them produces a
//       byte-identical resulting context to the field-less equivalent event.
//   (b) the reducer never PRODUCES or READS `sequence` anywhere — it is a
//       store-assigned field the reducer must stay blind to.
//   (c) the one place `commandId` is allowed to visibly affect output — the
//       CAS/state mismatch messages (blockedReason + thrown
//       RunFlowTransitionError.message) — echoes it back when present, and
//       is BYTE-IDENTICAL to the pre-existing (pre-438-001) format when absent.
// Independent of tests/orchestra/run-flow-reducer.test.ts — no import from,
// or modification of, that file (own fixtures, own describe blocks).

const FLOW_ID = 'flow-1';
const ACTOR: ActorContext = { id: 'actor-1', role: 'operator', tenantId: 'tenant-1' };
const APPROVER: ActorContext = { id: 'approver-1' };
const REVISION = 1;
const DIGEST = 'digest-abc';
const COMMAND_ID = 'cmd-purity-1';
const SEQUENCE = 42;

function proposal(overrides: Partial<RunProposal> = {}): RunProposal {
  return {
    flowId: FLOW_ID,
    tenant: 'tenant-1',
    project: 'project-1',
    actor: ACTOR,
    origin: 'chat',
    revision: REVISION,
    intentSummary: 'Do the thing.',
    ...overrides,
  };
}

function preview(overrides: Partial<PlanPreview> = {}): PlanPreview {
  return {
    flowId: FLOW_ID,
    revision: REVISION,
    planDigest: DIGEST,
    taskSummaries: [{ title: 'Task 1', summary: 'Does the thing.' }],
    policyDecision: 'allow',
    gateResult: 'pass',
    ...overrides,
  };
}

function handle(overrides: Partial<RunHandle> = {}): RunHandle {
  return { flowId: FLOW_ID, jobId: 'job-1', logRef: 'log-1', ...overrides };
}

let tick = 0;
/** Deterministic, monotonically-increasing ISO timestamp — reducer never calls Date.now() itself. */
function nextTimestamp(): string {
  return new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString();
}

/** Plain `Omit` collapses a discriminated union to its common-key intersection
 *  (losing each variant's own payload field) — this distributes per-member instead. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

function ev(
  partial: DistributiveOmit<RunFlowEvent, 'schemaVersion' | 'flowId' | 'timestamp'> & { flowId?: string; timestamp?: string },
): RunFlowEvent {
  return {
    schemaVersion: RUN_FLOW_EVENT_SCHEMA_VERSION,
    flowId: FLOW_ID,
    timestamp: nextTimestamp(),
    ...partial,
  } as RunFlowEvent;
}

/** Builds a field-less/field-carrying event PAIR that is IDENTICAL except for
 *  commandId+sequence — same fixed timestamp on both, so any resulting
 *  context difference can only be attributed to the two new fields. */
function evPair(
  partial: DistributiveOmit<RunFlowEvent, 'schemaVersion' | 'flowId' | 'timestamp' | 'commandId' | 'sequence'> & { flowId?: string },
): { plain: RunFlowEvent; withFields: RunFlowEvent } {
  const timestamp = nextTimestamp();
  const plain = ev({ ...partial, timestamp } as typeof partial & { timestamp: string });
  const withFields = ev({ ...partial, timestamp, commandId: COMMAND_ID, sequence: SEQUENCE } as typeof partial & {
    timestamp: string;
    commandId: string;
    sequence: number;
  });
  return { plain, withFields };
}

// ─── Fixture event builders (field-less baseline; evPair() derives the field-carrying twin) ──
const proposalSubmitted = () => ({ type: 'PROPOSAL_SUBMITTED' as const, proposal: proposal() });
const previewStarted = () => ({ type: 'PREVIEW_STARTED' as const, revision: REVISION });
const previewReady = () => ({ type: 'PREVIEW_READY' as const, preview: preview() });
const approvalGranted = () => ({ type: 'APPROVAL_GRANTED' as const, revision: REVISION, planDigest: DIGEST, approvedBy: APPROVER });
const approvalRejected = () => ({ type: 'APPROVAL_REJECTED' as const, revision: REVISION });
const startRequested = () => ({ type: 'START_REQUESTED' as const, revision: REVISION, planDigest: DIGEST });
const runStarted = () => ({ type: 'RUN_STARTED' as const, handle: handle() });
const runCompleted = () => ({ type: 'RUN_COMPLETED' as const, summary: 'ok' });
const runFailed = () => ({ type: 'RUN_FAILED' as const, error: 'boom' });
const flowAborted = () => ({ type: 'FLOW_ABORTED' as const });

/** Drives the (field-less) reducer through the happy-path trajectory, one stage at a time —
 *  used only to build a shared STARTING context for each paired-transition test below. */
function driveToState(target:
  | 'COLLECTING'
  | 'PROPOSAL_READY'
  | 'PREVIEWING'
  | 'AWAITING_APPROVAL'
  | 'APPROVED'
  | 'STARTING'
  | 'DETACHED_RUNNING',
): RunFlowContext {
  let ctx = createInitialRunFlowContext();
  if (target === 'COLLECTING') return ctx;
  ctx = reduceRunFlow(ctx, ev(proposalSubmitted()));
  if (target === 'PROPOSAL_READY') return ctx;
  ctx = reduceRunFlow(ctx, ev(previewStarted()));
  if (target === 'PREVIEWING') return ctx;
  ctx = reduceRunFlow(ctx, ev(previewReady()));
  if (target === 'AWAITING_APPROVAL') return ctx;
  ctx = reduceRunFlow(ctx, ev(approvalGranted()));
  if (target === 'APPROVED') return ctx;
  ctx = reduceRunFlow(ctx, ev(startRequested()));
  if (target === 'STARTING') return ctx;
  ctx = reduceRunFlow(ctx, ev(runStarted()));
  return ctx;
}

describe('reduceRunFlow purity — (a) commandId/sequence are inert on every ordinary transition', () => {
  const cases: Array<{
    name: string;
    from: Parameters<typeof driveToState>[0];
    event: () => DistributiveOmit<RunFlowEvent, 'schemaVersion' | 'flowId' | 'timestamp' | 'commandId' | 'sequence'>;
  }> = [
    { name: 'PROPOSAL_SUBMITTED: COLLECTING -> PROPOSAL_READY', from: 'COLLECTING', event: proposalSubmitted },
    { name: 'PREVIEW_STARTED: PROPOSAL_READY -> PREVIEWING', from: 'PROPOSAL_READY', event: previewStarted },
    { name: 'PREVIEW_READY: PREVIEWING -> AWAITING_APPROVAL', from: 'PREVIEWING', event: previewReady },
    { name: 'APPROVAL_GRANTED (matching CAS): AWAITING_APPROVAL -> APPROVED', from: 'AWAITING_APPROVAL', event: approvalGranted },
    { name: 'APPROVAL_REJECTED: AWAITING_APPROVAL -> CANCELLED', from: 'AWAITING_APPROVAL', event: approvalRejected },
    { name: 'START_REQUESTED (matching CAS): APPROVED -> STARTING', from: 'APPROVED', event: startRequested },
    { name: 'RUN_STARTED: STARTING -> DETACHED_RUNNING', from: 'STARTING', event: runStarted },
    { name: 'RUN_COMPLETED: DETACHED_RUNNING -> COMPLETED', from: 'DETACHED_RUNNING', event: runCompleted },
    { name: 'RUN_FAILED: STARTING -> FAILED', from: 'STARTING', event: runFailed },
    { name: 'RUN_FAILED: DETACHED_RUNNING -> FAILED', from: 'DETACHED_RUNNING', event: runFailed },
    { name: 'FLOW_ABORTED: PROPOSAL_READY -> CANCELLED', from: 'PROPOSAL_READY', event: flowAborted },
    { name: 'FLOW_ABORTED: DETACHED_RUNNING -> CANCELLED', from: 'DETACHED_RUNNING', event: flowAborted },
  ];

  for (const { name, from, event } of cases) {
    it(`${name}: field-carrying event -> byte-identical state to the field-less equivalent`, () => {
      const ctx = driveToState(from);
      const { plain, withFields } = evPair(event());

      const plainResult = reduceRunFlow(ctx, plain);
      const withFieldsResult = reduceRunFlow(ctx, withFields);

      expect(withFieldsResult).toEqual(plainResult);
      // Sanity: the pair really did differ only by commandId/sequence, and the
      // reducer really did receive them — otherwise this test would pass vacuously.
      expect(plain).not.toHaveProperty('commandId');
      expect(withFields.commandId).toBe(COMMAND_ID);
      expect((withFields as { sequence?: number }).sequence).toBe(SEQUENCE);
    });
  }

  it('idempotent APPROVAL_GRANTED replay (matching CAS): same context reference regardless of commandId/sequence', () => {
    const approved = driveToState('APPROVED');
    const { plain, withFields } = evPair(approvalGranted());

    expect(reduceRunFlow(approved, plain)).toBe(approved);
    expect(reduceRunFlow(approved, withFields)).toBe(approved);
  });

  it('idempotent START_REQUESTED replay (matching CAS, STARTING): same context reference regardless of commandId/sequence', () => {
    const starting = driveToState('STARTING');
    const { plain, withFields } = evPair(startRequested());

    expect(reduceRunFlow(starting, plain)).toBe(starting);
    expect(reduceRunFlow(starting, withFields)).toBe(starting);
  });

  it('idempotent START_REQUESTED replay (matching CAS, DETACHED_RUNNING): same context reference regardless of commandId/sequence', () => {
    const detachedRunning = driveToState('DETACHED_RUNNING');
    const { plain, withFields } = evPair(startRequested());

    expect(reduceRunFlow(detachedRunning, plain)).toBe(detachedRunning);
    expect(reduceRunFlow(detachedRunning, withFields)).toBe(detachedRunning);
  });

  it('idempotent RUN_STARTED replay (same jobId): same context reference regardless of commandId/sequence', () => {
    const detachedRunning = driveToState('DETACHED_RUNNING');
    const { plain, withFields } = evPair(runStarted());

    expect(reduceRunFlow(detachedRunning, plain)).toBe(detachedRunning);
    expect(reduceRunFlow(detachedRunning, withFields)).toBe(detachedRunning);
  });
});

describe('reduceRunFlow purity — (b) `sequence` is never produced or read', () => {
  it('no context produced across every ordinary + mismatch transition ever carries a `sequence` key', () => {
    const contexts: RunFlowContext[] = [];

    let ctx = createInitialRunFlowContext();
    contexts.push(ctx);
    ctx = reduceRunFlow(ctx, ev({ ...proposalSubmitted(), commandId: COMMAND_ID, sequence: SEQUENCE }));
    contexts.push(ctx);
    ctx = reduceRunFlow(ctx, ev({ ...previewStarted(), commandId: COMMAND_ID, sequence: SEQUENCE + 1 }));
    contexts.push(ctx);
    ctx = reduceRunFlow(ctx, ev({ ...previewReady(), commandId: COMMAND_ID, sequence: SEQUENCE + 2 }));
    contexts.push(ctx);
    const approved = reduceRunFlow(ctx, ev({ ...approvalGranted(), commandId: COMMAND_ID, sequence: SEQUENCE + 3 }));
    contexts.push(approved);
    const starting = reduceRunFlow(approved, ev({ ...startRequested(), commandId: COMMAND_ID, sequence: SEQUENCE + 4 }));
    contexts.push(starting);
    const running = reduceRunFlow(starting, ev({ ...runStarted(), commandId: COMMAND_ID, sequence: SEQUENCE + 5 }));
    contexts.push(running);
    const completed = reduceRunFlow(running, ev({ ...runCompleted(), commandId: COMMAND_ID, sequence: SEQUENCE + 6 }));
    contexts.push(completed);

    // Also cover a BLOCKED (mismatch) context — sequence must stay absent there too.
    const awaitingApproval = driveToState('AWAITING_APPROVAL');
    const blocked = reduceRunFlow(
      awaitingApproval,
      ev({ type: 'APPROVAL_GRANTED', revision: REVISION, planDigest: 'stale-digest', approvedBy: APPROVER, commandId: COMMAND_ID, sequence: SEQUENCE }),
    );
    contexts.push(blocked);

    for (const c of contexts) {
      expect('sequence' in c).toBe(false);
      expect(Object.keys(c)).not.toContain('sequence');
    }
  });

  it('the reducer source file never references `sequence` anywhere (static regression-guard)', () => {
    const reducerPath = fileURLToPath(new URL('../../src/orchestra/run-flow-reducer.ts', import.meta.url));
    const source = readFileSync(reducerPath, 'utf8');
    expect(/sequence/i.test(source)).toBe(false);
  });
});

describe('reduceRunFlow purity — (c) mismatch-message behavior: commandId echoed IFF present, else byte-identical to pre-438-001 format', () => {
  it('APPROVAL_GRANTED CAS-mismatch blockedReason: exact pre-existing format when commandId is absent', () => {
    const awaitingApproval = driveToState('AWAITING_APPROVAL');
    const blocked = reduceRunFlow(
      awaitingApproval,
      ev({ type: 'APPROVAL_GRANTED', revision: REVISION, planDigest: 'stale-digest', approvedBy: APPROVER }),
    );
    expect(blocked.state).toBe('BLOCKED');
    expect(blocked.blockedReason).toBe(
      `approval targets revision=${REVISION}/digest=stale-digest, but the live preview is revision=${REVISION}/digest=${DIGEST}`,
    );
  });

  it('APPROVAL_GRANTED CAS-mismatch blockedReason: commandId is echoed when present, prefix unchanged', () => {
    const awaitingApproval = driveToState('AWAITING_APPROVAL');
    const blocked = reduceRunFlow(
      awaitingApproval,
      ev({ type: 'APPROVAL_GRANTED', revision: REVISION, planDigest: 'stale-digest', approvedBy: APPROVER, commandId: COMMAND_ID }),
    );
    expect(blocked.blockedReason).toBe(
      `approval targets revision=${REVISION}/digest=stale-digest, but the live preview is revision=${REVISION}/digest=${DIGEST} [commandId=${COMMAND_ID}]`,
    );
  });

  it('duplicate APPROVAL_GRANTED mismatch blockedReason: exact pre-existing format when commandId is absent', () => {
    const approved = driveToState('APPROVED');
    const conflicting = reduceRunFlow(
      approved,
      ev({ type: 'APPROVAL_GRANTED', revision: REVISION, planDigest: 'different-digest', approvedBy: APPROVER }),
    );
    expect(conflicting.blockedReason).toBe(
      'duplicate APPROVAL_GRANTED with a revision/digest that does not match the already-approved snapshot',
    );
  });

  it('duplicate APPROVAL_GRANTED mismatch blockedReason: commandId echoed when present', () => {
    const approved = driveToState('APPROVED');
    const conflicting = reduceRunFlow(
      approved,
      ev({ type: 'APPROVAL_GRANTED', revision: REVISION, planDigest: 'different-digest', approvedBy: APPROVER, commandId: COMMAND_ID }),
    );
    expect(conflicting.blockedReason).toBe(
      `duplicate APPROVAL_GRANTED with a revision/digest that does not match the already-approved snapshot [commandId=${COMMAND_ID}]`,
    );
  });

  it('START_REQUESTED CAS-mismatch blockedReason: exact pre-existing format when commandId is absent', () => {
    const approved = driveToState('APPROVED');
    const blocked = reduceRunFlow(approved, ev({ type: 'START_REQUESTED', revision: REVISION, planDigest: 'stale-digest' }));
    expect(blocked.blockedReason).toBe(
      `start targets revision=${REVISION}/digest=stale-digest, but the approved snapshot is revision=${REVISION}/digest=${DIGEST}`,
    );
  });

  it('START_REQUESTED CAS-mismatch blockedReason: commandId echoed when present, prefix unchanged', () => {
    const approved = driveToState('APPROVED');
    const blocked = reduceRunFlow(
      approved,
      ev({ type: 'START_REQUESTED', revision: REVISION, planDigest: 'stale-digest', commandId: COMMAND_ID }),
    );
    expect(blocked.blockedReason).toBe(
      `start targets revision=${REVISION}/digest=stale-digest, but the approved snapshot is revision=${REVISION}/digest=${DIGEST} [commandId=${COMMAND_ID}]`,
    );
  });

  it('duplicate START_REQUESTED mismatch blockedReason: exact pre-existing format when commandId is absent', () => {
    const detachedRunning = driveToState('DETACHED_RUNNING');
    const conflicting = reduceRunFlow(
      detachedRunning,
      ev({ type: 'START_REQUESTED', revision: REVISION, planDigest: 'different-digest' }),
    );
    expect(conflicting.blockedReason).toBe(
      'duplicate START_REQUESTED with a revision/digest that does not match the approved snapshot',
    );
  });

  it('duplicate START_REQUESTED mismatch blockedReason: commandId echoed when present', () => {
    const detachedRunning = driveToState('DETACHED_RUNNING');
    const conflicting = reduceRunFlow(
      detachedRunning,
      ev({ type: 'START_REQUESTED', revision: REVISION, planDigest: 'different-digest', commandId: COMMAND_ID }),
    );
    expect(conflicting.blockedReason).toBe(
      `duplicate START_REQUESTED with a revision/digest that does not match the approved snapshot [commandId=${COMMAND_ID}]`,
    );
  });

  it('thrown RunFlowTransitionError (fail() path): exact pre-existing message format when commandId is absent', () => {
    const proposalReady = driveToState('PROPOSAL_READY');
    let caught: unknown;
    try {
      reduceRunFlow(proposalReady, ev(proposalSubmitted()));
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(RunFlowTransitionError);
    expect((caught as RunFlowTransitionError).message).toBe(
      `run-flow: cannot apply 'PROPOSAL_SUBMITTED' to state 'PROPOSAL_READY' (flowId=${FLOW_ID}): expected state 'COLLECTING'`,
    );
  });

  it('thrown RunFlowTransitionError (fail() path): commandId echoed when present, prefix unchanged', () => {
    const proposalReady = driveToState('PROPOSAL_READY');
    let caught: unknown;
    try {
      reduceRunFlow(proposalReady, ev({ ...proposalSubmitted(), commandId: COMMAND_ID }));
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(RunFlowTransitionError);
    expect((caught as RunFlowTransitionError).message).toBe(
      `run-flow: cannot apply 'PROPOSAL_SUBMITTED' to state 'PROPOSAL_READY' (flowId=${FLOW_ID}): expected state 'COLLECTING' [commandId=${COMMAND_ID}]`,
    );
  });
});
