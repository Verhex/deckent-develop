import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ResolvedApprovalLifecycleConfig } from '../../../src/core/config-types.js';
import { runAutonomousCycle, type AutonomousTrigger } from '../../../src/orchestra/autonomous-runtime.js';
import { makeApprovalGate } from '../../../src/orchestra/autonomous/approval-adapter.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const LIFECYCLE: ResolvedApprovalLifecycleConfig = {
  enabled: true,
  profiles: {
    confirmation: { ttlMs: 8_000, slaMs: [1_000, 2_000, 4_000], riskTier: 'elevated', timeoutDisposition: 'park-undecidable', blocking: 'run' },
    'autonomous-trigger': { ttlMs: 1_000, slaMs: [100, 200, 500], riskTier: 'elevated', timeoutDisposition: 'park-alert', blocking: 'trigger' },
    'gateway-pairing': { ttlMs: 1_000, slaMs: [100, 200, 500], riskTier: 'critical', timeoutDisposition: 'deny-expire', blocking: 'security' },
    'broker-native': { ttlMs: 1_000, slaMs: [100, 200, 500], riskTier: 'routine', timeoutDisposition: 'request-default', blocking: 'request' },
  },
};

describe('autonomous timeout no-replay integration', () => {
  it('never executes, redrives or revives a trigger after timeout, including restart', async () => {
    const root = mkdtempSync(join(tmpdir(), 'autonomous-no-replay-'));
    roots.push(root);
    const pendingPath = join(root, '.deckent', 'autonomous', 'pending.json');
    let clock = '2026-08-21T12:00:00.000Z';
    const trigger: AutonomousTrigger = {
      id: 'timeout-no-replay',
      source: 'autonomous-backlog',
      action: 'autonomous.execute',
      requestedBy: 'system:policy-gate',
    };
    const gate = makeApprovalGate({
      projectRoot: root,
      pendingPath,
      lifecycle: LIFECYCLE,
      now: () => clock,
    });
    const execute = vi.fn(async () => ({ ok: true }));
    let queued: AutonomousTrigger | null = trigger;
    const deps = {
      triggerSource: { next: async () => {
        const next = queued;
        queued = null;
        return next;
      } },
      authority: { check: () => ({ outcome: 'needs_approval' as const, reason: 'attended decision required' }) },
      approvalGate: gate,
      executor: { execute },
      audit: { record: vi.fn() },
      now: () => clock,
    };

    expect((await runAutonomousCycle({}, deps)).outcome).toBe('pending');
    expect(execute).not.toHaveBeenCalled();

    clock = '2026-08-21T12:00:01.500Z';
    expect(gate.pending()).toEqual([]);
    expect(gate.readTerminal(trigger.id)).toMatchObject({
      kind: 'timeout',
      closureReason: 'expired',
      replayAllowed: false,
    });
    queued = gate.takeResolved();
    expect((await runAutonomousCycle({}, deps)).outcome).toBe('no_trigger');

    // Even if an upstream source incorrectly offers the same id again, the
    // terminal FWW truth rejects it before the action executor.
    queued = trigger;
    expect((await runAutonomousCycle({}, deps)).outcome).toBe('rejected');
    expect(execute).not.toHaveBeenCalled();

    const restarted = makeApprovalGate({
      projectRoot: root,
      pendingPath,
      lifecycle: LIFECYCLE,
      now: () => clock,
    });
    expect(restarted.takeResolved()).toBeNull();
    expect(restarted.readTerminal(trigger.id)).toMatchObject({ kind: 'timeout', replayAllowed: false });
    expect(execute).not.toHaveBeenCalled();
  });
});
