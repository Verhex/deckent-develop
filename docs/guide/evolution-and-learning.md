# Evolution & Learning

Deckent improves with each sprint through four interconnected systems: the **outcome tracker**, **agent/skill performance stats**, the **promotion pipeline**, and **Memory V2**. Together they form a self-improving loop — the results of every sprint feed directly into the routing and agent selection of the next one.

---

## Outcome Tracker

After Brain evaluates each task result (`DONE`, `GO_WITH_TECH_DEBT`, or `NO_GO`), it calls `recordOutcome()` in `src/orchestra/outcome-tracker.ts`. This function:

- Records the task's evaluation, assigned agent, skills, quality score, and coverage.
- Updates cumulative performance counters for that agent and each skill used.
- Updates the **synergy matrix** — tracking which agent+skill and skill+skill pairs succeed or conflict.
- Optionally stores a skill adaptation suggestion from `adaptAgentRuntime()`.

Outcomes are persisted in two locations under `.deckent/routing/`:

| File | Contents |
|------|----------|
| `learnings.json` | Aggregated agent/skill performance, synergy matrix, evolved routing rules |
| `outcomes/{sprintId}.json` | Raw per-task outcomes for that sprint |

At the start of the next sprint's PLAN phase, the routing engine calls `calculateBonuses(taskDNA)` to read these learnings and apply score adjustments to agent/skill candidates before routing decisions are made.

---

## Agent & Skill Performance Stats

`learnings.json` stores an `EntityPerformance` record for every agent and skill that has been used:

| Field | Description |
|-------|-------------|
| `totalTasks` | Total tasks assigned |
| `successCount` / `failCount` | Outcome tally |
| `successRate` | `successCount / totalTasks` (0–1) |
| `avgQualityScore` | Average rubric score across tasks (0–100) |
| Intent breakdowns | Per-intent success rates (e.g., `feature`, `bug_fix`, `docs`) |

The **synergy matrix** tracks agent+skill and skill+skill pair verdicts: `synergy`, `neutral`, `redundant`, or `conflict`. A conflicting pair scores negatively in routing; a synergistic pair gets a bonus.

When routing a new task, `calculateBonuses()` applies recency-weighted bonuses:

- A success in one of the **last 3 sprints**: `+3` score bonus.
- A failure in one of the **last 3 sprints**: `-2` score penalty.
- Older outcomes decay in influence automatically.

The result is that agents and skills with consistent recent success bubble up in routing, while underperformers are deprioritized — without any manual tuning.

---

## Temp → Permanent Promotion Pipeline

Deckent supports temporary agents and skills created during sprints (e.g., from `temp-skill-generator.ts`). The **promotion pipeline** (`src/orchestra/promotion-pipeline.ts`) evaluates them at sprint boundaries.

### Promotion Criteria

A temp agent or skill is eligible for permanent status when it meets all three thresholds:

| Criterion | Threshold |
|-----------|-----------|
| Minimum tasks assigned | 8 |
| Minimum success rate | 85% |
| Minimum sprints active | 3 |

`evaluatePromotions(tracker)` scans all learned entities and returns `PromotionResult[]` with action `'promote'` or `'wait'`. Calling `promote(entityId, entityType)` copies the agent from `.deckent/agents/temp-{id}/` to `.deckent/agents/{id}/` (or the equivalent skill path) and sets its source to `'user'`.

Built-in agents (source `'builtin'`) are never promoted or demoted — the guard is checked before any action.

### Demotion & Retirement

Underperforming permanent entities are evaluated by `evaluateDemotions()`:

| Criterion | Threshold |
|-----------|-----------|
| Fail rate | > 50% |
| Minimum tasks before demotion eligible | 5 |
| Unused for N sprints | 5 |

`demote()` sets `enabled: false` on the manifest and passes the entity to `AgentRetirement`, which performs a final evaluation — high-success agents may be preserved even if recently underused.

### Identity Mutation (F5-008)

The promotion pipeline also runs an **identity mutation loop** for agents that have accumulated enough sprint history. `runIdentityMutation()` calls `adaptAgentRuntime()` to suggest prompt or skill repertoire changes based on recent task outcomes.

By default (`requiresApproval: true`), mutations are **proposals only** — they are written to the retro and memory, but not applied automatically. A human or Brain approval step is required before a mutated variant is activated. Each mutation is tracked via `AgentGenealogy`, so the lineage of every agent (parent, mutation type, sprint) is preserved.

---

## Memory V2: Learnings & Retro

All sprint knowledge is persisted in the **Memory V2 SQLite database** at `.brain/memory.db`. This is the single source of truth; the `.md` files under `.brain/exports/` are generated snapshots.

### What Gets Written

| Entry Type | When | Written By |
|------------|------|------------|
| `memory` | End of each sprint (RETRO phase) | `sprint-retro-writer.ts` via `buildRetroLearnings()` |
| `retro` | End of each sprint | `writeRetrospective()` — upserted per sprint ID |
| `adr` | When architectural decisions are made | Brain (explicit insert) |
| `pattern` | When the Auditor detects a recurring violation | Auditor (upsert semantics) |
| `debt` | When a task closes as `GO_WITH_TECH_DEBT` | Brain evaluation phase |

### What Retro Contains

A retro entry (`type: 'retro'`) for a sprint includes:

- Highlights: tasks that completed successfully and what they achieved.
- Issues: tasks that failed or were deferred, with root cause notes.
- Learnings: `buildRetroLearnings()` captures what routing decisions worked, which agents performed above or below expectation, and any config suggestions generated by `generateConfigSuggestions()`.
- Prompt evolution suggestion (if `collectPromptEvolutionSuggestion()` finds improvement candidates).
- Specialization drift report (if any agent handled tasks outside its defined specialization).

### Memory Query

At the start of every sprint (PLAN phase), Brain auto-queries the memory DB for relevant ADRs, past learnings, and open debt items using `searchMemory()` (FTS5 full-text search with dual-layer Turkish normalization). This ensures the planner sees context from previous sprints without manually reading every file.

From the CLI:

```bash
# Search memory
deckent recall "routing failure codex"

# Add a note
deckent remember "prefer sonnet over haiku for refactor tasks"

# Export .md snapshots from DB
deckent memory export

# Show memory stats
deckent memory stats
```

---

## How It Comes Together

The learning loop runs inside every sprint lifecycle:

```
EXECUTE → EVALUATE → (record outcomes, update learnings.json)
       → RETRO    → (write memory + retro to memory.db, run promotion pipeline)
       → DECAY    → (trim old low-priority entries from memory.db)
       → CLEANUP
       → next PLAN → (calculateBonuses, auto-query memory, route with updated scores)
```

No configuration is required — the loop runs automatically. The effect compounds: agents and skills that consistently succeed get routed more often, while underperformers are progressively deprioritized and eventually demoted. Recurring violation patterns written by the Auditor feed into retro and prevent the same mistakes in future sprints.

The evolution systems are designed to be **advisory first**: promotion proposals, mutation suggestions, and config recommendations all surface through the retro and memory, giving the team visibility before any change is applied automatically.
