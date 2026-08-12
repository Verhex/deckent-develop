// ═══ 524-013 — runs-inbox hygiene: typed supersession ══════════════════════
//
// The measured problem: 7+ stale "onay bekliyor" (AWAITING_APPROVAL) duplicates
// of superseded plan attempts pollute the runs inbox. The fix lives in the FLOW
// AUTHORITY, not the CLI — contract (`superseded` cancel reason + a persisted
// `supersededBy` reference), reducer (persists it), coordinator (computes the
// superseded set from the digest the flow record ALREADY persists). The CLI only
// consumes the service and renders it.
//
// Hermetic: every case builds its own tmpdir root (async node:fs/promises, no
// spawnSync) and drives the REAL store + REAL coordinator. Timestamps come from
// an injected deterministic clock, never the wall clock, so "newest survives" is
// reproducible on any machine.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createRunFlowCoordinator,
  type RunFlowCoordinator,
} from '../../src/orchestra/run-flow-coordinator.js';
import {
  savePlannedSprint,
  appendFlowEvent,
} from '../../src/core/run-flow-store.js';
import {
  RUN_FLOW_EVENT_SCHEMA_VERSION,
  RUN_FLOW_PLAN_SOURCE_AUTHORITY_SCHEMA_VERSION,
  type RunFlowPlanSourceAuthority,
} from '../../src/core/run-flow-contract.js';
import { makeRunProposal, makePlanPreview } from '../orchestra/run-flow-coordinator-harness.js';
import { buildRetireSupersededLines } from '../../src/cli/commands/runs.js';
import { getMessage } from '../../src/cli/helpers/messages.js';

const APPROVER = { id: 'test-operator' } as const;

/** Two distinct plan/directives sources. The supersession key is derived from
 *  the ALREADY-persisted authority, so the fixture writes a real one. */
const SOURCE_ALPHA = 'a'.repeat(64);
const SOURCE_BETA = 'b'.repeat(64);

function planSourceAuthority(contentSha256: string): RunFlowPlanSourceAuthority {
  return {
    schemaVersion: RUN_FLOW_PLAN_SOURCE_AUTHORITY_SCHEMA_VERSION,
    sourceKind: 'directives',
    contentSha256,
    configSha256: 'c'.repeat(64),
    proposalSha256: 'd'.repeat(64),
    planningInputSha256: 'e'.repeat(64),
    scopeInputSha256: 'f'.repeat(64),
    lineageSha256: '0'.repeat(64),
  };
}

describe('runs-inbox hygiene — typed supersession through the flow authority', () => {
  let root: string;
  let tick: number;
  let coordinator: RunFlowCoordinator;

  /** Deterministic monotonic clock — one second per event, so a flow seeded
   *  later is provably "newer" without reading a wall clock. */
  const now = (): string => new Date(Date.UTC(2026, 7, 12, 0, 0, tick++)).toISOString();

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'runs-inbox-hygiene-'));
    tick = 0;
    coordinator = createRunFlowCoordinator({ root, now });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  /** A flow that is durably AWAITING_APPROVAL, with a persisted plan record
   *  carrying `contentSha256` as its source authority. */
  function seedPendingFlow(flowId: string, contentSha256: string | undefined, revision = 1): string {
    const planDigest = `digest-${flowId}`;
    savePlannedSprint(root, flowId, {
      revision,
      sprint: {},
      planDigest,
      ...(contentSha256 !== undefined ? { sourceAuthority: planSourceAuthority(contentSha256) } : {}),
    });
    coordinator.proposeFlow({ proposal: makeRunProposal({ flowId, revision }) });
    coordinator.recordPreview({ preview: makePlanPreview({ flowId, revision, planDigest }) });
    return planDigest;
  }

  /** A flow that actually started — DETACHED_RUNNING, the class a supersession
   *  may never touch. */
  function seedStartedFlow(flowId: string, contentSha256: string, revision = 1): void {
    const planDigest = seedPendingFlow(flowId, contentSha256, revision);
    coordinator.grantApproval({ flowId, revision, planDigest, approvedBy: APPROVER });
    coordinator.requestStart({ flowId, revision, planDigest });
    coordinator.recordRunStarted({ handle: { flowId, jobId: `job-${flowId}`, logRef: `log-${flowId}` } });
  }

  it('classifies exactly the superseded set and writes nothing in a dry-run', () => {
    seedPendingFlow('flow-alpha-1', SOURCE_ALPHA);
    seedPendingFlow('flow-alpha-2', SOURCE_ALPHA);
    seedPendingFlow('flow-alpha-3', SOURCE_ALPHA);
    seedPendingFlow('flow-beta-1', SOURCE_BETA);

    const report = coordinator.retireSupersededFlows({ apply: false });

    expect(report.applied).toBe(false);
    expect(report.retired).toEqual([]);
    expect(report.failures).toEqual([]);
    expect(report.superseded.map((e) => e.flowId)).toEqual(['flow-alpha-1', 'flow-alpha-2']);
    expect(report.superseded.every((e) => e.supersededBy === 'flow-alpha-3')).toBe(true);
    expect(report.superseded[0]!.sourceKey).toBe(`directives:${SOURCE_ALPHA}`);

    // Zero writes: every flow is still exactly where it was.
    for (const flowId of ['flow-alpha-1', 'flow-alpha-2', 'flow-alpha-3', 'flow-beta-1']) {
      expect(coordinator.getFlow(flowId).state).toBe('AWAITING_APPROVAL');
    }
  });

  it('retires exactly the superseded set with a persisted supersededBy; the newest survives', () => {
    seedPendingFlow('flow-alpha-1', SOURCE_ALPHA);
    seedPendingFlow('flow-alpha-2', SOURCE_ALPHA);
    seedPendingFlow('flow-alpha-3', SOURCE_ALPHA);
    seedPendingFlow('flow-beta-1', SOURCE_BETA);

    const report = coordinator.retireSupersededFlows({ apply: true });

    expect(report.applied).toBe(true);
    expect(report.failures).toEqual([]);
    expect(report.retired).toEqual(['flow-alpha-1', 'flow-alpha-2']);

    // The survivor and the lone other-source flow are untouched.
    expect(coordinator.getFlow('flow-alpha-3').state).toBe('AWAITING_APPROVAL');
    expect(coordinator.getFlow('flow-beta-1').state).toBe('AWAITING_APPROVAL');

    // The reducer PERSISTED the typed reason + the reference — proven by folding
    // the durable log from a COLD coordinator, not the in-memory cache.
    const cold = createRunFlowCoordinator({ root, now });
    for (const flowId of ['flow-alpha-1', 'flow-alpha-2']) {
      const context = cold.getFlow(flowId);
      expect(context.state).toBe('CANCELLED');
      expect(context.cancelReason).toBe('superseded');
      expect(context.supersededBy).toBe('flow-alpha-3');
    }

    // Nothing was deleted: the retired flows still resolve as records.
    expect(cold.listFlows()).toEqual(
      expect.arrayContaining(['flow-alpha-1', 'flow-alpha-2', 'flow-alpha-3', 'flow-beta-1']),
    );

    // Idempotent: a second sweep has nothing left to retire.
    expect(coordinator.retireSupersededFlows({ apply: true }).superseded).toEqual([]);
  });

  it('never touches a started or terminal flow, nor an ungroupable one', () => {
    // Same source as the pending pair, but this one actually started.
    seedStartedFlow('flow-alpha-started', SOURCE_ALPHA);
    // Same source, already terminal (rejected at the approval gate).
    seedPendingFlow('flow-alpha-rejected', SOURCE_ALPHA);
    coordinator.rejectApproval({ flowId: 'flow-alpha-rejected', revision: 1 });
    // Same source, still pending — two of them, so a supersession is available.
    seedPendingFlow('flow-alpha-pending-1', SOURCE_ALPHA);
    seedPendingFlow('flow-alpha-pending-2', SOURCE_ALPHA);
    // Pending, but no persisted source authority → not groupable, left alone.
    seedPendingFlow('flow-nosource-1', undefined);
    seedPendingFlow('flow-nosource-2', undefined);

    const report = coordinator.retireSupersededFlows({ apply: true });

    expect(report.retired).toEqual(['flow-alpha-pending-1']);
    expect(coordinator.getFlow('flow-alpha-pending-2').state).toBe('AWAITING_APPROVAL');
    expect(coordinator.getFlow('flow-alpha-started').state).toBe('DETACHED_RUNNING');

    const rejected = coordinator.getFlow('flow-alpha-rejected');
    expect(rejected.state).toBe('CANCELLED');
    expect(rejected.cancelReason).toBe('rejected');

    for (const flowId of ['flow-nosource-1', 'flow-nosource-2']) {
      expect(coordinator.getFlow(flowId).state).toBe('AWAITING_APPROVAL');
    }
  });

  it('still parses a legacy abort record — no supersededBy folds to "aborted"', () => {
    seedPendingFlow('flow-legacy', SOURCE_BETA);
    // A FLOW_ABORTED written before the supersession reason existed.
    appendFlowEvent(root, 'flow-legacy', {
      schemaVersion: RUN_FLOW_EVENT_SCHEMA_VERSION,
      flowId: 'flow-legacy',
      timestamp: now(),
      type: 'FLOW_ABORTED',
      reason: 'operator cancelled',
    });

    const context = createRunFlowCoordinator({ root, now }).getFlow('flow-legacy');
    expect(context.state).toBe('CANCELLED');
    expect(context.cancelReason).toBe('aborted');
    expect(context.supersededBy).toBeUndefined();
  });

  it('renders the CLI report through getMessage in en and tr', () => {
    seedPendingFlow('flow-alpha-1', SOURCE_ALPHA);
    seedPendingFlow('flow-alpha-2', SOURCE_ALPHA);

    const dry = coordinator.retireSupersededFlows({ apply: false });
    const dryLines = buildRetireSupersededLines(dry, 'en');
    expect(dryLines[0]).toBe(getMessage('runs.retire_superseded.dry_header', 'en', { count: '1' }));
    expect(dryLines[1]).toContain(getMessage('runs.retire_superseded.entry', 'en', { by: 'flow-alp' }));
    expect(dryLines.at(-1)).toBe(getMessage('runs.retire_superseded.dry_hint', 'en'));

    const trLines = buildRetireSupersededLines(dry, 'tr');
    expect(trLines[0]).toBe(getMessage('runs.retire_superseded.dry_header', 'tr', { count: '1' }));
    expect(trLines[0]).not.toBe(dryLines[0]);

    const applied = coordinator.retireSupersededFlows({ apply: true });
    expect(buildRetireSupersededLines(applied, 'en')[0]).toBe(
      getMessage('runs.retire_superseded.apply_header', 'en', { count: '1' }),
    );

    const empty = coordinator.retireSupersededFlows({ apply: false });
    expect(buildRetireSupersededLines(empty, 'en')).toEqual([getMessage('runs.retire_superseded.none', 'en')]);
  });
});
