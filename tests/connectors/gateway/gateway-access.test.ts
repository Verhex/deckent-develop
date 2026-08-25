// tests/connectors/gateway/gateway-access.test.ts
import { describe, it, expect } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveApprovalLifecyclePolicy } from '../../../src/core/approval-lifecycle-policy.js';
import {
  loadGatewayAccess,
  type GatewayPairingRequestScope,
} from '../../../src/connectors/gateway/gateway-access.js';

function pairingScope(projectPath = '/foo'): GatewayPairingRequestScope {
  return {
    tenantId: 'tenant-test',
    projectPath,
    lifecycle: resolveApprovalLifecyclePolicy({ enabled: true }),
    lifecycleGeneration: 'gateway-config:test',
    sourceReference: 'gateway-project-registry:' + projectPath,
  };
}

async function paths(): Promise<{ allowlistPath: string; pairingsPath: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'gw-access-'));
  return { allowlistPath: join(dir, 'allowlist.json'), pairingsPath: join(dir, 'pairings.json') };
}

describe('gateway-access', () => {
  it('denies by default, authorizes, persists across reload', async () => {
    const p = await paths();
    const a = await loadGatewayAccess(p);
    expect(a.isAuthorized('telegram:1', '/foo')).toBe(false);
    await a.authorize('telegram:1', '/foo');
    expect(a.isAuthorized('telegram:1', '/foo')).toBe(true);
    expect(a.isAuthorized('telegram:1', '/bar')).toBe(false); // per-project
    const a2 = await loadGatewayAccess(p);
    expect(a2.isAuthorized('telegram:1', '/foo')).toBe(true);
  });

  it('pairing: request → approve moves chat onto the project allowlist', async () => {
    const p = await paths();
    let n = 0;
    const a = await loadGatewayAccess({ ...p, genCode: () => `CODE${++n}`, now: () => '2026-06-20T00:00:00Z' });
    const request = await a.requestPairing('telegram:9', pairingScope());
    expect(request.state).toBe('PENDING');
    const code = request.state === 'PENDING' ? request.code : '';
    expect(code).toBe('CODE1');
    expect(a.listPairings()).toHaveLength(1);
    const res = await a.decidePairing(code, 'approve', {
      tenantId: 'tenant-test',
      projectPath: '/foo',
    });
    expect(res).toMatchObject({ state: 'APPROVED', chatKey: 'telegram:9' });
    expect(a.isAuthorized('telegram:9', '/foo')).toBe(true);
    expect(a.listPairings()).toHaveLength(0); // consumed
    await expect(a.decidePairing(code, 'approve', {
      tenantId: 'tenant-test',
      projectPath: '/foo',
    })).resolves.toMatchObject({ state: 'CLOSED', terminalState: 'APPROVED' });
  });

  it('requestPairing reuses the pending code for the same chat', async () => {
    const p = await paths();
    let n = 0;
    const a = await loadGatewayAccess({ ...p, genCode: () => `C${++n}` });
    const c1 = await a.requestPairing('telegram:5', pairingScope());
    const c2 = await a.requestPairing('telegram:5', pairingScope());
    expect(c1).toMatchObject({ state: 'PENDING', code: 'C1', reused: false });
    expect(c2).toMatchObject({
      state: 'PENDING',
      code: 'C1',
      reused: true,
      pairingId: c1.state === 'PENDING' ? c1.pairingId : '',
      expiresAt: c1.state === 'PENDING' ? c1.expiresAt : '',
    });
    expect(a.listPairings()).toHaveLength(1);
  });

  it('rejectPairing removes a pending pairing', async () => {
    const p = await paths();
    const a = await loadGatewayAccess({ ...p, genCode: () => 'Z' });
    await a.requestPairing('telegram:3', pairingScope());
    await expect(a.decidePairing('Z', 'reject')).resolves.toMatchObject({ state: 'REJECTED' });
    expect(a.listPairings()).toHaveLength(0);
    await expect(a.decidePairing('Z', 'reject')).resolves.toMatchObject({
      state: 'CLOSED',
      terminalState: 'REJECTED',
    });
  });
});
