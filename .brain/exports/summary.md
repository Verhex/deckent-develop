# Brain Summary (auto-generated)

## Active Architecture Decisions
| ID | Title | Status |
|-----|-------|--------|
| adr-001 | TypeScript + ESM | accepted |
| adr-002 | Node16 Module Resolution | accepted |
| adr-003 | vitest over Jest | accepted |
| adr-004 | 3-Layer Config Merge | accepted |
| adr-005 | Synchronous I/O | deprecated |
| adr-006 | spawnSync Security Pattern | accepted |
| adr-007 | SpawnOptions Interface | accepted |
| adr-008 | Brain Merkezi Import — Tek Yönlü Bağımlılık | accepted |
| adr-009 | DEBT.md Markdown Tablo Formatı | accepted |
| adr-010 | Tek Runtime Dependency — commander.js | accepted |
| adr-011 | node:readline/promises — Built-in Prompt | accepted |
| adr-012 | register\<Name\>(program) Pattern | accepted |
| adr-013 | DECKENT.md Adapter Pattern (Sprint 15) | accepted |
| adr-014 | .deck Secret File System (Sprint 044) | accepted |
| adr-015 | TaskRouter Module — 6-level routing (Sprint 044) | accepted |
| adr-016 | Connector Module — provider lifecycle (Sprint 044) | accepted |
| adr-017 | MCP-Native Provider Adapters (Sprint 045) | accepted |
| adr-018 | Multi-Environment Config Generation (Sprint 046) | accepted |
| adr-019 | Language-Agnostic Worker Verify (Sprint 046) | accepted |
| adr-020 | Rich Sprint Output — 7-section summary (Sprint 044) | accepted |
| adr-021 | Kraken ASCII Brand Identity (Sprint 044) | accepted |
| adr-022 | CLI/MCP Feature Parity — Parametre Eşitleme + Eksik Komutlar | accepted |
| adr-022-v2 | CLI/MCP Feature Parity — Parametre Eşitleme + Eksik Komutlar (Updated Sprint 085) | accepted |
| adr-023 | Plan Tier Generalizasyonu — Provider-Agnostic Tier İsimleri (Sprint 072) | accepted |
| adr-024 | sprint-controller.ts God Object Split — sprint-phases.ts Extract (Sprint 072) | accepted |
| adr-025 | Graceful Shutdown Stratejisi — SIGINT → interruptActiveSprint (Sprint 076) | accepted |
| adr-026 | God Object Split Stratejisi — Faz 1-3 Tamamlandı (Sprint 076) | accepted |
| adr-027 | Hybrid Spawn Backend (Sprint 123, Revisited Sprint 139) | accepted |
| adr-028 | Decision-Engine V1 → V2 Routing Migration | accepted |
| adr-029 | Managed-Docs Universalization — Sprint Lifecycle Template-Based Document Generation | accepted |
| adr-030 | Template Engine + Plugin Loader — Managed-Docs Render Pipeline | accepted |
| adr-031 | Content Hash Cache — Sprint Dokümanları Hash-Based Invalidation | accepted |
| adr-032 | i18n Pattern System — TR/EN İçerik Çeşitliliği Desteği | accepted |
| adr-033 | Product Vision — Product Not Service | accepted |
| adr-034 | Multi-Project Isolation — Per-Project Security Boundaries | accepted |
| adr-035 | Brain ↔ Worker ↔ Auditor Verification Protocol Standard (Sprint 138) | accepted |
| adr-036 | ADR Governance Integration — Mandatory Architecture Decision Enforcement | accepted |
| adr-037 | Brain-Auditor-Worker Authority Matrix — RBAC Protocol V1.0 | accepted |
| adr-038 | Dead Code Disposition — Sprint 139 Audit Results | accepted |
| adr-039 | Self-Modifying Task Detection — Deckent Dogfood vs User Project Discrimination | accepted |
| adr-040 | Nervous System Architecture — Proactive Meta-Orchestrator | accepted |
| adr-041 | Agent Taxonomy — Horizontal Skills vs Vertical Agents | accepted |
| adr-042 | Hybrid Mode Architecture — Sprint + Task Dual Modes | accepted |
| adr-043 | Brain Crash Recovery Protocol | accepted |
| adr-044 | Sprint State Observability Contract | accepted |
| adr-045 | Wave-Based Execution Semantics — respawnEligibleTasks Runtime Wire | accepted |
| adr-046 | Brain Self-Update Hook Architecture | accepted |
| adr-047 | Manuel Subagent Dispatch Protocol | accepted |
| adr-048 | Prompt Lifecycle Contract | accepted |
| adr-053 | TaskType Taxonomy — Audit / Document-Write / Code-Development + Extensibility Roadmap | accepted |
| adr-055 | Hybrid Scoring 5-Layer Pipeline — Schema / Gates / Quality / Outcome / Auditor | proposed |
| adr-060 | Self-Awareness Propagation — 5-Channel Context Enrichment Architecture | proposed |
| adr-061 | AEGIS — Agentic Effect-Governed Iterative Stewardship Methodology | proposed |
| adr-062 | Embedded Web Terminal — PTY Sessions, WS Gateway, Auth & Audit | accepted |
| adr-063 | Consent-Based Prerequisite Provisioning | accepted |
| adr-064 | TOPP — Continuous Dispatch (Wave-Barrier Removal) | accepted |

## Recent Learnings
- **Sprint sprint-195 Learnings** (sprint-195): ## Sprint sprint-195 Learnings
- 195-004 — models.dev bootstrap startup wire: NO_GO — bootstrapFromCatalog added to s...
- **Sprint sprint-193 Learnings** (sprint-193): ## Sprint sprint-193 Learnings
- SMOKE-001 — i18n en.json duplicate error.lock_conflict temizle: NO_GO — Worker exite...
- **Sprint sprint-192 Learnings** (sprint-192): ## Sprint sprint-192 Learnings
- Placeholder — sprint still in-progress; will be overwritten by finalize.

- **Sprint sprint-191 Learnings** (sprint-191): ## Sprint sprint-191 Learnings
- 191-002 — `runtime_extension_enabled: true` default + worker timeout extension wire:...
- **Sprint sprint-190 Learnings** (sprint-190): ## Sprint sprint-190 Learnings
- Docker OOM cycle drove ~14 false NO_GO (reclassify pending Sprint 191 Task 003)
- 19...
- **Sprint sprint-189 Learnings** (sprint-189): ## Sprint sprint-189 Learnings
- 189-009 deckent_kill MCP parite: NO_GO — investigate root cause
- 189-011 API endpoi...
- **Sprint sprint-188 Learnings** (sprint-188): ## Sprint sprint-188 Learnings
- **Sprint sprint-187 Learnings** (sprint-187): ## Sprint sprint-187 Learnings
- **Sprint sprint-186 Learnings** (sprint-186): ## Sprint sprint-186 Learnings
- Audit src/core/cascade-detector.ts: NO_GO — Worker exited without writing result (ex...
- **Sprint sprint-185 Learnings** (sprint-185): ## Sprint sprint-185 Learnings

## Active Technical Debt
- [NORMAL] Sprint sprint-193 rollback SUCCESS

## Active Patterns
- Violation pattern: stale_heartbeat
- Violation pattern: stale_heartbeat
- Violation pattern: stale_heartbeat
- Violation pattern: stale_heartbeat
- Violation pattern: doc_sync_ground_truth_mismatch
- Violation pattern: stale_heartbeat
- Violation pattern: stale_heartbeat
- Violation pattern: stale_heartbeat
- Violation pattern: stale_heartbeat
- Violation pattern: stale_heartbeat
- Violation pattern: stale_heartbeat
- Violation pattern: stale_heartbeat
- Violation pattern: stale_heartbeat
- Violation pattern: stale_heartbeat
- Violation pattern: stale_heartbeat
- Violation pattern: stale_heartbeat
- Violation pattern: stale_heartbeat
- Violation pattern: stale_heartbeat
- Violation pattern: stale_heartbeat
- Violation pattern: stale_heartbeat
- Violation pattern: stale_heartbeat
- Violation pattern: stale_heartbeat
- Violation pattern: doc_sync_ground_truth_mismatch
- Violation pattern: stale_heartbeat
- Violation pattern: doc_sync_ground_truth_mismatch
- Violation pattern: stale_heartbeat
- Violation pattern: doc_sync_ground_truth_mismatch
- Violation pattern: stale_heartbeat

_Total entries: 358 | Generated: 2026-05-26_