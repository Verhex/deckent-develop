# Enterprise Foundation: The ExecutionRequest Contract

This document outlines how Deckent's universal `ExecutionRequest` contract serves as the backbone for its enterprise-grade features. By embedding critical metadata into every request, Deckent enables advanced governance, security, and operational controls. The `ExecutionRequest` schema is governed by **ADR-068** (Enterprise Foundation — scheduled flows, audit query, multi-tenant); the RBAC and event-trigger layers that consume it are governed by **ADR-069** (Event-Driven Triggers + F4 RBAC) and **ADR-071** (Autonomous Mode Self-Dispatch Guard + F4 Enterprise RBAC/Tenant/Audit).

Most of these features are opt-in and can be enabled via flags in `.deckent/config.json`.

---

## Table of Contents

1.  [Actor & RBAC (`actor`)](#1-actor--rbac-role-based-access-control)
2.  [Multi-Tenancy (`tenantId`)](#2-multi-tenancy-tenantid)
3.  [Audit Lineage (`correlationId`, `causationId`)](#3-audit-lineage-correlationid-causationid)
4.  [Governance Gating (`riskClass`)](#4-governance-gating-riskclass)
5.  [Capability Brokering (`capabilityTarget`)](#5-capability-brokering-capabilitytarget)
6.  [Cost Control (`budget`)](#6-cost-control-budget)

---

## 1. Actor & RBAC (Role-Based Access Control)

-   **Contract Field:** `actor: { id: string, role: string }`
-   **Enables:** `ENT-1` - Role-Based Access Control (RBAC)

Deckent has two complementary RBAC systems: the **Enterprise RBAC** (`src/core/rbac.ts`) for API/flow/audit gates, and the **Worker Authority** (`src/nervous/authority-matrix.ts`) for nervous-system capability checks on spawned tasks. Both are gated by the same `enforce_rbac` configuration flag.

### Enterprise RBAC (`src/core/rbac.ts`, ADR-069/071)

The enterprise role system uses three roles with strict inheritance:

| Role | Level | Permissions (own + inherited) |
|------|-------|-------------------------------|
| `viewer` | 1 | `read`, `sprint:read` |
| `operator` | 2 | + `write`, `execute`, `sprint:write`, `audit:read`, `flow:manage` |
| `admin` | 3 | + `admin`, `audit`, `tenant:admin` |

Roles are hierarchical (`viewer ⊆ operator ⊆ admin`) — every operator has all viewer permissions, and every admin has all operator permissions. The `PERMISSION_MATRIX` in `src/core/rbac.ts` is precomputed at module load time and is the single source of truth.

**`can(role, action, tenantId, auditCtx?)`** — the core permission check:
- Returns `false` when `tenantId` fails path-safety validation or the role lacks the requested permission.
- When `auditCtx` is provided and the check is **denied**, an `access:denied` audit event is written to the event stream via `writeAuditEvent()` — mandatory enterprise audit-trail (ADR-037).
- Never throws; the fail-closed result is always `false` on invalid input.

**`enforceRbac(role, action, tenantId, rbacConfig?)`** — the runtime gate:
- When `rbacConfig.enabled` is `false` (or `rbacConfig` is absent), this is a **NO_OP that always returns `true`** — backward compatible with non-enterprise deployments.
- When `enabled: true`, delegates to `can()` with full enforcement.
- Intended for wiring into sprint/flow/API entry points without breaking non-enterprise setups.

```typescript
// Example wiring:
if (!enforceRbac(actor.role, Permission.SPRINT_WRITE, tenantId, config.enterprise?.rbac)) {
  throw new Error('RBAC_DENIED');
}
```

**Enforcement is advisory/soft by default** (ADR-037 V1.0). Hard-block requires explicitly opting in via `enforce_rbac: true` in `.deckent/config.json`. Until the hard-flip to V2 (post-GA), a role violation that is not explicitly blocked emits a warning and is recorded in the audit trail but does not stop execution.

```json
{
  "enforce_rbac": true
}
```

### Worker Authority (`src/nervous/authority-matrix.ts`, ADR-037)

The worker authority system operates at a different layer — it controls which **capabilities** a spawned task may use (e.g. `shell`, `filesystem.write`, `erp-write`). Its roles are `admin | engineer | viewer` (different taxonomy from the enterprise RBAC above). This system also respects the `enforce_rbac` flag: when `false` (default), violations emit a soft warning; when `true`, capability violations hard-block the task.

The `actor` object on the `ExecutionRequest` carries both a role identifier and the `tenantId` for RBAC scoping. Role resolution for API callers flows from the JWT claims (`role` | `roles` | `https://deckent.io/role`) established at OIDC login.

---

## 2. Multi-Tenancy (`tenantId`)

-   **Contract Field:** `tenantId: string`
-   **Enables:** `ENT-2` - Data Isolation for Multi-Tenancy

The `tenantId` field allows Deckent to partition data on a per-tenant basis. Tenants must pass path-safety validation (`^[a-z0-9][a-z0-9-]{0,62}$`) — IDs that fail this check are rejected, preventing path-traversal attacks on isolation roots.

### Isolation Boundaries (what is implemented)

**Filesystem isolation** — each tenant gets a scoped directory root under `.deckent/tenants/<tenantId>/`. Tenant-aware components resolve paths through this root:

- `FlowRegistry.forCurrentTenant()` persists flows under `.deckent/tenants/<tenantId>/flows/`
- `tenantPath('flows/my-flow.json')` resolves relative paths within the tenant's isolation root
- Tenant directories discovered under `.deckent/tenants/` are surfaced in the enterprise dashboard

**Memory store isolation** — the `MemoryStore` (`src/core/memory-store.ts`) uses `tenantId` to scope SQLite rows, ensuring one tenant's ADRs, memory, and retro entries are not visible to another's queries.

**Audit isolation** — `queryAudit()` accepts a `tenantId` filter that restricts results to events carrying that tenant identifier in their payload. RBAC checks on `queryAudit()` use the tenant ID for the `can()` call.

**`TenantContext` runtime resolution** (`src/core/tenant-context.ts`):
1. `DECKENT_TENANT_ID` environment variable (highest priority)
2. Explicit `opts.tenantId` passed to `resolveTenant()`
3. `'local'` default (backward compatible — single-tenant and Sprint Mode are unaffected)

`withTenant(tenantId, projectRoot, fn)` runs `fn` in an `AsyncLocalStorage`-scoped tenant context. Any call to `currentTenant()` or `tenantPath()` inside `fn` returns context for that `tenantId` without needing to thread the parameter explicitly.

### Honest Scope (what is NOT yet implemented)

- **Runtime process isolation** (F3-003 — k8s pod-exec, container sandboxing): not implemented. Isolation is path-level (filesystem roots + DB row scoping) only.
- **SCIM / directory sync**: tenants are provisioned manually via config or the dashboard API; no automated directory sync.
- **Cross-tenant RBAC**: RBAC is per-operation, not a per-tenant role assignment matrix. A `tenantId` is required on every `can()` call but tenant membership is not enforced beyond the config-declared list.

For backward compatibility, `tenantId` defaults to `'local'` everywhere. A Deckent instance running in single-project Sprint Mode is unaffected.

---

## 3. Audit Lineage (`correlationId`, `causationId`)

-   **Contract Fields:** `correlationId: string`, `causationId: string`
-   **Enables:** `ENT-3` - SOC2/ISO-Grade Audit Trails

For enterprise-grade traceability, the `ExecutionRequest` carries two lineage identifiers:

-   `correlationId`: Groups a sequence of related events together into a single logical "session" or "transaction."
-   `causationId`: Links an event directly to its parent event, forming a causal chain (`event A` caused `event B`).

These IDs are propagated through the **Structured Event Stream** (`src/core/event-stream.ts`). Every event emitted during a task's lifecycle is stamped with these IDs, creating an unbroken HMAC-chained audit trail.

### Causal Chain Query API (`src/core/audit-query.ts`)

Four read-only helpers operate over `AuditEventWithLineage[]` lists (no I/O — callers supply events from `readAuditEvents()` or `readArchivedAuditEvents()`):

- **`filterByCorrelation(events, correlationId)`** — returns all events sharing a `correlationId`, scoping a full request flow.
- **`filterByCausation(events, causationId)`** — returns all events whose `causationId` matches the given value (direct children of a parent event).
- **`buildCausalChain(events, rootCorrelationId)`** — topological sort of the causation graph within a correlation group. Ancestors appear before descendants. Cyclic or unresolvable chains have their remaining events appended in stream order (never throws).
- **`groupByActor(events)`** — returns a `Map<actor, AuditEvent[]>` grouped by the `actor` field. Events with a missing actor are grouped under the empty-string key.

These helpers are composable: `buildCausalChain(filterByCorrelation(events, id), id)` gives the full ordered causal tree for one request flow.

### HMAC Chain Integrity

Every audit event (`src/core/audit-writer.ts`) carries a `hmac` (SHA-256) and a `prevHmac` that anchors to the preceding event's `hmac`, forming a tamper-evident chain. `verifyAuditChain()` validates this chain; a broken chain (including after deliberate GDPR-style pruning) reports `integrity: false` by design rather than silently hiding the deletion.

---

## 4. Governance Gating (`riskClass`)

-   **Contract Field:** `riskClass: 'low' | 'medium' | 'high'`
-   **Enables:** `WM-6 / F10-002` - Risk-Based Approval Workflows

The `riskClass` of a request is resolved by `resolveRiskClass()` based on the capabilities it requires (e.g., `shell`, `filesystem.delete`). This risk assessment is consumed by the **Nervous System's Decision Engine** (`src/nervous/decision-engine.ts`).

When a request is classified as `high` risk, the decision engine can be configured to park the task for mandatory manual approval instead of executing it automatically.

**Configuration:**
This feature is opt-in. To enable it, set the following in `.deckent/config.json`:

```json
{
  "risk_gate_enabled": true
}
```

---

## 5. Capability Brokering (`capabilityTarget`)

-   **Contract Field:** `capabilityTarget: { capability: string, args: any, connector?: string }`
-   **Enables:** `F8-001` - Extensible, Non-Code Actions

The `capabilityTarget` field is the entry point for executing structured, non-code-generation tasks, such as sending an email, writing to a database, or interacting with an external ERP system.

This field is consumed by the **Capability Broker** (`src/core/capability-broker.ts`), which maintains a registry of available capabilities and their handlers. The `invokeCapability()` function resolves a `CapabilityTarget` to its corresponding backend handler, ensuring that such actions are executed in a controlled and auditable manner.

This provides a secure and extensible alternative to using the `shell` capability for all integrations.

---

## 6. Cost Control (`budget`)

-   **Contract Field:** `budget: { maxUsd?: number, maxTokens?: number }`
-   **Enables:** Per-Request Cost-Gating

The `budget` object on an `ExecutionRequest` allows for fine-grained cost control on a per-request basis. This is consumed by the **Cost Gate** (`src/core/cost-gate.ts`) before a task is spawned.

When a request includes a `budget.maxUsd` or `budget.maxTokens`, the cost gate will evaluate the estimated cost of the task against both the per-request budget and the global sprint budget. If the estimate exceeds the request's specific budget, the task can be blocked or flagged, even if it is within the overall sprint limits.

If no `budget` is provided on the request, the cost gate falls back to its default behavior of checking only against the global configuration.
