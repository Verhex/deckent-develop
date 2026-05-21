import { randomUUID } from 'node:crypto';
import type { AuditEvent } from './types.js';
import { computeAuditHmac } from './audit-integrity.js';

/**
 * Minimal sink contract the audit recorder needs. MemoryStore satisfies this
 * structurally; tests can substitute a fake. The shape is deliberately loose
 * (`Record<string, unknown>`) — TerminalAudit owns the strict schema below.
 */
export interface AuditSink {
  insert(entry: Record<string, unknown>): void;
}

/**
 * Extended sink used when the HMAC chain (Sprint 179 W5-12, I4 invariant)
 * is active. MemoryStore implements this — fake test sinks can opt in.
 */
export interface ChainedAuditSink extends AuditSink {
  insertAuditWithHmac(
    entry: Record<string, unknown> & { id: string },
    prevHmac: string | null,
    hmac: string,
  ): void;
  getLastAuditHmac(): string | null;
}

/** Optional integrity config for chain-aware audit recording. */
export interface AuditIntegrityConfig {
  /** 32-byte HMAC key (loaded from `.deckent/audit-key`). */
  secret: Buffer;
}

function isChainedSink(sink: AuditSink): sink is ChainedAuditSink {
  return (
    typeof (sink as Partial<ChainedAuditSink>).insertAuditWithHmac === 'function' &&
    typeof (sink as Partial<ChainedAuditSink>).getLastAuditHmac === 'function'
  );
}

/**
 * Low-volume structured audit recorder for terminal lifecycle events.
 *
 * Security invariant (spec §1c.2): raw PTY output is NEVER routed through
 * this class. Callers MUST construct an {@link AuditEvent} with a short,
 * pre-redacted `detail` string. The recorder serializes only the structured
 * fields (`action`, `sessionId`, `detail`, `at`) into `content` — nothing
 * else is read from the event object and no stream/buffer is copied.
 *
 * Sprint 179 W5-12: when constructed with an `integrity` config AND a
 * chain-aware sink (MemoryStore), each `record()` call computes the next
 * HMAC chain link and persists `audit_prev_hmac` + `audit_hmac` alongside
 * the row. `verifyAuditChain()` (audit-integrity.ts) recomputes the chain
 * and reports tamper.
 */
export class TerminalAudit {
  private readonly integrity: AuditIntegrityConfig | undefined;

  constructor(
    private readonly store: AuditSink,
    integrity?: AuditIntegrityConfig,
  ) {
    this.integrity = integrity;
  }

  record(ev: AuditEvent): void {
    const content = JSON.stringify({
      action: ev.action,
      sessionId: ev.sessionId,
      detail: ev.detail,
      at: ev.at,
    });

    // Chain-aware path: compute next HMAC link and persist with prev/hmac.
    if (this.integrity && isChainedSink(this.store)) {
      const prevHmac = this.store.getLastAuditHmac();
      const hmac = computeAuditHmac(this.integrity.secret, {
        prevHmac,
        timestamp: ev.at,
        tenantId: ev.tenantId,
        action: ev.action,
        contentSignal: content,
      });

      this.store.insertAuditWithHmac(
        {
          id: `audit-${ev.action}-${ev.at}-${randomUUID()}`,
          type: 'audit',
          tenant_id: ev.tenantId,
          title: `terminal:${ev.action}`,
          content,
          decay_exempt: true,
        },
        prevHmac,
        hmac,
      );
      return;
    }

    // Legacy path: plain insert (used by tests with no-op sinks and by the
    // production wire until the integrity config is supplied).
    this.store.insert({
      type: 'audit',
      tenant_id: ev.tenantId,
      title: `terminal:${ev.action}`,
      content,
      decay_exempt: true,
    });
  }
}
