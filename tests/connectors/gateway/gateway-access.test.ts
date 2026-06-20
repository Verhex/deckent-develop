// tests/connectors/gateway/gateway-access.test.ts
import { describe, it, expect } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadGatewayAccess } from '../../../src/connectors/gateway/gateway-access.js';

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
    const code = await a.requestPairing('telegram:9');
    expect(code).toBe('CODE1');
    expect(a.listPairings()).toHaveLength(1);
    const res = await a.approvePairing(code, '/foo');
    expect(res?.chatKey).toBe('telegram:9');
    expect(a.isAuthorized('telegram:9', '/foo')).toBe(true);
    expect(a.listPairings()).toHaveLength(0); // consumed
    expect(await a.approvePairing(code, '/foo')).toBeNull(); // already consumed
  });

  it('requestPairing reuses the pending code for the same chat', async () => {
    const p = await paths();
    let n = 0;
    const a = await loadGatewayAccess({ ...p, genCode: () => `C${++n}` });
    const c1 = await a.requestPairing('telegram:5');
    const c2 = await a.requestPairing('telegram:5');
    expect(c1).toBe(c2);
    expect(a.listPairings()).toHaveLength(1);
  });

  it('rejectPairing removes a pending pairing', async () => {
    const p = await paths();
    const a = await loadGatewayAccess({ ...p, genCode: () => 'Z' });
    await a.requestPairing('telegram:3');
    expect(await a.rejectPairing('Z')).toBe(true);
    expect(a.listPairings()).toHaveLength(0);
    expect(await a.rejectPairing('Z')).toBe(false);
  });
});
