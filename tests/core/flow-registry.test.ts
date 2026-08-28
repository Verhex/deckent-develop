import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { FlowRegistry } from '../../src/core/flow-registry.js';
import type { ScheduledFlow } from '../../src/core/scheduled-flow.js';

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'flow-registry-test-'));
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

describe('FlowRegistry', () => {
  describe('add + get', () => {
    it('adds a flow and retrieves it by id', () => {
      const dir = tmpDir();
      const registry = new FlowRegistry(dir);
      const flow = makeFlow();
      registry.addFlow(flow);
      expect(registry.getFlow('flow-001')).toEqual(flow);
      rmSync(dir, { recursive: true });
    });

    it('returns undefined for unknown id', () => {
      const dir = tmpDir();
      const registry = new FlowRegistry(dir);
      expect(registry.getFlow('nonexistent')).toBeUndefined();
      rmSync(dir, { recursive: true });
    });
  });

  describe('listFlows — tenant filter', () => {
    it('lists all flows when no tenantId given', () => {
      const dir = tmpDir();
      const registry = new FlowRegistry(dir);
      registry.addFlow(makeFlow({ id: 'f1', tenantId: 'tenant-a' }));
      registry.addFlow(makeFlow({ id: 'f2', tenantId: 'tenant-b' }));
      expect(registry.listFlows()).toHaveLength(2);
      rmSync(dir, { recursive: true });
    });

    it('filters by tenantId', () => {
      const dir = tmpDir();
      const registry = new FlowRegistry(dir);
      registry.addFlow(makeFlow({ id: 'f1', tenantId: 'tenant-a' }));
      registry.addFlow(makeFlow({ id: 'f2', tenantId: 'tenant-b' }));
      const result = registry.listFlows('tenant-a');
      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe('f1');
      rmSync(dir, { recursive: true });
    });

    it('returns empty array when tenant has no flows', () => {
      const dir = tmpDir();
      const registry = new FlowRegistry(dir);
      registry.addFlow(makeFlow({ id: 'f1', tenantId: 'tenant-a' }));
      expect(registry.listFlows('tenant-x')).toHaveLength(0);
      rmSync(dir, { recursive: true });
    });
  });

  describe('removeFlow', () => {
    it('removes a flow and returns true', () => {
      const dir = tmpDir();
      const registry = new FlowRegistry(dir);
      registry.addFlow(makeFlow());
      expect(registry.removeFlow('flow-001')).toBe(true);
      expect(registry.getFlow('flow-001')).toBeUndefined();
      rmSync(dir, { recursive: true });
    });

    it('returns false when removing nonexistent flow', () => {
      const dir = tmpDir();
      const registry = new FlowRegistry(dir);
      expect(registry.removeFlow('ghost')).toBe(false);
      rmSync(dir, { recursive: true });
    });
  });

  describe('persist roundtrip', () => {
    it('round-trips timezone and leaves a legacy record without the field untouched', () => {
      const dir = tmpDir();
      const legacyDir = join(dir, 'tenant-old');
      mkdirSync(legacyDir, { recursive: true });
      const legacy = makeFlow({ id: 'legacy', tenantId: 'tenant-old' });
      writeFileSync(join(legacyDir, 'legacy.json'), JSON.stringify(legacy, null, 2));

      const registry = new FlowRegistry(dir);
      expect(registry.getFlow('legacy')).toEqual(legacy);
      expect(registry.getFlow('legacy')).not.toHaveProperty('timezone');

      const zoned = makeFlow({ id: 'zoned', timezone: 'Europe/Istanbul' });
      registry.addFlow(zoned);
      expect(new FlowRegistry(dir).getFlow('zoned')).toEqual(zoned);
      rmSync(dir, { recursive: true });
    });

    it('persists flow to disk as JSON', () => {
      const dir = tmpDir();
      const registry = new FlowRegistry(dir);
      const flow = makeFlow({ id: 'persist-1', tenantId: 'tenant-p' });
      registry.addFlow(flow);
      const filePath = join(dir, 'tenant-p', 'persist-1.json');
      expect(existsSync(filePath)).toBe(true);
      const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as ScheduledFlow;
      expect(parsed.id).toBe('persist-1');
      expect(parsed.tenantId).toBe('tenant-p');
      rmSync(dir, { recursive: true });
    });

    it('loads flows from disk on construction', () => {
      const dir = tmpDir();
      const r1 = new FlowRegistry(dir);
      r1.addFlow(makeFlow({ id: 'loaded-1', tenantId: 'tenant-l' }));

      const r2 = new FlowRegistry(dir);
      expect(r2.getFlow('loaded-1')).toBeDefined();
      expect(r2.getFlow('loaded-1')!.tenantId).toBe('tenant-l');
      rmSync(dir, { recursive: true });
    });

    it('removes JSON file on removeFlow', () => {
      const dir = tmpDir();
      const registry = new FlowRegistry(dir);
      registry.addFlow(makeFlow({ id: 'del-1', tenantId: 'tenant-d' }));
      const filePath = join(dir, 'tenant-d', 'del-1.json');
      expect(existsSync(filePath)).toBe(true);
      registry.removeFlow('del-1');
      expect(existsSync(filePath)).toBe(false);
      rmSync(dir, { recursive: true });
    });
  });

  describe('enableFlow', () => {
    it('toggles enabled and persists updated state', () => {
      const dir = tmpDir();
      const registry = new FlowRegistry(dir);
      registry.addFlow(makeFlow({ id: 'e1', enabled: true }));
      expect(registry.enableFlow('e1', false)).toBe(true);
      expect(registry.getFlow('e1')!.enabled).toBe(false);
      const filePath = join(dir, 'tenant-a', 'e1.json');
      const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as ScheduledFlow;
      expect(parsed.enabled).toBe(false);
      rmSync(dir, { recursive: true });
    });

    it('returns false for nonexistent flow', () => {
      const dir = tmpDir();
      const registry = new FlowRegistry(dir);
      expect(registry.enableFlow('nope', true)).toBe(false);
      rmSync(dir, { recursive: true });
    });
  });
});
