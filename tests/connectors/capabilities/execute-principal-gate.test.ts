// tests/connectors/capabilities/execute-principal-gate.test.ts
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { runCapability } from '../../../src/connectors/capabilities/execute.js';
import type { Capability, CapabilityContext } from '../../../src/connectors/capabilities/types.js';
import type { ResolvedPrincipal } from '../../../src/connectors/identity/provider.js';

function ctxWith(principal?: ResolvedPrincipal): CapabilityContext {
  return {
    chatKey: 'telegram:-100', project: '/p', lang: 'en',
    config: {}, now: 0, spawn: (async () => ({ ok: true })) as never,
    loadMailTransport: (async () => ({})) as never,
    principal, tenantId: principal?.tenantId,
  } as unknown as CapabilityContext;
}
const ran = vi.fn();
function fakeRegistry(requiredPermission?: string) {
  const cap: Capability = {
    id: 'order.cancel', titleKey: 'x', tier: 'destructive', defaultPolicy: 'auto', edition: 'solo',
    paramsSchema: z.object({}), requiredPermission, preview: () => 'p',
    run: async () => { ran(); return { ok: true, text: 'done' }; },
  };
  return { get: (id: string) => (id === 'order.cancel' ? cap : undefined) } as never;
}
const sink = { } as never;
const operator: ResolvedPrincipal = { userId: 'veli', role: 'operator', permissions: ['order:read'], tenantId: 'firmax', verified: true, source: 'local' };
const admin: ResolvedPrincipal = { userId: 'ali', role: 'admin', permissions: ['*'], tenantId: 'firmax', verified: true, source: 'local' };

describe('runCapability principal gate (L2)', () => {
  it('DENIES when principal lacks the required permission (and does not run)', async () => {
    ran.mockClear();
    const out = await runCapability(fakeRegistry('order:write'), 'order.cancel', {}, ctxWith(operator), 'telegram:-100', sink, 'auto');
    expect(ran).not.toHaveBeenCalled();
    expect(out).not.toContain('done');
    expect(out.length).toBeGreaterThan(0);
  });
  it('ALLOWS when principal has the permission', async () => {
    ran.mockClear();
    await runCapability(fakeRegistry('order:write'), 'order.cancel', {}, ctxWith(admin), 'telegram:-100', sink, 'auto');
    expect(ran).toHaveBeenCalledOnce();
  });
  it('ALLOWS (no gate) when capability declares no requiredPermission — back-compat', async () => {
    ran.mockClear();
    await runCapability(fakeRegistry(undefined), 'order.cancel', {}, ctxWith(operator), 'telegram:-100', sink, 'auto');
    expect(ran).toHaveBeenCalledOnce();
  });
  it('ALLOWS (no gate) when no principal in context — opt-in / back-compat', async () => {
    ran.mockClear();
    await runCapability(fakeRegistry('order:write'), 'order.cancel', {}, ctxWith(undefined), 'telegram:-100', sink, 'auto');
    expect(ran).toHaveBeenCalledOnce();
  });
});
