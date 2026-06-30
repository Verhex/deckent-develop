# ADR-G-031: Enterprise Foundation (Tenant · RBAC · Audit · Scheduled-Flows · Connector-Identity)

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=opt-in (enterprise-config default-off; community byte-identical) → tomorrow=god-level enterprise governance-depth layer (ADR-G-016 MOD-SPLIT; ENT-* gaps in the modular enterprise layer)
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-068 (Enterprise Foundation) + ADR-069 (Event-Driven Triggers + RBAC) + ADR-071 Part-F4 (RBAC hierarchy + audit-writer + enterprise-config) + ADR-074 Part-B (enterprise RBAC-enforce + audit-export + rate-limiter + RBAC-CLI) + ADR-092 (Connector Social Identity RBAC)
**Crosswalk:** 068 (+069+071F4+074B+092) → ADR-G-031

> **Note (Alperen, 2026-06-30):** This foundation takes its FINAL form inside the enterprise layer (MOD-SPLIT / deck-ent). The community core has the same functionality; enterprise = depth of governance/audit/management (ADR-G-016), not gated features.

---

## Context

To run deckent in enterprise environments — multi-tenant, audited, role-controlled, scheduled — a foundation accreted across sprints: scheduled-flows + audit-query + multi-tenant (068), event-triggers + RBAC `can()` (069), RBAC hierarchy + audit-writer + enterprise-config (071-F4), and a **connector-surface social-identity RBAC** (092, fail-closed, opt-in, tenant-scoped, with SCIM/OIDC adapters). The 2026-06-30 review unifies them into one enterprise-foundation law that finalizes in the modular enterprise layer.

---

## Decision (Today)

```xml
<enterprise-foundation opt-in="enterprise-config default-off">
  <tenant>TenantContext (ADR-G-024) + per-tenant isolationRoot + strict_tenant flag +
    memory tenant_id column + audit-scope.</tenant>
  <rbac>Role hierarchy (admin ⊃ operator ⊃ viewer) + Permission matrix + can() +
    enforceRbac (disabled→NO_OP). 4 live consumers (autonomous runtime-loop, OIDC auth-me,
    enterprise-endpoint, rbac CLI).</rbac>
  <audit>writeAuditEvent + queryAudit (RBAC-gated) + HMAC chain (audit_prev_hmac/audit_hmac)
    + audit-integrity + SIEM HTTP transport + exportAuditLog (SOC2/GDPR JSON/CSV).</audit>
  <rate-limit>TenantRateLimiter — per-tenant token-bucket quota guard (checkLimit(tenantId,
    action) → allow/deny; maxConcurrent per rolling window, auto-reset). Live snapshot at
    GET /api/enterprise/rate; admin-only rule CRUD persisted in config (per-action limits = V2).</rate-limit>
  <flows>scheduled-flow (full-cron nextRun) + flow-registry + event-trigger/matchTrigger
    (webhook/event match) → autonomous engine bridge.</flows>
  <connector-identity scope="external messaging surface" model="fail-CLOSED, opt-in">
    L2 RBAC on the connector message surface (DISTINCT from ADR-G-020 internal advisory):
    principal-resolution (tenant-scoped) → resource:action permission → HARD-BLOCK on
    unauthorized. identity.enabled opt-in (default off = backward-compatible). SCIM 2.0 +
    OIDC/Entra adapters; resolve()=pure-local zero-network, sync()=out-of-band background.
  </connector-identity>
</enterprise-foundation>
```

All enterprise features are **opt-in (default-off)** — a community/single-tenant deployment is byte-identical.

---

## Intent / Roadmap (Tomorrow) — god-level enterprise

The foundation is real engineering (OIDC security, HMAC chain, guarded surfaces) but **half-way to god-level enterprise**. The mapped gaps = the MASTER-PLAN ENT-* set, realized in the **enterprise layer** (ADR-G-016 MOD-SPLIT):

```xml
<god-level-gaps>
  <gap n="1">Management plane — admin UI to CRUD tenants/roles/rate (today read-only).</gap>
  <gap n="2">Custom RBAC — custom roles / permission-matrix / per-resource ACL (today 3 fixed roles).</gap>
  <gap n="3">Hard enforcement — ADR-G-020 Layer-2 hard-flip (today advisory; post-GA-V2).</gap>
  <gap n="4">Runtime tenant isolation — k8s pod-exec (today config/path-scoping).</gap>
  <gap n="5">Provisioning — SCIM webhook push / directory-sync (today OIDC login + pull-sync).</gap>
  <gap n="6">Audit-export / compliance pack — SOC2/GDPR evidence tooling (SIEM transport exists).</gap>
</god-level-gaps>
```

---

## Consequences

**(+)** A real, opt-in, multi-tenant + RBAC + audit + rate-limit + scheduled + connector-identity enterprise foundation, all live and consumer-wired, byte-identical for community users. Connector-surface RBAC is fail-closed (stronger than the internal advisory layer) — safe for multi-user messaging deployments.

**(−)** Six mapped gaps to god-level enterprise (management-plane, custom-RBAC, hard-enforce-V2, k8s-tenant, SCIM-push, audit-export) — all in the enterprise layer, not today. HTTP webhook-listener (069 AUT-2) unbuilt. Hard-enforcement is roadmap (ADR-G-020 vein).

---

## References / Absorbed

- **Absorbs:** ADR-068 + ADR-069 + ADR-071 Part-F4 + ADR-074 Part-B + ADR-092.
- **Cross-ref:** ADR-G-016 (enterprise = governance depth, MOD-SPLIT) · ADR-G-020 (internal authority — distinct from connector L2) · ADR-G-024 (process/tenant) · ADR-G-017 (multi-project isolation) · ADR-G-007 (connectors) · ADR-G-035 (tenant_id/audit-hmac).
- **Born / MASTER-PLAN:** ENT-* (god-level gaps) · MODULARIZE · AUT-2 (webhook-listener) · dynamic /bind (connector pairing→binding).
- **Memory:** `project_social_identity_rbac_engine` · `project_deckent_positioning`.
