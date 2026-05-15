# API Surface Contract

*This file defines inter-agent contracts. Brain creates, all agents read.*

## .tasks/ File Format (JSON)

Each task is stored as `.tasks/task-{id}.json`:
```json
{
  "id": "001-001",
  "title": "string",
  "description": "string",
  "model": "opus | sonnet | haiku | gpt-5 | gpt-4.1 | gpt-5-mini | gemini-2.5-pro | gemini-2.5-flash",
  "effort": "low | normal | high",
  "priority": "CRITICAL | HIGH | NORMAL | LOW",
  "reason": "string",
  "scope": {
    "directories": ["string[]"],
    "filesRead": ["string[]"],
    "filesWrite": ["string[]"]
  },
  "dependencies": ["string[]"],
  "goNogo": {
    "goCriteria": "string",
    "noGoCriteria": "string",
    "techDebtAcceptable": "string"
  },
  "status": "DRAFT | PENDING | CLAIMED | EXECUTING | TESTING | DOCUMENTING | DONE | NO_GO | PAUSED",
  "sprintId": "sprint-NNN",
  "createdAt": "ISO 8601",
  "assignedAgent": "string (agent id or 'generic')",
  "assignedSkills": ["string[] (skill ids)"],
  "provider": "claude | codex | gemini",
  "forceModel": "opus | sonnet | haiku (optional — set when DIRECTIVES specifies model)",
  "forceEffort": "low | normal | high (optional — set when DIRECTIVES specifies effort)",
  "forceAgent": "string (optional — agent id override from DIRECTIVES or AI planner)",
  "forceSkills": ["string[] (optional — skill id overrides from DIRECTIVES or AI planner)"],
  "excludeAgent": ["string[] (optional — agent ids to exclude from routing, forceSkills still apply)"],
  "excludeSkills": ["string[] (optional — skill ids to exclude from routing)"],
  "routingMeta": {
    "taskDNA": "object (optional — TaskDNA used for v2 routing decisions)",
    "confidence": "string (optional — routing confidence score)",
    "routingVersion": "v1 | v2 (optional — routing engine version used)"
  }
}
```

## Result File Format

Each completed task writes `.tasks/task-{id}.result`:
```json
{
  "taskId": "001-001",
  "filesChanged": ["src/file.ts", "tests/file.test.ts"],
  "linesAdded": 120,
  "linesRemoved": 30,
  "testsPassed": true,
  "coverage": 95.2,
  "selfAssessment": "DONE | GO_WITH_TECH_DEBT | NO_GO",
  "notes": "Brief summary of what was done",
  "tokenUsage": {
    "inputTokens": 15420,
    "outputTokens": 3200,
    "cacheReadTokens": 89000,
    "provider": "claude",
    "model": "opus"
  },
  "rubricScores": {
    "correctness": 90,
    "test_coverage": 85,
    "scope_compliance": 100,
    "documentation": 70
  },
  "evaluationDecision": "DONE | GO_WITH_TECH_DEBT | NO_GO"
}
```

## Sprint Phases

Sprint lifecycle follows these phases in order:
1. **PLAN** — Brain reads DIRECTIVES, plans tasks, writes task JSON files
2. **SPAWN** — Workers spawned via tmux or subprocess, auditor scan loop starts
2a. **WAVE_BUILD** — When `dependency_pipeline_enabled: true` (default since Sprint 156, confirmed Sprint 169 H5), tasks are sorted into dependency waves via Kahn's topological algorithm; each wave runs in parallel, subsequent waves unblock only after all blocking tasks reach DONE. ADR-045.
3. **EXECUTE** — Workers execute tasks, write heartbeats (.hb files)
4. **EVALUATE** — Brain waits for results, evaluates (GO/NO-GO/TECH_DEBT)
5. **FIX** — Failed tasks retried (optional, configurable timeout)
6. **RETRO** — Retrospective written to RETRO.md
7. **DECAY** — Memory trimmed if .brain/ exceeds budget
8. **CLEANUP** — Task files archived, locks released, sprint complete

## Worker Scope Rules

- Workers MUST stay within `scope.directories` and `scope.filesWrite`
- Workers MAY read any file in `scope.filesRead`
- Boundary violations are detected by Auditor via `git diff --stat`

## .brain/ File Formats

### Memory V2 — DB-First (Primary)

All memory operations go through SQLite DB. Markdown files are generated exports.

- `memory.db`: SQLite database — **single source of truth** for all brain knowledge
- `exports/summary.md`: Auto-generated context summary (loaded via @ reference, ~4K chars)
- `exports/decisions.md`: Auto-generated ADR list for git diff/review
- `exports/memory.md`: Auto-generated sprint learnings
- `exports/debt.md`: Auto-generated debt table

### Memory V2 DB Schema

```sql
-- entries: main knowledge table (ADR, memory, sprint, debt, pattern, retro, identity)
-- tags: normalized many-to-many tag association
-- relations: cross-reference (references, supersedes, caused_by, resolves, blocks, depends_on)
-- entry_history: field-level change tracking
-- entries_fts: FTS5 full-text search (8 columns: 4 original + 4 turkishNormalize)
-- schema_version: migration safety
```

### Memory V2 Query API

```typescript
searchMemory(store, {
  text: 'docker heartbeat',          // FTS5 dual-layer search
  type: ['adr', 'memory'],           // filter by entry type
  status: ['accepted'],              // filter by status
  sprint_range: { min: 135 },        // filter by sprint number
  tags_contain: ['security'],        // entries must have ALL tags
  limit: 5,                          // max results
}): MemorySearchResult[]
```

### Legacy .brain/ Files (archived, read-only)

- `archive/pre-v2/DECISIONS.md`: Original 96K ADR file (backup)
- `archive/pre-v2/MEMORY.md`: Original sprint learnings (backup)
- `ERRORS.md`: Error log (still file-based, not in DB)
- `PROJECT-IDENTITY.md`: Still exists as file, also in DB (decay_exempt)
- `sprints/sprint-NNN.md`: Sprint logs (in DB + file)

## Lock File Format

Lock files in `.locks/`: `{filepath-with-__-separators}.lock`
```json
{
  "filePath": "string",
  "ownerWorkerId": "string",
  "acquiredAt": "ISO 8601",
  "taskId": "string"
}
```

## Module Import Rules (ADR-008)

- Brain (sprint-controller) is the ONLY module that imports from tmux, auditor, worker
- Planner imports ONLY from core/ (types, constants) — never from brain
- Auditor reads task files from disk (no brain import)
- Worker reads task files from disk (no brain import)
- Circular dependencies are FORBIDDEN
