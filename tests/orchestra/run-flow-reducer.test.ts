import { describe, it, expect } from 'vitest';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
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
import { createDefaultConfig, DEFAULT_TERMINAL_CONFIG, mergeConfigs } from '../../src/core/config.js';
import type { DeckentConfig } from '../../src/core/types.js';

// TERM-FLOW-UNIFY Sprint-1 dilim (422-001,
// docs/analysis/term-flow-unify-design-2026-07-11.md). `reduceRunFlow` is a
// pure function — every fixture below is plain data, no fakes/seams needed
// (unlike golden-flow.test.ts, which injects async seams for an orchestrator
// that actually calls out). No fs/env/Date.now anywhere in the reducer or
// contract under test; the "zero production caller" describe block below is
// the one place this suite legitimately reads the real `src/` tree, to pin
// that fact rather than assume it.

const FLOW_ID = 'flow-1';
const ACTOR: ActorContext = { id: 'actor-1', role: 'operator', tenantId: 'tenant-1' };
const APPROVER: ActorContext = { id: 'approver-1' };
const REVISION = 1;
const DIGEST = 'digest-abc';

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
  partial: DistributiveOmit<RunFlowEvent, 'schemaVersion' | 'flowId' | 'timestamp'> & { flowId?: string },
): RunFlowEvent {
  return {
    schemaVersion: RUN_FLOW_EVENT_SCHEMA_VERSION,
    flowId: FLOW_ID,
    timestamp: nextTimestamp(),
    ...partial,
  } as RunFlowEvent;
}

// ─── Fixture event builders (reused across happy-path + invalid-transition tests) ──
const proposalSubmitted = () => ev({ type: 'PROPOSAL_SUBMITTED', proposal: proposal() });
const previewStarted = () => ev({ type: 'PREVIEW_STARTED', revision: REVISION });
const previewReady = () => ev({ type: 'PREVIEW_READY', preview: preview() });
const approvalGranted = () => ev({ type: 'APPROVAL_GRANTED', revision: REVISION, planDigest: DIGEST, approvedBy: APPROVER });
const approvalRejected = () => ev({ type: 'APPROVAL_REJECTED', revision: REVISION });
const startRequested = () => ev({ type: 'START_REQUESTED', revision: REVISION, planDigest: DIGEST });
const runStarted = () => ev({ type: 'RUN_STARTED', handle: handle() });
const runCompleted = () => ev({ type: 'RUN_COMPLETED', summary: 'ok' });
const runFailed = () => ev({ type: 'RUN_FAILED', error: 'boom' });
const flowAborted = () => ev({ type: 'FLOW_ABORTED' });

/** Drives the reducer through the full happy-path trajectory, one stage at a time. */
function driveToState(target:
  | 'COLLECTING'
  | 'PROPOSAL_READY'
  | 'PREVIEWING'
  | 'AWAITING_APPROVAL'
  | 'APPROVED'
  | 'STARTING'
  | 'DETACHED_RUNNING'
  | 'COMPLETED',
): RunFlowContext {
  let ctx = createInitialRunFlowContext();
  if (target === 'COLLECTING') return ctx;
  ctx = reduceRunFlow(ctx, proposalSubmitted());
  if (target === 'PROPOSAL_READY') return ctx;
  ctx = reduceRunFlow(ctx, previewStarted());
  if (target === 'PREVIEWING') return ctx;
  ctx = reduceRunFlow(ctx, previewReady());
  if (target === 'AWAITING_APPROVAL') return ctx;
  ctx = reduceRunFlow(ctx, approvalGranted());
  if (target === 'APPROVED') return ctx;
  ctx = reduceRunFlow(ctx, startRequested());
  if (target === 'STARTING') return ctx;
  ctx = reduceRunFlow(ctx, runStarted());
  if (target === 'DETACHED_RUNNING') return ctx;
  ctx = reduceRunFlow(ctx, runCompleted());
  return ctx;
}

describe('reduceRunFlow — happy path (full trajectory)', () => {
  it('drives COLLECTING through COMPLETED, carrying every payload forward', () => {
    const collecting = createInitialRunFlowContext();
    expect(collecting.state).toBe('COLLECTING');
    expect(collecting.flowId).toBeUndefined();

    const proposalReady = reduceRunFlow(collecting, proposalSubmitted());
    expect(proposalReady.state).toBe('PROPOSAL_READY');
    expect(proposalReady.flowId).toBe(FLOW_ID);
    expect(proposalReady.proposal?.intentSummary).toBe('Do the thing.');

    const previewing = reduceRunFlow(proposalReady, previewStarted());
    expect(previewing.state).toBe('PREVIEWING');

    const awaitingApproval = reduceRunFlow(previewing, previewReady());
    expect(awaitingApproval.state).toBe('AWAITING_APPROVAL');
    expect(awaitingApproval.preview?.planDigest).toBe(DIGEST);

    const approved = reduceRunFlow(awaitingApproval, approvalGranted());
    expect(approved.state).toBe('APPROVED');
    expect(approved.approvedSnapshot).toEqual({
      flowId: FLOW_ID,
      revision: REVISION,
      planDigest: DIGEST,
      approvedBy: APPROVER,
      approvedAt: approved.updatedAt,
    });

    const starting = reduceRunFlow(approved, startRequested());
    expect(starting.state).toBe('STARTING');

    const detachedRunning = reduceRunFlow(starting, runStarted());
    expect(detachedRunning.state).toBe('DETACHED_RUNNING');
    expect(detachedRunning.handle?.jobId).toBe('job-1');

    const completed = reduceRunFlow(detachedRunning, runCompleted());
    expect(completed.state).toBe('COMPLETED');
    // Payloads from every earlier stage survive to the terminal context.
    expect(completed.proposal).toBeDefined();
    expect(completed.preview).toBeDefined();
    expect(completed.approvedSnapshot).toBeDefined();
    expect(completed.handle).toBeDefined();
  });

  it('DETACHED_RUNNING can also terminate via RUN_FAILED', () => {
    const running = driveToState('DETACHED_RUNNING');
    const failed = reduceRunFlow(running, runFailed());
    expect(failed.state).toBe('FAILED');
    expect(failed.failureReason).toBe('boom');
  });

  it('STARTING can terminate via RUN_FAILED (spawn itself failed)', () => {
    const starting = driveToState('STARTING');
    const failed = reduceRunFlow(starting, runFailed());
    expect(failed.state).toBe('FAILED');
  });
});

describe('reduceRunFlow — invalid transitions (typed error, never a silent no-op)', () => {
  const cases: Array<{ name: string; from: Parameters<typeof driveToState>[0]; event: () => RunFlowEvent }> = [
    { name: 'PROPOSAL_SUBMITTED from PROPOSAL_READY', from: 'PROPOSAL_READY', event: proposalSubmitted },
    { name: 'PREVIEW_STARTED from COLLECTING', from: 'COLLECTING', event: previewStarted },
    { name: 'PREVIEW_READY from PROPOSAL_READY', from: 'PROPOSAL_READY', event: previewReady },
    { name: 'APPROVAL_GRANTED from PREVIEWING', from: 'PREVIEWING', event: approvalGranted },
    { name: 'APPROVAL_REJECTED from APPROVED', from: 'APPROVED', event: approvalRejected },
    { name: 'START_REQUESTED from AWAITING_APPROVAL', from: 'AWAITING_APPROVAL', event: startRequested },
    { name: 'RUN_STARTED from APPROVED', from: 'APPROVED', event: runStarted },
    { name: 'RUN_COMPLETED from STARTING', from: 'STARTING', event: runCompleted },
    { name: 'RUN_FAILED from APPROVED', from: 'APPROVED', event: runFailed },
  ];

  for (const { name, from, event } of cases) {
    it(`throws RunFlowTransitionError: ${name}`, () => {
      const ctx = driveToState(from);
      expect(() => reduceRunFlow(ctx, event())).toThrow(RunFlowTransitionError);
      try {
        reduceRunFlow(ctx, event());
      } catch (err) {
        expect(err).toBeInstanceOf(RunFlowTransitionError);
        const typedErr = err as RunFlowTransitionError;
        expect(typedErr.fromState).toBe(from);
        expect(typedErr.eventType).toBe(event().type);
      }
    });
  }

  it('rejects an event whose schemaVersion is not the current one', () => {
    const ctx = createInitialRunFlowContext();
    const badEvent = { ...proposalSubmitted(), schemaVersion: 99 } as unknown as RunFlowEvent;
    expect(() => reduceRunFlow(ctx, badEvent)).toThrow(RunFlowTransitionError);
  });

  it('rejects an event whose flowId does not match the context flowId', () => {
    const ctx = driveToState('PROPOSAL_READY');
    const mismatched = { ...previewStarted(), flowId: 'some-other-flow' } as RunFlowEvent;
    expect(() => reduceRunFlow(ctx, mismatched)).toThrow(RunFlowTransitionError);
  });

  it('rejects PROPOSAL_SUBMITTED whose proposal.flowId does not match the event envelope flowId', () => {
    const ctx = createInitialRunFlowContext();
    const badEvent = ev({ type: 'PROPOSAL_SUBMITTED', proposal: proposal({ flowId: 'other-flow' }) });
    expect(() => reduceRunFlow(ctx, badEvent)).toThrow(RunFlowTransitionError);
  });

  it('every terminal state (COMPLETED/FAILED/CANCELLED/BLOCKED) rejects every further event', () => {
    const completed = driveToState('COMPLETED');
    expect(() => reduceRunFlow(completed, flowAborted())).toThrow(RunFlowTransitionError);

    const failed = reduceRunFlow(driveToState('DETACHED_RUNNING'), runFailed());
    expect(() => reduceRunFlow(failed, flowAborted())).toThrow(RunFlowTransitionError);

    const cancelled = reduceRunFlow(driveToState('AWAITING_APPROVAL'), approvalRejected());
    expect(() => reduceRunFlow(cancelled, flowAborted())).toThrow(RunFlowTransitionError);

    const blocked = reduceRunFlow(
      driveToState('AWAITING_APPROVAL'),
      ev({ type: 'APPROVAL_GRANTED', revision: REVISION, planDigest: 'wrong-digest', approvedBy: APPROVER }),
    );
    expect(blocked.state).toBe('BLOCKED');
    expect(() => reduceRunFlow(blocked, flowAborted())).toThrow(RunFlowTransitionError);
  });
});

describe('reduceRunFlow — cancel at every stage (golden-flow.ts:153 organ transplant)', () => {
  const nonTerminalStages: Array<Parameters<typeof driveToState>[0]> = [
    'COLLECTING',
    'PROPOSAL_READY',
    'PREVIEWING',
    'AWAITING_APPROVAL',
    'APPROVED',
    'STARTING',
    'DETACHED_RUNNING',
  ];

  for (const stage of nonTerminalStages) {
    it(`FLOW_ABORTED from ${stage} cancels, and START_REQUESTED never applies afterward`, () => {
      const ctx = driveToState(stage);
      const cancelled = reduceRunFlow(ctx, flowAborted());
      expect(cancelled.state).toBe('CANCELLED');
      expect(cancelled.cancelReason).toBe('aborted');
      // The ported golden-flow invariant: once cancelled, start is unreachable.
      expect(() => reduceRunFlow(cancelled, startRequested())).toThrow(RunFlowTransitionError);
    });
  }

  it('APPROVAL_REJECTED at AWAITING_APPROVAL cancels with reason "rejected", and start is unreachable afterward', () => {
    const awaitingApproval = driveToState('AWAITING_APPROVAL');
    const cancelled = reduceRunFlow(awaitingApproval, approvalRejected());
    expect(cancelled.state).toBe('CANCELLED');
    expect(cancelled.cancelReason).toBe('rejected');
    expect(() => reduceRunFlow(cancelled, startRequested())).toThrow(RunFlowTransitionError);
  });
});

describe('reduceRunFlow — idempotency (flowId+revision+digest key)', () => {
  it('a duplicate APPROVAL_GRANTED with a matching CAS key is a no-op (same context reference)', () => {
    const awaitingApproval = driveToState('AWAITING_APPROVAL');
    const approved = reduceRunFlow(awaitingApproval, approvalGranted());
    const replay = reduceRunFlow(approved, approvalGranted());
    expect(replay).toBe(approved); // exact reference — proves no re-computation/double-effect
  });

  it('a duplicate APPROVAL_GRANTED with a mismatched CAS key is BLOCKED, not silently replayed', () => {
    const awaitingApproval = driveToState('AWAITING_APPROVAL');
    const approved = reduceRunFlow(awaitingApproval, approvalGranted());
    const conflicting = reduceRunFlow(
      approved,
      ev({ type: 'APPROVAL_GRANTED', revision: REVISION, planDigest: 'different-digest', approvedBy: APPROVER }),
    );
    expect(conflicting.state).toBe('BLOCKED');
  });

  it('a duplicate START_REQUESTED with a matching CAS key is a no-op while STARTING', () => {
    const approved = driveToState('APPROVED');
    const starting = reduceRunFlow(approved, startRequested());
    const replay = reduceRunFlow(starting, startRequested());
    expect(replay).toBe(starting);
  });

  it('a duplicate START_REQUESTED with a matching CAS key is a no-op while DETACHED_RUNNING (double-start guard)', () => {
    const detachedRunning = driveToState('DETACHED_RUNNING');
    const replay = reduceRunFlow(detachedRunning, startRequested());
    expect(replay).toBe(detachedRunning);
  });

  it('a duplicate START_REQUESTED with a mismatched CAS key is BLOCKED, not silently replayed', () => {
    const detachedRunning = driveToState('DETACHED_RUNNING');
    const conflicting = reduceRunFlow(
      detachedRunning,
      ev({ type: 'START_REQUESTED', revision: REVISION, planDigest: 'different-digest' }),
    );
    expect(conflicting.state).toBe('BLOCKED');
  });

  it('a duplicate RUN_STARTED with the same jobId while DETACHED_RUNNING is a no-op', () => {
    const detachedRunning = driveToState('DETACHED_RUNNING');
    const replay = reduceRunFlow(detachedRunning, ev({ type: 'RUN_STARTED', handle: handle() }));
    expect(replay).toBe(detachedRunning);
  });
});

describe('reduceRunFlow — revision/digest mismatch -> BLOCKED', () => {
  it('APPROVAL_GRANTED targeting a stale revision/digest is BLOCKED, not an error', () => {
    const awaitingApproval = driveToState('AWAITING_APPROVAL');
    const blocked = reduceRunFlow(
      awaitingApproval,
      ev({ type: 'APPROVAL_GRANTED', revision: REVISION, planDigest: 'stale-digest', approvedBy: APPROVER }),
    );
    expect(blocked.state).toBe('BLOCKED');
    expect(blocked.blockedReason).toContain('stale-digest');
  });

  it('START_REQUESTED targeting a stale revision/digest against the approved snapshot is BLOCKED', () => {
    const approvedCtx = driveToState('APPROVED');
    const blocked = reduceRunFlow(
      approvedCtx,
      ev({ type: 'START_REQUESTED', revision: REVISION, planDigest: 'stale-digest' }),
    );
    expect(blocked.state).toBe('BLOCKED');
    expect(blocked.blockedReason).toContain('stale-digest');
  });
});

describe('config: terminal.run_flow_v2 flag (default-off, opt-in override)', () => {
  it('DEFAULT_TERMINAL_CONFIG does not set run_flow_v2 (locked key-shape, config-terminal.test.ts)', () => {
    expect((DEFAULT_TERMINAL_CONFIG as { run_flow_v2?: boolean }).run_flow_v2).toBeUndefined();
  });

  it('createDefaultConfig() resolves run_flow_v2 as falsy (absent) by default', () => {
    const cfg = createDefaultConfig();
    expect(cfg.terminal?.run_flow_v2).toBeFalsy();
  });

  it('mergeConfigs(null, null) resolves terminal.run_flow_v2 as falsy by default', () => {
    const resolved = mergeConfigs(null, null);
    expect(resolved.terminal?.run_flow_v2).toBeFalsy();
  });

  it('an explicit project override flips terminal.run_flow_v2 to true (existing deepMerge pass-through, no new wiring)', () => {
    const override: Partial<DeckentConfig> = {
      terminal: { run_flow_v2: true } as DeckentConfig['terminal'],
    };
    const resolved = mergeConfigs(null, override);
    expect(resolved.terminal?.run_flow_v2).toBe(true);
    // Unrelated defaults are untouched by the partial override.
    expect(resolved.terminal?.enabled).toBe(true);
    expect(resolved.terminal?.maxSessions).toBe(10);
  });
});

describe('known-consumer allowlist (Sprint-1 pin evolved for Sprint-2: preview-service/compiler are the legitimate consumers; born-671/427-020 folds run-flow-store in after its cli/repl/ -> core/ move)', () => {
  // Matches an actual ESM import/require specifier ending in the module's
  // .js output path (this project's Node16 resolution requires the `.js`
  // extension — see CLAUDE.md gotchas) — NOT a prose doc-comment mentioning
  // the filename (e.g. config-types.ts cites `run-flow-contract.ts` by name
  // in its flag doc-comment; that is not an import and must not count).
  const IMPORT_PATTERN = /\b(?:from|require\()\s*['"][^'"]*\/run-flow-(?:reducer|contract|store)\.js['"]/;

  it('nothing under src/ imports run-flow-reducer, run-flow-contract, or run-flow-store except their designed consumers', () => {
    const testFileDir = fileURLToPath(new URL('.', import.meta.url));
    const srcRoot = join(testFileDir, '..', '..', 'src');
    const offenders: string[] = [];

    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const stat = statSync(full);
        if (stat.isDirectory()) {
          walk(full);
          continue;
        }
        if (!entry.endsWith('.ts') && !entry.endsWith('.tsx')) continue;
        const rel = relative(srcRoot, full).split(sep).join('/');
        // The pair is allowed to reference each other; nothing else may.
        if (rel === 'core/run-flow-contract.ts' || rel === 'orchestra/run-flow-reducer.ts') continue;
        const content = readFileSync(full, 'utf8');
        if (IMPORT_PATTERN.test(content)) {
          offenders.push(rel);
        }
      }
    };
    walk(srcRoot);

    const KNOWN_CONSUMERS = [
      // SURF-1b (sprint-439): the durable multi-flow coordinator IS the designed
      // single-writer around reducer+store+contract — the central consumer this
      // whole slice exists to create (CC pin-sync; 439-002's own scope carried
      // this pin but ended NO_GO — the coordinator itself landed via 439-001).
      'orchestra/run-flow-coordinator.ts',
      // SURF-1a (sprint-438): the durable event-log lives in the store, so the
      // store now imports the contract's RunFlowEvent type to append/read
      // sequenced events — the designed persistence consumer, not a leak.
      'core/run-flow-store.ts',
      // Sprint-2 dilim (424-001): the shared actual-preview layer is the
      // designed consumer of the contract/reducer pair — not a leak.
      'orchestra/plan-preview-service.ts',
      'orchestra/run-proposal-compiler.ts',
      // Sprint-3 dilim (425-001): the native host-coordinator + card drive the
      // reducer behind terminal.run_flow_v2 — the designed front-door consumers.
      'cli/repl/run-flow-controller.ts',
      'cli/repl/plan-preview-card.tsx',
      'cli/repl/native-tool-registry.ts',
      'cli/repl/cli-bridge-tool-specs.ts',
      // Sprint-4 dilim (426-002): app.tsx mounts the card + derives PlanPreview
      // from the controller context — the designed live-mount consumer.
      'cli/repl/app.tsx',
      // born-671 (sprint-427, 427-020): run-flow-store.ts moved cli/repl/ ->
      // core/ (Layer-0, freely importable) — these two start entrypoints
      // reading it directly used to be an mcp<->cli ADR-D-004 C3 violation
      // precedent (mcp/tools/start.ts reaching into cli/repl/); now a
      // legitimate Layer-0 consumer, not a leak.
      'mcp/tools/start.ts',
      'cli/commands/start.ts',
      // Sprint-6 dilim (428-006): `deckent do` flag-on yolda RunFlow'a delege
      // eden compatibility-adapter oldu — tasarımın öngördüğü tüketici.
      'cli/commands/do.ts',
      // Sprint-7 dilim (429-008/429-009, 429-010 pin güncellemesi): REST
      // route-katmanı (propose/state/preview/decision) ve onun SSE ikizi
      // (flowId-scoped event-stream) — reducer/contract çiftinin tasarlanan
      // API-yüzeyi tüketicileri, sızıntı değil.
      'api/run-flow-routes.ts',
      'api/run-flow-event-stream.ts',
    ];
    expect(offenders.filter((o) => !KNOWN_CONSUMERS.includes(o))).toEqual([]);
  });
});
