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
| user-1784778390241 | Provider Authority Key Custody, Rotation & Composition | active |

## Recent Learnings
- **Sprint sprint-456 Learnings** (sprint-456): ## Sprint sprint-456 Learnings
- Docker auth and provider-image fixture budget parity: NO_GO — Runtime budget circuit...
- **Sprint sprint-455 Learnings** (sprint-455): ## Sprint sprint-455 Learnings
- Crash-safe resume and recovery command truth: GO_WITH_TECH_DEBT — Made the public re...
- **Sprint sprint-454 Learnings** (sprint-454): ## Sprint sprint-454 Learnings
- Parametric agent model front doors: GO_WITH_TECH_DEBT — Worker timeout/killed (exitC...
- **Sprint sprint-453 Learnings** (sprint-453): ## Sprint sprint-453 Learnings

## Gains
- 453-001 — Canonical CLI and MCP one-shot execution boundary — Canonical CL...
- **Sprint sprint-452 Learnings** (sprint-452): ## Sprint sprint-452 Learnings
- Fix debt: Task evaluated as GO_WITH_TECH_DEBT. Notes: ROOT-CAUSE FINDING (read first...
- **Sprint sprint-451 Learnings** (sprint-451): ## Sprint sprint-451 Learnings
- Wire builtins drift-check into the validate-publish gate: GO_WITH_TECH_DEBT — Found ...
- **Sprint sprint-450 Learnings** (sprint-450): ## Sprint sprint-450 Learnings
- Integration verification with vitest sweep and real-binary status smoke: GO_WITH_TEC...
- **Sprint sprint-449 Learnings** (sprint-449): ## Sprint sprint-449 Learnings
- Fix debt: Task evaluated as GO_WITH_TECH_DEBT. Notes: REAL (non-provisional) v3 capa...
- **Sprint sprint-448 Learnings** (sprint-448): ## Sprint sprint-448 Learnings

## Gains
- 448-001 — Fix debt: Task evaluated as GO_WITH_TECH_DEBT. Notes: Investigat...
- **Sprint sprint-447 Learnings** (sprint-447): ## Sprint sprint-447 Learnings
- Fix debt: Task evaluated as GO_WITH_TECH_DEBT. Notes: Investigated the cross-depende...

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
- Violation pattern: stale_heartbeat

_Total entries: 1614 | Generated: 2026-07-23_