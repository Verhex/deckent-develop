# Deckent Lifecycle & Architecture Diagrams

Visual reference for the sprint lifecycle phases and the module layer map.
Source of truth: `docs/reference/api-surface.md` and `DECKENT.md`.

---

## Sprint Lifecycle

```mermaid
flowchart TD
    DIRECTIVE["**0 · DIRECTIVE**\nSprint initialized\nBrain reads DIRECTIVES.md\nInitial SprintPhase before PLAN"]
    PLAN["**1 · PLAN**\nBrain reads DIRECTIVES\nCreates task JSON files in .tasks/"]
    SPAWN["**2 · SPAWN**\nWorkers launched via tmux / subprocess\nAuditor scan loop starts\nHeartbeatDaemon starts (default-on)"]
    WAVE_BUILD["**2a · WAVE_BUILD** ★\nKahn topological sort\nDependency waves built in parallel\n_(when dependency_pipeline_enabled = true — ADR-045)_"]
    EXECUTE["**3 · EXECUTE**\nWorkers run their tasks\nWrite heartbeat .hb files"]
    EVALUATE["**4 · EVALUATE**\nBrain collects .result files\nDecision: GO · NO-GO · TECH_DEBT"]
    FIX["**5 · FIX**\nFailed tasks retried\n_(configurable timeout)_"]
    RETRO["**6 · RETRO**\nRetrospective written\nto memory.db"]
    DECAY["**7 · DECAY**\nMemory trimmed if\n.brain/ exceeds budget"]
    COMPLETE["**8 · COMPLETE**\nTask files archived\nLocks released · Session closed\nSprintPhase.COMPLETE emitted"]

    DIRECTIVE --> PLAN
    PLAN --> SPAWN
    SPAWN -.->|"dependency_pipeline_enabled = true"| WAVE_BUILD
    WAVE_BUILD --> EXECUTE
    SPAWN -->|"dependency_pipeline_enabled = false"| EXECUTE
    EXECUTE --> EVALUATE
    EVALUATE -->|"failures"| FIX
    EVALUATE -->|"all pass"| RETRO
    FIX --> RETRO
    RETRO --> DECAY
    DECAY --> COMPLETE

    style WAVE_BUILD fill:#fffde7,stroke:#f9a825,stroke-dasharray:5
```

*Nine sequential phases (0–8); WAVE_BUILD (2a) is a conditional sub-step of SPAWN that groups tasks into parallel dependency waves when the pipeline is enabled.*

> **SprintPhase enum note** (`src/core/sprint-types.ts`): The canonical enum values are `DIRECTIVE · PLAN · SPAWN · EXECUTE · EVALUATE · FIX · RETRO · DECAY · TRANSITION · COMPLETE`. `TRANSITION` is the inter-phase state emitted by `emitPhaseChange()` between each arrow above — it does not appear as a sequential node in the diagram. The terminal state after DECAY is `COMPLETE` (not `CLEANUP`; `CLEANUP` is a code-comment label for the operations that run inside the COMPLETE phase).

---

## Architecture Layer Map

```mermaid
graph TD
    subgraph entry["User Entry Points"]
        CLI["**cli/**\n55+ commands · helpers · entry point"]
        MCP_S["**mcp/**\n35 tools · 8 resources · stdio transport"]
        API_S["**api/**\nHTTP API · SSE · rate limiting"]
    end

    subgraph orch["orchestra/  ·  Sprint Lifecycle & Routing  (94 modules)"]
        BRAIN["Brain · Sprint Controller"]
        PLANNER["Planner · Task Builder · Task Router · Evaluator"]
    end

    subgraph found["core/  ·  Foundation  (148 modules)"]
        TYPES["Types · Config (3-layer merge) · Model Registry"]
        POOLS["Agent Pool · Skill Registry · Routing Engine"]
        MEMORY["Memory V2 — SQLite FTS5 · dual-layer i18n normalize"]
    end

    AGENTS["**agents/**\nWorker execution\nPrompt engineering  (25 modules)"]
    NERVOUS["**nervous/**\nProactive meta-orchestrator\nObserver · Detector · Proposer"]
    MONITOR["**monitor/**\nAuditor scan loop\nDashboard state manager"]
    PROVIDERS["**providers/**\nClaude · Codex · Gemini · Ollama · OpenAI-compatible adapters  (7 modules)"]
    DASH["**dashboard/**\nReact + Vite + Tailwind\n16 pages"]

    CLI --> orch
    MCP_S --> orch
    API_S --> orch
    API_S --> DASH
    orch --> found
    orch --> AGENTS
    orch --> NERVOUS
    orch --> MONITOR
    orch --> PROVIDERS
```

*One-way dependency rule (ADR-008): `cli` → `orchestra` → `core`. Only `orchestra` imports from `agents`, `monitor`, `nervous`, and `providers`; `core` never imports from `orchestra`.*
