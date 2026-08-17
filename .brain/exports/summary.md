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
- **Sprint sprint-539 Learnings** (sprint-539): ## Sprint sprint-539 Learnings

## Gains
- 539-001 — phase5-writer.mjs — claim filing + verified append + projections...
- **Sprint sprint-538 Learnings** (sprint-538): ## Sprint sprint-538 Learnings

## Gains
- 538-001 — Phase-5 dry-run bundle builder + hermetic proof — npx tsc --noEm...
- **Sprint sprint-537 Learnings** (sprint-537): ## Sprint sprint-537 Learnings
- Canary no-op doc touch: GO_WITH_TECH_DEBT — Exact-byte disk readback passed via cmp;...
- **Sprint sprint-536 Learnings** (sprint-536): ## Sprint sprint-536 Learnings
- **Sprint sprint-535 Learnings** (sprint-535): ## Sprint sprint-535 Learnings
- **Sprint sprint-534 Learnings** (sprint-534): ## Sprint sprint-534 Learnings
- **Sprint sprint-533 Learnings** (sprint-533): ## Sprint sprint-533 Learnings

## Gains
- 533-001 — close the local-llm agentic worker and settlement lineage — Veri...
- **Sprint sprint-525 Learnings** (sprint-525): ## Sprint sprint-525 Learnings
- Fix: Probe contract freeze — typed provider-evidence-probe contracts: NO_GO — Refusi...
- **Sprint sprint-524 Learnings** (sprint-524): ## Sprint sprint-524 Learnings
- KN3 projection-parity guard — landing-proposal artifacts are not task ids: GO_WITH_T...
- **Sprint sprint-521 Learnings** (sprint-521): ## Sprint sprint-521 Learnings
- Skill catalog S1 — one effective read model behind the existing API (row 7012): GO_W...

## Active Technical Debt
_No active technical debt._

## Active Patterns
- Violation pattern: stale_heartbeat (×47 sprints)
- Violation pattern: file_outside_scope (×21 sprints)
- Violation pattern: doc_sync_ground_truth_mismatch (×12 sprints)
- FIX lineage and post-FIX pause contract

_Total entries: 1889 | Generated: 2026-08-17_