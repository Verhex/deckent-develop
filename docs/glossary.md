# Deckent Glossary

| Term | Definition |
|------|------------|
| **Brain** | The central orchestrator that plans tasks, assigns models, evaluates results, and learns across sprints via SQLite memory. |
| **Worker** | An autonomous AI agent that executes assigned tasks in parallel within a defined file scope. |
| **Auditor** | A quality-gate monitor that scans heartbeats, detects scope violations, and flags boundary breaches in real time. |
| **Sprint** | A structured eight-phase lifecycle: PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP. |
| **DIRECTIVES** | The markdown file where users declare sprint goals and task specifications before execution begins. |
| **Scope** | The set of directories and files a Worker is permitted to read and write during its assigned task. |
| **Heartbeat** | A periodic status signal written by Workers so the Auditor can detect stale or stuck processes. |
| **Tier** | A provider-agnostic model capability level (premium_plus, premium, standard, economy) used for cost-quality tradeoffs. |
| **Provider** | The underlying LLM backend (Claude, Codex, Gemini, or Ollama) that powers Brain and Worker reasoning. |
| **ADR** | Architecture Decision Record — a documented, versioned design choice stored in the memory database and enforced across sprints. |
