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
- **Sprint sprint-598 Learnings** (sprint-598): ## Sprint sprint-598 Learnings

## Gains
- 598-001 — AI-operatör dersi 26 (pgrep kendi-desen tuzağı; iki dil senkron)...
- **Sprint sprint-597 Learnings** (sprint-597): ## Sprint sprint-597 Learnings

## Gains
- 597-001 — docker-backend prefix-bileşimi (T2, tek-sahip) — Implemented cap...
- **Sprint sprint-596 Learnings** (sprint-596): ## Sprint sprint-596 Learnings

## Gains
- 596-001 — ProviderCommandSpec prefix-alanları (T3 arayüz-mührü) — Codex Pr...
- **Sprint sprint-595 Learnings** (sprint-595): ## Sprint sprint-595 Learnings
- mesaj-katalog + komut-kayıt ratchet borçları: NO_GO — Authorized fix completed: repl...
- **Sprint sprint-594 Learnings** (sprint-594): ## Sprint sprint-594 Learnings
- F4 model-tier prompt-farklılaşması (7094-T5): GO_WITH_TECH_DEBT — LOCAL_VERIFIED / S...
- **Sprint sprint-593 Learnings** (sprint-593): ## Sprint sprint-593 Learnings
- F2c katalog/mount maskeleme (flag-gated): GO_WITH_TECH_DEBT — WHAT LANDED
- src/core...
- **Sprint sprint-592 Learnings** (sprint-592): ## Sprint sprint-592 Learnings
- cursor Docker imaj-dilimi (INSTALL_CURSOR): GO_WITH_TECH_DEBT — Added `ARG INSTALL_C...
- **Sprint sprint-591 Learnings** (sprint-591): ## Sprint sprint-591 Learnings

## Gains
- 591-001 — cost-gate kullanıcı-metinleri i18n — Moved every human-readable ...
- **Sprint sprint-590 Learnings** (sprint-590): ## Sprint sprint-590 Learnings
- status blocked-satırı — i18n + neden-dürüst ifade: GO_WITH_TECH_DEBT — Moved the 3 h...
- **Sprint sprint-589 Learnings** (sprint-589): ## Sprint sprint-589 Learnings

## Gains
- 589-001 — MCP nervous karar-mesajları i18n — Scanned src/mcp/tools/nervous...

## Active Technical Debt
_No active technical debt._

## Active Patterns
- Violation pattern: stale_heartbeat (×47 sprints)
- Violation pattern: file_outside_scope (×21 sprints)
- Violation pattern: doc_sync_ground_truth_mismatch (×12 sprints)
- FIX lineage and post-FIX pause contract

_Total entries: 2097 | Generated: 2026-08-21_