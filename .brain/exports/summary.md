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
| ADR-G-037 | Execution Budget Landing, Continuation & Metering Authority | accepted |
| ADR-G-038 | Goal-v2 Normalized Dependency Authority & Bounded Reconciliation | accepted |
| adr-g-039 | Provider Authority Key Custody, Rotation & Composition | accepted |

## Recent Learnings
- **Sprint sprint-487 Learnings** (sprint-487): ## Sprint sprint-487 Learnings
- Fix: Terminal publication real-binary contract: NO_GO — Verification: node scripts/t...
- **Sprint sprint-486 Learnings** (sprint-486): ## Sprint sprint-486 Learnings
- Finalizer terminal-evidence wiring: NO_GO — Host runtime-budget evidence is not term...
- **Sprint sprint-485 Learnings** (sprint-485): ## Sprint sprint-485 Learnings

## Gains
- 485-001 — Provider concurrency capability authority — Verified: npx tsc --...
- **Sprint sprint-484 Learnings** (sprint-484): ## Sprint sprint-484 Learnings

## Gains
- 484-001 — Enforce recovery-born evaluation honesty with regression coverag...
- **Sprint sprint-483 Learnings** (sprint-483): ## Sprint sprint-483 Learnings
- Integrate DOGFOOD-3178 bounded validation evidence: GO_WITH_TECH_DEBT — Budget Landi...
- **Sprint sprint-482 Learnings** (sprint-482): ## Sprint sprint-482 Learnings
- Unify finalize and recover adapters: NO_GO — npx tsc --noEmit passed.
The mandated t...
- **Sprint sprint-481 Learnings** (sprint-481): ## Sprint sprint-481 Learnings
- **Sprint sprint-480 Learnings** (sprint-480): ## Sprint sprint-480 Learnings
- RECOVERY-SURFACES — CLI and MCP shared recovery commands: NO_GO — Bounded scope bloc...
- **Sprint sprint-479 Learnings** (sprint-479): ## Sprint sprint-479 Learnings
- Fix: CHAIN-01-ROOT — controlled NO_GO then repair: NO_GO — DECKENT_E091:coordinator-...
- **Sprint sprint-478 Learnings** (sprint-478): ## Sprint sprint-478 Learnings
- Fix: CHAIN-01-ROOT — controlled NO_GO then repair: NO_GO
- CHAIN-01-ROOT — controlle...

## Active Technical Debt
_No active technical debt._

## Active Patterns
- Violation pattern: stale_heartbeat (×39 sprints)
- Violation pattern: file_outside_scope (×21 sprints)
- Violation pattern: doc_sync_ground_truth_mismatch (×11 sprints)
- FIX lineage and post-FIX pause contract

_Total entries: 1723 | Generated: 2026-07-31_