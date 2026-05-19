<!-- AUTO-START -->
# Brain Rules
- Always read DIRECTIVES.md first
- All brain knowledge lives in `.brain/memory.db` (SQLite) — this is the single source of truth
- Query ADRs via MemoryStore: `store.getByType('adr')` — never parse .md files directly
- If a worker output violates an accepted ADR → NO_GO + require ADR amendment proposal
- New architectural decisions → `store.insert({ type: 'adr', status: 'accepted', ... })`
- Always check usage before planning
- Plan mode required before execution
- Write sprint plan as task JSON files in `.tasks/`
- Assign model and effort per task with reason
- Define scope (directories, filesRead, filesWrite) for each task
- Define GO/NO-GO criteria for each task — task-specific, not generic
- Evaluate every result: DONE / GO_WITH_TECH_DEBT / NO_GO
- Cross-dependency: if A's NO-GO caused by B's output, B gets priority fix
- Write sprint learnings to DB: `store.insert({ type: 'memory', sprint_id, ... })`
- Write retrospective to DB: `store.upsert({ type: 'retro', sprint_id, ... })`
- Trigger decay via `store.decay(currentSprintNum, decayAfterSprints)`
- Export .md snapshots after sprint: `deckent memory export`
- Sprint is NEVER left incomplete

## Agent & Skill Selection
- Run selectAgent() for EVERY task — even when forceModel is set
- Agent selection is independent of model selection
- Resolve agent's PROMPT.md + systemPrompt for worker context injection
- Run selectSkills() based on task scope + project stack — avoid generic selection
- Update agent stats (totalUses, successRate) after sprint evaluation

## Provider Routing
- Route tasks to providers via task-router.ts
- Respect brain_provider, worker_provider, fallback_provider config
- Use provider fallback chain on failure (single retry, no infinite loops)

## Self-Learning
- Generate config suggestions from sprint results (NO_GO rate, coverage, duration)
- Detect recurring file errors across sprints
- Build insights for sprint report


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
- **ADR-022**: CLI/MCP Feature Parity — Parametre Eşitleme + Eksik Komutlar — **Status:** accepted
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
paths: [".tasks/*", ".brain/*", ".contracts/*"]
---
# Brain Rules
- Always read DIRECTIVES.md first
- All brain knowledge lives in `.brain/memory.db` (SQLite) — this is the single source of truth
- Query ADRs via MemoryStore: `store.getByType('adr')` — never parse .md files directly
- If a worker output violates an accepted ADR → NO_GO + require ADR amendment proposal
- New architectural decisions → `store.insert({ type: 'adr', status: 'accepted', ... })`
- Always check usage before planning
- Plan mode required before execution
- Write sprint plan as task JSON files in `.tasks/`
- Assign model and effort per task with reason
- Define scope (directories, filesRead, filesWrite) for each task
- Define GO/NO-GO criteria for each task — task-specific, not generic
- Evaluate every result: DONE / GO_WITH_TECH_DEBT / NO_GO
- Cross-dependency: if A's NO-GO caused by B's output, B gets priority fix
- Write sprint learnings to DB: `store.insert({ type: 'memory', sprint_id, ... })`
- Write retrospective to DB: `store.upsert({ type: 'retro', sprint_id, ... })`
- Trigger decay via `store.decay(currentSprintNum, decayAfterSprints)`
- Export .md snapshots after sprint: `deckent memory export`
- Sprint is NEVER left incomplete

## Agent & Skill Selection
- Run selectAgent() for EVERY task — even when forceModel is set
- Agent selection is independent of model selection
- Resolve agent's PROMPT.md + systemPrompt for worker context injection
- Run selectSkills() based on task scope + project stack — avoid generic selection
- Update agent stats (totalUses, successRate) after sprint evaluation

## Provider Routing
- Route tasks to providers via task-router.ts
- Respect brain_provider, worker_provider, fallback_provider config
- Use provider fallback chain on failure (single retry, no infinite loops)

## Self-Learning
- Generate config suggestions from sprint results (NO_GO rate, coverage, duration)
- Detect recurring file errors across sprints
- Build insights for sprint report

<!-- CUSTOM-END -->
