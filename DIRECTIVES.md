# DIRECTIVES — Sprint 262: Enterprise Integrations + autonomous close (claude-weighted, 13 tasks)

## Goal: Build the enterprise INTEGRATION layer the MASTER-PLAN still lacks (ENT-5 SSO/OIDC + session + SIEM + compliance, ERP-1 read-only DB/ERP) on top of Sprint 261's contract-enforcement surfaces, finish the autonomous loop (fix the live minute-only cron bug, work-generator trigger source), and lay the ONE clean seam (actor data-plumbing) the live spawn-path wire needs. **NOT MVP — enterprise-level, god-level.** Fleet: **claude-weighted** (11 claude [2 opus + 9 sonnet] + 1 codex breadth + 1 gemini doc). Every code task: `npx tsc --noEmit` clean + run ONLY the TARGETED test file(s) for the touched module(s). Each code-task scope INCLUDES the matching `tests/` dir. **All new behavior is additive / opt-in / default-off / backward-safe.** Live worker-spawn / eval ENFORCEMENT wiring stays OUT of scope — CC hand-connects the spawn-path edge + consumes the accumulated seams next iteration; workers build the additive surface only. ADR-010: no new runtime dependency — hand-roll with `node:crypto` etc. **SSOT discipline:** do NOT re-define logic that already exists (role→capability lives in `authority-matrix.ts`/`rbac.ts`; budget-ceiling min lives in `cost-gate.ts`; strict-tenant lives in `memory-store.ts`) — these tasks add NEW capability, they do not duplicate existing decision logic.

## Ortak kurallar
- CODE task → `npx tsc --noEmit` clean + run ONLY the TARGETED test file(s) for the touched module(s) (NOT the full suite — it has unrelated pre-existing failures). Additive / surgical / minimum-diff (Karpathy). Stay in `scope.filesWrite` (which includes the matching `tests/` dir).
- i18n-first: NO hardcoded user-facing strings (`getMessage(key, lang)`). Mechanism modules stay string-free. No tech debt left silent — flag in `.result` notes.
- `.tasks/task-XXX.result` honest selfAssessment (tsc + TARGETED tests). **WRITE the `.result` file — a real deliverable with no `.result` is graded NO_GO (Sprint 260/261 codex/gemini lesson).**
- **One writer per file:** every task owns a UNIQUE primary file. Do NOT edit files outside your `Files:` list.
- ESM: `.js` import extensions mandatory (Node16). ADR-008: `core/` does not import from `orchestra/nervous`. ADR-010: hand-roll, no new deps.

---

## Task 1: ENT-5a — OIDC/JWT verification (SSO foundation)
- Provider: claude
- Model: opus
- Backend: docker
- Effort: high
- Agent: security-auditor
- Skills: security-specialist, typescript-expert
- Files: src/core/auth-oidc.ts, tests/core/auth-oidc.test.ts
- Scope: src/core/, tests/core/

### Description
Create a NEW additive module `src/core/auth-oidc.ts` for SSO/OIDC token verification — NO new dependency (hand-roll with `node:crypto`). Expose `verifyJwt(token, opts): { valid: boolean; claims?: OidcClaims; reason?: string }` supporting HS256 (shared secret) and RS256 (PEM public key via `crypto.verify`), validating signature + `exp`/`nbf`/`iss`/`aud` claims when the corresponding opts are provided. Add `parseOidcClaims(token)` (decode without verify, for introspection) and an `OidcConfig` type ({ issuer?, audience?, algorithms?, hs256Secret?, rs256PublicKey? }). Pure functions, no network (JWKS fetch is a documented follow-up — accept the key material directly). Backward-safe (new file, zero callers). Enterprise-grade: reject `alg:none`, constant-time secret compare where applicable.

**Kanıt:** `test -f src/core/auth-oidc.ts && grep -n "verifyJwt\|RS256\|HS256\|alg.*none\|exp\|iss" src/core/auth-oidc.ts` → JWT verify + claim validation, alg:none rejected; targeted test PASS; tsc clean. **Test:** targeted (new file, in-scope) — valid HS256, valid RS256, expired, bad-sig, alg:none rejected, aud/iss mismatch.

---

## Task 2: ENT-5a2 — SSO session store
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: security-auditor
- Skills: security-specialist, typescript-expert
- Files: src/core/auth-session.ts, tests/core/auth-session.test.ts
- Scope: src/core/, tests/core/

### Description
Create a NEW additive module `src/core/auth-session.ts` — a session store for verified SSO identities. Expose a `SessionStore` class with `create(identity, ttlMs): SessionToken`, `resolve(token): Session | null` (null when expired/unknown), `revoke(token)`, and `prune(now)` (drop expired). Session carries `{ actorId, role, tenantId, issuedAt, expiresAt }` mapping to the `ActorContext` shape (import the type from `core/work-model.js`). In-memory Map by default with an injectable persistence hook (`{ load?, save? }`) for durability — do NOT couple to a specific store. Deterministic for tests (injectable `now`). Backward-safe (new file). Pure where possible; least surface.

**Kanıt:** `test -f src/core/auth-session.ts && grep -n "SessionStore\|create\|resolve\|revoke\|expiresAt\|ActorContext" src/core/auth-session.ts` → session lifecycle + ActorContext mapping; targeted test PASS; tsc clean. **Test:** targeted (new file, in-scope) — create/resolve, expiry→null, revoke, prune.

---

## Task 3: ENT-5b — SIEM event forwarder
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: security-auditor
- Skills: security-specialist, typescript-expert
- Files: src/core/siem-forwarder.ts, tests/core/siem-forwarder.test.ts
- Scope: src/core/, tests/core/

### Description
Create a NEW additive module `src/core/siem-forwarder.ts` — forwards audit events to an external SIEM. Expose `createSiemForwarder(opts): SiemForwarder` with a pluggable transport (`transport: (batch) => Promise<void>` — injected; default off / no-op), buffered batching (`flushEvery`, `maxBatch`), and `forward(event)` + `flush()`. Map an `AuditEvent` (import type from `audit-writer.js`, existing fields only) to a normalized SIEM record ({ ts, actor, action, outcome, correlationId, causationId }). Fail-safe: a transport error MUST NOT throw into the caller (log + retry-bounded, drop after N). Default-off (no transport → events buffered/discarded per policy, never crash). Hermetic tests (injected transport, no real network).

**Kanıt:** `test -f src/core/siem-forwarder.ts && grep -n "createSiemForwarder\|transport\|forward\|flush\|batch" src/core/siem-forwarder.ts` → pluggable transport + batching + fail-safe; targeted test PASS; tsc clean. **Test:** targeted (new file, in-scope), hermetic — batch flush, transport-error swallowed, default-off no-op.

---

## Task 4: ENT-5c — compliance report generator
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: architect
- Skills: typescript-expert
- Files: src/core/compliance-report.ts, tests/core/compliance-report.test.ts
- Scope: src/core/, tests/core/

### Description
Create a NEW additive module `src/core/compliance-report.ts` — generate a structured compliance summary from INJECTED inputs (do NOT couple to live DB/config, for testability). Expose `generateComplianceReport(input): ComplianceReport` where input carries { rbacEnabled, tenantIsolation, auditEvents } and the report summarizes: RBAC enforcement status, tenant-isolation status, audit-chain integrity (call `verifyAuditChain` from `audit-writer.js` on the provided events), event count + actor breakdown, and a SOC2/ISO-style checklist of which controls are ON/OFF. Pure function, deterministic. Backward-safe (new file). Output is a typed object (a markdown/text renderer is a follow-up).

**Kanıt:** `test -f src/core/compliance-report.ts && grep -n "generateComplianceReport\|ComplianceReport\|verifyAuditChain\|rbac\|tenant" src/core/compliance-report.ts` → compliance summary composing audit-chain verify; targeted test PASS; tsc clean. **Test:** targeted (new file, in-scope) — controls ON/OFF, intact-chain vs broken-chain, actor breakdown.

---

## Task 5: ENT-3 — audit log retention & rotation policy
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: architect
- Skills: typescript-expert
- Files: src/core/audit-retention.ts, tests/core/audit-retention.test.ts
- Scope: src/core/, tests/core/

### Description
Create a NEW additive module `src/core/audit-retention.ts` — retention/rotation policy for the audit log. Expose `planRetention(entries, policy): { keep: AuditEvent[]; archive: AuditEvent[]; prune: AuditEvent[] }` where policy = { maxAgeMs?, maxCount? } — partition entries by age/count into keep/archive/prune WITHOUT breaking the hash-chain semantics (archived/pruned ranges must be contiguous from the chain head so `verifyAuditChain` stays meaningful on what remains). Pure function over injected entries (no fs I/O here — the caller applies the plan). Import `AuditEvent` from `audit-writer.js`. Backward-safe (new file). Document the chain-contiguity invariant in a comment.

**Kanıt:** `test -f src/core/audit-retention.ts && grep -n "planRetention\|maxAge\|maxCount\|keep\|archive\|prune\|AuditEvent" src/core/audit-retention.ts` → retention partitioning, chain-contiguous; targeted test PASS; tsc clean. **Test:** targeted (new file, in-scope) — age-prune, count-prune, contiguity preserved, empty safe.

---

## Task 6: F8 — data capability handlers (read-only db.query / mail.search)
- Provider: codex
- Model: gpt-5
- Backend: docker
- ModelEffort: high
- Effort: normal
- Agent: refactorer
- Skills: typescript-expert
- Files: src/core/capability-handlers-data.ts, tests/core/capability-handlers-data.test.ts
- Scope: src/core/, tests/core/

### Description
Create a NEW additive module `src/core/capability-handlers-data.ts` shipping data-access reference handlers implementing the EXISTING `CapabilityHandler` interface (import from `capability-broker.js` — do NOT edit that file). `dbQueryHandler` (`requiredCapability: 'db.read'`) — executes a READ-ONLY query via an INJECTED query function (`queryImpl`), and REJECTS any statement that is not a single SELECT (block INSERT/UPDATE/DELETE/DROP/`;`-multi-statement — least-privilege, no writes). `mailSearchHandler` (`requiredCapability: 'mail.read'`) — searches via an injected `searchImpl`, returns normalized message headers. Export `installDataHandlers(registry)`. Each declares `requiredCapability` so the existing least-privilege gate applies. Hermetic tests (injected queryImpl/searchImpl — NO real DB/network; assert the read-only SQL gate rejects writes). **WRITE a `.result` file.**

**Kanıt:** `test -f src/core/capability-handlers-data.ts && grep -n "dbQueryHandler\|mailSearchHandler\|installDataHandlers\|requiredCapability\|SELECT\|read-only" src/core/capability-handlers-data.ts` → read-only handlers + write-rejection gate; targeted test PASS; tsc clean. **Test:** targeted (new file, in-scope), hermetic — SELECT allowed, INSERT/UPDATE/DELETE/multi-stmt rejected, mail search maps headers.

---

## Task 7: ERP-1 — read-only ERP/DB connector capability
- Provider: claude
- Model: opus
- Backend: docker
- Effort: high
- Agent: data-engineer
- Skills: typescript-expert, database-migration
- Files: src/core/erp-connector.ts, tests/core/erp-connector.test.ts
- Scope: src/core/, tests/core/

### Description
Create a NEW additive module `src/core/erp-connector.ts` — the foundation for "Deckent runs inside an enterprise" (ERP-1, MASTER-PLAN #ERP), scoped READ-ONLY. Expose an `ErpConnector` abstraction with `query(spec): Promise<ErpResultSet>` where `spec` is a STRUCTURED read query ({ entity, filters, fields, limit }) — NOT raw SQL — compiled to a parameterized read-only request through an INJECTED driver (`driver: (compiled) => Promise<rows>`). Enforce least-privilege: no mutation verbs, mandatory `limit` cap, field allow-list per entity. Add `registerEntity(name, schema)` so only declared entities/fields are queryable. Pure compilation + injected execution (hermetic). Import `ActorContext` from `work-model.js` to tag the requesting actor on each query (for audit). Backward-safe (new file). Enterprise-grade, extensible to connectors (SAP/Odoo/Dynamics) later.

**Kanıt:** `test -f src/core/erp-connector.ts && grep -n "ErpConnector\|registerEntity\|read-only\|limit\|filters\|ActorContext" src/core/erp-connector.ts` → structured read-only query compiler + entity allow-list; targeted test PASS; tsc clean. **Test:** targeted (new file, in-scope), hermetic — allowed entity/field query, undeclared entity rejected, mutation/limit enforcement.

---

## Task 8: AUT-4 fix — full 5-field cron in CORE (close the live latent bug)
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert
- Files: src/core/scheduled-flow.ts, tests/core/scheduled-flow.test.ts
- Scope: src/core/, tests/core/

### Description
LATENT BUG (Sprint 261 T11 finding): the LIVE `FlowScheduler` uses `core/scheduled-flow.ts`'s `nextRun`, which only honors the **minute** field — so real cron schedules silently ignore hour/day-of-month/month/day-of-week. The full 5-field implementation exists only in the UNUSED `orchestra/autonomous/scheduled-flow.ts`. Fix the LIVE path: implement full 5-field cron evaluation (minute, hour, dom, month, dow with `*`, ranges `a-b`, lists `a,b`, steps `*/n`) directly in `src/core/scheduled-flow.ts`'s `nextRun` — hand-rolled, no new dep (ADR-010). Preserve the existing function signature + all current exports so `FlowScheduler` / `trigger-adapter` keep resolving unchanged. This is the canonical source; the autonomous duplicate can re-export it in a follow-up. **CC will verify this against the live path with extra scrutiny.**

**Kanıt:** `grep -n "nextRun\|hour\|dayOfWeek\|dayOfMonth\|month\|step\|range" src/core/scheduled-flow.ts` → full 5-field cron in core; targeted test PASS; tsc clean. **Test:** targeted, additive — each field (hour/dom/month/dow), ranges, lists, steps, plus the existing minute behavior preserved.

---

## Task 9: actor data-plumbing — carry ActorContext onto the Task (seam, not enforcement)
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: refactorer
- Skills: typescript-expert
- Files: src/core/types.ts, src/orchestra/execution-request-builder.ts, tests/orchestra/execution-request-builder.test.ts
- Scope: src/core/, src/orchestra/, tests/orchestra/

### Description
To let the live spawn-path eventually consult RBAC, the actor must reach the Task. This task ONLY plumbs DATA (no enforcement): add an additive OPTIONAL `actor?: ActorContext` field to the `Task` interface in `src/core/types.ts` (import `ActorContext` from `work-model.js`; touch NOTHING else in types.ts) and set `task.actor = req.actor` in `resolveToTask` (`execution-request-builder.ts`). Absent actor → field undefined (backward-safe; every existing caller/test unaffected). Do NOT add any authorization call — this is the data seam only; CC wires the spawn-path `authorizeExecution` consult separately next iteration. Surgical, additive-optional.

**Kanıt:** `grep -n "actor" src/core/types.ts && grep -n "actor" src/orchestra/execution-request-builder.ts` → optional actor on Task + set in resolveToTask; targeted execution-request-builder test PASS; tsc clean. **Test:** targeted, additive (actor threaded when present; undefined when absent — backward-safe).

---

## Task 10: AUT-9 — work-generator trigger source (composable, not auto-wired)
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: architect
- Skills: typescript-expert
- Files: src/orchestra/autonomous/work-generator-source.ts, tests/orchestra/autonomous/work-generator-source.test.ts
- Scope: src/orchestra/autonomous/, tests/orchestra/autonomous/

### Description
Sprint 261 built `work-generator.ts` (`generateWorkCandidates`, pure) but nothing emits its candidates. Create a NEW additive module `src/orchestra/autonomous/work-generator-source.ts` exposing `makeWorkGeneratorSource(opts): TriggerSource` — a composable trigger source (matching the existing TriggerSource shape used by the hybrid source in runtime-loop) that, when polled, calls an injected candidate-provider (`generate: () => BacklogEntry[]`, wrapping `generateWorkCandidates`) and yields them as triggers. Do NOT auto-wire it into the live loop (a follow-up + default-off flag adds it to the hybrid source) — this is the composable source only. Fail-safe (generator error → empty, never throw). Reuse `BacklogEntry`/`TriggerSource` types. Backward-safe (new file).

**Kanıt:** `test -f src/orchestra/autonomous/work-generator-source.ts && grep -n "makeWorkGeneratorSource\|TriggerSource\|generate\|BacklogEntry" src/orchestra/autonomous/work-generator-source.ts` → composable work-gen trigger source; targeted test PASS; tsc clean. **Test:** targeted (new file, in-scope) — yields candidates as triggers, generator-error→empty fail-safe.

---

## Task 11: capability-audit bridge — emit an audit event per capability invocation
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: architect
- Skills: typescript-expert
- Files: src/core/capability-audit-bridge.ts, tests/core/capability-audit-bridge.test.ts
- Scope: src/core/, tests/core/

### Description
Capability invocations are not audited. Create a NEW additive module `src/core/capability-audit-bridge.ts` exposing `withAuditedInvocation(handler, emit): CapabilityHandler` — wraps an existing `CapabilityHandler` (import the type from `capability-broker.js`) so each `invoke` emits a structured audit record (capability name, requiredCapability, actor if present, outcome success/error, timestamp) via an INJECTED `emit: (record) => void` (default no-op). The wrapped handler's behavior is otherwise identical (pass-through result, re-throw errors AFTER emitting the error record). Pure wrapper, no direct I/O (emit is injected). Backward-safe (new file). This is the observability seam between the capability broker and the audit log (consumed by the wiring iteration).

**Kanıt:** `test -f src/core/capability-audit-bridge.ts && grep -n "withAuditedInvocation\|CapabilityHandler\|emit\|outcome" src/core/capability-audit-bridge.ts` → audited-invocation wrapper; targeted test PASS; tsc clean. **Test:** targeted (new file, in-scope) — success emits record + returns result, error emits + re-throws, no-op emit safe.

---

## Task 12: Hygiene — green deterministic stale test assertions
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: ci-guardian
- Skills: ci-testing, typescript-expert
- Files: tests/core/error-registry-lint.test.ts, tests/core/provider-bootstrap.test.ts
- Scope: tests/core/

### Description
Reduce the pre-existing false-NO_GO surface by greening DETERMINISTIC stale assertions ONLY (NOT live-env / ollama / readline-timeout flakes). Inspect `tests/core/error-registry-lint.test.ts` (allow-listed violation count drift — update the expected count to match the current registry if it has legitimately changed, verifying against `scripts/check-error-handling.mjs` output) and `tests/core/provider-bootstrap.test.ts` (any stale provider/model expectation that is deterministic, NOT dependent on a live binary). If a test in these files is failing ONLY due to live-env (requires a real ollama/provider binary), leave it and note it — do NOT fake it. Correct ONLY stale deterministic assertions; do NOT touch any source file. If a file is already fully green, say so in `.result` (no change needed).

**Kanıt:** `npx vitest run tests/core/error-registry-lint.test.ts tests/core/provider-bootstrap.test.ts` → PASS (or remaining failures documented as live-env, not staleness); tsc clean. **Test:** these targeted suites green or live-env-documented (assertions only; no source change).

---

## Task 13: Doc — Enterprise Integrations reference (SSO/SIEM/compliance/ERP)
- Provider: gemini
- Model: gemini-2.5-pro
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/reference/enterprise-integrations.md
- Scope: docs/reference/

### Description
Create `docs/reference/enterprise-integrations.md` — the integrations companion to `enterprise-foundation.md` + `enterprise-depth.md`. Document, with code anchors (read the source; no marketing fluff): (1) **SSO/OIDC** — `auth-oidc.ts` `verifyJwt` (HS256/RS256, claim validation, alg:none rejection) + `auth-session.ts` session lifecycle; (2) **SIEM forwarding** — `siem-forwarder.ts` pluggable transport + batching + fail-safe, default-off; (3) **Compliance reporting** — `compliance-report.ts` controls checklist + audit-chain integrity; (4) **Audit retention** — `audit-retention.ts` age/count rotation + chain-contiguity invariant; (5) **ERP/DB read-only** — `erp-connector.ts` structured read-only query + entity allow-list + `capability-handlers-data.ts` db.read/mail.read handlers; (6) **Capability audit** — `capability-audit-bridge.ts` per-invocation audit. Note every integration is opt-in / injected-transport / default-off. DOC-ONLY (no test/tsc).

**Kanıt:** `test -f docs/reference/enterprise-integrations.md && grep -ci "oidc\|siem\|compliance\|erp\|retention\|capability" docs/reference/enterprise-integrations.md`. **Test:** yok (doc-only).

---

**Beklenen:** 13 task, enterprise-grade, claude-ağırlıklı (11 claude [2 opus: T1/T7 + 9 sonnet] + 1 codex [T6] + 1 gemini-doc [T13]). Enterprise INTEGRATION katmanı (ENT-5 SSO/OIDC+session+SIEM+compliance, ERP-1 read-only, data-handlers) + autonomous-close (T8 LIVE cron-bug-fix, T10 work-gen source) + 2 additive seam (T9 actor-plumbing, T11 capability-audit). **SSOT korundu** — role→cap/budget-min/strict-tenant YENİDEN tanımlanmadı (duplicate task'lar elendi). Her dosya TEK-yazıcı, tümü additive/opt-in/default-off. Worker'lar `.result` YAZAR. CC her task'ı verify eder (T8 live-cron ekstra titizlikle). **Sonraki iterasyon = WIRING/consume oturumu (CC):** biriken seam'leri (actor→spawn RBAC consult, policy-engine→decision, capability-broker→spawn-context+audit, work-gen-source→loop) live path'e bağla — ERTELENMEYECEK.
