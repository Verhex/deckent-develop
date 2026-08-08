// APPROVE-006 (MASTER-PLAN §4G) — run-on-approve: the loop re-drives a parked
// approval so a recorded human decision is CONSUMED (and executed) within the
// next cycles, instead of waiting for the flow's next cron fire (which mints a
// new trigger id and never matches the decision).
//
// Mechanism: the approval gate exposes takeResolved() — a parked trigger whose
// decision is recorded ON DISK (cross-process) — and the trigger source re-emits
// it ahead of scheduled flows. takeResolved returns ONLY decided triggers, so an
// un-approved park never busy-loops the zero-sleep active path.
//
// Hermetic: pending.json + decisions.json under os.tmpdir().

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeApprovalGate } from '../../../src/orchestra/autonomous/approval-adapter.js';
import { makeTriggerSource } from '../../../src/orchestra/autonomous/trigger-adapter.js';
import { autonomousPendingPath } from '../../../src/core/constants.js';
import { readPendingApprovals } from '../../../src/core/pending-approvals.js';
import {
  buildAutonomousRuntime,
  runAutonomousLoop,
} from '../../../src/orchestra/autonomous/runtime-loop.js';
import type {
  AutonomousTrigger,
  AutonomousRuntimeDeps,
  AuthorityChecker,
} from '../../../src/orchestra/autonomous-runtime.js';
import type { SelfDispatchPolicy } from '../../../src/core/self-dispatch.js';

const policy: SelfDispatchPolicy = {
  id: 'p',
  trigger: 'scheduled',
  action: 'start',
  guard: { requiresApproval: true },
};

const trig = (id: string, payload?: unknown): AutonomousTrigger => ({
  id,
  source: 'scheduled-flow',
  action: 'start',
  requestedBy: 'system',
  payload,
});

const noSleep = async (): Promise<void> => {};

describe('APPROVE-006 — run-on-approve re-drive', () => {
  let dir: string;
  let pendingPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'deckent-redrive-'));
    pendingPath = join(dir, 'pending.json');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  describe('approval-adapter.takeResolved', () => {
    it('returns null for a parked-but-undecided trigger (no busy-loop)', async () => {
      const gate = makeApprovalGate({ pendingPath });
      await gate.request(trig('t1'));
      expect(gate.takeResolved()).toBeNull();
    });

    it('returns the full trigger (payload intact) once a decision is on disk', async () => {
      const loopGate = makeApprovalGate({ pendingPath });
      await loopGate.request(trig('t1', { k: 1 }));
      makeApprovalGate({ pendingPath }).accept('t1'); // separate process
      const got = loopGate.takeResolved();
      expect(got?.id).toBe('t1');
      expect((got?.payload as { k?: number })?.k).toBe(1);
    });

    it('does not consume — request() still applies the decision afterwards', async () => {
      const gate = makeApprovalGate({ pendingPath });
      await gate.request(trig('t1'));
      makeApprovalGate({ pendingPath }).accept('t1');
      gate.takeResolved();
      expect((await gate.request(trig('t1'))).outcome).toBe('approved');
    });
  });

  describe('trigger-adapter re-drive (resolvedProvider)', () => {
    it('yields a resolved trigger ahead of scheduled flows', async () => {
      let n = 0;
      const src = makeTriggerSource({
        flows: [],
        policy,
        resolvedProvider: () => (n++ === 0 ? trig('redrive-1') : null),
      });
      expect((await src.next())?.id).toBe('redrive-1');
    });

    it('drains a resolved trigger even when policy.disabled', async () => {
      const src = makeTriggerSource({
        flows: [],
        policy: { ...policy, disabled: true },
        resolvedProvider: () => trig('redrive-1'),
      });
      expect((await src.next())?.id).toBe('redrive-1');
    });
  });

  describe('bundle wiring (buildAutonomousRuntime)', () => {
    it('wires gate.takeResolved into the trigger source — approve makes next() re-emit', async () => {
      const { deps, approvalGate } = buildAutonomousRuntime({
        projectRoot: dir,
        flows: [],
        policy,
        actionHandlers: new Map(),
        pendingPath,
      });
      await approvalGate.request(trig('t1'));
      approvalGate.accept('t1');
      expect((await deps.triggerSource.next())?.id).toBe('t1');
    });
  });

  describe('end-to-end run-on-approve', () => {
    it('an approved parked trigger is executed within the next cycles', async () => {
      const gate = makeApprovalGate({ pendingPath });
      const executed: string[] = [];
      const authority: AuthorityChecker = {
        check: () => ({ outcome: 'needs_approval', reason: 'test' }),
      };
      let fired = false;
      const triggerSource = {
        async next(): Promise<AutonomousTrigger | null> {
          const resolved = gate.takeResolved();
          if (resolved) return resolved;
          if (!fired) {
            fired = true;
            return trig('t1');
          }
          return null;
        },
      };
      const deps: AutonomousRuntimeDeps = {
        triggerSource,
        authority,
        approvalGate: gate,
        executor: {
          execute: (t) => {
            executed.push(t.id);
            return { ok: true };
          },
        },
        audit: { record: () => {} },
      };

      // Cycle 1: trigger fires → parks pending, NOT executed.
      await runAutonomousLoop({}, deps, { intervalMs: 0, maxIterations: 1, sleep: noSleep });
      expect(executed).toEqual([]);

      // Human approves from a separate process.
      makeApprovalGate({ pendingPath }).accept('t1');

      // Next cycles: re-drive → request consumes the decision → execute.
      await runAutonomousLoop({}, deps, { intervalMs: 0, maxIterations: 2, sleep: noSleep });
      expect(executed).toEqual(['t1']);
    });
  });

  // ═══ APPROVAL-001 T1 — park↔read path contract (producer→consumer) ══════════
  // The guard made the read path load-bearing: an id absent from the on-disk
  // queue is refused fail-closed. That is only safe if the loop PARKS at the
  // exact path the API/MCP/CLI/dashboard READ. This pins that contract end to
  // end through real I/O — the runtime's own gate is the producer, the shared
  // canonical resolver is the location, and readPendingApprovals (the hub every
  // read surface consumes) is the consumer. If either side drifts off the one
  // autonomousPendingPath resolver, this fails instead of silently 403-ing every
  // real approval in production.
  describe('park↔read contract via the canonical resolver', () => {
    it('the runtime gate parks at autonomousPendingPath, and the read hub finds it there', async () => {
      const bundle = buildAutonomousRuntime({
        projectRoot: dir,
        flows: [],
        policy,
        actionHandlers: new Map(),
        // Production feeds the resolver here (buildEngineRuntime → this builder).
        pendingPath: autonomousPendingPath(dir),
      });

      // Producer: the loop's own gate parks a needs_approval trigger.
      const parked = await bundle.approvalGate.request(trig('park-1'));
      expect(parked.outcome).toBe('pending');

      // The file materialized at EXACTLY the shared resolver location…
      expect(existsSync(autonomousPendingPath(dir))).toBe(true);

      // …and the consumer hub (dashboard/status/MCP read through this) sees it
      // by reading the SAME resolver — no private path copy in between.
      const seen = readPendingApprovals(dir);
      expect(seen.some((p) => p.kind === 'autonomous' && p.id === 'park-1')).toBe(true);
    });
  });
});
