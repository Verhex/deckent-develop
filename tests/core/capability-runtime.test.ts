// tests/core/capability-runtime.test.ts
// Composition root for the F8 capability cluster: default + extended + data
// handlers in one registry, every handler wrapped with the audit bridge.
import { describe, it, expect, vi, beforeEach } from 'vitest';
// CAPABILITY-001: partial-mock `debugLog` so the enforcement-advisory surface is
// assertable and no test appends to the real .brain/ERRORS.md (hermetic).
vi.mock('../../src/core/utils.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/core/utils.js')>()),
  debugLog: vi.fn(),
}));
import {
  createAuditedCapabilityRegistry,
  resolveCapabilityEnforcement,
} from '../../src/core/capability-runtime.js';
import { debugLog } from '../../src/core/utils.js';
import type { CapabilityAuditRecord } from '../../src/core/capability-audit-bridge.js';
import { createInMemoryErpDriver } from '../../src/core/erp/handler.js';
import { createErpConnector, type ErpConnector, type ErpResultSet } from '../../src/core/erp/connector.js';

describe('createAuditedCapabilityRegistry', () => {
  it('preinstalls the full handler set (reference + extended + data)', () => {
    const reg = createAuditedCapabilityRegistry();
    for (const name of ['echo', 'fs.read', 'http.get', 'env.read', 'shell.exec', 'db.query', 'mail.search']) {
      expect(reg.has(name), `missing handler: ${name}`).toBe(true);
    }
  });

  it('emits a success audit record on a successful invocation', async () => {
    const records: CapabilityAuditRecord[] = [];
    const reg = createAuditedCapabilityRegistry((r) => records.push(r));
    const res = await reg.invoke({ capability: 'echo', args: { a: 1 } });
    expect(res.ok).toBe(true);
    expect(records).toHaveLength(1);
    expect(records[0]!.outcome).toBe('success');
  });

  it('emits an error audit record when a handler throws (and the broker degrades to CAPABILITY_FAILED)', async () => {
    const records: CapabilityAuditRecord[] = [];
    const reg = createAuditedCapabilityRegistry((r) => records.push(r));
    // env.read with an empty allowlist → handler throws → audit error record
    const res = await reg.invoke({ capability: 'env.read', args: { name: 'HOME' } });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('CAPABILITY_FAILED');
    expect(records).toHaveLength(1);
    expect(records[0]!.outcome).toBe('error');
  });

  it('a throwing emit never breaks the invocation (fail-safe)', async () => {
    const reg = createAuditedCapabilityRegistry(() => { throw new Error('sink down'); });
    const res = await reg.invoke({ capability: 'echo', args: {} });
    expect(res.ok).toBe(true);
  });

  it('forwards handler options (env allowlist) to the underlying handlers', async () => {
    const reg = createAuditedCapabilityRegistry(undefined, {
      env: { env: { SAFE_VAR: 'v1' } as NodeJS.ProcessEnv, allowlist: ['SAFE_VAR'] },
    });
    const res = await reg.invoke({ capability: 'env.read', args: { name: 'SAFE_VAR' } });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value).toEqual({ name: 'SAFE_VAR', value: 'v1' });
  });

  it('omitting emit yields a plain working registry (no audit, no crash)', async () => {
    const reg = createAuditedCapabilityRegistry();
    const res = await reg.invoke({ capability: 'echo', args: {} });
    expect(res.ok).toBe(true);
  });
});

describe('createAuditedCapabilityRegistry — erp wiring (Sprint 265)', () => {
  function buildErpConnector(): ErpConnector {
    const driver = createInMemoryErpDriver({
      customers: [{ id: 1, country: 'DE' }, { id: 2, country: 'US' }],
    });
    return createErpConnector({ driver }).registerEntity('customers', {
      fields: ['id', 'country'],
    });
  }

  it("omitting the erp option keeps today's behavior — has('erp.read') is false", () => {
    const reg = createAuditedCapabilityRegistry();
    expect(reg.has('erp.read')).toBe(false);
  });

  it("registers 'erp.read' and round-trips a query when the erp option is provided", async () => {
    const reg = createAuditedCapabilityRegistry(undefined, { erp: { connector: buildErpConnector() } });
    expect(reg.has('erp.read')).toBe(true);
    const res = await reg.invoke({
      capability: 'erp.read',
      args: { entity: 'customers', filters: [{ field: 'country', op: 'eq', value: 'DE' }] },
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect((res.value as ErpResultSet).rows).toEqual([{ id: 1, country: 'DE' }]);
  });

  it('erp invocations flow through the audit bridge', async () => {
    const records: CapabilityAuditRecord[] = [];
    const reg = createAuditedCapabilityRegistry((r) => records.push(r), {
      erp: { connector: buildErpConnector() },
    });
    const res = await reg.invoke({ capability: 'erp.read', args: { entity: 'customers' } });
    expect(res.ok).toBe(true);
    expect(records).toHaveLength(1);
    expect(records[0]!.capability).toBe('erp.read');
    expect(records[0]!.outcome).toBe('success');
  });
});

// ═══ CAPABILITY-001 — capability-enforcement truth (advisory) ═══════════════
describe('resolveCapabilityEnforcement — the dead-by-default authority truth', () => {
  it('gate DISABLED by default (no config) → ADVISORY_GATE_DISABLED, not enforced', () => {
    const r = resolveCapabilityEnforcement(undefined, undefined);
    expect(r.enforced).toBe(false);
    expect(r.reasonCode).toBe('ADVISORY_GATE_DISABLED');
    expect(r.denialAudited).toBe(false);
  });

  it('config.enforce_least_privilege:false → still ADVISORY_GATE_DISABLED', () => {
    expect(resolveCapabilityEnforcement({}, { enforce_least_privilege: false }).reasonCode)
      .toBe('ADVISORY_GATE_DISABLED');
  });

  it('config.enforce_least_privilege:true → ENFORCED_LEAST_PRIVILEGE, enforced', () => {
    const r = resolveCapabilityEnforcement({}, { enforce_least_privilege: true });
    expect(r.enforced).toBe(true);
    expect(r.reasonCode).toBe('ENFORCED_LEAST_PRIVILEGE');
  });

  it('denialAudited reflects options.denialAudit presence, independent of the gate', () => {
    expect(resolveCapabilityEnforcement({ denialAudit: { projectRoot: '/x' } }, undefined).denialAudited).toBe(true);
    expect(resolveCapabilityEnforcement({}, { enforce_least_privilege: true }).denialAudited).toBe(false);
  });
});

describe('createAuditedCapabilityRegistry — surfaces the disabled gate (advisory)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('production default (no config) → advisory debugLog fires with the dead-gate truth', () => {
    createAuditedCapabilityRegistry();
    const calls = vi.mocked(debugLog).mock.calls.filter((c) => c[0] === 'capability:enforcement-advisory');
    expect(calls).toHaveLength(1);
    expect(String(calls[0]![1])).toMatch(/least-privilege gate DISABLED/u);
    expect(String(calls[0]![1])).toMatch(/CAPABILITY_DENIED is also unaudited/u);
  });

  it('gate armed (enforce_least_privilege) → NO advisory (the gate is real)', () => {
    createAuditedCapabilityRegistry(undefined, {}, { enforce_least_privilege: true });
    const calls = vi.mocked(debugLog).mock.calls.filter((c) => c[0] === 'capability:enforcement-advisory');
    expect(calls).toHaveLength(0);
  });
});
