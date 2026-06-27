import { describe, it, expect, vi } from 'vitest';
import { createSiemForwarder } from '../../src/core/siem-forwarder.js';
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

// ─── No-transport advisory warn ───────────────────────────────────────────────

describe('createSiemForwarder — no-transport advisory warn', () => {
  it('emits a single advisory when no transport is configured and batch is discarded', async () => {
    const warn = vi.fn();
    const fwd = createSiemForwarder({ warn, flushEvery: 0 });

    fwd.forward(makeEvent());
    await fwd.flush();

    // Advisory must be emitted exactly once.
    expect(warn).toHaveBeenCalledTimes(1);
    // Message must mention transport so the operator knows what config key to set.
    expect(warn.mock.calls[0]![0]).toContain('transport');
    // Batch was discarded (no throw, resolves normally).
    fwd.dispose();
  });

  it('does not re-warn on subsequent flushes (once-per-instance guard)', async () => {
    const warn = vi.fn();
    const fwd = createSiemForwarder({ warn, flushEvery: 0 });

    fwd.forward(makeEvent());
    await fwd.flush(); // first flush → warns

    fwd.forward(makeEvent());
    await fwd.flush(); // second flush → must NOT warn again

    expect(warn).toHaveBeenCalledTimes(1);
    fwd.dispose();
  });

  it('does not warn when a transport is configured — events forwarded normally', async () => {
    const warn = vi.fn();
    const transport = vi.fn(async () => {});
    const fwd = createSiemForwarder({ warn, transport, flushEvery: 0 });

    fwd.forward(makeEvent());
    await fwd.flush();

    expect(warn).not.toHaveBeenCalled();
    expect(transport).toHaveBeenCalledTimes(1);
    fwd.dispose();
  });
});
