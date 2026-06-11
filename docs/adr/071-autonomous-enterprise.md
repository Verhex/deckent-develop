# ADR-071: F3 Autonomous Mode (Self-Dispatch Guard) + F4 Enterprise RBAC/Tenant/Audit

**Status:** accepted

**Date:** 2026-05-31

**Proposed:** Sprint 208 · promoted 2026-06-11 (Sprint 281 ADR-review — kapsam-ayrımıyla: dayanıklı-çekirdek + F4 canlı; F3-A/B mekanizmaları superseded)

---

## Context

Sprint 208 implemented the foundational building blocks for two major roadmap pillars:

### F3 — Autonomous Mode (Process Mode runtime)

Prior to Sprint 208, the scheduled flow system (ADR-068, ADR-069) had:
- `flow-registry.ts`: flow CRUD storage
- `flow-scheduler.ts`: `collectDue()` point-in-time query
- `event-trigger.ts`: event matching skeleton

Missing: a runtime daemon that continuously runs the tick loop, and a **self-dispatch protocol** that lets deckent autonomously decide to trigger sprints based on flow schedules.

The north-star for autonomous mode is: deckent can evaluate whether to start a sprint on its own based on scheduled triggers — but **always requires human approval** before acting. The capability to decide is being built; automated execution without approval is NOT.

### F4 — Enterprise Foundation hardening

Prior to Sprint 208, the enterprise layer had:
- `rbac.ts`: basic `Role`/`Permission`/`can()` skeleton (ADR-069)
- `audit-query.ts`: read-only audit filter with RBAC gate (Sprint 207)
- `tenant-context.ts`: tenant ID type + resolver skeleton (Sprint 204)

Missing: role **hierarchy** (admin inherits operator permissions, operator inherits viewer), **multi-tenant runtime isolation** (path-scoped execution context), structured **audit event writes** (the write counterpart to audit-query), and an **enterprise configuration schema** that gates these features as opt-in.

---

## Decision

### F3-A — FlowRuntime Daemon (`flow-runtime.ts`)

`FlowRuntime` class implements a configurable tick-loop daemon:
- `start(intervalMs)` → setInterval calling `scheduler.collectDue()` each tick
- `stop()` → clearInterval, graceful shutdown
- Injectable clock for deterministic testing (no real timer in test)
- Callbacks: `onDue(dispatches)` → caller decides what to do with due flows
- Does NOT spawn sprints directly — separation of concerns between scheduling and execution

### F3-B — Self-Dispatch Protocol (`self-dispatch.ts`)

`SelfDispatchPolicy` type defines when and how deckent may propose autonomous action:

```typescript
export interface SelfDispatchPolicy {
  trigger: 'scheduled' | 'event' | 'threshold';
  action: 'plan' | 'start';
  guard: {
    requiresApproval: boolean;  // DEFAULT TRUE — always
    maxConcurrent?: number;
    cooldownMs?: number;
  };
}
```

`evaluateDispatch(policy, context)` returns a `DispatchDecision`:
- `allowed: boolean` — whether the policy permits dispatch given the current context
- `requiresApproval: boolean` — always `true` unless explicitly overridden by operator
- Does **NOT** call `runSprint()` or `deckent_start` — decision only, no side effects

**requiresApproval default TRUE is non-negotiable.** Self-dispatch autonomous mode enables deckent to form opinions and schedule proposals, but sprint execution requires explicit human confirmation. This preserves the "AI proposes, human approves" contract.

### F3-C — Tenant Runtime Context (`tenant-context.ts` extension)

`withTenant(tenantId, fn)` runtime helper isolates all file path operations to `.deckent/tenants/<tenantId>/`:
- `currentTenant()` returns active tenant scope (default: root project)
- Path isolation: `tenantPath(tenantId, relativePath)` → `.deckent/tenants/<id>/<relativePath>`
- Compatible with flow-registry and audit-query (wire point — not yet wired, next sprint)

### F4-A — RBAC Role Hierarchy (`rbac.ts` extension)

Role hierarchy with inheritance:
- `admin` inherits all `operator` permissions + gains `tenant:admin` + `audit:read`
- `operator` inherits all `viewer` permissions + gains `sprint:write` + `flow:manage`
- `viewer` baseline: `sprint:read`, `audit:read` (read-only)
- Unknown role → fail-secure (all permissions denied)

Permission matrix added: `sprint:read`, `sprint:write`, `audit:read`, `flow:manage`, `tenant:admin`.

`inheritsPermissionsFrom(role)` utility determines the hierarchy chain for `can()` lookups.

### F4-B — Audit Event Writer (`audit-writer.ts`)

`writeAuditEvent({ tenantId, actor, action, target, metadata })` produces structured audit records compatible with `audit-query.ts` read format:
- Mandatory fields: `tenantId`, `actor`, `action`, `timestamp` (auto-set)
- Optional: `target`, `metadata` (JSON object)
- Round-trip compatible: events written via `writeAuditEvent` are queryable via `queryAudit`

### F4-C — Enterprise Config Schema (`enterprise-config.ts`)

`EnterpriseConfig` type with safe opt-in defaults:
```typescript
export interface EnterpriseConfig {
  tenancy: { enabled: boolean };            // default: false
  rbac: { enabled: boolean; defaultRole: Role };  // default: false, 'viewer'
  flow: { maxConcurrent: number };          // default: 1
}
```

All enterprise features are **opt-in false** — existing single-tenant deployments are unaffected. Parse/validate follows the 3-layer config merge pattern (ADR-004) but as a separate module (no touch to `config.ts`).

---

## Consequences

**Positive:**
- Autonomous mode capability is being built safely: self-dispatch evaluates and proposes, never executes without approval.
- RBAC hierarchy closes the permission-inheritance gap — `admin` no longer requires explicit listing of all lower-tier permissions.
- Tenant runtime context enables future flow-registry and audit-writer to operate in isolated path namespaces per tenant.
- Audit writer + query round-trip closes the write/read gap in the enterprise audit trail.
- Enterprise config schema allows progressive feature adoption without touching the core config.ts merge chain.

**Negative:**
- `requiresApproval: true` in `SelfDispatchPolicy` means true autonomous sprint execution is not yet possible — requires a future opt-in gate per ADR-047 (Manuel Subagent Dispatch Protocol).
- Tenant path isolation in `withTenant` is advisory in V1 — hard enforcement requires ADR-037 V2 layer (post-GA).
- `writeAuditEvent` persistence is filesystem-based (append to JSONL) — not yet wired to the SQLite memory.db for queryable indexing (deferred, next sprint).
- Enterprise features (tenancy, RBAC, flow limits) are all opt-in — operators must explicitly enable; discovery requires documentation.

---

## Alternatives Considered

- **Full autonomous execution without approval gate:** Violates the ADR-047 "human in the loop" contract and Alperen's explicit requirement that sprint starts require user confirmation. Rejected unconditionally.
- **Merge self-dispatch into flow-runtime:** Creates a god object that mixes scheduling with policy evaluation. Keeping them separate allows testing dispatch logic without a running timer. Rejected.
- **Flat RBAC without hierarchy:** Requires explicitly listing every permission for every role — maintenance burden grows linearly with permission count. Hierarchy reduces this to O(1) additions at each tier level. Rejected.
- **Audit writer wired to SQLite directly:** Adds `better-sqlite3` dependency to audit-writer module and couples write + read paths tightly. Filesystem JSONL is simpler, independently testable, and already compatible with audit-query's current read strategy. Deferred, not rejected.
- **Enterprise config merged into config.ts:** Adds enterprise-specific complexity to the shared 3-layer merge chain. Separate module preserves backward compatibility and single-responsibility for the config module. Rejected.

---

## References

- Sprint 208 Task 5 — `src/core/flow-runtime.ts` (FlowRuntime daemon, tick-loop)
- Sprint 208 Task 6 — `src/core/self-dispatch.ts` (SelfDispatchPolicy, evaluateDispatch, requiresApproval)
- Sprint 208 Task 7 — `src/cli/commands/flow.ts` (`deckent flow run` CLI)
- Sprint 208 Task 8 — `src/core/tenant-context.ts` (withTenant, currentTenant, tenantPath)
- Sprint 208 Task 9 — `src/core/rbac.ts` (role hierarchy, PERMISSION_MATRIX)
- Sprint 208 Task 10 — `src/core/flow-registry.ts` (RBAC gate on flow:manage)
- Sprint 208 Task 11 — `src/core/audit-writer.ts` (writeAuditEvent)
- Sprint 208 Task 12 — `src/core/enterprise-config.ts` (EnterpriseConfig, parseEnterprise)
- ADR-067: Process Mode + Tenant Isolation — F3 Foundation
- ADR-068: Enterprise Foundation — Audit Query + Multi-Tenant + Scheduled Flows
- ADR-069: Event-Driven Triggers + RBAC
- ADR-047: Manuel Subagent Dispatch Protocol (requiresApproval contract)
- ROADMAP F3-004/F3-005: flow runtime daemon + self-dispatch → Sprint 208 DONE
- ROADMAP F4-001: RBAC hierarchy → Sprint 208 extension DONE
- ROADMAP F4-002: audit-writer → Sprint 208 DONE

---

## Amendment — Sprint 281 (2026-06-11, ADR-review): proposed → accepted + kapsam-ayrımı (ADR-027 deseni)

**Classification: BOTH** (approval-sözleşmesi governance-kanunu; F4 enterprise-katman ürün).

**✅ Dayanıklı çekirdek CANLI (terfi gerekçesi):**
- **"requiresApproval default TRUE non-negotiable" sözleşmesi mirasçısında yaşar:** otonom motorun `policy-gate.ts` (`'auto' | 'park'` — "park for human approval", G2 per-task-policy + G3 EffectClass-risk) aynı "AI önerir, insan onaylar" kontratının üretim-gerçekleşmesidir. Sprint-start insan-onayı kuralı da yürürlükte.
- **F4 bileşenlerinin TAMAMI canlı:** RBAC hiyerarşi + `PERMISSION_MATRIX` (`rbac.ts:44`, 4 canlı tüketici — ADR-069 amendment) ✓ · `writeAuditEvent` (`audit-writer.ts:73`; sonradan S261 HMAC-zincirle güçlendi) ✓ · `enterprise-config.ts` ✓ · `withTenant`/`tenantPath` → `flow-registry` tüketiyor ✓.

**🔄 F3-A/B mekanizmaları SUPERSEDED (F3-009 otonom motor):** `flow-runtime.ts` (tick-daemon) + `self-dispatch.ts` (SelfDispatchPolicy/evaluateDispatch) diskte durur ama MASTER-PLAN F3-009 kaydıyla "pre-226 ~%40 foundation — engine tarafından superseded": `buildEngineRuntime` + durable-backlog + hybrid-trigger-source + execute-dispatcher onların yerini aldı. Bu iki iskelet **ertelenmiş dormant-sweep adayıdır** (ADR-038/039 amendment'leriyle aynı havuz). Sözleşme öldü değil — mekanizma değişti, governance-kontratı taşındı. md+db senkron (Alperen ADR-review).
