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

## Recent Learnings
- **Sprint sprint-397 Learnings** (sprint-397): ## Sprint sprint-397 Learnings
- T7-ELOOP — chat-tool-exec raw-throw → DeckentError (CODE-FIX): GO_WITH_TECH_DEBT — F...
- **Sprint sprint-396 Learnings** (sprint-396): ## Sprint sprint-396 Learnings
- born-601a — AGENT-RULE-REWRITE — 4 agent-manifest kural-onarımı (P1): GO_WITH_TECH_D...
- **Sprint sprint-395 Learnings** (sprint-395): ## Sprint sprint-395 Learnings
- born-585 — PROJECTROOT-THREAD — buildWorkerPrompt 7 çağrı-sitesine gerçek projectRoo...
- **Sprint sprint-394 Learnings** (sprint-394): ## Sprint sprint-394 Learnings
- born-597+598+600 — IPC kanal-katmanlama + adopt-URL + transport (P0, RELEASE-GATE): ...
- **Sprint sprint-393 Learnings** (sprint-393): ## Sprint sprint-393 Learnings

## Gains
- 393-001 — born-589 — DOMAIN-ALIAS — detectDomains↔kural-vocabulary alias-m...
- **Sprint sprint-392 Learnings** (sprint-392): ## Sprint sprint-392 Learnings
- DESK-B2-PROFILE-STORE — connection-profile-store (P0): GO_WITH_TECH_DEBT — connectio...
- **Sprint sprint-391 Learnings** (sprint-391): ## Sprint sprint-391 Learnings

## Gains
- 391-001 — RED-1 — TASK-BUILDER-ADR-CWD-LEAK — buildWorkerPrompt projectRoo...
- **Sprint sprint-390 Learnings** (sprint-390): ## Sprint sprint-390 Learnings
- born-565 — AI-SESSION-TOOL-ALLOWLIST — kind==='ai' client-tool validation (P1, güven...
- **Sprint sprint-389 Learnings** (sprint-389): ## Sprint sprint-389 Learnings
- born-583 — GOV-MINORS — plugin-sig + opaque-bearer + deny-list loopback (P2): GO_WIT...
- **Sprint sprint-388 Learnings** (sprint-388): ## Sprint sprint-388 Learnings
- born-528 — REPL-DENY-TOOLSINK — confirm-red toolSink honest-outcome bypass (P2): NO_...

## Active Technical Debt
- [NORMAL] Tech debt from 397-007-fix: CODE-BUG confirmed already fixed on disk (uncommitte

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

_Total entries: 1162 | Generated: 2026-07-10_