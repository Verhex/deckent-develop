# DIRECTIVES — Sprint: Enterprise Foundation — consume the WM-1 universal contract (claude-weighted, 16 tasks)

## Goal: A comprehensive, enterprise-grade sprint that makes the WM-1 universal `ExecutionRequest` contract's envelope fields LIVE — wiring RBAC (actor), multi-tenancy (tenantId), audit lineage (correlation/causation), governance (riskClass), capability-broker (capabilityTarget), and cost-control (budget) into real consumers — plus autonomous-engine completion, WM-7 enrichments, and hygiene. **NOT MVP — enterprise-level, god-level work.** Fleet: **claude-weighted** (Anthropic carries the code; 1 codex + 1 gemini for breadth). Each code task: tsc clean + TARGETED tests; scope INCLUDES the matching `tests/` dir so adding a test stays in-scope (fixes the BOUNDARY-TEST-PATTERN finding).

## Ortak kurallar
- CODE task → `npx tsc --noEmit` clean + run ONLY the TARGETED test file(s) for the touched module(s) (NOT the full suite — it has unrelated pre-existing failures). Additive / surgical / minimum-diff (Karpathy). Stay in `scope.filesWrite` (which includes the matching `tests/` dir).
- i18n-first: NO hardcoded user-facing strings (`getMessage(key,lang)`). No tech debt left silent — flag in `.result` notes.
- `.tasks/task-XXX.result` honest selfAssessment (tsc + TARGETED tests). Self-assessment based on TARGETED tests, not the full suite.

---

## Task 1: ENT-1 — actor.role → worker authority (ADR-037 V2 step)
- Provider: claude
- Model: opus
- Backend: docker
- Effort: high
- Agent: security-auditor
- Skills: security-specialist, typescript-expert
- Files: src/nervous/authority-matrix.ts, tests/nervous/authority-matrix.test.ts
- Scope: src/nervous/, tests/nervous/

### Description
ADR-037 RBAC is V1.0 (advisory: `checkWorkerAuthority` returns true, enforcement NO_OP). Take a real V2 step: make `checkWorkerAuthority` (or the authority-matrix enforcement entry) consult the `ExecutionRequest.actor.role` (now carried on the contract) so a worker's allowed operations derive from its actor role, with a permissive default (unknown/absent actor → current allow-all behavior, backward-safe). Define a minimal role→capability allow-map (e.g. roles: admin, engineer, viewer). Keep enforcement soft (warn+emit) unless a new `enforce_rbac` config flag (default false) is set — do NOT hard-block by default. Surgical + backward-compatible.

**Kanıt:** `grep -n "actor\|role\|checkWorkerAuthority\|enforce_rbac" src/nervous/authority-matrix.ts` → role-aware; targeted test PASS; tsc clean. **Test:** targeted (authority-matrix), additive.

---

## Task 2: ENT-2 — tenantId threading (replace hardcoded 'local')
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: high
- Agent: refactorer
- Skills: typescript-expert
- Files: src/core/memory-store.ts, src/core/memory-types.ts
- Scope: src/core/, tests/core/

### Description
Multi-tenancy (ENT-2): the memory store + related sites hardcode `tenantId: 'local'`. Make `tenantId` a first-class, threaded value: add an optional `tenantId` param to the MemoryStore write/query API (default 'local' for backward-compat), so a tenant-scoped caller (carrying `ExecutionRequest.actor.tenantId`) isolates its rows. Do NOT change the on-disk schema destructively — additive column/param with 'local' default. Keep all existing callers working (default 'local'). Surgical.

**Kanıt:** `grep -n "tenantId" src/core/memory-store.ts` → threaded param (not only hardcoded 'local'); targeted memory-store test PASS; tsc clean. **Test:** targeted, additive.

---

## Task 3: ENT-3 — correlationId / causationId audit lineage
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: architect
- Skills: typescript-expert
- Files: src/orchestra/event-stream.ts, tests/orchestra/event-stream.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies:

### Description
Audit lineage (ENT-3, SOC2/ISO-grade traceability): thread `correlationId` + `causationId` (now on the `ExecutionRequest` contract) through the structured event stream so emitted events carry the lineage (which request caused this, which correlation group). Add the two optional fields to the event payload + a helper to propagate them. Backward-safe (absent → undefined). Surgical in event-stream.ts.

**Kanıt:** `grep -n "correlationId\|causationId" src/orchestra/event-stream.ts` → propagated; targeted event-stream test PASS; tsc clean. **Test:** targeted, additive.

---

## Task 4: WM-6 / F10-002 — riskClass → risk-gated approval
- Provider: claude
- Model: opus
- Backend: docker
- Effort: high
- Agent: security-auditor
- Skills: security-specialist, typescript-expert
- Files: src/nervous/decision-engine.ts, tests/nervous/decision-engine.test.ts
- Scope: src/nervous/, tests/nervous/

### Description
Governance (F10-002 + WM-6): consume `resolveRiskClass(req)` (core/work-model.ts — derives low/medium/high from capabilities + capabilityTarget) in the nervous decision-engine so that a HIGH-risk operation (shell / erp-write / db-write / mail.send / filesystem.delete) is routed to the mandatory-approval / park path instead of auto-executing. Add a config flag `risk_gate_enabled` (default false — opt-in, backward-safe). When enabled + risk==='high', the decision parks for approval. Surgical; reuse `resolveRiskClass`.

**Kanıt:** `grep -n "resolveRiskClass\|riskClass\|risk_gate\|approval" src/nervous/decision-engine.ts` → risk-gate wired; targeted decision-engine test PASS; tsc clean. **Test:** targeted, additive.

---

## Task 5: budget → pre-spawn cost-gate enforcement
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: api-builder
- Skills: typescript-expert
- Files: src/core/cost-gate.ts, tests/core/cost-gate.test.ts
- Scope: src/core/, tests/core/

### Description
Cost-control: consume `ExecutionRequest.budget` ({maxUsd?, maxTokens?}) in the cost-gate — when a request carries a budget, `evaluateCostGate` should treat `budget.maxUsd` as the per-request ceiling (in addition to the config sprint budget) and block/flag when the estimate exceeds it. Backward-safe (no budget → current behavior). Surgical in cost-gate.ts.

**Kanıt:** `grep -n "budget\|maxUsd" src/core/cost-gate.ts` → per-request budget honored; targeted cost-gate test PASS; tsc clean. **Test:** targeted, additive.

---

## Task 6: F8-001 — capability.invoke abstraction (capabilityTarget consumer)
- Provider: claude
- Model: opus
- Backend: docker
- Effort: high
- Agent: architect
- Skills: typescript-expert, system-architect
- Files: src/core/capability-broker.ts, tests/core/capability-broker.test.ts
- Scope: src/core/, tests/core/

### Description
Capability broker foundation (F8-001): create `src/core/capability-broker.ts` exposing `invokeCapability(target: CapabilityTarget, ctx)` that resolves a `CapabilityTarget` ({capability, args, connector}) to one of N registered backends via a capability registry (`registerCapability(name, handler)`). Ship a registry + 1-2 reference handlers (e.g. a no-op/echo + a fs-read stub) to prove the pattern. This is the consumer of the `ExecutionRequest.capabilityTarget` field for non-code work (mail/erp/db). Pure where possible; least-privilege (capability declares required Capability). Enterprise-grade, extensible.

**Kanıt:** `test -f src/core/capability-broker.ts && grep -n "invokeCapability\|registerCapability\|CapabilityTarget" src/core/capability-broker.ts`; targeted test PASS; tsc clean. **Test:** targeted (new capability-broker.test.ts allowed — it tests the new module, in-scope).

---

## Task 7: AUT-4 — nextRun() full cron evaluation
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert
- Files: src/orchestra/autonomous/scheduled-flow.ts, tests/orchestra/autonomous/scheduled-flow.test.ts
- Scope: src/orchestra/autonomous/, tests/orchestra/autonomous/

### Description
AUT-4: `nextRun()` currently honors only the minute field of a cron expression. Implement full 5-field cron evaluation (minute, hour, day-of-month, month, day-of-week) with `*`, ranges, lists, and steps — no new runtime dependency (ADR-010; hand-roll). Surgical in the scheduled-flow module (find the `nextRun` implementation). Enterprise-grade correctness.

**Kanıt:** `grep -n "nextRun\|cron\|day-of-week\|step" src/orchestra/autonomous/scheduled-flow.ts` → full cron; targeted test PASS; tsc clean. **Test:** targeted, additive.

---

## Task 8: AUT-6 — backlog done/failed purge + autonomous artifact cleanup
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert
- Files: src/orchestra/autonomous/backlog.ts, tests/orchestra/autonomous/backlog.test.ts
- Scope: src/orchestra/autonomous/, tests/orchestra/autonomous/

### Description
AUT-6: done/failed backlog entries are never purged, and autonomous task-artifacts (stray `task-run-*` files + leftover launch `.pid` bookkeeping in `.tasks/`) accumulate. Add a `purgeCompletedBacklog()` (remove/archive done+failed entries older than N runs) + an artifact-cleanup pass that removes stale `task-run-*` + `_*.pid` artifacts after a run. Surgical in the backlog/autonomous-runtime module. (Resolves the PID-1 finding for the autonomous path.)

**Kanıt:** `grep -n "purge\|cleanup\|task-run\|\.pid" src/orchestra/autonomous/backlog.ts` → purge+cleanup; targeted test PASS; tsc clean. **Test:** targeted, additive.

---

## Task 9: AUT-8 — deckent_autonomous* MCP tool parity
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: high
- Agent: api-builder
- Skills: anthropic-sdk, typescript-expert
- Files: src/mcp/tools/autonomous.ts, tests/mcp/tools/autonomous.test.ts
- Scope: src/mcp/tools/, tests/mcp/tools/

### Description
AUT-8: there is no MCP control surface for the autonomous engine. Add a `deckent_autonomous` MCP tool (new `src/mcp/tools/autonomous.ts`) exposing status + start/stop + backlog-add (mirroring the CLI autonomous commands), registered like the other MCP tools. Reuse the existing autonomous runtime/backlog APIs — do NOT reimplement logic, just wire the MCP surface. Follow the existing MCP tool pattern (registerTool, zod schema, enrichResponse). Remember to register it in the tool index.

**Kanıt:** `test -f src/mcp/tools/autonomous.ts && grep -n "deckent_autonomous\|registerTool" src/mcp/tools/autonomous.ts`; targeted test PASS; tsc clean. **Test:** targeted (new autonomous.test.ts, in-scope).

---

## Task 10: AUT-1 — drive the nervous observer inside `autonomous start`
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: architect
- Skills: typescript-expert
- Files: src/orchestra/autonomous-runtime.ts, tests/orchestra/autonomous-runtime.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies:

### Description
AUT-1: the nervous observer is attach-only in `autonomous start` — live detections don't flow during an autonomous run. Wire the observer's scan/tick into the autonomous runtime loop so detectors actually fire during autonomous execution (reuse the existing observer/detector-registry APIs; do not reimplement). Fail-safe (observer errors must not break the autonomous loop). Surgical.

**Kanıt:** `grep -n "observer\|detector\|nervous" src/orchestra/autonomous-runtime.ts` → observer driven; targeted test PASS; tsc clean. **Test:** targeted, additive.

---

## Task 11: WM-7 E3 — IDENTITY.md `Language:` feed as stack SSOT
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: refactorer
- Skills: typescript-expert
- Files: src/core/stack-detector.ts, tests/core/stack-detector.test.ts
- Scope: src/core/, tests/core/

### Description
WM-7 E3: let the managed-docs `IDENTITY.md` `Language:` line act as a stack-source OVERRIDE/SSOT for `detectProjectStack` — when present, it takes precedence over heuristic detection (so a project can declare its stack authoritatively). Fall back to live detection when absent. Additive + backward-safe. Surgical in stack-detector.ts.

**Kanıt:** `grep -n "IDENTITY\|Language:" src/core/stack-detector.ts` → IDENTITY feed; targeted stack-detector test PASS; tsc clean. **Test:** targeted, additive.

---

## Task 12: WM-7 — extend AGENT_TEMPLATES to C++/Java/C#/Kotlin/Swift prime agents
- Provider: codex
- Model: gpt-5
- Backend: docker
- ModelEffort: high
- Effort: normal
- Agent: refactorer
- Skills: typescript-expert
- Files: src/orchestra/temp-agent-generator.ts, tests/orchestra/temp-skill-generator.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
WM-7 prime-agent coverage: `AGENT_TEMPLATES` currently covers React/TS/Python/Go/Rust + generic. Add stack-specialized prime-agent templates for C++ (RAII/CMake/GoogleTest), Java (Maven/JUnit5), C# (.NET/xUnit), Kotlin (Gradle/coroutines), Swift (SPM/XCTest) — each with `language`, stackHeading, tagline, bestPractices, antiPatterns, testingHint, triggerKeywords, following the EXISTING template shape exactly. So `generateTempAgents` instantiates the right prime agent for those stacks. Additive (extend the array). Mirror the existing entries' structure precisely.

**Kanıt:** `grep -c "stackHeading" src/orchestra/temp-agent-generator.ts` → +5 templates; targeted temp-skill-generator test PASS; tsc clean. **Test:** targeted, additive.

---

## Task 13: BOUNDARY-TEST-PATTERN — code-task scope auto-includes matching tests/ dir
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert
- Files: src/orchestra/task-builder.ts, tests/orchestra/task-builder.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
Findings (recurring across Sprint 257/259): code-task workers naturally add a test for their fix, but if scope is `src/<mod>/` only, the test edit (`tests/<mod>/`) trips a honest-gate BOUNDARY_VIOLATION → false NO_GO → FIX cycle. Fix: when a task's scope.directories includes a `src/...` path AND the task kind is code-development, auto-add the MIRRORED `tests/...` directory to `scope.directories` (so adding the matching test stays in-scope). Do this in `createTask` / scope normalization in task-builder.ts. Additive, backward-safe (only widens code-task scope to its own tests). Surgical.

**Kanıt:** `grep -n "tests/\|mirrorTestScope\|code-development" src/orchestra/task-builder.ts` → test-dir auto-added for code tasks; targeted task-builder test PASS; tsc clean. **Test:** targeted, additive.

---

## Task 14: Pre-existing test staleness cleanup — gpt-5.5 apiId expectations
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: ci-guardian
- Skills: ci-testing, typescript-expert
- Files: tests/core/model-types.test.ts, tests/orchestra/model-selector-provider.test.ts
- Scope: tests/core/, tests/orchestra/

### Description
Hygiene: several pre-existing test failures are STALE assertions, not real bugs — they expect the old `gpt-5` apiId but the registry now returns `gpt-5.5` (the committed apiId change). Update these existing test expectations (`model-types.test.ts` MODEL_API_IDS / resolveApiModelId; `model-selector-provider.test.ts` forceModel=opus on codex → gpt-5.5) to match the current correct apiId. This is EXISTING-test maintenance (not a new suite) — greens part of the suite + reduces the CODE-FULLSUITE-NOGO false-NO_GO surface. Do NOT change source; only correct the stale assertions.

**Kanıt:** `npx vitest run tests/core/model-types.test.ts tests/orchestra/model-selector-provider.test.ts` → PASS; tsc clean. **Test:** these targeted suites green.

---

## Task 15: F9-001 — wire McpClientBroker into the REPL/chat path
- Provider: claude
- Model: opus
- Backend: docker
- Effort: high
- Agent: api-builder
- Skills: anthropic-sdk, typescript-expert
- Files: src/cli/repl/mcp-bridge.ts
- Scope: src/cli/repl/, tests/cli/repl/

### Description
F9-001: `buildMcpBridge` / `McpClientBroker` has 0 production callers — the built external-MCP-client isn't wired into the live REPL/chat path. Wire it so the REPL can reach external MCP tools (find `buildMcpBridge`; connect it to the REPL tool-dispatch). Trust/approval gate is a separate follow-up (F9-003) — here just establish the live wire behind a default-off `mcp_client_enabled` flag (opt-in, backward-safe; no auto-connect). If the exact file path differs, place the wire where the REPL builds its tool set. Surgical.

**Kanıt:** `grep -rn "buildMcpBridge\|McpClientBroker\|mcp_client_enabled" src/cli/repl/` → wired (non-zero production caller); tsc clean; targeted test PASS. **Test:** targeted, additive.

---

## Task 16: Doc — Enterprise Foundation reference (consume-the-contract)
- Provider: gemini
- Model: gemini-2.5-pro
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/reference/enterprise-foundation.md
- Scope: docs/reference/

### Description
Create `docs/reference/enterprise-foundation.md` documenting how the WM-1 universal ExecutionRequest contract powers the enterprise layer: actor→RBAC (ENT-1), tenantId→multi-tenancy (ENT-2), correlationId/causationId→audit lineage (ENT-3), riskClass→governance gating (F10/WM-6), capabilityTarget→capability-broker (F8), budget→cost-control. Reference the config flags (enforce_rbac, risk_gate_enabled, mcp_client_enabled) as opt-in. Enterprise-grade reference doc; no marketing fluff. DOC-ONLY (no test/tsc).

**Kanıt:** `test -f docs/reference/enterprise-foundation.md && grep -ci "contract\|RBAC\|tenant" docs/reference/enterprise-foundation.md`. **Test:** yok (doc-only).

---

**Beklenen:** 16 task, enterprise-grade, claude-ağırlıklı (13 claude [4 opus + 9 sonnet] + 1 codex + 1 gemini-doc + 1 ci). WM-1 evrensel kontratının envelope'ı CANLI tüketicilere bağlanır (RBAC/tenant/audit/risk/capability/budget) + autonomous tamamlama + WM-7 enrichment + hygiene. Her code-task scope'una tests/ dahil (boundary-violation biter). tüm flag'ler opt-in/default-off (backward-safe). CC sprint-sonu her task'ı verify eder (disk+tsc+targeted+diff). Döngü: bu kapsamlı sprint'ten sonra sonraki batch.
