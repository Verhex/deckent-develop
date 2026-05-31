import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FlowRegistry } from '../../src/core/flow-registry.js';
import { withTenant } from '../../src/core/tenant-context.js';
import type { ScheduledFlow } from '../../src/core/scheduled-flow.js';

function tmpRoot(): string {
  return mkdtempSync(join(tmpdir(), 'flow-registry-tenant-'));
}

function makeFlow(overrides: Partial<ScheduledFlow> = {}): ScheduledFlow {
  return {
    id: 'flow-001',
    cronExpr: '* * * * *',
    action: 'deckent start',
    tenantId: 'tenant-a',
    enabled: true,
    ...overrides,
  };
}

describe('FlowRegistry — tenant-scoped isolation', () => {
  it('persists flow at tenant-scoped path (.deckent/tenants/<id>/flows/)', () => {
    const root = tmpRoot();
    withTenant('tenant-a', root, () => {
      const registry = FlowRegistry.forCurrentTenant(root);
      registry.addFlow(makeFlow({ id: 'f1', tenantId: 'tenant-a' }));
      const expected = join(root, '.deckent', 'tenants', 'tenant-a', 'flows', 'f1.json');
      expect(existsSync(expected)).toBe(true);
    });
    rmSync(root, { recursive: true });
  });

  it('cross-tenant invisible: flow added in tenant-a not visible in tenant-b registry', () => {
    const root = tmpRoot();
    withTenant('tenant-a', root, () => {
      const regA = FlowRegistry.forCurrentTenant(root);
      regA.addFlow(makeFlow({ id: 'flow-a', tenantId: 'tenant-a' }));
    });
    withTenant('tenant-b', root, () => {
      const regB = FlowRegistry.forCurrentTenant(root);
      expect(regB.getFlow('flow-a')).toBeUndefined();
      expect(regB.listFlows()).toHaveLength(0);
    });
    rmSync(root, { recursive: true });
  });

  it('uses local default tenant when no withTenant context is active', () => {
    const root = tmpRoot();
    const registry = FlowRegistry.forCurrentTenant(root);
    registry.addFlow(makeFlow({ id: 'default-flow', tenantId: 'local' }));
    const expected = join(root, '.deckent', 'tenants', 'local', 'flows', 'default-flow.json');
    expect(existsSync(expected)).toBe(true);
    rmSync(root, { recursive: true });
  });

  it('same flow id in different tenants is stored independently (no cross-contamination)', () => {
    const root = tmpRoot();
    withTenant('alpha', root, () => {
      const reg = FlowRegistry.forCurrentTenant(root);
      reg.addFlow(makeFlow({ id: 'shared-id', tenantId: 'alpha' }));
    });
    withTenant('beta', root, () => {
      const reg = FlowRegistry.forCurrentTenant(root);
      reg.addFlow(makeFlow({ id: 'shared-id', tenantId: 'beta' }));
      expect(reg.getFlow('shared-id')?.tenantId).toBe('beta');
    });
    withTenant('alpha', root, () => {
      const reg = FlowRegistry.forCurrentTenant(root);
      expect(reg.getFlow('shared-id')?.tenantId).toBe('alpha');
    });
    rmSync(root, { recursive: true });
  });
});
