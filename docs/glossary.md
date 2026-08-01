# Deckent Glossary

| Term | Definition |
|------|------------|
| **Brain** | The central orchestrator that plans tasks, assigns models, evaluates results, and learns across runs via SQLite memory. |
| **Worker** | An autonomous AI agent that executes assigned tasks in parallel within a defined file scope. |
| **Auditor** | A quality-gate monitor that scans heartbeats, detects scope violations, and flags boundary breaches in real time. |
| **Run** | A structured eight-phase lifecycle: PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → COMPLETE (cleanup is a separate command, not a phase). (Deckent now uses 'run' terminology; 'sprint' remains as a backward-compatibility alias in internal identifiers and configuration.) |
| **Wave** | A dependency-ordered batch of tasks that execute in parallel within a run. Determined by Kahn's topological sort on the task dependency graph. When a wave completes, the next wave is unblocked. Controlled by `dependency_pipeline_enabled`. (ADR-045) |
| **TaskDNA** | A typed descriptor computed from a task's scope, description, and metadata. Contains intent classification, domain weights, operation types, and complexity metrics. Used by the v2 routing engine to select provider, agent, and skills. Defined in `src/core/routing-types.ts`. |
| **Memory V2** | The SQLite DB-first memory subsystem (ADR-088). Stores knowledge entries (ADRs, learnings, decisions, debt, patterns) in `.brain/memory.db` with FTS5 full-text search and dual-layer Turkish/English normalization. The `.brain/exports/*.md` files are generated snapshots — the DB is the single source of truth. |
| **Nervous** | The proactive meta-orchestrator layer (`src/nervous/`, ADR-040). Continuously observes run state, detects anomalies via a pluggable detector registry, and proposes corrective actions to Brain — it never executes changes directly. Pipeline: observer → detector-registry → decision-engine → proposer → dispatcher → executor. |
| **DIRECTIVES** | The markdown file where users declare run goals and task specifications before execution begins. |
| **Scope** | The set of directories and files a Worker is permitted to read and write during its assigned task. |
| **Heartbeat** | A periodic status signal written by Workers so the Auditor can detect stale or stuck processes. |
| **Tier** | A provider-agnostic model capability level (premium_plus, premium, standard, economy) used for cost-quality tradeoffs. |
| **Provider** | The underlying LLM backend (Claude, Codex, Gemini, or Ollama) that powers Brain and Worker reasoning. |
| **ADR** | Architecture Decision Record — a documented, versioned design choice stored in the memory database and enforced across runs. |
