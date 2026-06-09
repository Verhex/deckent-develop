import { describe, it, expect, vi } from 'vitest';
import {
  withAuditedInvocation,
  type CapabilityAuditRecord,
} from '../../src/core/capability-audit-bridge.js';
import type { CapabilityHandler, InvocationContext } from '../../src/core/capability-broker.js';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeHandler(over?: Partial<CapabilityHandler>): CapabilityHandler {
  return {
    requiredCapability: 'mcp-tool',
    invoke: vi.fn().mockResolvedValue({ ok: 'yes' }),
    ...over,
  };
}

const emptyCtx: InvocationContext = {};
const actorCtx: InvocationContext = {
  actor: { id: 'user-1', role: 'admin', tenantId: 'tenant-42' },
};

// ─── success path ─────────────────────────────────────────────────────────────

describe('withAuditedInvocation — success path', () => {
  it('returns the original handler result unchanged', async () => {
    const emit = vi.fn();
    const wrapped = withAuditedInvocation(makeHandler(), emit);
    const result = await wrapped.invoke({ x: 1 }, emptyCtx);
    expect(result).toEqual({ ok: 'yes' });
  });

  it('emits a success record with correct fields', async () => {
    const emit = vi.fn();
    const handler = makeHandler({ requiredCapability: 'db.read', description: 'test handler' });
    const wrapped = withAuditedInvocation(handler, emit);
    await wrapped.invoke({}, actorCtx);

    expect(emit).toHaveBeenCalledOnce();
    const record: CapabilityAuditRecord = emit.mock.calls[0][0];
    expect(record.outcome).toBe('success');
    expect(record.capability).toBe('db.read');
    expect(record.requiredCapability).toBe('db.read');
    expect(record.actor).toEqual(actorCtx.actor);
    expect(typeof record.timestamp).toBe('string');
    expect(record.error).toBeUndefined();
  });

  it('emits AFTER invoke completes (sequencing)', async () => {
    const seq: string[] = [];
    const handler: CapabilityHandler = {
      requiredCapability: 'mcp-tool',
      invoke: async () => { seq.push('invoke'); return 'val'; },
    };
    const emit = vi.fn().mockImplementation(() => seq.push('emit'));
    const wrapped = withAuditedInvocation(handler, emit);
    const val = await wrapped.invoke({}, emptyCtx);
    expect(val).toBe('val');
    expect(seq).toEqual(['invoke', 'emit']);
  });

  it('preserves requiredCapability and description from the original handler', () => {
    const handler = makeHandler({ requiredCapability: 'fs-read', description: 'reads files' });
    const wrapped = withAuditedInvocation(handler);
    expect(wrapped.requiredCapability).toBe('fs-read');
    expect(wrapped.description).toBe('reads files');
  });

  it('emits record once per invocation across multiple calls', async () => {
    const emit = vi.fn();
    const wrapped = withAuditedInvocation(makeHandler(), emit);
    await wrapped.invoke({}, emptyCtx);
    await wrapped.invoke({}, emptyCtx);
    expect(emit).toHaveBeenCalledTimes(2);
    expect((emit.mock.calls[0][0] as CapabilityAuditRecord).outcome).toBe('success');
    expect((emit.mock.calls[1][0] as CapabilityAuditRecord).outcome).toBe('success');
  });
});

// ─── error path ───────────────────────────────────────────────────────────────

describe('withAuditedInvocation — error path', () => {
  it('re-throws the original error after emitting', async () => {
    const err = new Error('handler boom');
    const handler: CapabilityHandler = {
      requiredCapability: 'mcp-tool',
      invoke: () => { throw err; },
    };
    const emit = vi.fn();
    const wrapped = withAuditedInvocation(handler, emit);
    await expect(wrapped.invoke({}, emptyCtx)).rejects.toThrow('handler boom');
    expect(emit).toHaveBeenCalledOnce();
  });

  it('emits error record BEFORE re-throwing (sequencing)', async () => {
    const seq: string[] = [];
    const handler: CapabilityHandler = {
      requiredCapability: 'mail.read',
      invoke: async () => { throw new Error('network'); },
    };
    const emit = vi.fn().mockImplementation(() => seq.push('emit'));
    const wrapped = withAuditedInvocation(handler, emit);
    await wrapped.invoke({}, emptyCtx).catch(() => seq.push('rethrown'));
    expect(seq).toEqual(['emit', 'rethrown']);
  });

  it('error record has outcome:error, error message, and actor', async () => {
    const handler: CapabilityHandler = {
      requiredCapability: 'db.read',
      invoke: () => { throw new Error('db down'); },
    };
    const emit = vi.fn();
    const wrapped = withAuditedInvocation(handler, emit);
    await wrapped.invoke({}, actorCtx).catch(() => undefined);
    const record: CapabilityAuditRecord = emit.mock.calls[0][0];
    expect(record.outcome).toBe('error');
    expect(record.capability).toBe('db.read');
    expect(record.error).toBe('db down');
    expect(record.actor).toEqual(actorCtx.actor);
    expect(typeof record.timestamp).toBe('string');
  });

  it('handles non-Error throws (string)', async () => {
    const handler: CapabilityHandler = {
      requiredCapability: 'mcp-tool',
      invoke: () => { throw 'raw string error'; },
    };
    const emit = vi.fn();
    const wrapped = withAuditedInvocation(handler, emit);
    await wrapped.invoke({}, emptyCtx).catch(() => undefined);
    const record: CapabilityAuditRecord = emit.mock.calls[0][0];
    expect(record.outcome).toBe('error');
    expect(record.error).toBe('raw string error');
  });
});

// ─── default no-op emit (default-off) ────────────────────────────────────────

describe('withAuditedInvocation — default no-op emit', () => {
  it('works without emit argument (success path — no crash)', async () => {
    const wrapped = withAuditedInvocation(makeHandler());
    const result = await wrapped.invoke({}, emptyCtx);
    expect(result).toEqual({ ok: 'yes' });
  });

  it('works without emit argument (error path — re-throws, no crash)', async () => {
    const handler: CapabilityHandler = {
      requiredCapability: 'mcp-tool',
      invoke: () => { throw new Error('boom'); },
    };
    const wrapped = withAuditedInvocation(handler);
    await expect(wrapped.invoke({}, emptyCtx)).rejects.toThrow('boom');
  });
});

// ─── actor-absent context ─────────────────────────────────────────────────────

describe('withAuditedInvocation — actor absent', () => {
  it('emits record with undefined actor when ctx has no actor', async () => {
    const emit = vi.fn();
    const wrapped = withAuditedInvocation(makeHandler(), emit);
    await wrapped.invoke({}, emptyCtx);
    const record: CapabilityAuditRecord = emit.mock.calls[0][0];
    expect(record.actor).toBeUndefined();
  });

  it('emits error record with undefined actor when ctx has no actor', async () => {
    const handler: CapabilityHandler = {
      requiredCapability: 'mcp-tool',
      invoke: () => { throw new Error('fail'); },
    };
    const emit = vi.fn();
    const wrapped = withAuditedInvocation(handler, emit);
    await wrapped.invoke({}, emptyCtx).catch(() => undefined);
    const record: CapabilityAuditRecord = emit.mock.calls[0][0];
    expect(record.actor).toBeUndefined();
  });
});
