<!-- AUTO-START -->
---
paths: ["src/**","tests/**"]
---
# Worker Rules
- Read your task file first (`.tasks/task-XXX.json`)
- ADRs are injected into your prompt automatically from `.brain/memory.db` — they are mandatory constraints
- If you need to query project memory: relevant ADRs and past learnings are provided by Brain via MemoryStore
- If your implementation would violate an accepted ADR → stop, write NO_GO, propose ADR amendment
- Write execution plan to `.tasks/task-XXX.plan` before coding
- Check `.locks/` before writing any file
- Update heartbeat (`.tasks/task-XXX.hb`) on every file change
- Stay within your assigned scope — do not touch files outside it
- Run `tsc --noEmit` and `vitest run` before marking done
- Document changes in relevant docs
- Write result to `.tasks/task-XXX.result` with:
  - files_changed, lines_added/removed
  - test results, coverage
  - self_assessment: DONE | GO_WITH_TECH_DEBT | NO_GO
  - notes for Brain

## Skill Context
- If skill prompts are provided in your prompt, follow their guidelines
- Skill content is domain-specific expertise — apply it to your task
- Do not ignore skill instructions even if they seem overly detailed

## Verify Loop
- Run `tsc --noEmit` after code changes — fix errors (max 3 attempts)
- Run `npx vitest run` after code changes — fix failures (max 3 attempts)
- If both fail after 3 attempts → write NO_GO result with error details
- If blocked by another task → write NO_GO result explaining the dependency

## Agent Context
- If an agent prompt is provided, it defines your specialization
- Follow agent-specific guidelines for your domain (security, testing, docs, etc.)
- Agent expertise supplements but does not override task instructions


## Active ADR Constraints

- **ADR-010**: Tek Runtime Dependency — commander.js — **Status:** accepted
- **ADR-046**: Brain Self-Update Hook Architecture — **Status:** accepted
- **ADR-048**: Prompt Lifecycle Contract — Sprint 168 C0e BUG-HH eradication. .tasks/.prompt-*.txt selective cleanup via getActiveWorkerIds() shared helper. Cross-
- **ADR-047**: Manuel Subagent Dispatch Protocol — Sprint 164-168 manuel survival pattern formal kontrat. Hardened dispatch: git worktree isolation + file authority matrix
- **ADR-045**: Wave-Based Execution Semantics — respawnEligibleTasks Runtime Wire — **Status:** accepted
- **ADR-043**: Brain Crash Recovery Protocol — **Status:** accepted
- **ADR-044**: Sprint State Observability Contract — **Status:** accepted
- **ADR-041**: Agent Taxonomy — Horizontal Skills vs Vertical Agents — **Status:** accepted
- **ADR-040**: Nervous System Architecture — Proactive Meta-Orchestrator — **Status:** accepted
- **ADR-038**: Dead Code Disposition — Sprint 139 Audit Results — **Status:** accepted
- **ADR-039**: Self-Modifying Task Detection — Deckent Dogfood vs User Project Discrimination — **Status:** accepted
- **ADR-035**: Brain ↔ Worker ↔ Auditor Verification Protocol Standard (Sprint 138) — **Status:** accepted
- **ADR-037**: Brain-Auditor-Worker Authority Matrix — RBAC Protocol V1.0 — **Status:** accepted
- **ADR-033**: Product Vision — Product Not Service — **Status:** accepted
- **ADR-034**: Multi-Project Isolation — Per-Project Security Boundaries — **Status:** accepted
- **ADR-029**: Managed-Docs Universalization — Sprint Lifecycle Template-Based Document Generation — **Status:** accepted
- **ADR-030**: Template Engine + Plugin Loader — Managed-Docs Render Pipeline — **Status:** accepted
- **ADR-031**: Content Hash Cache — Sprint Dokümanları Hash-Based Invalidation — **Status:** accepted
- **ADR-032**: i18n Pattern System — TR/EN İçerik Çeşitliliği Desteği — **Status:** accepted
- **ADR-036**: ADR Governance Integration — Mandatory Architecture Decision Enforcement — **Status:** accepted
- **ADR-027**: Hybrid Spawn Backend (Sprint 123, Revisited Sprint 139) — **Status:** accepted
- **ADR-025**: Graceful Shutdown Stratejisi — SIGINT → interruptActiveSprint (Sprint 076) — **Status:** accepted
- **ADR-026**: God Object Split Stratejisi — Faz 1-3 Tamamlandı (Sprint 076) — **Status:** accepted
- **ADR-023**: Plan Tier Generalizasyonu — Provider-Agnostic Tier İsimleri (Sprint 072) — **Status:** accepted
- **ADR-024**: sprint-controller.ts God Object Split — sprint-phases.ts Extract (Sprint 072) — **Status:** accepted
- **ADR-018**: Multi-Environment Config Generation (Sprint 046) — **Status:** accepted
- **ADR-019**: Language-Agnostic Worker Verify (Sprint 046) — **Status:** accepted
- **ADR-017**: MCP-Native Provider Adapters (Sprint 045) — **Status:** accepted
- **ADR-014**: .deck Secret File System (Sprint 044) — **Status:** accepted
- **ADR-015**: TaskRouter Module — 6-level routing (Sprint 044) — **Status:** accepted
- **ADR-016**: Connector Module — provider lifecycle (Sprint 044) — **Status:** accepted
- **ADR-020**: Rich Sprint Output — 7-section summary (Sprint 044) — **Status:** accepted
- **ADR-021**: Kraken ASCII Brand Identity (Sprint 044) — **Status:** accepted
- **ADR-028**: Decision-Engine V1 → V2 Routing Migration — **Status:** accepted
- **ADR-013**: DECKENT.md Adapter Pattern (Sprint 15) — **Status:** accepted
- **ADR-001**: TypeScript + ESM — **Status:** accepted
- **ADR-002**: Node16 Module Resolution — **Status:** accepted
- **ADR-003**: vitest over Jest — **Status:** accepted
- **ADR-004**: 3-Layer Config Merge — **Status:** accepted
- **ADR-006**: spawnSync Security Pattern — **Status:** accepted
- **ADR-007**: SpawnOptions Interface — **Status:** accepted
- **ADR-008**: Brain Merkezi Import — Tek Yönlü Bağımlılık — **Status:** accepted
- **ADR-009**: DEBT.md Markdown Tablo Formatı — **Status:** accepted
- **ADR-011**: node:readline/promises — Built-in Prompt — **Status:** accepted
- **ADR-012**: register\<Name\>(program) Pattern — **Status:** accepted
- **ADR-022-V2**: CLI/MCP Feature Parity — Parametre Eşitleme + Eksik Komutlar (Updated Sprint 085) — **Status:** accepted
<!-- AUTO-END -->

<!-- CUSTOM-START -->
---
paths: ["src/**", "tests/**"]
---
# Worker Rules
- Read your task file first (`.tasks/task-XXX.json`)
- ADRs are injected into your prompt automatically from `.brain/memory.db` — they are mandatory constraints
- If you need to query project memory: relevant ADRs and past learnings are provided by Brain via MemoryStore
- If your implementation would violate an accepted ADR → stop, write NO_GO, propose ADR amendment
- Write execution plan to `.tasks/task-XXX.plan` before coding
- Check `.locks/` before writing any file
- Update heartbeat (`.tasks/task-XXX.hb`) on every file change
- Stay within your assigned scope — do not touch files outside it
- Run `tsc --noEmit` and `vitest run` before marking done
- Document changes in relevant docs
- Write result to `.tasks/task-XXX.result` with:
  - files_changed, lines_added/removed
  - test results, coverage
  - self_assessment: DONE | GO_WITH_TECH_DEBT | NO_GO
  - notes for Brain

## Skill Context
- If skill prompts are provided in your prompt, follow their guidelines
- Skill content is domain-specific expertise — apply it to your task
- Do not ignore skill instructions even if they seem overly detailed

## Verify Loop
> **Honesty note (ADR-037 V1.0):** Bu Verify Loop bir **prompt talimatıdır, kod-enforce DEĞİL**. `enforceVerifyLoop`/`runTestVerifyLoop` runtime'da çağrılmaz (0-caller, hard-flip post-GA V2). Worker disiplinine + Auditor advisory izlemeye dayanır.
- Run `tsc --noEmit` after code changes — fix errors (max 3 attempts)
- Run `npx vitest run` after code changes — fix failures (max 3 attempts)
- If both fail after 3 attempts → write NO_GO result with error details
- If blocked by another task → write NO_GO result explaining the dependency

## Agent Context
- If an agent prompt is provided, it defines your specialization
- Follow agent-specific guidelines for your domain (security, testing, docs, etc.)
- Agent expertise supplements but does not override task instructions

<!-- CUSTOM-END -->
