// ═══ run-flow-reducer — TERM-FLOW-UNIFY Sprint-1 dilim (422-001) ═══════════
//
// docs/analysis/term-flow-unify-design-2026-07-11.md ("Net Öneri"). Pure
// event-sourced state machine for the host-owned RunFlow coordinator this
// design proposes. THIS slice ships the reducer ONLY, flag-gated behind the
// (currently-unread) `terminal.run_flow_v2` config flag and consumed by
// nothing in `src/` — the sole importer is tests/orchestra/run-flow-reducer.test.ts
// (pinned there by a static import-scan guard test). Wiring a real caller is
// dilim-3+ (design doc's 7-sprint table, "Native proposal/card/approval").
//
// PURITY CONTRACT (binding — a violation here breaks the goCriteria):
//   - NO 'node:fs' / 'fs' import.
//   - NO process environment variable / process.* read.
//   - NO wall-clock read (Date.now(), `new Date()` with no args, crypto.randomUUID()).
// Every identifier and timestamp is threaded in through the `RunFlowEvent`
// by the (future) caller — mirrors scheduler-reducer.ts's purity discipline.
//
// GOLDEN-FLOW ORGAN TRANSPLANT (source: src/orchestra/golden-flow.ts:153
// runGoldenFlow): that orchestrator checks `seams.signal?.aborted` before
// every stage and short-circuits to `cancelled` the instant `approvePlan`
// resolves `false` — in both cases `startSprint` is provably never called
// afterwards (the cancelled branch `return`s before reaching the `start`
// stage's `runStage` call). The reducer below reproduces the identical
// invariant structurally instead of procedurally: `CANCELLED` (via either
// `APPROVAL_REJECTED` or `FLOW_ABORTED`) is a terminal state, and
// `isTerminalRunFlowState` rejects EVERY subsequent event — including
// `START_REQUESTED` — with a typed `RunFlowTransitionError`. "Reject/abort
// durumunda start'a geçilmez" holds by construction, not by a stage-order
// convention a future caller could accidentally bypass.

import {
  type RunFlowContext,
  type RunFlowEvent,
  type RunFlowState,
  type ApprovedPlanSnapshot,
  RUN_FLOW_EVENT_SCHEMA_VERSION,
  RunFlowTransitionError,
  isTerminalRunFlowState,
} from '../core/run-flow-contract.js';

function fail(context: RunFlowContext, event: RunFlowEvent, detail: string): never {
  throw new RunFlowTransitionError(
    context.flowId,
    context.state,
    event.type,
    withCommandId(`run-flow: cannot apply '${event.type}' to state '${context.state}' (flowId=${context.flowId ?? '<unset>'}): ${detail}`, event),
  );
}

/** Appends a `[commandId=...]` marker IFF the event carries one — otherwise returns
 *  `message` unchanged (byte-identical to the pre-commandId format). Shared by every
 *  mismatch-message call site below so a caller-supplied commandId is never dropped. */
function withCommandId(message: string, event: RunFlowEvent): string {
  return event.commandId !== undefined ? `${message} [commandId=${event.commandId}]` : message;
}

/** CAS key shared by APPROVAL_GRANTED (vs. the live preview) and re-checked by
 *  START_REQUESTED (vs. the committed ApprovedPlanSnapshot) — see file header. */
function matchesRevisionDigest(
  revision: number,
  planDigest: string,
  against: { readonly revision: number; readonly planDigest: string },
): boolean {
  return against.revision === revision && against.planDigest === planDigest;
}

/**
 * Pure reducer: `(context, event) -> nextContext`. Never mutates `context`;
 * always returns a fresh object (or the SAME object reference for an
 * idempotent duplicate replay — see `APPROVAL_GRANTED`/`START_REQUESTED`).
 * Throws `RunFlowTransitionError` for any transition that is invalid under
 * every circumstance ("geçersiz-geçiş = typed-hata, sessiz no-op YASAK").
 */
export function reduceRunFlow(context: RunFlowContext, event: RunFlowEvent): RunFlowContext {
  if (event.schemaVersion !== RUN_FLOW_EVENT_SCHEMA_VERSION) {
    fail(context, event, `unsupported event schemaVersion ${event.schemaVersion}`);
  }
  if (context.flowId !== undefined && event.flowId !== context.flowId) {
    fail(context, event, `event.flowId '${event.flowId}' does not match context.flowId '${context.flowId}'`);
  }
  if (isTerminalRunFlowState(context.state)) {
    fail(context, event, 'state is terminal — no further transitions are ever accepted');
  }

  switch (event.type) {
    case 'PROPOSAL_SUBMITTED': {
      if (context.state !== 'COLLECTING') fail(context, event, `expected state 'COLLECTING'`);
      if (event.proposal.flowId !== event.flowId) {
        fail(context, event, 'proposal.flowId does not match event.flowId envelope');
      }
      return {
        ...context,
        state: 'PROPOSAL_READY' as RunFlowState,
        flowId: event.flowId,
        proposal: event.proposal,
        updatedAt: event.timestamp,
      };
    }

    case 'PREVIEW_STARTED': {
      if (context.state !== 'PROPOSAL_READY') fail(context, event, `expected state 'PROPOSAL_READY'`);
      if (context.proposal === undefined) fail(context, event, 'missing proposal on context');
      if (context.proposal.revision !== event.revision) {
        fail(context, event, `revision ${event.revision} does not match proposal revision ${context.proposal.revision}`);
      }
      return { ...context, state: 'PREVIEWING', updatedAt: event.timestamp };
    }

    case 'PREVIEW_READY': {
      if (context.state !== 'PREVIEWING') fail(context, event, `expected state 'PREVIEWING'`);
      if (event.preview.flowId !== event.flowId) {
        fail(context, event, 'preview.flowId does not match event.flowId envelope');
      }
      return { ...context, state: 'AWAITING_APPROVAL', preview: event.preview, updatedAt: event.timestamp };
    }

    case 'APPROVAL_GRANTED': {
      if (context.state === 'AWAITING_APPROVAL') {
        if (context.preview === undefined) fail(context, event, 'missing preview on context');
        if (!matchesRevisionDigest(event.revision, event.planDigest, context.preview)) {
          return {
            ...context,
            state: 'BLOCKED',
            blockedReason: withCommandId(
              `approval targets revision=${event.revision}/digest=${event.planDigest}, ` +
                `but the live preview is revision=${context.preview.revision}/digest=${context.preview.planDigest}`,
              event,
            ),
            updatedAt: event.timestamp,
          };
        }
        const snapshot: ApprovedPlanSnapshot = {
          flowId: context.flowId!,
          revision: event.revision,
          planDigest: event.planDigest,
          approvedBy: event.approvedBy,
          approvedAt: event.timestamp,
        };
        return { ...context, state: 'APPROVED', approvedSnapshot: snapshot, updatedAt: event.timestamp };
      }
      if (context.state === 'APPROVED') {
        // Duplicate-approval replay (design-doc risk: double-start from a
        // re-delivered approval event). Idempotent ONLY when the CAS key
        // matches exactly — otherwise it is a genuine conflict, not a retry.
        if (context.approvedSnapshot !== undefined && matchesRevisionDigest(event.revision, event.planDigest, context.approvedSnapshot)) {
          return context;
        }
        return {
          ...context,
          state: 'BLOCKED',
          blockedReason: withCommandId(
            'duplicate APPROVAL_GRANTED with a revision/digest that does not match the already-approved snapshot',
            event,
          ),
          updatedAt: event.timestamp,
        };
      }
      return fail(context, event, `expected state 'AWAITING_APPROVAL' or 'APPROVED'`);
    }

    case 'APPROVAL_REJECTED': {
      if (context.state !== 'AWAITING_APPROVAL') fail(context, event, `expected state 'AWAITING_APPROVAL'`);
      return { ...context, state: 'CANCELLED', cancelReason: 'rejected', updatedAt: event.timestamp };
    }

    case 'START_REQUESTED': {
      if (context.state === 'APPROVED') {
        if (context.approvedSnapshot === undefined) fail(context, event, 'missing approvedSnapshot on context');
        if (!matchesRevisionDigest(event.revision, event.planDigest, context.approvedSnapshot)) {
          return {
            ...context,
            state: 'BLOCKED',
            blockedReason: withCommandId(
              `start targets revision=${event.revision}/digest=${event.planDigest}, ` +
                `but the approved snapshot is revision=${context.approvedSnapshot.revision}/digest=${context.approvedSnapshot.planDigest}`,
              event,
            ),
            updatedAt: event.timestamp,
          };
        }
        return { ...context, state: 'STARTING', updatedAt: event.timestamp };
      }
      if (context.state === 'STARTING' || context.state === 'DETACHED_RUNNING') {
        // Duplicate-start replay (design-doc risk: "flowId + planDigest atomic
        // idempotency olmadan cutover yapılmamalı"). Idempotent ONLY on an
        // exact CAS-key match against the committed snapshot.
        if (context.approvedSnapshot !== undefined && matchesRevisionDigest(event.revision, event.planDigest, context.approvedSnapshot)) {
          return context;
        }
        return {
          ...context,
          state: 'BLOCKED',
          blockedReason: withCommandId(
            'duplicate START_REQUESTED with a revision/digest that does not match the approved snapshot',
            event,
          ),
          updatedAt: event.timestamp,
        };
      }
      return fail(context, event, `expected state 'APPROVED', 'STARTING' or 'DETACHED_RUNNING'`);
    }

    case 'RUN_STARTED': {
      if (context.state === 'STARTING') {
        return { ...context, state: 'DETACHED_RUNNING', handle: event.handle, updatedAt: event.timestamp };
      }
      if (context.state === 'DETACHED_RUNNING' && context.handle?.jobId === event.handle.jobId) {
        return context; // idempotent replay of the same handle
      }
      return fail(context, event, `expected state 'STARTING'`);
    }

    case 'RUN_COMPLETED': {
      if (context.state !== 'DETACHED_RUNNING') fail(context, event, `expected state 'DETACHED_RUNNING'`);
      return { ...context, state: 'COMPLETED', updatedAt: event.timestamp };
    }

    case 'RUN_FAILED': {
      if (context.state !== 'DETACHED_RUNNING' && context.state !== 'STARTING') {
        fail(context, event, `expected state 'STARTING' or 'DETACHED_RUNNING'`);
      }
      return { ...context, state: 'FAILED', failureReason: event.error, updatedAt: event.timestamp };
    }

    case 'FLOW_ABORTED': {
      // Reachable from any non-terminal state — mirrors golden-flow's
      // signal-checkpoint-before-every-stage convention (see file header).
      return { ...context, state: 'CANCELLED', cancelReason: 'aborted', updatedAt: event.timestamp };
    }

    default: {
      const exhaustive: never = event;
      throw new RunFlowTransitionError(
        context.flowId,
        context.state,
        (exhaustive as RunFlowEvent).type,
        'run-flow: unknown event type',
      );
    }
  }
}
