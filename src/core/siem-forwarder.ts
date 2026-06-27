// ═══ SIEM Event Forwarder ══════════════════════════════════════════════════════
// Pluggable, fail-safe forwarder that normalizes AuditEvents into SIEM records
// and ships them via an injected transport (default-off / no-op).
//
// Design: buffered batching + retry-bounded fail-safe. Transport errors are
// swallowed (logged + retried up to maxRetries, then dropped) — callers never see
// transport exceptions. No real network I/O here; all I/O is injected.
//
// ADR-010: no new runtime deps — Node built-ins only.
// ADR-008: imports only from core/ (audit-writer is core/).

import type { AuditEvent } from './audit-writer.js';

// ─── SIEM record ─────────────────────────────────────────────────────────────

/** Normalized SIEM record emitted per audit event. */
export interface SiemRecord {
  /** ISO-8601 timestamp when the event was forwarded. */
  ts: string;
  /** Identity of the actor that triggered the audit event. */
  actor: string;
  /** Action that was audited. */
  action: string;
  /** Outcome of the action ('success' | 'error' | 'unknown' or custom). */
  outcome: string;
  /** Optional correlation id for request tracing. */
  correlationId?: string;
  /** Optional causation id linking to a parent request. */
  causationId?: string;
}

// ─── Forwarder options ────────────────────────────────────────────────────────

/** Options for {@link createSiemForwarder}. All fields optional. */
export interface SiemForwarderOptions {
  /**
   * Pluggable transport. Receives a batch of normalized SIEM records.
   * When omitted the forwarder is default-off: events are buffered then
   * discarded on flush (never crash, never send).
   */
  transport?: (batch: SiemRecord[]) => Promise<void>;
  /**
   * Auto-flush interval in milliseconds. When > 0 the forwarder installs a
   * timer that flushes the buffer on this cadence. Default: 5 000 ms.
   * Pass 0 to disable timer-based flushing (manual flush only).
   */
  flushEvery?: number;
  /** Maximum batch size before an automatic flush is triggered. Default: 100. */
  maxBatch?: number;
  /**
   * Maximum transport invocation retries before the batch is dropped.
   * Default: 3. Set to 0 to disable retries (drop on first error).
   */
  maxRetries?: number;
  /**
   * Advisory warn function called once (per instance) when a flush occurs with
   * no transport configured. Defaults to `console.warn`. Inject in tests to
   * capture the advisory without writing to stderr.
   */
  warn?: (message: string) => void;
}

// ─── Public interface ─────────────────────────────────────────────────────────

/** SIEM forwarder handle returned by {@link createSiemForwarder}. */
export interface SiemForwarder {
  /**
   * Accept an audit event, normalize it to a {@link SiemRecord}, and append it
   * to the internal buffer. If the buffer reaches `maxBatch` an automatic flush
   * is triggered (fire-and-forget — errors are swallowed).
   */
  forward(event: AuditEvent): void;
  /**
   * Flush the current buffer through the transport. Returns when the attempt is
   * complete (success or after exhausting retries). Never throws.
   */
  flush(): Promise<void>;
  /**
   * Stop the internal flush timer (if any). Call when the forwarder is no
   * longer needed to avoid dangling timers in tests/short-lived processes.
   */
  dispose(): void;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a new SIEM forwarder.
 *
 * @example
 * ```ts
 * const fwd = createSiemForwarder({
 *   transport: async (batch) => { await httpPost('/siem/ingest', batch); },
 *   flushEvery: 10_000,
 *   maxBatch: 50,
 * });
 * fwd.forward(auditEvent);
 * await fwd.flush();
 * fwd.dispose();
 * ```
 */
export function createSiemForwarder(opts: SiemForwarderOptions = {}): SiemForwarder {
  const transport = opts.transport;
  const flushEvery = opts.flushEvery ?? 5_000;
  const maxBatch = opts.maxBatch ?? 100;
  const maxRetries = opts.maxRetries ?? 3;
  const warn = opts.warn ?? console.warn;

  let buffer: SiemRecord[] = [];
  let timer: ReturnType<typeof setInterval> | undefined;
  let warnedNoTransport = false;

  if (flushEvery > 0) {
    timer = setInterval(() => {
      void flushBuffer();
    }, flushEvery);
    // Allow the process to exit even if the timer is still active.
    if (typeof timer.unref === 'function') timer.unref();
  }

  function normalize(event: AuditEvent): SiemRecord {
    const meta = event.metadata ?? {};
    return {
      ts: new Date().toISOString(),
      actor: event.actor,
      action: event.action,
      outcome: typeof meta['outcome'] === 'string' ? meta['outcome'] : 'unknown',
      ...(typeof meta['correlationId'] === 'string'
        ? { correlationId: meta['correlationId'] }
        : {}),
      ...(typeof meta['causationId'] === 'string'
        ? { causationId: meta['causationId'] }
        : {}),
    };
  }

  async function flushBuffer(): Promise<void> {
    if (buffer.length === 0) return;

    const batch = buffer.splice(0, buffer.length);

    if (!transport) {
      // Default-off: no transport — discard batch. Emit a one-time advisory so
      // operators know forwarding is unconfigured and events are being dropped.
      if (!warnedNoTransport) {
        warnedNoTransport = true;
        warn(
          '[siem-forwarder] no transport configured — audit events are being discarded. ' +
            'Set opts.transport to enable SIEM forwarding.',
        );
      }
      return;
    }

    let attempt = 0;
    while (attempt <= maxRetries) {
      try {
        await transport(batch);
        return;
      } catch (err) {
        attempt++;
        if (attempt > maxRetries) {
          // Exhausted retries — drop the batch, never throw.
          console.error(
            `[siem-forwarder] transport failed after ${maxRetries + 1} attempt(s); dropping ${batch.length} record(s).`,
            err instanceof Error ? err.message : String(err),
          );
          return;
        }
      }
    }
  }

  return {
    forward(event: AuditEvent): void {
      buffer.push(normalize(event));
      if (buffer.length >= maxBatch) {
        // Fire-and-forget — errors swallowed inside flushBuffer().
        void flushBuffer();
      }
    },

    async flush(): Promise<void> {
      await flushBuffer();
    },

    dispose(): void {
      if (timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
      }
    },
  };
}
