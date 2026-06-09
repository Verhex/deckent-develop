// tests/core/capability-runtime.test.ts
// Composition root for the F8 capability cluster: default + extended + data
// handlers in one registry, every handler wrapped with the audit bridge.
import { describe, it, expect } from 'vitest';
import { createAuditedCapabilityRegistry } from '../../src/core/capability-runtime.js';
import type { CapabilityAuditRecord } from '../../src/core/capability-audit-bridge.js';

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
