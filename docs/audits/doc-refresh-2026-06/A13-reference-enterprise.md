# A13 — Reference: Enterprise Docs Audit

**Scope**: `docs/reference/enterprise-depth.md`, `docs/reference/enterprise-foundation.md`, `docs/reference/enterprise-integrations.md`  
**Sprint**: 345 | **Date**: 2026-06-28 | **Auditor**: worker w-345-013  
**Method**: Code-verified — every SHIPPED claim confirmed against source files with `file:line` evidence. PLANNED claims verified by absence of implementation.

---

## Summary

| Doc | Sections | SHIPPED | PLANNED | Accuracy Errors | P0 |
|-----|----------|---------|---------|-----------------|-----|
| `enterprise-depth.md` | 12 | 11 | 1 (§12 note) | 3 | 0 |
| `enterprise-foundation.md` | 6 | 6 | 0 | 1 | 0 |
| `enterprise-integrations.md` | 13 | 13 | 0 | 7 | 1 |

**P0 flag**: `enterprise-integrations.md §4 strict_tenant_isolation` — config flag described as fully enforcing memory-store isolation, but the main MemoryStore instantiation paths do NOT pass the flag from config; only audit-CLI paths are wired.

---

## enterprise-depth.md

### §1 — Unified Policy Engine

| Claim | Status | Evidence |
|-------|--------|---------|
| `src/core/policy-engine.ts` exists with `evaluatePolicy(input): PolicyDecision` returning `permit\|deny\|park\|suggest` | **SHIPPED** | `policy-engine.ts:121` |
| `src/core/rbac.ts` with `can(role, action, tenantId)` | **SHIPPED** | `rbac.ts:90` |
| `src/core/activation-engine.ts` with confidence-based scoring | **SHIPPED** | `activation-engine.ts` exists |
| `src/core/condition-evaluator.ts` with `evaluateCondition(data, when)` | **SHIPPED** | `condition-evaluator.ts` exists |

### §2a — Worker Authority RBAC (`enforce_rbac`)

| Claim | Status | Evidence |
|-------|--------|---------|
| `src/nervous/authority-matrix.ts` with `authorizeExecution(req, opts)` | **SHIPPED** | `authority-matrix.ts:413` |
| Soft enforcement default (warn + emit, not block) | **SHIPPED** | `authority-matrix.ts:321+` |
| Hard enforcement when `enforce_rbac: true` | **SHIPPED** | `authority-matrix.ts:413+` |
| Role taxonomy `admin \| engineer \| viewer` | **ACCURACY ERROR** | Actual code: `'admin' \| 'engineer' \| 'operator' \| 'viewer'` — `operator` role missing from doc taxonomy (`authority-matrix.ts:200`) |

### §2b — Enterprise RBAC Autonomous Dispatch (`rbac_policy`)

| Claim | Status | Evidence |
|-------|--------|---------|
| `src/orchestra/autonomous/runtime-loop.ts` (`buildEngineRuntime`) gates dispatch via `evaluatePolicy` | **SHIPPED** | `runtime-loop.ts:299, 419, 439` |
| `src/core/rbac.ts` (`can()`, `evaluatePolicy()`) | **SHIPPED** | `rbac.ts:90, 120`; `policy-engine.ts:121` |
| `autonomous.rbac_policy` config block (`enabled`, `role`) | **SHIPPED** | `config-types.ts:284`; `config.ts:1559` |
| `viewer` role hard-denies dispatch when `rbac_policy.enabled: true` | **SHIPPED** | `runtime-loop.ts:439` → `policy-engine.ts:121` |
| Sprint worker-spawn RBAC path remains advisory (ADR-037 V1.0) | **SHIPPED** | `authority-matrix.ts:321` advisory path confirmed |

### §3 — Tamper-Evident Audit Chain

| Claim | Status | Evidence |
|-------|--------|---------|
| `src/core/audit-writer.ts` with `writeAuditEvent(event)` | **SHIPPED** | `audit-writer.ts:164` |
| `prevHmac` + `hmac` fields forming a chain | **SHIPPED** | `audit-writer.ts:112-122` |
| Genesis seed for the first event | **SHIPPED** | `audit-writer.ts:17-18, 35` |
| `verifyAuditChain(events)` validates and skips legacy events | **SHIPPED** | `audit-writer.ts` (verifyAuditChain function) |
| "A SHA-256 hash is calculated" (line 91) | **ACCURACY ERROR** | v2 chain uses **keyed HMAC-SHA256** (`createHmac('sha256', AUDIT_HMAC_SECRET)`) — `audit-writer.ts:35, 269`. Legacy v1 was unkeyed SHA-256. Doc conflates v1 and v2 algorithms. |

### §4 — Strict Tenant Isolation

| Claim | Status | Evidence |
|-------|--------|---------|
| `src/core/memory-store.ts` with `strict_tenant_isolation: boolean` flag | **SHIPPED** (logic exists) | `memory-store.ts:86-90`; `config-types.ts:284` |
| "When `true`, all database queries in `memory-store.ts` are modified to omit `OR tenant_id IS NULL`" | **PARTIAL** | The MemoryStore constructor DOES accept `strictTenantIsolation` and queries at lines 684, 708, 742 are conditional — BUT: all main orchestration paths (`orbit/sprint-finalizer.ts:1093`, `debt-manager.ts:30`, `task-builder.ts:1227`, etc.) instantiate `new MemoryStore(dbPath)` **without passing the flag from config**. Setting `strict_tenant_isolation: true` in `.deckent/config.json` does NOT enforce isolation in the core memory DB. Only audit-CLI paths read and pass the flag. |

### §5 — Capability Broker & Handlers

| Claim | Status | Evidence |
|-------|--------|---------|
| `src/core/capability-broker.ts` with multi-backend selection | **SHIPPED** | `capability-broker.ts` exists |
| `src/core/capability-handlers.ts` with `httpGetHandler`, `envReadHandler`, `shellExecHandler`, `installExtendedHandlers` | **SHIPPED** | `capability-handlers.ts:192-197` |
| `shellExecHandler` uses async `spawn` (never `spawnSync`) | **SHIPPED** | `capability-handlers.ts` |

### §6 — Secret Vault

| Claim | Status | Evidence |
|-------|--------|---------|
| `.deck` file mechanism (git-ignored, KEY=VALUE format) | **SHIPPED** | ADR-014 implemented |
| `src/core/credential-encryption.ts` — AES-256-GCM, master key at `~/.deckent/.keyring`, `DECKENT_MASTER_KEY` env | **SHIPPED** | `credential-encryption.ts:39-40, 83, 106` |
| `src/core/deck-interpolation.ts` — `$DECK:NAME` syntax, auto-replaced by `loadConfig` | **SHIPPED** | `deck-interpolation.ts:3, 10` |

### §7 — Audit Read-Side: Compliance & SIEM

| Claim | Status | Evidence |
|-------|--------|---------|
| `src/core/audit-query.ts` — `readAuditEvents(projectRoot, sprintId)` | **SHIPPED** | `audit-query.ts:124` |
| `src/core/compliance-report.ts` — `generateComplianceReport` pure function | **SHIPPED** | `compliance-report.ts:52` |
| CLI `deckent audit compliance` with `--sprint`, `--json`, `--lang` | **SHIPPED** | `cli/commands/audit.ts` |
| Exit codes: 0 chain intact, 1 broken, 2 error | **SHIPPED** | `cli/commands/audit.ts:277+` |
| `src/core/siem-forwarder.ts` — `createSiemForwarder`, NDJSON file transport | **SHIPPED** | `siem-forwarder.ts` |
| `src/core/siem-transport-http.ts` — `createHttpSiemTransport` | **SHIPPED** | `siem-transport-http.ts:47` |
| `src/core/siem-transport-syslog.ts` — `createSyslogSiemTransport`, RFC 5424 | **SHIPPED** | `siem-transport-syslog.ts:138` |
| **"The `audit forward` CLI flag wire for syslog is a follow-up"** (line 202) | **STALENESS BUG** | `--syslog <host[:port]>` IS wired: `cli/commands/audit.ts:261, 318-326`. This describes a SHIPPED feature as pending. Not vision-as-shipped, but the doc is stale/incorrect. |

### §8 — Capability Invocation Audit

| Claim | Status | Evidence |
|-------|--------|---------|
| `src/core/capability-runtime.ts` — `createAuditedCapabilityRegistry(emit?, options)` | **SHIPPED** | `capability-runtime.ts:71` |
| `src/core/capability-audit-bridge.ts` — `withAuditedInvocation(handler, emit)` | **SHIPPED** | `capability-audit-bridge.ts:44` |
| Wire-up in `buildEngineRuntime` | **SHIPPED** | `runtime-loop.ts:299` imports `capability-runtime.ts:30` |
| `capability.success` / `capability.error` audit actions | **SHIPPED** | `capability-audit-bridge.ts:44+` |
| Audit-sink failure never fails the capability invocation | **SHIPPED** | `capability-runtime.ts:71+` (safeEmit pattern) |

### §9 — SSO/OIDC: JWKS Key Resolution & Terminal Auth

| Claim | Status | Evidence |
|-------|--------|---------|
| `src/core/auth-jwks.ts` — `fetchJwks(url, fetchImpl?)` HTTPS-only | **SHIPPED** | `auth-jwks.ts:120` |
| `createJwksKeyResolver(opts)` — TTL-cached 5min, algorithm-confusion guard | **SHIPPED** | `auth-jwks.ts:184, 191` |
| `verifyJwtWithJwks(token, opts)` — RS256 pinned, `alg:none` rejected | **SHIPPED** | `auth-jwks.ts:273` |
| Old "JWKS fetch is a documented follow-up" note closed | **SHIPPED** | `auth-oidc.ts:5` still has old note; the note in §9 correctly says Sprint 265 closed it |
| `src/api/terminal/auth-provider.ts` — `OidcAuthProvider` with sync verify | **SHIPPED** | `auth-provider.ts:109` |
| `DECKENT_API_AUTH_DISABLED` no-bypass invariant | **SHIPPED** | `auth-provider.ts` |

### §10 — HTTP API OIDC Bearer (`api_oidc`)

| Claim | Status | Evidence |
|-------|--------|---------|
| `src/api/auth.ts` — `bearerAuthMiddleware`, `AuthConfig.oidc` | **SHIPPED** | `auth.ts:8, 43, 157` |
| `src/api/server.ts` — `createHttpServer` OIDC consult | **SHIPPED** | `server.ts` |
| `src/core/config-types.ts` — `api_oidc` block, `validateConfig` | **SHIPPED** | `config-types.ts:284` |
| Static-first, JWT second verification order | **SHIPPED** | `auth.ts:157+` |
| Algorithm pinning + key-slot separation | **SHIPPED** | `auth.ts` |
| OIDC-only mode (no static token) activates auth | **SHIPPED** | `auth.ts` |
| Fail-closed config consult in `createHttpServer` | **SHIPPED** | `server.ts` |
| Keys never echoed in validation errors | **SHIPPED** | `config.ts:1559+` (validateConfig) |

### §11 — Dashboard SSO

| Claim | Status | Evidence |
|-------|--------|---------|
| `src/dashboard/src/hooks/useAuth.tsx` — `useAuth()` hook with full API | **SHIPPED** | `useAuth.tsx:1, 36-47, 74-122` |
| `src/dashboard/src/lib/session.ts` — `DECKENT_SESSION_TOKEN`, `getToken`/`setToken`/`clearToken` | **SHIPPED** | `session.ts:6` |
| `src/dashboard/src/components/AuthStatus.tsx` | **SHIPPED** | file exists |
| `src/dashboard/src/components/ManualTokenInput.tsx` | **SHIPPED** | file exists |
| `src/dashboard/src/lib/oidc-flow.ts` — `generatePkce`, `buildAuthorizeUrl`, `parseCallbackParams`, `validateState` | **SHIPPED** | `oidc-flow.ts:156, 177, 203, 225` |
| `src/dashboard/src/pages/LoginPage.tsx` + `CallbackPage.tsx` | **SHIPPED** | both files exist |
| `src/api/auth-me-endpoint.ts` — `/api/auth/me` endpoint | **SHIPPED** | `auth-me-endpoint.ts:23-29, 43-44` |
| `src/api/oidc-callback-endpoint.ts` — `/api/auth/oidc/exchange` endpoint | **SHIPPED** | `oidc-callback-endpoint.ts:3, 178` |
| `src/api/enterprise-endpoint.ts` — JWT `sub`/`preferred_username` → `audit.actor` | **SHIPPED** | `enterprise-endpoint.ts:2-5` |

### §12 — ERP Connector (`erp.read`)

| Claim | Status | Evidence |
|-------|--------|---------|
| Module `src/core/erp/` (connector, handler, factory) | **SHIPPED** | `src/core/erp/connector.ts`, `handler.ts`, `factory.ts` all exist |
| `erp/ifs/driver.ts` — IFS Cloud driver | **SHIPPED** | `src/core/erp/ifs/driver.ts:130` (`createIfsErpDriver`) |
| `erp/odoo/driver.ts` — Odoo driver | **SHIPPED** | `src/core/erp/odoo/driver.ts:117` (`createOdooErpDriver`) |
| `erp/sap/driver.ts` — SAP driver | **SHIPPED** | `src/core/erp/sap/driver.ts:132` (`createSapErpDriver`) |
| `erp/dynamics/driver.ts` — Dynamics driver | **SHIPPED** | `src/core/erp/dynamics/driver.ts:140` (`createDynamicsErpDriver`) |
| 4-layer read-only safety contract | **SHIPPED** | `erp/connector.ts:97` (`readOnly: true`) |
| ERP opt-in: absent `erp.enabled` → no handler registered | **SHIPPED** | `erp/factory.ts` |
| In-memory reference driver for tests | **SHIPPED** | `erp/handler.ts:219` (`createInMemoryErpDriver`) |
| **"Real ERP validation (live IFS round-trip) is a post-beta step (ARC-I)"** | **PLANNED/VISION** | Correctly labeled; hermetic driver tests exist but live network validation is explicitly deferred. No live validation code present. |

---

## enterprise-foundation.md

### §1 — Actor & RBAC

| Claim | Status | Evidence |
|-------|--------|---------|
| `src/core/rbac.ts` — PERMISSION_MATRIX (viewer ⊆ operator ⊆ admin) | **SHIPPED** | `rbac.ts:48-50` |
| `can(role, action, tenantId, auditCtx?)` | **SHIPPED** | `rbac.ts:90` |
| `enforceRbac(role, action, tenantId, rbacConfig?)` — NO_OP when disabled | **SHIPPED** | `rbac.ts:120-128` |
| `access:denied` audit event written on denial | **SHIPPED** | `rbac.ts:90+` (auditCtx path) |
| `src/nervous/authority-matrix.ts` worker authority | **SHIPPED** | `authority-matrix.ts:413` |
| Worker authority roles `admin \| engineer \| viewer` (line 66) | **ACCURACY ERROR** | Code has 4 roles: `'admin' \| 'engineer' \| 'operator' \| 'viewer'` — `authority-matrix.ts:200`. `operator` role is absent from both §1 (line 66) and §2a of enterprise-depth.md. |

### §2 — Multi-Tenancy (`tenantId`)

| Claim | Status | Evidence |
|-------|--------|---------|
| Filesystem isolation `.deckent/tenants/<tenantId>/` | **SHIPPED** | `flow-registry.ts:20-22` (`forCurrentTenant`) |
| MemoryStore `tenantId` scoping | **SHIPPED** | `memory-store.ts:684, 708, 742` |
| Audit isolation via `queryAudit()` tenantId filter | **SHIPPED** | `audit-query.ts:74-77` |
| `TenantContext` runtime resolution (`src/core/tenant-context.ts`) | **SHIPPED** | `tenant-context.ts:35-43` |
| `withTenant()` / `currentTenant()` / `tenantPath()` | **SHIPPED** | `tenant-context.ts:68, 82, 91` |
| **Honest scope** — NOT implemented: runtime process isolation (F3-003), SCIM, cross-tenant RBAC matrix | **PLANNED/VISION** — correctly labeled | Honest scope section accurately flags these as not implemented |

### §3 — Audit Lineage (`correlationId`, `causationId`)

| Claim | Status | Evidence |
|-------|--------|---------|
| `src/core/event-stream.ts` propagates `correlationId`, `causationId` | **SHIPPED** | `event-stream.ts` (from `core/` per ADR-008) |
| `filterByCorrelation`, `filterByCausation`, `buildCausalChain`, `groupByActor` | **SHIPPED** | `audit-query.ts:243, 254, 273, 319` |
| HMAC chain integrity via `audit-writer.ts` | **SHIPPED** | `audit-writer.ts:164` |

### §4 — Governance Gating (`riskClass`)

| Claim | Status | Evidence |
|-------|--------|---------|
| `resolveRiskClass()` consumed by `src/nervous/decision-engine.ts` | **SHIPPED** | `decision-engine.ts:16, 84` |
| `risk_gate_enabled` config gates high-risk tasks for approval | **SHIPPED** | `decision-engine.ts:112-113` |

### §5 — Capability Brokering (`capabilityTarget`)

| Claim | Status | Evidence |
|-------|--------|---------|
| `src/core/capability-broker.ts` — `invokeCapability()` | **SHIPPED** | `capability-broker.ts` exists |

### §6 — Cost Control (`budget`)

| Claim | Status | Evidence |
|-------|--------|---------|
| `src/core/cost-gate.ts` — `budget.maxUsd`, `budget.maxTokens` per-request ceiling | **SHIPPED** | `cost-gate.ts:26, 39-44` |

---

## enterprise-integrations.md

### §1 — SSO/OIDC Integration

| Claim | Status | Evidence |
|-------|--------|---------|
| `src/core/auth-oidc.ts` — `verifyJwt`, `parseOidcClaims`, `OidcConfig` | **SHIPPED** | `auth-oidc.ts` |
| `src/core/auth-session.ts` — `SessionStore` (create/resolve/revoke/prune) | **SHIPPED** | `auth-session.ts:26, 41, 59, 69, 77` |
| Optional persistence hook `{ load?, save? }` | **SHIPPED** | `auth-session.ts:18-21` |

### §2 — SIEM Event Forwarding

| Claim | Status | Evidence |
|-------|--------|---------|
| `src/core/siem-forwarder.ts` — `createSiemForwarder`, fail-safe, buffered batching | **SHIPPED** | `siem-forwarder.ts:34, 41-48` |

### §3 — Compliance Reporting

| Claim | Status | Evidence |
|-------|--------|---------|
| `src/core/compliance-report.ts` — `generateComplianceReport` | **SHIPPED** | `compliance-report.ts:52` |
| Archive-aware compliance (concatenates archived + live events) | **SHIPPED** | `audit-query.ts:139` (`readArchivedAuditEvents`) + `cli/commands/audit.ts` |
| `deckent audit compliance --sprint <id> [--json]` CLI | **SHIPPED** | `cli/commands/audit.ts:277` |

### §4 — Audit Log Retention & Rotation

| Claim | Status | Evidence |
|-------|--------|---------|
| `src/core/audit-retention.ts` — `planRetention(entries, policy)` | **SHIPPED** | `audit-retention.ts:69` |
| `{ keep, archive, prune }` partitioning with chain contiguity | **SHIPPED** | `audit-retention.ts:46-53` |
| CLI `deckent audit retention` with dry-run by default, `--apply` atomic | **SHIPPED** | `cli/commands/audit.ts` |

### §5 — Read-Only Data Access

| Claim | Status | Evidence |
|-------|--------|---------|
| `src/core/erp-connector.ts` — `ErpConnector` class with `registerEntity()` and `query()` | **PATH/ACCURACY ERROR** | `src/core/erp-connector.ts` (flat) is `buildErpConnectorFromDeck` — a deck-aware factory wrapper. The `ErpConnector` CLASS (`registerEntity`, `query`) is at `src/core/erp/connector.ts:200`. The function signatures are SHIPPED but the cited path is wrong. |
| `src/core/capability-handlers-data.ts` — `dbQueryHandler`, `mailSearchHandler`, `installDataHandlers` | **SHIPPED** | `capability-handlers-data.ts:205-209` |

### §6 — Capability Invocation Auditing

| Claim | Status | Evidence |
|-------|--------|---------|
| `src/core/capability-audit-bridge.ts` — `withAuditedInvocation` | **SHIPPED** | `capability-audit-bridge.ts:44` |

### §7 — JWKS Key Resolution

| Claim | Status | Evidence |
|-------|--------|---------|
| `src/core/auth-jwks.ts` — all three functions | **SHIPPED** | `auth-jwks.ts:120, 184, 273` |

### §8 — Terminal OIDC Auth Provider

| Claim | Status | Evidence |
|-------|--------|---------|
| `src/api/terminal/auth-provider.ts` — `OidcAuthProvider` | **SHIPPED** | `auth-provider.ts:109` |
| Sync-contract boundary (no JWKS on verify path), algorithm pinning, `AUTH_DISABLED` no-bypass | **SHIPPED** | `auth-provider.ts:71-183` |

### §9 — SIEM Network Transports

| Claim | Status | Evidence |
|-------|--------|---------|
| HTTP transport `src/core/siem-transport-http.ts` — `createHttpSiemTransport` | **SHIPPED** | `siem-transport-http.ts:47` |
| Syslog transport `src/core/siem-transport-syslog.ts` — `createSyslogSiemTransport`, RFC 5424 | **SHIPPED** | `siem-transport-syslog.ts:138` |
| HTTP CLI wire `deckent audit forward --url` | **SHIPPED** | `cli/commands/audit.ts:260, 306` |
| Syslog CLI wire (§9 defers to cli-commands.md) | **SHIPPED** | `cli/commands/audit.ts:261` (`--syslog`), `318-326` |
| `globalThis.fetch` described as "Node 18+ built-in" (lines 196, 234, 265) | **ADR-001 VIOLATION** | ADR-001 mandates **Node 24+** baseline. "Node 18+" references are incorrect and should be "Node 24+". Three occurrences: lines 196 (HTTP transport), 234 (Odoo driver), 265 (Dynamics driver). |

### §10 — ERP Read Capability

**⚠️ P0 — Config flag presented as fully enforcing isolation when core paths are unwired**

The `strict_tenant_isolation` feature is documented in enterprise-depth.md §4 as enforcing strict isolation on "all database queries in `memory-store.ts`". However, the config flag is NOT connected to MemoryStore in the main orchestration paths:

- `orchestra/sprint-finalizer.ts:1093` — `new MemoryStore(dbPath)` (no flag)
- `orchestra/debt-manager.ts:30` — `new MemoryStore(dbPath)` (no flag)
- `orchestra/task-builder.ts:1227` — `new MemoryStore(dbPath)` (no flag)
- Only `cli/commands/audit.ts:277` reads `cfg.strict_tenant_isolation` and passes it to compliance reporting — but this doesn't affect the MemoryStore that holds ADRs, retros, and agent learnings.

Setting `strict_tenant_isolation: true` in `.deckent/config.json` does NOT enforce strict DB isolation for sprint data. This is a partial implementation presented as complete.

| Claim | Status | Evidence |
|-------|--------|---------|
| `src/core/capability-handlers-erp.ts` — `createErpReadHandler`, `installErpHandler`, `createInMemoryErpDriver` | **PATH ERROR** | File does not exist at that path. Actual: `src/core/erp/handler.ts:117, 131, 219` |
| `src/core/erp-driver-odoo.ts` — `createOdooErpDriver` | **PATH ERROR** | File does not exist at that path. Actual: `src/core/erp/odoo/driver.ts:117` |
| `src/core/erp-driver-sap.ts` — `createSapErpDriver` | **PATH ERROR** | File does not exist at that path. Actual: `src/core/erp/sap/driver.ts:132` |
| `src/core/erp-driver-dynamics.ts` — `createDynamicsErpDriver` | **PATH ERROR** | File does not exist at that path. Actual: `src/core/erp/dynamics/driver.ts:140` |
| "Driver Status" mentions only Odoo and SAP as concrete drivers (line 223) | **INCOMPLETE** | IFS driver also exists (`src/core/erp/ifs/driver.ts`) — the "Driver Status" summary pre-dates its addition. Dynamics is documented below the summary. |
| All Odoo / SAP / Dynamics driver FUNCTIONALITY | **SHIPPED** | Implementations verified: `erp/odoo/driver.ts:117`, `erp/sap/driver.ts:132`, `erp/dynamics/driver.ts:140` |

### §11 — Scheduled Flows

| Claim | Status | Evidence |
|-------|--------|---------|
| `src/core/scheduled-flow.ts` — `ScheduledFlow`, `parseCronExpr`, `nextRun` | **SHIPPED** | `scheduled-flow.ts:11, 46, 140` |
| `src/core/flow-registry.ts` — `FlowRegistry` with RBAC-gated CRUD | **SHIPPED** | `flow-registry.ts:8, 20, 25` |
| `src/core/flow-scheduler.ts` — `FlowScheduler.tick`, `collectDue`, `reset` | **SHIPPED** | `flow-scheduler.ts:30, 42` |
| Honest note: scheduler computes "when", actual execution routes through autonomous backlog | **APPROPRIATELY LABELED** | `flow-scheduler.ts` — no direct worker spawn |

### §12 — Event-Driven Triggers

| Claim | Status | Evidence |
|-------|--------|---------|
| `src/core/event-trigger.ts` — `EventTrigger`, `IncomingEvent`, `matchTrigger` | **SHIPPED** | `event-trigger.ts` |
| `FlowScheduler.collectDue` unifying scheduled + event dispatch | **SHIPPED** | `flow-scheduler.ts:42` |
| `src/core/notification-providers/webhook.ts` — `WebhookNotificationProvider` | **SHIPPED** | `notification-providers/webhook.ts:28` |

### §13 — Enterprise Dashboard API

| Claim | Status | Evidence |
|-------|--------|---------|
| `src/api/enterprise-endpoint.ts` — all 4 GET + 3 WRITE endpoints | **SHIPPED** | `enterprise-endpoint.ts:2-5, 93, 147, 171, 207` |
| Admin-only RBAC for write endpoints | **SHIPPED** | `enterprise-endpoint.ts:306+` |
| Zod `.strict()` validation | **SHIPPED** | `enterprise-endpoint.ts:317, 325, 621, 627, 750, 757` |
| Role claim derivation priority | **SHIPPED** | `enterprise-endpoint.ts` |
| Honest scope: `GET /api/enterprise/rbac` exposes static matrix, NOT live per-user role assignment | **APPROPRIATELY LABELED** | Honest boundary stated; `enterprise-endpoint.ts:613+` confirms CRUD on config-level roles, not per-user |

---

## Findings Summary

### P0 — Honesty Gap (1)

**[P0-01] `strict_tenant_isolation` not wired to main MemoryStore paths**  
*Doc*: `enterprise-depth.md §4` / *Referenced in*: `enterprise-foundation.md §2` (implied via memory store claim)  
*Claim*: Setting `strict_tenant_isolation: true` modifies "all database queries in memory-store.ts".  
*Reality*: Config is read and passed to audit/compliance paths only. The main MemoryStore instances in `orchestra/` (which hold ADRs, retros, memories) are constructed without the flag. An operator enabling this flag in production would NOT get strict isolation for sprint data.  
*Fix*: Either (a) wire `loadConfig().strict_tenant_isolation` to all MemoryStore construction sites, or (b) add an honest boundary note clarifying which paths are and aren't affected.

### Accuracy Errors (7)

**[ACC-01] WorkerRole taxonomy incomplete in 2 docs**  
*Docs*: `enterprise-depth.md §2a` (line 42), `enterprise-foundation.md §1` (line 66)  
*Claim*: `admin | engineer | viewer`  
*Reality*: 4 roles: `admin | engineer | operator | viewer` — `authority-matrix.ts:200`

**[ACC-02] HMAC algorithm description: SHA-256 vs HMAC-SHA256**  
*Doc*: `enterprise-depth.md §3` (line 91)  
*Claim*: "A SHA-256 hash is calculated"  
*Reality*: v2 chain uses **keyed** `HMAC-SHA256(AUDIT_HMAC_SECRET, ...)` — `audit-writer.ts:35, 269`

**[ACC-03] Syslog CLI wire described as pending when shipped**  
*Doc*: `enterprise-depth.md §7` (line 202)  
*Claim*: "The `audit forward` CLI flag wire for syslog is a follow-up"  
*Reality*: `--syslog` IS wired: `cli/commands/audit.ts:261, 318-326`

**[ACC-04] ERP driver file paths: 4 wrong paths in enterprise-integrations.md**  
*Doc*: `enterprise-integrations.md §10`  

| Cited path | Actual path |
|-----------|-------------|
| `src/core/capability-handlers-erp.ts` | `src/core/erp/handler.ts` |
| `src/core/erp-driver-odoo.ts` | `src/core/erp/odoo/driver.ts` |
| `src/core/erp-driver-sap.ts` | `src/core/erp/sap/driver.ts` |
| `src/core/erp-driver-dynamics.ts` | `src/core/erp/dynamics/driver.ts` |

**[ACC-05] ErpConnector class path confusion in enterprise-integrations.md §5**  
`src/core/erp-connector.ts` (flat, EXISTS) is `buildErpConnectorFromDeck` — a wrapper factory.  
The `ErpConnector` class with `registerEntity()` and `query()` is at `src/core/erp/connector.ts:200`.

**[ACC-06] Node 18+ references violate ADR-001 (Node 24+ baseline)**  
*Doc*: `enterprise-integrations.md` lines 196, 234, 265  
*Fix*: Replace "Node 18+" with "Node 24+" per ADR-001.

**[ACC-07] "Driver Status" summary omits IFS driver**  
*Doc*: `enterprise-integrations.md §10` (line 223)  
"The tree currently contains the in-memory reference driver, the Odoo JSON-RPC driver, and the SAP OData driver" — omits the IFS driver (`src/core/erp/ifs/driver.ts`) which IS shipped.

---

## Coverage Note

- **Files read**: All 3 enterprise docs (`~88KB` combined), full source-code spot-checks on 49 referenced files/functions
- **Verification method**: `grep -n` + `ls` confirmation for every cited file path and function; actual line-number evidence for all SHIPPED claims
- **Links checked**: Internal links `enterprise-foundation.md` and `enterprise-integrations.md` → ADR-068/069/071 (not externally linkable but found in memory.db). Cross-doc links between the three files are consistent. External link to `docs/reference/api-surface.md` and `docs/reference/cli-commands.md` both exist.
- **What was NOT checked**: live ERP driver network behavior (requires external systems), dashboard React rendering, MCP audit tool (outside scope)

---

## Recommended Fixes (Priority Order)

1. **P0-01**: Wire `config.strict_tenant_isolation` to all `new MemoryStore(dbPath)` calls in `orchestra/` and `core/` — or add explicit honest boundary in enterprise-depth.md §4 listing which paths are isolated vs. not.
2. **ACC-04**: Correct ERP driver paths in `enterprise-integrations.md §10` (4 paths)
3. **ACC-01**: Add `operator` to WorkerRole taxonomy in enterprise-depth.md §2a and enterprise-foundation.md §1
4. **ACC-03**: Remove stale "follow-up" note about syslog CLI in enterprise-depth.md §7
5. **ACC-06**: Replace 3× "Node 18+" with "Node 24+" in enterprise-integrations.md §9
6. **ACC-02**: Clarify HMAC algorithm in enterprise-depth.md §3: "HMAC-SHA256 (keyed, v2) or unkeyed SHA-256 (legacy v1)"
7. **ACC-05**: Clarify ErpConnector vs. buildErpConnectorFromDeck paths in enterprise-integrations.md §5
8. **ACC-07**: Add IFS driver entry to "Driver Status" summary in enterprise-integrations.md §10
