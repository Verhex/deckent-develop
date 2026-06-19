// ─── F8-003 Deepen: enforce_least_privilege wire + denial-audit ───────────────
// Tests for:
//   1. createAuditedCapabilityRegistry config-flag → leastPrivilegeEnabled wire
//   2. CAPABILITY_DENIED → emitDenied callback (denial audit hook)
//   3. operator + gpu-handler → CAPABILITY_DENIED; admin → ok; flag-off → permissive
//
// Hermetic: no filesystem, no network, no gitignored local state.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CapabilityRegistry,
  type CapabilityHandler,
  type CapabilityDenialInfo,
  ROLE_CAPABILITY_MAP,
} from '../../src/core/capability-broker.js';
import { createAuditedCapabilityRegistry } from '../../src/core/capability-runtime.js';
import type { Capability, CapabilityTarget } from '../../src/core/work-model.js';

// ─── Hermetic helpers ─────────────────────────────────────────────────────────

function makeHandler(cap: Capability, id = 'test-handler'): CapabilityHandler {
  return {
    requiredCapability: cap,
    description: id,
    invoke: (_args) => ({ invoked: true }),
  };
}

function target(capability: string): CapabilityTarget {
  return { capability };
}

// ─── createAuditedCapabilityRegistry — enforce_least_privilege wire ───────────

describe('createAuditedCapabilityRegistry — enforce_least_privilege flag', () => {
  it('config enforce_least_privilege:true → registry.leastPrivilegeEnabled === true', () => {
    const reg = createAuditedCapabilityRegistry(undefined, {}, { enforce_least_privilege: true });
    expect(reg.leastPrivilegeEnabled).toBe(true);
  });

  it('config enforce_least_privilege:false → registry.leastPrivilegeEnabled === false', () => {
    const reg = createAuditedCapabilityRegistry(undefined, {}, { enforce_least_privilege: false });
    expect(reg.leastPrivilegeEnabled).toBe(false);
  });

  it('no config → registry.leastPrivilegeEnabled defaults to false (permissive)', () => {
    const reg = createAuditedCapabilityRegistry();
    expect(reg.leastPrivilegeEnabled).toBe(false);
  });

  it('empty config object → registry.leastPrivilegeEnabled defaults to false', () => {
    const reg = createAuditedCapabilityRegistry(undefined, {}, {});
    expect(reg.leastPrivilegeEnabled).toBe(false);
  });
});

// ─── operator + gpu-handler → CAPABILITY_DENIED; admin → ok ──────────────────

describe('least-privilege: operator + gpu → CAPABILITY_DENIED; admin → ok', () => {
  let registry: CapabilityRegistry;

  beforeEach(() => {
    registry = new CapabilityRegistry();
    registry.register('gpu.compute', makeHandler('gpu', 'gpu-compute-handler'));
    registry.leastPrivilegeEnabled = true;
  });

  it('operator role + gpu.compute + leastPrivilegeEnabled:true → CAPABILITY_DENIED', async () => {
    const result = await registry.invoke(target('gpu.compute'), {
      actor: { id: 'op1', role: 'operator' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('CAPABILITY_DENIED');
    }
  });

  it('admin role + gpu.compute + leastPrivilegeEnabled:true → ok (gpu in admin grants)', async () => {
    const result = await registry.invoke(target('gpu.compute'), {
      actor: { id: 'adm1', role: 'admin' },
    });
    expect(result.ok).toBe(true);
  });

  it('viewer role + gpu.compute + leastPrivilegeEnabled:true → CAPABILITY_DENIED', async () => {
    const result = await registry.invoke(target('gpu.compute'), {
      actor: { id: 'v1', role: 'viewer' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('CAPABILITY_DENIED');
    }
  });

  it('developer role + gpu.compute + leastPrivilegeEnabled:true → CAPABILITY_DENIED (no gpu in developer)', async () => {
    const result = await registry.invoke(target('gpu.compute'), {
      actor: { id: 'd1', role: 'developer' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('CAPABILITY_DENIED');
    }
  });
});

// ─── flag-off → permissive (backward compat regression) ──────────────────────

describe('flag-off: leastPrivilegeEnabled false → permissive', () => {
  it('operator + gpu.compute with leastPrivilegeEnabled:false → ok (permissive)', async () => {
    const registry = new CapabilityRegistry();
    registry.register('gpu.compute', makeHandler('gpu', 'gpu-compute-handler'));
    // default leastPrivilegeEnabled = false

    const result = await registry.invoke(target('gpu.compute'), {
      actor: { id: 'op1', role: 'operator' },
    });
    expect(result.ok).toBe(true);
  });

  it('no actor + gpu.compute with leastPrivilegeEnabled:false → ok (permissive)', async () => {
    const registry = new CapabilityRegistry();
    registry.register('gpu.compute', makeHandler('gpu', 'gpu-compute-handler'));

    const result = await registry.invoke(target('gpu.compute'));
    expect(result.ok).toBe(true);
  });
});

// ─── emitDenied callback — denial audit hook ─────────────────────────────────

describe('CapabilityRegistry.emitDenied — denial audit hook', () => {
  let registry: CapabilityRegistry;
  let denials: CapabilityDenialInfo[];

  beforeEach(() => {
    registry = new CapabilityRegistry();
    registry.register('gpu.compute', makeHandler('gpu', 'gpu-compute-handler'));
    registry.leastPrivilegeEnabled = true;
    denials = [];
    registry.emitDenied = (info) => denials.push(info);
  });

  it('operator + gpu.compute → emitDenied called with correct info', async () => {
    await registry.invoke(target('gpu.compute'), {
      actor: { id: 'op-user', role: 'operator' },
    });
    expect(denials).toHaveLength(1);
    expect(denials[0]?.capability).toBe('gpu.compute');
    expect(denials[0]?.role).toBe('operator');
    expect(denials[0]?.actorId).toBe('op-user');
  });

  it('admin + gpu.compute → emitDenied NOT called (ok result)', async () => {
    await registry.invoke(target('gpu.compute'), {
      actor: { id: 'adm-user', role: 'admin' },
    });
    expect(denials).toHaveLength(0);
  });

  it('emitDenied receives grantedCapabilities for the denied actor', async () => {
    await registry.invoke(target('gpu.compute'), {
      actor: { id: 'op-user', role: 'operator' },
    });
    expect(denials[0]?.grantedCapabilities).toBeDefined();
    // operator has db-query but NOT gpu
    expect(denials[0]?.grantedCapabilities).toContain('db-query');
    expect(denials[0]?.grantedCapabilities).not.toContain('gpu');
  });

  it('emitDenied NOT called when leastPrivilegeEnabled:false (permissive)', async () => {
    registry.leastPrivilegeEnabled = false;
    await registry.invoke(target('gpu.compute'), {
      actor: { id: 'op-user', role: 'operator' },
    });
    expect(denials).toHaveLength(0);
  });

  it('emitDenied NOT called on CAPABILITY_NOT_FOUND', async () => {
    await registry.invoke(target('nonexistent.cap'), {
      actor: { id: 'op-user', role: 'operator' },
    });
    expect(denials).toHaveLength(0);
  });
});

// ─── createAuditedCapabilityRegistry — end-to-end wire ───────────────────────

describe('createAuditedCapabilityRegistry — end-to-end deny path', () => {
  it('enforce_least_privilege:true + operator + gpu → CAPABILITY_DENIED', async () => {
    const registry = createAuditedCapabilityRegistry(
      undefined,
      {},
      { enforce_least_privilege: true },
    );
    registry.register('gpu.compute', makeHandler('gpu', 'gpu-handler'));

    const result = await registry.invoke(target('gpu.compute'), {
      actor: { id: 'op1', role: 'operator' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('CAPABILITY_DENIED');
    }
  });

  it('enforce_least_privilege:true + admin + gpu → ok', async () => {
    const registry = createAuditedCapabilityRegistry(
      undefined,
      {},
      { enforce_least_privilege: true },
    );
    registry.register('gpu.compute', makeHandler('gpu', 'gpu-handler'));

    const result = await registry.invoke(target('gpu.compute'), {
      actor: { id: 'adm1', role: 'admin' },
    });
    expect(result.ok).toBe(true);
  });

  it('no enforce_least_privilege (flag-off) + operator + gpu → ok (permissive)', async () => {
    const registry = createAuditedCapabilityRegistry(undefined, {}, {});
    registry.register('gpu.compute', makeHandler('gpu', 'gpu-handler'));

    const result = await registry.invoke(target('gpu.compute'), {
      actor: { id: 'op1', role: 'operator' },
    });
    expect(result.ok).toBe(true);
  });

  it('enforce_least_privilege:true + emitDenied spy → denial audit triggered on CAPABILITY_DENIED', async () => {
    const registry = createAuditedCapabilityRegistry(
      undefined,
      {},
      { enforce_least_privilege: true },
    );
    registry.register('gpu.compute', makeHandler('gpu', 'gpu-handler'));

    const denials: CapabilityDenialInfo[] = [];
    registry.emitDenied = (info) => denials.push(info);

    await registry.invoke(target('gpu.compute'), {
      actor: { id: 'op1', role: 'operator' },
    });

    expect(denials).toHaveLength(1);
    expect(denials[0]?.capability).toBe('gpu.compute');
    expect(denials[0]?.role).toBe('operator');
  });
});

// ─── ROLE_CAPABILITY_MAP coverage — verify operator missing gpu ───────────────

describe('ROLE_CAPABILITY_MAP coverage for gpu capability', () => {
  it('operator ROLE_CAPABILITY_MAP does NOT include gpu', () => {
    expect(ROLE_CAPABILITY_MAP['operator']).not.toContain('gpu');
  });

  it('admin ROLE_CAPABILITY_MAP DOES include gpu', () => {
    expect(ROLE_CAPABILITY_MAP['admin']).toContain('gpu');
  });

  it('viewer ROLE_CAPABILITY_MAP does NOT include gpu', () => {
    expect(ROLE_CAPABILITY_MAP['viewer']).not.toContain('gpu');
  });
});
