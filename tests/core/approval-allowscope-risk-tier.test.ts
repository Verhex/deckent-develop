import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, onTestFinished } from 'vitest';

import { ApprovalAllowScopeStore } from '../../src/core/approval-allowscope.js';

describe('ApprovalAllowScopeStore effective riskTier', () => {
  it('never grants high+critical or malformed tiers and preserves elevated matching', () => {
    const root = mkdtempSync(join(tmpdir(), 'approval-allowscope-tier-'));
    onTestFinished(() => rmSync(root, { recursive: true, force: true }));
    const store = new ApprovalAllowScopeStore(root, {
      filePath: join(root, 'allows.json'), now: () => new Date('2026-08-21T10:00:00.000Z'),
      idFactory: () => 'grant-1',
    });
    const grant = store.grantAllow({
      scopeId: 'project', scope: 'shell-exec', maxRisk: 'critical',
      expiresAt: '2026-08-21T11:00:00.000Z', grantedBy: 'owner', reason: 'reviewed',
    });
    expect(store.matchesAllow({ scopeId: 'project', scope: 'shell-exec', risk: 'high', riskTier: 'critical' }))
      .toBeNull();
    expect(store.matchesAllow({ scopeId: 'project', scope: 'shell-exec', risk: 'high', riskTier: 'unknown' } as never))
      .toBeNull();
    expect(store.matchesAllow({ scopeId: 'project', scope: 'shell-exec', risk: 'high', riskTier: 'elevated' }))
      .toEqual(grant);
  });
});
