# ROUTE-1 — routing-v2 precision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the agent/skill router from hijacking touch-up tasks (comment-sweep / audit / doc) that merely touch `src/api/` into `api-builder` with empty skills — by sharpening the intent classifier, consuming the canonical `task.type` SSOT, and intent/kind-gating the path-derived bonuses.

**Architecture:** A reliability-weighted signal model — explicit override > semantic operation intent > canonical TaskKind (medium) > path-domain proxy. `routeTaskV2` consumes `task.type`; the path-extracted domain bonus and user-surface bonus are suppressed for non-build operations (`isSurfaceBuildTask`), while intent-driven domain bonuses stay. Intent→skill maps are completed and an empty-skill floor guarantees ≥1 skill for classified tasks.

**Tech Stack:** TypeScript (ESM, Node16 — `.js` import suffixes mandatory), vitest. No new runtime deps (ADR-010).

## Global Constraints

- **ESM imports:** every relative import ends in `.js` (Node16 resolution). Type-only imports use `import type`.
- **Lossless:** existing routing tests stay green; genuine surface-build tasks still route to `api-builder`/`frontend-designer` (ADR-079). A test that asserted `skillIds = []` for a *classified* task encoded the old gap — update it deliberately with a one-line justification, never silently; for `intent='unknown'` tasks `[]` is preserved.
- **i18n:** routing is internal logic — no user-facing strings. `reasoning[]` log lines are English-default; do not add `getMessage` calls.
- **Surgical:** write only to the files listed per task. `npx tsc --noEmit` clean after every task.
- **TDD:** write the failing test first, watch it fail, implement minimally, watch it pass, commit.
- **Verification commands:** `npx vitest run <file>` for tests; `npx tsc --noEmit` for the type gate (the project alias is `npm run lint`).
- **Branch:** work proceeds on `main` (user-approved). Verify `git branch --show-current` = `main` before each commit.

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `src/core/intent-classifier.ts` | Layer-1 intent classification | B1 — comment-sweep → `refactor` disambiguation |
| `src/core/routing-engine.ts` | Layer-3 agent/skill scoring | B2 predicate + gate, B3 `task.type` consume + tie-break, B4 maps + skill floor |
| `src/orchestra/task-router.ts` | provider routing + surface-owner override | B2 — gate `applyUserSurfaceBonus` |
| `tests/core/intent-classifier-refactor.test.ts` | B1 unit tests | extend |
| `tests/core/routing-route1-precision.test.ts` | B2/B3/B4 + capstone regression | **create** |
| `tests/orchestra/router-surface-wire.test.ts` | `applyUserSurfaceBonus` gate | extend |

`taskKind` is threaded into `routeTaskV2` by **widening its parameter type only** — all six call sites (`mid-sprint-adapter.ts:154`, `task-mode-runner.ts:140`, `sprint-planner.ts:597`, `mcp/tools/run.ts:102`, `cli/commands/run.ts:313`) already pass the full `Task` object (which carries `.type`), so no call-site edits are needed.

---

## Task 1: B1 — comment-sweep classifies as `refactor`

**Files:**
- Modify: `src/core/intent-classifier.ts` (inside `detectPrimaryIntent`, after the scope-signals loop ends at line ~133, before the write-ratio comment at line ~135)
- Test: `tests/core/intent-classifier-refactor.test.ts`

**Interfaces:**
- Consumes: `detectPrimaryIntent(text, scope, scopeAnalysis?)` / `classifyIntent(task)` (existing exports, unchanged signatures).
- Produces: no new exports. Behaviour change only — a touch-up verb + code-structure noun now yields `intent.primary = 'refactor'`.

**Why this works (real trace):** for `"clean stale comments"` + `filesWrite:['src/api/x.ts']`, the refactor keyword `cleanup` does **not** match (text has `clean`, not `cleanup`), so today refactor=0, documentation=2 (`comment`), and the `src/`-write boost pushes implementation=3 → primary=`implementation`. Scoring refactor `+4` makes refactor the strong non-impl signal (`hasStrongNonImplSignal`, line ~142) which **suppresses** the `+3` implementation boost, and refactor(4) > documentation(2) → primary=`refactor`.

- [ ] **Step 1: Write the failing tests**

Append inside the top-level `describe` block in `tests/core/intent-classifier-refactor.test.ts`:

```typescript
  // ─── ROUTE-1 B1: comment / code-structure sweep → refactor ─────────────────
  describe('ROUTE-1 B1 — comment-sweep is refactor, not implementation/documentation', () => {
    it('clean stale comments under src/api/ → refactor (not implementation)', () => {
      const dna = classifyIntent({
        title: 'clean stale comments',
        description: 'remove stale and dead comments from the api module',
        scope: { directories: ['src/api/'], filesRead: [], filesWrite: ['src/api/x.ts'] },
      });
      expect(dna.intent.primary).toBe('refactor');
    });

    it('remove unused imports under src/ → refactor', () => {
      const dna = classifyIntent({
        title: 'remove unused imports',
        description: 'delete unused imports across the module',
        scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/x.ts'] },
      });
      expect(dna.intent.primary).toBe('refactor');
    });

    it('authoring README prose stays documentation (no false refactor)', () => {
      const dna = classifyIntent({
        title: 'update the getting-started guide',
        description: 'write documentation and examples in the readme',
        scope: { directories: ['docs/'], filesRead: [], filesWrite: ['README.md', 'docs/guide.md'] },
      });
      expect(dna.intent.primary).toBe('documentation');
    });

    it('feature build stays implementation (no false refactor)', () => {
      const dna = classifyIntent({
        title: 'add POST /api/users endpoint',
        description: 'implement the create-user endpoint and validation',
        scope: { directories: ['src/api/'], filesRead: [], filesWrite: ['src/api/users.ts'] },
      });
      expect(dna.intent.primary).toBe('implementation');
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/intent-classifier-refactor.test.ts -t "ROUTE-1 B1"`
Expected: FAIL — first two cases return `implementation`, not `refactor`.

- [ ] **Step 3: Implement the B1 disambiguation**

In `src/core/intent-classifier.ts`, insert this block in `detectPrimaryIntent` immediately **after** the `SCOPE_INTENT_SIGNALS` loop closes (the `}` ending the `for (const signal of SCOPE_INTENT_SIGNALS)` block, ~line 133) and **before** the `// CRITICAL FIX: Write ratio analysis` comment (~line 135):

```typescript
  // ROUTE-1 B1: a comment / code-structure SWEEP is a refactor operation — not a
  // documentation edit (authoring prose) and not a feature build. A touch-up verb
  // co-occurring with a code-structure noun scores refactor ≥ 4 so it (a) trips the
  // hasStrongNonImplSignal gate below — suppressing the generic src/-write
  // implementation boost — and (b) outranks the bare `comment` documentation hit.
  const CLEANUP_VERB = /\b(clean(?:up)?|stale|dead|remove|delete|rename|simplif\w+|tidy|sweep|prune|dedupe|deduplicate)\b/;
  const CODE_STRUCT_NOUN = /\b(comments?|jsdoc|imports?|whitespace|formatting|lint|unused)\b/;
  if (CLEANUP_VERB.test(text) && CODE_STRUCT_NOUN.test(text)) {
    const r = scores.find((s) => s.intent === 'refactor');
    if (r) r.score += 4;
    else scores.push({ intent: 'refactor', score: 4 });
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/core/intent-classifier-refactor.test.ts`
Expected: PASS (new ROUTE-1 cases + all pre-existing cases stay green).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/core/intent-classifier.ts tests/core/intent-classifier-refactor.test.ts
git commit -m "$(cat <<'EOF'
feat(routing): ROUTE-1 B1 — comment/code sweep classifies as refactor

Touch-up verb + code-structure noun scores refactor +4, tripping the
hasStrongNonImplSignal gate so the generic src/-write implementation
boost is suppressed and refactor outranks the bare comment doc hit.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: B2 predicate + gated `getDomainMatchBonus`

**Files:**
- Modify: `src/core/routing-engine.ts` (add `TaskKind` type import near the top; add `isSurfaceBuildTask` + suppress sets near the other bonus constants ~line 140; add `allowPathProxy` param to `getDomainMatchBonus` ~line 156)
- Test: `tests/core/routing-route1-precision.test.ts` (create)

**Interfaces:**
- Produces:
  - `export function isSurfaceBuildTask(intent: IntentType, taskKind?: TaskKind): boolean`
  - `getDomainMatchBonus(agentId, agentDomain, taskDNA, allowPathProxy = true)` — 4th param, default `true` keeps existing 3-arg callers intact.
- Consumes: `INTENT_TO_AGENT_DOMAIN`, `TASK_DOMAIN_TO_AGENT_ID`, `DOMAIN_MATCH_BONUS` (existing), `TaskKind` from `work-model.js`, `IntentType` from `routing-types.js` (already imported).

- [ ] **Step 1: Write the failing tests**

Create `tests/core/routing-route1-precision.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  isSurfaceBuildTask,
  getDomainMatchBonus,
  DOMAIN_MATCH_BONUS,
} from '../../src/core/routing-engine.js';
import { classifyIntent } from '../../src/core/intent-classifier.js';

// ROUTE-1 — routing-v2 precision: path-proxy + surface bonus gated by operation/medium.

describe('ROUTE-1 B2 — isSurfaceBuildTask gate', () => {
  it('suppresses for refactor intent', () => {
    expect(isSurfaceBuildTask('refactor')).toBe(false);
  });
  it('suppresses for documentation intent', () => {
    expect(isSurfaceBuildTask('documentation')).toBe(false);
  });
  it('suppresses for audit / documentation TaskKind even on a build-ish intent', () => {
    expect(isSurfaceBuildTask('implementation', 'audit')).toBe(false);
    expect(isSurfaceBuildTask('implementation', 'documentation')).toBe(false);
  });
  it('allows genuine builds', () => {
    expect(isSurfaceBuildTask('implementation', 'code-development')).toBe(true);
    expect(isSurfaceBuildTask('design', 'design')).toBe(true);
    expect(isSurfaceBuildTask('implementation')).toBe(true);
  });
});

describe('ROUTE-1 B2 — getDomainMatchBonus path-proxy gating', () => {
  const apiTaskDNA = classifyIntent({
    title: 'clean stale comments',
    description: 'remove stale comments from the api module',
    scope: { directories: ['src/api/'], filesRead: [], filesWrite: ['src/api/x.ts'] },
  });

  it('path-proxy bonus applies when allowed (default)', () => {
    // api-builder is the path-proxy owner for the extracted `api` domain.
    expect(getDomainMatchBonus('api-builder', 'api', apiTaskDNA)).toBe(DOMAIN_MATCH_BONUS);
  });

  it('path-proxy bonus suppressed when allowPathProxy=false', () => {
    expect(getDomainMatchBonus('api-builder', 'api', apiTaskDNA, false)).toBe(0);
  });

  it('intent-driven domain bonus (path 1) is NOT suppressed by the gate', () => {
    const secDNA = classifyIntent({
      title: 'fix auth vulnerability',
      description: 'patch the jwt verification security hole',
      scope: { directories: ['src/auth/'], filesRead: [], filesWrite: ['src/auth/jwt.ts'] },
    });
    // security intent → security agent domain (INTENT_TO_AGENT_DOMAIN), path 1.
    expect(getDomainMatchBonus('security-auditor', 'security', secDNA, false)).toBe(DOMAIN_MATCH_BONUS);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/routing-route1-precision.test.ts`
Expected: FAIL — `isSurfaceBuildTask is not a function`; `getDomainMatchBonus` ignores the 4th arg.

- [ ] **Step 3: Add the `TaskKind` import**

At the top of `src/core/routing-engine.ts`, alongside the existing type imports, add:

```typescript
import type { TaskKind } from './work-model.js';
```

- [ ] **Step 4: Add the predicate + suppress sets**

In `src/core/routing-engine.ts`, immediately after the `TASK_DOMAIN_TO_AGENT_ID` constant block (ends ~line 139) and before the `getDomainMatchBonus` doc comment (~line 141), insert:

```typescript
/** ROUTE-1 B2 — intents that mark a task as a TOUCH-UP rather than a surface build.
 *  For these the path-extracted domain proxy + user-surface bonus are suppressed so a
 *  comment-sweep / doc edit touching src/api/ is not hijacked by api-builder. The
 *  intent-driven domain bonus (INTENT_TO_AGENT_DOMAIN, path 1) is NOT affected. */
const SURFACE_SUPPRESS_INTENTS: ReadonlySet<IntentType> = new Set<IntentType>(['refactor', 'documentation']);

/** ROUTE-1 B2 — canonical TaskKinds (medium axis) that also suppress the path proxy. */
const SURFACE_SUPPRESS_KINDS: ReadonlySet<TaskKind> = new Set<TaskKind>(['audit', 'documentation']);

/**
 * True when the task is genuinely building/extending its surface — path-proxy and
 * user-surface bonuses apply. False for touch-up / non-build work (bonuses suppressed).
 * OR semantics: suppression fires on either the operation arm (intent) or the medium
 * arm (taskKind), so a code-development-medium refactor-operation is still suppressed.
 */
export function isSurfaceBuildTask(intent: IntentType, taskKind?: TaskKind): boolean {
  if (SURFACE_SUPPRESS_INTENTS.has(intent)) return false;
  if (taskKind !== undefined && SURFACE_SUPPRESS_KINDS.has(taskKind)) return false;
  return true;
}
```

- [ ] **Step 5: Gate path 2 of `getDomainMatchBonus`**

Replace the body of `getDomainMatchBonus` (~line 156-176) with the `allowPathProxy`-aware version:

```typescript
export function getDomainMatchBonus(
  agentId: string,
  agentDomain: AgentDomain | 'generic',
  taskDNA: TaskDNA,
  allowPathProxy: boolean = true,
): number {
  // Path 1: intent → agent domain (intent-driven, always honoured).
  const targetDomain = INTENT_TO_AGENT_DOMAIN[taskDNA.intent.primary];
  if (targetDomain && agentDomain === targetDomain) {
    return DOMAIN_MATCH_BONUS;
  }

  // Path 2: extracted task domain name → specific agent id (path proxy, gated).
  if (allowPathProxy) {
    for (const domain of taskDNA.domains) {
      const expectedAgent = TASK_DOMAIN_TO_AGENT_ID[domain.name.toLowerCase()];
      if (expectedAgent && expectedAgent === agentId) {
        return DOMAIN_MATCH_BONUS;
      }
    }
  }

  return 0;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/core/routing-route1-precision.test.ts`
Expected: PASS.

- [ ] **Step 7: Type-check + regression on the multisignal suite (3-arg caller)**

Run: `npx tsc --noEmit && npx vitest run tests/core/routing-multisignal.test.ts`
Expected: no type errors; multisignal suite stays green (default `allowPathProxy=true` preserves the old 3-arg behaviour).

- [ ] **Step 8: Commit**

```bash
git add src/core/routing-engine.ts tests/core/routing-route1-precision.test.ts
git commit -m "$(cat <<'EOF'
feat(routing): ROUTE-1 B2 — isSurfaceBuildTask + gated domain path-proxy

Path-extracted domain bonus (path 2) suppressed for touch-up/non-build
tasks; intent-driven domain bonus (path 1) unaffected. allowPathProxy
defaults true so existing callers are byte-for-byte unchanged.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: B2/B3 — gate `selectBestAgent` + consume `task.type` in `routeTaskV2`

**Files:**
- Modify: `src/core/routing-engine.ts` (`selectBestAgent` ~line 443; `routeTaskV2` ~line 267; add `taskKindToIntent` import)
- Test: `tests/core/routing-route1-precision.test.ts` (extend)

**Interfaces:**
- Consumes: `isSurfaceBuildTask`, `getDomainMatchBonus(…, allowPathProxy)`, `getUserSurfaceBonus` (Task 2 + existing); `taskKindToIntent(kind)` from `work-model.js`.
- Produces: `routeTaskV2(task: { title; description; scope; type?: TaskKind }, …)` — widened param; `selectBestAgent(taskDNA, pool, cfg, learningData, excludeAgents, taskKind?)` — new trailing `taskKind?: TaskKind` param.

- [ ] **Step 1: Write the failing tests**

Append to `tests/core/routing-route1-precision.test.ts`:

```typescript
import {
  routeTaskV2,
} from '../../src/core/routing-engine.js';
import type { AgentDefinition, AgentPool } from '../../src/core/agent-types.js';
import { createAgentDefinition } from '../../src/core/agent-types.js';
import type { SkillDefinition } from '../../src/core/skill-types.js';

function makeAgent(id: string, overrides: Partial<AgentDefinition>): AgentDefinition {
  return { ...createAgentDefinition({ id, name: id }), ...overrides };
}
function makeAgentPool(...agents: AgentDefinition[]): AgentPool {
  return new Map(agents.map((a) => [a.id, a]));
}
const emptySkillPool = new Map<string, SkillDefinition>();

// Hermetic mirror of the relevant on-disk activation rules.
const refactorer = makeAgent('refactorer', {
  source: 'builtin',
  activation: { rules: [
    { when: { 'intent.primary': 'refactor' }, score: 10 },
    { when: { 'intent.primary': 'implementation' }, score: 7 },
  ], exclude: [], minScore: 5 },
});
const codeReviewer = makeAgent('code-reviewer', {
  source: 'builtin',
  activation: { rules: [{ when: { 'intent.primary': 'refactor' }, score: 8 }], exclude: [], minScore: 5 },
});
const apiBuilder = makeAgent('api-builder', {
  source: 'builtin',
  activation: { rules: [{ when: { domains: { $contains: 'api' } }, score: 8 }], exclude: [], minScore: 5 },
});
const pool = makeAgentPool(refactorer, codeReviewer, apiBuilder);

describe('ROUTE-1 B2/B3 — agent selection', () => {
  it('comment-sweep touching src/api/ → refactorer (NOT api-builder)', () => {
    const decision = routeTaskV2(
      { title: 'clean stale comments', description: 'remove stale comments from the api module',
        scope: { directories: ['src/api/'], filesRead: [], filesWrite: ['src/api/x.ts'] },
        type: 'code-development' },
      pool, emptySkillPool,
    );
    expect(['refactorer', 'code-reviewer']).toContain(decision.agentId);
    expect(decision.agentId).not.toBe('api-builder');
  });

  it('LOSSLESS: genuine "build the /api/users endpoint" → api-builder', () => {
    const decision = routeTaskV2(
      { title: 'add POST /api/users endpoint', description: 'implement the create-user endpoint and validation',
        scope: { directories: ['src/api/'], filesRead: [], filesWrite: ['src/api/users.ts'] },
        type: 'code-development' },
      pool, emptySkillPool,
    );
    expect(decision.agentId).toBe('api-builder');
  });

  it('B3: unknown-intent task adopts TaskKind SSOT intent', () => {
    const decision = routeTaskV2(
      { title: 'zzz', description: 'zzz',
        scope: { directories: [], filesRead: [], filesWrite: [] },
        type: 'refactor' },
      pool, emptySkillPool,
    );
    expect(decision.taskDNA.intent.primary).toBe('refactor');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/routing-route1-precision.test.ts -t "B2/B3 — agent"`
Expected: FAIL — comment-sweep still resolves to `api-builder` (surface + path-proxy bonuses unsuppressed).

- [ ] **Step 3: Add the `taskKindToIntent` import**

In `src/core/routing-engine.ts`, extend the `work-model.js` import to include the value function:

```typescript
import { taskKindToIntent } from './work-model.js';
import type { TaskKind } from './work-model.js';
```

(If Task 2 already added `import type { TaskKind } …`, merge into the two lines above.)

- [ ] **Step 4: Gate `selectBestAgent`**

Add the trailing param to the `selectBestAgent` signature (~line 443-449):

```typescript
function selectBestAgent(
  taskDNA: TaskDNA,
  pool: AgentPool,
  cfg: RoutingEngineConfig,
  learningData: LearningBonus[],
  excludeAgents: string[],
  taskKind?: TaskKind,
): { agentId: string | null; score: number; confidence: ConfidenceLevel; reasoning: string[] } {
  const candidates: ScoredCandidate[] = [];
  const reasoning: string[] = [];

  // ROUTE-1 B2 — suppress path-proxy + user-surface bonus for touch-up / non-build tasks.
  const buildTask = isSurfaceBuildTask(taskDNA.intent.primary, taskKind);
```

Then, inside the `for (const [id, agent] of pool)` loop, change the `surfaceBonus` line (~line 460) and the `domainBonus` line (~line 491):

```typescript
    const surfaceBonus = buildTask ? getUserSurfaceBonus(id, taskDNA) : 0;
```

```typescript
    const domainBonus = getDomainMatchBonus(id, getAgentDomain(agent), taskDNA, buildTask);
```

(Leave the rest of the loop — exclude-bypass, reasoning pushes, `finalScore` — unchanged. With `buildTask=false`, `surfaceBonus=0` also removes the surface exclude-bypass, which is correct: a touch-up must not bypass excludes onto a surface owner.)

- [ ] **Step 5: Consume `task.type` in `routeTaskV2`**

Widen the `routeTaskV2` parameter type (~line 267-268):

```typescript
export function routeTaskV2(
  task: { title: string; description: string; scope: TaskScope; type?: TaskKind },
  agentPool: AgentPool,
  skillPool: Map<string, SkillDefinition>,
  options?: RoutingOptions,
): RoutingDecision {
```

After `const taskDNA = classifyIntent(task);` and its `reasoning.push(...)` (~line 280-281), insert the B3 tie-break:

```typescript
  // ROUTE-1 B3 — when the keyword classifier cannot resolve an intent, fall back to the
  // canonical TaskKind SSOT (scope-shape) instead of 'unknown'. Confident classifications
  // are never overridden — the operation axis outranks the medium axis.
  if (taskDNA.intent.primary === 'unknown' && task.type !== undefined) {
    const kindIntent = taskKindToIntent(task.type);
    if (kindIntent !== 'unknown') {
      taskDNA.intent.primary = kindIntent;
      reasoning.push(`Intent from TaskKind SSOT: ${kindIntent} (task.type=${task.type})`);
    }
  }
```

Then pass `task.type` to `selectBestAgent` at its call site (~line 324):

```typescript
    const agentResult = selectBestAgent(taskDNA, agentPool, cfg, learningData, allExcludeAgents, task.type);
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/core/routing-route1-precision.test.ts`
Expected: PASS — comment-sweep → refactorer/code-reviewer; build → api-builder; unknown→refactor via SSOT.

- [ ] **Step 7: Type-check + agent-routing regression**

Run: `npx tsc --noEmit && npx vitest run tests/core/routing-multisignal.test.ts tests/core/user-surface-routing.test.ts tests/core/routing-engine.test.ts`
Expected: no type errors; all three suites green.

- [ ] **Step 8: Commit**

```bash
git add src/core/routing-engine.ts tests/core/routing-route1-precision.test.ts
git commit -m "$(cat <<'EOF'
feat(routing): ROUTE-1 B2/B3 — kind-gated agent scoring + task.type consume

selectBestAgent suppresses path-proxy + surface bonus for touch-up tasks
(isSurfaceBuildTask); routeTaskV2 widened to read task.type, with an
unknown-intent SSOT tie-break. Caller churn zero (param widening only).
Fixes the comment-sweep→api-builder misroute; build tasks unchanged.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: B4 — intent→skill maps + gated skill path-proxy + empty-skill floor

**Files:**
- Modify: `src/core/routing-engine.ts` (`INTENT_TO_SKILL_ID` ~line 839; `getIntentPriorityBonus` ~line 879; `selectBestSkills` ~line 535; `routeTaskV2` skill call ~line 366; add `pickSkillFloor` + default maps)
- Test: `tests/core/routing-route1-precision.test.ts` (extend)

**Interfaces:**
- Consumes: `isSurfaceBuildTask` (Task 2); `INTENT_TO_SKILL_ID`, `TASK_DOMAIN_TO_SKILL_ID`, `SKILL_DOMAIN_BONUS`, `cfg.skillMinScore` (existing).
- Produces: `getIntentPriorityBonus(skillId, taskDNA, projectStack, allowPathProxy = true)` — 4th param; `selectBestSkills(…, projectStack, taskKind?)` — trailing `taskKind?: TaskKind`; new module-local `pickSkillFloor`, `KIND_DEFAULT_SKILL`, `INTENT_DEFAULT_SKILL`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/core/routing-route1-precision.test.ts`:

```typescript
import { createSkillDefinition } from '../../src/core/skill-types.js';

function makeSkillPool(...defs: Array<Partial<SkillDefinition> & { id: string; name: string }>): Map<string, SkillDefinition> {
  const p = new Map<string, SkillDefinition>();
  for (const d of defs) { const s = createSkillDefinition(d); p.set(s.id, s); }
  return p;
}

const skillPool = makeSkillPool(
  { id: 'code-simplifier', name: 'Code Simplifier', category: 'workflow', triggers: ['refactor', 'cleanup', 'simplify'], priority: 8 },
  { id: 'typescript-expert', name: 'TypeScript Expert', category: 'language', triggers: ['typescript', 'ts', 'types'], priority: 10 },
  { id: 'api-builder', name: 'API Builder', category: 'workflow', triggers: ['api', 'endpoint', 'rest'], priority: 7 },
);

describe('ROUTE-1 B4 — skill selection', () => {
  it('refactor comment-sweep → non-empty skills incl. code-simplifier', () => {
    const decision = routeTaskV2(
      { title: 'clean stale comments', description: 'remove stale comments from the api module',
        scope: { directories: ['src/api/'], filesRead: [], filesWrite: ['src/api/x.ts'] },
        type: 'code-development' },
      pool, skillPool,
    );
    expect(decision.skillIds.length).toBeGreaterThan(0);
    expect(decision.skillIds).toContain('code-simplifier');
  });

  it('refactor task does NOT pull the api path-proxy skill', () => {
    const decision = routeTaskV2(
      { title: 'remove dead comments', description: 'delete dead comments in api',
        scope: { directories: ['src/api/'], filesRead: [], filesWrite: ['src/api/x.ts'] },
        type: 'code-development' },
      pool, skillPool,
    );
    expect(decision.skillIds).not.toContain('api-builder');
  });

  it('floor: a classified task never returns empty skills when a default exists', () => {
    const decision = routeTaskV2(
      { title: 'tidy comments', description: 'sweep stale comments',
        scope: { directories: ['src/x/'], filesRead: [], filesWrite: ['src/x/y.ts'] },
        type: 'refactor' },
      pool, makeSkillPool(
        { id: 'code-simplifier', name: 'Code Simplifier', category: 'workflow', triggers: ['xyzzy'], priority: 1 },
      ),
    );
    expect(decision.skillIds).toContain('code-simplifier');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/routing-route1-precision.test.ts -t "B4 — skill"`
Expected: FAIL — `skillIds` is `[]` (no `refactor` entry in `INTENT_TO_SKILL_ID`; no floor).

- [ ] **Step 3: Complete `INTENT_TO_SKILL_ID`**

Replace the `INTENT_TO_SKILL_ID` block (~line 839-846) with:

```typescript
export const INTENT_TO_SKILL_ID: Partial<Record<IntentType, string>> = {
  security:      'security-specialist',
  devops:        'devops-engineer',
  design:        'react-specialist',
  migration:     'database-migration',
  performance:   'performance-optimizer',
  architecture:  'system-architect',
  refactor:      'code-simplifier',   // ROUTE-1 B4
  config:        'devops-engineer',   // ROUTE-1 B4
};
```

- [ ] **Step 4: Gate the skill path-proxy in `getIntentPriorityBonus`**

Replace the `getIntentPriorityBonus` signature and its path-proxy loop (~line 879-909):

```typescript
function getIntentPriorityBonus(
  skillId: string,
  taskDNA: TaskDNA,
  projectStack: { language: string; framework: string; dependencies: string[] } | null,
  allowPathProxy: boolean = true,
): number {
  const primary = taskDNA.intent.primary;

  if (taskDNA.tags?.includes('test-coverage') && skillId === 'testing-expert') return 2;
  if (primary === 'documentation' && skillId === 'documentation-writer') return 2;

  if (primary === 'implementation' && skillId === 'typescript-expert') {
    const isTypeScript =
      projectStack?.language?.toLowerCase() === 'typescript' ||
      taskDNA.domains.some(d => d.name.toLowerCase().includes('typescript'));
    if (isTypeScript) return 2;
  }

  // intent→skill (intent-driven, always honoured)
  const intentSkillId = INTENT_TO_SKILL_ID[primary];
  if (intentSkillId === skillId) return SKILL_DOMAIN_BONUS;

  // domain→skill (path proxy, gated — ROUTE-1 B4)
  if (allowPathProxy) {
    for (const domain of taskDNA.domains) {
      const domainSkillId = TASK_DOMAIN_TO_SKILL_ID[domain.name.toLowerCase()];
      if (domainSkillId === skillId) return SKILL_DOMAIN_BONUS;
    }
  }

  return 0;
}
```

- [ ] **Step 5: Add the floor helper + default maps**

Immediately before `selectBestSkills` (~line 535), insert:

```typescript
/** ROUTE-1 B4 — guaranteed skill when none cleared skillMinScore. */
const KIND_DEFAULT_SKILL: Partial<Record<TaskKind, string>> = {
  'code-development': 'typescript-expert',
  refactor:          'code-simplifier',
  documentation:     'documentation-writer',
  audit:             'code-simplifier',
  test:              'testing-expert',
};
const INTENT_DEFAULT_SKILL: Partial<Record<IntentType, string>> = {
  refactor:       'code-simplifier',
  implementation: 'typescript-expert',
  documentation:  'documentation-writer',
};

/**
 * Pick a floor skill when no candidate cleared the threshold:
 *  (1) the best sub-threshold candidate (score > 0), else
 *  (2) a kind/intent default that exists in the pool.
 * Returns null for genuinely unclassifiable tasks (intent 'unknown', no sub-threshold)
 * so an empty pool / no-signal task honestly yields no skill.
 */
function pickSkillFloor(
  subThreshold: Array<{ id: string; finalScore: number }>,
  intent: IntentType,
  taskKind: TaskKind | undefined,
  pool: Map<string, SkillDefinition>,
): string | null {
  if (subThreshold.length > 0) {
    return [...subThreshold].sort((a, b) => b.finalScore - a.finalScore)[0]!.id;
  }
  if (intent === 'unknown') return null;
  const byKind = taskKind ? KIND_DEFAULT_SKILL[taskKind] : undefined;
  if (byKind && pool.has(byKind)) return byKind;
  const byIntent = INTENT_DEFAULT_SKILL[intent];
  if (byIntent && pool.has(byIntent)) return byIntent;
  return null;
}
```

- [ ] **Step 6: Thread `taskKind` + collect sub-threshold + apply floor in `selectBestSkills`**

Add the trailing param to the `selectBestSkills` signature (~line 535-543):

```typescript
function selectBestSkills(
  taskDNA: TaskDNA,
  pool: Map<string, SkillDefinition>,
  cfg: RoutingEngineConfig,
  learningData: LearningBonus[],
  excludeSkills: string[],
  budget: SkillBudget,
  projectStack: { language: string; framework: string; dependencies: string[] } | null,
  taskKind?: TaskKind,
): { skillIds: string[]; scores: Map<string, number>; confidence: ConfidenceLevel; reasoning: string[] } {
  const candidates: ScoredCandidate[] = [];
  const subThreshold: Array<{ id: string; finalScore: number }> = [];
  const reasoning: string[] = [];
  const buildTask = isSurfaceBuildTask(taskDNA.intent.primary, taskKind);
```

Pass `buildTask` to `getIntentPriorityBonus` (~line 600):

```typescript
    const intentBonus = getIntentPriorityBonus(id, taskDNA, projectStack, buildTask);
```

Capture sub-threshold candidates — replace the `if (finalScore >= cfg.skillMinScore) { … }` block (~line 612-620) with:

```typescript
    if (finalScore >= cfg.skillMinScore) {
      candidates.push({
        id,
        rawScore: result.score + stackBonus,
        learningBonus: skillBonus,
        finalScore,
        matchedRules: result.matchedRules,
      });
    } else if (finalScore > 0) {
      subThreshold.push({ id, finalScore });
    }
```

Replace the empty-candidates early return (~line 623-626) with the floor:

```typescript
  if (candidates.length === 0) {
    // ROUTE-1 B4 — empty-skill floor: never return [] for a classified task.
    const floorId = pickSkillFloor(subThreshold, taskDNA.intent.primary, taskKind, pool);
    if (floorId) {
      reasoning.push(`Skill floor: '${floorId}' (no candidate ≥ ${cfg.skillMinScore})`);
      return { skillIds: [floorId], scores: new Map([[floorId, 0]]), confidence: 'low', reasoning };
    }
    reasoning.push('No skill met minimum score threshold');
    return { skillIds: [], scores: new Map(), confidence: 'uncertain', reasoning };
  }
```

- [ ] **Step 7: Pass `task.type` to `selectBestSkills` in `routeTaskV2`**

At the `selectBestSkills` call site (~line 366-370), add the trailing arg:

```typescript
    const skillResult = selectBestSkills(
      taskDNA, skillPool, cfg, learningData,
      resolved.excludeSkills ?? [], skillBudget,
      options?.projectStack ?? null, task.type,
    );
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run tests/core/routing-route1-precision.test.ts`
Expected: PASS — non-empty skills incl. code-simplifier; no api path-proxy skill on refactor; floor fires.

- [ ] **Step 9: Type-check + skill-routing regression**

Run: `npx tsc --noEmit && npx vitest run tests/core/skill-routing-diversity.test.ts tests/core/skill-auto-activation.test.ts tests/core/routing-multisignal.test.ts`
Expected: no type errors; suites green. **If any test now fails because it asserted `skillIds=[]` for a *classified* task, that assertion encoded the old empty-skill gap — update it to the floored skill with a one-line `// ROUTE-1 B4: floor guarantees ≥1 skill` justification, and note the change in the commit body. Do NOT weaken the floor to make a stale assertion pass.**

- [ ] **Step 10: Commit**

```bash
git add src/core/routing-engine.ts tests/core/routing-route1-precision.test.ts
git commit -m "$(cat <<'EOF'
feat(routing): ROUTE-1 B4 — intent→skill maps + gated path-proxy + floor

INTENT_TO_SKILL_ID gains refactor→code-simplifier + config→devops-engineer;
getIntentPriorityBonus gates the domain path-proxy for touch-up tasks;
selectBestSkills guarantees >=1 skill for classified tasks via a two-tier
floor (best sub-threshold, then kind/intent default). unknown-intent tasks
still honestly return [].

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: B2 — gate `applyUserSurfaceBonus` + capstone integration regression

**Files:**
- Modify: `src/orchestra/task-router.ts` (`applyUserSurfaceBonus` ~line 209; import `isSurfaceBuildTask`)
- Test: `tests/orchestra/router-surface-wire.test.ts` (extend); `tests/core/routing-route1-precision.test.ts` (capstone — extend)

**Interfaces:**
- Consumes: `isSurfaceBuildTask` (Task 2), `getUserSurfaceBonus`, `USER_SURFACE_AGENTS`, `classifyIntent` (existing); `task.type` from the full `Task`.
- Produces: no new exports — `applyUserSurfaceBonus` returns `null` for touch-up / non-build tasks.

- [ ] **Step 1: Write the failing tests**

Append to `tests/orchestra/router-surface-wire.test.ts` (match the file's existing `Task` construction helper; if it builds tasks inline, mirror that shape and set `type`):

```typescript
import { applyUserSurfaceBonus } from '../../src/orchestra/task-router.js';

describe('ROUTE-1 B2 — applyUserSurfaceBonus gate', () => {
  const base = {
    id: 't-1', sprintId: 'sprint-x', status: 'PENDING' as const,
    model: 'sonnet' as const, effort: 'normal' as const, priority: 'NORMAL' as const,
    reason: '', dependencies: [], assignedAgent: 'generic', assignedSkills: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    createdAt: '2026-06-18T00:00:00Z',
  };

  it('comment-sweep touching src/api/ → no surface override (null)', () => {
    const agent = applyUserSurfaceBonus({
      ...base, title: 'clean stale comments', description: 'remove stale comments from api',
      scope: { directories: ['src/api/'], filesRead: [], filesWrite: ['src/api/x.ts'] },
      type: 'code-development',
    } as any);
    expect(agent).toBeNull();
  });

  it('LOSSLESS: genuine api build → api-builder surface override', () => {
    const agent = applyUserSurfaceBonus({
      ...base, title: 'add POST /api/users endpoint', description: 'implement create-user endpoint',
      scope: { directories: ['src/api/'], filesRead: [], filesWrite: ['src/api/users.ts'] },
      type: 'code-development',
    } as any);
    expect(agent).toBe('api-builder');
  });
});
```

(Use the file's own `Task` factory if one exists instead of the inline `base` literal — keep it hermetic and type-correct.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/orchestra/router-surface-wire.test.ts -t "ROUTE-1 B2"`
Expected: FAIL — comment-sweep still returns `api-builder`.

- [ ] **Step 3: Import the predicate**

In `src/orchestra/task-router.ts`, extend the existing `routing-engine.js` import (currently `import { getUserSurfaceBonus, USER_SURFACE_AGENTS } from '../core/routing-engine.js';`) to:

```typescript
import { getUserSurfaceBonus, USER_SURFACE_AGENTS, isSurfaceBuildTask } from '../core/routing-engine.js';
```

- [ ] **Step 4: Gate `applyUserSurfaceBonus`**

In the `applyUserSurfaceBonus` body (~line 213-227), add the gate right after `classifyIntent`:

```typescript
  try {
    const taskDNA = classifyIntent({
      title: task.title,
      description: task.description,
      scope: task.scope,
    });
    // ROUTE-1 B2 — touch-up / non-build tasks must not be diverted to a surface owner.
    if (!isSurfaceBuildTask(taskDNA.intent.primary, task.type)) return null;
    for (const candidate of USER_SURFACE_AGENTS) {
      if (getUserSurfaceBonus(candidate, taskDNA) > 0) {
        return candidate;
      }
    }
  } catch {
    return null;
  }
  return null;
```

- [ ] **Step 5: Write the capstone integration regression**

Append to `tests/core/routing-route1-precision.test.ts` — a dual-perspective end-to-end check on the full `routeTaskV2` pipeline (agent + skills together):

```typescript
describe('ROUTE-1 — capstone: dual-perspective end-to-end', () => {
  it('DOGFOOD: deckent comment-sweep → refactorer + code-simplifier, never api-builder/[]', () => {
    const d = routeTaskV2(
      { title: 'stale-comment sweep', description: 'clean stale and dead comments across modules',
        scope: { directories: ['src/api/'], filesRead: [], filesWrite: ['src/api/x.ts'] },
        type: 'code-development' },
      pool, skillPool,
    );
    expect(d.agentId).not.toBe('api-builder');
    expect(['refactorer', 'code-reviewer']).toContain(d.agentId);
    expect(d.skillIds.length).toBeGreaterThan(0);
    expect(d.skillIds).toContain('code-simplifier');
  });

  it('PRODUCT: a user project doc-sweep under src/api/ is not hijacked to api-builder', () => {
    const d = routeTaskV2(
      { title: 'remove obsolete jsdoc comments', description: 'delete obsolete jsdoc from the api layer',
        scope: { directories: ['src/api/'], filesRead: [], filesWrite: ['src/api/handlers.ts'] },
        type: 'code-development' },
      pool, skillPool,
    );
    expect(d.agentId).not.toBe('api-builder');
  });

  it('LOSSLESS PRODUCT: a user building their API still gets api-builder', () => {
    const d = routeTaskV2(
      { title: 'build the orders endpoint', description: 'implement POST /api/orders with validation',
        scope: { directories: ['src/api/'], filesRead: [], filesWrite: ['src/api/orders.ts'] },
        type: 'code-development' },
      pool, skillPool,
    );
    expect(d.agentId).toBe('api-builder');
  });
});
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/orchestra/router-surface-wire.test.ts tests/core/routing-route1-precision.test.ts`
Expected: PASS — surface gate + full capstone green.

- [ ] **Step 7: Lossless full-suite guard + type-check**

Run: `npx tsc --noEmit && npx vitest run tests/core/ tests/orchestra/task-router.test.ts tests/orchestra/router-surface-wire.test.ts tests/orchestra/router-agent-fallback.test.ts`
Expected: no type errors; suites green. Triage any failure per the Task 4 Step 9 rule (stale `[]` / surface assertions that encoded the old bug get a justified update; behaviour regressions get fixed in code).

- [ ] **Step 8: Commit**

```bash
git add src/orchestra/task-router.ts tests/orchestra/router-surface-wire.test.ts tests/core/routing-route1-precision.test.ts
git commit -m "$(cat <<'EOF'
feat(routing): ROUTE-1 B2 — gate applyUserSurfaceBonus + capstone regression

Surface-owner override (task-router) suppressed for touch-up/non-build
tasks via isSurfaceBuildTask(task.type). Capstone dual-perspective
end-to-end: dogfood + product comment/doc sweeps route to refactorer +
code-simplifier (never api-builder/[]), while genuine API builds stay
api-builder. Closes the ROUTE-1 misroute class.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review (run after writing the plan)

**Spec coverage — every spec §3 mechanism maps to a task:**
- B1 classifier precision → Task 1 ✅
- B2 `isSurfaceBuildTask` + gated domain bonus → Task 2; wired in `selectBestAgent` → Task 3; in skills → Task 4; in `applyUserSurfaceBonus` → Task 5 ✅
- B3 `task.type` consume + tie-break → Task 3 ✅
- B4 map completion + skill floor → Task 4 ✅
- Spec §6 tests: regression (T3/T5), per-mechanism units (T1-T4), lossless guard (T3 S7, T4 S9, T5 S7), dual-perspective (T5 capstone) ✅

**Placeholder scan:** no `TBD`/`add error handling`/`similar to`/bare prose code steps — every code step shows complete code. ✅

**Type consistency:** `isSurfaceBuildTask(intent, taskKind?)` used identically in Tasks 2/3/4/5; `getDomainMatchBonus(…, allowPathProxy=true)` and `getIntentPriorityBonus(…, allowPathProxy=true)` defaults keep existing callers; `selectBestAgent(…, taskKind?)` and `selectBestSkills(…, taskKind?)` trailing-optional so intermediate callers compile; `routeTaskV2` param widened with `type?: TaskKind`; `pickSkillFloor` signature matches its single call site. ✅

**Note on `TaskKind` values:** the suppress-kind set uses `'documentation'` (the `TaskKind` name; `detectTaskType`'s `RubricTaskType` `document-write` is mapped to `documentation` by `rubricTypeToKind`), not the literal `'document-write'`. Verified against `src/core/work-model.ts:28`.
