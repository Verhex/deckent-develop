import type { AuditEvent } from './types.js';

/**
 * Minimal sink contract the audit recorder needs. MemoryStore satisfies this
 * structurally; tests can substitute a fake. The shape is deliberately loose
 * (`Record<string, unknown>`) — TerminalAudit owns the strict schema below.
 */
export interface AuditSink {
  insert(entry: Record<string, unknown>): void;
}

/**
 * Low-volume structured audit recorder for terminal lifecycle events.
 *
 * Security invariant (spec §1c.2): raw PTY output is NEVER routed through
 * this class. Callers MUST construct an {@link AuditEvent} with a short,
 * pre-redacted `detail` string. The recorder serializes only the structured
 * fields (`action`, `sessionId`, `detail`, `at`) into `content` — nothing
 * else is read from the event object and no stream/buffer is copied.
 */
export class TerminalAudit {
  constructor(private readonly store: AuditSink) {}

  record(ev: AuditEvent): void {
    this.store.insert({
      type: 'audit',
      tenant_id: ev.tenantId,
      title: `terminal:${ev.action}`,
      content: JSON.stringify({
        action: ev.action,
        sessionId: ev.sessionId,
        detail: ev.detail,
        at: ev.at,
      }),
      decay_exempt: true,
    });
  }
}
