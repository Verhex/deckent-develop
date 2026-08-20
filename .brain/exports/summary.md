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
| adr-g-040 | Normative Verdict Vocabulary (Single-Word Evaluation Statuses) | accepted |

## Recent Learnings
- **Sprint sprint-590 Learnings** (sprint-590): ## Sprint sprint-590 Learnings
- status blocked-satırı — i18n + neden-dürüst ifade: GO_WITH_TECH_DEBT — Moved the 3 h...
- **Sprint sprint-589 Learnings** (sprint-589): ## Sprint sprint-589 Learnings

## Gains
- 589-001 — MCP nervous karar-mesajları i18n — Scanned src/mcp/tools/nervous...
- **Sprint sprint-587 Learnings** (sprint-587): ## Sprint sprint-587 Learnings

## Gains
- 587-001 — V3 assignedSkills force-preserving merge (kaynak-tarafı) — Force...
- **Sprint sprint-586 Learnings** (sprint-586): ## Sprint sprint-586 Learnings

## Gains
- 586-001 — Mini not — Successfully created deneme-kontrol/f3-kanit.md with ...
- **Sprint sprint-585 Learnings** (sprint-585): ## Sprint sprint-585 Learnings

## Gains
- 585-001 — Mini not — Created deneme-kontrol/f3-kanit.md with 3-line Turkis...
- **Sprint sprint-584 Learnings** (sprint-584): ## Sprint sprint-584 Learnings

## Gains
- 584-001 — Deckent araç rehberi (kapsamlı — cache'i dolduran iş) — deneme-k...
- **Sprint sprint-583 Learnings** (sprint-583): ## Sprint sprint-583 Learnings

## Gains
- 583-001 — Deckent araç rehberi (kapsamlı — cache'i dolduran iş) — deneme-k...
- **Sprint sprint-582 Learnings** (sprint-582): ## Sprint sprint-582 Learnings

## Gains
- 582-001 — Deckent araç rehberi (kapsamlı — cache'i dolduran iş) — deneme-k...
- **Sprint sprint-579 Learnings** (sprint-579): ## Sprint sprint-579 Learnings

## Gains
- 579-001 — Deckent araç rehberi (kapsamlı — cache'i dolduran iş) — Yeni dos...
- **Sprint sprint-578 Learnings** (sprint-578): ## Sprint sprint-578 Learnings

## Gains
- 578-001 — ADR-uygunluk notu (basit — tek dosya) — ADR-uygunluk notu başarı...

## Active Technical Debt
_No active technical debt._

## Active Patterns
- Violation pattern: stale_heartbeat (×47 sprints)
- Violation pattern: file_outside_scope (×21 sprints)
- Violation pattern: doc_sync_ground_truth_mismatch (×12 sprints)
- FIX lineage and post-FIX pause contract

_Total entries: 2070 | Generated: 2026-08-20_