import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ResolvedApprovalLifecycleConfig } from '../../../src/core/config-types.js';
import {
  ClosedApprovalRequestError,
  makeApprovalGate,
} from '../../../src/orchestra/autonomous/approval-adapter.js';
import type { AutonomousTrigger } from '../../../src/orchestra/autonomous-runtime.js';
import { buildEngineRuntime } from '../../../src/orchestra/autonomous/runtime-loop.js';

const roots: string[] = [];

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'autonomous-lifecycle-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const LIFECYCLE: ResolvedApprovalLifecycleConfig = {
  enabled: true,
  profiles: {
    confirmation: {
      ttlMs: 8_000,
      slaMs: [1_000, 2_000, 4_000],
      riskTier: 'elevated',
      timeoutDisposition: 'park-undecidable',
      blocking: 'run',
    },
    'autonomous-trigger': {
      ttlMs: 1_000,
      slaMs: [100, 200, 500],
      riskTier: 'elevated',
      timeoutDisposition: 'park-alert',
      blocking: 'trigger',
    },
    'gateway-pairing': {
      ttlMs: 1_000,
      slaMs: [100, 200, 500],
      riskTier: 'critical',
      timeoutDisposition: 'deny-expire',
      blocking: 'security',
    },
    'broker-native': {
      ttlMs: 1_000,
      slaMs: [100, 200, 500],
      riskTier: 'routine',
      timeoutDisposition: 'request-default',
      blocking: 'request',
    },
  },
};

function paths(root: string) {
  const dir = join(root, '.deckent', 'autonomous');
  return { dir, pendingPath: join(dir, 'pending.json'), decisionsPath: join(dir, 'decisions.json') };
}

function trigger(id: string): AutonomousTrigger {
  return {
    id,
    source: 'autonomous-backlog',
    action: 'autonomous.execute',
    requestedBy: 'system:policy-gate',
    payload: {
      entry: {
        id,
        title: id,
        kind: 'task',
        spec: { description: 'npm publish the package' },
        policy: 'risk-tagged',
        trigger: { type: 'one-off' },
        status: 'parked',
        lastRun: null,
        lastResult: null,
      },
    },
  };
}

describe('autonomous approval lifecycle authority', () => {
  it('threads resolved lifecycle, project root and tenant authority through the engine composition root', async () => {
    const root = fixtureRoot();
    const { pendingPath } = paths(root);
    const bundle = buildEngineRuntime({
      projectRoot: root,
      config: {
        approval: { lifecycle: LIFECYCLE },
        strict_tenant_isolation: true,
      } as never,
      backlogPath: join(root, '.deckent', 'autonomous', 'backlog.json'),
      flows: [],
      policy: { id: 'disabled', disabled: true } as never,
      runTask: vi.fn(),
      executeSprint: vi.fn(),
      waitForResult: vi.fn().mockResolvedValue(null),
      pendingPath,
      now: () => '2026-08-21T10:00:00.000Z',
      actor: {
        id: 'tenant-operator',
        tenantId: 'tenant-a',
        role: 'operator',
        identityClass: 'service',
        assurance: 'token-verified',
        provenance: 'autonomous',
      },
    } as never);

    expect((await bundle.approvalGate.request(trigger('tenant-wire'))).outcome).toBe('pending');
    expect(JSON.parse(readFileSync(pendingPath, 'utf8'))).toEqual([
      expect.objectContaining({
        triggerId: 'tenant-wire',
        tenantId: 'tenant-a',
        lifecycle: expect.objectContaining({ expiresAt: '2026-08-21T10:00:01.000Z' }),
      }),
    ]);
  });

  it('persists canonical EffectClass, risk, tier and immutable source-clock expiry', async () => {
    const root = fixtureRoot();
    const { pendingPath } = paths(root);
    const gate = makeApprovalGate({
      pendingPath,
      lifecycle: LIFECYCLE,
      now: () => '2026-08-21T10:00:00.000Z',
    });

    expect((await gate.request(trigger('risk-tagged-1'))).outcome).toBe('pending');
    const [pending] = JSON.parse(readFileSync(pendingPath, 'utf8')) as Array<Record<string, unknown>>;
    expect(pending).toMatchObject({
      effectClass: 'critical-irreversible',
      risk: 'critical',
      riskTier: 'critical',
      enqueuedAt: '2026-08-21T10:00:00.000Z',
      lifecycle: {
        state: 'migrated',
        createdAt: '2026-08-21T10:00:00.000Z',
        expiresAt: '2026-08-21T10:00:01.000Z',
        riskTier: 'critical',
      },
    });
  });

  it('migrates a legacy row from its original enqueuedAt and never resets age on restart/sweep', () => {
    const root = fixtureRoot();
    const { dir, pendingPath, decisionsPath } = paths(root);
    mkdirSync(dir, { recursive: true });
    writeFileSync(pendingPath, `${JSON.stringify([{
      triggerId: 'legacy-expired',
      action: 'autonomous.execute',
      requestedBy: 'legacy',
      enqueuedAt: '2026-08-21T10:00:00.000Z',
    }], null, 2)}\n`);

    const restarted = makeApprovalGate({
      pendingPath,
      lifecycle: LIFECYCLE,
      now: () => '2026-08-21T10:00:01.500Z',
    });
    expect(restarted.pending()).toEqual([]);
    expect(() => restarted.accept('legacy-expired')).toThrowError(ClosedApprovalRequestError);
    const timeout = JSON.parse(readFileSync(decisionsPath, 'utf8'))['legacy-expired'];
    expect(timeout).toMatchObject({
      outcome: 'rejected',
      kind: 'timeout',
      closureReason: 'expired',
      expiresAt: '2026-08-21T10:00:01.000Z',
      replayAllowed: false,
    });
  });

  it('uses per-request FWW: timeout cannot be replaced and never reaches takeResolved/replay', async () => {
    const root = fixtureRoot();
    const { pendingPath, decisionsPath } = paths(root);
    let clock = '2026-08-21T10:00:00.000Z';
    const gate = makeApprovalGate({ pendingPath, lifecycle: LIFECYCLE, now: () => clock });
    await gate.request(trigger('timeout-wins'));

    clock = '2026-08-21T10:00:01.000Z';
    expect(gate.pending()).toEqual([]);
    expect(gate.takeResolved()).toBeNull();
    expect(() => gate.accept('timeout-wins')).toThrowError(
      expect.objectContaining({ code: 'APR_APPROVAL_CLOSED', reasonCode: 'expired' }),
    );
    expect((await gate.request(trigger('timeout-wins'))).outcome).toBe('rejected');

    const authorityFiles = readdirSync(`${decisionsPath}.d`);
    expect(authorityFiles).toHaveLength(1);
    const winner = JSON.parse(readFileSync(join(`${decisionsPath}.d`, authorityFiles[0]!), 'utf8'));
    expect(winner).toMatchObject({ kind: 'timeout', outcome: 'rejected', replayAllowed: false });
  });

  it('does not authorize from a cached pending row after the durable queue becomes corrupt', async () => {
    const root = fixtureRoot();
    const { pendingPath, decisionsPath } = paths(root);
    const gate = makeApprovalGate({
      projectRoot: root,
      pendingPath,
      lifecycle: LIFECYCLE,
      now: () => '2026-08-21T10:00:00.000Z',
    });
    await gate.request(trigger('corrupt-after-cache'));
    writeFileSync(pendingPath, '{partial-json', 'utf8');

    expect(() => gate.accept('corrupt-after-cache')).toThrowError(
      expect.objectContaining({ code: 'APR_UNKNOWN_REQUEST' }),
    );
    expect(() => readFileSync(decisionsPath, 'utf8')).toThrow();
  });

  it('preserves a fresh human FWW winner when broker timeout settle-back races later', async () => {
    const root = fixtureRoot();
    const { pendingPath } = paths(root);
    let clock = '2026-08-21T10:00:00.000Z';
    const gate = makeApprovalGate({ pendingPath, lifecycle: LIFECYCLE, now: () => clock });
    await gate.request(trigger('human-wins'));
    clock = '2026-08-21T10:00:00.500Z';
    gate.accept('human-wins', 'reviewed');
    expect(gate.readTerminal('human-wins')).toMatchObject({
      kind: 'human',
      outcome: 'approved',
      reason: 'reviewed',
    });
    expect(gate.settleTimeout('human-wins', '2026-08-21T10:00:01.500Z')).toBe(false);
    expect(gate.takeResolved()?.id).toBe('human-wins');
    expect((await gate.request(trigger('human-wins'))).outcome).toBe('approved');

    const restarted = makeApprovalGate({ pendingPath, lifecycle: LIFECYCLE, now: () => clock });
    expect(restarted.readTerminal('human-wins')).toMatchObject({ kind: 'human', outcome: 'approved' });
  });

  it('reads restart-safe timeout terminal truth without exposing it for replay', async () => {
    const root = fixtureRoot();
    const { pendingPath } = paths(root);
    let clock = '2026-08-21T10:00:00.000Z';
    const gate = makeApprovalGate({ pendingPath, lifecycle: LIFECYCLE, now: () => clock });
    await gate.request(trigger('timeout-terminal'));
    clock = '2026-08-21T10:00:01.500Z';
    expect(gate.settleTimeout('timeout-terminal')).toBe(true);

    const restarted = makeApprovalGate({ pendingPath, lifecycle: LIFECYCLE, now: () => clock });
    expect(restarted.readTerminal('timeout-terminal')).toMatchObject({
      kind: 'timeout',
      outcome: 'rejected',
      closureReason: 'expired',
      replayAllowed: false,
    });
    expect(restarted.takeResolved()).toBeNull();
  });
});
