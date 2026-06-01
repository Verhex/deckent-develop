<!-- AUTO-START -->
---
paths: [".dashboard"]
---
# Auditor Rules
- NEVER write source code
- All brain knowledge is in `.brain/memory.db` (SQLite) — query via MemoryStore, never parse .md files
- ADR compliance: load ADRs from `store.getByType('adr')`, not from DECISIONS.md
- Write patterns to DB (upsert semantics): `store.insert({ type: 'pattern', ... })`
- Scan every 30 seconds
- Read all heartbeat files → detect stale agents (>2min = alert)
- Run `git diff --stat` → detect boundary violations
- Check `.locks/` → detect stale locks (>5min)
- Detect circular dependencies / deadlocks
- Monitor usage thresholds
- Overwrite `.dashboard` on every scan (never append)
- Write alerts for critical issues

## Agent & Skill Monitoring
- Track which agents and skills are assigned to active tasks
- Flag agent assignment failures in alerts
- Monitor agent utilization rate (assigned vs generic)

## Provider Health
- Check provider availability during scan
- Flag provider failures or timeouts in dashboard alerts
- Track mixed-provider sprint status (Claude + Codex/Gemini)

## Sprint Phase Tracking
- Track current sprint phase in dashboard
- Alert if phase duration exceeds expected thresholds
- Detect orphan workers from previous sprints


## Active ADR Constraints

- **ADR-079**: Proof-of-Function DoD — Tier-0/Tier-1 Classification + Sprint-Inner Run-Verify Gate — **Status:** accepted
- **ADR-078**: CI-Hermeticity Standard + 8-Provider Runtime + Active Identity-Mutation Loop + Dashboard God-Level — **Status:** accepted
- **ADR-076**: Auth-Precedence Fix + User-Facing Surfaces (serve token-inject, Path A chat, IDE extension) — **Status:** accepted
- **ADR-077**: Multi-Provider 8-Fleet + OpenAI-Compatible HTTP Adapter — **Status:** accepted
- **ADR-075**: F5 Evolution Runtime Wiring + Routing Skill→Agent Affinity + Managed-Docs Code-Derived Counts — **Status:** accepted
- **ADR-074**: Native Chat Real Round-Trip + Enterprise RBAC/Audit/Rate + F5 Evolution Wire — **Status:** accepted
- **ADR-073**: Routing Live Validation + FIX Prompt Enrichment + Dashboard Control Plane — **Status:** accepted
- **ADR-072**: Agent Routing Balance (Multi-Signal Scoring) + Dashboard API Auth Hardening — **Status:** accepted
- **ADR-070**: Brain Evaluation Integrity — Signal-Based Coverage Exemption + Zero-Hard-Code Principle — **Status:** accepted
- **ADR-066**: Provider Independence — Multi-Provider Backend Parity — **Status:** accepted
- **ADR-065**: Develop / Product Two-Repo Split — **Status:** accepted
- **ADR-064**: TOPP — Continuous Dispatch (Wave-Barrier Removal) — **Status:** accepted
- **ADR-062**: Embedded Web Terminal — PTY Sessions, WS Gateway, Auth & Audit — **Status:** accepted
- **ADR-063**: Consent-Based Prerequisite Provisioning — > **Numbering note (Sprint 175):** This ADR was originally numbered 062 alongside
- **ADR-010**: Tek Runtime Dependency — commander.js — **Status:** accepted
- **ADR-037**: Brain-Auditor-Worker Authority Matrix — RBAC Protocol V1.0 — **Status:** accepted
- **ADR-048**: Prompt Lifecycle Contract — **Status:** accepted
- **ADR-047**: Manuel Subagent Dispatch Protocol — **Status:** accepted
- **ADR-046**: Brain Self-Update Hook Architecture — **Status:** accepted
- **ADR-045**: Wave-Based Execution Semantics — respawnEligibleTasks Runtime Wire — **Status:** accepted
- **ADR-043**: Brain Crash Recovery Protocol — **Status:** accepted
- **ADR-044**: Sprint State Observability Contract — **Status:** accepted
- **ADR-053**: TaskType Taxonomy — Audit / Document-Write / Code-Development + Extensibility Roadmap — **Status:** accepted
- **ADR-041**: Agent Taxonomy — Horizontal Skills vs Vertical Agents — **Status:** accepted
- **ADR-042**: Hybrid Mode Architecture — Sprint + Task Dual Modes — **Status:** accepted
- **ADR-040**: Nervous System Architecture — Proactive Meta-Orchestrator — **Status:** accepted
- **ADR-038**: Dead Code Disposition — Sprint 139 Audit Results — **Status:** accepted
- **ADR-039**: Self-Modifying Task Detection — Deckent Dogfood vs User Project Discrimination — **Status:** accepted
- **ADR-035**: Brain ↔ Worker ↔ Auditor Verification Protocol Standard (Sprint 138) — **Status:** accepted
- **ADR-033**: Product Vision — Product Not Service — **Status:** accepted
- **ADR-034**: Multi-Project Isolation — Per-Project Security Boundaries — **Status:** accepted
- **ADR-029**: Managed-Docs Universalization — Sprint Lifecycle Template-Based Document Generation — **Status:** accepted
- **ADR-030**: Template Engine + Plugin Loader — Managed-Docs Render Pipeline — **Status:** accepted
- **ADR-031**: Content Hash Cache — Sprint Dokümanları Hash-Based Invalidation — **Status:** accepted
- **ADR-032**: i18n Pattern System — TR/EN İçerik Çeşitliliği Desteği — **Status:** accepted
- **ADR-036**: ADR Governance Integration — Mandatory Architecture Decision Enforcement — **Status:** accepted
- **ADR-028**: Decision-Engine V1 → V2 Routing Migration — **Status:** accepted
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

<!-- CUSTOM-END -->
