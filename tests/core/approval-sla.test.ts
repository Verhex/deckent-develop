import { describe, expect, it } from 'vitest';

import {
  advanceApprovalSla,
  approvalSlaEventId,
  ApprovalSlaJournal,
  type ApprovalSlaPolicy,
} from '../../src/core/approval-sla.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const digest = (char: string): string => char.repeat(64);
const policy: ApprovalSlaPolicy = {
  slaMs: [120_000, 600_000, 1_800_000],
  authoredPolicyDigest: digest('a'),
  appliedPolicyDigest: digest('b'),
};
const createdAt = '2026-08-21T12:00:00.000Z';
const expiresAt = '2026-08-21T13:00:00.000Z';

function run(now: string, state?: Parameters<typeof advanceApprovalSla>[0]['state']) {
  return advanceApprovalSla({
    requestId: 'request-1', lifecycleGeneration: 'generation-3', createdAt, expiresAt, policy,
    clock: { now: () => new Date(now) }, state,
  });
}

describe('approval SLA monotonic outbox state', () => {
  it('emits initial once with stable lineage identity', () => {
    const first = run(createdAt);
    expect(first.audit.map((item) => item.stage)).toEqual(['initial']);
    expect(first.outbound.map((item) => item.stage)).toEqual(['initial']);
    expect(first.outbound[0]?.eventId).toBe(approvalSlaEventId('request-1', 'generation-3', 'initial'));
    expect(run(createdAt, first.state)).toMatchObject({ audit: [], outbound: [] });
  });

  it('coalesces restart catch-up outbound to the highest actionable stage', () => {
    const result = run('2026-08-21T12:31:00.000Z');
    expect(result.audit.map((item) => item.stage)).toEqual([
      'initial', 'renotify', 'alternate-channel', 'park-alert',
    ]);
    expect(result.outbound.map((item) => item.stage)).toEqual(['park-alert']);
    expect(run('2026-08-21T12:32:00.000Z', result.state)).toMatchObject({ audit: [], outbound: [] });
  });

  it('emits exactly one terminal expiry and never replays it', () => {
    const result = run('2026-08-21T13:00:00.000Z');
    expect(result.audit.at(-1)).toMatchObject({ stage: 'expired', kind: 'expired' });
    expect(result.outbound.map((item) => item.stage)).toEqual(['expired']);
    expect(result.state.terminal).toBe(true);
    expect(run('2026-08-22T12:00:00.000Z', result.state)).toMatchObject({ audit: [], outbound: [] });
  });

  it('records typed skipped stages for a short producer TTL without extending it', () => {
    const result = advanceApprovalSla({
      requestId: 'short', lifecycleGeneration: 'generation-0',
      createdAt, expiresAt: '2026-08-21T12:05:00.000Z', policy,
      clock: { now: () => new Date('2026-08-21T12:02:00.000Z') },
    });
    expect(result.audit).toEqual(expect.arrayContaining([
      expect.objectContaining({ stage: 'alternate-channel', kind: 'skipped', reasonCode: 'effective-expiry-precedes-stage' }),
      expect.objectContaining({ stage: 'park-alert', kind: 'skipped', reasonCode: 'effective-expiry-precedes-stage' }),
    ]));
    expect(result.state.expiresAt).toBe('2026-08-21T12:05:00.000Z');
  });

  it('binds persisted state to the exact request generation and clock lineage', () => {
    const first = run(createdAt);
    expect(() => advanceApprovalSla({
      requestId: 'request-1', lifecycleGeneration: 'generation-4', createdAt, expiresAt, policy,
      clock: { now: () => new Date(createdAt) }, state: first.state,
    })).toThrow(/lineage mismatch/);
    expect(() => advanceApprovalSla({
      requestId: 'request-1', lifecycleGeneration: 'generation-3', createdAt, expiresAt, policy: { ...policy, slaMs: [1, 1, 2] },
      clock: { now: () => new Date(createdAt) },
    })).toThrow(/strictly increasing/);
  });
});

describe('ApprovalSlaJournal restart-safe outbox', () => {
  it('retries an unacknowledged stable event and never replays it after ACK', () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-sla-journal-'));
    try {
      const input = {
        requestId: 'journal-request', lifecycleGeneration: 'generation-1', createdAt, expiresAt, policy,
        clock: { now: () => new Date('2026-08-21T12:31:00.000Z') },
      };
      const first = new ApprovalSlaJournal({ storeDir: root }).advance(input);
      expect(first.outbound.map((item) => item.stage)).toEqual(['park-alert']);
      const restarted = new ApprovalSlaJournal({ storeDir: root });
      expect(restarted.advance(input).outbound[0]?.eventId).toBe(first.outbound[0]?.eventId);
      restarted.acknowledge(first.outbound[0]!);
      expect(new ApprovalSlaJournal({ storeDir: root }).advance(input).outbound).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
