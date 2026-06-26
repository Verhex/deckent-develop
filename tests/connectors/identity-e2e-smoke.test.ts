// tests/connectors/identity-e2e-smoke.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { IdentityStore } from '../../src/connectors/identity/identity-store.js';
import { buildIdentityResolver } from '../../src/connectors/connector-bootstrap.js';
import { runCapability } from '../../src/connectors/capabilities/execute.js';
import type { Capability, CapabilityContext } from '../../src/connectors/capabilities/types.js';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'deckent-e2e-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const cancelCap: Capability = {
  id: 'order.cancel', titleKey: 'x', tier: 'destructive', defaultPolicy: 'auto', edition: 'solo',
  paramsSchema: z.object({}), requiredPermission: 'order:write', preview: () => 'p',
  run: async () => ({ text: 'order cancelled' }),
};
const registry = { get: (id: string) => (id === 'order.cancel' ? cancelCap : undefined) } as never;
const sink = {} as never;

function ctx(principal: unknown): CapabilityContext {
  return { chatKey: 'telegram:-100', project: dir, lang: 'en', config: {}, now: 0,
    spawn: (async () => ({ ok: true })) as never, loadMailTransport: (async () => ({})) as never,
    principal, tenantId: (principal as { tenantId?: string })?.tenantId } as unknown as CapabilityContext;
}

describe('SMOKE: inbound → per-user authorization end-to-end', () => {
  it('authorized sender (operator with order:write) → capability RUNS', async () => {
    const store = new IdentityStore(join(dir, 'id.db'));
    try {
      store.upsertIdentity({ connector: 'telegram', externalId: '55', tenantId: 'firmax', principalId: 'ali', role: 'operator', verified: true, method: 'otp', updatedAt: '2026-06-26T00:00:00.000Z' });
      const resolve = buildIdentityResolver({ enabled: true, provider: { kind: 'local' }, roleMap: { operator: { role: 'operator', permissions: ['order:read', 'order:write'] } } }, store, dir);
      const principal = resolve({ connector: 'telegram', fromUser: '55' }, { tenantId: 'firmax', projectPath: dir, mode: 'tenant-locked' });
      const out = await runCapability(registry, 'order.cancel', {}, ctx(principal), 'telegram:-100', sink, 'auto');
      expect(out).toContain('cancelled');
    } finally {
      store.close();
    }
  });
  it('unauthorized sender (viewer, order:read only) → capability DENIED', async () => {
    const store = new IdentityStore(join(dir, 'id.db'));
    try {
      store.upsertIdentity({ connector: 'telegram', externalId: '99', tenantId: 'firmax', principalId: 'veli', role: 'viewer', verified: true, method: 'otp', updatedAt: '2026-06-26T00:00:00.000Z' });
      const resolve = buildIdentityResolver({ enabled: true, provider: { kind: 'local' }, roleMap: { viewer: { role: 'viewer', permissions: ['order:read'] } } }, store, dir);
      const principal = resolve({ connector: 'telegram', fromUser: '99' }, { tenantId: 'firmax', projectPath: dir, mode: 'tenant-locked' });
      const out = await runCapability(registry, 'order.cancel', {}, ctx(principal), 'telegram:-100', sink, 'auto');
      expect(out).toContain('order:write');     // rbac.unauthorized names the missing permission
      expect(out).not.toContain('cancelled');   // cap.run never executed
    } finally {
      store.close();
    }
  });
});
