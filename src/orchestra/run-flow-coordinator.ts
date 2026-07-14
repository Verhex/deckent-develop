// ═══ run-flow-coordinator — TERM-FLOW-UNIFY Sprint-4 dilim (439-001) ═══════
//
// docs/analysis/term-flow-unify-design-2026-07-11.md ("Net Öneri"): the durable
// multi-flow coordinator that sits on top of the Sprint-1 pure reducer
// (orchestra/run-flow-reducer.ts) + typed contract (core/run-flow-contract.ts)
// and the Sprint-4 durable event log (core/run-flow-store.ts). Where
// cli/repl/run-flow-controller.ts is a single-flow, in-process front-door that
// ALSO generates the preview and spawns the run, THIS coordinator is the
// host-owned, multi-flow, event-sourced CORE: it owns a `flowId -> context`
// map and turns typed commands into durable, idempotent event appends. It
// neither generates previews nor spawns runs — every payload is caller-supplied
// (mirrors the reducer's own purity discipline), so every method here is
// synchronous.
//
// THE ONE CHAIN (binding — every command follows it verbatim):
//   build contract-event -> reduceRunFlow (validate + derive next context)
//     -> IF the reducer THROWS: wrap as a typed InvalidTransitionError and
//        DO NOT append (reduce-reddi => append YAPILMAZ)
//     -> appendFlowEvent (the STORE assigns the monotonic sequence)
//     -> update the in-memory FlowState (context + seen-commandId set).
// A reducer that RETURNS a `BLOCKED` context (a stale revision/digest CAS
// conflict) is a VALID transition, not a rejection — that event IS appended and
// the command reports `applied: true`. Only a *thrown* RunFlowTransitionError
// suppresses the append.
//
// COMMAND-IDEMPOTENCY (restart-safe, embedded in this core):
//   Every command carries an OPTIONAL `commandId`. That id is stamped onto the
//   event(s) the command emits, so it is persisted in the durable event log —
//   NOT held in a memory-only structure that a restart would drop. The dedup
//   index is a per-flow `Set<commandId>` RECONSTRUCTED by folding the flow's
//   event log the first time this coordinator instance touches the flowId (see
//   `ensureFlowLoaded`). A duplicate commandId therefore writes NO event and
//   returns a typed no-op (`{ applied: false, reason: 'duplicate-command',
//   context }`) even after a process restart, because the folded set already
//   contains it. A successful command returns `{ applied: true, context,
//   sequence }` (the store-assigned sequence of its last appended event).
//
// SINGLE-WRITER ASSUMPTION (binding): `appendFlowEvent` derives the next
// sequence by reading the flow's current log, so two writers appending to the
// SAME flow under the SAME `root` concurrently would race on the sequence
// counter. This coordinator therefore assumes it is the SOLE writer of each
// flow's event log for a given project root. Multi-writer coordination (leases /
// cross-process locks) is out of this core's scope; a future durable-lease
// layer would sit in front of it, not inside it.
//
// TYPED ERRORS ONLY (no generic throw): every failure path raises a
// `RunFlowCoordinatorError` subclass — `InvalidTransitionError` (reducer
// rejected the transition) or `AppendFailedError` (the durable append failed).
//
// ADR-D-004 / KNOWN_CONSUMERS: this file is a designed consumer of the
// reducer/contract/store trio (the store's own header calls it out — "the
// coordinator that reads this log is the next one"). The governance allowlist
// pin in tests/orchestra/run-flow-reducer.test.ts is added by the sibling
// rehydrate slice (439-002), whose write scope includes that test — it is
// deliberately NOT touched here. The public query surface (getFlow / listFlows
// with legacy dual-read) is likewise that slice's additive layer on top of the
// private event-fold below.

import {
  RUN_FLOW_EVENT_SCHEMA_VERSION,
  createInitialRunFlowContext,
  RunFlowTransitionError,
  type PlanPreview,
  type RunFlowContext,
  type RunFlowEvent,
  type RunFlowEventType,
  type RunFlowState,
  type RunHandle,
  type RunProposal,
} from '../core/run-flow-contract.js';
import type { ActorContext } from '../core/work-model.js';
import { reduceRunFlow } from './run-flow-reducer.js';
import { appendFlowEvent, readFlowEvents } from '../core/run-flow-store.js';

// ═══ Typed error taxonomy ══════════════════════════════════════════════════

/** Base for every coordinator failure — lets a caller `catch`/`instanceof` the
 *  whole family without matching a generic `Error`. */
export class RunFlowCoordinatorError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'RunFlowCoordinatorError';
  }
}

/**
 * Raised when the pure reducer rejects a transition (its own
 * `RunFlowTransitionError`) — i.e. the command cannot apply to the flow's
 * current state under any circumstance. The event is NEVER appended in this
 * case. Carries the reducer's diagnostic triple through unchanged.
 */
export class InvalidTransitionError extends RunFlowCoordinatorError {
  public readonly flowId: string | undefined;
  public readonly fromState: RunFlowState;
  public readonly eventType: RunFlowEventType;

  constructor(source: RunFlowTransitionError) {
    super(source.message, { cause: source });
    this.name = 'InvalidTransitionError';
    this.flowId = source.flowId;
    this.fromState = source.fromState;
    this.eventType = source.eventType;
  }
}

/**
 * Raised when the durable append itself fails (disk full, permission error, a
 * torn rename). The reducer already accepted the transition — the in-memory
 * map is left UNCHANGED so it never drifts ahead of the durable log.
 */
export class AppendFailedError extends RunFlowCoordinatorError {
  public readonly flowId: string;
  public readonly eventType: RunFlowEventType;

  constructor(flowId: string, eventType: RunFlowEventType, cause: unknown) {
    super(
      `run-flow-coordinator: failed to append '${eventType}' event for flow '${flowId}': ` +
        (cause instanceof Error ? cause.message : String(cause)),
      { cause },
    );
    this.name = 'AppendFailedError';
    this.flowId = flowId;
    this.eventType = eventType;
  }
}

// ═══ Command inputs + result ═══════════════════════════════════════════════

export interface ProposeFlowCommand {
  readonly proposal: RunProposal;
  readonly commandId?: string;
}

export interface RecordPreviewCommand {
  readonly preview: PlanPreview;
  readonly commandId?: string;
}

export interface GrantApprovalCommand {
  readonly flowId: string;
  readonly revision: number;
  readonly planDigest: string;
  readonly approvedBy: ActorContext;
  readonly commandId?: string;
}

export interface RejectApprovalCommand {
  readonly flowId: string;
  readonly revision: number;
  readonly reason?: string;
  readonly commandId?: string;
}

export interface RequestStartCommand {
  readonly flowId: string;
  readonly revision: number;
  readonly planDigest: string;
  readonly commandId?: string;
}

export interface RecordRunStartedCommand {
  readonly handle: RunHandle;
  readonly commandId?: string;
}

export interface RecordCompletionCommand {
  readonly flowId: string;
  readonly summary?: string;
  readonly commandId?: string;
}

/** The outcome of one command: either it applied (and its last event landed at
 *  `sequence`), or its `commandId` was already seen and it was a typed no-op. */
export type RunFlowCommandResult =
  | { readonly applied: true; readonly context: RunFlowContext; readonly sequence: number }
  | { readonly applied: false; readonly reason: 'duplicate-command'; readonly context: RunFlowContext };

// ═══ Coordinator surface ═══════════════════════════════════════════════════

export interface RunFlowCoordinatorDeps {
  /** Project root — every store call (`appendFlowEvent`/`readFlowEvents`) is scoped to it. */
  readonly root: string;
  /** Seam for tests — production default is `() => new Date().toISOString()`. The reducer
   *  never reads a clock, so the coordinator supplies each event's timestamp here. */
  readonly now?: () => string;
}

export interface RunFlowCoordinator {
  /** COLLECTING -> PROPOSAL_READY -> PREVIEWING. Emits PROPOSAL_SUBMITTED then
   *  PREVIEW_STARTED (both derived from the proposal alone) — mirrors
   *  run-flow-controller.proposeRun's own two-event opener. flowId = proposal.flowId. */
  proposeFlow(cmd: ProposeFlowCommand): RunFlowCommandResult;
  /** PREVIEWING -> AWAITING_APPROVAL. Emits PREVIEW_READY. flowId = preview.flowId. */
  recordPreview(cmd: RecordPreviewCommand): RunFlowCommandResult;
  /** AWAITING_APPROVAL -> APPROVED (or BLOCKED on a stale revision/digest). Emits APPROVAL_GRANTED. */
  grantApproval(cmd: GrantApprovalCommand): RunFlowCommandResult;
  /** AWAITING_APPROVAL -> CANCELLED. Emits APPROVAL_REJECTED. */
  rejectApproval(cmd: RejectApprovalCommand): RunFlowCommandResult;
  /** APPROVED -> STARTING (or BLOCKED on a stale revision/digest). Emits START_REQUESTED. */
  requestStart(cmd: RequestStartCommand): RunFlowCommandResult;
  /** STARTING -> DETACHED_RUNNING. Emits RUN_STARTED. flowId = handle.flowId. */
  recordRunStarted(cmd: RecordRunStartedCommand): RunFlowCommandResult;
  /** DETACHED_RUNNING -> COMPLETED. Emits RUN_COMPLETED. */
  recordCompletion(cmd: RecordCompletionCommand): RunFlowCommandResult;
}

/** Mutable per-flow cache entry — the SAME object reference stays in the map, so
 *  mutating `context`/`commandIds` in place keeps the map current without a re-`set`. */
interface FlowState {
  context: RunFlowContext;
  readonly commandIds: Set<string>;
}

/** Plain `Omit` collapses `RunFlowEvent`'s discriminated union to its common-key
 *  intersection (losing each variant's own payload field) — this distributes per
 *  member instead. Mirrors run-flow-reducer.test.ts / the coordinator harness. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** The event-specific payload half of {@link RunFlowEvent}, with the shared
 *  envelope keys (stamped by `buildEvent`) removed per union member. */
type RunFlowEventPayload = DistributiveOmit<
  RunFlowEvent,
  'schemaVersion' | 'flowId' | 'timestamp' | 'commandId' | 'sequence'
>;

export function createRunFlowCoordinator(deps: RunFlowCoordinatorDeps): RunFlowCoordinator {
  const { root } = deps;
  const nowFn = deps.now ?? (() => new Date().toISOString());
  const flows = new Map<string, FlowState>();

  /**
   * Load (or lazily reconstruct) a flow's in-memory state. On a cache miss the
   * flow is rehydrated by FOLDING its durable event log through the reducer —
   * this is what makes both the derived context AND the commandId dedup set
   * survive a process restart. A brand-new flow (empty log) folds to the
   * INITIAL context with an empty command set.
   */
  function ensureFlowLoaded(flowId: string): FlowState {
    const cached = flows.get(flowId);
    if (cached !== undefined) return cached;

    let context = createInitialRunFlowContext();
    const commandIds = new Set<string>();
    for (const event of readFlowEvents(root, flowId)) {
      try {
        context = reduceRunFlow(context, event);
      } catch (err) {
        // A persisted log that no longer folds cleanly is a coordinator-level
        // fault, never a bare Error — surface it typed. (Cannot occur for a log
        // this coordinator wrote: every appended event passed the reducer first.)
        if (err instanceof RunFlowTransitionError) throw new InvalidTransitionError(err);
        throw new RunFlowCoordinatorError(
          `run-flow-coordinator: failed to rehydrate flow '${flowId}' from its event log: ` +
            (err instanceof Error ? err.message : String(err)),
          { cause: err },
        );
      }
      if (event.commandId !== undefined) commandIds.add(event.commandId);
    }

    const state: FlowState = { context, commandIds };
    flows.set(flowId, state);
    return state;
  }

  /** Stamp the shared envelope (schemaVersion / flowId / timestamp / optional
   *  commandId) onto an event-specific payload. Mirrors the reducer test /
   *  harness `buildFlowEvent` shape. */
  function buildEvent(
    flowId: string,
    commandId: string | undefined,
    payload: RunFlowEventPayload,
  ): RunFlowEvent {
    return {
      schemaVersion: RUN_FLOW_EVENT_SCHEMA_VERSION,
      flowId,
      timestamp: nowFn(),
      ...(commandId !== undefined ? { commandId } : {}),
      ...payload,
    } as RunFlowEvent;
  }

  /**
   * THE ONE CHAIN. Deduplicates on `commandId`, then for each produced event:
   * reduce FIRST (a thrown reject means the append never happens), append
   * SECOND (the store assigns the sequence), and only then advance the cached
   * context. `buildEvents` receives the current context so a command can derive
   * its event from live state if it needs to.
   */
  function runCommand(
    flowId: string,
    commandId: string | undefined,
    buildEvents: (context: RunFlowContext) => readonly RunFlowEvent[],
  ): RunFlowCommandResult {
    const flow = ensureFlowLoaded(flowId);

    if (commandId !== undefined && flow.commandIds.has(commandId)) {
      // Restart-safe no-op: the id is in the folded set, so NO event is written.
      return { applied: false, reason: 'duplicate-command', context: flow.context };
    }

    let context = flow.context;
    let sequence = 0;
    for (const event of buildEvents(context)) {
      let next: RunFlowContext;
      try {
        next = reduceRunFlow(context, event);
      } catch (err) {
        if (err instanceof RunFlowTransitionError) throw new InvalidTransitionError(err);
        throw err; // never expected — a non-transition throw from the pure reducer
      }
      // reduce accepted (including a returned BLOCKED context) => durably append.
      try {
        sequence = appendFlowEvent(root, flowId, event);
      } catch (err) {
        throw new AppendFailedError(flowId, event.type, err);
      }
      context = next;
    }

    // Commit to the in-memory map only AFTER every append succeeded.
    flow.context = context;
    if (commandId !== undefined) flow.commandIds.add(commandId);
    return { applied: true, context, sequence };
  }

  return {
    proposeFlow(cmd) {
      const { proposal, commandId } = cmd;
      return runCommand(proposal.flowId, commandId, () => [
        buildEvent(proposal.flowId, commandId, { type: 'PROPOSAL_SUBMITTED', proposal }),
        buildEvent(proposal.flowId, commandId, { type: 'PREVIEW_STARTED', revision: proposal.revision }),
      ]);
    },

    recordPreview(cmd) {
      const { preview, commandId } = cmd;
      return runCommand(preview.flowId, commandId, () => [
        buildEvent(preview.flowId, commandId, { type: 'PREVIEW_READY', preview }),
      ]);
    },

    grantApproval(cmd) {
      const { flowId, revision, planDigest, approvedBy, commandId } = cmd;
      return runCommand(flowId, commandId, () => [
        buildEvent(flowId, commandId, { type: 'APPROVAL_GRANTED', revision, planDigest, approvedBy }),
      ]);
    },

    rejectApproval(cmd) {
      const { flowId, revision, reason, commandId } = cmd;
      return runCommand(flowId, commandId, () => [
        buildEvent(flowId, commandId, {
          type: 'APPROVAL_REJECTED',
          revision,
          ...(reason !== undefined ? { reason } : {}),
        }),
      ]);
    },

    requestStart(cmd) {
      const { flowId, revision, planDigest, commandId } = cmd;
      return runCommand(flowId, commandId, () => [
        buildEvent(flowId, commandId, { type: 'START_REQUESTED', revision, planDigest }),
      ]);
    },

    recordRunStarted(cmd) {
      const { handle, commandId } = cmd;
      return runCommand(handle.flowId, commandId, () => [
        buildEvent(handle.flowId, commandId, { type: 'RUN_STARTED', handle }),
      ]);
    },

    recordCompletion(cmd) {
      const { flowId, summary, commandId } = cmd;
      return runCommand(flowId, commandId, () => [
        buildEvent(flowId, commandId, {
          type: 'RUN_COMPLETED',
          ...(summary !== undefined ? { summary } : {}),
        }),
      ]);
    },
  };
}
