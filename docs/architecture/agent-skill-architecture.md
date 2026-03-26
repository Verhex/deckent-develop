# Agent/Skill Architecture & User Experience — Design Document

> **Version:** Draft v1 | **Date:** 2026-03-21 | **Status:** Historical (mostly implemented)
>
> **Note:** This was a design proposal from pre-Sprint 029. Most of the proposals in this document have been implemented across Sprints 029-033 (Agent Pool, Skill System, Brain Decision Engine, UX Polish). For the current architecture, see [architecture.md](architecture.md) and [agents.md](agents.md). This document is preserved as historical reference.
>
> This document analyzes the current Deckent architecture and proposes extensions for dynamic agent pools, composable skills, intelligent Brain decisions, and polished end-user experience.

---

## Table of Contents

1. [Dynamic Agent Pool](#1-dynamic-agent-pool)
2. [Dynamic Skill System](#2-dynamic-skill-system)
3. [Brain Decision Engine](#3-brain-decision-engine)
4. [End-User Experience](#4-end-user-experience)

---

## 1. Dynamic Agent Pool

### 1.1 Current State

Deckent has three hardcoded agent roles defined in `src/core/types.ts:89`:

```typescript
AgentRole = 'brain' | 'auditor' | 'worker'
```

Every task gets a generic `worker` agent. The worker receives the same base prompt structure from `buildWorkerPrompt()` (`src/orchestra/task-builder.ts:161-219`) regardless of whether the task is a security audit, a documentation rewrite, or a database migration. The only differentiation is:

- **Model** (opus/sonnet/haiku) — selected by `resolveTaskModel()` in `src/orchestra/model-selector.ts:117-168`
- **Scope** (directories/files) — parsed from directives by `extractScopeFromDirective()` in `src/orchestra/task-builder.ts:65-86`
- **Effort** (low/normal/high) — derived from model score in `resolveWorkerEffort()` at `task-builder.ts:152-158`

There is no mechanism to:
- Assign specialized prompts/personas to workers based on task type
- Reuse successful agent configurations across sprints
- Create temporary agents for one-off specialized tasks
- Constrain agent tool access beyond scope directories

### 1.2 Target Design

#### Agent Definition Schema (`AgentDefinition`)

```typescript
interface AgentDefinition {
  id: string;                              // e.g., "security-auditor"
  name: string;                            // "Security Auditor"
  description: string;                     // When to use this agent

  // Persona
  systemPrompt: string;                    // Agent-specific system prompt (injected before task prompt)
  expertise: string[];                     // ["security", "authentication", "encryption"]

  // Constraints
  allowedTools: string[];                  // ["Read", "Grep", "Bash"] (subset of all tools)
  deniedTools: string[];                   // ["Write"] for read-only agents
  preferredModel: ModelType;               // Default model preference
  effortMultiplier: number;                // 1.0 = normal, 1.5 = high, 0.5 = low

  // Matching
  triggerKeywords: string[];               // ["security", "auth", "jwt", "csrf", "xss"]
  triggerScopes: string[];                 // ["src/auth/", "src/middleware/"]
  triggerFilePatterns: string[];           // ["*.security.ts", "*.guard.ts"]

  // Lifecycle
  persistent: boolean;                     // true = stays in pool, false = per-sprint temp
  source: 'builtin' | 'user' | 'learned'; // Origin

  // Performance tracking
  stats: {
    totalUses: number;
    successRate: number;                   // DONE / (DONE + NO_GO)
    avgCoverage: number;
    lastUsedInSprint: string;
  };
}
```

#### Directory Structure

```
.deckent/
  agents/                          # Persistent agent pool
    security-auditor/
      agent.json                   # AgentDefinition
      PROMPT.md                    # System prompt template
    test-writer/
      agent.json
      PROMPT.md
    ...8 more builtins...

.tasks/
  agents/                          # Temporary sprint agents
    sprint-031-custom-migrator/
      agent.json
      PROMPT.md
```

#### Built-in Agent Types

| Agent | Trigger Keywords | Preferred Model | Tools |
|-------|-----------------|----------------|-------|
| `security-auditor` | security, auth, jwt, csrf, xss, injection | opus | Read, Grep, Bash |
| `test-writer` | test, coverage, spec, vitest, jest | sonnet | Read, Write, Bash |
| `doc-writer` | docs, readme, changelog, jsdoc, guide | sonnet | Read, Write |
| `code-reviewer` | review, refactor, quality, lint, cleanup | opus | Read, Grep |
| `refactorer` | refactor, rename, extract, split, merge | sonnet | Read, Write, Bash |
| `bug-fixer` | fix, bug, error, crash, regression, broken | opus | Read, Write, Bash |
| `api-builder` | api, endpoint, route, controller, rest, graphql | sonnet | Read, Write, Bash |
| `performance-analyzer` | performance, optimize, speed, memory, profiling | opus | Read, Grep, Bash |

#### Agent Selection Algorithm

```
Input: Task (title, description, scope, keywords)
Output: AgentDefinition | null

1. Extract keywords from task title + description (lowercase, split on space/punctuation)
2. For each agent in pool (persistent + temp):
   a. Score = 0
   b. For each keyword match with agent.triggerKeywords: Score += 2
   c. For each scope overlap with agent.triggerScopes: Score += 3
   d. For each file pattern match with agent.triggerFilePatterns: Score += 1
3. Select agent with highest score (threshold: score >= 3)
4. If no match: use generic worker (current behavior)
5. If multiple tied: prefer agent with higher stats.successRate
```

### 1.3 Files to Create

| File | Purpose |
|------|---------|
| `src/core/agent-pool.ts` | AgentDefinition type, AgentPool class (load, select, save, create temp) |
| `src/core/agent-selector.ts` | selectAgent() algorithm, keyword extraction, scoring |
| `.deckent/agents/*/agent.json` | 8 built-in agent definitions |
| `.deckent/agents/*/PROMPT.md` | 8 built-in agent prompts |
| `tests/core/agent-pool.test.ts` | Pool CRUD tests |
| `tests/core/agent-selector.test.ts` | Selection algorithm tests |

### 1.4 Files to Modify

| File | Change |
|------|--------|
| `src/core/types.ts:89` | Extend `AgentRole` union, add `AgentDefinition` interface |
| `src/orchestra/brain.ts:298` (planSprint) | After task creation, call `selectAgent()` for each task |
| `src/orchestra/task-builder.ts:161` (buildWorkerPrompt) | Prepend agent PROMPT.md content before task prompt |
| `src/agents/worker.ts` | Accept agent context, enforce agent tool constraints |
| `.brain/PATTERNS.md` | Record agent selection outcomes for learning |

### 1.5 Sprint Estimate

**Sprint 30 or 31** — 8-10 tasks, ~2 sprint days
- Task 1: AgentDefinition type + AgentPool class
- Task 2: Agent selector algorithm
- Task 3-4: 8 built-in agent definitions + prompts
- Task 5: brain.ts planSprint integration
- Task 6: task-builder.ts prompt injection
- Task 7: worker.ts agent context
- Task 8: Pattern learning for agent outcomes
- Task 9-10: Tests (50+ tests)

---

## 2. Dynamic Skill System

### 2.1 Current State

The plugin system (`src/core/plugin.ts:1-365`) provides:

- **PluginManifest** (line 9): name, version, description, entrypoint, triggers, permissions, hooks, model, enabled, dependencies
- **SKILL.md** per plugin: Markdown with YAML frontmatter, workflow instructions, rules
- **3 built-in skills**: `doc-writer`, `code-reviewer`, `test-runner` in `.deckent/plugins/`
- **Lifecycle hooks** (`src/core/plugin-hooks.ts`): beforeSprint, afterSprint, beforeTask, afterTask

**What's missing:**
- Skills are not automatically selected based on task content — they must be manually installed/enabled
- No skill composition (can't combine `typescript-expert` + `react-specialist`)
- No automatic trigger matching against task scope/keywords
- No skill-to-agent binding (agents don't know which skills they have)
- No project stack detection → skill recommendation pipeline
- Worker prompt doesn't inject relevant SKILL.md content

### 2.2 Target Design

#### Skill Definition (extends PluginManifest)

```typescript
interface SkillDefinition extends PluginManifest {
  // New fields (backward compatible)
  category: 'language' | 'framework' | 'tool' | 'domain' | 'workflow';
  stackDetection: {
    files: string[];        // ["tsconfig.json", "*.ts"] → typescript detected
    dependencies: string[]; // ["react", "react-dom"] → react detected
    commands: string[];     // ["tsc --version"] → typescript available
  };
  composableWith: string[];  // ["typescript-expert"] — can combine with these skills
  priority: number;          // Higher = selected first when multiple match
  promptInjection: {
    position: 'prepend' | 'append' | 'section';  // Where in worker prompt
    maxTokens: number;      // Truncate SKILL.md if too long
  };
}
```

#### Skill Selection Pipeline

```
Input: Task + ProjectAnalysis + AgentDefinition?
Output: SkillDefinition[] (ordered by priority)

1. Project Stack Detection:
   - Scan root for tsconfig.json → "typescript"
   - Scan package.json dependencies → "react", "express", etc.
   - Cache result in .deckent/project-stack.json

2. Task Keyword Matching:
   - Match task title/description against skill.triggers[]
   - Score each skill (same scoring as agent selection)

3. Agent Compatibility Filter:
   - If agent has preferred skills, prioritize those
   - If agent has denied skills, exclude those

4. Composition Resolution:
   - Check composableWith[] for compatibility
   - Max 3 skills per task (prompt size limit)

5. Return: ordered list of matched skills
```

#### Built-in Skills (10)

| Skill | Category | Stack Detection | Triggers |
|-------|----------|----------------|----------|
| `typescript-expert` | language | tsconfig.json, *.ts | typescript, type, interface, generic |
| `react-specialist` | framework | react in deps | react, component, hook, jsx, state |
| `python-expert` | language | setup.py, *.py | python, pip, django, flask |
| `api-builder` | domain | express/fastify in deps | api, endpoint, route, rest, graphql |
| `database-migration` | domain | prisma/knex/typeorm in deps | database, migration, schema, query |
| `testing-expert` | workflow | vitest/jest in deps | test, coverage, spec, mock, assert |
| `documentation-writer` | workflow | docs/ exists | docs, readme, changelog, jsdoc |
| `security-specialist` | domain | (always available) | security, auth, jwt, encryption, vulnerability |
| `performance-optimizer` | domain | (always available) | performance, optimize, cache, memory, latency |
| `devops-engineer` | tool | Dockerfile, .github/workflows | docker, ci, deploy, pipeline, infrastructure |

#### Worker Prompt Injection

Current `buildWorkerPrompt()` output (task-builder.ts:161):

```
=== Task ===
ID: 031-001
Title: Add JWT authentication
...
=== Instructions ===
Complete this task...
```

With skill injection:

```
=== Agent: security-auditor ===
{PROMPT.md content — agent persona and approach}

=== Skills ===
--- typescript-expert ---
{SKILL.md content — TypeScript best practices}
--- security-specialist ---
{SKILL.md content — security review checklist}

=== Task ===
ID: 031-001
Title: Add JWT authentication
...
=== Instructions ===
Complete this task...
```

### 2.3 Files to Create

| File | Purpose |
|------|---------|
| `src/core/skill.ts` | SkillDefinition type, SkillPool class, loadSkill(), selectSkills() |
| `src/core/stack-detector.ts` | detectProjectStack() — scans project for framework/language indicators |
| `.deckent/skills/*/manifest.json` | 10 built-in skill definitions |
| `.deckent/skills/*/SKILL.md` | 10 built-in skill prompts |
| `tests/core/skill.test.ts` | Skill loading, selection, composition tests |
| `tests/core/stack-detector.test.ts` | Stack detection tests |

### 2.4 Files to Modify

| File | Change |
|------|--------|
| `src/core/types.ts` | Add `SkillDefinition`, `SkillSelectionResult`, `ProjectStack` types |
| `src/core/plugin.ts` | Extend PluginManifest with SkillDefinition fields (backward compatible) |
| `src/orchestra/brain.ts:298` (planSprint) | After agent selection, call `selectSkills()` for each task |
| `src/orchestra/task-builder.ts:161` (buildWorkerPrompt) | Inject SKILL.md content into prompt |
| `src/orchestra/model-selector.ts` | Skill-based model preference (if skill.model is set, factor into score) |

### 2.5 Sprint Estimate

**Sprint 31 or 32** — 10-12 tasks
- Task 1: SkillDefinition type + SkillPool class
- Task 2: Stack detector
- Task 3: Skill selector algorithm
- Task 4-6: 10 built-in skill definitions + prompts
- Task 7: brain.ts skill selection integration
- Task 8: task-builder.ts prompt injection
- Task 9: model-selector.ts skill preference
- Task 10-12: Tests (60+ tests)

---

## 3. Brain Decision Engine

### 3.1 Current Decision Flow

The current Brain decision flow (`src/orchestra/brain.ts`) follows this path:

```
readContext()           → BrainContext (directives, memory, patterns, debt)
    ↓
checkUsage()           → UsageMetrics (5hr%, weekly%)
    ↓
adjustSprintSize()     → SprintSizeRecommendation (size, maxWorkers, modelConstraint)
    ↓
planSprint()           → Sprint (tasks with model, effort, scope)
    ├─ AI planner (callBrainPlanner → claude CLI)
    └─ Structured fallback (parseStructuredDirectives)
        ↓
    For each task:
        calculateModelScore()     → score (-3 to +8)
        inferModelFromDirective() → opus|sonnet|haiku
        suggestModelFromPatterns()→ upgrade if patterns warrant
        resolveTaskModel()        → final model (5-layer filter)
```

**Key limitation:** This flow determines `model + effort + scope` but has no concept of `agent + skill` selection. The decision is purely model-tier based.

### 3.2 Extended Decision Flow

```
readContext()
    ↓
detectProjectStack()        → ProjectStack (language, framework, deps)  [NEW]
    ↓
checkUsage() + adjustSprintSize()
    ↓
planSprint()
    ↓
For each task:
    ┌─────────────────────────────────────────────┐
    │ 1. TASK ANALYSIS                             │
    │    - Type: code|test|doc|security|refactor   │
    │    - Complexity: score from calculateModel   │
    │    - Keywords: extracted from title+desc      │
    │    - Scope: directories + files              │
    ├─────────────────────────────────────────────┤
    │ 2. AGENT SELECTION                [NEW]      │
    │    - Score agents against task keywords       │
    │    - Score agents against task scope          │
    │    - Check agent stats (success rate)         │
    │    - Select best match or generic worker      │
    ├─────────────────────────────────────────────┤
    │ 3. SKILL SELECTION                [NEW]      │
    │    - Match project stack → language skills    │
    │    - Match task keywords → domain skills      │
    │    - Filter by agent compatibility            │
    │    - Compose up to 3 skills                   │
    ├─────────────────────────────────────────────┤
    │ 4. MODEL SELECTION (existing + enhanced)     │
    │    Layer 4: Base score (calculateModelScore)  │
    │    Layer 4b: Pattern upgrade                  │
    │    Layer 4c: Agent preference   [NEW]         │
    │    Layer 4d: Skill preference   [NEW]         │
    │    Layer 3: Task type cap                     │
    │    Layer 2: Usage pressure                    │
    │    Layer 1: Plan filter + haiku check         │
    ├─────────────────────────────────────────────┤
    │ 5. EFFORT DETERMINATION                      │
    │    - Base: resolveWorkerEffort (score-based)  │
    │    - Agent multiplier          [NEW]          │
    │    - Skill complexity factor   [NEW]          │
    ├─────────────────────────────────────────────┤
    │ 6. SCOPE COMPUTATION           [NEW]         │
    │    - Task scope (from directives)             │
    │    ∪ Agent permissions (agent.allowedTools)   │
    │    ∪ Skill requirements (skill.permissions)   │
    │    = Final merged scope                       │
    └─────────────────────────────────────────────┘
```

### 3.3 Learning Loop

**Current:** `detectPatterns()` in auditor.ts records `BoundaryViolation` patterns. `suggestModelFromPatterns()` upgrades model if repeated violations.

**Extended learning cycle:**

```
Sprint N completes
    ↓
For each task evaluation:
    Record to PATTERNS.md:
    {
      taskType: "security",
      agent: "security-auditor",
      skills: ["typescript-expert", "security-specialist"],
      model: "opus",
      effort: "high",
      evaluation: "DONE",           // or GO_WITH_TECH_DEBT, NO_GO
      coverage: 95,
      durationMs: 45000,
      sprintId: "sprint-031"
    }
    ↓
Sprint N+1 planning:
    For similar task type:
    - Look up successful patterns (evaluation=DONE, coverage>80%)
    - Suggest same agent+skill+model combination
    - Avoid combinations that led to NO_GO
    - Weight by recency (recent sprints matter more)
```

### 3.4 Decision Example

```
Task: "Add JWT authentication to Express API"

Step 1 — Task Analysis:
  Type: code (has src/ scope)
  Complexity: score=5 (2 directories, "auth" keyword, 8 files)
  Keywords: [jwt, authentication, express, api, middleware]
  Scope: src/auth/, src/middleware/, tests/auth/

Step 2 — Agent Selection:
  security-auditor: score=6 (jwt+2, auth+2, scope:src/auth/+3, -1 no file pattern)
  api-builder: score=4 (api+2, express+2)
  Winner: security-auditor (score 6 > 4)

Step 3 — Skill Selection:
  typescript-expert: match (tsconfig.json detected) → selected
  security-specialist: match (jwt, auth keywords) → selected
  api-builder skill: match (api, express) → selected but capped (max 3)
  Result: [typescript-expert, security-specialist, api-builder]

Step 4 — Model:
  Base score: 5 → opus
  Agent preference: opus (security-auditor.preferredModel)
  Skill preference: no override
  Usage pressure: 30% (no downgrade)
  Final: opus

Step 5 — Effort:
  Base: high (score >= 4)
  Agent multiplier: 1.0 (default)
  Final: high

Step 6 — Scope:
  Task: src/auth/, src/middleware/, tests/auth/
  Agent: src/auth/, src/middleware/ (matches)
  Skills: src/**  (typescript), src/auth/ (security)
  Merged: src/auth/, src/middleware/, tests/auth/
```

### 3.5 Files to Modify

| File | Change |
|------|--------|
| `src/orchestra/brain.ts:298-434` (planSprint) | Insert agent+skill selection between task creation and model resolution |
| `src/orchestra/model-selector.ts:117-168` (resolveTaskModel) | Add Layer 4c (agent pref) and 4d (skill pref) |
| `src/orchestra/task-builder.ts:152-158` (resolveWorkerEffort) | Apply agent effort multiplier |
| `src/orchestra/sprint-reporter.ts:45-119` (writeRetrospective) | Record agent+skill outcomes |
| `src/monitor/auditor.ts:295-350` (detectPatterns) | Extended pattern schema with agent+skill fields |

### 3.6 Sprint Estimate

Integrated with Section 1 and 2 sprints. Additional 3-4 tasks:
- Task: Extended model-selector with agent/skill layers
- Task: Learning loop in sprint-reporter
- Task: Extended PATTERNS.md schema
- Task: Tests (30+ tests)

---

## 4. End-User Experience

### 4.1 Current State

**CLI output** is functional but bare:
- `formatDashboard()` (`src/cli/helpers/output.ts:65-105`): Box-drawn status with agent table
- `formatSprintSummary()` (output.ts:138-155): Plain text metrics
- `formatDoctorResult()` (output.ts:107-136): `[PASS]`/`[FAIL]` with colors
- Messages via `getMessage()` (`src/cli/helpers/messages.ts`): i18n key lookup, `{var}` interpolation
- Errors via `handleError()` (`src/cli/helpers/error-handler.ts`): DeckentError with suggestions

**What's missing:**
- No progress bars during sprint execution
- No ETA calculation
- No rich sprint summary (categorized changes, diff stats, recommendations)
- No notification system (terminal bell, webhook, email)
- No agent/skill visibility in output

### 4.2 Sprint Summary Format

**Current** (formatSprintSummary):
```
Sprint sprint-031 (#31)
Tasks: 8 | Metrics: 6 done, 1 debt, 1 no-go | Coverage: 92.3% | Duration: 245s
```

**Target:**
```
Sprint #31 Complete                                              245s

  RESULTS
  6 done    1 tech debt    1 failed    92.3% coverage

  CHANGES
  src/auth/jwt.ts                      +142 -0    (new)
  src/middleware/auth-guard.ts          +89  -12
  tests/auth/jwt.test.ts               +156 -0    (new)
  ... 4 more files

  TESTS
  +156 new tests    12 test files    92.3% coverage (+3.1%)

  AGENT PERFORMANCE
  security-auditor   3 tasks   3/3 done   avg 95% coverage
  test-writer        2 tasks   2/2 done   avg 91% coverage
  generic worker     3 tasks   1/3 done   (1 NO_GO: scope violation)

  NEXT STEPS
  - Fix NO_GO task 031-005: "Database migration" (scope violation detected)
  - Consider: refactorer agent for task-031-003 tech debt
  - Run: deckent start to continue

```

### 4.3 CLI Output Improvements

| Command | Current | Target |
|---------|---------|--------|
| `deckent start` | "Sprint started..." then silence until complete | Progress bar, worker status updates every 5s, ETA |
| `deckent status` | Box-drawn table | + agent/skill info per worker, color-coded health |
| `deckent retro` | Raw RETRO.md dump | Formatted highlights, categorized recommendations |
| Error messages | DeckentError with suggestion | + contextual help links, copy-paste fix commands |

#### Progress Bar Design

```
deckent start

  Planning...                                              2.1s
  Spawning 4 workers (security-auditor x1, test-writer x2, generic x1)

  [===========----------]  4/8 tasks    52%    ETA ~120s

  w-031-001  security-auditor  CODING   src/auth/jwt.ts           32%
  w-031-002  test-writer       TESTING  tests/auth/jwt.test.ts    71%
  w-031-003  generic           CODING   src/config/loader.ts      28%
  w-031-004  test-writer       DONE     tests/middleware/*.ts     100%

  Queue: 4 tasks waiting (031-005, 031-006, 031-007, 031-008)
```

### 4.4 Notification System

```typescript
interface NotificationConfig {
  terminal: boolean;       // \u0007 bell character on sprint complete
  webhook?: string;        // POST to URL with sprint summary JSON
  discord?: string;        // Discord webhook URL
  slack?: string;          // Slack webhook URL
  email?: {
    to: string;
    smtp: { host: string; port: number; auth: { user: string; pass: string } };
  };
}
```

**Implementation:** After sprint complete (brain.ts line 994), check config.notifications and fire:

```typescript
// In brain.ts, after sprint.status = SprintStatus.COMPLETE
if (config.notifications?.terminal) process.stdout.write('\u0007');
if (config.notifications?.webhook) sendWebhook(config.notifications.webhook, sprintSummary);
if (config.notifications?.discord) sendDiscordWebhook(config.notifications.discord, sprintSummary);
```

### 4.5 Interaction Modes

| Mode | Current State | Enhancement |
|------|--------------|-------------|
| **CLI** | Functional, basic output | Rich formatting, progress bars, agent/skill visibility |
| **MCP** | 16 tools, enriched responses | Add agent/skill info to status response |
| **Web Dashboard** | React + Vite, 4 pages | Add agent/skill visualization, diff viewer |
| **API** | 16 endpoints + SSE | Add agent/skill endpoints, extended sprint detail |

### 4.6 Files to Create

| File | Purpose |
|------|---------|
| `src/cli/helpers/progress.ts` | Progress bar renderer, ETA calculator |
| `src/cli/helpers/sprint-summary.ts` | Rich sprint summary formatter |
| `src/core/notifications.ts` | Notification dispatcher (terminal, webhook, discord, slack) |
| `tests/cli/progress.test.ts` | Progress bar tests |
| `tests/cli/sprint-summary.test.ts` | Summary format tests |
| `tests/core/notifications.test.ts` | Notification dispatch tests |

### 4.7 Files to Modify

| File | Change |
|------|--------|
| `src/core/types.ts` | Add `NotificationConfig` to DeckentConfig |
| `src/orchestra/brain.ts:994` (after COMPLETE) | Fire notifications |
| `src/cli/commands/start.ts` | Use progress bar during sprint |
| `src/cli/commands/status.ts` | Show agent/skill info |
| `src/cli/commands/retro.ts` | Use rich summary formatter |
| `src/cli/helpers/output.ts` | Extend formatDashboard with agent/skill columns |

### 4.8 Sprint Estimate

**Sprint 32 or 33** — 8-10 tasks
- Task 1: Progress bar renderer
- Task 2: Rich sprint summary formatter
- Task 3: Notification system (terminal + webhook)
- Task 4: Discord/Slack webhook integration
- Task 5: start.ts progress integration
- Task 6: status.ts agent/skill display
- Task 7: retro.ts rich output
- Task 8-10: Tests (40+ tests)

---

## Implementation Roadmap

| Sprint | Focus | Tasks | Dependencies |
|--------|-------|-------|-------------|
| **30** | Agent Pool Core | 8-10 | None |
| **31** | Skill System Core | 10-12 | Agent Pool |
| **32** | Brain Decision Engine | 3-4 | Agent Pool + Skill System |
| **32** | UX: Progress + Summary | 5-6 | None (parallel) |
| **33** | UX: Notifications + Polish | 4-5 | None (parallel) |
| **34** | Integration Testing | 5-6 | All above |

**Total:** ~35-43 tasks across 4-5 sprints

---

## Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| Prompt size explosion (agent + 3 skills + task) | Worker context overflow | Medium | Token budget per section, truncation at `promptInjection.maxTokens` |
| Agent selection wrong type | Tasks assigned to wrong specialist | Low | Fallback to generic worker, learning loop corrects over time |
| Skill composition conflict | Two skills give contradictory instructions | Low | `composableWith[]` whitelist, max 3 skills |
| Pattern learning drift | Bad patterns reinforce bad decisions | Medium | Decay mechanism (existing), confidence threshold for pattern reuse |
| Backward compatibility | Existing sprints break with new prompt format | Low | All extensions optional, default=generic worker with no skills (current behavior) |
| Notification spam | Webhook fires on every sprint | Low | Config-driven, disabled by default |

---

## Test Strategy

- **Unit tests:** Each new module (agent-pool, agent-selector, skill, stack-detector, notifications, progress, summary)
- **Integration tests:** Full planSprint flow with agent+skill selection
- **Regression tests:** Existing brain.test.ts, task-builder.test.ts must continue passing
- **E2E test:** Sprint with agent+skill selection → worker receives enriched prompt → evaluateResult records outcome
- **Target:** 200+ new tests across all sections

---

*This document will be updated as implementation progresses. Each section maps to a concrete sprint with defined tasks, file changes, and test requirements.*
