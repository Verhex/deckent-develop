import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { ApprovalBroker, type ApprovalRequestInput } from '../../src/core/approval-broker.js';
import { readPendingApprovals } from '../../src/core/pending-approvals.js';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

function request(id: string, expiresAt: string): ApprovalRequestInput {
  return {
    id, requester: { role: 'worker', instanceId: 'worker-1' }, summary: id, details: {},
    scopeId: 'scope-1', scope: 'shell-exec', risk: 'high', policy: 'require-approval',
    defaultAction: 'deny', tenantId: 'tenant-1', userId: 'user-1',
    createdAt: '2026-08-21T12:00:00.000Z', expiresAt,
  };
}

describe('pending approval lifecycle index', () => {
  it('projects only actionable runtime rows with finite expiry and normalized risk', () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-pending-lifecycle-'));
    roots.push(root);
    const broker = new ApprovalBroker(root, { storeDir: join(root, '.deckent', 'approvals') });
    broker.submit(request('runtime-live', '2099-08-21T12:30:00.000Z'));
    broker.submit(request('runtime-expired', '2026-08-21T12:01:00.000Z'));

    const runtime = readPendingApprovals(root).filter((item) => item.kind === 'runtime');
    expect(runtime).toEqual([expect.objectContaining({
      id: 'runtime-live', expiresAt: '2099-08-21T12:30:00.000Z', riskTier: 'elevated',
      acceptCommand: 'deckent approvals decide runtime-live allow',
    })]);
  });

  it('does not create an empty runtime store on a pure read', () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-pending-empty-'));
    roots.push(root);
    expect(readPendingApprovals(root)).toEqual([]);
  });
});
