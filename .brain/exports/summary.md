# Brain Summary (auto-generated)

## Active Architecture Decisions
| ID | Title | Status |
|-----|-------|--------|
| adr-001 | TypeScript + ESM | accepted |
| adr-002 | Node16 Module Resolution | accepted |
| adr-003 | vitest over Jest | accepted |
| adr-004 | Layered Config Merge (defaults → global → project → env) | accepted |
| adr-005 | Synchronous I/O | deprecated |
| adr-006 | spawnSync Security Pattern | accepted |
| adr-007 | SpawnOptions Interface | accepted |
| adr-008 | Brain Merkezi Import — Tek Yönlü Bağımlılık | accepted |
| adr-009 | DEBT.md Markdown Tablo Formatı | deprecated |
| adr-010 | Tek Runtime Dependency — commander.js | accepted |
| adr-011 | node:readline/promises — Built-in Prompt | accepted |
| adr-012 | register\<Name\>(program) Pattern | accepted |
| adr-013 | DECKENT.md Adapter Pattern (Sprint 15) | accepted |
| adr-014 | .deck Secret File System (Sprint 044) | accepted |
| adr-015 | TaskRouter Module — 6-level routing (Sprint 044) | accepted |
| adr-016 | External Messaging Connectors (Discord / Telegram / WhatsApp + Bot) | accepted |
| adr-017 | MCP-Native Provider Adapters (Sprint 045) | accepted |
| adr-018 | Multi-Environment Config Generation (Sprint 046) | accepted |
| adr-019 | Language-Agnostic Worker Verify (Sprint 046) | accepted |
| adr-020 | Rich Sprint Output — multi-section summary (Sprint 044) | accepted |
| adr-021 | Kraken ASCII Brand Identity (Sprint 044) | accepted |
| adr-022 | CLI/MCP Feature Parity — Parametre Eşitleme + Eksik Komutlar | accepted |
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
| adr-065 | Develop / Product Two-Repo Split | accepted |
| adr-066 | Provider Independence — Multi-Provider Backend Parity | accepted |
| adr-067 | Process Mode + Tenant Isolation — F3 Foundation | proposed |
| adr-068 | Enterprise Foundation — Audit Query + Multi-Tenant + Scheduled Flows | accepted |
| adr-069 | Event-Driven Triggers + RBAC — F3 Webhook & F4 Role-Based Access Control | accepted |
| adr-070 | Brain Evaluation Integrity — Signal-Based Coverage Exemption + Zero-Hard-Code Principle | accepted |
| adr-071 | F3 Autonomous Mode (Self-Dispatch Guard) + F4 Enterprise RBAC/Tenant/Audit | accepted |
| adr-072 | Agent Routing Balance (Multi-Signal Scoring) + Dashboard API Auth Hardening | accepted |
| adr-073 | Routing Live Validation + FIX Prompt Enrichment + Dashboard Control Plane | accepted |
| adr-074 | Native Chat Real Round-Trip + Enterprise RBAC/Audit/Rate + F5 Evolution Wire | accepted |
| adr-075 | F5 Evolution Runtime Wiring + Routing Skill→Agent Affinity + Managed-Docs Code-Derived Counts | accepted |
| adr-076 | Auth-Precedence Fix + User-Facing Surfaces (serve token-inject, Path A chat, IDE extension) | accepted |
| adr-077 | Multi-Provider 8-Fleet + OpenAI-Compatible HTTP Adapter | accepted |
| adr-078 | CI-Hermeticity Standard + 8-Provider Runtime + Active Identity-Mutation Loop + Dashboard God-Level | accepted |
| adr-079 | Proof-of-Function DoD — Tier-0/Tier-1 Classification + Sprint-Inner Run-Verify Gate | accepted |
| adr-080 | Dashboard God-Level — Sprint-Start Detach + Hollow-Page Wire + Chat Round-Trip + Native UI | accepted |
| adr-081 | Native Agentic Deckent — `deckent` argümansız REPL + Agentic Tool-Use + F2 Streaming + Agentic-OS Direction | accepted |
| adr-082 | Native-LLM-Wire + Nervous-Activation + Dashboard-v2 Canlı | accepted |
| adr-083 | REPL-UX-Evolution + Provider-Parity + Local-Model-Foundation | accepted |
| adr-086 | Native CLI Parity — F11 Feature Set (Sprint 224) | accepted |
| adr-087 | Async I/O & Test Hermeticity Standard | accepted |
| adr-088 | Memory V2 — DB-First Architecture | accepted |
| adr-089 | Backend-Agnostic Worker Observation + Per-Worker Independent Backends | accepted |
| adr-090 | Documentation Tracking & Staleness (DCR + content-hash + multi-signal) | accepted |
| adr-091 | Project-Scoped Messaging Gateway — Control-Plane Daemon + Spawned Per-Project Runtimes | accepted |

## Recent Learnings
- **Sprint sprint-328 Learnings** (sprint-328): ## Sprint sprint-328 Learnings
- Class-A codex usage-emit (CLI-agent, native source): GO_WITH_TECH_DEBT — Class-A cod...
- **Sprint sprint-327 Learnings** (sprint-327): ## Sprint sprint-327 Learnings
- live-proof doc note: GO_WITH_TECH_DEBT — docs/LIVE-PROOF.md created with the require...
- **Sprint sprint-326 Learnings** (sprint-326): ## Sprint sprint-326 Learnings
- tokenizer-fallback (usage-raporlamayan provider): GO_WITH_TECH_DEBT — Cascade-skippe...
- **Sprint sprint-325 Learnings** (sprint-325): ## Sprint sprint-325 Learnings
- Planner structured-parse — `- Model:` → forceModel + `- Dependencies: N` index→slot-...
- **Sprint sprint-324 Learnings** (sprint-324): ## Sprint sprint-324 Learnings
- KES lazy-loader (mekanik): NO_GO — Zero prod-caller verified: `grep -rn lazyLoad|Laz...
- **Sprint sprint-323 Learnings** (sprint-323): ## Sprint sprint-323 Learnings
- A14 — applyTechDebtDowngrade zero-caller (verify-delta downgrade ölü): NO_GO — DESIG...
- **Sprint sprint-322 Learnings** (sprint-322): ## Sprint sprint-322 Learnings

## Gains
- 322-001 — R-EVALRESULT-CLEANUP — deprecated alias temizliği (321 TECH_DEBT...
- **Sprint sprint-321 Learnings** (sprint-321): ## Sprint sprint-321 Learnings

## Gains
- 321-001 — R321-EVALRESULT-DISAMBIG — sprint-controller evaluateResult disa...
- **Sprint sprint-320 Learnings** (sprint-320): ## Sprint sprint-320 Learnings

## Gains
- 320-001 — VERIFY-COLLISION-A — collision-verify dosyasına satır ekle (A) —...
- **Sprint sprint-319 Learnings** (sprint-319): ## Sprint sprint-319 Learnings
- B-WAITRESULTS-KES — waitForResults dead DI-variant temizle: NO_GO

## Gains
- 319-00...

## Active Technical Debt
_No active technical debt._

## Active Patterns
- Violation pattern: stale_heartbeat
- Violation pattern: file_outside_scope
- Violation pattern: file_outside_scope
- Violation pattern: file_outside_scope
- Violation pattern: stale_heartbeat
- Violation pattern: stale_heartbeat
- Violation pattern: stale_heartbeat
- Violation pattern: stale_heartbeat
- Violation pattern: stale_heartbeat
- Violation pattern: file_outside_scope
- Violation pattern: file_outside_scope
- Violation pattern: stale_heartbeat
- Violation pattern: stale_heartbeat
- Violation pattern: stale_heartbeat
- Violation pattern: file_outside_scope
- Violation pattern: file_outside_scope
- Violation pattern: stale_heartbeat
- Violation pattern: stale_heartbeat
- Violation pattern: file_outside_scope
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
- Violation pattern: file_outside_scope
- Violation pattern: stale_heartbeat
- Violation pattern: file_outside_scope
- Violation pattern: stale_heartbeat
- Violation pattern: file_outside_scope

_Total entries: 755 | Generated: 2026-06-26_