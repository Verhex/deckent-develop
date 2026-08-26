import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  _resetChainHead,
  writeApprovalLifecycleAuditEvent,
} from '../../src/core/audit-writer.js';
import { queryAudit } from '../../src/core/audit-query.js';
import type { ApprovalSlaEvidence } from '../../src/core/approval-sla.js';

let projectRoot: string;

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'deckent-approval-lifecycle-audit-'));
  mkdirSync(join(projectRoot, '.deckent'), { recursive: true });
  _resetChainHead();
});

afterEach(() => rmSync(projectRoot, { recursive: true, force: true }));

function evidence(kind: ApprovalSlaEvidence['kind']): ApprovalSlaEvidence {
  return {
    eventId: 'approval-sla:' + 'a'.repeat(64),
    requestId: 'approval-1',
    lifecycleGeneration: 2,
    stage: kind === 'expired' ? 'expired' : 'renotify',
    ordinal: kind === 'expired' ? 4 : 1,
    kind,
    dueAt: '2026-08-21T12:05:00.000Z',
    observedAt: '2026-08-21T12:05:01.000Z',
    authoredPolicyDigest: 'b'.repeat(64),
    appliedPolicyDigest: 'c'.repeat(64),
    ...(kind === 'skipped' ? { reasonCode: 'effective-expiry-precedes-stage' as const } : {}),
  };
}

describe('approval lifecycle audit evidence', () => {
  it('attributes timeout to system:expiry with full digest lineage', () => {
    expect(writeApprovalLifecycleAuditEvent(projectRoot, 'approval-lifecycle', {
      tenantId: 'tenant-a', requestId: 'approval-1', origin: 'gateway-pairing',
      sourceReference: 'pairing:opaque-1', evidence: evidence('expired'),
    })).toBe(true);

    const rows = queryAudit(projectRoot, 'approval-lifecycle', { tenantId: 'tenant-a' }).matched;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.payload).toMatchObject({
      actor: 'system:expiry',
      action: 'approval.timeout-disposition',
      target: 'approval-1',
      correlationId: 'approval-1',
      causationId: 'approval-sla:' + 'a'.repeat(64),
      metadata: {
        origin: 'gateway-pairing',
        lifecycleGeneration: 2,
        authoredPolicyDigest: 'b'.repeat(64),
        appliedPolicyDigest: 'c'.repeat(64),
      },
    });
  });

  it('records short-TTL skipped evidence without pretending it was delivered', () => {
    expect(writeApprovalLifecycleAuditEvent(projectRoot, 'approval-lifecycle', {
      tenantId: 'tenant-a', requestId: 'approval-1', origin: 'broker-native',
      sourceReference: 'request:approval-1', evidence: evidence('skipped'),
    })).toBe(true);
    const row = queryAudit(projectRoot, 'approval-lifecycle', { tenantId: 'tenant-a' }).matched[0];
    expect(row?.payload).toMatchObject({
      actor: 'system:approval-sla',
      action: 'approval.sla-stage-skipped',
      metadata: { reasonCode: 'effective-expiry-precedes-stage' },
    });
  });

  it('rejects mismatched request lineage before writing', () => {
    expect(writeApprovalLifecycleAuditEvent(projectRoot, 'approval-lifecycle', {
      tenantId: 'tenant-a', requestId: 'other', origin: 'confirmation',
      sourceReference: 'confirmation:1', evidence: evidence('due'),
    })).toBe(false);
    expect(queryAudit(projectRoot, 'approval-lifecycle', { tenantId: 'tenant-a' }).matched).toEqual([]);
  });
});
