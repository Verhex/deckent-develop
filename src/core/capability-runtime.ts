// ═══ Capability Runtime — F8 cluster composition root ════════════════════════
// Joins the four capability files into ONE production-ready registry:
//   capability-broker.ts        — registry + reference handlers (echo, fs.read)
//   capability-handlers.ts      — http.get / env.read / shell.exec
//   capability-handlers-data.ts — db.query / mail.search
//   capability-handlers-erp.ts  — erp.read (opt-in, injected ErpConnector)
//   capability-audit-bridge.ts  — per-invocation audit record emission
// This is the call-site the cluster was missing (capability-maturity E11 —
// "closed island"); buildEngineRuntime consumes it for kind=capability backlog
// dispatch. ADR-008: core-only imports. ADR-010: no new deps.

import {
  CapabilityRegistry,
  createDefaultRegistry,
} from './capability-broker.js';
import {
  installExtendedHandlers,
  type ExtendedHandlerOptions,
} from './capability-handlers.js';
import {
  installDataHandlers,
  type DataHandlerOptions,
} from './capability-handlers-data.js';
import { installErpHandler } from './capability-handlers-erp.js';
import type { ErpConnector } from './erp-connector.js';
import {
  withAuditedInvocation,
  type CapabilityAuditRecord,
} from './capability-audit-bridge.js';

/** Handler options forwarded to the underlying install* functions. */
export interface CapabilityRuntimeOptions extends ExtendedHandlerOptions {
  data?: DataHandlerOptions;
  /** Opt-in ERP read access (Sprint 265) — absent ⇒ no 'erp.read' handler
   *  is registered and the registry behaves exactly as before (backward-safe). */
  erp?: { connector: ErpConnector };
}

/**
 * Build the full production capability registry: reference + extended + data
 * handlers, each wrapped with the audit bridge when `emit` is provided.
 *
 * - `emit` absent → plain registry (audit default-off, backward-safe).
 * - `emit` throwing is contained here (fail-safe): an audit-sink failure must
 *   never fail the capability invocation itself.
 *
 * Note: handlers like env.read / shell.exec are allowlist-gated and DENY by
 * default (empty allowlist) unless options open them up — safe-by-default.
 */
export function createAuditedCapabilityRegistry(
  emit?: (record: CapabilityAuditRecord) => void,
  options: CapabilityRuntimeOptions = {},
): CapabilityRegistry {
  const registry = createDefaultRegistry();
  installExtendedHandlers(registry, options);
  installDataHandlers(registry, { db: options.data?.db, mail: options.data?.mail });
  // Opt-in ERP wake (E12) — installed before the audit wrap below so erp.read
  // invocations emit audit records through the same loop as every other handler.
  if (options.erp) installErpHandler(registry, { connector: options.erp.connector });

  if (emit) {
    const safeEmit = (record: CapabilityAuditRecord): void => {
      try {
        emit(record);
      } catch {
        // fail-safe: a broken audit sink never breaks the invocation
      }
    };
    for (const name of registry.list()) {
      const handler = registry.get(name);
      if (!handler) continue;
      registry.unregister(name);
      registry.register(name, withAuditedInvocation(handler, safeEmit));
    }
  }

  return registry;
}
