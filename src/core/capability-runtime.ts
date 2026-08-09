// ═══ Capability Runtime — F8 cluster composition root ════════════════════════
// Joins the four capability files into ONE production-ready registry:
//   capability-broker.ts        — registry + reference handlers (echo, fs.read)
//   capability-handlers.ts      — http.get / env.read / shell.exec
//   capability-handlers-data.ts — db.query / mail.search
//   erp/handler.ts               — erp.read (opt-in, injected ErpConnector)
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
import type { ErpConnector } from './erp/connector.js';
import {
  installErpHandlerWithApprovalGate,
  type ErpApprovalGateFn,
} from './erp-connector.js';
import {
  withAuditedInvocation,
  type CapabilityAuditRecord,
} from './capability-audit-bridge.js';
import { writeAuditEvent } from './audit-writer.js';
import { debugLog } from './utils.js';

/** Handler options forwarded to the underlying install* functions. */
export interface CapabilityRuntimeOptions extends ExtendedHandlerOptions {
  data?: DataHandlerOptions;
  /** Opt-in ERP read access (Sprint 265) — absent ⇒ no 'erp.read' handler
   *  is registered and the registry behaves exactly as before (backward-safe).
   *  `approvalGate` is optional: when provided every invocation is pre-checked
   *  (medium-risk, risk-tagged erp.read, ADR-069 direction). Gate absent → plain
   *  installErpHandler behaviour (default-off, backward-safe). */
  erp?: { connector: ErpConnector; approvalGate?: ErpApprovalGateFn };
  /** F8-003 denial audit context. When set, CAPABILITY_DENIED results emit a
   *  `capability.denied` audit event via `writeAuditEvent`. Default-off when absent. */
  denialAudit?: {
    /** Project root path for audit event storage. */
    projectRoot: string;
    /** Sprint identifier for audit log (default: 'capability'). */
    sprintId?: string;
    /** Tenant identifier for audit event (default: 'local'). */
    tenantId?: string;
  };
}

// ═══ CAPABILITY-001 — capability-enforcement truth (advisory) ═══════════════
// Code-truth (2026-08-08 map): the capability broker is wired for DISPATCH but
// dead-by-default for AUTHORITY. `createAuditedCapabilityRegistry` arms the only
// least-privilege gate (`registry.leastPrivilegeEnabled`) solely when
// `config.enforce_least_privilege` is passed, and wires denial audit solely when
// `options.denialAudit` is passed — and neither production callsite
// (runtime-loop.ts, process-runtime.ts) passes either. So in production the
// registry resolves a verb→handler and invokes it, gating nothing. This predicate
// makes that enforcement posture typed + surfaceable instead of silent. It is a
// DELIBERATELY advisory bounded slice (ADR-G-020 advisory-mode, same class as the
// TOOL-AUTHORITY tool-scope / write-guard slices): the design artifact defines the
// unified five-input decision and the migration to real fail-closed enforcement;
// this slice only surfaces that the gate is off. See
// docs/analysis/capability-authority-design-2026-08-08.md.

export type CapabilityEnforcementReason =
  | 'ENFORCED_LEAST_PRIVILEGE'
  | 'ADVISORY_GATE_DISABLED';

export interface CapabilityEnforcement {
  /** True ONLY when the least-privilege gate is actually armed at creation
   *  (`config.enforce_least_privilege`). False → the registry gates nothing. */
  readonly enforced: boolean;
  readonly reasonCode: CapabilityEnforcementReason;
  /** Whether CAPABILITY_DENIED results are wired to the durable audit trail
   *  (`options.denialAudit`). A disabled gate never denies, so an unaudited
   *  denial path is doubly inert — carried for the audit trail. */
  readonly denialAudited: boolean;
}

/**
 * Resolve the enforcement posture a capability registry will have for the given
 * `(options, config)` — the SAME inputs `createAuditedCapabilityRegistry` reads.
 * Pure — exported for unit tests and for the eventual fail-closed consumer.
 */
export function resolveCapabilityEnforcement(
  options: CapabilityRuntimeOptions | undefined,
  config: { enforce_least_privilege?: boolean } | undefined,
): CapabilityEnforcement {
  const enforced = config?.enforce_least_privilege === true;
  return {
    enforced,
    reasonCode: enforced ? 'ENFORCED_LEAST_PRIVILEGE' : 'ADVISORY_GATE_DISABLED',
    denialAudited: options?.denialAudit != null,
  };
}

/**
 * Build the full production capability registry: reference + extended + data
 * handlers, each wrapped with the audit bridge when `emit` is provided.
 *
 * - `emit` absent → plain registry (audit default-off, backward-safe).
 * - `emit` throwing is contained here (fail-safe): an audit-sink failure must
 *   never fail the capability invocation itself.
 * - `config.enforce_least_privilege` → sets `registry.leastPrivilegeEnabled = true`
 *   (F8-003 hard-flip; default-off when config absent or flag false).
 * - `options.denialAudit` → wires `registry.emitDenied` to emit a structured
 *   `capability.denied` audit event via `writeAuditEvent` on every CAPABILITY_DENIED.
 *
 * Note: handlers like env.read / shell.exec are allowlist-gated and DENY by
 * default (empty allowlist) unless options open them up — safe-by-default.
 */
export function createAuditedCapabilityRegistry(
  emit?: (record: CapabilityAuditRecord) => void,
  options: CapabilityRuntimeOptions = {},
  config?: { enforce_least_privilege?: boolean },
): CapabilityRegistry {
  const registry = createDefaultRegistry();
  installExtendedHandlers(registry, options);
  installDataHandlers(registry, { db: options.data?.db, mail: options.data?.mail });
  // Opt-in ERP wake (E12) — installed before the audit wrap below so erp.read
  // invocations emit audit records through the same loop as every other handler.
  if (options.erp) {
    installErpHandlerWithApprovalGate(
      registry,
      { connector: options.erp.connector },
      options.erp.approvalGate,
    );
  }

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

  // F8-003: wire enforce_least_privilege config flag → registry.leastPrivilegeEnabled
  if (config?.enforce_least_privilege) {
    registry.leastPrivilegeEnabled = true;
  }

  // F8-003: wire denial audit — CAPABILITY_DENIED → capability.denied audit event
  if (options.denialAudit) {
    const { projectRoot, sprintId = 'capability', tenantId = 'local' } = options.denialAudit;
    registry.emitDenied = (info) => {
      try {
        writeAuditEvent(projectRoot, sprintId, {
          tenantId,
          actor: info.actorId ?? 'unknown',
          action: 'capability.denied',
          target: info.capability,
          metadata: {
            handler: info.handler,
            role: info.role,
            grantedCapabilities: info.grantedCapabilities,
          },
        });
      } catch {
        // fail-safe: a broken audit sink never breaks the invocation
      }
    };
  }

  // CAPABILITY-001: surface the enforcement posture. When the least-privilege
  // gate is DISABLED (the production default), the registry gates nothing — make
  // that advisory truth visible instead of silent. Advisory only (ADR-G-020);
  // real fail-closed enforcement is a named residual (see the design artifact).
  const enforcement = resolveCapabilityEnforcement(options, config);
  if (!enforcement.enforced) {
    debugLog(
      'capability:enforcement-advisory',
      'capability registry created with the least-privilege gate DISABLED '
        + '(no enforce_least_privilege) — verb→handler resolves and invokes, gating '
        + `nothing; capability authority is advisory-only (CAPABILITY-001)${
          enforcement.denialAudited ? '' : '; CAPABILITY_DENIED is also unaudited'}`,
    );
  }

  return registry;
}
