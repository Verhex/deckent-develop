# DIRECTIVES — Sprint 261: Contract-Enforced — turn the ExecutionRequest envelope into real enforcement + finish the autonomous engine (claude-weighted, 16 tasks)

## Goal: Sprint 260 made the WM-1 universal `ExecutionRequest` envelope fields LIVE-carried. This sprint moves from **contract-aware → contract-enforced**: the built-but-dormant enforcement surfaces (RBAC zero-caller, ExecutionPool uncalled, observer attach-only, recurring-backlog one-shot, capability registry flat-map, tenant filter non-strict) become real, consumable enforcement — PLUS a unified policy engine, real capability handlers, a work-generator, and the autonomous execution-chain completion. **NOT MVP — enterprise-level, god-level.** Fleet: **claude-weighted** (14 claude [2 opus + 12 sonnet] + 1 codex breadth + 1 gemini doc). Every code task: `npx tsc --noEmit` clean + run ONLY the TARGETED test file(s) for the touched module(s). Each code-task scope INCLUDES the matching `tests/` dir (so adding a test stays in-scope). **All new behavior is additive / opt-in / default-off / backward-safe — never break existing callers.** Live worker-spawn / eval wiring is deliberately OUT of scope (Brain/CC hand-wires the spawn-path call post-verify); workers create the consumable surface, not the live spawn edit.

## Ortak kurallar
- CODE task → `npx tsc --noEmit` clean + run ONLY the TARGETED test file(s) for the touched module(s) (NOT the full suite — it has unrelated pre-existing failures). Additive / surgical / minimum-diff (Karpathy). Stay in `scope.filesWrite` (which includes the matching `tests/` dir).
- i18n-first: NO hardcoded user-facing strings (`getMessage(key, lang)`). Mechanism modules stay string-free. No tech debt left silent — flag in `.result` notes.
- `.tasks/task-XXX.result` honest selfAssessment (tsc + TARGETED tests). Self-assessment based on TARGETED tests, not the full suite.
- **One writer per file:** every task below owns a UNIQUE primary file. Do NOT edit files outside your `Files:` list.
- ESM: `.js` import extensions mandatory (Node16). ADR-008: `core/` does not import from `orchestra/nervous`; consumers import from `core/`. ADR-010: no new runtime dependency — hand-roll (use `node:crypto` etc.).

---

## Task 1: F10-001 — unified policy engine (compose RBAC + activation + condition)
- Provider: claude
- Model: opus
- Backend: docker
- Effort: high
- Agent: architect
- Skills: typescript-expert, system-architect
- Files: src/core/policy-engine.ts, tests/core/policy-engine.test.ts
- Scope: src/core/, tests/core/

### Description
Today three decision surfaces are separate: `src/core/rbac.ts` (`can()` / PERMISSION_MATRIX), `src/core/activation-engine.ts` (task-DNA activation scoring), `src/core/condition-evaluator.ts` (`evaluateCondition`). Create a NEW additive module `src/core/policy-engine.ts` exposing `evaluatePolicy(input): PolicyDecision` that COMPOSES the three existing layers into one declarative decision surface returning `{ decision: 'permit' | 'deny' | 'park' | 'suggest'; reasons: string[]; layers: {...} }`. It must DELEGATE to the existing functions (import `can` from rbac.js, `evaluateCondition` from condition-evaluator.js, and the activation scorer) — do NOT reimplement their logic. Pure function, no side effects, no I/O. This is create-only: nothing wires it into the live path yet (a follow-up wires it). Backward-safe by construction (new file, zero existing callers). Enterprise-grade, extensible (the decision union + reasons array is the contract).

**Kanıt:** `test -f src/core/policy-engine.ts && grep -n "evaluatePolicy\|PolicyDecision\|permit\|deny\|park" src/core/policy-engine.ts` → composed decision surface delegating to rbac/activation/condition; targeted test PASS; tsc clean. **Test:** targeted (new policy-engine.test.ts, in-scope) — permit/deny/park paths + delegation.

---

## Task 2: ENT-1 / ADR-037 V2 — `authorizeExecution(req)` bridge in the authority matrix
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: security-auditor
- Skills: security-specialist, typescript-expert
- Files: src/nervous/authority-matrix.ts, tests/nervous/authority-matrix.test.ts
- Scope: src/nervous/, tests/nervous/

### Description
`checkWorkerAuthority` (already real: role→capability map + `enforce_rbac` soft/hard gate, Sprint 260) has ZERO callers because nothing bridges the `ExecutionRequest` contract to it. Add `authorizeExecution(req: Pick<ExecutionRequest, 'actor' | 'requirements'>, opts?: { enforceRbac?: boolean }): { allowed: boolean; violations: string[]; enforced: boolean }` to `src/nervous/authority-matrix.ts` — it extracts `req.actor?.role` (absent/unknown → permissive allow-all, backward-safe) and the requested capabilities (from `req.requirements?.capabilities`), runs them through the EXISTING `checkWorkerAuthority` logic, and returns a structured result. Soft by default (warn+emit, `allowed:true`); only when `enforceRbac === true` (mirror of the `enforce_rbac` config flag, read defensively as the existing code does) does a role-denied capability set `allowed:false`. Import `ExecutionRequest` type from `core/work-model.js` (nervous→core is ADR-008-legal). Do NOT edit any spawn-path file — this is the consumable bridge only; Brain hand-wires the spawn call post-verify.

**Kanıt:** `grep -n "authorizeExecution\|actor\|enforce_rbac\|checkWorkerAuthority" src/nervous/authority-matrix.ts` → contract-bridge present, permissive default, enforce_rbac-gated hard path; targeted test PASS; tsc clean. **Test:** targeted, additive (permissive-default + denied-under-enforce + unknown-role-allow).

---

## Task 3: ENT-3 — tamper-evident audit hash-chain (additive field)
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: security-auditor
- Skills: security-specialist, typescript-expert
- Files: src/core/audit-writer.ts, tests/core/audit-writer.test.ts
- Scope: src/core/, tests/core/

### Description
The audit event sink (`src/core/audit-writer.ts`, `writeAuditEvent`) is durable + append-only but NOT tamper-evident. Add an optional hash-chain: each written `AuditEvent` carries `prevHmac` + `hmac` where `hmac = sha256(prevHmac + canonicalJSON(payload))` (use `node:crypto`, ADR-010 — no new dep). Maintain the running `prevHmac` across writes (module-level chain head, seeded from a genesis constant). The chain fields are ADDITIVE/OPTIONAL on `AuditEvent` (absent on old records → backward-safe; never throw on a missing/!verifiable prior). Add a `verifyAuditChain(events: AuditEvent[]): { intact: boolean; brokenAt?: number }` helper. Keep it pure + deterministic for testing (allow the chain head to be reset/injected in tests). Do NOT change the write channel/contract shape destructively.

**Kanıt:** `grep -n "hmac\|sha256\|verifyAuditChain\|createHash" src/core/audit-writer.ts` → hash-chain + verifier present, additive; targeted test PASS; tsc clean. **Test:** targeted, additive (chain links, tamper-detection breaks `intact`, missing-prev backward-safe).

---

## Task 4: ENT-2 — strict tenant isolation flag (omit NULL-tenant leak)
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: refactorer
- Skills: typescript-expert
- Files: src/core/memory-store.ts, src/core/config-types.ts, src/core/config.ts, tests/core/memory-store.test.ts
- Scope: src/core/, tests/core/

### Description
`memory-store.ts` tenant queries currently filter `WHERE (tenant_id = ? OR tenant_id IS NULL)` — they intentionally INCLUDE global NULL-tenant rows (backward-compat) which violates strict multi-tenant isolation. Add a NEW typed config flag `strict_tenant_isolation?: boolean` (default `false`) to BOTH config interfaces in `src/core/config-types.ts` (mirror the `pre_sprint_tests` pattern — it appears in two interfaces) and its default in `src/core/config.ts`. When the store is constructed/queried with strict isolation enabled, OMIT the `OR tenant_id IS NULL` clause so a tenant sees ONLY its own rows. Default (flag false / absent) preserves today's permissive behavior exactly. This is the ONLY task that edits `config-types.ts` / `config.ts`. Add a WARNING doc-comment at the query sites explaining the NULL-tenant-leak the flag closes.

**Kanıt:** `grep -n "strict_tenant_isolation\|tenant_id IS NULL\|tenant_id = ?" src/core/memory-store.ts && grep -n "strict_tenant_isolation" src/core/config-types.ts src/core/config.ts` → flag threaded, strict path omits NULL; targeted memory-store test PASS; tsc clean. **Test:** targeted, additive (default includes NULL rows; strict excludes them).

---

## Task 5: F8-002 — multi-backend capability selection (availability/priority)
- Provider: claude
- Model: opus
- Backend: docker
- Effort: high
- Agent: architect
- Skills: typescript-expert, system-architect
- Files: src/core/capability-broker.ts, tests/core/capability-broker.test.ts
- Scope: src/core/, tests/core/

### Description
`CapabilityRegistry` is a flat one-handler-per-name map. Extend it (additively, backward-safe) so a capability can have MULTIPLE registered backends and selection picks one by availability + priority: `registerCapability(name, handler, opts?: { priority?: number; isAvailable?: () => boolean })` keeps the single-handler call working (default priority 0, always-available), and when several handlers exist for a name, `resolve`/`invokeCapability` picks the highest-priority AVAILABLE one (skip handlers whose `isAvailable()` returns false). Add `listBackends(name): string[]` for introspection. Existing callers (`echoHandler`, `fsReadHandler`, `invokeFromRequest`, the per-agent `grantedCapabilities` gate) MUST keep working unchanged. This file is owned ONLY by this task — Task 6's new handlers self-register via their own installer, they do NOT edit this file.

**Kanıt:** `grep -n "priority\|isAvailable\|listBackends\|registerCapability" src/core/capability-broker.ts` → multi-backend selection, backward-safe single-handler default; targeted test PASS; tsc clean. **Test:** targeted, additive (single-handler unchanged; multi-backend picks highest available; unavailable skipped).

---

## Task 6: F8 — real capability handlers (http / env / shell-gated)
- Provider: codex
- Model: gpt-5
- Backend: docker
- ModelEffort: high
- Effort: normal
- Agent: refactorer
- Skills: typescript-expert
- Files: src/core/capability-handlers.ts, tests/core/capability-handlers.test.ts
- Scope: src/core/, tests/core/

### Description
Only `echoHandler` + `fsReadHandler` exist. Create a NEW additive module `src/core/capability-handlers.ts` shipping real reference handlers implementing the EXISTING `CapabilityHandler` interface (import the type from `capability-broker.js` — do NOT edit capability-broker.ts): `httpGetHandler` (HTTP GET via `node:https`/fetch, returns status+body, declares `requiredCapability: 'net.read'`), `envReadHandler` (reads an allow-listed env var, `requiredCapability: 'env.read'`), and `shellExecHandler` (runs a command via async `spawn` — NEVER `spawnSync`, ADR/CI rule — gated behind `requiredCapability: 'shell.exec'`, least-privilege). Export `installExtendedHandlers(registry: CapabilityRegistry): void` so a caller registers them WITHOUT editing the broker. Each handler declares its `requiredCapability` so the existing least-privilege gate applies. Hermetic tests (no real network/shell — inject a fake fetch/spawn or test the registration + requiredCapability wiring + arg validation).

**Kanıt:** `test -f src/core/capability-handlers.ts && grep -n "httpGetHandler\|envReadHandler\|shellExecHandler\|installExtendedHandlers\|requiredCapability" src/core/capability-handlers.ts` → handlers + installer, least-privilege declared, async spawn; targeted test PASS; tsc clean. **Test:** targeted (new file, in-scope), hermetic.

---

## Task 7: AUT-5 — recurring backlog re-enqueue (true cron cadence)
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert
- Files: src/orchestra/autonomous/backlog.ts, tests/orchestra/autonomous/backlog.test.ts
- Scope: src/orchestra/autonomous/, tests/orchestra/autonomous/

### Description
Recurring backlog entries (`trigger.type === 'recurring'` with a cron field, see `backlog-types.ts`) are one-shot today: `queryDue()` excludes them and once a recurring entry reaches `done` it stays done forever — there is NO re-enqueue. Add `reenqueueRecurring(bl: BacklogFile, now: Date): BacklogFile` (and/or extend `updateStatus`) so that when a recurring entry completes, it is reset to `pending` with an updated `lastRun`/next-due bookkeeping, so it fires again on its next cron cadence. Reuse the existing cron evaluator (`nextRun`) — do NOT hand-roll cron again. Surgical in `backlog.ts` (owned only by this task). Non-recurring (one-off) entries are untouched. Fail-safe (malformed cron → leave entry done, log, never throw).

**Kanıt:** `grep -n "reenqueueRecurring\|recurring\|lastRun\|nextRun\|pending" src/orchestra/autonomous/backlog.ts` → recurring re-enqueue present; targeted backlog test PASS; tsc clean. **Test:** targeted, additive (recurring resets to pending w/ updated lastRun; one-off stays done; malformed cron safe).

---

## Task 8: AUT-7 — wire the ExecutionPool into the dispatcher (bounded concurrency)
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: architect
- Skills: typescript-expert
- Files: src/orchestra/autonomous/execute-dispatcher.ts, src/orchestra/autonomous/execution-pool.ts, tests/orchestra/autonomous/execute-dispatcher.test.ts
- Scope: src/orchestra/autonomous/, tests/orchestra/autonomous/

### Description
`execution-pool.ts` exports `makeSerialPool()` + an `ExecutionPool` interface but NOTHING calls it — autonomous execution is serial-only and the pool is dead code. (1) In `execution-pool.ts` add `makeBoundedPool(maxConcurrency: number): ExecutionPool` (a real bounded-concurrency pool — N in-flight, queue the rest; hand-rolled, no new dep) alongside the existing serial pool. (2) In `execute-dispatcher.ts` accept an OPTIONAL `pool?: ExecutionPool` in its deps and route launches through `pool.submit(...)` when provided, falling back to today's direct/serial behavior when absent (backward-safe — existing callers that pass no pool are unchanged). Default concurrency, when a pool is constructed, comes from existing config (`max_workers`) or a small constant — do NOT add a new config field. These two files are owned ONLY by this task.

**Kanıt:** `grep -n "makeBoundedPool\|maxConcurrency\|pool.submit\|ExecutionPool" src/orchestra/autonomous/execution-pool.ts src/orchestra/autonomous/execute-dispatcher.ts` → bounded pool + dispatcher wire, optional/backward-safe; targeted test PASS; tsc clean. **Test:** targeted, additive (bounded pool caps in-flight; dispatcher uses pool when given, serial fallback when not).

---

## Task 9: AUT-1 — actually drive the nervous observer in the autonomous loop
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: architect
- Skills: typescript-expert
- Files: src/orchestra/autonomous-runtime.ts, tests/orchestra/autonomous-runtime.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
The autonomous loop defines a `NervousObserverDep` and CALLS `nervousObserver.tick()` in its cycle, but `buildEngineRuntime` / `buildAutonomousRuntime` NEVER set `nervousObserver` in the composed deps — so the wire from Sprint 260 (AUT-1) is attach-only and no observation flows during an autonomous run. Construct a real (or thin adapter) `NervousObserverDep` inside `buildEngineRuntime` and pass it into the composed deps so `tick()` actually fires during the loop. Reuse the existing observer/detector-registry APIs — do NOT reimplement detection. **Fail-safe is mandatory:** any observer error must be caught and MUST NOT break the autonomous loop (wrap `tick()` in try/catch, log, continue). Surgical in `autonomous-runtime.ts` (owned only by this task). Default behavior when no observer is available stays unchanged.

**Kanıt:** `grep -n "nervousObserver\|tick\|buildEngineRuntime\|try" src/orchestra/autonomous-runtime.ts` → observer constructed + passed into deps, tick fail-safe; targeted test PASS; tsc clean. **Test:** targeted, additive (observer tick fires in cycle; throwing observer does NOT break the loop).

---

## Task 10: AUT-9 — proactive work-generator (backlog candidate generation)
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: architect
- Skills: typescript-expert
- Files: src/orchestra/autonomous/work-generator.ts, tests/orchestra/autonomous/work-generator.test.ts
- Scope: src/orchestra/autonomous/, tests/orchestra/autonomous/

### Description
The only work-creation path is `reactive-ingester` (detector events → backlog). There is NO proactive generator. Create a NEW additive module `src/orchestra/autonomous/work-generator.ts` exposing `generateWorkCandidates(input): BacklogEntry[]` (use the EXISTING `BacklogEntry` shape from `backlog-types.js`) that produces candidate work items from simple, deterministic heuristics: (a) open tech-debt entries (accept a provided list of debt records — do NOT couple to a live DB here; take them as input for testability), and (b) `TODO`/`FIXME` markers (accept a provided list of `{file, line, text}` — caller scans; this module just maps to candidates). Pure function, returns candidates, does NOT auto-enqueue or touch the live loop (a follow-up wires it). Each candidate has a stable id, title, priority, and a `source` tag. Backward-safe by construction (new file, zero callers).

**Kanıt:** `test -f src/orchestra/autonomous/work-generator.ts && grep -n "generateWorkCandidates\|BacklogEntry\|TODO\|debt\|source" src/orchestra/autonomous/work-generator.ts` → pure candidate generator from debt + TODO inputs; targeted test PASS; tsc clean. **Test:** targeted (new file, in-scope) — debt→candidate, TODO→candidate, empty input→[].

---

## Task 11: AUT cleanup — consolidate the duplicate scheduled-flow cron evaluator
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: low
- Agent: refactorer
- Skills: typescript-expert, code-simplifier
- Files: src/orchestra/autonomous/scheduled-flow.ts, tests/orchestra/autonomous/scheduled-flow.test.ts
- Scope: src/orchestra/autonomous/, tests/orchestra/autonomous/

### Description
There are TWO cron `nextRun` evaluators: the live one in `src/core/scheduled-flow.ts` (used by `FlowScheduler` / `trigger-adapter`) and a parallel full-5-field copy in `src/orchestra/autonomous/scheduled-flow.ts` that is computed but UNUSED (orphaned duplicate). Resolve the divergence WITHOUT regressing behavior: make `src/orchestra/autonomous/scheduled-flow.ts` re-export / delegate to the canonical `core/scheduled-flow.js` `nextRun` (so there is one implementation), preserving the module's existing public export names so any importer still resolves. If the core version is missing a field the orphan supported, port that capability INTO core first (one source of truth) — but keep it surgical. Add/keep a targeted test asserting the autonomous module's `nextRun` matches core's behavior. DRY/YAGNI cleanup; no behavior regression.

**Kanıt:** `grep -n "scheduled-flow\|nextRun\|export" src/orchestra/autonomous/scheduled-flow.ts` → single source (delegates/re-exports core), no duplicate logic; targeted test PASS; tsc clean. **Test:** targeted (autonomous nextRun == core nextRun for representative cron exprs).

---

## Task 12: budget — cost-gate honors `maxTokens` (deepen Sprint 260 maxUsd)
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: api-builder
- Skills: typescript-expert
- Files: src/core/cost-gate.ts, tests/core/cost-gate.test.ts
- Scope: src/core/, tests/core/

### Description
Sprint 260 made `evaluateCostGate` honor `ExecutionRequest.budget.maxUsd` as a per-request ceiling. Extend it (additively) to ALSO honor `budget.maxTokens`: when a request carries `budget.maxTokens`, the gate blocks/flags when the estimated token count exceeds it (in addition to maxUsd + the config sprint budget), and returns a STRUCTURED over-budget reason distinguishing which ceiling tripped (`usd` vs `tokens` vs `sprint`). Backward-safe: no budget → today's behavior exactly; maxUsd-only → unchanged. Reuse the existing estimate path — do NOT add a new estimator. Surgical in `cost-gate.ts` (owned only by this task).

**Kanıt:** `grep -n "maxTokens\|maxUsd\|budget\|reason" src/core/cost-gate.ts` → per-request token ceiling honored + structured reason; targeted cost-gate test PASS; tsc clean. **Test:** targeted, additive (over-token blocks; under passes; reason names the tripped ceiling; no-budget unchanged).

---

## Task 13: WM — `InteractionMode` consumer (interactive/batch/streaming policy)
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: refactorer
- Skills: typescript-expert
- Files: src/core/interaction-policy.ts, tests/core/interaction-policy.test.ts
- Scope: src/core/, tests/core/

### Description
`ExecutionRequest.mode: InteractionMode ('batch' | 'interactive' | 'streaming')` is carried but has NO consumer. Create a NEW additive module `src/core/interaction-policy.ts` exposing `resolveInteractionPolicy(mode?: InteractionMode): InteractionPolicy` where `InteractionPolicy = { autoApproveDefault: boolean; promptUser: boolean; streamOutput: boolean }`: `batch` → non-interactive (autoApproveDefault true for safe ops, promptUser false, no stream), `interactive` → promptUser true / autoApproveDefault false, `streaming` → like interactive + streamOutput true. Absent/unknown mode → a safe conservative default (treat as interactive: promptUser true). Pure function, imports ONLY the `InteractionMode` type from `core/work-model.js`. This is the consumable policy mapping; wiring it into chat/REPL is a follow-up. Backward-safe (new file, zero callers).

**Kanıt:** `test -f src/core/interaction-policy.ts && grep -n "resolveInteractionPolicy\|InteractionMode\|autoApproveDefault\|streamOutput" src/core/interaction-policy.ts` → mode→policy mapping; targeted test PASS; tsc clean. **Test:** targeted (new file, in-scope) — each mode + absent-mode default.

---

## Task 14: Hygiene — green stale model-id test assertions (gpt-5 → gpt-5.5 drift)
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: ci-guardian
- Skills: ci-testing, typescript-expert
- Files: tests/core/model-types.test.ts, tests/orchestra/model-selector-provider.test.ts
- Scope: tests/core/, tests/orchestra/

### Description
Some pre-existing test failures are STALE assertions (registry drift), not real bugs: residual `gpt-5` apiId/model expectations that should reflect the current registry (`gpt-5.5` apiId). Sprint 260-014 fixed part of `model-types.test.ts` / `model-selector-provider.test.ts`; correct the REMAINING stale expectations in these two files so the registry's current correct values pass (verify against `src/core/model-types.ts` / the model registry — read source, do NOT change source). Only correct stale assertions; do NOT touch any source file or any test outside these two. This greens part of the suite + shrinks the CODE-FULLSUITE-NOGO false-NO_GO surface.

**Kanıt:** `npx vitest run tests/core/model-types.test.ts tests/orchestra/model-selector-provider.test.ts` → PASS; tsc clean. **Test:** these two targeted suites green (assertions only; no source change).

---

## Task 15: Doc — Enterprise-Depth reference (enforcement + secret vault + capability handlers)
- Provider: gemini
- Model: gemini-2.5-pro
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/reference/enterprise-depth.md
- Scope: docs/reference/

### Description
Create `docs/reference/enterprise-depth.md` — the enforcement-layer companion to `enterprise-foundation.md`. Document, with config flags and code anchors (read the source; no marketing fluff): (1) the **policy engine** (`policy-engine.ts`, unified permit/deny/park/suggest) and the three layers it composes (rbac / activation-engine / condition-evaluator); (2) **RBAC enforcement** — `authorizeExecution` + the `enforce_rbac` flag (soft warn vs hard block, ADR-037 V2); (3) **audit hash-chain** (`audit-writer.ts` HMAC chain + `verifyAuditChain`); (4) **strict tenant isolation** (`strict_tenant_isolation` flag, the NULL-tenant leak it closes); (5) **capability broker** — multi-backend selection + the real handlers (http/env/shell) + per-agent least-privilege grants; (6) the **secret vault** that ALREADY EXISTS and is currently undocumented: `$DECK:NAME` interpolation syntax (`deck-interpolation.ts`), AES-256-GCM master key in `~/.deckent/.keyring` (`credential-encryption.ts`), `.deck` gitignored storage (ADR-016) — make this discoverable. Note all enforcement is opt-in / default-off. DOC-ONLY (no test/tsc).

**Kanıt:** `test -f docs/reference/enterprise-depth.md && grep -ci "policy\|rbac\|tenant\|hmac\|DECK\|capability" docs/reference/enterprise-depth.md`. **Test:** yok (doc-only).

---

## Task 16: ENT-3 — audit query/lineage surface (read-only)
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: architect
- Skills: typescript-expert
- Files: src/core/audit-query.ts, tests/core/audit-query.test.ts
- Scope: src/core/, tests/core/

### Description
Audit events carry `correlationId` + `causationId` but there is no way to QUERY lineage. Create a NEW additive module `src/core/audit-query.ts` exposing pure, read-only query helpers over a provided list of audit events (take `AuditEvent[]` as input — do NOT couple to the live sink/DB, for testability; import the EXISTING `AuditEvent` type from `audit-writer.js` using only fields present today): `filterByCorrelation(events, correlationId)`, `filterByCausation(events, causationId)`, `buildCausalChain(events, rootCorrelationId)` (returns the ordered lineage of events sharing a correlation group, linked by causation), and `groupByActor(events)`. Pure functions, no I/O. Backward-safe by construction (new file). This is the consume-side of ENT-3 lineage (SOC2/ISO traceability).

**Kanıt:** `test -f src/core/audit-query.ts && grep -n "filterByCorrelation\|buildCausalChain\|causationId\|groupByActor" src/core/audit-query.ts` → lineage query surface; targeted test PASS; tsc clean. **Test:** targeted (new file, in-scope) — correlation filter, causal-chain order, actor grouping, empty input safe.

---

**Beklenen:** 16 task, enterprise-grade, claude-ağırlıklı (14 claude [2 opus: T1/T5 + 12 sonnet] + 1 codex [T6] + 1 gemini-doc [T15]). Contract-aware → contract-enforced: dormant enforcement yüzeyleri (RBAC bridge, ExecutionPool wire, observer drive, recurring re-enqueue, multi-backend caps, strict tenant, audit hash-chain + lineage) gerçek/tüketilebilir hale gelir + unified policy-engine + gerçek capability handler'lar + work-generator + scheduled-flow dedup. Her dosya TEK-yazıcı (çakışma yok). Tüm yeni davranış additive/opt-in/default-off (backward-safe). Live spawn/eval wire BİLİNÇLİ kapsam-dışı (CC verify sonrası elle bağlar). CC sprint-sonu her task'ı verify eder (disk + tsc + targeted + diff). Döngü: bu sprint'ten sonra → live spawn-path RBAC/policy wire (CC) + sonraki batch.
