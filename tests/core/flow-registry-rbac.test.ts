import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FlowRegistry } from '../../src/core/flow-registry.js';
import type { ScheduledFlow } from '../../src/core/scheduled-flow.js';

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'flow-registry-rbac-'));
}

function makeFlow(overrides: Partial<ScheduledFlow> = {}): ScheduledFlow {
  return {
    id: 'flow-001',
    cronExpr: '* * * * *',
    action: 'deckent start',
    tenantId: 'tenant-1',
    enabled: true,
    ...overrides,
  };
}

describe('FlowRegistry RBAC — addFlow', () => {
  it('operator can add a flow', () => {
    const dir = tmpDir();
    const registry = new FlowRegistry(dir);
    expect(() => registry.addFlow(makeFlow(), 'operator')).not.toThrow();
    expect(registry.getFlow('flow-001')).toBeDefined();
    rmSync(dir, { recursive: true });
  });

  it('viewer is denied addFlow (throws)', () => {
    const dir = tmpDir();
    const registry = new FlowRegistry(dir);
    expect(() => registry.addFlow(makeFlow(), 'viewer')).toThrow(/flow:manage/);
    rmSync(dir, { recursive: true });
  });

  it('admin can add a flow', () => {
    const dir = tmpDir();
    const registry = new FlowRegistry(dir);
    expect(() => registry.addFlow(makeFlow(), 'admin')).not.toThrow();
    rmSync(dir, { recursive: true });
  });

  it('no role provided bypasses RBAC check (backward compat)', () => {
    const dir = tmpDir();
    const registry = new FlowRegistry(dir);
    expect(() => registry.addFlow(makeFlow())).not.toThrow();
    rmSync(dir, { recursive: true });
  });
});

describe('FlowRegistry RBAC — listFlows', () => {
  it('viewer can list flows for a tenant', () => {
    const dir = tmpDir();
    const registry = new FlowRegistry(dir);
    registry.addFlow(makeFlow({ id: 'f1' }));
    expect(() => registry.listFlows('tenant-1', 'viewer')).not.toThrow();
    expect(registry.listFlows('tenant-1', 'viewer')).toHaveLength(1);
    rmSync(dir, { recursive: true });
  });

  it('operator can list flows', () => {
    const dir = tmpDir();
    const registry = new FlowRegistry(dir);
    registry.addFlow(makeFlow({ id: 'f2' }));
    const result = registry.listFlows('tenant-1', 'operator');
    expect(result).toHaveLength(1);
    rmSync(dir, { recursive: true });
  });

  it('admin can list all flows without tenantId', () => {
    const dir = tmpDir();
    const registry = new FlowRegistry(dir);
    registry.addFlow(makeFlow({ id: 'f3', tenantId: 'tenant-1' }));
    registry.addFlow(makeFlow({ id: 'f4', tenantId: 'tenant-2' }));
    expect(registry.listFlows(undefined, 'admin')).toHaveLength(2);
    rmSync(dir, { recursive: true });
  });
});

describe('FlowRegistry RBAC — removeFlow', () => {
  it('operator can remove a flow', () => {
    const dir = tmpDir();
    const registry = new FlowRegistry(dir);
    registry.addFlow(makeFlow());
    expect(registry.removeFlow('flow-001', 'operator')).toBe(true);
    expect(registry.getFlow('flow-001')).toBeUndefined();
    rmSync(dir, { recursive: true });
  });

  it('viewer is denied removeFlow (throws)', () => {
    const dir = tmpDir();
    const registry = new FlowRegistry(dir);
    registry.addFlow(makeFlow());
    expect(() => registry.removeFlow('flow-001', 'viewer')).toThrow(/flow:manage/);
    rmSync(dir, { recursive: true });
  });
});

describe('FlowRegistry RBAC — enableFlow', () => {
  it('operator can enable/disable a flow', () => {
    const dir = tmpDir();
    const registry = new FlowRegistry(dir);
    registry.addFlow(makeFlow({ enabled: true }));
    expect(registry.enableFlow('flow-001', false, 'operator')).toBe(true);
    expect(registry.getFlow('flow-001')!.enabled).toBe(false);
    rmSync(dir, { recursive: true });
  });

  it('viewer is denied enableFlow (throws)', () => {
    const dir = tmpDir();
    const registry = new FlowRegistry(dir);
    registry.addFlow(makeFlow());
    expect(() => registry.enableFlow('flow-001', false, 'viewer')).toThrow(/flow:manage/);
    rmSync(dir, { recursive: true });
  });
});

describe('FlowRegistry RBAC — admin all operations', () => {
  it('admin can add, list, enable, and remove flows', () => {
    const dir = tmpDir();
    const registry = new FlowRegistry(dir);

    expect(() => registry.addFlow(makeFlow({ id: 'a1' }), 'admin')).not.toThrow();
    expect(registry.listFlows('tenant-1', 'admin')).toHaveLength(1);
    expect(registry.enableFlow('a1', false, 'admin')).toBe(true);
    expect(registry.removeFlow('a1', 'admin')).toBe(true);
    expect(registry.getFlow('a1')).toBeUndefined();

    rmSync(dir, { recursive: true });
  });
});
