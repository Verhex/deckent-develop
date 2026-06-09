import { describe, it, expect, vi, afterEach } from 'vitest';
import { createSiemForwarder, type SiemRecord } from '../../src/core/siem-forwarder.js';
import type { AuditEvent } from '../../src/core/audit-writer.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    tenantId: 'test-tenant',
    actor: 'user-001',
    action: 'resource:read',
    ...overrides,
  };
}

// ─── Test 1 — default-off (no transport) ─────────────────────────────────────

describe('createSiemForwarder — default-off (no transport)', () => {
  it('forward() does not throw when no transport is configured', () => {
    const fwd = createSiemForwarder({});
    expect(() => fwd.forward(makeEvent())).not.toThrow();
    fwd.dispose();
  });

  it('flush() does not throw when no transport is configured', async () => {
    const fwd = createSiemForwarder({});
    fwd.forward(makeEvent());
    await expect(fwd.flush()).resolves.toBeUndefined();
    fwd.dispose();
  });

  it('flush() with empty buffer completes silently', async () => {
    const fwd = createSiemForwarder({});
    await expect(fwd.flush()).resolves.toBeUndefined();
    fwd.dispose();
  });
});

// ─── Test 2 — batch flush ─────────────────────────────────────────────────────

describe('createSiemForwarder — batch flush', () => {
  it('flush() sends all forwarded events as one batch', async () => {
    const received: SiemRecord[][] = [];
    const transport = vi.fn(async (batch: SiemRecord[]) => {
      received.push(batch);
    });

    const fwd = createSiemForwarder({ transport, flushEvery: 0 });
    fwd.forward(makeEvent({ action: 'a:1' }));
    fwd.forward(makeEvent({ action: 'a:2' }));
    fwd.forward(makeEvent({ action: 'a:3' }));

    await fwd.flush();

    expect(transport).toHaveBeenCalledTimes(1);
    expect(received[0]).toHaveLength(3);
    expect(received[0]!.map(r => r.action)).toEqual(['a:1', 'a:2', 'a:3']);
    fwd.dispose();
  });

  it('buffer is empty after flush — second flush is a no-op', async () => {
    const transport = vi.fn(async (_batch: SiemRecord[]) => {});

    const fwd = createSiemForwarder({ transport, flushEvery: 0 });
    fwd.forward(makeEvent());

    await fwd.flush();
    await fwd.flush(); // nothing to send

    expect(transport).toHaveBeenCalledTimes(1);
    fwd.dispose();
  });
});

// ─── Test 3 — maxBatch auto-flush ────────────────────────────────────────────

describe('createSiemForwarder — maxBatch auto-flush', () => {
  it('triggers an auto-flush when maxBatch is reached', async () => {
    const flushes: SiemRecord[][] = [];
    const transport = vi.fn(async (batch: SiemRecord[]) => {
      flushes.push(batch);
    });

    const fwd = createSiemForwarder({ transport, flushEvery: 0, maxBatch: 3 });

    fwd.forward(makeEvent({ action: 'e:1' }));
    fwd.forward(makeEvent({ action: 'e:2' }));
    fwd.forward(makeEvent({ action: 'e:3' })); // triggers auto-flush

    // Give the microtask queue a chance to drain.
    await new Promise(r => setImmediate(r));

    expect(transport).toHaveBeenCalledTimes(1);
    expect(flushes[0]).toHaveLength(3);
    fwd.dispose();
  });

  it('events after an auto-flush are buffered again', async () => {
    const transport = vi.fn(async (_batch: SiemRecord[]) => {});

    const fwd = createSiemForwarder({ transport, flushEvery: 0, maxBatch: 2 });

    fwd.forward(makeEvent({ action: 'e:1' }));
    fwd.forward(makeEvent({ action: 'e:2' })); // auto-flush

    await new Promise(r => setImmediate(r));

    fwd.forward(makeEvent({ action: 'e:3' })); // sits in buffer
    await fwd.flush();

    expect(transport).toHaveBeenCalledTimes(2);
    fwd.dispose();
  });
});

// ─── Test 4 — transport-error swallowed ──────────────────────────────────────

describe('createSiemForwarder — transport error handling', () => {
  it('flush() does not throw when transport rejects', async () => {
    const transport = vi.fn(async () => {
      throw new Error('network failure');
    });

    const fwd = createSiemForwarder({ transport, flushEvery: 0, maxRetries: 0 });
    fwd.forward(makeEvent());

    await expect(fwd.flush()).resolves.toBeUndefined(); // must NOT reject
    fwd.dispose();
  });

  it('retries transport up to maxRetries then drops', async () => {
    const transport = vi.fn(async () => {
      throw new Error('transient');
    });

    const fwd = createSiemForwarder({ transport, flushEvery: 0, maxRetries: 2 });
    fwd.forward(makeEvent());

    await fwd.flush();

    // 1 initial + 2 retries = 3 total calls
    expect(transport).toHaveBeenCalledTimes(3);
    fwd.dispose();
  });

  it('succeeds if transport recovers before maxRetries', async () => {
    let calls = 0;
    const transport = vi.fn(async () => {
      calls++;
      if (calls < 3) throw new Error('not yet');
    });

    const fwd = createSiemForwarder({ transport, flushEvery: 0, maxRetries: 3 });
    fwd.forward(makeEvent());

    await fwd.flush();

    expect(transport).toHaveBeenCalledTimes(3);
    fwd.dispose();
  });
});

// ─── Test 5 — SIEM record normalization ──────────────────────────────────────

describe('createSiemForwarder — SIEM record normalization', () => {
  it('maps actor + action from the audit event', async () => {
    const received: SiemRecord[] = [];
    const transport = vi.fn(async (batch: SiemRecord[]) => {
      received.push(...batch);
    });

    const fwd = createSiemForwarder({ transport, flushEvery: 0 });
    fwd.forward(makeEvent({ actor: 'admin', action: 'config:update' }));
    await fwd.flush();

    expect(received[0]!.actor).toBe('admin');
    expect(received[0]!.action).toBe('config:update');
    fwd.dispose();
  });

  it('outcome defaults to "unknown" when not in metadata', async () => {
    const received: SiemRecord[] = [];
    const transport = vi.fn(async (batch: SiemRecord[]) => received.push(...batch));

    const fwd = createSiemForwarder({ transport, flushEvery: 0 });
    fwd.forward(makeEvent());
    await fwd.flush();

    expect(received[0]!.outcome).toBe('unknown');
    fwd.dispose();
  });

  it('outcome is extracted from metadata.outcome', async () => {
    const received: SiemRecord[] = [];
    const transport = vi.fn(async (batch: SiemRecord[]) => received.push(...batch));

    const fwd = createSiemForwarder({ transport, flushEvery: 0 });
    fwd.forward(makeEvent({ metadata: { outcome: 'success' } }));
    await fwd.flush();

    expect(received[0]!.outcome).toBe('success');
    fwd.dispose();
  });

  it('correlationId and causationId are extracted from metadata', async () => {
    const received: SiemRecord[] = [];
    const transport = vi.fn(async (batch: SiemRecord[]) => received.push(...batch));

    const fwd = createSiemForwarder({ transport, flushEvery: 0 });
    fwd.forward(
      makeEvent({
        metadata: {
          outcome: 'success',
          correlationId: 'corr-abc',
          causationId: 'caus-xyz',
        },
      }),
    );
    await fwd.flush();

    expect(received[0]!.correlationId).toBe('corr-abc');
    expect(received[0]!.causationId).toBe('caus-xyz');
    fwd.dispose();
  });

  it('ts is an ISO-8601 string', async () => {
    const received: SiemRecord[] = [];
    const transport = vi.fn(async (batch: SiemRecord[]) => received.push(...batch));

    const fwd = createSiemForwarder({ transport, flushEvery: 0 });
    fwd.forward(makeEvent());
    await fwd.flush();

    expect(received[0]!.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    fwd.dispose();
  });
});

// ─── Test 6 — dispose ────────────────────────────────────────────────────────

describe('createSiemForwarder — dispose', () => {
  it('dispose() can be called multiple times without error', () => {
    const fwd = createSiemForwarder({ flushEvery: 0 });
    expect(() => {
      fwd.dispose();
      fwd.dispose();
    }).not.toThrow();
  });
});
