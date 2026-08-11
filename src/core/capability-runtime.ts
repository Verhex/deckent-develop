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
  deriveGrantedCapabilities,
  type InvocationContext,
} from './capability-broker.js';
import type { Capability } from './work-model.js';
import type { VerifiedPrincipal } from './principal.js';
import type { AuthorityMode } from './nervous-types.js';
import {
  resolveOperation,
  UnknownOperationError,
  type OperationGate,
} from './operation-catalog/index.js';
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
/** The advisory below reports a STEADY-STATE posture, not an event: it is true on
 *  every construction for as long as the gate stays off. `debugLog` always appends
 *  to `.brain/ERRORS.md` (a 600-line rolling window), so emitting per construction
 *  would crowd real errors out with a condition that never changes. Emit once per
 *  process instead — enough to surface the truth, never a flood. (Same
 *  reset-for-tests shape as `_resetChainHead` in audit-writer.) */
let capabilityEnforcementAdvisoryEmitted = false;

/** Test-only: re-arm the once-per-process advisory. */
export function _resetCapabilityEnforcementAdvisoryForTests(): void {
  capabilityEnforcementAdvisoryEmitted = false;
}

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
  if (!enforcement.enforced && !capabilityEnforcementAdvisoryEmitted) {
    capabilityEnforcementAdvisoryEmitted = true;
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

// ═══ CAPABILITY-001 — five-input scoped capability decision (row 4040) ════════
// The residual the G1 advisory slice named: `resolveCapabilityEnforcement` types
// WHETHER the gate is armed, but nothing resolved the acceptance's five inputs —
// principal, tenant, operation, resource, environment — into ONE scoped decision.
// Measured code-truth before this slice (capability-broker.ts `invoke`):
//   principal   partial — `ctx.actor.{id,role}` arrive, `role` is read only when the
//                         gate is armed; assurance/identityClass/provenance never read.
//   tenant      partial — `ctx.actor.tenantId` is copied into `emitDenied` audit info
//                         only; it scopes no decision.
//   operation   absent  — the broker gates on a VERB string's handler
//                         `requiredCapability`; the operation catalog never participates.
//   resource    absent  — only `ctx.projectRoot`, consumed inside fsReadHandler.
//   environment absent  — no AuthorityMode value reaches the broker at all.
// This implements design §2.1/§2.2 (docs/analysis/capability-authority-design-2026-08-08.md)
// as a decision that PROJECTS onto the broker's EXISTING grant gate — deliberately not a
// second gate, and deliberately not a default flip: when the posture is
// ADVISORY_GATE_DISABLED (the production default) the projection leaves
// `grantedCapabilities` unset, so the permissive path stays byte-identical and the
// decision is carried as typed evidence. Arming stays owner-gated behind
// `enforce_least_privilege` (design §4 Faz 4).

/** One of the five inputs the acceptance requires to resolve together. */
export type CapabilityDecisionInput =
  | 'principal'
  | 'tenant'
  | 'operation'
  | 'resource'
  | 'environment';

/** WHAT the operation acts on — identity plus the tenant that owns it. */
export interface ResourceRef {
  readonly id: string;
  /** Owning tenant. A mismatch against the request tenant denies (cross-tenant). */
  readonly ownerTenant: string;
}

/** WHERE the request runs — the authority strictness in force. */
export interface EnvironmentContext {
  readonly authorityMode: AuthorityMode;
}

/** The five-input decision request (design §2.1). */
export interface CapabilityDecisionRequest {
  readonly principal: VerifiedPrincipal;
  readonly tenant: string;
  /** An operation-catalog id (see `Op` in operation-catalog/index.ts). */
  readonly operation: string;
  readonly resource: ResourceRef;
  readonly environment: EnvironmentContext;
}

export type CapabilityDecisionReason =
  | 'ALLOWED_WITHIN_GRANT'
  /** Fail-closed: at least one of the five inputs did not resolve. */
  | 'DENIED_UNRESOLVED_INPUT'
  | 'DENIED_UNKNOWN_OPERATION'
  | 'DENIED_CROSS_TENANT'
  | 'DENIED_UNGRANTED_CAPABILITY'
  | 'DENIED_LOW_ASSURANCE_STRICT'
  | 'NEEDS_APPROVAL_LOW_ASSURANCE';

/** The single scoped decision the five inputs resolve to (design §2.1). */
export interface CapabilityDecision {
  readonly outcome: 'allow' | 'deny' | 'needs_approval';
  readonly reasonCode: CapabilityDecisionReason;
  /** Derived from the operation catalog — `[]` when the operation did not resolve. */
  readonly requiredCapabilities: readonly Capability[];
  /** Derived from `principal.role` via the canonical ROLE_CAPABILITY_MAP. */
  readonly grantedCapabilities: readonly Capability[];
  /** The operation's gate — `null` when the operation did not resolve. */
  readonly gate: OperationGate | null;
  /** Whether a denial on this decision would reach the durable audit trail. */
  readonly audited: boolean;
  /** Inputs that failed to resolve — non-empty only for DENIED_UNRESOLVED_INPUT. */
  readonly unresolvedInputs: readonly CapabilityDecisionInput[];
}

const AUTHORITY_MODES: readonly AuthorityMode[] = ['strict', 'balanced', 'autopilot', 'full-auto'];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Which of the five inputs did NOT resolve. A decision is never made from a
 * partial input set — an incomplete request denies with the gaps named.
 * Validation is runtime, not type-level, because these inputs cross ingress
 * boundaries (CLI / MCP / API) where the compiler does not reach.
 */
function unresolvedDecisionInputs(
  request: CapabilityDecisionRequest | undefined,
): CapabilityDecisionInput[] {
  if (request === undefined || request === null) {
    return ['principal', 'tenant', 'operation', 'resource', 'environment'];
  }
  const missing: CapabilityDecisionInput[] = [];
  const principal = request.principal as VerifiedPrincipal | undefined;
  // A principal without a role cannot derive a grant set — that is a gap, not a
  // permissive default (design §3.2: absent/unknown role → deny).
  if (!principal || !isNonEmptyString(principal.id) || !isNonEmptyString(principal.role)) {
    missing.push('principal');
  }
  if (!isNonEmptyString(request.tenant)) missing.push('tenant');
  if (!isNonEmptyString(request.operation)) missing.push('operation');
  const resource = request.resource as ResourceRef | undefined;
  if (!resource || !isNonEmptyString(resource.id) || !isNonEmptyString(resource.ownerTenant)) {
    missing.push('resource');
  }
  const environment = request.environment as EnvironmentContext | undefined;
  if (!environment || !AUTHORITY_MODES.includes(environment.authorityMode)) {
    missing.push('environment');
  }
  return missing;
}

/**
 * Resolve the five inputs into ONE scoped capability decision (design §2.2).
 *
 * Evaluation order — deny before escalate, because an ungranted capability is not
 * an approvable one:
 *   1. any input unresolved            → deny DENIED_UNRESOLVED_INPUT (fail closed)
 *   2. operation id not in the catalog → deny DENIED_UNKNOWN_OPERATION
 *   3. resource.ownerTenant ≠ tenant   → deny DENIED_CROSS_TENANT
 *   4. required ⊄ granted              → deny DENIED_UNGRANTED_CAPABILITY
 *   5. high-risk operation + unverified principal
 *        · environment 'strict'        → deny DENIED_LOW_ASSURANCE_STRICT
 *        · otherwise                   → needs_approval (progressive disclosure)
 *   6. otherwise                       → allow
 *
 * Pure and total: like the broker's `invoke`, it never throws — every outcome is a
 * returned `CapabilityDecision`.
 */
export function resolveCapabilityDecision(
  request: CapabilityDecisionRequest,
  enforcement: CapabilityEnforcement,
): CapabilityDecision {
  const audited = enforcement.denialAudited;
  const unresolvedInputs = unresolvedDecisionInputs(request);
  if (unresolvedInputs.length > 0) {
    return {
      outcome: 'deny',
      reasonCode: 'DENIED_UNRESOLVED_INPUT',
      requiredCapabilities: [],
      grantedCapabilities: [],
      gate: null,
      audited,
      unresolvedInputs,
    };
  }

  let operation;
  try {
    operation = resolveOperation(request.operation);
  } catch (err) {
    if (!(err instanceof UnknownOperationError)) throw err;
    return {
      outcome: 'deny',
      reasonCode: 'DENIED_UNKNOWN_OPERATION',
      requiredCapabilities: [],
      grantedCapabilities: deriveGrantedCapabilities(request.principal.role ?? ''),
      gate: null,
      audited,
      unresolvedInputs: [],
    };
  }

  const resolved = {
    requiredCapabilities: operation.capabilities,
    grantedCapabilities: deriveGrantedCapabilities(request.principal.role ?? ''),
    gate: operation.gate,
    audited,
    unresolvedInputs: [] as readonly CapabilityDecisionInput[],
  };

  if (request.resource.ownerTenant !== request.tenant) {
    return { ...resolved, outcome: 'deny', reasonCode: 'DENIED_CROSS_TENANT' };
  }

  const ungranted = resolved.requiredCapabilities.filter(
    (capability) => !resolved.grantedCapabilities.includes(capability),
  );
  if (ungranted.length > 0) {
    return { ...resolved, outcome: 'deny', reasonCode: 'DENIED_UNGRANTED_CAPABILITY' };
  }

  const highRisk = operation.risk === 'HIGH' || operation.risk === 'CRITICAL';
  if (highRisk && request.principal.assurance === 'unverified') {
    return request.environment.authorityMode === 'strict'
      ? { ...resolved, outcome: 'deny', reasonCode: 'DENIED_LOW_ASSURANCE_STRICT' }
      : { ...resolved, outcome: 'needs_approval', reasonCode: 'NEEDS_APPROVAL_LOW_ASSURANCE' };
  }

  return { ...resolved, outcome: 'allow', reasonCode: 'ALLOWED_WITHIN_GRANT' };
}

/** The decision plus the broker context it projects onto. */
export interface ScopedCapabilityInvocation {
  readonly decision: CapabilityDecision;
  /** The context to pass to `CapabilityRegistry.invoke` — the EXISTING gate's input. */
  readonly context: InvocationContext;
  /** True when the decision actually scopes `context.grantedCapabilities`. False under
   *  the advisory posture, where the decision is evidence only and the invocation
   *  behaves exactly as it did before this slice. */
  readonly enforcementApplied: boolean;
}

/** Audit lineage carried through unchanged — never a decision input. */
type CapabilityLineage = Pick<InvocationContext, 'projectRoot' | 'correlationId' | 'causationId'>;

/**
 * Resolve the five inputs and project the resulting single decision onto the
 * broker's EXISTING enforcement path.
 *
 * There is no second gate here: the returned `context` is the broker's own
 * `InvocationContext`, and enforcement is still performed by
 * `CapabilityRegistry.invoke`'s grant check. This function only decides WHICH
 * grant set that check sees:
 *  - `enforcement.enforced` (owner-gated `enforce_least_privilege`) → the decision's
 *    grants on `allow`, `[]` on every other outcome (fail closed).
 *  - advisory posture (production default) → `grantedCapabilities` is left UNSET, so
 *    `invoke` takes the same permissive branch it took before this slice. The decision
 *    still resolves and is returned with `enforcementApplied: false`.
 *
 * `lineage` carries audit identifiers only — accepting a full `InvocationContext`
 * would let a caller smuggle a grant set past the decision, which is exactly the
 * second resolution path this slice must not create.
 */
export function resolveScopedCapabilityInvocation(
  request: CapabilityDecisionRequest,
  enforcement: CapabilityEnforcement,
  lineage: CapabilityLineage = {},
): ScopedCapabilityInvocation {
  const decision = resolveCapabilityDecision(request, enforcement);
  const principal = request?.principal as VerifiedPrincipal | undefined;
  const context: InvocationContext = {
    actor: {
      id: principal?.id ?? '',
      role: principal?.role,
      tenantId: request?.tenant,
      identityClass: principal?.identityClass,
      assurance: principal?.assurance,
      provenance: principal?.provenance,
    },
    projectRoot: lineage.projectRoot,
    correlationId: lineage.correlationId,
    causationId: lineage.causationId,
  };
  if (enforcement.enforced) {
    context.grantedCapabilities =
      decision.outcome === 'allow' ? [...decision.grantedCapabilities] : [];
  }
  return { decision, context, enforcementApplied: enforcement.enforced };
}
