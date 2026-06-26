// tests/connectors/gateway/gateway-access-bindings.test.ts
// Adaptation note: brief used `createGatewayAccess`; real factory name is `loadGatewayAccess`.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadGatewayAccess } from '../../../src/connectors/gateway/gateway-access.js';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'deckent-gw-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('gateway-access channel bindings', () => {
  it('returns null for an unbound channel', async () => {
    const acc = await loadGatewayAccess({ allowlistPath: join(dir, 'allow.json'), pairingsPath: join(dir, 'pair.json'), bindingsPath: join(dir, 'bind.json') });
    expect(acc.getBinding('telegram:-100123')).toBeNull();
  });
  it('persists and reads back a binding', async () => {
    const acc = await loadGatewayAccess({ allowlistPath: join(dir, 'allow.json'), pairingsPath: join(dir, 'pair.json'), bindingsPath: join(dir, 'bind.json') });
    await acc.setBinding('telegram:-100123', { tenantId: 'firmax', projectPath: '/p', mode: 'tenant-locked', guestRole: 'viewer' });
    expect(acc.getBinding('telegram:-100123')).toEqual({ tenantId: 'firmax', projectPath: '/p', mode: 'tenant-locked', guestRole: 'viewer' });
  });
  it('survives a reload from disk', async () => {
    const paths = { allowlistPath: join(dir, 'allow.json'), pairingsPath: join(dir, 'pair.json'), bindingsPath: join(dir, 'bind.json') };
    const acc1 = await loadGatewayAccess(paths);
    await acc1.setBinding('telegram:-100123', { tenantId: 'firmax', projectPath: '/p', mode: 'per-user' });
    const acc2 = await loadGatewayAccess(paths);
    expect(acc2.getBinding('telegram:-100123')?.mode).toBe('per-user');
  });
});
