import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { resolveApprovalLifecyclePolicy } from '../../../src/core/approval-lifecycle-policy.js';
import {
  loadGatewayAccess,
  parseGatewayPairingStore,
  type GatewayPairingRequestScope,
} from '../../../src/connectors/gateway/gateway-access.js';

async function fixture(): Promise<{
  dir: string;
  allowlistPath: string;
  pairingsPath: string;
  bindingsPath: string;
}> {
  const dir = await mkdtemp(join(tmpdir(), 'gw-access-lifecycle-'));
  return {
    dir,
    allowlistPath: join(dir, 'allowlist.json'),
    pairingsPath: join(dir, 'pairings.json'),
    bindingsPath: join(dir, 'bindings.json'),
  };
}

function scope(overrides: Partial<GatewayPairingRequestScope> = {}): GatewayPairingRequestScope {
  return {
    tenantId: 'tenant-a',
    projectPath: '/projects/a',
    lifecycle: resolveApprovalLifecyclePolicy({ enabled: true }),
    lifecycleGeneration: 'gateway-config:7',
    sourceReference: 'gateway-project-registry:/projects/a',
    ...overrides,
  };
}

describe('gateway pairing lifecycle authority', () => {
  it('persists opaque identity, distinct alias, exact scope and resolved 10m critical snapshot privately', async () => {
    const paths = await fixture();
    const clock = () => new Date('2026-08-21T10:00:00.000Z');
    const access = await loadGatewayAccess({
      ...paths,
      clock,
      genCode: () => 'PAIR-ALIAS',
      genPairingId: () => 'gwp-opaque-authority-id',
    });
    const result = await access.requestPairing('telegram:42', scope());
    expect(result).toMatchObject({
      state: 'PENDING',
      pairingId: 'gwp-opaque-authority-id',
      code: 'PAIR-ALIAS',
      expiresAt: '2026-08-21T10:10:00.000Z',
    });
    expect(result.state === 'PENDING' && result.pairingId).not.toBe(result.state === 'PENDING' && result.code);

    const parsed = parseGatewayPairingStore(JSON.parse(readFileSync(paths.pairingsPath, 'utf8')));
    expect(parsed).toMatchObject({ fault: false, legacy: [] });
    expect(parsed.records[0]).toMatchObject({
      pairingId: 'gwp-opaque-authority-id',
      shortCode: 'PAIR-ALIAS',
      tenantId: 'tenant-a',
      projectPath: '/projects/a',
      riskTier: 'critical',
      blocking: 'security',
      timeoutDisposition: 'deny-expire',
      lifecycleGeneration: 'gateway-config:7',
      slaStage: 'initial',
      state: 'PENDING',
    });
    expect(parsed.records[0]!.policySnapshotDigest).toMatch(/^[a-f0-9]{64}$/u);
    expect(parsed.records[0]!.source.requestDigest).toMatch(/^[a-f0-9]{64}$/u);
    if (process.platform !== 'win32') expect(statSync(paths.pairingsPath).mode & 0o077).toBe(0);
  });

  it('uses one parser for the legacy array and production object-map, quarantining unsafe legacy decisions', async () => {
    const paths = await fixture();
    const legacy = { code: 'OLD42', chatKey: 'telegram:legacy', requestedAt: '2026-08-21T09:00:00.000Z' };
    expect(parseGatewayPairingStore([legacy]).legacy).toHaveLength(1);
    expect(parseGatewayPairingStore({ OLD42: legacy }).legacy).toEqual(parseGatewayPairingStore([legacy]).legacy);

    writeFileSync(paths.pairingsPath, JSON.stringify({ OLD42: legacy }), 'utf8');
    const access = await loadGatewayAccess(paths);
    await expect(access.decidePairing('OLD42', 'approve', { projectPath: '/projects/a' }))
      .resolves.toEqual({ state: 'HOLD', reasonCode: 'legacy-quarantined' });
    expect(access.isAuthorized('telegram:legacy', '/projects/a')).toBe(false);
  });

  it('fresh-reads under one CAS: a CLI-like peer grant is visible and a racing loser observes closure', async () => {
    const paths = await fixture();
    const clock = () => new Date('2026-08-21T10:00:00.000Z');
    const producer = await loadGatewayAccess({ ...paths, clock, genCode: () => 'RACE42', genPairingId: () => 'gwp-race' });
    const daemon = await loadGatewayAccess({ ...paths, clock });
    const request = await producer.requestPairing('telegram:race', scope());
    expect(request.state).toBe('PENDING');

    const [first, second] = await Promise.all([
      producer.decidePairing('RACE42', 'approve', { tenantId: 'tenant-a', projectPath: '/projects/a' }),
      daemon.decidePairing('RACE42', 'reject'),
    ]);
    expect([first.state, second.state].filter((state) => state === 'APPROVED' || state === 'REJECTED')).toHaveLength(1);
    expect([first.state, second.state]).toContain('CLOSED');
    expect(daemon.isAuthorized('telegram:race', '/projects/a')).toBe(first.state === 'APPROVED');
  });

  it('expires at the immutable 10m boundary and a late approve never grants access', async () => {
    const paths = await fixture();
    let now = new Date('2026-08-21T10:00:00.000Z');
    const access = await loadGatewayAccess({
      ...paths,
      clock: () => now,
      genCode: () => 'LATE42',
      genPairingId: () => 'gwp-late',
    });
    await access.requestPairing('telegram:late', scope());
    now = new Date('2026-08-21T10:10:00.000Z');
    await expect(access.decidePairing('LATE42', 'approve', { projectPath: '/projects/a' })).resolves.toMatchObject({
      state: 'EXPIRED', expiresAt: '2026-08-21T10:10:00.000Z',
    });
    expect(access.isAuthorized('telegram:late', '/projects/a')).toBe(false);
    await expect(access.decidePairing('LATE42', 'approve', { projectPath: '/projects/a' })).resolves.toMatchObject({
      state: 'CLOSED', terminalState: 'EXPIRED',
    });
  });

  it('blocks new requests when lifecycle is disabled and rejects mismatched approval scope', async () => {
    const paths = await fixture();
    const access = await loadGatewayAccess({ ...paths, genCode: () => 'SCOPE42', genPairingId: () => 'gwp-scope' });
    await expect(access.requestPairing('telegram:off', scope({
      lifecycle: resolveApprovalLifecyclePolicy({ enabled: false }),
    }))).resolves.toEqual({ state: 'HOLD', reasonCode: 'lifecycle-disabled' });

    await access.requestPairing('telegram:scoped', scope());
    await expect(access.decidePairing('SCOPE42', 'approve', { projectPath: '/projects/other' })).resolves.toEqual({
      state: 'HOLD', reasonCode: 'scope-mismatch',
    });
    expect(access.isAuthorized('telegram:scoped', '/projects/a')).toBe(false);
  });
});
