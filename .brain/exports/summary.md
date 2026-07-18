# Brain Summary (auto-generated)

## Active Architecture Decisions
| ID | Title | Status |
|-----|-------|--------|
| adr-d-001 | Build Baseline (TypeScript · ESM · Node 24+ · nodenext) | accepted |
| adr-d-002 | Test Infrastructure & Hermeticity | accepted |
| adr-d-004 | Layer-1 Import Direction (Brain-Family Boundary) | accepted |
| adr-d-005 | Dependency Policy & Inventory (Merit-Based + Security Discipline) | accepted |
| adr-d-006 | Code Architecture Conventions | accepted |
| adr-d-007 | Manual Subagent Dispatch (Dogfood Survival-Fallback) | accepted |
| adr-d-008 | Develop / Product Repo Strategy | accepted |
| adr-d-009 | Worker-Result Boundary Normalization Policy | accepted |
| adr-d-010 | REPL Input Stabilization (Cursor / Queue / Streaming Contract) | accepted |
| adr-d-011 | Global Install Topology — Daemon vs CLI-Invoked, Project-Scope Config Layer | accepted |
| adr-d-012 | Terminal Risk Language (Oku / Değiştir / Çalıştır / Otonom) | accepted |
| adr-d-013 | NL-Dispatch Default Policy (`agenticDispatch` — Natural-Language → MCP-Tool Direct Dispatch) | accepted |
| adr-g-001 | Layered Config & Scope Precedence | accepted |
| adr-g-002 | spawnSync Security Pattern | accepted |
| adr-g-004 | Instruction-File Adapter & Multi-Env Generation | accepted |
| adr-g-005 | Secret File System (Dedicated `.deck` + Per-Provider Credential Model) | accepted |
| adr-g-006 | Routing & Selection (Learned Model/Effort + Agent/Skill) | accepted |
| adr-g-007 | External Messaging Connectors & Integration Layer | accepted |
| adr-g-008 | Provider Abstraction, Fleet & Native-Usage | accepted |
| adr-g-009 | Evaluation Integrity (Language-Agnostic Verify · Coverage-Exemption · Proof-of-Function) | accepted |
| adr-g-010 | Output, Terminal-UX & Brand | accepted |
| adr-g-011 | Surface Parity & Thin-Wrapper | accepted |
| adr-g-012 | Plan Tier & Config Customization | accepted |
| adr-g-013 | Graceful Shutdown & Lifecycle | accepted |
| adr-g-014 | Spawn Backend, Options & Observation | accepted |
| adr-g-015 | Managed-Docs (Core-Gen) + Tracking / Staleness | accepted |
| adr-g-016 | Product Vision — Product, Not Service | accepted |
| adr-g-017 | Multi-Project Isolation | accepted |
| adr-g-018 | Verification Protocol & Event-Stream | accepted |
| adr-g-019 | ADR Governance & 4-Layer Taxonomy | accepted |
| adr-g-020 | Authority, Roles, Flow & Enforcement (Multi-Mode RBAC) | accepted |
| adr-g-021 | Self-Modifying Detection — Dogfood ↔ User-Project Discrimination | accepted |
| adr-g-022 | Nervous System — Proactive Meta-Orchestrator | accepted |
| adr-g-023 | Agent/Skill Taxonomy | accepted |
| adr-g-024 | Mode Architecture (Universal Naming · sprint | task | process) | accepted |
| adr-g-025 | Process Resilience, Recovery & Live Observability | accepted |
| adr-g-026 | Dependency-Wave Execution & Control | accepted |
| adr-g-027 | Prompt Lifecycle & Worker-Context | accepted |
| adr-g-028 | Work Taxonomy (TaskKind × TechStack) & Evaluation | accepted |
| adr-g-029 | Embedded Web Terminal (Remote PTY) | accepted |
| adr-g-030 | Consent-Based Provisioning & Install | accepted |
| adr-g-031 | Enterprise Foundation (Tenant · RBAC · Audit · Scheduled-Flows · Connector-Identity) | accepted |
| adr-g-032 | Self-Learning & Evolution Loop | accepted |
| adr-g-033 | Dashboard (Observability Surface) | accepted |
| adr-g-034 | Native Agentic Terminal | accepted |
| adr-g-035 | Memory Architecture (DB-First, FTS5, Self-Learning Substrate) | accepted |
| adr-g-036 | Zero-Hardcode Model & Flow Values (Parametric-Only) | accepted |

## Recent Learnings
- **Sprint sprint-447 Learnings** (sprint-447): ## Sprint sprint-447 Learnings
- Fix debt: Task evaluated as GO_WITH_TECH_DEBT. Notes: Investigated the cross-depende...
- **Sprint sprint-445 Learnings** (sprint-445): ## Sprint sprint-445 Learnings
- builtin capabilities authoring — construction family: GO_WITH_TECH_DEBT — Authored R...
- **Sprint sprint-444 Learnings** (sprint-444): ## Sprint sprint-444 Learnings
- F3 routing pins move to the implementer era: GO_WITH_TECH_DEBT — All 4 target files ...
- **Sprint sprint-443 Learnings** (sprint-443): ## Sprint sprint-443 Learnings
- U4 persona-guidance parser and slice selector: GO_WITH_TECH_DEBT — parseGuidanceSect...
- **Sprint sprint-442 Learnings** (sprint-442): ## Sprint sprint-442 Learnings
- Rehydrate event-fold sorgu-yuzeyi getFlow ve listFlows: GO_WITH_TECH_DEBT — Rehydrat...
- **Sprint sprint-441 Learnings** (sprint-441): ## Sprint sprint-441 Learnings
- SKILL-RETRIEVAL çift-eşik entegrasyon testleri ve regresyon-yeşili kanıtı: NO_GO — C...
- **Sprint sprint-440 Learnings** (sprint-440): ## Sprint sprint-440 Learnings
- Yeni hermetik birim-testler test-yazarligi ve implementation senaryolari: NO_GO — Ca...
- **Sprint sprint-439 Learnings** (sprint-439): ## Sprint sprint-439 Learnings
- Rehydrate katmanı — event-fold ve legacy dual-read ile KNOWN_CONSUMERS pini: NO_GO —...
- **Sprint sprint-438 Learnings** (sprint-438): ## Sprint sprint-438 Learnings

## Gains
- 438-001 — RunFlow contract additive alanlar — commandId ve sequence — Adde...
- **Sprint sprint-437 Learnings** (sprint-437): ## Sprint sprint-437 Learnings
- NOTIFY-DEDUP kalıcı bildirim-state modülü ve relay wiring: GO_WITH_TECH_DEBT — New s...

## Active Technical Debt
- [HIGH] Tech debt from 445-013-fix: REAL (non-provisional) v3 capabilities blocks for th
- [HIGH] Timeout-partial from 445-014-fix: worker killed mid-execution, work accepted
- [HIGH] Tech debt from 445-015-fix: ROOT CAUSE of the original 445-015 NO_GO ('rubric to
- [HIGH] Tech debt from 445-017-fix: No new edit was made this round -- 445-017's prior a
- [CRITICAL] Tech debt from 443-001-xfix: Investigated the cross-dependency hypothesis first 
- [CRITICAL] Tech debt from 433-001-fix: Investigated the 433-001 NO_GO (brainEvaluationReaso

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
- Violation pattern: file_outside_scope
- Violation pattern: file_outside_scope
- Violation pattern: doc_sync_ground_truth_mismatch
- Violation pattern: stale_heartbeat
- Violation pattern: file_outside_scope
- Violation pattern: stale_heartbeat
- Violation pattern: file_outside_scope
- Violation pattern: stale_heartbeat
- Violation pattern: stale_heartbeat
- Violation pattern: doc_sync_ground_truth_mismatch
- Violation pattern: doc_sync_ground_truth_mismatch
- Violation pattern: doc_sync_ground_truth_mismatch
- Violation pattern: doc_sync_ground_truth_mismatch
- Violation pattern: file_outside_scope
- Violation pattern: stale_heartbeat
- Violation pattern: doc_sync_ground_truth_mismatch
- Violation pattern: doc_sync_ground_truth_mismatch
- Violation pattern: doc_sync_ground_truth_mismatch
- Violation pattern: stale_heartbeat
- Violation pattern: doc_sync_ground_truth_mismatch
- Violation pattern: file_outside_scope
- Violation pattern: file_outside_scope
- Violation pattern: doc_sync_ground_truth_mismatch
- Violation pattern: file_outside_scope
- Violation pattern: stale_heartbeat
- Violation pattern: file_outside_scope
- Violation pattern: stale_heartbeat
- Violation pattern: stale_heartbeat
- Violation pattern: file_outside_scope
- Violation pattern: doc_sync_ground_truth_mismatch

_Total entries: 1520 | Generated: 2026-07-18_