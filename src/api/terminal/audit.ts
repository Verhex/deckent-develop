import { randomUUID } from 'node:crypto';
import type { AuditEvent } from './types.js';
import { computeAuditHmac } from './audit-integrity.js';
import type { MemoryStore } from '../../core/memory-store.js';
import type { CreateEntryInput } from '../../core/memory-types.js';

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

/**
 * Provenance of an {@link AuditEvent}'s `tenantId` (ADR-G-029 invariant #3,
 * AUDIT-TENANT born-item). `'resolved'` means the caller supplied a tenant
 * derived from real auth-context (e.g. `deriveRequestPrincipal()` on the HTTP
 * terminal routes, or a session's own `tenantId`). `'fallback'` means the
 * literal default `'local'` was used because no auth-context was available
 * at the call site (e.g. the WS gateway's pre-session `auth.ok`/`auth.deny`
 * events) — this is an honest label, not a defect: single-tenant deployments
 * legitimately use `'local'` too, so `'fallback'` marks "unverified provenance",
 * not "wrong value".
 */
export type TenantSource = 'resolved' | 'fallback';

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
    // AUDIT-TENANT (ADR-G-029, born row-59): tenantId provenance, inferred
    // from the value itself since callers do not (yet) pass an explicit
    // source. Kept OUT of `content` (HMAC contentSignal + the existing
    // exact-key-set test in tests/api/terminal/audit.test.ts both depend on
    // content staying {action,sessionId,detail,at}) — persisted as its own
    // field instead, so the HMAC chain is unaffected.
    const tenantSource: TenantSource = ev.tenantId !== 'local' ? 'resolved' : 'fallback';

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
          tenant_source: tenantSource,
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
      tenant_source: tenantSource,
      title: `terminal:${ev.action}`,
      content,
      decay_exempt: true,
    });
  }
}

/**
 * Production {@link ChainedAuditSink} — persists terminal lifecycle audit
 * events into a real {@link MemoryStore} (`.brain/memory.db`), replacing
 * the no-op default (ADR-G-029 invariant #3 clause-2, AUDIT-WIRE).
 *
 * `MemoryStore.insert()` requires `CreateEntryInput.id`, but
 * `TerminalAudit`'s legacy (non-chained) call path — `this.store.insert({...})`
 * — never supplies one. This adapter generates the id itself for that path,
 * so wiring a real store stays safe regardless of whether the integrity
 * chain is enabled. The chain path already carries its own id (generated by
 * `TerminalAudit.record()`), which is forwarded verbatim.
 */
export class MemoryStoreAuditSink implements ChainedAuditSink {
  constructor(private readonly store: MemoryStore) {}

  insert(entry: Record<string, unknown>): void {
    this.store.insert(this.toCreateEntryInput(`audit-${randomUUID()}`, entry));
  }

  insertAuditWithHmac(
    entry: Record<string, unknown> & { id: string },
    prevHmac: string | null,
    hmac: string,
  ): void {
    this.store.insertAuditWithHmac(this.toCreateEntryInput(entry.id, entry), prevHmac, hmac);
  }

  getLastAuditHmac(): string | null {
    return this.store.getLastAuditHmac();
  }

  private toCreateEntryInput(id: string, entry: Record<string, unknown>): CreateEntryInput {
    const tenantSource = entry['tenant_source'];
    return {
      id,
      type: 'audit',
      title: typeof entry['title'] === 'string' ? entry['title'] : 'terminal:audit',
      content: typeof entry['content'] === 'string' ? entry['content'] : JSON.stringify(entry),
      tenant_id: typeof entry['tenant_id'] === 'string' ? entry['tenant_id'] : undefined,
      decay_exempt: entry['decay_exempt'] === true,
      // AUDIT-TENANT: tenant provenance label, carried via the sanctioned
      // `metadata` extensibility column (memory-types.ts) rather than a new
      // schema column — same pattern as chat-turn metadata.
      ...(typeof tenantSource === 'string' ? { metadata: { tenantSource } } : {}),
    };
  }
}
