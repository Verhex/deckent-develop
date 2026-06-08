# ADR Index

Architecture Decision Records (ADRs) capture the significant architectural decisions made in Deckent. Each ADR documents the context, the decision itself, and its consequences.

**Where ADRs live:** The single source of truth is `.brain/memory.db` (SQLite, `type='adr'`). The human-readable export is `.brain/exports/decisions.md` (regenerated each sprint via `deckent memory export`). This index is derived from that export.

**Format:** MADR v3 hybrid. Every ADR carries `**Status:**` — one of `accepted`, `deprecated`, `superseded`, `proposed`, `rejected`.

**ADR governance:** ADR-036. Mandatory read wired to `.claude/rules/brain.md` and `.claude/rules/worker-default.md`.

---

## Foundation & Toolchain

| ID | Title | Status | Summary |
|----|-------|--------|---------|
| ADR-001 | TypeScript + ESM | accepted | Use TypeScript with `"type": "module"` (ESM) as the project foundation |
| ADR-002 | Node16 Module Resolution | accepted | Use `"module": "Node16"` / `"moduleResolution": "Node16"` in tsconfig; `.js` extensions mandatory |
| ADR-003 | vitest over Jest | accepted | Use vitest for all testing |
| ADR-004 | 3-Layer Config Merge | accepted | Config merges in 3 layers: hardcoded defaults → `~/.deckent/config.json` → `.deckent/config.json` |
| ADR-005 | Synchronous I/O | deprecated | Wave 2 modules used synchronous I/O (superseded; async preferred) |
| ADR-006 | spawnSync Security Pattern | accepted | All shell commands use `spawnSync(binary, [...args])`; shell interpretation disabled |
| ADR-007 | SpawnOptions Interface | accepted | `SpawnOptions { allowedTools?, autoApprove? }` defined in tmux module for controlled spawning |

## Core Architecture

| ID | Title | Status | Summary |
|----|-------|--------|---------|
| ADR-008 | Brain Merkezi Import — Tek Yönlü Bağımlılık | accepted | Brain is the ONLY module that imports tmux/auditor/worker; no reverse imports |
| ADR-009 | DEBT.md Markdown Tablo Formatı | accepted | DEBT.md stored as 9-column markdown table; `parseDebtTable`/`generateDebtTable` for programmatic I/O |
| ADR-010 | Tek Runtime Dependency — commander.js | accepted | CLI uses only `commander@^13` as runtime dependency; any addition requires an ADR |
| ADR-011 | node:readline/promises — Built-in Prompt | accepted | Interactive prompts (text, select, confirm) use Node.js built-in `readline/promises` |
| ADR-012 | register\<Name\>(program) Pattern | accepted | Each CLI command module exports `register<Name>(program: Command): void` |

## Configuration & Adapters

| ID | Title | Status | Summary |
|----|-------|--------|---------|
| ADR-013 | DECKENT.md Adapter Pattern | accepted | `DECKENT.md` = single source of truth; `CLAUDE.md`/`AGENTS.md` are adapter files that only `@DECKENT.md` inject |
| ADR-014 | .deck Secret File System | accepted | `DECKENT_`-prefixed secrets stored in `.deck` file; auto-added to `.gitignore` on init |

## Sprint Orchestration & Routing

| ID | Title | Status | Summary |
|----|-------|--------|---------|
| ADR-015 | TaskRouter Module — 6-level routing | accepted | Standalone `TaskRouter` with 6-level priority: config → force → agent → skill → worker → fallback |
| ADR-016 | Connector Module — provider lifecycle | accepted | `Connector` class manages provider runtime health check, lazy init, and auditor integration |
| ADR-017 | MCP-Native Provider Adapters | accepted | Real CLI adapters: `codex exec --full-auto` and `gemini -p --output-format json` |
| ADR-018 | Multi-Environment Config Generation | accepted | Per-environment config generators: Codex → `config.toml`, Gemini → `settings.json`, Cursor → `mcp.json` |
| ADR-019 | Language-Agnostic Worker Verify | accepted | `STACK_COMMANDS` map enables correct build/test commands for Python/Go/Rust/Node.js projects |
| ADR-020 | Rich Sprint Output — 7-section summary | accepted | Sprint finalization produces a 7-section structured summary including agent/skill performance |

## Brand & CLI/MCP Parity

| ID | Title | Status | Summary |
|----|-------|--------|---------|
| ADR-021 | Kraken ASCII Brand Identity | accepted | Kraken mascot with teal body (#4DB8A4), bold-gold DECKENT text (#C4A855) |
| ADR-022 | CLI/MCP Feature Parity | accepted | Infrastructure/terminal-only CLI commands are excluded from MCP; all other commands have full parity |

## Architecture Refactoring

| ID | Title | Status | Summary |
|----|-------|--------|---------|
| ADR-023 | Plan Tier Generalizasyonu — Provider-Agnostic Tier İsimleri | accepted | Tier names generalized to `premium_plus`, `premium`, `standard`, `economy` across all providers |
| ADR-024 | sprint-controller.ts God Object Split | accepted | Sprint phases extracted to `sprint-phases.ts`; `runSprint()` refactored into 7 discrete phase functions |
| ADR-025 | Graceful Shutdown Stratejisi | accepted | SIGINT calls `interruptActiveSprint()` for clean worker termination before process exit |
| ADR-026 | God Object Split Stratejisi — Faz 1-3 | accepted | 3-phase incremental split completed; `sprint-controller.ts` reduced from 1890 to 209 LoC |

## Backend & Routing Engine

| ID | Title | Status | Summary |
|----|-------|--------|---------|
| ADR-027 | Hybrid Spawn Backend | accepted | Single-backend selection via `SpawnBackendFactory` (docker → tmux → subprocess fallback); hybrid mode rejected |
| ADR-028 | Decision-Engine V1 → V2 Routing Migration | accepted | V1 preserved with `@deprecated`; V2 (`routeTaskV2`) is canonical: intent-classifier → activation-engine → routing-engine |

## Managed Docs & i18n

| ID | Title | Status | Summary |
|----|-------|--------|---------|
| ADR-029 | Managed-Docs Universalization | accepted | `src/orchestra/managed-docs/` enables template-based document generation tied to the sprint lifecycle |
| ADR-030 | Template Engine + Plugin Loader | accepted | Two-layer extensibility: `{{placeholder}}` template renderer + JSON/MJS plugin loader in `.deckent/generators/` |
| ADR-031 | Content Hash Cache | accepted | Dual-key SHA-1 cache (entryHash + fileHash) skips doc regeneration when neither config nor content changed |
| ADR-032 | i18n Pattern System | accepted | Two-layer i18n: `patternsByLang` for section header matching + `I18nStrings` for generated content (TR/EN) |

## Product Vision & Security

| ID | Title | Status | Summary |
|----|-------|--------|---------|
| ADR-033 | Product Vision — Product Not Service | accepted | Deckent is a local product: no SaaS, no cloud hosting, free, open-source, install-and-run |
| ADR-034 | Multi-Project Isolation — Per-Project Security Boundaries | accepted | 4-layer isolation: per-project dirs, AES-256-GCM credentials, symlink-aware scope, cross-project ref prevention |

## Verification & Governance

| ID | Title | Status | Summary |
|----|-------|--------|---------|
| ADR-035 | Brain ↔ Worker ↔ Auditor Verification Protocol Standard | accepted | Versioned message protocol V1.0 with append-only event stream (`.deckent/sprint-NNN-events.jsonl`) |
| ADR-036 | ADR Governance Integration | accepted | MADR v3 hybrid format; ADR compliance mandatory in brain/worker prompts; `npm run lint:adr` CI gate |
| ADR-037 | Brain-Auditor-Worker Authority Matrix — RBAC V1.0 | accepted | Formal RBAC matrix (least privilege, separation of duties, fail-closed); Layer 1+3 active, Layer 2 advisory |

## Dead Code & Self-Protection

| ID | Title | Status | Summary |
|----|-------|--------|---------|
| ADR-038 | Dead Code Disposition — Sprint 139 Audit Results | accepted | 4-tier disposition for ~1042 LoC dead code: remove, archive, keep-dormant, refactor |
| ADR-039 | Self-Modifying Task Detection | accepted | `self-modifying-detector.ts` distinguishes deckent's own repo from user projects to block self-modification bugs |

## Nervous System & Agent Taxonomy

| ID | Title | Status | Summary |
|----|-------|--------|---------|
| ADR-040 | Nervous System Architecture — Proactive Meta-Orchestrator | accepted | `src/nervous/` proactive meta-layer: observer, detector-registry, decision-engine, proposer, dispatcher |
| ADR-041 | Agent Taxonomy — Horizontal Skills vs Vertical Agents | accepted | Testing agents removed; test work is skill-based; vertical agents reserved for domain expertise |

## Hybrid Mode & Recovery

| ID | Title | Status | Summary |
|----|-------|--------|---------|
| ADR-042 | Hybrid Mode Architecture — Sprint + Task Dual Modes | accepted | Sprint Mode (developer orchestration) and Task Mode (single-task assistant) as dual modes on the same core |
| ADR-043 | Brain Crash Recovery Protocol | accepted | Three-sprint (160–162) recovery fix: negative `durationMs` bug, sprint-state resume, checkpoint interval |

## Observability & Execution

| ID | Title | Status | Summary |
|----|-------|--------|---------|
| ADR-044 | Sprint State Observability Contract | accepted | Sprint state machine contract: `.dashboard` file, event stream, structured phase transitions |
| ADR-045 | Wave-Based Execution Semantics | accepted | Dependency-aware wave execution via Kahn's topological sort; `dependency_pipeline_enabled` defaults `true` |
| ADR-046 | Brain Self-Update Hook Architecture | accepted | Brain self-update step-ordering contract; Sprint 166 `ADR-046 Step Ordering Contract` |

## Dispatch & Lifecycle

| ID | Title | Status | Summary |
|----|-------|--------|---------|
| ADR-047 | Manuel Subagent Dispatch Protocol | accepted | Manual subagent dispatch with explicit approval; deckent-dev project manages waves manually |
| ADR-048 | Prompt Lifecycle Contract | accepted | Prompt lifecycle stages: build → inject → dispatch → evaluate with defined field ownership |

## Task Types & Scoring

| ID | Title | Status | Summary |
|----|-------|--------|---------|
| ADR-053 | TaskType Taxonomy | accepted | Three task types: `Audit`, `Document-Write`, `Code-Development` with routing and skill-selection implications |
| ADR-055 | Hybrid Scoring 5-Layer Pipeline | proposed | 5-layer quality scoring: schema validation → gates → quality → outcome → auditor override |

## Self-Awareness & Methodology

| ID | Title | Status | Summary |
|----|-------|--------|---------|
| ADR-060 | Self-Awareness Propagation — 5-Channel Context Enrichment | proposed | 5-channel agent context: sprint-state, ADR-context, skill-profile, task-history, nervous-alerts |
| ADR-061 | AEGIS — Agentic Effect-Governed Iterative Stewardship | proposed | Systematic agentic execution methodology: plan → act → verify → steward loop |

## Infrastructure & Enterprise

| ID | Title | Status | Summary |
|----|-------|--------|---------|
| ADR-062 | Embedded Web Terminal | accepted | PTY sessions, WebSocket gateway, auth & audit for embedded terminal in dashboard |
| ADR-063 | Consent-Based Prerequisite Provisioning | accepted | User-consented installation of prerequisites (tmux, docker, etc.) via provisioning flow |
| ADR-064 | TOPP — Continuous Dispatch (Wave-Barrier Removal) | accepted | Tasks dispatch immediately when unblocked rather than waiting for full wave completion |
| ADR-065 | Develop / Product Two-Repo Split | accepted | `deckent` (develop repo) and `deckent-product` (release repo) split for clean release boundary |
| ADR-066 | Provider Independence — Multi-Provider Backend Parity | accepted | Claude, Codex, and Gemini are all first-class providers with full feature parity |
| ADR-067 | Process Mode + Tenant Isolation — F3 Foundation | proposed | F3: process isolation modes and per-tenant boundary enforcement |
| ADR-068 | Enterprise Foundation — Audit Query + Multi-Tenant + Scheduled Flows | proposed | Audit query API, multi-tenant support, and scheduled sprint flows for enterprise use cases |
| ADR-069 | Event-Driven Triggers + RBAC — F3 Webhook & F4 RBAC | proposed | F3 webhooks for event-driven task triggers; F4 role-based access control |
| ADR-070 | Brain Evaluation Integrity | accepted | Signal-based coverage exemption; zero hard-code principle for evaluation thresholds |
| ADR-071 | F3 Autonomous Mode + F4 Enterprise RBAC/Tenant/Audit | proposed | Self-dispatch guard for autonomous mode; enterprise RBAC/tenant/audit foundation |

## Routing & Dashboard Evolution

| ID | Title | Status | Summary |
|----|-------|--------|---------|
| ADR-072 | Agent Routing Balance (Multi-Signal Scoring) + Dashboard API Auth Hardening | accepted | Multi-signal scoring prevents agent over-concentration; dashboard API auth hardened |
| ADR-073 | Routing Live Validation + FIX Prompt Enrichment + Dashboard Control Plane | accepted | Routing decisions validated at runtime; FIX prompts enriched with context; dashboard control plane added |
| ADR-074 | Native Chat Real Round-Trip + Enterprise RBAC/Audit/Rate + F5 Evolution Wire | accepted | Native chat with real LLM round-trip; enterprise rate/RBAC/audit; F5 feature evolution wired |
| ADR-075 | F5 Evolution Runtime Wiring + Routing Skill→Agent Affinity + Managed-Docs Code-Derived Counts | accepted | Skill→Agent affinity routing live; managed-docs counts derived from actual code metrics |

## Auth & Multi-Provider

| ID | Title | Status | Summary |
|----|-------|--------|---------|
| ADR-076 | Auth-Precedence Fix + User-Facing Surfaces | accepted | Auth order fix for serve/token-inject; Path A chat; VS Code and JetBrains IDE extension integration |
| ADR-077 | Multi-Provider 8-Fleet + OpenAI-Compatible HTTP Adapter | accepted | 8-provider fleet; OpenAI-compatible HTTP adapter for third-party model providers |

## CI & Quality

| ID | Title | Status | Summary |
|----|-------|--------|---------|
| ADR-078 | CI-Hermeticity Standard + 8-Provider Runtime + Active Identity-Mutation Loop + Dashboard God-Level | accepted | Tests must be hermetic (no gitignored state); `test:ci-sim` script reproduces clean-checkout CI environment |
| ADR-079 | Proof-of-Function DoD — Tier-0/Tier-1 Classification + Sprint-Inner Run-Verify Gate | accepted | User-surface tasks (Tier-1) require real-binary smoke test; mock-only = `GO_WITH_TECH_DEBT`, never `DONE` |

## Dashboard & Native CLI

| ID | Title | Status | Summary |
|----|-------|--------|---------|
| ADR-080 | Dashboard God-Level — Sprint-Start Detach + Hollow-Page Wire + Chat Round-Trip + Native UI | accepted | Sprint-start detaches from dashboard process; hollow-page routing wired; full native dashboard UI |
| ADR-081 | Native Agentic Deckent — `deckent` argümansız REPL + Agentic Tool-Use + F2 Streaming | accepted | `deckent` (no args) launches interactive REPL; agentic tool-use; F2 real-time streaming; Agentic-OS direction |
| ADR-082 | Native-LLM-Wire + Nervous-Activation + Dashboard-v2 Canlı | accepted | Native LLM provider wire; Nervous System activation in production; Dashboard v2 live |
| ADR-083 | REPL-UX-Evolution + Provider-Parity + Local-Model-Foundation | accepted | REPL UX polish; full provider parity across Claude/Codex/Gemini; local model (Ollama) foundation |
| ADR-086 | Native CLI Parity — F11 Feature Set (Sprint 224) | accepted | Complete CLI feature parity for the F11 feature set delivered in Sprint 224 |

---

*Source: `.brain/memory.db` (`type='adr'`) — export: `.brain/exports/decisions.md` — generated: 2026-06-08*
