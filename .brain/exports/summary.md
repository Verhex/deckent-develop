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
- **Sprint sprint-435 Learnings** (sprint-435): ## Sprint sprint-435 Learnings

## Gains
- 435-001 — Planner derleme sınırlarını sağlamlaştır — born-691 + born-692 s...
- **Sprint sprint-434 Learnings** (sprint-434): ## Sprint sprint-434 Learnings
- Packed-install retry-hardening: GO_WITH_TECH_DEBT — packed-install job hardened, sco...
- **Sprint sprint-433 Learnings** (sprint-433): ## Sprint sprint-433 Learnings
- STATUS-JSON-CONTRACT CLI düzeltmesini uygula: GO_WITH_TECH_DEBT — Fixed both no-acti...
- **Sprint sprint-432 Learnings** (sprint-432): ## Sprint sprint-432 Learnings
- SURF-0.4 — Sprint phases finalizer propagation: GO_WITH_TECH_DEBT — Audit: finalizeS...
- **Sprint sprint-431 Learnings** (sprint-431): ## Sprint sprint-431 Learnings
- scripts/lint-no-model-literal.mjs ratchet + baseline: GO_WITH_TECH_DEBT — Mirrors sc...
- **Sprint sprint-430 Learnings** (sprint-430): ## Sprint sprint-430 Learnings

## Gains
- 430-001 — Scheduler-shadow retention config şeması (config-types.ts + conf...
- **Sprint sprint-429 Learnings** (sprint-429): ## Sprint sprint-429 Learnings
- N677 — directives-builder delimiter-güvenliği: GO_WITH_TECH_DEBT — born-677 root cau...
- **Sprint sprint-428 Learnings** (sprint-428): ## Sprint sprint-428 Learnings

## Gains
- 428-001 — W674A — ctx-doldurma: toolInventory + verifyCommands (born-674) ...
- **Sprint sprint-427 Learnings** (sprint-427): ## Sprint sprint-427 Learnings
- WIRE-PROBE — sprint-start env-probe doldurma (born-670a): GO_WITH_TECH_DEBT — born-6...
- **Sprint sprint-426 Learnings** (sprint-426): ## Sprint sprint-426 Learnings
- TERM4A — run-flow-store + run-job-service + snapshot-tüketen start (flag'li): GO_WIT...

## Active Technical Debt
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

_Total entries: 1340 | Generated: 2026-07-13_