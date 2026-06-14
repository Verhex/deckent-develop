# Deckent Lifecycle & Architecture Diagrams

Visual reference for the sprint lifecycle phases and the module layer map.
Source of truth: `docs/reference/api-surface.md` and `DECKENT.md`.

---

## Sprint Lifecycle

```mermaid
flowchart TD
    PLAN["**1 · PLAN**\nBrain reads DIRECTIVES\nCreates task JSON files in .tasks/"]
    SPAWN["**2 · SPAWN**\nWorkers launched via tmux / subprocess\nAuditor scan loop starts"]
    WAVE_BUILD["**2a · WAVE_BUILD** ★\nKahn topological sort\nDependency waves built in parallel\n_(when dependency_pipeline_enabled = true — ADR-045)_"]
    EXECUTE["**3 · EXECUTE**\nWorkers run their tasks\nWrite heartbeat .hb files"]
    EVALUATE["**4 · EVALUATE**\nBrain collects .result files\nDecision: GO · NO-GO · TECH_DEBT"]
    FIX["**5 · FIX**\nFailed tasks retried\n_(configurable timeout)_"]
    RETRO["**6 · RETRO**\nRetrospective written\nto memory.db"]
    DECAY["**7 · DECAY**\nMemory trimmed if\n.brain/ exceeds budget"]
    CLEANUP["**8 · CLEANUP**\nTask files archived\nLocks released · Session closed"]

    PLAN --> SPAWN
    SPAWN -.->|"dependency_pipeline_enabled = true"| WAVE_BUILD
    WAVE_BUILD --> EXECUTE
    SPAWN -->|"dependency_pipeline_enabled = false"| EXECUTE
    EXECUTE --> EVALUATE
    EVALUATE -->|"failures"| FIX
    EVALUATE -->|"all pass"| RETRO
    FIX --> RETRO
    RETRO --> DECAY
    DECAY --> CLEANUP

    style WAVE_BUILD fill:#fffde7,stroke:#f9a825,stroke-dasharray:5
```

*Eight sequential phases; WAVE_BUILD (2a) is a conditional sub-step of SPAWN that groups tasks into parallel dependency waves when the pipeline is enabled.*

---

## Architecture Layer Map

```mermaid
graph TD
    subgraph entry["User Entry Points"]
        CLI["**cli/**\n55+ commands · helpers · entry point"]
        MCP_S["**mcp/**\n34 tools · 8 resources · stdio transport"]
        API_S["**api/**\nHTTP API · SSE · rate limiting"]
    end

    subgraph orch["orchestra/  ·  Sprint Lifecycle & Routing  (76 modules)"]
        BRAIN["Brain · Sprint Controller"]
        PLANNER["Planner · Task Builder · Task Router · Evaluator"]
    end

    subgraph found["core/  ·  Foundation  (90 modules)"]
        TYPES["Types · Config (3-layer merge) · Model Registry"]
        POOLS["Agent Pool · Skill Registry · Routing Engine"]
        MEMORY["Memory V2 — SQLite FTS5 · dual-layer i18n normalize"]
    end

    AGENTS["**agents/**\nWorker execution\nPrompt engineering  (20 modules)"]
    NERVOUS["**nervous/**\nProactive meta-orchestrator\nObserver · Detector · Proposer"]
    MONITOR["**monitor/**\nAuditor scan loop\nDashboard state manager"]
    PROVIDERS["**providers/**\nClaude · Codex · Gemini adapters  (5 modules)"]
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
