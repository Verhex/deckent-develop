import { describe, it, expect, beforeEach } from 'vitest';
import {
  CapabilityRegistry,
  CapabilityHandler,
  ROLE_CAPABILITY_MAP,
  deriveGrantedCapabilities,
} from '../../src/core/capability-broker.js';
import type { Capability, CapabilityTarget } from '../../src/core/work-model.js';

// ─── Hermetic test helpers ────────────────────────────────────────────────────

function makeHandler(cap: Capability, id = 'test-handler'): CapabilityHandler {
  return {
    requiredCapability: cap,
    description: id,
    invoke: (_args) => ({ invoked: true }),
  };
}

function makeTarget(capability: string): CapabilityTarget {
  return { capability };
}

// ─── ROLE_CAPABILITY_MAP exports ─────────────────────────────────────────────

describe('ROLE_CAPABILITY_MAP', () => {
  it('defines viewer, developer, operator, admin roles', () => {
    expect(ROLE_CAPABILITY_MAP).toHaveProperty('viewer');
    expect(ROLE_CAPABILITY_MAP).toHaveProperty('developer');
    expect(ROLE_CAPABILITY_MAP).toHaveProperty('operator');
    expect(ROLE_CAPABILITY_MAP).toHaveProperty('admin');
  });

  it('viewer has read-only capabilities', () => {
    expect(ROLE_CAPABILITY_MAP['viewer']).toContain('fs-read');
    expect(ROLE_CAPABILITY_MAP['viewer']).not.toContain('db-write');
    expect(ROLE_CAPABILITY_MAP['viewer']).not.toContain('fs-write');
  });

  it('operator has db-query but not db-write', () => {
    expect(ROLE_CAPABILITY_MAP['operator']).toContain('db-query');
    expect(ROLE_CAPABILITY_MAP['operator']).not.toContain('db-write');
  });

  it('admin has all capabilities including db-write', () => {
    expect(ROLE_CAPABILITY_MAP['admin']).toContain('db-write');
    expect(ROLE_CAPABILITY_MAP['admin']).toContain('erp-write');
    expect(ROLE_CAPABILITY_MAP['admin']).toContain('shell');
  });

  it('operator is a superset of viewer', () => {
    const viewer = new Set(ROLE_CAPABILITY_MAP['viewer']);
    for (const cap of viewer) {
      expect(ROLE_CAPABILITY_MAP['operator']).toContain(cap);
    }
  });
});

describe('deriveGrantedCapabilities', () => {
  it('returns capabilities for known roles', () => {
    expect(deriveGrantedCapabilities('viewer')).toEqual(ROLE_CAPABILITY_MAP['viewer']);
    expect(deriveGrantedCapabilities('operator')).toEqual(ROLE_CAPABILITY_MAP['operator']);
  });

  it('returns empty array for unknown role', () => {
    expect(deriveGrantedCapabilities('superuser')).toEqual([]);
    expect(deriveGrantedCapabilities('')).toEqual([]);
  });
});

// ─── CapabilityRegistry least-privilege enforcement ───────────────────────────

describe('CapabilityRegistry.invoke — least-privilege gate', () => {
  let registry: CapabilityRegistry;

  beforeEach(() => {
    registry = new CapabilityRegistry();
    registry.register('db.write', makeHandler('db-write', 'db-write-handler'));
    registry.register('db.read', makeHandler('db-query', 'db-read-handler'));
    registry.register('fs.read', makeHandler('fs-read', 'fs-read-handler'));
  });

  // ── enforceLeastPrivilege per-call flag ───────────────────────────────────

  it('role "viewer" + db.write + enforceLeastPrivilege:true → CAPABILITY_DENIED', async () => {
    const result = await registry.invoke(makeTarget('db.write'), {
      actor: { id: 'u1', role: 'viewer' },
      enforceLeastPrivilege: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('CAPABILITY_DENIED');
    }
  });

  it('role "operator" + db.read + enforceLeastPrivilege:true → ok (allowed)', async () => {
    const result = await registry.invoke(makeTarget('db.read'), {
      actor: { id: 'u2', role: 'operator' },
      enforceLeastPrivilege: true,
    });
    expect(result.ok).toBe(true);
  });

  it('role "admin" + db.write + enforceLeastPrivilege:true → ok (allowed)', async () => {
    const result = await registry.invoke(makeTarget('db.write'), {
      actor: { id: 'u3', role: 'admin' },
      enforceLeastPrivilege: true,
    });
    expect(result.ok).toBe(true);
  });

  it('unknown role + db.write + enforceLeastPrivilege:true → CAPABILITY_DENIED (empty grant set)', async () => {
    const result = await registry.invoke(makeTarget('db.write'), {
      actor: { id: 'u4', role: 'superuser' },
      enforceLeastPrivilege: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('CAPABILITY_DENIED');
    }
  });

  // ── flag-off → permissive (regression) ───────────────────────────────────

  it('flag-off: role "viewer" + db.write without enforceLeastPrivilege → ok (permissive)', async () => {
    const result = await registry.invoke(makeTarget('db.write'), {
      actor: { id: 'u5', role: 'viewer' },
      // enforceLeastPrivilege not set → permissive v1-default
    });
    expect(result.ok).toBe(true);
  });

  it('flag-off: no actor + db.write without enforceLeastPrivilege → ok (permissive)', async () => {
    const result = await registry.invoke(makeTarget('db.write'), {
      // no actor, no enforceLeastPrivilege → permissive
    });
    expect(result.ok).toBe(true);
  });

  // ── registry-level leastPrivilegeEnabled flag ────────────────────────────

  it('leastPrivilegeEnabled=true + role "viewer" + db.write → CAPABILITY_DENIED', async () => {
    registry.leastPrivilegeEnabled = true;
    const result = await registry.invoke(makeTarget('db.write'), {
      actor: { id: 'u6', role: 'viewer' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('CAPABILITY_DENIED');
    }
  });

  it('leastPrivilegeEnabled=true + role "operator" + db.read → ok', async () => {
    registry.leastPrivilegeEnabled = true;
    const result = await registry.invoke(makeTarget('db.read'), {
      actor: { id: 'u7', role: 'operator' },
    });
    expect(result.ok).toBe(true);
  });

  it('leastPrivilegeEnabled=true + no role → CAPABILITY_DENIED (no grants)', async () => {
    registry.leastPrivilegeEnabled = true;
    const result = await registry.invoke(makeTarget('db.write'), {
      actor: { id: 'u8' }, // no role
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('CAPABILITY_DENIED');
    }
  });

  it('leastPrivilegeEnabled=false (default) → permissive (regression)', async () => {
    // explicitly verify default is false
    expect(registry.leastPrivilegeEnabled).toBe(false);
    const result = await registry.invoke(makeTarget('db.write'), {
      actor: { id: 'u9', role: 'viewer' },
    });
    expect(result.ok).toBe(true);
  });

  // ── explicit grantedCapabilities always wins ──────────────────────────────

  it('explicit grantedCapabilities overrides role-derived grants', async () => {
    // viewer role would normally deny db-write, but explicit grant overrides
    const result = await registry.invoke(makeTarget('db.write'), {
      actor: { id: 'u10', role: 'viewer' },
      enforceLeastPrivilege: true,
      grantedCapabilities: ['db-write'],
    });
    expect(result.ok).toBe(true);
  });

  it('explicit empty grantedCapabilities denies even for admin role', async () => {
    const result = await registry.invoke(makeTarget('db.write'), {
      actor: { id: 'u11', role: 'admin' },
      grantedCapabilities: [], // explicit empty = deny all
    });
    expect(result.ok).toBe(false);
  });

  // ── viewer can access fs.read (within their grant) ────────────────────────

  it('role "viewer" + fs.read + enforceLeastPrivilege:true → ok', async () => {
    const result = await registry.invoke(makeTarget('fs.read'), {
      actor: { id: 'u12', role: 'viewer' },
      enforceLeastPrivilege: true,
    });
    expect(result.ok).toBe(true);
  });
});
