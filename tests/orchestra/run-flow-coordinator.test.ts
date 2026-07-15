import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createRunFlowCoordinator,
  InvalidTransitionError,
  type RunFlowCoordinator,
} from '../../src/orchestra/run-flow-coordinator.js';
import { readFlowEvents } from '../../src/core/run-flow-store.js';
import { RUNTIME_DIR } from '../../src/core/constants.js';
import type { RunHandle } from '../../src/core/run-flow-contract.js';
import type { ActorContext } from '../../src/core/work-model.js';
import {
  createHarnessRoot,
  cleanupHarnessRoot,
  makeRunProposal,
  makePlanPreview,
  createLegacyApprovedSnapshotFixture,
  createLegacyRunHandleFixture,
  appendProposalToCompletionChain,
  generateFlowId,
  generateTwoFlowIds,
  generateCommandId,
  DEFAULT_REVISION,
  DEFAULT_PLAN_DIGEST,
} from './run-flow-coordinator-harness.js';

// 442-003 (TERM-FLOW-UNIFY sprint-442 dilim): the six accepted hermetic
// scenarios for the RunFlowCoordinator (439-001/442-001/442-002's public
// surface). Reuses the EXISTING run-flow-coordinator-harness.ts verbatim —
// no parallel test infra. Each test gets its own tmpdir root (harness
// createHarnessRoot/cleanupHarnessRoot); no global/shared state, no
// spawnSync anywhere in this file (ADR-D-002).

/** Deterministic, monotonically-increasing ISO clock for
 *  RunFlowCoordinatorDeps.now — mirrors the harness's own
 *  `appendProposalToCompletionChain` tick pattern so every test in this file
 *  is byte-reproducible, never wall-clock-dependent. */
function makeClock(startIso = '2026-07-13T00:00:00.000Z'): () => string {
  const base = Date.parse(startIso);
  let tick = 0;
  return () => new Date(base + tick++ * 1000).toISOString();
}

/** Drives ONE flow through the coordinator's own full command surface —
 *  proposeFlow -> recordPreview -> grantApproval -> requestStart ->
 *  recordRunStarted -> recordCompletion — so scenarios that need a
 *  fully-lifecycled flow exercise the coordinator under test itself, not a
 *  hand-built event log. */
function driveFlowToCompletion(
  coordinator: RunFlowCoordinator,
  flowId: string,
  opts: { revision?: number; planDigest?: string; commandIdPrefix?: string } = {},
) {
  const revision = opts.revision ?? DEFAULT_REVISION;
  const planDigest = opts.planDigest ?? DEFAULT_PLAN_DIGEST;
  const commandId = (stage: string): string | undefined =>
    opts.commandIdPrefix === undefined ? undefined : `${opts.commandIdPrefix}-${stage}`;

  const proposal = makeRunProposal({ flowId, revision });
  const proposeResult = coordinator.proposeFlow({ proposal, commandId: commandId('propose') });

  const preview = makePlanPreview({ flowId, revision, planDigest });
  const previewResult = coordinator.recordPreview({ preview, commandId: commandId('preview') });

  const approvedBy: ActorContext = { id: `approver-${flowId}` };
  const approvalResult = coordinator.grantApproval({
    flowId,
    revision,
    planDigest,
    approvedBy,
    commandId: commandId('approve'),
  });

  const startResult = coordinator.requestStart({ flowId, revision, planDigest, commandId: commandId('start') });

  const handle: RunHandle = { flowId, jobId: `job-${flowId}`, logRef: `log-${flowId}` };
  const runStartedResult = coordinator.recordRunStarted({ handle, commandId: commandId('run-started') });

  const completionResult = coordinator.recordCompletion({
    flowId,
    summary: `done-${flowId}`,
    commandId: commandId('completion'),
  });

  return {
    proposal,
    preview,
    handle,
    results: { proposeResult, previewResult, approvalResult, startResult, runStartedResult, completionResult },
  };
}

/** ONLY for the sequence-integrity scenario: swaps two JSONL lines in a
 *  flow's durable events log to simulate a corrupted fold order. Reads the
 *  real on-disk file (sync node:fs — the store itself uses the same
 *  primitive internally; this is not a subprocess, so ADR-D-002's spawnSync
 *  ban does not apply). Path is assembled from the already-exported
 *  `RUNTIME_DIR` constant plus the store's own documented
 *  `run-flow-store/<flowId>.events.jsonl` naming (run-flow-store.ts header). */
function swapEventLines(root: string, flowId: string, indexA: number, indexB: number): void {
  const path = join(root, RUNTIME_DIR, 'run-flow-store', `${flowId}.events.jsonl`);
  const raw = readFileSync(path, 'utf-8');
  const lines = raw.split('\n').filter((line) => line.trim().length > 0);
  const a = lines[indexA];
  const b = lines[indexB];
  if (a === undefined || b === undefined) {
    throw new Error(`swapEventLines: index out of range (have ${lines.length} lines)`);
  }
  lines[indexA] = b;
  lines[indexB] = a;
  writeFileSync(path, lines.join('\n') + '\n', 'utf-8');
}

describe('RunFlowCoordinator — hermetic scenario family (442-003)', () => {
  let root: string;

  beforeEach(async () => {
    root = await createHarnessRoot();
  });

  afterEach(async () => {
    await cleanupHarnessRoot(root);
  });

  // ── 1. Two-flow independence ─────────────────────────────────────────
  describe('two-flow independence', () => {
    it('advances two flows on the same coordinator without cross-flow leakage', () => {
      const [flowA, flowB] = generateTwoFlowIds();
      const coordinator = createRunFlowCoordinator({ root, now: makeClock() });

      coordinator.proposeFlow({ proposal: makeRunProposal({ flowId: flowA, intentSummary: 'Flow A intent.' }) });
      coordinator.proposeFlow({ proposal: makeRunProposal({ flowId: flowB, intentSummary: 'Flow B intent.' }) });

      coordinator.recordPreview({ preview: makePlanPreview({ flowId: flowA, planDigest: 'digest-a' }) });
      coordinator.recordPreview({ preview: makePlanPreview({ flowId: flowB, planDigest: 'digest-b' }) });

      const approveA = coordinator.grantApproval({
        flowId: flowA,
        revision: DEFAULT_REVISION,
        planDigest: 'digest-a',
        approvedBy: { id: 'approver-a' },
      });
      const approveB = coordinator.grantApproval({
        flowId: flowB,
        revision: DEFAULT_REVISION,
        planDigest: 'digest-b',
        approvedBy: { id: 'approver-b' },
      });
      expect(approveA.applied).toBe(true);
      expect(approveB.applied).toBe(true);

      // Push flow A further while flow B stays put — the strongest possible
      // probe for cross-flow leakage (asymmetric progress).
      coordinator.requestStart({ flowId: flowA, revision: DEFAULT_REVISION, planDigest: 'digest-a' });
      coordinator.recordRunStarted({ handle: { flowId: flowA, jobId: 'job-a', logRef: 'log-a' } });

      const contextA = coordinator.getFlow(flowA);
      const contextB = coordinator.getFlow(flowB);

      expect(contextA.flowId).toBe(flowA);
      expect(contextB.flowId).toBe(flowB);
      expect(contextA.state).toBe('DETACHED_RUNNING');
      expect(contextB.state).toBe('APPROVED'); // untouched by flow A's later commands
      expect(contextA.preview?.planDigest).toBe('digest-a');
      expect(contextB.preview?.planDigest).toBe('digest-b');
      expect(contextA.approvedSnapshot?.planDigest).toBe('digest-a');
      expect(contextB.approvedSnapshot?.planDigest).toBe('digest-b');
      expect(contextA.handle?.jobId).toBe('job-a');
      expect(contextB.handle).toBeUndefined();

      // Independent per-flow sequence counters — flow B's log has exactly 4
      // events (proposal+preview-started+preview-ready+approval), unaffected
      // by flow A's two extra commands.
      expect(readFlowEvents(root, flowA)).toHaveLength(6);
      expect(readFlowEvents(root, flowB)).toHaveLength(4);

      expect(coordinator.listFlows()).toEqual([flowA, flowB].sort());
    });
  });

  // ── 2. Restart-rehydrate ─────────────────────────────────────────────
  describe('restart-rehydrate', () => {
    it('a freshly-created coordinator instance folds events.jsonl to the same context the pre-restart instance held', () => {
      const flowId = generateFlowId('restart');
      const coordinatorBeforeRestart = createRunFlowCoordinator({ root, now: makeClock() });
      const { results } = driveFlowToCompletion(coordinatorBeforeRestart, flowId, { planDigest: 'digest-restart' });
      expect(results.completionResult.applied).toBe(true);

      const contextBeforeRestart = coordinatorBeforeRestart.getFlow(flowId);
      expect(contextBeforeRestart.state).toBe('COMPLETED');

      // Simulate a process restart: a brand-new coordinator instance over the
      // SAME root — its in-memory flows map starts empty, so getFlow() MUST
      // rehydrate by folding the durable events.jsonl log.
      const coordinatorAfterRestart = createRunFlowCoordinator({ root, now: makeClock() });
      const contextAfterRestart = coordinatorAfterRestart.getFlow(flowId);

      expect(contextAfterRestart).toEqual(contextBeforeRestart);
      expect(contextAfterRestart.handle?.jobId).toBe(`job-${flowId}`);
      expect(contextAfterRestart.approvedSnapshot?.planDigest).toBe('digest-restart');
    });
  });

  // ── 3. Legacy dual-read ──────────────────────────────────────────────
  describe('legacy dual-read', () => {
    it('resolves a synthetic context from approved-snapshot + run-handle when no events.jsonl exists', () => {
      const flowId = generateFlowId('legacy');
      const snapshot = createLegacyApprovedSnapshotFixture({
        root,
        flowId,
        revision: DEFAULT_REVISION,
        planDigest: 'digest-legacy',
      });
      const handleRecord = createLegacyRunHandleFixture({
        root,
        flowId,
        revision: DEFAULT_REVISION,
        planDigest: 'digest-legacy',
      });

      // Confirm the fixture genuinely left no unified event log behind —
      // this is what forces getFlow() down the legacy dual-read path.
      expect(readFlowEvents(root, flowId)).toEqual([]);

      const coordinator = createRunFlowCoordinator({ root, now: makeClock() });
      const context = coordinator.getFlow(flowId);

      expect(context.state).toBe('DETACHED_RUNNING');
      expect(context.flowId).toBe(flowId);
      expect(context.handle).toEqual(handleRecord.handle);
      expect(context.approvedSnapshot).toEqual({
        flowId: snapshot.flowId,
        revision: snapshot.revision,
        planDigest: snapshot.planDigest,
        approvedBy: snapshot.approvedBy,
        approvedAt: snapshot.approvedAt,
      });
      expect(context.updatedAt).toBe(handleRecord.startedAt);
      expect(coordinator.listFlows()).toContain(flowId);
    });
  });

  // ── 4. Duplicate commandId ───────────────────────────────────────────
  describe('duplicate commandId', () => {
    it('a second submission with the same commandId is a typed no-op, not a re-applied command', () => {
      const flowId = generateFlowId('dedup');
      const coordinator = createRunFlowCoordinator({ root, now: makeClock() });
      const commandId = generateCommandId('propose-dedup');

      const first = coordinator.proposeFlow({ proposal: makeRunProposal({ flowId }), commandId });
      expect(first.applied).toBe(true);
      if (!first.applied) throw new Error('unreachable — asserted above');
      expect(first.sequence).toBe(2); // PROPOSAL_SUBMITTED(1) + PREVIEW_STARTED(2)

      // Replay with the EXACT same commandId but a different payload — must
      // be recognized purely by commandId and short-circuit before ever
      // reaching the reducer/store, so the differing payload never applies.
      const replayProposal = makeRunProposal({ flowId, intentSummary: 'A different intent that must never apply.' });
      const second = coordinator.proposeFlow({ proposal: replayProposal, commandId });

      expect(second).toEqual({ applied: false, reason: 'duplicate-command', context: first.context });
      expect(second.context.proposal?.intentSummary).not.toBe('A different intent that must never apply.');

      // No new event was appended to the durable log by the replay.
      expect(readFlowEvents(root, flowId)).toHaveLength(2);
    });
  });

  // ── 5. Sequence integrity ────────────────────────────────────────────
  describe('sequence integrity', () => {
    it('a corrupted (out-of-order) event log fold throws a typed InvalidTransitionError', () => {
      const flowId = generateFlowId('corrupt');
      // Real, store-assigned event chain: PROPOSAL_SUBMITTED(seq 1) ->
      // PREVIEW_STARTED(seq 2) -> PREVIEW_READY(seq 3).
      appendProposalToCompletionChain({ root, flowId, through: 'PREVIEW_READY' });
      expect(readFlowEvents(root, flowId)).toHaveLength(3);

      // Corrupt on-disk fold order: swap PREVIEW_STARTED/PREVIEW_READY so the
      // file now reads PROPOSAL_SUBMITTED, PREVIEW_READY, PREVIEW_STARTED.
      // Folding in THAT order applies PREVIEW_READY while the context is
      // still PROPOSAL_READY (not PREVIEWING) — invalid under any
      // circumstance, per the reducer's own state guard.
      swapEventLines(root, flowId, 1, 2);

      const coordinator = createRunFlowCoordinator({ root, now: makeClock() });
      expect(() => coordinator.getFlow(flowId)).toThrow(InvalidTransitionError);

      try {
        coordinator.getFlow(flowId);
      } catch (err) {
        expect(err).toBeInstanceOf(InvalidTransitionError);
        const typedErr = err as InstanceType<typeof InvalidTransitionError>;
        expect(typedErr.fromState).toBe('PROPOSAL_READY');
        expect(typedErr.eventType).toBe('PREVIEW_READY');
      }
    });
  });

  // ── 6. Terminal-state rejection ──────────────────────────────────────
  describe('terminal-state rejection', () => {
    it('a command issued after the flow reaches a terminal state is rejected with InvalidTransitionError', () => {
      const flowId = generateFlowId('terminal');
      const coordinator = createRunFlowCoordinator({ root, now: makeClock() });
      const { results } = driveFlowToCompletion(coordinator, flowId, { planDigest: 'digest-terminal' });
      expect(results.completionResult.applied).toBe(true);
      expect(coordinator.getFlow(flowId).state).toBe('COMPLETED');

      const eventCountBeforeRejectedCommand = readFlowEvents(root, flowId).length;

      // No commandId — this MUST hit the reduce-first terminal-state guard,
      // not the dedup short-circuit, to genuinely exercise the rejection.
      expect(() =>
        coordinator.grantApproval({
          flowId,
          revision: DEFAULT_REVISION,
          planDigest: 'digest-terminal',
          approvedBy: { id: 'late-approver' },
        }),
      ).toThrow(InvalidTransitionError);

      // "reduce-reddi => append YAPILMAZ" (coordinator file header's own
      // invariant): the rejected command must not have appended anything,
      // and the flow's context must remain exactly COMPLETED.
      expect(readFlowEvents(root, flowId)).toHaveLength(eventCountBeforeRejectedCommand);
      expect(coordinator.getFlow(flowId).state).toBe('COMPLETED');
    });
  });

  // ── 7. do-origin empty-fold coupling (G2) ────────────────────────────
  // A `do`-origin flow runs entirely through the in-memory REPL controller, so
  // the coordinator's `<flowId>.events.jsonl` is EMPTY — `ensureFlowLoaded`
  // folds it to INITIAL. `recordCompletion` then reduces RUN_COMPLETED against
  // INITIAL, which the reducer legitimately rejects (no prior RUN_STARTED). This
  // is exactly why `start.ts` wraps the closure-folding `recordCompletion` call
  // in a best-effort try/catch: for a do-origin run the throw is EXPECTED and a
  // completion-log failure must never fail the run itself.
  describe('do-origin empty-fold coupling', () => {
    it('recordCompletion on a flow with an empty event log throws InvalidTransitionError and appends nothing', () => {
      const flowId = generateFlowId('do-origin');
      const coordinator = createRunFlowCoordinator({ root, now: makeClock() });

      // Precondition: no durable events (mirrors a do-origin flow whose trail
      // lives only in the in-memory controller, never in the coordinator log).
      expect(readFlowEvents(root, flowId)).toHaveLength(0);

      expect(() =>
        coordinator.recordCompletion({
          flowId,
          summary: 'run completed',
          commandId: `child-complete-${flowId}`,
        }),
      ).toThrow(InvalidTransitionError);

      // reduce-first guard: the rejected command must not have appended anything,
      // so the durable log stays exactly as empty as it started.
      expect(readFlowEvents(root, flowId)).toHaveLength(0);
    });
  });
});
